const VERSION = 'cinemax-shell-v1';
const SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/reference-theme.css',
  '/blogspot-theme.css?v=20261021-14',
  '/pwa.css',
  '/ui-fixes.js?v=20261021-08',
  '/account.js?v=20261021-06',
  '/app.js?v=20261021-04',
  '/animegg-adapter.js',
  '/playback-sources.js',
  '/pwa.js',
  '/manifest.webmanifest',
  '/icons/cinemax.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('cinemax-shell-') && key !== VERSION).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/auth-config.js') return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => (await caches.match('/')) || Response.error()));
    return;
  }

  event.respondWith(caches.match(request).then(cached => cached || fetch(request).then(response => {
    if (response.ok) caches.open(VERSION).then(cache => cache.put(request, response.clone()));
    return response;
  })));
});
