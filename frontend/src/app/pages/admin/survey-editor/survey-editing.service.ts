import { Injectable, inject, signal } from '@angular/core';
import { AdminStore } from '../../../core/admin/admin-store.service';
import { ChoiceOption, Question, SurveyImage } from '../../../core/survey/survey.model';

/** Where a list of pictures belongs: a question of a survey, or one of its options. */
export interface ImageTarget {
  surveyId: string;
  questionId: string;
  optionId: string | null;
}

/**
 * Every change the editor makes to a question, made to the question as the
 * store holds it at that moment - never to a copy of it as the page last drew
 * it. A picture that finishes getting ready while the text is being typed, or
 * after its question was folded, moved or turned into "own words", lands on
 * the question as it is then, and nothing typed in between is lost.
 *
 * One per editor page (SurveyEditorComponent provides it), for the survey
 * the page shows.
 */
@Injectable()
export class SurveyEditing {
  private readonly _store = inject(AdminStore);

  /** The survey the page edits; the page keeps it current. */
  readonly surveyId = signal('');

  updateQuestion(questionId: string, change: (question: Question) => Question, surveyId = this.surveyId()): void {
    this._store.updateSurvey(surveyId, (survey) => ({
      ...survey,
      steps: survey.steps.map((step) => ({ ...step, questions: step.questions.map((question) => (question.id === questionId ? change(question) : question)) })),
    }));
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
}
