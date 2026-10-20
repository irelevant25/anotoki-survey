import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { type AdminLanguage } from '@anotoki/lib/translations';
import { ApiError, ApiService } from '../api/api.service';
import { AuthService } from '../auth/auth.service';
import { addTranslation, removeTranslation, setTranslatedText } from '../survey/localize';
import { newOption, newQuestion, newSurvey } from '../survey/survey-factory';
import { Person, Survey, SurveyTranslation } from '../survey/survey.model';
import { AdminStore, RETRY_DELAY_MS, SAVE_DELAY_MS, SURVEY_TOO_LARGE } from './admin-store.service';

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

const ANNA: Person = { id: '1', name: 'anna' };
const BEN: Person = { id: '2', name: 'ben' };

function survey(revision: number, title = 'Genshin 1.0'): Survey {
  return { ...newSurvey([]), id: 'survey-1', title, revision };
}

const LANGUAGES: AdminLanguage[] = [
  { code: 'en', name: 'English', native_name: 'English', enabled: true, sort_order: 1, seeded: true, strings: 0 },
  { code: 'sk', name: 'Slovak', native_name: 'Slovenčina', enabled: true, sort_order: 2, seeded: true, strings: 0 },
];

describe('AdminStore: saving what the editor changes', () => {
  let store: AdminStore;
  const api = { survey: vi.fn(), saveSurvey: vi.fn(), setStatus: vi.fn(), summaries: vi.fn(), responses: vi.fn(), languages: vi.fn() };
  const person = signal<Person | null>(ANNA);
  const listeners = new Set<() => void>();
  const signedInAs = (who: Person | null) => {
    person.set(who);
    listeners.forEach((listener) => listener());
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    Object.values(api).forEach((fn) => fn.mockReset());
    person.set(ANNA);
    listeners.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { person, onAuthChange: (listener: () => void) => (listeners.add(listener), () => listeners.delete(listener)) } },
      ],
    });
    store = TestBed.inject(AdminStore);
    api.languages.mockResolvedValue(LANGUAGES);
    api.survey.mockResolvedValueOnce(survey(3));
    await store.load('survey-1');
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('saves a moment after the last change, made to its revision, and never replaces what is being typed', async () => {
    const first = later<Survey>();
    api.saveSurvey.mockReturnValueOnce(first.promise);
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'A' }));
    expect(store.saveStatus('survey-1').state).toBe('waiting');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    expect(api.saveSurvey).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(api.saveSurvey).toHaveBeenCalledWith(expect.objectContaining({ title: 'A' }), 3);

    // Typed on while the save is on its way.
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'AB' }));
    first.resolve(survey(4, 'A'));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.survey('survey-1')?.title).toBe('AB');
    expect(store.survey('survey-1')?.revision).toBe(4);

    api.saveSurvey.mockResolvedValueOnce(survey(5, 'AB'));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(api.saveSurvey).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'AB' }), 4);
    expect(store.saveStatus('survey-1').state).toBe('saved');
    expect(store.unsaved()).toBe(false);
  });

  it("meets somebody else's save as a conflict for the editor to settle - never saved over by itself", async () => {
    api.saveSurvey.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Somebody else has saved this survey.', { survey: survey(7, 'Theirs') }));
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Mine' }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(store.saveStatus('survey-1').state).toBe('conflict');
    expect(store.saveStatus('survey-1').theirs?.title).toBe('Theirs');

    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Mine, still' }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 3);
    expect(api.saveSurvey).toHaveBeenCalledTimes(1);

    api.saveSurvey.mockResolvedValueOnce(survey(8, 'Mine, still'));
    store.keepMine('survey-1');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.saveSurvey).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Mine, still' }), 7);
    expect(store.saveStatus('survey-1').state).toBe('saved');
  });

  it('takes their version when the editor says so', async () => {
    api.saveSurvey.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Somebody else has saved this survey.', { survey: survey(7, 'Theirs') }));
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Mine' }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    store.takeTheirs('survey-1');
    expect(store.survey('survey-1')).toMatchObject({ title: 'Theirs', revision: 7 });
    expect(store.unsaved()).toBe(false);
  });

  it('works out what is not saved from the documents - the survey itself, and the languages written into - never from what a page remembers', async () => {
    const unsaved = () => store.unsavedChanges('survey-1');
    expect(unsaved()).toEqual({ survey: false, languages: [] });
    expect(store.unsavedChanges('not-here')).toEqual({ survey: false, languages: [] });

    // The survey's own title - and taken back, it is no change.
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Mine' }));
    expect(unsaved()).toEqual({ survey: true, languages: [] });
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Genshin 1.0' }));
    expect(unsaved()).toEqual({ survey: false, languages: [] });

    // A language added, nothing written into it yet.
    store.updateSurvey('survey-1', (s) => addTranslation(s, 'sk'));
    expect(unsaved()).toEqual({ survey: false, languages: ['sk'] });

    // Saved: nothing is left - whatever the page that made the changes remembered.
    api.saveSurvey.mockResolvedValueOnce(survey(4));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(unsaved()).toEqual({ survey: false, languages: [] });

    // A text of it.
    store.updateSurvey('survey-1', (s) => setTranslatedText(s, 'sk', { kind: 'title' }, 'Prieskum'));
    expect(unsaved()).toEqual({ survey: false, languages: ['sk'] });
    api.saveSurvey.mockResolvedValueOnce(survey(5));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);

    // The language removed: that is a change to the survey, not to a translation.
    store.updateSurvey('survey-1', (s) => removeTranslation(s, 'sk'));
    expect(unsaved()).toEqual({ survey: true, languages: [] });

    // Still so in a conflict - which is what the editor asks when it is entered again.
    api.saveSurvey.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Somebody else has saved this survey.', { survey: survey(9, 'Theirs') }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(store.saveStatus('survey-1').state).toBe('conflict');
    expect(unsaved()).toEqual({ survey: true, languages: [] });
  });

  describe('a conflict and the translations: mine where this page changed a text, theirs everywhere else', () => {
    const slovak = (texts: Partial<SurveyTranslation> = {}): SurveyTranslation => ({ title: 'Prieskum', intro: '<p>Vitajte</p>', thanks: '<p>Ďakujeme</p>', steps: {}, questions: {}, ...texts });
    const german: SurveyTranslation = { title: 'Umfrage', intro: '', thanks: '', steps: {}, questions: {} };
    const czech: SurveyTranslation = { title: 'Průzkum', intro: '', thanks: '', steps: {}, questions: {} };
    const conflict = (theirs: Survey) => new ApiError(409, 'conflict', 'Somebody else has saved this survey.', { survey: theirs });
    /** What the last save sent: the survey, and the revision it was made to. */
    const sent = () => api.saveSurvey.mock.lastCall as [Survey, number];

    it("saves mine over theirs without undoing a translation this page never touched: the author's page left open", async () => {
      // Opened at revision 3, before anybody translated. A translator has saved the whole Slovak since.
      const theirs = { ...survey(7, 'Theirs'), translations: { sk: slovak(), de: german } };
      api.saveSurvey.mockRejectedValueOnce(conflict(theirs));
      store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Mine' }));
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
      expect(store.saveStatus('survey-1').state).toBe('conflict');
      expect(store.keepsTheirTranslations('survey-1')).toBe(true);
      const steps = store.survey('survey-1')?.steps;

      api.saveSurvey.mockResolvedValueOnce(survey(8, 'Mine'));
      store.keepMine('survey-1');
      await vi.advanceTimersByTimeAsync(0);
      // The survey itself is mine - its title, its questions - made to their revision; every translated text is theirs.
      expect(sent()[1]).toBe(7);
      expect(sent()[0]).toMatchObject({ title: 'Mine', steps });
      expect(sent()[0].translations).toEqual({ sk: slovak(), de: german });
      expect(store.survey('survey-1')).toMatchObject({ title: 'Mine', revision: 8, translations: { sk: slovak(), de: german } });
      expect(store.saveStatus('survey-1').state).toBe('saved');
      expect(store.keepsTheirTranslations('survey-1')).toBe(false);
    });

    it('saves mine over theirs text by text: a language removed here stays out, a text written here wins, the rest of the language is theirs', async () => {
      // Saved from here first: Slovak and German, which is then what the server last had from this page.
      api.saveSurvey.mockResolvedValueOnce(survey(4));
      store.updateSurvey('survey-1', (s) => ({ ...s, translations: { sk: slovak(), de: german } }));
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
      expect(store.saveStatus('survey-1').state).toBe('saved');

      // Meanwhile somebody reworded two Slovak texts, went on with the German and added Czech.
      const theirs = { ...survey(9, 'Theirs'), translations: { sk: slovak({ title: 'Ich', intro: '<p>Ich</p>' }), de: { ...german, intro: '<p>Hallo</p>' }, cs: czech } };
      api.saveSurvey.mockRejectedValueOnce(conflict(theirs));
      // Here: German removed, the Slovak title reworded, the survey's own title changed.
      store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Mine', translations: { sk: { ...s.translations['sk'], title: 'Môj prieskum' } } }));
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
      expect(store.saveStatus('survey-1').state).toBe('conflict');
      // What the editor names before it asks: German goes, with what they wrote into it; nothing comes back.
      expect(store.removedHereLanguages('survey-1')).toEqual(['de']);
      expect(store.removedThereLanguages('survey-1')).toEqual([]);

      api.saveSurvey.mockResolvedValueOnce(survey(10, 'Mine'));
      store.keepMine('survey-1');
      await vi.advanceTimersByTimeAsync(0);
      expect(sent()[1]).toBe(9);
      expect(sent()[0].title).toBe('Mine');
      expect(sent()[0].translations).toEqual({ sk: slovak({ title: 'Môj prieskum', intro: '<p>Ich</p>' }), cs: czech });
      expect(store.saveStatus('survey-1').state).toBe('saved');
    });

    it('saves mine whole when the two versions are written in different languages: there is nothing to bring together', async () => {
      // Meanwhile the survey was rewritten in Slovak, and translated into English.
      api.saveSurvey.mockRejectedValueOnce(conflict({ ...survey(7, 'Ich'), language: 'sk', translations: { en: german } }));
      store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Mine' }));
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
      expect(store.keepsTheirTranslations('survey-1')).toBe(false);

      api.saveSurvey.mockResolvedValueOnce(survey(8, 'Mine'));
      store.keepMine('survey-1');
      await vi.advanceTimersByTimeAsync(0);
      expect(sent()[1]).toBe(7);
      expect(sent()[0]).toMatchObject({ title: 'Mine', language: 'en', translations: {} });
      expect(sent()[0].translations).toEqual({});
    });

    it("keeps my texts of a language in their version without replacing another translator's: only what was changed here since the last save that went through", async () => {
      // Saved from here: the Slovak title and welcome - the thanks still to write.
      api.saveSurvey.mockResolvedValueOnce(survey(4));
      store.updateSurvey('survey-1', (s) => ({ ...s, translations: { sk: slovak({ thanks: '' }) } }));
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
      expect(store.saveStatus('survey-1').state).toBe('saved');

      // Meanwhile another translator reworded the welcome and wrote the thanks; here the title is reworded.
      const theirs = { ...survey(7, 'Theirs'), translations: { sk: slovak({ intro: '<p>Ich</p>', thanks: '<p>Ich ďakujú</p>' }), de: german } };
      api.saveSurvey.mockRejectedValueOnce(conflict(theirs));
      store.updateSurvey('survey-1', (s) => ({ ...s, translations: { sk: { ...s.translations['sk'], title: 'Môj prieskum' } } }));
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
      expect(store.saveStatus('survey-1').state).toBe('conflict');

      // Somebody saves once more before this one arrives: settled again, against the version the first was settled into.
      const later = { ...survey(9, 'Theirs, later'), translations: { sk: slovak({ intro: '<p>Ich, neskôr</p>', thanks: '<p>Ich ďakujú</p>' }), de: german } };
      api.saveSurvey.mockRejectedValueOnce(conflict(later));
      expect(store.keepMyTranslations('survey-1', ['sk'])).toEqual(['sk']);
      expect(store.survey('survey-1')).toMatchObject({ title: 'Theirs', revision: 7 });
      // The title is mine; the welcome and the thanks are the other translator's - never written here since they were saved.
      expect(store.survey('survey-1')?.translations).toEqual({ sk: slovak({ title: 'Môj prieskum', intro: '<p>Ich</p>', thanks: '<p>Ich ďakujú</p>' }), de: german });
      await vi.advanceTimersByTimeAsync(0);
      expect(sent()[1]).toBe(7);
      expect(sent()[0].translations).toEqual({ sk: slovak({ title: 'Môj prieskum', intro: '<p>Ich</p>', thanks: '<p>Ich ďakujú</p>' }), de: german });
      expect(store.saveStatus('survey-1').state).toBe('conflict');

      // The welcome here is theirs of before - not a text of mine: their later wording stands.
      api.saveSurvey.mockResolvedValueOnce(survey(10, 'Theirs, later'));
      expect(store.keepMyTranslations('survey-1', ['sk'])).toEqual(['sk']);
      await vi.advanceTimersByTimeAsync(0);
      expect(sent()[1]).toBe(9);
      expect(sent()[0]).toMatchObject({ title: 'Theirs, later' });
      expect(sent()[0].translations).toEqual({ sk: slovak({ title: 'Môj prieskum', intro: '<p>Ich, neskôr</p>', thanks: '<p>Ich ďakujú</p>' }), de: german });
      expect(store.saveStatus('survey-1').state).toBe('saved');
    });

    it('brings a language they removed back as it is here, when its texts are the ones to keep', async () => {
      api.saveSurvey.mockResolvedValueOnce(survey(4));
      store.updateSurvey('survey-1', (s) => ({ ...s, translations: { sk: slovak(), de: german } }));
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);

      // Typed and taken back - the texts are as the server has them, but the page was translating Slovak.
      api.saveSurvey.mockRejectedValueOnce(conflict({ ...survey(7, 'Theirs'), translations: { de: { ...german, title: 'Ihre Umfrage' } } }));
      store.updateSurvey('survey-1', (s) => ({ ...s, translations: { ...s.translations, sk: slovak() } }));
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
      expect(store.saveStatus('survey-1').state).toBe('conflict');
      // What the editor names: Slovak comes back; nothing removed here goes.
      expect(store.removedThereLanguages('survey-1')).toEqual(['sk']);
      expect(store.removedHereLanguages('survey-1')).toEqual([]);

      api.saveSurvey.mockResolvedValueOnce(survey(8, 'Theirs'));
      expect(store.keepMyTranslations('survey-1', ['sk'])).toEqual(['sk']);
      await vi.advanceTimersByTimeAsync(0);
      // Slovak as it is here; German as they saved it - nothing of it was changed here.
      expect(sent()[0].translations).toEqual({ de: { ...german, title: 'Ihre Umfrage' }, sk: slovak() });
      expect(sent()[1]).toBe(7);
    });

    describe('what their version removed or reworded', () => {
      const age = { ...newQuestion('text'), id: 'q1', text: '<p>How old are you?</p>' };
      const why = { ...newQuestion('text'), id: 'q2', text: '<p>Why?</p>' };
      const q1Slovak = (text: string) => ({ text, placeholder: '', options: {}, images: {} });
      const withQuestions = (s: Survey, questions: (typeof age)[], sk: SurveyTranslation): Survey => ({
        ...s,
        steps: [{ id: 's1', title: '', text: '', images: [], questions }],
        translations: { sk },
      });

      beforeEach(async () => {
        // Saved from here: two questions, both translated.
        api.saveSurvey.mockResolvedValueOnce(survey(4));
        store.updateSurvey('survey-1', (s) => withQuestions(s, [age, why], slovak({ questions: { q1: q1Slovak('<p>Koľko máte rokov?</p>'), q2: q1Slovak('<p>Prečo?</p>') } })));
        await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
        expect(store.saveStatus('survey-1').state).toBe('saved');
      });

      it('saves mine over theirs with my translated texts of a question they removed: my survey still asks it', async () => {
        // They removed the second question - its Slovak with it. Here only the title changed.
        api.saveSurvey.mockRejectedValueOnce(conflict(withQuestions(survey(7, 'Theirs'), [age], slovak({ questions: { q1: q1Slovak('<p>Koľko máte rokov?</p>') } }))));
        store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Mine' }));
        await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
        expect(store.saveStatus('survey-1').state).toBe('conflict');

        api.saveSurvey.mockResolvedValueOnce(survey(8, 'Mine'));
        store.keepMine('survey-1');
        await vi.advanceTimersByTimeAsync(0);
        expect(sent()[1]).toBe(7);
        expect(sent()[0].steps[0].questions.map((question) => question.id)).toEqual(['q1', 'q2']);
        expect(sent()[0].translations['sk'].questions['q2']).toEqual(q1Slovak('<p>Prečo?</p>'));
      });

      it('keeps my texts in their version without pairing them with a question they reworded: theirs is of their words', async () => {
        // They reworded the first question and translated the new words; here the Slovak of the second was reworded.
        const theirs = withQuestions(
          survey(7, 'Theirs'),
          [{ ...age, text: '<p>Where do you live?</p>' }, why],
          slovak({ questions: { q1: q1Slovak('<p>Kde bývate?</p>'), q2: q1Slovak('<p>Prečo?</p>') } }),
        );
        api.saveSurvey.mockRejectedValueOnce(conflict(theirs));
        store.updateSurvey('survey-1', (s) => setTranslatedText(s, 'sk', { kind: 'text', questionId: 'q2' }, '<p>Prečo teda?</p>'));
        await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
        expect(store.unsavedChanges('survey-1')).toEqual({ survey: false, languages: ['sk'] });

        api.saveSurvey.mockResolvedValueOnce(survey(8, 'Theirs'));
        expect(store.keepMyTranslations('survey-1', ['sk'])).toEqual(['sk']);
        await vi.advanceTimersByTimeAsync(0);
        expect(sent()[0].steps[0].questions[0].text).toBe('<p>Where do you live?</p>');
        expect(sent()[0].translations['sk'].questions).toEqual({ q1: q1Slovak('<p>Kde bývate?</p>'), q2: q1Slovak('<p>Prečo teda?</p>') });
      });
    });

    it('does not send mine over theirs when the server would refuse it - both translated, written in different languages - and the conflict stays', async () => {
      // Here: written in English, translated into Slovak. Meanwhile it was rewritten in Slovak and translated into English.
      store.updateSurvey('survey-1', (s) => ({ ...s, translations: { sk: slovak() } }));
      api.saveSurvey.mockRejectedValueOnce(conflict({ ...survey(7, 'Prieskum'), language: 'sk', translations: { en: german } }));
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
      expect(store.mineWouldBeRefused('survey-1')).toBe(true);

      store.keepMine('survey-1');
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 3);
      expect(api.saveSurvey).toHaveBeenCalledTimes(1);
      // Their version is still there to take.
      expect(store.saveStatus('survey-1')).toMatchObject({ state: 'conflict', theirs: { revision: 7, language: 'sk' } });

      // The way out the editor names: my translation removed (the change waits), and mine is a save the server takes.
      store.updateSurvey('survey-1', (s) => removeTranslation(s, 'sk'));
      expect(store.saveStatus('survey-1').state).toBe('conflict');
      expect(store.mineWouldBeRefused('survey-1')).toBe(false);
      api.saveSurvey.mockResolvedValueOnce(survey(8));
      store.keepMine('survey-1');
      await vi.advanceTimersByTimeAsync(0);
      expect(sent()[1]).toBe(7);
      expect(sent()[0]).toMatchObject({ language: 'en', translations: {} });
      expect(store.saveStatus('survey-1').state).toBe('saved');
    });
  });

  it('settles a conflict met while translating by language: their survey, with the translation from here put into it', async () => {
    const slovak = (title: string) => ({ title, intro: '', thanks: '', steps: { s1: { title: 'Prvý', text: '', images: {} }, gone: { title: 'Preč', text: '', images: {} } }, questions: {} });
    const german = { title: 'Umfrage', intro: '', thanks: '', steps: {}, questions: {} };
    const step = { id: 's1', title: 'First', text: '', images: [], questions: [] };

    // Here: Slovak being written, to revision 3.
    api.saveSurvey.mockRejectedValueOnce(
      new ApiError(409, 'conflict', 'Somebody else has saved this survey.', {
        survey: { ...survey(7, 'Theirs'), steps: [step], translations: { sk: slovak('Ich'), de: german } },
      }),
    );
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Mine', steps: [step, { id: 'gone', title: 'Last', text: '', images: [], questions: [] }], translations: { sk: slovak('Môj prieskum') } }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(store.saveStatus('survey-1').state).toBe('conflict');

    api.saveSurvey.mockResolvedValueOnce(survey(8, 'Theirs'));
    expect(store.keepMyTranslations('survey-1', ['sk'])).toEqual(['sk']);
    // The questions are theirs (the title, the steps, their German); Slovak is
    // mine - without the text of the step their version no longer has.
    expect(store.survey('survey-1')).toMatchObject({ title: 'Theirs', revision: 7, steps: [step] });
    expect(store.survey('survey-1')?.translations).toEqual({ de: german, sk: { ...slovak('Môj prieskum'), steps: { s1: { title: 'Prvý', text: '', images: {} } } } });
    await vi.advanceTimersByTimeAsync(0);
    expect(api.saveSurvey).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Theirs', translations: expect.objectContaining({ sk: expect.objectContaining({ title: 'Môj prieskum' }) }) }), 7);
    expect(store.saveStatus('survey-1').state).toBe('saved');
  });

  it('keeps no translation their version cannot hold, and leaves the conflict to be settled', async () => {
    const slovak = { title: 'Prieskum', intro: '', thanks: '', steps: {}, questions: {} };
    // Meanwhile the survey was rewritten in Slovak itself.
    api.saveSurvey.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Somebody else has saved this survey.', { survey: { ...survey(7, 'Ich'), language: 'sk' } }));
    store.updateSurvey('survey-1', (s) => ({ ...s, translations: { sk: slovak } }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);

    expect(store.keepMyTranslations('survey-1', ['sk', 'de'])).toEqual([]);
    expect(store.saveStatus('survey-1').state).toBe('conflict');
    expect(store.survey('survey-1')?.translations).toEqual({ sk: slovak });
    expect(api.saveSurvey).toHaveBeenCalledTimes(1);
    // With no conflict there is nothing to settle.
    store.takeTheirs('survey-1');
    expect(store.keepMyTranslations('survey-1', ['sk'])).toEqual([]);
  });

  it('words a survey too large for one save itself, and does not send it again by itself', async () => {
    // As the API says it, and as a web server in front of it would: a page of its own.
    for (const refusal of [new ApiError(413, 'too_large', 'That is more than this site takes in one go.'), new ApiError(413, 'http_413', 'The server answered 413.')]) {
      api.saveSurvey.mockReset();
      api.saveSurvey.mockRejectedValueOnce(refusal);
      store.updateSurvey('survey-1', (s) => ({ ...s, title: s.title + '!' }));
      await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
      expect(store.saveStatus('survey-1')).toMatchObject({ state: 'failed', message: SURVEY_TOO_LARGE });
      expect(SURVEY_TOO_LARGE).toBe('This survey with its translations is larger than the site keeps in one survey (2 MB).');

      await vi.advanceTimersByTimeAsync(RETRY_DELAY_MS * 3);
      expect(api.saveSurvey).toHaveBeenCalledTimes(1);
    }

    // The next change is the next try.
    api.saveSurvey.mockResolvedValueOnce(survey(4, 'Shorter'));
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Shorter' }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(api.saveSurvey).toHaveBeenCalledTimes(2);
    expect(store.saveStatus('survey-1').state).toBe('saved');
  });

  it('keeps what is here when an older survey arrives late from a fresh load', async () => {
    const slow = later<Survey>();
    api.survey.mockReturnValueOnce(slow.promise);
    void store.load('survey-1', true);

    api.saveSurvey.mockResolvedValueOnce(survey(4, 'Typed'));
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Typed' }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(store.survey('survey-1')?.revision).toBe(4);

    slow.resolve(survey(3, 'Genshin 1.0'));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.survey('survey-1')).toMatchObject({ title: 'Typed', revision: 4 });
  });

  it('keeps unsaved changes when the session ends, and lets them go only when somebody else signs in', async () => {
    api.saveSurvey.mockRejectedValueOnce(new ApiError(0, 'offline', 'The site could not be reached.'));
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Not saved yet' }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(store.saveStatus('survey-1').state).toBe('failed');

    signedInAs(null);
    expect(store.survey('survey-1')?.title).toBe('Not saved yet');
    expect(store.unsaved()).toBe(true);

    signedInAs(ANNA);
    expect(store.survey('survey-1')?.title).toBe('Not saved yet');

    signedInAs(BEN);
    expect(store.survey('survey-1')).toBeUndefined();
    expect(store.unsaved()).toBe(false);
  });

  it('opens after the waiting changes are saved, and saves after it to the revision it brings', async () => {
    api.saveSurvey.mockResolvedValueOnce(survey(4, 'Before'));
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Before' }));
    const opening = later<Survey>();
    api.setStatus.mockReturnValueOnce(opening.promise);
    const opened = store.setStatus('survey-1', 'open');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.saveSurvey).toHaveBeenCalledTimes(1);
    expect(api.setStatus).toHaveBeenCalledWith('survey-1', 'open', undefined);

    // Typed while the survey opens: that save waits for it.
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'After' }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(api.saveSurvey).toHaveBeenCalledTimes(1);

    api.saveSurvey.mockResolvedValueOnce(survey(6, 'After'));
    opening.resolve({ ...survey(5, 'Before'), status: 'open', openedAt: '2026-09-29T12:00:00.000Z' });
    await opened;
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(store.survey('survey-1')).toMatchObject({ status: 'open', title: 'After' });
    expect(api.saveSurvey).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'After' }), 5);
  });

  it('asks for the languages with the first survey, again with each survey loaded afresh, and when told to - or after a failure', async () => {
    await vi.advanceTimersByTimeAsync(0);
    expect(store.languages()).toEqual(LANGUAGES);
    // A survey that is here, asked for plainly (another page of it): no request.
    await store.load('survey-1');
    await store.loadLanguages();
    expect(api.languages).toHaveBeenCalledTimes(1);

    // Asked for afresh - the editor or the results entered again - with a translation into a language added elsewhere since.
    const german: AdminLanguage = { code: 'de', name: 'German', native_name: 'Deutsch', enabled: false, sort_order: 3, seeded: false, strings: 0 };
    api.languages.mockResolvedValueOnce([...LANGUAGES, german]);
    api.survey.mockResolvedValueOnce({ ...survey(4), translations: { de: { title: 'Umfrage', intro: '', thanks: '', steps: {}, questions: {} } } });
    await store.load('survey-1', true);
    await vi.advanceTimersByTimeAsync(0);
    expect(api.languages).toHaveBeenCalledTimes(2);
    expect(store.languages()?.map((language) => language.code)).toEqual(['en', 'sk', 'de']);

    // Out of reach: what is here stays, and nothing is thrown at the page.
    api.languages.mockRejectedValueOnce(new ApiError(0, 'offline', 'The site could not be reached.'));
    await store.loadLanguages(true);
    expect(api.languages).toHaveBeenCalledTimes(3);
    expect(store.languages()).toHaveLength(3);

    // Somebody else signs in: theirs to ask for again.
    signedInAs(BEN);
    expect(store.languages()).toBeNull();
    api.languages.mockRejectedValueOnce(new ApiError(403, 'forbidden', 'No.'));
    await store.loadLanguages();
    expect(store.languages()).toBeNull();
    await store.loadLanguages();
    expect(store.languages()).toEqual(LANGUAGES);
  });

  it('asks for the languages again when a conflict brings one the list lacks - and only then', async () => {
    await vi.advanceTimersByTimeAsync(0);
    expect(api.languages).toHaveBeenCalledTimes(1);
    const translation: SurveyTranslation = { title: 'Umfrage', intro: '', thanks: '', steps: {}, questions: {} };
    const conflict = (theirs: Survey) => new ApiError(409, 'conflict', 'Somebody else has saved this survey.', { survey: theirs });

    // Their version is in languages the list has: nothing to ask.
    api.saveSurvey.mockRejectedValueOnce(conflict({ ...survey(7, 'Theirs'), translations: { sk: translation } }));
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Mine' }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(store.saveStatus('survey-1').state).toBe('conflict');
    expect(api.languages).toHaveBeenCalledTimes(1);
    store.takeTheirs('survey-1');

    // Translated into German, which the site gained after the list came.
    const german: AdminLanguage = { code: 'de', name: 'German', native_name: 'Deutsch', enabled: true, sort_order: 3, seeded: false, strings: 0 };
    api.languages.mockResolvedValueOnce([...LANGUAGES, german]);
    api.saveSurvey.mockRejectedValueOnce(conflict({ ...survey(9, 'Theirs, later'), translations: { sk: translation, de: translation } }));
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Mine again' }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(store.saveStatus('survey-1').state).toBe('conflict');
    expect(api.languages).toHaveBeenCalledTimes(2);
    expect(store.languages()?.map((language) => language.code)).toEqual(['en', 'sk', 'de']);
  });

  it('drops the translated texts of whatever a change removes, with the change', async () => {
    const question = {
      ...newQuestion('single'),
      id: 'q1',
      text: '<p>Which?</p>',
      options: [
        { ...newOption('Yes'), id: 'a' },
        { ...newOption('No'), id: 'b' },
      ],
    };
    const other = { ...newQuestion('text'), id: 'q2', text: '<p>Why?</p>' };
    store.updateSurvey('survey-1', (s) => ({
      ...s,
      steps: [{ id: 's1', title: 'First', text: '', images: [], questions: [question, other] }],
      translations: {
        sk: {
          title: 'Prieskum',
          intro: '',
          thanks: '',
          steps: { s1: { title: 'Prvý', text: '', images: {} } },
          questions: {
            q1: { text: '<p>Ktorý?</p>', placeholder: '', options: { a: { label: 'Áno' }, b: { label: 'Nie' } }, images: {} },
            q2: { text: '<p>Prečo?</p>', placeholder: '', options: {}, images: {} },
          },
        },
      },
    }));
    expect(Object.keys(store.survey('survey-1')?.translations['sk'].questions ?? {})).toEqual(['q1', 'q2']);

    // An option goes, then a question: no removal needs code of its own.
    store.updateSurvey('survey-1', (s) => ({ ...s, steps: [{ ...s.steps[0], questions: [{ ...question, options: [question.options[0]] }, other] }] }));
    expect(store.survey('survey-1')?.translations['sk'].questions['q1'].options).toEqual({ a: { label: 'Áno' } });
    store.updateSurvey('survey-1', (s) => ({ ...s, steps: [{ ...s.steps[0], questions: [other] }] }));
    expect(store.survey('survey-1')?.translations['sk'].questions).toEqual({ q2: { text: '<p>Prečo?</p>', placeholder: '', options: {}, images: {} } });
    expect(store.survey('survey-1')?.translations['sk'].steps).toEqual({ s1: { title: 'Prvý', text: '', images: {} } });

    api.saveSurvey.mockResolvedValueOnce(survey(4));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(api.saveSurvey).toHaveBeenLastCalledWith(expect.objectContaining({ translations: { sk: expect.objectContaining({ questions: { q2: expect.anything() } }) } }), 3);
  });

  it('reopens a survey whose last day has passed without that day', async () => {
    store.updateSurvey('survey-1', (s) => ({ ...s, closesOn: '2020-01-01' }));
    api.saveSurvey.mockResolvedValueOnce({ ...survey(4), closesOn: '2020-01-01' });
    api.setStatus.mockResolvedValueOnce({ ...survey(5), status: 'open', closesOn: null });
    await store.setStatus('survey-1', 'open');
    expect(api.setStatus).toHaveBeenCalledWith('survey-1', 'open', null);
    expect(store.survey('survey-1')).toMatchObject({ closesOn: null, revision: 5 });
  });
});
