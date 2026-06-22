/* sw/service-worker.js
   Service Worker do My Fit Era — gerencia notificações push e cache offline */

const CACHE_NAME = 'myfitera-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/style.css',
  './js/notifications.js',
  './js/app.js'
];

/* ===== INSTALAÇÃO ===== */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS_TO_CACHE))
  );
  self.skipWaiting();
});

/* ===== ATIVAÇÃO ===== */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ===== CACHE FETCH ===== */
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request))
  );
});

/* ===== RECEBER PUSH DO SERVIDOR (opcional) ===== */
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {};
  const title = data.title || '🏋️ My Fit Era';
  const options = {
    body: data.body || 'Hora de registrar seus hábitos!',
    icon: data.icon || 'icon-192.png',
    tag: data.tag || 'myfitera-default',
    data: { url: data.url || self.registration.scope },
    actions: data.actions || [
      { action: 'open', title: 'Abrir app' },
      { action: 'dismiss', title: 'Dispensar' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/* ===== NOTIFICAÇÃO LOCAL AGENDADA ===== */
self.addEventListener('message', event => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, icon } = event.data;
    self.registration.showNotification(title || '🏋️ My Fit Era', {
      body: body || 'Lembrete do My Fit Era',
      icon: icon || 'icon-192.png',
      tag: tag || 'myfitera-local',
      data: { url: self.registration.scope }
    });
  }
});

/* ===== CLIQUE NA NOTIFICAÇÃO ===== */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || self.registration.scope;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.registration.scope) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

/* ===== FECHAR NOTIFICAÇÃO ===== */
self.addEventListener('notificationclose', event => {
  console.log('[SW] Notificação fechada:', event.notification.tag);
});