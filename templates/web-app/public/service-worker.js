const CACHE_PREFIX = 'inventor-app-shell-';
const CACHE_NAME = `${CACHE_PREFIX}__INVENTOR_APP_SLUG__-v1`;
const STATIC_SHELL = [
  '/manifest.webmanifest',
  '/app-icon.svg',
  '/app-icon-192.png',
  '/app-icon-512.png',
];

async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const rootResponse = await fetch('/');
  if (!rootResponse.ok) throw new Error('No se pudo precachear la raíz de la app.');
  const html = await rootResponse.clone().text();
  const builtAssets = [...html.matchAll(/(?:src|href)=["'](\/assets\/[^"']+)["']/g)]
    .map((match) => match[1]);
  await Promise.all([
    cache.addAll(STATIC_SHELL),
    cache.put('/', rootResponse),
    builtAssets.length > 0 ? cache.addAll([...new Set(builtAssets)]) : Promise.resolve(),
  ]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell());
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names
        .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
        .map((name) => caches.delete(name)),
    )),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);
  if (event.request.method !== 'GET' || requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const cacheableAsset = requestUrl.pathname.startsWith('/assets/')
          && ['font', 'image', 'script', 'style'].includes(event.request.destination);
        if (response.ok && (event.request.mode === 'navigate' || cacheableAsset)) {
          const copy = response.clone();
          const cacheKey = event.request.mode === 'navigate' ? '/' : event.request;
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy)));
        }
        return response;
      })
      .catch(async () => {
        const exact = await caches.match(event.request);
        if (exact) return exact;
        if (event.request.mode === 'navigate') {
          return (await caches.match('/')) || Response.error();
        }
        return Response.error();
      }),
  );
});
