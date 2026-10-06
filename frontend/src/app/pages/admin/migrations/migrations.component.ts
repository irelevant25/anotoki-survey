import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AdminDates } from '../../../core/admin/admin-dates.service';
import { ApiService, MigrationsApplyResult, MigrationsStatus, toApiError } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { TranslationService } from '../../../core/i18n/translation.service';
import { AlertComponent } from '../../../ui/alert/alert.component';
import { BadgeComponent } from '../../../ui/badge/badge.component';
import { ButtonComponent } from '../../../ui/button/button.component';
import { CardComponent } from '../../../ui/card/card.component';
import { ConfirmService } from '../../../ui/confirm/confirm.service';
import { EmptyStateComponent } from '../../../ui/empty-state/empty-state.component';
import { IconComponent } from '../../../ui/icon/icon.component';
import { PageHeaderComponent } from '../../../ui/page-header/page-header.component';
import { SpinnerComponent } from '../../../ui/spinner/spinner.component';

/**
 * /admin/migrations (ADMIN alone; English, as the admin panel is) - the anotoki
 * family's Migrations page, the IAM's shape and words: the database schema is
 * what the files in backend/migrations/survey/ build. Pending (in the order
 * they will run) and Applied (in the order they ran, with when), and "Apply
 * pending" - POST /api/admin/migrations/apply, under the one lock setup.php's
 * Save and `php migration.php` take too (409 busy while one of them runs). The
 * files run in order, each in its own transaction, and the run stops at the
 * first that fails - every migration assumes the ones before it ran - which
 * is rolled back whole and named, with the database's whole error, as the
 * IAM's page shows it (the server logs it too).
 *
 * It works while the database is behind the code, when nothing else of the
 * site does: the app draws this page for an ADMIN then (the "not set up yet"
 * page links here), and once nothing is pending the site runs where it stands
 * (AuthService.databaseUpdated()) - this page, and what it said, kept. After
 * anything was applied the site's strings are read again: a migration may have
 * brought new ones, and a key with no string shows as itself.
 *
 * An EDITOR who opens the address is told whose page it is, and nothing is
 * asked for: the server refuses them anyway. Nothing is typed here, so nothing
 * needs to outlive the page: a session that ends takes it away, and the lists
 * are read again when it is drawn again.
 */
@Component({
  selector: 'app-migrations',
  imports: [RouterLink, AlertComponent, BadgeComponent, ButtonComponent, CardComponent, EmptyStateComponent, IconComponent, PageHeaderComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './migrations.component.html',
  styleUrl: './migrations.component.scss',
})
export class MigrationsComponent {
  protected readonly auth = inject(AuthService);
  private readonly _api = inject(ApiService);
  private readonly _i18n = inject(TranslationService);
  private readonly _confirm = inject(ConfirmService);

  protected readonly status = signal<MigrationsStatus | null>(null);
  protected readonly loadError = signal<string | null>(null);
  protected readonly applying = signal(false);
  /** What the last Apply did. */
  protected readonly result = signal<MigrationsApplyResult | null>(null);
  /** Apply was refused before anything ran: another update was running, the sign-in ended, the server was out of reach. */
  protected readonly applyError = signal<string | null>(null);
  protected readonly formatDateTime = inject(AdminDates).formatDateTime;

  constructor() {
    if (this.auth.isAdmin()) {
      void this.load();
    }
  }

  async load(): Promise<void> {
    this.loadError.set(null);
    try {
      this.status.set(await this._api.migrations());
    } catch (error) {
      this.loadError.set(toApiError(error).message);
    }
  }

  protected async apply(): Promise<void> {
    const pending = this.status()?.pending.length ?? 0;
    const yes = await this._confirm.ask({
      title: pending === 1 ? 'Apply 1 pending migration?' : `Apply ${pending} pending migrations?`,
      message: 'They run now, against the live database, in order - stopping at the first one that fails. Make sure there is a fresh backup.',
      confirmLabel: 'Apply',
      tone: 'danger',
    });
    if (!yes) {
      return;
    }

    this.applying.set(true);
    this.result.set(null);
    this.applyError.set(null);
    try {
      const result = await this._api.applyMigrations();
      this.result.set(result);
      if (result.applied.length) {
        // New strings may have come with it: read them now, or their keys would show until the next load.
        void this._i18n.reload();
      }
    } catch (error) {
      this.applyError.set(toApiError(error).message);
    } finally {
      this.applying.set(false);
    }
    await this.load();
    if (this.status()?.pending.length === 0) {
      this.auth.databaseUpdated();
    }
  }
}
