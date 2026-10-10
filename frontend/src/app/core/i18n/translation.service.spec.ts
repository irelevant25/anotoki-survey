import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ToastService } from '@anotoki/lib/ui/toast';
import { ApiError, ApiService } from '../api/api.service';
import { type AnotokiPreferences } from '../auth/anotoki-auth';
import { AuthService, BootStatus } from '../auth/auth.service';
import { TEST_LANGUAGES, provideTestTranslations } from '../testing/test-translations';
import { TranslationBundle } from './translation.model';
import { CACHE_WAIT_MS, RETRY_WAIT_MS, TranslationService, languageCandidates, pickLanguage } from './translation.service';

const LANGUAGE_KEY = 'anotoki-survey:language';
const CACHE_KEY = 'anotoki-survey:language-cache';

const ENGLISH = {
  'common.close': 'Close',
  'home.hello': 'Hello {name}, you have {count}.',
  'home.by': 'Written by {name} for {site}.',
  'home.questions.one': '{count} question',
  'home.questions.few': '{count} questions',
  'home.questions.other': '{count} questions',
  'home.onlyEnglish': 'Only in English',
  // Placeholders named like what every object inherits: filled only from what a parameter object has itself.
  'home.proto': 'x {constructor} {toString} y',
};
const SLOVAK = {
  ...ENGLISH,
  'common.close': 'Zavrieť',
  'home.hello': 'Dobrý deň, {name}, máte {count}.',
  'home.by': 'Napísal {name} pre {site}.',
  'home.questions.one': '1 otázka',
  'home.questions.few': '{count} otázky',
  'home.questions.other': '{count} otázok',
  'language.notSaved': 'Jazyk sa nepodarilo uložiť do Vášho anotoki účtu – platí len počas tejto návštevy.',
};

/** What an account sends once the IAM keeps how every anotoki site should look (its migration 015): only that it sends them matters here. */
const PREFERENCES: AnotokiPreferences = { theme: 'auto', date_format: null, time_format: null };

const EN_BUNDLE: TranslationBundle = { language: 'en', languages: TEST_LANGUAGES, values: ENGLISH };
const SK_BUNDLE: TranslationBundle = { language: 'sk', languages: TEST_LANGUAGES, values: SLOVAK, english: ENGLISH };

/** The server: Slovak for `sk`, English - saying so - for anything else. */
function answer(code: string): Promise<TranslationBundle> {
  return Promise.resolve(code === 'sk' ? SK_BUNDLE : EN_BUNDLE);
}

/** The Slovak bundle as it is once somebody has reworded a string in the admin area. */
function reworded(close: string): TranslationBundle {
  return { ...SK_BUNDLE, values: { ...SLOVAK, 'common.close': close } };
}

const OFFLINE = new ApiError(0, 'offline', 'The site could not be reached.');

/** Everything already on its way has run: the answers of requests that were settled, and what follows them. */
function settled(): Promise<void> {
  return new Promise((done) => setTimeout(done));
}

/** A promise the test settles by hand: the server's answer, when the test says. */
function later<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('languageCandidates() and pickLanguage(): which language a reader gets', () => {
  it('orders the wishes: this tab, the chooser, the token, each browser tag and its first subtag, English', () => {
    const candidates = languageCandidates({ tab: 'de', chosen: 'fr', token: 'it', browser: ['sk-SK', 'cs'] });
    expect(candidates.map((candidate) => candidate.code)).toEqual(['de', 'fr', 'it', 'sk-sk', 'sk', 'cs', 'en']);
    expect(candidates.filter((candidate) => candidate.browser).map((candidate) => candidate.code)).toEqual(['sk-sk', 'sk', 'cs']);
  });

  it('lower-cases, and ignores whatever does not look like a language code', () => {
    const candidates = languageCandidates({ tab: 'SK', chosen: 'english', token: '../../etc', browser: ['zh-Hant-TW', 'fil', null, undefined, ''] });
    expect(candidates.map((candidate) => candidate.code)).toEqual(['sk', 'zh', 'en']);
  });

  it('takes the first wish that is on offer, and English when none is', () => {
    expect(pickLanguage(languageCandidates({ tab: 'de', chosen: 'sk', browser: ['en-GB'] }), ['en', 'sk'])).toBe('sk');
    expect(pickLanguage(languageCandidates({ tab: 'sk', chosen: 'en' }), ['en', 'sk'])).toBe('sk');
    expect(pickLanguage(languageCandidates({ token: 'sk', browser: ['en'] }), ['en', 'sk'])).toBe('sk');
    expect(pickLanguage(languageCandidates({ browser: ['de-AT', 'fr'] }), ['en', 'sk'])).toBe('en');
  });

  it('gives a Czech browser Slovak - while no Czech is on offer, and only at the browser step', () => {
    expect(pickLanguage(languageCandidates({ browser: ['cs-CZ', 'en'] }), ['en', 'sk'])).toBe('sk');
    expect(pickLanguage(languageCandidates({ browser: ['cs-CZ', 'en'] }), ['en', 'sk', 'cs'])).toBe('cs');
    expect(pickLanguage(languageCandidates({ tab: 'cs' }), ['en', 'sk'])).toBe('en');
    expect(pickLanguage(languageCandidates({ token: 'cs', browser: ['en'] }), ['en', 'sk'])).toBe('en');
    // The alias still counts for the browser when the same code was also asked for elsewhere.
    expect(pickLanguage(languageCandidates({ tab: 'cs', browser: ['cs'] }), ['en', 'sk'])).toBe('sk');
  });
});

