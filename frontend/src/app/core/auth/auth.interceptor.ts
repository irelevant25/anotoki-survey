import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/**
 * The access token on every call to this site's own API - refreshed before it
 * runs out, and once more after a 401 (the SDK's own fetch does the same; this
 * is it for HttpClient). The sign-in settings, the pictures and the site's
 * words (the same for everybody, and wanted before the first page - not after
 * a token refresh) need none. Signed out, nothing is added: the API answers
 * what anybody may see.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const auth = inject(AuthService);

  const forAnybody = request.url === '/api/auth/config' || request.url.startsWith('/api/images/') || request.url.startsWith('/api/translations/');
  if (!request.url.startsWith('/api/') || forAnybody || !auth.signedIn()) {
    return next(request);
  }

  const withToken = (token: string | null): HttpRequest<unknown> => (token ? request.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : request);

  return from(auth.accessToken()).pipe(
    switchMap((token) =>
      next(withToken(token)).pipe(
        catchError((error: unknown) => {
          if (!(error instanceof HttpErrorResponse) || error.status !== 401 || !token) {
            return throwError(() => error);
          }
          // One retry, and only with a token that is actually different.
          return from(auth.refreshToken()).pipe(switchMap((renewed) => (renewed && renewed !== token ? next(withToken(renewed)) : throwError(() => error))));
        }),
      ),
    ),
  );
};
