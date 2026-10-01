import { emptyTranslation } from './localize';
import { newOption, newQuestion, newStep, newSurvey, slugify, uniqueSlug } from './survey-factory';
import { ProblemLanguage, problemsHeading, surveyProblems } from './survey-problems';
import { ChoiceOption, Survey, SurveyTranslation } from './survey.model';

/** A survey with nothing wrong in it: one step, one question with two options. */
function readySurvey(): Survey {
  const survey = newSurvey([]);
  const question = { ...newQuestion('single'), text: '<p>Which?</p>', options: [newOption('A'), newOption('B')] };
  return { ...survey, title: 'A survey', slug: 'a-survey', steps: [{ ...newStep('One'), questions: [question] }] };
}

const messages = (survey: Survey, others: Survey[] = [], languages?: ProblemLanguage[]) => surveyProblems(survey, others, languages).map((problem) => problem.message);

describe('surveyProblems', () => {
  it('finds nothing in a survey that is ready', () => {
    expect(messages(readySurvey())).toEqual([]);
  });

  it('wants a title and an address of its own', () => {
    const survey = readySurvey();
    expect(messages({ ...survey, title: ' ' })).toContain('The survey needs a title.');
    expect(messages({ ...survey, slug: 'Not A Slug' })).toContain('The address may hold only small letters, digits and dashes.');
    expect(messages({ ...survey, slug: 'admin' })[0]).toMatch(/belongs to the site itself/);
    expect(messages(survey, [{ ...readySurvey(), id: 'other' }])).toContain('Another survey already lives at "a-survey".');
  });

  it('wants questions, and no empty step', () => {
    const survey = readySurvey();
    expect(messages({ ...survey, steps: [] })).toContain('Add at least one question.');
    const empty = newStep();
    // "About you" is step 1 when it is asked, so the empty one is step 3.
    expect(messages({ ...survey, askAboutYou: true, steps: [...survey.steps, empty] })).toContain('Step 3 has no questions - add one, or remove the step.');
    expect(messages({ ...survey, askAboutYou: false, steps: [...survey.steps, empty] })).toContain('Step 2 has no questions - add one, or remove the step.');
  });

  it('checks every question: text, options, labels, limits', () => {
    const survey = readySurvey();
    const question = survey.steps[0].questions[0];
    const withQuestion = (change: object) => ({ ...survey, steps: [{ ...survey.steps[0], questions: [{ ...question, ...change }] }] });
    expect(messages(withQuestion({ text: '<p></p>' }))).toContain('Question 1 has no text.');
    expect(messages(withQuestion({ options: [newOption('A')] }))).toContain('Question 1 needs at least two options.');
    expect(messages(withQuestion({ options: [newOption('A'), newOption(' ')] }))).toContain('Question 1 has an option with no label.');
    expect(messages(withQuestion({ options: [newOption('Same'), newOption('same ')] }))).toContain('Question 1 has two options called "same".');
    expect(messages(withQuestion({ type: 'multiple', minChoices: 3, maxChoices: 2 }))).toContain('Question 1 asks for at least 3 but at most 2.');
    expect(messages(withQuestion({ type: 'multiple', minChoices: 3 }))).toContain('Question 1 asks for at least 3 but has only 2 options.');
    expect(messages(withQuestion({ type: 'text', options: [], maxLength: 0 }))).toContain('Question 1: the longest answer must be at least one character.');
  });
});

/** The languages of the site, in its order: English and Slovak offered, German hidden. */
const LANGUAGES: ProblemLanguage[] = [
  { code: 'en', name: 'English', enabled: true },
  { code: 'sk', name: 'Slovak', enabled: true },
  { code: 'de', name: 'German', enabled: false },
];

const option = (id: string, label: string, other = false): ChoiceOption => ({ id, label, other, images: [] });

/**
 * Three questions in two steps, with "About you" before them - the survey
 * backend/tests/unit/rules.test.php checks the same sentences on, in the
 * same order.
 */
