import { EnvironmentProviders, InjectionToken, WritableSignal, inject, signal } from '@angular/core';
import { type SiteStatusWords, provideAnotokiMigrations } from '@anotoki/lib/migrations';
import { ToastService } from '@anotoki/lib/ui/toast';
import { AdminDates } from './admin/admin-dates.service';
import { AuthService } from './auth/auth.service';
import { signInOrSayWhy } from './auth/sign-in-failure';
import { TranslationService } from './i18n/translation.service';

/** The admin panel's Migrations page: the anotoki family's (<anotoki-migrations-page>), in the admin layout. */
export const MIGRATIONS_PATH = '/admin/migrations';

/**
 * Whether the site's pages stay away once it runs again: true from the moment
 * the site could not run in this page load (AppComponent sets it) until an
 * update applied in this tab opens them again (onUpToDate, below). While the
 * site cannot run, the family's gate keeps them away itself - it makes the
 * pages' template only while it shows them. The site turning ready any other
 * way - the family's page asking again by itself, or its "Try again" - opens
 * the gate and is followed at once by a reload of the page, and a page made in
 * the moment between would run for nothing (ask the API, raise a toast) and
 * flash before the reload (AppComponent.held).
 */
export const PAGES_CLOSED = new InjectionToken<WritableSignal<boolean>>('the site’s pages stay away until it runs again here', {
  providedIn: 'root',
  factory: () => signal(false),
});

/**
 * The words of the page drawn while the site cannot run are the library's
 * own, built in for English and Slovak - written for the sites that speak to
 * their readers informally (ty). This site's Slovak speaks formally (Vy, with
 * its capital; docs/decisions.md), so the one sentence of that page that
 * addresses the reader is said this site's way. The rest has no form of
 * address. Library words, not the site's: they must read while the site's
 * strings cannot be had - the database is what is not ready.
 */
const FORMAL_SLOVAK: Partial<SiteStatusWords> = {
  unavailableText: 'Skúste to, prosím, znova o pár minút. Táto stránka sa obnoví sama.',
};

/**
 * The anotoki family's migrations module (@anotoki/lib/migrations, the owner's
 * decision of 2026-10-07) wired into this site - one behaviour for every
 * anotoki site while its database waits for an update, or it cannot run:
 *
 * - SiteStatus asks GET /api/site-status first thing in the start (boot()),
 *   and siteStatusInterceptor hears any API answer saying the same (503
 *   update_pending or not_set_up);
 * - <anotoki-site-gate> around the router outlet (app.component, the outlet
 *   given as a template: made only while the gate shows the pages) draws the
 *   family's page instead of every page: to visitors and to signed-in people
 *   a calm "the site is being updated" in their language, with a quiet Sign
 *   in while nobody is signed in; to the site's ADMIN "A database update is
 *   waiting" and the way to the Migrations page, which works - nothing else
 *   does; the setup page only while the site was never installed;
 * - the admin panel's Migrations page is the family's (admin.routes.ts).
 *
 * Who is ADMIN is the token's say (AuthService, the IAM's roles for this
 * site); a Sign in comes back to the page it was pressed on; the Migrations
 * page's dates are in the anotoki account's order (AdminDates), and once it
 * has applied everything the pages open again where they stand (PAGES_CLOSED)
 * and the site's strings are read again - a migration may have brought new ones.
 */
export function provideSiteMigrations(): EnvironmentProviders {
  return provideAnotokiMigrations(() => {
    const auth = inject(AuthService);
    const i18n = inject(TranslationService);
    const toast = inject(ToastService);
    const dates = inject(AdminDates);
    const closed = inject(PAGES_CLOSED);
    return {
      statusUrl: '/api/site-status',
      apiBase: '/api/admin/migrations',
      migrationsRoute: MIGRATIONS_PATH,
      isAdmin: () => auth.isAdmin(),
      isSignedIn: () => auth.signedIn(),
      signIn: () => signInOrSayWhy(auth, i18n, toast),
      // The reader's language, wherever the page is: the visitor's words are theirs (the admin's part is English).
      language: () => i18n.language(),
      words: { sk: FORMAL_SLOVAK },
      formatDate: (iso: string) => dates.formatDateTime(iso),
      // Called just before the module marks the site ready: the one way back to it in this tab without a reload.
      onUpToDate: () => {
        closed.set(false);
        return i18n.reload();
      },
    };
  });
}
