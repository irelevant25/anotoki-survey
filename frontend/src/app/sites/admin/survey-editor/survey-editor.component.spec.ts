import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { ConfirmService } from '@anotoki/lib/ui/dialog';
import { ToastService } from '@anotoki/lib/ui/toast';
import { type AdminLanguage } from '@anotoki/lib/translations';
import { AdminStore } from '../../../shared/admin/admin-store.service';
import { ApiError, ApiService } from '../../../api/api.service';
import { AuthService } from '../../../shared/auth/auth.service';
import { newOption, newQuestion, newSurvey } from '../../../shared/survey/survey-factory';
import { Person, Survey, SurveyImage, SurveyTranslation } from '../../../shared/survey/survey.model';
import { provideTestTranslations } from '../../../shared/testing/test-translations';
import { RichTextEditorComponent } from '../shared/rich-text-editor/rich-text-editor.component';
import { SurveyEditorComponent } from './survey-editor.component';

const ENGLISH: AdminLanguage = { code: 'en', name: 'English', native_name: 'English', enabled: true, sort_order: 1, seeded: true, strings: 0 };
const SLOVAK: AdminLanguage = { code: 'sk', name: 'Slovak', native_name: 'Slovenčina', enabled: true, sort_order: 2, seeded: true, strings: 0 };
const CZECH: AdminLanguage = { code: 'cs', name: 'Czech', native_name: 'Čeština', enabled: false, sort_order: 3, seeded: false, strings: 0 };
const OWNER: Person = { id: '1', name: 'owner' };
const PICTURE: SurveyImage = { id: 'img1', alt: 'A cup on a table', width: 40, height: 30, src: '/api/images/img1.png' };

/**
 * A title, a welcome with a list, a thanks; one titled step with a choice
 * (two options, a described picture) and an "own words" with a hint: 10 texts.
 */
function survey(revision = 3, translations: Record<string, SurveyTranslation> = {}): Survey {
  const choice = {
    ...newQuestion('single'),
    id: 'q1',
    text: '<p>Tea or coffee?</p>',
    images: [PICTURE],
    options: [
      { ...newOption('Tea'), id: 'a' },
      { ...newOption('Coffee'), id: 'b' },
    ],
  };
  const words = { ...newQuestion('text'), id: 'q2', text: '<p>Why?</p>', placeholder: 'A few words' };
  return {
    ...newSurvey([]),
    id: 'survey-1',
    slug: 'drinks',
    title: 'Drinks',
    intro: '<p>Hello</p><ul><li>honest</li></ul>',
    thanks: '<p>Thanks!</p>',
    askAboutYou: false,
    steps: [{ id: 's1', title: 'Your cup', text: '', images: [], questions: [choice, words] }],
    translations,
    revision,
  };
}

const SLOVAK_PART: SurveyTranslation = {
  title: 'Nápoje',
  intro: '',
  thanks: '',
  steps: {},
  questions: { q1: { text: '<p>Čaj alebo káva?</p>', placeholder: '', options: { a: { label: 'Čaj' } }, images: {} } },
};

/** Every one of the 10 texts, in Slovak. */
const SLOVAK_WHOLE: SurveyTranslation = {
  title: 'Nápoje',
  intro: '<p>Ahoj</p>',
  thanks: '<p>Ďakujeme!</p>',
  steps: { s1: { title: 'Vaša šálka', text: '', images: {} } },
  questions: {
    q1: { text: '<p>Čaj alebo káva?</p>', placeholder: '', options: { a: { label: 'Čaj' }, b: { label: 'Káva' } }, images: { img1: { alt: 'Šálka' } } },
    q2: { text: '<p>Prečo?</p>', placeholder: 'Pár slov', options: {}, images: {} },
  },
};

