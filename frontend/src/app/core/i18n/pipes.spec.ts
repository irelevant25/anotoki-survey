import { TestBed } from '@angular/core/testing';
import { provideTestTranslations } from '../testing/test-translations';
import { LocalDatePipe } from './local-date.pipe';
import { TranslatePluralPipe } from './translate-plural.pipe';
import { TranslatePipe } from './translate.pipe';
import { TranslationService } from './translation.service';

const ENGLISH = {
  'home.openUntil': 'open until {day}',
  'home.steps.one': '1 step',
  'home.steps.few': '{count} steps',
  'home.steps.other': '{count} steps',
  'home.size': '{questions} · {steps}',
  'time.justNow': 'just now',
  'time.onDate': 'on {date}',
};
const SLOVAK = {
  'home.openUntil': 'otvorený do {day}',
  'home.steps.one': '1 krok',
  'home.steps.few': '{count} kroky',
  'home.steps.other': '{count} krokov',
  'home.size': '{questions} · {steps}',
  'time.justNow': 'práve teraz',
  'time.onDate': '{date}',
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function pipes(language: 'en' | 'sk') {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [language === 'sk' ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH), TranslatePipe, TranslatePluralPipe, LocalDatePipe],
  });
  return {
    i18n: TestBed.inject(TranslationService),
    translate: TestBed.inject(TranslatePipe),
    plural: TestBed.inject(TranslatePluralPipe),
    date: TestBed.inject(LocalDatePipe),
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
    expect(translate.transform('time.justNow')).toBe('práve teraz');
    i18n.noteAddress('/admin');
    expect(translate.transform('time.justNow')).toBe('just now');
    expect(plural.transform('home.steps', 3)).toBe('3 steps');
    i18n.noteAddress('/');
    expect(await i18n.setLanguage('en', false)).toBe(true);
    expect(translate.transform('time.justNow')).toBe('just now');
  });
});

describe('the localDate pipe', () => {
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

  it('says how long ago with the thresholds of timeAgo(), in English', () => {
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

    it('never says "today": the last half hour of the same day is 24 hours ago', () => {
      const justAfterMidnight = new Date(2026, 8, 28, 0, 10);
      const justBeforeMidnight = new Date(2026, 8, 28, 23, 50);
      expect(read('sk', justBeforeMidnight, justAfterMidnight)).toBe('pred 24 hodinami');
      expect(read('en', justBeforeMidnight, justAfterMidnight)).toBe('24 hours ago');
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
});
