import { ChangeDetectionStrategy, Component, inject, linkedSignal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoadErrorComponent } from './boot/load-error/load-error.component';
import { NotSetUpComponent } from './boot/not-set-up/not-set-up.component';
import { AuthService } from './core/auth/auth.service';
import { BOOTED } from './core/boot';
import { ConfirmHostComponent } from './ui/confirm/confirm-host.component';
import { LightboxComponent } from './ui/lightbox/lightbox.component';
import { LightboxService } from './ui/lightbox/lightbox.service';
import { ToastHostComponent } from './ui/toast/toast-host.component';

/** What stands in the page: the site, one of the two cards drawn instead of it, or - while the very first start runs - nothing. */
type Drawn = 'site' | 'not-set-up' | 'load-error' | 'nothing';

/**
 * The page - or, while the site cannot run, the card saying why (not set up
 * yet, or the server out of reach) - plus what is drawn over any page:
 * toasts, the confirm dialog, and a picture shown large.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHostComponent, ConfirmHostComponent, LightboxComponent, NotSetUpComponent, LoadErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private readonly _auth = inject(AuthService);
  private readonly _booted = inject(BOOTED);
  protected readonly lightbox = inject(LightboxService);

  /**
   * The site is drawn only when the sign-in is ready AND the start has run to
   * its end (boot()): the sign-in is ready a moment before the language's
   * strings are there, and pages drawn in that moment would show keys.
   *
   * While a start is running nothing new is drawn: a card that was there stays
   * - the load error page's "Try again" starts again, and its button goes on
   * turning until the answer is known.
   */
  protected readonly drawn = linkedSignal<Drawn | null, Drawn>({
    source: () => {
      const status = this._auth.status();
      if (status === 'not-set-up') {
        return 'not-set-up';
      }
      if (status === 'error') {
        return 'load-error';
      }
      return status === 'ready' && this._booted() ? 'site' : null;
    },
    computation: (settled, previous) => settled ?? (previous && previous.value !== 'site' ? previous.value : 'nothing'),
  });
}
