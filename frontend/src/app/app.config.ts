import { provideHttpClient, withFetch, withInterceptors } from "@angular/common/http";
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZonelessChangeDetection } from "@angular/core";
import { TitleStrategy, provideRouter, withComponentInputBinding, withInMemoryScrolling } from "@angular/router";
import { routes } from "./app.routes";
import { authInterceptor } from "./core/auth/auth.interceptor";
import { AuthService, describeSignInFailure } from "./core/auth/auth.service";
import { ThemeService } from "./core/theme/theme.service";
import { SurveyTitleStrategy } from "./core/title.strategy";
import { ToastService } from "./ui/toast/toast.service";

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // Route parameters, query parameters (the results page's drill-down) and
    // route data arrive as component inputs, so pages read them as signals.
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: "enabled", anchorScrolling: "enabled" })),
    provideHttpClient(withFetch(), withInterceptors([authInterceptor])),
    { provide: TitleStrategy, useClass: SurveyTitleStrategy },
    // Before the first page: the theme (so nothing flashes), and the sign-in -
    // which, back from the IAM, puts the address the person came from back in
    // the address bar before the router reads it.
    provideAppInitializer(async () => {
      inject(ThemeService);
      const auth = inject(AuthService);
      const toast = inject(ToastService);
      await auth.init();
      const failure = describeSignInFailure(auth.signInFailure());
      if (failure) {
        toast.error(failure);
      }
    }),
  ],
};
