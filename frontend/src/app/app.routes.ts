import { Routes } from '@angular/router';
import { signInGuard, takeSurveysGuard } from './core/auth/sign-in.guard';
import { ParticipantLayoutComponent } from './layouts/participant-layout/participant-layout.component';
import { AuthCallbackPageComponent } from './pages/auth-callback/auth-callback-page.component';

/**
 * Two areas:
 *
 *   /, /{slug}, /preview/{id}   what people see: the open surveys, a survey to
 *                               take, and the editor's preview of one - the
 *                               survey, under the top bar; signed in
 *                               (takeSurveysGuard on each child) - or a
 *                               visitor, while the IAM says sign-in is not
 *                               required here; the preview signed in always
 *                               (its own signInGuard)
 *   /admin/**                   the surveys, the editor and the results -
 *                               signed in (signInGuard), for EDITOR and ADMIN
 *   /auth/callback              where the IAM sends the browser back
 *
 * A survey lives at /{slug} - one segment - so every other path of the site
 * has two segments or a name the editor may not give a survey
 * (RESERVED_SLUGS in survey-factory.ts).
 *
 * A `title` here is a translation key: the title strategy words it in the
 * language on the page (core/title.strategy.ts). The admin area's titles are
 * plain English (admin.routes.ts).
 */
export const routes: Routes = [
  {
    path: 'admin',
    canActivate: [signInGuard],
    loadChildren: () => import('./pages/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  { path: 'auth/callback', component: AuthCallbackPageComponent, title: 'title.signingIn' },
  {
    path: '',
    component: ParticipantLayoutComponent,
    canActivateChild: [takeSurveysGuard],
    children: [
      { path: '', title: 'title.surveys', loadComponent: () => import('./pages/participant/survey-home/survey-home.component').then((m) => m.SurveyHomeComponent) },
      {
        // No title: the survey page writes its own ("Preview: ..."), and is the only writer there.
        // The editor's: signed in even while visitors are welcome (the layout draws its card for nobody here too).
        path: 'preview/:surveyId',
        canActivate: [signInGuard],
        data: { preview: true },
        loadComponent: () => import('./pages/participant/take-survey/take-survey.component').then((m) => m.TakeSurveyComponent),
      },
      { path: ':slug', loadComponent: () => import('./pages/participant/take-survey/take-survey.component').then((m) => m.TakeSurveyComponent) },
      { path: '**', title: 'title.pageNotFound', loadComponent: () => import('./pages/not-found/not-found.component').then((m) => m.NotFoundComponent) },
    ],
  },
];
