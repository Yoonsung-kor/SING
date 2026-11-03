// Song search for the app: TJ first (karaoke catalog, Korean names, song numbers), one-vowel retries for typos
// like '앰씨더맥스', then MusicBrainz when TJ finds nothing or cannot be reached.
import { dedupeSongs, rankResults, dominantArtist, vowelVariants } from './tj.mjs';
import { STALE } from './throttle.mjs';

const staleAnswer = () => ({ results: [], source: 'tj', retriedWith: null, artist: null, hasMore: false, stale: true });

export function createSongSearch({ tj, musicbrainz }) {
  return async function searchSongs({ q, scope, mode, page }) {
    if (mode === 'artist') {
      const answer = await tj({ query: q, scope, mode: 'artist', page });
      if (answer === STALE) return staleAnswer();
      return { results: dedupeSongs(answer.rows), source: 'tj', retriedWith: null, artist: null, hasMore: answer.hasMore };
    }
    let tjFailed = false;
    try {
      let used = q;
      let answer = await tj({ query: q, scope, mode: 'search', page });
      if (answer === STALE) return staleAnswer();
      if (!answer.rows.length && page === 1) {
        for (const variant of vowelVariants(q)) {
          answer = await tj({ query: variant, scope, mode: 'search', page });
          if (answer === STALE) return staleAnswer();
          if (answer.rows.length) { used = variant; break; }
        }
      }
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
