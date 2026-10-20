import { isBlankHtml } from './plain-text';
import { Question, Step, Survey, SurveyStatus } from './survey.model';

/**
 * The step has something of its own to show: a text with words in it, or a
 * picture - above its questions, or alone (a task to read and do, left with
 * Next).
 */
export function stepHasContent(step: Pick<Step, 'text' | 'images'>): boolean {
  return !isBlankHtml(step.text) || step.images.length > 0;
}

/**
 * A step with nothing in it for anybody: no question, and no text or picture
 * of its own - surveyStepIsEmpty() in backend/api/survey_rules.php. It keeps
 * the survey from opening (survey-problems.ts).
 */
export function stepIsEmpty(step: Step): boolean {
  return step.questions.length === 0 && !stepHasContent(step);
}

/** A question with where it stands: its step, and its number in the whole survey. */
export interface NumberedQuestion {
  question: Question;
  step: Step;
  stepIndex: number;
  /** 1, 2, 3… across all steps - the number people see before the question. */
  number: number;
}

/** Every question of the survey in order, numbered straight through the steps. */
export function numberedQuestions(survey: Survey): NumberedQuestion[] {
  const list: NumberedQuestion[] = [];
  survey.steps.forEach((step, stepIndex) => {
    for (const question of step.questions) {
      list.push({ question, step, stepIndex, number: list.length + 1 });
    }
  });
  return list;
}

export function questionCount(survey: Survey): number {
  return survey.steps.reduce((sum, step) => sum + step.questions.length, 0);
}

/**
 * About how long the survey takes, in minutes: a quarter of a minute for a
 * choice, a minute for something to write, half a minute for gender and age.
 */
export function estimatedMinutes(survey: Survey): number {
  let seconds = survey.askAboutYou ? 30 : 0;
  for (const step of survey.steps) {
    for (const question of step.questions) {
      seconds += question.type === 'text' ? 60 : 15;
    }
  }
  return Math.max(1, Math.round(seconds / 60));
}

/**
 * The status as people meet it: an open survey whose last day has passed is
 * closed, even before anybody has pressed "Close". (The server goes by the
 * last place on Earth where the day is not over yet, so nobody the page
 * still lets in is turned away.)
 */
export function currentStatus(survey: Pick<Survey, 'status' | 'closesOn'>, now = new Date()): SurveyStatus {
  if (survey.status === 'open' && survey.closesOn && now.getTime() > endOfDay(survey.closesOn).getTime()) {
    return 'closed';
  }
  return survey.status;
}

/** The last moment of a YYYY-MM-DD day, in the reader's own time zone. */
export function endOfDay(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, (month ?? 1) - 1, date ?? 1, 23, 59, 59, 999);
}
