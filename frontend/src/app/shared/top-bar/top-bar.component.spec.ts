import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { FeedbackUnread } from '@anotoki/lib/admin';
import { SiteStatus } from '@anotoki/lib/migrations';
import { TranslationService } from '@anotoki/lib/translations';
import { LocalizationDrafts } from '@anotoki/lib/translations/admin';
import { ConfirmService } from '@anotoki/lib/ui/dialog';
import { AdminStore } from '../admin/admin-store.service';
import { type AnotokiPreferences } from '@anotoki/lib/auth';
import { AuthService } from '../auth/auth.service';
import { provideSiteShell } from '../kit';
import { Person } from '../survey/survey.model';
import { provideTestTranslations } from '../testing/test-translations';
import { TopBarComponent } from './top-bar.component';

/** Where the library's drafts of the Translations and Languages pages are kept for the tab: the site's own name for it. */
const LOCALIZATION_DRAFTS_KEY = 'anotoki-survey:localization-drafts';

const ENGLISH = {
  'brand.area': 'survey',
  'brand.adminPanel': 'admin panel',
  'topbar.home': 'anotoki survey: the open surveys',
  'topbar.homeAdmin': 'anotoki survey admin panel: all surveys',
  'topbar.surveys': 'Surveys',
  'topbar.translations': 'Translations',
  'topbar.languages': 'Languages',
  'anotoki.topbar.sections': "The site's sections",
  'anotoki.topbar.phoneMenu': 'Menu',
  'anotoki.topbar.menuButton': 'Your menu: {name}',
  'anotoki.topbar.menu': 'Your menu',
  'anotoki.topbar.roleAdmin': 'Administrator',
  'anotoki.topbar.roleEditor': 'Editor',
  'anotoki.topbar.account': 'Your anotoki account',
  'topbar.backToSurveys': 'Back to the surveys',
  'anotoki.topbar.admin': 'Admin panel',
  'topbar.signOutUnsaved.title': 'Sign out without your latest changes?',
  'topbar.signOutUnsaved.message': 'Some changes to a survey are not saved - the editor says why above the survey. Signed out, they cannot be saved any more.',
  'topbar.signOutUnsaved.strings': "Some changes to the site's strings or languages are not saved - the Translations and Languages pages show them. Signed out, they are lost.",
  'topbar.signOutUnsaved.confirm': 'Sign out anyway',
  'topbar.signOutUnsaved.stay': 'Stay',
  'anotoki.topbar.signIn': 'Sign in',
  'anotoki.topbar.signOut': 'Sign out',
  'anotoki.theme.label': 'Theme',
  'anotoki.theme.light': 'Light',
  'anotoki.theme.dark': 'Dark',
  'anotoki.theme.auto': 'Automatic',
  'anotoki.theme.autoHint': 'As your device is set',
  'anotoki.language.button': 'Language: {name} ({code})',
};
const SLOVAK = {
  'brand.area': 'prieskum',
  'brand.adminPanel': 'administrátorský panel',
  'topbar.home': 'anotoki prieskum: otvorené prieskumy',
  'topbar.homeAdmin': 'anotoki prieskum, administrátorský panel: všetky prieskumy',
  'topbar.surveys': 'Prieskumy',
  'topbar.translations': 'Preklady',
  'topbar.languages': 'Jazyky',
  'anotoki.topbar.sections': 'Časti stránky',
  'anotoki.topbar.phoneMenu': 'Ponuka',
  'anotoki.topbar.menuButton': 'Vaša ponuka: {name}',
  'anotoki.topbar.menu': 'Vaša ponuka',
  'anotoki.topbar.roleAdmin': 'Rola: administrátor',
  'anotoki.topbar.roleEditor': 'Rola: editor',
  'anotoki.topbar.account': 'Váš anotoki účet',
  'topbar.backToSurveys': 'Späť na prieskumy',
  'anotoki.topbar.admin': 'Administrátorský panel',
  'topbar.signOutUnsaved.title': 'Odhlásiť sa bez uloženia posledných zmien?',
  'topbar.signOutUnsaved.message': 'Niektoré zmeny v prieskume nie sú uložené – dôvod nájdete v editore nad prieskumom. Po odhlásení ich už nebude možné uložiť.',
  'topbar.signOutUnsaved.strings': 'Niektoré zmeny v textoch alebo jazykoch stránky nie sú uložené – nájdete ich na stránkach „Translations“ a „Languages“. Po odhlásení sa stratia.',
  'topbar.signOutUnsaved.confirm': 'Aj tak sa odhlásiť',
  'topbar.signOutUnsaved.stay': 'Zostať',
  'anotoki.topbar.signIn': 'Prihlásiť sa',
  'anotoki.topbar.signOut': 'Odhlásiť sa',
  'anotoki.theme.label': 'Vzhľad',
  'anotoki.theme.light': 'Svetlý',
  'anotoki.theme.dark': 'Tmavý',
  'anotoki.theme.auto': 'Systémový',
  'anotoki.theme.autoHint': 'Podľa nastavenia systému',
  'anotoki.language.button': 'Jazyk: {name} ({code})',
};

