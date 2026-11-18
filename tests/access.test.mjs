import assert from 'node:assert/strict';
import test from 'node:test';
import { createAccess, kstDay, DEFAULT_LIMITS, startupProblem } from '../scripts/access.mjs';

const CODE = 'abc12345';
const device = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const req = (ip, headers = {}) => ({ headers, socket: { remoteAddress: ip } });
const ok = (n = 1) => ({ 'x-sing-invite': CODE, 'x-sing-device': device(n) });
const clock = (iso = '2026-11-20T03:00:00Z') => {
  let at = Date.parse(iso);
  return { now: () => at, set: next => { at = Date.parse(next); }, add: ms => { at += ms; } };
};
const guarded = (extra = {}) => {
  const time = clock(extra.at);
  return { time, access: createAccess({ inviteCodes: [CODE], adminKey: 'k'.repeat(16), now: time.now, ...extra }) };
};

test('without invite codes nothing is checked', () => {
  const access = createAccess({});
  assert.equal(access.inviteRequired, false);
  assert.equal(access.check(req('1.1.1.1'), '/api/recommend'), null);
  for (let i = 0; i < 80; i++) assert.equal(access.check(req('1.1.1.1'), '/api/song-search'), null);
});

test('an invite code and a device id are required', () => {
  const { access } = guarded();
  assert.equal(access.inviteRequired, true);
  assert.deepEqual(access.check(req('1.1.1.1'), '/api/hello'), { status: 401, body: { error: 'invite' } });
  assert.deepEqual(access.check(req('1.1.1.1', { 'x-sing-invite': 'abc12346', 'x-sing-device': device(1) }), '/api/hello'), { status: 401, body: { error: 'invite' } });
  assert.deepEqual(access.check(req('1.1.1.1', { 'x-sing-invite': 'abc1234', 'x-sing-device': device(1) }), '/api/hello'), { status: 401, body: { error: 'invite' } });
  assert.equal(access.check(req('1.1.1.1', ok()), '/api/hello'), null);
  assert.deepEqual(access.check(req('1.1.1.1', { 'x-sing-invite': CODE }), '/api/hello'), { status: 400, body: { error: 'device' } });
  assert.deepEqual(access.check(req('1.1.1.1', { 'x-sing-invite': CODE, 'x-sing-device': 'not-a-uuid' }), '/api/hello'), { status: 400, body: { error: 'device' } });
});

test('health and config are always open', () => {
  const { access } = guarded();
  for (let i = 0; i < 100; i++) {
    assert.equal(access.check(req('1.1.1.1'), '/api/health'), null);
    assert.equal(access.check(req('1.1.1.1'), '/api/config'), null);
  }
});

test('the eleventh wrong code from one address within ten minutes is refused, then it opens again', () => {
  const { access, time } = guarded();
  const wrong = () => access.check(req('2.2.2.2', { 'x-sing-invite': 'wrong-code', 'x-sing-device': device(1) }), '/api/hello');
  for (let i = 0; i < 10; i++) assert.equal(wrong().status, 401, `try ${i + 1}`);
  assert.deepEqual(wrong(), { status: 429, body: { error: 'slow-down' } });
  assert.deepEqual(access.check(req('2.2.2.2', {}), '/api/hello'), { status: 429, body: { error: 'slow-down' } }, 'no code: waits too');
  assert.equal(access.check(req('3.3.3.3', { 'x-sing-invite': 'wrong-code' }), '/api/hello').status, 401, 'another address is not affected');
  time.add(10 * 60 * 1000);
  assert.equal(wrong().status, 401);
});

test('friends with the code on the same network are not held up by someone else\'s wrong codes', () => {
  const { access } = guarded();
  for (let i = 0; i < 11; i++) access.check(req('2.2.2.2', { 'x-sing-invite': 'wrong-code' }), '/api/hello');
  assert.equal(access.check(req('2.2.2.2', ok(1)), '/api/hello'), null);
  assert.equal(access.check(req('2.2.2.2', ok(2)), '/api/song-search'), null);
});

