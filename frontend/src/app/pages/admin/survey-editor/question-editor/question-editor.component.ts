import { CdkDragHandle } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, booleanAttribute, computed, inject, input, output } from '@angular/core';
import { MAX_QUESTION_IMAGES } from '../../../../core/images/prepare-image';
import { choiceRule, isChoice } from '../../../../core/survey/answer-rules';
import { plainText } from '../../../../core/survey/plain-text';
import { ChoiceLayout, Question, QuestionType } from '../../../../core/survey/survey.model';
import { IconComponent, IconName } from '../../../../ui/icon/icon.component';
import { RichTextEditorComponent } from '../../../../ui/rich-text-editor/rich-text-editor.component';
import { SwitchComponent } from '../../../../ui/switch/switch.component';
import { uniqueId } from '../../../../ui/unique-id';
import { ImageListEditorComponent } from '../image-list-editor/image-list-editor.component';
import { OptionsEditorComponent } from '../options-editor/options-editor.component';
import { SurveyEditing } from '../survey-editing.service';

export const QUESTION_TYPES: { type: QuestionType; label: string; short: string; icon: IconName }[] = [
  { type: 'single', label: 'One choice', short: 'One choice', icon: 'radio' },
  { type: 'multiple', label: 'Several choices', short: 'Several', icon: 'checkSquare' },
  { type: 'text', label: 'Own words', short: 'Own words', icon: 'text' },
];

const LAYOUTS: { layout: ChoiceLayout; label: string; icon: IconName; hint: string }[] = [
  { layout: 'list', label: 'List', icon: 'listBullets', hint: 'One option under another' },
  { layout: 'columns', label: 'Two columns', icon: 'columns', hint: 'For many short options' },
  { layout: 'scale', label: 'Scale', icon: 'scale', hint: 'In one row, left to right - for "very bad … very good" (a list on phones)' },
];

/** A step the question can move to, as the editor names it. */
export interface StepChoice {
  id: string;
  label: string;
}

/**
 * One question in the editor.
 *
 * Folded, it is a line: its number, kind, the start of its text and its rules
 * at a glance, with the handle to drag it by. Unfolded, everything it has:
 * the kind, the text (rich), the pictures under it, the options (each with
 * pictures of its own) or the answer field, and the rules. A picture pasted
 * or dropped into the text goes under the question.
 *
 * Switching the kind keeps what there is: options survive a trip through
 * "own words" and back, so a wrong click costs nothing.
 */
@Component({
  selector: 'app-question-editor',
  imports: [CdkDragHandle, IconComponent, ImageListEditorComponent, OptionsEditorComponent, RichTextEditorComponent, SwitchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './question-editor.component.html',
  styleUrl: './question-editor.component.scss',
})
export class QuestionEditorComponent {
  readonly question = input.required<Question>();
  readonly number = input.required<number>();
  readonly expanded = input(false, { transform: booleanAttribute });
  /** Focus the text as soon as it is drawn - for a question just added. */
  readonly focusText = input(false, { transform: booleanAttribute });
  readonly isFirst = input(false, { transform: booleanAttribute });
  readonly isLast = input(false, { transform: booleanAttribute });
  /** The steps it can move to, its own among them. */
  readonly steps = input<StepChoice[]>([]);
  readonly stepId = input.required<string>();
  /** What must be fixed in it before the survey opens. */
  readonly problems = input<string[]>([]);
  /** How many people chose each option, by option id; answers in all. */
  readonly counts = input<Record<string, number>>({});
  readonly answered = input(0);

  readonly toggle = output<void>();
  readonly remove = output<void>();
  readonly duplicate = output<void>();
  readonly move = output<-1 | 1>();
  readonly moveToStep = output<string>();

  private readonly _editing = inject(SurveyEditing);

  protected readonly types = QUESTION_TYPES;
  protected readonly layouts = LAYOUTS;
  protected readonly id = uniqueId('question-editor');

  protected readonly type = computed(() => QUESTION_TYPES.find((item) => item.type === this.question().type) ?? QUESTION_TYPES[0]);
  protected readonly choice = computed(() => isChoice(this.question()));
  protected readonly summary = computed(() => plainText(this.question().text));
  protected readonly rule = computed(() => choiceRule(this.question()));
  protected readonly hasOther = computed(() => this.question().options.some((option) => option.other));
  protected readonly maxImages = MAX_QUESTION_IMAGES;
  /** Options with pictures are always cards: the layout choice has nothing to choose then. */
  protected readonly optionsHaveImages = computed(() => this.question().options.some((option) => option.images.length > 0));
  /** Pictures under the question and on its options (the options' only while it is a choice). */
  protected readonly imageCount = computed(() => {
    const question = this.question();
    return question.images.length + (isChoice(question) ? question.options.reduce((sum, option) => sum + option.images.length, 0) : 0);
  });
  protected readonly limitsLabel = computed(() => {
    const question = this.question();
    if (question.type !== 'multiple') {
      return '';
    }
    const { minChoices: min, maxChoices: max } = question;
    if (min && max) {
      return min === max ? `${min} exactly` : `${min}–${max}`;
    }
    if (max) {
      return `up to ${max}`;
    }
    return min ? `at least ${min}` : '';
  });

  /** Only the fields changed, made to the question as the survey holds it now - never a copy of it as last drawn. */
  protected set(change: Partial<Question>): void {
    this._editing.updateQuestion(this.question().id, (question) => ({ ...question, ...change }));
  }

  protected setType(type: QuestionType): void {
    if (type !== this.question().type) {
      this.set({ type });
    }
  }

  /** A number field: empty is "no limit"; anything else a whole number. */
  protected setNumber(field: 'minChoices' | 'maxChoices' | 'maxLength', event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    const value = raw === '' ? null : Math.max(0, Math.floor(Number(raw)));
    this.set({ [field]: Number.isFinite(value) ? value : null });
  }

  protected setText(field: 'placeholder', event: Event): void {
    this.set({ [field]: (event.target as HTMLInputElement).value });
  }

  protected onMoveToStep(event: Event): void {
    const stepId = (event.target as HTMLSelectElement).value;
    if (stepId && stepId !== this.stepId()) {
      this.moveToStep.emit(stepId);
    }
  }
}
