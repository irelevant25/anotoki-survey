import { EnvironmentProviders, inject } from '@angular/core';
import { provideAnotokiFeedback } from '@anotoki/lib/feedback';
import { TranslationService } from '@anotoki/lib/translations';
import { AuthService } from './auth/auth.service';

/**
 * The feedback form - the anotoki family's (@anotoki/lib/feedback/form, loaded
 * with the first press: the family's footer opens it under every page and in
 * the admin panel - its Feedback, `<anotoki-site-footer feedback>` - and so
 * does the Contact page) - set up for this site:
 *
 * - in the language on the page (English in the admin panel), its words the
 *   library's keys (`anotoki.feedback.*`) from the database: an owner's
 *   rewording, and this site's formal Slovak where the library's speaks to the
 *   reader informally (migration 014; FORMAL_SLOVAK, shared/translations.ts, for
 *   the moments there are no strings);
 * - the library's kinds (something does not work, an idea, something else)
 *   and no places of the site to choose from;
 * - for somebody signed in, "send it without my name" - which sends neither
 *   the account nor an address; a visitor is nobody here (their key goes to
 *   the surveys' routes alone);
 * - **no address written in**: the reply address is only what the sender
 *   types - the IAM is the only holder of anybody's address (docs/decisions.md:
 *   the other sites write the account's in, the survey does not).
 *
 * It sends to POST /api/feedback (backend routes/feedback.php) through the
 * app's HttpClient, so the site's interceptors decide what it carries - and
 * the form itself says whom it is for (anybody's: the library's
 * issuedAs('anybody'), since anotoki-lib 0.7.2): a person's message goes with
 * the token, anybody else's with neither - a visitor's key goes to the
 * surveys' routes alone (shared/auth/auth.config.ts). No mail is sent: the
 * admin panel counts what is new.
 */
export function provideSiteFeedback(): EnvironmentProviders {
  return provideAnotokiFeedback(() => {
    const i18n = inject(TranslationService);
    const auth = inject(AuthService);
    return {
      language: () => i18n.effectiveLanguage(),
      translate: (key: string) => i18n.libraryWord(key),
      signedIn: () => auth.person() !== null,
    };
  });
}
