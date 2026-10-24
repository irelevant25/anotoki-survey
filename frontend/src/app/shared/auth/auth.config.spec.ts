import { provideHttpClient } from '@angular/common/http';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { AnotokiAuth, type SignInFailure } from '@anotoki/lib/auth';
// The screen itself, read at once: @anotoki/lib/auth's SignInFailureComponent is the route that loads it as it
// is shown (anotoki-lib 0.5.0), out of the first load.
import { SignInFailureComponent } from '@anotoki/lib/auth/screens';
import { provideTestAnotokiAuth, testAnotokiAuth } from '@anotoki/lib/auth/testing';
import { provideTestTranslations } from '../testing/test-translations';
import { FORMAL_SLOVAK } from '../translations';
import { signInFailureGuard, signInOrShowWhy, siteAuthConfig } from './auth.config';
import { AuthService, CALLBACK_PATH } from './auth.service';
import { VisitorKey } from './visitor-key';

@Component({ selector: 'app-test-page', template: '' })
class PageComponent {}

const words = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

describe('siteAuthConfig(): the anotoki family’s sign-in, wired to this site', () => {
  const visitor = { current: () => null, remember: () => undefined, forget: () => undefined };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideTestTranslations({}, { language: 'sk' }),
        { provide: AuthService, useValue: { bootConfig: () => ({ issuer: 'https://iam.example.test', client_id: 'survey', visitor_days: 30 }) } },
        { provide: VisitorKey, useValue: visitor },
      ],
    });
  });

  it('reads the boot configuration the site read itself, and the site’s own visitors', () => {
    const config = siteAuthConfig();
    expect(TestBed.runInInjectionContext(() => (config.config as () => unknown)())).toEqual({ issuer: 'https://iam.example.test', client_id: 'survey', visitor_days: 30 });
    expect(TestBed.runInInjectionContext(() => config.visitors!())).toBe(visitor);
  });

  it('hands the token to the site’s API alone - never to the status, the settings, the strings or the pictures - and the visitor key to the surveys’ routes alone', () => {
    expect(siteAuthConfig().api).toEqual({
      prefixes: ['/api/'],
      skip: ['/api/site-status', '/api/auth/config', '/api/translations/', '/api/images/'],
      visitorPrefixes: ['/api/surveys'],
    });
  });

  it('signs nobody in by the IAM’s hint (the owner’s decision: genshin’s and the build analyzer’s), and comes back to /auth/callback', () => {
    const config = siteAuthConfig();
    expect(config.hint).toBe(false);
    expect([config.redirectPath, config.postLogoutPath]).toEqual([CALLBACK_PATH, '/']);
  });

  it('opens the IAM in the language the person reads here, and words the screens in this site’s formal Slovak while the database cannot be read', () => {
    const config = siteAuthConfig();
    expect(TestBed.runInInjectionContext(() => config.language!())).toBe('sk');
    for (const key of ['anotoki.signIn.signingIn', 'anotoki.signIn.expired', 'anotoki.signIn.storageUnavailable', 'anotoki.signIn.unavailable']) {
      expect(
        TestBed.runInInjectionContext(() => config.translate!(key)),
        key,
      ).toBe(FORMAL_SLOVAK[key]);
    }
  });
});

