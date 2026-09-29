import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, booleanAttribute, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { AdminStore } from '../../../core/admin/admin-store.service';
import { ApiError, ApiService, ParticipantSurvey, toApiError } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { AGE_ID, GENDER_ID, isAgeKey, isGenderKey } from '../../../core/survey/about-you';
import { ABOUT_YOU_QUESTIONS } from '../../../core/survey/about-you-questions';
import { answerProblem, cleanAnswer } from '../../../core/survey/answer-rules';
import { Draft, clearDraft, readDraft, writeDraft } from '../../../core/survey/drafts';
import { newId } from '../../../core/survey/survey-factory';
import { currentStatus, estimatedMinutes, numberedQuestions, questionCount } from '../../../core/survey/survey-outline';
import { AboutYou, Answer, Question, SurveyResponse } from '../../../core/survey/survey.model';
import { formatDate, formatDay, timeAgo } from '../../../core/util/dates';
import { AlertComponent } from '../../../ui/alert/alert.component';
import { ButtonComponent } from '../../../ui/button/button.component';
import { IconComponent } from '../../../ui/icon/icon.component';
import { SpinnerComponent } from '../../../ui/spinner/spinner.component';
import { ToastService } from '../../../ui/toast/toast.service';
import { QuestionBlockComponent } from '../question-block/question-block.component';
import { SurveyHeroComponent } from '../survey-hero/survey-hero.component';

/** One page of the survey: "About you" (when asked), then each of the survey's steps. */
interface Page {
  key: string;
  title: string;
  questions: { question: Question; number: number | null }[];
}

/** What the person meets at this address, before any of the survey. */
type State = 'loading' | 'failed' | 'missing' | 'not-open' | 'closed' | 'signed-out' | 'answered' | 'sent' | 'take';

/**
 * A survey, taken: the welcome, the steps one at a time, and the thanks - and
 * for everybody who cannot take it, why not.
 *
 * Nothing leaves the browser until the last step's "Send": the answers so far
 * are a draft kept on this device after every change, so a closed tab or a
 * dropped connection loses nothing, and coming back offers to carry on.
 * "Next" checks the step in front of the person; "Send" checks every step
 * again, since an answer given earlier may no longer fit a survey the editor
 * has changed since - and the server checks it all once more, in the same
 * words (backend/api/survey_rules.php).
 *
 * At /preview/{id} it is the editor's preview: any survey, open or not, and
 * nothing saved - not the draft, not the answers. It is read again whenever
 * its tab comes back into view, so it follows an editor in another tab.
 */
