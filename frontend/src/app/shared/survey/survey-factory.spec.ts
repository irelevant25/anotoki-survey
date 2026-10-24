import { localizedSurvey, pruneTranslations, translationGaps } from './localize';
import { copyQuestion, copySurvey, duplicateQuestion, newOption, newQuestion, newStep, newSurvey } from './survey-factory';
import { ChoiceOption, Question, Survey, SurveyImage, SurveyTranslation } from './survey.model';

const picture = (id: string): SurveyImage => ({ id, alt: 'A map', width: 400, height: 300, src: `/api/images/${id}.webp` });
const option = (id: string, label: string): ChoiceOption => ({ ...newOption(label), id });

/** Two questions that use the same option ids - as hand-made surveys do - in two steps, translated into Slovak and German. */
function translated(): Survey {
  const first: Question = { ...newQuestion('single'), id: 'q1', text: '<p>Which?</p>', images: [picture('p1')], options: [option('a', 'Yes'), option('b', 'No')] };
  const second: Question = { ...newQuestion('multiple'), id: 'q2', text: '<p>And?</p>', options: [option('a', 'Red'), option('b', 'Blue')] };
  const slovak: SurveyTranslation = {
    title: 'Prieskum',
    intro: '<p>Vitajte</p>',
    thanks: '<p>Ďakujeme</p>',
    steps: { s1: { title: 'Prvý', text: '', images: {} }, s2: { title: 'Druhý', text: '', images: {} } },
    questions: {
      q1: { text: '<p>Ktorý?</p>', placeholder: '', options: { a: { label: 'Áno' }, b: { label: 'Nie' } }, images: { p1: { alt: 'Mapa' } } },
      q2: { text: '<p>A?</p>', placeholder: '', options: { a: { label: 'Červená' }, b: { label: 'Modrá' } }, images: {} },
    },
  };
  const german: SurveyTranslation = { title: 'Umfrage', intro: '', thanks: '', steps: {}, questions: { q2: { text: '<p>Und?</p>', placeholder: '', options: {}, images: {} } } };
  return {
    ...newSurvey([]),
    id: 'survey-1',
    slug: 'a-survey',
    title: 'A survey',
    steps: [
      { ...newStep('First'), id: 's1', questions: [first] },
      { ...newStep('Second'), id: 's2', questions: [second] },
    ],
    translations: { sk: slovak, de: german },
  };
}

describe('a new survey', () => {
  it('is written in English, and translated into nothing yet', () => {
    const survey = newSurvey([]);
    expect(survey.language).toBe('en');
    expect(survey.translations).toEqual({});
  });
});

describe('copyQuestion', () => {
  it('gives the copy new ids and says which became which - the pictures keep theirs', () => {
    const question = translated().steps[0].questions[0];
    const { question: copy, ids } = copyQuestion(question);
    expect(ids.from).toBe('q1');
    expect(ids.to).toBe(copy.id);
    expect(copy.id).not.toBe('q1');
    expect([...ids.options.keys()]).toEqual(['a', 'b']);
    expect([...ids.options.values()]).toEqual(copy.options.map((item) => item.id));
    expect(new Set([copy.id, ...copy.options.map((item) => item.id), 'q1', 'a', 'b']).size).toBe(6);
    expect(copy.options.map((item) => item.label)).toEqual(['Yes', 'No']);
    expect(copy.images).toEqual(question.images);
    expect({ ...copy, id: '', options: [], images: [] }).toEqual({ ...question, id: '', options: [], images: [] });
  });
});

describe('duplicateQuestion', () => {
  it('puts the copy right after the original, its texts in every translation with it', () => {
    const survey = translated();
    const before = JSON.stringify(survey);
    const result = duplicateQuestion(survey, 's1', 'q1');
    expect(JSON.stringify(survey)).toBe(before);

    const [original, copy] = result.steps[0].questions;
    expect(result.steps[0].questions).toHaveLength(2);
    expect(original).toBe(survey.steps[0].questions[0]);
    expect(result.steps[1]).toBe(survey.steps[1]);
    expect(copy.text).toBe('<p>Which?</p>');

    const slovak = result.translations['sk'];
    expect(slovak.questions['q1']).toBe(survey.translations['sk'].questions['q1']);
    expect(slovak.questions[copy.id]).toEqual({
      text: '<p>Ktorý?</p>',
      placeholder: '',
      options: { [copy.options[0].id]: { label: 'Áno' }, [copy.options[1].id]: { label: 'Nie' } },
      images: { p1: { alt: 'Mapa' } },
    });
    expect(slovak.steps).toBe(survey.translations['sk'].steps);
    // German has no words for that question: nothing is made up for its copy.
    expect(result.translations['de']).toBe(survey.translations['de']);
    // Every entry has its place, so there is nothing to prune.
    expect(pruneTranslations(result)).toBe(result);
  });

  it('leaves a survey that has no such question in that step as it came', () => {
    const survey = translated();
    expect(duplicateQuestion(survey, 's1', 'q2')).toBe(survey);
    expect(duplicateQuestion(survey, 'gone', 'q1')).toBe(survey);
  });
});

