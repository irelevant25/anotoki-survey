import { isChoice } from './answer-rules';
import { isBlankHtml } from './plain-text';
import { Question, QuestionTranslation, Step, StepTranslation, Survey, SurveyImage, SurveyTranslation } from './survey.model';

/**
 * A survey in more than one language: the document holds its texts in the
 * language it is written in, and `translations` holds the same texts in the
 * others, each found by the id of what it belongs to.
 *
 * Everything here is pure, and written again in PHP in the same order
 * (surveyTranslationGaps() and surveyTranslationsFromBody() in
 * backend/api/survey_rules.php): change one, change the other.
 *
 * The maps of a translation are only ever read, and written by spreading into
 * a new object - never by assigning into the one that came. They are read
 * through own(): an id may be any word, "constructor" too.
 */

/**
 * One text of a survey that a translation has words of its own for. A
 * step's: its title (`step`), its own text (`stepText`) and what a picture
 * under that text shows (`stepImage`); a question's: its text, its hint, an
 * option's label, what a picture under its text shows.
 */
export type TranslationPlace =
  | { kind: 'title' }
  | { kind: 'intro' }
  | { kind: 'thanks' }
  | { kind: 'step'; stepId: string }
  | { kind: 'stepText'; stepId: string }
  | { kind: 'stepImage'; stepId: string; imageId: string }
  | { kind: 'text'; questionId: string }
  | { kind: 'placeholder'; questionId: string }
  | { kind: 'option'; questionId: string; optionId: string }
  | { kind: 'image'; questionId: string; imageId: string };

/** How localizedSurvey() uses a translation: only when nothing is missing, or text by text. */
export type LocalizeMode = 'complete' | 'partial';

/** A survey's texts, and the language they are really in. */
export interface LocalizedSurvey {
  survey: Survey;
  language: string;
}

/** What a map holds under an id - its own entry, never something every object has. */
function own<T>(map: Record<string, T> | null | undefined, id: string): T | undefined {
  return map && Object.hasOwn(map, id) ? map[id] : undefined;
}

/** A translation with nothing in it yet. */
export function emptyTranslation(): SurveyTranslation {
  return { title: '', intro: '', thanks: '', steps: {}, questions: {} };
}

function emptyQuestionTranslation(): QuestionTranslation {
  return { text: '', placeholder: '', options: {}, images: {} };
}

function emptyStepTranslation(): StepTranslation {
  return { title: '', text: '', images: {} };
}

/** The survey's translation into a language, or undefined when it has none. */
export function translationOf(survey: Survey, code: string): SurveyTranslation | undefined {
  return own(survey.translations, code);
}

/** The languages a survey is translated into, as the document holds them. */
export function translationCodes(survey: Survey): string[] {
  return Object.keys(survey.translations ?? {});
}

/**
 * Every text the survey itself has - what there is to translate - in the
 * order of the document: the title, the welcome, the thanks, then step by
 * step its title, its own text and its pictures' descriptions, and each
 * question's text, hint, option labels and picture descriptions. A question
 * counts what its type shows: a hint for "own words", options for a choice
 * (the other kind's fields are kept, and shown to nobody). The same picture
 * twice is one description.
 */
export function translationPlaces(survey: Survey): TranslationPlace[] {
  const places: TranslationPlace[] = [];
  if (survey.title.trim()) {
    places.push({ kind: 'title' });
  }
  if (!isBlankHtml(survey.intro)) {
    places.push({ kind: 'intro' });
  }
  if (!isBlankHtml(survey.thanks)) {
    places.push({ kind: 'thanks' });
  }
  for (const step of survey.steps) {
    places.push(...stepPlaces(step));
    for (const question of step.questions) {
      places.push(...questionPlaces(question));
    }
  }
  return places;
}

/** A step's own texts: its title, its text, what each picture under it shows (once a picture). */
function stepPlaces(step: Step): TranslationPlace[] {
  const places: TranslationPlace[] = [];
  const stepId = step.id;
  if (step.title.trim()) {
    places.push({ kind: 'step', stepId });
  }
  if (!isBlankHtml(step.text)) {
    places.push({ kind: 'stepText', stepId });
  }
  for (const imageId of describedPictures(step.images)) {
    places.push({ kind: 'stepImage', stepId, imageId });
  }
  return places;
}

