import { emptyTranslation, translationGaps, translationPlaces } from '../../../core/survey/localize';
import { newOption, newQuestion, newSurvey } from '../../../core/survey/survey-factory';
import { Survey } from '../../../core/survey/survey.model';
import { EditorLanguage, addableLanguages, languageName, listOfNames, nextGap, placeKey, questionGaps, stepGaps, translationTabs } from './translating';

const ENGLISH: EditorLanguage = { code: 'en', name: 'English', enabled: true };
const SLOVAK: EditorLanguage = { code: 'sk', name: 'Slovak', enabled: true };
const CZECH: EditorLanguage = { code: 'cs', name: 'Czech', enabled: false };
const LANGUAGES = [ENGLISH, SLOVAK, CZECH];

/** A title, a welcome, one titled step with a choice (two options) and an "own words" with a hint: 8 texts. */
function survey(): Survey {
  const choice = {
    ...newQuestion('single'),
    id: 'q1',
    text: '<p>Tea or coffee?</p>',
    options: [
      { ...newOption('Tea'), id: 'a' },
      { ...newOption('Coffee'), id: 'b' },
    ],
  };
  const words = { ...newQuestion('text'), id: 'q2', text: '<p>Why?</p>', placeholder: 'A few words' };
  return { ...newSurvey([]), id: 'survey-1', title: 'Drinks', intro: '<p>Hello</p>', thanks: '', steps: [{ id: 's1', title: 'Your cup', text: '', images: [], questions: [choice, words] }] };
}

/** survey() with a step of text before its step of questions: its title, its text and one described picture - 3 texts more. */
function withTask(): Survey {
  const base = survey();
  const task = { id: 's0', title: 'First', text: '<p>Try the site.</p>', images: [{ id: 'p1', alt: 'The map', width: 40, height: 30, src: '/api/images/p1.png' }], questions: [] };
  return { ...base, steps: [task, ...base.steps] };
}

