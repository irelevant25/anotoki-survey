import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { AdminStore } from '../../../shared/admin/admin-store.service';
import { AGE_ID, GENDER_ID } from '../../../shared/survey/about-you';
import { aboutYouQuestionsFor } from '../../../shared/survey/about-you-questions';
import { isChoice } from '../../../shared/survey/answer-rules';
import { ResultFilter } from '../../../shared/survey/results';
import { numberedQuestions } from '../../../shared/survey/survey-outline';
import { Answer, Question, Survey, SurveyResponse } from '../../../shared/survey/survey.model';
import { ImageStripComponent } from '../shared/image-strip/image-strip.component';
import { SurveyImageComponent } from '../../../shared/ui/survey-image/survey-image.component';

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
 * what they wrote for "Other", their own words, and what they skipped. A step
 * of text and pictures alone is a line - its number and title, and that it
 * asked nothing - so the steps read in the order the person met them.
 *
 * `highlight` marks the answer that led here - the bar that was pressed - so
 * the eye lands on it first.
 *
 * The questions are shown as the survey is written - its main language - and
 * a survey may be read in another: "Read in Slovak" says which the person had
 * in front of them, when the answers say (older ones do not).
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

  private readonly _languages = inject(AdminStore).languages;

  /**
   * The language the person read the survey's texts in, by its English name -
   * by its code while the languages are on their way. Null when the answers
   * do not say.
   */
  protected readonly readIn = computed(() => {
    const code = this.response().language;
    if (!code) {
      return null;
    }
    return this._languages()?.find((language) => language.code === code)?.name ?? code;
  });

  protected readonly aboutYou = computed<Item[]>(() => {
    const about = this.response().aboutYou;
    if (!this.survey().askAboutYou) {
      return [];
    }
    // A gender the question no longer offers ("Non-binary", kept from before) stands among its options, chosen.
    return aboutYouQuestionsFor(about?.gender).map((question) => {
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
