import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslationService } from '@anotoki/lib/translations';
import { ApiError, ApiService, ParticipantSurvey } from '../../../core/api/api.service';
import { AuthService, Taker } from '../../../core/auth/auth.service';
import { VisitorKey } from '../../../core/auth/visitor-key';
import { VISITOR_SLOT, writeDraft } from '../../../core/survey/drafts';
import { newQuestion, newStep, newSurvey } from '../../../core/survey/survey-factory';
import { Person } from '../../../core/survey/survey.model';
import { provideTestTranslations } from '../../../core/testing/test-translations';
import { SurveyHomeComponent } from './survey-home.component';

const ENGLISH = {
  'home.title': 'Have your say',
  'home.lead': 'From time to time the anotoki sites ask what you like and what you would change. These surveys are open now.',
  'home.loadFailed': 'The surveys could not be loaded',
  'home.loading': 'Loading the surveys',
  'home.questions.one': '{count} question',
  'home.questions.few': '{count} questions',
  'home.questions.other': '{count} questions',
  'home.minutes.one': 'about {count} min',
  'home.minutes.few': 'about {count} min',
  'home.minutes.other': 'about {count} min',
  'home.openUntil': 'open until {day}',
  'home.badge.taken': 'Taken',
  'home.badge.started': 'Started',
  'home.badge.new': 'New',
  'home.empty.heading': 'No survey is open right now',
  'home.empty.text': 'The sites ask when there is something new to ask about. Come back then!',
  'home.inLanguage': 'Language: {language}',
  'common.tryAgain': 'Try again',
  'error.offline': 'The site could not be reached. Check the connection and try again.',
  'error.http': 'The server answered {status}.',
  'error.unknown': 'Something went wrong.',
  'common.signIn': 'Sign in',
  'visitor.notice.one':
    'You are taking surveys without signing in. This browser remembers which ones you have answered for {count} day after your last visit - sign in, and your answers move into your anotoki account.',
  'visitor.notice.few':
    'You are taking surveys without signing in. This browser remembers which ones you have answered for {count} days after your last visit - sign in, and your answers move into your anotoki account.',
  'visitor.notice.other':
    'You are taking surveys without signing in. This browser remembers which ones you have answered for {count} days after your last visit - sign in, and your answers move into your anotoki account.',
};
const SLOVAK = {
  'home.title': 'Povedzte nám svoj názor',
  'home.lead': 'Stránky anotoki sa z času na čas pýtajú, čo sa Vám páči a čo by ste zmenili. Tieto prieskumy sú práve otvorené.',
  'home.loadFailed': 'Prieskumy sa nepodarilo načítať',
  'home.loading': 'Načítavajú sa prieskumy',
  'home.questions.one': '1 otázka',
  'home.questions.few': '{count} otázky',
  'home.questions.other': '{count} otázok',
  'home.minutes.one': 'približne 1 minúta',
  'home.minutes.few': 'približne {count} minúty',
  'home.minutes.other': 'približne {count} minút',
  'home.openUntil': 'otvorený do {day}',
  'home.badge.taken': 'Vyplnený',
  'home.badge.started': 'Začatý',
  'home.badge.new': 'Nový',
  'home.empty.heading': 'Práve nie je otvorený žiadny prieskum',
  'home.empty.text': 'Stránky sa pýtajú vtedy, keď pribudne niečo nové, na čo sa možno opýtať. Vráťte sa neskôr!',
  'home.inLanguage': 'Jazyk: {language}',
  'common.tryAgain': 'Skúsiť znova',
  'error.offline': 'So stránkou sa nepodarilo spojiť. Skontrolujte pripojenie a skúste to znova.',
  'error.http': 'Server odpovedal kódom {status}.',
  'error.unknown': 'Niečo sa pokazilo.',
  'common.signIn': 'Prihlásiť sa',
  'visitor.notice.one':
    'Prieskumy vypĺňate bez prihlásenia. Tento prehliadač si pamätá, ktoré ste vyplnili, ešte 1 deň po Vašej poslednej návšteve – keď sa prihlásite, Vaše odpovede sa presunú do Vášho anotoki účtu.',
  'visitor.notice.few':
    'Prieskumy vypĺňate bez prihlásenia. Tento prehliadač si pamätá, ktoré ste vyplnili, ešte {count} dni po Vašej poslednej návšteve – keď sa prihlásite, Vaše odpovede sa presunú do Vášho anotoki účtu.',
  'visitor.notice.other':
    'Prieskumy vypĺňate bez prihlásenia. Tento prehliadač si pamätá, ktoré ste vyplnili, ešte {count} dní po Vašej poslednej návšteve – keď sa prihlásite, Vaše odpovede sa presunú do Vášho anotoki účtu.',
};

