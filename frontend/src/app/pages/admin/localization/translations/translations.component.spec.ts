import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LOCALIZATION_DRAFTS_KEY, LocalizationDrafts } from '../../../../core/admin/localization-drafts.service';
import { ApiError, ApiService } from '../../../../core/api/api.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { AdminLanguage, TranslationGrid, TranslationKeyRow } from '../../../../core/i18n/translation.model';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Person } from '../../../../core/survey/survey.model';
import { ConfirmService } from '../../../../ui/confirm/confirm.service';
import { ToastService } from '../../../../ui/toast/toast.service';
import { TranslationsComponent } from './translations.component';

const ENGLISH: AdminLanguage = { code: 'en', name: 'English', nativeName: 'English', enabled: true, sortOrder: 1, seeded: true };
const SLOVAK: AdminLanguage = { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', enabled: true, sortOrder: 2, seeded: true };
const CZECH: AdminLanguage = { code: 'cs', name: 'Czech', nativeName: 'Čeština', enabled: false, sortOrder: 3, seeded: false };
const GERMAN: AdminLanguage = { code: 'de', name: 'German', nativeName: 'Deutsch', enabled: false, sortOrder: 4, seeded: false };

const OWNER: Person = { id: '7', name: 'owner', email: 'owner@example.test' };

/** A promise the test settles by hand: the server's answer, when the test says. */
function later<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const key = (name: string, values: Record<string, string>, description = ''): TranslationKeyRow => ({ name, description, values });

/** As the API sends it: the keys by name, so a family's forms come few, one, other. */
function grid(changes: Record<string, Record<string, string>> = {}, languages: AdminLanguage[] = [ENGLISH, SLOVAK]): TranslationGrid {
  const keys = [
    key('common.close', { en: 'Close', sk: 'Zavrieť' }, 'A button that closes what is open.'),
    key('home.questions.few', { en: '{count} questions', sk: '{count} otázky' }, 'How many questions a survey has. {count} is the number.'),
    key('home.questions.one', { en: '{count} question', sk: '1 otázka' }, 'How many questions a survey has. {count} is the number.'),
    key('home.questions.other', { en: '{count} questions', sk: '{count} otázok' }, 'How many questions a survey has. {count} is the number.'),
    key('home.title', { en: 'Have your say' }, 'Home page: the heading.'),
  ];
  return { languages, keys: keys.map((row) => ({ ...row, values: { ...row.values, ...changes[row.name] } })) };
}

describe('TranslationsComponent', () => {
  let fixture: ComponentFixture<TranslationsComponent>;
  let host: HTMLElement;
  let api: {
    translationGrid: ReturnType<typeof vi.fn>;
    saveTranslations: ReturnType<typeof vi.fn>;
    exportTranslations: ReturnType<typeof vi.fn>;
    importTranslations: ReturnType<typeof vi.fn>;
  };
  let refreshed: ReturnType<typeof vi.fn>;

  const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
  const text = (selector: string, within: ParentNode = host) => clean(within.querySelector(selector)?.textContent);
  const all = (selector: string, within: ParentNode = host) => Array.from(within.querySelectorAll(selector)).map((element) => clean(element.textContent));
  /** The pieces of each element - its children - with a space between, as the eye sees them. */
  const parts = (selector: string) => Array.from(host.querySelectorAll(selector)).map((element) => all(':scope > *', element).join(' '));
  const row = (name: string) => host.querySelector<HTMLElement>(`[id="key-${name}"]`)!;
  const box = (name: string, code: string) => row(name).querySelector<HTMLTextAreaElement>(`textarea[lang="${code}"]`)!;
  const shownKeys = () => all('.key-name');
  const button = (label: string, within: ParentNode = host) => Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((candidate) => clean(candidate.textContent) === label)!;
  const toasts = () =>
    TestBed.inject(ToastService)
      .toasts()
      .map((toast) => toast.message);

  /** Lets the promises of a click run out, then the page draw. */
  async function settle(): Promise<void> {
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
  }

  async function type(element: HTMLTextAreaElement | HTMLInputElement, value: string): Promise<void> {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  /** Answers the question that is open - "Leave without saving?", "Import ... ?" - and says what it asked. */
  async function answer(yes: boolean): Promise<string> {
    const confirm = TestBed.inject(ConfirmService);
    const title = confirm.pending()?.title ?? '';
    confirm.settle(yes);
    await settle();
    return title;
  }

  async function page(answerWith: TranslationGrid | ApiError = grid()): Promise<void> {
    api = {
      translationGrid: answerWith instanceof ApiError ? vi.fn().mockRejectedValue(answerWith) : vi.fn().mockResolvedValue(answerWith),
      saveTranslations: vi.fn(),
      exportTranslations: vi.fn(),
      importTranslations: vi.fn(),
    };
    refreshed = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { person: signal<Person | null>(OWNER), onAuthChange: () => () => undefined } },
        { provide: TranslationService, useValue: { reload: refreshed } },
      ],
    });
    await draw();
  }

  /** The page drawn - the first time, or again after it was taken away. */
  async function draw(): Promise<void> {
    fixture = TestBed.createComponent(TranslationsComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle();
  }

  beforeEach(() => sessionStorage.clear());

  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
    sessionStorage.clear();
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  });

  it('shows a row for every key - its name, what it is for - and a box for every language', async () => {
    await page();

    expect(text('h1')).toBe('Translations');
    expect(all('.grid-head span')).toEqual(['Key', 'English', 'Slovak']);
    expect(shownKeys()).toEqual(['common.close', 'home.questions.one', 'home.questions.few', 'home.questions.other', 'home.title']);
    expect(text('.description', row('common.close'))).toBe('A button that closes what is open.');
    expect(box('common.close', 'en').value).toBe('Close');
    expect(box('common.close', 'sk').value).toBe('Zavrieť');
    expect(box('common.close', 'sk').getAttribute('aria-label')).toBe('Slovak: common.close');
    expect(box('common.close', 'sk').rows).toBe(1);

    // An empty box says what leaving it empty means.
    expect(box('home.title', 'sk').value).toBe('');
    expect(box('home.title', 'sk').placeholder).toBe('Falls back to English');
    expect(box('home.title', 'en').placeholder).toBe('Required');
    expect(text('.shown')).toBe('5 of 5 keys');
  });

  it('says how much of each language is written, and which is the fallback and which is hidden', async () => {
    await page(grid({}, [ENGLISH, SLOVAK, CZECH]));

    expect(all('.language-name strong')).toEqual(['English', 'Slovak', 'Czech']);
    expect(all('.coverage-count')).toEqual(['5 / 5', '4 / 5', '0 / 5']);
    expect(parts('.language-name')).toEqual(['English en Fallback', 'Slovak sk', 'Czech cs Hidden']);
  });

  it('counts a language as written without the forms its numbers never take: German has no `few`', async () => {
    // Every key in German but the family's `few` - which German never says, and the site never reads.
    const german = { 'common.close': { de: 'Schließen' }, 'home.questions.one': { de: '{count} Frage' }, 'home.questions.other': { de: '{count} Fragen' }, 'home.title': { de: 'Ihre Meinung' } };
    // Slovak in the same state is not finished: it says `few` for 2, 3 and 4.
    await page(grid({ ...german, 'home.questions.few': { sk: '' }, 'home.title': { sk: 'Váš názor', de: 'Ihre Meinung' } }, [ENGLISH, SLOVAK, GERMAN]));

    expect(all('.coverage-count')).toEqual(['5 / 5', '4 / 5', '4 / 4']);
    expect(host.querySelectorAll('.coverage-count')[2].getAttribute('aria-label')).toBe('4 of 4 keys have a string in German');
    expect(all('.numbers', row('home.questions.few'))).toEqual([
      'For the numbers: not used in English - the fallback for other languages',
      'For the numbers: 2-4',
      'For the numbers: not used in German',
    ]);

    const select = host.querySelector<HTMLSelectElement>('select')!;
    const missingIn = async (code: string) => {
      select.value = code;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
    };
    await missingIn('de');
    expect(shownKeys()).toEqual([]);
    expect(text('.empty')).toContain('Nothing is missing in German');
    await missingIn('sk');
    expect(shownKeys()).toEqual(['home.questions.one', 'home.questions.few', 'home.questions.other']);
  });

  it('holds a plural family together: one, few, other, the numbers each is for, and the family tried on 1, 3 and 12', async () => {
    await page();

    const block = host.querySelector<HTMLElement>('.block.is-plural')!;
    expect(text('.family code', block)).toBe('home.questions');
    expect(all('.key-name', block)).toEqual(['home.questions.one', 'home.questions.few', 'home.questions.other']);
    expect(all('.numbers', block)).toEqual([
      'For the numbers: 1',
      'For the numbers: 1',
      'For the numbers: not used in English - the fallback for other languages',
      'For the numbers: 2-4',
      'For the numbers: everything else',
      'For the numbers: 0, 5 and more',
    ]);
    expect(text('.samples-lead', block)).toBe('As the site says it for 1, 3 and 12');
    expect(all('.sample[lang="en"] li', block)).toEqual(['1 question', '3 questions', '12 questions']);
    expect(all('.sample[lang="sk"] li', block)).toEqual(['1 otázka', '3 otázky', '12 otázok']);

    // The line follows the boxes as they are typed in - and an emptied form reads in English, as on the site.
    await type(box('home.questions.few', 'sk'), '{count} otázočky');
    expect(all('.sample[lang="sk"] li', block)).toEqual(['1 otázka', '3 otázočky', '12 otázok']);
    await type(box('home.questions.few', 'sk'), '');
    expect(all('.sample[lang="sk"] li', block)).toEqual(['1 otázka', '3 questions', '12 otázok']);
  });

  it('finds by a key or a text, whatever the case and the diacritics', async () => {
    await page();
    const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;

    await type(search, 'ZAVRIET');
    expect(shownKeys()).toEqual(['common.close']);
    expect(text('.shown')).toBe('1 of 5 keys');

    await type(search, 'otazok');
    expect(shownKeys()).toEqual(['home.questions.one', 'home.questions.few', 'home.questions.other']);

    await type(search, 'home.ti');
    expect(shownKeys()).toEqual(['home.title']);

    await type(search, 'nothing like this');
    expect(shownKeys()).toEqual([]);
    expect(text('.empty')).toContain('No key matches');

    button('Show every key').click();
    await settle();
    expect(shownKeys()).toHaveLength(5);
    expect(search.value).toBe('');
  });

  it('shows only what a language is missing - and keeps the row while it is being filled in', async () => {
    await page();
    const select = host.querySelector<HTMLSelectElement>('select')!;
    expect(Array.from(select.options).map((option) => clean(option.textContent))).toEqual(['Every key', 'Missing in Slovak']);

    select.value = 'sk';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(shownKeys()).toEqual(['home.title']);

    await type(box('home.title', 'sk'), 'Povedzte nám svoj názor');
    expect(shownKeys()).toEqual(['home.title']);
  });

  it('saves with one button only the boxes that changed, marks them until then, and takes the grid the server answers', async () => {
    await page();
    const save = button('Save');
    expect(save.disabled).toBe(true);
    expect(text('.save-state')).toBe('Everything is saved');
    expect(host.querySelectorAll('.mark')).toHaveLength(0);

    await type(box('home.title', 'sk'), 'Povedzte nám svoj názor');
    await type(box('common.close', 'en'), 'Shut');
    await type(box('common.close', 'sk'), 'Zatvoriť');
    // Typed back to what the site has: not a change.
    await type(box('common.close', 'sk'), 'Zavrieť');

    expect(save.disabled).toBe(false);
    expect(text('.save-state')).toBe('2 strings changed, not saved yet');
    expect(all('.mark', row('home.title'))).toEqual(['Changed']);
    expect(all('.mark', row('common.close'))).toEqual(['Changed']);
    expect(box('common.close', 'en').closest('.grow')!.classList.contains('is-changed')).toBe(true);
    expect(box('common.close', 'sk').closest('.grow')!.classList.contains('is-changed')).toBe(false);

    // The answer is the grid as it is now - with what somebody else saved meanwhile.
    api.saveTranslations.mockResolvedValue(grid({ 'home.title': { sk: 'Povedzte nám svoj názor' }, 'common.close': { en: 'Shut', sk: 'Zatvoriť' } }));
    save.click();
    await settle();

    expect(api.saveTranslations).toHaveBeenCalledTimes(1);
    expect(api.saveTranslations).toHaveBeenCalledWith({ 'home.title': { sk: 'Povedzte nám svoj názor' }, 'common.close': { en: 'Shut' } });
    expect(box('common.close', 'sk').value).toBe('Zatvoriť');
    expect(host.querySelectorAll('.mark')).toHaveLength(0);
    expect(button('Save').disabled).toBe(true);
    expect(all('.coverage-count')).toEqual(['5 / 5', '5 / 5']);
    expect(toasts()).toEqual(['2 strings are saved.']);
    // The pages people take surveys on get the strings again.
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it("shows the server's refusal beside the key it is about, and keeps what was typed", async () => {
    await page();
    const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    await type(box('home.questions.few', 'sk'), '{pocet} otázky');
    await type(box('home.title', 'sk'), 'Názor');
    // The refused key is brought out of a search that hides it.
    await type(search, 'home.title');
    expect(shownKeys()).toEqual(['home.title']);

    api.saveTranslations.mockRejectedValue(
      new ApiError(422, 'unknown_placeholder', 'The Slovak string of "home.questions.few" uses {pocet}, which its English string does not have.', {
        key: 'home.questions.few',
        language: 'sk',
        placeholder: 'pocet',
      }),
    );
    button('Save').click();
    await settle();

    expect(search.value).toBe('');
    expect(shownKeys()).toHaveLength(5);
    expect(text('.field-error', row('home.questions.few'))).toBe('Nothing was saved. The Slovak string of "home.questions.few" uses {pocet}, which its English string does not have.');
    expect(host.querySelectorAll('.field-error')).toHaveLength(1);
    expect(box('home.questions.few', 'sk').getAttribute('aria-invalid')).toBe('true');
    expect(box('home.questions.few', 'en').getAttribute('aria-invalid')).toBeNull();
    expect(text('.save-state')).toBe('Nothing was saved: see home.questions.few');
    // Nothing is lost: both boxes are as typed, and still to save.
    expect(box('home.questions.few', 'sk').value).toBe('{pocet} otázky');
    expect(box('home.title', 'sk').value).toBe('Názor');
    expect(button('Save').disabled).toBe(false);
    expect(refreshed).not.toHaveBeenCalled();

    // Changing the refused box answers the refusal.
    await type(box('home.questions.few', 'sk'), '{count} otázky!');
    expect(host.querySelectorAll('.field-error')).toHaveLength(0);
    expect(box('home.questions.few', 'sk').getAttribute('aria-invalid')).toBeNull();
  });

  it('says where Save is - in the bar that stays in view - what is about no key: a save that did not reach the server', async () => {
    await page();
    await type(box('home.title', 'sk'), 'Názor');
    api.saveTranslations.mockRejectedValue(new ApiError(0, 'offline', 'The site could not be reached. Check the connection and try again.'));
    button('Save').click();
    await settle();

    expect(text('.save-state')).toBe('Nothing was saved. The site could not be reached. Check the connection and try again.');
    expect(host.querySelector('.save-state .save-refused')).not.toBeNull();
    // A live region: said to somebody who does not see the bar, too.
    expect(host.querySelector('.save-state')!.getAttribute('role')).toBe('status');
    // Not at the top of the page, far above a key low in the list.
    expect(host.querySelector('app-alert')).toBeNull();
    expect(host.querySelectorAll('.field-error')).toHaveLength(0);
    expect(box('home.title', 'sk').value).toBe('Názor');
    expect(button('Save').disabled).toBe(false);
    expect(toasts()).toEqual([]);

    // The next save that works takes the sentence away.
    api.saveTranslations.mockResolvedValue(grid({ 'home.title': { sk: 'Názor' } }));
    button('Save').click();
    await settle();
    expect(text('.save-state')).toBe('Everything is saved');
  });

  it('takes the failure out of the bar at the next keystroke - the next try has begun - and says again what stands', async () => {
    await page();
    await type(box('home.title', 'sk'), 'Názor');
    api.saveTranslations.mockRejectedValue(new ApiError(0, 'offline', 'The site could not be reached. Check the connection and try again.'));
    button('Save').click();
    await settle();
    expect(text('.save-state')).toBe('Nothing was saved. The site could not be reached. Check the connection and try again.');

    // Typing on: the count is back, with the box typed in since.
    await type(box('common.close', 'en'), 'Shut');
    expect(text('.save-state')).toBe('2 strings changed, not saved yet');
    expect(host.querySelector('.save-state .save-refused')).toBeNull();

    // Both typed back to what is stored: nothing to save - and the bar does not say "Nothing was saved".
    await type(box('common.close', 'en'), 'Close');
    await type(box('home.title', 'sk'), '');
    expect(text('.save-state')).toBe('Everything is saved');
    expect(button('Save').disabled).toBe(true);
  });

  it('takes a box with nothing in it to see, where the site has no string, for no change - as the server would save it', async () => {
    await page();

    // A zero-width space, or spaces, over no Slovak string: saved, it would be no string still.
    await type(box('home.title', 'sk'), '​');
    expect(text('.save-state')).toBe('Everything is saved');
    expect(button('Save').disabled).toBe(true);
    expect(host.querySelectorAll('.mark')).toHaveLength(0);
    await type(box('home.title', 'sk'), ' ⁠ ');
    expect(button('Save').disabled).toBe(true);

    // Over a string the site has, it takes that string away: a change, and the form reads in English meanwhile.
    const block = host.querySelector<HTMLElement>('.block.is-plural')!;
    await type(box('home.questions.few', 'sk'), '​');
    expect(text('.save-state')).toBe('1 string changed, not saved yet');
    expect(all('.sample[lang="sk"] li', block)).toEqual(['1 otázka', '3 questions', '12 otázok']);

    api.saveTranslations.mockResolvedValue(grid({ 'home.questions.few': { sk: '' } }));
    button('Save').click();
    await settle();
    expect(api.saveTranslations).toHaveBeenCalledWith({ 'home.questions.few': { sk: '​' } });
    expect(toasts()).toEqual(['The string is saved.']);
  });

  it('says the same in the bar for a server that failed, and takes it away with Discard', async () => {
    await page();
    await type(box('home.title', 'sk'), 'Názor');
    api.saveTranslations.mockRejectedValue(new ApiError(500, 'server_error', 'Something went wrong on the server.'));
    button('Save').click();
    await settle();
    expect(text('.save-state')).toBe('Nothing was saved. Something went wrong on the server.');

    button('Discard').click();
    await settle();
    await answer(true);
    expect(text('.save-state')).toBe('Everything is saved');
  });

  it('gets past a refusal about a language that is gone: reads the grid again, keeps the rest, and says so where Save is', async () => {
    await page(grid({}, [ENGLISH, SLOVAK, CZECH]));
    await type(box('home.title', 'cs'), 'Řekněte nám svůj názor');
    await type(box('home.title', 'sk'), 'Povedzte nám svoj názor');
    expect(text('.save-state')).toBe('2 strings changed, not saved yet');

    // Czech was deleted by somebody else meanwhile: the whole save is refused on its first cell.
    api.saveTranslations.mockRejectedValue(new ApiError(422, 'unknown_language', 'The site has no language "cs".', { key: 'home.title', language: 'cs' }));
    // ... and the grid, read again, has no Czech - and a string somebody else saved.
    api.translationGrid.mockResolvedValue(grid({ 'common.close': { sk: 'Zatvoriť' } }));
    button('Save').click();
    await settle();

    expect(api.translationGrid).toHaveBeenCalledTimes(2);
    expect(all('.grid-head span')).toEqual(['Key', 'English', 'Slovak']);
    expect(row('home.title').querySelector('textarea[lang="cs"]')).toBeNull();
    expect(box('common.close', 'sk').value).toBe('Zatvoriť');
    // The Slovak box is as typed, marked, and still to save.
    expect(box('home.title', 'sk').value).toBe('Povedzte nám svoj názor');
    expect(all('.mark', row('home.title'))).toEqual(['Changed']);
    expect(text('.save-state')).toBe('Nothing was saved. The site has no language "cs". What was typed for it could not be kept. Save again for the rest.');
    // Not beside the key: no box is left that could answer it.
    expect(host.querySelectorAll('.field-error')).toHaveLength(0);
    expect(host.querySelector('textarea[aria-invalid="true"]')).toBeNull();

    // The next Save sends what is left, and goes through.
    api.saveTranslations.mockResolvedValue(grid({ 'common.close': { sk: 'Zatvoriť' }, 'home.title': { sk: 'Povedzte nám svoj názor' } }));
    button('Save').click();
    await settle();
    expect(api.saveTranslations).toHaveBeenLastCalledWith({ 'home.title': { sk: 'Povedzte nám svoj názor' } });
    expect(text('.save-state')).toBe('Everything is saved');
    expect(toasts()).toEqual(['The string is saved.']);
  });

  it('says only that nothing could be kept when everything typed was for the language that is gone', async () => {
    await page(grid({}, [ENGLISH, SLOVAK, CZECH]));
    await type(box('home.title', 'cs'), 'Řekněte nám svůj názor');
    api.saveTranslations.mockRejectedValue(new ApiError(422, 'unknown_language', 'The site has no language "cs".', { key: 'home.title', language: 'cs' }));
    api.translationGrid.mockResolvedValue(grid());
    button('Save').click();
    await settle();

    expect(text('.save-state')).toBe('Nothing was saved. The site has no language "cs". What was typed for it could not be kept.');
    expect(button('Save').disabled).toBe(true);
  });

  it('shows such a refusal beside its key, as any other, when the grid cannot be read again', async () => {
    await page(grid({}, [ENGLISH, SLOVAK, CZECH]));
    await type(box('home.title', 'cs'), 'Řekněte nám svůj názor');
    api.saveTranslations.mockRejectedValue(new ApiError(422, 'unknown_language', 'The site has no language "cs".', { key: 'home.title', language: 'cs' }));
    api.translationGrid.mockRejectedValue(new ApiError(0, 'offline', 'The site could not be reached. Check the connection and try again.'));
    button('Save').click();
    await settle();

    expect(text('.field-error', row('home.title'))).toBe('Nothing was saved. The site has no language "cs".');
    expect(text('.save-state')).toBe('Nothing was saved: see home.title');
    expect(box('home.title', 'cs').value).toBe('Řekněte nám svůj názor');
  });

  it('keeps what is typed while a save is on its way - even the old text typed back', async () => {
    await page();
    await type(box('common.close', 'en'), 'Shut');
    const saving = later<TranslationGrid>();
    api.saveTranslations.mockReturnValue(saving.promise);
    button('Save').click();
    await settle();
    expect(api.saveTranslations).toHaveBeenCalledWith({ 'common.close': { en: 'Shut' } });

    // Before the answer: back to what the site had when the save left - which the save is about to replace.
    await type(box('common.close', 'en'), 'Close');
    saving.resolve(grid({ 'common.close': { en: 'Shut' } }));
    await settle();

    // The site says "Shut" now; the box says what was typed, and that is a change again.
    expect(box('common.close', 'en').value).toBe('Close');
    expect(all('.mark', row('common.close'))).toEqual(['Changed']);
    expect(text('.save-state')).toBe('1 string changed, not saved yet');
    expect(button('Save').disabled).toBe(false);
  });

  it('lets go of a box typed back to the old text when the save it waited for fails', async () => {
    await page();
    await type(box('common.close', 'en'), 'Shut');
    const saving = later<TranslationGrid>();
    api.saveTranslations.mockReturnValue(saving.promise);
    button('Save').click();
    await settle();

    await type(box('common.close', 'en'), 'Close');
    saving.reject(new ApiError(0, 'offline', 'The site could not be reached. Check the connection and try again.'));
    await settle();

    // Nothing was saved, and the box says what the site has: no change is left.
    expect(box('common.close', 'en').value).toBe('Close');
    expect(host.querySelectorAll('.mark')).toHaveLength(0);
    expect(button('Save').disabled).toBe(true);
  });

  it('keeps a row found only by its unsaved words while they are being rewritten', async () => {
    await page();
    const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    await type(box('home.title', 'sk'), 'Povedzte nám svoj názor');
    await type(search, 'nazor');
    expect(shownKeys()).toEqual(['home.title']);

    // The word that was found is the one being changed: the row, its box and the cursor stay.
    const typedIn = box('home.title', 'sk');
    typedIn.focus();
    await type(typedIn, 'Povedzte nám svoj pohľad');
    expect(shownKeys()).toEqual(['home.title']);
    expect(box('home.title', 'sk')).toBe(typedIn);
    expect(document.activeElement).toBe(typedIn);
    expect(box('home.title', 'sk').value).toBe('Povedzte nám svoj pohľad');
    expect(text('.save-state')).toBe('1 string changed, not saved yet');

    // The rows are looked at again when the search changes.
    await type(search, 'nazor ');
    expect(shownKeys()).toEqual([]);
    await type(search, 'pohlad');
    expect(shownKeys()).toEqual(['home.title']);
  });

  it('writes the numbers of a form with no space of the template around them: nothing a line could break at after their dot', async () => {
    await page();

    // Under one another (a phone) the label reads "English · not used in English - ...", and the style sheet holds
    // the dot to the first word of the numbers. A space between the two - the template's indentation - would be
    // where a line ends, with the dot left behind at the end of it.
    const numbers = row('home.questions.few').querySelector('.numbers')!;
    const words = numbers.querySelector('.numbers-text')!;
    expect(words.textContent).toBe('not used in English - the fallback for other languages');
    expect(words.childNodes).toHaveLength(1);
    // And no loose text beside the two pieces: what a screen reader is told, then the numbers.
    expect(Array.from(numbers.childNodes).map((node) => node.nodeName)).toEqual(['SPAN', 'SPAN']);
    // (Between them a space that is none of the template's: written out as a no-break one.)
    expect(numbers.textContent).toBe(`For the numbers:${String.fromCharCode(0xa0)}not used in English - the fallback for other languages`);
  });

  describe('what is typed and not saved', () => {
    const drafts = () => TestBed.inject(LocalizationDrafts);

    it('is in its boxes again when the page comes back - taken away with no question, as when the session ends', async () => {
      await page();
      await type(box('home.title', 'sk'), 'Povedzte nám svoj názor');
      await type(box('common.close', 'en'), 'Shut');

      // The admin area stops drawing its page: no navigation, no guard, no question.
      fixture.destroy();
      host.remove();
      expect(drafts().count()).toBe(2);

      await draw();
      expect(api.translationGrid).toHaveBeenCalledTimes(2);
      expect(box('home.title', 'sk').value).toBe('Povedzte nám svoj názor');
      expect(box('common.close', 'en').value).toBe('Shut');
      expect(all('.mark', row('home.title'))).toEqual(['Changed']);
      expect(all('.mark', row('common.close'))).toEqual(['Changed']);
      expect(text('.save-state')).toBe('2 strings changed, not saved yet');
      expect(button('Save').disabled).toBe(false);
    });

    it('is kept for the tab too, for the way to the sign-in and back', async () => {
      await page();
      await type(box('home.title', 'sk'), 'Povedzte nám svoj názor');

      expect(JSON.parse(sessionStorage.getItem(LOCALIZATION_DRAFTS_KEY)!)).toEqual({ owner: '7', strings: { 'home.title': { sk: 'Povedzte nám svoj názor' } }, languages: {} });
    });

    it('comes back only as far as it is still a change: not what the site says by now, and nothing for a key or a language that is gone', async () => {
      sessionStorage.setItem(
        LOCALIZATION_DRAFTS_KEY,
        JSON.stringify({ owner: '7', strings: { 'common.close': { sk: 'Zatvoriť', cs: 'Zavřít' }, 'gone.key': { en: 'x' }, 'home.title': { sk: 'Povedzte nám svoj názor' } }, languages: {} }),
      );
      // Somebody else saved the very same "Zatvoriť" meanwhile.
      await page(grid({ 'common.close': { sk: 'Zatvoriť' } }));

      expect(box('home.title', 'sk').value).toBe('Povedzte nám svoj názor');
      expect(host.querySelectorAll('.mark')).toHaveLength(1);
      expect(text('.save-state')).toBe('1 string changed, not saved yet');
      expect(drafts().strings()).toEqual({ 'home.title': { sk: 'Povedzte nám svoj názor' } });
    });

    it('has the browser ask before the tab is closed or loaded again', async () => {
      await page();
      const closing = () => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      };
      expect(closing()).toBe(false);

      await type(box('home.title', 'sk'), 'Názor');
      expect(closing()).toBe(true);
    });
  });

  it('asks before it is left with changes not saved, and not otherwise - and "Leave" gives them up', async () => {
    await page();
    const component = fixture.componentInstance;
    expect(component.canLeave()).toBe(true);

    await type(box('home.title', 'sk'), 'Názor');
    const stay = component.canLeave() as Promise<boolean>;
    await settle();
    expect(TestBed.inject(ConfirmService).pending()?.message).toBe('1 changed string is not saved yet, and leaving loses it.');
    expect(await answer(false)).toBe('Leave without saving?');
    expect(await stay).toBe(false);
    // Staying keeps what was typed.
    expect(box('home.title', 'sk').value).toBe('Názor');
    expect(TestBed.inject(LocalizationDrafts).count()).toBe(1);

    const leave = component.canLeave() as Promise<boolean>;
    await settle();
    await answer(true);
    expect(await leave).toBe(true);
    // Given up, as the question said: not in the boxes the next time, and not kept for the tab.
    expect(TestBed.inject(LocalizationDrafts).strings()).toEqual({});
    expect(sessionStorage.getItem(LOCALIZATION_DRAFTS_KEY)).toBeNull();
    expect(component.canLeave()).toBe(true);
  });

  it('discards every change, after asking', async () => {
    await page();
    await type(box('home.title', 'sk'), 'Názor');
    await type(box('common.close', 'sk'), '');

    button('Discard').click();
    await settle();
    expect(await answer(true)).toBe('Discard 2 changes?');

    expect(box('home.title', 'sk').value).toBe('');
    expect(box('common.close', 'sk').value).toBe('Zavrieť');
    expect(button('Save').disabled).toBe(true);
    expect(api.saveTranslations).not.toHaveBeenCalled();
  });

  it('exports a language as a file made here, from what the API answers', async () => {
    await page();
    // jsdom has no object URLs: stood in for here, and taken away again after the test.
    const saved: Blob[] = [];
    Object.assign(URL, { createObjectURL: vi.fn((blob: Blob) => (saved.push(blob), 'blob:strings')), revokeObjectURL: vi.fn() });
    let download = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      download = `${this.download} <- ${this.href}`;
    });
    api.exportTranslations.mockResolvedValue({ 'common.close': 'Zavrieť', 'home.questions.one': '1 otázka' });

    button('Export', host.querySelectorAll('.language')[1]).click();
    await settle();

    expect(api.exportTranslations).toHaveBeenCalledWith('sk');
    expect(download).toBe('translations-sk.json <- blob:strings');
    expect(saved).toHaveLength(1);
    expect(saved[0].type).toBe('application/json');
    expect(await saved[0].text()).toBe('{\n    "common.close": "Zavrieť",\n    "home.questions.one": "1 otázka"\n}\n');
    expect(toasts()).toEqual(['2 strings of Slovak are downloaded.']);
  });

  describe('importing', () => {
    async function choose(name: string, content: string): Promise<void> {
      const input = host.querySelectorAll<HTMLInputElement>('input[type="file"]')[1];
      Object.defineProperty(input, 'files', { value: [new File([content], name, { type: 'application/json' })], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await settle();
    }

    it('sends the file to the language after asking, and takes the grid that comes back', async () => {
      await page();
      await type(box('common.close', 'en'), 'Shut');
      api.importTranslations.mockResolvedValue(grid({ 'home.title': { sk: 'Povedzte nám svoj názor' } }));

      await choose('sk.json', '{"home.title": "Povedzte nám svoj názor", "common.close": ""}');
      expect(api.importTranslations).not.toHaveBeenCalled();
      expect(await answer(true)).toBe('Import 1 string into Slovak?');

      expect(api.importTranslations).toHaveBeenCalledWith('sk', { 'home.title': 'Povedzte nám svoj názor', 'common.close': '' });
      expect(box('home.title', 'sk').value).toBe('Povedzte nám svoj názor');
      expect(toasts()).toEqual(['The strings of Slovak are imported.']);
      expect(refreshed).toHaveBeenCalledTimes(1);
      // What was typed and not saved is still typed.
      expect(box('common.close', 'en').value).toBe('Shut');
      expect(button('Save').disabled).toBe(false);
    });

    it('keeps what is typed while the file is on its way - even the text the import is about to replace', async () => {
      await page();
      const importing = later<TranslationGrid>();
      api.importTranslations.mockReturnValue(importing.promise);
      await choose('sk.json', '{"common.close": "Zatvoriť"}');
      await answer(true);

      // Typed, and typed back to what the site still has this moment.
      await type(box('common.close', 'sk'), 'Zavrieť!');
      await type(box('common.close', 'sk'), 'Zavrieť');
      importing.resolve(grid({ 'common.close': { sk: 'Zatvoriť' } }));
      await settle();

      // The site says "Zatvoriť" now; the box says what was typed, and that is a change.
      expect(box('common.close', 'sk').value).toBe('Zavrieť');
      expect(all('.mark', row('common.close'))).toEqual(['Changed']);
      expect(button('Save').disabled).toBe(false);
    });

    it('counts no value the server passes over: one with nothing in it to see', async () => {
      await page();
      await choose('sk.json', '{"home.title": "\\u200B", "common.close": " \\u2060 "}');

      expect(TestBed.inject(ConfirmService).pending()).toBeNull();
      expect(api.importTranslations).not.toHaveBeenCalled();
      expect(clean(host.querySelector('app-alert')?.textContent)).toContain('It holds no string: every value in it is empty.');

      await choose('sk.json', '{"home.title": "\\u200B", "common.close": "Zatvoriť"}');
      expect(await answer(false)).toBe('Import 1 string into Slovak?');
    });

    it('does nothing when the answer is no', async () => {
      await page();
      await choose('sk.json', '{"home.title": "Názor"}');
      await answer(false);

      expect(api.importTranslations).not.toHaveBeenCalled();
    });

    it("says what is wrong with a file that is not a language's strings, without sending it", async () => {
      await page();
      await choose('notes.json', '["home.title"]');

      expect(TestBed.inject(ConfirmService).pending()).toBeNull();
      expect(api.importTranslations).not.toHaveBeenCalled();
      const alert = clean(host.querySelector('app-alert')?.textContent);
      expect(alert).toContain('"notes.json" was not imported');
      expect(alert).toContain('one JSON object of "key": "text"');
    });

    it("shows the server's sentence when it refuses the file: the keys the site does not have", async () => {
      await page();
      api.importTranslations.mockRejectedValue(
        new ApiError(422, 'unknown_key', 'The site has no such keys: "home.titel", "home.leed". Keys are made by the code, never here.', { key: 'home.titel', keys: ['home.titel', 'home.leed'] }),
      );
      await choose('sk.json', '{"home.titel": "Názor", "home.leed": "Úvod"}');
      await answer(true);

      const alert = clean(host.querySelector('app-alert')?.textContent);
      expect(alert).toContain('"sk.json" was not imported');
      expect(alert).toContain('The site has no such keys: "home.titel", "home.leed". Keys are made by the code, never here.');
      expect(refreshed).not.toHaveBeenCalled();

      button('Dismiss').click();
      await settle();
      expect(host.querySelector('app-alert')).toBeNull();
    });
  });

  it('says so when the grid cannot be loaded, and tries again', async () => {
    await page(new ApiError(503, 'database_unavailable', 'The database cannot be reached right now.'));

    expect(clean(host.querySelector('app-alert')?.textContent)).toContain('The translations could not be loaded');
    expect(clean(host.querySelector('app-alert')?.textContent)).toContain('The database cannot be reached right now.');
    expect(host.querySelector('.grid')).toBeNull();

    api.translationGrid.mockResolvedValue(grid());
    button('Try again').click();
    await settle();
    expect(shownKeys()).toHaveLength(5);
  });

  it('puts the languages under one another when there are more than fit side by side', async () => {
    await page(grid({}, [ENGLISH, SLOVAK, CZECH, { ...CZECH, code: 'de', name: 'German', nativeName: 'Deutsch' }]));

    expect(host.querySelector('.grid')!.classList.contains('is-stacked')).toBe(true);
    // Each box then says its language itself.
    expect(all('.cell-language', row('home.title'))).toEqual(['English', 'Slovak', 'Czech', 'German']);
    expect(box('home.title', 'cs').placeholder).toBe('Falls back to English');
  });

  it('links to the languages and back to the surveys', async () => {
    await page();

    expect(Array.from(host.querySelectorAll('app-page-header a')).map((link) => [clean(link.textContent), link.getAttribute('href')])).toEqual([
      ['All surveys', '/admin'],
      ['Languages', '/admin/languages'],
    ]);
  });
});
