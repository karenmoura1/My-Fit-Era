/* sw/service-worker.js
   Service Worker do My Fit Era — gerencia notificações push e cache offline */

const CACHE_NAME = 'myfitera-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/db.js',
  '/js/ui.js',
  '/js/charts.js',
  '/js/notifications.js',
  '/js/app.js'
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

/* ===== RECEBER PUSH DO SERVIDOR (opcional, para push real) ===== */
self.addEventListener('push', event => {
  const data = event.data?.json() ?? {};
  const title = data.title || '🏋️ My Fit Era';
  const options = {
    body: data.body || 'Hora de registrar seus hábitos!',
    icon: data.icon || '/icon-192.png',
    badge: '/badge-72.png',
    tag: data.tag || 'myfitera-default',
    data: { url: data.url || '/' },
    actions: data.actions || [
      { action: 'open', title: 'Abrir app' },
      { action: 'dismiss', title: 'Dispensar' }
    ]
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

/* ===== NOTIFICAÇÃO LOCAL AGENDADA ===== */
/* Recebe mensagem do app para disparar notificação imediata */
self.addEventListener('message', event => {
  if (event.data?.type === 'SHOW_NOTIFICATION') {
    const { title, body, tag, icon } = event.data;
    self.registration.showNotification(title || '🏋️ My Fit Era', {
      body: body || 'Lembrete do My Fit Era',
      icon: icon || '/icon-192.png',
      badge: '/badge-72.png',
      tag: tag || 'myfitera-local',
      data: { url: '/' }
    });
  }
});

/* ===== CLIQUE NA NOTIFICAÇÃO ===== */
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'dismiss') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
      /* Se já tem uma janela aberta, foca nela */
      for (const client of windowClients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      /* Senão abre uma nova */
      if (clients.openWindow) return clients.openWindow(targetUrl);
    })
  );
});

/* ===== FECHAR NOTIFICAÇÃO ===== */
self.addEventListener('notificationclose', event => {
  /* Pode ser usado para analytics futuramente */
  console.log('[SW] Notificação fechada:', event.notification.tag);
});