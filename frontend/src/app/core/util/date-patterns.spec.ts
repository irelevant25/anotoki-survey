import { formatClock, formatDatePattern } from './date-patterns';

/** Built and read by the same clock, so the day and the hour are the same in any time zone. */
const DAY = new Date(2026, 9, 6, 14, 30);

describe('formatDatePattern(): the four orders an anotoki account may choose', () => {
  it('writes each the family’s way: 6.10.2026, 06/10/2026, 10/06/2026, 2026-10-06', () => {
    expect(formatDatePattern(DAY, 'dmy_dot')).toBe('6.10.2026');
    expect(formatDatePattern(DAY, 'dmy_slash')).toBe('06/10/2026');
    expect(formatDatePattern(DAY, 'mdy_slash')).toBe('10/06/2026');
    expect(formatDatePattern(DAY, 'ymd_dash')).toBe('2026-10-06');
  });

  it('pads with a nought only where the order has two places', () => {
    const newYear = new Date(2027, 0, 2, 9, 0);
    expect(formatDatePattern(newYear, 'dmy_dot')).toBe('2.1.2027');
    expect(formatDatePattern(newYear, 'dmy_slash')).toBe('02/01/2027');
    expect(formatDatePattern(newYear, 'ymd_dash')).toBe('2027-01-02');
  });
});

describe('formatClock(): the clock an anotoki account may choose', () => {
  it('24 hours: two places for the hour', () => {
    expect(formatClock(DAY, 'en-GB', '24')).toBe('14:30');
    expect(formatClock(new Date(2026, 9, 6, 9, 5), 'sk-SK', '24')).toBe('09:05');
  });

  it('12 hours, with the page language’s words for am and pm', () => {
    expect(formatClock(DAY, 'en-GB', '12')).toBe('2:30 pm');
    expect(formatClock(DAY, 'sk-SK', '12')).toBe('2:30 PM');
    expect(formatClock(new Date(2026, 9, 6, 0, 15), 'en-GB', '12')).toBe('12:15 am');
  });
});
