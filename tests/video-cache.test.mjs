import assert from 'node:assert/strict';
import test from 'node:test';
import { createVideoCache } from '../scripts/video-cache.mjs';

const found = id => ({ candidates: [{ videoId: id }] });
const counting = (answer = () => found('AAAAAAAAAAA')) => {
  const calls = [];
  return { calls, find: async args => { calls.push(args); return answer(args); } };
};

test('the same song is searched once, even with different letter case and spaces', async () => {
  const { calls, find } = counting();
  const cached = createVideoCache({ find });
  const first = await cached({ side: 'mv', title: '너의 모든 순간', artist: '성시경', duration: 243.4 });
  const again = await cached({ side: 'mv', title: '  너의   모든 순간 ', artist: '성시경', duration: 243.2 });
  const upper = await cached({ side: 'mv', title: 'Love Poem', artist: 'IU' });
  const lower = await cached({ side: 'mv', title: 'love poem', artist: 'iu' });
  assert.equal(calls.length, 2);
  assert.deepEqual(again, first);
  assert.deepEqual(lower, upper);
});

test('each side is searched on its own', async () => {
  const { calls, find } = counting();
  const cached = createVideoCache({ find });
  await cached({ side: 'mv', title: 'a', artist: 'b' });
  await cached({ side: 'karaoke', title: 'a', artist: 'b' });
  assert.equal(calls.length, 2);
});

test('a failure is passed on and not kept', async () => {
  let fail = true;
  const { calls, find } = counting(() => { if (fail) throw new Error('quota'); return found('BBBBBBBBBBB'); });
  const cached = createVideoCache({ find });
  await assert.rejects(cached({ side: 'mv', title: 'a', artist: '' }), /quota/);
  fail = false;
  assert.deepEqual(await cached({ side: 'mv', title: 'a', artist: '' }), found('BBBBBBBBBBB'));
  assert.equal(calls.length, 2);
});

test('an empty answer is not kept', async () => {
  let empty = true;
  const { calls, find } = counting(() => (empty ? { candidates: [] } : found('CCCCCCCCCCC')));
  const cached = createVideoCache({ find });
  assert.deepEqual(await cached({ side: 'mv', title: 'a', artist: '' }), { candidates: [] });
  empty = false;
  assert.deepEqual(await cached({ side: 'mv', title: 'a', artist: '' }), found('CCCCCCCCCCC'));
  assert.equal(calls.length, 2);
});

test('two requests at once for the same song share one search', async () => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const { calls, find } = counting(async () => { await gate; return found('DDDDDDDDDDD'); });
  const cached = createVideoCache({ find });
  const both = Promise.all([cached({ side: 'mv', title: 'a', artist: '' }), cached({ side: 'mv', title: 'A', artist: '' })]);
  release();
  const [one, two] = await both;
  assert.equal(calls.length, 1);
  assert.deepEqual(one, two);
});

test('old answers expire and the oldest goes when the store is full', async () => {
  let at = 0;
  const { calls, find } = counting(args => found(args.title.padEnd(11, 'x')));
  const cached = createVideoCache({ find, now: () => at, ttlMs: 1000, max: 2 });
  await cached({ side: 'mv', title: 'a', artist: '' });
  at = 999;
  await cached({ side: 'mv', title: 'a', artist: '' });
  assert.equal(calls.length, 1);
  at = 1000;
  await cached({ side: 'mv', title: 'a', artist: '' });
  assert.equal(calls.length, 2, 'expired');
  await cached({ side: 'mv', title: 'b', artist: '' });
  await cached({ side: 'mv', title: 'c', artist: '' });
  assert.equal(calls.length, 4);
  await cached({ side: 'mv', title: 'c', artist: '' });
  await cached({ side: 'mv', title: 'b', artist: '' });
  assert.equal(calls.length, 4, 'the two newest are kept');
  await cached({ side: 'mv', title: 'a', artist: '' });
  assert.equal(calls.length, 5, 'the oldest was dropped');
});