test('with the code, the pace is per device: fifteen friends on one school Wi-Fi each have their own sixty a minute', () => {
  const { access, time } = guarded();
  for (let friend = 1; friend <= 15; friend++) {
    for (let i = 0; i < 5; i++) assert.equal(access.check(req('4.4.4.4', ok(friend)), '/api/song-search'), null, `friend ${friend} request ${i + 1}`);
  }
  for (let i = 5; i < 60; i++) assert.equal(access.check(req('4.4.4.4', ok(1)), '/api/song-search'), null, `request ${i + 1}`);
  assert.deepEqual(access.check(req('4.4.4.4', ok(1)), '/api/song-search'), { status: 429, body: { error: 'slow-down' } }, 'one device past sixty waits');
  assert.equal(access.check(req('4.4.4.4', ok(2)), '/api/song-search'), null, 'the others go on');
  time.add(60 * 1000);
  assert.equal(access.check(req('4.4.4.4', ok(1)), '/api/song-search'), null);
});

test('without the code, more than sixty requests a minute from one address are slowed down', () => {
  const { access } = guarded({ limits: { inviteFailures: 1000 } });
  for (let i = 0; i < 60; i++) assert.equal(access.check(req('6.6.6.6', {}), '/api/hello').status, 401, `request ${i + 1}`);
  assert.deepEqual(access.check(req('6.6.6.6', {}), '/api/hello'), { status: 429, body: { error: 'slow-down' } });
});

test('AI requests are capped per device and in total each day', () => {
  const { access } = guarded();
  for (let i = 0; i < 30; i++) assert.equal(access.check(req('6.6.6.6', ok(1)), '/api/recommend'), null, `request ${i + 1}`);
  assert.deepEqual(access.check(req('6.6.6.6', ok(1)), '/api/practice-feedback'), { status: 429, body: { error: 'daily-limit' } });
  assert.equal(access.check(req('7.7.7.7', ok(2)), '/api/song-range'), null, 'another device still has its share');

  const total = guarded().access;
  for (let i = 0; i < 200; i++) {
    const n = 10 + Math.floor(i / 30);
    assert.equal(total.check(req(`10.0.0.${n}`, ok(n)), '/api/recommend'), null, `request ${i + 1}`);
  }
  assert.deepEqual(total.check(req('10.0.1.1', ok(99)), '/api/recommend'), { status: 429, body: { error: 'daily-limit' } });
});

test('the daily caps open again at midnight in Korea', () => {
  const { access, time } = guarded({ at: '2026-11-20T14:59:59Z' });
  for (let i = 0; i < 30; i++) access.check(req('8.8.8.8', ok()), '/api/recommend');
  assert.equal(access.check(req('8.8.8.8', ok()), '/api/recommend').status, 429);
  time.set('2026-11-20T15:00:00Z');
  assert.equal(access.check(req('8.8.8.8', ok()), '/api/recommend'), null);
});

test('video searches are capped per device', () => {
  const { access } = guarded();
  for (let i = 0; i < 20; i++) assert.equal(access.check(req('9.9.9.9', ok()), '/api/song-videos'), null, `request ${i + 1}`);
  assert.deepEqual(access.check(req('9.9.9.9', ok()), '/api/song-videos'), { status: 429, body: { error: 'daily-limit' } });
  assert.equal(access.check(req('9.9.9.9', ok()), '/api/song-sections'), null, 'other lookups are not capped');
});

test('stats count distinct devices and requests, only with the right key', () => {
  const { access } = guarded();
  assert.equal(access.stats('wrong-key-wrong-key'), null);
  assert.equal(access.stats(''), null);
  access.check(req('1.1.1.1', ok(1)), '/api/hello');
  access.check(req('1.1.1.1', ok(1)), '/api/recommend');
  access.check(req('1.1.1.1', ok(1)), '/api/song-videos');
  assert.deepEqual(access.stats('k'.repeat(16)), { days: [{ day: '2026-11-20', devices: 1, ai: 1, videos: 1 }] });
  access.check(req('1.1.1.2', ok(2)), '/api/hello');
  assert.equal(access.stats('k'.repeat(16)).days[0].devices, 2);
  assert.equal(createAccess({ inviteCodes: [CODE] }).stats(''), null, 'no admin key, no stats');
});

