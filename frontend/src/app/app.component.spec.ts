import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, type Routes, provideRouter } from '@angular/router';
import { provideAnotokiLegal } from '@anotoki/lib/legal';
import { ANOTOKI_MIGRATIONS_CONFIG, SiteStatus, siteStatusInterceptor } from '@anotoki/lib/migrations';
import { MigrationsPageComponent } from '@anotoki/lib/migrations/page';
import { firstValueFrom } from 'rxjs';
import { AppComponent } from './app.component';
import { AdminDates } from './core/admin/admin-dates.service';
import { ANOTOKI_AUTH_CONFIG, AnotokiAuth, type AnotokiPreferences, personGuard } from '@anotoki/lib/auth';
import { AuthService, BootStatus, SignInFailure } from './core/auth/auth.service';
import { BOOTED } from './core/boot';
import { VisitorKey } from './core/auth/visitor-key';
import { surveyLegalConfig } from './core/legal/legal.config';
import { provideSiteMigrations } from './core/migrations';
import { provideTestTranslations } from './core/testing/test-translations';
import { AdminLayoutComponent } from './layouts/admin-layout/admin-layout.component';
import { LegalLayoutComponent } from './layouts/legal-layout/legal-layout.component';
import { ParticipantLayoutComponent } from './layouts/participant-layout/participant-layout.component';
import { TopBarComponent } from './layouts/top-bar/top-bar.component';

@Component({ selector: 'app-test-page', template: '<p class="test-page">A page of the site</p>' })
class TestPageComponent {
  /** How many were made: a page made out of sight would run - ask the API, raise its toasts. */
  static made = 0;

  constructor() {
    TestPageComponent.made++;
  }
}

/**
 * The bar of the site's frames, standing in: its own spec draws it; here, only whether a frame draws it. The footer is
 * the family's own (<anotoki-site-footer>, @anotoki/lib/footer), drawn as it is.
 */
@Component({ selector: 'app-top-bar', changeDetection: ChangeDetectionStrategy.OnPush, template: '<header class="test-bar">The top bar</header>' })
class TopBarStubComponent {
  readonly area = input<'survey' | 'admin'>('survey');
  readonly width = input<'wide' | 'narrow'>('wide');
}

/** What the Migrations page reads: one file applied, one waiting. */
const MIGRATIONS = {
  sets: ['survey'],
  applied: [{ set: 'survey', name: '001_initial_schema.sql', applied_at: '2026-10-01T10:00:00Z' }],
  pending: [{ set: 'survey', name: '009_site_status_page.sql', ready: true, blocked: false }],
  missing: [],
};

