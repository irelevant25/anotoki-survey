import { type AnotokiDateChoices } from '@anotoki/lib/ui/config';
import { formatDate, formatDateTime, formatDay, formatDuration, timeAgo, todayIsoDay } from './dates';

/**
 * The admin panel's English dates - the anotoki family's (@anotoki/lib/ui/dates)
 * in British English. Every moment here is built with the local-time
 * constructor and read back by the same clock, so the days are the same ones in
 * any time zone.
 */
function ago(then: Date, now: Date): string {
  return timeAgo(then.toISOString(), now.getTime());
}

describe('timeAgo(): how long ago, in English', () => {
  const NOW = new Date(2026, 8, 30, 10, 0, 0);
  const before = (milliseconds: number): string => ago(new Date(NOW.getTime() - milliseconds), NOW);
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it('counts minutes and hours up to a day - rounded down, the family’s count', () => {
    expect(before(0)).toBe('just now');
    expect(before(59_000)).toBe('just now');
    expect(before(MINUTE)).toBe('1 minute ago');
    expect(before(MINUTE + 50_000)).toBe('1 minute ago');
    expect(before(5 * MINUTE)).toBe('5 minutes ago');
    expect(before(HOUR)).toBe('1 hour ago');
    expect(before(HOUR + 40 * MINUTE)).toBe('1 hour ago');
    expect(before(3 * HOUR)).toBe('3 hours ago');
    // Over midnight, and still hours.
    expect(before(23 * HOUR)).toBe('23 hours ago');
  });

  it('then days, and the date from two weeks on', () => {
    expect(before(DAY)).toBe('yesterday');
    expect(before(4 * DAY)).toBe('4 days ago');
    expect(before(13 * DAY)).toBe('13 days ago');
    expect(before(14 * DAY)).toBe('16 Sept 2026');
  });

  it('names the day by the calendar, not by rounded hours', () => {
    const mondayEvening = new Date(2026, 8, 28, 21, 0);
    // 35 hours round to one day - and it was the day before yesterday.
    expect(ago(mondayEvening, new Date(2026, 8, 30, 8, 0))).toBe('2 days ago');
    // 59 hours round to two days - and it was three days before.
    expect(ago(mondayEvening, new Date(2026, 9, 1, 8, 0))).toBe('3 days ago');
    // 36 hours round to two days - and Monday morning was yesterday all Tuesday.
    expect(ago(new Date(2026, 8, 28, 8, 0), new Date(2026, 8, 29, 20, 0))).toBe('yesterday');
    expect(ago(new Date(2026, 8, 28, 8, 0), new Date(2026, 8, 29, 23, 59))).toBe('yesterday');
  });

  it('never calls the same day "yesterday": its last half hour is hours ago', () => {
    expect(ago(new Date(2026, 8, 28, 0, 10), new Date(2026, 8, 28, 23, 50))).toBe('23 hours ago');
  });

  it('gives back what is not a date as it came', () => {
    expect(timeAgo('soon')).toBe('soon');
  });
});

describe('the admin panel’s dates in the order and on the clock the anotoki account has chosen', () => {
  /** 29 September 2026, 14:30 by this computer's clock. */
  const MOMENT = new Date(2026, 8, 29, 14, 30).toISOString();
  const chosen = (dateFormat: AnotokiDateChoices['date_format'], timeFormat: AnotokiDateChoices['time_format']): AnotokiDateChoices => ({ date_format: dateFormat, time_format: timeFormat });

  it('writes a date, and a day in full, in the order chosen - and English’s own way with none', () => {
    expect(formatDate(MOMENT)).toBe('29 Sept 2026');
    expect(formatDate(MOMENT, chosen('dmy_dot', null))).toBe('29.9.2026');
    expect(formatDate(MOMENT, chosen('mdy_slash', null))).toBe('09/29/2026');
    expect(formatDay('2026-10-20')).toBe('20 October 2026');
    expect(formatDay('2026-10-20', chosen('ymd_dash', null))).toBe('2026-10-20');
    expect(formatDay('2026-10-20', chosen('dmy_slash', null))).toBe('20/10/2026');
    // A clock alone changes no date.
    expect(formatDate(MOMENT, chosen(null, '12'))).toBe('29 Sept 2026');
  });

  it('puts a date and its time side by side when either is chosen, and leaves English’s way alone when neither is', () => {
    expect(formatDateTime(MOMENT)).toBe('29 Sept 2026, 14:30');
    expect(formatDateTime(MOMENT, chosen(null, null))).toBe('29 Sept 2026, 14:30');
    expect(formatDateTime(MOMENT, chosen('dmy_dot', null))).toBe('29.9.2026 14:30');
    expect(formatDateTime(MOMENT, chosen(null, '12'))).toBe('29 Sept 2026 2:30 pm');
    expect(formatDateTime(MOMENT, chosen('ymd_dash', '24'))).toBe('2026-09-29 14:30');
    const morning = new Date(2026, 8, 29, 9, 5).toISOString();
    expect(formatDateTime(morning, chosen('ymd_dash', '24'))).toBe('2026-09-29 09:05');
    expect(formatDateTime(morning, chosen('mdy_slash', '12'))).toBe('09/29/2026 9:05 am');
    expect(formatDateTime('soon', chosen('ymd_dash', '24'))).toBe('soon');
  });

  it('keeps "how long ago" in words, and writes its date from two weeks on in the order chosen', () => {
    const now = new Date(2026, 8, 30, 10, 0).getTime();
    expect(timeAgo(new Date(2026, 8, 30, 7, 0).toISOString(), now, chosen('ymd_dash', '12'))).toBe('3 hours ago');
    expect(timeAgo(new Date(2026, 8, 16, 10, 0).toISOString(), now, chosen('ymd_dash', null))).toBe('2026-09-16');
    expect(timeAgo(new Date(2026, 8, 16, 10, 0).toISOString(), now)).toBe('16 Sept 2026');
  });
});

describe('the site’s own: how long a survey took, and today for a date field', () => {
  it('writes a duration in seconds, minutes and hours', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(260)).toBe('4 min 20 s');
    expect(formatDuration(3900)).toBe('1 h 5 min');
  });

  it('gives today as a date field takes it', () => {
    expect(todayIsoDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