test('stats keep the last thirty days, newest first', () => {
  const { access, time } = guarded({ at: '2026-10-01T03:00:00Z' });
  for (let d = 0; d < 35; d++) { access.check(req('1.1.1.1', ok(1)), '/api/hello'); time.add(86400000); }
  const days = access.stats('k'.repeat(16)).days;
  assert.equal(days.length, 30);
  assert.equal(days[0].day, '2026-11-04');
  assert.equal(days.at(-1).day, '2026-10-06');
});

test('the forwarded address is used only when the proxy is trusted (it paces requests without the code)', () => {
  const limits = { inviteFailures: 1000 };
  const plain = guarded({ limits }).access;
  const trusted = guarded({ trustProxy: true, limits }).access;
  const via = n => req('127.0.0.1', { 'x-forwarded-for': `20.0.0.${n}, 10.0.0.1` });
  for (let i = 0; i < 60; i++) assert.equal(plain.check(via(i), '/api/hello').status, 401);
  assert.equal(plain.check(via(99), '/api/hello').status, 429, 'all from the socket address');
  for (let i = 0; i < 61; i++) assert.equal(trusted.check(via(i), '/api/hello').status, 401, 'each forwarded address counts alone');
});

test('kstDay is the date in Korea', () => {
  assert.equal(kstDay(Date.UTC(2026, 10, 20, 15, 0, 0)), '2026-11-21');
  assert.equal(kstDay(Date.UTC(2026, 10, 20, 14, 59, 59)), '2026-11-20');
});

test('limits can be changed', () => {
  assert.deepEqual(DEFAULT_LIMITS, { perMinute: 60, inviteFailures: 10, inviteWindowMs: 600000, aiPerDevice: 30, aiTotal: 200, videosPerDevice: 20 });
  const { access } = guarded({ limits: { aiPerDevice: 2 } });
  assert.equal(access.check(req('1.1.1.1', ok()), '/api/recommend'), null);
  assert.equal(access.check(req('1.1.1.1', ok()), '/api/recommend'), null);
  assert.equal(access.check(req('1.1.1.1', ok()), '/api/recommend').status, 429);
});

test('a new device of the day is logged without its id', t => {
  const lines = [];
  t.mock.method(console, 'log', line => lines.push(line));
  const { access } = guarded();
  access.check(req('1.1.1.1', ok(1)), '/api/hello');
  access.check(req('1.1.1.1', ok(1)), '/api/hello');
  access.check(req('1.1.1.1', ok(2)), '/api/hello');
  assert.deepEqual(lines.map(line => JSON.parse(line)), [{ event: 'device', day: '2026-11-20', devices: 1 }, { event: 'device', day: '2026-11-20', devices: 2 }]);
  assert.ok(lines.every(line => !line.includes(device(1)) && !line.includes(device(2))));
});

test('the server will not start open to the outside without invite codes (the AI key would have no limit)', async () => {
  assert.match(startupProblem({ host: '0.0.0.0', inviteCodes: [] }), /INVITE_CODES/);
  assert.equal(startupProblem({ host: '0.0.0.0', inviteCodes: ['abc12345'] }), null);
  for (const host of ['127.0.0.1', 'localhost', '::1']) assert.equal(startupProblem({ host, inviteCodes: [] }), null, `${host}: this PC only`);
  assert.match(startupProblem({ host: '127.0.0.1', inviteCodes: ['short'] }), /8~64자/);
  const { readFileSync } = await import('node:fs');
  const serve = readFileSync(new URL('../scripts/serve.mjs', import.meta.url), 'utf8');
  assert.match(serve, /startupProblem\(\{ host, inviteCodes \}\)/);
  assert.doesNotMatch(serve, /console\.warn\('주의: 초대 코드 없이/);
});
