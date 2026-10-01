import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { ToastService } from '../ui/toast/toast.service';
import { ApiService } from './api/api.service';
import { AuthService, SignInFailure } from './auth/auth.service';
import { BOOTED, boot } from './boot';
import { TranslationService } from './i18n/translation.service';
import { provideTestTranslations } from './testing/test-translations';
import { SurveyTitleStrategy } from './title.strategy';

const ENGLISH = {
  'brand.site': 'anotoki survey',
  'title.surveys': 'Surveys',
  'signIn.notCompleted': 'Signing in was not completed.',
  'signIn.failed': 'Signing in did not work. Please try again. ({code})',
};
const SLOVAK = {
  'brand.site': 'anotoki prieskum',
  'title.surveys': 'Prieskumy',
  'signIn.notCompleted': 'Prihlásenie sa nedokončilo.',
  'signIn.failed': 'Prihlásenie sa nepodarilo. Skúste to, prosím, znova. ({code})',
};

describe('boot(): the whole start', () => {
  const order: string[] = [];
  /** What BOOTED said at each step of the start. */
  const bootedAt: Record<string, boolean> = {};
  const failure = signal<SignInFailure | null>(null);
  const auth = {
    status: signal('ready'),
    user: signal(null),
    signedIn: () => false,
    signInFailure: failure,
    onAuthChange: () => () => undefined,
    init: vi.fn(async () => {
      order.push('auth');
      bootedAt['auth'] = TestBed.inject(BOOTED)();
    }),
  };

  beforeEach(() => {
    order.length = 0;
    failure.set(null);
    auth.init.mockClear();
    TestBed.configureTestingModule({ providers: [provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }), { provide: AuthService, useValue: auth }] });
    const i18n = TestBed.inject(TranslationService);
    vi.spyOn(i18n, 'init').mockImplementation(async () => {
      order.push('i18n');
      bootedAt['i18n'] = TestBed.inject(BOOTED)();
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('signs in first, then settles the language - which needs to know who it is', async () => {
    await TestBed.runInInjectionContext(boot);
    expect(order).toEqual(['auth', 'i18n']);
    expect(TestBed.inject(ToastService).toasts()).toEqual([]);
  });

  it('says the start is over only once the language is settled too: until then the site is not drawn', async () => {
    const booted = TestBed.inject(BOOTED);
    expect(booted()).toBe(false);
    await TestBed.runInInjectionContext(boot);
    expect(bootedAt).toEqual({ auth: false, i18n: false });
    expect(booted()).toBe(true);
  });

  it('starting again (the load error page’s retry) makes the site wait for its strings again', async () => {
    const booted = TestBed.inject(BOOTED);
    await TestBed.runInInjectionContext(boot);
    expect(booted()).toBe(true);

    const again = TestBed.runInInjectionContext(boot);
    expect(booted()).toBe(false);
    await again;
    expect(bootedAt).toEqual({ auth: false, i18n: false });
    expect(booted()).toBe(true);
  });

  it('says a failed sign-in in the reader’s language, with the code and nobody’s English sentence', async () => {
    failure.set({ code: 'state_mismatch', message: 'That sign-in did not start here, or took too long' });
    await TestBed.runInInjectionContext(boot);
    expect(
      TestBed.inject(ToastService)
        .toasts()
        .map((toast) => toast.message),
    ).toEqual(['Prihlásenie sa nepodarilo. Skúste to, prosím, znova. (state_mismatch)']);
  });

  it('has one sentence for a sign-in that was turned away or given up', async () => {
    failure.set({ code: 'access_denied', message: 'This account may not use the surveys.' });
    await TestBed.runInInjectionContext(boot);
    const toasts = TestBed.inject(ToastService).toasts();
    expect(toasts.map((toast) => toast.message)).toEqual(['Prihlásenie sa nedokončilo.']);
    expect(toasts[0].tone).toBe('danger');
  });
});

@Component({ selector: 'app-test-page', template: '' })
class TestPageComponent {}

describe('SurveyTitleStrategy', () => {
  function title(): string {
    TestBed.tick();
    return TestBed.inject(Title).getTitle();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }),
        provideRouter([
          { path: '', title: 'title.surveys', component: TestPageComponent },
          { path: 'admin/surveys', title: 'Results', component: TestPageComponent },
          { path: 'admin', title: 'title.surveys', component: TestPageComponent },
          { path: ':slug', component: TestPageComponent },
        ]),
        { provide: TitleStrategy, useClass: SurveyTitleStrategy },
      ],
    });
  });

  it('words a title that is a key, in the language on the page, before the site’s name', async () => {
    await TestBed.inject(Router).navigateByUrl('/');
    expect(title()).toBe('Prieskumy · anotoki prieskum');
  });

  it('follows the language without a navigation', async () => {
    await TestBed.inject(Router).navigateByUrl('/');
    expect(title()).toBe('Prieskumy · anotoki prieskum');
    await TestBed.inject(TranslationService).setLanguage('en', false);
    expect(title()).toBe('Surveys · anotoki survey');
  });

  it('is English in the admin area, where a title may be plain English too', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/admin/surveys?tab=people');
    expect(TestBed.inject(TranslationService).inAdmin()).toBe(true);
    expect(title()).toBe('Results · anotoki survey');
    await router.navigateByUrl('/admin');
    expect(title()).toBe('Surveys · anotoki survey');
    await router.navigateByUrl('/');
    expect(TestBed.inject(TranslationService).inAdmin()).toBe(false);
    expect(title()).toBe('Prieskumy · anotoki prieskum');
  });

  it('writes the site’s name once for a first page that has no title of its own', async () => {
    await TestBed.inject(Router).navigateByUrl('/genshin-1-0');
    expect(title()).toBe('anotoki prieskum');
  });

  it('leaves a route without a title to the page that writes its own', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    expect(title()).toBe('Prieskumy · anotoki prieskum');

    await router.navigateByUrl('/genshin-1-0');
    TestBed.inject(Title).setTitle('Genshin 1.0');
    expect(title()).toBe('Genshin 1.0');
    // A change of language must not put the site's name over the survey's.
    await TestBed.inject(TranslationService).setLanguage('en', false);
    expect(title()).toBe('Genshin 1.0');

    await router.navigateByUrl('/');
    expect(title()).toBe('Surveys · anotoki survey');
  });

  it('tells the translation service where the page is after every navigation - which is also when that one asks again for strings it has not', async () => {
    const noted = vi.spyOn(TestBed.inject(TranslationService), 'noteAddress');
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/');
    await router.navigateByUrl('/admin/surveys?tab=people');
    expect(noted.mock.calls).toEqual([['/'], ['/admin/surveys?tab=people']]);
    vi.restoreAllMocks();
  });
});

