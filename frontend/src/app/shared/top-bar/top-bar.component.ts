import { ChangeDetectionStrategy, Component, Injector, computed, inject, input, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { FeedbackUnread } from '@anotoki/lib/admin';
import { SiteStatus } from '@anotoki/lib/migrations';
import { TopBarComponent as AnotokiTopBarComponent, type TopBarBrand, type TopBarLink, type TopBarMenuItem, type TopBarPerson } from '@anotoki/lib/shell';
import { TranslationService } from '@anotoki/lib/translations';
import type { LocalizationDrafts } from '@anotoki/lib/translations/admin';
import { ConfirmService } from '@anotoki/lib/ui/dialog';
import { AdminStore } from '../admin/admin-store.service';
import { AuthService } from '../auth/auth.service';
import { signInOrShowWhy } from '../auth/auth.config';
import { MIGRATIONS_PATH } from '../migrations';
import { SYSTEM_PATH, SYSTEM_PATHS } from '../../sites/admin/system/system-pages';

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
  /** A count beside it: the feedback messages nobody opened yet (System, where the Feedback page is). */
  badge?: 'feedback';
}

/** Where people take surveys: the one section, the list of open surveys. */
export const SURVEY_LINKS: readonly BarLink[] = [{ key: 'topbar.surveys', path: '/', under: [] }];
/** The admin area's sections: System for an ADMIN alone (it is lit on each of its pages too). */
export const ADMIN_LINKS: readonly BarLink[] = [
  { key: 'topbar.surveys', path: '/admin', under: ['/admin/surveys/'] },
  { key: 'topbar.translations', path: '/admin/translations', under: [] },
  { key: 'topbar.languages', path: '/admin/languages', under: [] },
  { key: null, label: 'System', path: SYSTEM_PATH, under: SYSTEM_PATHS, adminOnly: true, badge: 'feedback' },
];

/** While the database waits for a migration: the Migrations page alone - the one page of the site that works then (an ADMIN's). */
export const UPDATE_LINKS: readonly BarLink[] = [{ key: null, label: 'Migrations', path: MIGRATIONS_PATH, under: [], adminOnly: true }];

/** Up to this width the bar is a phone's: the links and the person's menu fold into one menu button. */
export const PHONE_BAR_MAX = 760;

/**
 * Up to this width the admin panel's wordmark leaves out "anotoki": "survey" with "admin panel" small under it, as
 * on a phone - with "anotoki" and the three links the bar overflowed at 761 px. (The person's name shows from the
 * next pixel on, everywhere: the kit's default, PHONE_BAR_MAX + 201.)
 */
export const NARROW_BAR_MAX = 960;

/**
 * The bar across the top of every page: the anotoki family's one bar
 * (<anotoki-top-bar>, @anotoki/lib/shell), told here what is this site's -
 * where its roles, its status and its words meet the bar.
 *
 * In one row, in the family's order: the brand (the mark, "anotoki" and the
 * site's name, linking home - in the admin area "anotoki survey · admin
 * panel"); the site's sections as links; then the language (where people
 * take surveys, and only when there is more than one - the admin area is
 * English), the theme, and the person's menu (name, address, role; their
 * anotoki account; the way into the admin panel for the people who write
 * surveys, or back to the surveys from it; signing out) - or Sign in. On a
 * phone (up to PHONE_BAR_MAX) the brand is the mark and the site's name, and
 * the links and the person's menu (or Sign in) are inside one menu button.
 * The menus, their keys and the widths are the kit's.
 *
 * Every word is a key: where people take surveys it reads in their language,
 * in the admin area in English - with no special case here, because the
 * translation service answers in English there (`effectiveLanguage`). The
 * words the family has for a bar - the person's role, "Your anotoki account",
 * "Admin panel" - are the anotoki library's keys (`anotoki.topbar.*`), read
 * from the site's database as the kit reads its own (shared/kit.ts): one string
 * for each, whichever bar says it. One
 * exception: the admin panel's System link (an ADMIN's alone: the way to the
 * people, the error and audit logs, the backups and the migrations - lit on
 * each of those pages) is its English word, as the admin panel's pages are -
 * it came after the bar's keys, and no reader ever sees it in another
 * language. While a database update waits the Migrations link is the only one
 * an ADMIN's bar shows in the admin panel (SiteStatus, @anotoki/lib/migrations):
 * the Migrations page is the one page of the site that works then. Beside
 * System, an ADMIN reads how many feedback messages nobody opened yet (the
 * family's FeedbackUnread, asked by the admin layout; "System, 2 new feedback
 * messages" to a screen reader) - no mail is sent for one.
 */
