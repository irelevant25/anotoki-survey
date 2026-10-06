import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AdminDates } from '../../../core/admin/admin-dates.service';
import { AdminStore } from '../../../core/admin/admin-store.service';
import { toApiError } from '../../../core/api/api.service';
import { problemsHeading, surveyProblems } from '../../../core/survey/survey-problems';
import { currentStatus } from '../../../core/survey/survey-outline';
import { Survey, SurveyStatus } from '../../../core/survey/survey.model';
import { BadgeComponent, BadgeTone } from '../../../ui/badge/badge.component';
import { ButtonComponent } from '../../../ui/button/button.component';
import { ConfirmService } from '../../../ui/confirm/confirm.service';
import { IconComponent } from '../../../ui/icon/icon.component';
import { SpinnerComponent } from '../../../ui/spinner/spinner.component';
import { ToastService } from '../../../ui/toast/toast.service';

export const STATUS_LABEL: Record<SurveyStatus, string> = { draft: 'Draft', open: 'Open', closed: 'Closed' };
export const STATUS_TONE: Record<SurveyStatus, BadgeTone> = { draft: 'neutral', open: 'success', closed: 'warning' };

/**
 * The top of a survey's admin pages: its name, status and address, whether
 * its changes are saved, the way to open or close it, the preview, and the
 * tabs between the editor and the results.
 *
 * The preview opens in the language the editor is on: from a translation's
 * tab its link carries `?language=<code>` - a parameter of the preview's own,
 * which only the survey's texts follow (not `lang`, which is the whole site's
 * language and is taken out of the address when a page loads).
 *
 * A survey with problems (survey-problems.ts) does not open: the button says
 * why and sends the editor to the list of them. The Editor tab counts them,
 * in the words of the survey's state (a draft's keep it from opening, an open
 * survey's are wrong with it now, a closed one's keep it from reopening). The server checks the same
 * again, on the survey as it has it - after the changes waiting here are saved.
 */
@Component({
  selector: 'app-survey-header',
  imports: [RouterLink, RouterLinkActive, BadgeComponent, ButtonComponent, IconComponent, SpinnerComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './survey-header.component.html',
  styleUrl: './survey-header.component.scss',
})
export class SurveyHeaderComponent {
  readonly survey = input.required<Survey>();
  /** The translation the editor is on, by its code: the preview shows the survey's texts in it. Null: the survey's own language. */
  readonly previewLanguage = input<string | null>(null);

  private readonly _store = inject(AdminStore);
  private readonly _confirm = inject(ConfirmService);
  private readonly _toast = inject(ToastService);
  private readonly _router = inject(Router);

  protected readonly status = computed(() => currentStatus(this.survey()));
  protected readonly statusLabel = computed(() => STATUS_LABEL[this.status()]);
  protected readonly statusTone = computed(() => STATUS_TONE[this.status()]);
  protected readonly responses = computed(() => this._store.responseCount(this.survey().id));
  protected readonly problems = computed(() => surveyProblems(this.survey(), this._store.summaries() ?? [], this._store.languages() ?? []));
  /** What the Editor tab's count means, in the words of the survey's state - the outline's heading. */
  protected readonly problemsTitle = computed(() => problemsHeading(this.status(), this.problems().length));
  protected readonly save = computed(() => this._store.saveStatus(this.survey().id));
  protected readonly link = computed(() => `${globalThis.location?.origin ?? ''}/${this.survey().slug}`);
  protected readonly previewParams = computed(() => {
    const language = this.previewLanguage();
    return language ? { language } : null;
  });
  protected readonly changing = signal(false);
  protected readonly formatDay = inject(AdminDates).formatDay;

  protected async open(): Promise<void> {
    const survey = this.survey();
    const problems = this.problems();
    if (problems.length) {
      this._toast.error(`Fix ${problems.length === 1 ? 'the problem' : `the ${problems.length} problems`} first - the editor lists ${problems.length === 1 ? 'it' : 'them'}.`);
      void this._router.navigate(['/admin/surveys', survey.id, 'edit'], { fragment: 'problems' });
      return;
    }
    const reopening = survey.status === 'closed' || this.status() === 'closed';
    const sure = await this._confirm.ask({
      title: reopening ? 'Reopen the survey?' : 'Open the survey?',
      message: `From now on, anybody signed in can take it at ${this.link()}${reopening ? ' - everyone who has not answered yet' : ''}.`,
      confirmLabel: reopening ? 'Reopen' : 'Open',
    });
    if (sure && (await this._change(survey.id, 'open'))) {
      this._toast.success(reopening ? 'The survey is open again.' : 'The survey is open.');
    }
  }

  protected async close(): Promise<void> {
    const sure = await this._confirm.ask({
      title: 'Close the survey?',
      message: 'Nobody can answer it any more. The answers it has stay, and it can be reopened.',
      confirmLabel: 'Close',
    });
    if (sure && (await this._change(this.survey().id, 'closed'))) {
      this._toast.success('The survey is closed.');
    }
  }

  protected async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.link());
      this._toast.success('The link is copied.');
    } catch {
      this._toast.error('The browser would not copy it. The link is ' + this.link());
    }
  }

  private async _change(id: string, status: 'open' | 'closed'): Promise<boolean> {
    this.changing.set(true);
    try {
      await this._store.setStatus(id, status);
      return true;
    } catch (failure) {
      const error = toApiError(failure);
      const problems = Array.isArray(error.body['problems']) ? (error.body['problems'] as string[]) : [];
      this._toast.error(problems.length ? `${error.message} ${problems.join(' ')}` : error.message);
      return false;
    } finally {
      this.changing.set(false);
    }
  }
}
