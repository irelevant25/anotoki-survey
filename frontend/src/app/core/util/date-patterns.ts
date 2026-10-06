import { type AnotokiDateFormat, type AnotokiPreferences, type AnotokiTimeFormat } from '../auth/anotoki-auth';

/**
 * The account's date order and clock (IAM migration 015) - the anotoki
 * family's one vocabulary, the same as the IAM's own pages
 * (../anotoki-iam: frontend/src/app/core/i18n/date-patterns.ts): a date
 * written in a fixed order of numbers, and the clock with or without am/pm.
 * "Automatic" (null) is the page language's own way, which the callers keep -
 * what this site wrote before the account had a say.
 */

/** What a page needs of the account's preferences to write a date: null while it has none (nobody signed in, an IAM from before 015). */
export type DateChoices = Pick<AnotokiPreferences, 'date_format' | 'time_format'> | null;

/** A date in one of the fixed orders, in the browser's time zone: 6.10.2026, 06/10/2026, 10/06/2026, 2026-10-06. */
export function formatDatePattern(date: Date, format: AnotokiDateFormat): string {
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const pad = (value: number): string => String(value).padStart(2, '0');

  switch (format) {
    case 'dmy_dot':
      return `${day}.${month}.${year}`;
    case 'dmy_slash':
      return `${pad(day)}/${pad(month)}/${year}`;
    case 'mdy_slash':
      return `${pad(month)}/${pad(day)}/${year}`;
    case 'ymd_dash':
      return `${year}-${pad(month)}-${pad(day)}`;
  }
}

const CLOCKS = new Map<string, Intl.DateTimeFormat>();

/** The time of day on the chosen clock, in the page language's words for am and pm: 14:30, or 2:30 pm. */
export function formatClock(date: Date, locale: string, clock: AnotokiTimeFormat): string {
  const key = `${locale}|${clock}`;
  let format = CLOCKS.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, clock === '12' ? { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' } : { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    CLOCKS.set(key, format);
  }
  return format.format(date);
}
