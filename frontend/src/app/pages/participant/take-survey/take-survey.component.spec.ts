import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { AdminStore } from '../../../core/admin/admin-store.service';
import { ApiError, ApiService } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { TranslationService } from '../../../core/i18n/translation.service';
import { AGE_ID, GENDER_ID } from '../../../core/survey/about-you';
import { readDraft } from '../../../core/survey/drafts';
import { translationGaps } from '../../../core/survey/localize';
import { newOption, newQuestion, newSurvey } from '../../../core/survey/survey-factory';
import { Person, Question, Survey } from '../../../core/survey/survey.model';
import { provideTestTranslations } from '../../../core/testing/test-translations';
import { ToastService } from '../../../ui/toast/toast.service';
import { TakeSurveyComponent } from './take-survey.component';

/** Every string the page, its question blocks and its hero ask for - what the migration seeds. */
const ENGLISH: Record<string, string> = {
  'brand.site': 'anotoki survey',
  'title.notFound': 'Survey not found',
  'common.tryAgain': 'Try again',
  'time.justNow': 'just now',
  'time.onDate': 'on {date}',
  'take.eyebrow': 'Survey',
  'take.step': 'Step {n} of {m}',
  'take.stepSpoken': 'Step {n} of {m}',
  'take.progress': 'Your progress',
  'take.notOpen.heading': 'This survey is not open yet',
  'take.notOpen.text': 'It will open soon - come back then.',
  'take.closed.heading': 'This survey has closed',
  'take.closed.on': 'It closed on {date}.',
  'take.closed.thanks': 'Thank you for wanting to help - look out for the next one.',
  'take.signIn.heading': 'Sign in to take this survey',
  'take.signIn.text': 'Your anotoki account makes sure everyone answers once. Your answers go to the people who run the anotoki sites, and nowhere else.',
  'take.signIn.button': 'Sign in with anotoki',
  'take.answered.heading': 'You have taken this survey',
  'take.answered.text': 'You sent your answers {when}. Everyone can answer a survey once.',
  'take.sent.heading': 'Thank you!',
  'take.size': '{questions} in {steps}',
  'take.questions.one': '{count} question',
  'take.questions.few': '{count} questions',
  'take.questions.other': '{count} questions',
  'take.steps.one': '{count} step',
  'take.steps.few': '{count} steps',
  'take.steps.other': '{count} steps',
  'take.minutes.one': 'About {count} minute',
  'take.minutes.few': 'About {count} minutes',
  'take.minutes.other': 'About {count} minutes',
  'take.openUntil': 'Open until {day}',
  'take.signedInAs': 'Signed in as {name} · everyone can take this survey once.',
  'take.carryOn.heading': 'Carry on where you stopped?',
  'take.carryOn.text': 'You started this survey {when} and got to step {step} of {steps}. Your answers so far are kept in this browser.',
  'take.carryOn.button': 'Carry on',
  'take.startAgain': 'Start again',
  'take.start': 'Start the survey',
  'take.back': 'Back',
  'take.next': 'Next',
  'take.send': 'Send my answers',
  'take.loading': 'Loading the survey',
  'take.failed.heading': 'The survey could not be loaded',
  'take.failed.text': 'The site did not answer as it should. Try again in a moment.',
  'take.missing.heading': 'There is no survey here',
  'take.missing.text': 'The address may be mistyped, or the survey has been taken down.',
  'take.missing.link': 'See the open surveys',
  'take.refused.question': 'Please look at question {number} again.',
  'take.refused.aboutYou': 'Please look at the questions about you again.',
  'take.refused.unknown': 'One of your answers could not be accepted. Please check them and send them again.',
  'take.refused.closed': 'The survey closed before your answers arrived, so they could not be kept. Sorry!',
  'take.refused.already': 'You have already taken this survey - your first answers are the ones kept.',
  'take.refused.signedOut': 'Your sign-in has run out. Sign in again - your answers are kept in this browser, and are still here when you come back.',
  'take.refused.gone':
    'This survey is no longer at this address, so your answers could not be sent. They are kept in this browser - if the survey has moved, open it from the list of surveys and carry on.',
  'take.answersKept': 'Your answers could not be sent. They are kept in this browser - try again.',
  'take.invalidAnswer': 'Please check this answer.',
  'home.inLanguage': 'Language: {language}',
  'error.unknown': 'Something went wrong.',
  'aboutYou.title': 'About you',
  'aboutYou.genderQuestion': 'What is your gender?',
  'aboutYou.ageQuestion': 'How old are you?',
  'aboutYou.gender.male': 'Male',
  'aboutYou.gender.female': 'Female',
  'aboutYou.gender.non-binary': 'Non-binary',
  'aboutYou.gender.undisclosed': 'Prefer not to say',
  'aboutYou.age.under-18': 'Under 18',
  'aboutYou.age.18-24': '18–24',
  'aboutYou.age.25-34': '25–34',
  'aboutYou.age.35-44': '35–44',
  'aboutYou.age.45-plus': '45 or older',
  'aboutYou.age.undisclosed': 'Prefer not to say',
  'answer.problem.choose': 'Please choose an answer.',
  'answer.problem.writeOther': 'Please write what "{label}" is for you.',
  'question.optional': 'Optional',
  'question.otherPlaceholder': 'Your own answer',
  'question.otherLabel': '{label}: your own answer',
  'question.clear': 'Clear my answer',
};

