import { Answer, Question } from './survey.model';

/**
 * What counts as an answer, and when an answer is not good enough - the rules
 * the survey checks before it moves to the next step, and the server checks
 * again before it keeps anything (backend/api/survey_rules.php: answerProblem,
 * answerClean - in the same words).
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

/** The line under a question of several choices that says how many to pick. */
export function choiceRule(question: Question): string {
  if (question.type !== 'multiple') {
    return '';
  }
  const count = question.options.length;
  const { min, max } = choiceLimits(question);
  if (max >= count) {
    return min <= 1 ? 'Choose any that apply.' : `Choose at least ${min}.`;
  }
  if (min <= 1) {
    return `Choose up to ${max}.`;
  }
  return min === max ? `Choose ${min}.` : `Choose ${min} to ${max}.`;
}

/** Why an answer cannot be accepted, in words for the person answering - or null when it can. */
export function answerProblem(question: Question, answer: Answer | undefined): string | null {
  if (!isAnswered(question, answer)) {
    if (!question.required) {
      return null;
    }
    if (question.type === 'text') {
      return 'Please write an answer.';
    }
    const { min } = choiceLimits(question);
    if (min === 0) {
      return null;
    }
    return question.type === 'single' || min <= 1 ? 'Please choose an answer.' : `Please choose at least ${min}.`;
  }

  const given = answer as Answer;
  if (question.type === 'text') {
    const limit = Math.min(textLimit(question) ?? ANSWER_TEXT_MAX, ANSWER_TEXT_MAX);
    return given.text.trim().length > limit ? `Please keep it under ${limit} characters.` : null;
  }

  const chosen = question.options.filter((option) => given.optionIds.includes(option.id));
  const { min, max } = choiceLimits(question);
  if (chosen.length < min) {
    return `Please choose at least ${min}.`;
  }
  if (chosen.length > max) {
    return max === 1 ? 'Please choose only one.' : `Please choose at most ${max}.`;
  }
  const other = chosen.find((option) => option.other);
  if (other && given.other.trim() === '') {
    return `Please write what "${other.label}" is for you.`;
  }
  if (other && given.other.trim().length > ANSWER_OTHER_MAX) {
    return `Please keep it under ${ANSWER_OTHER_MAX} characters.`;
  }
  return null;
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
