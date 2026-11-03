import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createHandler } from '../scripts/server.mjs';
import { AiError } from '../scripts/ai.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const start = opts => new Promise(resolve => {
  const server = http.createServer(createHandler({ root, ...opts }));
  server.listen(0, '127.0.0.1', () => resolve({ port: server.address().port, close: () => server.close() }));
});
const post = (port, body, type = 'application/json') => fetch(`http://127.0.0.1:${port}/api/recommend`, { method: 'POST', headers: { 'Content-Type': type }, body });
const valid = JSON.stringify({ playlistName: '도전하기', songs: [1, 2, 3].map(n => ({ title: `곡${n}`, artist: '', keyOffset: 0, lowestMidi: null, highestMidi: null, fromAi: false })), exclude: [], rejected: [] });

test('song-search endpoint validates q and maps failures', async () => {
  const get = (port, q, extra = '') => fetch(`http://127.0.0.1:${port}/api/song-search?q=${encodeURIComponent(q)}${extra}`);
  let asked;
  const answer = { results: [{ title: '밤편지', artist: '가수', tjNumber: '' }], source: 'musicbrainz', retriedWith: null, artist: null, hasMore: false };
  const s = await start({ recommend: null, searchSongs: async args => { asked = args; return answer; } });
  try {
    assert.equal((await get(s.port, '  ')).status, 400);
    assert.equal((await get(s.port, 'x'.repeat(121))).status, 400);
    for (const bad of ['&scope=x', '&mode=x', '&page=0', '&page=21', '&page=1.5']) assert.equal((await get(s.port, '밤편지', bad)).status, 400, bad);
    const ok = await get(s.port, '밤편지');
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), answer);
    assert.deepEqual(asked, { q: '밤편지', scope: 'kor', mode: 'search', page: 1 });
    await get(s.port, '엠씨더맥스', '&scope=all&mode=artist&page=2');
    assert.deepEqual(asked, { q: '엠씨더맥스', scope: 'all', mode: 'artist', page: 2 });
  } finally { s.close(); }
  const broken = await start({ recommend: null, searchSongs: async () => { throw new Error('down'); } });
  try { assert.equal((await get(broken.port, '밤편지')).status, 502); } finally { broken.close(); }
  const off = await start({ recommend: null });
  try { assert.equal((await get(off.port, '밤편지')).status, 503); } finally { off.close(); }
});

test('static files keep their headers and secrets are never served', async () => {
  const { port, close } = await start({ recommend: null });
  const home = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-security-policy'), /connect-src 'self'/);
  for (const path of ['/.env', '/scripts/serve.mjs', '/.env.example']) assert.equal((await fetch(`http://127.0.0.1:${port}${path}`)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${port}/`, { method: 'PUT' })).status, 405);
  close();
});

test('recommend endpoint validates input and maps failures to status codes', async () => {
  let received;
  const cases = [
    [{ recommend: async body => { received = body; return { items: [{ title: 'A' }], intent: 'any', fallback: false }; } }, valid, 'application/json', 200],
    [{ recommend: async () => ({ items: [], intent: 'challenge', fallback: false }) }, valid, 'application/json', 200],
    [{ recommend: async () => [] }, 'x'.repeat(1100000), 'application/json', 413],
    [{ recommend: async () => [] }, valid, 'text/plain', 415],
    [{ recommend: async () => [] }, '{bad', 'application/json', 400],
    [{ recommend: async () => [] }, JSON.stringify({ ...JSON.parse(valid), songs: [] }), 'application/json', 400],
    [{ recommend: null }, valid, 'application/json', 503],
    [{ recommend: async () => { throw new AiError('timeout', 't'); } }, valid, 'application/json', 504],
    [{ recommend: async () => null }, valid, 'application/json', 502],
  ];
  for (const [opts, body, type, status] of cases) {
    const { port, close } = await start(opts);
    try { assert.equal((await post(port, body, type)).status, status, `${status}`); }
    finally { close(); }
  }
  assert.equal(received.playlistName, '도전하기');
  const shaped = await start({ recommend: async () => ({ items: [{ title: 'A' }], intent: 'challenge', fallback: true }) });
  try { assert.deepEqual(await (await post(shaped.port, valid)).json(), { items: [{ title: 'A' }], intent: 'challenge', fallback: true }); } finally { shaped.close(); }
});

test('song-range endpoint validates input and returns a range or null', async () => {
  const postRange = (port, body) => fetch(`http://127.0.0.1:${port}/api/song-range`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  const found = { lowestMidi: 48, highestMidi: 67, sourceUrl: 'https://s.org', sourceNotation: '' };
  const s = await start({ recommend: null, lookupRange: async body => body.title === '봄날' ? found : null });
  try {
    assert.deepEqual(await (await postRange(s.port, JSON.stringify({ title: '봄날', artist: '' }))).json(), { range: found });
    assert.deepEqual(await (await postRange(s.port, JSON.stringify({ title: '없는 곡', artist: '' }))).json(), { range: null });
    assert.equal((await postRange(s.port, JSON.stringify({ title: ' ', artist: '' }))).status, 400);
  } finally { s.close(); }
  const off = await start({ recommend: null, lookupRange: null });
  try { assert.equal((await postRange(off.port, JSON.stringify({ title: '봄날', artist: '' }))).status, 503); }
  finally { off.close(); }
});

test('a request at the app limits (500 songs, 200 rejected) fits under the body cap', async () => {
  const title = i => `아주 긴 한국어 노래 제목 ${i} (Feat. 누군가)`;
  const big = JSON.stringify({
    playlistName: '도전하기',
    songs: Array.from({ length: 500 }, (_, i) => ({ title: title(i), artist: '어떤 가수 이름', keyOffset: -2, lowestMidi: 48, highestMidi: 67, fromAi: false })),
    exclude: Array.from({ length: 500 }, (_, i) => ({ title: title(i), artist: '어떤 가수 이름' })),
    rejected: Array.from({ length: 200 }, (_, i) => ({ title: `별로인 곡 ${i}`, artist: '가수' })),
  });
  assert.ok(Buffer.byteLength(big) > 16384);
  const s = await start({ recommend: async () => ({ items: [{ title: 'A' }], intent: 'any', fallback: false }) });
  try { assert.equal((await post(s.port, big)).status, 200); } finally { s.close(); }
});
