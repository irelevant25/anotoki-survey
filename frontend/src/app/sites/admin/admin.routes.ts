import { Routes } from '@angular/router';
import { anotokiUnsavedChangesGuard } from '@anotoki/lib/translations';
import { AdminLayoutComponent } from './admin-layout/admin-layout.component';

/**
 * /admin: the surveys, and for each its editor, its results and each response
 * on its own page; the site's own words - the strings in every language
 * (translations) and the languages themselves, the anotoki family's pages
 * (@anotoki/lib/translations/admin: an entry point of their own, never in the
 * first load; their guard is the eager entry point's); and, for an ADMIN, the
 * System pages (system/): the people who signed in, what people sent through
 * the feedback form, the error log, the audit log, the backups and the
 * database's migrations - each the anotoki family's page
 * (@anotoki/lib/people/page, @anotoki/lib/admin/feedback, /errors, /audit,
 * /backups, @anotoki/lib/migrations/page), an entry point of its own on a lazy
 * route, configured in shared/admin/admin-tools.ts and shared/migrations.ts. Each
 * says to anybody but the site's ADMIN whose it is, and asks the server
 * nothing; the server refuses them all the same.
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
      // The ADMIN's System pages: what keeps the site running - its links, then each page.
      { path: 'system', title: 'System', loadComponent: () => import('./system/system.component').then((m) => m.SystemComponent) },
      { path: 'people', title: 'People', loadComponent: () => import('@anotoki/lib/people/page').then((m) => m.PeoplePageComponent) },
      { path: 'feedback', title: 'Feedback', loadComponent: () => import('@anotoki/lib/admin/feedback').then((m) => m.FeedbackPageComponent) },
      { path: 'errors', title: 'Error log', loadComponent: () => import('@anotoki/lib/admin/errors').then((m) => m.ErrorLogPageComponent) },
      { path: 'audit', title: 'Audit log', loadComponent: () => import('@anotoki/lib/admin/audit').then((m) => m.AuditLogPageComponent) },
      { path: 'backups', title: 'Backups', loadComponent: () => import('@anotoki/lib/admin/backups').then((m) => m.BackupsPageComponent) },
      // The anotoki family's Migrations page: the one page of the site drawn while a database update waits - for an
      // ADMIN (<anotoki-site-gate>).
      { path: 'migrations', title: 'Migrations', loadComponent: () => import('@anotoki/lib/migrations/page').then((m) => m.MigrationsPageComponent) },
      { path: '**', title: 'Not found', loadComponent: () => import('../../shared/not-found/not-found.component').then((m) => m.NotFoundComponent) },
    ],
  },
];
