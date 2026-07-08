const CACHE = 'cache-v3';
const PRECACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/games-data.json',
  '/pizza-games.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRECACHE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
});

self.addEventListener('fetch', e => {
  if (e.request.url.startsWith('chrome-extension://')) return;
  if (e.request.url.includes('/game-proxy?')) {
    e.respondWith(fetch(e.request).catch(() => new Response('Offline', {status:503})));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request).then(response => {
      if (e.request.method === 'GET' && e.request.url.startsWith(self.location.origin) && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE).then(cache => cache.put(e.request, clone));
      }
      return response;
    }).catch(() => caches.match('/')))
  );
});
