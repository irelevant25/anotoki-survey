import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { FeedbackUnread } from '@anotoki/lib/admin';
import { AdminFrameComponent, type AdminFrameBrand, type AdminFrameLink, type AdminFramePerson, type SideNavGroup, type SideNavLink } from '@anotoki/lib/admin/frame';
import { SiteFooterComponent } from '@anotoki/lib/footer';
import { SiteStatus } from '@anotoki/lib/migrations';
import { ThemeToggleComponent } from '@anotoki/lib/shell';
import { TranslationService } from '@anotoki/lib/translations';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { EmptyStateComponent } from '@anotoki/lib/ui/empty-state';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { filter, map } from 'rxjs';
import { signInOrShowWhy } from '../../shared/auth/auth.config';
import { AuthService } from '../../shared/auth/auth.service';
import { SignOut } from '../../shared/auth/sign-out.service';
import { Changelog } from '../../shared/changelog/changelog.service';
import { type SurveyIconName } from '../../shared/kit';
import { MIGRATIONS_PATH } from '../../shared/migrations';
import { SYSTEM_PATH, SYSTEM_PATHS } from './system/system-pages';

/** A page of the admin panel in the frame's column: its words, where it is, and the addresses under it that are part of it. */
export interface PanelPage {
  id: string;
  /** Its words: a key of the site's - the words the top bar linked it with - or English, for a page that came after them. */
  key?: string;
  label?: string;
  path: string;
  icon: SurveyIconName;
  /** For an ADMIN alone (the server refuses everybody else). */
  adminOnly?: boolean;
  /** Address beginnings that belong to it too (a survey's editor is under Surveys). */
  under: readonly string[];
  /** A count beside it: the feedback messages nobody opened yet (System, where the Feedback page is). */
  badge?: 'feedback';
}

/** The admin panel's pages - the ones its top bar linked: System for an ADMIN alone, the page's on each System page too. */
export const PANEL_PAGES: readonly PanelPage[] = [
  { id: 'surveys', key: 'topbar.surveys', path: '/admin', icon: 'survey', under: ['/admin/surveys/'] },
  { id: 'translations', key: 'topbar.translations', path: '/admin/translations', icon: 'fileText', under: [] },
  { id: 'languages', key: 'topbar.languages', path: '/admin/languages', icon: 'globe', under: [] },
  { id: 'system', label: 'System', path: SYSTEM_PATH, icon: 'sliders', under: SYSTEM_PATHS, adminOnly: true, badge: 'feedback' },
];

/** While the database waits for a migration: the Migrations page alone - the one page of the site that works then (an ADMIN's). */
export const UPDATE_PAGES: readonly PanelPage[] = [{ id: 'migrations', label: 'Migrations', path: MIGRATIONS_PATH, icon: 'layers', under: [], adminOnly: true }];

/**
 * The admin panel's frame: the anotoki family's (<anotoki-admin-frame>,
 * @anotoki/lib/admin/frame, anotoki-lib 0.10.0 - the owner's request of
 * 2026-10-24: every admin panel looks like genshin's, so that it is never
 * mistaken for the site). On a computer a column on the left - the panel's
 * name ("anotoki survey · admin panel", its home the surveys), who is signed
 * in (the name and the token's address, shown, never kept), "Back to the
 * surveys", Sign out (the site's one, SignOut - the public site's top bar
 * takes it too), the family's theme switch (the account's theme), then the
 * panel's pages - and the page on the right, the family's footer under it:
 * the version and What's new, Feedback and About · Support · Terms · Privacy ·
 * Contact, in English like the rest of the panel. On a phone (up to 860 px,
 * the frame's) a row with the name and Menu, everything of the column in the
 * drawer. No top bar: the bar is the public site's.
 *
 * The pages are the ones the bar linked - Surveys, Translations, Languages,
 * and System for an ADMIN, with how many feedback messages nobody opened yet
 * beside it (the family's FeedbackUnread: asked as the panel opens, and again
 * when an ADMIN signs in here - never while the site cannot run). While a
 * database update waits an ADMIN's column links Migrations alone: the one page
 * of the site that works then (SiteStatus, @anotoki/lib/migrations); applied,
 * every page again. A page is marked in its section as the bar marked it: a
 * survey's editor in Surveys, each System page in System. Feedback only while
 * the site runs: while an update waits this frame stands round the Migrations
 * page alone, for the ADMIN who applies it, and the server refuses a message
 * then (503 update_pending), so the footer offers none.
 *
 * It has three states:
 *
 * - staff (EDITOR, ADMIN): the page in the frame;
 * - nobody signed in, with a Sign in button of its own. Nobody arrives here
 *   signed out - the route's guard sends them to the sign-in, and a sign-in
 *   that came back without one (or could not start) to the screen that says
 *   why - so this is a session that ended with an admin page open: the IAM's
 *   idle limit, a sign-out in another tab or on another anotoki site. "You
 *   are signed out", and what became of what was typed (the drafts of the
 *   Translations and Languages pages are kept for the tab, a survey's unsaved
 *   changes only while this page stays open - AdminStore's rule); the page is
 *   taken away with no navigation;
 * - somebody signed in with no role here: whose the area is, and where the
 *   surveys are. The API refuses them all the same.
 *
 * The last two stand alone, without the frame's column (as genshin's page that
 * tells somebody the panel is not theirs), the family's footer under them. In
 * them the route under the frame is still the active one, with no page drawn:
 * a guard on it is asked with no page (unsavedChangesGuard).
 */