function questionPlaces(question: Question): TranslationPlace[] {
  const places: TranslationPlace[] = [];
  const questionId = question.id;
  if (!isBlankHtml(question.text)) {
    places.push({ kind: 'text', questionId });
  }
  if (isChoice(question)) {
    for (const option of question.options) {
      if (option.label.trim()) {
        places.push({ kind: 'option', questionId, optionId: option.id });
      }
    }
  } else if (question.placeholder.trim()) {
    places.push({ kind: 'placeholder', questionId });
  }
  for (const imageId of describedPictures(question.images)) {
    places.push({ kind: 'image', questionId, imageId });
  }
  return places;
}

/** The pictures that say what they show, each once - the same picture twice has one description - in their order. */
function describedPictures(images: readonly SurveyImage[]): string[] {
  const described = new Set<string>();
  for (const image of images) {
    if (image.alt.trim()) {
      described.add(image.id);
    }
  }
  return [...described];
}

/** What a translation says at a place - empty when it says nothing there (yet). */
export function translatedText(translation: SurveyTranslation | undefined, place: TranslationPlace): string {
  if (!translation) {
    return '';
  }
  switch (place.kind) {
    case 'title':
      return translation.title ?? '';
    case 'intro':
      return translation.intro ?? '';
    case 'thanks':
      return translation.thanks ?? '';
    case 'step':
      return own(translation.steps, place.stepId)?.title ?? '';
    case 'stepText':
      return own(translation.steps, place.stepId)?.text ?? '';
    case 'stepImage':
      return own(own(translation.steps, place.stepId)?.images, place.imageId)?.alt ?? '';
    case 'text':
      return own(translation.questions, place.questionId)?.text ?? '';
    case 'placeholder':
      return own(translation.questions, place.questionId)?.placeholder ?? '';
    case 'option':
      return own(own(translation.questions, place.questionId)?.options, place.optionId)?.label ?? '';
    case 'image':
      return own(own(translation.questions, place.questionId)?.images, place.imageId)?.alt ?? '';
  }
}

/** The welcome, the thanks, a step's own text and a question's text are HTML; everything else is a line. */
function isRich(place: TranslationPlace): boolean {
  return place.kind === 'intro' || place.kind === 'thanks' || place.kind === 'stepText' || place.kind === 'text';
}

function isBlank(text: string, rich: boolean): boolean {
  return rich ? isBlankHtml(text) : !text.trim();
}

/**
 * The places where the survey has a text and its translation into `code` has
 * none, in the order of the document (translationPlaces). A survey with no
 * translation into that language has every one of them to translate.
 */
export function translationGaps(survey: Survey, code: string): TranslationPlace[] {
  const translation = translationOf(survey, code);
  return translationPlaces(survey).filter((place) => isBlank(translatedText(translation, place), isRich(place)));
}

/** How far a translation is: the texts it has, of the texts there are ("42 / 57"). */
export function translationProgress(survey: Survey, code: string): { done: number; total: number } {
  const total = translationPlaces(survey).length;
  return { done: total - translationGaps(survey, code).length, total };
}

/**
 * The survey with its texts in `language`, and the language they are really
 * in. Only the texts change: ids, structure, pictures and limits are the
 * survey's own - and so are `language` and `translations` of the survey that
 * comes back, which is for showing, never for saving.
 *
 * `complete` (the people taking it): a translation is used only when nothing
 * is missing from it; otherwise the survey comes back whole in the language
 * it is written in - never half in one language and half in another.
 * `partial` (the preview, the editor): text by text, the translation where it
 * has one and the original where it has not, so a translator sees how far
 * they are.
 */
export function localizedSurvey(survey: Survey, language: string, mode: LocalizeMode): LocalizedSurvey {
  const original = { survey, language: survey.language };
  const translation = language === survey.language ? undefined : translationOf(survey, language);
  if (!translation || (mode === 'complete' && translationGaps(survey, language).length > 0)) {
    return original;
  }

  const pick = (place: TranslationPlace, text: string): string => {
    const translated = translatedText(translation, place);
    return isBlank(translated, isRich(place)) ? text : translated;
  };
  return {
    language,
    survey: {
      ...survey,
      title: pick({ kind: 'title' }, survey.title),
      intro: pick({ kind: 'intro' }, survey.intro),
      thanks: pick({ kind: 'thanks' }, survey.thanks),
      steps: survey.steps.map((step) => ({
        ...step,
        title: pick({ kind: 'step', stepId: step.id }, step.title),
        text: pick({ kind: 'stepText', stepId: step.id }, step.text),
        images: step.images.map((image) => ({ ...image, alt: pick({ kind: 'stepImage', stepId: step.id, imageId: image.id }, image.alt) })),
        questions: step.questions.map((question) => {
          const questionId = question.id;
          return {
            ...question,
            text: pick({ kind: 'text', questionId }, question.text),
            placeholder: pick({ kind: 'placeholder', questionId }, question.placeholder),
            options: question.options.map((option) => ({ ...option, label: pick({ kind: 'option', questionId, optionId: option.id }, option.label) })),
            images: question.images.map((image) => ({ ...image, alt: pick({ kind: 'image', questionId, imageId: image.id }, image.alt) })),
          };
        }),
      })),
    },
  };
}

