import { CdkDrag, CdkDragDrop, CdkDropList, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, DOCUMENT, ElementRef, Injector, afterNextRender, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AlertComponent } from '@anotoki/lib/ui/alert';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { EmptyStateComponent } from '@anotoki/lib/ui/empty-state';
import { HtmlEditorComponent } from '@anotoki/lib/ui/html-editor';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { richHtmlIsBlank } from '@anotoki/lib/ui/rich-html';
import { SpinnerComponent } from '@anotoki/lib/ui/spinner';
import { ConfirmService } from '@anotoki/lib/ui/dialog';
import { ToastService } from '@anotoki/lib/ui/toast';
import { AdminStore, SURVEY_TOO_LARGE } from '../../../shared/admin/admin-store.service';
import { toApiError } from '../../../api/api.service';
import { AuthService } from '../../../shared/auth/auth.service';
import { MAX_STEP_IMAGES } from '../shared/images/prepare-image';
import { AGES, GENDERS } from '../../../shared/survey/about-you';
import { TranslationPlace, addTranslation, removeTranslation, translationCodes, translationGaps, translationOf, translationPlaces } from '../../../shared/survey/localize';
import { duplicateQuestion, newQuestion, newStep } from '../../../shared/survey/survey-factory';
import { currentStatus, numberedQuestions, stepHasContent } from '../../../shared/survey/survey-outline';
import { SurveyProblem, surveyProblems } from '../../../shared/survey/survey-problems';
import { Question, QuestionType, Step, Survey } from '../../../shared/survey/survey.model';
import { SURVEY_TEXT_HEADINGS, SURVEY_TEXT_TOOLS } from '../shared/text-tools';
import { SurveyHeaderComponent } from '../survey-header/survey-header.component';
import { EditorLanguagesComponent } from './editor-languages/editor-languages.component';
import { EditorOutlineComponent } from './editor-outline/editor-outline.component';
import { EditorSettingsComponent } from './editor-settings/editor-settings.component';
import { ImageListEditorComponent } from './image-list-editor/image-list-editor.component';
import { KeyedDirective } from './keyed.directive';
import { QUESTION_TYPES, QuestionEditorComponent, StepChoice } from './question-editor/question-editor.component';
import { SurveyEditing } from './survey-editing.service';
import { TranslatedTextComponent } from './translated-text/translated-text.component';
import { languageName, listOfNames, nextGap, placeKey, questionGaps, stepGaps, translationTabs } from './translating';

