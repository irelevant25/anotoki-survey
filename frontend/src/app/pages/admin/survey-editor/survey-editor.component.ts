import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, DOCUMENT, ElementRef, Injector, afterNextRender, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AdminStore } from '../../../core/admin/admin-store.service';
import { toApiError } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { AGES, GENDERS } from '../../../core/survey/about-you';
import { isBlankHtml } from '../../../core/survey/plain-text';
import { copyQuestion, newQuestion, newStep } from '../../../core/survey/survey-factory';
import { numberedQuestions } from '../../../core/survey/survey-outline';
import { SurveyProblem, surveyProblems } from '../../../core/survey/survey-problems';
import { Question, QuestionType, Step, Survey } from '../../../core/survey/survey.model';
import { AlertComponent } from '../../../ui/alert/alert.component';
import { ButtonComponent } from '../../../ui/button/button.component';
import { ConfirmService } from '../../../ui/confirm/confirm.service';
import { EmptyStateComponent } from '../../../ui/empty-state/empty-state.component';
import { IconComponent } from '../../../ui/icon/icon.component';
import { RichTextEditorComponent } from '../../../ui/rich-text-editor/rich-text-editor.component';
import { SpinnerComponent } from '../../../ui/spinner/spinner.component';
import { ToastService } from '../../../ui/toast/toast.service';
import { SurveyHeaderComponent } from '../survey-header/survey-header.component';
import { EditorOutlineComponent } from './editor-outline/editor-outline.component';
import { EditorSettingsComponent } from './editor-settings/editor-settings.component';
import { QUESTION_TYPES, QuestionEditorComponent, StepChoice } from './question-editor/question-editor.component';
import { SurveyEditing } from './survey-editing.service';

/**
 * The editor: a survey from its welcome to its thanks, step by step.
 *
 * What the survey is made of is laid out as people will meet it - the welcome,
 * "About you" when it is asked, the steps with their questions, the thanks -
 * so arranging the steps is arranging the pages. Questions are dragged by
 * their handle within a step or into another one (or moved with the arrows,
 * which cross into the next step at the ends); steps move with their arrows.
 *
 * Every change is saved as it is made (AdminStore, a moment after the last
 * one). There is no Save button to forget - and a save that did not go
 * through, or met somebody else's, says so above the survey.
 */
@Component({
  selector: 'app-survey-editor',
  imports: [
    RouterLink,
    CdkDropList,
    CdkDrag,
    AlertComponent,
    ButtonComponent,
    EmptyStateComponent,
    IconComponent,
    RichTextEditorComponent,
    SpinnerComponent,
    SurveyHeaderComponent,
    EditorOutlineComponent,
    EditorSettingsComponent,
    QuestionEditorComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SurveyEditing],
  templateUrl: './survey-editor.component.html',
  styleUrl: './survey-editor.component.scss',
})
export class SurveyEditorComponent {
  readonly surveyId = input.required<string>();

  private readonly _store = inject(AdminStore);
  private readonly _editing = inject(SurveyEditing);
  private readonly _confirm = inject(ConfirmService);
  private readonly _toast = inject(ToastService);
  private readonly _router = inject(Router);
  private readonly _injector = inject(Injector);
  private readonly _document = inject(DOCUMENT);
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly auth = inject(AuthService);

  protected readonly types = QUESTION_TYPES;
  protected readonly genders = GENDERS.map((item) => item.label).join(' · ');
  protected readonly ages = AGES.map((item) => item.label).join(' · ');

  protected readonly survey = computed(() => this._store.survey(this.surveyId()));
  /** Why it is not here: not_found, or the server out of reach. */
  protected readonly loadError = computed(() => (this.survey() ? null : this._store.loadError(this.surveyId())));
  protected readonly save = computed(() => this._store.saveStatus(this.surveyId()));
  protected readonly responses = computed(() => this._store.responses(this.surveyId()) ?? []);
  protected readonly firstStep = computed(() => (this.survey()?.askAboutYou ? 2 : 1));
  protected readonly stepTotal = computed(() => (this.survey()?.steps.length ?? 0) + this.firstStep() - 1);

