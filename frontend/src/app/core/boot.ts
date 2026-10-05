import { InjectionToken, WritableSignal, inject, signal } from '@angular/core';
import { ToastService } from '../ui/toast/toast.service';
import { AuthService } from './auth/auth.service';
import { sayWhySignInFailed } from './auth/sign-in-failure';
import { VisitorKey } from './auth/visitor-key';
import { TranslationService } from './i18n/translation.service';
import { adoptVisitorDrafts } from './survey/drafts';
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
 * The visitor key (core/auth/visitor-key.ts) is made here too, so its effect
 * is there for the first sign-in: back from the IAM with a key held, what the
 * visitor answered moves into the account. And a sign-in that came back puts
 * the visitor's drafts into the person's slots at once - before the router
 * draws the first page, which reads them.
 *
 * Called in an injection context - the app initializer, and the load error
 * page's "Try again", which starts the same way. Everything it needs is
 * injected before the first `await`: inject() does not work after one.
 */
export async function boot(): Promise<void> {
  inject(ThemeService);
  const auth = inject(AuthService);
  inject(VisitorKey);
  const i18n = inject(TranslationService);
  const toast = inject(ToastService);
  const booted = inject(BOOTED);

  // Starting again (the load error page's "Try again"): the site waits for its strings again.
  booted.set(false);
  await auth.init();
  const person = auth.person();
  if (person) {
    adoptVisitorDrafts(person.id);
  }
  await i18n.init();

  const failure = auth.signInFailure();
  if (failure) {
    sayWhySignInFailed(failure, i18n, toast);
  }
  booted.set(true);
}
