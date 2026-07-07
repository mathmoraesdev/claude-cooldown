import { NotificationSettings } from '../types';

// Web Audio API Synthesized UI Sounds
class AudioSynthesizer {
  private ctx: AudioContext | null = null;

  private initCtx() {
    if (!this.ctx) {
      // Standard cross-browser compatibility
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /**
   * Plays a professional, clean notification sound (soft pleasant double chime)
   */
  public playDoubleChime() {
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      
      // Chime 1
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now); // C5
      osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
      
      gain1.gain.setValueAtTime(0, now);
      gain1.gain.linearRampToValueAtTime(0.15, now + 0.05);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.4);

      // Chime 2 (slightly offset)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + 0.12); // E5
      osc2.frequency.exponentialRampToValueAtTime(1046.50, now + 0.27); // C6
      
      gain2.gain.setValueAtTime(0, now + 0.12);
      gain2.gain.linearRampToValueAtTime(0.15, now + 0.17);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.52);
      
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.52);

    } catch (e) {
      console.warn('Audio play blocked or unsupported:', e);
    }
  }

  /**
   * Plays a gentle warning sound (for 30m, 10m, 5m, 1m intervals)
   */
  public playWarningChime() {
    try {
      this.initCtx();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now); // A4
      osc.frequency.exponentialRampToValueAtTime(554.37, now + 0.1); // C#5
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.1, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    } catch (e) {
      console.warn('Audio play blocked or unsupported:', e);
    }
  }
}

export const audioService = new AudioSynthesizer();

/**
 * Handles Web Notification API permission requesting, state checking, and dispatching.
 */
class WebNotificationService {
  /**
   * Check if notifications are supported by the browser.
   */
  public isSupported(): boolean {
    return 'Notification' in window;
  }

  /**
   * Check if permission is currently granted.
   */
  public getPermissionStatus(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  }

  /**
   * Request user permission for notifications.
   */
  public async requestPermission(): Promise<boolean> {
    if (!this.isSupported()) return false;
    
    try {
      const permission = await Notification.requestPermission();
      return permission === 'granted';
    } catch (e) {
      console.error('Error requesting notification permission:', e);
      return false;
    }
  }

  /**
   * Sends an instant browser notification (if permission is granted)
   */
  public async sendNotification(title: string, body: string, playSound: boolean = true) {
    // Dispatch in-app toast event first for a fast, beautiful visual response
    if (typeof window !== 'undefined') {
      const toastType = (title.includes('Disponível') || title.includes('liberada'))
        ? 'success'
        : (title.includes('Restante') || title.includes('Restantes'))
          ? 'warning'
          : 'info';

      const event = new CustomEvent('claude-cooldown-toast', {
        detail: { title, body, type: toastType }
      });
      window.dispatchEvent(event);
    }

    if (this.isSupported() && Notification.permission === 'granted') {
      const options: any = {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag: 'claude-cooldown-alert',
        renotify: true,
        vibrate: [200, 100, 200],
      };

      try {
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.ready;
          if (registration) {
            await registration.showNotification(title, options);
          } else {
            new Notification(title, options);
          }
        } else {
          new Notification(title, options);
        }
      } catch (e) {
        console.warn('Notification construction failed, trying simple constructor...', e);
        try {
          const notification = new Notification(title, {
            body,
            icon: '/icon-192.png',
            tag: 'claude-cooldown-' + Date.now(),
          });
          notification.onclick = () => {
            window.focus();
          };
        } catch (err) {
          console.error('All notification methods failed:', err);
        }
      }
    }

