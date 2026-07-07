import { Account, NotificationSettings } from '../types';

const SERVER_URL_KEY = 'claude_cooldown_push_server_url';
const ENDPOINT_KEY = 'claude_cooldown_push_endpoint';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// Render's free tier puts the server to sleep after inactivity; the first
// request after that can take 30-60s to wake it up. Give it real room, but
// don't let a truly dead server hang the UI forever.
async function fetchWithTimeout(url: string, options?: RequestInit, timeoutMs = 45000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e: any) {
    if (e.name === 'AbortError') {
      throw new Error('O servidor demorou demais para responder (pode estar "dormindo", tente de novo em instantes).');
    }
    throw e;
  } finally {
    clearTimeout(id);
  }
}

class PushService {
  isSupported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window;
  }

  getServerUrl(): string | null {
    return localStorage.getItem(SERVER_URL_KEY);
  }

  private setServerUrl(url: string) {
    localStorage.setItem(SERVER_URL_KEY, url.trim().replace(/\/+$/, ''));
  }

  isSubscribed(): boolean {
    return !!localStorage.getItem(ENDPOINT_KEY) && !!this.getServerUrl();
  }

  /**
   * Requests permission, subscribes this device to the backend's Web Push service,
   * and registers the subscription with the server.
   */
  async subscribe(serverUrl: string): Promise<{ ok: boolean; error?: string }> {
    if (!this.isSupported()) {
      return { ok: false, error: 'Este navegador não suporta notificações push.' };
    }

    const cleanUrl = serverUrl.trim().replace(/\/+$/, '');
    if (!cleanUrl) return { ok: false, error: 'Informe o endereço do servidor.' };

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        return { ok: false, error: 'Permissão de notificação negada.' };
      }

      const keyRes = await fetchWithTimeout(`${cleanUrl}/api/vapid-public-key`);
      if (!keyRes.ok) throw new Error('Não foi possível contatar o servidor.');
      const { publicKey } = await keyRes.json();

      // navigator.serviceWorker.ready never resolves if the service worker
      // failed to install/activate (e.g. a precache asset failed to load on
      // a flaky mobile connection). Race it against a timeout so the button
      // shows a real error instead of spinning forever.
      const registration = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('O service worker demorou demais para ficar pronto. Feche o app, abra de novo e tente ativar novamente.')), 10000)
        ),
      ]);

      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
      }

      const subRes = await fetchWithTimeout(`${cleanUrl}/api/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
      if (!subRes.ok) throw new Error('Servidor recusou a inscrição.');

      this.setServerUrl(cleanUrl);
      localStorage.setItem(ENDPOINT_KEY, subscription.endpoint);

      return { ok: true };
    } catch (e: any) {
      console.error('Falha ao assinar push:', e);
      return { ok: false, error: e?.message || 'Falha ao ativar notificações do servidor.' };
    }
  }

  async unsubscribe(): Promise<void> {
    try {
      const serverUrl = this.getServerUrl();
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        if (serverUrl) {
          await fetch(`${serverUrl}/api/unsubscribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: subscription.endpoint }),
          }).catch(() => {});
        }
        await subscription.unsubscribe();
      }
    } catch (e) {
      console.warn('Erro ao desativar push:', e);
    } finally {
      localStorage.removeItem(ENDPOINT_KEY);
    }
  }

  /**
   * Sends the current accounts + settings to the server so it can decide when to push.
   * No-ops silently if not subscribed.
   */
  async syncAccounts(accounts: Account[], settings: NotificationSettings): Promise<void> {
    const serverUrl = this.getServerUrl();
    const endpoint = localStorage.getItem(ENDPOINT_KEY);
    if (!serverUrl || !endpoint) return;

    try {
      await fetch(`${serverUrl}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint, accounts, settings }),
      });
    } catch (e) {
      console.warn('Falha ao sincronizar com o servidor de push:', e);
    }
  }

  async sendTestNotification(): Promise<{ ok: boolean; error?: string }> {
    const serverUrl = this.getServerUrl();
    const endpoint = localStorage.getItem(ENDPOINT_KEY);
    if (!serverUrl || !endpoint) return { ok: false, error: 'Não inscrito.' };

    try {
      const res = await fetch(`${serverUrl}/api/test-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
      if (!res.ok) throw new Error('Servidor retornou erro.');
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Falha no teste.' };
    }
  }
}

export const pushService = new PushService();