const SLOVAK: Record<string, string> = {
  'brand.site': 'anotoki prieskum',
  'title.notFound': 'Prieskum sa nenašiel',
  'common.tryAgain': 'Skúsiť znova',
  'time.justNow': 'práve teraz',
  'time.onDate': '{date}',
  'take.eyebrow': 'Prieskum',
  'take.step': 'Krok {n} / {m}',
  'take.stepSpoken': 'Krok {n}, spolu krokov: {m}',
  'take.progress': 'Váš postup',
  'take.notOpen.heading': 'Tento prieskum ešte nie je otvorený',
  'take.notOpen.text': 'Čoskoro ho otvoríme – vráťte sa neskôr.',
  'take.closed.heading': 'Tento prieskum je už uzavretý',
  'take.closed.on': 'Uzavreli sme ho {date}.',
  'take.closed.thanks': 'Ďakujeme, že ste chceli pomôcť – sledujte, kedy príde ďalší.',
  'take.signIn.heading': 'Ak chcete tento prieskum vyplniť, prihláste sa',
  'take.signIn.text': 'Váš anotoki účet zaručuje, že každý odpovie iba raz. Vaše odpovede sa dostanú k ľuďom, ktorí sa starajú o stránky anotoki, a nikam inam.',
  'take.signIn.button': 'Prihlásiť sa cez anotoki',
  'take.answered.heading': 'Tento prieskum ste už vyplnili',
  'take.answered.text': 'Odpovede ste odoslali {when}. Každý môže prieskum vyplniť iba raz.',
  'take.sent.heading': 'Ďakujeme!',
  'take.size': '{questions} · {steps}',
  'take.questions.one': '1 otázka',
  'take.questions.few': '{count} otázky',
  'take.questions.other': '{count} otázok',
  'take.steps.one': '1 krok',
  'take.steps.few': '{count} kroky',
  'take.steps.other': '{count} krokov',
  'take.minutes.one': 'Približne 1 minúta',
  'take.minutes.few': 'Približne {count} minúty',
  'take.minutes.other': 'Približne {count} minút',
  'take.openUntil': 'Otvorený do {day}',
  'take.signedInAs': 'Prihlásili ste sa ako {name} · prieskum môže každý vyplniť iba raz.',
  'take.carryOn.heading': 'Pokračovať tam, kde ste prestali?',
  'take.carryOn.text': 'Tento prieskum ste začali vypĺňať {when} a dostali ste sa po krok {step} / {steps}. Doterajšie odpovede sú uložené v tomto prehliadači.',
  'take.carryOn.button': 'Pokračovať',
  'take.startAgain': 'Začať odznova',
  'take.start': 'Začať prieskum',
  'take.back': 'Späť',
  'take.next': 'Ďalej',
  'take.send': 'Odoslať odpovede',
  'take.loading': 'Načítava sa prieskum',
  'take.failed.heading': 'Prieskum sa nepodarilo načítať',
  'take.failed.text': 'Stránka neodpovedala tak, ako mala. Skúste to o chvíľu znova.',
  'take.missing.heading': 'Tu nie je žiadny prieskum',
  'take.missing.text': 'Možno je v adrese preklep, alebo bol prieskum stiahnutý.',
  'take.missing.link': 'Zobraziť otvorené prieskumy',
  'take.refused.question': 'Pozrite sa, prosím, ešte raz na otázku {number}.',
  'take.refused.aboutYou': 'Pozrite sa, prosím, ešte raz na otázky o Vás.',
  'take.refused.unknown': 'Niektorú z odpovedí sa nepodarilo prijať. Skontrolujte ich, prosím, a odošlite znova.',
  'take.refused.closed': 'Prieskum sa uzavrel skôr, než Vaše odpovede dorazili, takže ich už nebolo možné uložiť. Mrzí nás to!',
  'take.refused.already': 'Tento prieskum ste už vyplnili – uložené zostávajú Vaše prvé odpovede.',
  'take.refused.signedOut': 'Vaše prihlásenie vypršalo. Prihláste sa znova – odpovede zostávajú uložené v tomto prehliadači a po návrate ich tu nájdete.',
  'take.refused.gone':
    'Tento prieskum sa už na tejto adrese nenachádza, takže odpovede sa nepodarilo odoslať. Zostávajú uložené v tomto prehliadači – ak sa prieskum presunul, otvorte ho zo zoznamu prieskumov a pokračujte.',
  'take.answersKept': 'Odpovede sa nepodarilo odoslať. Zostávajú uložené v tomto prehliadači – skúste to znova.',
  'take.invalidAnswer': 'Skontrolujte, prosím, túto odpoveď.',
  'home.inLanguage': 'Jazyk: {language}',
  'error.unknown': 'Niečo sa pokazilo.',
  'aboutYou.title': 'O Vás',
  'aboutYou.genderQuestion': 'Aké je Vaše pohlavie?',
  'aboutYou.ageQuestion': 'Koľko máte rokov?',
  'aboutYou.gender.male': 'Muž',
  'aboutYou.gender.female': 'Žena',
  'aboutYou.gender.non-binary': 'Nebinárne',
  'aboutYou.gender.undisclosed': 'Nechcem uviesť',
  'aboutYou.age.under-18': 'Menej ako 18',
  'aboutYou.age.18-24': '18–24',
  'aboutYou.age.25-34': '25–34',
  'aboutYou.age.35-44': '35–44',
  'aboutYou.age.45-plus': '45 a viac',
  'aboutYou.age.undisclosed': 'Nechcem uviesť',
  'answer.problem.choose': 'Vyberte, prosím, odpoveď.',
  'answer.problem.writeOther': 'Pri možnosti „{label}“ napíšte, prosím, vlastnú odpoveď.',
  'question.optional': 'Nepovinné',
  'question.otherPlaceholder': 'Vaša vlastná odpoveď',
  'question.otherLabel': '{label}: Vaša vlastná odpoveď',
  'question.clear': 'Vymazať odpoveď',
};

const ZUZKA: Person = { id: 'p1', name: 'Zuzka', email: 'zuzka@example.com' };

