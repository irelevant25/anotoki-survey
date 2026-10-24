import { type DateChoices } from './date-patterns';
import { calendarDays, formatDate, formatDateTime, formatDay, timeAgo } from './dates';

/**
 * Every moment here is built with the local-time constructor and read back by
 * the same clock, so the days are the same ones in any time zone.
 */
function ago(then: Date, now: Date): string {
  return timeAgo(then.toISOString(), now.getTime());
}

describe('calendarDays(): the midnights between two moments', () => {
  it('is 0 within a day and 1 from any time yesterday to any time today', () => {
    expect(calendarDays(new Date(2026, 8, 28, 0, 10), new Date(2026, 8, 28, 23, 50))).toBe(0);
    expect(calendarDays(new Date(2026, 8, 28, 23, 59), new Date(2026, 8, 29, 0, 1))).toBe(1);
    expect(calendarDays(new Date(2026, 8, 28, 0, 1), new Date(2026, 8, 29, 23, 59))).toBe(1);
  });

  it('counts across a month and a year', () => {
    expect(calendarDays(new Date(2026, 8, 28, 21, 0), new Date(2026, 9, 1, 8, 0))).toBe(3);
    expect(calendarDays(new Date(2025, 11, 31, 12, 0), new Date(2026, 0, 1, 12, 0))).toBe(1);
  });

  it('takes a day the clocks change for one day', () => {
    // Where the clocks go back on 25 October 2026 and forward on 29 March, these days are 25 and 23 hours long.
    expect(calendarDays(new Date(2026, 9, 24, 12, 0), new Date(2026, 9, 26, 12, 0))).toBe(2);
    expect(calendarDays(new Date(2026, 2, 28, 12, 0), new Date(2026, 2, 30, 12, 0))).toBe(2);
  });
});

describe('timeAgo(): how long ago, in English', () => {
  const NOW = new Date(2026, 8, 30, 10, 0, 0);
  const before = (milliseconds: number): string => ago(new Date(NOW.getTime() - milliseconds), NOW);
  const MINUTE = 60_000;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;

  it('counts minutes and hours up to a day', () => {
    expect(before(0)).toBe('just now');
    expect(before(59_000)).toBe('just now');
    expect(before(MINUTE)).toBe('a minute ago');
    expect(before(5 * MINUTE)).toBe('5 minutes ago');
    expect(before(HOUR)).toBe('an hour ago');
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

  it('never calls the same day "yesterday": its last half hour is 24 hours ago', () => {
    expect(ago(new Date(2026, 8, 28, 0, 10), new Date(2026, 8, 28, 23, 50))).toBe('24 hours ago');
  });

  it('gives back what is not a date as it came', () => {
    expect(timeAgo('soon')).toBe('soon');
  });
});

describe('the admin panel’s dates in the order and on the clock the anotoki account has chosen', () => {
  /** 29 September 2026, 14:30 by this computer's clock. */
  const MOMENT = new Date(2026, 8, 29, 14, 30).toISOString();
  const chosen = (dateFormat: NonNullable<DateChoices>['date_format'], timeFormat: NonNullable<DateChoices>['time_format']): DateChoices => ({ date_format: dateFormat, time_format: timeFormat });

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
