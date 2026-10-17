import { Routes } from '@angular/router';
import { AuthCallbackComponent, personGuard, personOrVisitorGuard } from '@anotoki/lib/auth';
import { CALLBACK_PATH } from './core/auth/auth.service';
import { signInFailureGuard } from './core/auth/auth.config';
import { ParticipantLayoutComponent } from './layouts/participant-layout/participant-layout.component';

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
 *                               facts (core/legal/legal-facts.ts), in the frame
 *                               of the survey's pages (layouts/legal-layout) -
 *                               for anybody: no guard, nothing of a survey
 *                               on them; tried before the survey's own area,
 *                               whose /{slug} would take them. Each is a path
 *                               of its own with the frame its parent - never
 *                               one parent with an empty path: the router
 *                               takes an address it has read whole (/) for
 *                               such a parent when none of its children match,
 *                               and drew the empty frame at / with no guard
 *                               (app.routes.spec.ts)
 *
 * The guards are the anotoki family's (@anotoki/lib/auth): anybody else is
 * sent to the IAM before anything of a page is drawn, and comes back to the
 * address they asked for; a sign-in of this page load that failed shows its
 * screen instead (signInFailureGuard too, for the pages the library's guards
 * let through all the same). While the site cannot run and the server said
 * why, they let every page through and send nobody anywhere: the family's
 * page stands instead of the pages (<anotoki-site-gate>). Who of the signed-in
 * may use the admin area - EDITOR or ADMIN - the admin layout says, and the
 * API decides.
 *
 * A survey lives at /{slug} - one segment - so every other path of the site
 * has two segments or a name the editor may not give a survey
 * (RESERVED_SLUGS in survey-factory.ts).
 *
 * A `title` here is a translation key: the title strategy words it in the
 * language on the page (core/title.strategy.ts). The admin area's titles are
 * plain English (admin.routes.ts).
 */

/** The legal pages' frame, loaded with the first of them that is opened (and its facts with it, out of the first load). */
const legalFrame = () => import('./layouts/legal-layout/legal-layout.component').then((m) => m.LegalLayoutComponent);

export const routes: Routes = [
  {
    path: 'admin',
    canActivate: [personGuard, signInFailureGuard],
    loadChildren: () => import('./pages/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  { path: CALLBACK_PATH.slice(1), component: AuthCallbackComponent, title: 'title.signingIn' },
  {
    path: 'terms',
    loadComponent: legalFrame,
    children: [{ path: '', title: 'title.terms', loadComponent: () => import('@anotoki/lib/legal/pages').then((m) => m.TermsPageComponent) }],
  },
  {
    path: 'privacy',
    loadComponent: legalFrame,
    children: [{ path: '', title: 'title.privacy', loadComponent: () => import('@anotoki/lib/legal/pages').then((m) => m.PrivacyPageComponent) }],
  },
  {
    path: 'contact',
    loadComponent: legalFrame,
    children: [{ path: '', title: 'title.contact', loadComponent: () => import('@anotoki/lib/legal/pages').then((m) => m.ContactPageComponent) }],
  },
  {
    path: '',
    component: ParticipantLayoutComponent,
    canActivateChild: [personOrVisitorGuard, signInFailureGuard],
    children: [
      { path: '', title: 'title.surveys', loadComponent: () => import('./pages/participant/survey-home/survey-home.component').then((m) => m.SurveyHomeComponent) },
      {
        // No title: the survey page writes its own ("Preview: ..."), and is the only writer there.
        // The editor's: signed in even while visitors are welcome (the layout draws its card for nobody here too).
        path: 'preview/:surveyId',
        canActivate: [personGuard],
        data: { preview: true },
        loadComponent: () => import('./pages/participant/take-survey/take-survey.component').then((m) => m.TakeSurveyComponent),
      },
      { path: ':slug', loadComponent: () => import('./pages/participant/take-survey/take-survey.component').then((m) => m.TakeSurveyComponent) },
      { path: '**', title: 'title.pageNotFound', loadComponent: () => import('./pages/not-found/not-found.component').then((m) => m.NotFoundComponent) },
    ],
  },
];
