import { Routes } from '@angular/router';
import { signInGuard } from './core/auth/sign-in.guard';
import { ParticipantLayoutComponent } from './layouts/participant-layout/participant-layout.component';
import { AuthCallbackPageComponent } from './pages/auth-callback/auth-callback-page.component';

/**
 * Two areas:
 *
 *   /, /{slug}, /preview/{id}   what people see: the open surveys, a survey to
 *                               take, and the editor's preview of one - the
 *                               survey, under the top bar
 *   /admin/**                   the surveys, the editor and the results -
 *                               signed in (signInGuard), for EDITOR and ADMIN
 *   /auth/callback              where the IAM sends the browser back
 *
 * A survey lives at /{slug} - one segment - so every other path of the site
 * has two segments or a name the editor may not give a survey
 * (RESERVED_SLUGS in survey-factory.ts).
 */
export const routes: Routes = [
  {
    path: 'admin',
    canActivate: [signInGuard],
    loadChildren: () => import('./pages/admin/admin.routes').then((m) => m.ADMIN_ROUTES),
  },
  { path: 'auth/callback', component: AuthCallbackPageComponent, title: 'Signing in' },
  {
    path: '',
    component: ParticipantLayoutComponent,
    children: [
      { path: '', title: 'Surveys', loadComponent: () => import('./pages/participant/survey-home/survey-home.component').then((m) => m.SurveyHomeComponent) },
      {
        path: 'preview/:surveyId',
        title: 'Preview',
        data: { preview: true },
        canActivate: [signInGuard],
        loadComponent: () => import('./pages/participant/take-survey/take-survey.component').then((m) => m.TakeSurveyComponent),
      },
      { path: ':slug', loadComponent: () => import('./pages/participant/take-survey/take-survey.component').then((m) => m.TakeSurveyComponent) },
      { path: '**', title: 'Not found', loadComponent: () => import('./pages/not-found/not-found.component').then((m) => m.NotFoundComponent) },
    ],
  },
];
