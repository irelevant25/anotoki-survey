import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService, ParticipantSurvey, toApiError } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { readDraft } from '../../../core/survey/drafts';
import { currentStatus, estimatedMinutes, questionCount } from '../../../core/survey/survey-outline';
import { formatDay } from '../../../core/util/dates';
import { AlertComponent } from '../../../ui/alert/alert.component';
import { BadgeComponent } from '../../../ui/badge/badge.component';
import { ButtonComponent } from '../../../ui/button/button.component';
import { EmptyStateComponent } from '../../../ui/empty-state/empty-state.component';
import { IconComponent } from '../../../ui/icon/icon.component';
import { SpinnerComponent } from '../../../ui/spinner/spinner.component';

/**
 * The address without a survey in it: the surveys open now, and for each
 * whether this person has taken it, started it, or not yet. People mostly
 * arrive through a survey's own link; this is where they land without one.
 */
@Component({
  selector: 'app-survey-home',
  imports: [RouterLink, AlertComponent, BadgeComponent, ButtonComponent, EmptyStateComponent, IconComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './survey-home.component.html',
  styleUrl: './survey-home.component.scss',
})
export class SurveyHomeComponent {
  private readonly _api = inject(ApiService);
  private readonly _person = inject(AuthService).person;

  private readonly _open = signal<ParticipantSurvey[] | null>(null);
  protected readonly error = signal<string | null>(null);
  protected readonly loading = computed(() => this._open() === null && this.error() === null);

  protected readonly surveys = computed(() => {
    const person = this._person();
    return (this._open() ?? [])
      .filter((item) => currentStatus(item.survey) === 'open')
      .map(({ survey, answeredAt }) => ({
        survey,
        questions: questionCount(survey),
        minutes: estimatedMinutes(survey),
        taken: answeredAt !== null,
        started: answeredAt === null && !!person && readDraft(survey.id, person.id) !== null,
      }));
  });

  protected readonly formatDay = formatDay;

  constructor() {
    // Again when somebody signs in or out: whether each survey is taken is theirs.
    effect(() => {
      this._person()?.id;
      untracked(() => void this.load());
    });
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      this._open.set(await this._api.openSurveys());
    } catch (error) {
      this.error.set(toApiError(error).message);
    }
  }
}
