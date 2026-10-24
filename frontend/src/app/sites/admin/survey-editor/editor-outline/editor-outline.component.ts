import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { plainText } from '../../../../shared/survey/plain-text';
import { currentStatus, stepHasContent } from '../../../../shared/survey/survey-outline';
import { SurveyProblem, problemsHeading } from '../../../../shared/survey/survey-problems';
import { Survey } from '../../../../shared/survey/survey.model';

/**
 * The survey at a glance - its steps and questions, each a jump to itself -
 * and what must be fixed before it can open or, on an open survey, what is
 * wrong with it now - each a jump to where it is ("goTo": a problem of a
 * translation opens that language; "show": a step or a question, in the
 * language the page is on). What the list is called follows the survey's
 * state as people meet it (problemsHeading): nothing "opens" a survey that is
 * open, and a closed one reopens. A step of text and pictures alone says so
 * where its questions would be.
 *
 * On a translation's tab the outline marks what is still to translate: the
 * questions with texts missing, each with how many, and the steps with texts
 * of their own missing (the title, the step's text, what its pictures show).
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
  /** The language being translated into, by its English name - null in the survey's own language. */
  readonly translating = input<string | null>(null);
  /** How many texts each question still has to translate, by question id. */
  readonly questionGaps = input<ReadonlyMap<string, number>>(new Map());
  /** How many of its own texts each step still has to translate, by step id. */
  readonly stepGaps = input<ReadonlyMap<string, number>>(new Map());

  /** A problem chosen: to where it is fixed. */
  readonly goTo = output<SurveyProblem['target']>();
  /** A step or a question chosen in the outline. */
  readonly show = output<SurveyProblem['target']>();

  /** The list's heading: how many there are to fix and what they keep from happening - or that there is nothing. */
  protected readonly problemsTitle = computed(() => problemsHeading(currentStatus(this.survey()), this.problems().length));
  protected readonly firstStep = computed(() => (this.survey().askAboutYou ? 2 : 1));
  protected readonly steps = computed(() =>
    this.survey().steps.map((step, index) => ({
      step,
      number: index + this.firstStep(),
      missing: this.stepGaps().get(step.id) ?? 0,
      /** Text and pictures and no question: people read it and go on. */
      textOnly: step.questions.length === 0 && stepHasContent(step),
      questions: step.questions.map((question) => ({
        question,
        number: this.numbers().get(question.id) ?? 0,
        text: plainText(question.text),
        missing: this.questionGaps().get(question.id) ?? 0,
      })),
    })),
  );
  /** The texts of the steps and questions still to translate (the survey's title, welcome and thanks are not in the outline). */
  protected readonly toTranslate = computed(() => [...this.stepGaps().values(), ...this.questionGaps().values()].reduce((sum, count) => sum + count, 0));
}
