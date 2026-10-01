/**
 * The site's own words as the API sends them (backend/api/translations.php):
 * the bundle every page starts with, and what the admin area's Languages and
 * Translations pages read and write.
 */

/** A language a page can be read in: what the chooser offers. */
export interface SiteLanguage {
  code: string;
  /** In English: "Slovak". */
  name: string;
  /** As its speakers write it: "Slovenčina" - what a chooser shows. */
  nativeName: string;
}

/**
 * GET /api/translations/{code}: the strings of one language with English
 * merged underneath, the languages on offer, and English itself (left out
 * when `language` is `en`) - so the admin area, which is English, never needs
 * a second request.
 */
export interface TranslationBundle {
  /**
   * The language that answered: the one asked for; its base language for a
   * regional code the site does not have (`sk` for `sk-sk`); `en` when the one
   * asked for is unknown or switched off.
   */
  language: string;
  languages: SiteLanguage[];
  values: Record<string, string>;
  english?: Record<string, string>;
}

/** A language as the admin area sees it: the hidden ones too. */
export interface AdminLanguage extends SiteLanguage {
  /** Offered to the people taking surveys. */
  enabled: boolean;
  sortOrder: number;
  /** The migrations write strings for it, so it cannot be deleted. */
  seeded: boolean;
}

/** What a new language is made of; it is sorted last, and whoever adds it says whether it is offered at once (`enabled`). */
export interface NewLanguage {
  code: string;
  name: string;
  nativeName: string;
}

/** What PUT /api/admin/languages/{code} may change. */
export interface LanguageChanges {
  name?: string;
  nativeName?: string;
  enabled?: boolean;
  sortOrder?: number;
}

/** One key of the site's words, with its string in every language that has one. */
export interface TranslationKeyRow {
  name: string;
  /** Where it is shown, and what its {placeholders} are. */
  description: string | null;
  values: Record<string, string>;
}

/** GET and PUT /api/admin/translations: every language and every key, ordered by name. */
export interface TranslationGrid {
  languages: AdminLanguage[];
  keys: TranslationKeyRow[];
}

/** The cells a save changes: key -> language code -> text (blank deletes the row, except for English). */
export type TranslationChanges = Record<string, Record<string, string>>;
