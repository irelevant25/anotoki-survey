import { HttpInterceptorFn, provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { anotokiAuthInterceptor } from '@anotoki/lib/auth';
import { provideAnotokiErrorReport } from '@anotoki/lib/error-report';
import { provideAnotokiLegal } from '@anotoki/lib/legal';
import { siteStatusInterceptor } from '@anotoki/lib/migrations';
import { routes } from './app.routes';
import { provideSiteAdmin } from './shared/admin/admin-tools';
import { provideSiteAuth } from './shared/auth/auth.config';
import { boot } from './shared/boot/boot';
import { provideSiteFeedback } from './shared/feedback';
import { provideSiteKit } from './shared/kit';
import { surveyLegalConfig } from './shared/legal/legal.config';
import { provideSiteMigrations } from './shared/migrations';
import { SurveyTitleStrategy } from './shared/title.strategy';
import { provideSiteTranslations } from './shared/translations';

/**
 * What every request of the app's HttpClient goes through - the pages' own and
 * the error reporter's alike. The site's status first: it hears the answer
 * every other interceptor is done with (a 503 saying the site is not set up, or
 * an update waits), and the page that says so stands instead of the site. Then
 * who a request of the site's API is: the anotoki family's (@anotoki/lib/auth)
 * - see shared/auth/auth.config.ts. The feedback form's message says itself whom
 * it is for (anotoki-lib 0.7.2: anybody's - a person's with the token, anybody
 * else's with neither token nor key; shared/feedback.ts).
 */
export const SITE_INTERCEPTORS: HttpInterceptorFn[] = [siteStatusInterceptor, anotokiAuthInterceptor];

export const appConfig: ApplicationConfig = {
  providers: [
    // Every error to the ErrorHandler - window's errors and the promises nobody caught too.
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // Route parameters, query parameters (the results page's drill-down) and
    // route data arrive as component inputs, so pages read them as signals.
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' })),
    provideHttpClient(withFetch(), withInterceptors(SITE_INTERCEPTORS)),
    // The browser's errors in the site's error log (the anotoki family's reporter, anotoki-lib 0.5.0; the owner's
    // decision of 2026-10-11): the app's ErrorHandler - every error still to the console - sends each one, scrubbed,
    // at most five a page load, to POST /api/client-errors through the HttpClient above: a person's report with their
    // token (the server counts it by account), a visitor's and nobody's with neither - the visitor's key goes to the
    // surveys' routes alone. Never an HTTP failure: the server writes its own.
    provideAnotokiErrorReport(),
    // The anotoki family's sign-in through the IAM, wired to this site's visitors and words - see shared/auth/auth.config.ts.
    provideSiteAuth(),
    // The anotoki family's translations module: the language, the site's strings and the admin pages of both - see shared/translations.ts.
    provideSiteTranslations(),
    // The anotoki family's migrations module, wired to this site's sign-in, words and dates - see shared/migrations.ts.
    provideSiteMigrations(),
    // The anotoki family's admin tools and People page, for the site's ADMIN - see shared/admin/admin-tools.ts.
    provideSiteAdmin(),
    // The anotoki family's feedback form (its code loaded with the first press: the footer's Feedback, the Contact
    // page's), in the site's words and formal Slovak, no address written in for anybody - see shared/feedback.ts.
    provideSiteFeedback(),
    // The anotoki family's UI kit and top bar, wired to this site's words, icons, account and languages - see shared/kit.ts.
    // The family's footer (@anotoki/lib/footer, in each frame) reads its words through the kit too: no provider of its own.
    provideSiteKit(),
    // The anotoki family's legal pages - Terms, Privacy, Contact, on lazy routes open to anybody - and the footer's
    // links to them: the library's words around the survey's facts, every address the pages link to in the code
    // (shared/legal/legal.config.ts; the facts, which only the pages read, come with their frame: shared/legal/legal-facts.ts).
    provideAnotokiLegal(surveyLegalConfig),
    { provide: TitleStrategy, useClass: SurveyTitleStrategy },
    // Before the first page: where the site stands, the theme, the sign-in, the
    // language and its strings - see boot().
    provideAppInitializer(boot),
  ],
};
