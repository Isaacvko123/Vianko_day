const VERSION = 'vianko-shell-v2';
const OFFLINE = '/offline.html';
self.addEventListener('install', event => { event.waitUntil(caches.open(VERSION).then(cache => cache.addAll([OFFLINE, '/icon-192.png']))); });
self.addEventListener('activate', event => { event.waitUntil(Promise.all([caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('vianko-shell-') && key !== VERSION).map(key => caches.delete(key)))), self.clients.claim()])); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' || new URL(event.request.url).origin !== self.location.origin) return;
  // Never cache authenticated pages or API responses. Offline writes must not look saved.
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)));
});
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; } catch {}
  event.waitUntil(self.registration.showNotification(payload.title || 'Vianko Day', {
    body: payload.body || 'Tienes nuevas notificaciones.', icon: '/icon-192.png', badge: '/icon-192.png',
    tag: payload.id || 'vianko-update', data: { url: payload.url || '/notifications' }
  }));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/notifications', self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const client = clients.find(item => new URL(item.url).origin === url.origin);
    if (client) { client.postMessage({ navigate: url.pathname + url.search }); return client.focus(); }
    return self.clients.openWindow(url.href);
  }));
});
