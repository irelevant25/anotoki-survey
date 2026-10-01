import { Injectable, computed, inject, signal } from '@angular/core';
import { AdminStore } from '../../../core/admin/admin-store.service';
import { TranslationPlace, setTranslatedText, translatedText, translationOf } from '../../../core/survey/localize';
import { ChoiceOption, Question, Survey, SurveyImage } from '../../../core/survey/survey.model';
import { languageName } from './translating';

/** Where a list of pictures belongs: a question of a survey, or one of its options. */
export interface ImageTarget {
  surveyId: string;
  questionId: string;
  optionId: string | null;
}

/**
 * Every change the editor makes to a survey, made to the survey as the store
 * holds it at that moment - never to a copy of it as the page last drew it. A
 * picture that finishes getting ready while the text is being typed, or after
 * its question was folded, moved or turned into "own words", lands on the
 * question as it is then, and nothing typed in between is lost.
 *
 * It also knows which language the page is editing: the one the survey is
 * written in, or one of its translations. In a translation the fields write
 * the translation's texts (setText), each found by the place it stands for;
 * the questions themselves are not changed there.
 *
 * What is changed and not saved yet it does not remember: that is read from
 * the documents (AdminStore.unsavedChanges()), which outlast the page.
 *
 * One per editor page (SurveyEditorComponent provides it), for the survey
 * the page shows.
 */
@Injectable()
export class SurveyEditing {
  private readonly _store = inject(AdminStore);

  /** The survey the page edits; the page keeps it current. */
  readonly surveyId = signal('');

  /** The tab of the language switch the editor chose: a translation's code, or null for the language the survey is written in. */
  readonly chosen = signal<string | null>(null);

  private readonly _survey = computed(() => this._store.survey(this.surveyId()));

  /** The language the survey is written in. */
  readonly mainLanguage = computed(() => this._survey()?.language ?? 'en');

  /**
   * The translation being edited - the chosen tab for as long as the survey
   * has a translation into that language - or null: the survey's own texts.
   * Read from the document every time, so a translation removed here, in
   * another tab or by somebody else's save puts the page back in the main
   * language by itself.
   */
  readonly language = computed(() => {
    const survey = this._survey();
    const chosen = this.chosen();
    return survey && chosen !== null && chosen !== survey.language && translationOf(survey, chosen) ? chosen : null;
  });

  private readonly _translation = computed(() => {
    const survey = this._survey();
    const language = this.language();
    return survey && language ? translationOf(survey, language) : undefined;
  });

  /** The names of the two languages in English ("English", "Slovak"): what the fields are called. */
  readonly mainName = computed(() => languageName(this._store.languages(), this.mainLanguage()));
  readonly languageName = computed(() => {
    const language = this.language();
    return language ? languageName(this._store.languages(), language) : '';
  });

  /** The page shows another survey: in its main language. */
  open(surveyId: string): void {
    this.surveyId.set(surveyId);
    this.chosen.set(null);
  }

  // ── The survey itself ──────────────────────────────────────────────────────

  /** A change to the survey - its own texts and questions, or a translation of it. */
  update(change: (survey: Survey) => Survey, surveyId = this.surveyId()): void {
    this._store.updateSurvey(surveyId, change);
  }

  updateQuestion(questionId: string, change: (question: Question) => Question, surveyId = this.surveyId()): void {
    this.update(
      (survey) => ({
        ...survey,
        steps: survey.steps.map((step) => ({ ...step, questions: step.questions.map((question) => (question.id === questionId ? change(question) : question)) })),
      }),
      surveyId,
    );
  }

  updateOptions(questionId: string, change: (options: ChoiceOption[]) => ChoiceOption[], surveyId = this.surveyId()): void {
    this.updateQuestion(questionId, (question) => ({ ...question, options: change(question.options) }), surveyId);
  }

  /** The pictures of a question or an option - wherever it is now, or nowhere, if it is gone. */
  updateImages(target: ImageTarget, change: (images: SurveyImage[]) => SurveyImage[]): void {
    const { surveyId, questionId, optionId } = target;
    if (optionId) {
      this.updateOptions(questionId, (options) => options.map((option) => (option.id === optionId ? { ...option, images: change(option.images) } : option)), surveyId);
    } else {
      this.updateQuestion(questionId, (question) => ({ ...question, images: change(question.images) }), surveyId);
    }
  }

  /** Where the pictures of this question (or its option) belong - taken when an upload starts, kept until it ends. */
  target(questionId: string, optionId: string | null = null): ImageTarget {
    return { surveyId: this.surveyId(), questionId, optionId };
  }

  // ── A translation ──────────────────────────────────────────────────────────

  /** What the translation being edited says at a place - empty when it says nothing there, or no translation is being edited. */
  text(place: TranslationPlace): string {
    return translatedText(this._translation(), place);
  }

  /**
   * One text of the translation being edited, written - into the survey as
   * the store holds it now. Outside a translation it writes nothing: the
   * survey's own texts are the question editors' to change.
   */
  setText(place: TranslationPlace, text: string): void {
    const language = this.language();
    if (language) {
      this.update((survey) => setTranslatedText(survey, language, place, text));
    }
  }
}