describe('TranslationService', () => {
  const api = { translations: vi.fn() };
  const status = signal<BootStatus>('ready');
  /** Who is signed in: the token's `locale` - and `preferences` once the IAM sends the account's (without them, an IAM from before its migration 015). */
  const user = signal<{ locale: string | null; preferences?: AnotokiPreferences } | null>(null);
  let listeners: (() => void)[] = [];
  const savePreferences = vi.fn();
  const auth = {
    status,
    user,
    signedIn: () => user() !== null,
    preferences: () => user()?.preferences ?? null,
    savePreferences,
    onAuthChange: (listener: () => void) => {
      listeners.push(listener);
      return () => undefined;
    },
  };
  let warn: ReturnType<typeof vi.spyOn>;
  let browser: ReturnType<typeof vi.spyOn>;

  function service(): TranslationService {
    return TestBed.inject(TranslationService);
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    history.replaceState(null, '', '/');
    api.translations.mockReset().mockImplementation(answer);
    status.set('ready');
    user.set(null);
    listeners = [];
    savePreferences.mockReset().mockResolvedValue({});
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    browser = vi.spyOn(window.navigator, 'languages', 'get').mockReturnValue(['en-GB']);
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: auth },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('choosing the language as the site starts', () => {
    it('needs one request for a Slovak browser’s first visit: the server answers a regional code by its base language', async () => {
      browser.mockReturnValue(['sk-SK', 'sk']);
      api.translations.mockImplementation((code: string) => Promise.resolve(code === 'sk-sk' || code === 'sk' ? SK_BUNDLE : EN_BUNDLE));
      await service().init();

      expect(api.translations.mock.calls).toEqual([['sk-sk']]);
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zavrieť');
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').language).toBe('sk');
    });

    it('asks for the first wish and, answered in English (an older server), settles on the list that came: two requests at most', async () => {
      browser.mockReturnValue(['sk-SK', 'en']);
      await service().init();

      expect(api.translations.mock.calls).toEqual([['sk-sk'], ['sk']]);
      expect(service().language()).toBe('sk');
      expect(service().languages()).toEqual(TEST_LANGUAGES);
      expect(service().t('common.close')).toBe('Zavrieť');
    });

    it('starts in English rather than in keys when the language it settled on cannot be had', async () => {
      browser.mockReturnValue(['sk-SK']);
      api.translations.mockResolvedValueOnce(EN_BUNDLE).mockRejectedValueOnce(OFFLINE);
      await service().init();

      expect(api.translations.mock.calls).toEqual([['sk-sk'], ['sk']]);
      expect(service().ready()).toBe(true);
      expect(service().language()).toBe('en');
      expect(service().t('common.close')).toBe('Close');
    });

    it('needs one request when the first wish is on offer, or when nothing wished for is', async () => {
      browser.mockReturnValue(['sk']);
      await service().init();
      expect(api.translations.mock.calls).toEqual([['sk']]);

      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: ApiService, useValue: api },
          { provide: AuthService, useValue: auth },
        ],
      });
      localStorage.clear();
      api.translations.mockClear();
      browser.mockReturnValue(['de-DE', 'fr']);
      await service().init();
      expect(api.translations.mock.calls).toEqual([['de-de']]);
      expect(service().language()).toBe('en');
    });

    it('gives a Czech browser Slovak', async () => {
      browser.mockReturnValue(['cs-CZ', 'cs', 'en']);
      await service().init();
      expect(service().language()).toBe('sk');
    });

    it('keeps ?lang= for this tab only, and takes it out of the address before the router reads it', async () => {
      history.replaceState(null, '', '/genshin-1-0?tab=people&lang=SK&x=a%20b#top');
      localStorage.setItem(LANGUAGE_KEY, 'en');
      await service().init();

      expect(service().language()).toBe('sk');
      expect(sessionStorage.getItem(LANGUAGE_KEY)).toBe('sk');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en');
      expect(location.pathname + location.search + location.hash).toBe('/genshin-1-0?tab=people&x=a%20b#top');
    });

    it('ignores a ?lang= that is not a language code: never stored, never sent - and still removed', async () => {
      history.replaceState(null, '', '/?lang=%3Cscript%3E');
      await service().init();

      expect(sessionStorage.getItem(LANGUAGE_KEY)).toBeNull();
      expect(location.search).toBe('');
      expect(api.translations.mock.calls).toEqual([['en-gb']]);
      expect(service().language()).toBe('en');
    });

    it('keeps ?lang= and a choice for as long as the page lives where storage refuses to be written', async () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      browser.mockReturnValue(['en']);
      history.replaceState(null, '', '/?lang=sk');
      await service().init();

      // Nothing could be kept - and the link works all the same, with the parameter gone from the address.
      expect(sessionStorage.getItem(LANGUAGE_KEY)).toBeNull();
      expect(service().language()).toBe('sk');
      expect(location.search).toBe('');

      // A choice made here outlives the link - and the next start, whatever the browser would rather read.
      browser.mockReturnValue(['sk']);
      expect(await service().setLanguage('en')).toBe(true);
      expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();
      await service().init();
      expect(service().language()).toBe('en');
    });

    it('puts this tab before the chooser, the chooser before the token, the token before the browser', async () => {
      browser.mockReturnValue(['en']);
      user.set({ locale: 'sk' });
      await service().init();
      expect(service().language()).toBe('sk');
      // Used, not stored: a change on the account page arrives with the next token.
      expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();
      expect(sessionStorage.getItem(LANGUAGE_KEY)).toBeNull();

      localStorage.setItem(LANGUAGE_KEY, 'en');
      await service().init();
      expect(service().language()).toBe('en');

      sessionStorage.setItem(LANGUAGE_KEY, 'sk');
      await service().init();
      expect(service().language()).toBe('sk');
    });

    it('adopts a changed locale of the token while nothing is stored here - without storing it', async () => {
      browser.mockReturnValue(['en']);
      await service().init();
      expect(service().language()).toBe('en');

      user.set({ locale: 'sk' });
      listeners.forEach((listener) => listener());
      await vi.waitFor(() => expect(service().language()).toBe('sk'));
      expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();

      // Once somebody chose here, the token no longer decides.
      await service().setLanguage('en');
      user.set({ locale: 'en' });
      listeners.forEach((listener) => listener());
      user.set({ locale: 'sk' });
      listeners.forEach((listener) => listener());
      await Promise.resolve();
      expect(service().language()).toBe('en');
    });
  });

  describe('the cache', () => {
    it('starts, asks the server and words the page when the cache is corrupt', async () => {
      for (const corrupt of [
        '{not json',
        '[]',
        'null',
        JSON.stringify({ language: 'en', languages: 'en', values: ENGLISH }),
        JSON.stringify({ language: 'EN', languages: TEST_LANGUAGES, values: ENGLISH }),
        JSON.stringify({ language: 'en', languages: [{ code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' }], values: ENGLISH }),
        JSON.stringify({ language: 'en', languages: [{ code: 'en', name: 'English' }], values: ENGLISH }),
        JSON.stringify({ language: 'en', languages: TEST_LANGUAGES, values: { 'common.close': 7 } }),
        JSON.stringify({ language: 'en', languages: TEST_LANGUAGES, values: ['Close'] }),
        JSON.stringify({ language: 'sk', languages: TEST_LANGUAGES, values: SLOVAK }),
      ]) {
        TestBed.resetTestingModule();
        TestBed.configureTestingModule({
          providers: [
            { provide: ApiService, useValue: api },
            { provide: AuthService, useValue: auth },
          ],
        });
        api.translations.mockClear();
        // The last one is Slovak without its English: asked for in Slovak, so it is its shape that fails it.
        browser.mockReturnValue(corrupt.includes('"language":"sk"') ? ['sk'] : ['en']);
        localStorage.setItem(CACHE_KEY, corrupt);

        await service().init();

        expect(api.translations, corrupt).toHaveBeenCalled();
        expect(service().ready(), corrupt).toBe(true);
        expect(service().t('common.close'), corrupt).toBe(service().language() === 'sk' ? 'Zavrieť' : 'Close');
        // What the server sent has taken the corrupt cache's place.
        expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null').values['common.close'], corrupt).toBeTruthy();
      }
    });

    it('is not used when it is in another language than the one chosen now', async () => {
      localStorage.setItem(CACHE_KEY, JSON.stringify(SK_BUNDLE));
      browser.mockReturnValue(['en']);
      const server = later<TranslationBundle>();
      api.translations.mockReturnValue(server.promise);

      const started = service().init();
      // No cache: nothing is shown in Slovak meanwhile, and the start waits for the server.
      expect(service().ready()).toBe(false);
      expect(localStorage.getItem(CACHE_KEY)).toBeNull();
      server.resolve(EN_BUNDLE);
      await started;
      expect(service().language()).toBe('en');
    });

    it('follows a language offered again (or added) at once, not one visit late: it settles on the list that came, whatever answered', async () => {
      // Slovak was chosen here; while it was hidden, the visit was in English and that is what was kept.
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      localStorage.setItem(CACHE_KEY, JSON.stringify({ language: 'en', languages: [TEST_LANGUAGES[0]], values: ENGLISH }));
      await service().init();

      // The kept language is asked for - and its answer names Slovak again.
      expect(api.translations.mock.calls).toEqual([['en'], ['sk']]);
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zavrieť');
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').language).toBe('sk');
    });

    it('follows a language hidden since the last visit: the cache is in force only until the answer', async () => {
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      localStorage.setItem(CACHE_KEY, JSON.stringify(SK_BUNDLE));
      const english = { language: 'en', languages: [TEST_LANGUAGES[0]], values: ENGLISH };
      api.translations.mockResolvedValue(english);
      await service().init();

      expect(api.translations.mock.calls).toEqual([['sk']]);
      expect(service().language()).toBe('en');
      expect(service().languages()).toEqual([TEST_LANGUAGES[0]]);
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}')).toEqual(english);
    });

    it('waits a second for the fresh bundle, then starts from the cache - and the answer replaces it when it comes', async () => {
      vi.useFakeTimers();
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...SK_BUNDLE, values: { ...SLOVAK, 'common.close': 'Zatvoriť' } }));
      browser.mockReturnValue(['sk']);
      const server = later<TranslationBundle>();
      api.translations.mockReturnValue(server.promise);

      let started = false;
      const starting = service()
        .init()
        .then(() => (started = true));
      await vi.advanceTimersByTimeAsync(CACHE_WAIT_MS - 1);
      expect(started).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await starting;

      expect(api.translations.mock.calls).toEqual([['sk']]);
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zatvoriť');

      vi.useRealTimers();
      server.resolve(SK_BUNDLE);
      await vi.waitFor(() => expect(service().t('common.close')).toBe('Zavrieť'));
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').values['common.close']).toBe('Zavrieť');
    });

    it('does not wait the second out when the server answers, or fails, sooner', async () => {
      vi.useFakeTimers();
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...EN_BUNDLE, values: { 'common.close': 'Shut' } }));
      await service().init();
      expect(service().t('common.close')).toBe('Close');

      api.translations.mockRejectedValue(new ApiError(0, 'offline', 'The site could not be reached.'));
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...EN_BUNDLE, values: { 'common.close': 'Shut' } }));
      await service().init();
      expect(service().t('common.close')).toBe('Shut');
    });

    it('asks once more, a moment later, when there is no cache and the first bundle does not come', async () => {
      vi.useFakeTimers();
      api.translations.mockRejectedValueOnce(OFFLINE);

      let started = false;
      const starting = service()
        .init()
        .then(() => (started = true));
      await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS - 1);
      expect(api.translations.mock.calls).toEqual([['en-gb']]);
      expect(started).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await starting;

      // The same request again: the page waited for it, and starts with its strings.
      expect(api.translations.mock.calls).toEqual([['en-gb'], ['en-gb']]);
      expect(service().ready()).toBe(true);
      expect(service().t('common.close')).toBe('Close');
    });

    it('shows keys, and warns once for each, when there is no cache and the server cannot be reached - after the one retry', async () => {
      vi.useFakeTimers();
      api.translations.mockRejectedValue(OFFLINE);
      const starting = service().init();
      await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS);
      await starting;

      expect(api.translations).toHaveBeenCalledTimes(2);
      expect(service().ready()).toBe(false);
      expect(service().has('common.close')).toBe(false);
      expect(service().t('common.close')).toBe('common.close');
      expect(service().t('common.close')).toBe('common.close');
      expect(warn.mock.calls).toEqual([["[i18n] no string for 'common.close'"]]);
    });

    it('asks for nothing while the site cannot run: the cache if there is one', async () => {
      status.set('not-set-up');
      await service().init();
      expect(api.translations).not.toHaveBeenCalled();
      expect(service().ready()).toBe(false);

      localStorage.setItem(CACHE_KEY, JSON.stringify(EN_BUNDLE));
      status.set('error');
      await service().init();
      expect(api.translations).not.toHaveBeenCalled();
      expect(service().has('common.close')).toBe(true);
    });

    it('takes the cache in whatever language it is in while the site cannot run - and leaves it where it is', async () => {
      // A reader whose Slovak came from the token: nobody is signed in now, and the browser says English.
      localStorage.setItem(CACHE_KEY, JSON.stringify(SK_BUNDLE));
      browser.mockReturnValue(['en']);
      status.set('error');
      await service().init();

      expect(api.translations).not.toHaveBeenCalled();
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zavrieť');
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')).toEqual(SK_BUNDLE);

      // A corrupt one is removed all the same.
      localStorage.setItem(CACHE_KEY, '{not json');
      await service().init();
      expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    });

    it('takes nothing from the server that is not a bundle', async () => {
      vi.useFakeTimers();
      api.translations.mockResolvedValue({ language: 'en', languages: TEST_LANGUAGES, values: { 'common.close': ['Close'] } });
      const starting = service().init();
      await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS);
      await starting;
      expect(service().ready()).toBe(false);
      expect(localStorage.getItem(CACHE_KEY)).toBeNull();
    });
  });

  describe('asking again: a page that started without its strings heals at the next navigation', () => {
    /** A start with no cache and a server out of reach: both attempts fail, and the page is in keys. */
    async function startInKeys(): Promise<void> {
      vi.useFakeTimers();
      api.translations.mockRejectedValue(OFFLINE);
      const starting = service().init();
      await vi.advanceTimersByTimeAsync(RETRY_WAIT_MS);
      await starting;
      vi.useRealTimers();
      expect(service().ready()).toBe(false);
      api.translations.mockClear();
    }

    it('asks once at each navigation while no bundle is in memory - and no more once one has come', async () => {
      browser.mockReturnValue(['sk']);
      await startInKeys();

      service().noteAddress('/');
      await settled();
      expect(api.translations.mock.calls).toEqual([['sk']]);
      expect(service().ready()).toBe(false);

      service().noteAddress('/genshin-1-0');
      await settled();
      expect(api.translations.mock.calls).toEqual([['sk'], ['sk']]);

      // The server is back: the next click brings the strings, in the reader's language.
      api.translations.mockImplementation(answer);
      service().noteAddress('/');
      await settled();
      expect(api.translations).toHaveBeenCalledTimes(3);
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zavrieť');
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').language).toBe('sk');

      service().noteAddress('/genshin-1-0');
      service().noteAddress('/admin/surveys');
      await settled();
      expect(api.translations).toHaveBeenCalledTimes(3);
    });

    it('asks again while the cached bundle is in force because its refresh failed', async () => {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ ...EN_BUNDLE, values: { ...ENGLISH, 'common.close': 'Shut' } }));
      api.translations.mockRejectedValue(OFFLINE);
      await service().init();
      expect(service().t('common.close')).toBe('Shut');
      api.translations.mockClear();

      service().noteAddress('/');
      await settled();
      expect(api.translations.mock.calls).toEqual([['en']]);
      expect(service().t('common.close')).toBe('Shut');

      api.translations.mockImplementation(answer);
      service().noteAddress('/genshin-1-0');
      await settled();
      expect(api.translations.mock.calls).toEqual([['en'], ['en']]);
      expect(service().t('common.close')).toBe('Close');
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').values['common.close']).toBe('Close');

      service().noteAddress('/');
      await settled();
      expect(api.translations).toHaveBeenCalledTimes(2);
    });

    it('never has two loads in flight: a navigation asks for nothing while an answer is still on its way', async () => {
      await startInKeys();
      const server = later<TranslationBundle>();
      api.translations.mockReturnValue(server.promise);

      service().noteAddress('/');
      service().noteAddress('/genshin-1-0');
      await settled();
      service().noteAddress('/');
      expect(api.translations).toHaveBeenCalledTimes(1);

      server.resolve(EN_BUNDLE);
      await settled();
      expect(service().ready()).toBe(true);
      service().noteAddress('/genshin-1-0');
      expect(api.translations).toHaveBeenCalledTimes(1);
    });

    it('leaves a start that is still waiting for its fresh bundle alone', async () => {
      vi.useFakeTimers();
      localStorage.setItem(CACHE_KEY, JSON.stringify(reworded('Zatvoriť')));
      browser.mockReturnValue(['sk']);
      const slow = later<TranslationBundle>();
      api.translations.mockReturnValue(slow.promise);
      const starting = service().init();
      await vi.advanceTimersByTimeAsync(CACHE_WAIT_MS);
      await starting;
      vi.useRealTimers();

      // The page started from the cache; its refresh is still out - the first navigation does not ask a second time.
      service().noteAddress('/');
      await settled();
      expect(api.translations.mock.calls).toEqual([['sk']]);

      slow.resolve(SK_BUNDLE);
      await settled();
      expect(service().t('common.close')).toBe('Zavrieť');
      service().noteAddress('/genshin-1-0');
      expect(api.translations).toHaveBeenCalledTimes(1);
    });

    it('never overtakes a choice that is being loaded', async () => {
      await startInKeys();
      const slovak = later<TranslationBundle>();
      api.translations.mockReturnValue(slovak.promise);

      const choosing = service().setLanguage('sk');
      service().noteAddress('/genshin-1-0');
      await settled();
      expect(api.translations.mock.calls).toEqual([['sk']]);

      slovak.resolve(SK_BUNDLE);
      expect(await choosing).toBe(true);
      expect(service().language()).toBe('sk');
    });

    it('asks for nothing before the start has run, nor while the site cannot run', async () => {
      service().noteAddress('/');
      await settled();
      expect(api.translations).not.toHaveBeenCalled();

      status.set('error');
      await service().init();
      service().noteAddress('/');
      service().noteAddress('/admin/surveys');
      await settled();
      expect(api.translations).not.toHaveBeenCalled();
      // Where the page is is noted all the same.
      expect(service().inAdmin()).toBe(true);
    });
  });

  describe('reload(): the strings again, after somebody changed them or the languages', () => {
    it('asks for the bundle of the language on the page again, and puts it in force and in the cache', async () => {
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      await service().init();
      expect(service().t('common.close')).toBe('Zavrieť');
      api.translations.mockClear();

      api.translations.mockImplementation((code: string) => Promise.resolve(code === 'sk' ? reworded('Zatvoriť') : EN_BUNDLE));
      await service().reload();

      expect(api.translations.mock.calls).toEqual([['sk']]);
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zatvoriť');
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').values['common.close']).toBe('Zatvoriť');
    });

    it('asks in the person’s language in the admin area too - its bundle carries the English the admin area reads', async () => {
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      await service().init();
      service().noteAddress('/admin/translations');
      expect(service().t('common.close')).toBe('Close');
      api.translations.mockClear();

      api.translations.mockResolvedValue({ ...SK_BUNDLE, english: { ...ENGLISH, 'common.close': 'Shut' } });
      await service().reload();

      expect(api.translations.mock.calls).toEqual([['sk']]);
      expect(service().t('common.close')).toBe('Shut');
      service().noteAddress('/');
      expect(service().t('common.close')).toBe('Zavrieť');
    });

    it('follows a language hidden a moment ago: the page goes to what the list that came still offers', async () => {
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      await service().init();
      api.translations.mockClear();

      api.translations.mockResolvedValue({ language: 'en', languages: [TEST_LANGUAGES[0]], values: ENGLISH });
      await service().reload();

      expect(api.translations.mock.calls).toEqual([['sk']]);
      expect(service().language()).toBe('en');
      expect(service().languages()).toEqual([TEST_LANGUAGES[0]]);
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').language).toBe('en');
    });

    it('follows a language offered a moment ago: the reader who chose it gets it without loading the page again', async () => {
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      api.translations.mockResolvedValue({ language: 'en', languages: [TEST_LANGUAGES[0]], values: ENGLISH });
      await service().init();
      expect(service().language()).toBe('en');
      api.translations.mockClear();

      api.translations.mockImplementation(answer);
      await service().reload();

      expect(api.translations.mock.calls).toEqual([['en'], ['sk']]);
      expect(service().language()).toBe('sk');
      expect(service().languages()).toEqual(TEST_LANGUAGES);
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').language).toBe('sk');
    });

    it('never rejects: the page stays as it is when the server cannot be had - and asks again at the next navigation', async () => {
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      await service().init();
      // Fresh from the server: a navigation asks for nothing.
      service().noteAddress('/');
      api.translations.mockClear();

      api.translations.mockRejectedValue(OFFLINE);
      await expect(service().reload()).resolves.toBeUndefined();
      expect(service().language()).toBe('sk');
      expect(service().t('common.close')).toBe('Zavrieť');
      expect(api.translations).toHaveBeenCalledTimes(1);

      // Known to be behind now: the next click asks once more.
      api.translations.mockImplementation((code: string) => Promise.resolve(code === 'sk' ? reworded('Zatvoriť') : EN_BUNDLE));
      service().noteAddress('/genshin-1-0');
      await settled();
      expect(api.translations).toHaveBeenCalledTimes(2);
      expect(service().t('common.close')).toBe('Zatvoriť');
    });

    it('is the load that counts: an answer still on its way from before the change is dropped', async () => {
      vi.useFakeTimers();
      localStorage.setItem(CACHE_KEY, JSON.stringify(SK_BUNDLE));
      browser.mockReturnValue(['sk']);
      const before = later<TranslationBundle>();
      api.translations.mockReturnValueOnce(before.promise);
      const starting = service().init();
      await vi.advanceTimersByTimeAsync(CACHE_WAIT_MS);
      await starting;
      vi.useRealTimers();

      api.translations.mockResolvedValue(reworded('Zatvoriť'));
      await service().reload();
      expect(service().t('common.close')).toBe('Zatvoriť');

      // The start's answer was made before the save: it must not put the old word back.
      before.resolve(SK_BUNDLE);
      await settled();
      expect(service().t('common.close')).toBe('Zatvoriť');
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').values['common.close']).toBe('Zatvoriť');
    });
  });

  describe('setLanguage(): the chooser', () => {
    it('loads the bundle, then switches and remembers - and the choice outlives the ?lang= of this tab', async () => {
      sessionStorage.setItem(LANGUAGE_KEY, 'en');
      await service().init();
      api.translations.mockClear();

      const server = later<TranslationBundle>();
      api.translations.mockReturnValue(server.promise);
      const switching = service().setLanguage('sk');
      expect(service().language()).toBe('en');
      server.resolve(SK_BUNDLE);

      expect(await switching).toBe(true);
      expect(service().language()).toBe('sk');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('sk');
      expect(sessionStorage.getItem(LANGUAGE_KEY)).toBeNull();
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').language).toBe('sk');
    });

    it('lets the last choice win: going back to the language on the page drops the one still on its way', async () => {
      await service().init();
      const slow = later<TranslationBundle>();
      api.translations.mockImplementation((code: string) => (code === 'sk' ? slow.promise : Promise.resolve(EN_BUNDLE)));

      const first = service().setLanguage('sk');
      // A change of mind, back to English: no request is needed - and it is a choice all the same.
      expect(await service().setLanguage('en')).toBe(true);
      slow.resolve(SK_BUNDLE);

      expect(await first).toBe(false);
      expect(service().language()).toBe('en');
      expect(service().t('common.close')).toBe('Close');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en');
    });

    it('lets the last choice win with two loads in flight: the slower, earlier answer is dropped when it comes', async () => {
      const czech: TranslationBundle = {
        language: 'cs',
        languages: [...TEST_LANGUAGES, { code: 'cs', name: 'Czech', nativeName: 'Čeština' }],
        values: { ...ENGLISH, 'common.close': 'Zavřít' },
        english: ENGLISH,
      };
      await service().init();
      const slow = later<TranslationBundle>();
      api.translations.mockImplementation((code: string) => (code === 'sk' ? slow.promise : Promise.resolve(code === 'cs' ? czech : EN_BUNDLE)));

      const first = service().setLanguage('sk');
      expect(await service().setLanguage('cs')).toBe(true);
      slow.resolve(SK_BUNDLE);

      expect(await first).toBe(false);
      expect(service().language()).toBe('cs');
      expect(service().t('common.close')).toBe('Zavřít');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('cs');
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').language).toBe('cs');
    });

    it('is not undone by a start’s answer that comes late', async () => {
      vi.useFakeTimers();
      localStorage.setItem(CACHE_KEY, JSON.stringify(SK_BUNDLE));
      browser.mockReturnValue(['sk']);
      const slow = later<TranslationBundle>();
      api.translations.mockImplementation((code: string) => (code === 'sk' ? slow.promise : Promise.resolve(EN_BUNDLE)));
      const starting = service().init();
      await vi.advanceTimersByTimeAsync(CACHE_WAIT_MS);
      await starting;
      vi.useRealTimers();
      expect(service().language()).toBe('sk');

      expect(await service().setLanguage('en')).toBe(true);
      slow.resolve(SK_BUNDLE);
      await settled();

      expect(service().language()).toBe('en');
      expect(JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}').language).toBe('en');
    });

    it('never rejects: false, and the page stays as it is, when the strings cannot be had', async () => {
      await service().init();
      api.translations.mockRejectedValue(new ApiError(503, 'database_unavailable', 'The database is unavailable.'));

      expect(await service().setLanguage('sk')).toBe(false);
      expect(service().language()).toBe('en');
      expect(service().t('common.close')).toBe('Close');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();
    });

    it('does not switch to a language the server no longer offers, and asks for nothing that is not a code', async () => {
      await service().init();
      api.translations.mockClear();

      expect(await service().setLanguage('de')).toBe(false);
      expect(service().language()).toBe('en');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBeNull();

      api.translations.mockClear();
      expect(await service().setLanguage('../admin')).toBe(false);
      expect(api.translations).not.toHaveBeenCalled();
    });
  });

  describe('an account that says how every anotoki site should look (the IAM sends its preferences - its migration 015)', () => {
    /** The site's languages and one the IAM does not have: German is this site's alone here. */
    const WITH_GERMAN = [...TEST_LANGUAGES, { code: 'de', name: 'German', nativeName: 'Deutsch' }];

    /** The next visit: a new page load, with what the browser kept. */
    function nextVisit(): void {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({
        providers: [
          { provide: ApiService, useValue: api },
          { provide: AuthService, useValue: auth },
        ],
      });
    }

    /** The account's language as the SDK passes a change of it on - saved here, in another tab, on another site: user() first, then every listener. */
    function accountSays(locale: string): void {
      user.set({ locale, preferences: PREFERENCES });
      listeners.forEach((listener) => listener());
    }

    const toasts = () =>
      TestBed.inject(ToastService)
        .toasts()
        .map((toast) => toast.message);

    it('reads the account’s language over what this device remembered - not over this tab’s ?lang= - and leaves the device’s for when nobody is signed in', async () => {
      browser.mockReturnValue(['en']);
      localStorage.setItem(LANGUAGE_KEY, 'en');
      user.set({ locale: 'sk', preferences: PREFERENCES });
      await service().init();
      expect(service().language()).toBe('sk');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en');

      // A link's ?lang= holds for its tab, over the account too.
      history.replaceState(null, '', '/?lang=en');
      await service().init();
      expect(service().language()).toBe('en');
    });

    it('reads the device’s choice next, when the site does not have the account’s language', async () => {
      browser.mockReturnValue(['en']);
      localStorage.setItem(LANGUAGE_KEY, 'sk');
      user.set({ locale: 'de', preferences: PREFERENCES });
      await service().init();
      expect(service().language()).toBe('sk');
    });

    it('saves the chooser’s choice to the account, so every site follows it - and nothing for a visitor, nor through an IAM that sends no preferences', async () => {
      browser.mockReturnValue(['en']);
      await service().init();

      expect(await service().setLanguage('sk')).toBe(true);
      user.set({ locale: 'sk' });
      expect(await service().setLanguage('en')).toBe(true);
      expect(savePreferences).not.toHaveBeenCalled();

      user.set({ locale: 'sk', preferences: PREFERENCES });
      // The language the account has already: nothing to send.
      expect(await service().setLanguage('sk')).toBe(true);
      expect(savePreferences).not.toHaveBeenCalled();
      expect(await service().setLanguage('en')).toBe(true);
      expect(savePreferences.mock.calls).toEqual([[{ language: 'en' }]]);
      // On this device too, for when nobody is signed in.
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('en');
    });

    it('saves one choice at a time, the last one last - and the answer to an earlier one does not turn the page back', async () => {
      browser.mockReturnValue(['en']);
      user.set({ locale: 'en', preferences: PREFERENCES });
      await service().init();
      const saves: { changes: unknown; answer: ReturnType<typeof later<unknown>> }[] = [];
      savePreferences.mockImplementation((changes: unknown) => {
        const answer = later<unknown>();
        saves.push({ changes, answer });
        return answer.promise;
      });
      /** The IAM takes the n-th save, as the SDK passes it on: the account first, then the promise. */
      const taken = async (n: number, locale: string): Promise<void> => {
        accountSays(locale);
        saves[n].answer.resolve({ locale, preferences: PREFERENCES });
        await settled();
      };

      expect(await service().setLanguage('sk')).toBe(true);
      expect(await service().setLanguage('en')).toBe(true);
      expect(saves.map((save) => save.changes)).toEqual([{ language: 'sk' }]);

      // The account took Slovak: the page stays in English, the latest choice - which is saved now.
      await taken(0, 'sk');
      expect(service().language()).toBe('en');
      expect(saves.map((save) => save.changes)).toEqual([{ language: 'sk' }, { language: 'en' }]);

      await taken(1, 'en');
      expect(service().language()).toBe('en');
      expect(saves).toHaveLength(2);
    });

    it('keeps a language the IAM does not offer as this site’s own for the visit, and says nothing - the next visit reads the account’s again', async () => {
      const german: TranslationBundle = { language: 'de', languages: WITH_GERMAN, values: ENGLISH, english: ENGLISH };
      api.translations.mockImplementation((code: string) => Promise.resolve(code === 'de' ? german : { ...(code === 'sk' ? SK_BUNDLE : EN_BUNDLE), languages: WITH_GERMAN }));
      browser.mockReturnValue(['en']);
      user.set({ locale: 'sk', preferences: PREFERENCES });
      await service().init();
      expect(service().language()).toBe('sk');

      savePreferences.mockRejectedValue(Object.assign(new Error('Not a language the IAM offers'), { code: 'invalid_request' }));
      expect(await service().setLanguage('de')).toBe(true);
      await settled();
      expect(savePreferences.mock.calls).toEqual([[{ language: 'de' }]]);
      expect(service().language()).toBe('de');
      expect(toasts()).toEqual([]);

      // For the rest of the visit: the strings read again (the admin panel saved some) are still German - over the account's Slovak.
      await service().reload();
      expect(service().language()).toBe('de');

      nextVisit();
      await service().init();
      expect(service().language()).toBe('sk');
    });

    it('says so when the account could not be reached - and the page stays in the chosen language for the visit', async () => {
      browser.mockReturnValue(['en']);
      user.set({ locale: 'en', preferences: PREFERENCES });
      await service().init();
      savePreferences.mockRejectedValue(Object.assign(new Error('The IAM could not be reached'), { code: 'network' }));

      expect(await service().setLanguage('sk')).toBe(true);
      await settled();
      expect(service().language()).toBe('sk');
      expect(toasts()).toEqual(['Jazyk sa nepodarilo uložiť do Vášho anotoki účtu – platí len počas tejto návštevy.']);
      await service().reload();
      expect(service().language()).toBe('sk');
    });

    it('follows a change of the account’s language when it comes - over the device’s choice, and over a choice made earlier on this page', async () => {
      browser.mockReturnValue(['en']);
      localStorage.setItem(LANGUAGE_KEY, 'en');
      user.set({ locale: 'sk', preferences: PREFERENCES });
      await service().init();
      expect(service().language()).toBe('sk');

      // Changed on the IAM's account page, on another anotoki site, in another tab.
      accountSays('en');
      await vi.waitFor(() => expect(service().language()).toBe('en'));

      // Chosen here and saved, then changed elsewhere again: the newer wish wins - and still does when the strings are read again.
      savePreferences.mockImplementation(async (changes: { language: string }) => {
        accountSays(changes.language);
        return {};
      });
      expect(await service().setLanguage('sk')).toBe(true);
      await settled();
      expect(service().language()).toBe('sk');
      accountSays('en');
      await vi.waitFor(() => expect(service().language()).toBe('en'));
      await service().reload();
      expect(service().language()).toBe('en');
      expect(localStorage.getItem(LANGUAGE_KEY)).toBe('sk');
    });

    it('does not follow it over this tab’s ?lang=', async () => {
      browser.mockReturnValue(['en']);
      history.replaceState(null, '', '/?lang=en');
      user.set({ locale: 'en', preferences: PREFERENCES });
      await service().init();

      accountSays('sk');
      await settled();
      expect(service().language()).toBe('en');
    });
  });
});

