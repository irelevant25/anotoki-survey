import { EnvironmentProviders, inject } from '@angular/core';
import { provideAnotokiSiteSettings } from '@anotoki/lib/site-settings';
import { AuthService } from './auth/auth.service';

/**
 * Where this browser keeps the mark of an announcement its reader hid - a mark
 * of its kind and words, never the words - until they change. The Privacy page
 * names it (the legal facts' storage preset 'announcement', shared/legal/legal-facts.ts).
 */
export const ANNOUNCEMENT_STORAGE_KEY = 'anotoki-survey:announcement';

/**
 * The anotoki family's site settings (anotoki-lib 0.11.0, @anotoki/lib/site-settings - the
 * owner's request of 2026-10-25: genshin's switches on every site) wired to this site, which
 * offers all three parts:
 *
 * - **Getting in**: while the site's ADMIN has closed it for maintenance, the family's gate draws
 *   the closed sign for everybody else (the migrations module, shared/migrations.ts) - at /staff
 *   with the administrators' Sign in (sites/main/main.routes.ts);
 * - **Announcement**: <anotoki-announcement> above the public site's bar (the participant and legal
 *   frames), in the page's language;
 * - **Page access**: pageAccessGuard on the participant's pages - the list of open surveys (/) and a
 *   survey (/{slug}, its thank-you included): a page kept from the reader falls through to the
 *   not-found page at the address typed; <anotoki-page-notice> tells the site's ADMIN, above the page,
 *   what everybody else is not shown.
 *
 * What every page is told is read once as the site starts (SiteSettings.load(), in boot() - before
 * the first navigation, which the guard decides) from GET /api/site-settings, nobody's request (the
 * sign-in skips it: shared/auth/auth.config.ts), and again after the Site settings page saves. Who
 * reads is the token's say: the roles (ADMIN never refused a page) and whether somebody is signed in
 * - a visitor is nobody here. Nothing in the browser is a boundary: the server refuses a hidden page's
 * API paths itself (PageAccessGate, backend/api/site_settings.php).
 */
export function provideSiteSettings(): EnvironmentProviders {
  return provideAnotokiSiteSettings(() => {
    const auth = inject(AuthService);
    return { roles: () => auth.roles(), signedIn: () => auth.signedIn(), storageKey: ANNOUNCEMENT_STORAGE_KEY };
  });
}