/**
 * The editor: a survey from its welcome to its thanks, step by step.
 *
 * What the survey is made of is laid out as people will meet it - the welcome,
 * "About you" when it is asked, the steps with their questions, the thanks -
 * so arranging the steps is arranging the pages. Questions are dragged by
 * their handle within a step or into another one (or moved with the arrows,
 * which cross into the next step at the ends); steps move with their arrows.
 *
 * A step may say something of its own above its questions - a text (rich, as
 * a question's) and pictures under it (as under a question's text) - or be
 * only that, with no question: a task people read and do, and leave with
 * Next ("Add a text step"). A step's text and pictures are shown once it has
 * either, or once "Text and pictures" is pressed on it; a step with neither
 * and no question is a problem.
 *
 * Every change is saved as it is made (AdminStore, a moment after the last
 * one). There is no Save button to forget - and a save that did not go
 * through, or met somebody else's, says so above the survey.
 *
 * A survey is written in one language and may be translated into others: the
 * language switch above the survey has a tab for each. On a translation's tab
 * the same form is drawn with its structure locked - nothing is added,
 * removed, moved or given another kind or limit there - and every text is a
 * pair: the original, read-only, and the field for the translation
 * (TranslatedTextComponent). "Next missing" goes through the texts still to
 * translate in the order of the survey. Which tab is on is SurveyEditing's to
 * say, from the document: a translation that goes puts the page back in the
 * main language. The address may name the tab to open
 * (`/admin/surveys/<id>/edit?language=sk` - the way back from the preview of
 * a translation); the tabs themselves do not write the address.
 *
 * A save that meets somebody else's while only translated texts were being
 * written is settled by language: the survey as they saved it, with the
 * texts of those languages that were changed here put into it. Settled the
 * other way - this version over theirs - the translations are still brought
 * together text by text (AdminStore.keepMine()). What the page says before
 * either, and after, is what is kept and what is lost - the languages that
 * go or come back with it, by name. Which of the two it is comes from the
 * documents (AdminStore.unsavedChanges()), not from anything the page
 * remembers: the page may be left for the preview and entered again with the
 * changes still unsaved. A version the server would refuse (written in
 * another language than theirs, both with translations) is not offered at
 * all: the notice says how to make it one the server takes.
 *
 * An open survey with a text missing from a translation people are offered
 * is shown to the readers of that language in the language it is written in:
 * the notice above the survey, the language's tab and the bar that stays in
 * view all say so, by name - for as long as people can take it, which ends
 * with its last day (currentStatus), whether or not anybody pressed "Close".
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
    HtmlEditorComponent,
    IconComponent,
    SpinnerComponent,
    SurveyHeaderComponent,
    EditorLanguagesComponent,
    EditorOutlineComponent,
    EditorSettingsComponent,
    ImageListEditorComponent,
    KeyedDirective,
    QuestionEditorComponent,
    TranslatedTextComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [SurveyEditing],
  templateUrl: './survey-editor.component.html',
  styleUrl: './survey-editor.component.scss',
})
export class SurveyEditorComponent {
  readonly surveyId = input.required<string>();
  /**
   * `?language=` in the address: the translation whose tab to open - as the
   * preview's own parameter is called, so its "Back to the editor" comes back
   * to the language it showed. Only a translation the survey has opens;
   * anything else is the language the survey is written in.
   */
  readonly languageParam = input<string | undefined>(undefined, { alias: 'language' });

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
  protected readonly tooLarge = SURVEY_TOO_LARGE;
  protected readonly maxStepImages = MAX_STEP_IMAGES;
  /** The text editors' buttons and the welcome's and the thanks' headings: the survey's (sites/admin/shared/text-tools.ts). */
  protected readonly textTools = SURVEY_TEXT_TOOLS;
  protected readonly textHeadings = SURVEY_TEXT_HEADINGS;
  protected readonly genders = GENDERS.map((item) => item.label).join(' · ');
  protected readonly ages = AGES.map((item) => item.label).join(' · ');

  protected readonly survey = computed(() => this._store.survey(this.surveyId()));
  /** The survey is here - which changes once, while the survey itself changes with every keystroke. */
  private readonly _loaded = computed(() => this.survey() !== undefined);
  /** Why it is not here: not_found, or the server out of reach. */
  protected readonly loadError = computed(() => (this.survey() ? null : this._store.loadError(this.surveyId())));
  protected readonly save = computed(() => this._store.saveStatus(this.surveyId()));
  protected readonly responses = computed(() => this._store.responses(this.surveyId()) ?? []);
  protected readonly firstStep = computed(() => (this.survey()?.askAboutYou ? 2 : 1));
  protected readonly stepTotal = computed(() => (this.survey()?.steps.length ?? 0) + this.firstStep() - 1);

  protected readonly problems = computed(() => {
    const survey = this.survey();
    return survey ? surveyProblems(survey, this._store.summaries() ?? [], this._store.languages() ?? []) : [];
  });
  /** The status as people meet it - the header's: an open survey whose last day is over is closed, and nobody is taking it. */
  protected readonly status = computed(() => {
    const survey = this.survey();
    return survey ? currentStatus(survey) : 'draft';
  });

  // ── The languages ──────────────────────────────────────────────────────────

  /** Every language the site has; null until they have come. */
  protected readonly languages = computed(() => this._store.languages());
  /** The translation being edited - its code - or null: the language the survey is written in. */
  protected readonly language = this._editing.language;
  protected readonly languageName = this._editing.languageName;
  protected readonly mainName = this._editing.mainName;
  /** The tab that is on, with how far its translation is; null in the main language. */
  protected readonly tab = computed(() => {
    const survey = this.survey();
    const code = this.language();
    return survey && code ? (translationTabs(survey, this.languages()).find((tab) => tab.code === code) ?? null) : null;
  });
  /** Something keeps the survey from opening that is not a text still to translate: the survey's own problems, or a translation's that is not a gap. */
  protected readonly hasOtherProblems = computed(() => this.problems().some((problem) => !problem.untranslated));
  /**
   * The offered languages a translation of which still lacks a text, by
   * name ("Slovak and Czech") - empty when there is none. While the survey is
   * open their readers are shown it in the language it is written in.
   */
  protected readonly untranslatedNames = computed(() => {
    const codes = new Set(this.problems().flatMap((problem) => (problem.untranslated && problem.target.language ? [problem.target.language] : [])));
    return listOfNames([...codes].map((code) => languageName(this.languages(), code)));
  });
  /** What the translation being edited still lacks, in the order of the survey. */
  protected readonly gaps = computed(() => {
    const survey = this.survey();
    const code = this.language();
    return survey && code ? translationGaps(survey, code) : [];
  });
  protected readonly questionGaps = computed(() => questionGaps(this.gaps()));
  protected readonly stepGaps = computed(() => stepGaps(this.gaps()));

  /**
   * In a conflict: the languages whose texts can be kept while the rest is
   * taken as somebody else saved it - when translated texts are all that was
   * changed here since the last save. Empty when the survey itself was
   * changed too (that conflict is settled whole, as ever), or when their
   * version could not hold one of them (it is written in that language now).
   *
   * What was changed is read from the documents (the store's survey against
   * what the server last had from this page), so it is the same on a page
   * entered again as on the one that made the changes.
   */
  protected readonly conflictLanguages = computed(() => {
    const save = this.save();
    const survey = this.survey();
    const theirs = save.theirs;
    if (save.state !== 'conflict' || !theirs || !survey) {
      return [];
    }
    const unsaved = this._store.unsavedChanges(survey.id);
    if (unsaved.survey || unsaved.languages.length === 0) {
      return [];
    }
    return unsaved.languages.every((code) => translationOf(survey, code) && code !== theirs.language) ? unsaved.languages : [];
  });
  protected readonly conflictNames = computed(() => listOfNames(this.conflictLanguages().map((code) => languageName(this.languages(), code))));
  /**
   * Of the languages whose texts can be kept: the ones their version no
   * longer has. Keeping my texts puts such a translation back whole, as it is
   * here - which the notice says, by name.
   */
  protected readonly broughtBack = computed(() => {
    const kept = this.conflictLanguages();
    const removed = kept.length ? this._store.removedThereLanguages(this.surveyId()) : [];
    return kept.filter((code) => removed.includes(code));
  });
  protected readonly broughtBackNames = computed(() => listOfNames(this.broughtBack().map((code) => languageName(this.languages(), code))));
  /**
   * In a conflict: what saving this version over theirs does to their
   * translations. `merged`: they stay as the other person saved them, except
   * the texts changed here and those of what they removed or reworded
   * (AdminStore.keepMine()). `whole`: they go with everything else - the two
   * versions are written in different languages. `refused`: the same, but
   * this version holds translations too, and the server takes no survey that
   * changes its language while it has them - it is not offered until they are
   * removed here (AdminStore.mineWouldBeRefused()). `plain`: neither version
   * has a translation, so there is nothing to say.
   */
  protected readonly mineOverTheirs = computed<'plain' | 'merged' | 'whole' | 'refused'>(() => {
    const theirs = this.save().theirs;
    const survey = this.survey();
    if (!theirs || !survey || (translationCodes(theirs).length === 0 && translationCodes(survey).length === 0)) {
      return 'plain';
    }
    if (this._store.mineWouldBeRefused(survey.id)) {
      return 'refused';
    }
    return this._store.keepsTheirTranslations(survey.id) ? 'merged' : 'whole';
  });
  /** In a conflict: the language their version is written in, by name. */
  protected readonly theirsName = computed(() => {
    const theirs = this.save().theirs;
    return theirs ? languageName(this.languages(), theirs.language) : '';
  });
  /**
   * In a conflict settled by saving this version with the translations
   * brought together: what becomes of the languages removed here that their
   * version still has - they stay removed, with whatever was written into
   * them since. A sentence for the notice and for the question before the
   * save; empty when no language goes.
   */
  protected readonly removedSentence = computed(() => {
    const removed = this.mineOverTheirs() === 'merged' ? this._store.removedHereLanguages(this.surveyId()) : [];
    if (removed.length === 0) {
      return '';
    }
    const names = listOfNames(removed.map((code) => languageName(this.languages(), code)));
    return removed.length === 1
      ? `${names}, removed here, stays removed - with everything they have written in it.`
      : `${names}, removed here, stay removed - with everything they have written in them.`;
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
  /**
   * The steps whose text and pictures were asked for here ("Text and
   * pictures", "Add a text step") and may still be empty: shown all the same.
   * A step that has a text or a picture shows them anyway.
   */
  protected readonly textOpened = signal<ReadonlySet<string>>(new Set());
  /** The step whose text was just asked for: its text takes the focus. */
  protected readonly justAddedText = signal<string | null>(null);
  private _unfoldedFor: string | null = null;
  /** The translated text last visited (its key): "Next missing" goes on from there. */
  private _at: string | null = null;

  constructor() {
    // The questions below write to this survey (SurveyEditing) - in its main language, to begin with.
    effect(() => {
      const id = this.surveyId();
      untracked(() => {
        this._editing.open(id);
        this._at = null;
      });
    });

    // The tab the address names, once the survey is here to say whether it
    // has that translation. An address that names none leaves the tab alone:
    // going to the list of problems, or pressing "Editor" again, is not
    // asking for another language.
    effect(() => {
      const code = this.languageParam();
      const loaded = this._loaded();
      this.surveyId();
      untracked(() => {
        const survey = this.survey();
        if (loaded && survey && code !== undefined) {
          this.chooseLanguage(code !== survey.language && translationOf(survey, code) ? code : null);
        }
      });
    });

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
                .filter((item) => richHtmlIsBlank(item.question.text))
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

  // ── Languages ──────────────────────────────────────────────────────────────

  /** Another tab of the language switch: a translation, or (null) the language the survey is written in. */
  protected chooseLanguage(code: string | null): void {
    const before = this.language();
    this._editing.chosen.set(code);
    if (this.language() !== before) {
      this.justAdded.set(null);
      this.justAddedText.set(null);
      this._at = null;
    }
  }

  /** One more language to translate the survey into: empty, and opened at once. */
  protected addLanguage(code: string): void {
    this._editing.update((survey) => addTranslation(survey, code));
    this.chooseLanguage(code);
  }

  protected async removeLanguage(code: string): Promise<void> {
    const survey = this.survey();
    const tab = survey ? translationTabs(survey, this.languages()).find((item) => item.code === code) : undefined;
    if (!tab) {
      return;
    }
    const sure = await this._confirm.ask({
      title: `Remove ${tab.name}?`,
      message:
        (tab.done ? `Its ${tab.done === 1 ? 'translated text goes' : `${tab.done} translated texts go`}, and cannot be brought back.` : 'Nothing is translated into it yet.') +
        ` The survey itself stays as it is, in ${this.mainName()}.`,
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!sure) {
      return;
    }
    this._edit((current) => removeTranslation(current, code));
    this.chooseLanguage(null);
    this._toast.success(`${tab.name} is removed.`);
  }

  /** The language the survey is written in - changed only while nothing is translated (the server refuses it otherwise). */
  protected setMainLanguage(code: string): void {
    const survey = this.survey();
    if (survey && code !== survey.language && translationCodes(survey).length === 0) {
      this._edit((current) => (translationCodes(current).length === 0 ? { ...current, language: code } : current));
    }
  }

  /** To the next text still to translate after the one last visited, in the order of the survey - unfolded, in view and in focus. */
  protected nextMissing(): void {
    const survey = this.survey();
    if (!survey || !this.language()) {
      return;
    }
    const gap = nextGap(translationPlaces(survey), this.gaps(), this._at);
    if (gap) {
      this._focusPlace(gap);
    }
  }

  /** Remembers the translated text the cursor is in: "Next missing" goes on from it. */
  protected onFocusIn(event: FocusEvent): void {
    const key = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-place]')?.dataset['place'];
    if (key) {
      this._at = key;
    }
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

  /** To the notice of a save that did not go through: it is above the survey, and the page may be far below it. */
  protected showSaveNotice(): void {
    this._host.nativeElement.querySelector('app-alert[data-tone="danger"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  /** A conflict settled: somebody else's version replaces the changes made here since the last save. */
  protected takeTheirs(): void {
    this._store.takeTheirs(this.surveyId());
    this._unfoldedFor = null;
    this._toast.info('This is the survey as it was saved last.');
  }

  /**
   * A conflict met while translating, settled by language: the survey as
   * somebody else saved it, with the texts of the languages translated here
   * put into it.
   */
  protected keepMyTranslations(): void {
    const names = this.conflictNames();
    if (this._store.keepMyTranslations(this.surveyId(), this.conflictLanguages()).length) {
      this._unfoldedFor = null;
      this._toast.info(
        `Somebody changed this survey while you were translating. The ${names} texts you changed are put into their version - except those of a step, question, option or picture it no longer has; the questions and every other text are theirs.`,
      );
    }
  }

  /**
   * A conflict settled the other way: what is here is saved over the other
   * version - asked first, in the words of what that loses and what it keeps.
   * Not while the server would refuse it: the notice says what to do first,
   * and the button is not drawn.
   */
  protected async keepMine(): Promise<void> {
    const kind = this.mineOverTheirs();
    if (kind === 'refused') {
      return;
    }
    const removed = this.removedSentence();
    const sure = await this._confirm.ask({
      title: 'Save your version over theirs?',
      message: {
        plain: 'The changes the other person saved meanwhile are lost.',
        merged:
          'Their changes to the questions and the settings are lost. Their translations stay as they saved them, except the texts you changed here and the texts of what they removed or reworded, which stay as you have them.' +
          (removed ? ` ${removed}` : ''),
        whole: 'Everything the other person saved meanwhile is lost, their translations too: the two versions are written in different languages.',
      }[kind],
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

  /** The step's own text, as the rich text field writes it - made to the step as the survey holds it now. */
  protected setStepText(stepId: string, text: string): void {
    this._editSteps((steps) => steps.map((step) => (step.id === stepId ? { ...step, text } : step)));
  }

  /** Whether the step's text and pictures are drawn: it has either, or they were asked for on this page. */
  protected showsText(step: Step): boolean {
    return stepHasContent(step) || this.textOpened().has(step.id);
  }

  /**
   * On a translation's tab: whether the step's text has a pair - the step
   * has a text, or the translation still holds one for it (the original was
   * emptied since: it is shown so that it can be taken out).
   */
  protected translatesText(step: Step): boolean {
    return !richHtmlIsBlank(step.text) || !richHtmlIsBlank(this._editing.text({ kind: 'stepText', stepId: step.id }));
  }

  /** "Text and pictures" on a step: its text and pictures are drawn, and the text takes the focus. */
  protected openStepText(stepId: string): void {
    if (this.language() !== null) {
      return;
    }
    this.textOpened.update((open) => new Set(open).add(stepId));
    this.justAdded.set(null);
    this.justAddedText.set(stepId);
  }

  /** A new step at the end, with a first question in it, ready to be written. */
  protected addStep(): void {
    const step = newStep();
    const question = newQuestion('single');
    step.questions.push(question);
    this._editSteps((steps) => [...steps, step]);
    this._unfold(question.id);
  }

  /**
   * A new step at the end with no question: its text and pictures, the text
   * ready to be written - a task to read and do, which people leave with
   * Next. Questions can still be added to it.
   */
  protected addTextStep(): void {
    if (this.language() !== null) {
      return;
    }
    const step = newStep();
    this._editSteps((steps) => [...steps, step]);
    this.openStepText(step.id);
    this._scrollTo(`step-${step.id}`);
  }

  protected async removeStep(step: Step, index: number): Promise<void> {
    const count = step.questions.length;
    const hasText = !richHtmlIsBlank(step.text);
    const pictures = step.images.length;
    if (count || hasText || pictures) {
      const answered = step.questions.reduce((sum, question) => sum + (this.counts().get(question.id)?.answered ?? 0), 0);
      // What goes with it, by name: its questions, its text, its pictures.
      const parts = [
        ...(count ? [count === 1 ? 'its question' : `its ${count} questions`] : []),
        ...(hasText ? ['its text'] : []),
        ...(pictures ? [pictures === 1 ? 'its picture' : `its ${pictures} pictures`] : []),
      ];
      const plural = parts.length > 1 || /^its \d/.test(parts[0]);
      const goes = listOfNames(parts);
      const sure = await this._confirm.ask({
        title: `Remove step ${index + this.firstStep()}${step.title ? ` "${step.title}"` : ''}?`,
        message:
          `${goes.charAt(0).toUpperCase()}${goes.slice(1)} ${plural ? 'go' : 'goes'} with it.` +
          (answered ? ' Their answers disappear from the results.' : '') +
          (count ? ' To keep a question, move it to another step first.' : ''),
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
    this._edit((survey) => duplicateQuestion(survey, stepId, question.id));
    // The copy stands right after the original, in the survey as it is now.
    const questions = this.survey()?.steps.find((step) => step.id === stepId)?.questions ?? [];
    const at = questions.findIndex((item) => item.id === question.id);
    const copy = at < 0 ? undefined : questions[at + 1];
    if (copy) {
      this._unfold(copy.id);
    }
  }

  protected async removeQuestion(question: Question): Promise<void> {
    const answered = this.counts().get(question.id)?.answered ?? 0;
    if (answered || !richHtmlIsBlank(question.text)) {
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

  /**
   * From a problem: to where it is fixed - in the language it is in (the
   * survey's own, or the translation that lacks something), unfolded if it is
   * a question, and at the text that is missing when it is one.
   */
  protected goTo(target: SurveyProblem['target']): void {
    this.chooseLanguage(target.language ?? null);
    this._show(target, true);
  }

  /** From the outline: there, in the language the page is on. */
  protected show(target: SurveyProblem['target']): void {
    this._show(target, false);
  }

  private _show(target: SurveyProblem['target'], toGap: boolean): void {
    const translating = this.language() !== null;
    if (target.kind === 'question') {
      this.justAdded.set(null);
      this.expanded.update((open) => new Set(open).add(target.questionId));
      const gap = toGap && translating ? this.gaps().find((place) => 'questionId' in place && place.questionId === target.questionId) : undefined;
      if (gap) {
        this._focusPlace(gap);
      } else {
        this._scrollTo(`question-${target.questionId}`);
      }
    } else if (target.kind === 'step') {
      // On a translation's tab, at the first of the step's own texts still missing - its title, its text, a picture's description.
      const gap = toGap && translating ? this.gaps().find((place) => 'stepId' in place && place.stepId === target.stepId) : undefined;
      if (gap) {
        this._focusPlace(gap);
      } else {
        this._scrollTo(`step-${target.stepId}`);
      }
    } else if (target.field === 'questions') {
      this._focusField('add-step');
    } else if (target.field === 'address') {
      this._focusField('survey-slug');
    } else if (translating) {
      this._focusPlace({ kind: target.field });
    } else if (target.field === 'title') {
      this._focusField('survey-title');
    } else {
      // The welcome or the thanks: the rich text of its block.
      const block = target.field === 'intro' ? 'welcome' : 'thanks';
      this._focusWhenDrawn(() => this._host.nativeElement.querySelector<HTMLElement>(`[id="${block}"] [contenteditable="true"]`));
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private _edit(change: (survey: Survey) => Survey): void {
    this._editing.update(change);
  }

  /** The steps and their questions: the survey's structure, which a translation's tab never changes. */
  private _editSteps(change: (steps: Step[]) => Step[]): void {
    if (this.language() === null) {
      this._edit((survey) => ({ ...survey, steps: change(survey.steps) }));
    }
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

  /**
   * The field of a translated text: its question unfolded, the field in view
   * and in focus. "Next missing" goes on from it.
   */
  private _focusPlace(place: TranslationPlace): void {
    if ('questionId' in place) {
      this.justAdded.set(null);
      this.expanded.update((open) => new Set(open).add(place.questionId));
    }
    const key = placeKey(place);
    this._at = key;
    this._focusWhenDrawn(() => {
      // Found by comparing, not by a selector: an id may hold any character.
      const holder = Array.from(this._host.nativeElement.querySelectorAll<HTMLElement>('[data-place]')).find((element) => element.dataset['place'] === key);
      return holder?.matches('input') ? holder : holder?.querySelector<HTMLElement>('[contenteditable="true"]');
    });
  }

  /**
   * Something to focus that may not be there yet: a rich text field makes its
   * editable a moment after it is drawn (its question was folded, or the
   * language has just changed), so it is looked for again a few times.
   */
  private _focusWhenDrawn(find: () => HTMLElement | null | undefined, tries = 6): void {
    const attempt = (left: number): void => {
      const element = find();
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        element.focus({ preventScroll: true });
      } else if (left > 0) {
        setTimeout(() => attempt(left - 1), 50);
      }
    };
    afterNextRender(() => attempt(tries), { injector: this._injector });
  }

  private _scrollTo(id: string): void {
    afterNextRender(() => this._host.nativeElement.querySelector(`[id="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), { injector: this._injector });
  }

  /**
   * The problems of each question or step, by its id, worded for where they
   * are shown - on it. Only those of the language the page is on: a question
   * card in the main language does not list what a translation lacks, and a
   * translation's does not list what the question itself lacks. How many
   * texts a question has left to translate is not among them: the card counts
   * those itself (for a hidden language too, which has no problems).
   */
  private _groupProblems(kind: 'question' | 'step'): Map<string, string[]> {
    const map = new Map<string, string[]>();
    const code = this.language();
    const prefix = `${this.languageName()}: `;
    for (const problem of this.problems()) {
      const target = problem.target;
      const id = kind === 'question' && target.kind === 'question' ? target.questionId : kind === 'step' && target.kind === 'step' ? target.stepId : null;
      if (!id || (target.language ?? null) !== code) {
        continue;
      }
      let onIt: string;
      if (code === null) {
        onIt = problem.message.replace(/^Question \d+: /, '').replace(/^Question \d+ /, 'It ');
      } else {
        const message = problem.message.startsWith(prefix) ? problem.message.slice(prefix.length) : problem.message;
        if (/^question \d+ has (1 text|\d+ texts) to translate\.$/.test(message)) {
          continue;
        }
        onIt = message
          .replace(/^question \d+ /, 'It ')
          .replace(/^step \d+ /, 'It ')
          .replace(/^the title of step \d+ /, 'Its title ');
      }
      map.set(id, [...(map.get(id) ?? []), onIt.charAt(0).toUpperCase() + onIt.slice(1)]);
    }
    return map;
  }
}
