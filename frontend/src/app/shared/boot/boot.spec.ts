import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { Router, TitleStrategy, provideRouter } from '@angular/router';
import { SiteStatus } from '@anotoki/lib/migrations';
import { TranslationService } from '@anotoki/lib/translations';
import { ToastService } from '@anotoki/lib/ui/toast';
import { ApiService } from '../../api/api.service';
import { AuthService, SignInFailure } from '../auth/auth.service';
import { VisitorKey } from '../auth/visitor-key';
import { BOOTED, boot } from './boot';
import { Changelog } from '../changelog/changelog.service';
import { VISITOR_SLOT, readDraft, writeDraft } from '../survey/drafts';
import { Person } from '../survey/survey.model';
import { provideTestTranslations } from '../testing/test-translations';
import { SurveyTitleStrategy } from '../title.strategy';

const ENGLISH = {
  'brand.site': 'anotoki survey',
  'title.surveys': 'Surveys',
};
const SLOVAK = {
  'brand.site': 'anotoki prieskum',
  'title.surveys': 'Prieskumy',
};

describe('boot(): the whole start', () => {
  const order: string[] = [];
  /** What BOOTED said at each step of the start. */
  const bootedAt: Record<string, boolean> = {};
  const failure = signal<SignInFailure | null>(null);
  const person = signal<Person | null>(null);
  const auth = {
    status: signal('ready'),
    user: signal(null),
    signedIn: () => person() !== null,
    person,
    signInFailure: failure,
    preferences: () => null,
    onAuthChange: () => () => undefined,
    init: vi.fn(async () => {
      order.push('auth');
      bootedAt['auth'] = TestBed.inject(BOOTED)();
    }),
  };
  /** What the server says of the site when the start asks (the family's SiteStatus). */
  let standing = 'ready';
  const siteStatus = {
    check: vi.fn(async () => {
      order.push(`status: ${standing}`);
      return standing;
    }),
  };
  /** The survey's versions, for the footer's version and What's new (shared/changelog/): here an answer that never comes. */
  const changelog = {
    load: vi.fn(() => {
      order.push('changelog');
      return new Promise<void>(() => undefined);
    }),
  };

  beforeEach(() => {
    order.length = 0;
    standing = 'ready';
    failure.set(null);
    person.set(null);
    localStorage.clear();
    auth.init.mockClear();
    siteStatus.check.mockClear();
    changelog.load.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }),
        { provide: AuthService, useValue: auth },
        { provide: SiteStatus, useValue: siteStatus },
        { provide: Changelog, useValue: changelog },
        // Made by the start itself, before anything is awaited: its effect is there for the first sign-in.
        {
          provide: VisitorKey,
          useFactory: () => {
            order.push('visitor key');
            return {};
          },
        },
      ],
    });
    const i18n = TestBed.inject(TranslationService);
    vi.spyOn(i18n, 'init').mockImplementation(async () => {
      order.push('i18n');
      bootedAt['i18n'] = TestBed.inject(BOOTED)();
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it('asks where the site stands first, then signs in, then settles the language - which needs to know who it is', async () => {
    await TestBed.runInInjectionContext(boot);
    expect(order).toEqual(['visitor key', 'changelog', 'status: ready', 'auth', 'i18n']);
    expect(TestBed.inject(ToastService).toasts()).toEqual([]);
  });

  it('asks for the survey’s versions at the very start, beside everything else, and never waits for them: the start ends while they have not come', async () => {
    await TestBed.runInInjectionContext(boot);
    // Before the first await - the footer has its version when the first page is drawn - and never in the way.
    expect(order.indexOf('changelog')).toBeLessThan(order.indexOf('status: ready'));
    expect(changelog.load).toHaveBeenCalledTimes(1);
    expect(TestBed.inject(BOOTED)()).toBe(true);
  });

  it('does not stop on a database update waiting, or on a site that cannot run: the sign-in and the strings come all the same, and the start ends', async () => {
    TestBed.inject(VisitorKey);
    for (const state of ['update-pending', 'not-set-up', 'unavailable']) {
      order.length = 0;
      standing = state;
      await TestBed.runInInjectionContext(boot);
      expect(order).toEqual(['changelog', 'status: ' + state, 'auth', 'i18n']);
      expect(TestBed.inject(BOOTED)()).toBe(true);
    }
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

  it('back from a sign-in, makes the drafts this browser’s visitor left the person’s before anything else - the first page reads them', async () => {
    const draft = { stepIndex: 1, answers: {}, startedAt: '2026-10-01T10:00:00.000Z', savedAt: '2026-10-01T10:05:00.000Z' };
    writeDraft('survey-a', VISITOR_SLOT, draft);
    auth.init.mockImplementationOnce(async () => {
      order.push('auth');
      person.set({ id: '12', name: 'Zuzka' });
    });
    vi.spyOn(TestBed.inject(TranslationService), 'init').mockImplementation(async () => {
      // The language comes after: by now the drafts are where the page will look for them.
      order.push(readDraft('survey-a', '12') ? 'i18n, the draft adopted' : 'i18n, no draft yet');
    });
    await TestBed.runInInjectionContext(boot);
    expect(order).toEqual(['visitor key', 'changelog', 'status: ready', 'auth', 'i18n, the draft adopted']);
    expect(readDraft('survey-a', VISITOR_SLOT)).toBeNull();
  });

  it('leaves a visitor’s drafts where they are while nobody is signed in', async () => {
    const draft = { stepIndex: 0, answers: {}, startedAt: '2026-10-01T10:00:00.000Z', savedAt: '2026-10-01T10:05:00.000Z' };
    writeDraft('survey-a', VISITOR_SLOT, draft);
    await TestBed.runInInjectionContext(boot);
    expect(readDraft('survey-a', VISITOR_SLOT)).toEqual(draft);
  });

  it('says nothing of a failed sign-in itself: the anotoki family’s screen does, where the guards send the first navigation', async () => {
    failure.set({ code: 'access_denied', returnTo: '/genshin-6-1' });
    await TestBed.runInInjectionContext(boot);
    expect(TestBed.inject(ToastService).toasts()).toEqual([]);
    expect(TestBed.inject(BOOTED)()).toBe(true);
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
    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    expect(title()).toBe('Surveys · anotoki survey');
  });

  it('is English in the admin area, where a title may be plain English too', async () => {
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/admin/surveys?tab=people');
    expect(TestBed.inject(TranslationService).englishOnly()).toBe(true);
    expect(title()).toBe('Results · Admin panel · anotoki survey');
    await router.navigateByUrl('/admin');
    expect(title()).toBe('Surveys · Admin panel · anotoki survey');
    await router.navigateByUrl('/');
    expect(TestBed.inject(TranslationService).englishOnly()).toBe(false);
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
    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
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
    expect(title()).toBe('Results · Admin panel · anotoki survey');
    // Back on a participant page: the name alone again.
    await TestBed.inject(Router).navigateByUrl('/');
    expect(title()).toBe('anotoki survey');
  });
});
