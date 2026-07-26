/**
 * Service worker : le catalogue reste consultable hors ligne (pratique dans le
 * métro ou en magasin). Réseau d'abord pour rester à jour, cache en secours.
 */

const CACHE = 'marstoy-real-v2';
const SHELL = [
  './', './index.html', './manifest.webmanifest', './data/catalog.json',
  './icon.svg', './icon-192.png', './icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Les visuels Rebrickable : cache d'abord, ils ne changent jamais.
  const imageFirst = url.hostname === 'cdn.rebrickable.com';

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      if (imageFirst) {
        const hit = await cache.match(request);
        if (hit) return hit;
      }

      try {
        const response = await fetch(request);
        if (response.ok && (url.origin === self.location.origin || imageFirst)) {
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const hit = await cache.match(request);
        if (hit) return hit;
        if (request.mode === 'navigate') {
          const shell = await cache.match('./index.html');
          if (shell) return shell;
        }
        throw error;
      }
    })(),
  );
});
