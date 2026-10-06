import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdminDates } from '../../../core/admin/admin-dates.service';
import { AdminStore } from '../../../core/admin/admin-store.service';
import { toApiError } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { ageLabel, genderLabel } from '../../../core/survey/about-you';
import { durationSeconds } from '../../../core/survey/results';
import { formatDuration } from '../../../core/util/dates';
import { ButtonComponent } from '../../../ui/button/button.component';
import { ConfirmService } from '../../../ui/confirm/confirm.service';
import { EmptyStateComponent } from '../../../ui/empty-state/empty-state.component';
import { IconComponent } from '../../../ui/icon/icon.component';
import { SpinnerComponent } from '../../../ui/spinner/spinner.component';
import { ToastService } from '../../../ui/toast/toast.service';
import { ResponseViewComponent } from '../response-view/response-view.component';
import { hueOf } from '../survey-results/people-list/people-list.component';

/**
 * One person's answers on a page of their own - to link to, to print, or to
 * read through everybody one after another (the one before, the next one,
 * newest first).
 */
@Component({
  selector: 'app-response-page',
  imports: [RouterLink, ButtonComponent, EmptyStateComponent, IconComponent, ResponseViewComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './response-page.component.html',
  styleUrl: './response-page.component.scss',
})
export class ResponsePageComponent {
  readonly surveyId = input.required<string>();
  readonly responseId = input.required<string>();

  private readonly _store = inject(AdminStore);
  private readonly _router = inject(Router);
  private readonly _confirm = inject(ConfirmService);
  private readonly _toast = inject(ToastService);
  protected readonly auth = inject(AuthService);

  protected readonly survey = computed(() => this._store.survey(this.surveyId()));
  protected readonly loadError = computed(() => (this.survey() ? null : this._store.loadError(this.surveyId())));
  protected readonly responsesLoaded = computed(() => this._store.responses(this.surveyId()) !== undefined);
  protected readonly responsesError = computed(() => this._store.responsesError(this.surveyId()));
  protected readonly all = computed(() => [...(this._store.responses(this.surveyId()) ?? [])].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)));
  protected readonly response = computed(() => this.all().find((item) => item.id === this.responseId()) ?? null);
  protected readonly index = computed(() => this.all().findIndex((item) => item.id === this.responseId()));
  protected readonly previous = computed(() => (this.index() > 0 ? this.all()[this.index() - 1].id : null));
  protected readonly next = computed(() => (this.index() >= 0 && this.index() < this.all().length - 1 ? this.all()[this.index() + 1].id : null));

  protected readonly genderLabel = genderLabel;
  protected readonly ageLabel = ageLabel;
  protected readonly formatDateTime = inject(AdminDates).formatDateTime;
  protected readonly formatDuration = formatDuration;
  protected readonly durationSeconds = durationSeconds;
  protected readonly hueOf = hueOf;

  constructor() {
    // Stepping through the answers keeps what is here; another survey loads its own.
    effect(() => {
      const id = this.surveyId();
      untracked(() => {
        void this._store.load(id);
        void this._store.loadResponses(id);
      });
    });
  }

  protected print(): void {
    globalThis.print?.();
  }

  protected async remove(): Promise<void> {
    const response = this.response();
    if (!response) {
      return;
    }
    const sure = await this._confirm.ask({
      title: `Delete ${response.person.name}'s answers?`,
      message: `They disappear from the results, and ${response.person.name} can take the survey again. This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!sure) {
      return;
    }
    const next = this.next() ?? this.previous();
    try {
      await this._store.deleteResponse(this.surveyId(), response.id);
      this._toast.success(`${response.person.name}'s answers are deleted.`);
      void this._router.navigate(next ? ['/admin/surveys', this.surveyId(), 'responses', next] : ['/admin/surveys', this.surveyId(), 'results']);
    } catch (error) {
      this._toast.error(`The answers could not be deleted: ${toApiError(error).message}`);
    }
  }
}
