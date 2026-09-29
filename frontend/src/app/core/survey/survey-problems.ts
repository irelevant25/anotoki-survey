import { isChoice } from './answer-rules';
import { isBlankHtml } from './plain-text';
import { RESERVED_SLUGS, slugify } from './survey-factory';
import { numberedQuestions } from './survey-outline';
import { Survey } from './survey.model';

/** Something that keeps a survey from being opened, and where it is. */
export interface SurveyProblem {
  message: string;
  /** What to scroll to and mark: a field of the survey itself, a step, a question. */
  target: { kind: 'survey'; field: 'title' | 'address' | 'questions' } | { kind: 'step'; stepId: string } | { kind: 'question'; questionId: string };
}

/**
 * What must be fixed before people can take the survey. The editor lists
 * these and will not open a survey that has any; a draft may have as many as
 * it likes while it is being written. The server checks the same before it
 * opens one (surveyProblems() in backend/api/survey_rules.php), in the same
 * words. `others`: the other surveys, for their addresses.
 */
export function surveyProblems(survey: Survey, others: readonly Pick<Survey, 'id' | 'slug'>[]): SurveyProblem[] {
  const problems: SurveyProblem[] = [];
  const title = { kind: 'survey', field: 'title' } as const;
  const address = { kind: 'survey', field: 'address' } as const;

  if (!survey.title.trim()) {
    problems.push({ message: 'The survey needs a title.', target: title });
  }
  if (!survey.slug || survey.slug !== slugify(survey.slug)) {
    problems.push({ message: 'The address may hold only small letters, digits and dashes.', target: address });
  } else if (RESERVED_SLUGS.has(survey.slug)) {
    problems.push({ message: `The address "${survey.slug}" belongs to the site itself - choose another.`, target: address });
  } else if (others.some((other) => other.id !== survey.id && other.slug === survey.slug)) {
    problems.push({ message: `Another survey already lives at "${survey.slug}".`, target: address });
  }

  const questions = numberedQuestions(survey);
  if (questions.length === 0) {
    problems.push({ message: 'Add at least one question.', target: { kind: 'survey', field: 'questions' } });
  }
  // Steps are numbered as people see them: "About you", when asked, is step 1.
  const firstStep = survey.askAboutYou ? 2 : 1;
  survey.steps.forEach((step, index) => {
    if (step.questions.length === 0) {
      problems.push({ message: `Step ${index + firstStep} has no questions - add one, or remove the step.`, target: { kind: 'step', stepId: step.id } });
    }
  });

  for (const { question, number } of questions) {
    const target = { kind: 'question', questionId: question.id } as const;
    const name = `Question ${number}`;
    if (isBlankHtml(question.text)) {
      problems.push({ message: `${name} has no text.`, target });
    }
    if (!isChoice(question)) {
      if (question.maxLength !== null && question.maxLength < 1) {
        problems.push({ message: `${name}: the longest answer must be at least one character.`, target });
      }
      continue;
    }

    const options = question.options;
    if (options.length < 2) {
      problems.push({ message: `${name} needs at least two options.`, target });
    }
    if (options.some((option) => !option.label.trim())) {
      problems.push({ message: `${name} has an option with no label.`, target });
    }
    const seen = new Set<string>();
    for (const option of options) {
      const key = option.label.trim().toLowerCase();
      if (key && seen.has(key)) {
        problems.push({ message: `${name} has two options called "${option.label.trim()}".`, target });
        break;
      }
      seen.add(key);
    }

    if (question.type === 'multiple') {
      const { minChoices: min, maxChoices: max } = question;
      if (min !== null && (min < 0 || !Number.isInteger(min))) {
        problems.push({ message: `${name}: "at least" must be a whole number, 0 or more.`, target });
      }
      if (max !== null && (max < 1 || !Number.isInteger(max))) {
        problems.push({ message: `${name}: "at most" must be a whole number, 1 or more.`, target });
      }
      if (min !== null && max !== null && min > max) {
        problems.push({ message: `${name} asks for at least ${min} but at most ${max}.`, target });
      }
      if (min !== null && min > options.length) {
        problems.push({ message: `${name} asks for at least ${min} but has only ${options.length} options.`, target });
      }
    }
  }

  return problems;
}
