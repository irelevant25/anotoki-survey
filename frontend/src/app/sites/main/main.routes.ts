import { Routes } from '@angular/router';
import { AuthCallbackComponent, personGuard, personOrVisitorGuard } from '@anotoki/lib/auth';
import { CALLBACK_PATH } from '../../shared/auth/auth.service';
import { signInFailureGuard } from '../../shared/auth/auth.config';
import { ParticipantLayoutComponent } from './participant-layout/participant-layout.component';

/** The legal pages' frame, loaded with the first of them that is opened (and its facts with it, out of the first load). */
const legalFrame = () => import('./legal-layout/legal-layout.component').then((m) => m.LegalLayoutComponent);

/**
 * The public site's addresses - every one but /admin/**: where the IAM sends
 * the browser back, the legal pages, About and Support, each in the legal
 * frame, and the survey's own pages in theirs. The map of every address and
 * its guards is app.routes.ts's, which lists these after /admin, as they stand
 * and in this order.
 *
 * Spread there, not loaded as a chunk of their own: the survey's frame and the
 * callback page stay in the first load, as they always were, and each page
 * keeps its own lazy chunk.
 */
export const MAIN_ROUTES: Routes = [
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
    path: 'about',
    loadComponent: legalFrame,
    children: [{ path: '', title: 'anotoki.about.title', loadComponent: () => import('@anotoki/lib/legal/about').then((m) => m.AboutPageComponent) }],
  },
  {
    path: 'support',
    loadComponent: legalFrame,
    children: [{ path: '', title: 'anotoki.support.title', loadComponent: () => import('@anotoki/lib/legal/support').then((m) => m.SupportPageComponent) }],
  },
  {
    path: '',
    component: ParticipantLayoutComponent,
    canActivateChild: [personOrVisitorGuard, signInFailureGuard],
    children: [
      { path: '', title: 'title.surveys', loadComponent: () => import('./survey-home/survey-home.component').then((m) => m.SurveyHomeComponent) },
      {
        // No title: the survey page writes its own ("Preview: ..."), and is the only writer there.
        // The editor's: signed in even while visitors are welcome (the layout draws its card for nobody here too).
        path: 'preview/:surveyId',
        canActivate: [personGuard],
        data: { preview: true },
        loadComponent: () => import('./take-survey/take-survey.component').then((m) => m.TakeSurveyComponent),
      },
      { path: ':slug', loadComponent: () => import('./take-survey/take-survey.component').then((m) => m.TakeSurveyComponent) },
      { path: '**', title: 'title.pageNotFound', loadComponent: () => import('../../shared/not-found/not-found.component').then((m) => m.NotFoundComponent) },
    ],
  },
];
