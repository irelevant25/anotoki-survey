import { answerProblem, choiceLimits, choiceRule, cleanAnswer, isAnswered, withoutControls } from './answer-rules';
import { newOption, newQuestion } from './survey-factory';
import { Answer, Question } from './survey.model';

function choice(type: 'single' | 'multiple', labels: string[], extra: Partial<Question> = {}): Question {
  return { ...newQuestion(type), text: '<p>Q</p>', options: labels.map((label) => newOption(label, label === 'Other')), ...extra };
}

function picked(question: Question, ...labels: string[]): Answer {
  return { optionIds: question.options.filter((option) => labels.includes(option.label)).map((option) => option.id), other: '', text: '' };
}

describe('choiceLimits and choiceRule', () => {
  it('asks for one choice, or none when optional', () => {
    expect(choiceLimits(choice('single', ['A', 'B']))).toEqual({ min: 1, max: 1 });
    expect(choiceLimits(choice('single', ['A', 'B'], { required: false }))).toEqual({ min: 0, max: 1 });
    expect(choiceRule(choice('single', ['A', 'B']))).toBe('');
  });

  it('words the limits of several choices the way people read them', () => {
    const five = ['A', 'B', 'C', 'D', 'E'];
    expect(choiceRule(choice('multiple', five))).toBe('Choose any that apply.');
    expect(choiceRule(choice('multiple', five, { maxChoices: 3 }))).toBe('Choose up to 3.');
    expect(choiceRule(choice('multiple', five, { minChoices: 2 }))).toBe('Choose at least 2.');
    expect(choiceRule(choice('multiple', five, { minChoices: 2, maxChoices: 3 }))).toBe('Choose 2 to 3.');
    expect(choiceRule(choice('multiple', five, { minChoices: 2, maxChoices: 2 }))).toBe('Choose 2.');
  });

  it('keeps the limits within the options there are', () => {
    expect(choiceLimits(choice('multiple', ['A', 'B'], { maxChoices: 5 }))).toEqual({ min: 1, max: 2 });
    expect(choiceLimits(choice('multiple', ['A', 'B', 'C'], { minChoices: 9, maxChoices: 2 }))).toEqual({ min: 2, max: 2 });
  });
});

describe('answerProblem', () => {
  it('lets an optional question be left empty, but not a required one', () => {
    const question = choice('single', ['A', 'B']);
    expect(answerProblem(question, undefined)).toBe('Please choose an answer.');
    expect(answerProblem({ ...question, required: false }, undefined)).toBeNull();
    expect(answerProblem(question, picked(question, 'A'))).toBeNull();
  });

  it('holds several choices to their least and most', () => {
    const question = choice('multiple', ['A', 'B', 'C', 'D'], { minChoices: 2, maxChoices: 3 });
    expect(answerProblem(question, undefined)).toBe('Please choose at least 2.');
    expect(answerProblem(question, picked(question, 'A'))).toBe('Please choose at least 2.');
    expect(answerProblem(question, picked(question, 'A', 'B'))).toBeNull();
    expect(answerProblem(question, picked(question, 'A', 'B', 'C', 'D'))).toBe('Please choose at most 3.');
  });

  it('applies the least to an optional question once it is answered', () => {
    const question = choice('multiple', ['A', 'B', 'C'], { required: false, minChoices: 2 });
    expect(answerProblem(question, undefined)).toBeNull();
    expect(answerProblem(question, picked(question, 'A'))).toBe('Please choose at least 2.');
  });

  it('wants words next to a chosen "Other"', () => {
    const question = choice('single', ['A', 'Other']);
    const answer = picked(question, 'Other');
    expect(answerProblem(question, answer)).toBe('Please write what "Other" is for you.');
    expect(answerProblem(question, { ...answer, other: '  ' })).toBe('Please write what "Other" is for you.');
    expect(answerProblem(question, { ...answer, other: 'TikTok' })).toBeNull();
  });

  it('checks text answers for being there and for their length', () => {
    const question: Question = { ...newQuestion('text'), text: '<p>Q</p>', required: true, maxLength: 5 };
    expect(answerProblem(question, { optionIds: [], other: '', text: '   ' })).toBe('Please write an answer.');
    expect(answerProblem(question, { optionIds: [], other: '', text: 'short' })).toBeNull();
    expect(answerProblem(question, { optionIds: [], other: '', text: 'too long' })).toBe('Please keep it under 5 characters.');
  });

  it('ignores options the question no longer has', () => {
    const question = choice('multiple', ['A', 'B'], { minChoices: 2 });
    const answer = { ...picked(question, 'A'), optionIds: [question.options[0].id, 'removed-option'] };
    expect(answerProblem(question, answer)).toBe('Please choose at least 2.');
    // Only removed options chosen: not answered at all.
    expect(isAnswered(question, { optionIds: ['removed-option'], other: '', text: '' })).toBe(false);
    expect(answerProblem(question, { optionIds: ['removed-option'], other: '', text: '' })).toBe('Please choose at least 2.');
  });

  it('never keeps anybody on a question nobody could answer', () => {
    // An open survey edited into one of these must not trap the people taking it.
    const noOptions = choice('single', [], { required: true });
    expect(choiceLimits(noOptions)).toEqual({ min: 0, max: 0 });
    expect(answerProblem(noOptions, undefined)).toBeNull();
    expect(answerProblem(choice('multiple', [], { required: true, minChoices: 2 }), undefined)).toBeNull();
    const zeroLength: Question = { ...newQuestion('text'), text: '<p>Q</p>', required: true, maxLength: 0 };
    expect(answerProblem(zeroLength, { optionIds: [], other: '', text: 'fine' })).toBeNull();
  });
});

describe('cleanAnswer', () => {
  it('keeps the question order, drops unknown options, and "Other" words without "Other"', () => {
    const question = choice('multiple', ['A', 'B', 'Other']);
    const [a, b] = question.options;
    const cleaned = cleanAnswer(question, { optionIds: [b.id, 'gone', a.id], other: 'left over', text: 'stray' });
    expect(cleaned).toEqual({ optionIds: [a.id, b.id], other: '', text: '' });
  });

  it('keeps the "Other" words, trimmed, while "Other" is chosen', () => {
    const question = choice('single', ['A', 'Other']);
    expect(cleanAnswer(question, { ...picked(question, 'Other'), other: '  TikTok ' })?.other).toBe('TikTok');
  });

  it('gives nothing for nothing', () => {
    expect(cleanAnswer(choice('single', ['A', 'B']), undefined)).toBeNull();
    expect(isAnswered(newQuestion('text'), { optionIds: [], other: '', text: ' ' })).toBe(false);
  });

  it('drops the control characters a paste can bring, as the server does - line breaks and tabs stay', () => {
    expect(withoutControls('first line\u000B second\u000Cline\n\tend\u001B')).toBe('first line secondline\n\tend');
    expect(cleanAnswer(newQuestion('text'), { optionIds: [], other: '', text: ' Hy\u000Bdro ' })).toEqual({ optionIds: [], other: '', text: 'Hydro' });
  });
});
