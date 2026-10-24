import { EnvironmentProviders, inject } from '@angular/core';
import { Router } from '@angular/router';
import { provideAnotokiMigrations } from '@anotoki/lib/migrations';
import { TranslationService, siteStatusWords } from '@anotoki/lib/translations';
import { AdminDates } from './admin/admin-dates.service';
import { signInOrShowWhy } from './auth/auth.config';
import { AuthService } from './auth/auth.service';

/** The admin panel's Migrations page: the anotoki family's (<anotoki-migrations-page>), in the admin panel's frame. */
export const MIGRATIONS_PATH = '/admin/migrations';

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
 *   does; the setup page only while the site was never installed. Once the
 *   site runs again, that page reloads itself - without telling the gate
 *   first (anotoki-lib 0.2.0), so no page of the site is made in between;
 * - the admin panel's Migrations page is the family's (admin.routes.ts).
 *
 * Who is ADMIN is the token's say (AuthService, the IAM's roles for this
 * site); a Sign in comes back to the page it was pressed on; the family's
 * page reads the language on the page and its words from the site's database
 * - the library's `anotoki.siteStatus.*`, reworded on the Translations page
 * like any other string, and in this site's formal Slovak (migration 010;
 * shared/translations.ts while the database cannot be read, which is mostly
 * when this page shows). The Migrations page's dates are in the anotoki
 * account's order (AdminDates), and once it has applied everything the site's
 * strings are read again - a migration may have brought new ones - and the
 * pages open where they stand.
 */
export function provideSiteMigrations(): EnvironmentProviders {
  return provideAnotokiMigrations(() => {
    const auth = inject(AuthService);
    const i18n = inject(TranslationService);
    const router = inject(Router);
    const dates = inject(AdminDates);
    return {
      statusUrl: '/api/site-status',
      apiBase: '/api/admin/migrations',
      migrationsRoute: MIGRATIONS_PATH,
      isAdmin: () => auth.isAdmin(),
      isSignedIn: () => auth.signedIn(),
      signIn: () => signInOrShowWhy(auth, router),
      // The language on the page: the reader's, English in the admin panel - the words below are in it.
      language: () => i18n.effectiveLanguage(),
      // Read whenever the page draws: it follows a change of language or of the strings.
      get words() {
        return siteStatusWords(i18n);
      },
      formatDate: (iso: string) => dates.formatDateTime(iso),
      // Called just before the module marks the site ready: the one way back to it in this tab without a reload.
      onUpToDate: () => i18n.reload(),
    };
  });
}
