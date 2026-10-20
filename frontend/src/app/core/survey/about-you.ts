/**
 * Gender and age: the two questions a survey can ask on a step of its own
 * before the first ("About you").
 *
 * They are fixed rather than written per survey, so that the answers mean the
 * same in every survey and the results can be compared from one to the next.
 * Age is a range, not a number: enough to tell the groups apart without
 * asking anybody for more than that.
 *
 * The labels and the two questions here are English, for the admin area (the
 * results, the CSV, a response's page). The person answering reads them in
 * their own language: the keys below are the last segment of the translation
 * keys `aboutYou.gender.<key>` and `aboutYou.age.<key>` (aboutYouQuestions()
 * in about-you-questions.ts; the list in core/i18n/dynamic-keys.ts) - so a
 * key added or renamed here needs its strings, and the same on the server
 * (SURVEY_GENDERS, SURVEY_AGES).
 *
 * The gender question offered "Non-binary" too until the owner's decision of
 * 2026-10-20: it offers Male, Female and Prefer not to say. An answer sent
 * before keeps what it said - the server takes only the three in a new answer
 * and never rewrites a kept one - and the admin area shows a kept
 * "Non-binary" under its label: counted in the results, a filter of its own,
 * in a person's survey and the CSV. ALL_GENDERS is every answer the question
 * has had, in its order; GENDERS the ones it offers - the only ones with
 * strings, for only the page a person answers on says them.
 */

/** Every answer the gender question has had, in its order, and whether it offers it now. */
export const ALL_GENDERS = [
  { key: 'male', label: 'Male', offered: true },
  { key: 'female', label: 'Female', offered: true },
  { key: 'non-binary', label: 'Non-binary', offered: false },
  { key: 'undisclosed', label: 'Prefer not to say', offered: true },
] as const;

type Gender = (typeof ALL_GENDERS)[number];
type OfferedGender = Extract<Gender, { offered: true }>;

/** The answers the gender question offers - all a new answer may be - in its order. */
export const GENDERS: readonly OfferedGender[] = ALL_GENDERS.filter((gender): gender is OfferedGender => gender.offered);

export const AGES = [
  { key: 'under-18', label: 'Under 18' },
  { key: '18-24', label: '18–24' },
  { key: '25-34', label: '25–34' },
  { key: '35-44', label: '35–44' },
  { key: '45-plus', label: '45 or older' },
  { key: 'undisclosed', label: 'Prefer not to say' },
] as const;

/** What a kept answer may say: an answer the question offers, or one it offered before. */
export type GenderKey = Gender['key'];
/** What a new answer may say. */
export type OfferedGenderKey = OfferedGender['key'];
export type AgeKey = (typeof AGES)[number]['key'];

export const GENDER_QUESTION = 'What is your gender?';
export const AGE_QUESTION = 'How old are you?';

/** The ids the results use for the two questions, beside the survey's own question ids. */
export const GENDER_ID = 'about-gender';
export const AGE_ID = 'about-age';

/** A kept answer's label - one the question no longer offers too ("Non-binary"). */
export function genderLabel(key: string): string {
  return ALL_GENDERS.find((gender) => gender.key === key)?.label ?? key;
}

export function ageLabel(key: string): string {
  return AGES.find((age) => age.key === key)?.label ?? key;
}

/** Whether a new answer may say it: an answer the question offers now. */
export function isOfferedGender(key: string): key is OfferedGenderKey {
  return GENDERS.some((gender) => gender.key === key);
}

export function isAgeKey(key: string): key is AgeKey {
  return AGES.some((age) => age.key === key);
}
