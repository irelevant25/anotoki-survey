import { TestBed } from '@angular/core/testing';
import { AnswerProblem, ChoiceRule, answerProblem, answerProblemText, choiceRule, choiceRuleText } from '../survey/answer-rules';
import { newOption, newQuestion } from '../survey/survey-factory';
import { Question } from '../survey/survey.model';
import { provideTestTranslations } from '../testing/test-translations';
import { AnswerWords, problemText, ruleText } from './answer-words';
import { DYNAMIC_KEYS } from './dynamic-keys';
import { TranslationService } from './translation.service';

const ENGLISH = {
  'answer.rule.any': 'Choose any that apply.',
  'answer.rule.atLeast.one': 'Choose at least {count}.',
  'answer.rule.atLeast.few': 'Choose at least {count}.',
  'answer.rule.atLeast.other': 'Choose at least {count}.',
  'answer.rule.upTo.one': 'Choose up to {count}.',
  'answer.rule.upTo.few': 'Choose up to {count}.',
  'answer.rule.upTo.other': 'Choose up to {count}.',
  'answer.rule.exactly.one': 'Choose {count}.',
  'answer.rule.exactly.few': 'Choose {count}.',
  'answer.rule.exactly.other': 'Choose {count}.',
  'answer.rule.between.one': 'Choose {min} to {count}.',
  'answer.rule.between.few': 'Choose {min} to {count}.',
  'answer.rule.between.other': 'Choose {min} to {count}.',
  'answer.problem.write': 'Please write an answer.',
  'answer.problem.choose': 'Please choose an answer.',
  'answer.problem.chooseAtLeast.one': 'Please choose at least {count}.',
  'answer.problem.chooseAtLeast.few': 'Please choose at least {count}.',
  'answer.problem.chooseAtLeast.other': 'Please choose at least {count}.',
  'answer.problem.tooLong.one': 'Please keep it under {count} character.',
  'answer.problem.tooLong.few': 'Please keep it under {count} characters.',
  'answer.problem.tooLong.other': 'Please keep it under {count} characters.',
  'answer.problem.chooseOne': 'Please choose only one.',
  'answer.problem.chooseAtMost.one': 'Please choose at most {count}.',
  'answer.problem.chooseAtMost.few': 'Please choose at most {count}.',
  'answer.problem.chooseAtMost.other': 'Please choose at most {count}.',
  'answer.problem.writeOther': 'Please write what "{label}" is for you.',
  'take.invalidAnswer': 'Please check this answer.',
};

const SLOVAK = {
  'answer.rule.any': 'Vyberte všetky možnosti, ktoré platia.',
  'answer.rule.atLeast.one': 'Vyberte aspoň 1 možnosť.',
  'answer.rule.atLeast.few': 'Vyberte aspoň {count} možnosti.',
  'answer.rule.atLeast.other': 'Vyberte aspoň {count} možností.',
  'answer.rule.upTo.one': 'Vyberte najviac 1 možnosť.',
  'answer.rule.upTo.few': 'Vyberte najviac {count} možnosti.',
  'answer.rule.upTo.other': 'Vyberte najviac {count} možností.',
  'answer.rule.exactly.one': 'Vyberte presne 1 možnosť.',
  'answer.rule.exactly.few': 'Vyberte presne {count} možnosti.',
  'answer.rule.exactly.other': 'Vyberte presne {count} možností.',
  'answer.rule.between.one': 'Vyberte {min} až 1 možnosť.',
  'answer.rule.between.few': 'Vyberte {min} až {count} možnosti.',
  'answer.rule.between.other': 'Vyberte {min} až {count} možností.',
  'answer.problem.write': 'Napíšte, prosím, odpoveď.',
  'answer.problem.choose': 'Vyberte, prosím, odpoveď.',
  'answer.problem.chooseAtLeast.one': 'Vyberte, prosím, aspoň 1 možnosť.',
  'answer.problem.chooseAtLeast.few': 'Vyberte, prosím, aspoň {count} možnosti.',
  'answer.problem.chooseAtLeast.other': 'Vyberte, prosím, aspoň {count} možností.',
  'answer.problem.tooLong.one': 'Skráťte, prosím, odpoveď najviac na 1 znak.',
  'answer.problem.tooLong.few': 'Skráťte, prosím, odpoveď najviac na {count} znaky.',
  'answer.problem.tooLong.other': 'Skráťte, prosím, odpoveď najviac na {count} znakov.',
  'answer.problem.chooseOne': 'Vyberte, prosím, iba jednu možnosť.',
  'answer.problem.chooseAtMost.one': 'Vyberte, prosím, najviac 1 možnosť.',
  'answer.problem.chooseAtMost.few': 'Vyberte, prosím, najviac {count} možnosti.',
  'answer.problem.chooseAtMost.other': 'Vyberte, prosím, najviac {count} možností.',
  'answer.problem.writeOther': 'Pri možnosti „{label}“ napíšte, prosím, vlastnú odpoveď.',
  'take.invalidAnswer': 'Skontrolujte, prosím, túto odpoveď.',
};

