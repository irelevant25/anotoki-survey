import { type DateChoices, formatClock, formatDatePattern } from './date-patterns';

/**
 * Dates and times in words, for an English page: "29 Sept 2026", "3 hours
 * ago", "4 min 20 s". British order (day, month, year) - the order the owner
 * reads, and unambiguous where "9/10" would not be.
 *
 * The admin panel passes the signed-in person's own date order and clock
 * (`chosen`, their anotoki account's - every anotoki site follows them; IAM
 * migration 015) through AdminDates: a date chosen is written in that order
 * ("29.9.2026"), a time on that clock ("2:30 pm"), and a date with its time is
 * the two side by side when either is chosen. Null - nothing chosen, nobody
 * signed in - is the British English above.
 */

const LOCALE = 'en-GB';
const DATE = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' });
const LONG_DATE = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const TIME = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });

export function formatDate(iso: string, chosen: DateChoices = null): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : dayOf(date, chosen);
}

export function formatDateTime(iso: string, chosen: DateChoices = null): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return chosen?.date_format || chosen?.time_format ? `${dayOf(date, chosen)} ${timeOf(date, chosen)}` : DATE_TIME.format(date);
}

/** A calendar day (YYYY-MM-DD) in full: "20 October 2026" - or in the order chosen. */
export function formatDay(day: string, chosen: DateChoices = null): string {
  const [year, month, date] = day.split('-').map(Number);
  const value = new Date(year, (month ?? 1) - 1, date ?? 1, 12);
  if (Number.isNaN(value.getTime())) {
    return day;
  }
  return chosen?.date_format ? formatDatePattern(value, chosen.date_format) : LONG_DATE.format(value);
}

function dayOf(date: Date, chosen: DateChoices): string {
  return chosen?.date_format ? formatDatePattern(date, chosen.date_format) : DATE.format(date);
}

function timeOf(date: Date, chosen: DateChoices): string {
  return chosen?.time_format ? formatClock(date, LOCALE, chosen.time_format) : TIME.format(date);
}

/**
 * How many midnights of the reader's clock lie between two moments: 0 within
 * one day, 1 from any time yesterday to any time today. Rounded, so the 23-
 * and the 25-hour day of a clock change are one day each.
 */
export function calendarDays(from: Date, to: Date): number {
  const midnight = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((midnight(to) - midnight(from)) / 86_400_000);
}

/**
 * "just now", "5 minutes ago", "yesterday", "4 days ago" - then the date.
 *
 * Up to a day it counts minutes and hours; from 24 hours on it names a day,
 * and a day is a calendar day by the reader's clock: Monday evening is
 * "yesterday" all Tuesday and "2 days ago" all Wednesday, however many hours
 * that is. (Rounded hours said "yesterday" on Wednesday morning, and "2 days
 * ago" on Tuesday evening of Monday morning.) The localDate pipe counts the
 * same way (core/i18n/local-date.pipe.ts). The date from two weeks on is in
 * the order chosen, when one is.
 */
export function timeAgo(iso: string, now = Date.now(), chosen: DateChoices = null): string {
  const then = Date.parse(iso);
  const seconds = Math.round((now - then) / 1000);
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
  const days = calendarDays(new Date(then), new Date(now));
  // `days < 1`: the last half hour of the same day rounds to 24 hours, and is still today.
  if (hours < 24 || days < 1) {
    return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
  }
  if (days < 2) {
    return 'yesterday';
  }
  return days < 14 ? `${days} days ago` : formatDate(iso, chosen);
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
