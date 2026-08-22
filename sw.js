const CACHE_NAME = 'cotizapro-v2';
self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(CACHE_NAME).then(ca => ca.put(e.request, c)); }
    return r;
  }).catch(() => caches.match(e.request)));
});