/** Every rule and every problem answer-rules.ts can return, one of each kind. */
const RULES: ChoiceRule[] = [
  { kind: 'any', params: {} },
  { kind: 'atLeast', params: { min: 2 } },
  { kind: 'upTo', params: { max: 3 } },
  { kind: 'exactly', params: { count: 2 } },
  { kind: 'between', params: { min: 2, max: 5 } },
];
const PROBLEMS: AnswerProblem[] = [
  { kind: 'write', params: {} },
  { kind: 'choose', params: {} },
  { kind: 'chooseAtLeast', params: { min: 2 } },
  { kind: 'tooLong', params: { limit: 200 } },
  { kind: 'chooseOne', params: {} },
  { kind: 'chooseAtMost', params: { max: 3 } },
  { kind: 'writeOther', params: { optionId: 'o1', label: 'Other' } },
];

function words(language: 'en' | 'sk'): TranslationService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [language === 'sk' ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH)] });
  return TestBed.inject(TranslationService);
}

/** Answers with the key it was asked for, so a test can see which one that was. */
const KEYS: AnswerWords = {
  t: (key) => key,
  plural: (key, count) => `${key} #${count}`,
};

function choice(type: 'single' | 'multiple', labels: string[], extra: Partial<Question> = {}): Question {
  return { ...newQuestion(type), text: '<p>Q</p>', options: labels.map((label) => newOption(label, label === 'Other')), ...extra };
}

describe('ruleText(): how many to choose, in the reader’s words', () => {
  it('says in English what the editor quotes', () => {
    const i18n = words('en');
    for (const rule of RULES) {
      expect(ruleText(i18n, rule)).toBe(choiceRuleText(rule));
    }
    const five = ['A', 'B', 'C', 'D', 'E'];
    expect(ruleText(i18n, choiceRule(choice('multiple', five, { minChoices: 2, maxChoices: 3 })))).toBe('Choose 2 to 3.');
  });

  it('says nothing for no rule', () => {
    expect(ruleText(words('en'), choiceRule(choice('single', ['A', 'B'])))).toBe('');
    expect(ruleText(KEYS, null)).toBe('');
  });

  it('counts every rule with a number, the Slovak way: 1, 2-4, 5 and more', () => {
    const i18n = words('sk');
    expect(ruleText(i18n, { kind: 'any', params: {} })).toBe('Vyberte všetky možnosti, ktoré platia.');
    expect([1, 2, 5].map((max) => ruleText(i18n, { kind: 'upTo', params: { max } }))).toEqual(['Vyberte najviac 1 možnosť.', 'Vyberte najviac 2 možnosti.', 'Vyberte najviac 5 možností.']);
    expect([2, 4, 6].map((min) => ruleText(i18n, { kind: 'atLeast', params: { min } }))).toEqual(['Vyberte aspoň 2 možnosti.', 'Vyberte aspoň 4 možnosti.', 'Vyberte aspoň 6 možností.']);
    expect([2, 5].map((count) => ruleText(i18n, { kind: 'exactly', params: { count } }))).toEqual(['Vyberte presne 2 možnosti.', 'Vyberte presne 5 možností.']);
  });

  it('counts "between" by its most, with the least beside it', () => {
    const i18n = words('sk');
    expect(ruleText(i18n, { kind: 'between', params: { min: 2, max: 3 } })).toBe('Vyberte 2 až 3 možnosti.');
    expect(ruleText(i18n, { kind: 'between', params: { min: 2, max: 7 } })).toBe('Vyberte 2 až 7 možností.');
    expect(ruleText(KEYS, { kind: 'between', params: { min: 2, max: 7 } })).toBe('answer.rule.between #7');
  });
});

