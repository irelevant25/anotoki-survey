import { AGES, AGE_ID, AGE_QUESTION, GENDERS, GENDER_ID, GENDER_QUESTION } from './about-you';
import { Question } from './survey.model';

function fixedQuestion(id: string, text: string, options: readonly { key: string; label: string }[]): Question {
  return {
    id,
    type: 'single',
    text: `<p>${text}</p>`,
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
 */
export const ABOUT_YOU_QUESTIONS: readonly Question[] = [fixedQuestion(GENDER_ID, GENDER_QUESTION, GENDERS), fixedQuestion(AGE_ID, AGE_QUESTION, AGES)];
