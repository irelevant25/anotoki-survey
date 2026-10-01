import { AGES, AGE_ID, AGE_QUESTION, GENDERS, GENDER_ID, GENDER_QUESTION } from './about-you';
import { escapeHtml } from './plain-text';
import { Question } from './survey.model';

/**
 * One of the two as a question of one choice. `text` is words, not HTML: it is
 * escaped before it is wrapped, because a question's text is drawn with
 * `[innerHTML]`. The labels stay words - an option's label is drawn as text.
 */
function fixedQuestion(id: string, text: string, options: readonly { key: string; label: string }[]): Question {
  return {
    id,
    type: 'single',
    text: `<p>${escapeHtml(text)}</p>`,
    images: [],
    required: true,
    options: options.map((option) => ({ id: option.key, label: option.label, other: false, images: [] })),
    layout: 'columns',
    minChoices: null,
    maxChoices: null,
    multiline: false,
    maxLength: null,
    placeholder: '',
  };
}

/**
 * Gender and age as two ordinary questions of one choice, so the survey, the
 * editor's preview and the results draw them like any other. Their ids are
 * GENDER_ID and AGE_ID, and their options' ids are the keys in about-you.ts.
 *
 * In English, for the admin area: the results, the CSV, the editor and a
 * response's page read this one. The page a person answers on words its own -
 * aboutYouQuestions().
 */
export const ABOUT_YOU_QUESTIONS: readonly Question[] = [fixedQuestion(GENDER_ID, GENDER_QUESTION, GENDERS), fixedQuestion(AGE_ID, AGE_QUESTION, AGES)];

/**
 * The same two questions in the reader's language, for the page a person
 * answers on. `word` gives the string of a key (the translation service's
 * t()); the keys are `aboutYou.genderQuestion`, `aboutYou.ageQuestion` and one
 * per answer, `aboutYou.gender.<key>` and `aboutYou.age.<key>` - the keys of
 * GENDERS and AGES, a closed set, listed in core/i18n/dynamic-keys.ts.
 *
 * Only the words differ from ABOUT_YOU_QUESTIONS: the ids and the options'
 * ids are the same, so an answer given in one language is the same answer in
 * another.
 */
export function aboutYouQuestions(word: (key: string) => string): Question[] {
  return [
    fixedQuestion(
      GENDER_ID,
      word('aboutYou.genderQuestion'),
      GENDERS.map((gender) => ({ key: gender.key, label: word('aboutYou.gender.' + gender.key) })),
    ),
    fixedQuestion(
      AGE_ID,
      word('aboutYou.ageQuestion'),
      AGES.map((age) => ({ key: age.key, label: word('aboutYou.age.' + age.key) })),
    ),
  ];
}
