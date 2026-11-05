import assert from 'node:assert/strict';
import test from 'node:test';
import { coreTitle, matchKey, titleMatches } from '../scripts/title-match.mjs';
import { lineKey, parseSyncedLyrics, pickHit, createLrclibClient } from '../scripts/lrclib.mjs';

// The spike song's line structure with placeholder words (never real lyrics). '' is an empty line.
const shape = [['a', 17.6], ['b', 30.9], ['c', 36.3], ['d', 44.9], ['e', 51.8], ['f', 59.4], ['g', 66.9], ['h', 73.7], ['i', 81.1], ['j', 86.5], ['k', 94.2], ['l', 101.0], ['m', 108.2], ['n', 128.2], ['o', 135.4], ['f', 144.8], ['p', 152.2], ['q', 159.1], ['i', 166.2], ['j', 172.1], ['r', 179.7], ['l', 186.4], ['m', 193.7], ['s', 210.8], ['', 219.2]];
const stamp = t => `[${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(2).padStart(5, '0')}]`;
const synced = shape.map(([key, t]) => `${stamp(t)}${key ? `word-${key}` : ''}`).join('\n');
const hit = (extra = {}) => ({ id: 1, trackName: '너의 모든 순간', artistName: '성시경', duration: 243, syncedLyrics: synced, ...extra });
const json = (status, body) => ({ ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) });

test('titles: brackets come off the song title but never off the candidate', () => {
  assert.equal(coreTitle('너의모든순간(별에서온그대OST)'), '너의모든순간');
  assert.equal(coreTitle('(Intro)'), '(Intro)');
  assert.equal(matchKey("Every Moment Of You(너의 모든 순간) 'OST'"), 'everymomentofyou너의모든순간ost');
  assert.equal(titleMatches('[MV] 성시경 _ Every Moment Of You(너의 모든 순간) (Original)', '너의모든순간(별에서온그대OST)'), true);
  assert.equal(titleMatches('다른 노래', '너의 모든 순간'), false);
  assert.equal(titleMatches('Ah', 'A'), false);
  assert.equal(titleMatches('a', 'A'), true);
});

test('synced lyrics become timed keys; tags and empty text are handled', () => {
  assert.deepEqual(parseSyncedLyrics('[ar:x]\n[00:10.00][00:40.50]word-a\n[00:20]word-b'), [{ t: 10, key: 'worda' }, { t: 20, key: 'wordb' }, { t: 40.5, key: 'worda' }]);
  assert.equal(lineKey(' Word, A! '), 'worda');
  assert.deepEqual(parseSyncedLyrics(''), []);
});

test('the hit is the most common length among synced matches', () => {
  const hits = [hit({ id: 9, syncedLyrics: '' }), hit({ id: 2, duration: 300 }), hit({ id: 3, duration: 243 }), hit({ id: 4, duration: 244 }), hit({ id: 5, trackName: '다른 노래', duration: 243 })];
  assert.equal(pickHit(hits, '너의 모든 순간').id, 3);
  assert.equal(pickHit([hit({ trackName: 'Every Moment of You (너의 모든 순간)' })], '너의모든순간(별에서온그대OST)').id, 1);
  assert.equal(pickHit([hit({ trackName: '다른 노래' })], '너의 모든 순간'), null);
});

test('the client asks with the core title, names itself, and returns only sections', async () => {
  let asked;
  const fetchImpl = async (url, options) => { asked = { url: new URL(url), options }; return json(200, [hit()]); };
  const find = createLrclibClient({ fetchImpl, queue: task => task({ isStale: () => false }) });
  const result = await find({ title: '너의모든순간(별에서온그대OST)', artist: '성시경' });
  assert.equal(asked.url.origin + asked.url.pathname, 'https://lrclib.net/api/search');
  assert.equal(asked.url.searchParams.get('q'), '너의모든순간 성시경');
  assert.equal(asked.options.headers['User-Agent'], 'SING/0.1 (class project; https://github.com/Yoonsung-kor/SING)');
  assert.deepEqual(Object.keys(result), ['duration', 'sections', 'lines']);
  assert.equal(result.lines.length, 25);
  assert.deepEqual(result.lines[0], { t: 17.6, text: 'word-a' });
  assert.deepEqual(result.lines.at(-1), { t: 219.2, text: '' });
  assert.equal(result.duration, 243);
  assert.equal(result.sections.length, 9);
  assert.deepEqual(result.sections[0], { t: 17.6, label: '노래 시작 · 1절', kind: 'start' });
  // Lyric text travels only in lines (shown, never stored); sections carry times and names only.
  assert.ok(!JSON.stringify(result.sections).includes('word-'));
});

