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

// The server stamps module addresses with ?v=<version> and sends the version with the page (scripts/server.mjs).
const isPage = url => url.pathname === '/' || url.pathname.endsWith('.html');

/** Once a fresh page is in use, kept files of other versions can go; unversioned files (icons, sounds) stay. */
async function prune(version) {
  if (!version) return;
  const cache = await caches.open(CACHE);
  for (const request of await cache.keys()) {
    const kept = new URL(request.url).searchParams.get('v');
    if (kept && kept !== version) await cache.delete(request);
  }
}

async function answer(request) {
  const network = fetch(request);
  // Whenever the network answers, the copy is refreshed (even after the kept one was already shown).
  network.then(response => keep(request, response.clone())).catch(() => {});
  const page = isPage(new URL(request.url));
  const kept = await (await caches.open(CACHE)).match(request);
  if (!kept) {
    if (page) network.then(response => (response.status === 200 ? prune(response.headers.get('X-Sing-Version')) : null)).catch(() => {});
    return network;
  }
  const late = new Promise(resolve => setTimeout(() => resolve(null), TIMEOUT_MS));
  const quick = await Promise.race([network.then(response => (response.status === 200 ? response : null), () => null), late]);
  // A page answered by the network is the one in use now; a kept page still needs its own version's files.
  if (quick && page) prune(quick.headers.get('X-Sing-Version')).catch(() => {});
  return quick ?? kept;
}