/**
 * The survey without the translated texts of what it no longer has: a step,
 * a question, an option or a picture - a step's or a question's - that was
 * removed takes its entries in every language with it.
 * AdminStore.updateSurvey() applies this after every change, so no way of
 * removing something needs code of its own (and the server does the same on
 * the way in). Comes back as it came when there was nothing to drop.
 */
export function pruneTranslations(survey: Survey): Survey {
  const steps = new Map(survey.steps.map((step) => [step.id, step] as const));
  const questions = new Map(survey.steps.flatMap((step) => step.questions.map((question) => [question.id, question] as const)));
  let changed = !survey.translations;

  const translations = Object.entries(survey.translations ?? {}).map(([code, translation]): [string, SurveyTranslation] => {
    const stepEntries = kept(translation.steps, (id) => steps.has(id));
    let stepsChanged = stepEntries !== translation.steps;
    const prunedSteps = Object.entries(stepEntries).map(([stepId, entry]): [string, StepTranslation] => {
      const step = steps.get(stepId) as Step;
      const images = kept(entry.images, (id) => step.images.some((image) => image.id === id));
      if (images === entry.images) {
        return [stepId, entry];
      }
      stepsChanged = true;
      return [stepId, { ...entry, images }];
    });
    const entries = kept(translation.questions, (id) => questions.has(id));
    let questionsChanged = entries !== translation.questions;
    const pruned = Object.entries(entries).map(([questionId, entry]): [string, QuestionTranslation] => {
      const question = questions.get(questionId) as Question;
      const options = kept(entry.options, (id) => question.options.some((option) => option.id === id));
      const images = kept(entry.images, (id) => question.images.some((image) => image.id === id));
      if (options === entry.options && images === entry.images) {
        return [questionId, entry];
      }
      questionsChanged = true;
      return [questionId, { ...entry, options, images }];
    });
    if (!stepsChanged && !questionsChanged) {
      return [code, translation];
    }
    changed = true;
    return [code, { ...translation, steps: stepsChanged ? Object.fromEntries(prunedSteps) : translation.steps, questions: questionsChanged ? Object.fromEntries(pruned) : translation.questions }];
  });

  return changed ? { ...survey, translations: Object.fromEntries(translations) } : survey;
}

/**
 * The entries whose id still stands - the map itself when all of them do (a
 * missing map is an empty one). Built from entries, never by assigning: an id
 * may be any word.
 */
function kept<T>(map: Record<string, T> | null | undefined, stands: (id: string) => boolean): Record<string, T> {
  if (!map) {
    return {};
  }
  const entries = Object.entries(map);
  return entries.every(([id]) => stands(id)) ? map : Object.fromEntries(entries.filter(([id]) => stands(id)));
}

// ── Writing a translation ───────────────────────────────────────────────────
// For the editor, through AdminStore.updateSurvey(): each gives a new survey
// and leaves the one that came as it was.

/** The survey with one more language to be translated into - as it came when it has it, or is written in it. */
export function addTranslation(survey: Survey, code: string): Survey {
  if (code === survey.language || translationOf(survey, code)) {
    return survey;
  }
  return { ...survey, translations: { ...survey.translations, [code]: emptyTranslation() } };
}

/** The survey without its translation into a language: every text of it goes. */
export function removeTranslation(survey: Survey, code: string): Survey {
  if (!translationOf(survey, code)) {
    return survey;
  }
  return { ...survey, translations: Object.fromEntries(Object.entries(survey.translations).filter(([other]) => other !== code)) };
}

/**
 * One text of a translation, written. A language the survey is not (or no
 * longer) translated into gets nothing - a late keystroke does not bring a
 * removed language back; words for something the survey no longer has are
 * dropped by pruneTranslations().
 */
