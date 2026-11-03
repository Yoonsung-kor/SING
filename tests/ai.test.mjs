import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchRecommendations, fetchSongRange } from '../scripts/ai.mjs';

const request = { playlistName: '도전하기', songs: [], exclude: [], rejected: [] };
const reply = (status, body) => async () => ({ ok: status < 300, status, json: async () => body });
const ok = text => reply(200, { output: [{ type: 'web_search_call', status: 'completed' }, { type: 'message', content: [{ type: 'output_text', text, annotations: [] }] }] });

test('sends a Responses API request with web search and a JSON schema', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init, body: JSON.parse(init.body) }; return ok('{"items":[]}')(); };
  assert.deepEqual(await fetchRecommendations(request, { apiKey: 'sk-test', model: 'm', fetchImpl }), { items: [] });
  assert.equal(seen.url, 'https://api.openai.com/v1/responses');
  assert.equal(seen.init.headers.Authorization, 'Bearer sk-test');
  assert.equal(seen.body.model, 'm');
  assert.deepEqual(seen.body.tools, [{ type: 'web_search' }]);
  assert.equal(seen.body.text.format.type, 'json_schema');
  assert.ok(seen.body.input.includes('도전하기'));
  assert.match(seen.body.instructions, /2옥타브 라 = A4/);
  // Measured 2026-11-02 with gpt-5.5: default effort took 55 s, low took 16 s with the same quality.
  assert.deepEqual(seen.body.reasoning, { effort: 'low' });
});

test('the recommendation schema asks for the list intent, each song\'s highest-note claim and its original vocal', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = JSON.parse(init.body); return ok('{"intent":"any","items":[]}')(); };
  await fetchRecommendations(request, { apiKey: 'k', model: 'm', fetchImpl });
  const schema = seen.text.format.schema;
  assert.deepEqual(schema.properties.intent.enum, ['comfortable', 'challenge', 'any']);
  assert.ok(schema.properties.items.items.required.includes('highest'));
  assert.ok(schema.properties.items.items.required.includes('vocal'));
  assert.match(seen.instructions, /8/);
  assert.match(seen.instructions, /comfortableHigh/);
  assert.match(seen.instructions, /한 가수당 1곡/);
  assert.match(seen.instructions, /hiA = A4/);
  assert.doesNotMatch(seen.instructions, /나무위키|namu/i);
});

test('both lookups wait up to 60 seconds by default before timing out', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const call of [fetchImpl => fetchRecommendations(request, { apiKey: 'k', model: 'm', fetchImpl }), fetchImpl => fetchSongRange({ title: '봄날', artist: '' }, { apiKey: 'k', model: 'm', fetchImpl })]) {
    let signal;
    const pending = call((_, init) => { signal = init.signal; return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))); });
    t.mock.timers.tick(59999);
    assert.equal(signal.aborted, false);
    t.mock.timers.tick(1);
    await assert.rejects(pending, e => e.code === 'timeout');
  }
});

test('upstream errors, bad JSON, and timeouts become AiError codes without leaking the key', async () => {
  await assert.rejects(fetchRecommendations(request, { apiKey: 'sk-secret', model: 'm', fetchImpl: reply(500, { error: { message: 'boom' } }) }),
    e => e.code === 'upstream' && !e.message.includes('sk-secret'));
  await assert.rejects(fetchRecommendations(request, { apiKey: 'k', model: 'm', fetchImpl: ok('not json') }), e => e.code === 'format');
  const hang = (_, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  await assert.rejects(fetchRecommendations(request, { apiKey: 'k', model: 'm', fetchImpl: hang, timeoutMs: 20 }), e => e.code === 'timeout');
});

test('song range lookup asks for one range with the same notation rule', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = JSON.parse(init.body); return ok('{"range":null}')(); };
  assert.deepEqual(await fetchSongRange({ title: '봄날', artist: '방탄소년단' }, { apiKey: 'k', model: 'm', fetchImpl }), { range: null });
  assert.equal(seen.text.format.name, 'song_range');
  assert.deepEqual(seen.reasoning, { effort: 'low' });
  assert.ok(seen.input.includes('봄날'));
  assert.match(seen.instructions, /2옥타브 라 = A4/);
});

test('song range lookup v2 asks for chest, falsetto, the exact quote and the original vocal', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = JSON.parse(init.body); return ok('{"found":false}')(); };
  await fetchSongRange({ title: '밤편지', artist: '아이유' }, { apiKey: 'k', model: 'm', fetchImpl });
  assert.deepEqual(seen.text.format.schema.required, ['found', 'chestHighest', 'falsettoHighest', 'lowest', 'sourceUrl', 'sourceQuote', 'vocal']);
  assert.match(seen.instructions, /hiA = A4/);
  assert.match(seen.instructions, /2옥타브 라 = A4/);
  assert.doesNotMatch(seen.instructions, /hiA = A5/);
  assert.doesNotMatch(seen.instructions, /나무위키|namu/i);
});