function threeQuestions(): Survey {
  return {
    ...readySurvey(),
    title: 'Genshin 1.0',
    slug: 'genshin-1-0',
    intro: '<p>Hello</p>',
    thanks: '<p>Thanks</p>',
    askAboutYou: true,
    steps: [
      {
        id: 's1',
        title: 'First',
        questions: [
          { ...newQuestion('single'), id: 'q1', text: '<p>Which one?</p>', options: [option('a', 'Anemo'), option('b', 'Geo'), option('o', 'Something else', true)] },
          { ...newQuestion('text'), id: 'q2', text: '<p>Why?</p>', placeholder: 'A few words' },
        ],
      },
      { id: 's2', title: 'Second', questions: [{ ...newQuestion('single'), id: 'q3', text: '<p>Again?</p>', options: [option('a', 'Yes'), option('b', 'No')] }] },
    ],
  };
}

/** Nothing of threeQuestions() left to translate. */
function wholeSlovak(): SurveyTranslation {
  return {
    title: 'Genshin 1.0',
    intro: '<p>Ahoj</p>',
    thanks: '<p>Vďaka</p>',
    steps: { s1: { title: 'Prvý' }, s2: { title: 'Druhý' } },
    questions: {
      q1: { text: '<p>Ktorý?</p>', placeholder: '', options: { a: { label: 'Anemo' }, b: { label: 'Geo' }, o: { label: 'Niečo iné' } }, images: {} },
      q2: { text: '<p>Prečo?</p>', placeholder: 'Pár slov', options: {}, images: {} },
      q3: { text: '<p>Znova?</p>', placeholder: '', options: { a: { label: 'Áno' }, b: { label: 'Nie' } }, images: {} },
    },
  };
}

/** The same with holes in it: no title, welcome or thanks, no title for the first step, and the first two questions unfinished. */
function brokenSlovak(): SurveyTranslation {
  return {
    title: '',
    intro: '<p> </p>',
    thanks: '',
    steps: { s2: { title: 'Druhý' } },
    questions: {
      q1: { text: '', placeholder: '', options: { a: { label: 'Rovnaké' }, b: { label: ' rovnaké ' } }, images: {} },
      q2: { text: '<p>Prečo?</p>', placeholder: '', options: {}, images: {} },
      q3: wholeSlovak().questions['q3'],
    },
  };
}

describe('translations', () => {
  it('finds nothing in a translation that is whole', () => {
    expect(messages({ ...threeQuestions(), translations: { sk: wholeSlovak() } }, [], LANGUAGES)).toEqual([]);
    expect(messages(threeQuestions(), [], LANGUAGES)).toEqual([]);
  });

  it('lists what a translation lacks after the problems of the survey itself, in the order of the document, in the words of the server', () => {
    const survey = { ...threeQuestions(), translations: { sk: brokenSlovak() } };
    expect(messages({ ...survey, slug: 'admin' }, [], LANGUAGES)).toEqual([
      'The address "admin" belongs to the site itself - choose another.',
      'Slovak: the title is missing.',
      'Slovak: the welcome text is missing.',
      'Slovak: the thank-you text is missing.',
      'Slovak: the title of step 2 is missing.',
      'Slovak: question 1 has 2 texts to translate.',
      'Slovak: question 1 has two options called "rovnaké".',
      'Slovak: question 2 has 1 text to translate.',
    ]);
    // Steps are numbered as people see them: without "About you" the first step is step 1.
    expect(messages({ ...survey, askAboutYou: false }, [], LANGUAGES)).toContain('Slovak: the title of step 1 is missing.');
    // A survey with no title has none to translate.
    expect(messages({ ...survey, title: ' ' }, [], LANGUAGES).slice(0, 2)).toEqual(['The survey needs a title.', 'Slovak: the welcome text is missing.']);
  });

  it('minds only the languages people are offered, in the order of the languages - and none when it is told of none', () => {
    const survey = { ...threeQuestions(), translations: { de: emptyTranslation(), sk: { ...wholeSlovak(), title: '' } } };
    expect(messages(survey, [], LANGUAGES)).toEqual(['Slovak: the title is missing.']);
    expect(messages(survey)).toEqual([]);

    const offered = LANGUAGES.map((language) => ({ ...language, enabled: true }));
    expect(messages(survey, [], offered)).toEqual([
      'Slovak: the title is missing.',
      'German: the title is missing.',
      'German: the welcome text is missing.',
      'German: the thank-you text is missing.',
      'German: the title of step 2 is missing.',
      'German: question 1 has 4 texts to translate.',
      'German: question 2 has 2 texts to translate.',
      'German: the title of step 3 is missing.',
      'German: question 3 has 3 texts to translate.',
    ]);
    // A language the site does not know, and the one the survey is written in, are nobody's to translate.
    expect(messages({ ...survey, translations: { fr: emptyTranslation(), en: emptyTranslation() } }, [], offered)).toEqual([]);
  });

  it('says which language a problem is in, so the editor can open it', () => {
    const survey = { ...threeQuestions(), translations: { sk: brokenSlovak() } };
    expect(surveyProblems(survey, [], LANGUAGES).map((problem) => problem.target)).toEqual([
      { kind: 'survey', field: 'title', language: 'sk' },
      { kind: 'survey', field: 'intro', language: 'sk' },
      { kind: 'survey', field: 'thanks', language: 'sk' },
      { kind: 'step', stepId: 's1', language: 'sk' },
      { kind: 'question', questionId: 'q1', language: 'sk' },
      { kind: 'question', questionId: 'q1', language: 'sk' },
      { kind: 'question', questionId: 'q2', language: 'sk' },
    ]);
  });

  it('marks the problems that are a text still to translate - what sends readers of that language to the original - and no other', () => {
    const survey = { ...threeQuestions(), title: ' ', translations: { sk: brokenSlovak() } };
    const problems = surveyProblems(survey, [], LANGUAGES);
    expect(problems.map((problem) => `${problem.untranslated ? 'untranslated' : 'other'} | ${problem.message}`)).toEqual([
      'other | The survey needs a title.',
      'untranslated | Slovak: the welcome text is missing.',
      'untranslated | Slovak: the thank-you text is missing.',
      'untranslated | Slovak: the title of step 2 is missing.',
      'untranslated | Slovak: question 1 has 2 texts to translate.',
      // Two options that read the same are wrong, but nothing is missing: the translation is still shown.
      'other | Slovak: question 1 has two options called "rovnaké".',
      'untranslated | Slovak: question 2 has 1 text to translate.',
    ]);
    // Every marked one says which language it is missing in.
    expect(problems.filter((problem) => problem.untranslated).every((problem) => problem.target.language === 'sk')).toBe(true);
  });
});