export function setTranslatedText(survey: Survey, code: string, place: TranslationPlace, text: string): Survey {
  const translation = translationOf(survey, code);
  if (!translation) {
    return survey;
  }
  return { ...survey, translations: { ...survey.translations, [code]: withText(translation, place, text) } };
}

/**
 * Every place a translation may hold words for, in the order of the
 * document - the ones translationPlaces() leaves out too (where the survey
 * itself says nothing, or the question's type shows nothing): a translator
 * may have written there all the same. For comparing two versions of a
 * translation, never for counting what is left to translate.
 */
function everyPlace(survey: Survey): TranslationPlace[] {
  const places: TranslationPlace[] = [{ kind: 'title' }, { kind: 'intro' }, { kind: 'thanks' }];
  for (const step of survey.steps) {
    const stepId = step.id;
    places.push({ kind: 'step', stepId }, { kind: 'stepText', stepId });
    for (const imageId of new Set(step.images.map((image) => image.id))) {
      places.push({ kind: 'stepImage', stepId, imageId });
    }
    for (const question of step.questions) {
      const questionId = question.id;
      places.push({ kind: 'text', questionId }, { kind: 'placeholder', questionId });
      for (const option of question.options) {
        places.push({ kind: 'option', questionId, optionId: option.id });
      }
      for (const imageId of new Set(question.images.map((image) => image.id))) {
        places.push({ kind: 'image', questionId, imageId });
      }
    }
  }
  return places;
}

/**
 * What the survey itself says at a place - its own text, in the language it
 * is written in - or undefined when it has no such step, question, option or
 * picture. (A text that is there and empty is ''.)
 */
function ownText(survey: Survey, place: TranslationPlace): string | undefined {
  switch (place.kind) {
    case 'title':
      return survey.title;
    case 'intro':
      return survey.intro;
    case 'thanks':
      return survey.thanks;
    case 'step':
      return survey.steps.find((step) => step.id === place.stepId)?.title;
    case 'stepText':
      return survey.steps.find((step) => step.id === place.stepId)?.text;
    case 'stepImage':
      return survey.steps.find((step) => step.id === place.stepId)?.images.find((image) => image.id === place.imageId)?.alt;
    default: {
      const question = survey.steps.flatMap((step) => step.questions).find((item) => item.id === place.questionId);
      switch (place.kind) {
        case 'text':
          return question?.text;
        case 'placeholder':
          return question?.placeholder;
        case 'option':
          return question?.options.find((option) => option.id === place.optionId)?.label;
        case 'image':
          return question?.images.find((image) => image.id === place.imageId)?.alt;
      }
    }
  }
}

/** The places where two versions of a translation say something else - one that is not there says nothing anywhere. */
function changedPlaces(places: readonly TranslationPlace[], here: SurveyTranslation | undefined, was: SurveyTranslation | undefined): TranslationPlace[] {
  return places.filter((place) => translatedText(here, place) !== translatedText(was, place));
}

/**
 * The languages whose translation was written into here: those of `mine`
 * that `base` does not have (added here), and those in which some text - of
 * any place `mine` could hold words for - is not what it is in `base`.
 * `base` is the survey as the server last had it from this page, `mine` the
 * survey as it is here now: what differs is what is not saved yet
 * (AdminStore.unsavedChanges()). A language removed here is not among them:
 * that is a change to the survey, not to a translation.
 */
export function changedTranslations(base: Survey, mine: Survey): string[] {
  const places = everyPlace(mine);
  return translationCodes(mine).filter((code) => {
    const was = translationOf(base, code);
    return !was || changedPlaces(places, translationOf(mine, code), was).length > 0;
  });
}

/**
 * The translations of two versions of a survey brought together, text by
 * text - for a save that met somebody else's (AdminStore.keepMine(),
 * keepMyTranslations()). `base` is the survey as the server last had it from
 * this page, `mine` the survey as it is here now, `theirs` the one somebody
 * else saved meanwhile. What comes back is theirs, with what was changed
 * here since `base` put into it:
 *
 * - a text written, reworded or emptied here is mine - over theirs, when both
 *   changed the same one; every other text is theirs (so a translator's saved
 *   work is not undone by a page that never touched it);
 * - a language added here is mine; one added by them is theirs;
 * - a language removed here stays removed, whatever they wrote into it;
 * - a language removed by them stays removed - unless a text of it was
 *   changed here, which keeps it as it is here.
 *
 * `saved` is whose document the result is saved with, for a translated text
 * is only as good as the original it stands beside:
 *
 * - `theirs` (keepMyTranslations()): their questions, so their translations
 *   of them, and nothing of mine but what was changed here;
 * - `mine` (keepMine()): my questions. Where their version no longer has the
 *   step, question, option or picture, or says something else there than
 *   `base` did (they reworded it), their translation is of a text the saved
 *   survey does not have - so mine stays, wherever mine has words. Where
 *   mine has none, theirs stays: a translation is never replaced by a gap.
 *
 * The texts compared are those of every place `mine` has. Words of theirs
 * for something `mine` no longer has come along all the same:
 * pruneTranslations() drops what the survey that is saved does not hold.
 * Their order of languages, then the ones only here.
 *
 * The editor's alone: the server settles nothing - it refuses a save made to
 * an older revision, and takes the next one whole.
 */
