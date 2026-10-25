import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslatePipe, TranslatePluralPipe, TranslationService } from '@anotoki/lib/translations';
import { type AnotokiDateFormat, type AnotokiPreferences } from '@anotoki/lib/auth';
import { AuthService } from '../auth/auth.service';
import { provideTestTranslations } from '../testing/test-translations';
import { type AgoPipeOptions, AnotokiAgoPipe, AnotokiDatePipe } from '@anotoki/lib/ui/dates';

const ENGLISH = {
  'home.openUntil': 'open until {day}',
  'home.steps.one': '1 step',
  'home.steps.few': '{count} steps',
  'home.steps.other': '{count} steps',
  'home.size': '{questions} · {steps}',
  'common.close': 'Close',
};
const SLOVAK = {
  'home.openUntil': 'otvorený do {day}',
  'home.steps.one': '1 krok',
  'home.steps.few': '{count} kroky',
  'home.steps.other': '{count} krokov',
  'home.size': '{questions} · {steps}',
  'common.close': 'Zavrieť',
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** AuthService.preferences(): the signed-in person's anotoki account's, or null - nobody signed in, an IAM that sends none. */
const preferences = signal<AnotokiPreferences | null>(null);

/** An account that has chosen how dates are written - and, to show it changes nothing on these pages, a clock. */
function account(dateFormat: AnotokiDateFormat | null): AnotokiPreferences {
  return { theme: 'auto', date_format: dateFormat, time_format: '12' };
}

beforeEach(() => preferences.set(null));

/** How the pages people take surveys on write "how long ago": a phrase inside a sentence, the date from two weeks on (take-survey's agoOptions). */
const AGO: AgoPipeOptions = { dateAfter: 14, phrase: true };

/**
 * The family's two date pipes as the site uses them (anotoki-lib 0.11.0 - the site's own localDate pipe before
 * them): 'day' and 'date' the date pipe's, 'ago' the ago pipe's with the pages' options.
 */
function siteDates(date: AnotokiDatePipe, ago: AnotokiAgoPipe) {
  return {
    transform: (value: string | null | undefined, style: 'day' | 'date' | 'ago' = 'date'): string => (style === 'ago' ? ago.transform(value, AGO) : date.transform(value, style)),
  };
}

function pipes(language: 'en' | 'sk') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      language === 'sk' ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH),
      { provide: AuthService, useValue: { preferences } },
      TranslatePipe,
      TranslatePluralPipe,
      AnotokiDatePipe,
      AnotokiAgoPipe,
    ],
  });
  return {
    i18n: TestBed.inject(TranslationService),
    translate: TestBed.inject(TranslatePipe),
    plural: TestBed.inject(TranslatePluralPipe),
    date: siteDates(TestBed.inject(AnotokiDatePipe), TestBed.inject(AnotokiAgoPipe)),
  };
}

describe('the translate pipes', () => {
  it('word a key, and fill its placeholders', () => {
    expect(pipes('en').translate.transform('home.openUntil', { day: '20 October 2026' })).toBe('open until 20 October 2026');
    expect(pipes('sk').translate.transform('home.openUntil', { day: '20. októbra 2026' })).toBe('otvorený do 20. októbra 2026');
  });

  it('pick the plural form, and a frame takes whole phrases', () => {
    const { translate, plural } = pipes('sk');
    expect(plural.transform('home.steps', 1)).toBe('1 krok');
    expect(plural.transform('home.steps', 4)).toBe('4 kroky');
    expect(plural.transform('home.steps', 5)).toBe('5 krokov');
    expect(translate.transform('home.size', { questions: '12 otázok', steps: plural.transform('home.steps', 4) })).toBe('12 otázok · 4 kroky');
  });

  it('answer again when the language on the page changes under the same key', async () => {
    const { i18n, translate, plural } = pipes('sk');
    expect(translate.transform('common.close')).toBe('Zavrieť');
    i18n.noteAddress('/admin');
    expect(translate.transform('common.close')).toBe('Close');
    expect(plural.transform('home.steps', 3)).toBe('3 steps');
    i18n.noteAddress('/');
    expect(await i18n.setLanguage('en', { remember: false })).toBe(true);
    expect(translate.transform('common.close')).toBe('Close');
  });
});

