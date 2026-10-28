/* Vyro service worker: shows push notifications and opens the app when one is tapped. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { data: { title: 'Vyro', body: event.data ? event.data.text() : '' } };
  }
  const d = payload.data || {};
  const n = payload.notification || {};
  const title = d.title || n.title || 'Vyro';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || n.body || '',
      tag: d.tag || undefined,
      renotify: Boolean(d.tag),
      icon: 'icons/icon-192.png',
      badge: 'icons/badge-96.png',
      data: { url: d.url || '#/' },
      requireInteraction: d.important === 'true',
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const hash = (event.notification.data && event.notification.data.url) || '#/';
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((c) => c.url.startsWith(self.registration.scope));
      if (open) {
        await open.focus();
        open.postMessage({ type: 'navigate', url: hash });
        return;
      }
      await self.clients.openWindow(new URL(hash, self.registration.scope).href);
    })(),
  );
});
