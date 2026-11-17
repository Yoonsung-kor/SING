// Keeps the app's own files on the phone, so a sleeping free server does not hold the first screen.
// Fresh files whenever the server answers within 3 s; the kept copy otherwise (and the late answer replaces it).
// API calls, other methods and other sites pass straight through. Error answers are never kept.
const CACHE = 'sing-shell-v1';
const TIMEOUT_MS = 3000;

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name !== CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  event.respondWith(answer(request));
});

async function keep(request, response) {
  if (response.status !== 200) return;
  const cache = await caches.open(CACHE);
  await cache.put(request, response);
}

async function answer(request) {
  const network = fetch(request);
  // Whenever the network answers, the copy is refreshed (even after the kept one was already shown).
  network.then(response => keep(request, response.clone())).catch(() => {});
  const kept = await (await caches.open(CACHE)).match(request);
  if (!kept) return network;
  const late = new Promise(resolve => setTimeout(() => resolve(null), TIMEOUT_MS));
  const quick = await Promise.race([network.then(response => (response.status === 200 ? response : null), () => null), late]);
  return quick ?? kept;
}
