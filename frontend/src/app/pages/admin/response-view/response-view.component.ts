import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { AGE_ID, GENDER_ID } from '../../../core/survey/about-you';
import { ABOUT_YOU_QUESTIONS } from '../../../core/survey/about-you-questions';
import { isChoice } from '../../../core/survey/answer-rules';
import { ResultFilter } from '../../../core/survey/results';
import { numberedQuestions } from '../../../core/survey/survey-outline';
import { Answer, Question, Survey, SurveyResponse } from '../../../core/survey/survey.model';
import { IconComponent } from '../../../ui/icon/icon.component';
import { ImageStripComponent } from '../../../ui/image-strip/image-strip.component';
import { SurveyImageComponent } from '../../../ui/survey-image/survey-image.component';

interface Item {
  question: Question;
  number: number | null;
  answer: Answer | undefined;
  /** Chosen options the question no longer has. */
  removed: number;
}

/**
 * One person's filled survey, read back: every question in its step, with
 * what they chose marked among all the options (so "3 of 9" shows as such),
 * what they wrote for "Other", their own words, and what they skipped.
 *
 * `highlight` marks the answer that led here - the bar that was pressed - so
 * the eye lands on it first.
 */
@Component({
  selector: 'app-response-view',
  imports: [NgTemplateOutlet, IconComponent, ImageStripComponent, SurveyImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './response-view.component.html',
  styleUrl: './response-view.component.scss',
})
export class ResponseViewComponent {
  readonly survey = input.required<Survey>();
  readonly response = input.required<SurveyResponse>();
  readonly highlight = input<ResultFilter | null>(null);

  protected readonly aboutYou = computed<Item[]>(() => {
    const about = this.response().aboutYou;
    if (!this.survey().askAboutYou) {
      return [];
    }
    return ABOUT_YOU_QUESTIONS.map((question) => {
      const key = question.id === GENDER_ID ? about?.gender : question.id === AGE_ID ? about?.age : undefined;
      return { question, number: null, answer: key ? { optionIds: [key], other: '', text: '' } : undefined, removed: 0 };
    });
  });

  protected readonly steps = computed(() => {
    const survey = this.survey();
    const answers = this.response().answers;
    const numbers = new Map(numberedQuestions(survey).map((item) => [item.question.id, item.number]));
    const first = survey.askAboutYou ? 2 : 1;
    return survey.steps.map((step, index) => ({
      step,
      number: index + first,
      items: step.questions.map((question): Item => {
        const answer = answers[question.id];
        const known = new Set(question.options.map((option) => option.id));
        return { question, number: numbers.get(question.id) ?? null, answer, removed: answer ? answer.optionIds.filter((id) => !known.has(id)).length : 0 };
      }),
    }));
  });

  protected readonly isChoice = isChoice;

  protected chosen(item: Item, optionId: string): boolean {
    return item.answer?.optionIds.includes(optionId) ?? false;
  }

  protected isHighlight(item: Item, optionId: string): boolean {
    const highlight = this.highlight();
    return !!highlight && highlight.questionId === item.question.id && highlight.optionId === optionId;
  }

  protected answered(item: Item): boolean {
    return !!item.answer && (isChoice(item.question) ? item.answer.optionIds.length > 0 : item.answer.text.trim() !== '');
  }
}