describe('copySurvey', () => {
  it('is a new draft with new ids all the way down, and the translations under them', () => {
    const survey = translated();
    const before = JSON.stringify(survey);
    const copy = copySurvey(survey, ['a-survey'], new Date('2026-09-30T12:00:00Z'));
    expect(JSON.stringify(survey)).toBe(before);

    expect(copy).toMatchObject({ slug: 'a-survey-copy', title: 'Copy of A survey', status: 'draft', revision: 0, language: 'en' });
    const [s1, s2] = copy.steps;
    const [q1] = s1.questions;
    const [q2] = s2.questions;
    const oldIds = ['survey-1', 's1', 's2', 'q1', 'q2', 'a', 'b'];
    const newIds = [copy.id, s1.id, s2.id, q1.id, q2.id, ...q1.options.map((item) => item.id), ...q2.options.map((item) => item.id)];
    expect(new Set(newIds).size).toBe(newIds.length);
    expect(newIds.filter((id) => oldIds.includes(id))).toEqual([]);

    expect(Object.keys(copy.translations)).toEqual(['sk', 'de']);
    const slovak = copy.translations['sk'];
    expect(slovak).toEqual({
      // "Copy of A survey" is a new title: nobody has translated it yet.
      title: '',
      intro: '<p>Vitajte</p>',
      thanks: '<p>Ďakujeme</p>',
      steps: { [s1.id]: { title: 'Prvý', text: '', images: {} }, [s2.id]: { title: 'Druhý', text: '', images: {} } },
      questions: {
        [q1.id]: { text: '<p>Ktorý?</p>', placeholder: '', options: { [q1.options[0].id]: { label: 'Áno' }, [q1.options[1].id]: { label: 'Nie' } }, images: { p1: { alt: 'Mapa' } } },
        // The same option ids as the first question's: each question's options go their own way.
        [q2.id]: { text: '<p>A?</p>', placeholder: '', options: { [q2.options[0].id]: { label: 'Červená' }, [q2.options[1].id]: { label: 'Modrá' } }, images: {} },
      },
    });
    expect(copy.translations['de']).toEqual({ title: '', intro: '', thanks: '', steps: {}, questions: { [q2.id]: { text: '<p>Und?</p>', placeholder: '', options: {}, images: {} } } });
    expect(pruneTranslations(copy)).toBe(copy);
  });

  it('leaves the title of every translation to be written: the copy has a new one, and must not open under the old', () => {
    const survey = translated();
    expect(translationGaps(survey, 'sk')).toEqual([]);

    const copy = copySurvey(survey, []);
    expect(copy.title).toBe('Copy of A survey');
    expect(translationGaps(copy, 'sk')).toEqual([{ kind: 'title' }]);
    expect(translationGaps(copy, 'de')[0]).toEqual({ kind: 'title' });
    // So a reader of Slovak gets the copy in the language it is written in - not the original's Slovak name.
    expect(localizedSurvey(copy, 'sk', 'complete')).toEqual({ survey: copy, language: 'en' });
    // The original keeps its own.
    expect(survey.translations['sk'].title).toBe('Prieskum');
  });

  it('leaves behind translated texts of what the survey does not have', () => {
    const survey = translated();
    const stray = {
      ...survey,
      translations: { sk: { ...survey.translations['sk'], steps: { gone: { title: 'x', text: '', images: {} } }, questions: { gone: { text: 'x', placeholder: '', options: {}, images: {} } } } },
    };
    const copy = copySurvey(stray, []);
    expect(copy.translations['sk'].steps).toEqual({});
    expect(copy.translations['sk'].questions).toEqual({});
  });

  it('copies a step’s own text and pictures - the pictures shared - with their translations under the step’s new id', () => {
    const survey = translated();
    const task = { ...newStep('The task'), id: 's0', text: '<p>Go to the site, then come back.</p>', images: [picture('p2')] };
    const withTask: Survey = {
      ...survey,
      steps: [task, ...survey.steps],
      translations: {
        ...survey.translations,
        sk: { ...survey.translations['sk'], steps: { ...survey.translations['sk'].steps, s0: { title: 'Úloha', text: '<p>Choďte na stránku.</p>', images: { p2: { alt: 'Mapa' } } } } },
      },
    };
    const before = JSON.stringify(withTask);
    const copy = copySurvey(withTask, []);
    expect(JSON.stringify(withTask)).toBe(before);

    const [copied] = copy.steps;
    expect(copied.id).not.toBe('s0');
    expect({ title: copied.title, text: copied.text, questions: copied.questions }).toEqual({ title: 'The task', text: '<p>Go to the site, then come back.</p>', questions: [] });
    expect(copied.images).toEqual(task.images);
    expect(copied.images).not.toBe(task.images);
    expect(copy.translations['sk'].steps[copied.id]).toEqual({ title: 'Úloha', text: '<p>Choďte na stránku.</p>', images: { p2: { alt: 'Mapa' } } });
    expect(copy.translations['sk'].steps[copied.id].images).not.toBe(withTask.translations['sk'].steps['s0'].images);
    expect(pruneTranslations(copy)).toBe(copy);
    // Only the copy's new title is left to translate: the step's text and picture are translated as they were.
    expect(translationGaps(copy, 'sk')).toEqual([{ kind: 'title' }]);
  });
});

describe('a new step', () => {
  it('has no text of its own, no pictures and no questions yet', () => {
    const step = newStep('Fourth');
    expect({ ...step, id: '' }).toEqual({ id: '', title: 'Fourth', text: '', images: [], questions: [] });
  });
});