describe('The screen of a sign-in that could not start, as this site has it', () => {
  async function screen(values: Record<string, string> = {}): Promise<HTMLElement> {
    const handle = testAnotokiAuth();
    const site = siteAuthConfig();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideRouter([{ path: '**', component: PageComponent }]),
        provideTestTranslations(values, { language: 'sk' }),
        ...provideTestAnotokiAuth({ config: { language: site.language, translate: site.translate, hint: site.hint, redirectPath: site.redirectPath } }, handle),
      ],
    });
    const auth = TestBed.inject(AnotokiAuth);
    await auth.init();
    handle.client!.login = () => Promise.reject(Object.assign(new Error('This browser will not let the site remember the sign-in in progress'), { code: 'storage_unavailable' }));
    expect(await auth.signIn({ returnTo: '/genshin-6-1' })).toBe(false);
    const fixture = TestBed.createComponent(SignInFailureComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('says why in this site’s formal Slovak - from the code, never the browser’s English sentence', async () => {
    const host = await screen();
    expect(host.querySelector('section')?.getAttribute('lang')).toBe('sk');
    expect(words(host.querySelector('[role="alert"]'))).toBe(FORMAL_SLOVAK['anotoki.signIn.storageUnavailable']);
    expect(words(host)).not.toContain('This browser will not let');
  });

  it('in the owner’s words once they reworded it on the Translations page', async () => {
    const host = await screen({ 'anotoki.signIn.storageUnavailable': 'Povoľte, prosím, tejto stránke ukladať údaje.' });
    expect(words(host.querySelector('[role="alert"]'))).toBe('Povoľte, prosím, tejto stránke ukladať údaje.');
  });
});

describe('signInFailureGuard: a failed sign-in’s screen before a page the library’s guards let through', () => {
  const failure = signal<SignInFailure | null>(null);
  const state = signal<string>('visitor');

  beforeEach(() => {
    failure.set(null);
    state.set('visitor');
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AnotokiAuth, useValue: { signInFailure: failure, state } }] });
  });

  const guard = () => TestBed.runInInjectionContext(() => signInFailureGuard({} as never, {} as never));

  it('lets the page through with nothing to say', () => {
    expect(guard()).toBe(true);
  });

  it('sends a visitor - and somebody still signed in from before - whose sign-in came back without one to the screen that says why', () => {
    failure.set({ code: 'access_denied', returnTo: '/genshin-6-1' });
    for (const now of ['visitor', 'signed-in']) {
      state.set(now);
      const answer = guard();
      expect(answer instanceof UrlTree ? TestBed.inject(Router).serializeUrl(answer) : answer, now).toBe(CALLBACK_PATH);
    }
  });

  it('waits for the start: nothing is decided while the sign-in is starting', () => {
    failure.set({ code: 'access_denied', returnTo: '/' });
    state.set('starting');
    expect(guard()).toBe(true);
  });
});

describe('signInOrShowWhy(): a Sign in button’s work', () => {
  const failure = signal<SignInFailure | null>(null);
  const auth = { signIn: vi.fn(async (_returnTo?: string, _prompt?: 'login') => true), signInFailure: () => failure() };

  beforeEach(() => {
    failure.set(null);
    auth.signIn.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({ providers: [provideRouter([{ path: '**', component: PageComponent }])] });
  });

  it('is on its way to the IAM: nothing else happens here', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/genshin-6-1');
    await signInOrShowWhy(auth as unknown as AuthService, router);
    expect(auth.signIn).toHaveBeenCalledWith(undefined, undefined);
    expect(router.url).toBe('/genshin-6-1');
  });

  it('asks for the password again for the backups’ proof', async () => {
    await signInOrShowWhy(auth as unknown as AuthService, TestBed.inject(Router), 'login');
    expect(auth.signIn).toHaveBeenCalledWith(undefined, 'login');
  });

  it('opens the screen that says why when the sign-in cannot even start - where nothing would have happened at all', async () => {
    auth.signIn.mockImplementation(async () => {
      failure.set({ code: 'storage_unavailable', returnTo: '/genshin-6-1' });
      return false;
    });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/genshin-6-1');
    await signInOrShowWhy(auth as unknown as AuthService, router);
    expect(router.url).toBe(CALLBACK_PATH);
  });

  it('stays where it is when the site said to stay (nothing to say)', async () => {
    auth.signIn.mockResolvedValue(false);
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/genshin-6-1');
    await signInOrShowWhy(auth as unknown as AuthService, router);
    expect(router.url).toBe('/genshin-6-1');
  });
});
