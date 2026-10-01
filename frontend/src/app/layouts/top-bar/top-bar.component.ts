import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, Signal, afterNextRender, computed, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminStore } from '../../core/admin/admin-store.service';
import { LocalizationDrafts } from '../../core/admin/localization-drafts.service';
import { AuthService } from '../../core/auth/auth.service';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
import { BrandComponent } from '../../ui/brand/brand.component';
import { ButtonComponent } from '../../ui/button/button.component';
import { ConfirmService } from '../../ui/confirm/confirm.service';
import { IconComponent } from '../../ui/icon/icon.component';
import { LanguageSwitcherComponent } from '../../ui/language-switcher/language-switcher.component';
import { SpinnerComponent } from '../../ui/spinner/spinner.component';
import { ThemeToggleComponent } from '../../ui/theme-toggle/theme-toggle.component';

/**
 * The bar across the top of every page: the mark, the language (where people
 * take surveys, and only when there is more than one - the admin area is
 * English), the theme, and who is signed in - their menu with their anotoki
 * account, the way into the admin area for the people who write surveys
 * (EDITOR, ADMIN) and signing out - or the button to sign in.
 *
 * The menu is the IAM's own (layouts/shell there): a menu button, arrow keys
 * between its items, Escape and a click outside to close it.
 *
 * The bar is shared by both areas and every word of it is a key: where people
 * take surveys it reads in their language, and in the admin area in English -
 * with no special case here, because the translation service answers in
 * English there (`effectiveLanguage`).
 */
@Component({
  selector: 'app-top-bar',
  imports: [RouterLink, BrandComponent, ButtonComponent, IconComponent, LanguageSwitcherComponent, SpinnerComponent, ThemeToggleComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'closeMenu(true)',
  },
})
export class TopBarComponent {
  /** Which part of the site the page belongs to: what the mark links to, and where the other part is. */
  readonly area = input<'survey' | 'admin'>('survey');
  /** A narrower bar, for pages whose content is narrow too. */
  readonly width = input<'wide' | 'narrow'>('wide');

  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(TranslationService);
  private readonly _store = inject(AdminStore);
  private readonly _drafts = inject(LocalizationDrafts);
  private readonly _confirm = inject(ConfirmService);
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _injector = inject(Injector);

  protected readonly menuOpen = signal(false);
  protected readonly signingOut = signal(false);
  protected readonly initial = computed(() => (this.auth.person()?.name.trim()[0] ?? '?').toUpperCase());
  protected readonly accountUrl = computed(() => (this.auth.signedIn() ? this.auth.accountUrl() : null));
  private readonly _narrow = this._matches('(max-width: 380px)');
  private readonly _narrowForChooser = this._matches('(max-width: 520px)');
  private readonly _narrowSignedOut = this._matches('(max-width: 420px)');
  /**
   * The narrowest phones: the mark without its words, so the person's menu
   * still fits beside it. With the language chooser in the bar the words go
   * sooner - measured in the browser: signed out, in Slovak ("Prihlásiť sa"),
   * the bar with them needs 500 px (in English 470); narrower than that, the
   * sign-in button is what gets squeezed. Signed out with no chooser (the
   * admin area once a session has ended, or a site offering one language)
   * the bar with them needs some 400 px in English: the words go up to 420.
   */
  protected readonly tiny = computed(
    () => this._narrow() || (this._narrowForChooser() && this.area() === 'survey' && this.i18n.languages().length > 1) || (this._narrowSignedOut() && this.auth.person() === null),
  );

  private readonly _menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
  private readonly _menu = viewChild<ElementRef<HTMLElement>>('menu');

  /** Whether the screen matches a media query, kept current while the bar is there. */
  private _matches(media: string): Signal<boolean> {
    const matches = signal(false);
    const query = globalThis.matchMedia?.(media);
    if (query) {
      const update = () => matches.set(query.matches);
      update();
      query.addEventListener('change', update);
      inject(DestroyRef).onDestroy(() => query.removeEventListener('change', update));
    }
    return matches.asReadonly();
  }

  /** To the IAM, whose pages open in the language the person reads here - theirs, even from the admin area. */
  protected signIn(): void {
    this.auth.signIn(undefined, this.i18n.language());
  }

  protected toggleMenu(): void {
    if (this.menuOpen()) {
      this.closeMenu(true);
    } else {
      this.menuOpen.set(true);
      // Into the menu once it is drawn, as a menu button is expected to do. Drawn
      // means after the next render: with no zone, a microtask runs before it.
      afterNextRender(() => this._menuItems()[0]?.focus(), { injector: this._injector });
    }
  }

  closeMenu(returnFocus: boolean): void {
    if (!this.menuOpen()) {
      return;
    }
    this.menuOpen.set(false);
    if (returnFocus) {
      this._menuButton()?.nativeElement.focus();
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    const menuRoot = this._host.nativeElement.querySelector('.user-menu');
    if (this.menuOpen() && menuRoot && !menuRoot.contains(event.target as Node)) {
      this.closeMenu(false);
    }
  }

  protected onMenuKeydown(event: KeyboardEvent): void {
    const items = this._menuItems();
    const index = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === 'ArrowDown') {
      next = (index + 1) % items.length;
    } else if (event.key === 'ArrowUp') {
      next = (index - 1 + items.length) % items.length;
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = items.length - 1;
    } else if (event.key === 'Tab') {
      this.closeMenu(false);
      return;
    }
    if (next >= 0) {
      event.preventDefault();
      items[next]?.focus();
    }
  }

  /**
   * Signs out everywhere (the IAM ends its session) - after the changes still
   * waiting are saved. What would be lost is said first, in one question:
   * changes to a survey that cannot be saved (refused, or in conflict) -
   * signed out, they could not be saved any more - and what is typed on the
   * admin area's Translations and Languages pages and not saved, which only
   * its Save buttons save. A session that ends by itself keeps those drafts
   * for the person's return; a sign-out asked for here, and answered "sign
   * out anyway", gives them up - the next person at this browser starts clean.
   */
  protected async signOut(): Promise<void> {
    this.signingOut.set(true);
    const surveysSaved = await this._store.flushAll();
    const draftsWaiting = this._drafts.count() > 0;
    if (!surveysSaved || draftsWaiting) {
      this.closeMenu(false);
      // Finished sentences when asked, in the language on the page; a question is not worded again.
      // Each message is a whole sentence (or two): with both to say, one after the other.
      const messages = [...(surveysSaved ? [] : [this.i18n.t('topbar.signOutUnsaved.message')]), ...(draftsWaiting ? [this.i18n.t('topbar.signOutUnsaved.strings')] : [])];
      const sure = await this._confirm.ask({
        title: this.i18n.t('topbar.signOutUnsaved.title'),
        message: messages.join(' '),
        confirmLabel: this.i18n.t('topbar.signOutUnsaved.confirm'),
        cancelLabel: this.i18n.t('topbar.signOutUnsaved.stay'),
        tone: 'danger',
      });
      if (!sure) {
        this.signingOut.set(false);
        return;
      }
      this._drafts.clear();
    }
    this.auth.signOut();
  }

  private _menuItems(): HTMLElement[] {
    const menu = this._menu()?.nativeElement;
    return menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
  }
}
