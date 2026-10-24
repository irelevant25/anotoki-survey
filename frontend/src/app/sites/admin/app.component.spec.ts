import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { FeedbackUnread, provideAnotokiAdmin } from '@anotoki/lib/admin';
import { type AnotokiPreferences } from '@anotoki/lib/auth';
import { provideAnotokiLegal } from '@anotoki/lib/legal';
import { SiteStatus } from '@anotoki/lib/migrations';
import { TranslationService } from '@anotoki/lib/translations';
import { LocalizationDrafts } from '@anotoki/lib/translations/admin';
import { ConfirmService } from '@anotoki/lib/ui/dialog';
import { AdminStore } from '../../shared/admin/admin-store.service';
import { AuthService } from '../../shared/auth/auth.service';
import { Changelog } from '../../shared/changelog/changelog.service';
import { provideSiteShell } from '../../shared/kit';
import { surveyLegalConfig } from '../../shared/legal/legal.config';
import { Person } from '../../shared/survey/survey.model';
import { provideTestTranslations } from '../../shared/testing/test-translations';
import { AppComponent } from './app.component';

/** Where the library's drafts of the Translations and Languages pages are kept for the tab: the site's own name for it. */
const LOCALIZATION_DRAFTS_KEY = 'anotoki-survey:localization-drafts';

/** The site's words the frame says - in English, what the admin panel reads - and in Slovak, what the reader chose. */
const ENGLISH = {
  'brand.area': 'survey',
  'brand.adminPanel': 'admin panel',
  'topbar.surveys': 'Surveys',
  'topbar.translations': 'Translations',
  'topbar.languages': 'Languages',
  'topbar.backToSurveys': 'Back to the surveys',
  'topbar.signOutUnsaved.title': 'Sign out without your latest changes?',
  'topbar.signOutUnsaved.message': 'Some changes to a survey are not saved - the editor says why above the survey. Signed out, they cannot be saved any more.',
  'topbar.signOutUnsaved.strings': "Some changes to the site's strings or languages are not saved - the Translations and Languages pages show them. Signed out, they are lost.",
  'topbar.signOutUnsaved.confirm': 'Sign out anyway',
  'topbar.signOutUnsaved.stay': 'Stay',
};
const SLOVAK = {
  'brand.area': 'prieskum',
  'brand.adminPanel': 'administrátorský panel',
  'topbar.surveys': 'Prieskumy',
  'topbar.translations': 'Preklady',
  'topbar.languages': 'Jazyky',
  'topbar.backToSurveys': 'Späť na prieskumy',
  'topbar.signOutUnsaved.title': 'Odhlásiť sa bez uloženia posledných zmien?',
  'topbar.signOutUnsaved.message': 'Niektoré zmeny v prieskume nie sú uložené – dôvod nájdete v editore nad prieskumom. Po odhlásení ich už nebude možné uložiť.',
  'topbar.signOutUnsaved.strings': 'Niektoré zmeny v textoch alebo jazykoch stránky nie sú uložené – nájdete ich na stránkach „Translations“ a „Languages“. Po odhlásení sa stratia.',
  'topbar.signOutUnsaved.confirm': 'Aj tak sa odhlásiť',
  'topbar.signOutUnsaved.stay': 'Zostať',
};

@Component({ selector: 'app-test-page', changeDetection: ChangeDetectionStrategy.OnPush, template: '<p class="page">The page of the admin area</p>' })
class PageComponent {}

@Component({ selector: 'app-test-site', imports: [RouterOutlet], changeDetection: ChangeDetectionStrategy.OnPush, template: '<router-outlet />' })
class SiteComponent {}

/** What an element says to a screen reader: its text, without what is hidden from it. */
function heard(element: Element | null | undefined): string {
  const said = (node: Node): string =>
    node.nodeType === Node.TEXT_NODE ? (node.textContent ?? '') : node instanceof Element && node.getAttribute('aria-hidden') === 'true' ? '' : Array.from(node.childNodes, said).join('');
  return element ? said(element).replace(/\s+/g, ' ').trim() : '';
}