describe('the editor while translating', () => {
  it('names a language in English, and by its code when the site does not have it (or has not said yet)', () => {
    expect(languageName(LANGUAGES, 'sk')).toBe('Slovak');
    expect(languageName(LANGUAGES, 'de')).toBe('de');
    expect(languageName(null, 'sk')).toBe('sk');
  });

  it('makes a tab of each translation, in the order of the site, with how far it is', () => {
    const base = survey();
    const translated: Survey = {
      ...base,
      translations: {
        de: emptyTranslation(),
        cs: emptyTranslation(),
        sk: {
          ...emptyTranslation(),
          title: 'Nápoje',
          steps: { s1: { title: 'Vaša šálka', text: '', images: {} } },
          questions: { q1: { text: '', placeholder: '', options: { a: { label: 'Čaj' } }, images: {} } },
        },
      },
    };
    expect(translationTabs(translated, LANGUAGES)).toEqual([
      { code: 'sk', name: 'Slovak', done: 3, total: 8, hidden: false, unknown: false, readersGetMain: false },
      { code: 'cs', name: 'Czech', done: 0, total: 8, hidden: true, unknown: false, readersGetMain: false },
      // A language the site no longer has: last, by its code, and said to be unknown.
      { code: 'de', name: 'de', done: 0, total: 8, hidden: false, unknown: true, readersGetMain: false },
    ]);
    // Before the languages have come nothing is called unknown.
    expect(translationTabs(translated, null).map((tab) => `${tab.name} ${tab.unknown}`)).toEqual(['de false', 'cs false', 'sk false']);
    expect(translationTabs(base, LANGUAGES)).toEqual([]);
  });

  it('says whose readers get an open survey in its main language: an offered language with a text missing, and no other', () => {
    const whole = { ...emptyTranslation(), title: 'Nápoje', intro: '<p>Ahoj</p>', steps: { s1: { title: 'Vaša šálka', text: '', images: {} } } };
    const questions = {
      q1: { text: '<p>Čaj alebo káva?</p>', placeholder: '', options: { a: { label: 'Čaj' }, b: { label: 'Káva' } }, images: {} },
      q2: { text: '<p>Prečo?</p>', placeholder: 'Pár slov', options: {}, images: {} },
    };
    const translated: Survey = {
      ...survey(),
      status: 'open',
      translations: { sk: { ...whole, questions: { ...questions, q2: { ...questions.q2, placeholder: ' ' } } }, cs: emptyTranslation(), de: emptyTranslation(), hu: { ...whole, questions } },
    };
    const hungarian: EditorLanguage = { code: 'hu', name: 'Hungarian', enabled: true };
    const who = (of: Survey, languages: readonly EditorLanguage[] | null) =>
      translationTabs(of, languages)
        .filter((tab) => tab.readersGetMain)
        .map((tab) => tab.code);

    // Slovak lacks one text; Czech is hidden, German is not the site's, Hungarian is whole.
    expect(who(translated, [...LANGUAGES, hungarian])).toEqual(['sk']);
    expect(translationTabs(translated, [...LANGUAGES, hungarian]).map((tab) => `${tab.code} ${tab.done}`)).toEqual(['sk 7', 'cs 0', 'hu 8', 'de 0']);
    // Nobody is taking a draft, or a closed survey.
    expect(who({ ...translated, status: 'draft' }, [...LANGUAGES, hungarian])).toEqual([]);
    expect(who({ ...translated, status: 'closed' }, [...LANGUAGES, hungarian])).toEqual([]);
    // Once Czech is offered its readers are in the same place - and before the languages have come nothing is claimed.
    expect(who(translated, [ENGLISH, SLOVAK, { ...CZECH, enabled: true }])).toEqual(['sk', 'cs']);
    expect(who(translated, null)).toEqual([]);

    // Nor one whose last day is over, "open" as it may still be in the database - by the clock it is given.
    const lastDay = { ...translated, closesOn: '2020-01-01' };
    const offered = [...LANGUAGES, hungarian];
    expect(who(lastDay, offered)).toEqual([]);
    expect(
      translationTabs(lastDay, offered, new Date(2019, 11, 31, 12))
        .filter((tab) => tab.readersGetMain)
        .map((tab) => tab.code),
    ).toEqual(['sk']);
  });

  it('offers to add only the languages the survey is neither written in nor translated into', () => {
    const base = survey();
    expect(addableLanguages(base, LANGUAGES).map((language) => language.code)).toEqual(['sk', 'cs']);
    expect(addableLanguages({ ...base, translations: { sk: emptyTranslation() } }, LANGUAGES).map((language) => language.code)).toEqual(['cs']);
    expect(addableLanguages({ ...base, language: 'cs' }, LANGUAGES).map((language) => language.code)).toEqual(['en', 'sk']);
    expect(addableLanguages(base, null)).toEqual([]);
  });

  it('gives every place a key of its own, whatever its ids hold', () => {
    const keys = translationPlaces(survey()).map(placeKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(placeKey({ kind: 'title' })).toBe('["title"]');
    // Ids that would run together if they were only joined.
    expect(placeKey({ kind: 'option', questionId: 'a:b', optionId: 'c' })).not.toBe(placeKey({ kind: 'option', questionId: 'a', optionId: 'b:c' }));
    expect(placeKey({ kind: 'text', questionId: 'q' })).not.toBe(placeKey({ kind: 'placeholder', questionId: 'q' }));
    expect(placeKey({ kind: 'image', questionId: 'q', imageId: 'x' })).not.toBe(placeKey({ kind: 'option', questionId: 'q', optionId: 'x' }));
    // A step's own texts: never one of its question's of the same id, nor its title.
    const steps = translationPlaces(withTask()).map(placeKey);
    expect(new Set(steps).size).toBe(steps.length);
    expect(placeKey({ kind: 'stepText', stepId: 's' })).toBe('["stepText","s"]');
    expect(placeKey({ kind: 'stepText', stepId: 's' })).not.toBe(placeKey({ kind: 'step', stepId: 's' }));
    expect(placeKey({ kind: 'stepImage', stepId: 's', imageId: 'x' })).not.toBe(placeKey({ kind: 'image', questionId: 's', imageId: 'x' }));
  });

  it('goes to the next missing text after the one last visited, in the order of the survey, and round again', () => {
    const base = survey();
    const translated: Survey = { ...base, translations: { sk: { ...emptyTranslation(), title: 'Nápoje', questions: { q1: { text: '<p>Čaj?</p>', placeholder: '', options: {}, images: {} } } } } };
    const places = translationPlaces(translated);
    const gaps = translationGaps(translated, 'sk');
    // Missing: the welcome, the step, both options, the second question and its hint.
    expect(gaps.map((gap) => gap.kind)).toEqual(['intro', 'step', 'option', 'option', 'text', 'placeholder']);

    expect(nextGap(places, gaps, null)).toEqual({ kind: 'intro' });
    // From a text that is translated: the first one missing after it.
    expect(nextGap(places, gaps, placeKey({ kind: 'text', questionId: 'q1' }))).toEqual({ kind: 'option', questionId: 'q1', optionId: 'a' });
    // From a missing one left empty: on to the next, not the same again.
    expect(nextGap(places, gaps, placeKey({ kind: 'option', questionId: 'q1', optionId: 'a' }))).toEqual({ kind: 'option', questionId: 'q1', optionId: 'b' });
    // After the last: round to the first.
    expect(nextGap(places, gaps, placeKey({ kind: 'placeholder', questionId: 'q2' }))).toEqual({ kind: 'intro' });
    // A place that is no longer there counts as the top.
    expect(nextGap(places, gaps, placeKey({ kind: 'text', questionId: 'gone' }))).toEqual({ kind: 'intro' });
    expect(nextGap(places, [], null)).toBeNull();
  });

  it('counts what each question and step still has to translate - a step its own texts: its title, its text, its pictures', () => {
    const gaps = translationGaps({ ...survey(), translations: { sk: emptyTranslation() } }, 'sk');
    expect([...questionGaps(gaps)]).toEqual([
      ['q1', 3],
      ['q2', 2],
    ]);
    expect([...stepGaps(gaps)]).toEqual([['s1', 1]]);
    expect(questionGaps([]).size).toBe(0);

    const task = translationGaps({ ...withTask(), translations: { sk: emptyTranslation() } }, 'sk');
    expect([...stepGaps(task)]).toEqual([
      ['s0', 3],
      ['s1', 1],
    ]);
    expect([...questionGaps(task)]).toEqual([...questionGaps(gaps)]);
    // "Next missing" goes through them in the order of the page: the step's title, its text, its picture, then the next step.
    const places = translationPlaces(withTask());
    expect(nextGap(places, task, placeKey({ kind: 'step', stepId: 's0' }))).toEqual({ kind: 'stepText', stepId: 's0' });
    expect(nextGap(places, task, placeKey({ kind: 'stepText', stepId: 's0' }))).toEqual({ kind: 'stepImage', stepId: 's0', imageId: 'p1' });
    expect(nextGap(places, task, placeKey({ kind: 'stepImage', stepId: 's0', imageId: 'p1' }))).toEqual({ kind: 'step', stepId: 's1' });
  });

  it('lists names as a sentence would', () => {
    expect(listOfNames([])).toBe('');
    expect(listOfNames(['Slovak'])).toBe('Slovak');
    expect(listOfNames(['Slovak', 'Czech'])).toBe('Slovak and Czech');
    expect(listOfNames(['Slovak', 'Czech', 'German'])).toBe('Slovak, Czech and German');
  });
});
