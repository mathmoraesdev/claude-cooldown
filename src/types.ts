export interface Account {
  id: string;
  email: string;
  availableAt: string | null; // ISO Date String, null if active/ready
  createdAt: string; // ISO Date String
}

export interface NotificationLog {
  id: string;
  accountId: string;
  accountEmail: string;
  type: '30m' | '10m' | '5m' | '1m' | 'exact';
  triggeredAt: string; // ISO Date String
}

export interface NotificationSettings {
  enabled: boolean;
  sound: boolean;
  notifyAt30m: boolean;
  notifyAt10m: boolean;
  notifyAt5m: boolean;
  notifyAt1m: boolean;
  notifyAtExact: boolean;
}