  protected readonly problems = computed(() => {
    const survey = this.survey();
    return survey ? surveyProblems(survey, this._store.summaries() ?? []) : [];
  });
  protected readonly questionProblems = computed(() => this._groupProblems('question'));
  protected readonly stepProblems = computed(() => this._groupProblems('step'));
  /** The address's problems, for the settings, where the address is edited. */
  protected readonly addressProblems = computed(() =>
    this.problems()
      .filter((problem) => problem.target.kind === 'survey' && problem.target.field === 'address')
      .map((problem) => problem.message),
  );
  protected readonly otherSlugs = computed(() => (this._store.summaries() ?? []).filter((survey) => survey.id !== this.surveyId()).map((survey) => survey.slug));

  protected readonly numbers = computed(() => {
    const survey = this.survey();
    return new Map(survey ? numberedQuestions(survey).map((item) => [item.question.id, item.number]) : []);
  });
  protected readonly questionTotal = computed(() => this.numbers().size);

  protected readonly stepChoices = computed<StepChoice[]>(() =>
    (this.survey()?.steps ?? []).map((step, index) => ({ id: step.id, label: `step ${index + this.firstStep()}${step.title ? ` - ${step.title}` : ''}` })),
  );
  protected readonly listIds = computed(() => (this.survey()?.steps ?? []).map((step) => `step-list-${step.id}`));

  /** How many answered each question, and chose each option - for the warnings before something is removed. */
  protected readonly counts = computed(() => {
    const counts = new Map<string, { answered: number; byOption: Record<string, number> }>();
    for (const response of this.responses()) {
      for (const [questionId, answer] of Object.entries(response.answers)) {
        const entry = counts.get(questionId) ?? { answered: 0, byOption: {} };
        entry.answered++;
        for (const optionId of answer.optionIds) {
          entry.byOption[optionId] = (entry.byOption[optionId] ?? 0) + 1;
        }
        counts.set(questionId, entry);
      }
    }
    return counts;
  });

  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  /** The question just added: its text takes the focus. */
  protected readonly justAdded = signal<string | null>(null);
  private _unfoldedFor: string | null = null;

  constructor() {
    // The questions below write to this survey (SurveyEditing).
    effect(() => this._editing.surveyId.set(this.surveyId()));

    // The survey as the server has it now (unless changes of this page's are
    // still on their way), the other surveys' addresses, and the answers - for
    // the warnings before something answered is removed.
    effect(() => {
      const id = this.surveyId();
      untracked(() => {
        void this._store.load(id, true);
        void this._store.loadSummaries();
        void this._store.loadResponses(id, true);
      });
    });

    // Opening a survey unfolds the questions that have no text yet - a new
    // survey's first question - and nothing else.
    effect(() => {
      const survey = this.survey();
      untracked(() => {
        if (survey && this._unfoldedFor !== survey.id) {
          this._unfoldedFor = survey.id;
          this.expanded.set(
            new Set(
              numberedQuestions(survey)
                .filter((item) => isBlankHtml(item.question.text))
                .map((item) => item.question.id),
            ),
          );
        }
      });
    });
  }

  // ── The survey ─────────────────────────────────────────────────────────────

  protected patch(fields: Partial<Survey>): void {
    this._edit((survey) => ({ ...survey, ...fields }));
  }

  protected onTitle(event: Event): void {
    this.patch({ title: (event.target as HTMLInputElement).value });
  }

