import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { type VisitorKeyStore } from '@anotoki/lib/auth';
import { ApiService, VisitorMove, toApiError } from '../../api/api.service';
import { adoptVisitorDrafts } from '../survey/drafts';
import { readStorage, writeStorage } from '../util/storage';
import { AuthService } from './auth.service';

/** Where this browser keeps its visitor key (localStorage: every tab of the site shares it). */
export const VISITOR_STORAGE_KEY = 'anotoki-survey:visitor';

/** A key as the server makes them: 32 random bytes, base64url without padding. Anything else is no key. */
const KEY_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/**
 * How long to wait before asking for the move again in this page load, after
 * no answer or a 5xx (a `Retry-After` wins). After the last one, the next
 * sign-in or page load asks again.
 */
export const MOVE_RETRY_MS: readonly number[] = [2_000, 10_000, 30_000];

/**
 * The visitor key: what lets somebody who is not signed in take surveys as
 * one visitor, and see which ones they have answered. The server makes it
 * with the first answers sent by somebody with neither a token nor a key, and
 * sends it once, in the `X-Visitor-Key` header of that answer; it keeps only
 * its hash. This browser keeps it in localStorage, and the anotoki family's
 * interceptor (@anotoki/lib/auth, which reads this store - provideAnotokiAuth's
 * `visitors`, shared/auth/auth.config.ts) sends it on the requests to
 * /api/surveys issued as a visitor's (ISSUED_AS), keeps the key a first
 * answer brings, and forgets one the server no longer knows.
 *
 * - **Kept, not sent, while the site requires a sign-in**
 *   (AuthService.loginRequired: the IAM's switch). The server would refuse it,
 *   and a 401 sign_in_required never forgets it: the next sign-in still moves
 *   what it answered, and switching the requirement off again within the
 *   days a visitor is kept brings it back.
 * - **Read at send time.** `current()` reads storage on every request, and a
 *   `storage` event keeps `key` in step, so every tab sends the key the
 *   browser holds now.
 * - **The first key stays.** Two tabs that each send first answers both get a
 *   key; the second never overwrites the stored one (`remember()`) - its
 *   answer stays in the results as a visitor of its own.
 * - **Forgotten** when the server no longer knows it (401 `visitor_unknown`:
 *   moved by another tab, or ended after `visitorDays` unseen) - `lost` says
 *   so, for the layout to say once - and after the move. Only while the
 *   stored key is still the one that was sent: another tab may hold a new one.
 * - **The move, after every sign-in** while a key is held (whatever the
 *   switch): `POST /api/visitor/move` with the token and the key, one at a
 *   time. On a 200 (found or not) the key is forgotten, `moves` counts up (the
 *   pages that show what was answered load it again) and `moved` holds what it
 *   did, for the layout's toast. No answer or a 5xx: the key stays and the
 *   move is asked again later (MOVE_RETRY_MS). A 422: not a key - forgotten.
 *   A 401: the sign-in ended meanwhile; the next one asks again.
 * - **The drafts** a visitor left become the person's at a sign-in
 *   (adoptVisitorDrafts(); before the first page by boot(), here for a sign-in
 *   in another tab).
 *
 * A private window that refuses storage: the key lives in memory for the tab.
 *
 * This service reads AuthService, never the other way round: the move is
 * started here, by an effect on the sign-in. boot() injects it before the
 * first page, so the effect is there for the first sign-in.
 */
@Injectable({ providedIn: 'root' })
export class VisitorKey implements VisitorKeyStore {
  private readonly _auth = inject(AuthService);
  private readonly _api = inject(ApiService);

  /** The key, when storage cannot keep it (or refused to). */
  private _memory: string | null = null;
  private _inMemory = false;
  private readonly _key = signal<string | null>(null);

  /** The key this browser holds, or null. */
  readonly key = this._key.asReadonly();
  /** The key was forgotten because the server no longer knew it: the layout says so, once (and sets it back). */
  readonly lost = signal(false);
  /** The last move that moved or kept anything - for the layout's toast, which sets it back to null. */
  readonly moved = signal<VisitorMove | null>(null);
  /** Counts the moves that finished: a page that shows what was answered loads it again when it changes. */
  private readonly _moves = signal(0);
  readonly moves = this._moves.asReadonly();

