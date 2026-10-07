import { ChangeDetectionStrategy, Component, computed, effect, inject, linkedSignal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { ANOTOKI_MIGRATIONS_CONFIG, SiteGateComponent, SiteStatus } from '@anotoki/lib/migrations';
import { filter, map } from 'rxjs';
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
 * the Migrations page while an update waits) - or the card saying the server
 * could not be reached; plus what is drawn over any page: toasts, the confirm
 * dialog, and a picture shown large.
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
  private readonly _migrations = inject(ANOTOKI_MIGRATIONS_CONFIG);
  private readonly _booted = inject(BOOTED);
  private readonly _router = inject(Router);
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

  /** The address of the page in force, as the router last reached it. */
  private readonly _url = toSignal(
    this._router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this._router.url },
  );

  /**
   * Whether the pages are there at all: the gate's own decision - open while
   * the site runs (or nobody has asked yet), and for the site's ADMIN on the
   * Migrations page while an update waits - taken again here, because what a
   * component projects is made whether it is shown or not. The gate's
   * <ng-content> sits in an @if, but a bare <router-outlet> projected into it
   * would still put the routed page in place, out of sight: it would ask the
   * API (and be answered 503), and its failures would reach the toasts, which
   * are drawn over everything. So the outlet is only made when the gate shows it.
   *
   * And once the site could not run, its pages stay away until an update
   * applied in this tab opens them (PAGES_CLOSED): the family's page that finds
   * the site ready again reloads the page at once, and a page made in between
   * would run for nothing - for a visitor, past a guard that let it through
   * only because the site was closed.
   */
  protected readonly pagesOpen = computed(() => {
    if (!this._status.blocked() && !this._closed()) {
      return true;
    }
    return this._status.state() === 'update-pending' && this._migrations.isAdmin() && onRoute(this._url(), this._migrations.migrationsRoute);
  });

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

/** Whether the router address `url` is `route` or under it (its query and fragment aside) - as the gate reads it. */
function onRoute(url: string, route: string): boolean {
  const path = url.split(/[?#]/)[0];
  return path === route || path.startsWith(route + '/');
}
