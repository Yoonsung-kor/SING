// Server-only check of an AI claim: the cited quote must really be on the page, and the notes the AI
// converted must be the notes the quote states. Unchecked values never reach the app.
import dns from 'node:dns';
import https from 'node:https';
import net from 'node:net';
import { notesInText } from '../src/notes.js';
import { parseNoteName } from '../src/recommend.js';

const USER_AGENT = 'SING-source-check/0.1 (class project; verifies cited quotes)';
const TIMEOUT_MS = 10000;
const MAX_BYTES = 3 * 1024 * 1024;
const BOUNDS = { min: 55, max: 88 };
// Pop chest voice tops out around A5. A higher "chest" note means the source counted octaves differently
// (a real lookup returned "4옥 도" = C6 for 밤편지), and both the quote and our reader would agree on it.
const CHEST_MAX = 81;
const VOCALS = ['male', 'female', 'mixed'];

function ipv4Public(address) {
  const [a, b] = address.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0) return false;
  if (a === 198 && (b === 18 || b === 19)) return false;
  return true;
}

/** True only for addresses on the public internet; this server runs on the user's own PC. */
export function isPublicAddress(address) {
  const kind = net.isIP(address);
  if (kind === 4) return ipv4Public(address);
  if (kind !== 6) return false;
  const lower = address.toLowerCase();
  const mapped = /^::ffff:(.+)$/.exec(lower);
  if (mapped) {
    if (net.isIP(mapped[1]) === 4) return ipv4Public(mapped[1]);
    const [high, low] = mapped[1].split(':').map(part => parseInt(part, 16));
    return Number.isInteger(high) && Number.isInteger(low) && ipv4Public(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
  }
  if (lower === '::' || lower === '::1') return false;
  return !/^(f[cd]|fe[89ab]|ff)/.test(lower);
}

/** A dns.lookup replacement for node:https that refuses hosts resolving to private addresses. */
export function makeCheckedLookup(dnsLookup = dns.lookup) {
  return (hostname, options, callback) => {
    const opts = typeof options === 'object' && options ? options : {};
    dnsLookup(hostname, { ...opts, all: true }, (error, addresses) => {
      if (error) return callback(error);
      const list = Array.isArray(addresses) ? addresses : [{ address: addresses, family: net.isIP(addresses) }];
      if (!list.length || list.some(entry => !isPublicAddress(entry.address))) {
        return callback(Object.assign(new Error(`refused private address for ${hostname}`), { code: 'EPRIVATE' }));
      }
      if (opts.all) return callback(null, list);
      return callback(null, list[0].address, list[0].family);
    });
  };
}

function decode(buffer, contentType) {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1];
  try { return new TextDecoder(charset || 'utf-8').decode(buffer); }
  catch { return new TextDecoder('utf-8').decode(buffer); }
}

/** One https GET with the checked lookup, a 10 s limit, a 3 MB body cap and an honest User-Agent. */
export function httpsRequestOnce(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { lookup: makeCheckedLookup(), headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1' } }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_BYTES) { request.destroy(new Error('page too large')); return; }
        chunks.push(chunk);
      });
      response.on('end', () => {
        const contentType = String(response.headers['content-type'] ?? '');
        resolve({ status: response.statusCode, location: response.headers.location, contentType, body: decode(Buffer.concat(chunks), contentType) });
      });
      response.on('error', reject);
    });
    request.setTimeout(TIMEOUT_MS, () => request.destroy(new Error('page timeout')));
    request.on('error', reject);
  });
}

const isHttps = value => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };
const isTextType = type => /^text\//i.test(type) || /html|xml|json/i.test(type);

/** Page text after at most three https redirects, or null. */
export async function fetchPageText(url, { requestOnce = httpsRequestOnce, maxRedirects = 3 } = {}) {
  let current = url;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (!isHttps(current)) return null;
    let response;
    try { response = await requestOnce(current); }
    catch { return null; }
    if ([301, 302, 303, 307, 308].includes(response?.status) && response.location) {
      try { current = new URL(response.location, current).href; }
      catch { return null; }
      continue;
    }
    if (response?.status !== 200 || !isTextType(String(response.contentType ?? ''))) return null;
    return typeof response.body === 'string' ? response.body : null;
  }
  return null;
}

const squash = text => String(text ?? '')
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&(?:#\d+|#x[\da-f]+|[a-z]+);/gi, ' ')
  .normalize('NFKC').toLowerCase()
  .replace(/[\s\p{P}\p{S}]/gu, '');

/** Whether the quote appears on the page once markup, spacing and punctuation are ignored. */
export function quoteOnPage(pageText, quote) {
  const needle = squash(quote);
  return needle.length >= 6 && squash(pageText).includes(needle);
}

const inBounds = midi => Number.isInteger(midi) && midi >= BOUNDS.min && midi <= BOUNDS.max;

/** The claim as MIDI values when the page and the quote back it up, otherwise null. */
export async function verifyHighest(claim, { getPage = fetchPageText } = {}) {
  if (!claim || typeof claim !== 'object') return null;
  const sourceUrl = typeof claim.sourceUrl === 'string' ? claim.sourceUrl.trim() : '';
  const sourceQuote = typeof claim.sourceQuote === 'string' ? claim.sourceQuote.trim() : '';
  if (!isHttps(sourceUrl) || sourceUrl.length > 2048 || !sourceQuote || sourceQuote.length > 120) return null;
  const chest = parseNoteName(claim.chestHighest);
  const falsetto = claim.falsettoHighest == null ? null : parseNoteName(claim.falsettoHighest);
  if (!inBounds(chest) || chest > CHEST_MAX || (claim.falsettoHighest != null && (!inBounds(falsetto) || falsetto <= chest))) return null;
  const notes = notesInText(sourceQuote);
  if (!notes.includes(chest)) return null;
  if (falsetto !== null && (!notes.includes(falsetto) || falsetto !== Math.max(...notes))) return null;
  const others = notes.filter(note => note !== falsetto);
  if (chest !== Math.max(...others)) return null;
  const lowest = claim.lowest == null ? null : parseNoteName(claim.lowest);
  const lowestMidi = lowest !== null && notes.includes(lowest) && lowest < chest ? lowest : null;
  let page;
  try { page = await getPage(sourceUrl); }
  catch { return null; }
  if (typeof page !== 'string' || !quoteOnPage(page, sourceQuote)) return null;
  return { highestMidi: chest, falsettoHighestMidi: falsetto, lowestMidi, sourceUrl, sourceQuote, vocal: VOCALS.includes(claim.vocal) ? claim.vocal : null };
}
