import { foldText } from '@anotoki/lib/ui/search';
import { ChoiceOption, Question, QuestionTranslation, QuestionType, Step, StepTranslation, Survey, SurveyTranslation } from './survey.model';

/** A new id: random, so two editors (or two tabs) never make the same one. */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export function newOption(label = '', other = false): ChoiceOption {
  return { id: newId(), label, other, images: [] };
}

/**
 * A question of the given type, ready to be written: two empty options for a
 * choice. A choice starts required and "own words" optional - the way most
 * surveys ask them: everybody can pick, not everybody has something to say.
 */
export function newQuestion(type: QuestionType): Question {
  return {
    id: newId(),
    type,
    text: '',
    images: [],
    required: type !== 'text',
    options: type === 'text' ? [] : [newOption(), newOption()],
    layout: 'list',
    minChoices: null,
    maxChoices: null,
    multiline: true,
    maxLength: null,
    placeholder: '',
  };
}

/** A step with nothing in it yet: no text of its own, no pictures, no questions. */
export function newStep(title = ''): Step {
  return { id: newId(), title, text: '', images: [], questions: [] };
}

/**
 * A new draft: one step with one question, and the usual welcome and thank-you
 * words - in English, so that is the language it starts in, translated into
 * no other yet. Its id and times are placeholders until the server keeps it
 * and answers with its own (revision 0: never saved).
 */
export function newSurvey(takenSlugs: Iterable<string>, now = new Date()): Survey {
  const time = now.toISOString();
  const step = newStep();
  step.questions.push(newQuestion('single'));
  return {
    id: newId(),
    slug: uniqueSlug('new-survey', takenSlugs),
    title: 'New survey',
    intro: '<p>Thank you for taking a few minutes to tell us what you think.</p>',
    thanks: '<p>Thank you! Your answers are on their way to us, and we read every one of them.</p>',
    askAboutYou: true,
    status: 'draft',
    closesOn: null,
    steps: [step],
    language: 'en',
    translations: {},
    createdAt: time,
    updatedAt: time,
    openedAt: null,
    closedAt: null,
    revision: 0,
  };
}

/**
 * Which new id each old one got when a question was copied: the question's
 * own, and each of its options' (old id -> new id). Picture ids do not
 * change. The options are the question's own map: two questions may well use
 * the same option ids.
 */
export interface CopiedQuestionIds {
  from: string;
  to: string;
  options: ReadonlyMap<string, string>;
}

/**
 * The same question with new ids - its own and its options' - and which id
 * became which, for whatever points at them (the translations). The pictures
 * are shared, not copied: a picture never changes once added, so two
 * questions may show the same file.
 */
export function copyQuestion(question: Question): { question: Question; ids: CopiedQuestionIds } {
  const id = newId();
  const optionIds = new Map<string, string>();
  const options = question.options.map((option) => {
    const copy = { ...option, id: newId(), images: [...option.images] };
    optionIds.set(option.id, copy.id);
    return copy;
  });
  return { question: { ...question, id, images: [...question.images], options }, ids: { from: question.id, to: id, options: optionIds } };
}

/** A question's translated texts for its copy: the same words, the options under their new ids. */
function copyQuestionTranslation(entry: QuestionTranslation, ids: CopiedQuestionIds): QuestionTranslation {
  return { ...entry, options: rekeyed(entry.options, ids.options), images: { ...entry.images } };
}

/** The entries of a map under their new ids; what has no new id is left behind. */
function rekeyed<T>(map: Record<string, T> | null | undefined, ids: ReadonlyMap<string, string>): Record<string, T> {
  const entries: [string, T][] = [];
  for (const [from, to] of ids) {
    if (map && Object.hasOwn(map, from)) {
      entries.push([to, map[from]]);
    }
  }
  return Object.fromEntries(entries);
}

/**
 * The survey with a copy of one of its questions right after the original,
 * the copy's texts in every translation with it (under the copy's new ids).
 * The editor's "Duplicate", through AdminStore.updateSurvey(). A survey that
 * has no such question in that step comes back as it came.
 */