describe('addresses', () => {
  it('makes an address of a title', () => {
    expect(slugify('Genshin 1.0 — what’s next?')).toBe('genshin-1-0-whats-next');
    expect(slugify('Čo si myslíte o Piano Academy?')).toBe('co-si-myslite-o-piano-academy');
    expect(slugify('  ---  ')).toBe('');
  });

  it('never takes one that is taken, nor one of the site own', () => {
    expect(uniqueSlug('Survey', ['survey', 'survey-2'])).toBe('survey-3');
    expect(uniqueSlug('Admin', [])).toBe('admin-2');
    expect(uniqueSlug('', [])).toBe('survey');
  });

  it('keeps a numbered address within the longest one', () => {
    const long = slugify('a'.repeat(30) + ' ' + 'b'.repeat(40));
    expect(long.length).toBeLessThanOrEqual(60);
    const next = uniqueSlug(long + '-copy', [long]);
    expect(next.length).toBeLessThanOrEqual(60);
    expect(next).toMatch(/-2$/);
    expect(next).toBe(slugify(next));
  });
});

describe('where a problem is', () => {
  it('names the field of the survey it is about', () => {
    const survey = readySurvey();
    const targets = surveyProblems({ ...survey, title: '', slug: 'admin', steps: [] }, []).map((problem) => problem.target);
    expect(targets).toEqual([
      { kind: 'survey', field: 'title' },
      { kind: 'survey', field: 'address' },
      { kind: 'survey', field: 'questions' },
    ]);
    // In the language the survey is written in: no language to open.
    expect(targets.some((target) => 'language' in target)).toBe(false);
  });
});

describe('what the list of problems is called', () => {
  it('follows where the survey is: a draft opens, an open survey is open, a closed one reopens', () => {
    expect(problemsHeading('draft', 0)).toBe('Ready to open');
    expect(problemsHeading('draft', 1)).toBe('1 to fix before it opens');
    expect(problemsHeading('draft', 12)).toBe('12 to fix before it opens');
    // Nothing "opens" a survey people are already taking.
    expect(problemsHeading('open', 0)).toBe('Nothing to fix');
    expect(problemsHeading('open', 1)).toBe('1 to fix - the survey is open');
    expect(problemsHeading('closed', 0)).toBe('Ready to reopen');
    expect(problemsHeading('closed', 3)).toBe('3 to fix before it reopens');
  });
});
