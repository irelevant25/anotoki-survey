import { type AnotokiDateChoices } from '@anotoki/lib/ui/config';
import { formatDate as writeDate, formatDateTime as writeDateTime, formatRelative } from '@anotoki/lib/ui/dates';

/**
 * Dates and times in words, for an English page - the admin panel's: "29 Sept
 * 2026", "3 hours ago", "4 min 20 s". British order (day, month, year) - the
 * order the owner reads, and unambiguous where "9/10" would not be.
 *
 * Written by the anotoki family's dates (anotoki-lib 0.11.0,
 * @anotoki/lib/ui/dates) in British English, whatever the page's language
 * (the admin panel is English): the site's own formatting is gone. The admin
 * panel passes the signed-in person's own date order and clock (`chosen`,
 * their anotoki account's - every anotoki site follows them; IAM migration
 * 015) through AdminDates: a date chosen is written in that order
 * ("29.9.2026"), a time on that clock ("2:30 pm"), and a date with its time is
 * the two side by side when either is chosen. Null - nothing chosen, nobody
 * signed in - is the British English above.
 */

/** The admin panel's English: day, month, year. */
const ENGLISH = 'en-GB';

/** A moment's day, "29 Sept 2026" - or in the order chosen. */
export function formatDate(iso: string, chosen: AnotokiDateChoices | null = null): string {
  return writeDate(iso, { locale: ENGLISH, choices: chosen });
}

/** A moment, "29 Sept 2026, 14:30" - or the date and the time as chosen, side by side. */
export function formatDateTime(iso: string, chosen: AnotokiDateChoices | null = null): string {
  return writeDateTime(iso, { locale: ENGLISH, choices: chosen });
}

/** A calendar day (YYYY-MM-DD) in full: "20 October 2026" - or in the order chosen. That day wherever the reader is. */
export function formatDay(day: string, chosen: AnotokiDateChoices | null = null): string {
  return writeDate(day, { locale: ENGLISH, choices: chosen }, 'long');
}

/**
 * "just now", "5 minutes ago", "yesterday", "4 days ago" - then, from two
 * weeks of calendar days on, the date (in the order chosen, when one is). The
 * family's count: minutes and hours rounded down, then calendar days by the
 * reader's clock - Monday evening is "yesterday" all Tuesday and "2 days ago"
 * all Wednesday, however many hours that is.
 */
export function timeAgo(iso: string, now = Date.now(), chosen: AnotokiDateChoices | null = null): string {
  return formatRelative(iso, { locale: ENGLISH, choices: chosen, now, dateAfter: 14 });
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
