import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminStore } from '../../core/admin/admin-store.service';
import { LOCALIZATION_DRAFTS_KEY, LocalizationDrafts } from '../../core/admin/localization-drafts.service';
import { AuthService } from '../../core/auth/auth.service';
import { TranslationService } from '../../core/i18n/translation.service';
import { Person } from '../../core/survey/survey.model';
import { provideTestTranslations } from '../../core/testing/test-translations';
import { ConfirmService } from '../../ui/confirm/confirm.service';
import { TopBarComponent } from './top-bar.component';

const ENGLISH = {
  'brand.area': 'survey',
  'topbar.home': 'anotoki survey: the open surveys',
  'topbar.homeAdmin': 'anotoki survey: all surveys',
  'topbar.menuButton': 'Your menu: {name}',
  'topbar.menu': 'Your menu',
  'topbar.roleAdmin': 'Administrator',
  'topbar.roleEditor': 'Editor',
  'topbar.account': 'Your anotoki account',
  'topbar.openSurveys': 'The open surveys',
  'topbar.admin': 'Admin',
  'topbar.signOutUnsaved.title': 'Sign out without your latest changes?',
  'topbar.signOutUnsaved.message': 'Some changes to a survey are not saved - the editor says why above the survey. Signed out, they cannot be saved any more.',
  'topbar.signOutUnsaved.strings': "Some changes to the site's strings or languages are not saved - the Translations and Languages pages show them. Signed out, they are lost.",
  'topbar.signOutUnsaved.confirm': 'Sign out anyway',
  'topbar.signOutUnsaved.stay': 'Stay',
  'common.signIn': 'Sign in',
  'common.signOut': 'Sign out',
  'theme.label': 'Theme',
  'theme.light': 'Light',
  'theme.dark': 'Dark',
  'theme.auto': 'Automatic',
  'theme.autoHint': 'As your device is set',
  'language.button': 'Language: {name}',
};
const SLOVAK = {
  'brand.area': 'prieskum',
  'topbar.home': 'anotoki prieskum: otvorené prieskumy',
  'topbar.homeAdmin': 'anotoki prieskum: všetky prieskumy',
  'topbar.menuButton': 'Vaša ponuka: {name}',
  'topbar.menu': 'Vaša ponuka',
  'topbar.roleAdmin': 'Rola: administrátor',
  'topbar.roleEditor': 'Rola: editor',
  'topbar.account': 'Váš anotoki účet',
  'topbar.openSurveys': 'Otvorené prieskumy',
  'topbar.admin': 'Administrácia',
  'topbar.signOutUnsaved.title': 'Odhlásiť sa bez uloženia posledných zmien?',
  'topbar.signOutUnsaved.message': 'Niektoré zmeny v prieskume nie sú uložené – dôvod nájdete v editore nad prieskumom. Po odhlásení ich už nebude možné uložiť.',
  'topbar.signOutUnsaved.strings': 'Niektoré zmeny v textoch alebo jazykoch stránky nie sú uložené – nájdete ich na stránkach „Translations“ a „Languages“. Po odhlásení sa stratia.',
  'topbar.signOutUnsaved.confirm': 'Aj tak sa odhlásiť',
  'topbar.signOutUnsaved.stay': 'Zostať',
  'common.signIn': 'Prihlásiť sa',
  'common.signOut': 'Odhlásiť sa',
  'theme.label': 'Vzhľad',
  'theme.light': 'Svetlý',
  'theme.dark': 'Tmavý',
  'theme.auto': 'Systémový',
  'theme.autoHint': 'Podľa nastavenia systému',
  'language.button': 'Jazyk: {name}',
};