describe('SurveyEditorComponent: a survey and its translations', () => {
  let fixture: ComponentFixture<SurveyEditorComponent>;
  let host: HTMLElement;
  let store: AdminStore;
  const api = { survey: vi.fn(), saveSurvey: vi.fn(), summaries: vi.fn(), responses: vi.fn(), languages: vi.fn() };

  const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
  const all = (selector: string, within: ParentNode = host) => Array.from(within.querySelectorAll<HTMLElement>(selector));
  const texts = (selector: string, within: ParentNode = host) => all(selector, within).map((element) => clean(element.textContent));
  const tabs = () => texts('app-editor-languages .tab');
  const button = (label: string, within: ParentNode = host) => all('button, a', within).find((candidate) => clean(candidate.textContent) === label);
  /** The field of a translated text, by its place - the input itself, or the rich text's holder. */
  const field = (place: unknown[]) => all('[data-place]').find((element) => element.dataset['place'] === JSON.stringify(place));
  const focused = () => (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('[data-place]')?.dataset['place'] ?? null;
  const translation = (code = 'sk') => store.survey('survey-1')?.translations[code];
  const toasts = () =>
    TestBed.inject(ToastService)
      .toasts()
      .map((toast) => toast.message);

  /** Lets what a click started run out - the promises, the focus that waits for a field - then the page draw. */
  async function settle(ms = 0): Promise<void> {
    await new Promise((done) => setTimeout(done, ms));
    await fixture.whenStable();
  }

  async function click(element: HTMLElement | undefined): Promise<void> {
    expect(element).toBeTruthy();
    element!.click();
    await settle();
  }

  async function type(element: HTMLElement | undefined, value: string): Promise<void> {
    expect(element).toBeTruthy();
    (element as HTMLInputElement).value = value;
    element!.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  async function choose(select: HTMLSelectElement | null, value: string): Promise<void> {
    expect(select).toBeTruthy();
    select!.value = value;
    select!.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
  }

  async function answer(yes: boolean): Promise<{ title: string; message: string }> {
    const confirm = TestBed.inject(ConfirmService);
    const asked = { title: confirm.pending()?.title ?? '', message: confirm.pending()?.message ?? '' };
    confirm.settle(yes);
    await settle();
    return asked;
  }

  /** A list pasted into a field, as a browser hands it over; true when the page took it for itself. */
  function paste(element: HTMLElement, text: string): boolean {
    const event = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clipboardData', { value: { getData: (type: string) => (type === 'text/plain' ? text : ''), files: [], items: [], types: ['text/plain'] } });
    element.dispatchEvent(event);
    return event.defaultPrevented;
  }

  /** The page at /admin/surveys/survey-1/edit - with `?language=` in the address, when one is given. */
  async function page(loaded: Survey = survey(), languages: AdminLanguage[] = [ENGLISH, SLOVAK, CZECH], language?: string): Promise<void> {
    Object.values(api).forEach((fn) => fn.mockReset());
    api.survey.mockResolvedValue(loaded);
    api.summaries.mockResolvedValue([]);
    api.responses.mockResolvedValue([]);
    api.languages.mockResolvedValue(languages);
    api.saveSurvey.mockImplementation((saved: Survey, revision: number) => Promise.resolve({ ...saved, revision: revision + 1 }));
    const person = signal<Person | null>(OWNER);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslations(),
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { person, isAdmin: signal(true), preferences: () => null, onAuthChange: () => () => undefined } },
      ],
    });
    store = TestBed.inject(AdminStore);
    fixture = TestBed.createComponent(SurveyEditorComponent);
    fixture.componentRef.setInput('surveyId', 'survey-1');
    if (language !== undefined) {
      // As the router hands a query parameter over: an input by that name.
      fixture.componentRef.setInput('language', language);
    }
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle();
    await settle();
  }

  /** The page left (for the preview, say) and entered again: a component of its own, the store as it was. */
  async function reenter(): Promise<void> {
    fixture.destroy();
    host.remove();
    fixture = TestBed.createComponent(SurveyEditorComponent);
    fixture.componentRef.setInput('surveyId', 'survey-1');
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle();
    await settle();
  }

  async function openSlovak(loaded: Survey = survey(3, { sk: SLOVAK_PART })): Promise<void> {
    await page(loaded);
    await click(all('app-editor-languages .tab')[1]);
  }

  beforeAll(() => {
    // jsdom draws nothing, so it scrolls nothing.
    Element.prototype.scrollIntoView = () => undefined;
  });

  afterEach(async () => {
    // Nothing of a test is left waiting to be saved into the next one.
    await store.flushAll();
    host.remove();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('marks the language a survey is written in, and offers the others the site has', async () => {
    await page();

    expect(tabs()).toEqual(['English main']);
    expect(texts('app-editor-languages .add-select option')).toEqual(['Add a language…', 'Slovak', 'Czech (hidden)']);
    expect(button('Remove Slovak')).toBeUndefined();
    // No translation's problems, no banner, the editor as ever.
    expect(host.querySelector('#survey-title')).toBeTruthy();
    expect(host.querySelector('app-translated-text')).toBeNull();
    expect(host.querySelector('.translating')).toBeNull();
  });

  it('draws no switch on a site with one language', async () => {
    await page(survey(), [ENGLISH]);
    expect(host.querySelector('app-editor-languages .languages')).toBeNull();
  });

  it('adds a language as an empty translation, opens its tab, and says what is being translated', async () => {
    await page();
    await choose(host.querySelector<HTMLSelectElement>('app-editor-languages .add-select'), 'sk');

    expect(tabs()).toEqual(['English main', 'Slovak 0 / 10']);
    expect(all('app-editor-languages .tab').map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true']);
    expect(translation()).toEqual({ title: '', intro: '', thanks: '', steps: {}, questions: {} });
    expect(texts('app-editor-languages .add-select option')).toEqual(['Add a language…', 'Czech (hidden)']);

    const banner = clean(host.querySelector('anotoki-alert[data-tone="info"]')?.textContent);
    expect(banner).toContain('You are translating this survey into Slovak');
    expect(banner).toContain("The questions themselves - their order, kinds, options, pictures and limits - and the survey's settings are changed in English.");
    expect(clean(host.querySelector('.translating')?.textContent)).toBe('Slovak 0 / 10 texts translated Next missing');

    await store.flush('survey-1');
    expect(api.saveSurvey).toHaveBeenLastCalledWith(expect.objectContaining({ language: 'en', translations: { sk: expect.anything() } }), 3);
  });

  it('shows a tab for each translation with how far it is, a hidden language said to be one', async () => {
    await page(survey(3, { cs: { ...SLOVAK_PART, title: '' }, sk: SLOVAK_PART }));

    expect(tabs()).toEqual(['English main', 'Slovak 3 / 10', 'Czech 2 / 10 hidden']);
    // The enabled language's gaps keep the survey from opening; the hidden one's do not.
    expect(texts('app-editor-outline .problem')).toEqual([
      'Slovak: the welcome text is missing.',
      'Slovak: the thank-you text is missing.',
      'Slovak: the title of step 1 is missing.',
      'Slovak: question 1 has 2 texts to translate.',
      'Slovak: question 2 has 2 texts to translate.',
    ]);
    // In the main language a question's card lists only what the question itself lacks.
    expect(all('app-question-editor .card.has-problems')).toHaveLength(0);
  });

  it('locks the structure in a translation: nothing to add, remove, move, or give another kind or limit', async () => {
    await openSlovak();
    await click(button('Unfold all'));

    for (const gone of [
      '#survey-title',
      '#add-step',
      '.add-question',
      '.step-actions',
      '.head-actions',
      '.grip',
      '.kinds',
      '.segmented',
      '.foot',
      '.adds',
      '.option-actions',
      '.handle',
      '.thumb-actions',
      '.add',
      '.number-input',
      'app-editor-settings',
    ]) {
      expect(host.querySelector('.builder ' + gone) ?? host.querySelector('.side ' + gone), gone).toBeNull();
    }
    expect(all('app-question-editor')).toHaveLength(2);
    expect(texts('app-question-editor .locked')).toEqual(['One choice', 'Own words · optional']);
    // The pictures are the survey's own: shown, with only what they show to translate.
    expect(all('app-image-list-editor .described-image')).toHaveLength(1);
  });

  it('shows every original, read-only, with the field for its translation - each saying its language', async () => {
    await openSlovak();
    await click(button('Unfold all'));

    const originals = all('app-translated-text .original');
    expect(originals.map((original) => clean(original.textContent))).toEqual([
      'Drinks',
      'Hellohonest',
      'Your cup',
      'Tea or coffee?',
      'A cup on a table',
      'Tea',
      'Coffee',
      'Why?',
      'A few words',
      'Thanks!',
    ]);
    expect(originals.every((original) => original.getAttribute('lang') === 'en')).toBe(true);
    expect(originals.some((original) => original.matches('input, textarea, [contenteditable]'))).toBe(false);
    // A rich text is drawn as people will read it: the list is a list.
    expect(host.querySelector('#welcome app-translated-text .original.rich ul li')?.textContent).toBe('honest');

    const fields = all('app-translated-text [data-place]');
    expect(fields).toHaveLength(10);
    expect(fields.every((one) => one.getAttribute('lang') === 'sk')).toBe(true);
    // The original is the one before its field, in the same pair.
    expect(fields.every((one) => one.closest('.pair')?.querySelector('.original') !== null)).toBe(true);
    // No placeholder stands in for the original.
    expect(all('app-translated-text input').every((input) => !input.getAttribute('placeholder'))).toBe(true);

    // What is translated shows; what is not is marked as missing.
    expect((field(['title']) as HTMLInputElement).value).toBe('Nápoje');
    expect((field(['option', 'q1', 'a']) as HTMLInputElement).value).toBe('Čaj');
    expect(all('app-translated-text .pair.is-missing')).toHaveLength(7);
    expect(field(['title'])?.closest('.pair')?.classList.contains('is-missing')).toBe(false);
    expect(field(['option', 'q1', 'b'])?.getAttribute('aria-label')).toBe('Question 1, option 2 in Slovak (not translated yet)');
    expect(clean(field(['thanks'])?.closest('.pair')?.querySelector('.mark')?.textContent)).toBe('Not translated yet');
  });

  it('writes each field into the translation, never into the survey, and counts as it goes', async () => {
    await openSlovak();
    await click(button('Unfold all'));
    const before = store.survey('survey-1')!;

    await type(field(['option', 'q1', 'b']), 'Káva');
    await type(field(['step', 's1']), 'Vaša šálka');
    await type(field(['image', 'q1', 'img1']), 'Šálka na stole');
    await type(field(['placeholder', 'q2']), 'Pár slov');

    expect(tabs()[1]).toBe('Slovak 7 / 10');
    expect(clean(host.querySelector('.translating-count')?.textContent)).toBe('7 / 10');
    expect(translation()).toEqual({
      title: 'Nápoje',
      intro: '',
      thanks: '',
      steps: { s1: { title: 'Vaša šálka', text: '', images: {} } },
      questions: {
        q1: { text: '<p>Čaj alebo káva?</p>', placeholder: '', options: { a: { label: 'Čaj' }, b: { label: 'Káva' } }, images: { img1: { alt: 'Šálka na stole' } } },
        q2: { text: '', placeholder: 'Pár slov', options: {}, images: {} },
      },
    });
    // The survey's own texts and structure are as they were; the map that came was not written into.
    expect(store.survey('survey-1')?.steps).toEqual(before.steps);
    expect(store.survey('survey-1')?.title).toBe('Drinks');
    expect(before.translations['sk']).toEqual(SLOVAK_PART);
    expect(texts('app-editor-outline .question .todo')).toEqual(['1 text to translate']);
  });

  it('draws the form anew for each language, so no field carries one language into another', async () => {
    await page(survey(3, { sk: { ...SLOVAK_PART, intro: '<p>Ahoj</p>' }, cs: { ...SLOVAK_PART, title: 'Napoje', intro: '<p>Nazdar</p>' } }));
    await click(all('app-editor-languages .tab')[1]);
    await settle(60);
    const slovak = field(['intro'])!;
    expect(clean(slovak.querySelector('[contenteditable]')?.textContent)).toBe('Ahoj');

    await click(all('app-editor-languages .tab')[2]);
    await settle(60);
    const czech = field(['intro'])!;
    // Another field altogether - a rich text's undo history stays with the language it was typed in.
    expect(czech).not.toBe(slovak);
    expect(slovak.isConnected).toBe(false);
    expect(czech.getAttribute('lang')).toBe('cs');
    expect(clean(czech.querySelector('[contenteditable]')?.textContent)).toBe('Nazdar');

    await type(field(['title']), 'Piti');
    expect(translation('cs')?.title).toBe('Piti');
    expect(translation('sk')?.title).toBe('Nápoje');
  });

  it('makes no option from a list pasted into a translation, nor from Enter or Backspace', async () => {
    await openSlovak();
    await click(button('Unfold all'));
    const label = field(['option', 'q1', 'b'])!;

    expect(paste(label, 'Káva\nVoda\nNič')).toBe(false);
    label.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    label.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    await settle();
    expect(store.survey('survey-1')?.steps[0].questions[0].options.map((option) => option.label)).toEqual(['Tea', 'Coffee']);
    expect(all('app-options-editor .translated-option')).toHaveLength(2);

    // The same paste in the main language is what it always was: one option a line.
    await click(all('app-editor-languages .tab')[0]);
    expect(paste(all('app-options-editor .option-input')[1], 'Coffee\nWater\nNothing')).toBe(true);
    await settle();
    expect(store.survey('survey-1')?.steps[0].questions[0].options.map((option) => option.label)).toEqual(['Tea', 'Coffee', 'Coffee', 'Water', 'Nothing']);
  });

  it("takes an option's translation away with the option, in the main language", async () => {
    await page(survey(3, { sk: SLOVAK_PART }));
    expect(tabs()[1]).toBe('Slovak 3 / 10');

    await click(all('app-question-editor .summary')[0]);
    await click(all('app-options-editor [aria-label="Remove this option"]')[0]);

    expect(store.survey('survey-1')?.steps[0].questions[0].options.map((option) => option.label)).toEqual(['Coffee']);
    expect(translation()?.questions['q1'].options).toEqual({});
    expect(tabs()[1]).toBe('Slovak 2 / 9');
  });

  it('goes to the next missing text, in the order of the survey, unfolding its question', async () => {
    await openSlovak();
    const next = () => click(button('Next missing'));

    await next();
    await settle(120);
    expect(focused()).toBe('["intro"]');
    await next();
    await settle(120);
    expect(focused()).toBe('["thanks"]');
    await next();
    expect(focused()).toBe('["step","s1"]');
    // Filled in, it is no longer missing; the next one is inside a folded question.
    await type(field(['step', 's1']), 'Vaša šálka');
    expect(all('app-question-editor .card.is-open')).toHaveLength(0);
    await next();
    expect(focused()).toBe('["option","q1","b"]');
    expect(all('app-question-editor .card.is-open')).toHaveLength(1);
    await next();
    expect(focused()).toBe('["image","q1","img1"]');
    // From wherever the cursor was put by hand: on from there.
    field(['title'])!.focus();
    await next();
    await settle(120);
    expect(focused()).toBe('["intro"]');
  });

  it('says so when nothing is missing', async () => {
    const whole: SurveyTranslation = {
      title: 'Nápoje',
      intro: '<p>Ahoj</p>',
      thanks: '<p>Ďakujeme!</p>',
      steps: { s1: { title: 'Vaša šálka', text: '', images: {} } },
      questions: {
        q1: { text: '<p>Čaj alebo káva?</p>', placeholder: '', options: { a: { label: 'Čaj' }, b: { label: 'Káva' } }, images: { img1: { alt: 'Šálka' } } },
        q2: { text: '<p>Prečo?</p>', placeholder: 'Pár slov', options: {}, images: {} },
      },
    };
    await openSlovak(survey(3, { sk: whole }));

    expect(tabs()[1]).toBe('Slovak 10 / 10');
    expect(button('Next missing')).toBeUndefined();
    expect(clean(host.querySelector('.translating-done')?.textContent)).toBe('Nothing is missing');
    expect(all('.pair.is-missing')).toHaveLength(0);
    expect(clean(host.querySelector('app-editor-outline .problems')?.textContent)).toBe('Ready to open');
  });

  it('opens the language a problem is in, at the text that is missing', async () => {
    await page(survey(3, { sk: SLOVAK_PART }));

    await click(all('app-editor-outline .problem').find((problem) => clean(problem.textContent) === 'Slovak: question 2 has 2 texts to translate.'));
    await settle(120);
    expect(all('app-editor-languages .tab')[1].getAttribute('aria-selected')).toBe('true');
    expect(focused()).toBe('["text","q2"]');
    expect(texts('app-question-editor .to-translate')).toEqual(['2 to translate', '2 to translate']);

    // The outline's own entries stay in the language the page is on.
    await click(all('app-editor-outline button.question')[0]);
    expect(all('app-editor-languages .tab')[1].getAttribute('aria-selected')).toBe('true');
    expect(texts('app-editor-outline .question .todo')).toEqual(['2 texts to translate', '2 texts to translate']);
    expect(texts('app-editor-outline .step-name .todo')).toEqual(['1 text to translate']);
  });

  it('removes a translation only after asking, and goes back to the main language', async () => {
    await openSlovak();

    await click(button('Remove Slovak'));
    expect(await answer(false)).toEqual({ title: 'Remove Slovak?', message: 'Its 3 translated texts go, and cannot be brought back. The survey itself stays as it is, in English.' });
    expect(tabs()).toEqual(['English main', 'Slovak 3 / 10']);

    await click(button('Remove Slovak'));
    await answer(true);
    expect(tabs()).toEqual(['English main']);
    expect(store.survey('survey-1')?.translations).toEqual({});
    expect(host.querySelector('#survey-title')).toBeTruthy();
    expect(host.querySelector('app-translated-text')).toBeNull();
    expect(toasts()).toContain('Slovak is removed.');
  });

  it('goes back to the main language by itself when the translation is gone from the survey', async () => {
    await openSlovak();
    expect(host.querySelector('app-translated-text')).toBeTruthy();

    // Not by this page: another tab's removal, arriving with a fresh load.
    store.updateSurvey('survey-1', (current) => ({ ...current, translations: {} }));
    await settle();
    expect(all('app-editor-languages .tab').map((tab) => tab.getAttribute('aria-selected'))).toEqual(['true']);
    expect(host.querySelector('app-translated-text')).toBeNull();
    expect(host.querySelector('#survey-title')).toBeTruthy();
  });

  it('lets the main language be changed only while the survey has no translation', async () => {
    await page();
    const select = () => host.querySelector<HTMLSelectElement>('#survey-language');
    expect(select()?.disabled).toBe(false);
    expect(texts('#survey-language option')).toEqual(['English', 'Slovak', 'Czech (hidden)']);

    await choose(select(), 'sk');
    expect(store.survey('survey-1')?.language).toBe('sk');
    expect(tabs()).toEqual(['Slovak main']);
    expect(texts('app-editor-languages .add-select option')).toEqual(['Add a language…', 'English', 'Czech (hidden)']);

    await choose(host.querySelector<HTMLSelectElement>('app-editor-languages .add-select'), 'en');
    await click(all('app-editor-languages .tab')[0]);
    expect(select()?.disabled).toBe(true);
    expect(clean(host.querySelector('app-editor-settings')?.textContent)).toContain('Translated into English: the language a survey is written in can be changed only while it has no translations.');
  });

  it('opens the preview in the language of the tab', async () => {
    await page(survey(3, { sk: SLOVAK_PART }));
    const preview = () => button('Preview')?.getAttribute('href');
    expect(preview()).toBe('/preview/survey-1');

    await click(all('app-editor-languages .tab')[1]);
    expect(preview()).toBe('/preview/survey-1?language=sk');
  });

  it('opens the tab the address names, when the survey has that translation - anything else is the main language', async () => {
    const selected = () => all('app-editor-languages .tab').map((tab) => tab.getAttribute('aria-selected'));
    const translations = { sk: SLOVAK_PART, cs: SLOVAK_PART };

    await page(survey(3, translations), undefined, 'sk');
    expect(tabs()).toEqual(['English main', 'Slovak 3 / 10', 'Czech 3 / 10 hidden']);
    expect(selected()).toEqual(['false', 'true', 'false']);
    expect(field(['title'])?.getAttribute('lang')).toBe('sk');
    expect(button('Preview')?.getAttribute('href')).toBe('/preview/survey-1?language=sk');

    // The address changes under the page (another "Back to the editor"): that tab - a hidden language's too.
    fixture.componentRef.setInput('language', 'cs');
    await settle();
    expect(selected()).toEqual(['false', 'false', 'true']);
    // A tab chosen by hand stays when the address names none any more (the way to the problems, "Editor" pressed again).
    await click(all('app-editor-languages .tab')[1]);
    fixture.componentRef.setInput('language', undefined);
    await settle();
    expect(selected()).toEqual(['false', 'true', 'false']);
    // A language the survey is not translated into, or a word that is no language at all: the main language.
    for (const other of ['de', 'constructor', '']) {
      fixture.componentRef.setInput('language', 'cs');
      await settle();
      expect(selected(), other).toEqual(['false', 'false', 'true']);
      fixture.componentRef.setInput('language', other);
      await settle();
      expect(selected(), other).toEqual(['true', 'false', 'false']);
      expect(host.querySelector('#survey-title'), other).toBeTruthy();
    }
    // Nothing of this is a change to the survey.
    expect(api.saveSurvey).not.toHaveBeenCalled();
  });

  it.each(['en', 'sk', 'xx'])('opens the main language when the address names the language the survey is written in, or one it does not have: %s', async (named) => {
    await page(survey(), undefined, named);
    expect(tabs()).toEqual(['English main']);
    expect(host.querySelector('#survey-title')).toBeTruthy();
    expect(host.querySelector('app-translated-text')).toBeNull();
    // The language is not added by being named: only the select adds one.
    expect(store.survey('survey-1')?.translations).toEqual({});
    expect(api.saveSurvey).not.toHaveBeenCalled();
  });

  describe('an open survey with a text missing from a translation people are offered', () => {
    const notice = () => all('anotoki-alert[data-tone="danger"]').find((alert) => clean(alert.querySelector('.anotoki-alert__heading')?.textContent) === 'This survey is open, and has problems');
    const noticeText = () => clean(notice()?.querySelector('.anotoki-alert__text')?.textContent);
    const open = (translations: Record<string, SurveyTranslation>): Survey => ({ ...survey(3, translations), status: 'open', openedAt: '2026-09-29T12:00:00.000Z' });

    it('says whose readers see it in the language it is written in - by name, and not that a question is skipped', async () => {
      await page(open({ sk: SLOVAK_PART, cs: { ...SLOVAK_PART, title: '' } }));

      expect(noticeText()).toBe('People are taking it as it is now. Until every text is translated, readers of Slovak see this survey in English.');
      // The tab says the same in a few words; the hidden language's says only that it is hidden.
      expect(tabs()).toEqual(['English main', 'Slovak 3 / 10 shown in English', 'Czech 2 / 10 hidden']);
      expect(all('app-editor-languages .tab')[1].getAttribute('title')).toBe('This survey is open: until every text is translated, readers of Slovak see it in English.');
      expect(all('app-editor-languages .tab')[2].getAttribute('title')).toBe('A hidden language: people are not offered it.');

      // On the translation's tab: the banner, and the bar that stays in view.
      await click(all('app-editor-languages .tab')[1]);
      expect(clean(host.querySelector('anotoki-alert[data-tone="info"]')?.textContent)).toContain('This survey is open: until every text is translated, readers of Slovak see it in English.');
      expect(clean(host.querySelector('.translating')?.textContent)).toBe('Slovak 3 / 10 texts translated Readers see English until all are Next missing');
      await click(all('app-editor-languages .tab')[2]);
      expect(clean(host.querySelector('.translating')?.textContent)).toBe('Czech 2 / 10 texts translated Next missing');
      expect(clean(host.querySelector('anotoki-alert[data-tone="info"]')?.textContent)).toContain('Czech is a hidden language: people are not offered it, so it may stay unfinished.');
    });

    it('names every such language, and keeps the other sentence for the problems that are not a missing translation', async () => {
      await page({ ...open({ sk: SLOVAK_PART, cs: { ...SLOVAK_PART, title: '' } }), slug: 'admin' }, [ENGLISH, SLOVAK, { ...CZECH, enabled: true }]);

      expect(noticeText()).toBe(
        'People are taking it as it is now. A question nobody can answer is skipped for them, but fix what the list says soon. Until every text is translated, readers of Slovak and Czech see this survey in English.',
      );
      expect(tabs()).toEqual(['English main', 'Slovak 3 / 10 shown in English', 'Czech 2 / 10 shown in English']);
    });

    it('goes as the last text is translated', async () => {
      await page(open({ sk: { ...SLOVAK_WHOLE, title: '' } }));
      expect(noticeText()).toBe('People are taking it as it is now. Until every text is translated, readers of Slovak see this survey in English.');
      expect(tabs()[1]).toBe('Slovak 9 / 10 shown in English');

      await click(all('app-editor-languages .tab')[1]);
      expect(host.querySelector('.translating-meanwhile')).toBeTruthy();
      await type(field(['title']), 'Nápoje');
      expect(notice()).toBeUndefined();
      expect(tabs()[1]).toBe('Slovak 10 / 10');
      expect(host.querySelector('.translating-meanwhile')).toBeNull();
    });

    // Where nobody is sent to the original, nothing of the kind is said.
    it('says nothing for a hidden language, however unfinished: nobody reads in it, and it is no problem', async () => {
      await page(open({ cs: SLOVAK_PART }));
      expect(notice()).toBeUndefined();
      expect(tabs()).toEqual(['English main', 'Czech 3 / 10 hidden']);
      await click(all('app-editor-languages .tab')[1]);
      expect(host.querySelector('.translating-meanwhile')).toBeNull();
    });

    it('keeps to the other sentence for a translation that is whole and wrong: it is still the one people get', async () => {
      const same: SurveyTranslation = { ...SLOVAK_WHOLE, questions: { ...SLOVAK_WHOLE.questions, q1: { ...SLOVAK_WHOLE.questions['q1'], options: { a: { label: 'Čaj' }, b: { label: 'čaj' } } } } };
      await page(open({ sk: same }));
      expect(texts('app-editor-outline .problem')).toEqual(['Slovak: question 1 has two options called "čaj".']);
      expect(noticeText()).toBe('People are taking it as it is now. A question nobody can answer is skipped for them, but fix what the list says soon.');
      expect(tabs()[1]).toBe('Slovak 10 / 10');
    });

    it('says nothing of readers on a survey nobody is taking: the tab counts, and the banner says what the gaps keep from happening', async () => {
      await openSlovak();
      expect(notice()).toBeUndefined();
      expect(tabs()[1]).toBe('Slovak 3 / 10');
      expect(host.querySelector('.translating-meanwhile')).toBeNull();
      expect(clean(host.querySelector('anotoki-alert[data-tone="info"]')?.textContent)).toContain(
        'Until every text is translated the survey cannot be opened, and one that is open already is shown in English.',
      );
    });

    it('says nothing of readers once its last day is over, open or not in the database: nobody is taking it, as the header says', async () => {
      await page({ ...open({ sk: { ...SLOVAK_WHOLE, title: '' } }), closesOn: '2020-01-01' });
      expect(clean(host.querySelector('app-survey-header anotoki-badge')?.textContent)).toBe('Closed');
      expect(notice()).toBeUndefined();
      expect(tabs()).toEqual(['English main', 'Slovak 9 / 10']);
      expect(clean(host.querySelector('app-editor-outline #problems-title')?.textContent)).toBe('1 to fix before it reopens');

      await click(all('app-editor-languages .tab')[1]);
      expect(host.querySelector('.translating-meanwhile')).toBeNull();
      expect(clean(host.querySelector('anotoki-alert[data-tone="info"]')?.textContent)).toContain(
        'Until every text is translated the survey cannot be opened, and one that is open already is shown in English.',
      );
    });
  });

  it('settles a conflict met while translating by language: their survey, these Slovak texts', async () => {
    await openSlovak();
    const theirs = { ...survey(7, { sk: { ...SLOVAK_PART, title: 'Ich' } }), title: 'Theirs' };
    api.saveSurvey.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Somebody else has saved this survey.', { survey: theirs }));
    await type(field(['title']), 'Moje nápoje');
    await store.flush('survey-1');
    await settle();

    const alert = host.querySelector<HTMLElement>('anotoki-alert[data-tone="danger"]')!;
    expect(clean(alert.querySelector('.anotoki-alert__heading')?.textContent)).toBe('Somebody changed this survey while you were translating');
    expect(button('Save mine over it', alert)).toBeUndefined();
    // What is kept and what is lost, before the choice is made.
    expect(clean(alert.querySelector('.anotoki-alert__text')?.textContent)).toBe(
      'Your latest Slovak texts are not saved: they were written for an older version. Keep them - the survey is taken as it is saved now, and the Slovak texts you changed since your last save are put into it: ' +
        'every other text stays as it is saved there, and one of theirs is replaced only where you changed the same text - or take the saved version whole, and what you translated since your last save goes.',
    );

    await click(button('Keep my Slovak texts', alert));
    expect(toasts()).toContain(
      'Somebody changed this survey while you were translating. The Slovak texts you changed are put into their version - except those of a step, question, option or picture it no longer has; the questions and every other text are theirs.',
    );
    expect(store.survey('survey-1')).toMatchObject({ title: 'Theirs', translations: { sk: { title: 'Moje nápoje' } } });
    await store.flush('survey-1');
    await settle();
    expect(api.saveSurvey).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Theirs', translations: { sk: expect.objectContaining({ title: 'Moje nápoje' }) } }), 7);
    expect(host.querySelector('anotoki-alert[data-tone="danger"]')).toBeNull();
    // Still on the translation, with their original beside the field.
    expect(clean(field(['title'])?.closest('.pair')?.querySelector('.original')?.textContent)).toBe('Theirs');
  });

  it("keeps another translator's Slovak texts when mine are kept: only the ones changed here replace theirs", async () => {
    await openSlovak();
    // Meanwhile somebody translated the second option and the thanks, and reworded the title.
    const theirs = survey(7, {
      sk: { ...SLOVAK_PART, title: 'Ich', thanks: '<p>Ich ďakujú</p>', questions: { q1: { ...SLOVAK_PART.questions['q1'], options: { a: { label: 'Čaj' }, b: { label: 'Ich káva' } } } } },
    });
    api.saveSurvey.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Somebody else has saved this survey.', { survey: theirs }));
    // Here: the title, and the step.
    await type(field(['title']), 'Moje nápoje');
    await type(field(['step', 's1']), 'Vaša šálka');
    await store.flush('survey-1');
    await settle();

    await click(button('Keep my Slovak texts'));
    expect(translation()).toEqual({
      title: 'Moje nápoje',
      intro: '',
      thanks: '<p>Ich ďakujú</p>',
      steps: { s1: { title: 'Vaša šálka', text: '', images: {} } },
      questions: { q1: { text: '<p>Čaj alebo káva?</p>', placeholder: '', options: { a: { label: 'Čaj' }, b: { label: 'Ich káva' } }, images: {} } },
    });
    await store.flush('survey-1');
    expect(api.saveSurvey).toHaveBeenLastCalledWith(expect.objectContaining({ translations: { sk: translation() } }), 7);
    // The page shows what was kept from each: six texts now, the title the one written here.
    await settle();
    expect(tabs()[1]).toBe('Slovak 6 / 10');
    expect((field(['title']) as HTMLInputElement).value).toBe('Moje nápoje');
  });

  it('says what saving mine over theirs loses and keeps, and keeps the translated texts that were not changed here', async () => {
    await page(survey(3, { sk: SLOVAK_PART }));
    // Meanwhile a translator finished the Slovak.
    api.saveSurvey.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Somebody else has saved this survey.', { survey: { ...survey(7, { sk: SLOVAK_WHOLE }), title: 'Theirs' } }));
    await type(host.querySelector<HTMLElement>('#survey-title')!, 'Mine');
    await store.flush('survey-1');
    await settle();

    const alert = host.querySelector<HTMLElement>('anotoki-alert[data-tone="danger"]')!;
    expect(clean(alert.querySelector('.anotoki-alert__text')?.textContent)).toBe(
      'Your latest changes are not saved: they were made to an older version. Take the survey as it is saved now - your changes since your last save go - or save yours over it. ' +
        'That loses their changes to the questions and the settings; their translations stay as they saved them, except the texts you changed here and the texts of what they removed or reworded, which stay as you have them.',
    );
    await click(button('Save mine over it', alert));
    expect(await answer(true)).toEqual({
      title: 'Save your version over theirs?',
      message:
        'Their changes to the questions and the settings are lost. Their translations stay as they saved them, except the texts you changed here and the texts of what they removed or reworded, which stay as you have them.',
    });
    await store.flush('survey-1');
    await settle();
    expect(api.saveSurvey).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Mine', translations: { sk: SLOVAK_WHOLE } }), 7);
    expect(tabs()).toEqual(['English main', 'Slovak 10 / 10']);
    expect(host.querySelector('anotoki-alert[data-tone="danger"]')).toBeNull();
  });

  it('says so plainly when saving mine over theirs has no translation to keep', async () => {
    // Neither version is translated: nothing to say of translations.
    await page();
    api.saveSurvey.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Somebody else has saved this survey.', { survey: { ...survey(7), title: 'Theirs' } }));
    await type(host.querySelector<HTMLElement>('#survey-title')!, 'Mine');
    await store.flush('survey-1');
    await settle();
    expect(clean(host.querySelector('anotoki-alert[data-tone="danger"] .anotoki-alert__text')?.textContent)).toBe(
      'Your latest changes are not saved: they were made to an older version. Take the survey as it is saved now - your changes since your last save go - or save yours over it.',
    );
    await click(button('Save mine over it'));
    expect((await answer(false)).message).toBe('The changes the other person saved meanwhile are lost.');
    // Not answered yes: nothing is saved over anything.
    expect(api.saveSurvey).toHaveBeenCalledTimes(1);
    await click(button('Take the saved version'));
    expect(store.survey('survey-1')).toMatchObject({ title: 'Theirs', revision: 7 });
  });

  it('says that everything of theirs goes when saving mine over a version written in another language', async () => {
    // Theirs is written in Slovak now, and translated into English: mine is saved whole, and the page says what goes.
    await page();
    api.saveSurvey.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Somebody else has saved this survey.', { survey: { ...survey(7, { en: SLOVAK_WHOLE }), title: 'Ich', language: 'sk' } }));
    await type(host.querySelector<HTMLElement>('#survey-title')!, 'Mine');
    await store.flush('survey-1');
    await settle();
    expect(clean(host.querySelector('anotoki-alert[data-tone="danger"] .anotoki-alert__text')?.textContent)).toBe(
      'Your latest changes are not saved: they were made to an older version. Take the survey as it is saved now - your changes since your last save go - or save yours over it. ' +
        'That loses everything they saved, their translations too: the two versions are written in different languages.',
    );
    await click(button('Save mine over it'));
    expect((await answer(true)).message).toBe('Everything the other person saved meanwhile is lost, their translations too: the two versions are written in different languages.');
    await store.flush('survey-1');
    expect(api.saveSurvey).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Mine', language: 'en', translations: {} }), 7);
  });

  it('settles a conflict whole, as ever, when the survey itself was changed too', async () => {
    await page(survey(3, { sk: SLOVAK_PART }));
    api.saveSurvey.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Somebody else has saved this survey.', { survey: { ...survey(7, { sk: SLOVAK_PART }), title: 'Theirs' } }));
    // A question's own text, then a translated one - both unsaved when the conflict comes.
    await type(host.querySelector<HTMLElement>('#survey-title')!, 'Mine');
    await click(all('app-editor-languages .tab')[1]);
    await type(field(['title']), 'Moje nápoje');
    await store.flush('survey-1');
    await settle();

    const alert = host.querySelector<HTMLElement>('anotoki-alert[data-tone="danger"]')!;
    expect(clean(alert.querySelector('.anotoki-alert__heading')?.textContent)).toBe('Somebody else has saved this survey meanwhile');
    expect(button('Keep my Slovak texts', alert)).toBeUndefined();
    expect(button('Save mine over it', alert)).toBeTruthy();

    await click(button('Take the saved version', alert));
    expect(store.survey('survey-1')).toMatchObject({ title: 'Theirs', revision: 7, translations: { sk: { title: 'Nápoje' } } });
  });

  it('counts only what is still unsaved: a saved change to the survey does not make a later translation conflict a whole one', async () => {
    await page(survey(3, { sk: SLOVAK_PART }));
    await type(host.querySelector<HTMLElement>('#survey-title')!, 'Mine');
    expect(await store.flush('survey-1')).toBe(true);

    await click(all('app-editor-languages .tab')[1]);
    api.saveSurvey.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Somebody else has saved this survey.', { survey: { ...survey(7, { sk: SLOVAK_PART }), title: 'Theirs' } }));
    await type(field(['title']), 'Moje nápoje');
    await store.flush('survey-1');
    await settle();

    expect(clean(host.querySelector('anotoki-alert[data-tone="danger"] .anotoki-alert__heading')?.textContent)).toBe('Somebody changed this survey while you were translating');
    // The bar that stays in view says so too: the notice itself is at the top of the page.
    expect(clean(host.querySelector('.translating-unsaved')?.textContent)).toBe('Not saved - see why');
    await click(button('Take the saved version'));
    expect(store.survey('survey-1')).toMatchObject({ title: 'Theirs', translations: { sk: { title: 'Nápoje' } } });
    expect(host.querySelector('.translating-unsaved')).toBeNull();
  });

  it('knows what is unsaved from the survey, not from the page: left and entered again, a change to the survey still settles a conflict whole', async () => {
    await page(survey(3, { sk: SLOVAK_PART }));
    api.saveSurvey.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Somebody else has saved this survey.', { survey: { ...survey(7, { sk: SLOVAK_PART }), title: 'Theirs' } }));
    await type(host.querySelector<HTMLElement>('#survey-title')!, 'Mine');
    await store.flush('survey-1');
    await settle();

    // Off to the preview and back, the conflict not settled - then a Slovak text.
    await reenter();
    await click(all('app-editor-languages .tab')[1]);
    await type(field(['title']), 'Moje nápoje');

    const alert = host.querySelector<HTMLElement>('anotoki-alert[data-tone="danger"]')!;
    expect(clean(alert.querySelector('.anotoki-alert__heading')?.textContent)).toBe('Somebody else has saved this survey meanwhile');
    // Settled by language, the title typed before the page was left would go without a word.
    expect(button('Keep my Slovak texts', alert)).toBeUndefined();
    await click(button('Save mine over it', alert));
    await answer(true);
    await store.flush('survey-1');
    expect(api.saveSurvey).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Mine', translations: { sk: expect.objectContaining({ title: 'Moje nápoje' }) } }), 7);
  });

  it('knows a conflict met while translating for one on a page entered again, before anything is typed there', async () => {
    await openSlovak();
    api.saveSurvey.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Somebody else has saved this survey.', { survey: { ...survey(7, { sk: SLOVAK_PART }), title: 'Theirs' } }));
    await type(field(['title']), 'Moje nápoje');
    await store.flush('survey-1');
    await settle();

    await reenter();
    const alert = host.querySelector<HTMLElement>('anotoki-alert[data-tone="danger"]')!;
    expect(clean(alert.querySelector('.anotoki-alert__heading')?.textContent)).toBe('Somebody changed this survey while you were translating');
    await click(button('Keep my Slovak texts', alert));
    await store.flush('survey-1');
    expect(api.saveSurvey).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Theirs', translations: { sk: expect.objectContaining({ title: 'Moje nápoje' }) } }), 7);
  });

  it('does not offer mine over a version written in another language while both have translations - the server would refuse it - until mine has none', async () => {
    await page();
    await choose(host.querySelector<HTMLSelectElement>('app-editor-languages .add-select'), 'sk');
    // Meanwhile the survey was set to be written in Slovak, and translated into English.
    api.saveSurvey.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Somebody else has saved this survey.', { survey: { ...survey(7, { en: SLOVAK_WHOLE }), title: 'Nápoje', language: 'sk' } }));
    await type(field(['title']), 'Nápoje');
    await store.flush('survey-1');
    await settle();

    const alert = () => host.querySelector<HTMLElement>('anotoki-alert[data-tone="danger"]')!;
    expect(clean(alert().querySelector('.anotoki-alert__heading')?.textContent)).toBe('Somebody else has saved this survey meanwhile');
    expect(clean(alert().querySelector('.anotoki-alert__text')?.textContent)).toBe(
      'Your latest changes are not saved: they were made to an older version. Take the survey as it is saved now - your changes since your last save go. ' +
        'Yours cannot be saved over it as it is: the saved version is written in Slovak and yours in English, and both have translations - the language a survey is written in changes only while it has no translations. ' +
        "Remove your translations first (with the button on each one's tab), and yours can be saved over it: everything they saved is then lost.",
    );
    expect(button('Save mine over it', alert())).toBeUndefined();
    expect(button('Take the saved version', alert())).toBeTruthy();
    expect(api.saveSurvey).toHaveBeenCalledTimes(1);

    // Without the translation here, mine is one the server takes: offered again, saying what it costs.
    await click(button('Remove Slovak'));
    await answer(true);
    expect(clean(alert().querySelector('.anotoki-alert__text')?.textContent)).toBe(
      'Your latest changes are not saved: they were made to an older version. Take the survey as it is saved now - your changes since your last save go - or save yours over it. ' +
        'That loses everything they saved, their translations too: the two versions are written in different languages.',
    );
    expect(api.saveSurvey).toHaveBeenCalledTimes(1);
    await click(button('Save mine over it', alert()));
    await answer(true);
    await store.flush('survey-1');
    expect(api.saveSurvey).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Drinks', language: 'en', translations: {} }), 7);
  });

  it('says that a language removed here stays removed when mine is saved over theirs - with what they wrote in it since', async () => {
    await page(survey(3, { sk: SLOVAK_PART }));
    // Meanwhile a translator finished the Slovak; here it is removed.
    api.saveSurvey.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Somebody else has saved this survey.', { survey: survey(7, { sk: SLOVAK_WHOLE }) }));
    await click(all('app-editor-languages .tab')[1]);
    await click(button('Remove Slovak'));
    await answer(true);
    await store.flush('survey-1');
    await settle();

    const alert = host.querySelector<HTMLElement>('anotoki-alert[data-tone="danger"]')!;
    expect(clean(alert.querySelector('.anotoki-alert__text')?.textContent)).toMatch(/which stay as you have them\. Slovak, removed here, stays removed - with everything they have written in it\.$/);
    await click(button('Save mine over it', alert));
    expect((await answer(true)).message).toMatch(/which stay as you have them\. Slovak, removed here, stays removed - with everything they have written in it\.$/);
    await store.flush('survey-1');
    expect(api.saveSurvey).toHaveBeenLastCalledWith(expect.objectContaining({ translations: {} }), 7);
  });

  it('says when keeping my texts puts back a translation their version no longer has', async () => {
    await openSlovak();
    api.saveSurvey.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Somebody else has saved this survey.', { survey: { ...survey(7), title: 'Theirs' } }));
    await type(field(['title']), 'Moje nápoje');
    await store.flush('survey-1');
    await settle();

    const alert = host.querySelector<HTMLElement>('anotoki-alert[data-tone="danger"]')!;
    expect(clean(alert.querySelector('.anotoki-alert__text')?.textContent)).toMatch(/goes\. Their version no longer has Slovak: keeping your texts puts that translation back, as it is here\.$/);
    await click(button('Keep my Slovak texts', alert));
    await store.flush('survey-1');
    expect(api.saveSurvey).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Theirs', translations: { sk: { ...SLOVAK_PART, title: 'Moje nápoje' } } }), 7);
  });

  it.each([
    { case: 'a draft', status: 'draft', slug: 'drinks', title: 'Ready to open' },
    { case: 'a draft with a problem', status: 'draft', slug: 'admin', title: '1 to fix before it opens' },
    { case: 'an open survey', status: 'open', slug: 'drinks', title: 'Nothing to fix' },
    { case: 'an open survey with a problem', status: 'open', slug: 'admin', title: '1 to fix - the survey is open' },
    { case: 'a closed survey', status: 'closed', slug: 'drinks', title: 'Ready to reopen' },
    { case: 'a closed survey with a problem', status: 'closed', slug: 'admin', title: '1 to fix before it reopens' },
  ] as const)('calls the list of problems of $case what it is there', async ({ status, slug, title }) => {
    await page({ ...survey(), status, slug });
    expect(clean(host.querySelector('app-editor-outline #problems-title')?.textContent)).toBe(title);
    // The Editor tab's count says the same, when there is one.
    const count = host.querySelector('app-survey-header .count-warn');
    expect(count?.getAttribute('title') ?? null).toBe(slug === 'admin' ? title : null);
  });

  it('words a survey too large to save as the site does, with nothing to try again', async () => {
    await page();
    api.saveSurvey.mockRejectedValueOnce(new ApiError(413, 'too_large', 'That is more than this site takes in one go.'));
    await type(host.querySelector<HTMLElement>('#survey-title')!, 'Longer');
    await store.flush('survey-1');
    await settle();

    const alert = host.querySelector<HTMLElement>('anotoki-alert[data-tone="danger"]')!;
    expect(clean(alert.querySelector('.anotoki-alert__text')?.textContent)).toBe(
      'This survey with its translations is larger than the site keeps in one survey (2 MB). Shorten a text, or remove a translation: the next change is sent again.',
    );
    expect(button('Try again now', alert)).toBeUndefined();
    expect(api.saveSurvey).toHaveBeenCalledTimes(1);
  });

  describe('a step’s own text and pictures', () => {
    const MAP: SurveyImage = { id: 'img2', alt: 'The map', width: 40, height: 30, src: '/api/images/img2.png' };
    /** survey() with a step of text and a picture before its step of questions: 3 texts more. */
    function withTask(translations: Record<string, SurveyTranslation> = {}): Survey {
      const base = survey(3, translations);
      return { ...base, steps: [{ id: 's0', title: 'The task', text: '<p>Go to the <strong>genshin</strong> site, then come back.</p>', images: [MAP], questions: [] }, ...base.steps] };
    }
    /** The rich text fields of the page that are a step's own, by step. */
    const stepText = (stepId: string) => fixture.debugElement.query(By.css(`[id="step-${stepId}"] .step-own app-rich-text-editor`))?.componentInstance as RichTextEditorComponent | undefined;
    const problems = () => texts('app-editor-outline .problem');

    it('adds a step of text alone: its text written in place of questions, the step no problem once it says something', async () => {
      await page();
      await click(button('Add a text step'));
      const added = store.survey('survey-1')!.steps[1];
      expect({ title: added.title, text: added.text, images: added.images, questions: added.questions }).toEqual({ title: '', text: '', images: [], questions: [] });
      // Empty as it is: said, and drawn with its text and pictures to write.
      expect(problems()).toEqual(['Step 2 is empty - add a question, text or a picture, or remove the step.']);
      expect(stepText(added.id)).toBeTruthy();
      expect(clean(host.querySelector(`[id="step-${added.id}"] .step-pictures .section-label`)?.textContent)).toBe('Pictures under the text');
      expect(clean(host.querySelector(`[id="step-${added.id}"] .drop-here`)?.textContent)).toBe('No questions: people read this step and go on with Next. Add one below, or drag one here.');

      stepText(added.id)!.value.set('<p>Go to the genshin site, then come back.</p>');
      await settle();
      expect(store.survey('survey-1')!.steps[1].text).toBe('<p>Go to the genshin site, then come back.</p>');
      expect(problems()).toEqual([]);
      expect(texts('app-editor-outline .text-only')).toEqual(['Text only - no questions']);
      await store.flush('survey-1');
      expect(api.saveSurvey).toHaveBeenLastCalledWith(
        expect.objectContaining({ steps: [expect.anything(), expect.objectContaining({ text: '<p>Go to the genshin site, then come back.</p>', questions: [] })] }),
        3,
      );
    });

    it('gives a step of questions its own text above them when asked - and draws none it has not', async () => {
      await page();
      expect(host.querySelector('[id="step-s1"] .step-own')).toBeNull();
      await click(button('Text and pictures'));
      expect(stepText('s1')).toBeTruthy();
      expect(button('Text and pictures')).toBeUndefined();
      stepText('s1')!.value.set('<p>About your cup.</p>');
      await settle();
      expect(store.survey('survey-1')!.steps[0]).toMatchObject({ text: '<p>About your cup.</p>', images: [] });
      expect(store.survey('survey-1')!.steps[0].questions).toHaveLength(2);
    });

    it('asks before a step goes with its text or its pictures, and says what goes', async () => {
      await page(withTask());
      await click(all('[id="step-s0"] .step-actions button[aria-label="Remove the step"]')[0]);
      expect(await answer(false)).toEqual({ title: 'Remove step 1 "The task"?', message: 'Its text and its picture go with it.' });
      expect(store.survey('survey-1')!.steps).toHaveLength(2);

      await click(all('[id="step-s1"] .step-actions button[aria-label="Remove the step"]')[0]);
      expect(await answer(false)).toEqual({ title: 'Remove step 2 "Your cup"?', message: 'Its 2 questions go with it. To keep a question, move it to another step first.' });

      await click(all('[id="step-s0"] .step-actions button[aria-label="Remove the step"]')[0]);
      await answer(true);
      expect(store.survey('survey-1')!.steps.map((step) => step.id)).toEqual(['s1']);
    });

    it('translates the step’s text and what its pictures show, side by side, its structure locked', async () => {
      await page(withTask({ sk: SLOVAK_PART }));
      await click(all('app-editor-languages .tab')[1]);
      expect(tabs()[1]).toBe('Slovak 3 / 13');

      // The pairs: the original, read-only, and the field for it in Slovak.
      const own = host.querySelector('[id="step-s0"] .step-own')!;
      expect(clean(own.querySelector('app-translated-text .original.rich')?.textContent)).toBe('Go to the genshin site, then come back.');
      expect(own.querySelector('app-translated-text .original.rich strong')?.textContent).toBe('genshin');
      expect(field(['stepText', 's0'])?.getAttribute('lang')).toBe('sk');
      expect(field(['stepImage', 's0', 'img2'])?.getAttribute('aria-label')).toBe('Step 1, picture 1: what it shows in Slovak (not translated yet)');
      // Nothing of the step to add, move or remove there: the picture's own buttons, the text's own field, the way to a text step.
      for (const gone of ['.step-own > app-rich-text-editor', '.add', '.thumb-actions', '.add-text', '#add-text-step']) {
        expect(host.querySelector('.builder ' + gone), gone).toBeNull();
      }

      await type(field(['stepImage', 's0', 'img2']), 'Mapa');
      expect(translation()?.steps['s0']).toEqual({ title: '', text: '', images: { img2: { alt: 'Mapa' } } });
      expect(tabs()[1]).toBe('Slovak 4 / 13');
      expect(store.survey('survey-1')!.steps[0].images).toEqual([MAP]);
      // What the step still lacks: its title and its text - counted on the outline's step.
      expect(texts('app-editor-outline .step-name .todo')).toEqual(['2 texts to translate', '1 text to translate']);
      expect(problems()).toContain('Slovak: step 1 has 1 text to translate.');
    });

    it('goes from a step’s problem to the first of its texts still missing in that language', async () => {
      await page(withTask({ sk: { ...SLOVAK_PART, steps: { s0: { title: 'Úloha', text: '', images: { img2: { alt: 'Mapa' } } } } } }));
      await click(all('app-editor-outline .problem').find((problem) => clean(problem.textContent) === 'Slovak: step 1 has 1 text to translate.'));
      await settle(120);
      expect(all('app-editor-languages .tab')[1].getAttribute('aria-selected')).toBe('true');
      expect(focused()).toBe('["stepText","s0"]');
    });
  });
});
