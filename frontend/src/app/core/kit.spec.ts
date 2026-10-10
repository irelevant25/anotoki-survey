import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ThemeService } from '@anotoki/lib/shell';
import { AnotokiIcons, AnotokiWords } from '@anotoki/lib/ui';
import { type AnotokiPreferences, type AnotokiTheme } from './auth/anotoki-auth';
import { AuthService } from './auth/auth.service';
import { TranslationService } from './i18n/translation.service';
import { SURVEY_ICONS, THEME_KEY, provideSiteShell, shellConfig } from './kit';
import { provideTestTranslations } from './testing/test-translations';

/** The site's own strings for some of the kit's words, as an administrator may have reworded them. */
const SLOVAK = {
  'common.signIn': 'Prihláste sa',
  'common.signOut': 'Odhlásiť sa',
  'common.close': 'Zavrieť',
  'toast.region': 'Oznámenia stránky',
  'topbar.menuButton': 'Vaša ponuka: {name}',
  'language.button': 'Jazyk: {name} ({code})',
  'theme.notSaved': 'Vzhľad sa nepodarilo uložiť do Vášho anotoki účtu. Skúste to, prosím, znova.',
};
const ENGLISH = {
  'common.signIn': 'Sign in',
  'common.signOut': 'Sign out',
  'common.close': 'Close',
  'toast.region': 'Notifications',
  'topbar.menuButton': 'Your menu: {name}',
  'language.button': 'Language: {name} ({code})',
  'theme.notSaved': 'The theme could not be saved to your anotoki account. Please try again.',
};

describe('The kit’s words: the site’s own strings, and formal Slovak', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] }));

  it('a kit word the site has a string for reads the site’s string - reworded in the admin panel too - in the language on the page', () => {
    const words = TestBed.inject(AnotokiWords);
    expect(words.t('topbar.signIn')).toBe('Prihláste sa');
    expect(words.t('ui.close')).toBe('Zavrieť');
    expect(words.t('ui.notifications')).toBe('Oznámenia stránky');
    expect(words.t('topbar.menuButton', { name: 'owner' })).toBe('Vaša ponuka: owner');
    expect(words.t('language.button', { name: 'Slovenčina', code: 'SK' })).toBe('Jazyk: Slovenčina (SK)');
    expect(words.lang()).toBe('sk');
  });

  it('in the admin panel the kit reads English, as the rest of the bar does', () => {
    TestBed.inject(TranslationService).noteAddress('/admin/translations');
    const words = TestBed.inject(AnotokiWords);
    expect(words.t('topbar.signIn')).toBe('Sign in');
    expect(words.t('topbar.menuButton', { name: 'owner' })).toBe('Your menu: owner');
    expect(words.lang()).toBe('en');
  });

  it('a kit word the site has no string for addresses a Slovak reader formally - never the kit’s informal ty', () => {
    const words = TestBed.inject(AnotokiWords);
    // No strings for these here: the site's formal Slovak stands in.
    expect(words.t('topbar.menu')).toBe('Vaša ponuka');
    expect(words.t('topbar.account')).toBe('Váš anotoki účet');
    expect(words.t('language.notLoaded')).toBe('Jazyk sa nepodarilo načítať. Skúste to, prosím, znova.');
    expect(words.t('language.notSaved')).toBe('Jazyk sa nepodarilo uložiť do Vášho anotoki účtu – platí len počas tejto návštevy.');
    expect(words.t('ui.copyFailed')).toBe('Kopírovanie nefungovalo. Označte text a skopírujte ho ručne.');
    // And one with no form of address is the kit's own.
    expect(words.t('topbar.saving')).toBe('Ukladá sa…');
  });

  it('every icon the site registers is drawn, beside the kit’s own', () => {
    const icons = TestBed.inject(AnotokiIcons);
    for (const name of [...Object.keys(SURVEY_ICONS), 'sun', 'x', 'logIn']) {
      expect(icons.has(name), name).toBe(true);
    }
  });
});

