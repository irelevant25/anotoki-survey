import { ChoiceOption, Question, QuestionType, Step, Survey } from './survey.model';

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

export function newStep(title = ''): Step {
  return { id: newId(), title, questions: [] };
}

/**
 * A new draft: one step with one question, and the usual welcome and thank-you
 * words. Its id and times are placeholders until the server keeps it and
 * answers with its own (revision 0: never saved).
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
    createdAt: time,
    updatedAt: time,
    openedAt: null,
    closedAt: null,
    revision: 0,
  };
}

/**
 * The same question with new ids - its own and its options'. The pictures are
 * shared, not copied: a picture never changes once added, so two questions
 * may show the same file.
 */
export function copyQuestion(question: Question): Question {
  return {
    ...question,
    id: newId(),
    images: [...question.images],
    options: question.options.map((option) => ({ ...option, id: newId(), images: [...option.images] })),
  };
}

/**
 * A new draft with everything the survey asks, and none of its answers. The
 * pictures are shared, like a copied question's; the server keeps the copy
 * under an id of its own.
 */
export function copySurvey(survey: Survey, takenSlugs: Iterable<string>, now = new Date()): Survey {
  const time = now.toISOString();
  return {
    ...survey,
    id: newId(),
    slug: uniqueSlug(survey.slug + '-copy', takenSlugs),
    title: 'Copy of ' + survey.title,
    status: 'draft',
    steps: survey.steps.map((step) => ({ ...step, id: newId(), questions: step.questions.map(copyQuestion) })),
    createdAt: time,
    updatedAt: time,
    openedAt: null,
    closedAt: null,
    revision: 0,
  };
}

/**
 * Addresses the site keeps for itself. A survey lives at /{slug}, so a slug
 * must never be one of the site's own paths. The server keeps the same list
 * (SURVEY_RESERVED_SLUGS in backend/api/survey_rules.php).
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set(['admin', 'preview', 'api', 'auth', 'setup', 'setup-php', 'assets', 'media', 'changelog', 'login', 'logout', 'account']);

/** The longest address: long enough for any title's gist, short enough to share. */
export const SLUG_MAX = 60;

/** "Genshin 1.0 — what's next?" → "genshin-1-0-whats-next": lower case, no accents, dashes. */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
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
