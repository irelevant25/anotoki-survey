import { TranslationService } from '../../core/i18n/translation.service';

/**
 * The language a survey's texts are shown in when it is not the page's own:
 * a survey with no complete translation in the reader's language is shown
 * whole in the language it was written in (core/survey/localize.ts), and the
 * page says so - "Language: English" - and marks those texts with `lang`, so a
 * screen reader reads them as what they are.
 */
export interface OtherLanguage {
  /** The language's code: what `lang` on the survey's own texts says. */
  code: string;
  /** What the page calls it: as its speakers write it ("Slovenčina") - or its code, for a language that is not on offer. */
  name: string;
  /** The language of that name: its own - or none, when the name is only the code. */
  nameLang: string | null;
}

/** What the comparison needs of the translation service. */
export type PageLanguage = Pick<TranslationService, 'effectiveLanguage' | 'languages'>;

/**
 * The language some texts are in, as the page should say and mark it - or
 * null when it is the language of the page itself (then nothing is said, and
 * nothing marked: the page's own `lang` already holds).
 */
export function otherLanguage(i18n: PageLanguage, language: string | null | undefined): OtherLanguage | null {
  if (!language || language === i18n.effectiveLanguage()) {
    return null;
  }
  const offered = i18n.languages().find((entry) => entry.code === language);
  return offered ? { code: language, name: offered.nativeName, nameLang: language } : { code: language, name: language, nameLang: null };
}
