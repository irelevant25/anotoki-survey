import { isChoice } from './answer-rules';
import { translatedText, translationGaps, translationOf } from './localize';
import { isBlankHtml } from './plain-text';
import { RESERVED_SLUGS, slugify } from './survey-factory';
import { numberedQuestions } from './survey-outline';
import { Survey, SurveyStatus } from './survey.model';

/** Something that keeps a survey from being opened, and where it is. */
export interface SurveyProblem {
  message: string;
  /**
   * What to scroll to and mark: a field of the survey itself, a step, a
   * question - and, for something missing from a translation, the language
   * it is missing in (the editor opens that language).
   */
  target: ({ kind: 'survey'; field: 'title' | 'address' | 'questions' | 'intro' | 'thanks' } | { kind: 'step'; stepId: string } | { kind: 'question'; questionId: string }) & { language?: string };
  /**
   * The problem is a text its translation (`target.language`) still lacks.
   * Such a problem does to an open survey what no other does: people who read
   * in that language are shown the survey whole in the language it is written
   * in (localizedSurvey, 'complete') until the text is there - the editor
   * says so. The page's own: the server sends sentences only.
   */
  untranslated?: true;
}

/** A language of the site, as the problems need it: its name in English, and whether people are offered it. */
export interface ProblemLanguage {
  code: string;
  name: string;
  enabled: boolean;
}

/**
 * What must be fixed before people can take the survey. The editor lists
 * these and will not open a survey that has any; a draft may have as many as
 * it likes while it is being written. The server checks the same before it
 * opens one (surveyProblems() in backend/api/survey_rules.php), in the same
 * words and the same order. `others`: the other surveys, for their
 * addresses. `languages`: every language the site has, in its order - a
 * translation into one people are offered must be whole, or they would be
 * shown the survey in its own language without anybody having meant it; one
 * into a hidden language may be as unfinished as it likes.
 */
export function surveyProblems(survey: Survey, others: readonly Pick<Survey, 'id' | 'slug'>[], languages: readonly ProblemLanguage[] = []): SurveyProblem[] {
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

  for (const language of languages) {
    if (language.enabled && language.code !== survey.language && translationOf(survey, language.code)) {
      problems.push(...translationProblems(survey, language, firstStep));
    }
  }

  return problems;
}

/**
 * What a translation still lacks, in the order of the document: the title,
 * the welcome, the thanks, then step by step its title and, question by
 * question, how many of its texts are left - one problem a question, however
 * many - and two options that would read the same.
 */
function translationProblems(survey: Survey, language: ProblemLanguage, firstStep: number): SurveyProblem[] {
  const problems: SurveyProblem[] = [];
  const code = language.code;
  const translation = translationOf(survey, code);

  const missing = new Set<string>();
  const texts = new Map<string, number>();
  for (const gap of translationGaps(survey, code)) {
    if (gap.kind === 'title' || gap.kind === 'intro' || gap.kind === 'thanks') {
      missing.add(gap.kind);
    } else if (gap.kind === 'step') {
      missing.add(`step ${gap.stepId}`);
    } else {
      texts.set(gap.questionId, (texts.get(gap.questionId) ?? 0) + 1);
    }
  }

  if (missing.has('title')) {
    problems.push({ message: `${language.name}: the title is missing.`, target: { kind: 'survey', field: 'title', language: code }, untranslated: true });
  }
  if (missing.has('intro')) {
    problems.push({ message: `${language.name}: the welcome text is missing.`, target: { kind: 'survey', field: 'intro', language: code }, untranslated: true });
  }
  if (missing.has('thanks')) {
    problems.push({ message: `${language.name}: the thank-you text is missing.`, target: { kind: 'survey', field: 'thanks', language: code }, untranslated: true });
  }

  let number = 0;
  survey.steps.forEach((step, index) => {
    if (missing.has(`step ${step.id}`)) {
      problems.push({ message: `${language.name}: the title of step ${index + firstStep} is missing.`, target: { kind: 'step', stepId: step.id, language: code }, untranslated: true });
    }
    for (const question of step.questions) {
      number++;
      const target = { kind: 'question', questionId: question.id, language: code } as const;
      const count = texts.get(question.id) ?? 0;
      if (count > 0) {
        problems.push({ message: `${language.name}: question ${number} has ${count === 1 ? '1 text' : `${count} texts`} to translate.`, target, untranslated: true });
      }
      if (!isChoice(question)) {
        continue;
      }
      const seen = new Set<string>();
      for (const option of question.options) {
        const label = translatedText(translation, { kind: 'option', questionId: question.id, optionId: option.id }).trim();
        const key = label.toLowerCase();
        if (key && seen.has(key)) {
          problems.push({ message: `${language.name}: question ${number} has two options called "${label}".`, target });
          break;
        }
        seen.add(key);
      }
    }
  });

  return problems;
}

/**
 * What the list of problems is called, by where the survey is - for the same
 * problems mean something else in each state. A draft's keep it from
 * opening; an open survey's are wrong with it now, while people take it (it
 * does not open, it is open); a closed one's keep it from being reopened.
 * `status` is the status as people meet it (currentStatus()): a survey whose
 * last day is over is closed. The editor's own words: the server has none
 * for this.
 */
export function problemsHeading(status: SurveyStatus, count: number): string {
  switch (status) {
    case 'open':
      return count ? `${count} to fix - the survey is open` : 'Nothing to fix';
    case 'closed':
      return count ? `${count} to fix before it reopens` : 'Ready to reopen';
    default:
      return count ? `${count} to fix before it opens` : 'Ready to open';
  }
}
