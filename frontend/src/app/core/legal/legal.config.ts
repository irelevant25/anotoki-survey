import { inject } from "@angular/core";
import { AnotokiLegalConfig } from "@anotoki/lib/legal";
import { TranslationService } from "@anotoki/lib/translations";

/**
 * How the survey plugs into the anotoki family's legal pages (@anotoki/lib/legal,
 * anotoki-lib 0.6.0: Terms, Privacy and Contact on the lazy routes /terms,
 * /privacy and /contact - app.routes.ts - and the links to them in the family's
 * footer, <anotoki-site-footer>, under every page and in the admin panel).
 * provideAnotokiLegal() runs it in an injection context.
 *
 * - The language: the one on the page (English in the admin panel, the footer's links too).
 * - The words: the library's (`anotoki.legal.*`, `anotoki.legalLinks.*`) - the
 *   database's string of a library key, an owner's rewording on the
 *   Translations page, before the library's built-in English and Slovak. That
 *   Slovak addresses nobody ("ty" or "Vy"), so it reads well beside this site's
 *   formal Slovak, and nothing of it is taken over here.
 * - The paths: the library's own; the operator: the family's (Code Hero s.r.o.,
 *   its address kept in two parts in the library).
 * - The facts - what the site keeps and for how long, its cookies and browser
 *   storage, who else handles data, the anotoki account's pages - are read by
 *   the pages alone, and their frame gives them (core/legal/legal-facts.ts,
 *   layouts/legal-layout): none of it is in the first load, which the footer's
 *   links share with every page people take surveys on.
 */
export function surveyLegalConfig(): AnotokiLegalConfig {
  const i18n = inject(TranslationService);
  return {
    language: () => i18n.effectiveLanguage(),
    translate: (key) => i18n.libraryWord(key),
    facts: () => {
      throw new Error("The legal pages' facts come with their frame (layouts/legal-layout, core/legal/legal-facts.ts).");
    },
  };
}