/** Open, asks about you, two steps: a choice (question 1) and an optional text (question 2). Written in Slovak, in no other language. */
function exampleSurvey(): Survey {
  const element: Question = {
    ...newQuestion('single'),
    id: 'q1',
    text: '<p>Ktorý živel hráte najčastejšie?</p>',
    options: [
      { ...newOption('Anemo'), id: 'o1' },
      { ...newOption('Hydro'), id: 'o2' },
    ],
  };
  const wish: Question = { ...newQuestion('text'), id: 'q2', text: '<p>Čo by ste zmenili?</p>' };
  return {
    ...newSurvey([]),
    id: 's1',
    slug: 'hry',
    title: 'Čo hráte?',
    status: 'open',
    closesOn: '2099-10-20',
    steps: [
      { id: 'st1', title: '', questions: [element] },
      { id: 'st2', title: 'Na záver', questions: [wish] },
    ],
    language: 'sk',
  };
}

/** The same kind of survey written in English, with every one of its texts in Slovak too - "Other" among the options. */
function bilingualSurvey(): Survey {
  const element: Question = {
    ...newQuestion('single'),
    id: 'q1',
    text: '<p>Which element do you play most?</p>',
    options: [
      { ...newOption('Wind'), id: 'o1' },
      { ...newOption('Water'), id: 'o2' },
      { ...newOption('Other', true), id: 'o3' },
    ],
  };
  const wish: Question = { ...newQuestion('text'), id: 'q2', text: '<p>What would you change?</p>', placeholder: 'A sentence or two' };
  return {
    ...newSurvey([]),
    id: 's1',
    slug: 'hry',
    title: 'What do you play?',
    intro: '<p>Welcome!</p>',
    thanks: '<p>Thank you for your time.</p>',
    status: 'open',
    steps: [
      { id: 'st1', title: 'The game', questions: [element] },
      { id: 'st2', title: 'To finish', questions: [wish] },
    ],
    language: 'en',
    translations: {
      sk: {
        title: 'Čo hráte?',
        intro: '<p>Vitajte!</p>',
        thanks: '<p>Ďakujeme za Váš čas.</p>',
        steps: { st1: { title: 'Hra' }, st2: { title: 'Na záver' } },
        questions: {
          q1: { text: '<p>Ktorý živel hráte najčastejšie?</p>', placeholder: '', options: { o1: { label: 'Vietor' }, o2: { label: 'Voda' }, o3: { label: 'Iné' } }, images: {} },
          q2: { text: '<p>Čo by ste zmenili?</p>', placeholder: 'Veta alebo dve', options: {}, images: {} },
        },
      },
    },
  };
}

/** The same, with one option's label still to be translated. */
function halfTranslatedSurvey(): Survey {
  const survey = bilingualSurvey();
  const slovak = survey.translations['sk'];
  const question = slovak.questions['q1'];
  return { ...survey, translations: { sk: { ...slovak, questions: { ...slovak.questions, q1: { ...question, options: { ...question.options, o2: { label: ' ' } } } } } } };
}