/** The parts of the column (or the drawer) in their order, each as it is named. */
function partsOf(root: ParentNode): string[] {
  const parts = root.querySelectorAll(
    'a.anotoki-admin-frame__brand, .anotoki-admin-frame__name, .anotoki-admin-frame__email, a.anotoki-admin-frame__back, button.anotoki-admin-frame__sign-out, [role=radiogroup], nav',
  );
  return Array.from(parts, (part) =>
    part.matches('nav') ? `navigation: ${part.getAttribute('aria-label')}` : part.matches('[role=radiogroup]') ? `theme: ${part.getAttribute('aria-label')}` : heard(part),
  );
}

/**
 * The admin panel's frame: the anotoki family's (<anotoki-admin-frame>, anotoki-lib 0.10.0) - its own behaviour is the
 * library's, and its tests; here what this site gives it (its name, the person, Back, Sign out, the theme, the pages
 * and their marks, the footer) and the two cards that stand without it.
 */
describe('AppComponent: the admin panel in the family’s frame', () => {
  const person = signal<Person | null>(null);
  const roles = signal<string[]>([]);
  /** Where the site stands (the family's SiteStatus): an update waiting, or running. */
  const state = signal<'ready' | 'update-pending'>('ready');
  /** How the person's anotoki account says every anotoki site should look: null - an IAM that sends none - unless a spec says. */
  const preferences = signal<AnotokiPreferences | null>(null);
  // As AuthService has them: no roles for anybody who is not signed in.
  const auth = {
    status: signal('ready'),
    // The token's claims: the address the column shows is the IAM's, never kept by the site.
    user: computed(() => (person() ? { email: 'owner@example.test' } : null)),
    person,
    signedIn: () => person() !== null,
    isStaff: () => person() !== null && (roles().includes('ADMIN') || roles().includes('EDITOR')),
    isAdmin: () => person() !== null && roles().includes('ADMIN'),
    preferences,
    savePreferences: vi.fn(async (_changes: object) => ({})),
    onAuthChange: () => () => undefined,
    signInFailure: () => null,
    signIn: vi.fn(async (_returnTo?: string, _prompt?: 'login') => true),
    signOut: vi.fn(),
  };
  const store = { flushAll: vi.fn(async () => true) };
  /** The survey's versions as the footer reads them (shared/changelog/): the newest is the version; What's new opens the site's dialog. */
  const changelog = { current: signal<string | null>('0.4.0'), open: vi.fn(async () => undefined) };

  let site: ComponentFixture<SiteComponent>;
  let host: HTMLElement;

  const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
  const text = (selector: string) => clean(host.querySelector(selector)?.textContent);
  const frame = () => host.querySelector<HTMLElement>('app-admin-root anotoki-admin-frame');
  const column = () => frame()!.querySelector<HTMLElement>('header.anotoki-admin-frame__column')!;
  const signOutButton = () => host.querySelector<HTMLButtonElement>('button.anotoki-admin-frame__sign-out')!;
  /** The column's pages as "words href", with " [page]" for the one it marks as the page's. */
  const pages = () =>
    Array.from(column().querySelectorAll<HTMLAnchorElement>('nav a.anotoki-side-nav__link')).map(
      (link) => `${clean(link.querySelector('.anotoki-side-nav__label')?.textContent)} ${link.getAttribute('href')}${link.getAttribute('aria-current') === 'page' ? ' [page]' : ''}`,
    );
  /** The family's footer's first row as it is read: each part's words, and the dots between them. */
  const footerRow = () => Array.from(host.querySelectorAll('anotoki-site-footer .anotoki-site-footer__row > *')).map((part) => clean(part.textContent));
  /** About · Support · Terms · Privacy · Contact in the footer: [the words, where each goes]. */
  const footerLinks = () => Array.from(host.querySelectorAll<HTMLAnchorElement>('anotoki-site-footer anotoki-legal-links a')).map((link) => [clean(link.textContent), link.getAttribute('href')]);

  /** Lets the promises on their way (a Sign out that waits), timers of 0 and the drawing that follows them run out. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((done) => setTimeout(done));
      await site.whenStable();
    }
  }

  /** A window `width` wide, as the frame's media queries see it. */
  function windowOf(width: number): void {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: width <= Number(/max-width:\s*(\d+)px/.exec(query)?.[1] ?? Infinity),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }));
  }

  /** The address, as the router and the title strategy have it: the admin panel reads English. */
  async function at(url: string): Promise<void> {
    TestBed.inject(TranslationService).noteAddress(url);
    await TestBed.inject(Router).navigateByUrl(url);
    await settle();
  }

  /** The admin panel where it lives - drawn by the router, its page in its outlet - for somebody with these roles (null: nobody signed in). */
  async function panel(roleNames: string[] | null, url = '/admin/translations', standing: 'ready' | 'update-pending' = 'ready'): Promise<void> {
    person.set(roleNames === null ? null : { id: '7', name: 'owner' });
    roles.set(roleNames ?? []);
    state.set(standing);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'admin',
            component: AppComponent,
            children: [
              { path: '', component: PageComponent },
              { path: '**', component: PageComponent },
            ],
          },
          { path: '**', component: PageComponent },
        ]),
        { provide: AuthService, useValue: auth },
        { provide: AdminStore, useValue: store },
        provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }),
        // The theme's switch is the shell's, as the app wires it (shared/kit.ts): the account's theme.
        provideSiteShell(),
        // How many feedback messages are new: the family's count, for the site's ADMIN (shared/admin/admin-tools.ts).
        provideAnotokiAdmin(() => ({ isAdmin: () => auth.isAdmin() })),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: SiteStatus, useValue: { state, blocked: computed(() => state() !== 'ready') } },
        { provide: Changelog, useValue: changelog },
        // The footer's links, wired as the app wires them (app.config.ts): their words in the language on the page.
        provideAnotokiLegal(surveyLegalConfig),
      ],
    });
    site = TestBed.createComponent(SiteComponent);
    host = site.nativeElement;
    document.body.appendChild(host);
    await at(url);
  }

  beforeEach(() => {
    sessionStorage.clear();
    preferences.set(null);
    auth.signIn.mockClear();
    auth.signOut.mockReset();
    auth.savePreferences.mockClear();
    store.flushAll.mockReset().mockResolvedValue(true);
    changelog.open.mockClear();
  });

  afterEach(() => {
    site?.destroy();
    host?.remove();
    sessionStorage.clear();
    vi.unstubAllGlobals();
    document.body.style.overflow = '';
  });

  describe('for staff - an editor, an administrator', () => {
    it('draws the page in the frame: the column - the panel’s name, who is signed in, Back, Sign out, the theme, the pages - and no top bar', async () => {
      await panel(['EDITOR']);
      expect(frame()).not.toBeNull();
      expect(partsOf(column())).toEqual(['anotoki survey · admin panel', 'owner', 'owner@example.test', 'Back to the surveys', 'Sign out', 'theme: Theme', 'navigation: Admin panel']);
      expect(column().querySelector('a.anotoki-admin-frame__brand')?.getAttribute('href')).toBe('/admin');
      expect(column().querySelector('a.anotoki-admin-frame__back')?.getAttribute('href')).toBe('/');
      expect(clean(frame()!.querySelector('a.anotoki-admin-frame__skip')?.textContent)).toBe('Skip to content');
      // The page in the frame's <main>, in the measure the panel's pages always had; no card, no bar.
      expect(text('anotoki-admin-frame main#main .page-width .page')).toBe('The page of the admin area');
      expect(host.querySelectorAll('main').length).toBe(1);
      expect(host.querySelector('app-top-bar, anotoki-top-bar, anotoki-empty-state')).toBeNull();

      roles.set(['ADMIN']);
      await settle();
      expect(text('anotoki-admin-frame main#main .page')).toBe('The page of the admin area');
      expect(host.querySelector('anotoki-empty-state')).toBeNull();
    });

    it('its pages, in English whatever the reader reads: Surveys, Translations, Languages, System - a survey’s editor in Surveys, each System page in System', async () => {
      await panel(['ADMIN'], '/admin');
      const all = (page: string) =>
        ['Surveys /admin', 'Translations /admin/translations', 'Languages /admin/languages', 'System /admin/system'].map((link) => (link.startsWith(`${page} `) ? `${link} [page]` : link));
      expect(pages()).toEqual(all('Surveys'));
      await at('/admin/surveys/abc/edit?language=sk');
      expect(pages()).toEqual(all('Surveys'));
      await at('/admin/languages');
      expect(pages()).toEqual(all('Languages'));
      await at('/admin/system');
      expect(pages()).toEqual(all('System'));
      for (const page of ['/admin/people', '/admin/feedback', '/admin/errors', '/admin/audit?action=backup.*', '/admin/backups', '/admin/migrations']) {
        await at(page);
        expect(pages(), page).toEqual(all('System'));
      }
      // An address that is none of them: nothing marked.
      await at('/admin/nowhere');
      expect(pages()).toEqual(all('-'));
    });

    it('System is an ADMIN’s alone: an EDITOR’s column has the other three', async () => {
      await panel(['EDITOR'], '/admin');
      expect(pages()).toEqual(['Surveys /admin [page]', 'Translations /admin/translations', 'Languages /admin/languages']);
    });

    it('while a database update waits, an ADMIN’s column links Migrations alone - the one page that works; applied, every page again', async () => {
      await panel(['ADMIN'], '/admin/migrations', 'update-pending');
      expect(pages()).toEqual(['Migrations /admin/migrations [page]']);

      // Applied (the Migrations page marks the site ready): every page again, without being drawn anew.
      state.set('ready');
      await settle();
      expect(pages()).toEqual(['Surveys /admin', 'Translations /admin/translations', 'Languages /admin/languages', 'System /admin/system [page]']);
    });

    it('beside System, an ADMIN reads how many feedback messages nobody opened yet - seen as a number, heard in English as what it counts; nothing for none', async () => {
      await panel(['ADMIN'], '/admin/feedback');
      TestBed.inject(HttpTestingController).expectOne('/api/admin/feedback/unread').flush({ unread: 0 });
      await settle();
      const system = () => Array.from(column().querySelectorAll('nav a')).find((link) => link.getAttribute('href') === '/admin/system')!;
      expect(system().querySelector('.anotoki-side-nav__badge')).toBeNull();

      TestBed.inject(FeedbackUnread).set(2);
      await settle();
      expect(clean(system().querySelector('.anotoki-side-nav__badge')?.textContent)).toBe('2');
      expect(heard(system())).toBe('System , 2 new feedback messages');
      expect(system().getAttribute('aria-current'), 'the Feedback page is one of System’s').toBe('page');

      TestBed.inject(FeedbackUnread).set(1);
      await settle();
      expect(heard(system())).toBe('System , 1 new feedback message');
      TestBed.inject(FeedbackUnread).set(0);
      await settle();
      expect(system().querySelector('.anotoki-side-nav__badge')).toBeNull();
    });

    it('shows the anotoki account’s theme - one for every site and every part of each - and saves a choice to it', async () => {
      localStorage.removeItem('anotoki-survey:theme');
      preferences.set({ theme: 'dark', date_format: null, time_format: null });
      await panel(['EDITOR']);
      const option = (name: string) => column().querySelector<HTMLButtonElement>(`anotoki-theme-toggle [aria-label="${name}"]`)!;
      expect(option('Dark').getAttribute('aria-checked')).toBe('true');

      option('Light').click();
      await settle();
      expect(option('Light').getAttribute('aria-checked')).toBe('true');
      expect(auth.savePreferences.mock.calls).toEqual([[{ theme: 'light' }]]);
      localStorage.removeItem('anotoki-survey:theme');
    });

    it('on a phone: a row with the panel’s name and Menu, and in the drawer the person, Back, Sign out, the theme and the pages - in English', async () => {
      windowOf(390);
      await panel(['ADMIN'], '/admin');
      const menu = column().querySelector<HTMLButtonElement>('button.anotoki-admin-frame__menu')!;
      expect(clean(column().querySelector('.anotoki-admin-frame__row a.anotoki-admin-frame__brand')?.textContent)).toBe('anotoki survey · admin panel');
      expect(heard(menu)).toBe('Menu');

      menu.click();
      await settle();
      const drawer = host.querySelector<HTMLDialogElement>('dialog')!;
      expect(drawer.open).toBe(true);
      expect(partsOf(drawer)).toEqual(['owner', 'owner@example.test', 'Back to the surveys', 'Sign out', 'theme: Theme', 'navigation: Admin panel']);
      expect(Array.from(drawer.querySelectorAll('nav .anotoki-side-nav__label'), (label) => clean(label.textContent))).toEqual(['Surveys', 'Translations', 'Languages', 'System']);
    });
  });

  describe('Sign out: the site’s one (SignOut), the top bar’s too', () => {
    const STRINGS = "Some changes to the site's strings or languages are not saved - the Translations and Languages pages show them. Signed out, they are lost.";
    const SURVEY = 'Some changes to a survey are not saved - the editor says why above the survey. Signed out, they cannot be saved any more.';
    const drafts = () => TestBed.inject(LocalizationDrafts);
    const confirm = () => TestBed.inject(ConfirmService);

    async function pressSignOut(): Promise<void> {
      signOutButton().click();
      // The drafts' entry point comes with a dynamic import: what it asks waits a turn or two.
      await settle();
    }

    it('signs out with no question when nothing waits - its button waiting ("Saving…") while the surveys are saved', async () => {
      await panel(['EDITOR']);
      let saved!: (done: boolean) => void;
      store.flushAll.mockReturnValueOnce(new Promise<boolean>((resolve) => (saved = resolve)));
      signOutButton().click();
      await site.whenStable();
      expect(clean(signOutButton().textContent)).toBe('Saving…');
      expect(signOutButton().getAttribute('aria-busy')).toBe('true');
      expect(auth.signOut).not.toHaveBeenCalled();

      saved(true);
      await settle();
      expect(confirm().pending()).toBeNull();
      expect(auth.signOut).toHaveBeenCalledTimes(1);
    });

    it('asks before signing out over changes to a survey that could not be saved - in the panel’s English, words finished when asked', async () => {
      store.flushAll.mockResolvedValue(false);
      await panel(['EDITOR']);
      await pressSignOut();

      expect(confirm().pending()).toMatchObject({ title: 'Sign out without your latest changes?', message: SURVEY, confirmLabel: 'Sign out anyway', cancelLabel: 'Stay', tone: 'danger' });
      expect(auth.signOut).not.toHaveBeenCalled();
      confirm().settle(true);
      await settle();
      expect(auth.signOut).toHaveBeenCalledTimes(1);
    });

    it('asks first over strings typed and not saved - every survey saved or not - and stays, with everything kept, when the answer is to stay', async () => {
      await panel(['ADMIN']);
      drafts().strings.set({ 'home.title': { sk: 'Povedzte nám svoj názor' } });
      await pressSignOut();

      expect(store.flushAll).toHaveBeenCalledTimes(1);
      expect(confirm().pending()).toMatchObject({ title: 'Sign out without your latest changes?', message: STRINGS, confirmLabel: 'Sign out anyway', cancelLabel: 'Stay', tone: 'danger' });
      expect(auth.signOut).not.toHaveBeenCalled();

      confirm().settle(false);
      await settle();
      expect(auth.signOut).not.toHaveBeenCalled();
      expect(drafts().strings()).toEqual({ 'home.title': { sk: 'Povedzte nám svoj názor' } });
      // The button can be pressed again.
      expect(clean(signOutButton().textContent)).toBe('Sign out');
      expect(signOutButton().hasAttribute('aria-busy')).toBe(false);
    });

    it('asks for a language’s row not saved just the same', async () => {
      await panel(['ADMIN']);
      drafts().languages.set({ cs: { name: 'Czech', native_name: 'Česky', sort_order: '3' } });
      await pressSignOut();

      expect(confirm().pending()?.message).toBe(STRINGS);
    });

    it('gives the drafts up before it signs out when the answer is to go: out of memory and out of the tab', async () => {
      await panel(['ADMIN']);
      drafts().strings.set({ 'home.title': { sk: 'Povedzte nám svoj názor' } });
      drafts().languages.set({ cs: { name: 'Czech', native_name: 'Česky', sort_order: '3' } });
      await site.whenStable();
      TestBed.tick();
      expect(sessionStorage.getItem(LOCALIZATION_DRAFTS_KEY)).not.toBeNull();
      // Signing out leaves the page: what is in the tab's storage that moment is what the next load finds.
      let keptAtSignOut: string | null = 'not signed out';
      auth.signOut.mockImplementationOnce(() => (keptAtSignOut = sessionStorage.getItem(LOCALIZATION_DRAFTS_KEY)));

      await pressSignOut();
      confirm().settle(true);
      await settle();

      expect(auth.signOut).toHaveBeenCalledTimes(1);
      expect(keptAtSignOut).toBeNull();
      expect(drafts().count()).toBe(0);
    });

    it('asks once, with both messages one after the other, when a survey is not saved either', async () => {
      store.flushAll.mockResolvedValue(false);
      await panel(['ADMIN']);
      drafts().strings.set({ 'home.title': { sk: 'Povedzte nám svoj názor' } });
      await pressSignOut();

      expect(confirm().pending()?.message).toBe(`${SURVEY} ${STRINGS}`);
      confirm().settle(true);
      await settle();
      expect(confirm().pending()).toBeNull();
      expect(auth.signOut).toHaveBeenCalledTimes(1);
    });
  });

  it('asks how many feedback messages are new for an ADMIN, as the panel opens - for nobody else, and never while an update waits', async () => {
    await panel(['ADMIN']);
    const requests = TestBed.inject(HttpTestingController);
    requests.expectOne('/api/admin/feedback/unread').flush({ unread: 3 });
    await vi.waitFor(() => expect(TestBed.inject(FeedbackUnread).count()).toBe(3));
    requests.verify();
  });

  it('asks nothing for an EDITOR, nor for an ADMIN while a database update waits - the Migrations page is the one page that works then', async () => {
    await panel(['EDITOR']);
    TestBed.inject(HttpTestingController).verify();
    site.destroy();
    host.remove();
    TestBed.resetTestingModule();

    await panel(['ADMIN'], '/admin/migrations', 'update-pending');
    const requests = TestBed.inject(HttpTestingController);
    requests.verify();
    // Applied: the site runs, and the count is asked.
    state.set('ready');
    await settle();
    requests.expectOne('/api/admin/feedback/unread').flush({ unread: 0 });
  });

  it('tells somebody signed in with no role here whose the area is, and where the surveys are - a page of its own, without the frame', async () => {
    await panel([]);

    expect(frame()).toBeNull();
    expect(host.querySelector('.page')).toBeNull();
    expect(text('anotoki-empty-state .anotoki-empty-state__heading')).toBe('The admin panel is for the people who write the surveys');
    expect(text('anotoki-empty-state .anotoki-empty-state__text')).toBe(
      "Your anotoki account has no editor role here. The site's administrator can give it to you in the anotoki account's admin panel.",
    );
    const link = host.querySelector<HTMLAnchorElement>('anotoki-empty-state a')!;
    expect(clean(link.textContent)).toBe('See the open surveys');
    expect(link.getAttribute('href')).toBe('/');
    expect(host.textContent).not.toContain('You are signed out');
    expect(host.querySelector('app-top-bar, anotoki-top-bar')).toBeNull();
  });

  it('tells somebody whose session ended that they are signed out - not that they have no role - and what became of what they typed', async () => {
    await panel(null);

    expect(frame()).toBeNull();
    expect(host.querySelector('.page')).toBeNull();
    expect(text('anotoki-empty-state .anotoki-empty-state__heading')).toBe('You are signed out');
    expect(text('anotoki-empty-state .anotoki-empty-state__text')).toBe(
      'Your session has ended. Sign in again: what you typed on the Translations and Languages pages is kept in this tab, and will be in its boxes again. ' +
        'Changes to a survey that were not saved yet stay only while this page is open - sign in again in another tab to save them.',
    );
    expect(host.textContent).not.toContain('no editor role');
    expect(host.textContent).not.toContain('The admin panel is for the people who write the surveys');
    // The way back is a Sign in of its own - to the IAM and back to this page (the library opens the IAM in the language
    // the person reads, not the admin area's English).
    const button = host.querySelector<HTMLButtonElement>('anotoki-empty-state button')!;
    expect(clean(button.textContent)).toBe('Sign in');
    button.click();
    expect(auth.signIn).toHaveBeenCalledTimes(1);
    expect(auth.signIn.mock.calls[0][0]).toBeUndefined();
    expect(host.querySelector('app-top-bar, anotoki-top-bar')).toBeNull();
  });

  it('says so the moment the session ends over an open page, and draws the page in the frame again for the editor who comes back', async () => {
    await panel(['EDITOR']);
    // The roles go with the sign-in, as the token's do: an editor signed out is no editor.
    person.set(null);
    await settle();

    expect(frame()).toBeNull();
    expect(text('anotoki-empty-state .anotoki-empty-state__heading')).toBe('You are signed out');

    person.set({ id: '7', name: 'owner' });
    await settle();
    expect(text('anotoki-admin-frame main .page')).toBe('The page of the admin area');
    expect(host.querySelector('anotoki-empty-state')).toBeNull();
  });

  it('takes the page away with no navigation, and the address stays for the way back', async () => {
    await panel(['EDITOR']);
    expect(text('app-admin-root main .page')).toBe('The page of the admin area');

    person.set(null);
    await settle();

    expect(host.querySelector('.page')).toBeNull();
    expect(text('app-admin-root anotoki-empty-state .anotoki-empty-state__heading')).toBe('You are signed out');
    expect(TestBed.inject(Router).url).toBe('/admin/translations');
  });

  it('puts the family’s footer under the page, in the frame’s footer, in its English whatever the reader’s language: the version, What’s new, Feedback, then About · Support · Terms · Privacy · Contact', async () => {
    await panel(['EDITOR']);
    const footer = frame()!.querySelector('anotoki-site-footer');
    expect(footer?.parentElement?.classList).toContain('anotoki-admin-frame__page-column');
    expect(footer?.previousElementSibling?.querySelector('main#main')).not.toBeNull();
    expect(footer?.querySelector(':scope > footer')).not.toBeNull();
    // The version reads "v0.4.0" on screen and "Version 0.4.0" to a screen reader (anotoki-lib 0.7.1): its text holds both.
    expect(footerRow()).toEqual(['v0.4.0Version 0.4.0', '·', "What's new", '·', 'Feedback']);
    expect(footerLinks()).toEqual([
      ['About', '/about'],
      ['Support', '/support'],
      ['Terms', '/terms'],
      ['Privacy', '/privacy'],
      ['Contact', '/contact'],
    ]);
    expect(host.querySelector('anotoki-site-footer [data-fan]')).toBeNull();

    // What's new is the survey's own dialog, as on its pages.
    host.querySelector<HTMLButtonElement>('anotoki-site-footer [data-whats-new]')!.click();
    await settle();
    expect(changelog.open).toHaveBeenCalledTimes(1);
  });

  it('offers no Feedback while an update waits - the frame stands round the Migrations page then, and the server would refuse the message - and offers it again once the site runs', async () => {
    await panel(['ADMIN'], '/admin/migrations', 'update-pending');
    expect(footerRow()).toEqual(['v0.4.0Version 0.4.0', '·', "What's new"]);
    expect(host.querySelector('anotoki-site-footer [data-open-feedback]')).toBeNull();
    expect(footerLinks().map(([words]) => words)).toEqual(['About', 'Support', 'Terms', 'Privacy', 'Contact']);

    state.set('ready');
    await settle();
    expect(footerRow()).toEqual(['v0.4.0Version 0.4.0', '·', "What's new", '·', 'Feedback']);
    TestBed.inject(HttpTestingController).expectOne('/api/admin/feedback/unread').flush({ unread: 0 });
  });

  it('keeps the footer under both cards - signed out, and no role here', async () => {
    await panel(null);
    expect(text('anotoki-empty-state .anotoki-empty-state__heading')).toBe('You are signed out');
    expect(footerRow()).toEqual(['v0.4.0Version 0.4.0', '·', "What's new", '·', 'Feedback']);

    person.set({ id: '7', name: 'owner' });
    await settle();
    expect(text('anotoki-empty-state .anotoki-empty-state__heading')).toBe('The admin panel is for the people who write the surveys');
    expect(footerRow()).toEqual(['v0.4.0Version 0.4.0', '·', "What's new", '·', 'Feedback']);
    expect(footerLinks().map(([words]) => words)).toEqual(['About', 'Support', 'Terms', 'Privacy', 'Contact']);
  });
});
