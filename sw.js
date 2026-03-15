const CACHE = 'money-v3';
const STATIC = ['/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ));
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Jangan pernah cache: Apps Script, JS, HTML
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('googleapis.com') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.html') ||
    url.pathname === '/'
  ) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Cache-first untuk aset lainnya
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
