import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { VISITOR_SLOT } from '../survey/drafts';
import { Person } from '../survey/survey.model';
import { type AnotokiAuth, type AnotokiPreferenceChanges, type AnotokiPreferences, type AnotokiSavedPreferences, type AnotokiUser, createAuth } from './anotoki-auth';
import { SavesInFlight } from './saves-in-flight';

/**
 * Signing in, through the anotoki IAM - the only way in; the site has no
 * login of its own. The vendored browser SDK (anotoki-auth.mjs v1.2.0, copied
 * unchanged from the IAM's sdk/js/) does the OpenID Connect code flow with
 * PKCE and keeps the tokens in localStorage, shared by every tab; this wraps
 * it in signals.
 *
 * The account also says how every anotoki site should look - the theme, the
 * date order, the clock - beside its language (`preferences`; IAM migration
 * 015, the owner's decision of 2026-10-06), and the site's own controls save
 * a signed-in person's choice to it (`savePreferences()`): ThemeService,
 * TranslationService, the date pipes.
 *
 * The IAM's address and this site's client id come from the backend
 * (GET /api/auth/config), which says 503 not_set_up until setup.php has run -
 * and answers while a database update waits, when nothing else of the site
 * does: the site's ADMIN must still be able to sign in and apply it (where the
 * site stands is the anotoki family's SiteStatus's to say, not this
 * service's). It also relays the IAM's "Sign-in required" switch for this site
 * (`loginRequired`), so the browser never asks the IAM for it, and how many
 * days the site keeps a visitor unseen (`visitorDays`).
 *
 * With the switch off, somebody who is not signed in takes surveys as a
 * visitor (`visiting`, `taker`): core/auth/visitor-key.ts keeps the key the
 * server made them, and moves what they answered into their account at their
 * next sign-in. This service knows nothing of the key (VisitorKey reads this
 * one, never the other way round).
 */

