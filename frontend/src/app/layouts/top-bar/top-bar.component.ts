import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, Signal, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { AdminStore } from '../../core/admin/admin-store.service';
import { LocalizationDrafts } from '../../core/admin/localization-drafts.service';
import { AuthService, MIGRATIONS_PATH } from '../../core/auth/auth.service';
import { signInOrSayWhy } from '../../core/auth/sign-in-failure';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
import { BrandComponent } from '../../ui/brand/brand.component';
import { ButtonComponent } from '../../ui/button/button.component';
import { ConfirmService } from '../../ui/confirm/confirm.service';
import { IconComponent } from '../../ui/icon/icon.component';
import { LanguageSwitcherComponent } from '../../ui/language-switcher/language-switcher.component';
import { SpinnerComponent } from '../../ui/spinner/spinner.component';
import { ThemeToggleComponent } from '../../ui/theme-toggle/theme-toggle.component';
import { ToastService } from '../../ui/toast/toast.service';

/**
 * A section of the site in the bar: its words, where it goes, and the addresses under it that are part of it.
 *
 * Its words are a key (`key`) - or, for a section of the admin panel that came after the bar's keys, the English
 * itself (`label`): the admin panel is English, written in the code.
 */
export interface BarLink {
  key: string | null;
  /** The words when there is no key: English, for a section of the admin panel. */
  label?: string;
  /** For an ADMIN alone (the server refuses everybody else). */
  adminOnly?: boolean;
  path: string;
  /** Address beginnings that belong to the section too (the editor of a survey is under Surveys). */
  under: readonly string[];
}

/** Where people take surveys: the one section, the list of open surveys. */
export const SURVEY_LINKS: readonly BarLink[] = [{ key: 'topbar.surveys', path: '/', under: [] }];
/** The admin area's sections: Migrations for an ADMIN alone - and while the database waits for a migration, nothing else. */
export const ADMIN_LINKS: readonly BarLink[] = [
  { key: 'topbar.surveys', path: '/admin', under: ['/admin/surveys/'] },
  { key: 'topbar.translations', path: '/admin/translations', under: [] },
  { key: 'topbar.languages', path: '/admin/languages', under: [] },
  { key: null, label: 'Migrations', path: MIGRATIONS_PATH, under: [], adminOnly: true },
];

/** Up to this width the bar is a phone's: the links and the person's menu fold into one menu button. */
export const PHONE_BAR_MAX = 760;

/**
 * Up to this width the person's button is the initial alone (the same number in the styles) - and the admin panel's
 * wordmark leaves out "anotoki": "survey" with "admin panel" small under it, as on a phone. With "anotoki" and the
 * three links the bar overflowed at 761 px.
 */
export const NARROW_BAR_MAX = 960;

/** Which of the bar's two menus is open: the person's (account) or the phone's (links and account). */
type OpenMenu = 'account' | 'phone' | null;

/**
 * The bar across the top of every page - the anotoki family's one bar, in one
 * row, in this order: the brand (the mark, "anotoki" and the site's name,
 * linking home - in the admin area "anotoki survey · admin panel"); the site's sections as links; then the language (where
 * people take surveys, and only when there is more than one - the admin area
 * is English), the theme, and the person's menu (name, address, role; their
 * anotoki account; the way into the admin panel for the people who write
 * surveys, or back to the surveys from it; signing out) - or the button to
 * sign in.
 *
 * On a phone (up to PHONE_BAR_MAX) the brand is the mark and the site's name,
 * and the links and the person's menu (or Sign in) are inside one menu button
 * at the right, after the language and the theme.
 *
 * Both menus are the IAM's own pattern (layouts/shell there): a menu button,
 * focus into the menu when it opens, arrow keys, Home and End between its
 * items, Escape and a click outside to close it - Escape gives the focus back
 * to the button. Tab and Shift+Tab close it with the focus on the button too,
 * so the next Tab moves on from there (not to <body>).
 *
 * The bar is shared by both areas and every word of it is a key: where people
 * take surveys it reads in their language, and in the admin area in English -
 * with no special case here, because the translation service answers in
 * English there (`effectiveLanguage`). One exception: the admin panel's
 * Migrations link (an ADMIN's alone) is its English word, as the admin panel's
 * pages are - it came after the bar's keys, and no reader ever sees it in
 * another language. While the database waits for a migration it is the only
 * link an ADMIN's bar shows in the admin panel (AuthService.onlyMigrations).
 */
