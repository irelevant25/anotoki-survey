import { Routes } from '@angular/router';
import { anotokiUnsavedChangesGuard } from '@anotoki/lib/translations';
import { AdminLayoutComponent } from '../../layouts/admin-layout/admin-layout.component';

/**
 * /admin: the surveys, and for each its editor, its results and each response
 * on its own page; and the site's own words - the strings in every language
 * (translations) and the languages themselves, the anotoki family's pages
 * (@anotoki/lib/translations/admin: an entry point of their own, never in the
 * first load; their guard is the eager entry point's); and, for an ADMIN, the
 * database's migrations.
 */
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
      {
        path: 'translations',
        title: 'Translations',
        canDeactivate: [anotokiUnsavedChangesGuard],
        loadComponent: () => import('@anotoki/lib/translations/admin').then((m) => m.TranslationsPageComponent),
      },
      {
        path: 'languages',
        title: 'Languages',
        canDeactivate: [anotokiUnsavedChangesGuard],
        loadComponent: () => import('@anotoki/lib/translations/admin').then((m) => m.LanguagesPageComponent),
      },
      // The anotoki family's Migrations page (@anotoki/lib/migrations/page: an entry point of its own, never in the first
      // load): ADMIN alone (it says so to an EDITOR, and asks nothing); the one page of the site drawn while a database
      // update waits - for an ADMIN (<anotoki-site-gate>).
      { path: 'migrations', title: 'Migrations', loadComponent: () => import('@anotoki/lib/migrations/page').then((m) => m.MigrationsPageComponent) },
      { path: '**', title: 'Not found', loadComponent: () => import('../not-found/not-found.component').then((m) => m.NotFoundComponent) },
    ],
  },
];
