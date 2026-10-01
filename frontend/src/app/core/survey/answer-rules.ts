import { Answer, Question } from './survey.model';

/**
 * What counts as an answer, and when an answer is not good enough - the rules
 * the survey checks before it moves to the next step, and the server checks
 * again before it keeps anything (backend/api/survey_rules.php: answerProblem,
 * answerClean - in the same words).
 *
 * A rule and a problem are a kind and its numbers here, not a sentence: the
 * page a person answers on words them in that person's language
 * (core/i18n/answer-words.ts). The English sentences are choiceRuleText() and
 * answerProblemText(), for the admin area - and they are what keeps the pair
 * with the server: answerProblemText(answerProblem(...)) says what PHP's
 * answerProblem() says for the same case.
 */

/** The most anybody may write into one text answer, whatever the question allows; into "Other", less. */
export const ANSWER_TEXT_MAX = 10000;
export const ANSWER_OTHER_MAX = 1000;

/**
 * The words without control characters - a soft line break pasted from a word
 * processor, a form feed from a PDF - tabs and line breaks aside. The server
 * drops them too (textClean), rather than refusing an answer for them.
 */
export function withoutControls(text: string): string {
  return text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
}

export function emptyAnswer(): Answer {
  return { optionIds: [], other: '', text: '' };
}

export function isChoice(question: Question): boolean {
  return question.type === 'single' || question.type === 'multiple';
}

/** Something chosen, or something written. */
export function isAnswered(question: Question, answer: Answer | undefined): boolean {
  if (!answer) {
    return false;
  }
  // A choice counts only if the question still has it: the editor may have
  // removed an option since the person picked it.
  return isChoice(question) ? question.options.some((option) => answer.optionIds.includes(option.id)) : answer.text.trim() !== '';
}

/** The longest answer a text question takes, or null for no limit - a limit below one is no limit, or nobody could answer. */
export function textLimit(question: Question): number | null {
  return question.maxLength !== null && question.maxLength >= 1 ? question.maxLength : null;
}

/**
 * The fewest and the most options a person may pick, as the survey enforces
 * them: a single choice is one; several are bounded by the question's limits,
 * by the options there are, and - for a required question - by at least one.
 */
export function choiceLimits(question: Question): { min: number; max: number } {
  const count = question.options.length;
  // Nothing to choose from: nobody could answer it, so nobody has to. The
  // editor lists it as a problem; an open survey must not trap people on it.
  if (count === 0) {
    return { min: 0, max: 0 };
  }
  if (question.type === 'single') {
    return { min: question.required ? 1 : 0, max: 1 };
  }
  const max = Math.max(1, Math.min(question.maxChoices ?? count, count));
  const min = Math.min(Math.max(question.minChoices ?? 0, question.required ? 1 : 0), max);
  return { min, max };
}

/** How many to pick, as the line under a question of several choices says it: a kind and its numbers. */
export type ChoiceRule =
  | { kind: 'any'; params: Record<string, never> }
  | { kind: 'atLeast'; params: { min: number } }
  | { kind: 'upTo'; params: { max: number } }
  | { kind: 'exactly'; params: { count: number } }
  | { kind: 'between'; params: { min: number; max: number } };

/**
 * Why an answer cannot be accepted: a kind and what its sentence names.
 * `writeOther` carries the option's id - the page words it with the label it
 * is showing - and the label as it was when the answer was checked.
 */
export type AnswerProblem =
  | { kind: 'write'; params: Record<string, never> }
  | { kind: 'choose'; params: Record<string, never> }
  | { kind: 'chooseAtLeast'; params: { min: number } }
  | { kind: 'tooLong'; params: { limit: number } }
  | { kind: 'chooseOne'; params: Record<string, never> }
  | { kind: 'chooseAtMost'; params: { max: number } }
  | { kind: 'writeOther'; params: { optionId: string; label: string } };

