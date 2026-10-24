import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslatePluralPipe, TranslationService } from '@anotoki/lib/translations';
import { AlertComponent } from '@anotoki/lib/ui/alert';
import { BadgeComponent } from '@anotoki/lib/ui/badge';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { EmptyStateComponent } from '@anotoki/lib/ui/empty-state';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { LinkCardComponent } from '@anotoki/lib/ui/link-card';
import { SpinnerComponent } from '@anotoki/lib/ui/spinner';
import { ApiError, ApiService, ParticipantSurvey, toApiError } from '../../../api/api.service';
import { AuthService } from '../../../shared/auth/auth.service';
import { VisitorKey } from '../../../shared/auth/visitor-key';
import { errorKey, errorParams } from '../../../shared/i18n/error-text';
import { LocalDatePipe } from '../../../shared/i18n/local-date.pipe';
import { readDraft } from '../../../shared/survey/drafts';
import { localizedSurvey } from '../../../shared/survey/localize';
import { currentStatus, estimatedMinutes, questionCount } from '../../../shared/survey/survey-outline';
import { otherLanguage } from '../shown-language';
import { VisitorNoticeComponent } from '../visitor-notice/visitor-notice.component';

/**
 * The address without a survey in it: the surveys open now, and for each
 * whether this person has taken it, started it, or not yet. People mostly
 * arrive through a survey's own link; this is where they land without one.
 * Somebody taking surveys without signing in (a visitor) reads the same list,
 * for this browser, under the notice that says so.
 *
 * Every word of the page's own is a key, worded in the template - so the page
 * follows the language when it is switched. A survey's title is the survey's:
 * in the reader's language when the survey has all its texts in it, otherwise
 * in the language it was written in - and then the line says which, and the
 * title carries that language, so it is read as what it is.
 */
@Component({
  selector: 'app-survey-home',
  imports: [
    RouterLink,
    AlertComponent,
    BadgeComponent,
    ButtonComponent,
    EmptyStateComponent,
    IconComponent,
    LinkCardComponent,
    SpinnerComponent,
    VisitorNoticeComponent,
    LocalDatePipe,
    TranslatePipe,
    TranslatePluralPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './survey-home.component.html',
  styleUrl: './survey-home.component.scss',
})
export class SurveyHomeComponent {
  private readonly _api = inject(ApiService);
  private readonly _visitor = inject(VisitorKey);
  private readonly _i18n = inject(TranslationService);
  /** Who takes the surveys here: the person signed in, or this browser's visitor. */
  protected readonly taker = inject(AuthService).taker;
  private readonly _takerId = computed(() => this.taker()?.id ?? null);

  private readonly _open = signal<ParticipantSurvey[] | null>(null);
  /**
   * What the load failed with - the error itself, not a sentence: the template
   * words it in the reader's language (the server's sentence is English).
   */
  protected readonly error = signal<ApiError | null>(null);
  protected readonly loading = computed(() => this._open() === null && this.error() === null);

  protected readonly surveys = computed(() => {
    const taker = this._takerId();
    const reading = this._i18n.language();
    return (this._open() ?? [])
      .filter((item) => currentStatus(item.survey) === 'open')
      .map(({ survey, answeredAt }) => {
        // Whole in the reader's language, or whole in its own: never a title
        // in one language over questions in another.
        const shown = localizedSurvey(survey, reading, 'complete');
        return {
          survey: shown.survey,
          /** The language the title is in, when it is not the page's. */
          language: otherLanguage(this._i18n, shown.language),
          questions: questionCount(survey),
          minutes: estimatedMinutes(survey),
          taken: answeredAt !== null,
          started: answeredAt === null && taker !== null && readDraft(survey.id, taker) !== null,
        };
      });
  });

  /** "Language: " and what follows the name: the note before and after the language, whose name is in a language of its own - drawn only when the string has a place for it. */
  protected readonly inLanguage = computed(() => this._i18n.around('home.inLanguage', 'language'));

  protected readonly errorKey = errorKey;
  protected readonly errorParams = errorParams;

  constructor() {
    // Again when somebody signs in or out, when this browser's visitor key
    // comes or goes, and when a move after a sign-in has finished: whether
    // each survey is taken is theirs.
    effect(() => {
      this._takerId();
      this._visitor.key();
      this._visitor.moves();
      untracked(() => void this.load());
    });
  }

  protected async load(): Promise<void> {
    this.error.set(null);
    try {
      this._open.set(await this._api.openSurveys());
    } catch (error) {
      this.error.set(toApiError(error));
    }
  }
}
