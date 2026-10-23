// Noctiluca service worker.
//  - Pages (navigations): network first, so a new deploy is picked up immediately; cached copy when offline.
//  - Built assets (hashed, immutable): cache first.
//  - Pyodide runtime on jsDelivr (versioned, immutable): cache first, so Python works offline after first run.
// Scope-relative, so it works under any base path (e.g. /noctiluca/).
const VERSION = 'v2';
const SHELL = `noctiluca-shell-${VERSION}`;
const RUNTIME = `noctiluca-runtime-${VERSION}`;
const scope = self.registration.scope;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then((c) => c.addAll([scope, `${scope}manifest.webmanifest`, `${scope}icon-192.png`])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => ![SHELL, RUNTIME].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const isPyodide = (url) => url.hostname === 'cdn.jsdelivr.net' && url.pathname.startsWith('/pyodide/');

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match(scope)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (isPyodide(url)) return event.respondWith(cacheFirst(request, RUNTIME));
  if (url.origin !== location.origin) return;
  if (request.mode === 'navigate') return event.respondWith(networkFirst(request));
  if (url.pathname.includes('/assets/') || /\.(png|svg|woff2?)$/.test(url.pathname)) return event.respondWith(cacheFirst(request, SHELL));
  event.respondWith(networkFirst(request));
});
