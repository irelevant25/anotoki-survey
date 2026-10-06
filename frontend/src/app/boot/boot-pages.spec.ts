import { Component, EnvironmentProviders, Provider, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AuthService, BootStatus } from '../core/auth/auth.service';
import { VisitorKey } from '../core/auth/visitor-key';
import { BOOTED } from '../core/boot';
import { TranslationService } from '../core/i18n/translation.service';
import { provideTestTranslations } from '../core/testing/test-translations';
import { keptWord } from './kept-word';
import { LoadErrorComponent } from './load-error/load-error.component';
import { NotSetUpComponent } from './not-set-up/not-set-up.component';

/** What a reader's browser kept from an earlier visit, in Slovak. */
const KEPT = {
  'brand.area': 'prieskum',
  'common.tryAgain': 'Skúsiť znova',
  'boot.notSetUp.title': 'Stránka s prieskumami ešte nie je nastavená',
  'boot.notSetUp.text': 'Potrebuje svoju databázu a adresu anotoki účtu, cez ktorý sa ľudia prihlasujú. Stránka nastavenia si vyžiada oboje a zaberie to minútu.',
  'boot.notSetUp.open': 'Otvoriť stránku nastavenia',
  'boot.notSetUp.after': 'Keď bude hotovo, vráťte sa sem a načítajte stránku znova.',
  'boot.loadError.title': 'Stránka s prieskumami je nedostupná',
  'boot.loadError.text': 'Server neodpovedal. Možno má krátky výpadok, alebo vypadlo pripojenie. Skúste to o chvíľu znova.',
};

@Component({ selector: 'app-test-page', template: '' })
class TestPageComponent {}

