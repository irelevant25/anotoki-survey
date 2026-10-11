import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslationService, translationSettings } from '@anotoki/lib/translations';
import { LIBRARY_WORDS } from '@anotoki/lib/words';
import { type AnotokiPreferences } from '@anotoki/lib/auth';
import { AuthService, BootStatus } from './auth/auth.service';
import { Person } from './survey/survey.model';
import { FORMAL_SLOVAK, provideSiteTranslations, siteTranslationsConfig } from './translations';

/** The bundles as the server answers them now: the family's wire format. */
const LANGUAGES = [
  { code: 'en', name: 'English', native_name: 'English' },
  { code: 'sk', name: 'Slovak', native_name: 'Slovenčina' },
];
const SK = { language: 'sk', languages: LANGUAGES, values: { 'home.title': 'Prieskumy' }, english: { 'home.title': 'Surveys' } };

describe('The site’s words through the family’s translations module (core/translations.ts)', () => {
  const status = signal<BootStatus>('ready');
  const person = signal<Person | null>(null);
  const roles = signal<string[]>([]);
  const preferences = signal<AnotokiPreferences | null>(null);
  const locale = signal<string | null>(null);
  const auth = {
    status,
    person,
    signedIn: () => person() !== null,
    user: () => (person() ? { locale: locale() } : null),
    preferences: () => preferences(),
    isStaff: () => roles().includes('ADMIN') || roles().includes('EDITOR'),
    savePreferences: vi.fn(async (_changes: object) => ({})),
  };
  const config = () => siteTranslationsConfig(auth as unknown as AuthService);

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    status.set('ready');
    person.set(null);
    roles.set([]);
    preferences.set(null);
    locale.set(null);
    auth.savePreferences.mockClear();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps the names the site always had: a returning reader’s choice, cached words and an editor’s drafts survive the upgrade', () => {
    expect(translationSettings(config()).keys).toEqual({
      language: 'anotoki-survey:language',
      cache: 'anotoki-survey:language-cache',
      drafts: 'anotoki-survey:localization-drafts',
    });
  });

  it('the anotoki account: its language only while somebody is signed in, deciding only while it keeps the person’s choices; a choice saved with the SDK', async () => {
    const account = config().account!;
    locale.set('sk');
    expect(account.language()).toBeNull();
    expect(account.decides!()).toBe(false);
    expect(account.userKey!()).toBeNull();

    person.set({ id: '7', name: 'owner' });
    expect(account.language()).toBe('sk');
    expect(account.decides!()).toBe(false);
    expect(account.userKey!()).toBe('7');
    preferences.set({ theme: 'auto', date_format: null, time_format: null });
    expect(account.decides!()).toBe(true);

    await account.save!('en');
    expect(auth.savePreferences).toHaveBeenCalledWith({ language: 'en' });
  });

  it('asks the server nothing while the site cannot start, and the admin pages are an editor’s and an administrator’s - nobody else’s', () => {
    const settings = config();
    expect(settings.canAsk!()).toBe(true);
    status.set('error');
    expect(settings.canAsk!()).toBe(false);

    const allows = settings.admin!.allows!;
    for (const [who, expected] of [
      [[], false],
      [['MEMBER'], false],
      [['EDITOR'], true],
      [['ADMIN'], true],
    ] as const) {
      roles.set([...who]);
      expect([allows.strings!(), allows.languages!()], who.join() || 'nobody').toEqual([expected, expected]);
    }
    expect(settings.admin!.routes).toEqual({ translations: '/admin/translations', languages: '/admin/languages', migrations: '/admin/migrations' });
  });

  it('says the library’s words that speak to the reader formally in Slovak - never the library’s informal ty', () => {
    expect(config().libraryWords).toEqual({ sk: FORMAL_SLOVAK });
    // Every library word, the kit's and each module's (the sign-in's too).
    const informal: Readonly<Record<string, string>> = LIBRARY_WORDS.sk;
    for (const [key, words] of Object.entries(FORMAL_SLOVAK)) {
      expect(words, key).toMatch(/Vaša|Váš|Vás|Skúste|Označte|Povoľte/);
      expect(Object.hasOwn(informal, key), `${key} is one of the library's words`).toBe(true);
      expect(words, key).not.toBe(informal[key]);
    }
  });

  describe('the service as the site has it', () => {
    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [provideHttpClient(), provideHttpClientTesting(), provideSiteTranslations(), { provide: AuthService, useValue: auth }],
      });
    });

    it('a reader’s choice from before the upgrade is still theirs: the start asks for it', async () => {
      localStorage.setItem('anotoki-survey:language', 'sk');
      const i18n = TestBed.inject(TranslationService);
      const started = i18n.init();
      TestBed.inject(HttpTestingController).expectOne('/api/translations/sk').flush(SK);
      await started;
      expect([i18n.language(), i18n.t('home.title')]).toEqual(['sk', 'Prieskumy']);
      expect(JSON.parse(localStorage.getItem('anotoki-survey:language-cache') ?? 'null')).toEqual(SK);
    });

    it('a cached bundle in the shape before the upgrade (nativeName) is no bundle: dropped, and the words asked for afresh', async () => {
      localStorage.setItem('anotoki-survey:language', 'sk');
      localStorage.setItem(
        'anotoki-survey:language-cache',
        JSON.stringify({ language: 'sk', languages: [{ code: 'sk', name: 'Slovak', nativeName: 'Slovenčina' }], values: { 'home.title': 'Staré' }, english: {} }),
      );
      const i18n = TestBed.inject(TranslationService);
      const started = i18n.init();
      expect(i18n.ready()).toBe(false);
      TestBed.inject(HttpTestingController).expectOne('/api/translations/sk').flush(SK);
      await started;
      expect(i18n.t('home.title')).toBe('Prieskumy');
    });

    it('asks for nothing while the site cannot start - and draws what it has', async () => {
      status.set('error');
      const i18n = TestBed.inject(TranslationService);
      await i18n.init();
      TestBed.inject(HttpTestingController).expectNone(() => true);
      expect(i18n.ready()).toBe(false);
      // The library's words still read, never as keys - its own English on this English page.
      expect(i18n.t('anotoki.topbar.menu')).toBe('Your menu');
    });
  });
});
