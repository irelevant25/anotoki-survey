import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdminStore } from '../../../core/admin/admin-store.service';
import { toApiError } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { currentStatus } from '../../../core/survey/survey-outline';
import { SurveyStatus, SurveySummary } from '../../../core/survey/survey.model';
import { formatDate, formatDay, timeAgo } from '../../../core/util/dates';
import { AlertComponent } from '../../../ui/alert/alert.component';
import { BadgeComponent } from '../../../ui/badge/badge.component';
import { ButtonComponent } from '../../../ui/button/button.component';
import { ConfirmService } from '../../../ui/confirm/confirm.service';
import { EmptyStateComponent } from '../../../ui/empty-state/empty-state.component';
import { IconComponent } from '../../../ui/icon/icon.component';
import { PageHeaderComponent } from '../../../ui/page-header/page-header.component';
import { SpinnerComponent } from '../../../ui/spinner/spinner.component';
import { TabItem, TabsComponent } from '../../../ui/tabs/tabs.component';
import { ToastService } from '../../../ui/toast/toast.service';
import { STATUS_LABEL, STATUS_TONE } from '../survey-header/survey-header.component';

/** Open ones first - they are what is happening now - then drafts, then the closed. */
const ORDER: Record<SurveyStatus, number> = { open: 0, draft: 1, closed: 2 };

/**
 * Every survey, with how many have answered, and the way into its editor and
 * results. Deleting is an administrator's (the button shows to them only;
 * the server checks).
 */
@Component({
  selector: 'app-surveys-list',
  imports: [RouterLink, AlertComponent, BadgeComponent, ButtonComponent, EmptyStateComponent, IconComponent, PageHeaderComponent, SpinnerComponent, TabsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './surveys-list.component.html',
  styleUrl: './surveys-list.component.scss',
})
export class SurveysListComponent {
  private readonly _store = inject(AdminStore);
  private readonly _router = inject(Router);
  private readonly _confirm = inject(ConfirmService);
  private readonly _toast = inject(ToastService);
  protected readonly auth = inject(AuthService);

  protected readonly show = signal('all');
  protected readonly creating = signal(false);
  protected readonly loaded = computed(() => this._store.summaries() !== null);
  protected readonly error = computed(() => (this._store.summaries() === null ? (this._store.summariesError()?.message ?? null) : null));

  protected readonly rows = computed(() =>
    (this._store.summaries() ?? [])
      .map((survey) => ({ survey, status: currentStatus(survey) }))
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.survey.updatedAt.localeCompare(a.survey.updatedAt)),
  );

  protected readonly tabs = computed<TabItem[]>(() => {
    const rows = this.rows();
    const count = (status: SurveyStatus) => rows.filter((row) => row.status === status).length;
    return [
      { id: 'all', label: 'All', count: rows.length },
      { id: 'open', label: 'Open', count: count('open') },
      { id: 'draft', label: 'Drafts', count: count('draft') },
      { id: 'closed', label: 'Closed', count: count('closed') },
    ];
  });

  protected readonly visible = computed(() => {
    const show = this.show();
    return show === 'all' ? this.rows() : this.rows().filter((row) => row.status === show);
  });

  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusTone = STATUS_TONE;
  protected readonly timeAgo = timeAgo;
  protected readonly formatDate = formatDate;
  protected readonly formatDay = formatDay;

  constructor() {
    void this._store.loadSummaries();
  }

  protected reload(): void {
    void this._store.loadSummaries();
  }

  protected async create(): Promise<void> {
    this.creating.set(true);
    try {
      const survey = await this._store.create();
      void this._router.navigate(['/admin/surveys', survey.id, 'edit']);
    } catch (error) {
      this._toast.error(`The survey could not be made: ${toApiError(error).message}`);
    } finally {
      this.creating.set(false);
    }
  }

  protected async copy(survey: SurveySummary): Promise<void> {
    try {
      const copy = await this._store.copy(survey.id);
      this._toast.success(`"${copy.title}" is a new draft, without any answers.`);
    } catch (error) {
      this._toast.error(`The copy could not be made: ${toApiError(error).message}`);
    }
  }

  protected async remove(survey: SurveySummary): Promise<void> {
    const responses = survey.responses;
    const sure = await this._confirm.ask({
      title: `Delete "${survey.title || 'Untitled survey'}"?`,
      message: responses ? `Its ${responses} ${responses === 1 ? 'answer goes' : 'answers go'} with it, and none of it can be brought back.` : 'Nobody has answered it yet. It cannot be brought back.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!sure) {
      return;
    }
    try {
      await this._store.delete(survey.id);
      this._toast.success('The survey is deleted.');
    } catch (error) {
      this._toast.error(`The survey could not be deleted: ${toApiError(error).message}`);
    }
  }
}