@Component({
  selector: 'app-admin-root',
  imports: [RouterOutlet, RouterLink, AdminFrameComponent, ThemeToggleComponent, ButtonComponent, EmptyStateComponent, IconComponent, SiteFooterComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  protected readonly auth = inject(AuthService);
  /** The footer's version and What's new: the list boot() asked for - neither while there is none. */
  protected readonly changelog = inject(Changelog);
  /** Where the site stands (the family's SiteStatus): the count is asked, and the footer offers Feedback, only while it runs. */
  protected readonly siteStatus = inject(SiteStatus);
  private readonly _i18n = inject(TranslationService);
  private readonly _unread = inject(FeedbackUnread);
  private readonly _signOut = inject(SignOut);
  private readonly _router = inject(Router);

  /**
   * The panel's name as its bar said it - "anotoki survey · admin panel", the site's words - and its home, the surveys.
   * Too long for one line of the column, it breaks after the dot: the words of "admin panel" are held together by
   * no-break spaces, as the IAM's are, so it never leaves "panel" alone on the second line.
   */
  protected readonly brand = computed<AdminFrameBrand>(() => ({
    name: `anotoki ${this._i18n.t('brand.area')} · ${this._i18n.t('brand.adminPanel').replace(/ /g, ' ')}`,
    path: '/admin',
  }));

  /** Who is signed in: the name, and the token's address (the IAM's - shown, never kept by the site). */
  protected readonly person = computed<AdminFramePerson | null>(() => {
    const me = this.auth.person();
    return me ? { name: me.name, email: this.auth.user()?.email || null } : null;
  });

  /** Out of the panel: back to the surveys people take. */
  protected readonly back = computed<AdminFrameLink>(() => ({ label: this._i18n.t('topbar.backToSurveys'), path: '/' }));

  /** The site's one Sign out (the top bar's too): a promise, so the frame's button waits ("Saving…") while the changes still waiting are saved. */
  protected readonly signOut = (): Promise<void> => this._signOut.afterSaves();

  /** The pages for the person who is here: every page an EDITOR may use, System for an ADMIN - or Migrations alone while an update waits. */
  private readonly _pages = computed<readonly PanelPage[]>(() => {
    if (this.siteStatus.state() === 'update-pending' && this.auth.isAdmin()) {
      return UPDATE_PAGES;
    }
    return PANEL_PAGES.filter((page) => !page.adminOnly || this.auth.isAdmin());
  });

  /** The column's pages, in one group: four at the most - a heading would hold one or two. */
  protected readonly groups = computed<SideNavGroup[]>(() => [{ id: 'panel', links: this._pages().map((page) => this._link(page)) }]);

  /** Where the page is, after each navigation: the router's address until the first one ends. */
  private readonly _url = toSignal(
    this._router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this._router.url },
  );

  /**
   * The page the column marks, as the bar marked it: the one whose address the page is at, or under (a survey's editor in
   * Surveys, each System page in System) - and none for an address no page of the column is ('' names no link).
   */
  protected readonly current = computed(() => {
    const here = this._url().split(/[?#]/)[0];
    return this._pages().find((page) => here === page.path || page.under.some((start) => here.startsWith(start)))?.id ?? '';
  });

  constructor() {
    effect(() => {
      if (this.auth.isAdmin() && this.siteStatus.state() === 'ready') {
        // Only who is here and where the site stands are followed - never what the count reads itself.
        untracked(() => void this._unread.refresh());
      }
    });
  }

  /** To the IAM and back to this page - its pages in the language the person reads here, not the admin area's English; the screen that says why if it cannot start. */
  protected signIn(): void {
    void signInOrShowWhy(this.auth, this._router);
  }

  /** A page as the side navigation draws it - with System's count of new feedback, seen as a number and heard in English as what it counts. */
  private _link(page: PanelPage): SideNavLink {
    const count = page.badge === 'feedback' ? (this._unread.count() ?? 0) : 0;
    return {
      id: page.id,
      label: page.key ? this._i18n.t(page.key) : (page.label ?? page.path),
      path: page.path,
      icon: page.icon,
      ...(count > 0 ? { badge: count, badgeLabel: `${count} new feedback ${count === 1 ? 'message' : 'messages'}` } : {}),
    };
  }
}
