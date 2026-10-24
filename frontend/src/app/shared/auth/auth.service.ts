import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { AnotokiAuth, type AnotokiPreferenceChanges, type AnotokiPreferences, type AnotokiSavedPreferences, type AnotokiUser, type AuthBootConfig, type SignInFailure } from '@anotoki/lib/auth';
import { firstValueFrom } from 'rxjs';
import { VISITOR_SLOT } from '../survey/drafts';
import { Person } from '../survey/survey.model';

/**
 * Signing in, through the anotoki IAM - the only way in; the site has no
 * login of its own. The anotoki family's library does it (anotoki-lib 0.5.0,
 * @anotoki/lib/auth: the IAM's browser SDK moved into the library, with the
 * same storage, so nobody was signed out by the move - AnotokiAuth, its
 * interceptor, its guards, its callback page and the screen of a sign-in that
 * failed; wired in shared/auth/auth.config.ts). This is the survey's face of it:
 * what the survey itself calls people and visitors, over the library's signals.
 *
 * The account also says how every anotoki site should look - the theme, the
 * date order, the clock - beside its language (`preferences`; IAM migration
 * 015, the owner's decision of 2026-10-06), and the site's own controls save
 * a signed-in person's choice to it (`savePreferences()`): ThemeService,
 * TranslationService, the date pipes.
 *
 * The IAM's address and this site's client id come from the backend
 * (GET /api/auth/config, the library's route there), which says 503
 * not_set_up until setup.php has run - and answers while a database update
 * waits, when nothing else of the site does: the site's ADMIN must still be
 * able to sign in and apply it (where the site stands is the anotoki family's
 * SiteStatus's to say, not this service's). It also relays the IAM's
 * "Sign-in required" switch for this site (`login_required`), so the browser
 * never asks the IAM for it, and how many days the site keeps a visitor
 * unseen (`visitor_days`). This service reads that answer itself - the
 * library's AnotokiAuth is handed it (`bootConfig()`) only once it came, so a
 * start the server did not answer can start again ("Try again").
 *
 * With the switch off, somebody who is not signed in takes surveys as a
 * visitor (`visiting`, `taker`): shared/auth/visitor-key.ts keeps the key the
 * server made them - the library's interceptor sends it - and moves what they
 * answered into their account at their next sign-in. This service knows
 * nothing of the key (VisitorKey reads this one, never the other way round).
 */

/** Who takes surveys on this page: the signed-in person (their IAM id), or this browser's visitor - whose drafts are kept under VISITOR_SLOT. */
export interface Taker {
  id: string;
  visitor: boolean;
}

/** Where the app is while it starts: loading, running, waiting for its setup, or unable to reach the server. */
export type BootStatus = 'loading' | 'ready' | 'not-set-up' | 'error';

export type { SignInFailure };

/** The IAM's redirect URI: a route of this app, registered in the IAM for each origin - the library's callback page. */
export const CALLBACK_PATH = '/auth/callback';

/** What GET /api/auth/config answers: the library's fields, and how many days a visitor is kept. */
export interface SurveyBootConfig extends AuthBootConfig {
  visitor_days?: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _http = inject(HttpClient);
  private readonly _auth = inject(AnotokiAuth);
  /** onAuthChange() listeners - kept here, so one added before init() is not lost. */
  private readonly _listeners = new Set<() => void>();
  /** The boot configuration the server answered, for the library; null until one came. */
  private _boot: SurveyBootConfig | null = null;

  readonly status = signal<BootStatus>('loading');
  /**
   * The IAM's "Sign-in required" switch for this site, as the backend relays
   * it: true unless it says false - the library fails closed - and true from
   * the moment a visitor's request was refused with sign_in_required.
   */
  readonly loginRequired = computed(() => this._auth.loginRequired());
  /**
   * How many days the site keeps a visitor it has not seen (the backend's
   * `visitor_days`, its visitors.local.php `keep_days`) - what the visitor
   * notice promises. Null from a backend that does not say: one from before
   * visitors, which welcomes none.
   */
  private readonly _visitorDays = signal<number | null>(null);
  readonly visitorDays = this._visitorDays.asReadonly();
  /**
   * The site welcomes people who are not signed in: it runs, the IAM says
   * sign-in is not required here, and the backend knows visitors. The pages
   * people take surveys on are then open to anybody (the library's
   * personOrVisitorGuard); the admin panel and the editor's preview still sign
   * in first (personGuard).
   */
  readonly visitorsWelcome = computed(() => this.status() === 'ready' && !this._auth.loginRequired() && this._visitorDays() !== null);
  /** Who is signed in - the ID token's claims - while the page is theirs. */
  readonly user = computed<AnotokiUser | null>(() => this._auth.user());
  /**
   * A sign-in that came back without one, or could not start: its code (never
   * the IAM's sentence) and where it started. The library's guards send the
   * browser to the screen that says why (the callback page); a Sign in button
   * does the same (signInOrShowWhy(), shared/auth/auth.config.ts).
   */
  readonly signInFailure = computed<SignInFailure | null>(() => this._auth.signInFailure());

