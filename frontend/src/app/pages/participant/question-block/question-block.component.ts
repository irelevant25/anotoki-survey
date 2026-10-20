import { ChangeDetectionStrategy, Component, Injector, afterNextRender, computed, inject, input, output, signal } from '@angular/core';
import { TranslatePipe, TranslatePluralPipe, TranslationService } from '@anotoki/lib/translations';
import { AutofocusDirective } from '@anotoki/lib/ui/autofocus';
import { uniqueId } from '@anotoki/lib/ui/dom';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { problemText, ruleText } from '../../../core/i18n/answer-words';
import { AnswerProblem, choiceLimits, choiceRule, emptyAnswer, textLimit, withoutControls } from '../../../core/survey/answer-rules';
import { Answer, ChoiceOption, Question } from '../../../core/survey/survey.model';
import { ImageGalleryComponent } from '../../../ui/image-gallery/image-gallery.component';
import { LightboxService } from '../../../ui/lightbox/lightbox.service';
import { SurveyImageComponent } from '../../../ui/survey-image/survey-image.component';

/**
 * One question as the person answering meets it: its number and text, how
 * many to choose, the options (or the field to write in), and - once they
 * have tried to go on - what is still missing.
 *
 * Choices are native radios and checkboxes drawn as cards, so the arrow keys,
 * Space and a screen reader all work as they do anywhere. The question text
 * is rich HTML (paragraphs, lists), which a `<legend>` may not hold, so the
 * group is a `role="radiogroup"`/`"group"` labelled by the text instead.
 *
 * With several choices, once the most allowed are picked the rest wait,
 * dimmed, until one is taken back - the limit is felt, not just reported.
 *
 * The rule and the problem arrive as a kind and its numbers
 * (core/survey/answer-rules.ts) and are worded here, in the reader's language
 * (core/i18n/answer-words.ts) - so they follow a change of language. The
 * question's own text, its options and its pictures are the survey's - and in
 * the survey's language, which `lang` names when it is not the page's: the
 * text, each option's label and the large picture's words carry it; the site's
 * own words around them (the rule, the problem, "Optional") do not. The hint
 * of an own-words field carries none, on purpose: `lang` on a field is also
 * the language of the answer typed into it - the spelling checker's
 * dictionary and the voice that reads it back - and somebody shown a survey
 * in its own language mostly answers in theirs.
 */
@Component({
  selector: 'app-question-block',
  imports: [IconComponent, AutofocusDirective, ImageGalleryComponent, SurveyImageComponent, TranslatePipe, TranslatePluralPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './question-block.component.html',
  styleUrl: './question-block.component.scss',
})
export class QuestionBlockComponent {
  readonly question = input.required<Question>();
  /** The number before the question; null for gender and age, which have none. */
  readonly number = input<number | null>(null);
  readonly answer = input<Answer | undefined>(undefined);
  /** What is wrong with the answer, shown once the person has tried to go on: a kind, not a sentence - it is worded here. */
  readonly error = input<AnswerProblem | null>(null);
  /**
   * The language the question's own texts are in, when it is not the page's -
   * a survey read in the language it was written in, on a page in another.
   * Null: the page's own (and always for gender and age, which the site words).
   */
  readonly lang = input<string | null>(null);

  readonly answerChange = output<Answer>();

  private readonly _injector = inject(Injector);
  private readonly _i18n = inject(TranslationService);

  protected readonly name = uniqueId('question');
  protected readonly textId = `${this.name}-text`;
  protected readonly ruleId = `${this.name}-rule`;
  protected readonly errorId = `${this.name}-error`;

  protected readonly single = computed(() => this.question().type === 'single');
  /** The chosen options the question still has - a draft may name one the editor has removed since. */
  protected readonly chosen = computed(() => {
    const known = new Set(this.question().options.map((option) => option.id));
    return new Set((this.answer()?.optionIds ?? []).filter((id) => known.has(id)));
  });
  /** How many to choose; null for a question that has no such line. */
  protected readonly rule = computed(() => choiceRule(this.question()));
  protected readonly ruleWords = computed(() => ruleText(this._i18n, this.rule()));
  /** The problem in words - "Other" by the label this question shows. */
  protected readonly errorWords = computed(() => problemText(this._i18n, this.error(), this.question()));
  protected readonly limits = computed(() => choiceLimits(this.question()));
  protected readonly full = computed(() => {
    const question = this.question();
    return question.type === 'multiple' && this.limits().max < question.options.length && this.chosen().size >= this.limits().max;
  });
  protected readonly describedBy = computed(() => [this.rule() || !this.question().required ? this.ruleId : '', this.error() ? this.errorId : ''].filter(Boolean).join(' ') || null);
  protected readonly textLength = computed(() => this.answer()?.text.length ?? 0);
  protected readonly maxLength = computed(() => textLimit(this.question()));
  /** Options with pictures are drawn as cards, the pictures on top - all of them, so the cards line up. */
  protected readonly media = computed(() => this.question().options.some((option) => option.images.length > 0));

  protected readonly lightbox = inject(LightboxService);

  /**
   * The "Other" just chosen with a pointer: its field takes the focus. Not one
   * reached with the arrow keys - a radio is chosen as the keys pass over it,
   * and pulling focus away then would trap the keyboard in the field - and not
   * one chosen earlier, or coming back to the step would jump into it.
   */
  protected readonly justChose = signal<string | null>(null);
  private _pressed: { optionId: string; at: number } | null = null;

  /** A press on an option's card: what `choose` needs to tell a click from the arrow keys. */
  protected pressed(optionId: string): void {
    this._pressed = { optionId, at: Date.now() };
  }

  protected choose(optionId: string, checked: boolean): void {
    const question = this.question();
    const current = this.answer() ?? emptyAnswer();
    let ids: string[];
    if (question.type === 'single') {
      ids = [optionId];
    } else {
      ids = checked ? [...current.optionIds, optionId] : current.optionIds.filter((id) => id !== optionId);
    }
    // In the question's own order, whatever order they were clicked in.
    ids = question.options.filter((option) => ids.includes(option.id)).map((option) => option.id);
    const option = question.options.find((item) => item.id === optionId);
    // A press that was let go elsewhere chose nothing; only a fresh one counts.
    const byPointer = this._pressed?.optionId === optionId && Date.now() - this._pressed.at < 2000;
    this.justChose.set(checked && option?.other && byPointer ? optionId : null);
    this._pressed = null;
    this.answerChange.emit({ ...current, optionIds: ids });
  }

  /** An option's pictures, large - beside the card, not on it, so looking closer does not choose it. */
  protected enlarge(option: ChoiceOption): void {
    this.lightbox.open(option.images, 0, option.label, this.lang());
  }

  protected setOther(event: Event): void {
    this.answerChange.emit({ ...(this.answer() ?? emptyAnswer()), other: withoutControls((event.target as HTMLInputElement).value) });
  }

  protected setText(event: Event): void {
    this.answerChange.emit({ ...(this.answer() ?? emptyAnswer()), text: withoutControls((event.target as HTMLInputElement | HTMLTextAreaElement).value) });
  }

  /**
   * A radio cannot be unticked; an optional question of one choice gets a way
   * back to no answer. The button goes with the answer, so focus moves to the
   * first option instead of falling to the page.
   */
  protected clear(event: Event): void {
    this.justChose.set(null);
    const group = (event.target as HTMLElement).closest('.question');
    this.answerChange.emit(emptyAnswer());
    afterNextRender(() => group?.querySelector<HTMLElement>('input[type="radio"]')?.focus(), { injector: this._injector });
  }
}
