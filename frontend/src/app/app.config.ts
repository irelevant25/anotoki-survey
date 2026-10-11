import { provideHttpClient, withFetch, withInterceptors } from "@angular/common/http";
import { ApplicationConfig, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from "@angular/core";
import { TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling } from "@angular/router";
import { anotokiAuthInterceptor } from "@anotoki/lib/auth";
import { siteStatusInterceptor } from "@anotoki/lib/migrations";
import { routes } from "./app.routes";
import { provideSiteAdmin } from "./core/admin/admin-tools";
import { provideSiteAuth } from "./core/auth/auth.config";
import { boot } from "./core/boot";
import { provideSiteKit } from "./core/kit";
import { provideSiteMigrations } from "./core/migrations";
import { SurveyTitleStrategy } from "./core/title.strategy";
import { provideSiteTranslations } from "./core/translations";

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // Route parameters, query parameters (the results page's drill-down) and
    // route data arrive as component inputs, so pages read them as signals.
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: "enabled", anchorScrolling: "enabled" })),
    // The site's status first: it hears the answer every other interceptor is done with (a 503 saying the site
    // is not set up, or an update waits), and the page that says so stands instead of the site. Then who a
    // request of the site's API is: the anotoki family's (@anotoki/lib/auth) - see core/auth/auth.config.ts.
    provideHttpClient(withFetch(), withInterceptors([siteStatusInterceptor, anotokiAuthInterceptor])),
    // The anotoki family's sign-in through the IAM, wired to this site's visitors and words - see core/auth/auth.config.ts.
    provideSiteAuth(),
    // The anotoki family's translations module: the language, the site's strings and the admin pages of both - see core/translations.ts.
    provideSiteTranslations(),
    // The anotoki family's migrations module, wired to this site's sign-in, words and dates - see core/migrations.ts.
    provideSiteMigrations(),
    // The anotoki family's admin tools and People page, for the site's ADMIN - see core/admin/admin-tools.ts.
    provideSiteAdmin(),
    // The anotoki family's UI kit and top bar, wired to this site's words, icons, account and languages - see core/kit.ts.
    provideSiteKit(),
    { provide: TitleStrategy, useClass: SurveyTitleStrategy },
    // Before the first page: where the site stands, the theme, the sign-in, the
    // language and its strings - see boot().
    provideAppInitializer(boot),
  ],
};
