import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://sing.example';
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

function worker({ network = async () => new Response('fresh', { status: 200 }) } = {}) {
  const listeners = {};
  const stores = new Map();
  const timers = [];
  const key = request => (typeof request === 'string' ? request : request.url);
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        match: async request => store.get(key(request))?.clone(),
        put: async (request, response) => { store.set(key(request), response); },
        keys: async () => [...store.keys()].map(url => new Request(url)),
        delete: async request => store.delete(key(request)),
      };
    },
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name),
  };
  const claimed = { count: 0 };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    skipWaiting: () => {},
    clients: { claim: async () => { claimed.count++; } },
  };
  const state = { network };
  vm.runInNewContext(source, { self, caches, fetch: (...args) => state.network(...args), setTimeout: fn => { timers.push(fn); return timers.length; }, Response, Request, URL, console });
  const ask = (path, init) => {
    const event = { request: new Request(path.startsWith('http') ? path : ORIGIN + path, init), responded: null, respondWith(promise) { this.responded = promise; } };
    listeners.fetch(event);
    return event;
  };
  const kept = async path => { const store = stores.get('sing-shell-v1'); const response = store?.get(ORIGIN + path); return response ? response.clone().text() : null; };
  const keep = async (path, body) => { await (await caches.open('sing-shell-v1')).put(ORIGIN + path, new Response(body, { status: 200 })); };
  return { listeners, stores, timers, state, ask, kept, keep, claimed, caches };
}

test('API calls, other methods and other sites are left alone', () => {
  const w = worker();
  assert.equal(w.ask('/api/hello').responded, null);
  assert.equal(w.ask('/src/app.js', { method: 'POST', body: 'x' }).responded, null);
  assert.equal(w.ask('https://www.youtube.com/iframe_api').responded, null);
});

test('a quick answer from the network is used and kept', async () => {
  const w = worker();
  const response = await w.ask('/src/app.js').responded;
  assert.equal(await response.text(), 'fresh');
  await flush();
  assert.equal(await w.kept('/src/app.js'), 'fresh');
});

test('when the network fails the kept copy is used', async () => {
  const w = worker({ network: async () => { throw new TypeError('offline'); } });
  await w.keep('/', 'kept page');
  assert.equal(await (await w.ask('/').responded).text(), 'kept page');
});

test('a slow network gives way to the kept copy, which its late answer then replaces', async () => {
  const late = deferred();
  const w = worker({ network: () => late.promise });
  await w.keep('/src/views.js', 'old');
  const event = w.ask('/src/views.js');
  await flush();
  assert.equal(w.timers.length, 1);
  w.timers[0]();
  assert.equal(await (await event.responded).text(), 'old');
  late.resolve(new Response('new', { status: 200 }));
  await flush();
  assert.equal(await w.kept('/src/views.js'), 'new');
});

test('with nothing kept, the network\'s answer is waited for, failure included', async () => {
  const w = worker({ network: async () => { throw new TypeError('offline'); } });
  await assert.rejects(w.ask('/src/app.js').responded, /offline/);
});

test('an error page is never kept', async () => {
  const w = worker({ network: async () => new Response('broken', { status: 500 }) });
  const response = await w.ask('/src/app.js').responded;
  assert.equal(response.status, 500);
  await flush();
  assert.equal(await w.kept('/src/app.js'), null);
  await w.keep('/src/app.js', 'good');
  assert.equal(await (await w.ask('/src/app.js').responded).text(), 'good');
  await flush();
  assert.equal(await w.kept('/src/app.js'), 'good');
});

test('activation drops old stores and takes over open pages', async () => {
  const w = worker();
  await w.caches.open('old-cache');
  await w.caches.open('sing-shell-v1');
  let done;
  w.listeners.activate({ waitUntil: promise => { done = promise; } });
  await done;
  assert.deepEqual(await w.caches.keys(), ['sing-shell-v1']);
  assert.equal(w.claimed.count, 1);
});

test('once a fresh page is in use, the kept files of other versions are dropped (unversioned files stay)', async () => {
  const w = worker({ network: async () => new Response('page', { status: 200, headers: { 'X-Sing-Version': 'bbbbbbbbbb' } }) });
  await w.keep('/src/app.js?v=aaaaaaaaaa', 'old app');
  await w.keep('/src/app.js?v=bbbbbbbbbb', 'new app');
  await w.keep('/assets/icon-192.png', 'icon');
  await (await w.ask('/').responded).text();
  await flush();
  await flush();
  assert.equal(await w.kept('/src/app.js?v=aaaaaaaaaa'), null);
  assert.equal(await w.kept('/src/app.js?v=bbbbbbbbbb'), 'new app');
  assert.equal(await w.kept('/assets/icon-192.png'), 'icon');
});

test('a page served from the kept copy keeps its own version\'s files, even when the newer page arrives late', async () => {
  const late = deferred();
  const w = worker({ network: () => late.promise });
  await w.keep('/', 'old page');
  await w.keep('/src/app.js?v=aaaaaaaaaa', 'old app');
  const event = w.ask('/');
  await flush();
  w.timers[0]();
  assert.equal(await (await event.responded).text(), 'old page');
  late.resolve(new Response('new page', { status: 200, headers: { 'X-Sing-Version': 'bbbbbbbbbb' } }));
  await flush();
  await flush();
  assert.equal(await w.kept('/'), 'new page', 'the next load gets the new page');
  assert.equal(await w.kept('/src/app.js?v=aaaaaaaaaa'), 'old app', 'the page in use still finds its files');
});
