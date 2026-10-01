import { InjectionToken, WritableSignal, inject, signal } from '@angular/core';
import { ToastService } from '../ui/toast/toast.service';
import { AuthService } from './auth/auth.service';
import { signInFailureKey, signInFailureParams } from './i18n/error-text';
import { TranslationService } from './i18n/translation.service';
import { ThemeService } from './theme/theme.service';

/**
 * Whether the start has run to its end: true once boot() has settled the
 * sign-in and then the language. The site is drawn only when the sign-in is
 * ready and this is true (app.component) - the sign-in is ready a moment
 * before the strings are there, and a page drawn in that moment shows keys.
 */
export const BOOTED = new InjectionToken<WritableSignal<boolean>>('the start has run to its end', {
  providedIn: 'root',
  factory: () => signal(false),
});

/**
 * The whole start of the site, before the first page is drawn: the theme (so
 * nothing flashes); the sign-in - which, back from the IAM, puts the address
 * the person came from back in the address bar before the router reads it;
 * the language and its strings, which need to know who is signed in and what
 * the address is; and only then a failed sign-in, said in words that exist by
 * now. Last of all it says the start is over (BOOTED) - which always comes:
 * neither the sign-in nor the language ever rejects.
 *
 * Called in an injection context - the app initializer, and the load error
 * page's "Try again", which starts the same way. Everything it needs is
 * injected before the first `await`: inject() does not work after one.
 */
export async function boot(): Promise<void> {
  inject(ThemeService);
  const auth = inject(AuthService);
  const i18n = inject(TranslationService);
  const toast = inject(ToastService);
  const booted = inject(BOOTED);

  // Starting again (the load error page's "Try again"): the site waits for its strings again.
  booted.set(false);
  await auth.init();
  await i18n.init();

  const failure = auth.signInFailure();
  if (failure) {
    // A finished sentence when raised; toasts are not worded again.
    toast.error(i18n.t(signInFailureKey(failure.code), signInFailureParams(failure.code)));
  }
  booted.set(true);
}
