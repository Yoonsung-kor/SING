// Song sections and lyric lines from LRCLIB's synced lyrics, read on demand for one song. Sections are computed
// from comparison keys; the lines are passed through for the song screen to show. Nothing here is written anywhere.
import { computeSections } from '../src/sections.js';
import { createQueue, STALE } from './throttle.mjs';
import { coreTitle, matchKey, titleMatches } from './title-match.mjs';

const ENDPOINT = 'https://lrclib.net/api/search';
const GET_ENDPOINT = 'https://lrclib.net/api/get';
const USER_AGENT = 'SING/0.1 (class project; https://github.com/Yoonsung-kor/SING)';
const TIMEOUT_MS = 10000;
const MAX_CHARS = 2 * 1024 * 1024;
const MAX_SECTIONS = 100;
const SAME_LENGTH_S = 2;

export const lineKey = matchKey;

const MAX_LINES = 300;
const MAX_LINE_CHARS = 200;

/** [mm:ss.xx] lines as { t, text }, sorted by time; a line with several stamps counts once per stamp. */
function parseTimedLines(text) {
  const lines = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const stamps = [...raw.matchAll(/\[(\d+):(\d{1,2}(?:\.\d+)?)\]/g)];
    if (!stamps.length) continue;
    const words = raw.replace(/\[[^\]]*\]/g, '').trim();
    for (const [, minutes, seconds] of stamps) lines.push({ t: Number(minutes) * 60 + Number(seconds), text: words });
  }
  return lines.sort((a, b) => a.t - b.t);
}

/** [mm:ss.xx] lines as { t, key }, sorted by time; a line with several stamps counts once per stamp. */
export const parseSyncedLyrics = text => parseTimedLines(text).map(line => ({ t: line.t, key: lineKey(line.text) }));

/**
 * Among synced hits for this title, records named exactly like the song come first ("(Inst)" or "(Original)" records
 * often split lines differently); then the one whose length most others share (a live or remix version stands alone).
 */
export function pickHit(hits, title) {
  const usable = (Array.isArray(hits) ? hits : []).filter(hit => typeof hit?.syncedLyrics === 'string' && hit.syncedLyrics.trim() && titleMatches(hit.trackName, title));
  const exact = usable.filter(hit => matchKey(hit.trackName) === matchKey(coreTitle(title)));
  const pool = exact.length ? exact : usable;
  let best = null;
  let bestCount = 0;
  for (const hit of pool) {
    const count = pool.filter(other => Math.abs((other.duration ?? 0) - (hit.duration ?? 0)) <= SAME_LENGTH_S).length;
    if (count > bestCount) { best = hit; bestCount = count; }
  }
  return best;
}

/**
 * Queries to try in order. LRCLIB matches whole words, so a Korean title saved without spaces (TJ writes
 * "너의모든순간") finds nothing; its first two, three, then one syllables usually are its first word.
 */
export function searchQueries(title, artist) {
  const core = coreTitle(title);
  const query = words => `${words} ${artist ?? ''}`.trim();
  const queries = [query(core)];
  const chars = [...core];
  if (!/\s/u.test(core) && /\p{Script=Hangul}/u.test(core)) for (const n of [2, 3, 1]) if (chars.length > n) queries.push(query(chars.slice(0, n).join('')));
  return queries;
}

const MAX_CANDIDATES = 10;
const MAX_NAME_CHARS = 120;

/** A synced record as the song screen needs it: sections (times and names) and lyric lines; null without timing. */
function fromHit(hit) {
  if (typeof hit?.syncedLyrics !== 'string' || !hit.syncedLyrics.trim()) return null;
  const timed = parseTimedLines(hit.syncedLyrics);
  const duration = Number.isFinite(hit.duration) && hit.duration > 0 ? hit.duration : (timed.at(-1)?.t ?? 0) + 5;
  const sections = computeSections(timed.map(line => ({ t: line.t, key: lineKey(line.text) })), duration).slice(0, MAX_SECTIONS);
  const lines = timed.slice(0, MAX_LINES).map(line => ({ t: line.t, text: line.text.slice(0, MAX_LINE_CHARS) }));
  return sections.length ? { duration, sections, lines } : null;
}

/**
 * Synced records for the person to choose from: number, title, artist and length only (no lyric text), each record
 * once (the same title, artist and length is listed by several uploads), at most ten.
 */
export function listCandidates(hits) {
  const seen = new Set();
  const list = [];
  for (const hit of Array.isArray(hits) ? hits : []) {
    if (!Number.isSafeInteger(hit?.id) || hit.id < 1 || typeof hit.syncedLyrics !== 'string' || !hit.syncedLyrics.trim()) continue;
    const title = String(hit.trackName ?? '').trim().slice(0, MAX_NAME_CHARS);
    const artist = String(hit.artistName ?? '').trim().slice(0, MAX_NAME_CHARS);
    const duration = Number.isFinite(hit.duration) && hit.duration > 0 ? Math.round(hit.duration) : 0;
    const key = `${matchKey(title)}|${matchKey(artist)}|${duration}`;
    if (!title || seen.has(key)) continue;
    seen.add(key);
    list.push({ id: hit.id, title, artist, duration });
    if (list.length === MAX_CANDIDATES) break;
  }
  return list;
}

/**
 * findSections({ title, artist, lyricsId? }): one song's sections and lines, or null when no synced timing matches.
 * With lyricsId (a record the person picked) that record is read by itself; otherwise the title is searched.
 * findSections.search(q): records to pick from. Both throw when LRCLIB cannot answer.
 */
export function createLrclibClient({ fetchImpl = fetch, queue = createQueue(), retryDelayMs = 1000 } = {}) {
  const wait = () => new Promise(resolve => setTimeout(resolve, retryDelayMs));
  // A missing record (404) is an answer when 'missing' is given; any other refusal is a failure.
  async function ask(url, missing = undefined) {
    const request = () => fetchImpl(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    let response = await request();
    // LRCLIB often answers 503 ServerOverloaded for a moment; one more try, a pause later, is all it gets.
    if (response.status >= 500) { await wait(); await wait(); response = await request(); }
    if (response.status === 404 && missing !== undefined) return missing;
    if (!response.ok) throw new Error(`LRCLIB ${response.status}`);
    const text = await response.text();
    if (text.length > MAX_CHARS) throw new Error('LRCLIB answer too large');
    return JSON.parse(text);
  }
  const searchUrl = q => `${ENDPOINT}?${new URLSearchParams({ q })}`;
  async function queued(task) {
    const result = await queue(task);
    if (result === STALE) throw new Error('LRCLIB request went stale');
    return result;
  }
  async function findSections({ title, artist, lyricsId = null }) {
    return queued(async () => {
      if (lyricsId !== null) return fromHit(await ask(`${GET_ENDPOINT}/${lyricsId}`, null));
      for (const [i, q] of searchQueries(title, artist).entries()) {
        if (i) await wait();
        const hit = pickHit(await ask(searchUrl(q)), title);
        if (hit) return fromHit(hit);
      }
      return null;
    });
  }
  findSections.search = q => queued(async () => listCandidates(await ask(searchUrl(q))));
  return findSections;
}