describe('The kit’s shell: the anotoki account’s theme, and the site’s languages', () => {
  /** AuthService.preferences(): null while nobody is signed in - or the IAM sends none - else the account's. */
  const preferences = signal<AnotokiPreferences | null>(null);
  const savePreferences = vi.fn();
  /** The saves sent, each with the answer the test gives it. */
  let saves: { changes: unknown; answer: { resolve: (value: unknown) => void; reject: (error: unknown) => void } }[] = [];

  const account = (theme: AnotokiTheme): AnotokiPreferences => ({ theme, date_format: null, time_format: null });
  const settled = (): Promise<void> => new Promise((done) => setTimeout(done));

  /** The library's ThemeService, as this site configures it, its effects run. */
  function service(): ThemeService {
    const theme = TestBed.inject(ThemeService);
    TestBed.tick();
    return theme;
  }

  beforeEach(() => {
    localStorage.clear();
    preferences.set(null);
    saves = [];
    savePreferences.mockReset().mockImplementation(
      (changes: unknown) =>
        new Promise((resolve, reject) => {
          saves.push({ changes, answer: { resolve, reject } });
        }),
    );
    TestBed.configureTestingModule({
      providers: [provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }), provideSiteShell(), { provide: AuthService, useValue: { preferences, savePreferences } }],
    });
  });

  afterEach(() => localStorage.clear());

  it('signed out - or signed in through an IAM that sends no preferences: this device’s theme, kept where theme-boot.js reads it, and saved nowhere else', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    const theme = service();
    expect(theme.mode()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');

    theme.set('light');
    TestBed.tick();
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(savePreferences).not.toHaveBeenCalled();
  });

  it('signed in: the account’s theme, and a choice saved to it - one save at a time, the last choice last', async () => {
    localStorage.setItem(THEME_KEY, 'light');
    const theme = service();
    preferences.set(account('dark'));
    TestBed.tick();
    expect(theme.mode()).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');

    theme.set('light');
    theme.set('auto');
    expect(theme.mode()).toBe('auto');
    expect(saves.map((save) => save.changes)).toEqual([{ theme: 'light' }]);

    preferences.set(account('light'));
    saves[0].answer.resolve({ locale: 'sk', preferences: account('light') });
    await settled();
    TestBed.tick();
    expect(theme.mode()).toBe('auto');
    expect(saves.map((save) => save.changes)).toEqual([{ theme: 'light' }, { theme: 'auto' }]);
  });

  it('a refusal puts the account’s theme back, and the switch says so in the site’s words', async () => {
    preferences.set(account('light'));
    const theme = service();

    theme.set('dark');
    saves[0].answer.reject(Object.assign(new Error('The IAM could not be reached'), { code: 'network' }));
    await settled();
    TestBed.tick();

    expect(theme.mode()).toBe('light');
    expect(theme.refused()).toBe(true);
    expect(TestBed.inject(AnotokiWords).t('theme.notSaved')).toBe('Vzhľad sa nepodarilo uložiť do Vášho anotoki účtu. Skúste to, prosím, znova.');
  });

  it('the languages: the site’s, each by the name its speakers give it; choosing one is the site’s own choice - the one on the page with nothing on its way changes nothing', async () => {
    const i18n = TestBed.inject(TranslationService);
    const setLanguage = vi.spyOn(i18n, 'setLanguage');
    const languages = shellConfig(TestBed.inject(AuthService), i18n).languages!;

    expect(languages.current()).toBe('sk');
    expect(languages.offered()).toEqual([
      { code: 'en', name: 'English' },
      { code: 'sk', name: 'Slovenčina' },
    ]);

    expect(await languages.choose('sk')).toBe(true);
    expect(setLanguage).not.toHaveBeenCalled();

    expect(await languages.choose('en')).toBe(true);
    expect(setLanguage).toHaveBeenCalledWith('en');
    expect(languages.current()).toBe('en');
  });

  it('back to the language on the page while another is on its way is a choice like any other: it drops the one on its way', async () => {
    const i18n = TestBed.inject(TranslationService);
    const setLanguage = vi.spyOn(i18n, 'setLanguage');
    const languages = shellConfig(TestBed.inject(AuthService), i18n).languages!;

    const english = languages.choose('en');
    const slovak = languages.choose('sk');
    expect(setLanguage.mock.calls.map((call) => call[0])).toEqual(['en', 'sk']);
    expect(await english).toBe(false);
    expect(await slovak).toBe(true);
    expect(languages.current()).toBe('sk');
  });
});
