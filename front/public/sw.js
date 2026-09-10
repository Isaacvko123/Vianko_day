const VERSION = 'vianko-shell-v3';
const OFFLINE = '/offline.html';
self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll([OFFLINE, '/icon-192.png'])));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('vianko-shell-') && key !== VERSION).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
  if (event.data?.type === 'CLEAR_DEVICE' || event.data?.type === 'UNREAD_COUNT') {
    const count = event.data.type === 'CLEAR_DEVICE' ? 0 : Math.max(0, Number(event.data.count) || 0);
    event.waitUntil(Promise.all([
      Promise.resolve(count ? self.navigator.setAppBadge?.(count) : self.navigator.clearAppBadge?.()).catch(() => undefined),
      count ? Promise.resolve() : self.registration.getNotifications().then(notifications => notifications.forEach(notification => notification.close()))
    ]));
  }
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || event.request.mode !== 'navigate' || new URL(event.request.url).origin !== self.location.origin) return;
  // Only a public offline screen is cached. Private data always comes from the API.
  event.respondWith(fetch(event.request).catch(async () => await caches.match(OFFLINE) || new Response('Sin conexión. Vuelve a intentarlo.', { status: 503, headers: { 'Content-Type': 'text/plain;charset=utf-8' } })));
});
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json() ?? {}; } catch {}
  event.waitUntil(Promise.all([
    self.registration.showNotification(payload.title || 'Vianko Day', {
      body: payload.body || 'Tienes nuevas notificaciones. Toca para consultar.',
      icon: '/icon-192.png', badge: '/icon-192.png',
      tag: payload.id || 'vianko-update',
      data: { url: typeof payload.url === 'string' ? payload.url : '/notifications' }
    }),
    Promise.resolve(self.navigator.setAppBadge?.()).catch(() => undefined)
  ]));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  let url;
  try { url = new URL(event.notification.data?.url || '/notifications', self.location.origin); } catch { return; }
  if (url.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const client = clients.find(item => new URL(item.url).origin === url.origin);
    if (client) {
      if (new URL(client.url).pathname === OFFLINE) await client.navigate(url.href);
      else client.postMessage({ navigate: url.pathname + url.search });
      return client.focus();
    }
    return self.clients.openWindow(url.href);
  }));
});
