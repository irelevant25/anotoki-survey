import { DOCUMENT, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { ToastService } from '../../ui/toast/toast.service';
import { AuthService } from '../auth/auth.service';
import { TranslationService } from '../i18n/translation.service';
import { readStorage, writeStorage } from '../util/storage';

export type ThemeMode = 'light' | 'dark' | 'auto';
export type ResolvedTheme = 'light' | 'dark';

/** Shared with public/theme-boot.js, which applies the same choice before the app has loaded. */
const THEME_KEY = 'anotoki-survey:theme';

/** The browser chrome colour, matched to each theme's page background. */
const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#f3f6fb', dark: '#070d1c' };

/**
 * Light, dark, or whatever the operating system says.
 *
 * The resolved theme is written to `<html data-theme>`, which is what every
 * colour token in styles.scss keys on. `auto` keeps listening to the system
 * setting while the page is open, so switching the OS to dark at sunset turns
 * the page with it.
 *
 * Signed in, the theme is the account's (IAM migration 015, the owner's
 * decision of 2026-10-06): one theme for every anotoki site and every part of
 * each - the admin panel here too - read from the account and saved to it from
 * the toggle in the top bar. Signed out - a visitor - or signed in through an
 * IAM that sends no preferences, it is this device's, as it always was. Either
 * way the last one shown is kept in localStorage, where public/theme-boot.js
 * reads it before first paint, so a dark choice never flashes light while the
 * bundle and the account load.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _document = inject(DOCUMENT);
  private readonly _auth = inject(AuthService);
  private readonly _i18n = inject(TranslationService);
  private readonly _toast = inject(ToastService);
  private readonly _media = globalThis.matchMedia?.('(prefers-color-scheme: dark)');

  private readonly _systemDark = signal(this._media?.matches ?? false);

  /** The account's theme while somebody is signed in and the IAM sends it; null otherwise. */
  private readonly _accountTheme = computed(() => this._auth.preferences()?.theme ?? null);

  /** A theme save is on its way. */
  private _saving = false;
  /** The latest theme chosen while it is: saved once it settles. */
  private _next: ThemeMode | null = null;

  readonly mode = signal<ThemeMode>(storedMode());
  readonly resolved = computed<ResolvedTheme>(() => {
    const mode = this.mode();
    return mode === 'auto' ? (this._systemDark() ? 'dark' : 'light') : mode;
  });

  constructor() {
    this._media?.addEventListener('change', (event) => this._systemDark.set(event.matches));

    effect(() => {
      const theme = this.resolved();
      const root = this._document.documentElement;
      root.dataset['theme'] = theme;
      root.style.colorScheme = theme;
      this._document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
    });

    // The account's theme, the moment it is known: at sign-in, and whenever
    // the account is read again - a refresh after a change on another anotoki
    // site, a save in another tab. Not while a choice made here is still being
    // saved: the account answers with the earlier one first, and the page
    // would flick back to it.
    effect(() => {
      const theme = this._accountTheme();
      if (theme && !this._saving) {
        untracked(() => this._show(theme));
      }
    });
  }

  /**
   * The person's choice: shown at once and, while somebody is signed in with
   * an account that has a theme, saved to it, so every anotoki site follows.
   *
   * One save at a time, and the last choice is the one saved: two saves in
   * flight together could be handled in either order and leave the account on
   * a theme the page no longer shows. A save that is refused puts the
   * account's theme back on the screen, and a toast says so.
   */
  set(mode: ThemeMode): void {
    this._show(mode);
    if (this._saving) {
      this._next = mode;
      return;
    }
    this._save(mode);
  }

  private _save(mode: ThemeMode): void {
    const accountTheme = this._accountTheme();
    if (accountTheme === null || accountTheme === mode) {
      return;
    }
    this._saving = true;
    /** The save is over: the next choice, if one waits, is saved now - and then this one's refusal is not news. */
    const settle = (): boolean => {
      const next = this._next;
      this._saving = false;
      this._next = null;
      if (next !== null) {
        this._save(next);
      }
      return next !== null;
    };
    this._auth.savePreferences({ theme: mode }).then(
      () => void settle(),
      () => {
        if (!settle()) {
          const current = this._accountTheme();
          if (current) {
            this._show(current);
          }
          // A finished sentence when raised, in the language on the page - English in the admin panel.
          this._toast.error(this._i18n.t('theme.notSaved'));
        }
      },
    );
  }

  private _show(mode: ThemeMode): void {
    this.mode.set(mode);
    writeStorage(THEME_KEY, mode === 'auto' ? null : mode);
  }
}

function storedMode(): ThemeMode {
  const value = readStorage(THEME_KEY);
  return value === 'light' || value === 'dark' ? value : 'auto';
}
