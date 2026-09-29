import { newOption, newQuestion, newStep, newSurvey, slugify, uniqueSlug } from './survey-factory';
import { surveyProblems } from './survey-problems';
import { Survey } from './survey.model';

/** A survey with nothing wrong in it: one step, one question with two options. */
function readySurvey(): Survey {
  const survey = newSurvey([]);
  const question = { ...newQuestion('single'), text: '<p>Which?</p>', options: [newOption('A'), newOption('B')] };
  return { ...survey, title: 'A survey', slug: 'a-survey', steps: [{ ...newStep('One'), questions: [question] }] };
}

const messages = (survey: Survey, others: Survey[] = []) => surveyProblems(survey, others).map((problem) => problem.message);

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
  });
});