describe('problemText(): why an answer cannot be accepted, in the reader’s words', () => {
  it('says in English what the server says - but for the one character English counts apart', () => {
    const i18n = words('en');
    for (const problem of PROBLEMS) {
      expect(problemText(i18n, problem)).toBe(answerProblemText(problem));
    }
    expect(problemText(i18n, { kind: 'tooLong', params: { limit: 1 } })).toBe('Please keep it under 1 character.');
  });

  it('says nothing for no problem', () => {
    const question = choice('single', ['A', 'B'], { required: false });
    expect(problemText(words('en'), answerProblem(question, undefined))).toBe('');
    expect(problemText(KEYS, null)).toBe('');
  });

  it('counts every problem with a number, the Slovak way', () => {
    const i18n = words('sk');
    expect(problemText(i18n, { kind: 'write', params: {} })).toBe('Napíšte, prosím, odpoveď.');
    expect(problemText(i18n, { kind: 'choose', params: {} })).toBe('Vyberte, prosím, odpoveď.');
    expect(problemText(i18n, { kind: 'chooseOne', params: {} })).toBe('Vyberte, prosím, iba jednu možnosť.');
    expect([2, 5].map((min) => problemText(i18n, { kind: 'chooseAtLeast', params: { min } }))).toEqual(['Vyberte, prosím, aspoň 2 možnosti.', 'Vyberte, prosím, aspoň 5 možností.']);
    expect([3, 12].map((max) => problemText(i18n, { kind: 'chooseAtMost', params: { max } }))).toEqual(['Vyberte, prosím, najviac 3 možnosti.', 'Vyberte, prosím, najviac 12 možností.']);
    expect([1, 3, 1000].map((limit) => problemText(i18n, { kind: 'tooLong', params: { limit } }))).toEqual([
      'Skráťte, prosím, odpoveď najviac na 1 znak.',
      'Skráťte, prosím, odpoveď najviac na 3 znaky.',
      'Skráťte, prosím, odpoveď najviac na 1000 znakov.',
    ]);
  });

  it('names "Other" by the label the page is showing, and by the problem’s own only when the option is gone', () => {
    const i18n = words('sk');
    const question = choice('single', ['A', 'Other']);
    const problem = answerProblem(question, { optionIds: [question.options[1].id], other: '', text: '' });
    expect(problemText(i18n, problem, question)).toBe('Pri možnosti „Other“ napíšte, prosím, vlastnú odpoveď.');

    // The same question as the page shows it in another language: the same option, another label.
    const shown = { ...question, options: question.options.map((option) => (option.other ? { ...option, label: 'Iné' } : option)) };
    expect(problemText(i18n, problem, shown)).toBe('Pri možnosti „Iné“ napíšte, prosím, vlastnú odpoveď.');

    expect(problemText(i18n, problem, { ...question, options: [question.options[0]] })).toBe('Pri možnosti „Other“ napíšte, prosím, vlastnú odpoveď.');
    expect(problemText(i18n, problem)).toBe('Pri možnosti „Other“ napíšte, prosím, vlastnú odpoveď.');
  });

  it('puts a label in as it is: what it holds is never read as a placeholder', () => {
    expect(problemText(words('en'), { kind: 'writeOther', params: { optionId: 'o1', label: '{count} {label}' } })).toBe('Please write what "{count} {label}" is for you.');
  });
});

describe('a kind nobody listed', () => {
  it('is worded with the fallback - never with a key made from the kind', () => {
    const i18n = words('sk');
    expect(problemText(i18n, { kind: 'constructor', params: {} })).toBe('Skontrolujte, prosím, túto odpoveď.');
    expect(problemText(KEYS, { kind: 'tooShort', params: { limit: 3 } })).toBe('take.invalidAnswer');
    expect(ruleText(KEYS, { kind: 'toString', params: {} })).toBe('take.invalidAnswer');
  });

  it('is what a family without its number is, too', () => {
    expect(problemText(KEYS, { kind: 'tooLong', params: {} })).toBe('take.invalidAnswer');
    expect(ruleText(KEYS, { kind: 'upTo', params: { max: 'three' } })).toBe('take.invalidAnswer');
    expect(ruleText(KEYS, { kind: 'upTo', params: { max: Number.NaN } })).toBe('take.invalidAnswer');
  });
});

describe('the keys of the rules and the problems', () => {
  /** "answer.rule.upTo #3" -> "upTo": the last segment of the key that was asked for. */
  const tail = (answered: string, prefix: string): string => answered.split(' ')[0].slice(prefix.length);

  it('are the ones the key scan is told about - one per kind', () => {
    expect(RULES.map((rule) => tail(ruleText(KEYS, rule), 'answer.rule.'))).toEqual(DYNAMIC_KEYS['answer.rule.']);
    expect(PROBLEMS.map((problem) => tail(problemText(KEYS, problem), 'answer.problem.'))).toEqual(DYNAMIC_KEYS['answer.problem.']);
    expect(RULES.map((rule) => rule.kind)).toEqual(DYNAMIC_KEYS['answer.rule.']);
    expect(PROBLEMS.map((problem) => problem.kind)).toEqual(DYNAMIC_KEYS['answer.problem.']);
  });

  it('are a plural family exactly where the kind has a number', () => {
    const counted = (answered: string): boolean => answered.includes(' #');
    expect(RULES.filter((rule) => counted(ruleText(KEYS, rule))).map((rule) => rule.kind)).toEqual(['atLeast', 'upTo', 'exactly', 'between']);
    expect(PROBLEMS.filter((problem) => counted(problemText(KEYS, problem))).map((problem) => problem.kind)).toEqual(['chooseAtLeast', 'tooLong', 'chooseAtMost']);
  });
});
