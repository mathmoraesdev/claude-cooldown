import { Account, NotificationSettings } from '../types';

const ACCOUNTS_KEY = 'claude_cooldown_accounts';
const SETTINGS_KEY = 'claude_cooldown_settings';
const TRIGGERED_CHECKPOINTS_KEY = 'claude_cooldown_triggered_checkpoints';

const DEFAULT_ACCOUNTS: Account[] = [
  {
    id: '1',
    email: 'claude.pessoal@gmail.com',
    availableAt: null,
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    email: 'claude.trabalho@outlook.com',
    availableAt: null,
    createdAt: new Date().toISOString(),
  }
];

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  sound: true,
  notifyAt30m: true,
  notifyAt10m: true,
  notifyAt5m: true,
  notifyAt1m: true,
  notifyAtExact: true,
};

export const storageService = {
  /**
   * Fetch all accounts, seeding defaults on first load.
   */
  getAccounts(): Account[] {
    try {
      const data = localStorage.getItem(ACCOUNTS_KEY);
      if (!data) {
        this.saveAccounts(DEFAULT_ACCOUNTS);
        return DEFAULT_ACCOUNTS;
      }
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to parse accounts from storage, reverting to default:', e);
      return DEFAULT_ACCOUNTS;
    }
  },

  /**
   * Save all accounts.
   */
  saveAccounts(accounts: Account[]) {
    try {
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
      this.syncToCache();
    } catch (e) {
      console.error('Failed to save accounts to storage:', e);
    }
  },

  /**
   * Fetch notification settings.
   */
  getSettings(): NotificationSettings {
    try {
      const data = localStorage.getItem(SETTINGS_KEY);
      if (!data) {
        this.saveSettings(DEFAULT_SETTINGS);
        return DEFAULT_SETTINGS;
      }
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to parse settings, reverting to default:', e);
      return DEFAULT_SETTINGS;
    }
  },

  /**
   * Save notification settings.
   */
  saveSettings(settings: NotificationSettings) {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      this.syncToCache();
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  },

  /**
   * Get already triggered checkpoints to prevent duplicates on refresh.
   */
  getTriggeredCheckpoints(): Record<string, string[]> {
    try {
      const data = localStorage.getItem(TRIGGERED_CHECKPOINTS_KEY);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  },

  /**
   * Save triggered checkpoints.
   */
  saveTriggeredCheckpoints(checkpoints: Record<string, string[]>) {
    try {
      localStorage.setItem(TRIGGERED_CHECKPOINTS_KEY, JSON.stringify(checkpoints));
      this.syncToCache();
    } catch (e) {
      console.error('Failed to save triggered checkpoints:', e);
    }
  },

  /**
   * Sync active accounts, settings, and checkpoints to Cache Storage so the Service Worker can access them offline/background
   */
  async syncToCache() {
    try {
      if ('caches' in window) {
        const accounts = this.getAccounts();
        const settings = this.getSettings();
        const checkpoints = this.getTriggeredCheckpoints();

        const cache = await caches.open('claude-cooldown-data');
        await cache.put(
          '/api/cooldown-data',
          new Response(JSON.stringify({ accounts, settings, checkpoints }), {
            headers: { 'Content-Type': 'application/json' }
          })
        );

        // Also notify service worker of the update if available
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'SYNC_DATA' });
        }
      }
    } catch (e) {
      console.warn('Failed to sync to cache storage:', e);
    }
  },
};