  private readonly _personId = computed(() => this._auth.person()?.id ?? null);
  private _moving = false;
  private _retries = 0;
  private _retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this._key.set(this._read());

    // Another tab stored or forgot the key.
    const onStorage = (event: StorageEvent) => {
      if (event.key === VISITOR_STORAGE_KEY || event.key === null) {
        this._key.set(this._read());
      }
    };
    globalThis.addEventListener?.('storage', onStorage);
    inject(DestroyRef).onDestroy(() => {
      globalThis.removeEventListener?.('storage', onStorage);
      if (this._retryTimer !== null) {
        clearTimeout(this._retryTimer);
      }
    });

    // Somebody signed in (here or in another tab): the visitor's drafts are theirs now.
    effect(() => {
      const personId = this._personId();
      if (personId !== null) {
        untracked(() => adoptVisitorDrafts(personId));
      }
    });

    // Signed in, with a key held: what the visitor answered becomes the person's.
    effect(() => {
      if (this._auth.signedIn() && this._key() !== null) {
        untracked(() => void this.moveIntoAccount());
      }
    });
  }

  /** The key held now, read from storage - what a request sends. */
  current(): string | null {
    const key = this._read();
    if (key !== untracked(this._key)) {
      this._key.set(key);
    }
    return key;
  }

  /**
   * A key the server just made. Kept only when this browser holds none: a key
   * already stored (another tab's, made a moment earlier) stays, and this one
   * is dropped.
   */
  remember(key: string): void {
    if (!KEY_SHAPE.test(key)) {
      return;
    }
    if (this._read() === null) {
      this._write(key);
      this.lost.set(false);
    }
    this._key.set(this._read());
  }

  /** Forgets `key` - when it is still the one held. `lost`: because the server no longer knew it. */
  forget(key: string, lost = false): void {
    if (this._read() === key) {
      this._write(null);
      if (lost) {
        this.lost.set(true);
      }
    }
    this._key.set(this._read());
  }

  /** The move after a sign-in (see the class). Safe to call at any time: it does nothing without a person and a key, or while one is on its way. */
  async moveIntoAccount(): Promise<void> {
    const key = this._read();
    if (this._moving || key === null || !this._auth.signedIn()) {
      return;
    }
    this._moving = true;
    if (this._retryTimer !== null) {
      clearTimeout(this._retryTimer);
      this._retryTimer = null;
    }
    try {
      const result = await this._api.moveVisitor(key);
      this._retries = 0;
      this.forget(key);
      this._moves.update((count) => count + 1);
      if (result.moved > 0 || result.kept > 0) {
        this.moved.set({ found: result.found, moved: result.moved, kept: result.kept });
      }
    } catch (failure) {
      const error = toApiError(failure);
      if (error.status === 0 || error.status >= 500) {
        this._askAgainLater(error.retryAfter);
      } else if (error.status === 422) {
        // Not a key the server could ever know: nothing to move, now or later.
        this.forget(key);
      }
      // A 401: the sign-in ended meanwhile - the next sign-in asks again (the effect).
    } finally {
      this._moving = false;
    }
  }

  private _askAgainLater(retryAfter: number | null): void {
    if (this._retries >= MOVE_RETRY_MS.length) {
      return;
    }
    const delay = retryAfter !== null && retryAfter > 0 ? Math.min(retryAfter, 60) * 1000 : MOVE_RETRY_MS[this._retries];
    this._retries++;
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null;
      void this.moveIntoAccount();
    }, delay);
  }

  private _read(): string | null {
    const value = this._inMemory ? this._memory : readStorage(VISITOR_STORAGE_KEY);
    return value !== null && KEY_SHAPE.test(value) ? value : null;
  }

  private _write(value: string | null): void {
    this._memory = value;
    if (this._inMemory) {
      return;
    }
    writeStorage(VISITOR_STORAGE_KEY, value);
    if (readStorage(VISITOR_STORAGE_KEY) !== value) {
      // Storage would not keep it (switched off, a full quota): from now on the key lives in memory for this tab.
      this._inMemory = true;
    }
  }
}
