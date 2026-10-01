import { Pipe, PipeTransform, inject } from '@angular/core';
import { calendarDays } from '../util/dates';
import { TranslationService } from './translation.service';

/** A day in full, a short date, or how long ago. */
export type LocalDateStyle = 'day' | 'date' | 'ago';

const FORMATS: Record<Exclude<LocalDateStyle, 'ago'>, Intl.DateTimeFormatOptions> = {
  // "20 October 2026" / "20. októbra 2026": Intl gives Slovak the genitive, which "do ..." needs.
  day: { day: 'numeric', month: 'long', year: 'numeric' },
  date: { day: 'numeric', month: 'short', year: 'numeric' },
};

const DATE_FORMATS = new Map<string, Intl.DateTimeFormat>();
const RELATIVE_FORMATS = new Map<string, Intl.RelativeTimeFormat>();

/**
 * `{{ iso | localDate: 'day' }}`: a date or a time from the API, written the
 * way the language on the page writes it - through `Intl`, so in the reader's
 * own time zone.
 *
 *   'day'   20 October 2026 / 20. októbra 2026
 *   'date'  the same with a short month
 *   'ago'   "just now", "5 minutes ago", "yesterday" / "práve teraz", "pred 5
 *           minútami", "včera" - and from two weeks on, the date. Always a
 *           lower-case phrase that can stand inside a sentence.
 *
 * 'ago' counts as timeAgo() does (core/util/dates.ts), which stays for the
 * admin area's English pages: minutes and hours up to a day, and from 24
 * hours on calendar days by the reader's clock (calendarDays()) - "včera" is
 * the day before today and "predvčerom" the one before that, whatever the
 * hours round to. A calendar day (`2026-10-20`, a survey's closing day) is
 * that day wherever the reader is - not midnight UTC.
 *
 * Impure, like the translate pipe: the language changes under the same value.
 */
@Pipe({ name: 'localDate', pure: false })
export class LocalDatePipe implements PipeTransform {
  private readonly _i18n = inject(TranslationService);

  transform(value: string | null | undefined, style: LocalDateStyle = 'date'): string {
    if (!value) {
      return '';
    }
    const date = dateFrom(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    const locale = this._i18n.locale();
    return style === 'ago' ? this._ago(date, locale) : dateFormat(locale, style).format(date);
  }

  private _ago(date: Date, locale: string): string {
    const seconds = Math.round((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) {
      return this._i18n.t('time.justNow');
    }
    const relative = relativeFormat(locale);
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
      return relative.format(-minutes, 'minute');
    }
    const hours = Math.round(minutes / 60);
    const days = calendarDays(date, new Date());
    // `days < 1`: the last half hour of the same day rounds to 24 hours - "24 hours ago", not "today".
    if (hours < 24 || days < 1) {
      return relative.format(-hours, 'hour');
    }
    return days < 14 ? relative.format(-days, 'day') : this._i18n.t('time.onDate', { date: dateFormat(locale, 'date').format(date) });
  }
}

/** A calendar day is taken as that day at noon here; anything else as the moment it names. */
function dateFrom(value: string): Date {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return day ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]), 12) : new Date(value);
}

function dateFormat(locale: string, style: Exclude<LocalDateStyle, 'ago'>): Intl.DateTimeFormat {
  const key = `${locale}|${style}`;
  let format = DATE_FORMATS.get(key);
  if (!format) {
    format = new Intl.DateTimeFormat(locale, FORMATS[style]);
    DATE_FORMATS.set(key, format);
  }
  return format;
}

function relativeFormat(locale: string): Intl.RelativeTimeFormat {
  let format = RELATIVE_FORMATS.get(locale);
  if (!format) {
    format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    RELATIVE_FORMATS.set(locale, format);
  }
  return format;
}