describe('AppComponent: what is drawn - the site behind the anotoki family’s gate, or the card saying the server is out of reach', () => {
  const status = signal<BootStatus>('loading');
  const signedIn = signal(false);
  const roles = signal<string[]>([]);
  const signInFailure = signal<SignInFailure | null>(null);
  const preferences = signal<AnotokiPreferences | null>(null);
  /** Where the router was when the Sign in was pressed - where the sign-in comes back to. */
  let signedInFrom: string | null = null;
  const auth = {
    status,
    user: signal(null),
    signedIn: () => signedIn(),
    visitorsWelcome: () => false,
    isAdmin: () => signedIn() && roles().includes('ADMIN'),
    isStaff: () => signedIn() && (roles().includes('ADMIN') || roles().includes('EDITOR')),
    signInFailure,
    preferences: () => preferences(),
    onAuthChange: () => () => undefined,
    savePreferences: async () => ({}),
    init: async () => undefined,
    signIn: vi.fn(async (_returnTo?: string, _prompt?: 'login') => {
      signedInFrom = TestBed.inject(Router).url;
      return true;
    }),
  };
  /** The anotoki family's sign-in as its guard (personGuard) reads it: whose the page is, and nothing to say of a failure. */
  const library = {
    state: () => (signedIn() ? 'signed-in' : 'signed-out'),
    roles: () => roles(),
    signInFailure: () => null,
    signIn: vi.fn(async () => true),
  };
  let fixture: ComponentFixture<AppComponent>;
  let host: HTMLElement;

  const words = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const site = () => host.querySelector('router-outlet');
  const page = () => host.querySelector('.test-page');
  const loadError = () => host.querySelector('app-load-error');
  /** The family's page drawn instead of the site (<anotoki-site-status>). */
  const statusPage = () => host.querySelector('anotoki-site-status');
  const heading = () => words(statusPage()?.querySelector('h1'));
  const buttons = () => Array.from(host.querySelectorAll('anotoki-site-status button, anotoki-site-status a')).map(words);

  /** The site with the reader's language: the family's module wired as the app wires it (core/migrations.ts). */
  function configure(language = 'en', routes?: Routes): void {
    TestBed.configureTestingModule({
      providers: [
        provideTestTranslations({}, language === 'en' ? {} : { language }),
        provideHttpClient(withInterceptors([siteStatusInterceptor])),
        provideHttpClientTesting(),
        provideRouter(
          routes ?? [
            {
              path: 'admin',
              canActivate: [personGuard],
              children: [
                { path: 'migrations', component: MigrationsPageComponent },
                { path: '', component: TestPageComponent },
              ],
            },
            { path: '**', component: TestPageComponent },
          ],
        ),
        provideSiteMigrations(),
        // The footer's links, and the legal frame's facts over them, as the app has them (app.config.ts).
        provideAnotokiLegal(surveyLegalConfig),
        { provide: AuthService, useValue: auth },
        { provide: AnotokiAuth, useValue: library },
        { provide: ANOTOKI_AUTH_CONFIG, useValue: { config: () => null } },
        { provide: VisitorKey, useValue: { moved: signal(null), lost: signal(false) } },
      ],
    });
  }

  /**
   * The site's own frames, as app.routes.ts has them: the pages people take surveys on, the legal pages and the admin
   * panel, each with the top bar above and the family's footer below - which only a frame draws.
   */
  function configureFramed(): void {
    configure('en', [
      { path: 'terms', component: LegalLayoutComponent, children: [{ path: '', component: TestPageComponent }] },
      {
        path: 'admin',
        component: AdminLayoutComponent,
        children: [
          { path: 'migrations', component: MigrationsPageComponent },
          { path: '**', component: TestPageComponent },
        ],
      },
      { path: '', component: ParticipantLayoutComponent, children: [{ path: '**', component: TestPageComponent }] },
    ]);
    for (const frame of [ParticipantLayoutComponent, LegalLayoutComponent, AdminLayoutComponent]) {
      TestBed.overrideComponent(frame, { remove: { imports: [TopBarComponent] }, add: { imports: [TopBarStubComponent] } });
    }
  }

  /** A header or a footer anywhere on the page: the site's bar and the family's footer, or any other. */
  const frame = () => Array.from(host.querySelectorAll('app-top-bar, anotoki-site-footer, anotoki-top-bar, anotoki-legal-links, header, footer')).map((element) => element.tagName.toLowerCase());
  /** A frame as it is drawn: the bar (standing in) above the page, and the family's footer - its landmark, its links - below. */
  const FRAMED = ['app-top-bar', 'header', 'anotoki-site-footer', 'footer', 'anotoki-legal-links'];

  /** What GET /api/site-status answers when the start asks. */
  async function standing(body: object): Promise<void> {
    const asked = TestBed.inject(SiteStatus).check();
    TestBed.inject(HttpTestingController).expectOne('/api/site-status').flush(body);
    await asked;
  }

  async function start(at: BootStatus, booted: boolean): Promise<void> {
    status.set(at);
    TestBed.inject(BOOTED).set(booted);
    fixture = TestBed.createComponent(AppComponent);
    host = fixture.nativeElement;
    await fixture.whenStable();
  }

  async function now(at: BootStatus, booted: boolean): Promise<void> {
    status.set(at);
    TestBed.inject(BOOTED).set(booted);
    await fixture.whenStable();
  }

  async function at(url: string): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
  }

  /** Lets an answer's promises, timers of 0 and the drawing that follows them run out. */
  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((done) => setTimeout(done));
      await fixture.whenStable();
    }
  }

  /** What the Migrations page does once an Apply left nothing to apply: the site's onUpToDate, then the site marked ready. */
  async function appliedHere(): Promise<void> {
    await TestBed.inject(ANOTOKI_MIGRATIONS_CONFIG).onUpToDate?.();
    TestBed.inject(SiteStatus).markReady();
    await fixture.whenStable();
  }

  beforeEach(() => {
    signedIn.set(false);
    roles.set([]);
    signInFailure.set(null);
    preferences.set(null);
    signedInFrom = null;
    auth.signIn.mockClear();
    library.signIn.mockClear();
    TestPageComponent.made = 0;
  });

  describe('while a database update waits (the status says update_pending)', () => {
    async function behind(language = 'en'): Promise<void> {
      configure(language);
      await standing({ state: 'update_pending', installed: true });
      // Signing in works while an update waits: the sign-in's settings answer, and the start runs to its end.
      await start('ready', true);
    }

    it('shows a visitor the calm page - no error, no code, no setup page, no Migrations - and a quiet Sign in', async () => {
      await behind();
      await at('/');
      expect(page()).toBeNull();
      expect(heading()).toBe('The site is being updated');
      expect(words(statusPage()?.querySelector('p'))).toBe('It will be back in a few minutes. This page reloads by itself.');
      expect(buttons()).toEqual(['Sign in']);
      expect(host.querySelector('a[href="/setup.php"], a[href="/admin/migrations"]')).toBeNull();
      expect(words(host)).not.toMatch(/error|503|update_pending|not_set_up|setup|migration/i);
    });

    it('makes no page of the site behind it - nothing of a page runs out of sight - until the site runs again', async () => {
      signedIn.set(true);
      roles.set(['MEMBER', 'ADMIN']);
      await behind();
      for (const url of ['/', '/genshin-6-1', '/admin']) {
        await at(url);
        expect(statusPage()).not.toBeNull();
      }
      expect(TestPageComponent.made).toBe(0);
      TestBed.inject(HttpTestingController).verify();

      await appliedHere();
      expect(TestPageComponent.made).toBe(1);
      expect(page()).not.toBeNull();
    });

    it('makes nothing either when it asks again and finds the site ready - the page reloads, and the gate stays shut until it does', async () => {
      await behind();
      await at('/genshin-6-1');
      // The family's page asking again by itself (anotoki-lib 0.2.0: SiteStatus.checkForReload()): ready - and it
      // reloads the page. The answer is not reported, so the gate does not open in the moment before the reload, and
      // no page of the site is made to run for nothing.
      const asked = TestBed.inject(SiteStatus).checkForReload();
      TestBed.inject(HttpTestingController).expectOne('/api/site-status').flush({ state: 'ready', installed: true });
      expect(await asked).toBe('ready');
      await fixture.whenStable();
      expect(TestPageComponent.made).toBe(0);
      expect(statusPage()).not.toBeNull();
      expect([page(), loadError()]).toEqual([null, null]);
    });

    it('its Try again finds the site back: the family’s page reloads the page, and nothing of a page is made before', async () => {
      configure();
      await standing({ state: 'unavailable', installed: true });
      await start('ready', true);
      await at('/genshin-6-1');
      expect(heading()).toBe('The site is not available right now');
      host.querySelector<HTMLButtonElement>('anotoki-site-status button')!.click();
      TestBed.inject(HttpTestingController).expectOne('/api/site-status').flush({ state: 'ready', installed: true });
      await settle();
      // The answer is the reload's (jsdom has no navigation to show it): the gate was never told, and stays shut.
      expect(TestBed.inject(SiteStatus).blocked()).toBe(true);
      expect(TestPageComponent.made).toBe(0);
      expect(statusPage()).not.toBeNull();
    });

    it('shows a signed-in member the same page, with nothing to press - on every address, the Migrations page’s too', async () => {
      signedIn.set(true);
      roles.set(['MEMBER']);
      await behind();
      for (const url of ['/', '/genshin-6-1', '/admin', '/admin/migrations']) {
        await at(url);
        expect(heading()).toBe('The site is being updated');
        expect(buttons()).toEqual([]);
        expect(page()).toBeNull();
        expect(host.querySelector('anotoki-migrations-page')).toBeNull();
      }
      expect(TestBed.inject(Router).url).toBe('/admin/migrations');
      expect(auth.signIn).not.toHaveBeenCalled();
      expect(library.signIn).not.toHaveBeenCalled();
    });

    it('shows an EDITOR the same page as everybody: the update is an ADMIN’s', async () => {
      signedIn.set(true);
      roles.set(['MEMBER', 'EDITOR']);
      await behind();
      await at('/admin/migrations');
      expect(heading()).toBe('The site is being updated');
      expect(host.querySelector('anotoki-migrations-page')).toBeNull();
    });

    it('speaks the reader’s language - in Slovak, as this site speaks it', async () => {
      await behind('sk');
      await at('/');
      expect(heading()).toBe('Stránku práve aktualizujeme');
      expect(statusPage()?.querySelector('section')?.getAttribute('lang')).toBe('sk');
      expect(buttons()).toEqual(['Prihlásiť sa']);
    });

    it('shows an ADMIN "A database update is waiting" and the way to the Migrations page - which works, while nothing else does', async () => {
      signedIn.set(true);
      roles.set(['MEMBER', 'ADMIN']);
      preferences.set({ theme: 'auto', date_format: 'ymd_dash', time_format: '24' } as AnotokiPreferences);
      await behind();
      await at('/');
      expect(heading()).toBe('A database update is waiting');
      expect(words(statusPage()?.querySelector('p'))).toBe('This site is closed to everybody else until the update is applied. Back the database up first.');
      expect(page()).toBeNull();
      const open = statusPage()!.querySelector<HTMLAnchorElement>('a')!;
      expect([words(open), open.getAttribute('href')]).toEqual(['Open Migrations', '/admin/migrations']);

      open.click();
      await fixture.whenStable();
      expect(TestBed.inject(Router).url).toBe('/admin/migrations');
      expect(statusPage()).toBeNull();
      TestBed.inject(HttpTestingController).expectOne('/api/admin/migrations').flush(MIGRATIONS);
      await settle();
      const migrations = host.querySelector('anotoki-migrations-page')!;
      expect(words(migrations.querySelector('h1'))).toBe('Migrations');
      expect(words(migrations.querySelector('[data-pending]'))).toContain('009_site_status_page.sql');
      // The dates in the account's order (AdminDates), not the module's own.
      const when = migrations.querySelector('[data-applied] time')!;
      expect(words(when)).toBe(TestBed.inject(AdminDates).formatDateTime('2026-10-01T10:00:00Z'));
      expect(words(when)).toMatch(/^2026-10-01 /);

      // Anywhere else: the page that says an update waits.
      await at('/admin');
      expect(heading()).toBe('A database update is waiting');
      expect(page()).toBeNull();
    });

    it('lets a signed-out ADMIN sign in from that page and come back to it: the address stays, and then the Migrations page opens', async () => {
      await behind();
      await at('/admin/migrations');
      // Nobody signed in: the guard sent nobody to the IAM - the page with its quiet Sign in stands at the address asked for.
      expect(TestBed.inject(Router).url).toBe('/admin/migrations');
      expect(heading()).toBe('The site is being updated');

      statusPage()!.querySelector<HTMLButtonElement>('button')!.click();
      await fixture.whenStable();
      // To the IAM, and back to where the button was pressed (AuthService.signIn()'s own default) - the library says the
      // reader's language to the IAM itself (core/auth/auth.config.ts).
      expect(auth.signIn).toHaveBeenCalledTimes(1);
      expect(auth.signIn.mock.calls[0][0]).toBeUndefined();
      expect(signedInFrom).toBe('/admin/migrations');

      // Back from the IAM as the site's ADMIN, at that address.
      signedIn.set(true);
      roles.set(['MEMBER', 'ADMIN']);
      await fixture.whenStable();
      expect(statusPage()).toBeNull();
      TestBed.inject(HttpTestingController).expectOne('/api/admin/migrations').flush(MIGRATIONS);
      await settle();
      expect(words(host.querySelector('anotoki-migrations-page h1'))).toBe('Migrations');
      expect(words(host.querySelector('anotoki-migrations-page [data-pending]'))).toContain('009_site_status_page.sql');
    });

    it('draws the site again once the update is applied, where it stands - no reload', async () => {
      signedIn.set(true);
      roles.set(['MEMBER', 'ADMIN']);
      await behind();
      await at('/admin/migrations');
      TestBed.inject(HttpTestingController).expectOne('/api/admin/migrations').flush(MIGRATIONS);
      // The Migrations page's Apply left nothing to apply: the pages open again here, the strings are read again.
      await appliedHere();
      await at('/genshin-6-1');
      expect(statusPage()).toBeNull();
      expect(page()).not.toBeNull();
    });
  });

  describe('while the site is not set up', () => {
    it('never installed: "This site is not set up yet", and the way to the setup page', async () => {
      configure();
      await standing({ state: 'not_set_up', installed: false });
      await start('not-set-up', true);
      await at('/');
      expect(heading()).toBe('This site is not set up yet');
      const setup = statusPage()!.querySelector<HTMLAnchorElement>('a')!;
      expect([words(setup), setup.getAttribute('href')]).toEqual(['Open the setup page', '/setup.php']);
      expect(page()).toBeNull();
    });

    it('installed once: never the setup page again - "not available right now", which asks again by itself', async () => {
      configure();
      await standing({ state: 'not_set_up', installed: true });
      await start('not-set-up', true);
      await at('/admin');
      expect(heading()).toBe('The site is not available right now');
      expect(buttons()).toEqual(['Try again']);
      expect(host.querySelector('a[href="/setup.php"]')).toBeNull();
      expect(words(host)).not.toMatch(/setup/i);
    });

    it('says "not available right now" in Slovak the way this site speaks to its readers: formally', async () => {
      configure('sk');
      await standing({ state: 'not_set_up', installed: true });
      await start('not-set-up', true);
      expect(heading()).toBe('Stránka teraz nie je dostupná');
      expect(words(statusPage()?.querySelector('p'))).toBe('Skúste to, prosím, znova o pár minút. Táto stránka sa obnoví sama.');
    });

    it('an installed site whose settings go mid-visit: the page goes too, and the setup page is not offered', async () => {
      configure();
      await standing({ state: 'ready', installed: true });
      await start('ready', true);
      await at('/');
      expect(page()).not.toBeNull();
      // A request of the page, answered by the backend's gate - with no word of an install: the interceptor tells SiteStatus.
      const failed = firstValueFrom(TestBed.inject(HttpClient).get('/api/surveys')).catch(() => undefined);
      TestBed.inject(HttpTestingController)
        .expectOne('/api/surveys')
        .flush({ error: 'The site is not available right now. Try again in a few minutes.', code: 'not_set_up' }, { status: 503, statusText: 'Service Unavailable' });
      await failed;
      await fixture.whenStable();
      expect(page()).toBeNull();
      expect(heading()).toBe('The site is not available right now');
      expect(host.querySelector('a[href="/setup.php"]')).toBeNull();
    });
  });

  describe('the family’s page stands alone - no top bar, no footer (the owner, 2026-10-18: "nor header nor footer", for they can be under the update as well)', () => {
    it.each([
      ['a database update waits', { state: 'update_pending', installed: true }, 'The site is being updated'],
      ['the database is out of reach', { state: 'unavailable', installed: true }, 'The site is not available right now'],
      ['the site is not set up', { state: 'not_set_up', installed: false }, 'This site is not set up yet'],
    ])('while %s: on the pages people take surveys on, the legal pages and the admin panel alike, the page that says so and nothing around it', async (_while, body, said) => {
      configureFramed();
      await standing(body);
      await start('ready', true);
      for (const url of ['/', '/autumn-survey', '/terms', '/admin', '/admin/surveys']) {
        await at(url);
        expect(heading(), url).toBe(said);
        expect(frame(), url).toEqual([]);
      }
      expect(TestPageComponent.made, 'and no page behind it').toBe(0);
    });

    it('nor the card saying the server could not be reached - and while the site runs, its frames draw the bar and the footer as ever', async () => {
      configureFramed();
      await standing({ state: 'ready', installed: true });
      await start('error', true);
      expect(loadError()).not.toBeNull();
      expect(frame()).toEqual([]);

      await now('ready', true);
      for (const url of ['/', '/terms', '/admin']) {
        await at(url);
        expect(frame(), url).toEqual(FRAMED);
      }
    });

    it('an ADMIN on the Migrations page while the update waits has the admin panel’s frame round it - the site’s pages, not the family’s; anywhere else the family’s page alone; applied, every frame is back', async () => {
      signedIn.set(true);
      roles.set(['MEMBER', 'ADMIN']);
      configureFramed();
      await standing({ state: 'update_pending', installed: true });
      await start('ready', true);
      await at('/admin/migrations');
      TestBed.inject(HttpTestingController).expectOne('/api/admin/migrations').flush(MIGRATIONS);
      await settle();
      expect(statusPage()).toBeNull();
      const panel = host.querySelector('app-admin-layout')!;
      expect(words(panel.querySelector('main anotoki-migrations-page h1'))).toBe('Migrations');
      expect(panel.querySelector(':scope > app-top-bar')).not.toBeNull();
      expect(panel.querySelector(':scope > anotoki-site-footer > footer')).not.toBeNull();
      // No Feedback in it while the update waits: the server would refuse the message (503 update_pending).
      expect(panel.querySelector('anotoki-site-footer [data-open-feedback]')).toBeNull();

      for (const url of ['/', '/autumn-survey', '/terms', '/admin']) {
        await at(url);
        expect(heading(), url).toBe('A database update is waiting');
        expect(frame(), url).toEqual([]);
      }
      expect(TestPageComponent.made, 'and no page behind it').toBe(0);

      // Applied on the Migrations page: the site runs where it stands, and every frame draws its bar and footer again.
      await at('/admin/migrations');
      TestBed.inject(HttpTestingController)
        .expectOne('/api/admin/migrations')
        .flush({ ...MIGRATIONS, pending: [] });
      await appliedHere();
      for (const url of ['/', '/terms', '/admin']) {
        await at(url);
        expect(statusPage(), url).toBeNull();
        expect(frame(), url).toEqual(FRAMED);
        expect(host.querySelector('anotoki-site-footer [data-open-feedback]'), url).not.toBeNull();
      }
    });
  });

  it('draws the site once the start has run to its end - its pages, behind the gate, while the site runs', async () => {
    configure();
    await standing({ state: 'ready', installed: true });
    await start('ready', true);
    expect(site()).not.toBeNull();
    expect(statusPage()).toBeNull();
    expect(loadError()).toBeNull();
  });

  it('does not draw the site while the strings are still on their way - it would show keys', async () => {
    configure();
    await standing({ state: 'ready', installed: true });
    await start('ready', false);
    expect(site()).toBeNull();
    // What is drawn over any page is there all the same: the live region must be in the page before its first message.
    expect(host.querySelector('anotoki-toast-host [role="status"]')).not.toBeNull();

    await now('ready', true);
    expect(site()).not.toBeNull();
  });

  it('draws the card saying the server is out of reach when the sign-in got no answer where the status had one', async () => {
    configure();
    await standing({ state: 'ready', installed: true });
    await start('error', true);
    expect(loadError()).not.toBeNull();
    expect(site()).toBeNull();
  });

  it('draws the family’s page, not the card, when the status itself got no answer: it asks again by itself', async () => {
    configure();
    const asked = TestBed.inject(SiteStatus).check();
    TestBed.inject(HttpTestingController).expectOne('/api/site-status').error(new ProgressEvent('error'));
    expect(await asked).toBe('unavailable');
    await start('error', true);
    expect(loadError()).toBeNull();
    expect(heading()).toBe('The site is not available right now');
  });

  it('keeps the load error card while "Try again" starts the site again, and only then draws the site', async () => {
    configure();
    await standing({ state: 'ready', installed: true });
    await start('error', true);
    const card = loadError();
    expect(card).not.toBeNull();

    // boot() again: not booted, the sign-in loading...
    await now('loading', false);
    expect(loadError()).toBe(card);
    expect(site()).toBeNull();
    // ...the sign-in ready before the strings are there...
    await now('ready', false);
    expect(loadError()).toBe(card);
    expect(site()).toBeNull();
    // ...and the end of the start.
    await now('ready', true);
    expect(loadError()).toBeNull();
    expect(site()).not.toBeNull();
  });

  it('keeps the card when trying again fails again', async () => {
    configure();
    await standing({ state: 'ready', installed: true });
    await start('error', true);
    const card = loadError();
    await now('loading', false);
    await now('error', true);
    expect(loadError()).toBe(card);
    expect(site()).toBeNull();
  });
});
