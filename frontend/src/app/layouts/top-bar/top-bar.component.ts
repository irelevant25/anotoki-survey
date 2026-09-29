import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminStore } from '../../core/admin/admin-store.service';
import { AuthService } from '../../core/auth/auth.service';
import { BrandComponent } from '../../ui/brand/brand.component';
import { ButtonComponent } from '../../ui/button/button.component';
import { ConfirmService } from '../../ui/confirm/confirm.service';
import { IconComponent } from '../../ui/icon/icon.component';
import { SpinnerComponent } from '../../ui/spinner/spinner.component';
import { ThemeToggleComponent } from '../../ui/theme-toggle/theme-toggle.component';

/**
 * The bar across the top of every page: the mark, the way into the admin
 * area for the people who write surveys (EDITOR, ADMIN), the theme, and who
 * is signed in - their menu with their anotoki account and signing out - or
 * the button to sign in.
 *
 * The menu is the IAM's own (layouts/shell there): a menu button, arrow keys
 * between its items, Escape and a click outside to close it.
 */
@Component({
  selector: 'app-top-bar',
  imports: [RouterLink, BrandComponent, ButtonComponent, IconComponent, SpinnerComponent, ThemeToggleComponent],
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
  private readonly _store = inject(AdminStore);
  private readonly _confirm = inject(ConfirmService);
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly menuOpen = signal(false);
  protected readonly signingOut = signal(false);
  protected readonly initial = computed(() => (this.auth.person()?.name.trim()[0] ?? '?').toUpperCase());
  protected readonly accountUrl = computed(() => (this.auth.signedIn() ? this.auth.accountUrl() : null));
  /** The narrowest phones: the mark without its words, so the person's menu still fits beside it. */
  protected readonly tiny = signal(false);

  private readonly _menuButton = viewChild<ElementRef<HTMLButtonElement>>('menuButton');
  private readonly _menu = viewChild<ElementRef<HTMLElement>>('menu');

  constructor() {
    const query = globalThis.matchMedia?.('(max-width: 380px)');
    if (query) {
      const update = () => this.tiny.set(query.matches);
      update();
      query.addEventListener('change', update);
      inject(DestroyRef).onDestroy(() => query.removeEventListener('change', update));
    }
  }

  protected signIn(): void {
    this.auth.signIn();
  }

  protected toggleMenu(): void {
    if (this.menuOpen()) {
      this.closeMenu(true);
    } else {
      this.menuOpen.set(true);
      // Into the menu once it is drawn, as a menu button is expected to do.
      queueMicrotask(() => this._menuItems()[0]?.focus());
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
   * waiting are saved. Any that cannot be (refused, or in conflict) are said
   * first: signed out, they could not be saved any more.
   */
  protected async signOut(): Promise<void> {
    this.signingOut.set(true);
    if (!(await this._store.flushAll())) {
      this.closeMenu(false);
      const sure = await this._confirm.ask({
        title: 'Sign out without your latest changes?',
        message: 'Some changes to a survey are not saved - the editor says why above the survey. Signed out, they cannot be saved any more.',
        confirmLabel: 'Sign out anyway',
        cancelLabel: 'Stay',
        tone: 'danger',
      });
      if (!sure) {
        this.signingOut.set(false);
        return;
      }
    }
    this.auth.signOut();
  }

  private _menuItems(): HTMLElement[] {
    const menu = this._menu()?.nativeElement;
    return menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitem"]')) : [];
  }
}