const YOU: Person = { id: 'person-you', name: 'You', email: 'you@example.com' };

/** An open survey of so many questions to write: a minute each, and nothing else in it. Written in English, in no other language. */
function openSurvey(id: string, title: string, questions: number, closesOn: string | null = null): ParticipantSurvey {
  const step = newStep();
  step.questions = Array.from({ length: questions }, () => newQuestion('text'));
  return { survey: { ...newSurvey([]), id, slug: id, title, askAboutYou: false, status: 'open', closesOn, steps: [step] }, answeredAt: null };
}

/** The same survey with its texts in Slovak too: all of them (a title, a welcome, a thanks - its questions have no words), or the title alone. */
function inSlovakToo(item: ParticipantSurvey, title: string, whole: boolean): ParticipantSurvey {
  const texts = whole ? { intro: '<p>Vitajte!</p>', thanks: '<p>Ďakujeme!</p>' } : { intro: '', thanks: '' };
  return { ...item, survey: { ...item.survey, translations: { sk: { title, ...texts, steps: {}, questions: {} } } } };
}

describe('SurveyHomeComponent', () => {
  let fixture: ComponentFixture<SurveyHomeComponent>;
  let host: HTMLElement;
  let openSurveys: ReturnType<typeof vi.fn>;
  const person = signal<Person | null>(null);
  /** The IAM's switch is off for the site: nobody signed in takes surveys as this browser's visitor. */
  const welcome = signal(false);
  const taker = computed<Taker | null>(() => {
    const me = person();
    return me ? { id: me.id, visitor: false } : welcome() ? { id: VISITOR_SLOT, visitor: true } : null;
  });
  const visitor = { key: signal<string | null>(null), moves: signal(0) };

  const text = (selector: string) => host.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const all = (selector: string) => Array.from(host.querySelectorAll(selector)).map((element) => element.textContent?.replace(/\s+/g, ' ').trim());

  async function page(language: 'en' | 'sk', answer: ParticipantSurvey[] | ApiError | Promise<ParticipantSurvey[]>, slovak: Record<string, string> = SLOVAK): Promise<void> {
    openSurveys = answer instanceof ApiError ? vi.fn().mockRejectedValue(answer) : vi.fn().mockReturnValue(Promise.resolve(answer));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: { openSurveys } },
        { provide: AuthService, useValue: { person, taker, visitorDays: () => 30, preferences: () => null, signIn: vi.fn(async () => true) } },
        { provide: VisitorKey, useValue: visitor },
        language === 'sk' ? provideTestTranslations(slovak, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH),
      ],
    });
    fixture = TestBed.createComponent(SurveyHomeComponent);
    host = fixture.nativeElement;
    await fixture.whenStable();
  }

  beforeEach(() => {
    localStorage.clear();
    person.set(null);
    welcome.set(false);
    visitor.key.set(null);
    visitor.moves.set(0);
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("says in English exactly what it said before it had keys: the heading, a survey's line, its badge", async () => {
    await page('en', [openSurvey('one', 'Quizzes', 1), openSurvey('three', 'Guides', 3, '2099-10-20')]);

    expect(text('h1')).toBe('Have your say');
    expect(text('.lead')).toBe(ENGLISH['home.lead']);
    // The survey's own title is the survey's, as it came.
    expect(all('.survey-title')).toEqual(['Quizzes', 'Guides']);
    expect(all('.survey-meta')).toEqual(['1 question · about 1 min', '3 questions · about 3 min · open until 20 October 2099']);
    expect(all('.survey-state')).toEqual(['New', 'New']);
  });

  it('counts in Slovak by its three forms, and writes the closing day the way Slovak does', async () => {
    await page('sk', [openSurvey('one', 'Kvízy', 1), openSurvey('three', 'Návody', 3, '2099-10-20'), openSurvey('five', 'Novinky', 5), openSurvey('none', 'Prázdny', 0)]);

    expect(text('h1')).toBe('Povedzte nám svoj názor');
    expect(all('.survey-meta')).toEqual([
      '1 otázka · približne 1 minúta',
      '3 otázky · približne 3 minúty · otvorený do 20. októbra 2099',
      '5 otázok · približne 5 minút',
      // Nothing to answer still takes "about a minute" - the estimate never says less.
      '0 otázok · približne 1 minúta',
    ]);
  });

  it('marks each survey for the person: taken, started (a draft in this browser), or new', async () => {
    person.set(YOU);
    writeDraft('started', YOU.id, { stepIndex: 0, answers: {}, startedAt: '2026-09-30T08:00:00Z', savedAt: '2026-09-30T08:00:00Z' });
    await page('sk', [{ ...openSurvey('taken', 'A', 1), answeredAt: '2026-09-29T08:00:00Z' }, openSurvey('started', 'B', 1), openSurvey('new', 'C', 1)]);

    expect(all('.survey-state')).toEqual(['Vyplnený', 'Začatý', 'Nový']);
  });

  it('shows nobody signed in - a visitor - the list for this browser, under the notice that says so, with the days the server keeps a visitor', async () => {
    welcome.set(true);
    writeDraft('started', VISITOR_SLOT, { stepIndex: 0, answers: {}, startedAt: '2026-09-30T08:00:00Z', savedAt: '2026-09-30T08:00:00Z' });
    await page('sk', [{ ...openSurvey('taken', 'A', 1), answeredAt: '2026-09-29T08:00:00Z' }, openSurvey('started', 'B', 1), openSurvey('new', 'C', 1)]);

    expect(all('.survey-state')).toEqual(['Vyplnený', 'Začatý', 'Nový']);
    expect(text('app-visitor-notice anotoki-alert .anotoki-alert__text')).toBe(SLOVAK['visitor.notice.other'].replace('{count}', '30'));
    expect(text('app-visitor-notice button')).toBe('Prihlásiť sa');
  });

  it('shows no notice to somebody signed in', async () => {
    welcome.set(true);
    person.set(YOU);
    await page('sk', [openSurvey('new', 'C', 1)]);
    expect(host.querySelector('app-visitor-notice')).toBeNull();
  });

  it('asks again when the visitor key comes or goes, when a move after a sign-in has finished, and when somebody signs in', async () => {
    welcome.set(true);
    await page('en', [openSurvey('new', 'C', 1)]);
    expect(openSurveys).toHaveBeenCalledTimes(1);

    visitor.key.set('k'.repeat(43));
    await fixture.whenStable();
    expect(openSurveys).toHaveBeenCalledTimes(2);

    visitor.moves.set(1);
    await fixture.whenStable();
    expect(openSurveys).toHaveBeenCalledTimes(3);

    person.set(YOU);
    await fixture.whenStable();
    expect(openSurveys).toHaveBeenCalledTimes(4);
    expect(host.querySelector('app-visitor-notice')).toBeNull();
  });

  it('says so, in the language of the page, when no survey is open - and while they are on their way', async () => {
    let arrive!: (surveys: ParticipantSurvey[]) => void;
    await page('sk', new Promise<ParticipantSurvey[]>((done) => (arrive = done)));

    expect(text('.loading')).toBe('Načítavajú sa prieskumy');

    arrive([]);
    // The answer reaches the page a few microtasks later: let them run, then let the page settle.
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
    expect(text('.loading')).toBeUndefined();
    expect(text('anotoki-empty-state .anotoki-empty-state__heading')).toBe('Práve nie je otvorený žiadny prieskum');
    expect(text('anotoki-empty-state .anotoki-empty-state__text')).toBe(SLOVAK['home.empty.text']);
  });

  it("words a failed load itself, from the error's code - never with the server's English sentence", async () => {
    await page('sk', new ApiError(0, 'offline', 'The site could not be reached. Check the connection and try again.'));

    expect(text('anotoki-alert .anotoki-alert__heading')).toBe('Prieskumy sa nepodarilo načítať');
    expect(text('anotoki-alert')).toContain('So stránkou sa nepodarilo spojiť. Skontrolujte pripojenie a skúste to znova.');
    expect(text('anotoki-alert')).not.toContain('The site could not be reached');
    expect(text('anotoki-alert button')).toBe('Skúsiť znova');
    expect(host.querySelector('.list')).toBeNull();
  });

  it("gives an answer that was not the API's own its status, and one nobody listed the general sentence", async () => {
    await page('en', new ApiError(502, 'http_502', 'The server answered 502.'));
    expect(text('anotoki-alert')).toContain('The server answered 502.');

    TestBed.resetTestingModule();
    await page('en', new ApiError(409, 'surprise', 'A sentence only the server knows.'));
    expect(text('anotoki-alert')).toContain('Something went wrong.');
    expect(text('anotoki-alert')).not.toContain('only the server knows');
  });

  it('loads again on "Try again", and shows the surveys when they come', async () => {
    await page('en', new ApiError(0, 'offline', 'x'));
    openSurveys.mockResolvedValue([openSurvey('one', 'Quizzes', 2)]);

    host.querySelector<HTMLButtonElement>('anotoki-alert button')!.click();
    await fixture.whenStable();

    expect(openSurveys).toHaveBeenCalledTimes(2);
    expect(host.querySelector('anotoki-alert')).toBeNull();
    expect(all('.survey-meta')).toEqual(['2 questions · about 2 min']);
  });

  it('shows a survey in the reader’s language when it has every text in it, and otherwise as it was written - saying which language, and marking the title', async () => {
    await page('sk', [inSlovakToo(openSurvey('whole', 'Guides', 1), 'Návody', true), inSlovakToo(openSurvey('half', 'News', 1), 'Novinky', false), openSurvey('plain', 'Quizzes', 1)]);
    const langs = (selector: string) => Array.from(host.querySelectorAll(selector)).map((element) => element.getAttribute('lang'));

    // A title is never shown in one language over questions in another: "Novinky" waits for the rest.
    expect(all('.survey-title')).toEqual(['Návody', 'News', 'Quizzes']);
    expect(langs('.survey-title')).toEqual([null, 'en', 'en']);
    expect(all('.survey-language')).toEqual(['Jazyk: English', 'Jazyk: English']);
    // The language's name is as its speakers write it, and says so; the site's own words around it say nothing.
    expect(Array.from(host.querySelectorAll('.survey-language [lang]')).map((element) => [element.textContent, element.getAttribute('lang')])).toEqual([
      ['English', 'en'],
      ['English', 'en'],
    ]);
    expect(host.querySelectorAll('[lang]')).toHaveLength(4);
    // The facts are counted from the survey, whichever language it is shown in.
    expect(all('.survey-meta')).toEqual(['1 otázka · približne 1 minúta', '1 otázka · približne 1 minúta', '1 otázka · približne 1 minúta']);

    // In English every one of them is in the language of the page: nothing to say, nothing to mark.
    expect(await TestBed.inject(TranslationService).setLanguage('en', { remember: false })).toBe(true);
    await fixture.whenStable();
    expect(all('.survey-title')).toEqual(['Guides', 'News', 'Quizzes']);
    expect(host.querySelector('.survey-language')).toBeNull();
    expect(host.querySelectorAll('[lang]')).toHaveLength(0);
    expect(openSurveys).toHaveBeenCalledTimes(1);
  });

  it('names a language the site does not offer by its code', async () => {
    const czech = openSurvey('czech', 'Kvízy', 1);
    await page('sk', [{ ...czech, survey: { ...czech.survey, language: 'cs' } }]);

    expect(all('.survey-language')).toEqual(['Jazyk: cs']);
    expect(host.querySelector('.survey-title')?.getAttribute('lang')).toBe('cs');
    // The code is not a word of that language.
    expect(host.querySelector('.survey-language [lang]')).toBeNull();
  });

  it('shows a language note that leaves the name out as it is: no name is glued onto it', async () => {
    // A language other than English may leave a placeholder out.
    await page('sk', [openSurvey('plain', 'Quizzes', 1)], { ...SLOVAK, 'home.inLanguage': 'V inom jazyku' });

    expect(all('.survey-language')).toEqual(['V inom jazyku']);
    expect(host.querySelector('.survey-language [lang]')).toBeNull();
    // The title is still marked as what it is.
    expect(host.querySelector('.survey-title')?.getAttribute('lang')).toBe('en');
  });

  it('follows the language when it is switched: the same surveys and the same failure, worded again, with no new request', async () => {
    await page('sk', [openSurvey('three', 'Návody', 3, '2099-10-20')]);
    expect(all('.survey-meta')).toEqual(['3 otázky · približne 3 minúty · otvorený do 20. októbra 2099']);

    expect(await TestBed.inject(TranslationService).setLanguage('en', { remember: false })).toBe(true);
    await fixture.whenStable();
    expect(text('h1')).toBe('Have your say');
    expect(all('.survey-meta')).toEqual(['3 questions · about 3 min · open until 20 October 2099']);
    expect(all('.survey-title')).toEqual(['Návody']);
    expect(openSurveys).toHaveBeenCalledTimes(1);

    TestBed.resetTestingModule();
    await page('sk', new ApiError(0, 'offline', 'x'));
    expect(text('anotoki-alert')).toContain('So stránkou sa nepodarilo spojiť.');
    expect(await TestBed.inject(TranslationService).setLanguage('en', { remember: false })).toBe(true);
    await fixture.whenStable();
    expect(text('anotoki-alert .anotoki-alert__heading')).toBe('The surveys could not be loaded');
    expect(text('anotoki-alert')).toContain('The site could not be reached. Check the connection and try again.');
    expect(openSurveys).toHaveBeenCalledTimes(1);
  });
});
