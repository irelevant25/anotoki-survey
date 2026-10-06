import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { AdminDates } from '../../../../core/admin/admin-dates.service';
import { ChoiceSummary, Tally } from '../../../../core/survey/results';
import { Question } from '../../../../core/survey/survey.model';
import { IconComponent } from '../../../../ui/icon/icon.component';
import { ImageStripComponent } from '../../../../ui/image-strip/image-strip.component';
import { BarListComponent } from '../bar-list/bar-list.component';
import { QUESTION_TYPES } from '../../survey-editor/question-editor/question-editor.component';

/**
 * A choice question's results: its bars, how many answered and skipped, and
 * - when it has "Other" - the first few things people wrote there.
 */
@Component({
  selector: 'app-choice-result',
  imports: [ImageStripComponent, BarListComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './choice-result.component.html',
  styleUrl: './choice-result.component.scss',
})
export class ChoiceResultComponent {
  readonly question = input.required<Question>();
  readonly number = input.required<number>();
  readonly summary = input.required<ChoiceSummary>();
  /** This question's options among the filters. */
  readonly filtered = input<ReadonlySet<string>>(new Set());

  /** A bar pressed: show who chose it. */
  readonly select = output<string>();
  /** The filter beside a bar: narrow the page to them. */
  readonly narrow = output<string>();
  readonly openResponse = output<string>();

  protected readonly kind = computed(() => QUESTION_TYPES.find((item) => item.type === this.question().type) ?? QUESTION_TYPES[0]);
  protected readonly otherOption = computed(() => this.question().options.find((option) => option.other) ?? null);
  protected readonly firstOthers = computed(() => this.summary().others.slice(0, 3));
  protected readonly timeAgo = inject(AdminDates).timeAgo;

  protected onSelect(tally: Tally): void {
    this.select.emit(tally.key);
  }

  protected onNarrow(tally: Tally): void {
    this.narrow.emit(tally.key);
  }
}
