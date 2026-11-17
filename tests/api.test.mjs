import assert from 'node:assert/strict';
import test from 'node:test';
import { createApi, safeStorage, inviteFromHash } from '../src/api.js';

const DEVICE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const memory = () => { const map = new Map(); return { get: key => map.get(key) ?? null, set: (key, value) => map.set(key, value), remove: key => map.delete(key), map }; };
const answering = (status, body) => {
  const calls = [];
  const fetchImpl = async (path, init = {}) => { calls.push({ path, init }); return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }); };
  return { calls, fetchImpl };
};
const id = '00000000-0000-4000-8000-000000000001';

test('every request carries the device id, and the invite code once there is one', async () => {
  const storage = memory();
  const { calls, fetchImpl } = answering(200, { ok: true });
  const api = createApi({ fetchImpl, storage, newId: () => id });
  await api.request('/api/hello');
  assert.equal(calls[0].init.headers.get('X-Sing-Device'), id);
  assert.equal(calls[0].init.headers.get('X-Sing-Invite'), null);
  api.invite.set('abc12345');
  await api.request('/api/recommend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(calls[1].init.headers.get('X-Sing-Invite'), 'abc12345');
  assert.equal(calls[1].init.headers.get('Content-Type'), 'application/json');
  assert.equal(calls[1].init.method, 'POST');
  assert.equal(calls[1].init.body, '{}');
});

test('the device id is made once and kept', () => {
  const storage = memory();
  let made = 0;
  const api = createApi({ storage, newId: () => { made++; return id; } });
  assert.equal(api.deviceId(), id);
  assert.equal(api.deviceId(), id);
  assert.equal(made, 1);
  assert.match(storage.get('sing.device'), DEVICE);
  assert.match(createApi({ storage: memory() }).deviceId(), DEVICE, 'the real maker');
});

test('a blocked browser store falls back to memory', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
  const store = safeStorage(broken);
  store.set('sing.invite', 'abc12345');
  assert.equal(store.get('sing.invite'), 'abc12345');
  store.remove('sing.invite');
  assert.equal(store.get('sing.invite'), null);
  const none = safeStorage(undefined);
  none.set('a', 'b');
  assert.equal(none.get('a'), 'b');
});

test('the invite code is read from the link', () => {
  assert.equal(inviteFromHash('#invite=abc12345'), 'abc12345');
  assert.equal(inviteFromHash('#invite=Abc_123-xyz'), 'Abc_123-xyz');
  for (const hash of ['#invite=짧', '#x=abc12345', '', '#invite=a b c d e f g h', '#invite=short', null, undefined]) assert.equal(inviteFromHash(hash), null, String(hash));
});

test('a refused invite clears the code and asks for it, and the caller can still read the answer', async () => {
  const storage = memory();
  const { fetchImpl } = answering(401, { error: 'invite' });
  let asked = 0;
  const api = createApi({ fetchImpl, storage, onInvite: () => { asked++; } });
  api.invite.set('abc12345');
  const response = await api.request('/api/hello');
  assert.equal(api.invite.get(), null);
  assert.equal(asked, 1);
  assert.deepEqual(await response.json(), { error: 'invite' });
});

test('daily limits and slow-downs are reported; a YouTube quota is left to the caller', async () => {
  const seen = [];
  for (const error of ['daily-limit', 'slow-down', 'quota']) {
    const { fetchImpl } = answering(429, { error });
    const response = await createApi({ fetchImpl, storage: memory(), onLimit: kind => seen.push(kind) }).request('/api/song-videos?side=mv&title=a');
    assert.deepEqual(await response.json(), { error });
  }
  assert.deepEqual(seen, ['daily-limit', 'slow-down']);
});

test('waking the server shows the notice only when the answer is slow', async () => {
  const quick = [];
  const fast = createApi({ fetchImpl: async () => new Response('{"ok":true}'), storage: memory(), onWaking: value => quick.push(value), timer: () => {} });
  assert.equal(await fast.wake(), true);
  assert.deepEqual(quick, []);

  const slow = [];
  let fire;
  let answer;
  const late = createApi({ fetchImpl: () => new Promise(resolve => { answer = resolve; }), storage: memory(), onWaking: value => slow.push(value), timer: fn => { fire = fn; } });
  const woke = late.wake();
  fire();
  answer(new Response('{"ok":true}'));
  assert.equal(await woke, true);
  assert.deepEqual(slow, [true, false]);

  const failed = [];
  const down = createApi({ fetchImpl: async () => { throw new Error('offline'); }, storage: memory(), onWaking: value => failed.push(value), timer: () => {} });
  assert.equal(await down.wake(), false);
  assert.equal(failed.at(-1), false);
});