@Component({
  selector: 'app-take-survey',
  imports: [RouterLink, AlertComponent, ButtonComponent, IconComponent, QuestionBlockComponent, SpinnerComponent, SurveyHeroComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './take-survey.component.html',
  styleUrl: './take-survey.component.scss',
})
export class TakeSurveyComponent {
  /** The survey's address, at /{slug}. */
  readonly slug = input<string | undefined>(undefined);
  /** The survey's id, at /preview/{surveyId}. */
  readonly surveyId = input<string | undefined>(undefined);
  /** Route data: this is the editor's preview. */
  readonly preview = input(false, { transform: booleanAttribute });

  private readonly _api = inject(ApiService);
  private readonly _admin = inject(AdminStore);
  private readonly _auth = inject(AuthService);
  private readonly _title = inject(Title);
  private readonly _toast = inject(ToastService);
  private readonly _injector = inject(Injector);
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The survey at /{slug} as the server sent it, with when this person answered it. */
  private readonly _loaded = signal<ParticipantSurvey | null>(null);
  private readonly _loadError = signal<ApiError | null>(null);

  protected readonly survey = computed(() => (this.preview() ? this._admin.survey(this.surveyId() ?? '') : this._loaded()?.survey));
  protected readonly person = this._auth.person;
  /** Who, by id alone: a refreshed token is the same person, and asks for nothing again. */
  private readonly _personId = computed(() => this.person()?.id ?? null);
  /** When this person sent their answers, if they have. */
  protected readonly answeredAt = computed(() => (this.preview() ? null : (this._loaded()?.answeredAt ?? null)));

  protected readonly phase = signal<'welcome' | 'steps'>('welcome');
  protected readonly pageIndex = signal(0);
  protected readonly answers = signal<Record<string, Answer>>({});
  protected readonly startedAt = signal<string | null>(null);
  /** Set when the person pressed Next on a step that still misses something: the problems show from then on. */
  protected readonly tried = signal(false);
  protected readonly sent = signal<SurveyResponse | null>(null);
  protected readonly sending = signal(false);
  protected readonly draft = signal<Draft | null>(null);

  protected readonly pages = computed<Page[]>(() => {
    const survey = this.survey();
    if (!survey) {
      return [];
    }
    const numbers = new Map(numberedQuestions(survey).map((item) => [item.question.id, item.number]));
    const pages: Page[] = [];
    if (survey.askAboutYou) {
      pages.push({ key: 'about-you', title: 'About you', questions: ABOUT_YOU_QUESTIONS.map((question) => ({ question, number: null })) });
    }
    for (const step of survey.steps) {
      pages.push({ key: step.id, title: step.title, questions: step.questions.map((question) => ({ question, number: numbers.get(question.id) ?? null })) });
    }
    return pages;
  });

  protected readonly page = computed(() => {
    const pages = this.pages();
    return pages[Math.min(this.pageIndex(), pages.length - 1)] ?? null;
  });
  protected readonly isLast = computed(() => this.pageIndex() >= this.pages().length - 1);

  /** What the current step still misses, by question id. */
  protected readonly problems = computed(() => {
    const answers = this.answers();
    const problems = new Map<string, string>();
    for (const { question } of this.page()?.questions ?? []) {
      const problem = answerProblem(question, answers[question.id]);
      if (problem) {
        problems.set(question.id, problem);
      }
    }
    return problems;
  });

  protected readonly state = computed<State>(() => {
    const survey = this.survey();
    if (!survey) {
      const error = this.preview() ? this._admin.loadError(this.surveyId() ?? '') : this._loadError();
      if (error) {
        return error.status === 404 || error.status === 403 ? 'missing' : 'failed';
      }
      return 'loading';
    }
    if (this.sent()) {
      return 'sent';
    }
    if (this.preview()) {
      return 'take';
    }
    if (survey.status === 'draft') {
      return 'not-open';
    }
    const status = currentStatus(survey);
    if (!this.person()) {
      return status === 'closed' ? 'closed' : 'signed-out';
    }
    if (this.answeredAt()) {
      return 'answered';
    }
    return status === 'closed' ? 'closed' : 'take';
  });

  protected readonly facts = computed(() => {
    const survey = this.survey();
    return survey ? { questions: questionCount(survey), steps: this.pages().length, minutes: estimatedMinutes(survey), closesOn: survey.status === 'open' ? survey.closesOn : null } : null;
  });

  /** The step a draft got to, counted from 1 - within the steps the survey has now. */
  protected readonly draftStep = computed(() => Math.min((this.draft()?.stepIndex ?? 0) + 1, this.pages().length));

  /** Which survey, as whom: when it changes the page starts over - but not when the editor changes the survey under a preview. */
  private readonly _who = computed(() => `${this.survey()?.id ?? ''}|${this._personId() ?? ''}|${this.preview()}`);

  protected readonly formatDate = formatDate;
  protected readonly formatDay = formatDay;
  protected readonly timeAgo = timeAgo;

  constructor() {
    effect(() => {
      const survey = this.survey();
      const state = this.state();
      this._title.setTitle(survey ? `${this.preview() ? 'Preview: ' : ''}${survey.title}` : state === 'loading' ? 'anotoki survey' : 'Survey not found · anotoki survey');
    });

    // The survey, and whether this person has answered it: again for another address, or another person.
    effect(() => {
      const slug = this.slug();
      const id = this.surveyId();
      const preview = this.preview();
      this._personId();
      untracked(() => void this._load(slug, id, preview));
    });

    // A preview follows the editor: read again whenever its tab comes back into view.
    const onVisible = () => {
      if (this.preview() && document.visibilityState === 'visible' && this.surveyId()) {
        void this._admin.load(this.surveyId() as string, true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('visibilitychange', onVisible));

    effect(() => {
      this._who();
      untracked(() => {
        const survey = this.survey();
        const person = this.person();
        this._startOver(survey && person && !this.preview() ? readDraft(survey.id, person.id) : null);
      });
    });

    // The draft follows every change while the person is on the steps.
    effect(() => {
      const answers = this.answers();
      const stepIndex = this.pageIndex();
      if (this.phase() !== 'steps' || this.preview() || this.sent()) {
        return;
      }
      const survey = untracked(this.survey);
      const person = untracked(this.person);
      if (survey && person) {
        writeDraft(survey.id, person.id, { stepIndex, answers, startedAt: untracked(this.startedAt) ?? new Date().toISOString(), savedAt: new Date().toISOString() });
      }
    });
  }

  protected retry(): void {
    void this._load(this.slug(), this.surveyId(), this.preview());
  }

  protected start(): void {
    // A person back on the welcome after some steps keeps the time they began.
    this.startedAt.set(this.startedAt() ?? this.draft()?.startedAt ?? new Date().toISOString());
    this.phase.set('steps');
    this.pageIndex.set(0);
    this._showStep();
  }

  /** Back where the person stopped, with what they had answered. */
  protected carryOn(): void {
    const draft = this.draft();
    if (!draft) {
      this.start();
      return;
    }
    this.answers.set(draft.answers);
    this.startedAt.set(draft.startedAt);
    this.pageIndex.set(Math.min(Math.max(0, draft.stepIndex), this.pages().length - 1));
    this.phase.set('steps');
    this._showStep();
  }

  protected startAgain(): void {
    const survey = this.survey();
    const person = this.person();
    if (survey && person) {
      clearDraft(survey.id, person.id);
    }
    this._startOver(null);
    this.start();
  }

  protected setAnswer(questionId: string, answer: Answer): void {
    this.answers.update((answers) => ({ ...answers, [questionId]: answer }));
  }

  protected next(event?: Event): void {
    event?.preventDefault();
    if (this.sending()) {
      return;
    }
    if (this.problems().size) {
      this.tried.set(true);
      this._showFirstProblem();
      return;
    }
    if (this.isLast()) {
      void this._send();
      return;
    }
    this.tried.set(false);
    this.pageIndex.update((index) => index + 1);
    this._showStep();
  }

  protected back(): void {
    this.tried.set(false);
    if (this.pageIndex() === 0) {
      // The welcome offers to carry on from the draft as it is now, not as it
      // was when the page was opened - that one would bring older answers back.
      const survey = this.survey();
      const person = this.person();
      this.draft.set(survey && person && !this.preview() ? readDraft(survey.id, person.id) : null);
      this.phase.set('welcome');
      this._focusAfterRender('.start button, app-alert button');
      return;
    }
    this.pageIndex.update((index) => index - 1);
    this._showStep();
  }

  /** To the IAM, and back to this survey. */
  protected signIn(): void {
    this._auth.signIn();
  }

  protected restartPreview(): void {
    this._startOver(null);
  }

  private async _load(slug: string | undefined, surveyId: string | undefined, preview: boolean): Promise<void> {
    if (preview) {
      if (surveyId) {
        await this._admin.load(surveyId, true);
      }
      return;
    }
    this._loadError.set(null);
    if (!slug) {
      return;
    }
    // Another survey's address: nothing of the last one stays on the page while this one comes.
    if (this._loaded()?.survey.slug !== slug) {
      this._loaded.set(null);
    }
    try {
      const loaded = await this._api.surveyBySlug(slug);
      if (this.slug() === slug) {
        this._loaded.set(loaded);
      }
    } catch (error) {
      // Asked again for the survey already on the page (somebody signed in,
      // or the answers were refused) and the server did not answer: the page
      // keeps what it has, and the person their answers - sending says why.
      if (this.slug() === slug && this._loaded()?.survey.slug !== slug) {
        this._loadError.set(toApiError(error));
      }
    }
  }

  private async _send(): Promise<void> {
    const survey = this.survey();
    const person = this.person();
    if (!survey) {
      return;
    }

    // Every step again: find the first one with anything missing and go there.
    const pages = this.pages();
    const answers = this.answers();
    const broken = pages.findIndex((page) => page.questions.some(({ question }) => answerProblem(question, answers[question.id])));
    if (broken >= 0) {
      this._showProblemOn(broken);
      return;
    }

    const kept: Record<string, Answer> = {};
    for (const step of survey.steps) {
      for (const question of step.questions) {
        const answer = cleanAnswer(question, answers[question.id]);
        if (answer) {
          kept[question.id] = answer;
        }
      }
    }
    const gender = answers[GENDER_ID]?.optionIds[0] ?? '';
    const age = answers[AGE_ID]?.optionIds[0] ?? '';
    const aboutYou: AboutYou | null = survey.askAboutYou && isGenderKey(gender) && isAgeKey(age) ? { gender, age } : null;
    const now = new Date().toISOString();
    const response: SurveyResponse = {
      id: newId(),
      surveyId: survey.id,
      person: person ?? { id: 'preview', name: 'Preview', email: '' },
      aboutYou,
      answers: kept,
      startedAt: this.startedAt() ?? now,
      submittedAt: now,
    };

    if (this.preview()) {
      this.sent.set(response);
      this._showTop();
      return;
    }
    if (!person) {
      return;
    }

    this.sending.set(true);
    try {
      const saved = await this._api.submit(survey.slug, { aboutYou, answers: kept, startedAt: response.startedAt });
      clearDraft(survey.id, person.id);
      this.sent.set({ ...response, id: saved.id, submittedAt: saved.submittedAt });
      this._loaded.update((loaded) => (loaded ? { ...loaded, answeredAt: saved.submittedAt } : loaded));
      this._showTop();
    } catch (failure) {
      const error = toApiError(failure);
      if (error.code === 'already_answered') {
        clearDraft(survey.id, person.id);
        this._toast.info(error.message);
        void this._load(this.slug(), undefined, false);
      } else if (error.code === 'not_open') {
        this._toast.error(error.message + ' Sorry!');
        void this._load(this.slug(), undefined, false);
      } else if (error.code === 'invalid_answer' && typeof error.body['questionId'] === 'string') {
        // The survey changed under the person: back to what it says needs another look.
        const at = pages.findIndex((page) => page.questions.some(({ question }) => question.id === error.body['questionId']));
        this._toast.error(error.message);
        this._showProblemOn(at >= 0 ? at : this.pageIndex());
        void this._load(this.slug(), undefined, false);
      } else if (error.status === 401) {
        this._toast.error('Your sign-in has run out. Sign in again - your answers are kept in this browser, and are still here when you come back.');
      } else {
        this._toast.error(`Your answers could not be sent: ${error.message} They are kept in this browser - try again.`);
      }
    } finally {
      this.sending.set(false);
    }
  }

  private _startOver(draft: Draft | null): void {
    this.phase.set('welcome');
    this.pageIndex.set(0);
    this.answers.set({});
    this.startedAt.set(null);
    this.tried.set(false);
    this.sent.set(null);
    this.draft.set(draft);
  }

  /** The step at `index` with its problems shown, and the first of them in view. */
  private _showProblemOn(index: number): void {
    this.phase.set('steps');
    this.pageIndex.set(index);
    this.tried.set(true);
    this._showFirstProblem();
  }

  /** After a step change: the top of the card in view, and focus on the step's heading so a screen reader starts there. */
  private _showStep(): void {
    afterNextRender(
      () => {
        const heading = this._host.nativeElement.querySelector<HTMLElement>('.step-heading');
        this._scrollToCard();
        heading?.focus({ preventScroll: true });
      },
      { injector: this._injector },
    );
  }

  private _showTop(): void {
    afterNextRender(
      () => {
        this._scrollToCard();
        this._host.nativeElement.querySelector<HTMLElement>('.done-heading')?.focus({ preventScroll: true });
      },
      { injector: this._injector },
    );
  }

  /**
   * The first question still missing something, scrolled to, with focus where
   * the fix is: the empty "Other" field, else the chosen option (focus on an
   * unchosen radio would let Space or an arrow change the answer), else the
   * first field.
   */
  private _showFirstProblem(): void {
    afterNextRender(
      () => {
        const question = this._host.nativeElement.querySelector<HTMLElement>('.question.has-error');
        question?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const target =
          question?.querySelector<HTMLElement>('.other .field-invalid .field-input') ??
          question?.querySelector<HTMLElement>('input:checked') ??
          question?.querySelector<HTMLElement>('input:not([disabled]), textarea');
        target?.focus({ preventScroll: true });
      },
      { injector: this._injector },
    );
  }

  /** Focus on the first element the selector finds, once the view has been drawn. */
  private _focusAfterRender(selector: string): void {
    afterNextRender(() => this._host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this._injector });
  }

  private _scrollToCard(): void {
    const card = this._host.nativeElement.querySelector<HTMLElement>('.card');
    if (card && card.getBoundingClientRect().top < 0) {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