describe('TranslationService: wording', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  function slovak(): TranslationService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] });
    return TestBed.inject(TranslationService);
  }

  function english(): TranslationService {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTestTranslations(ENGLISH)] });
    return TestBed.inject(TranslationService);
  }

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('fills placeholders in one pass: what a parameter holds is never filled again', () => {
    const i18n = english();
    expect(i18n.t('home.hello', { name: '{count}', count: 3 })).toBe('Hello {count}, you have 3.');
    expect(i18n.t('home.hello', { name: 'Anna {name}', count: '{name}' })).toBe('Hello Anna {name}, you have {name}.');
  });

  it('leaves a placeholder with no parameter as written', () => {
    const i18n = english();
    expect(i18n.t('home.hello')).toBe('Hello {name}, you have {count}.');
    expect(i18n.t('home.hello', { name: 'Anna' })).toBe('Hello Anna, you have {count}.');
    expect(i18n.t('home.hello', { name: null, count: 0 })).toBe('Hello {name}, you have 0.');
    // Not a name a parameter object merely inherits: `constructor` and `toString` are on every object.
    expect(i18n.t('home.proto', { count: 1 })).toBe('x {constructor} {toString} y');
    expect(i18n.t('home.proto', { constructor: 'a', toString: 'b' })).toBe('x a b y');
  });

  it('gives an unknown key back as itself and warns once', () => {
    const i18n = english();
    expect(i18n.t('home.missing')).toBe('home.missing');
    expect(i18n.t('home.missing', { name: 'x' })).toBe('home.missing');
    expect(warn.mock.calls).toEqual([["[i18n] no string for 'home.missing'"]]);
  });

  it('has only the keys of the bundle - nothing an object would inherit', () => {
    const i18n = english();
    expect(i18n.has('common.close')).toBe(true);
    expect(i18n.has('constructor')).toBe(false);
    expect(i18n.has('toString')).toBe(false);
    expect(i18n.has('__proto__')).toBe(false);
    expect(i18n.t('constructor')).toBe('constructor');
  });

  it('cuts a sentence around a placeholder before filling the halves', () => {
    const i18n = english();
    expect(i18n.around('home.by', 'name', { site: 'anotoki' })).toEqual(['Written by ', ' for anotoki.', true]);
    // The cut is made in the stored string: a parameter cannot move it.
    expect(i18n.around('home.by', 'site', { name: '{site}' })).toEqual(['Written by {site} for ', '.', true]);
    expect(slovak().around('home.by', 'name', { site: 'anotoki' })).toEqual(['Napísal ', ' pre anotoki.', true]);
  });

  it('says when the cut was not made, so the page does not glue the value onto a sentence that left it out - or onto a key', () => {
    const i18n = english();
    // A string without the placeholder (another language may leave one out): the whole sentence, and nothing to mark up.
    expect(i18n.around('common.close', 'name')).toEqual(['Close', '', false]);
    expect(i18n.around('home.by', 'author', { name: 'Anna', site: 'anotoki' })).toEqual(['Written by Anna for anotoki.', '', false]);
    // No string at all: the key, as everywhere - and it warns.
    expect(i18n.around('home.missing', 'name')).toEqual(['home.missing', '', false]);
    expect(warn.mock.calls).toEqual([["[i18n] no string for 'home.missing'"]]);
  });

  it('picks the plural form English asks for', () => {
    const i18n = english();
    expect([0, 1, 2, 5, 12].map((count) => i18n.plural('home.questions', count))).toEqual(['0 questions', '1 question', '2 questions', '5 questions', '12 questions']);
  });

  it('picks the plural form Slovak asks for: 1, 2 to 4, and 0 with 5 and more', () => {
    const i18n = slovak();
    expect([0, 1, 2, 3, 4, 5, 12, 22].map((count) => i18n.plural('home.questions', count))).toEqual(['0 otázok', '1 otázka', '2 otázky', '3 otázky', '4 otázky', '5 otázok', '12 otázok', '22 otázok']);
    // A form the family does not have (Slovak "many", for fractions) is the family's "other".
    expect(i18n.plural('home.questions', 1.5)).toBe('1.5 otázok');
    // Inside a family the number is {count}, whatever else is handed in.
    expect(i18n.plural('home.questions', 3, { count: 99 })).toBe('3 otázky');
  });

  it('is English in the admin area, whatever the person reads - and says so on <html lang>', () => {
    const i18n = slovak();
    TestBed.tick();
    expect(i18n.effectiveLanguage()).toBe('sk');
    expect(i18n.locale()).toBe('sk-SK');
    expect(document.documentElement.lang).toBe('sk');

    for (const address of ['/admin', '/admin/', '/admin/surveys/12/edit', '/admin?tab=people', '/admin#top']) {
      i18n.noteAddress(address);
      expect(i18n.inAdmin(), address).toBe(true);
    }
    TestBed.tick();
    expect(i18n.language()).toBe('sk');
    expect(i18n.effectiveLanguage()).toBe('en');
    expect(i18n.locale()).toBe('en-GB');
    expect(i18n.t('common.close')).toBe('Close');
    expect(i18n.plural('home.questions', 3)).toBe('3 questions');
    expect(document.documentElement.lang).toBe('en');

    for (const address of ['/', '/administrators', '/genshin-1-0', '/preview/admin', '/x?next=/admin/']) {
      i18n.noteAddress(address);
      expect(i18n.inAdmin(), address).toBe(false);
    }
    TestBed.tick();
    expect(i18n.t('common.close')).toBe('Zavrieť');
    expect(document.documentElement.lang).toBe('sk');
  });

  it('switches between the bundles a spec was given, with no HTTP', async () => {
    const i18n = slovak();
    expect(await i18n.setLanguage('en', false)).toBe(true);
    expect(i18n.t('common.close')).toBe('Close');
    expect(await i18n.setLanguage('sk', false)).toBe(true);
    expect(i18n.t('common.close')).toBe('Zavrieť');
  });

  it('has a reload() in a spec that answers at once and leaves the language the spec chose', async () => {
    const i18n = slovak();
    await expect(i18n.reload()).resolves.toBeUndefined();
    expect(i18n.language()).toBe('sk');
    expect(i18n.t('common.close')).toBe('Zavrieť');
  });
});