test('the client returns null without timing and throws when the service fails', async () => {
  const run = task => task({ isStale: () => false });
  assert.equal(await createLrclibClient({ fetchImpl: async () => json(200, [hit({ syncedLyrics: null })]), queue: run })({ title: '너의 모든 순간', artist: '' }), null);
  assert.equal(await createLrclibClient({ fetchImpl: async () => json(200, []), queue: run })({ title: '너의 모든 순간', artist: '' }), null);
  await assert.rejects(createLrclibClient({ fetchImpl: async () => json(503, { name: 'ServerOverloaded' }), queue: run, retryDelayMs: 0 })({ title: 'x', artist: '' }));
  const { STALE } = await import('../scripts/throttle.mjs');
  await assert.rejects(createLrclibClient({ fetchImpl: async () => json(200, [hit()]), queue: async () => STALE })({ title: 'x', artist: '' }));
});

test('an exact title beats an instrumental or other suffixed record of the same length', () => {
  const hits = [hit({ id: 7, trackName: '너의 모든 순간(Inst)', duration: 243.46 }), hit({ id: 8, trackName: '너의 모든 순간 (Original)' }), hit({ id: 3 }), hit({ id: 4 })];
  assert.equal(pickHit(hits, '너의모든순간(별에서온그대OST)').id, 3);
  assert.equal(pickHit([hit({ id: 7, trackName: '너의 모든 순간(Inst)' })], '너의 모든 순간').id, 7);
});

test('an overloaded answer (5xx) is asked once more before giving up', async () => {
  const run = task => task({ isStale: () => false });
  let calls = 0;
  const flaky = async () => (++calls === 1 ? json(503, { name: 'ServerOverloaded' }) : json(200, [hit()]));
  const result = await createLrclibClient({ fetchImpl: flaky, queue: run, retryDelayMs: 0 })({ title: '너의 모든 순간', artist: '성시경' });
  assert.equal(calls, 2);
  assert.equal(result.sections.length, 9);
  calls = 0;
  await assert.rejects(createLrclibClient({ fetchImpl: async () => { calls++; return json(503, {}); }, queue: run, retryDelayMs: 0 })({ title: '너의 모든 순간', artist: '' }));
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(createLrclibClient({ fetchImpl: async () => { calls++; return json(404, {}); }, queue: run, retryDelayMs: 0 })({ title: '너의 모든 순간', artist: '' }));
  assert.equal(calls, 1);
});

test('a title without spaces is retried with its first syllables, two, then three, then one', async () => {
  const asked = [];
  const fetchImpl = async url => { const q = new URL(url).searchParams.get('q'); asked.push(q); return json(200, q === '너의 성시경' ? [hit()] : []); };
  const run = task => task({ isStale: () => false });
  const result = await createLrclibClient({ fetchImpl, queue: run, retryDelayMs: 0 })({ title: '너의모든순간(별에서온그대OST)', artist: '성시경' });
  assert.deepEqual(asked, ['너의모든순간 성시경', '너의 성시경']);
  assert.equal(result.sections.length, 9);
  asked.length = 0;
  assert.equal(await createLrclibClient({ fetchImpl: async url => { asked.push(new URL(url).searchParams.get('q')); return json(200, []); }, queue: run, retryDelayMs: 0 })({ title: '나같은놈', artist: '가수' }), null);
  assert.deepEqual(asked, ['나같은놈 가수', '나같 가수', '나같은 가수', '나 가수']);
  asked.length = 0;
  await createLrclibClient({ fetchImpl: async url => { asked.push(new URL(url).searchParams.get('q')); return json(200, []); }, queue: run })({ title: '너의 모든 순간', artist: '성시경' });
  assert.deepEqual(asked, ['너의 모든 순간 성시경']);
});

test('a title that is one syllable without its brackets is matched with the brackets kept', () => {
  assert.equal(titleMatches('JISOO - ‘꽃(FLOWER)’ M/V', '꽃(FLOWER)'), true);
  assert.equal(titleMatches('꽃(FLOWER) - 지수 (KY.12345) / KY Karaoke', '꽃(FLOWER)'), true);
  assert.equal(titleMatches('[MV] Zion.T _ Snow(눈) (Feat. 이문세)', '눈(Feat.이문세)'), true);
  assert.equal(pickHit([hit({ trackName: '꽃 (FLOWER)' })], '꽃(FLOWER)').id, 1);
  assert.equal(titleMatches('꽃길', '꽃'), false);
  assert.equal(titleMatches('꽃', '꽃'), true);
});
