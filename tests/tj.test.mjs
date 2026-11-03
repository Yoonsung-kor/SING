import assert from 'node:assert/strict';
import test from 'node:test';
import { parseTjResults, dedupeSongs, rankResults, dominantArtist, vowelVariants, tjSearchUrl, createTjClient } from '../scripts/tj.mjs';
import { createQueue, STALE } from '../scripts/throttle.mjs';

// Mirrors TJ's markup (2026-11-03), including the nested icon list inside the title cell.
const row = (no, title, artist) => `<li><ul class="grid-container list ico"><li class="grid-item center pos-type"><p class="count"><span class="mo-title">곡번호</span><span class="num2">${no}</span></p></li><li class="grid-item title3"><div class="flex-box ico-flex"><ul><li><p class="no-ico"></p></li></ul><p class=""><span>${title}</span></p></div></li><li class="grid-item title4 singer"><p><span>${artist}</span></p></li><li class="grid-item title5"><p><span class="">작사</span></p></li></ul></li>`;
const r = (title, artist, tjNumber) => ({ title, artist, tjNumber });

test('reads number, title and artist, unescapes entities, and skips broken rows', () => {
  const html = row('46009', '어디에도', 'MC THE MAX') + row('12345', 'Tom &amp; Jerry &lt;Live&gt;', 'A&#39;s') + row('abc', '깨진 줄', 'x') + row('99', '', 'x');
  assert.deepEqual(parseTjResults(html), [r('어디에도', 'MC THE MAX', '46009'), r('Tom & Jerry <Live>', "A's", '12345')]);
  assert.deepEqual(parseTjResults('<html>바뀐 구조</html>'), []);
});

test('merges the same song and ranks exact, prefix, artist, then contained titles', () => {
  const rows = [r('꽃바라기', '장성아', '96512'), r('바라보기(미녀의탄생OST)', 'MC THE MAX', '39408'), r('바라보기(미녀의탄생OST)', 'MC THE MAX', '62251'), r('바라보기만', '가수', '1'), r('내버려둬', '바바라', '2')];
  assert.deepEqual(rankResults(dedupeSongs(rows), '바라보기').map(x => x.tjNumber), ['39408', '1', '96512', '2']);
  const artistFirst = [r('다른 곡', '가수', '5'), r('곡 속 아이유', '누군가', '6'), r('좋은 날', '아이유', '7')];
  assert.deepEqual(rankResults(artistFirst, '아이유').map(x => x.tjNumber), ['7', '6', '5']);
});

test('offers an artist list only when one artist dominates and no title equals the query', () => {
  const mc = n => r(`곡${n}`, 'MC THE MAX', String(n));
  assert.equal(dominantArtist([mc(1), mc(2), mc(3), r('x', '다른', '9')], '엠씨더맥스'), 'MC THE MAX');
  assert.equal(dominantArtist([mc(1), mc(2), mc(3), r('엠씨더맥스', 'MC THE MAX', '7')], '엠씨더맥스'), null);
  assert.equal(dominantArtist([mc(1), mc(2), r('a', 'b', '8'), r('c', 'd', '9')], '엠씨더맥스'), null);
});

test('vowel variants swap one syllable at a time, from the front, at most two', () => {
  assert.deepEqual(vowelVariants('앰씨더맥스'), ['엠씨더맥스', '앰씨더멕스']);
  assert.deepEqual(vowelVariants('얘기 예쁜 애'), ['예기 예쁜 애', '얘기 얘쁜 애']);
  assert.deepEqual(vowelVariants('바라보기'), []);
});

test('the TJ url carries the scope, mode, page and the query without spaces', () => {
  const url = new URL(tjSearchUrl({ query: '너의 모든 순간', scope: 'kor', mode: 'search', page: 2 }));
  assert.equal(url.origin + url.pathname, 'https://www.tjmedia.com/song/accompaniment_search');
  assert.deepEqual(['pageNo', 'pageRowCnt', 'nationType', 'strType', 'searchTxt'].map(k => url.searchParams.get(k)), ['2', '100', 'KOR', '0', '너의모든순간']);
  const artist = new URL(tjSearchUrl({ query: 'x', scope: 'all', mode: 'artist', page: 1 }));
  assert.deepEqual([artist.searchParams.get('nationType'), artist.searchParams.get('strType')], ['', '2']);
});

test('the queue runs a task on an idle queue and drops queued tasks the user typed past', async () => {
  let clock = 0, release;
  const ran = [];
  const run = createQueue({ now: () => clock, sleep: async ms => { clock += ms; } });
  const first = run(async () => { ran.push('a'); await new Promise(res => { release = res; }); return 'a'; });
  await new Promise(res => setImmediate(res));
  const second = run(async () => { ran.push('b'); return 'b'; });
  const third = run(async () => { ran.push('c'); return 'c'; });
  clock = 1500;
  release();
  assert.deepEqual(await Promise.all([first, second, third]), ['a', STALE, 'c']);
  assert.deepEqual(ran, ['a', 'c']);
});

test('the TJ client identifies itself, throws on non-200 and reports hasMore for a full page', async () => {
  const bad = createTjClient({ fetchImpl: async () => ({ ok: false, status: 503, text: async () => '' }) });
  await assert.rejects(bad({ query: 'x', scope: 'kor', mode: 'search', page: 1 }));
  const full = Array.from({ length: 100 }, (_, i) => row(String(1000 + i), `곡${i}`, '가수')).join('');
  let seen;
  const ok = createTjClient({ fetchImpl: async (url, init) => { seen = { url, ua: init.headers['User-Agent'] }; return { ok: true, status: 200, text: async () => full }; } });
  const result = await ok({ query: '가수', scope: 'kor', mode: 'artist', page: 1 });
  assert.deepEqual([result.rows.length, result.hasMore], [100, true]);
  assert.match(seen.url, /strType=2/);
  assert.equal(seen.ua, 'SING/0.1 (class project; https://github.com/Yoonsung-kor/SING)');
});

test('final #2: a row with a changed title cell is skipped instead of borrowing the next row\'s song', () => {
  const broken = row('11111', '깨진 곡', '가수').replace('grid-item title3', 'grid-item title3 new');
  assert.deepEqual(parseTjResults(broken + row('46009', '어디에도', 'MC THE MAX')), [r('어디에도', 'MC THE MAX', '46009')]);
});

test('final #1: a running task can tell that a newer one arrived', async () => {
  let release;
  const run = createQueue({ now: () => 0, sleep: async () => {} });
  const seen = [];
  const first = run(async ({ isStale }) => { await new Promise(res => { release = res; }); seen.push(isStale()); return 'a'; });
  await new Promise(res => setImmediate(res));
  const second = run(async () => 'b');
  release();
  assert.deepEqual(await Promise.all([first, second]), ['a', 'b']);
  assert.deepEqual(seen, [true]);
});
