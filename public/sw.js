const CACHE_NAME = 'claude-cooldown-v4';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './badge-icon.png'
];

// NOTE: this used to run a second, independent notification loop (polling a
// local cache every 5s and calling showNotification itself), duplicating
// exactly what the real Web Push from the server already does. Having two
// systems fire the same checkpoint caused inconsistent-looking notifications
// (a race between this local one, sometimes firing before the icon assets
// were cached, and the real push arriving with the icon already loaded).
// The server-side push (see the 'push' event handler below) is now the
// single source of truth for background notifications, so this is a no-op.
function startBackgroundTicking() {}

// Display native browser notification
async function showNotification(title, body, tag) {
  const options = {
    body,
    icon: './icon-192.png',
    badge: './badge-icon.png',
    tag,
    vibrate: [200, 100, 200],
    data: {
      url: self.registration.scope
    }
  };
  return self.registration.showNotification(title, options);
}

// Install event - caching basic assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use allSettled instead of addAll: addAll fails the WHOLE install
      // if even one asset 404s or times out (common on flaky mobile
      // networks), which leaves the SW stuck installing forever and makes
      // navigator.serviceWorker.ready() (used by push subscribe) hang
      // indefinitely. Caching each asset independently means a single
      // failure doesn't block activation.
      return Promise.allSettled(
        ASSETS.map((asset) =>
          cache.add(asset).catch((err) => {
            console.warn('Falha ao cachear asset (ignorado):', asset, err);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
  startBackgroundTicking();
});

// Activate event - cleaning old caches and reclaiming clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
  startBackgroundTicking();
});

// Fetch event - serving assets from network first (to prevent stale bundle issues on dynamic builds), falling back to cache
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // Don't intercept internal data sync, Vite dev server, or HMR sockets/files
  if (
    event.request.url.includes('/api/cooldown-data') ||
    event.request.url.includes('/@vite') ||
    event.request.url.includes('hot-update') ||
    event.request.url.includes('node_modules') ||
    event.request.url.includes('/@fs') ||
    event.request.url.includes('ws://') ||
    event.request.url.includes('wss://')
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // If successful and it's a basic standard request, cache the new copy and return it
        if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        // Fall back to cache if offline
        return caches.match(event.request);
      })
  );
  startBackgroundTicking();
});

// Sync data event from React App
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_DATA') {
    startBackgroundTicking();
  }
});

// Handle real Web Push messages sent by the backend server (works even with
// the app fully closed, since the OS wakes the service worker for this).
self.addEventListener('push', (event) => {
  let payload = { title: 'Claude Cooldown', body: '' };
  try {
    if (event.data) payload = event.data.json();
  } catch (e) {
    if (event.data) payload.body = event.data.text();
  }

  const options = {
    body: payload.body || '',
    icon: './icon-192.png',
    badge: './badge-icon.png',
    tag: payload.tag || 'claude-cooldown-push',
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: self.registration.scope }
  };

  event.waitUntil(self.registration.showNotification(payload.title || 'Claude Cooldown', options));
});

// Handle clicking on notifications
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList && clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
            break;
          }
        }
        return client.focus();
      }
      return self.clients.openWindow(self.registration.scope);
    })
  );
});