import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { SiteStatus } from '@anotoki/lib/migrations';
import { TranslationService } from '@anotoki/lib/translations';
import { ToastService } from '@anotoki/lib/ui/toast';
import { AuthService } from './auth.service';
import { sayWhySignInFailed } from './sign-in-failure';

/**
 * A page for somebody signed in: anybody else is sent to the IAM before
 * anything of the page is drawn, and comes back to the address they asked
 * for. On the admin area (`canActivate`, once, as it is entered) and on the
 * editor's preview always; on the pages people take surveys on through
 * takeSurveysGuard, which lets visitors through when the site welcomes them.
 * Who of the signed-in may use the admin area - EDITOR or ADMIN - the admin
 * layout says, and the API decides. Visiting counts as signed out here.
 *
 * It lets a page through with nobody signed in in one case: this page load
 * came back from the IAM without a sign-in (refused, cancelled) - from then on,
 * for every page of the load. Sent straight back, the browser would go round
 * between the two for ever; the layouts draw a card with a Sign in button
 * instead of the page, and the toast says what went wrong. A sign-in that
 * cannot even start (the browser refuses the site's storage) is the same: the
 * page goes through to its card, with a toast saying why - not a blank page,
 * the first navigation cancelled and nothing said.
 *
 * While the site cannot run and the server said why - not set up, a database
 * update waiting, the database out of reach (SiteStatus.blocked()) - it lets
 * every page through and sends nobody anywhere: the family's page stands
 * instead of the pages (<anotoki-site-gate>; none of them is drawn), with a
 * quiet Sign in of its own while an update waits - for the site's ADMIN, who
 * applies it. So the address stays the one asked for, for that sign-in to
 * come back to, and the page for its reload once the site runs. Otherwise,
 * while the site cannot run (out of reach as it started) it lets nothing
 * through: the load error card is drawn then.
 *
 * A guard on activation, not on matching: refused, the navigation stops where
 * it is, rather than going on to the next route that would match - a survey
 * called "admin" that is not there.
 */
export const signInGuard: CanActivateFn & CanActivateChildFn = () => {
  const auth = inject(AuthService);
  if (auth.signedIn() || auth.signInFailure()) {
    return true;
  }
  if (inject(SiteStatus).blocked()) {
    return true;
  }
  if (auth.status() !== 'ready') {
    return false;
  }
  const navigation = inject(Router).currentNavigation();
  const i18n = inject(TranslationService);
  const toast = inject(ToastService);
  // The IAM's pages in the language the person reads here - theirs, not the admin area's English.
  return auth.signIn(navigation ? navigation.extractedUrl.toString() : location.pathname + location.search, i18n.language()).then((started) => {
    const failure = started ? null : auth.signInFailure();
    if (!failure) {
      // On the way to the IAM (or the site not started): nothing of this page is drawn.
      return false;
    }
    sayWhySignInFailed(failure, i18n, toast);
    return true;
  });
};

/**
 * The pages people take surveys on (`canActivateChild` of their layout, so
 * each page asks again): open to anybody while the site welcomes visitors
 * (the IAM's "Sign-in required" is off for it - AuthService.visitorsWelcome),
 * otherwise signInGuard's. The editor's preview, under the same layout, has
 * signInGuard of its own: it is the editor's, never a visitor's.
 */
export const takeSurveysGuard: CanActivateChildFn = (childRoute, state) => {
  if (inject(AuthService).visitorsWelcome()) {
    return true;
  }
  return signInGuard(childRoute, state);
};