    if (playSound) {
      // Play our synthesized audio
      if (title.toLowerCase().includes('liberado') || title.toLowerCase().includes('disponível')) {
        audioService.playDoubleChime();
      } else {
        audioService.playWarningChime();
      }
    }
  }

  /**
   * Helper to evaluate and trigger alerts for accounts based on time left.
   * This handles checking which warning milestones have been passed.
   * To prevent duplicate alerts, we track already-triggered checkpoints.
   * 
   * @param accountEmail The email of the Claude account
   * @param remainingSeconds The current seconds left in the cooldown
   * @param triggeredCheckpoints Set of triggered checkpoints for this cooldown period (e.g., '30m', '10m', etc.)
   * @param settings Notification preferences
   * @returns The checkpoint name triggered, or null
   */
  public evaluateAndNotify(
    accountEmail: string,
    remainingSeconds: number,
    triggeredCheckpoints: string[],
    settings: NotificationSettings
  ): '30m' | '10m' | '5m' | '1m' | 'exact' | null {
    if (!settings.enabled) return null;

    // exact/0m threshold: trigger when remainingSeconds <= 0
    if (remainingSeconds <= 0) {
      if (settings.notifyAtExact && !triggeredCheckpoints.includes('exact')) {
        this.sendNotification(
          '🟢 Claude Disponível!',
          `A conta ${accountEmail} foi liberada. Você já pode enviar novas mensagens!`,
          settings.sound
        );
        return 'exact';
      }
      return null;
    }

    // 1 minute (60 seconds) threshold
    if (remainingSeconds <= 60 && remainingSeconds > 45) {
      if (settings.notifyAt1m && !triggeredCheckpoints.includes('1m')) {
        this.sendNotification(
          '⏳ 1 Minuto Restante',
          `A conta ${accountEmail} será liberada em 1 minuto. Prepare seu prompt!`,
          settings.sound
        );
        return '1m';
      }
    }

    // 5 minutes (300 seconds) threshold
    if (remainingSeconds <= 300 && remainingSeconds > 280) {
      if (settings.notifyAt5m && !triggeredCheckpoints.includes('5m')) {
        this.sendNotification(
          '⏳ 5 Minutos Restantes',
          `A conta ${accountEmail} será liberada em 5 minutos.`,
          settings.sound
        );
        return '5m';
      }
    }

    // 10 minutes (600 seconds) threshold
    if (remainingSeconds <= 600 && remainingSeconds > 580) {
      if (settings.notifyAt10m && !triggeredCheckpoints.includes('10m')) {
        this.sendNotification(
          '⏳ 10 Minutos Restantes',
          `A conta ${accountEmail} será liberada em 10 minutos.`,
          settings.sound
        );
        return '10m';
      }
    }

    // 30 minutes (1800 seconds) threshold
    if (remainingSeconds <= 1800 && remainingSeconds > 1780) {
      if (settings.notifyAt30m && !triggeredCheckpoints.includes('30m')) {
        this.sendNotification(
          '⏳ 30 Minutos Restantes',
          `A conta ${accountEmail} será liberada em 30 minutos.`,
          settings.sound
        );
        return '30m';
      }
    }

    return null;
  }

  /**
   * Schedule future notifications using the Web Notification Triggers API (if supported)
   */
  public async scheduleAllNotificationsForAccounts(accounts: any[], settings: NotificationSettings) {
    if (!this.isSupported() || Notification.permission !== 'granted' || !('serviceWorker' in navigator)) {
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      if (!registration) return;

      accounts.forEach((account) => {
        if (!account.availableAt) return;

        const availableTime = new Date(account.availableAt).getTime();
        const nowTime = Date.now();

        if (availableTime <= nowTime) return; // Already passed

        // Exact notification
        if (settings.enabled && settings.notifyAtExact) {
          this.scheduleSingleTrigger(
            registration,
            `claude-cooldown-${account.id}-exact`,
            '🟢 Claude Disponível!',
            `A conta ${account.email} foi liberada. Você já pode enviar novas mensagens!`,
            availableTime
          );
        }

        // 1m warning (60s)
        if (settings.enabled && settings.notifyAt1m) {
          const triggerTime = availableTime - 60 * 1000;
          if (triggerTime > nowTime) {
            this.scheduleSingleTrigger(
              registration,
              `claude-cooldown-${account.id}-1m`,
              '⏳ 1 Minuto Restante',
              `A conta ${account.email} será liberada em 1 minuto. Prepare seu prompt!`,
              triggerTime
            );
          }
        }

        // 5m warning
        if (settings.enabled && settings.notifyAt5m) {
          const triggerTime = availableTime - 5 * 60 * 1000;
          if (triggerTime > nowTime) {
            this.scheduleSingleTrigger(
              registration,
              `claude-cooldown-${account.id}-5m`,
              '⏳ 5 Minutos Restantes',
              `A conta ${account.email} será liberada em 5 minutos.`,
              triggerTime
            );
          }
        }

        // 10m warning
        if (settings.enabled && settings.notifyAt10m) {
          const triggerTime = availableTime - 10 * 60 * 1000;
          if (triggerTime > nowTime) {
            this.scheduleSingleTrigger(
              registration,
              `claude-cooldown-${account.id}-10m`,
              '⏳ 10 Minutos Restantes',
              `A conta ${account.email} será liberada em 10 minutos.`,
              triggerTime
            );
          }
        }

        // 30m warning
        if (settings.enabled && settings.notifyAt30m) {
          const triggerTime = availableTime - 30 * 60 * 1000;
          if (triggerTime > nowTime) {
            this.scheduleSingleTrigger(
              registration,
              `claude-cooldown-${account.id}-30m`,
              '⏳ 30 Minutos Restantes',
              `A conta ${account.email} será liberada em 30 minutos.`,
              triggerTime
            );
          }
        }
      });
    } catch (e) {
      console.warn('Failed to schedule triggers:', e);
    }
  }

  private scheduleSingleTrigger(
    registration: ServiceWorkerRegistration,
    tag: string,
    title: string,
    body: string,
    timestamp: number
  ) {
    try {
      const options: any = {
        body,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        tag,
        vibrate: [200, 100, 200],
      };

      // If Notification Triggers are supported
      if ('showTrigger' in Notification.prototype && (window as any).TimestampTrigger) {
        options.showTrigger = new (window as any).TimestampTrigger(timestamp);
      }

      // Only show if Notification Triggers is supported, because otherwise it fires instantly!
      if ('showTrigger' in Notification.prototype && (window as any).TimestampTrigger) {
        registration.showNotification(title, options);
      }
    } catch (err) {
      console.warn('Error scheduling single trigger:', err);
    }
  }

  /**
   * Cancel scheduled triggers for an account
   */
  public async clearScheduledNotificationsForAccount(accountId: string) {
    if (!this.isSupported() || !('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.ready;
      if (!registration) return;

      const tags = ['exact', '1m', '5m', '10m', '30m'].map(suffix => `claude-cooldown-${accountId}-${suffix}`);
      for (const tag of tags) {
        const notifications = await registration.getNotifications({ tag });
        notifications.forEach((notification) => notification.close());
      }
    } catch (e) {
      console.warn('Error clearing scheduled notifications:', e);
    }
  }
}

export const notificationService = new WebNotificationService();