@Component({
  selector: 'app-top-bar',
  imports: [NgTemplateOutlet, RouterLink, BrandComponent, ButtonComponent, IconComponent, LanguageSwitcherComponent, SpinnerComponent, ThemeToggleComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'closeMenu(true)',
  },
})
export class TopBarComponent {
  /** Which part of the site the page belongs to: what the brand links to, the links, and where the other part is. */
  readonly area = input<'survey' | 'admin'>('survey');
  /** A narrower bar, for pages whose content is narrow too. */
  readonly width = input<'wide' | 'narrow'>('wide');

  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(TranslationService);
  private readonly _router = inject(Router);
  private readonly _store = inject(AdminStore);
  private readonly _drafts = inject(LocalizationDrafts);
  private readonly _confirm = inject(ConfirmService);
  private readonly _toast = inject(ToastService);
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _injector = inject(Injector);

  /** Which menu is open, if one is. */
  protected readonly openMenu = signal<OpenMenu>(null);
  protected readonly signingOut = signal(false);
  protected readonly initial = computed(() => (this.auth.person()?.name.trim()[0] ?? '?').toUpperCase());
  protected readonly accountUrl = computed(() => (this.auth.signedIn() ? this.auth.accountUrl() : null));
  /** The bar of a phone: the links and the person's menu inside the menu button. */
  protected readonly phone = this._matches(`(max-width: ${PHONE_BAR_MAX}px)`);
  private readonly _narrow = this._matches(`(max-width: ${NARROW_BAR_MAX}px)`);
  /** "anotoki" in the wordmark: not on a phone, nor beside the admin panel's longer one on a narrow bar. */
  protected readonly brandName = computed(() => !this.phone() && !(this.area() === 'admin' && this._narrow()));
  protected readonly links = computed(() => {
    if (this.area() !== 'admin') {
      return SURVEY_LINKS;
    }
    // While the database waits for a migration the Migrations page is the one page of the admin panel that works.
    if (this.auth.onlyMigrations()) {
      return ADMIN_LINKS.filter((link) => link.path === MIGRATIONS_PATH);
    }
    return ADMIN_LINKS.filter((link) => !link.adminOnly || this.auth.isAdmin());
  });
  protected readonly chooser = computed(() => this.area() === 'survey' && this.i18n.languages().length > 1);

  /** The address of the page, without its query: which link is the page's. */
  private readonly _path = toSignal(
    this._router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => this._router.url),
    ),
    { initialValue: this._router.url },
  );
  private readonly _here = computed(() => this._path().split(/[?#]/)[0] || '/');

  private readonly _accountButton = viewChild<ElementRef<HTMLButtonElement>>('accountButton');
  private readonly _phoneButton = viewChild<ElementRef<HTMLButtonElement>>('phoneButton');
  private readonly _menu = viewChild<ElementRef<HTMLElement>>('menu');

  constructor() {
    // From a phone's bar to a desktop's (a turned tablet, a wider window): the open menu would belong to neither.
    effect(() => {
      this.phone();
      untracked(() => this.closeMenu(false));
    });
  }

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

  /** The page is this link's own address. */
  protected isPage(link: BarLink): boolean {
    return this._here() === link.path;
  }

  /** The page is in this link's section: its own address or one under it. */
  protected inSection(link: BarLink): boolean {
    const here = this._here();
    return here === link.path || link.under.some((start) => here.startsWith(start));
  }

  /** To the IAM, whose pages open in the language the person reads here - theirs, even from the admin area; a toast if it cannot start. */
  protected signIn(): void {
    this.closeMenu(false);
    void signInOrSayWhy(this.auth, this.i18n, this._toast);
  }

  protected toggleMenu(which: 'account' | 'phone'): void {
    if (this.openMenu() === which) {
      this.closeMenu(true);
      return;
    }
    this.openMenu.set(which);
    // Into the menu once it is drawn, as a menu button is expected to do. Drawn
    // means after the next render: with no zone, a microtask runs before it.
    afterNextRender(() => this._menuItems()[0]?.focus(), { injector: this._injector });
  }

  /** Closes the open menu; `returnFocus`: back to the button that opened it (Escape, Tab, the button again). */
  closeMenu(returnFocus: boolean): void {
    const open = this.openMenu();
    if (!open) {
      return;
    }
    this.openMenu.set(null);
    if (returnFocus) {
      (open === 'account' ? this._accountButton() : this._phoneButton())?.nativeElement.focus();
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    const open = this.openMenu();
    if (!open) {
      return;
    }
    const root = this._host.nativeElement.querySelector(open === 'account' ? '.user-menu' : '.phone-menu');
    if (!root || !root.contains(event.target as Node)) {
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
      // Tab (or Shift+Tab) leaves the menu from its button. Left to the browser,
      // the focus would move to the next item of a menu still drawn - with no
      // zone it is removed only at the next render - and then fall to <body>.
      event.preventDefault();
      this.closeMenu(true);
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
