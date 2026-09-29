/**
 * Gender and age: the two questions a survey can ask on a step of its own
 * before the first ("About you").
 *
 * They are fixed rather than written per survey, so that the answers mean the
 * same in every survey and the results can be compared from one to the next.
 * Age is a range, not a number: enough to tell the groups apart without
 * asking anybody for more than that.
 */

export const GENDERS = [
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'non-binary', label: 'Non-binary' },
  { key: 'undisclosed', label: 'Prefer not to say' },
] as const;

export const AGES = [
  { key: 'under-18', label: 'Under 18' },
  { key: '18-24', label: '18–24' },
  { key: '25-34', label: '25–34' },
  { key: '35-44', label: '35–44' },
  { key: '45-plus', label: '45 or older' },
  { key: 'undisclosed', label: 'Prefer not to say' },
] as const;

export type GenderKey = (typeof GENDERS)[number]['key'];
export type AgeKey = (typeof AGES)[number]['key'];

export const GENDER_QUESTION = 'What is your gender?';
export const AGE_QUESTION = 'How old are you?';

/** The ids the results use for the two questions, beside the survey's own question ids. */
export const GENDER_ID = 'about-gender';
export const AGE_ID = 'about-age';

export function genderLabel(key: string): string {
  return GENDERS.find((gender) => gender.key === key)?.label ?? key;
}

export function ageLabel(key: string): string {
  return AGES.find((age) => age.key === key)?.label ?? key;
}

export function isGenderKey(key: string): key is GenderKey {
  return GENDERS.some((gender) => gender.key === key);
}

export function isAgeKey(key: string): key is AgeKey {
  return AGES.some((age) => age.key === key);
}
