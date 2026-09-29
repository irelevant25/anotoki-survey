import { Routes } from '@angular/router';
import { AdminLayoutComponent } from '../../layouts/admin-layout/admin-layout.component';

/** /admin: the surveys, and for each its editor, its results and each response on its own page. */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminLayoutComponent,
    children: [
      { path: '', title: 'Surveys', loadComponent: () => import('./surveys-list/surveys-list.component').then((m) => m.SurveysListComponent) },
      { path: 'surveys/:surveyId', pathMatch: 'full', redirectTo: 'surveys/:surveyId/edit' },
      { path: 'surveys/:surveyId/edit', title: 'Editor', loadComponent: () => import('./survey-editor/survey-editor.component').then((m) => m.SurveyEditorComponent) },
      { path: 'surveys/:surveyId/results', title: 'Results', loadComponent: () => import('./survey-results/survey-results.component').then((m) => m.SurveyResultsComponent) },
      {
        path: 'surveys/:surveyId/responses/:responseId',
        title: 'Response',
        loadComponent: () => import('./response-page/response-page.component').then((m) => m.ResponsePageComponent),
      },
      { path: '**', title: 'Not found', loadComponent: () => import('../not-found/not-found.component').then((m) => m.NotFoundComponent) },
    ],
  },
];
