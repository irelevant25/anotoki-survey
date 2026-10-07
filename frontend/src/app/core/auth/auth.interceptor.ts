import { HttpErrorResponse, HttpEvent, HttpHandlerFn, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, catchError, defer, finalize, from, switchMap, tap, throwError } from 'rxjs';
import { CARRIES_VISITOR_KEY, Caller, ISSUED_AS, VISITOR_KEY_HEADER } from '../api/api.service';
import { AuthService } from './auth.service';
import { SavesInFlight } from './saves-in-flight';
import { VisitorKey } from './visitor-key';

/**
 * Who a request to the site's own API is - decided when it was ISSUED
 * (`ISSUED_AS`, which ApiService sets from the app's state as it makes the
 * request; a request without it is decided here, as it is handed over), never
 * from whether a token happens to be there when it leaves. The site's status,
 * the sign-in settings, the pictures and the site's words (the same for
 * everybody, and wanted before the first page - not after a token refresh)
 * are nobody's: a status asked as a person whose token is gone would fail here
 * unsent, and the page would say the site is out of reach.
 *
 * - **A person's**: the IAM access token - refreshed before it runs out, and
 *   once more after a 401 to a token that looked valid - never the visitor
 *   key. When the token comes back null (the refresh failed, signed out in
 *   another tab) the request is **never sent**: it fails here as a 401
 *   `sign_in_required`, and the page's signed-out handling takes over - a
 *   person's answers never go out as nobody's, and never make a visitor. A key
 *   in its answer is ignored.
 * - **A visitor's**, to /api/surveys, while the site does not require a
 *   sign-in (`auth.loginRequired()`): the key this browser holds now
 *   (core/auth/visitor-key.ts), if any. The answer that made a visitor - a
 *   send with no key - brings the new key in its `X-Visitor-Key` header, and
 *   it is kept (the first key stays). A 401 `visitor_unknown` forgets the key
 *   that was sent (only while it is still the one held) and the request goes
 *   once more without it - nothing was kept for it, so a send is not doubled.
 *   Never a token.
 * - **A visitor's anywhere else, or while the site requires a sign-in**:
 *   neither key nor token - the key is KEPT (a 401 `sign_in_required` never
 *   forgets it), so the next sign-in still moves what it answered. A 401
 *   `sign_in_required` from /api/surveys means the IAM's switch was turned on
 *   since the page loaded: AuthService.noteLoginRequired().
 * - **The move** after a sign-in (`CARRIES_VISITOR_KEY`, a person's): the
 *   token, beside the key the request set itself - the one request that
 *   carries both.
 *
 * Every write (anything but GET and HEAD) is counted while it is on its way
 * (SavesInFlight): a sign-in waits for them before it leaves the page.
 */
export const authInterceptor: HttpInterceptorFn = (request, next) => {
  const forAnybody = request.url === '/api/site-status' || request.url === '/api/auth/config' || request.url.startsWith('/api/images/') || request.url.startsWith('/api/translations/');
  if (!request.url.startsWith('/api/') || forAnybody) {
    return next(request);
  }
  const auth = inject(AuthService);
  const visitor = inject(VisitorKey);
  const saves = inject(SavesInFlight);
  const caller: Caller = request.context.get(ISSUED_AS) ?? (auth.signedIn() ? 'person' : 'visitor');
  const sent = caller === 'person' ? asPerson(request, next, auth) : asVisitor(request, next, auth, visitor);
  return counted(request, sent, saves);
};

/** A person's request: with the token, or not at all. */
function asPerson(request: HttpRequest<unknown>, next: HttpHandlerFn, auth: AuthService): Observable<HttpEvent<unknown>> {
  // A key is never sent for a person - but by the move, which set it itself.
  if (!request.context.get(CARRIES_VISITOR_KEY)) {
    request = request.clone({ headers: request.headers.delete(VISITOR_KEY_HEADER) });
  }
  return from(auth.accessToken()).pipe(
    switchMap((token) => {
      if (!token) {
        return throwError(() => notSignedIn(request));
      }
      return next(withBearer(request, token)).pipe(
        catchError((error: unknown) => {
          if (!(error instanceof HttpErrorResponse) || error.status !== 401) {
            return throwError(() => error);
          }
          // One retry, and only with a token that is actually different.
          return from(auth.refreshToken()).pipe(switchMap((renewed) => (renewed && renewed !== token ? next(withBearer(request, renewed)) : throwError(() => error))));
        }),
      );
    }),
  );
}

/**
 * A visitor's request: to /api/surveys, with the key held now, if any - and
 * the key a new visitor gets - while the site does not require a sign-in;
 * with neither anywhere else, or while it does (the key stays where it is).
 */
function asVisitor(request: HttpRequest<unknown>, next: HttpHandlerFn, auth: AuthService, visitor: VisitorKey): Observable<HttpEvent<unknown>> {
  const bare = request.clone({ headers: request.headers.delete(VISITOR_KEY_HEADER).delete('Authorization') });
  const surveys = isSurveysRequest(request.url);
  const noticed = (error: unknown): Observable<never> => {
    if (surveys && error instanceof HttpErrorResponse && error.status === 401 && errorCode(error) === 'sign_in_required') {
      auth.noteLoginRequired();
    }
    return throwError(() => error);
  };
  if (!surveys || auth.loginRequired()) {
    return next(bare).pipe(catchError(noticed));
  }

  const send = (key: string | null, again: boolean): Observable<HttpEvent<unknown>> =>
    next(key ? bare.clone({ setHeaders: { [VISITOR_KEY_HEADER]: key } }) : bare).pipe(
      tap((event) => {
        const made = !key && event instanceof HttpResponse ? event.headers.get(VISITOR_KEY_HEADER) : null;
        if (made) {
          visitor.remember(made);
        }
      }),
      catchError((error: unknown) => {
        if (key && error instanceof HttpErrorResponse && error.status === 401 && errorCode(error) === 'visitor_unknown') {
          visitor.forget(key, true);
          // Once more, with what this browser holds now: nothing, or a key another tab was given meanwhile.
          if (again) {
            const now = visitor.current();
            if (now !== key) {
              return send(now, false);
            }
          }
        }
        return noticed(error);
      }),
    );
  return send(visitor.current(), true);
}

/** What a person's request with no token to send answers, without being sent: what the API would say. */
function notSignedIn(request: HttpRequest<unknown>): HttpErrorResponse {
  return new HttpErrorResponse({
    status: 401,
    statusText: 'Unauthorized',
    url: request.urlWithParams,
    error: { error: 'Sign in to continue.', code: 'sign_in_required' },
  });
}

/** A write, counted from the moment it is handed over until it has its answer (or fails, or is dropped). */
function counted(request: HttpRequest<unknown>, sent: Observable<HttpEvent<unknown>>, saves: SavesInFlight): Observable<HttpEvent<unknown>> {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return sent;
  }
  return defer(() => {
    const end = saves.begin();
    return sent.pipe(finalize(end));
  });
}

function withBearer<T>(request: HttpRequest<T>, token: string): HttpRequest<T> {
  return request.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/** /api/surveys and what is under it: the only routes that read a visitor's key (the server's requireTaker()). */
function isSurveysRequest(url: string): boolean {
  return url === '/api/surveys' || url.startsWith('/api/surveys/') || url.startsWith('/api/surveys?');
}

/** The API's own code in a refusal, or null. */
function errorCode(error: HttpErrorResponse): string | null {
  const body: unknown = error.error;
  return body && typeof body === 'object' && typeof (body as { code?: unknown }).code === 'string' ? (body as { code: string }).code : null;
}
