// TJ Media karaoke search, read on demand only: one page per user search, nothing collected or stored.
// TJ has no public API (checked 2026-11-03); its search page returns plain HTML, read here with regular expressions.
import { normalizeKey } from '../src/recommend.js';

const ENDPOINT = 'https://www.tjmedia.com/song/accompaniment_search';
const USER_AGENT = 'SING/0.1 (class project; https://github.com/Yoonsung-kor/SING)';
const PAGE_ROWS = 100;
const TIMEOUT_MS = 8000;
const MAX_CHARS = 2 * 1024 * 1024;

const ENTITIES = { lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' };
export function unescapeHtml(text) {
  return text
    .replace(/&#x([\da-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&(lt|gt|quot|nbsp);/g, (_, name) => ENTITIES[name])
    .replace(/&amp;/g, '&');
}
const textOf = html => unescapeHtml(html.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

/** Rows of { title, artist, tjNumber }; rows that do not fit the expected shape are skipped. */
export function parseTjResults(html) {
  const rows = [];
  for (const block of String(html ?? '').split(/<ul class="grid-container/).slice(1)) {
    const match = /<span class="num2">([^<]*)<\/span>[\s\S]*?<li class="grid-item title3">([\s\S]*?)<li class="grid-item title4 singer">([\s\S]*?)<\/li>/.exec(block);
    if (!match) continue;
    const [, number, titleCell, artistCell] = match;
    const tjNumber = number.trim();
    const spans = [...titleCell.matchAll(/<span[^>]*>([\s\S]*?)<\/span>/g)].map(m => textOf(m[1])).filter(Boolean);
    const title = spans.at(-1) ?? '';
    const artist = textOf(artistCell);
    if (!/^\d{1,6}$/.test(tjNumber) || !title || title.length > 120 || artist.length > 120) continue;
    rows.push({ title, artist, tjNumber });
  }
  return rows;
}

const songKey = row => `${normalizeKey(row.title)}|${normalizeKey(row.artist)}`;

/** The same song under several numbers (re-recordings, machine-only tracks) keeps its first number. */
export function dedupeSongs(rows) {
  const seen = new Set();
  return rows.filter(row => { const key = songKey(row); if (seen.has(key)) return false; seen.add(key); return true; });
}

/** Exact title, title prefix, artist name, contained title, then the rest; TJ's order holds within a tier. */
export function rankResults(rows, query) {
  const q = normalizeKey(query);
  const tier = row => {
    const title = normalizeKey(row.title);
    if (title === q) return 0;
    if (q && title.startsWith(q)) return 1;
    if (q && normalizeKey(row.artist) === q) return 2;
    if (q && title.includes(q)) return 3;
    return 4;
  };
  return rows.map((row, index) => ({ row, index, tier: tier(row) })).sort((a, b) => a.tier - b.tier || a.index - b.index).map(x => x.row);
}

/** The artist whose whole list is worth offering: at least half of the rows, three or more, and the query is no title. */
export function dominantArtist(rows, query) {
  const q = normalizeKey(query);
  if (rows.some(row => normalizeKey(row.title) === q)) return null;
  const counts = new Map();
  for (const row of rows) if (row.artist) counts.set(row.artist, (counts.get(row.artist) ?? 0) + 1);
  for (const [artist, count] of counts) if (count >= 3 && count * 2 >= rows.length) return artist;
  return null;
}

// ㅐ↔ㅔ and ㅒ↔ㅖ are the vowels people mix up most ('앰씨더맥스' for '엠씨더맥스').
const VOWEL_SWAP = { 1: 5, 5: 1, 3: 7, 7: 3 };
/** Search terms with one confusable vowel swapped, front to back, at most two. */
export function vowelVariants(text) {
  const chars = [...String(text ?? '')];
  const variants = [];
  for (let i = 0; i < chars.length && variants.length < 2; i++) {
    const code = chars[i].codePointAt(0) - 0xac00;
    if (code < 0 || code > 11171) continue;
    const vowel = Math.floor(code % 588 / 28);
    if (!(vowel in VOWEL_SWAP)) continue;
    const swapped = String.fromCodePoint(0xac00 + Math.floor(code / 588) * 588 + VOWEL_SWAP[vowel] * 28 + code % 28);
    variants.push([...chars.slice(0, i), swapped, ...chars.slice(i + 1)].join(''));
  }
  return variants;
}

export function tjSearchUrl({ query, scope = 'kor', mode = 'search', page = 1 }) {
  const params = new URLSearchParams({
    pageNo: String(page), pageRowCnt: String(PAGE_ROWS), strSotrGubun: 'ASC', strSortType: '',
    nationType: scope === 'all' ? '' : 'KOR', strType: mode === 'artist' ? '2' : '0',
    // TJ's own page removes spaces before searching.
    searchTxt: String(query ?? '').replace(/\s+/g, ''),
  });
  return `${ENDPOINT}?${params}`;
}

/** One TJ search page; throws when TJ cannot be reached or answers with an error. Spacing is the caller's queue. */
export function createTjClient({ fetchImpl = fetch } = {}) {
  return async function search({ query, scope, mode, page }) {
    const response = await fetchImpl(tjSearchUrl({ query, scope, mode, page }), { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`TJ ${response.status}`);
    const html = await response.text();
    if (html.length > MAX_CHARS) throw new Error('TJ page too large');
    const rows = parseTjResults(html);
    return { rows, hasMore: rows.length >= PAGE_ROWS };
  };
}
