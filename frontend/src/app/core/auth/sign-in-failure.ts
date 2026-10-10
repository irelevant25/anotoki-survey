import { ToastService } from '@anotoki/lib/ui/toast';
import { signInFailureKey, signInFailureParams } from '../i18n/error-text';
import { TranslationService } from '../i18n/translation.service';
import { AuthService, SignInFailure } from './auth.service';

/**
 * Says why a sign-in failed - came back without one, or could not start - in
 * a toast, in the language on the page: from the code, never the IAM's or the
 * SDK's English sentence. A finished sentence when raised; toasts are not
 * worded again.
 */
export function sayWhySignInFailed(failure: SignInFailure, i18n: TranslationService, toast: ToastService): void {
  toast.error(i18n.t(signInFailureKey(failure.code), signInFailureParams(failure.code)));
}

/**
 * A Sign in button's work: to the IAM, its pages in the language the person
 * reads here (theirs, even from the admin area) - or, when the sign-in cannot
 * start (the browser refuses the site's storage), the toast that says why,
 * where nothing would have happened at all.
 */
export async function signInOrSayWhy(auth: AuthService, i18n: TranslationService, toast: ToastService): Promise<void> {
  if (await auth.signIn(undefined, i18n.language())) {
    return;
  }
  const failure = auth.signInFailure();
  if (failure) {
    sayWhySignInFailed(failure, i18n, toast);
  }
}
