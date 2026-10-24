import { ChangeDetectionStrategy, Component, DOCUMENT, EnvironmentInjector, computed, inject, runInInjectionContext, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BrandComponent } from '@anotoki/lib/shell';
import { TranslationService } from '@anotoki/lib/translations';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { AuthService } from '../../auth/auth.service';
import { boot } from '../boot';
import { keptWord } from '../kept-word';

/**
 * The server could not be reached as the site started - it is down, or the
 * connection is. Drawn instead of the whole site, with a way to try again.
 *
 * Its words cannot be asked for either: each is the string the browser kept
 * from an earlier visit, or the English written here (keptWord()).
 */
@Component({
  selector: 'app-load-error',
  imports: [BrandComponent, ButtonComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './load-error.component.html',
  styleUrl: './load-error.component.scss',
})
export class LoadErrorComponent {
  private readonly _injector = inject(EnvironmentInjector);
  private readonly _i18n = inject(TranslationService);
  private readonly _auth = inject(AuthService);
  private readonly _router = inject(Router);
  private readonly _location = inject(DOCUMENT).location;
  protected readonly trying = signal(false);

  /**
   * The address the page was opened with, read as this card is made - which is
   * before the router's first navigation, and after the start has taken
   * `?lang=` out. The router cannot be asked for it later: a first navigation
   * that the sign-in guard refuses (/admin, a preview - nobody is signed in
   * while the server is out of reach) leaves the router nowhere and the
   * address bar on `/`.
   */
  private readonly _opened = this._address();

  protected readonly area = computed(() => keptWord(this._i18n, 'brand.area', 'survey'));
  protected readonly title = computed(() => keptWord(this._i18n, 'boot.loadError.title', 'The survey site cannot be reached'));
  protected readonly text = computed(() =>
    keptWord(this._i18n, 'boot.loadError.text', 'The server did not answer. It may be down for a moment, or the connection may be. Try again in a little while.'),
  );
  protected readonly tryAgain = computed(() => keptWord(this._i18n, 'common.tryAgain', 'Try again'));

  /**
   * The whole start again - the sign-in, then the language and its strings -
   * as the first time. And, when it worked, the page itself: the site is drawn
   * around whatever the router last reached, and that is nothing at all when
   * its first navigation was refused - a blank page. So the router is sent to
   * the address the page was opened with (the guard now takes a signed-out
   * person to the sign-in, and back to that address). When it did reach a
   * page, it is sent to the address in the bar: nothing happens, unless the
   * sign-in has just put another address there.
   */
  protected async retry(): Promise<void> {
    this.trying.set(true);
    await runInInjectionContext(this._injector, boot);
    if (this._auth.status() === 'ready') {
      try {
        await this._router.navigateByUrl(this._router.lastSuccessfulNavigation() ? this._address() : this._opened, { replaceUrl: true });
      } catch (error) {
        // An address the router cannot read: the site is drawn all the same.
        console.error('[boot] the page could not be opened again', error);
      }
    }
    this.trying.set(false);
  }

  private _address(): string {
    return this._location.pathname + this._location.search + this._location.hash;
  }
}
