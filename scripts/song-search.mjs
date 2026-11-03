// Song search for the app: TJ first (karaoke catalog, Korean names, song numbers), one-vowel retries for typos
// like '앰씨더맥스', then MusicBrainz when TJ finds nothing or cannot be reached.
import { dedupeSongs, rankResults, dominantArtist, vowelVariants } from './tj.mjs';
import { createQueue, STALE } from './throttle.mjs';

const staleAnswer = () => ({ results: [], source: 'tj', retriedWith: null, artist: null, hasMore: false, stale: true });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

export function createSongSearch({ tj, musicbrainz, queue = createQueue(), sleep = pause, minIntervalMs = 1000 }) {
  // The whole TJ part of one search runs as one queued job, so its retries can never jump ahead of a newer search.
  const tjSearch = ({ q, scope, mode, page }) => queue(async ({ isStale }) => {
    let answer = await tj({ query: q, scope, mode, page });
    if (mode !== 'search' || answer.rows.length || page !== 1) return { answer, used: q };
    for (const variant of vowelVariants(q)) {
      if (isStale()) return STALE;
      await sleep(minIntervalMs);
      if (isStale()) return STALE;
      answer = await tj({ query: variant, scope, mode, page });
      if (answer.rows.length) return { answer, used: variant };
    }
    return { answer, used: q };
  });

  return async function searchSongs({ q, scope, mode, page }) {
    if (mode === 'artist') {
      const outcome = await tjSearch({ q, scope, mode: 'artist', page });
      if (outcome === STALE) return staleAnswer();
      return { results: dedupeSongs(outcome.answer.rows), source: 'tj', retriedWith: null, artist: null, hasMore: outcome.answer.hasMore };
    }
    let tjFailed = false;
    try {
      const outcome = await tjSearch({ q, scope, mode: 'search', page });
      if (outcome === STALE) return staleAnswer();
      const { answer, used } = outcome;
      if (answer.rows.length) {
        const results = rankResults(dedupeSongs(answer.rows), used);
        return { results, source: 'tj', retriedWith: used === q ? null : used, artist: page === 1 ? dominantArtist(results, used) : null, hasMore: answer.hasMore };
      }
    } catch { tjFailed = true; }
    // Nothing on TJ (or TJ is down): MusicBrainz has no karaoke numbers, so the screen says so.
    try {
      const rows = await musicbrainz(q);
      return { results: rows.map(row => ({ title: row.title, artist: row.artist, tjNumber: '' })), source: 'musicbrainz', retriedWith: null, artist: null, hasMore: false };
    } catch (error) {
      if (tjFailed) throw error;
      return { results: [], source: 'tj', retriedWith: null, artist: null, hasMore: false };
    }
  };
}
