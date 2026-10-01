import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TranslationService } from '../i18n/translation.service';
import { AuthService } from './auth.service';

/**
 * The admin area (and the editor's preview) is for somebody signed in: anybody
 * else is sent to the IAM, and comes back to the address they asked for. Who
 * of the signed-in may use it - EDITOR or ADMIN - the admin layout says, and
 * the API decides.
 *
 * A guard on activation, not on matching: refused, the navigation stops where
 * it is, rather than going on to the next route that would match - a survey
 * called "admin" that is not there.
 */
export const signInGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  if (auth.signedIn()) {
    return true;
  }
  const navigation = inject(Router).currentNavigation();
  // The IAM's pages in the language the person reads here - theirs, not the admin area's English.
  auth.signIn(navigation ? navigation.extractedUrl.toString() : location.pathname + location.search, inject(TranslationService).language());
  return false;
};
