import { TranslationService } from '../core/i18n/translation.service';

/**
 * A string for a page that is drawn when the site cannot run - and so may have
 * no strings at all: they live in the database, which is exactly what cannot
 * be reached. The kept string when the reader's browser has one from an
 * earlier visit (the bundle is cached, and the translation service takes the
 * cache when nothing can be asked); the English written in the page, which is
 * the same text, when it has not. Never the key.
 *
 * Call it inside a computed(): has() and t() read signals, so the words follow
 * the strings when they come.
 */
export function keptWord(i18n: TranslationService, key: string, english: string): string {
  return i18n.has(key) ? i18n.t(key) : english;
}
