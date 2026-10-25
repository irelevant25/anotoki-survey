import { InjectionToken, WritableSignal, inject, signal } from '@angular/core';
import { SiteStatus } from '@anotoki/lib/migrations';
import { ThemeService } from '@anotoki/lib/shell';
import { SiteSettings } from '@anotoki/lib/site-settings';
import { TranslationService } from '@anotoki/lib/translations';
import { AuthService } from '../auth/auth.service';
import { VisitorKey } from '../auth/visitor-key';
import { Changelog } from '../changelog/changelog.service';
import { adoptVisitorDrafts } from '../survey/drafts';

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
 * The whole start of the site, before the first page is drawn: where the site
 * stands (GET /api/site-status - the anotoki family's SiteStatus); the theme
 * (so nothing flashes); the sign-in - which, back from the IAM, puts the
 * address the person came from back in the address bar before the router
 * reads it; the language and its strings, which need to know who is signed in
 * and what the address is. Last of all it says the start is over (BOOTED) -
 * which always comes: neither the status, the sign-in nor the language ever
 * rejects. A sign-in that came back without one is said by the anotoki
 * family's screen, where the guards send the first navigation (app.routes.ts) -
 * in words that exist by then.
 *
 * Where the site stands comes first, so the first navigation knows it: while
 * the site cannot run (not set up, a database update waiting, the database out
 * of reach) the family's page stands instead of every page
 * (<anotoki-site-gate>), and the guards send nobody to the IAM. Nothing after
 * it stops on it: while an update waits the sign-in's settings and the strings
 * still answer, so the site's ADMIN can sign in - and apply it.
 *
 * The visitor key (shared/auth/visitor-key.ts) is made here too, so its effect
 * is there for the first sign-in: back from the IAM with a key held, what the
 * visitor answered moves into the account. And a sign-in that came back puts
 * the visitor's drafts into the person's slots at once - before the router
 * draws the first page, which reads them.
 *
 * The survey's versions (public/changelog.json, shared/changelog/) are asked for
 * at the very start, beside all of it and never waited for: the family's
 * footer under every page shows the newest as the version, and the answer has
 * come long before the strings have, so the version is there when the first
 * page is drawn - and a list that cannot be had keeps nothing from starting.
 *
 * What every page is told of the site settings (anotoki-lib 0.11.0: the
 * announcement, the pages Page access governs - shared/site-settings.ts) is
 * asked for at the start too, beside the rest, and waited for before the start
 * ends: the first navigation is the guard's to decide (pageAccessGuard), and a
 * page kept from the reader must never flash before it. It never rejects - an
 * answer that fails leaves no announcement and every page anybody's (the
 * server keeps a hidden page's data refused itself) - and the load error
 * card's "Try again" asks again.
 *
 * Called in an injection context - the app initializer, and the load error
 * page's "Try again", which starts the same way. Everything it needs is
 * injected before the first `await`: inject() does not work after one.
 */
export async function boot(): Promise<void> {
  inject(ThemeService);
  const status = inject(SiteStatus);
  const auth = inject(AuthService);
  inject(VisitorKey);
  const i18n = inject(TranslationService);
  const booted = inject(BOOTED);
  // Once a page load (Changelog.load() asks once, and again only after a failure); it never rejects.
  void inject(Changelog).load();
  // Asked now, beside the rest; waited for before the start ends (it never rejects).
  const settings = inject(SiteSettings).load();

  // Starting again (the load error page's "Try again"): the site waits for its strings again.
  booted.set(false);
  await status.check();
  await auth.init();
  const person = auth.person();
  if (person) {
    adoptVisitorDrafts(person.id);
  }
  await i18n.init();
  await settings;
  booted.set(true);
}
