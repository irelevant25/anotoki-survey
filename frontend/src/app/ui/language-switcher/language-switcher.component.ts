import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
import { IconComponent } from '../icon/icon.component';
import { ToastService } from '../toast/toast.service';
import { uniqueId } from '../unique-id';

/**
 * The language the pages are read in: one small button with the current
 * language's code ("SK"), opening a menu of the languages on offer, each under
 * the name its own speakers give it.
 *
 * A menu button like the person's menu in the same bar - arrow keys between
 * the items, Escape and a click outside to close - with `menuitemradio` items,
 * because it is one choice out of a few. Each item says which language its own
 * name is in (`lang`), so a screen reader pronounces "Slovenčina" as Slovak.
 *
 * Not a segmented control: the bar has no room for one on a phone, signed out,
 * beside "Prihlásiť sa" - and there may be more than two languages.
 */
@Component({
  selector: 'app-language-switcher',
  imports: [IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './language-switcher.component.html',
  styleUrl: './language-switcher.component.scss',
  host: {
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'close(true)',
  },
})
export class LanguageSwitcherComponent {
  protected readonly i18n = inject(TranslationService);
  private readonly _toast = inject(ToastService);
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _injector = inject(Injector);

  protected readonly buttonId = uniqueId('language-button');
  protected readonly menuId = uniqueId('language-menu');

  protected readonly open = signal(false);
  /** The chosen language's strings are on their way. */
  protected readonly switching = signal(false);
  /** The current language as its speakers write it; its code while the list does not name it. */
  protected readonly currentName = computed(() => {
    const code = this.i18n.language();
    return this.i18n.languages().find((language) => language.code === code)?.nativeName ?? code.toUpperCase();
  });

  /** Counts the choices made: only the last one's answer is acted on. */
  private _choice = 0;

  private readonly _button = viewChild<ElementRef<HTMLButtonElement>>('button');
  private readonly _menu = viewChild<ElementRef<HTMLElement>>('menu');

  protected toggle(): void {
    if (this.open()) {
      this.close(true);
    } else {
      this.open.set(true);
      // Into the menu once it is drawn, onto the language in use - as a menu of radio items is expected to open.
      afterNextRender(
        () => {
          const items = this._items();
          (items.find((item) => item.getAttribute('aria-checked') === 'true') ?? items[0])?.focus();
        },
        { injector: this._injector },
      );
    }
  }

  close(returnFocus: boolean): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    if (returnFocus) {
      this._button()?.nativeElement.focus();
    }
  }

  /**
   * Switches once the language's strings have come; says so when they could
   * not be had, and stays as it was.
   *
   * The last choice wins. The button stays usable while a language is on its
   * way, so somebody may change their mind - back to the language on the page
   * too, which is then a choice like any other and is handed to the service
   * (it drops the one on its way). Only the last choice's answer is listened
   * to: an earlier one comes back false for having been overtaken, and that
   * is nothing to tell anybody.
   */
  protected async choose(code: string): Promise<void> {
    this.close(true);
    if (code === this.i18n.language() && !this.switching()) {
      return;
    }
    const mine = ++this._choice;
    this.switching.set(true);
    const switched = await this.i18n.setLanguage(code);
    if (mine !== this._choice) {
      return;
    }
    this.switching.set(false);
    if (!switched) {
      // A finished sentence when raised, in the language the page is still in.
      this._toast.error(this.i18n.t('language.notLoaded'));
    }
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this._host.nativeElement.contains(event.target as Node)) {
      this.close(false);
    }
  }

  protected onMenuKeydown(event: KeyboardEvent): void {
    const items = this._items();
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
      this.close(false);
      return;
    }
    if (next >= 0) {
      event.preventDefault();
      items[next]?.focus();
    }
  }

  private _items(): HTMLElement[] {
    const menu = this._menu()?.nativeElement;
    return menu ? Array.from(menu.querySelectorAll<HTMLElement>('[role="menuitemradio"]')) : [];
  }
}
