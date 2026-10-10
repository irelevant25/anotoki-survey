import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui';
import { Tally } from '../../../../core/survey/results';
import { SurveyImageComponent } from '../../../../ui/survey-image/survey-image.component';

/**
 * How many chose each answer, as bars: the answer, the bar, the number of
 * people and their share. Each row is a button - pressing it shows who they
 * are - and beside it a smaller one narrows the whole page to them.
 *
 * The rows keep the question's order, not the counts': a scale must read
 * from its one end to the other. The largest bar is drawn stronger instead.
 * An answer with pictures shows the first beside its words.
 */
@Component({
  selector: 'app-bar-list',
  imports: [IconComponent, SurveyImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './bar-list.component.html',
  styleUrl: './bar-list.component.scss',
})
export class BarListComponent {
  readonly tallies = input.required<Tally[]>();
  /** Answers already among the filters, marked as such. */
  readonly filtered = input<ReadonlySet<string>>(new Set());
  /** Words for the screen reader: "Question 3". */
  readonly label = input('');

  readonly select = output<Tally>();
  readonly narrow = output<Tally>();

  protected readonly top = computed(() => Math.max(0, ...this.tallies().map((tally) => tally.count)));

  protected percent(tally: Tally): string {
    return `${Math.round(tally.share * 100)}%`;
  }
}