export function mergeTranslations(base: Survey, mine: Survey, theirs: Survey, saved: 'mine' | 'theirs'): Record<string, SurveyTranslation> {
  const places = everyPlace(mine);
  const codes = [...translationCodes(theirs), ...translationCodes(mine).filter((code) => !translationOf(theirs, code))];
  const merged: [string, SurveyTranslation][] = [];
  // Saved with my questions: the places where their translation stands beside another original than mine did - or beside none.
  const notTheirsToSay = new Set(saved === 'mine' ? places.filter((place) => !sameOriginal(ownText(theirs, place), ownText(base, place))) : []);

  for (const code of codes) {
    const was = translationOf(base, code);
    const here = translationOf(mine, code);
    const there = translationOf(theirs, code);
    if (!here) {
      // Not here: added by them - or removed here, when the server had it from this page.
      if (there && !was) {
        merged.push([code, there]);
      }
      continue;
    }
    const changed = changedPlaces(places, here, was);
    if (!there) {
      // Not theirs: added here - or removed by them, which stands when nothing of it was changed here.
      if (!was || changed.length > 0) {
        merged.push([code, here]);
      }
      continue;
    }
    const keep = places.filter((place) => changed.includes(place) || (notTheirsToSay.has(place) && !isBlank(translatedText(here, place), isRich(place))));
    merged.push([code, keep.reduce((translation, place) => withText(translation, place, translatedText(here, place)), there)]);
  }

  // Built from entries, never by assigning: a code is a key like any other.
  return Object.fromEntries(merged);
}

/**
 * Whether their version says at a place what the server last had from this
 * page. A place their version no longer has says nothing that could be the
 * same. Spaces around a text do not make it another one: the server trims a
 * line on its way in, so theirs comes trimmed and what was sent from here
 * may not be.
 */
function sameOriginal(theirs: string | undefined, base: string | undefined): boolean {
  return theirs !== undefined && base !== undefined && theirs.trim() === base.trim();
}

function withText(translation: SurveyTranslation, place: TranslationPlace, text: string): SurveyTranslation {
  switch (place.kind) {
    case 'title':
      return { ...translation, title: text };
    case 'intro':
      return { ...translation, intro: text };
    case 'thanks':
      return { ...translation, thanks: text };
    case 'step':
    case 'stepText':
    case 'stepImage': {
      const entry = own(translation.steps, place.stepId) ?? emptyStepTranslation();
      return { ...translation, steps: { ...translation.steps, [place.stepId]: withStepText(entry, place, text) } };
    }
    default: {
      const entry = own(translation.questions, place.questionId) ?? emptyQuestionTranslation();
      return { ...translation, questions: { ...translation.questions, [place.questionId]: withQuestionText(entry, place, text) } };
    }
  }
}

function withStepText(entry: StepTranslation, place: Extract<TranslationPlace, { stepId: string }>, text: string): StepTranslation {
  switch (place.kind) {
    case 'step':
      return { ...entry, title: text };
    case 'stepText':
      return { ...entry, text };
    case 'stepImage':
      return { ...entry, images: { ...entry.images, [place.imageId]: { alt: text } } };
  }
}

function withQuestionText(entry: QuestionTranslation, place: Extract<TranslationPlace, { questionId: string }>, text: string): QuestionTranslation {
  switch (place.kind) {
    case 'text':
      return { ...entry, text };
    case 'placeholder':
      return { ...entry, placeholder: text };
    case 'option':
      return { ...entry, options: { ...entry.options, [place.optionId]: { label: text } } };
    case 'image':
      return { ...entry, images: { ...entry.images, [place.imageId]: { alt: text } } };
  }
}
