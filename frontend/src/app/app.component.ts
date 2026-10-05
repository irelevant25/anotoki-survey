import { ChangeDetectionStrategy, Component, inject, linkedSignal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { LoadErrorComponent } from './boot/load-error/load-error.component';
import { NotSetUpComponent } from './boot/not-set-up/not-set-up.component';
import { AuthService, MIGRATIONS_PATH } from './core/auth/auth.service';
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
  private readonly _router = inject(Router);
  protected readonly lightbox = inject(LightboxService);

  /** The address of the page in force, query and hash aside - null until the first navigation has ended. */
  private readonly _path = toSignal(
    this._router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map((event): string | null => (event as NavigationEnd).urlAfterRedirects.split(/[?#]/)[0]),
    ),
    { initialValue: this._router.navigated ? this._router.url.split(/[?#]/)[0] : null },
  );

  /**
   * The site is drawn only when the sign-in is ready AND the start has run to
   * its end (boot()): the sign-in is ready a moment before the language's
   * strings are there, and pages drawn in that moment would show keys.
   *
   * While a start is running nothing new is drawn: a card that was there stays
   * - the load error page's "Try again" starts again, and its button goes on
   * turning until the answer is known.
   *
   * While the database waits for a migration (`needsUpdate`) the site is set
   * up and signing in works, but nothing else does: the "not set up yet" card
   * stands instead of every page - but the Migrations page, for an ADMIN, who
   * applies the update there (the card links to it). Once it is applied the
   * site runs where it stands. Somebody not signed in yet is on the way to the
   * IAM (signInGuard): nothing new is drawn meanwhile.
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
      if (status !== 'ready' || !this._booted()) {
        return null;
      }
      return this._auth.needsUpdate() ? this._whileBehind() : 'site';
    },
    computation: (settled, previous) => settled ?? (previous && previous.value !== 'site' ? previous.value : 'nothing'),
  });

  private _whileBehind(): Drawn | null {
    if (this._auth.onlyMigrations()) {
      const path = this._path();
      return path === null ? null : path === MIGRATIONS_PATH ? 'site' : 'not-set-up';
    }
    return this._auth.signedIn() || this._auth.signInFailure() ? 'not-set-up' : null;
  }
}
