import { TranslationPlace, translationCodes, translationGaps, translationPlaces } from '../../../core/survey/localize';
import { currentStatus } from '../../../core/survey/survey-outline';
import { Survey } from '../../../core/survey/survey.model';

/**
 * What the editor's translation mode works out from a survey and the site's
 * languages: the tabs of the language switch, which languages can still be
 * added, where "Next missing" goes, and what each question has left.
 *
 * All of it pure; what a text is and when it is missing is
 * core/survey/localize.ts's to say.
 */

/** A language of the site, as the switch needs it: its English name, and whether people are offered it. */
export interface EditorLanguage {
  code: string;
  name: string;
  enabled: boolean;
}

/** One translation of a survey, as a tab of the language switch: "Slovak 42 / 57". */
export interface TranslationTab {
  code: string;
  /** The language's English name - its code when the site no longer has the language. */
  name: string;
  /** The texts it has, of the texts the survey has. */
  done: number;
  total: number;
  /** People are not offered the language (yet): it may stay unfinished. */
  hidden: boolean;
  /** The site does not have the language: the server refuses the survey until the translation is removed. */
  unknown: boolean;
  /**
   * The survey is open and its last day is not over (currentStatus: the
   * status as people meet it, which is what the header says too), people are
   * offered the language, and the translation lacks a text: until it is
   * whole, the people who read in this language are shown the survey in the
   * language it is written in (a survey is never half in one language and
   * half in another). Never so for a hidden language, which nobody reads in -
   * nor before the site's languages have come, nor of a survey whose closing
   * day has passed: nobody is taking that one.
   */
  readersGetMain: boolean;
}

/** A language's name in English, or its code while the site's languages have not come (or no longer hold it). */
export function languageName(languages: readonly EditorLanguage[] | null, code: string): string {
  return languages?.find((language) => language.code === code)?.name ?? code;
}

/**
 * The survey's translations as tabs: in the site's order of languages, then
 * the ones the site does not have (by code) - each with how far it is.
 * `now` is the moment a survey's last day is measured against - handed in, so
 * that the same survey and the same moment always give the same tabs.
 */
export function translationTabs(survey: Survey, languages: readonly EditorLanguage[] | null, now = new Date()): TranslationTab[] {
  const codes = translationCodes(survey).filter((code) => code !== survey.language);
  const order = new Map((languages ?? []).map((language, index) => [language.code, index]));
  const total = translationPlaces(survey).length;
  const open = currentStatus(survey, now) === 'open';
  return codes
    .map((code, index) => ({ code, index, at: order.get(code) ?? Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.at - b.at || a.index - b.index)
    .map(({ code }) => {
      const language = languages?.find((item) => item.code === code);
      const done = total - translationGaps(survey, code).length;
      return {
        code,
        name: language?.name ?? code,
        done,
        total,
        hidden: language ? !language.enabled : false,
        unknown: languages !== null && !language,
        readersGetMain: open && language?.enabled === true && done < total,
      };
    });
}

/** The languages a survey can still be translated into: every one of the site's that it is neither written in nor translated into yet. */
export function addableLanguages<L extends EditorLanguage>(survey: Survey, languages: readonly L[] | null): L[] {
  const taken = new Set([survey.language, ...translationCodes(survey)]);
  return (languages ?? []).filter((language) => !taken.has(language.code));
}

/**
 * A place's name on the page: what the field that edits it carries as
 * `data-place`, so it can be found and focused. Written as JSON, so that no
 * id - whatever it holds - makes two places read the same.
 */
export function placeKey(place: TranslationPlace): string {
  switch (place.kind) {
    case 'title':
    case 'intro':
    case 'thanks':
      return JSON.stringify([place.kind]);
    case 'step':
      return JSON.stringify([place.kind, place.stepId]);
    case 'text':
    case 'placeholder':
      return JSON.stringify([place.kind, place.questionId]);
    case 'option':
      return JSON.stringify([place.kind, place.questionId, place.optionId]);
    case 'image':
      return JSON.stringify([place.kind, place.questionId, place.imageId]);
  }
}

/**
 * Where "Next missing" goes: the first gap after the place the translator is
 * at, in the order of the survey - and round to the first one when nothing is
 * missing after it. `places` is every text of the survey in order
 * (translationPlaces), `gaps` the missing ones (translationGaps), `after` the
 * key of the field last visited (null: from the top). Null when nothing is
 * missing.
 */
export function nextGap(places: readonly TranslationPlace[], gaps: readonly TranslationPlace[], after: string | null): TranslationPlace | null {
  if (gaps.length === 0) {
    return null;
  }
  const order = new Map(places.map((place, index) => [placeKey(place), index]));
  const at = after === null ? -1 : (order.get(after) ?? -1);
  return gaps.find((gap) => (order.get(placeKey(gap)) ?? -1) > at) ?? gaps[0];
}

/** How many texts each question still has to translate, by question id - the ones with none are not in it. */
export function questionGaps(gaps: readonly TranslationPlace[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const gap of gaps) {
    if ('questionId' in gap) {
      counts.set(gap.questionId, (counts.get(gap.questionId) ?? 0) + 1);
    }
  }
  return counts;
}

/** The steps whose title is still to translate. */
export function stepGaps(gaps: readonly TranslationPlace[]): Set<string> {
  return new Set(gaps.flatMap((gap) => (gap.kind === 'step' ? [gap.stepId] : [])));
}

/** "Slovak", "Slovak and Czech", "Slovak, Czech and German". */
export function listOfNames(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
