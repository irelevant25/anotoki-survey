import { Routes } from '@angular/router';
import { personGuard } from '@anotoki/lib/auth';
import { signInFailureGuard } from './shared/auth/auth.config';
import { MAIN_ROUTES } from './sites/main/main.routes';

/**
 * Two areas, and the pages around them:
 *
 *   /, /{slug}, /preview/{id}   what people see: the open surveys, a survey to
 *                               take, and the editor's preview of one - the
 *                               survey, under the top bar; signed in
 *                               (personOrVisitorGuard on each child) - or a
 *                               visitor, while the IAM says sign-in is not
 *                               required here; the preview signed in always
 *                               (personGuard of its own)
 *   /admin/**                   the surveys, the editor and the results -
 *                               signed in (personGuard), for EDITOR and ADMIN;
 *                               the site's words, and the ADMIN's system pages
 *   /auth/callback              where the IAM sends the browser back: the
 *                               anotoki family's page (@anotoki/lib/auth) -
 *                               "Signing you in…", or the screen of a sign-in
 *                               that came back without one, or could not start
 *   /terms, /privacy, /contact  the anotoki family's legal pages
 *                               (@anotoki/lib/legal/pages) with the survey's
 *                               facts (shared/legal/legal-facts.ts), in the
 *                               frame of the survey's pages
 *                               (sites/main/legal-layout) -
 *                               for anybody: no guard, nothing of a survey
 *                               on them; tried before the survey's own area,
 *                               whose /{slug} would take them. Each is a path
 *                               of its own with the frame its parent - never
 *                               one parent with an empty path: the router
 *                               takes an address it has read whole (/) for
 *                               such a parent when none of its children match,
 *                               and drew the empty frame at / with no guard
 *                               (app.routes.spec.ts)
 *   /about, /support            the anotoki family's About and Support pages
 *                               (@anotoki/lib/legal/about, /support), the same
 *                               on every anotoki site: anybody's, in the legal
 *                               pages' frame, each a path of its own as they
 *                               are; the tab's title is the page's heading,
 *                               the library's words (anotoki.about.title,
 *                               anotoki.support.title)
 *
 * The guards are the anotoki family's (@anotoki/lib/auth): anybody else is
 * sent to the IAM before anything of a page is drawn, and comes back to the
 * address they asked for; a sign-in of this page load that failed shows its
 * screen instead (signInFailureGuard too, for the pages the library's guards
 * let through all the same). While the site cannot run and the server said
 * why, they let every page through and send nobody anywhere: the family's
 * page stands instead of the pages (<anotoki-site-gate>). Who of the signed-in
 * may use the admin area - EDITOR or ADMIN - the admin panel's frame says
 * (sites/admin/app.component.ts), and the
 * API decides.
 *
 * Each area's routes are its own: the admin panel's in
 * sites/admin/admin.routes.ts, loaded with the first /admin address; every
 * other address is the public site's, sites/main/main.routes.ts, spread in
 * here after /admin as they stand and in their order.
 *
 * A survey lives at /{slug} - one segment - so every other path of the site
 * has two segments or a name the editor may not give a survey
 * (RESERVED_SLUGS in shared/survey/survey-factory.ts).
 *
 * A `title` here is a translation key: the title strategy words it in the
 * language on the page (shared/title.strategy.ts). The admin area's titles are
 * plain English (sites/admin/admin.routes.ts).
 */

export const routes: Routes = [
  {
    path: 'admin',
    canActivate: [personGuard, signInFailureGuard],
    loadChildren: () => import('./sites/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  ...MAIN_ROUTES,
];
