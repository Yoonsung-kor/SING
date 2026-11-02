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
    [{ recommend: async body => { received = body; return [{ title: 'A' }]; } }, valid, 'application/json', 200],
    [{ recommend: async () => [] }, 'x'.repeat(20000), 'application/json', 413],
    [{ recommend: async () => [] }, valid, 'text/plain', 415],
    [{ recommend: async () => [] }, '{bad', 'application/json', 400],
    [{ recommend: async () => [] }, JSON.stringify({ ...JSON.parse(valid), songs: [] }), 'application/json', 400],
    [{ recommend: null }, valid, 'application/json', 503],
    [{ recommend: async () => { throw new AiError('timeout', 't'); } }, valid, 'application/json', 504],
    [{ recommend: async () => [] }, valid, 'application/json', 502],
  ];
  for (const [opts, body, type, status] of cases) {
    const { port, close } = await start(opts);
    assert.equal((await post(port, body, type)).status, status, `${status}`);
    close();
  }
  assert.equal(received.playlistName, '도전하기');
});