describe('TopBarComponent', () => {
  const person = signal<Person | null>(null);
  const roles = signal<string[]>([]);
  const auth = {
    status: signal('ready'),
    user: signal(null),
    person,
    signedIn: () => person() !== null,
    isAdmin: () => roles().includes('ADMIN'),
    isStaff: () => roles().includes('ADMIN') || roles().includes('EDITOR'),
    accountUrl: () => 'https://iam.example.test/account',
    onAuthChange: () => () => undefined,
    signIn: vi.fn(),
    signOut: vi.fn(),
  };
  const store = { flushAll: vi.fn(async () => true) };

  let fixture: ComponentFixture<TopBarComponent>;
  let host: HTMLElement;

  const menuButton = () => host.querySelector<HTMLButtonElement>('.user-button')!;
  const items = () => Array.from(host.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  const words = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim();

  async function draw(area: 'survey' | 'admin' = 'survey'): Promise<void> {
    fixture = TestBed.createComponent(TopBarComponent);
    fixture.componentRef.setInput('area', area);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await fixture.whenStable();
  }

  async function openMenu(): Promise<void> {
    menuButton().click();
    await fixture.whenStable();
  }

  /** The menu's "Sign out", chosen. */
  async function chooseSignOut(label = 'Odhlásiť sa'): Promise<void> {
    await openMenu();
    items()
      .find((item) => words(item) === label)!
      .click();
    await fixture.whenStable();
  }

  beforeEach(() => {
    sessionStorage.clear();
    person.set({ id: '7', name: 'owner', email: 'owner@example.test' });
    roles.set(['ADMIN']);
    auth.signIn.mockClear();
    auth.signOut.mockClear();
    store.flushAll.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }), provideRouter([]), { provide: AuthService, useValue: auth }, { provide: AdminStore, useValue: store }],
    });
  });

  afterEach(() => {
    host.remove();
    sessionStorage.clear();
  });

  it('moves focus into the menu when it opens, and back to its button on Escape', async () => {
    await draw();
    expect(items()).toEqual([]);

    await openMenu();
    expect(menuButton().getAttribute('aria-expanded')).toBe('true');
    expect(items().length).toBeGreaterThan(1);
    // The first item - the menu is drawn by the time focus is asked for.
    expect(document.activeElement).toBe(items()[0]);

    items()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items()[1]);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(items()).toEqual([]);
    expect(document.activeElement).toBe(menuButton());
  });

  it('reads in the person’s language where people take surveys', async () => {
    await draw();
    expect(words(host.querySelector('app-brand .area'))).toBe('prieskum');
    expect(host.querySelector('app-brand a')?.getAttribute('aria-label')).toBe('anotoki prieskum: otvorené prieskumy');
    expect(menuButton().getAttribute('aria-label')).toBe('Vaša ponuka: owner');

    await openMenu();
    expect(host.querySelector('[role="menu"]')?.getAttribute('aria-label')).toBe('Vaša ponuka');
    expect(words(host.querySelector('.menu-role'))).toBe('Rola: administrátor');
    expect(items().map(words)).toEqual(['Váš anotoki účet', 'Administrácia', 'Odhlásiť sa']);

    roles.set(['EDITOR']);
    await fixture.whenStable();
    expect(words(host.querySelector('.menu-role'))).toBe('Rola: editor');

    roles.set([]);
    await fixture.whenStable();
    expect(host.querySelector('.menu-role')).toBeNull();
    expect(items().map(words)).toEqual(['Váš anotoki účet', 'Odhlásiť sa']);
  });

  it('reads in English in the admin area, whatever the person reads - with no case of its own', async () => {
    TestBed.inject(TranslationService).noteAddress('/admin/surveys');
    await draw('admin');
    expect(words(host.querySelector('app-brand .area'))).toBe('survey');
    expect(host.querySelector('app-brand a')?.getAttribute('aria-label')).toBe('anotoki survey: all surveys');
    expect(menuButton().getAttribute('aria-label')).toBe('Your menu: owner');
    // No chooser there: the admin area is English.
    expect(host.querySelector('app-language-switcher')).toBeNull();

    await openMenu();
    expect(words(host.querySelector('.menu-role'))).toBe('Administrator');
    expect(items().map(words)).toEqual(['Your anotoki account', 'The open surveys', 'Sign out']);
  });

  it('follows a change of language without being drawn again', async () => {
    await draw();
    expect(menuButton().getAttribute('aria-label')).toBe('Vaša ponuka: owner');
    await TestBed.inject(TranslationService).setLanguage('en', false);
    await fixture.whenStable();
    expect(menuButton().getAttribute('aria-label')).toBe('Your menu: owner');
    expect(words(host.querySelector('app-brand .area'))).toBe('survey');
  });

  it('signed out: the button to sign in, which opens the IAM in the person’s language', async () => {
    person.set(null);
    roles.set([]);
    await draw();
    const button = host.querySelector<HTMLButtonElement>('button.btn-primary')!;
    expect(words(button)).toBe('Prihlásiť sa');
    button.click();
    expect(auth.signIn).toHaveBeenCalledWith(undefined, 'sk');
  });

  describe('the words beside the mark, on a phone', () => {
    /** A window `width` wide, as the bar's media queries see it. */
    function windowOf(width: number): void {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: width <= Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity),
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }));
    }
    const wordmark = () => host.querySelector('app-brand .wordmark');

    afterEach(() => vi.unstubAllGlobals());

    it('go signed out, up to 420 px, where no chooser sends them sooner - the sign-in button was squeezed at 390 in the admin area', async () => {
      TestBed.inject(TranslationService).noteAddress('/admin/translations');
      person.set(null);
      roles.set([]);
      windowOf(390);
      await draw('admin');
      expect(host.querySelector('button.btn-primary')).not.toBeNull();
      expect(wordmark()).toBeNull();

      host.remove();
      windowOf(421);
      await draw('admin');
      expect(wordmark()).not.toBeNull();
    });

    it('stay signed in at 390 px, where the person’s button is the round one', async () => {
      TestBed.inject(TranslationService).noteAddress('/admin');
      windowOf(390);
      await draw('admin');
      expect(menuButton()).not.toBeNull();
      expect(wordmark()).not.toBeNull();
    });
  });

  it('asks before signing out over changes that could not be saved - in words finished when asked', async () => {
    store.flushAll.mockResolvedValue(false);
    await draw();
    await openMenu();
    items()
      .find((item) => words(item) === 'Odhlásiť sa')!
      .click();
    await fixture.whenStable();

    const confirm = TestBed.inject(ConfirmService);
    expect(confirm.pending()).toMatchObject({
      title: 'Odhlásiť sa bez uloženia posledných zmien?',
      message: 'Niektoré zmeny v prieskume nie sú uložené – dôvod nájdete v editore nad prieskumom. Po odhlásení ich už nebude možné uložiť.',
      confirmLabel: 'Aj tak sa odhlásiť',
      cancelLabel: 'Zostať',
      tone: 'danger',
    });
    expect(auth.signOut).not.toHaveBeenCalled();

    confirm.settle(true);
    await fixture.whenStable();
    expect(auth.signOut).toHaveBeenCalledTimes(1);
  });

  describe('signing out over strings or languages typed and not saved', () => {
    const STRINGS = "Some changes to the site's strings or languages are not saved - the Translations and Languages pages show them. Signed out, they are lost.";
    const SURVEY = 'Some changes to a survey are not saved - the editor says why above the survey. Signed out, they cannot be saved any more.';
    const drafts = () => TestBed.inject(LocalizationDrafts);
    const confirm = () => TestBed.inject(ConfirmService);

    beforeEach(() => TestBed.inject(TranslationService).noteAddress('/admin/translations'));

    it('asks first - every survey saved or not - and stays, with everything kept, when the answer is to stay', async () => {
      await draw('admin');
      drafts().strings.set({ 'home.title': { sk: 'Povedzte nám svoj názor' } });
      await chooseSignOut('Sign out');

      expect(store.flushAll).toHaveBeenCalledTimes(1);
      expect(confirm().pending()).toMatchObject({ title: 'Sign out without your latest changes?', message: STRINGS, confirmLabel: 'Sign out anyway', cancelLabel: 'Stay', tone: 'danger' });
      expect(auth.signOut).not.toHaveBeenCalled();

      confirm().settle(false);
      await fixture.whenStable();
      expect(auth.signOut).not.toHaveBeenCalled();
      expect(drafts().strings()).toEqual({ 'home.title': { sk: 'Povedzte nám svoj názor' } });
      // The menu's item can be chosen again.
      await openMenu();
      expect(
        items()
          .find((item) => words(item) === 'Sign out')!
          .hasAttribute('disabled'),
      ).toBe(false);
    });

    it('asks for a language’s row not saved just the same', async () => {
      await draw('admin');
      drafts().languages.set({ cs: { name: 'Czech', nativeName: 'Česky', sortOrder: '3' } });
      await chooseSignOut('Sign out');

      expect(confirm().pending()?.message).toBe(STRINGS);
    });

    it('gives the drafts up before it signs out when the answer is to go: out of memory and out of the tab', async () => {
      await draw('admin');
      drafts().strings.set({ 'home.title': { sk: 'Povedzte nám svoj názor' } });
      drafts().languages.set({ cs: { name: 'Czech', nativeName: 'Česky', sortOrder: '3' } });
      await fixture.whenStable();
      TestBed.tick();
      expect(sessionStorage.getItem(LOCALIZATION_DRAFTS_KEY)).not.toBeNull();
      // Signing out leaves the page: what is in the tab's storage that moment is what the next load finds.
      let keptAtSignOut: string | null = 'not signed out';
      auth.signOut.mockImplementationOnce(() => (keptAtSignOut = sessionStorage.getItem(LOCALIZATION_DRAFTS_KEY)));

      await chooseSignOut('Sign out');
      confirm().settle(true);
      await fixture.whenStable();

      expect(auth.signOut).toHaveBeenCalledTimes(1);
      expect(keptAtSignOut).toBeNull();
      expect(drafts().count()).toBe(0);
    });

    it('asks once, with both messages one after the other, when a survey is not saved either', async () => {
      store.flushAll.mockResolvedValue(false);
      await draw('admin');
      drafts().strings.set({ 'home.title': { sk: 'Povedzte nám svoj názor' } });
      await chooseSignOut('Sign out');

      expect(confirm().pending()?.message).toBe(`${SURVEY} ${STRINGS}`);
      confirm().settle(true);
      await fixture.whenStable();
      expect(confirm().pending()).toBeNull();
      expect(auth.signOut).toHaveBeenCalledTimes(1);
    });

    it('asks in the person’s language where people take surveys: the drafts wait whichever page is showing', async () => {
      TestBed.inject(TranslationService).noteAddress('/');
      await draw();
      drafts().strings.set({ 'home.title': { sk: 'Povedzte nám svoj názor' } });
      await chooseSignOut();

      expect(confirm().pending()).toMatchObject({
        title: 'Odhlásiť sa bez uloženia posledných zmien?',
        message: 'Niektoré zmeny v textoch alebo jazykoch stránky nie sú uložené – nájdete ich na stránkach „Translations“ a „Languages“. Po odhlásení sa stratia.',
        confirmLabel: 'Aj tak sa odhlásiť',
        cancelLabel: 'Zostať',
      });
    });

    it('signs out with no question when nothing waits', async () => {
      await draw('admin');
      await chooseSignOut('Sign out');

      expect(confirm().pending()).toBeNull();
      expect(auth.signOut).toHaveBeenCalledTimes(1);
    });
  });
});
