import { AgeKey, GenderKey } from './about-you';

/**
 * A survey as the editor makes it and people take it - the shape the API
 * sends and takes (backend/api/surveys.php): a survey has steps, a step has
 * questions, a choice question has options.
 *
 * Every id is made once and never reused, so an answer keeps pointing at its
 * option when the editor renames it, reorders it, or moves its question to
 * another step.
 */

export type SurveyStatus = 'draft' | 'open' | 'closed';

/** One choice (radio buttons), several choices (checkboxes), or the person's own words. */
export type QuestionType = 'single' | 'multiple' | 'text';

/** How the options of a choice question are laid out: a list, two columns, or a scale in a row. */
export type ChoiceLayout = 'list' | 'columns' | 'scale';

/**
 * A picture under a question or on an option. The file itself is kept apart
 * from the survey, which holds only this: the file's id, what it shows, its
 * size - enough to lay the page out before the picture has loaded - and where
 * the site serves it. The server measures the file and sets the address; the
 * editor only writes what it shows.
 */
export interface SurveyImage {
  id: string;
  /** What the picture shows, for people who cannot see it. Empty where the words beside it say it. */
  alt: string;
  width: number;
  height: number;
  /** /api/images/{id}.{ext}: never changes, so browsers keep it. */
  src: string;
}

export interface ChoiceOption {
  id: string;
  label: string;
  /** "Other": choosing it opens a field for the person's own answer. */
  other: boolean;
  /** Pictures on the option's card; its label says what they show. */
  images: SurveyImage[];
}

/**
 * One question. The fields of every type are always there, so switching a
 * question from one choice to several and back keeps its options; each type
 * reads only its own.
 */
export interface Question {
  id: string;
  type: QuestionType;
  /** The question itself: HTML from the editor. */
  text: string;
  /** Pictures under the question's text, in order. */
  images: SurveyImage[];
  /** An optional question may be left empty; the limits below apply once it is answered. */
  required: boolean;

  /** Choice questions: the options, in order. */
  options: ChoiceOption[];
  layout: ChoiceLayout;
  /** Several choices: the fewest and the most a person may pick; null for no limit. */
  minChoices: number | null;
  maxChoices: number | null;

  /** Text questions: a box for a few sentences, or one line. */
  multiline: boolean;
  maxLength: number | null;
  placeholder: string;
}

export interface Step {
  id: string;
  /** Shown above the step's questions, and in the progress; may be empty. */
  title: string;
  questions: Question[];
}

/** A step's title in another language. */
export interface StepTranslation {
  title: string;
}

/**
 * A question's texts in another language. The options and the pictures under
 * the question's text are found by their ids; an option's own pictures have
 * no description, so nothing of theirs is here.
 */
export interface QuestionTranslation {
  /** HTML, like the question's own text. */
  text: string;
  placeholder: string;
  options: Record<string, { label: string }>;
  /** What each picture under the question's text shows; the same picture twice shares one description. */
  images: Record<string, { alt: string }>;
}

/**
 * A survey's texts in one more language, each found by the id of what it
 * belongs to - so the structure, the pictures and the limits stay the
 * survey's own, and an answer means the same whichever language it was read
 * in. A text that is not translated yet is empty (or has no entry).
 *
 * The maps are only ever read, and written by spreading into a new object
 * (core/survey/localize.ts has the functions).
 */
export interface SurveyTranslation {
  title: string;
  /** The welcome screen: HTML. */
  intro: string;
  /** The thank-you screen: HTML. */
  thanks: string;
  /** By step id. */
  steps: Record<string, StepTranslation>;
  /** By question id. */
  questions: Record<string, QuestionTranslation>;
}

export interface Survey {
  id: string;
  /** The survey's address: survey.anotoki.eu/{slug}. */
  slug: string;
  title: string;
  /** The welcome screen: HTML. */
  intro: string;
  /** The thank-you screen: HTML. */
  thanks: string;
  /** Gender and age, asked on a step of their own before the first. */
  askAboutYou: boolean;
  status: SurveyStatus;
  /** An open survey closes by itself after this day (YYYY-MM-DD), if set. */
  closesOn: string | null;
  steps: Step[];
  /** The language the survey is written in: the texts of the document itself. */
  language: string;
  /** The same texts in other languages, by language code. */
  translations: Record<string, SurveyTranslation>;
  createdAt: string;
  updatedAt: string;
  openedAt: string | null;
  closedAt: string | null;
  /**
   * How many times it has been saved. A save names the revision it was made
   * to, and the server refuses one made to an older revision than it has -
   * somebody else's save in between is never silently undone.
   */
  revision: number;
}

/** A survey without its questions: the list of surveys, and the addresses the editor checks against. */
export interface SurveySummary {
  id: string;
  slug: string;
  title: string;
  status: SurveyStatus;
  closesOn: string | null;
  createdAt: string;
  updatedAt: string;
  openedAt: string | null;
  closedAt: string | null;
  revision: number;
  steps: number;
  questions: number;
  responses: number;
}

/** A person's answer to one question. */
export interface Answer {
  /** The chosen options: one for a single choice, any number for several. */
  optionIds: string[];
  /** What the person wrote for "Other". */
  other: string;
  /** A text question's answer. */
  text: string;
}

/**
 * Who took a survey: their anotoki account - the IAM's user id and name (the
 * IAM's placeholder, deleted-{id}, once it deleted the account; no address:
 * the IAM keeps people's addresses, this site none) - or a visitor who
 * answered without signing in (while the IAM says sign-in is not required): a
 * negative id, "Visitor 12".
 */
export interface Person {
  id: string;
  name: string;
  /** Answered without signing in: the admin panel says "Not signed in" under the name. */
  visitor?: boolean;
}

export interface AboutYou {
  gender: GenderKey;
  age: AgeKey;
}

/** One person's filled survey. There is at most one per person and survey. */
export interface SurveyResponse {
  id: string;
  surveyId: string;
  person: Person;
  /** Null when the survey does not ask. */
  aboutYou: AboutYou | null;
  /** By question id. A question left unanswered has no entry. */
  answers: Record<string, Answer>;
  /**
   * The language the survey's texts were shown in when the answers were sent
   * (what localizedSurvey() reported): the survey's own, or one of its
   * translations. Always said: the page taking the survey sets it on the
   * answers it puts together, and the server sends what it kept. Null when
   * that is nothing - answers from before surveys had languages, or sent with
   * a language the survey does not have.
   */
  language: string | null;
  startedAt: string;
  submittedAt: string;
}
