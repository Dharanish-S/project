const CACHE_NAME = 'zpay-v5';

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll([
      '/',
      '/index.html',
      '/manifest.json',
      '/icon.svg',
      '/sw.js'
    ]))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        return caches.delete(key);
      }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Network-first strategy for everything
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Cache successful GET requests for offline use
        if (e.request.method === 'GET' && response.status === 200 && !e.request.url.includes('/api/')) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache if offline
        return caches.match(e.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          
          // If navigation fails and not in cache, return index.html if cached
          if (e.request.mode === 'navigate') {
            return caches.match('/');
          }
        });
      })
  );
});
