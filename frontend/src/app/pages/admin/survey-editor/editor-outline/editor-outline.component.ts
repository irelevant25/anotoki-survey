import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { plainText } from '../../../../core/survey/plain-text';
import { SurveyProblem } from '../../../../core/survey/survey-problems';
import { Survey } from '../../../../core/survey/survey.model';
import { IconComponent } from '../../../../ui/icon/icon.component';

/**
 * The survey at a glance - its steps and questions, each a jump to itself -
 * and what must be fixed before it can open, each a jump to where it is.
 */
@Component({
  selector: 'app-editor-outline',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-outline.component.html',
  styleUrl: './editor-outline.component.scss',
})
export class EditorOutlineComponent {
  readonly survey = input.required<Survey>();
  readonly problems = input<SurveyProblem[]>([]);
  /** Question numbers, by question id. */
  readonly numbers = input<Map<string, number>>(new Map());

  readonly goTo = output<SurveyProblem['target']>();

  protected readonly firstStep = computed(() => (this.survey().askAboutYou ? 2 : 1));
  protected readonly steps = computed(() =>
    this.survey().steps.map((step, index) => ({
      step,
      number: index + this.firstStep(),
      questions: step.questions.map((question) => ({ question, number: this.numbers().get(question.id) ?? 0, text: plainText(question.text) })),
    })),
  );
}