describe('the family’s date pipes, as the pages use them (anotokiDate, anotokiAgo)', () => {
  const NOW = new Date(2026, 8, 30, 10, 0, 0).getTime();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => vi.useRealTimers());

  function ago(language: 'en' | 'sk', milliseconds: number): string {
    return pipes(language).date.transform(new Date(NOW - milliseconds).toISOString(), 'ago');
  }

  it('writes a day in full and a short date, the way the language does', () => {
    const noon = new Date(2026, 9, 20, 12).toISOString();
    expect(pipes('en').date.transform(noon, 'day')).toBe('20 October 2026');
    expect(pipes('en').date.transform(noon, 'date')).toBe('20 Oct 2026');
    expect(pipes('en').date.transform(noon)).toBe('20 Oct 2026');
    // The genitive, which "do ..." needs.
    expect(pipes('sk').date.transform(noon, 'day')).toBe('20. októbra 2026');
    expect(pipes('sk').date.transform(noon, 'date')).toBe('20. 10. 2026');
  });

  it('reads a calendar day as that day here, not as midnight somewhere else', () => {
    expect(pipes('en').date.transform('2026-10-20', 'day')).toBe('20 October 2026');
    expect(pipes('sk').date.transform('2026-01-01', 'day')).toBe('1. januára 2026');
  });

  it('gives nothing for nothing, and what is not a date back as it came', () => {
    const { date } = pipes('en');
    expect(date.transform(null, 'day')).toBe('');
    expect(date.transform(undefined, 'ago')).toBe('');
    expect(date.transform('', 'date')).toBe('');
    expect(date.transform('soon', 'day')).toBe('soon');
  });

  it('says how long ago with the family’s thresholds, in English', () => {
    expect(ago('en', 0)).toBe('just now');
    expect(ago('en', 59_000)).toBe('just now');
    expect(ago('en', MINUTE)).toBe('1 minute ago');
    expect(ago('en', 5 * MINUTE)).toBe('5 minutes ago');
    expect(ago('en', HOUR)).toBe('1 hour ago');
    expect(ago('en', 3 * HOUR)).toBe('3 hours ago');
    expect(ago('en', DAY)).toBe('yesterday');
    expect(ago('en', 4 * DAY)).toBe('4 days ago');
    expect(ago('en', 13 * DAY)).toBe('13 days ago');
    expect(ago('en', 14 * DAY)).toBe('on 16 Sept 2026');
  });

  it('says how long ago in Slovak, in phrases that stand inside a sentence', () => {
    expect(ago('sk', 10_000)).toBe('práve teraz');
    expect(ago('sk', 5 * MINUTE)).toBe('pred 5 minútami');
    expect(ago('sk', 3 * HOUR)).toBe('pred 3 hodinami');
    expect(ago('sk', DAY)).toBe('včera');
    expect(ago('sk', 5 * DAY)).toBe('pred 5 dňami');
    expect(ago('sk', 30 * DAY)).toBe('31. 8. 2026');
  });

  describe('from a day on', () => {
    /** "How long ago" a moment was, read at another - both by this computer's clock, so the days are the same ones in any time zone. */
    function read(language: 'en' | 'sk', now: Date, then: Date): string {
      vi.setSystemTime(now);
      return pipes(language).date.transform(then.toISOString(), 'ago');
    }

    const MONDAY_EVENING = new Date(2026, 8, 28, 21, 0);

    it('names the day by the calendar, not by rounded hours: Monday evening is three days before Thursday morning', () => {
      // 59 hours, which round to two days - and "predvčerom" is a day, Tuesday.
      const thursdayMorning = new Date(2026, 9, 1, 8, 0);
      expect(read('sk', thursdayMorning, MONDAY_EVENING)).toBe('pred 3 dňami');
      expect(read('en', thursdayMorning, MONDAY_EVENING)).toBe('3 days ago');
    });

    it('says the day before yesterday of Monday evening on Wednesday morning, 35 hours later', () => {
      const wednesdayMorning = new Date(2026, 8, 30, 8, 0);
      expect(read('sk', wednesdayMorning, MONDAY_EVENING)).toBe('predvčerom');
      expect(read('en', wednesdayMorning, MONDAY_EVENING)).toBe('2 days ago');
    });

    it('says yesterday of Monday morning all Tuesday evening, 36 hours later and more', () => {
      const mondayMorning = new Date(2026, 8, 28, 8, 0);
      expect(read('sk', new Date(2026, 8, 29, 20, 0), mondayMorning)).toBe('včera');
      expect(read('en', new Date(2026, 8, 29, 20, 0), mondayMorning)).toBe('yesterday');
      expect(read('sk', new Date(2026, 8, 29, 23, 59), mondayMorning)).toBe('včera');
    });

    it('never says "today" or "yesterday" of the same day: its last half hour is hours ago, rounded down', () => {
      const justAfterMidnight = new Date(2026, 8, 28, 0, 10);
      const justBeforeMidnight = new Date(2026, 8, 28, 23, 50);
      expect(read('sk', justBeforeMidnight, justAfterMidnight)).toBe('pred 23 hodinami');
      expect(read('en', justBeforeMidnight, justAfterMidnight)).toBe('23 hours ago');
    });

    it('stays with hours until there are 24 of them, over midnight too', () => {
      expect(read('sk', new Date(2026, 8, 29, 8, 0), MONDAY_EVENING)).toBe('pred 11 hodinami');
      expect(read('en', new Date(2026, 8, 29, 20, 0), MONDAY_EVENING)).toBe('23 hours ago');
    });

    it('counts a day the clocks change as one day', () => {
      // Where the clocks go back on 25 October 2026 and forward on 29 March, these days are 25 and 23 hours long.
      expect(read('sk', new Date(2026, 9, 26, 12, 0), new Date(2026, 9, 24, 12, 0))).toBe('predvčerom');
      expect(read('sk', new Date(2026, 2, 30, 12, 0), new Date(2026, 2, 28, 12, 0))).toBe('predvčerom');
    });

    it('gives the date from two weeks of calendar days on', () => {
      expect(read('en', new Date(2026, 8, 30, 8, 0), new Date(2026, 8, 17, 21, 0))).toBe('13 days ago');
      expect(read('en', new Date(2026, 8, 30, 8, 0), new Date(2026, 8, 16, 21, 0))).toBe('on 16 Sept 2026');
    });
  });

  it('is English in the admin area', () => {
    const { i18n, date } = pipes('sk');
    i18n.noteAddress('/admin/surveys');
    expect(date.transform('2026-10-20', 'day')).toBe('20 October 2026');
    expect(date.transform(new Date(NOW - 3 * HOUR).toISOString(), 'ago')).toBe('3 hours ago');
  });

  describe('for somebody whose anotoki account has chosen how dates are written', () => {
    const noon = new Date(2026, 9, 6, 12).toISOString();

    it('writes every date in that order, whatever the language - a day in full and a short date alike', () => {
      for (const language of ['en', 'sk'] as const) {
        const { date } = pipes(language);
        preferences.set(account('dmy_dot'));
        expect([date.transform(noon, 'day'), date.transform(noon, 'date'), date.transform(noon)]).toEqual(['6.10.2026', '6.10.2026', '6.10.2026']);
        preferences.set(account('dmy_slash'));
        expect(date.transform(noon, 'day')).toBe('06/10/2026');
        preferences.set(account('mdy_slash'));
        expect(date.transform(noon, 'date')).toBe('10/06/2026');
        preferences.set(account('ymd_dash'));
        expect(date.transform(noon, 'day')).toBe('2026-10-06');
      }
    });

    it('reads a calendar day as that day here, in that order too', () => {
      preferences.set(account('ymd_dash'));
      expect(pipes('sk').date.transform('2026-01-01', 'day')).toBe('2026-01-01');
      preferences.set(account('dmy_dot'));
      expect(pipes('en').date.transform('2026-10-20', 'day')).toBe('20.10.2026');
    });

    it('keeps "how long ago" a phrase, and writes its date from two weeks on in that order', () => {
      preferences.set(account('ymd_dash'));
      expect(ago('en', 3 * HOUR)).toBe('3 hours ago');
      expect(ago('sk', DAY)).toBe('včera');
      expect(ago('en', 14 * DAY)).toBe('on 2026-09-16');
      preferences.set(account('dmy_dot'));
      expect(ago('sk', 30 * DAY)).toBe('31.8.2026');
    });

    it('is the language’s own way while the account has chosen no order - its clock alone changes nothing here, where no time is written', () => {
      preferences.set(account(null));
      expect(pipes('en').date.transform(noon, 'day')).toBe('6 October 2026');
      expect(pipes('sk').date.transform(noon, 'date')).toBe('6. 10. 2026');
    });

    it('follows the account under the same value - a change saved on another site', () => {
      const { date } = pipes('sk');
      expect(date.transform(noon, 'day')).toBe('6. októbra 2026');
      preferences.set(account('mdy_slash'));
      expect(date.transform(noon, 'day')).toBe('10/06/2026');
    });
  });
});
