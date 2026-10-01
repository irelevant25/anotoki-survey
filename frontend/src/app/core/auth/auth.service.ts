import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Person } from '../survey/survey.model';
import { type AnotokiAuth, type AnotokiUser, createAuth } from './anotoki-auth';

/**
 * Signing in, through the anotoki IAM - the only way in; the site has no
 * login of its own. The vendored browser SDK (anotoki-auth.mjs v1.1.1, copied
 * unchanged from the IAM's sdk/js/) does the OpenID Connect code flow with
 * PKCE and keeps the tokens in localStorage, shared by every tab; this wraps
 * it in signals.
 *
 * The IAM's address and this site's client id come from the backend
 * (GET /api/auth/config), which says 503 not_set_up until setup.php has run.
 */

/** Where the app is while it starts: loading, running, waiting for its setup, or unable to reach the server. */
export type BootStatus = 'loading' | 'ready' | 'not-set-up' | 'error';

/**
 * A sign-in that came back without one: the SDK's error code, and the IAM's
 * own words. The words are English and are never shown to anybody - the page
 * says it in the reader's language, from the code (core/i18n/error-text.ts).
 */
export interface SignInFailure {
  code: string;
  message: string;
}

/** The IAM's redirect URI: a route of this app, registered in the IAM for each origin. */
export const CALLBACK_PATH = '/auth/callback';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _http = inject(HttpClient);
  private _client: AnotokiAuth | null = null;
  /** onAuthChange() listeners - kept here, so one added before init() is not lost. */
  private readonly _listeners = new Set<() => void>();
  private readonly _authenticated = signal(false);

  readonly status = signal<BootStatus>('loading');
  /** What the backend said is missing, when it says it (to the computer it runs on only). */
  readonly notSetUpDetail = signal<string | null>(null);
  readonly user = signal<AnotokiUser | null>(null);
  /** The failed sign-in this page load came back with. */
  readonly signInFailure = signal<SignInFailure | null>(null);

  readonly signedIn = computed(() => this._authenticated() && this.user() !== null);
  /** This site's roles, from the IAM: EDITOR writes surveys, ADMIN also deletes. */
  readonly roles = computed(() => (this.signedIn() ? (this.user()?.roles ?? []).map((role) => role.toUpperCase()) : []));
  readonly isAdmin = computed(() => this.roles().includes('ADMIN'));
  /** May use the admin area: the surveys, the editor, the results. */
  readonly isStaff = computed(() => this.isAdmin() || this.roles().includes('EDITOR'));
  /** The signed-in person as the survey knows people: the IAM's id, name and address. */
  readonly person = computed<Person | null>(() => {
    const user = this.signedIn() ? this.user() : null;
    return user ? { id: String(user.sub), name: user.preferred_username || user.email || 'you', email: user.email ?? '' } : null;
  });

  /**
   * Once per page load, before the first page is drawn: reads the backend's
   * sign-in settings, then finishes a sign-in callback (the SDK puts the
   * address the person came from back in the address bar before the router
   * reads it) or restores - and refreshes - the stored session. Never throws:
   * `status` says how it went.
   */
  async init(): Promise<void> {
    this.status.set('loading');
    let config: { issuer?: string; clientId?: string };
    try {
      config = await firstValueFrom(this._http.get<typeof config>('/api/auth/config'));
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status === 503 && error.error?.code === 'not_set_up') {
        this.notSetUpDetail.set(typeof error.error?.detail === 'string' ? error.error.detail : null);
        this.status.set('not-set-up');
        return;
      }
      console.error('The sign-in settings could not be loaded.', error);
      this.status.set('error');
      return;
    }

    if (!this._client) {
      this._client = createAuth({
        issuer: String(config.issuer ?? ''),
        clientId: String(config.clientId ?? ''),
        redirectUri: `${location.origin}${CALLBACK_PATH}`,
        postLogoutRedirectUri: `${location.origin}/`,
      });
      this._client.onChange(() => {
        this._sync();
        for (const listener of this._listeners) {
          try {
            listener();
          } catch (error) {
            console.error('A sign-in listener failed', error);
          }
        }
      });
    }

    try {
      const result = await this._client.init();
      if (result.error) {
        this.signInFailure.set({ code: result.error.code || '', message: result.error.message || '' });
      }
    } catch (error) {
      // The IAM out of reach while a stored session was being restored: the
      // site still works for everybody signed out; signing in tries again.
      console.error('The sign-in could not be restored.', error);
    }
    this._sync();
    this.status.set('ready');
  }

  /**
   * To the IAM, and back to `returnTo` (this page, by default) when signed in.
   * `uiLocales` is the language the person reads this site in, so the IAM's
   * pages open in the same one. The caller says it: this service cannot ask
   * the translation service, which needs this one (a circle).
   */
  signIn(returnTo = location.pathname + location.search + location.hash, uiLocales?: string): void {
    void this._client?.login(uiLocales ? { returnTo, uiLocales } : { returnTo });
  }

  /** Signs out everywhere - the IAM ends its session - and lands on this site's start page. */
  signOut(): void {
    void this._client?.logout();
  }

  /** The IAM's account page: name, password, two-factor, sessions. */
  accountUrl(): string | null {
    return this._client ? this._client.accountUrl() : null;
  }

  /** A valid access token (refreshed when it is about to run out), or null. */
  accessToken(): Promise<string | null> {
    return this._client ? this._client.getAccessToken() : Promise.resolve(null);
  }

  /** After the API refused the current token: a different, fresh one - or null. */
  refreshToken(): Promise<string | null> {
    return this._client ? this._client.refresh() : Promise.resolve(null);
  }

  /** Signed in, out or refreshed - in this tab or another. Returns an unsubscribe. */
  onAuthChange(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _sync(): void {
    this.user.set(this._client?.user() ?? null);
    this._authenticated.set(this._client?.isAuthenticated() ?? false);
  }
}