export function duplicateQuestion(survey: Survey, stepId: string, questionId: string): Survey {
  const original = survey.steps.find((step) => step.id === stepId)?.questions.find((question) => question.id === questionId);
  if (!original) {
    return survey;
  }
  const { question, ids } = copyQuestion(original);
  const steps = survey.steps.map((step) => {
    if (step.id !== stepId) {
      return step;
    }
    const questions = [...step.questions];
    questions.splice(questions.indexOf(original) + 1, 0, question);
    return { ...step, questions };
  });
  const translations = Object.entries(survey.translations ?? {}).map(([code, translation]): [string, SurveyTranslation] => {
    const entry = translation.questions && Object.hasOwn(translation.questions, ids.from) ? translation.questions[ids.from] : undefined;
    return [code, entry ? { ...translation, questions: { ...translation.questions, [ids.to]: copyQuestionTranslation(entry, ids) } } : translation];
  });
  return { ...survey, steps, translations: Object.fromEntries(translations) };
}

/**
 * A new draft with everything the survey asks and says - in every language
 * it is translated into - and none of its answers. Every step, question and
 * option gets a new id, and the translations follow them there: a step's
 * title, its own text and what its pictures show, as a question's texts. The
 * pictures are shared, like a copied question's - a step's too; the server
 * keeps the copy under an id of its own.
 *
 * The copy's title is a new one ("Copy of ..."), so no translation has a
 * title for it yet: each starts with none, and says so as a text still to
 * translate - or the copy would open to readers of another language under
 * the original's name.
 */
export function copySurvey(survey: Survey, takenSlugs: Iterable<string>, now = new Date()): Survey {
  const time = now.toISOString();
  const stepIds = new Map<string, string>();
  const questionIds: CopiedQuestionIds[] = [];
  const steps = survey.steps.map((step) => {
    const id = newId();
    stepIds.set(step.id, id);
    const questions = step.questions.map((question) => {
      const copy = copyQuestion(question);
      questionIds.push(copy.ids);
      return copy.question;
    });
    return { ...step, id, images: [...step.images], questions };
  });
  const translations = Object.entries(survey.translations ?? {}).map(([code, translation]): [string, SurveyTranslation] => {
    const questions: [string, QuestionTranslation][] = [];
    for (const ids of questionIds) {
      if (translation.questions && Object.hasOwn(translation.questions, ids.from)) {
        questions.push([ids.to, copyQuestionTranslation(translation.questions[ids.from], ids)]);
      }
    }
    // A step's entry under its new id, its pictures' descriptions a map of its own (the picture ids stay).
    const steps = Object.entries(rekeyed(translation.steps, stepIds)).map(([id, entry]): [string, StepTranslation] => [id, { ...entry, images: { ...entry.images } }]);
    return [code, { ...translation, title: '', steps: Object.fromEntries(steps), questions: Object.fromEntries(questions) }];
  });
  return {
    ...survey,
    id: newId(),
    slug: uniqueSlug(survey.slug + '-copy', takenSlugs),
    title: 'Copy of ' + survey.title,
    status: 'draft',
    steps,
    translations: Object.fromEntries(translations),
    createdAt: time,
    updatedAt: time,
    openedAt: null,
    closedAt: null,
    revision: 0,
  };
}

/**
 * Addresses the site keeps for itself. A survey lives at /{slug}, so a slug
 * must never be one of the site's own paths - the legal pages' (terms,
 * privacy, contact) and the About and Support pages' (about, support) among
 * them, which the router matches first, and the administrators' way in while
 * the site is closed for maintenance (staff). The server
 * keeps the same list, in the same order (SURVEY_RESERVED_SLUGS in
 * backend/api/survey_rules.php; tests/unit/rules.test.php holds them together).
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  'admin',
  'preview',
  'api',
  'auth',
  'setup',
  'setup-php',
  'assets',
  'media',
  'changelog',
  'login',
  'logout',
  'account',
  'terms',
  'privacy',
  'contact',
  'about',
  'support',
  'staff',
]);

/** The longest address: long enough for any title's gist, short enough to share. */
export const SLUG_MAX = 60;

/**
 * "Genshin 1.0 — what's next?" → "genshin-1-0-whats-next": folded as every
 * anotoki site folds a text (the library's foldText(): no accents or marks,
 * lower case, "Łódź" → "lodz", "Straße" → "strasse"), then letters, digits and
 * dashes.
 */
export function slugify(text: string): string {
  return foldText(text)
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX)
    .replace(/-+$/g, '');
}

/**
 * `base`, or `base-2`, `base-3`… - the first one no other survey and no page
 * of the site has. The number replaces the end of a long base rather than
 * pushing it past the longest address.
 */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  const root = slugify(base) || 'survey';
  let slug = root;
  for (let n = 2; used.has(slug) || RESERVED_SLUGS.has(slug); n++) {
    const suffix = `-${n}`;
    slug = root.slice(0, SLUG_MAX - suffix.length).replace(/-+$/g, '') + suffix;
  }
  return slug;
}