describe('TakeSurveyComponent', () => {
  let fixture: ComponentFixture<TakeSurveyComponent>;
  let host: HTMLElement;
  let warn: ReturnType<typeof vi.spyOn>;

  const person = signal<Person | null>(ZUZKA);
  const api = { surveyBySlug: vi.fn(), submit: vi.fn() };

  const text = (selector: string, within: ParentNode = host) => within.querySelector(selector)?.textContent?.replace(/\s+/g, ' ').trim();
  const texts = (selector: string) => Array.from(host.querySelectorAll(selector)).map((element) => element.textContent?.replace(/\s+/g, ' ').trim());
  const blocks = () => Array.from(host.querySelectorAll<HTMLElement>('app-question-block'));
  /** What on the page says it is in a language of its own, and which: by class, or by element for one without. */
  const marked = () => Array.from(host.querySelectorAll('[lang]')).map((element) => `${element.className || element.tagName.toLowerCase()}: ${element.getAttribute('lang')}`);
  const toasts = () => TestBed.inject(ToastService).toasts();

  /**
   * The survey's page at /hry in a language - or, with `preview`, the editor's
   * preview of a survey it holds, at /preview/{id} with that `?language=`.
   */
  async function open(language: 'en' | 'sk' = 'sk', preview?: { survey: Survey; language?: string }, slovak: Record<string, string> = SLOVAK): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        language === 'sk' ? provideTestTranslations(slovak, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH),
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { person, signIn: vi.fn() } },
        { provide: AdminStore, useValue: { survey: (id: string) => (id === preview?.survey.id ? preview.survey : undefined), loadError: () => null, load: vi.fn() } },
      ],
    });
    fixture = TestBed.createComponent(TakeSurveyComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    if (preview) {
      fixture.componentRef.setInput('preview', true);
      fixture.componentRef.setInput('surveyId', preview.survey.id);
      fixture.componentRef.setInput('language', preview.language);
    } else {
      fixture.componentRef.setInput('slug', 'hry');
    }
    await settle();
  }

  /** The page drawn, and what it asked the API for answered and drawn too. */
  async function settle(): Promise<void> {
    for (let turn = 0; turn < 3; turn++) {
      await fixture.whenStable();
      await new Promise((done) => setTimeout(done));
    }
    await fixture.whenStable();
  }

  async function click(selector: string, within: ParentNode = host): Promise<void> {
    within.querySelector<HTMLElement>(selector)!.click();
    await settle();
  }

  /** "Next" or "Send": the step's form is sent. */
  async function next(): Promise<void> {
    host.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await settle();
  }

  async function english(): Promise<void> {
    expect(await TestBed.inject(TranslationService).setLanguage('en', false)).toBe(true);
    await settle();
  }

  beforeEach(() => {
    localStorage.clear();
    person.set(ZUZKA);
    api.surveyBySlug.mockReset().mockResolvedValue({ survey: exampleSurvey(), answeredAt: null });
    api.submit.mockReset();
    // jsdom has no scrolling; the page scrolls to the first problem.
    Element.prototype.scrollIntoView = vi.fn();
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    host?.remove();
    // A key with no string warns: nothing the page asked for in these flows is missing from the strings above.
    expect(warn.mock.calls.filter((call: unknown[]) => String(call[0]).startsWith('[i18n]'))).toEqual([]);
    warn.mockRestore();
  });

  it('welcomes in the reader’s language: the size in two counted phrases, the time, the last day, and who is signed in', async () => {
    await open();

    expect(text('.eyebrow')).toBe('Prieskum');
    expect(texts('.facts li')).toEqual(['2 otázky · 3 kroky', 'Približne 2 minúty', 'Otvorený do 20. októbra 2099']);
    expect(text('.who')).toBe('Prihlásili ste sa ako Zuzka · prieskum môže každý vyplniť iba raz.');
    expect(text('.who strong')).toBe('Zuzka');
    expect(text('.start button')).toBe('Začať prieskum');
    expect(TestBed.inject(Title).getTitle()).toBe('Čo hráte?');

    await english();
    expect(text('.eyebrow')).toBe('Survey');
    // The survey is written in Slovak and in nothing else: on an English page one more fact says so.
    expect(texts('.facts li')).toEqual(['2 questions in 3 steps', 'About 2 minutes', 'Open until 20 October 2099', 'Language: Slovenčina']);
    expect(text('.who')).toBe('Signed in as Zuzka · everyone can take this survey once.');
    expect(text('.start button')).toBe('Start the survey');
  });

  it('shows a sentence that leaves its marked-up value out as it is: no name, and no language, is glued onto it', async () => {
    // A language other than English may leave a placeholder out: "who is signed in" without the name, the language note without the language.
    api.surveyBySlug.mockResolvedValue({ survey: { ...exampleSurvey(), language: 'en' }, answeredAt: null });
    await open('sk', undefined, { ...SLOVAK, 'take.signedInAs': 'Prieskum môže každý vyplniť iba raz.', 'home.inLanguage': 'V inom jazyku' });

    expect(text('.who')).toBe('Prieskum môže každý vyplniť iba raz.');
    expect(host.querySelector('.who strong')).toBeNull();
    expect(text('.fact-language')).toBe('V inom jazyku');
    expect(host.querySelector('.fact-language [lang]')).toBeNull();
  });

  it('words the About-you step again when the language is switched, and keeps what was answered', async () => {
    await open();
    await click('.start button');

    expect(text('.step-heading')).toBe('O Vás');
    expect(text('.where')).toBe('Krok 1 / 3');
    expect(blocks().map((block) => text('.text', block))).toEqual(['Aké je Vaše pohlavie?', 'Koľko máte rokov?']);
    expect(Array.from(blocks()[0].querySelectorAll('.label')).map((label) => label.textContent)).toEqual(['Muž', 'Žena', 'Nebinárne', 'Nechcem uviesť']);
    expect(text('button[type=submit]')).toBe('Ďalej');
    expect(text('.step-actions button')).toBe('Späť');

    // Nothing chosen: both questions say so once the person has tried to go on.
    await next();
    expect(texts('.error span')).toEqual(['Vyberte, prosím, odpoveď.', 'Vyberte, prosím, odpoveď.']);

    await click('input[value="female"]', blocks()[0]);
    expect(texts('.error span')).toEqual(['Vyberte, prosím, odpoveď.']);

    await english();
    expect(text('.step-heading')).toBe('About you');
    expect(text('.where')).toBe('Step 1 of 3');
    expect(blocks().map((block) => text('.text', block))).toEqual(['What is your gender?', 'How old are you?']);
    expect(Array.from(blocks()[1].querySelectorAll('.label')).map((label) => label.textContent)).toEqual(['Under 18', '18–24', '25–34', '35–44', '45 or older', 'Prefer not to say']);
    // The same ids in every language: the answer is still the answer, and the problem is said again.
    expect(blocks()[0].querySelector<HTMLInputElement>('input[value="female"]')?.checked).toBe(true);
    expect(texts('.error span')).toEqual(['Please choose an answer.']);
    expect(text('button[type=submit]')).toBe('Next');
  });

  it('names a step without a title for the ear only', async () => {
    await open();
    await click('.start button');
    await click(`input[value="male"]`, blocks()[0]);
    await click(`input[value="18-24"]`, blocks()[1]);
    await next();

    const heading = host.querySelector('.step-heading')!;
    expect(heading.classList.contains('visually-hidden')).toBe(true);
    expect(heading.textContent).toBe('Krok 2, spolu krokov: 3');
    expect(text('.where')).toBe('Krok 2 / 3');
  });

  async function answerEverything(): Promise<void> {
    await click('.start button');
    await click(`input[value="male"]`, blocks()[0]);
    await click(`input[value="18-24"]`, blocks()[1]);
    await next();
    await click('input[value="o1"]');
    await next();
    expect(text('.step-heading')).toBe('Na záver');
    expect(text('button[type=submit]')).toBe('Odoslať odpovede');
  }

  it('sends the answers, and thanks', async () => {
    api.submit.mockResolvedValue({ id: 'r1', submittedAt: new Date().toISOString() });
    await open();
    await answerEverything();
    await next();

    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(api.submit.mock.calls[0][1]).toMatchObject({ aboutYou: { gender: 'male', age: '18-24' }, answers: { q1: { optionIds: ['o1'] } } });
    expect(text('.done-heading')).toBe('Ďakujeme!');
    expect(toasts()).toEqual([]);
  });

  it('words a refused answer itself - the question by its number - and never shows the server’s sentence', async () => {
    api.submit.mockRejectedValue(new ApiError(422, 'invalid_answer', 'Question 1: Please choose only one.', { questionId: 'q1' }));
    await open();
    await answerEverything();
    await next();

    expect(toasts().map((toast) => [toast.tone, toast.message])).toEqual([['danger', 'Pozrite sa, prosím, ešte raz na otázku 1.']]);
    expect(host.textContent).not.toContain('Please choose only one');
    // Back on the step the server named, and the survey is read again.
    expect(text('.where')).toBe('Krok 2 / 3');
    expect(api.surveyBySlug).toHaveBeenCalledTimes(2);
  });

  it('says "about you" when it is gender or age that was refused', async () => {
    api.submit.mockRejectedValue(new ApiError(422, 'invalid_answer', 'Please choose an answer.', { questionId: AGE_ID }));
    await open();
    await answerEverything();
    await next();

    expect(toasts().map((toast) => toast.message)).toEqual(['Pozrite sa, prosím, ešte raz na otázky o Vás.']);
    expect(text('.step-heading')).toBe('O Vás');
    expect(host.querySelector(`[data-question="${GENDER_ID}"]`)).not.toBeNull();
  });

  it('says that the answers are kept when the request itself failed, beside what failed', async () => {
    api.submit.mockRejectedValue(new ApiError(502, 'bad_gateway', 'THE SERVER’S SENTENCE'));
    await open('en');
    await click('.start button');
    await click(`input[value="male"]`, blocks()[0]);
    await click(`input[value="18-24"]`, blocks()[1]);
    await next();
    await click('input[value="o1"]');
    await next();
    await next();
    // Two whole sentences side by side - and not the server's.
    expect(toasts().map((toast) => toast.message)).toEqual(['Something went wrong. Your answers could not be sent. They are kept in this browser - try again.']);
    // Still on the last step, with everything answered.
    expect(text('button[type=submit]')).toBe('Send my answers');
  });

  it('becomes "there is no survey here" when the survey is gone from its address by the time the answers are sent - and keeps them for where it is now', async () => {
    api.submit.mockRejectedValue(new ApiError(404, 'not_found', 'There is no such survey.'));
    await open();
    await answerEverything();
    await next();

    // Said once, as what it is - not "something went wrong, try again", which could never work.
    expect(toasts().map((toast) => [toast.tone, toast.message])).toEqual([
      [
        'danger',
        'Tento prieskum sa už na tejto adrese nenachádza, takže odpovede sa nepodarilo odoslať. Zostávajú uložené v tomto prehliadači – ak sa prieskum presunul, otvorte ho zo zoznamu prieskumov a pokračujte.',
      ],
    ]);
    expect(host.textContent).not.toContain('There is no such survey');
    // Nothing is left to send again: the page is the one this address has now, with its way to the open surveys.
    expect(host.querySelector('form')).toBeNull();
    expect(text('.message-heading')).toBe('Tu nie je žiadny prieskum');
    expect(text('.message a')).toBe('Zobraziť otvorené prieskumy');
    expect(TestBed.inject(Title).getTitle()).toBe('Prieskum sa nenašiel · anotoki prieskum');
    // It was the send that said so - the survey is not asked for again.
    expect(api.surveyBySlug).toHaveBeenCalledTimes(1);

    // The answers are still in this browser, by the survey's id...
    expect(readDraft('s1', ZUZKA.id)).toMatchObject({ stepIndex: 2, answers: { [GENDER_ID]: { optionIds: ['male'] }, [AGE_ID]: { optionIds: ['18-24'] }, q1: { optionIds: ['o1'] } } });

    // ...so at the address the survey has moved to, the page offers to carry on - on the last step, with everything answered.
    api.surveyBySlug.mockResolvedValue({ survey: { ...exampleSurvey(), slug: 'hry-2026' }, answeredAt: null });
    api.submit.mockReset().mockResolvedValue({ id: 'r1', submittedAt: new Date().toISOString() });
    fixture.componentRef.setInput('slug', 'hry-2026');
    await settle();
    expect(text('.alert-heading')).toBe('Pokračovať tam, kde ste prestali?');
    await click('.alert-actions button');
    expect(text('.step-heading')).toBe('Na záver');
    await next();
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(api.submit.mock.calls[0]).toMatchObject(['hry-2026', { aboutYou: { gender: 'male', age: '18-24' }, answers: { q1: { optionIds: ['o1'] } } }]);
    expect(text('.done-heading')).toBe('Ďakujeme!');
  });

  it('stays on the last step when it is not the API that says 404: that says nothing about the survey', async () => {
    // A proxy's page, the hosting's: no code of the API's in it.
    api.submit.mockRejectedValue(new ApiError(404, 'http_404', 'The server answered 404.'));
    await open('sk', undefined, { ...SLOVAK, 'error.http': 'Server odpovedal kódom {status}.' });
    await answerEverything();
    await next();

    expect(toasts().map((toast) => toast.message)).toEqual(['Server odpovedal kódom 404. Odpovede sa nepodarilo odoslať. Zostávajú uložené v tomto prehliadači – skúste to znova.']);
    expect(text('button[type=submit]')).toBe('Odoslať odpovede');
    expect(host.querySelector('.message-heading')).toBeNull();
  });

  it('says when the person sent their answers, as a phrase inside the sentence', async () => {
    api.surveyBySlug.mockResolvedValue({ survey: exampleSurvey(), answeredAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString() });
    await open();
    expect(text('.message-heading')).toBe('Tento prieskum ste už vyplnili');
    expect(text('.message .muted')).toBe('Odpovede ste odoslali pred 3 hodinami. Každý môže prieskum vyplniť iba raz.');

    await english();
    expect(text('.message .muted')).toBe('You sent your answers 3 hours ago. Everyone can answer a survey once.');
  });

  it('offers to carry on from a draft, saying when it was started and how far', async () => {
    const startedAt = new Date(Date.now() - 25 * 60_000).toISOString();
    const savedAt = new Date(Date.now() - 5 * 60_000).toISOString();
    localStorage.setItem('anotoki-survey:draft:s1:p1', JSON.stringify({ stepIndex: 1, answers: {}, startedAt, savedAt }));
    await open();

    expect(text('.alert-heading')).toBe('Pokračovať tam, kde ste prestali?');
    expect(text('.alert-text')).toBe('Tento prieskum ste začali vypĺňať pred 25 minútami a dostali ste sa po krok 2 / 3. Doterajšie odpovede sú uložené v tomto prehliadači.');
    expect(texts('.alert-actions button')).toEqual(['Pokračovať', 'Začať odznova']);

    await english();
    expect(text('.alert-text')).toBe('You started this survey 25 minutes ago and got to step 2 of 3. Your answers so far are kept in this browser.');
  });

  it('asks a person who is not signed in to sign in, in the language they read', async () => {
    person.set(null);
    await open();
    expect(text('.sign-in-heading')).toBe('Ak chcete tento prieskum vyplniť, prihláste sa');
    expect(text('.start button')).toBe('Prihlásiť sa cez anotoki');

    await click('.start button');
    expect(TestBed.inject(AuthService).signIn).toHaveBeenCalledWith(undefined, 'sk');
  });

  it('says why a survey cannot be taken: not open yet, or closed - with the day', async () => {
    api.surveyBySlug.mockResolvedValue({ survey: { ...exampleSurvey(), status: 'draft' }, answeredAt: null });
    await open();
    expect(text('.message-heading')).toBe('Tento prieskum ešte nie je otvorený');
    expect(text('.message .muted')).toBe('Čoskoro ho otvoríme – vráťte sa neskôr.');
    host.remove();
    TestBed.resetTestingModule();

    api.surveyBySlug.mockResolvedValue({ survey: { ...exampleSurvey(), status: 'closed', closedAt: new Date(2026, 8, 12, 12).toISOString() }, answeredAt: null });
    await open();
    expect(text('.message-heading')).toBe('Tento prieskum je už uzavretý');
    expect(text('.message .muted')).toBe('Uzavreli sme ho 12. 9. 2026. Ďakujeme, že ste chceli pomôcť – sledujte, kedy príde ďalší.');

    await english();
    expect(text('.message .muted')).toBe('It closed on 12 Sept 2026. Thank you for wanting to help - look out for the next one.');
  });

  it('says there is no survey at an address without one, in the tab’s title too', async () => {
    api.surveyBySlug.mockRejectedValue(new ApiError(404, 'not_found', 'There is no survey at this address.'));
    await open();

    expect(text('.message-heading')).toBe('Tu nie je žiadny prieskum');
    expect(text('.message a')).toBe('Zobraziť otvorené prieskumy');
    expect(host.textContent).not.toContain('There is no survey at this address');
    expect(TestBed.inject(Title).getTitle()).toBe('Prieskum sa nenašiel · anotoki prieskum');

    // The title follows the language without a navigation.
    await english();
    expect(TestBed.inject(Title).getTitle()).toBe('Survey not found · anotoki survey');
    expect(text('.message-heading')).toBe('There is no survey here');
  });

  it('offers to try again when the survey could not be loaded', async () => {
    api.surveyBySlug.mockRejectedValue(new ApiError(500, 'server_error', 'Something went wrong on the server.'));
    await open();

    expect(text('.message-heading')).toBe('Prieskum sa nepodarilo načítať');
    expect(text('.message .muted')).toBe('Stránka neodpovedala tak, ako mala. Skúste to o chvíľu znova.');
    expect(text('.message button')).toBe('Skúsiť znova');
    expect(host.textContent).not.toContain('Something went wrong on the server');

    api.surveyBySlug.mockResolvedValue({ survey: exampleSurvey(), answeredAt: null });
    await click('.message button');
    expect(text('.start button')).toBe('Začať prieskum');
  });

  describe('a survey in more than one language', () => {
    const labels = () => Array.from(blocks()[0].querySelectorAll('.label')).map((label) => label.textContent);
    /** Where the preview's "Back to the editor" links lead. */
    const editorLinks = () => Array.from(host.querySelectorAll<HTMLAnchorElement>('a[href^="/admin/surveys/"]')).map((link) => link.getAttribute('href'));

    async function aboutMe(): Promise<void> {
      await click('.start button');
      await click(`input[value="male"]`, blocks()[0]);
      await click(`input[value="18-24"]`, blocks()[1]);
      await next();
    }

    it('is read in the reader’s language when it has every text in it - and follows a switch in the middle, with every answer kept', async () => {
      api.surveyBySlug.mockResolvedValue({ survey: bilingualSurvey(), answeredAt: null });
      api.submit.mockResolvedValue({ id: 'r1', submittedAt: new Date().toISOString() });
      await open();

      expect(text('h1')).toBe('Čo hráte?');
      expect(text('.intro')).toBe('Vitajte!');
      expect(TestBed.inject(Title).getTitle()).toBe('Čo hráte?');
      // Slovak texts on a Slovak page: nothing to say about the language, and nothing to mark.
      expect(host.querySelector('.fact-language')).toBeNull();
      expect(marked()).toEqual([]);

      await aboutMe();
      expect(text('.step-heading')).toBe('Hra');
      expect(text('.text', blocks()[0])).toBe('Ktorý živel hráte najčastejšie?');
      expect(labels()).toEqual(['Vietor', 'Voda', 'Iné']);

      // "Other" without saying what: the problem names the option by the label on the page.
      await click('input[value="o3"]');
      await next();
      expect(texts('.error span')).toEqual(['Pri možnosti „Iné“ napíšte, prosím, vlastnú odpoveď.']);

      // The other language, on a step with an answer given: the same step, the same answer, every text in English.
      await english();
      expect(text('h1')).toBe('What do you play?');
      expect(TestBed.inject(Title).getTitle()).toBe('What do you play?');
      expect(text('.where')).toBe('Step 2 of 3');
      expect(text('.step-heading')).toBe('The game');
      expect(text('.text', blocks()[0])).toBe('Which element do you play most?');
      expect(labels()).toEqual(['Wind', 'Water', 'Other']);
      expect(host.querySelector<HTMLInputElement>('input[value="o3"]')?.checked).toBe(true);
      expect(texts('.error span')).toEqual(['Please write what "Other" is for you.']);
      expect(marked()).toEqual([]);

      // What was said on the step before is still there too.
      await click('.step-actions button');
      expect(text('.step-heading')).toBe('About you');
      expect(blocks()[0].querySelector<HTMLInputElement>('input[value="male"]')?.checked).toBe(true);
      expect(blocks()[1].querySelector<HTMLInputElement>('input[value="18-24"]')?.checked).toBe(true);
      await next();
      await click('input[value="o2"]');
      await next();
      expect(host.querySelector('textarea')?.getAttribute('placeholder')).toBe('A sentence or two');
      await next();

      // The language the texts were in when the answers were sent - not the one the survey was begun in.
      expect(api.submit).toHaveBeenCalledTimes(1);
      expect(api.submit.mock.calls[0][1]).toMatchObject({ language: 'en', aboutYou: { gender: 'male', age: '18-24' }, answers: { q1: { optionIds: ['o2'] } } });
      expect(text('.thanks')).toBe('Thank you for your time.');
    });

    it('sends the language it was read in: the translation’s, for somebody who read the translation', async () => {
      api.surveyBySlug.mockResolvedValue({ survey: bilingualSurvey(), answeredAt: null });
      api.submit.mockResolvedValue({ id: 'r1', submittedAt: new Date().toISOString() });
      await open();
      await aboutMe();
      await click('input[value="o1"]');
      await next();
      expect(host.querySelector('textarea')?.getAttribute('placeholder')).toBe('Veta alebo dve');
      await next();

      expect(api.submit.mock.calls[0][1]).toMatchObject({ language: 'sk' });
      expect(text('.thanks')).toBe('Ďakujeme za Váš čas.');
    });

    it('is shown whole in the language it was written in when the translation misses anything: it says so, and marks the survey’s texts - not the site’s words', async () => {
      const survey = halfTranslatedSurvey();
      expect(translationGaps(survey, 'sk')).toEqual([{ kind: 'option', questionId: 'q1', optionId: 'o2' }]);
      api.surveyBySlug.mockResolvedValue({ survey, answeredAt: null });
      api.submit.mockResolvedValue({ id: 'r1', submittedAt: new Date().toISOString() });
      await open();

      // Every text of the survey in English - the ones that do have a Slovak translation too.
      expect(text('h1')).toBe('What do you play?');
      expect(text('.intro')).toBe('Welcome!');
      expect(TestBed.inject(Title).getTitle()).toBe('What do you play?');
      // The site's own words stay Slovak, and one more fact says which language the survey is in.
      expect(text('.eyebrow')).toBe('Prieskum');
      expect(text('.fact-language')).toBe('Jazyk: English');
      expect(host.querySelector('.fact-language [lang]')?.textContent).toBe('English');
      // Marked: the survey's name, its welcome, and the language's own name - nothing else.
      expect(marked()).toEqual(['title: en', 'intro rich: en', 'span: en']);

      await click('.start button');
      // "About you" is the site's: in Slovak, and not marked.
      expect(text('.step-heading')).toBe('O Vás');
      expect(marked()).toEqual(['title: en']);
      await click(`input[value="male"]`, blocks()[0]);
      await click(`input[value="18-24"]`, blocks()[1]);
      await next();

      expect(text('.step-heading')).toBe('The game');
      expect(labels()).toEqual(['Wind', 'Water', 'Other']);
      expect(marked()).toEqual(['title: en', 'step-heading: en', 'text rich: en', 'label: en', 'label: en', 'label: en']);

      // The problem is the site's sentence, in Slovak, around the option's label as the page shows it.
      await click('input[value="o3"]');
      await next();
      expect(texts('.error span')).toEqual(['Pri možnosti „Other“ napíšte, prosím, vlastnú odpoveď.']);
      expect(host.querySelector('.error')?.closest('[lang]:not(html)')).toBeNull();
      expect(text('button[type=submit]')).toBe('Ďalej');

      await click('input[value="o1"]');
      await next();
      await next();
      expect(api.submit.mock.calls[0][1]).toMatchObject({ language: 'en' });
      expect(text('.done-heading')).toBe('Ďakujeme!');
      expect(text('.thanks')).toBe('Thank you for your time.');
      expect(marked()).toEqual(['title: en', 'rich thanks: en']);
    });

    it('marks the welcome and the thanks for somebody signed out, and for somebody who has answered', async () => {
      person.set(null);
      api.surveyBySlug.mockResolvedValue({ survey: halfTranslatedSurvey(), answeredAt: null });
      await open();
      expect(text('.sign-in-heading')).toBe('Ak chcete tento prieskum vyplniť, prihláste sa');
      expect(marked()).toEqual(['title: en', 'intro rich: en']);
      host.remove();
      TestBed.resetTestingModule();

      person.set(ZUZKA);
      api.surveyBySlug.mockResolvedValue({ survey: halfTranslatedSurvey(), answeredAt: new Date().toISOString() });
      await open();
      expect(text('.message-heading')).toBe('Tento prieskum ste už vyplnili');
      expect(marked()).toEqual(['title: en', 'rich thanks: en']);
    });

    it('names a language the site does not offer by its code', async () => {
      api.surveyBySlug.mockResolvedValue({ survey: { ...bilingualSurvey(), language: 'cs', translations: {} }, answeredAt: null });
      await open();

      expect(text('.fact-language')).toBe('Jazyk: cs');
      // The survey's texts are Czech; the code that names the language is not a Czech word.
      expect(marked()).toEqual(['title: cs', 'intro rich: cs']);
    });

    it('takes no language from the address of a survey people take: `?language=` is the preview’s', async () => {
      api.surveyBySlug.mockResolvedValue({ survey: bilingualSurvey(), answeredAt: null });
      await open('en');
      fixture.componentRef.setInput('language', 'sk');
      await settle();

      expect(text('h1')).toBe('What do you play?');
      expect(marked()).toEqual([]);
    });

    it('previews a translation text by text: what it has in that language, the rest as written - and only the survey’s texts follow it', async () => {
      const whole = bilingualSurvey();
      const slovak = whole.translations['sk'];
      // A translator half-way: the first question's text and the thanks are still to do.
      const survey: Survey = { ...whole, status: 'draft', translations: { sk: { ...slovak, thanks: '', questions: { ...slovak.questions, q1: { ...slovak.questions['q1'], text: '' } } } } };
      await open('en', { survey, language: 'sk' });

      expect(TestBed.inject(Title).getTitle()).toBe('Preview: Čo hráte?');
      expect(text('h1')).toBe('Čo hráte?');
      expect(text('.intro')).toBe('Vitajte!');
      // The page's own words are English - the preview's, and the site's.
      expect(text('.eyebrow')).toBe('Preview');
      expect(text('.fact-language')).toBe('Language: Slovenčina');
      expect(text('.start button')).toBe('Start the survey');
      // The way back opens the editor on the translation that was previewed.
      expect(editorLinks()).toEqual(['/admin/surveys/s1/edit?language=sk']);

      await click('.start button');
      expect(text('.step-heading')).toBe('About you');
      await click(`input[value="male"]`, blocks()[0]);
      await click(`input[value="18-24"]`, blocks()[1]);
      await next();
      expect(text('.step-heading')).toBe('Hra');
      // Not translated yet: the original, so the translator sees what is left.
      expect(text('.text', blocks()[0])).toBe('Which element do you play most?');
      expect(labels()).toEqual(['Vietor', 'Voda', 'Iné']);
      await click('input[value="o1"]');
      await next();
      await next();
      // Nothing is sent from a preview.
      expect(api.submit).not.toHaveBeenCalled();
      expect(text('.thanks')).toBe('Thank you for your time.');
      // Both ways back - the bar's and the one under the thanks - name the translation.
      expect(editorLinks()).toEqual(['/admin/surveys/s1/edit?language=sk', '/admin/surveys/s1/edit?language=sk']);
    });

    it('previews the survey as it is written when the address names no language - whatever the page is in - and for one the survey does not have', async () => {
      // An editor who reads the site in Slovak, a survey with every text in Slovak too, and a preview opened from the main language's tab.
      const survey: Survey = { ...bilingualSurvey(), status: 'draft' };
      await open('sk', { survey });
      expect(text('h1')).toBe('What do you play?');
      expect(text('.intro')).toBe('Welcome!');
      expect(TestBed.inject(Title).getTitle()).toBe('Preview: What do you play?');
      // English texts on a Slovak page: the welcome says so, and they are marked.
      expect(text('.fact-language')).toBe('Jazyk: English');
      expect(marked()).toEqual(['title: en', 'intro rich: en', 'span: en']);
      // No translation is shown, so the way back names no tab.
      expect(editorLinks()).toEqual(['/admin/surveys/s1/edit']);
      await click('.start button');
      await click(`input[value="male"]`, blocks()[0]);
      await click(`input[value="18-24"]`, blocks()[1]);
      await next();
      expect(text('.step-heading')).toBe('The game');
      expect(text('.text', blocks()[0])).toBe('Which element do you play most?');
      expect(labels()).toEqual(['Wind', 'Water', 'Other']);
      host.remove();
      TestBed.resetTestingModule();

      // A translation half done is not mixed in either: nothing Slovak of the survey's is drawn.
      const whole = bilingualSurvey();
      const slovak = whole.translations['sk'];
      const halfDone: Survey = { ...whole, status: 'draft', translations: { sk: { ...slovak, thanks: '', questions: { ...slovak.questions, q1: { ...slovak.questions['q1'], text: '' } } } } };
      await open('sk', { survey: halfDone });
      expect(text('h1')).toBe('What do you play?');
      expect(text('.intro')).toBe('Welcome!');
      expect(text('.fact-language')).toBe('Jazyk: English');
      expect(editorLinks()).toEqual(['/admin/surveys/s1/edit']);
      host.remove();
      TestBed.resetTestingModule();

      await open('en', { survey, language: 'de' });
      expect(text('h1')).toBe('What do you play?');
      expect(host.querySelector('.fact-language')).toBeNull();
      expect(marked()).toEqual([]);
      // The survey as it is written: the editor opens as it always does, with no language named.
      expect(editorLinks()).toEqual(['/admin/surveys/s1/edit']);
      host.remove();
      TestBed.resetTestingModule();

      // The main language named in the address is no translation either.
      await open('sk', { survey, language: 'en' });
      expect(text('h1')).toBe('What do you play?');
      expect(editorLinks()).toEqual(['/admin/surveys/s1/edit']);
    });
  });
});