describe('SurveyTitleStrategy with no strings at all', () => {
  const api = { translations: vi.fn() };
  // The site is not set up: nothing was asked for, and a first visit has nothing kept either.
  const auth = { status: signal('not-set-up'), user: signal(null), signedIn: () => false, onAuthChange: () => () => undefined };

  function title(): string {
    TestBed.tick();
    return TestBed.inject(Title).getTitle();
  }

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    api.translations.mockReset();
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: auth },
        provideRouter([
          { path: '', title: 'title.surveys', component: TestPageComponent },
          { path: 'admin/surveys', title: 'Results', component: TestPageComponent },
          { path: ':slug', component: TestPageComponent },
        ]),
        { provide: TitleStrategy, useClass: SurveyTitleStrategy },
      ],
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('writes the site’s name alone on a page people take surveys on - never the key', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const i18n = TestBed.inject(TranslationService);
    await i18n.init();
    expect(i18n.ready()).toBe(false);

    await TestBed.inject(Router).navigateByUrl('/');
    expect(title()).toBe('anotoki survey');
    await TestBed.inject(Router).navigateByUrl('/genshin-1-0');
    expect(title()).toBe('anotoki survey');

    // Nothing was looked up, so nothing is complained about - and nothing asked: the site cannot run.
    expect(warn).not.toHaveBeenCalled();
    expect(api.translations).not.toHaveBeenCalled();
  });

  it('keeps the admin area’s titles, which are English as written', async () => {
    const i18n = TestBed.inject(TranslationService);
    await i18n.init();

    await TestBed.inject(Router).navigateByUrl('/admin/surveys');
    expect(i18n.ready()).toBe(false);
    expect(title()).toBe('Results · anotoki survey');
    // Back on a participant page: the name alone again.
    await TestBed.inject(Router).navigateByUrl('/');
    expect(title()).toBe('anotoki survey');
  });
});
