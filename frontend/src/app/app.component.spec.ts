import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ANOTOKI_MIGRATIONS_CONFIG, SiteStatus, siteStatusInterceptor } from '@anotoki/lib/migrations';
import { MigrationsPageComponent } from '@anotoki/lib/migrations/page';
import { firstValueFrom } from 'rxjs';
import { AppComponent } from './app.component';
import { AdminDates } from './core/admin/admin-dates.service';
import { type AnotokiPreferences } from './core/auth/anotoki-auth';
import { AuthService, BootStatus, SignInFailure } from './core/auth/auth.service';
import { signInGuard } from './core/auth/sign-in.guard';
import { BOOTED } from './core/boot';
import { provideSiteMigrations } from './core/migrations';
import { provideTestTranslations } from './core/testing/test-translations';

@Component({ selector: 'app-test-page', template: '<p class="test-page">A page of the site</p>' })
class TestPageComponent {
  /** How many were made: a page made out of sight would run - ask the API, raise its toasts. */
  static made = 0;

  constructor() {
    TestPageComponent.made++;
  }
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
    isAdmin: () => signedIn() && roles().includes('ADMIN'),
    signInFailure,
    preferences: () => preferences(),
    onAuthChange: () => () => undefined,
    savePreferences: async () => ({}),
    init: async () => undefined,
    signIn: vi.fn(async (_returnTo?: string, _uiLocales?: string) => {
      signedInFrom = TestBed.inject(Router).url;
      return true;
    }),
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
  function configure(language = 'en'): void {
    TestBed.configureTestingModule({
      providers: [
        provideTestTranslations({}, language === 'en' ? {} : { language }),
        provideHttpClient(withInterceptors([siteStatusInterceptor])),
        provideHttpClientTesting(),
        provideRouter([
          {
            path: 'admin',
            canActivate: [signInGuard],
            children: [
              { path: 'migrations', component: MigrationsPageComponent },
              { path: '', component: TestPageComponent },
            ],
          },
          { path: '**', component: TestPageComponent },
        ]),
        provideSiteMigrations(),
        { provide: AuthService, useValue: auth },
      ],
    });
  }

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

    it('makes nothing either when it asks again and finds the site ready - the page reloads at once, and a page made in between would run for nothing', async () => {
      await behind();
      await at('/genshin-6-1');
      // The family's page asking again by itself (or its Try again): ready - and it reloads the page.
      await standing({ state: 'ready', installed: true });
      await fixture.whenStable();
      expect(TestPageComponent.made).toBe(0);
      expect([page(), loadError()]).toEqual([null, null]);
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
      // To the IAM in the reader's language, and back to where the button was pressed (AuthService.signIn()'s own default).
      expect(auth.signIn).toHaveBeenCalledWith(undefined, 'en');
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
