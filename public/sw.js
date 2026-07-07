const CACHE_NAME = 'claude-cooldown-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

let checkInterval = null;

// Start background check loop to evaluate cooldown times and trigger notifications when closed
function startBackgroundTicking() {
  if (checkInterval) return;

  checkInterval = setInterval(async () => {
    try {
      const cache = await caches.open('claude-cooldown-data');
      const response = await cache.match('/api/cooldown-data');
      if (!response) return;

      const data = await response.json();
      const { accounts, settings, checkpoints } = data;

      if (!settings || !settings.enabled || !accounts || accounts.length === 0) return;

      let changed = false;
      const now = Date.now();

      for (const account of accounts) {
        if (!account.availableAt) continue;

        const availableTime = new Date(account.availableAt).getTime();
        const totalSeconds = Math.max(0, Math.ceil((availableTime - now) / 1000));
        
        const accountCheckpoints = checkpoints[account.id] || [];

        // 1. Check exact trigger (released!)
        if (totalSeconds === 0 && !accountCheckpoints.includes('exact')) {
          if (settings.notifyAtExact) {
            await showNotification(
              '🟢 Claude Disponível!',
              `A conta ${account.email} foi liberada. Você já pode enviar novas mensagens!`,
              `claude-cooldown-${account.id}-exact`
            );
          }
          accountCheckpoints.push('exact');
          checkpoints[account.id] = accountCheckpoints;
          changed = true;
        }

        // 2. Check 1m warning (60s)
        if (totalSeconds > 0 && totalSeconds <= 60 && !accountCheckpoints.includes('1m')) {
          if (settings.notifyAt1m) {
            await showNotification(
              '⏳ 1 Minuto Restante',
              `A conta ${account.email} será liberada em 1 minuto. Prepare seu prompt!`,
              `claude-cooldown-${account.id}-1m`
            );
          }
          accountCheckpoints.push('1m');
          checkpoints[account.id] = accountCheckpoints;
          changed = true;
        }

        // 3. Check 5m warning (300s)
        if (totalSeconds > 0 && totalSeconds <= 300 && totalSeconds > 240 && !accountCheckpoints.includes('5m')) {
          if (settings.notifyAt5m) {
            await showNotification(
              '⏳ 5 Minutos Restantes',
              `A conta ${account.email} será liberada em 5 minutos.`,
              `claude-cooldown-${account.id}-5m`
            );
          }
          accountCheckpoints.push('5m');
          checkpoints[account.id] = accountCheckpoints;
          changed = true;
        }

        // 4. Check 10m warning (600s)
        if (totalSeconds > 0 && totalSeconds <= 600 && totalSeconds > 540 && !accountCheckpoints.includes('10m')) {
          if (settings.notifyAt10m) {
            await showNotification(
              '⏳ 10 Minutos Restantes',
              `A conta ${account.email} será liberada em 10 minutos.`,
              `claude-cooldown-${account.id}-10m`
            );
          }
          accountCheckpoints.push('10m');
          checkpoints[account.id] = accountCheckpoints;
          changed = true;
        }

        // 5. Check 30m warning (1800s)
        if (totalSeconds > 0 && totalSeconds <= 1800 && totalSeconds > 1740 && !accountCheckpoints.includes('30m')) {
          if (settings.notifyAt30m) {
            await showNotification(
              '⏳ 30 Minutos Restantes',
              `A conta ${account.email} será liberada em 30 minutos.`,
              `claude-cooldown-${account.id}-30m`
            );
          }
          accountCheckpoints.push('30m');
          checkpoints[account.id] = accountCheckpoints;
          changed = true;
        }
      }

      if (changed) {
        // Save back to cache
        await cache.put(
          '/api/cooldown-data',
          new Response(JSON.stringify({ accounts, settings, checkpoints }), {
            headers: { 'Content-Type': 'application/json' }
          })
        );

        // Notify active React clients to sync checkpoints
        const clients = await self.clients.matchAll();
        clients.forEach((client) => {
          client.postMessage({
            type: 'CHECKPOINTS_UPDATED',
            checkpoints
          });
        });
      }
    } catch (e) {
      console.error('Error in background ticking:', e);
    }
  }, 5000);
}

// Display native browser notification
async function showNotification(title, body, tag) {
  const options = {
    body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag,
    vibrate: [200, 100, 200],
    data: {
      url: '/'
    }
  };
  return self.registration.showNotification(title, options);
}

// Install event - caching basic assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
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
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: payload.tag || 'claude-cooldown-push',
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: '/' }
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
      return self.clients.openWindow('/');
    })
  );
});
