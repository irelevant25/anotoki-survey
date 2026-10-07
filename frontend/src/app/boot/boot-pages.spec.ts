import { Component, EnvironmentProviders, Provider, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SiteStatus } from '@anotoki/lib/migrations';
import { AuthService, BootStatus } from '../core/auth/auth.service';
import { VisitorKey } from '../core/auth/visitor-key';
import { BOOTED } from '../core/boot';
import { TranslationService } from '../core/i18n/translation.service';
import { provideTestTranslations } from '../core/testing/test-translations';
import { keptWord } from './kept-word';
import { LoadErrorComponent } from './load-error/load-error.component';

/** What a reader's browser kept from an earlier visit, in Slovak. */
const KEPT = {
  'brand.area': 'prieskum',
  'common.tryAgain': 'Skúsiť znova',
  'boot.loadError.title': 'Stránka s prieskumami je nedostupná',
  'boot.loadError.text': 'Server neodpovedal. Možno má krátky výpadok, alebo vypadlo pripojenie. Skúste to o chvíľu znova.',
};

@Component({ selector: 'app-test-page', template: '' })
class TestPageComponent {}

/**
 * The card drawn when the server could not be reached as the site started. (The
 * page drawn while the site cannot run and the server says why - not set up, an
 * update waiting - is the anotoki family's: app.component.spec.ts.)
 */
describe('The pages drawn instead of the site', () => {
  const status = signal<BootStatus>('error');
  const auth = {
    status,
    user: signal(null),
    signedIn: () => false,
    person: () => null,
    preferences: () => null,
    signInFailure: signal(null),
    onAuthChange: () => () => undefined,
    init: vi.fn(async () => undefined),
  };
  /** Where the site stands, as the start asks it first: the server answers that it runs. */
  const siteStatus = { check: vi.fn(async () => 'ready'), blocked: () => false };

  const words = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim();

  function provide(values: Record<string, string>, language = 'en', more: (Provider | EnvironmentProviders)[] = []): void {
    TestBed.configureTestingModule({
      providers: [
        provideTestTranslations(values, { language, english: {} }),
        { provide: AuthService, useValue: auth },
        { provide: SiteStatus, useValue: siteStatus },
        { provide: VisitorKey, useValue: {} },
        ...more,
      ],
    });
  }

  beforeEach(() => {
    status.set('error');
    auth.init.mockReset().mockImplementation(async () => undefined);
    siteStatus.check.mockClear();
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

  it('"Try again" is the whole start again: where the site stands, the sign-in, the language, and the word that it is over', async () => {
    provide(KEPT, 'sk');
    const i18n = TestBed.inject(TranslationService);
    const settle = vi.spyOn(i18n, 'init').mockResolvedValue();
    const fixture = TestBed.createComponent(LoadErrorComponent);
    await fixture.whenStable();

    (fixture.nativeElement as HTMLElement).querySelector('button')!.click();
    await fixture.whenStable();

    expect(siteStatus.check).toHaveBeenCalledTimes(1);
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
