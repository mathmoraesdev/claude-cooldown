/**
 * Intelligent parsing algorithm to find the best future date based on user's simple time input.
 * Handles:
 * - 24h format (e.g. "18:42", "06:30")
 * - 12h format with AM/PM (e.g. "6:42 PM", "10:30 am")
 * - Smart 12h format without AM/PM (e.g. "6:42", "2:15") - automatically selects closest future candidate.
 */
export function parseTimeString(timeStr: string, baseDate: Date = new Date()): Date | null {
  const cleanStr = timeStr.trim().toLowerCase();
  if (!cleanStr) return null;

  // Regex for 12h with AM/PM: e.g. "6:42 PM", "10:30 am", "08.15pm"
  const match12 = cleanStr.match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)$/);
  if (match12) {
    let hour = parseInt(match12[1], 10);
    const minute = parseInt(match12[2], 10);
    const isPm = match12[3] === 'pm';

    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

    if (isPm && hour < 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;

    // We still evaluate if today or tomorrow is closer
    return getClosestFutureDate(hour, minute, baseDate);
  }

  // Regex for standard 24h or simple hours/minutes: e.g. "18:42", "6:42", "2"
  // Let's support formats like "18:42", "6:42", or even just a single hour "18" or "6" if typed.
  const match24 = cleanStr.match(/^(\d{1,2})(?:[:.](\d{2}))?$/);
  if (match24) {
    const hour = parseInt(match24[1], 10);
    const minute = match24[2] ? parseInt(match24[2], 10) : 0;

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

    // Since AM/PM was not provided, we test both:
    // 1. hour as-is (could be 24h format or AM)
    // 2. hour + 12 (if hour < 12, treating it as PM)
    const candidates: Date[] = [];

    // Candidate 1: hour as-is today
    const c1 = createDateWithTime(baseDate, hour, minute);
    candidates.push(c1);

    // Candidate 2: hour as-is tomorrow
    const c2 = new Date(c1);
    c2.setDate(c2.getDate() + 1);
    candidates.push(c2);

    if (hour < 12) {
      // Candidate 3: PM today
      const c3 = createDateWithTime(baseDate, hour + 12, minute);
      candidates.push(c3);

      // Candidate 4: PM tomorrow
      const c4 = new Date(c3);
      c4.setDate(c4.getDate() + 1);
      candidates.push(c4);
    }

    // Filter to only future candidates (or within 1 minute of past, to avoid strict boundary issues)
    const nowTime = baseDate.getTime() - 30 * 1000; // 30s grace period
    const futureCandidates = candidates.filter(c => c.getTime() > nowTime);

    if (futureCandidates.length === 0) return null;

    // Sort by chronological order
    futureCandidates.sort((a, b) => a.getTime() - b.getTime());
    return futureCandidates[0];
  }

  return null;
}

function createDateWithTime(base: Date, hour: number, minute: number): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function getClosestFutureDate(hour: number, minute: number, baseDate: Date): Date {
  const today = createDateWithTime(baseDate, hour, minute);
  if (today.getTime() > baseDate.getTime() - 30 * 1000) {
    return today;
  }
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return tomorrow;
}

/**
 * Format the time to local HH:MM (and optionally AM/PM if 12h is preferred, but let's default to standard clean 24h format with a customizable display).
 */
export function formatLocalTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatFullDateTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * Calculate countdown format. Returns a structural countdown representing hours, minutes, and seconds.
 */
export interface CountdownState {
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  formatted: string;
  isOver: boolean;
}

export function getCountdownState(availableAtStr: string | null, now: Date = new Date()): CountdownState {
  if (!availableAtStr) {
    return { hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, formatted: 'Disponível', isOver: true };
  }

  const availableAt = new Date(availableAtStr).getTime();
  const diff = availableAt - now.getTime();

  if (diff <= 0) {
    return { hours: 0, minutes: 0, seconds: 0, totalSeconds: 0, formatted: '00:00:00', isOver: true };
  }

  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hStr = hours.toString().padStart(2, '0');
  const mStr = minutes.toString().padStart(2, '0');
  const sStr = seconds.toString().padStart(2, '0');

  const formatted = hours > 0 ? `${hStr}:${mStr}:${sStr}` : `${mStr}:${sStr}`;

  return {
    hours,
    minutes,
    seconds,
    totalSeconds,
    formatted,
    isOver: false,
  };
}

/**
 * Calculates progress percentage from 0 (at start/createdAt) to 100 (when fully available/availableAt).
 */
export function getCooldownProgress(createdAtStr: string, availableAtStr: string | null, now: Date = new Date()): number {
  if (!availableAtStr) return 100;

  const start = new Date(createdAtStr).getTime();
  const end = new Date(availableAtStr).getTime();
  const current = now.getTime();

  const total = end - start;
  if (total <= 0) return 100;

  const elapsed = current - start;
  const progress = (elapsed / total) * 100;

  return Math.min(Math.max(progress, 0), 100);
}
