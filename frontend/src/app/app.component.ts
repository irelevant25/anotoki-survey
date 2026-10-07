import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SiteGateComponent, SiteStatus } from '@anotoki/lib/migrations';
import { LoadErrorComponent } from './boot/load-error/load-error.component';
import { AuthService } from './core/auth/auth.service';
import { BOOTED } from './core/boot';
import { PAGES_CLOSED } from './core/migrations';
import { ConfirmHostComponent } from './ui/confirm/confirm-host.component';
import { LightboxComponent } from './ui/lightbox/lightbox.component';
import { LightboxService } from './ui/lightbox/lightbox.service';
import { ToastHostComponent } from './ui/toast/toast-host.component';

/** What stands in the page: the site (behind the family's gate), the card saying the server is out of reach, or - while the very first start runs - nothing. */
type Drawn = 'site' | 'load-error' | 'nothing';

/**
 * The page - behind the anotoki family's gate (<anotoki-site-gate>,
 * @anotoki/lib/migrations: while the site cannot run, the family's page that
 * says why stands instead of every page, and the site's ADMIN still reaches
 * the Migrations page while an update waits; the pages are given to it as a
 * template, which it makes only while it shows them) - or the card saying the
 * server could not be reached; plus what is drawn over any page: toasts, the
 * confirm dialog, and a picture shown large.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, SiteGateComponent, ToastHostComponent, ConfirmHostComponent, LightboxComponent, LoadErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  private readonly _auth = inject(AuthService);
  private readonly _status = inject(SiteStatus);
  private readonly _booted = inject(BOOTED);
  /** The site could not run in this page load, and no update applied here has opened it again (core/migrations.ts). */
  private readonly _closed = inject(PAGES_CLOSED);
  protected readonly lightbox = inject(LightboxService);

  constructor() {
    effect(() => {
      if (this._status.blocked()) {
        this._closed.set(true);
      }
    });
  }

  /**
   * Whether the pages wait for the reload: the site could not run in this page
   * load and runs again, and no update applied in this tab opened it
   * (PAGES_CLOSED). The family's page finds the site running again by asking
   * (by itself, or its Try again) and reloads the page in the next breath -
   * but the answer opens the gate first, and a page made in that moment would
   * run for nothing (ask the API, raise a toast) and flash: for a visitor,
   * past a guard that let it through only because the site was closed.
   * Everything else is the gate's own decision: its template - the outlet - is
   * made only while it shows the pages (anotoki-lib 0.1.1), so nothing of a
   * page runs behind the family's page, and the site's ADMIN reaches the
   * Migrations page while an update waits.
   */
  protected readonly held = computed(() => this._closed() && !this._status.blocked());

  /**
   * Nothing is drawn until the start has run to its end (boot()): the sign-in
   * is ready a moment before the language's strings are there, and pages
   * drawn in that moment would show keys.
   *
   * Then the site - behind its gate. While the site cannot run and the server
   * said why (not set up, a database update waiting, the database out of
   * reach: SiteStatus, asked at the start and told by any answer that says
   * so), the gate shows the family's page instead of the pages, and the
   * Migrations page to the site's ADMIN. Signing in works then (the sign-in's
   * settings answer while an update waits) and the router goes on navigating,
   * so a Sign in comes back to the page it left.
   *
   * The card saying the server could not be reached is for a start whose
   * sign-in got no answer where the status had one - never for a site that
   * could not run in this page load (the moment before its reload). While a
   * start is running nothing new is drawn: a card that was there stays - its
   * "Try again" starts again, and its button goes on turning until the answer
   * is known.
   */
  protected readonly drawn = linkedSignal<Drawn | null, Drawn>({
    source: () => {
      if (!this._booted()) {
        return null;
      }
      if (this._status.blocked() || this._closed()) {
        return 'site';
      }
      const status = this._auth.status();
      if (status === 'error') {
        return 'load-error';
      }
      return status === 'ready' ? 'site' : null;
    },
    computation: (settled, previous) => settled ?? (previous && previous.value !== 'site' ? previous.value : 'nothing'),
  });
}