/** Who takes surveys on this page: the signed-in person (their IAM id), or this browser's visitor - whose drafts are kept under VISITOR_SLOT. */
export interface Taker {
  id: string;
  visitor: boolean;
}

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
  private readonly _saves = inject(SavesInFlight);
  private _client: AnotokiAuth | null = null;
  /** onAuthChange() listeners - kept here, so one added before init() is not lost. */
  private readonly _listeners = new Set<() => void>();
  private readonly _authenticated = signal(false);

  readonly status = signal<BootStatus>('loading');
  /**
   * The IAM's "Sign-in required" switch for this site, as the backend relays
   * it: true unless it says false - a backend from before the switch, or one
   * that never heard from the IAM, requires sign-in.
   */
  private readonly _loginRequired = signal(true);
  readonly loginRequired = this._loginRequired.asReadonly();
  /**
   * How many days the site keeps a visitor it has not seen (the backend's
   * `visitorDays`, its visitors.local.php `keep_days`) - what the visitor
   * notice promises. Null from a backend that does not say: one from before
   * visitors, which welcomes none.
   */
  private readonly _visitorDays = signal<number | null>(null);
  readonly visitorDays = this._visitorDays.asReadonly();
  /**
   * The site welcomes people who are not signed in: it runs, the IAM says
   * sign-in is not required here, and the backend knows visitors. The pages
   * people take surveys on are then open to anybody (takeSurveysGuard); the
   * admin panel and the editor's preview still sign in first.
   */
  readonly visitorsWelcome = computed(() => this.status() === 'ready' && !this._loginRequired() && this._visitorDays() !== null);
  readonly user = signal<AnotokiUser | null>(null);
  /** The failed sign-in this page load came back with - or the last one that could not start. Never cleared: the page load after a sign-in starts clean. */
  readonly signInFailure = signal<SignInFailure | null>(null);

  readonly signedIn = computed(() => this._authenticated() && this.user() !== null);
  /** This site's roles, from the IAM: MEMBER (every account - an ordinary person), EDITOR writes surveys, ADMIN also deletes. */
  readonly roles = computed(() => (this.signedIn() ? (this.user()?.roles ?? []).map((role) => role.toUpperCase()) : []));
  readonly isAdmin = computed(() => this.roles().includes('ADMIN'));
  /** May use the admin area: the surveys, the editor, the results. */
  readonly isStaff = computed(() => this.isAdmin() || this.roles().includes('EDITOR'));
  /**
   * How the signed-in person's anotoki account says every anotoki site should
   * look: the theme, the date order and the clock - followed everywhere on
   * this site, the admin panel included. Null while nobody is signed in, and
   * for a sign-in the IAM sends none with (an IAM from before its migration
   * 015, or a sign-in without the `profile` scope): the site then keeps its
   * own settings, as before, and saves nothing to the account.
   */
  readonly preferences = computed<AnotokiPreferences | null>(() => (this.signedIn() ? (this.user()?.preferences ?? null) : null));
  /** The signed-in person as the survey knows people: the IAM's id, name and address. */
  readonly person = computed<Person | null>(() => {
    const user = this.signedIn() ? this.user() : null;
    return user ? { id: String(user.sub), name: user.preferred_username || user.email || 'you', email: user.email ?? '' } : null;
  });
  /** Nobody is signed in, and the site welcomes visitors: whoever is here takes surveys as this browser's visitor. */
  readonly visiting = computed(() => !this.signedIn() && this.visitorsWelcome());
  /**
   * Who takes surveys here, by id alone (a refreshed token is the same person):
   * the person signed in; else, while visitors are welcome, this browser's
   * visitor; else nobody. Drafts are kept by it, and the pages ask again when
   * it changes. (A person's id is the IAM's number: never the visitor's slot.)
   */
  private readonly _takerId = computed(() => this.person()?.id ?? (this.visitorsWelcome() ? VISITOR_SLOT : null));
  readonly taker = computed<Taker | null>(() => {
    const id = this._takerId();
    return id === null ? null : { id, visitor: id === VISITOR_SLOT };
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
    let config: { issuer?: string; clientId?: string; loginRequired?: boolean; visitorDays?: number };
    try {
      config = await firstValueFrom(this._http.get<typeof config>('/api/auth/config'));
    } catch (error) {
      // Not set up: the family's gate says so (siteStatusInterceptor heard the same answer).
      if (error instanceof HttpErrorResponse && error.status === 503 && error.error?.code === 'not_set_up') {
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
      // site starts with nobody signed in, so the first page's guard sends the
      // browser to the IAM - which tries again.
      console.error('The sign-in could not be restored.', error);
    }
    this._sync();
    this._loginRequired.set(config.loginRequired !== false);
    const days = config.visitorDays;
    this._visitorDays.set(typeof days === 'number' && Number.isInteger(days) && days >= 1 ? days : null);
    this.status.set('ready');
  }

  /**
   * The server refused somebody who is not signed in on a survey's route with
   * 401 sign_in_required: the IAM's switch was turned on since this page
   * loaded. The pages stop welcoming visitors until the next page load reads
   * the switch again (authInterceptor calls it - for /api/surveys only).
   */
  noteLoginRequired(): void {
    this._loginRequired.set(true);
  }

  /**
   * To the IAM, and back to `returnTo` (this page, by default) when signed in.
   * `uiLocales` is the language the person reads this site in, so the IAM's
   * pages open in the same one. The caller says it: this service cannot ask
   * the translation service, which needs this one (a circle).
   *
   * Answers true when the browser is on its way to the IAM. False when the
   * sign-in could not even start - the browser refuses the site's storage,
   * where the SDK keeps the sign-in in progress (`storage_unavailable`) - and
   * then `signInFailure` says so, as it does for a sign-in that came back
   * without one: the guard lets the page through to its signed-out card, and
   * the caller says why in a toast (signInOrSayWhy()), instead of a blank page.
   *
   * It leaves only once the site's writes on their way have their answers
   * (SavesInFlight, at most SAVES_WAIT_MS): a visitor's first answers bring
   * the key the move after the sign-in needs.
   */
  async signIn(returnTo = location.pathname + location.search + location.hash, uiLocales?: string): Promise<boolean> {
    if (!this._client) {
      return false;
    }
    await this._saves.settled();
    try {
      await this._client.login(uiLocales ? { returnTo, uiLocales } : { returnTo });
      return true;
    } catch (error) {
      console.error('The sign-in could not start.', error);
      const code = (error as { code?: unknown } | null)?.code;
      this.signInFailure.set({ code: typeof code === 'string' ? code : '', message: error instanceof Error ? error.message : '' });
      return false;
    }
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

  /**
   * Saves the person's choice to their anotoki account - for every anotoki
   * site, not only this one: `theme`, `date_format`, `time_format` or
   * `language` (a code the IAM offers). The SDK puts the answer in `user()`
   * at once, in every tab, and calls the change listeners. Rejects with the
   * SDK's error, whose `code` is the IAM's: `invalid_request` for a value it
   * does not take (a language it does not offer), `network` when it cannot
   * be reached, `login_required` with nobody signed in.
   *
   * Callers save only while `preferences()` is not null: an IAM that sends
   * none has no such account to save to.
   */
  savePreferences(changes: AnotokiPreferenceChanges): Promise<AnotokiSavedPreferences> {
    return this._client ? this._client.savePreferences(changes) : Promise.reject(Object.assign(new Error('Nobody is signed in'), { code: 'login_required' }));
  }

  /** Signed in, out or refreshed, or a preference saved - in this tab or another. Returns an unsubscribe. */
  onAuthChange(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private _sync(): void {
    this.user.set(this._client?.user() ?? null);
    this._authenticated.set(this._client?.isAuthenticated() ?? false);
  }
}
