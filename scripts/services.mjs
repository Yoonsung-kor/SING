// Server-side services behind the API: the AI finds, this code checks. Each piece can be swapped in tests.
import { fetchRecommendations, fetchSongRange } from './ai.mjs';
import { verifyHighest, fetchPageText } from './verify-source.mjs';
import { toCandidates } from '../src/recommend.js';
import { pickRecommendations } from '../src/vocal-range.js';
import { noteName } from '../src/pitch.js';

const RECOMMEND_AI_TIMEOUT_MS = 45000;
const CHECK_CONCURRENCY = 4;
const MAX_FOLLOW_UPS = 4;

/** Runs fn over items with at most `limit` in flight, keeping the input order in the result. */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); }
  }));
  return results;
}

export function createServices({ apiKey, model, fetchImpl = fetch, getPage = fetchPageText, now = Date.now, budgetMs = 60000, search = null } = {}) {
  const aiOn = Boolean(apiKey && model);

  /** Resolves to the promise's value, or null once the deadline passes (or on failure). */
  function beforeDeadline(promise, deadline) {
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(null), Math.max(0, deadline - now()));
      promise.then(value => { clearTimeout(timer); resolve(value ?? null); }, () => { clearTimeout(timer); resolve(null); });
    });
  }

  /** One song's highest notes, only when the cited page backs them up. */
  async function lookupRange({ title, artist }, { timeoutMs } = {}) {
    const raw = await fetchSongRange({ title, artist }, { apiKey, model, fetchImpl, ...(timeoutMs ? { timeoutMs } : {}) });
    if (!raw?.found) return null;
    return verifyHighest(raw, { getPage });
  }

  /** Candidates from one AI call, checked against their pages, topped up by at most 4 lookups, then picked by my range. */
  async function recommend(body) {
    const deadline = now() + budgetMs;
    const voiceForAi = body.voice ? { comfortableHigh: noteName(body.voice.comfortableHighMidi).scientific, voiceType: body.voice.voiceType } : null;
    const raw = await fetchRecommendations({ ...body, voice: voiceForAi }, { apiKey, model, fetchImpl, timeoutMs: Math.min(RECOMMEND_AI_TIMEOUT_MS, budgetMs) });
    const { intent, candidates } = toCandidates(raw, [...body.exclude, ...body.rejected]);
    const checked = await mapLimit(candidates, CHECK_CONCURRENCY, c => c.claim ? beforeDeadline(verifyHighest({ ...c.claim, vocal: c.vocal }, { getPage }), deadline) : null);
    if (body.voice && intent !== 'any') {
      const missing = candidates.map((_, i) => i).filter(i => !checked[i]).slice(0, MAX_FOLLOW_UPS);
      const found = await mapLimit(missing, CHECK_CONCURRENCY, i => beforeDeadline(
        lookupRange({ title: candidates[i].title, artist: candidates[i].artist }, { timeoutMs: Math.max(1000, deadline - now()) }), deadline));
      missing.forEach((i, k) => { if (found[k]) checked[i] = found[k]; });
    }
    const items = candidates.map((c, i) => {
      const range = checked[i];
      return {
        title: c.title, artist: c.artist, reason: c.reason, songUrl: c.songUrl,
        range: range ? { highestMidi: range.highestMidi, falsettoHighestMidi: range.falsettoHighestMidi, lowestMidi: range.lowestMidi, sourceUrl: range.sourceUrl, sourceQuote: range.sourceQuote } : null,
        vocal: range?.vocal ?? c.vocal ?? null,
      };
    });
    return { ...pickRecommendations(items, { voice: body.voice, intent }), intent };
  }

  return { lookupRange: aiOn ? lookupRange : null, recommend: aiOn ? recommend : null, searchSongs: search };
}
