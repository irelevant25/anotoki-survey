/**
 * Dates and times in words, for an English page: "29 Sept 2026", "3 hours
 * ago", "4 min 20 s". British order (day, month, year) - the order the owner
 * reads, and unambiguous where "9/10" would not be.
 */

const LOCALE = 'en-GB';
const DATE = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const LONG_DATE = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE.format(date);
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : DATE_TIME.format(date);
}

/** A calendar day (YYYY-MM-DD) in full: "20 October 2026". */
export function formatDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number);
  const value = new Date(year, (month ?? 1) - 1, date ?? 1, 12);
  return Number.isNaN(value.getTime()) ? day : LONG_DATE.format(value);
}

/** "just now", "5 minutes ago", "yesterday", "4 days ago" - then the date. */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((now - Date.parse(iso)) / 1000);
  if (!Number.isFinite(seconds)) {
    return iso;
  }
  if (seconds < 60) {
    return 'just now';
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) {
    return minutes === 1 ? 'a minute ago' : `${minutes} minutes ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  }
  const days = Math.round(hours / 24);
  if (days < 2) {
    return 'yesterday';
  }
  return days < 14 ? `${days} days ago` : formatDate(iso);
}

/** "45 s", "4 min 20 s", "1 h 5 min". */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.round(totalSeconds));
  if (seconds < 60) {
    return `${seconds} s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const rest = seconds % 60;
    return rest ? `${minutes} min ${rest} s` : `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

/** Today as YYYY-MM-DD in the reader's time zone - the value of an `<input type="date">`. */
export function todayIsoDay(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