  readonly signedIn = computed(() => this._auth.signedIn());
  /** This site's roles, from the IAM: MEMBER (every account - an ordinary person), EDITOR writes surveys, ADMIN also deletes. */
  readonly roles = computed(() => this._auth.roles());
  readonly isAdmin = computed(() => this._auth.isAdmin());
  /** May use the admin area: the surveys, the editor, the results. */
  readonly isStaff = computed(() => this._auth.isStaff());
  /**
   * How the signed-in person's anotoki account says every anotoki site should
   * look: the theme, the date order and the clock - followed everywhere on
   * this site, the admin panel included. Null while nobody is signed in, and
   * for a sign-in the IAM sends none with (an IAM from before its migration
   * 015, or a sign-in without the `profile` scope): the site then keeps its
   * own settings, as before, and saves nothing to the account.
   */
  readonly preferences = computed<AnotokiPreferences | null>(() => this._auth.preferences());
  /** The signed-in person as the survey knows people: the IAM's id and name (the address is the IAM's, never kept here). */
  readonly person = computed<Person | null>(() => {
    const user = this.user();
    return user ? { id: String(user.sub), name: user.preferred_username || user.email || 'you' } : null;
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

  constructor() {
    // Signed in, out or as somebody else, or a preference saved - in this tab or another: the listeners hear it.
    effect(() => {
      this._auth.user();
      this._auth.state();
      untracked(() => {
        for (const listener of this._listeners) {
          try {
            listener();
          } catch (error) {
            console.error('A sign-in listener failed', error);
          }
        }
      });
    });
  }

  /**
   * Once per page load, before the first page is drawn - and again from the
   * load error page's "Try again": reads the backend's sign-in settings, and
   * once they came, starts the library's sign-in (AnotokiAuth.init(): a
   * sign-in callback finished - the address the person came from back in the
   * address bar before the router reads it - or the stored session restored).
   * Never throws: `status` says how it went.
   */
  async init(): Promise<void> {
    this.status.set('loading');
    try {
      this._boot = await firstValueFrom(this._http.get<SurveyBootConfig>('/api/auth/config'));
    } catch (error) {
      this._boot = null;
      // Not set up: the family's gate says so (siteStatusInterceptor heard the same answer).
      if (error instanceof HttpErrorResponse && error.status === 503 && error.error?.code === 'not_set_up') {
        this.status.set('not-set-up');
        return;
      }
      console.error('The sign-in settings could not be loaded.', error);
      this.status.set('error');
      return;
    }

    const days = this._boot?.visitor_days ?? (this._boot as { visitorDays?: unknown } | null)?.['visitorDays'];
    this._visitorDays.set(typeof days === 'number' && Number.isInteger(days) && days >= 1 ? days : null);
    await this._auth.init();
    this.status.set(this._auth.state() === 'unavailable' ? 'error' : 'ready');
  }

  /**
   * What the library's AnotokiAuth reads as its boot configuration
   * (provideAnotokiAuth's `config`): what the server answered, or null. A
   * backend that does not say how long it keeps a visitor welcomes none (one
   * from before visitors): the library is told sign-in is required there, so
   * its guards and its interceptor agree with `visitorsWelcome`.
   */
  bootConfig(): SurveyBootConfig | null {
    const boot = this._boot;
    return boot !== null && this._visitorDays() === null ? { ...boot, login_required: true } : boot;
  }

  /**
   * The server refused somebody who is not signed in on a survey's route with
   * 401 sign_in_required: the IAM's switch was turned on since this page
   * loaded. The pages stop welcoming visitors until the next page load reads
   * the switch again (the library's interceptor calls it too).
   */
  noteLoginRequired(): void {
    this._auth.noteSignInRequired();
  }

  /**
   * To the IAM, and back to `returnTo` (this page, by default) when signed in
   * - its pages in the language the person reads here (the library's
   * `language`, shared/auth/auth.config.ts). It leaves only once the site's
   * writes on their way have their answers (the library's SavesInFlight): a
   * visitor's first answers bring the key the move after the sign-in needs.
   *
   * Answers true when the browser is on its way to the IAM. False when the
   * sign-in could not even start - the browser refuses the site's storage,
   * where the sign-in in progress is kept (`storage_unavailable`) - and then
   * `signInFailure` says so: signInOrShowWhy() opens the screen that says why.
   * `prompt: 'login'` asks for the password again even with a session at the
   * IAM (the backups' proof: a sign-in of the last ten minutes).
   */
  signIn(returnTo?: string, prompt?: 'login'): Promise<boolean> {
    return this._auth.signIn({ ...(returnTo !== undefined ? { returnTo } : {}), ...(prompt ? { prompt } : {}) });
  }

  /** Signs out everywhere - the IAM ends its session - and lands on this site's start page. */
  signOut(): void {
    void this._auth.signOut();
  }

  /** The IAM's account page: name, password, two-factor, sessions. */
  accountUrl(): string | null {
    return this._auth.accountUrl() || null;
  }

  /**
   * Saves the person's choice to their anotoki account - for every anotoki
   * site, not only this one: `theme`, `date_format`, `time_format` or
   * `language` (a code the IAM offers). One save at a time, for the person the
   * page is shown to. Rejects with the IAM's `code`: `invalid_request` for a
   * value it does not take (a language it does not offer), `network` when it
   * cannot be reached, `login_required` with nobody signed in.
   *
   * Callers save only while `preferences()` is not null: an IAM that sends
   * none has no such account to save to.
   */
  savePreferences(changes: AnotokiPreferenceChanges): Promise<AnotokiSavedPreferences> {
    return this._auth.savePreferences(changes);
  }

  /** Signed in, out or as somebody else, or a preference saved - in this tab or another. Returns an unsubscribe. */
  onAuthChange(listener: () => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }
}
