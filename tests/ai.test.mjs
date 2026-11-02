import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchRecommendations } from '../scripts/ai.mjs';

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
});

test('upstream errors, bad JSON, and timeouts become AiError codes without leaking the key', async () => {
  await assert.rejects(fetchRecommendations(request, { apiKey: 'sk-secret', model: 'm', fetchImpl: reply(500, { error: { message: 'boom' } }) }),
    e => e.code === 'upstream' && !e.message.includes('sk-secret'));
  await assert.rejects(fetchRecommendations(request, { apiKey: 'k', model: 'm', fetchImpl: ok('not json') }), e => e.code === 'format');
  const hang = (_, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))));
  await assert.rejects(fetchRecommendations(request, { apiKey: 'k', model: 'm', fetchImpl: hang, timeoutMs: 20 }), e => e.code === 'timeout');
});
