import { Routes } from '@angular/router';
import { AdminLayoutComponent } from '../../layouts/admin-layout/admin-layout.component';
import { unsavedChangesGuard } from './localization/unsaved-changes.guard';

/**
 * /admin: the surveys, and for each its editor, its results and each response
 * on its own page; and the site's own words - the strings in every language
 * (translations) and the languages themselves; and, for an ADMIN, the
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
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./localization/translations/translations.component').then((m) => m.TranslationsComponent),
      },
      {
        path: 'languages',
        title: 'Languages',
        canDeactivate: [unsavedChangesGuard],
        loadComponent: () => import('./localization/languages/languages.component').then((m) => m.LanguagesComponent),
      },
      // ADMIN alone (the page says so to an EDITOR); the one page drawn while the database waits for a migration.
      { path: 'migrations', title: 'Migrations', loadComponent: () => import('./migrations/migrations.component').then((m) => m.MigrationsComponent) },
      { path: '**', title: 'Not found', loadComponent: () => import('../not-found/not-found.component').then((m) => m.NotFoundComponent) },
    ],
  },
];