  protected async deleteSurvey(): Promise<void> {
    const survey = this.survey();
    if (!survey) {
      return;
    }
    const answers = this.responses().length;
    const sure = await this._confirm.ask({
      title: `Delete "${survey.title || 'Untitled survey'}"?`,
      message: answers ? `Its ${answers} ${answers === 1 ? 'answer goes' : 'answers go'} with it, and none of it can be brought back.` : 'Nobody has answered it yet. It cannot be brought back.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!sure) {
      return;
    }
    try {
      await this._store.delete(survey.id);
      this._toast.success('The survey is deleted.');
      void this._router.navigate(['/admin']);
    } catch (error) {
      this._toast.error(`The survey could not be deleted: ${toApiError(error).message}`);
    }
  }

  // ── Saving ─────────────────────────────────────────────────────────────────

  protected retrySave(): void {
    void this._store.flush(this.surveyId());
  }

  /** A conflict settled: somebody else's version replaces the changes made here since the last save. */
  protected takeTheirs(): void {
    this._store.takeTheirs(this.surveyId());
    this._unfoldedFor = null;
    this._toast.info('This is the survey as it was saved last.');
  }

  /** A conflict settled the other way: what is here is saved over the other version. */
  protected async keepMine(): Promise<void> {
    const sure = await this._confirm.ask({
      title: 'Save your version over theirs?',
      message: 'The changes the other person saved since you opened the survey are lost.',
      confirmLabel: 'Save mine',
      tone: 'danger',
    });
    if (sure) {
      this._store.keepMine(this.surveyId());
    }
  }

  protected reload(): void {
    void this._store.load(this.surveyId(), true);
  }

  // ── Steps ──────────────────────────────────────────────────────────────────

  protected setStepTitle(stepId: string, event: Event): void {
    const title = (event.target as HTMLInputElement).value;
    this._editSteps((steps) => steps.map((step) => (step.id === stepId ? { ...step, title } : step)));
  }

  /** A new step at the end, with a first question in it, ready to be written. */
  protected addStep(): void {
    const step = newStep();
    const question = newQuestion('single');
    step.questions.push(question);
    this._editSteps((steps) => [...steps, step]);
    this._unfold(question.id);
  }

  protected async removeStep(step: Step, index: number): Promise<void> {
    if (step.questions.length) {
      const answered = step.questions.reduce((sum, question) => sum + (this.counts().get(question.id)?.answered ?? 0), 0);
      const count = step.questions.length;
      const sure = await this._confirm.ask({
        title: `Remove step ${index + this.firstStep()}${step.title ? ` "${step.title}"` : ''}?`,
        message:
          `Its ${count === 1 ? 'question goes' : `${count} questions go`} with it.` +
          (answered ? ' Their answers disappear from the results.' : '') +
          ' To keep a question, move it to another step first.',
        confirmLabel: 'Remove',
        tone: 'danger',
      });
      if (!sure) {
        return;
      }
    }
    this._editSteps((steps) => steps.filter((item) => item.id !== step.id));
  }

  protected moveStep(index: number, by: -1 | 1): void {
    this._editSteps((steps) => {
      const moved = [...steps];
      moveItemInArray(moved, index, index + by);
      return moved;
    });
  }

  // ── Questions ──────────────────────────────────────────────────────────────

  protected addQuestion(stepId: string, type: QuestionType): void {
    const question = newQuestion(type);
    this._editSteps((steps) => steps.map((step) => (step.id === stepId ? { ...step, questions: [...step.questions, question] } : step)));
    this._unfold(question.id);
  }

  protected duplicateQuestion(stepId: string, question: Question): void {
    const copy = copyQuestion(question);
    this._editSteps((steps) =>
      steps.map((step) => {
        if (step.id !== stepId) {
          return step;
        }
        const questions = [...step.questions];
        questions.splice(questions.findIndex((item) => item.id === question.id) + 1, 0, copy);
        return { ...step, questions };
      }),
    );
    this._unfold(copy.id);
  }

  protected async removeQuestion(question: Question): Promise<void> {
    const answered = this.counts().get(question.id)?.answered ?? 0;
    if (answered || !isBlankHtml(question.text)) {
      const sure = await this._confirm.ask({
        title: `Remove question ${this.numbers().get(question.id) ?? ''}?`,
        message: answered ? `${answered} ${answered === 1 ? 'person has' : 'people have'} answered it. Their answers disappear from the results with it.` : 'Its text and options go with it.',
        confirmLabel: 'Remove',
        tone: 'danger',
      });
      if (!sure) {
        return;
      }
    }
    this._editSteps((steps) => steps.map((step) => ({ ...step, questions: step.questions.filter((item) => item.id !== question.id) })));
  }

  /** One place up or down - past the end of its step into the next, past the start into the one before. */
  protected moveQuestion(stepId: string, index: number, by: -1 | 1): void {
    this._editSteps((steps) => {
      const stepIndex = steps.findIndex((step) => step.id === stepId);
      const copy = steps.map((step) => ({ ...step, questions: [...step.questions] }));
      const here = copy[stepIndex].questions;
      const to = index + by;
      if (to >= 0 && to < here.length) {
        moveItemInArray(here, index, to);
      } else {
        const neighbour = copy[stepIndex + by];
        if (!neighbour) {
          return steps;
        }
        const [question] = here.splice(index, 1);
        if (by < 0) {
          neighbour.questions.push(question);
        } else {
          neighbour.questions.unshift(question);
        }
      }
      return copy;
    });
  }

  protected moveQuestionToStep(questionId: string, fromStepId: string, toStepId: string): void {
    this._editSteps((steps) => {
      const question = steps.find((step) => step.id === fromStepId)?.questions.find((item) => item.id === questionId);
      if (!question) {
        return steps;
      }
      return steps.map((step) => {
        if (step.id === fromStepId) {
          return { ...step, questions: step.questions.filter((item) => item.id !== questionId) };
        }
        return step.id === toStepId ? { ...step, questions: [...step.questions, question] } : step;
      });
    });
    const label = this.stepChoices().find((step) => step.id === toStepId)?.label ?? 'the step';
    this._toast.success(`Moved to the end of ${label}.`);
    this._scrollTo(`question-${questionId}`);
  }

  /** A question dropped where it was dragged: in its own step, or another one. */
  protected drop(event: CdkDragDrop<string>): void {
    const from = event.previousContainer.data;
    const to = event.container.data;
    if (from === to && event.previousIndex === event.currentIndex) {
      return;
    }
    this._editSteps((steps) => {
      const copy = steps.map((step) => ({ ...step, questions: [...step.questions] }));
      const source = copy.find((step) => step.id === from);
      const target = copy.find((step) => step.id === to);
      if (!source || !target) {
        return steps;
      }
      if (source === target) {
        moveItemInArray(source.questions, event.previousIndex, event.currentIndex);
      } else {
        transferArrayItem(source.questions, target.questions, event.previousIndex, event.currentIndex);
      }
      return copy;
    });
  }

  protected dragging(on: boolean): void {
    this._document.body.classList.toggle('is-dragging', on);
  }

  // ── Folding and finding ────────────────────────────────────────────────────

  protected toggle(questionId: string): void {
    this.justAdded.set(null);
    this.expanded.update((open) => {
      const next = new Set(open);
      if (!next.delete(questionId)) {
        next.add(questionId);
      }
      return next;
    });
  }

  protected unfoldAll(): void {
    this.justAdded.set(null);
    this.expanded.set(new Set(this.numbers().keys()));
  }

  protected foldAll(): void {
    this.expanded.set(new Set());
  }

  /** From the outline or a problem: there, unfolded if it is a question. */
  protected goTo(target: SurveyProblem['target']): void {
    if (target.kind === 'question') {
      this.justAdded.set(null);
      this.expanded.update((open) => new Set(open).add(target.questionId));
      this._scrollTo(`question-${target.questionId}`);
    } else if (target.kind === 'step') {
      this._scrollTo(`step-${target.stepId}`);
    } else if (target.field === 'questions') {
      this._focusField('add-step');
    } else {
      this._focusField(target.field === 'title' ? 'survey-title' : 'survey-slug');
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _edit(change: (survey: Survey) => Survey): void {
    this._store.updateSurvey(this.surveyId(), change);
  }

  private _editSteps(change: (steps: Step[]) => Step[]): void {
    this._edit((survey) => ({ ...survey, steps: change(survey.steps) }));
  }

  private _unfold(questionId: string): void {
    this.expanded.update((open) => new Set(open).add(questionId));
    this.justAdded.set(questionId);
    this._scrollTo(`question-${questionId}`);
  }

  /** A field (or button) by its id: in view, and in focus to be fixed. */
  private _focusField(id: string): void {
    afterNextRender(
      () => {
        const element = this._host.nativeElement.querySelector<HTMLElement>(`[id="${id}"]`);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element?.focus({ preventScroll: true });
      },
      { injector: this._injector },
    );
  }

  private _scrollTo(id: string): void {
    afterNextRender(() => this._host.nativeElement.querySelector(`[id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), { injector: this._injector });
  }

  /** The problems of each question or step, by its id, worded for where they are shown - on it. */
  private _groupProblems(kind: 'question' | 'step'): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const problem of this.problems()) {
      const target = problem.target;
      const id = kind === 'question' && target.kind === 'question' ? target.questionId : kind === 'step' && target.kind === 'step' ? target.stepId : null;
      if (id) {
        const onIt = problem.message.replace(/^Question \d+: /, '').replace(/^Question \d+ /, 'It ');
        map.set(id, [...(map.get(id) ?? []), onIt.charAt(0).toUpperCase() + onIt.slice(1)]);
      }
    }
    return map;
  }
}
