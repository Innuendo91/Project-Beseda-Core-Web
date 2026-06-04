const CACHE = 'stream-v17';
const ASSETS = [
  '/',
  '/public/manifest.json',
  '/public/logo.png',
  '/public/logo-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('push', (e) => {
  let data = { title: 'Stream', body: 'Новое сообщение' };
  if (e.data) {
    try { data = JSON.parse(e.data.text()); } catch {}
  }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/public/logo.png',
      badge: '/public/logo.png',
      tag: 'push-' + Date.now(),
      requireInteraction: false,
    })
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      if (clients.length > 0) {
        return clients[0].focus();
      }
      return self.clients.openWindow('/');
    })
  );
});

function shouldCache(url) {
  try {
    const u = new URL(url, location.origin);
    if (u.pathname.startsWith('/chat/')) return false;
    if (u.pathname.startsWith('/watch/')) return false;
    if (u.pathname.startsWith('/room/')) return false;
    if (u.pathname.startsWith('/profile')) return false;
    if (u.pathname.startsWith('/admin')) return false;
    if (u.pathname.startsWith('/api/')) return false;
    if (u.pathname.startsWith('/ws/')) return false;
    return true;
  } catch {
    return false;
  }
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  if (!shouldCache(e.request.url)) {
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => {
      if (cached) return cached;
      return fetch(e.request).then((res) => {
        if (!res || res.status !== 200 || res.type !== 'basic') return res;
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, clone));
        return res;
      }).catch(() => {
        return caches.match('/').then((fallback) => {
          return fallback || new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      });
    })
  );
});
