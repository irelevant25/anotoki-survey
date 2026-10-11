import { EnvironmentProviders, inject } from "@angular/core";
import { CanActivateChildFn, CanActivateFn, Router } from "@angular/router";
import { AnotokiAuth, type AnotokiAuthConfig, provideAnotokiAuth } from "@anotoki/lib/auth";
import { TranslationService } from "@anotoki/lib/translations";
import { AuthService, CALLBACK_PATH } from "./auth.service";
import { VisitorKey } from "./visitor-key";

/**
 * Signing in through the anotoki family's library (anotoki-lib 0.4.1,
 * @anotoki/lib/auth) - wired to this site:
 *
 * - the boot configuration is what AuthService read from GET /api/auth/config
 *   (`bootConfig()`): the library is handed it once it came, so a start the
 *   server did not answer can start again from the load error card;
 * - the site's API is /api/..., and nobody's are the site's status, the
 *   sign-in's settings, the strings (the library's skips) and the pictures (an
 *   <img> sends no token anyway): a request of the site's API says whom it is
 *   for as it is issued (ApiService: ISSUED_AS) - a person's goes with the
 *   token or not at all, a visitor's with the key, and the key goes only to
 *   /api/surveys, the routes that read one;
 * - the visitors are this site's (VisitorKey: the key it keeps in
 *   localStorage, the move into the account after a sign-in);
 * - the IAM's pages, the callback page and the screen of a failed sign-in in
 *   the language the person reads here; the words of those two the library's
 *   (`anotoki.signIn.*`), from this site's database - an owner's rewording,
 *   and this site's formal Slovak (migration 012; FORMAL_SLOVAK while the
 *   database cannot be read);
 * - no sign-in hint: the IAM's anotoki_signed_in cookie signs nobody in here
 *   without a click (the owner's decision: the automatic sign-in is genshin's
 *   and the build analyzer's), so a visitor with an account stays a visitor
 *   until they press Sign in.
 *
 * The functions run in an injection context, when the library first needs
 * them - never while it is being made: AuthService, which the translations
 * read, injects the library's AnotokiAuth.
 */
export function siteAuthConfig(): AnotokiAuthConfig {
  return {
    config: () => inject(AuthService).bootConfig(),
    api: {
      prefixes: ["/api/"],
      skip: ["/api/site-status", "/api/auth/config", "/api/translations/", "/api/images/"],
      visitorPrefixes: ["/api/surveys"],
    },
    visitors: () => inject(VisitorKey),
    language: () => inject(TranslationService).language(),
    translate: (key) => inject(TranslationService).libraryWord(key),
    hint: false,
    redirectPath: CALLBACK_PATH,
    postLogoutPath: "/",
  };
}

export function provideSiteAuth(): EnvironmentProviders {
  return provideAnotokiAuth(siteAuthConfig);
}

/**
 * A Sign in button's work: to the IAM, back to this page - or, when the
 * sign-in cannot even start (the browser refuses the site's storage, where the
 * sign-in in progress is kept), the screen that says why (the library's, on
 * the callback page), where nothing would have happened at all. The guards do
 * the same for a page that needs somebody signed in. `prompt: 'login'` asks
 * for the password again even with a session at the IAM (the backups' proof).
 */
export async function signInOrShowWhy(auth: AuthService, router: Router, prompt?: "login"): Promise<void> {
  if (await auth.signIn(undefined, prompt)) {
    return;
  }
  if (auth.signInFailure()) {
    await router.navigateByUrl(CALLBACK_PATH);
  }
}

/**
 * The screen of a sign-in that came back without one, or could not start,
 * before a page the library's guards let through all the same: a visitor's
 * (while the site welcomes visitors, personOrVisitorGuard lets them in), or
 * the page of somebody still signed in from before (the backups' "Sign in
 * again" that came back without one). Its Back puts the failure away and goes
 * back to where the sign-in started; Try again signs in once more. Nobody
 * signed in meets the library's own guards first, which send the browser to
 * the same screen.
 */
export const signInFailureGuard: CanActivateFn & CanActivateChildFn = () => {
  const auth = inject(AnotokiAuth);
  return auth.signInFailure() !== null && auth.state() !== "starting" ? inject(Router).parseUrl(CALLBACK_PATH) : true;
};
