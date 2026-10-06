import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ToastService } from '../../ui/toast/toast.service';
import { type AnotokiPreferences, type AnotokiTheme } from '../auth/anotoki-auth';
import { AuthService } from '../auth/auth.service';
import { provideTestTranslations } from '../testing/test-translations';
import { ThemeService } from './theme.service';

/** Shared with public/theme-boot.js, which reads it before first paint. */
const THEME_KEY = 'anotoki-survey:theme';

const ENGLISH = { 'theme.notSaved': 'The theme could not be saved to your anotoki account. Please try again.' };
const SLOVAK = { 'theme.notSaved': 'Vzhľad sa nepodarilo uložiť do Vášho anotoki účtu. Skúste to, prosím, znova.' };

/** An account's preferences as the SDK hands them over, with this theme. */
function account(theme: AnotokiTheme): AnotokiPreferences {
  return { theme, date_format: null, time_format: null };
}

/** A promise the test settles by hand: the IAM's answer, when the test says. */
function later<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

/** Everything already on its way has run: the answers settled, and what follows them. */
function settled(): Promise<void> {
  return new Promise((done) => setTimeout(done));
}

describe('ThemeService: the device’s theme, or the anotoki account’s', () => {
  /** AuthService.preferences(): null while nobody is signed in - or the IAM sends none - else the account's. */
  const preferences = signal<AnotokiPreferences | null>(null);
  const savePreferences = vi.fn();
  /** The saves sent, each with the answer the test gives it. */
  let saves: { changes: unknown; answer: ReturnType<typeof later<unknown>> }[] = [];

  /** The service as the site starts it, its effects run. */
  function service(): ThemeService {
    const theme = TestBed.inject(ThemeService);
    TestBed.tick();
    return theme;
  }

  /** The IAM takes the n-th save, as the SDK passes it on: the account in user() first, then the promise. */
  async function taken(n: number, theme: AnotokiTheme): Promise<void> {
    preferences.set(account(theme));
    saves[n].answer.resolve({ locale: 'sk', preferences: account(theme) });
    await settled();
    TestBed.tick();
  }

  const toasts = () =>
    TestBed.inject(ToastService)
      .toasts()
      .map((toast) => toast.message);

  beforeEach(() => {
    localStorage.clear();
    preferences.set(null);
    saves = [];
    savePreferences.mockReset().mockImplementation((changes: unknown) => {
      const answer = later<unknown>();
      saves.push({ changes, answer });
      return answer.promise;
    });
    TestBed.configureTestingModule({
      providers: [provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }), { provide: AuthService, useValue: { preferences, savePreferences } }],
    });
  });

  afterEach(() => localStorage.clear());

  it('signed out - or signed in through an IAM that sends no preferences: this device’s theme, as ever, and saved nowhere else', () => {
    localStorage.setItem(THEME_KEY, 'dark');
    const theme = service();
    expect(theme.mode()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');

    theme.set('light');
    TestBed.tick();
    expect(theme.mode()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(savePreferences).not.toHaveBeenCalled();
  });

  it('signed in: the account’s theme the moment it is known, and whenever it changes - kept on the device for the next first paint', () => {
    localStorage.setItem(THEME_KEY, 'light');
    const theme = service();
    expect(theme.mode()).toBe('light');

    // The sign-in: the account says dark.
    preferences.set(account('dark'));
    TestBed.tick();
    expect(theme.mode()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');

    // Changed on another anotoki site, brought by the next token: followed. Automatic keeps nothing, as ever - theme-boot.js asks the system then.
    preferences.set(account('auto'));
    TestBed.tick();
    expect(theme.mode()).toBe('auto');
    expect(localStorage.getItem(THEME_KEY)).toBeNull();
    expect(savePreferences).not.toHaveBeenCalled();
  });

  it('a choice is shown at once and saved to the account, which every anotoki site follows - nothing is sent for the theme it has', async () => {
    preferences.set(account('light'));
    const theme = service();

    theme.set('light');
    expect(savePreferences).not.toHaveBeenCalled();

    theme.set('dark');
    expect(theme.mode()).toBe('dark');
    expect(localStorage.getItem(THEME_KEY)).toBe('dark');
    expect(saves.map((save) => save.changes)).toEqual([{ theme: 'dark' }]);

    await taken(0, 'dark');
    expect(theme.mode()).toBe('dark');
    expect(toasts()).toEqual([]);
  });

  it('one save at a time, the last choice last - and the answer to an earlier one does not turn the page back', async () => {
    preferences.set(account('light'));
    const theme = service();

    theme.set('dark');
    theme.set('light');
    theme.set('auto');
    expect(theme.mode()).toBe('auto');
    expect(saves.map((save) => save.changes)).toEqual([{ theme: 'dark' }]);

    // The account took dark: the page stays on the latest choice, which is saved now.
    await taken(0, 'dark');
    expect(theme.mode()).toBe('auto');
    expect(saves.map((save) => save.changes)).toEqual([{ theme: 'dark' }, { theme: 'auto' }]);

    await taken(1, 'auto');
    expect(theme.mode()).toBe('auto');
    expect(saves).toHaveLength(2);
  });

  it('a refusal puts the account’s theme back, and says so in the language on the page', async () => {
    preferences.set(account('light'));
    const theme = service();

    theme.set('dark');
    expect(theme.mode()).toBe('dark');
    saves[0].answer.reject(Object.assign(new Error('The IAM could not be reached'), { code: 'network' }));
    await settled();
    TestBed.tick();

    expect(theme.mode()).toBe('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');
    expect(toasts()).toEqual(['Vzhľad sa nepodarilo uložiť do Vášho anotoki účtu. Skúste to, prosím, znova.']);
  });

  it('a refusal overtaken by a later choice is no news: the later choice is saved, and stays', async () => {
    preferences.set(account('light'));
    const theme = service();

    theme.set('dark');
    theme.set('auto');
    saves[0].answer.reject(Object.assign(new Error('The IAM could not be reached'), { code: 'network' }));
    await settled();
    TestBed.tick();

    expect(theme.mode()).toBe('auto');
    expect(saves.map((save) => save.changes)).toEqual([{ theme: 'dark' }, { theme: 'auto' }]);
    expect(toasts()).toEqual([]);
  });
});
