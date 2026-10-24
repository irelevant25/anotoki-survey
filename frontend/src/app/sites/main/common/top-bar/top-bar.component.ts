import { ChangeDetectionStrategy, Component, computed, inject, input, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { TopBarComponent as AnotokiTopBarComponent, type TopBarBrand, type TopBarLink, type TopBarMenuItem, type TopBarPerson } from '@anotoki/lib/shell';
import { TranslationService } from '@anotoki/lib/translations';
import { signInOrShowWhy } from '../../../../shared/auth/auth.config';
import { AuthService } from '../../../../shared/auth/auth.service';
import { SignOut } from '../../../../shared/auth/sign-out.service';

/** A section of the site in the bar: its words (a key), where it goes, and the addresses under it that are part of it. */
export interface BarLink {
  key: string;
  path: string;
  /** Address beginnings that belong to the section too. */
  under: readonly string[];
}

/** Where people take surveys: the one section, the list of open surveys. */
export const SURVEY_LINKS: readonly BarLink[] = [{ key: 'topbar.surveys', path: '/', under: [] }];

/** Up to this width the bar is a phone's: the links and the person's menu fold into one menu button. */
export const PHONE_BAR_MAX = 760;

/**
 * The bar across the top of the public site's pages - the surveys people take
 * and the legal pages: the anotoki family's one bar (<anotoki-top-bar>,
 * @anotoki/lib/shell), told here what is this site's - where its roles and its
 * words meet the bar. The admin panel has none: its frame is the family's
 * <anotoki-admin-frame>, a column on the left (sites/admin/app.component.ts).
 *
 * In one row, in the family's order: the brand (the mark, "anotoki" and the
 * site's name, linking home); the site's sections as links; then the language
 * (only when there is more than one), the theme, and the person's menu (name,
 * address, role; their anotoki account; the way into the admin panel for the
 * people who write surveys; signing out) - or Sign in. On a phone (up to
 * PHONE_BAR_MAX) the brand is the mark and the site's name, and the links and
 * the person's menu (or Sign in) are inside one menu button. The menus, their
 * keys and the widths are the kit's.
 *
 * Every word is a key, read in the person's language. The words the family
 * has for a bar - the person's role, "Your anotoki account", "Admin panel" -
 * are the anotoki library's keys (`anotoki.topbar.*`), read from the site's
 * database as the kit reads its own (shared/kit.ts): one string for each,
 * whichever bar says it.
 */
@Component({
  selector: 'app-top-bar',
  imports: [AnotokiTopBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './top-bar.component.html',
  styleUrl: './top-bar.component.scss',
})
export class TopBarComponent {
  /** A narrower bar, for pages whose content is narrow too. */
  readonly width = input<'wide' | 'narrow'>('wide');

  private readonly _auth = inject(AuthService);
  private readonly _i18n = inject(TranslationService);
  private readonly _router = inject(Router);
  private readonly _signOut = inject(SignOut);
  private readonly _bar = viewChild.required(AnotokiTopBarComponent);

  protected readonly phoneMax = PHONE_BAR_MAX;
  protected readonly chooser = computed(() => this._i18n.languages().length > 1);

  protected readonly brand = computed<TopBarBrand>(() => ({ area: this._i18n.t('brand.area'), link: '/', label: this._i18n.t('topbar.home') }));

  protected readonly links = computed<TopBarLink[]>(() =>
    SURVEY_LINKS.map((link) => ({
      id: link.path,
      label: this._i18n.t(link.key),
      path: link.path,
      under: link.under,
    })),
  );

  protected readonly person = computed<TopBarPerson | null>(() => {
    const me = this._auth.person();
    if (!me) {
      return null;
    }
    const role = this._auth.isAdmin() ? this._i18n.t('anotoki.topbar.roleAdmin') : this._auth.isStaff() ? this._i18n.t('anotoki.topbar.roleEditor') : null;
    return { name: me.name, email: this._auth.user()?.email || null, role };
  });

  /** Between the menu's head and Sign out: the anotoki account (a new tab), and the way into the admin panel. */
  protected readonly menuItems = computed<TopBarMenuItem[]>(() => {
    const items: TopBarMenuItem[] = [];
    const account = this._auth.signedIn() ? this._auth.accountUrl() : null;
    if (account) {
      items.push({ id: 'account', label: this._i18n.t('anotoki.topbar.account'), icon: 'user', href: account, newTab: true });
    }
    if (this._auth.isStaff()) {
      items.push({ id: 'admin', label: this._i18n.t('anotoki.topbar.admin'), icon: 'shield', path: '/admin' });
    }
    return items;
  });

  /** To the IAM, whose pages open in the language the person reads here; the screen that says why if it cannot start. */
  protected readonly signIn = (): Promise<void> => signInOrShowWhy(this._auth, this._router);

  /**
   * The bar's Sign out: the site's one (SignOut - the admin panel's frame takes it too), after the changes still
   * waiting are saved - with the menu closed before any question, so the question is not drawn under it. A promise,
   * so its item waits ("Saving…") meanwhile.
   */
  protected readonly signOut = (): Promise<void> => this._signOut.afterSaves(() => this._bar().closeMenu(false));
}
