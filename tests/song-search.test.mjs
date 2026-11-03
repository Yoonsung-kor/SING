import assert from 'node:assert/strict';
import test from 'node:test';
import { createSongSearch } from '../scripts/song-search.mjs';
import { STALE } from '../scripts/throttle.mjs';

const row = (title, artist, tjNumber) => ({ title, artist, tjNumber });
function fakeTj(answer) {
  const calls = [];
  const tj = async args => { calls.push(args); const value = answer(args); if (value instanceof Error) throw value; return value; };
  return { tj, calls };
}
const noMb = async () => { throw new Error('MusicBrainz should not be called'); };
const ask = (search, extra = {}) => search({ q: '바라보기', scope: 'kor', mode: 'search', page: 1, ...extra });

test('TJ results are merged, ranked, and name the artist that dominates', async () => {
  const { tj, calls } = fakeTj(() => ({ rows: [row('곡1', 'MC THE MAX', '1'), row('곡2', 'MC THE MAX', '2'), row('곡2', 'MC THE MAX', '22'), row('곡3', 'MC THE MAX', '3')], hasMore: false }));
  const result = await ask(createSongSearch({ tj, musicbrainz: noMb }), { q: '엠씨더맥스' });
  assert.deepEqual({ ...result, results: result.results.map(r => r.tjNumber) }, { results: ['1', '2', '3'], source: 'tj', retriedWith: null, artist: 'MC THE MAX', hasMore: false });
  assert.deepEqual(calls[0], { query: '엠씨더맥스', scope: 'kor', mode: 'search', page: 1 });
});

test('zero results retry with a swapped vowel and say which term worked', async () => {
  const { tj, calls } = fakeTj(({ query }) => ({ rows: query === '엠씨더맥스' ? [row('어디에도', 'MC THE MAX', '46009')] : [], hasMore: false }));
  const result = await ask(createSongSearch({ tj, musicbrainz: noMb }), { q: '앰씨더맥스' });
  assert.deepEqual([result.source, result.retriedWith, result.results[0].tjNumber, calls.length], ['tj', '엠씨더맥스', '46009', 2]);
});

test('MusicBrainz takes over when TJ finds nothing or fails, without karaoke numbers', async () => {
  const mb = async q => [{ title: q, artist: '가수' }];
  const empty = fakeTj(() => ({ rows: [], hasMore: false }));
  const fromEmpty = await ask(createSongSearch({ tj: empty.tj, musicbrainz: mb }));
  assert.deepEqual([fromEmpty.source, fromEmpty.results], ['musicbrainz', [{ title: '바라보기', artist: '가수', tjNumber: '' }]]);
  const broken = fakeTj(() => new Error('TJ 503'));
  assert.equal((await ask(createSongSearch({ tj: broken.tj, musicbrainz: mb }))).source, 'musicbrainz');
});

test('artist lists use TJ only, keep TJ order, and fail when TJ fails', async () => {
  const { tj } = fakeTj(() => ({ rows: [row('b', 'MC THE MAX', '2'), row('a', 'MC THE MAX', '1')], hasMore: true }));
  const result = await ask(createSongSearch({ tj, musicbrainz: noMb }), { q: '엠씨더맥스', mode: 'artist' });
  assert.deepEqual([result.results.map(r => r.tjNumber), result.hasMore, result.artist], [['2', '1'], true, null]);
  const broken = fakeTj(() => new Error('TJ down'));
  await assert.rejects(ask(createSongSearch({ tj: broken.tj, musicbrainz: noMb }), { mode: 'artist' }));
});

test('both sources failing rejects, and a request the user typed past comes back marked stale', async () => {
  const broken = fakeTj(() => new Error('TJ down'));
  await assert.rejects(ask(createSongSearch({ tj: broken.tj, musicbrainz: async () => { throw new Error('MB down'); } })));
  const stale = fakeTj(() => STALE);
  assert.deepEqual(await ask(createSongSearch({ tj: stale.tj, musicbrainz: noMb })), { results: [], source: 'tj', retriedWith: null, artist: null, hasMore: false, stale: true });
});
