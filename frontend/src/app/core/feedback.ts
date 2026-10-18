import { HttpInterceptorFn } from '@angular/common/http';
import { EnvironmentProviders, inject } from '@angular/core';
import { AnotokiAuth, ISSUED_AS } from '@anotoki/lib/auth';
import { DEFAULT_FEEDBACK_ENDPOINT, provideAnotokiFeedback } from '@anotoki/lib/feedback';
import { TranslationService } from '@anotoki/lib/translations';
import { AuthService } from './auth/auth.service';

/**
 * The feedback form - the anotoki family's (@anotoki/lib/feedback/form, loaded
 * with the first press: the Contact page opens it, and the family's footer
 * will) - set up for this site:
 *
 * - in the language on the page (English in the admin panel), its words the
 *   library's keys (`anotoki.feedback.*`) from the database: an owner's
 *   rewording, and this site's formal Slovak where the library's speaks to the
 *   reader informally (migration 014; FORMAL_SLOVAK, core/translations.ts, for
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
 * feedbackSenderInterceptor, below, says whom it is for: a person's message
 * goes with the token, anybody else's with neither. No mail is sent: the
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

/**
 * Whom the feedback form's message is for, said as it is issued (the library's
 * ISSUED_AS): the person's while somebody is signed in here - their token goes
 * with it, so the Feedback page names them - and nobody's otherwise: nobody,
 * and a visitor too (the server never reads a visitor's key there).
 *
 * Left to the family's interceptor, a request that does not say is the
 * person's whenever the sign-in is set up (AnotokiAuth.caller()), signed in or
 * not - and a person's request with no token is never sent: the Contact page,
 * which is anybody's, said "Sign in to send a message" to everybody not signed
 * in while the site requires signing in, and the page followed a session that
 * had never been. A request that says whom it is for already is left alone.
 * Before anotokiAuthInterceptor in SITE_INTERCEPTORS (app.config.ts).
 */
export const feedbackSenderInterceptor: HttpInterceptorFn = (request, next) => {
  if (request.method !== 'POST' || !isFeedbackRoute(request.url) || request.context.get(ISSUED_AS) !== null) {
    return next(request);
  }
  // HttpContext is the request's own, and mutable: the family's interceptor reads it next.
  request.context.set(ISSUED_AS, inject(AnotokiAuth).signedIn() ? 'person' : 'nobody');
  return next(request);
};

/** Whether `url` is the form's route (its path; the site's origin is the family's interceptor's to judge). */
function isFeedbackRoute(url: string): boolean {
  try {
    return new URL(url, 'http://feedback.invalid').pathname === DEFAULT_FEEDBACK_ENDPOINT;
  } catch {
    return false;
  }
}