/** Whatever page the router draws: the bar only needs it to be somewhere. */
@Component({ selector: 'app-test-page', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class PageComponent {}

/**
 * The site's wrapper over the family's bar (<anotoki-top-bar>, @anotoki/lib/shell): what this site tells it - its
 * brand, its sections, the person and their role, the menu's items, the language, the way in and out - in its own
 * words. The bar's keyboard rules are the library's, and its tests; the ones here are what this site leans on.
 */
describe('TopBarComponent', () => {
  const person = signal<Person | null>(null);
  const roles = signal<string[]>([]);
  /** A database update waits (the family's SiteStatus says update-pending). */
  const behind = signal(false);
  const siteStatus = { state: computed(() => (behind() ? 'update-pending' : 'ready')) };
  /** How the person's anotoki account says every anotoki site should look: null - an IAM that sends none - unless a spec says. */
  const preferences = signal<AnotokiPreferences | null>(null);
  const auth = {
    status: signal('ready'),
    // The token's claims: the address the menu shows is the IAM's, never kept by the site.
    user: computed(() => (person() ? { email: 'owner@example.test' } : null)),
    person,
    signedIn: () => person() !== null,
    isAdmin: () => roles().includes('ADMIN'),
    isStaff: () => roles().includes('ADMIN') || roles().includes('EDITOR'),
    accountUrl: () => 'https://iam.example.test/account',
    preferences,
    savePreferences: vi.fn(async (_changes: object) => ({})),
    onAuthChange: () => () => undefined,
    signIn: vi.fn(async (_returnTo?: string, _prompt?: 'login') => true),
    signOut: vi.fn(),
  };
  const store = { flushAll: vi.fn(async () => true) };

  let fixture: ComponentFixture<TopBarComponent>;
  let host: HTMLElement;

  const personButton = () => host.querySelector<HTMLButtonElement>('.anotoki-top-bar__person-button')!;
  const phoneButton = () => host.querySelector<HTMLButtonElement>('.anotoki-top-bar__menu-button')!;
  const items = () => Array.from(host.querySelectorAll<HTMLElement>('[role="menuitem"]'));
  const words = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim();
  /** The words of each element a selector finds, in order. */
  const parts = (selector: string) => Array.from(host.querySelectorAll(selector)).map(words);
  const links = () => Array.from(host.querySelectorAll<HTMLAnchorElement>('nav a'));
  /** A link as "words href", with " [page]" for aria-current and " [here]" for the section the page is in. */
  const described = (link: HTMLAnchorElement) =>
    `${words(link)} ${link.getAttribute('href')}${link.getAttribute('aria-current') === 'page' ? ' [page]' : ''}${link.classList.contains('anotoki-top-bar__link--active') ? ' [here]' : ''}`;
  /** What stands in an element, in order: each child as tag.firstClass. */
  const childrenOf = (selector: string) =>
    Array.from(host.querySelector(selector)!.children).map((child) => child.tagName.toLowerCase() + (child.className ? '.' + String(child.className).split(' ')[0] : ''));
  const key = (target: Element, name: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }));

  async function draw(area: 'survey' | 'admin' = 'survey'): Promise<void> {
    fixture = TestBed.createComponent(TopBarComponent);
    fixture.componentRef.setInput('area', area);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await fixture.whenStable();
  }

  /** Lets the promises on their way (a Sign out that waited), timers of 0 and the drawing that follows them run out. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((done) => setTimeout(done));
      await fixture.whenStable();
    }
  }

  async function at(url: string): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
  }

  async function openMenu(): Promise<void> {
    (host.querySelector<HTMLButtonElement>('.anotoki-top-bar__person-button') ?? phoneButton()).click();
    await fixture.whenStable();
  }

  /** The menu's "Sign out", chosen. */
  async function chooseSignOut(label = 'Odhlásiť sa'): Promise<void> {
    await openMenu();
    items()
      .find((item) => words(item) === label)!
      .click();
    // The drafts' entry point comes with a dynamic import: what it asks waits a turn or two.
    await settle();
  }

  /** A window `width` wide, as the bar's media queries see it. */
  function windowOf(width: number): void {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: width <= Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity),
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  }

  beforeEach(() => {
    sessionStorage.clear();
    person.set({ id: '7', name: 'owner' });
    roles.set(['ADMIN']);
    behind.set(false);
    preferences.set(null);
    auth.savePreferences.mockClear();
    auth.signIn.mockClear();
    auth.signOut.mockClear();
    store.flushAll.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }),
        provideSiteShell(),
        provideRouter([{ path: '**', component: PageComponent }]),
        // The count of new feedback beside System asks the server (the family's FeedbackUnread) - set by hand here.
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: AdminStore, useValue: store },
        { provide: SiteStatus, useValue: siteStatus },
      ],
    });
  });

  afterEach(() => {
    host.remove();
    sessionStorage.clear();
    vi.unstubAllGlobals();
  });

  it('is the family’s bar, in one row in the family’s order: the brand, the links, then the language, the theme and the person', async () => {
    await draw();
    expect(childrenOf('anotoki-top-bar .anotoki-top-bar__row')).toEqual(['anotoki-brand.anotoki-brand', 'nav.anotoki-top-bar__nav', 'div.anotoki-top-bar__actions']);
    expect(childrenOf('anotoki-top-bar .anotoki-top-bar__actions')).toEqual([
      'anotoki-language-switcher.anotoki-language-switcher',
      'anotoki-theme-toggle.anotoki-theme-toggle',
      'button.anotoki-top-bar__person-button',
      'anotoki-menu.anotoki-menu',
    ]);
    // Its name is the site's own words for it: the kit's word, read through the site's strings.
    expect(host.querySelector('nav')?.getAttribute('aria-label')).toBe('Časti stránky');
    // The brand: the mark, "anotoki" and the site's name.
    expect(parts('anotoki-brand .anotoki-brand__wordmark > span')).toEqual(['anotoki', 'prieskum']);
  });

  it('links the sections of the area it is in, and marks the one the page is in', async () => {
    await draw();
    await at('/');
    expect(links().map(described)).toEqual(['Prieskumy / [page] [here]']);
    await at('/genshin-6-1');
    expect(links().map(described)).toEqual(['Prieskumy /']);
  });

  it('beside System, an ADMIN reads how many feedback messages nobody opened yet - seen as a number, heard in English as what it counts; nothing for none', async () => {
    TestBed.inject(TranslationService).noteAddress('/admin');
    await draw('admin');
    await at('/admin/feedback');
    const system = () => links().find((link) => link.getAttribute('href') === '/admin/system')!;
    expect(system().querySelector('.anotoki-top-bar__badge')).toBeNull();

    TestBed.inject(FeedbackUnread).set(2);
    await fixture.whenStable();
    expect(system().querySelector('.anotoki-top-bar__badge')?.textContent?.trim()).toBe('2');
    expect(words(system().querySelector('.anotoki-visually-hidden'))).toBe(', 2 new feedback messages');
    expect(system().classList.contains('anotoki-top-bar__link--active'), 'the Feedback page is one of System’s').toBe(true);

    TestBed.inject(FeedbackUnread).set(1);
    await fixture.whenStable();
    expect(words(system().querySelector('.anotoki-visually-hidden'))).toBe(', 1 new feedback message');
    TestBed.inject(FeedbackUnread).set(0);
    await fixture.whenStable();
    expect(system().querySelector('.anotoki-top-bar__badge')).toBeNull();
  });

  it('in the admin area: Surveys, Translations, Languages, System - a survey’s editor is in Surveys, each System page in System, without being its page', async () => {
    TestBed.inject(TranslationService).noteAddress('/admin');
    await draw('admin');
    await at('/admin');
    expect(links().map(described)).toEqual(['Surveys /admin [page] [here]', 'Translations /admin/translations', 'Languages /admin/languages', 'System /admin/system']);
    await at('/admin/surveys/abc/edit?language=sk');
    expect(links().map(described)).toEqual(['Surveys /admin [here]', 'Translations /admin/translations', 'Languages /admin/languages', 'System /admin/system']);
    await at('/admin/languages');
    expect(links().map(described)).toEqual(['Surveys /admin', 'Translations /admin/translations', 'Languages /admin/languages [page] [here]', 'System /admin/system']);
    await at('/admin/system');
    expect(links().map(described)).toEqual(['Surveys /admin', 'Translations /admin/translations', 'Languages /admin/languages', 'System /admin/system [page] [here]']);
    for (const page of ['/admin/people', '/admin/errors', '/admin/audit?action=backup.*', '/admin/backups', '/admin/migrations']) {
      await at(page);
      expect(links().map(described)).toEqual(['Surveys /admin', 'Translations /admin/translations', 'Languages /admin/languages', 'System /admin/system [here]']);
    }
  });

  it('System is an ADMIN’s alone: an EDITOR’s bar has the other three', async () => {
    roles.set(['EDITOR']);
    TestBed.inject(TranslationService).noteAddress('/admin');
    await draw('admin');
    await at('/admin');
    expect(links().map(words)).toEqual(['Surveys', 'Translations', 'Languages']);
  });

  it('while a database update waits, an ADMIN’s bar in the admin panel links Migrations alone - the one page that works', async () => {
    behind.set(true);
    TestBed.inject(TranslationService).noteAddress('/admin/migrations');
    await draw('admin');
    await at('/admin/migrations');
    expect(links().map(described)).toEqual(['Migrations /admin/migrations [page] [here]']);

    // Applied (the Migrations page marks the site ready): every section again, without being drawn anew.
    behind.set(false);
    await fixture.whenStable();
    expect(links().map(words)).toEqual(['Surveys', 'Translations', 'Languages', 'System']);
  });

  it('the person’s menu: the focus into it as it opens, the arrow keys, Escape back to its button', async () => {
    await draw();
    expect(items()).toEqual([]);

    await openMenu();
    expect(personButton().getAttribute('aria-expanded')).toBe('true');
    expect(items().length).toBe(3);
    expect(document.activeElement).toBe(items()[0]);

    key(items()[0], 'ArrowDown');
    expect(document.activeElement).toBe(items()[1]);
    key(items()[1], 'End');
    expect(document.activeElement).toBe(items().at(-1));

    key(items().at(-1)!, 'Escape');
    await fixture.whenStable();
    expect(items()).toEqual([]);
    expect(document.activeElement).toBe(personButton());
  });

  it('closes on Tab with the focus on its button, and on a click outside it', async () => {
    await draw();
    await openMenu();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    items()[1].dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    await fixture.whenStable();
    expect(items()).toEqual([]);
    expect(document.activeElement).toBe(personButton());

    await openMenu();
    host.querySelector<HTMLElement>('.anotoki-top-bar__menu-head')!.click();
    await fixture.whenStable();
    expect(items().length).toBe(3);
    document.body.click();
    await fixture.whenStable();
    expect(items()).toEqual([]);
  });

  it('reads in the person’s language where people take surveys - the site’s own words, formal Slovak', async () => {
    await draw();
    expect(words(host.querySelector('anotoki-brand .anotoki-brand__area'))).toBe('prieskum');
    // The part of the site is said only in the admin area.
    expect(host.querySelector('anotoki-brand .anotoki-brand__panel')).toBeNull();
    expect(host.querySelector('anotoki-brand a')?.getAttribute('aria-label')).toBe('anotoki prieskum: otvorené prieskumy');
    expect(personButton().getAttribute('aria-label')).toBe('Vaša ponuka: owner');

    await openMenu();
    expect(host.querySelector('[role="menu"]')?.getAttribute('aria-label')).toBe('Vaša ponuka');
    expect(parts('.anotoki-top-bar__menu-head > span')).toEqual(['owner', 'owner@example.test', 'Rola: administrátor']);
    expect(items().map(words)).toEqual(['Váš anotoki účet', 'Administrátorský panel', 'Odhlásiť sa']);
    expect(items()[0].getAttribute('href')).toBe('https://iam.example.test/account');
    expect(items()[0].getAttribute('target')).toBe('_blank');
    expect(items()[1].getAttribute('href')).toBe('/admin');

    // Another role: the menu closes (the person changed), and says the new one when it opens again.
    roles.set(['EDITOR']);
    await fixture.whenStable();
    if (items().length === 0) {
      await openMenu();
    }
    expect(words(host.querySelector('.anotoki-top-bar__menu-role'))).toBe('Rola: editor');

    roles.set([]);
    await fixture.whenStable();
    if (items().length === 0) {
      await openMenu();
    }
    expect(host.querySelector('.anotoki-top-bar__menu-role')).toBeNull();
    expect(items().map(words)).toEqual(['Váš anotoki účet', 'Odhlásiť sa']);
  });

  it('reads in English in the admin area, whatever the person reads - with no case of its own', async () => {
    TestBed.inject(TranslationService).noteAddress('/admin/surveys');
    await draw('admin');
    expect(parts('anotoki-brand .anotoki-brand__wordmark > span')).toEqual(['anotoki', 'survey', '·', 'admin panel']);
    expect(host.querySelector('anotoki-brand a')?.getAttribute('aria-label')).toBe('anotoki survey admin panel: all surveys');
    expect(personButton().getAttribute('aria-label')).toBe('Your menu: owner');
    expect(links().map(words)).toEqual(['Surveys', 'Translations', 'Languages', 'System']);
    // No chooser there: the admin area is English.
    expect(host.querySelector('anotoki-language-switcher')).toBeNull();

    await openMenu();
    expect(words(host.querySelector('.anotoki-top-bar__menu-role'))).toBe('Administrator');
    expect(items().map(words)).toEqual(['Your anotoki account', 'Back to the surveys', 'Sign out']);
    expect(items()[1].getAttribute('href')).toBe('/');
  });

  it('says "admin panel" beside the mark in the admin area - without "anotoki" on a bar too narrow for it', async () => {
    const wordmark = () => parts('anotoki-brand .anotoki-brand__wordmark > span');
    TestBed.inject(TranslationService).noteAddress('/admin/surveys');
    for (const [width, shown] of [
      [961, ['anotoki', 'survey', '·', 'admin panel']],
      [960, ['survey', '·', 'admin panel']],
      [761, ['survey', '·', 'admin panel']],
      [390, ['survey', '·', 'admin panel']],
    ] as const) {
      windowOf(width);
      await draw('admin');
      expect(wordmark()).toEqual(shown);
      fixture.destroy();
    }
    // Where people take surveys the bar keeps "anotoki" on every desktop.
    TestBed.inject(TranslationService).noteAddress('/');
    windowOf(761);
    await draw();
    expect(wordmark()).toEqual(['anotoki', 'prieskum']);
  });

  it('the person’s name beside the initial from 961 px; up to 960 the initial alone', async () => {
    windowOf(961);
    await draw();
    expect(host.querySelector('.anotoki-top-bar__topbar')?.classList.contains('anotoki-top-bar__topbar--nameless')).toBe(false);
    fixture.destroy();
    windowOf(960);
    await draw();
    expect(host.querySelector('.anotoki-top-bar__topbar')?.classList.contains('anotoki-top-bar__topbar--nameless')).toBe(true);
  });

  it('follows a change of language without being drawn again', async () => {
    await draw();
    expect(personButton().getAttribute('aria-label')).toBe('Vaša ponuka: owner');
    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await fixture.whenStable();
    expect(personButton().getAttribute('aria-label')).toBe('Your menu: owner');
    expect(words(host.querySelector('anotoki-brand .anotoki-brand__area'))).toBe('survey');
    expect(links().map(words)).toEqual(['Surveys']);
  });

  it('the language chooser: the site’s languages by their own names, its button naming the code it shows', async () => {
    await draw();
    const button = host.querySelector<HTMLButtonElement>('anotoki-language-switcher .anotoki-language-switcher__switcher')!;
    expect(words(button)).toBe('SK');
    expect(button.getAttribute('aria-label')).toBe('Jazyk: Slovenčina (SK)');
    button.click();
    await fixture.whenStable();
    expect(Array.from(host.querySelectorAll('[role="menuitemradio"]')).map((item) => `${words(item)} ${item.getAttribute('lang')} ${item.getAttribute('aria-checked')}`)).toEqual([
      'English en false',
      'Slovenčina sk true',
    ]);
  });

  it('shows the anotoki account’s theme - one for every site and every part of each - and saves a choice to it, in the admin panel too', async () => {
    localStorage.removeItem('anotoki-survey:theme');
    preferences.set({ theme: 'dark', date_format: null, time_format: null });
    TestBed.inject(TranslationService).noteAddress('/admin/surveys');
    await draw('admin');
    const option = (name: string) => host.querySelector<HTMLButtonElement>(`anotoki-theme-toggle [aria-label="${name}"]`)!;
    expect(option('Dark').getAttribute('aria-checked')).toBe('true');

    option('Light').click();
    await fixture.whenStable();
    expect(option('Light').getAttribute('aria-checked')).toBe('true');
    expect(auth.savePreferences.mock.calls).toEqual([[{ theme: 'light' }]]);
    localStorage.removeItem('anotoki-survey:theme');
  });

  it('signed out: the button to sign in, to the IAM and back to this page (the library opens the IAM in the person’s language)', async () => {
    person.set(null);
    roles.set([]);
    await draw();
    const button = host.querySelector<HTMLButtonElement>('button.anotoki-top-bar__sign-in')!;
    expect(words(button)).toBe('Prihlásiť sa');
    button.click();
    await fixture.whenStable();
    expect(auth.signIn).toHaveBeenCalledTimes(1);
    expect(auth.signIn.mock.calls[0][0]).toBeUndefined();
  });

  describe('on a phone', () => {
    it('is the brand (the mark and the site’s name), the language, the theme and a menu button - nothing else in the row', async () => {
      windowOf(390);
      await draw();
      expect(parts('anotoki-brand .anotoki-brand__wordmark > span')).toEqual(['prieskum']);
      expect(host.querySelector('nav')).toBeNull();
      expect(host.querySelector('.anotoki-top-bar__person-button')).toBeNull();
      expect(childrenOf('anotoki-top-bar .anotoki-top-bar__actions')).toEqual([
        'anotoki-language-switcher.anotoki-language-switcher',
        'anotoki-theme-toggle.anotoki-theme-toggle',
        'button.anotoki-top-bar__round',
        'anotoki-menu.anotoki-menu',
      ]);
      expect(phoneButton().getAttribute('aria-label')).toBe('Ponuka');
      expect(phoneButton().getAttribute('aria-haspopup')).toBe('menu');
      expect(phoneButton().getAttribute('aria-expanded')).toBe('false');
    });

    it('holds the links and the person’s menu: focus in, arrow keys, Escape back to its button', async () => {
      windowOf(360);
      await draw();
      await at('/');
      await openMenu();
      expect(phoneButton().getAttribute('aria-expanded')).toBe('true');
      expect(host.querySelector('[role="menu"]')?.getAttribute('aria-label')).toBe('Ponuka');
      expect(items().map(words)).toEqual(['Prieskumy', 'Váš anotoki účet', 'Administrátorský panel', 'Odhlásiť sa']);
      expect(items()[0].getAttribute('aria-current')).toBe('page');
      expect(parts('[role="menu"] .anotoki-top-bar__menu-head > span')).toEqual(['owner', 'owner@example.test', 'Rola: administrátor']);
      expect(document.activeElement).toBe(items()[0]);

      key(items()[0], 'ArrowUp');
      expect(document.activeElement).toBe(items().at(-1));
      key(items().at(-1)!, 'Home');
      expect(document.activeElement).toBe(items()[0]);

      key(items()[0], 'Escape');
      await fixture.whenStable();
      expect(items()).toEqual([]);
      expect(document.activeElement).toBe(phoneButton());
    });

    it('closes when a link is chosen, and on a click outside', async () => {
      TestBed.inject(TranslationService).noteAddress('/admin');
      windowOf(390);
      await draw('admin');
      await openMenu();
      expect(items().map(words)).toEqual(['Surveys', 'Translations', 'Languages', 'System', 'Your anotoki account', 'Back to the surveys', 'Sign out']);
      items()[1].click();
      await fixture.whenStable();
      expect(items()).toEqual([]);
      expect(TestBed.inject(Router).url).toBe('/admin/translations');

      await openMenu();
      document.body.click();
      await fixture.whenStable();
      expect(items()).toEqual([]);
    });

    it('signed out: Sign in is in the menu, after the links', async () => {
      person.set(null);
      roles.set([]);
      windowOf(360);
      await draw();
      expect(host.querySelector('button.anotoki-top-bar__sign-in')).toBeNull();
      await openMenu();
      expect(items().map(words)).toEqual(['Prieskumy', 'Prihlásiť sa']);
      items()[1].click();
      await fixture.whenStable();
      expect(auth.signIn).toHaveBeenCalledTimes(1);
      expect(auth.signIn.mock.calls[0][0]).toBeUndefined();
    });

    it('is a desktop’s bar from 761 px: the links and the person in the row again', async () => {
      windowOf(761);
      await draw();
      expect(host.querySelector('.anotoki-top-bar__menu-button')).toBeNull();
      expect(links().map(words)).toEqual(['Prieskumy']);
      expect(personButton()).not.toBeNull();
      expect(parts('anotoki-brand .anotoki-brand__wordmark > span')).toEqual(['anotoki', 'prieskum']);
    });
  });

  it('asks before signing out over changes that could not be saved - in words finished when asked', async () => {
    store.flushAll.mockResolvedValue(false);
    await draw();
    await chooseSignOut();

    const confirm = TestBed.inject(ConfirmService);
    expect(confirm.pending()).toMatchObject({
      title: 'Odhlásiť sa bez uloženia posledných zmien?',
      message: 'Niektoré zmeny v prieskume nie sú uložené – dôvod nájdete v editore nad prieskumom. Po odhlásení ich už nebude možné uložiť.',
      confirmLabel: 'Aj tak sa odhlásiť',
      cancelLabel: 'Zostať',
      tone: 'danger',
    });
    expect(auth.signOut).not.toHaveBeenCalled();
    // The menu went before the question; the focus waits on its button.
    expect(items()).toEqual([]);
    expect(document.activeElement).toBe(personButton());

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
      await settle();
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
      drafts().languages.set({ cs: { name: 'Czech', native_name: 'Česky', sort_order: '3' } });
      await chooseSignOut('Sign out');

      expect(confirm().pending()?.message).toBe(STRINGS);
    });

    it('gives the drafts up before it signs out when the answer is to go: out of memory and out of the tab', async () => {
      await draw('admin');
      drafts().strings.set({ 'home.title': { sk: 'Povedzte nám svoj názor' } });
      drafts().languages.set({ cs: { name: 'Czech', native_name: 'Česky', sort_order: '3' } });
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