/** How many to pick, for a question of several choices - null for any other question, which has no such line. */
export function choiceRule(question: Question): ChoiceRule | null {
  if (question.type !== 'multiple') {
    return null;
  }
  const count = question.options.length;
  const { min, max } = choiceLimits(question);
  if (max >= count) {
    return min <= 1 ? { kind: 'any', params: {} } : { kind: 'atLeast', params: { min } };
  }
  if (min <= 1) {
    return { kind: 'upTo', params: { max } };
  }
  return min === max ? { kind: 'exactly', params: { count: min } } : { kind: 'between', params: { min, max } };
}

/** The rule in English, as the editor quotes it ("People read: ...") - nothing for no rule. */
export function choiceRuleText(rule: ChoiceRule | null): string {
  if (!rule) {
    return '';
  }
  switch (rule.kind) {
    case 'any':
      return 'Choose any that apply.';
    case 'atLeast':
      return `Choose at least ${rule.params.min}.`;
    case 'upTo':
      return `Choose up to ${rule.params.max}.`;
    case 'exactly':
      return `Choose ${rule.params.count}.`;
    case 'between':
      return `Choose ${rule.params.min} to ${rule.params.max}.`;
  }
}

/** Why an answer cannot be accepted - or null when it can. */
export function answerProblem(question: Question, answer: Answer | undefined): AnswerProblem | null {
  if (!isAnswered(question, answer)) {
    if (!question.required) {
      return null;
    }
    if (question.type === 'text') {
      return { kind: 'write', params: {} };
    }
    const { min } = choiceLimits(question);
    if (min === 0) {
      return null;
    }
    return question.type === 'single' || min <= 1 ? { kind: 'choose', params: {} } : { kind: 'chooseAtLeast', params: { min } };
  }

  const given = answer as Answer;
  if (question.type === 'text') {
    const limit = Math.min(textLimit(question) ?? ANSWER_TEXT_MAX, ANSWER_TEXT_MAX);
    return given.text.trim().length > limit ? { kind: 'tooLong', params: { limit } } : null;
  }

  const chosen = question.options.filter((option) => given.optionIds.includes(option.id));
  const { min, max } = choiceLimits(question);
  if (chosen.length < min) {
    return { kind: 'chooseAtLeast', params: { min } };
  }
  if (chosen.length > max) {
    return max === 1 ? { kind: 'chooseOne', params: {} } : { kind: 'chooseAtMost', params: { max } };
  }
  const other = chosen.find((option) => option.other);
  if (other && given.other.trim() === '') {
    return { kind: 'writeOther', params: { optionId: other.id, label: other.label } };
  }
  if (other && given.other.trim().length > ANSWER_OTHER_MAX) {
    return { kind: 'tooLong', params: { limit: ANSWER_OTHER_MAX } };
  }
  return null;
}

/**
 * The problem in English, in the server's own words (answerProblem() in
 * backend/api/survey_rules.php) - or null for no problem.
 */
export function answerProblemText(problem: AnswerProblem | null): string | null {
  if (!problem) {
    return null;
  }
  switch (problem.kind) {
    case 'write':
      return 'Please write an answer.';
    case 'choose':
      return 'Please choose an answer.';
    case 'chooseAtLeast':
      return `Please choose at least ${problem.params.min}.`;
    case 'tooLong':
      return `Please keep it under ${problem.params.limit} characters.`;
    case 'chooseOne':
      return 'Please choose only one.';
    case 'chooseAtMost':
      return `Please choose at most ${problem.params.max}.`;
    case 'writeOther':
      return `Please write what "${problem.params.label}" is for you.`;
  }
}

/**
 * The answer as it is kept: only options the question still has, the "Other"
 * text only while "Other" is chosen, text trimmed - or null for nothing given.
 */
export function cleanAnswer(question: Question, answer: Answer | undefined): Answer | null {
  if (!answer || !isAnswered(question, answer)) {
    return null;
  }
  if (question.type === 'text') {
    return { optionIds: [], other: '', text: withoutControls(answer.text).trim() };
  }
  const optionIds = question.options.filter((option) => answer.optionIds.includes(option.id)).map((option) => option.id);
  const otherChosen = question.options.some((option) => option.other && optionIds.includes(option.id));
  return optionIds.length ? { optionIds, other: otherChosen ? withoutControls(answer.other).trim() : '', text: '' } : null;
}