describe('The pages drawn instead of the site', () => {
  const status = signal<BootStatus>('error');
  const detail = signal<string | null>(null);
  const onlyMigrations = signal(false);
  const auth = {
    status,
    user: signal(null),
    signedIn: () => false,
    person: () => null,
    preferences: () => null,
    signInFailure: signal(null),
    onlyMigrations,
    notSetUpDetail: detail,
    onAuthChange: () => () => undefined,
    init: vi.fn(async () => undefined),
  };

  const words = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim();

  function provide(values: Record<string, string>, language = 'en', more: (Provider | EnvironmentProviders)[] = []): void {
    TestBed.configureTestingModule({
      providers: [provideTestTranslations(values, { language, english: {} }), { provide: AuthService, useValue: auth }, { provide: VisitorKey, useValue: {} }, ...more],
    });
  }

  beforeEach(() => {
    status.set('error');
    detail.set(null);
    onlyMigrations.set(false);
    auth.init.mockReset().mockImplementation(async () => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    history.replaceState(null, '', '/');
  });

  describe('with no strings at all', () => {
    it('keptWord() answers the English written in the page - never the key, and with no complaint', () => {
      provide({});
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      expect(keptWord(TestBed.inject(TranslationService), 'boot.loadError.title', 'The survey site cannot be reached')).toBe('The survey site cannot be reached');
      expect(warn).not.toHaveBeenCalled();
    });

    it('"not set up yet" says itself in English, and shows the operator’s line as the server sent it', async () => {
      provide({});
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      detail.set('Missing: config/database.local.php');
      const fixture = TestBed.createComponent(NotSetUpComponent);
      await fixture.whenStable();
      const host: HTMLElement = fixture.nativeElement;

      expect(words(host.querySelector('app-brand .area'))).toBe('survey');
      expect(words(host.querySelector('h1'))).toBe('The survey site is not set up yet');
      expect(Array.from(host.querySelectorAll('p')).map(words)).toEqual([
        'It needs its database, and the address of the anotoki account people sign in with. The setup page asks for both and takes a minute.',
        'Missing: config/database.local.php',
        'When it is done, come back here and reload the page.',
      ]);
      const link = host.querySelector('a')!;
      expect(words(link)).toBe('Open the setup page');
      expect(link.getAttribute('href')).toBe('/setup.php');
      expect(warn).not.toHaveBeenCalled();
    });

    it('"cannot be reached" says itself in English', async () => {
      provide({});
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const fixture = TestBed.createComponent(LoadErrorComponent);
      await fixture.whenStable();
      const host: HTMLElement = fixture.nativeElement;

      expect(words(host.querySelector('app-brand .area'))).toBe('survey');
      expect(words(host.querySelector('h1'))).toBe('The survey site cannot be reached');
      expect(words(host.querySelector('p'))).toBe('The server did not answer. It may be down for a moment, or the connection may be. Try again in a little while.');
      expect(words(host.querySelector('button'))).toBe('Try again');
      expect(warn).not.toHaveBeenCalled();
    });
  });

  describe('with the strings the browser kept from an earlier visit', () => {
    it('"not set up yet" reads in the reader’s language - but for the operator’s line', async () => {
      provide(KEPT, 'sk');
      detail.set('Missing: config/database.local.php');
      const fixture = TestBed.createComponent(NotSetUpComponent);
      await fixture.whenStable();
      const host: HTMLElement = fixture.nativeElement;

      expect(words(host.querySelector('app-brand .area'))).toBe('prieskum');
      expect(words(host.querySelector('h1'))).toBe('Stránka s prieskumami ešte nie je nastavená');
      expect(words(host.querySelector('.detail'))).toBe('Missing: config/database.local.php');
      expect(words(host.querySelector('a'))).toBe('Otvoriť stránku nastavenia');
    });

    it('"cannot be reached" reads in the reader’s language; a string the kept bundle lacks is the English one', async () => {
      const { 'boot.loadError.text': _newer, ...older } = KEPT;
      provide(older, 'sk');
      const fixture = TestBed.createComponent(LoadErrorComponent);
      await fixture.whenStable();
      const host: HTMLElement = fixture.nativeElement;

      expect(words(host.querySelector('h1'))).toBe('Stránka s prieskumami je nedostupná');
      expect(words(host.querySelector('p'))).toBe('The server did not answer. It may be down for a moment, or the connection may be. Try again in a little while.');
      expect(words(host.querySelector('button'))).toBe('Skúsiť znova');
    });
  });

  describe('while only a migration waits', () => {
    it('shows an ADMIN the way to the Migrations page - in English, as the admin panel is, on a Slovak page too', async () => {
      provide(KEPT, 'sk', [provideRouter([{ path: '**', component: TestPageComponent }])]);
      onlyMigrations.set(true);
      const fixture = TestBed.createComponent(NotSetUpComponent);
      await fixture.whenStable();
      const host: HTMLElement = fixture.nativeElement;

      expect(words(host.querySelector('h1'))).toBe('Stránka s prieskumami ešte nie je nastavená');
      const update = host.querySelector('#not-set-up-update')!;
      expect(update.getAttribute('lang')).toBe('en');
      expect(words(update.querySelector('p'))).toBe(
        "You are an administrator of the survey site: its database has an update waiting. See it and apply it on the admin panel's Migrations page. Back the database up first.",
      );
      const link = update.querySelector('a')!;
      expect(words(link)).toBe('Open Migrations');
      expect(link.getAttribute('href')).toBe('/admin/migrations');
      // The setup page stays the other way.
      expect(host.querySelector('a[href="/setup.php"]')).not.toBeNull();
    });

    it('shows nobody else the link: an EDITOR, or somebody taking surveys, gets the page as it always was', async () => {
      provide(KEPT, 'sk', [provideRouter([{ path: '**', component: TestPageComponent }])]);
      const fixture = TestBed.createComponent(NotSetUpComponent);
      await fixture.whenStable();
      const host: HTMLElement = fixture.nativeElement;

      expect(host.querySelector('#not-set-up-update')).toBeNull();
      expect(host.querySelector('a[href="/admin/migrations"]')).toBeNull();
      expect(Array.from(host.querySelectorAll('a')).map(words)).toEqual(['Otvoriť stránku nastavenia']);
    });
  });

  it('"Try again" is the whole start again: the sign-in, the language, and the word that it is over', async () => {
    provide(KEPT, 'sk');
    const i18n = TestBed.inject(TranslationService);
    const settle = vi.spyOn(i18n, 'init').mockResolvedValue();
    const fixture = TestBed.createComponent(LoadErrorComponent);
    await fixture.whenStable();

    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
    await fixture.whenStable();

    expect(auth.init).toHaveBeenCalledTimes(1);
    expect(settle).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(BOOTED)()).toBe(true);
  });

  describe('"Try again" when it works: the page itself is opened too', () => {
    /** Nobody is signed in while the server is out of reach: the guard refuses, as the sign-in guard does. */
    let allowed = false;
    const routes = [
      { path: '', component: TestPageComponent },
      { path: 'admin/x', component: TestPageComponent, canActivate: [() => allowed] },
      { path: ':slug', component: TestPageComponent },
    ];

    /** The card, drawn for a page opened at `address` - and its "Try again", pressed once the server is back. */
    async function opened(address: string): Promise<() => Promise<void>> {
      allowed = false;
      provide(KEPT, 'sk', [provideRouter(routes)]);
      vi.spyOn(TestBed.inject(TranslationService), 'init').mockResolvedValue();
      history.replaceState(null, '', address);
      // The card is made before the router's first navigation: the address is still the one the page was opened with.
      const fixture = TestBed.createComponent(LoadErrorComponent);
      await fixture.whenStable();
      return async () => {
        (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
        await fixture.whenStable();
        await new Promise((done) => setTimeout(done));
      };
    }

    it('opens the address the page was opened with when the first navigation was refused - not a blank page', async () => {
      const tryAgain = await opened('/admin/x?tab=people#top');
      const router = TestBed.inject(Router);
      // The first navigation, during the outage: refused - and the router then puts its own, empty address in the bar.
      expect(await router.navigateByUrl('/admin/x?tab=people#top')).toBe(false);
      history.replaceState(null, '', '/');
      expect(router.lastSuccessfulNavigation()).toBeNull();

      auth.init.mockImplementation(async () => {
        allowed = true;
        status.set('ready');
      });
      await tryAgain();

      expect(TestBed.inject(BOOTED)()).toBe(true);
      expect(router.url).toBe('/admin/x?tab=people#top');
    });

    it('stays on the page the router did reach - or follows the address the sign-in has just put back', async () => {
      const tryAgain = await opened('/');
      const router = TestBed.inject(Router);
      expect(await router.navigateByUrl('/')).toBe(true);

      auth.init.mockImplementation(async () => {
        status.set('ready');
      });
      await tryAgain();
      expect(router.url).toBe('/');

      // Back from the IAM: the sign-in puts the address the person came from in the bar before anything reads it.
      status.set('error');
      auth.init.mockImplementation(async () => {
        history.replaceState(null, '', '/genshin-1-0');
        status.set('ready');
      });
      await tryAgain();
      expect(router.url).toBe('/genshin-1-0');
    });

    it('opens nothing while the server is still out of reach', async () => {
      const tryAgain = await opened('/admin/x');
      const router = TestBed.inject(Router);
      const navigate = vi.spyOn(router, 'navigateByUrl');
      await tryAgain();

      expect(auth.init).toHaveBeenCalledTimes(1);
      expect(navigate).not.toHaveBeenCalled();
    });
  });
});
