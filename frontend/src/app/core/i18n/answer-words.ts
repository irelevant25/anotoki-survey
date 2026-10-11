import { TranslationService } from '@anotoki/lib/translations';
import { Question } from '../survey/survey.model';

/**
 * A rule ("choose up to 3") and a problem ("please choose an answer") in the
 * reader's language, for the page a person answers on.
 *
 * core/survey/answer-rules.ts says them as a kind and its numbers; here is the
 * one table from a kind to its key, and to the number its sentence is counted
 * by. Every kind with a number is a plural family on that number - in Slovak
 * the noun follows it ("1 možnosť", "3 možnosti", "5 možností") even where
 * English has one form - and inside a family the number is `{count}`, whatever
 * the rule calls it. `between` is counted by its most, with `{min}` beside it.
 *
 * A kind this table does not know is worded with FALLBACK - never with a key
 * made from the kind. The keys are also listed in dynamic-keys.ts.
 *
 * The admin area does not come here: it quotes the English of
 * choiceRuleText() and answerProblemText().
 */

/** What is said of an answer when nothing more exact can be. */
const FALLBACK = 'take.invalidAnswer';

interface Wording {
  key: string;
  /** The parameter that is the family's number; without one the key is a single string. */
  counted?: string;
}

const RULES = new Map<string, Wording>([
  ['any', { key: 'answer.rule.any' }],
  ['atLeast', { key: 'answer.rule.atLeast', counted: 'min' }],
  ['upTo', { key: 'answer.rule.upTo', counted: 'max' }],
  ['exactly', { key: 'answer.rule.exactly', counted: 'count' }],
  ['between', { key: 'answer.rule.between', counted: 'max' }],
]);

const PROBLEMS = new Map<string, Wording>([
  ['write', { key: 'answer.problem.write' }],
  ['choose', { key: 'answer.problem.choose' }],
  ['chooseAtLeast', { key: 'answer.problem.chooseAtLeast', counted: 'min' }],
  ['tooLong', { key: 'answer.problem.tooLong', counted: 'limit' }],
  ['chooseOne', { key: 'answer.problem.chooseOne' }],
  ['chooseAtMost', { key: 'answer.problem.chooseAtMost', counted: 'max' }],
  ['writeOther', { key: 'answer.problem.writeOther' }],
]);

/** What wording needs of the translation service. */
export type AnswerWords = Pick<TranslationService, 't' | 'plural'>;

/** A rule or a problem as answer-rules.ts returns it: ChoiceRule and AnswerProblem both fit. */
export interface Worded {
  kind: string;
  params: Readonly<Record<string, unknown>>;
}

/** The line under a question of several choices - nothing for no rule. */
export function ruleText(i18n: AnswerWords, rule: Worded | null): string {
  return rule ? worded(i18n, RULES.get(rule.kind), rule.params) : '';
}

/**
 * Why an answer cannot be accepted - nothing for no problem.
 *
 * `question` is the question as the page shows it: a "write what Other is"
 * problem names the option by its id, and is worded with the label that is on
 * the page now - the problem's own label only when the option is gone.
 */
export function problemText(i18n: AnswerWords, problem: Worded | null, question?: Pick<Question, 'options'>): string {
  if (!problem) {
    return '';
  }
  if (problem.kind !== 'writeOther') {
    return worded(i18n, PROBLEMS.get(problem.kind), problem.params);
  }
  const shown = question?.options.find((option) => option.id === problem.params['optionId']);
  return worded(i18n, PROBLEMS.get(problem.kind), { ...problem.params, label: shown?.label ?? problem.params['label'] });
}

function worded(i18n: AnswerWords, wording: Wording | undefined, params: Readonly<Record<string, unknown>>): string {
  if (!wording) {
    return i18n.t(FALLBACK);
  }
  const placeholders: Record<string, string | number> = {};
  for (const [name, value] of Object.entries(params)) {
    if (typeof value === 'string' || typeof value === 'number') {
      placeholders[name] = value;
    }
  }
  if (wording.counted === undefined) {
    return i18n.t(wording.key, placeholders);
  }
  const count = params[wording.counted];
  // A family without its number cannot be said: the fallback, not a sentence with a hole in it.
  return typeof count === 'number' && Number.isFinite(count) ? i18n.plural(wording.key, count, placeholders) : i18n.t(FALLBACK);
}
