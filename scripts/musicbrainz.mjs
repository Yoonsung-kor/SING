// Song search through MusicBrainz (open music database). The server asks on the browser's behalf,
// at most once a second as MusicBrainz requires, and drops queries the user has already typed past.
import { normalizeKey } from '../src/recommend.js';
import { createQueue, STALE } from './throttle.mjs';

const USER_AGENT = 'SING/0.1 (class project; https://github.com/Yoonsung-kor/SING)';
const ENDPOINT = 'https://musicbrainz.org/ws/2/recording?fmt=json&limit=15&query=';
const MAX_RESULTS = 8;
// Karaoke tracks, instrumentals and skits are not songs anyone sings; a bare "Mr" is left alone ("Mr. Chu").
const NOT_A_SONG = /\((?:inst\.?|instrumental|mr|m\.r\.?)\)|\binst\.|\binstrumental\b|\bmr\s*ver|skit/i;

export function toSearchResults(json) {
  const seen = new Set();
  const results = [];
  for (const recording of Array.isArray(json?.recordings) ? json.recordings : []) {
    const title = String(recording?.title ?? '').trim();
    if (!title || title.length > 120 || NOT_A_SONG.test(title)) continue;
    const credits = Array.isArray(recording['artist-credit']) ? recording['artist-credit'] : [];
    const artist = credits.map(c => `${c?.name ?? ''}${c?.joinphrase ?? ''}`).join('').trim().slice(0, 120);
    const key = `${normalizeKey(title)}|${normalizeKey(artist)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    results.push({ title, artist });
    if (results.length >= MAX_RESULTS) break;
  }
  return results;
}

export function createSearcher({ fetchImpl = fetch, now = Date.now, sleep, minIntervalMs = 1000 } = {}) {
  const run = createQueue({ now, sleep, minIntervalMs });
  async function send(q) {
    const response = await fetchImpl(ENDPOINT + encodeURIComponent(q), { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`MusicBrainz ${response.status}`);
    return toSearchResults(await response.json());
  }
  // A query the user typed past while it waited its turn comes back empty.
  return async q => { const results = await run(() => send(q)); return results === STALE ? [] : results; };
}