@Component({
  selector: 'app-top-bar',
  imports: [AnotokiTopBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.scss',
})
export class TopBarComponent {
  /** Which part of the site the page belongs to: what the brand links to, the links, and where the other part is. */
  readonly area = input<'survey' | 'admin'>('survey');
  /** A narrower bar, for pages whose content is narrow too. */
  readonly width = input<'wide' | 'narrow'>('wide');

  private readonly _auth = inject(AuthService);
  private readonly _i18n = inject(TranslationService);
  private readonly _status = inject(SiteStatus);
  private readonly _store = inject(AdminStore);
  private readonly _injector = inject(Injector);
  private readonly _confirm = inject(ConfirmService);
  private readonly _router = inject(Router);
  private readonly _unread = inject(FeedbackUnread);
  private readonly _bar = viewChild.required(AnotokiTopBarComponent);

  protected readonly phoneMax = PHONE_BAR_MAX;
  /** The admin panel's longer wordmark is short up to NARROW_BAR_MAX; everywhere else on a phone only. */
  protected readonly shortBrandMax = computed(() => (this.area() === 'admin' ? NARROW_BAR_MAX : null));
  protected readonly chooser = computed(() => this.area() === 'survey' && this._i18n.languages().length > 1);

  protected readonly brand = computed<TopBarBrand>(() =>
    this.area() === 'admin'
      ? { area: this._i18n.t('brand.area'), panel: this._i18n.t('brand.adminPanel'), link: '/admin', label: this._i18n.t('topbar.homeAdmin') }
      : { area: this._i18n.t('brand.area'), link: '/', label: this._i18n.t('topbar.home') },
  );

  /** The sections of the area the page is in, for the person who is there. */
  private readonly _sections = computed(() => {
    if (this.area() !== 'admin') {
      return SURVEY_LINKS;
    }
    // While a database update waits the Migrations page is the one page of the admin panel that works (an ADMIN's).
    if (this._status.state() === 'update-pending' && this._auth.isAdmin()) {
      return UPDATE_LINKS;
    }
    return ADMIN_LINKS.filter((link) => !link.adminOnly || this._auth.isAdmin());
  });
  protected readonly links = computed<TopBarLink[]>(() =>
    this._sections().map((link) => ({
      id: link.path,
      label: link.key ? this._i18n.t(link.key) : (link.label ?? link.path),
      path: link.path,
      under: link.under,
      ...(link.badge === 'feedback' ? this._feedbackBadge() : {}),
    })),
  );

  /** The feedback messages nobody opened yet, beside System - in English, as the admin panel is; nothing for none. */
  private readonly _feedbackBadge = computed<Pick<TopBarLink, 'badge' | 'badgeLabel'>>(() => {
    const count = this._unread.count() ?? 0;
    return count > 0 ? { badge: count, badgeLabel: `${count} new feedback ${count === 1 ? 'message' : 'messages'}` } : {};
  });

  protected readonly person = computed<TopBarPerson | null>(() => {
    const me = this._auth.person();
    if (!me) {
      return null;
    }
    const role = this._auth.isAdmin() ? this._i18n.t('anotoki.topbar.roleAdmin') : this._auth.isStaff() ? this._i18n.t('anotoki.topbar.roleEditor') : null;
    return { name: me.name, email: this._auth.user()?.email || null, role };
  });

  /** Between the menu's head and Sign out: the anotoki account (a new tab), and the way into the admin panel - or back from it. */
  protected readonly menuItems = computed<TopBarMenuItem[]>(() => {
    const items: TopBarMenuItem[] = [];
    const account = this._auth.signedIn() ? this._auth.accountUrl() : null;
    if (account) {
      items.push({ id: 'account', label: this._i18n.t('anotoki.topbar.account'), icon: 'user', href: account, newTab: true });
    }
    if (this._auth.isStaff()) {
      items.push(
        this.area() === 'admin'
          ? { id: 'surveys', label: this._i18n.t('topbar.backToSurveys'), icon: 'arrowLeft', path: '/' }
          : { id: 'admin', label: this._i18n.t('anotoki.topbar.admin'), icon: 'shield', path: '/admin' },
      );
    }
    return items;
  });

  /** To the IAM, whose pages open in the language the person reads here - theirs, even from the admin area; the screen that says why if it cannot start. */
  protected readonly signIn = (): Promise<void> => signInOrShowWhy(this._auth, this._router);

  /** The bar's Sign out: a promise, so its item waits ("Saving…") while the changes still waiting are saved. */
  protected readonly signOut = (): Promise<void> => this._signOutAfterSaves();

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
  private async _signOutAfterSaves(): Promise<void> {
    const surveysSaved = await this._store.flushAll();
    const drafts = await this._localizationDrafts();
    const draftsWaiting = (drafts?.count() ?? 0) > 0;
    if (!surveysSaved || draftsWaiting) {
      this._bar().closeMenu(false);
      // Finished sentences when asked, in the language on the page; a question is not worded again.
      // Each message is a whole sentence (or two): with both to say, one after the other.
      const messages = [...(surveysSaved ? [] : [this._i18n.t('topbar.signOutUnsaved.message')]), ...(draftsWaiting ? [this._i18n.t('topbar.signOutUnsaved.strings')] : [])];
      const sure = await this._confirm.ask({
        title: this._i18n.t('topbar.signOutUnsaved.title'),
        message: messages.join(' '),
        confirmLabel: this._i18n.t('topbar.signOutUnsaved.confirm'),
        cancelLabel: this._i18n.t('topbar.signOutUnsaved.stay'),
        tone: 'danger',
      });
      if (!sure) {
        return;
      }
      drafts?.clear();
    }
    this._auth.signOut();
  }

  /**
   * What is typed on the admin panel's Translations and Languages pages and not
   * saved: the anotoki library's drafts (LocalizationDrafts, kept in this tab
   * as `anotoki-survey:localization-drafts`). They come with the pages'
   * entry point (@anotoki/lib/translations/admin), which the first load never
   * carries - so they are asked for here, and only of somebody who may have
   * typed some (EDITOR, ADMIN): in memory already when those pages were open in
   * this page load, read from the tab otherwise. When the entry point cannot be
   * had (offline), nothing is asked: the drafts stay in the tab, as a session
   * that ends keeps them, and the sign-out goes on.
   */
  private async _localizationDrafts(): Promise<LocalizationDrafts | null> {
    if (!this._auth.isStaff()) {
      return null;
    }
    try {
      const pages = await import('@anotoki/lib/translations/admin');
      return this._injector.get(pages.LocalizationDrafts);
    } catch {
      return null;
    }
  }
}
