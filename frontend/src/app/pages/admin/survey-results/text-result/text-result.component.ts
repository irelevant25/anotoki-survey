import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { AdminDates } from '../../../../core/admin/admin-dates.service';
import { WrittenAnswer } from '../../../../core/survey/results';
import { Question } from '../../../../core/survey/survey.model';
import { IconComponent } from '../../../../ui/icon/icon.component';
import { ImageStripComponent } from '../../../../ui/image-strip/image-strip.component';

/** How many to show on the page; the rest are in the drawer. */
const SHOWN = 4;

/**
 * A text question's results: the newest answers, each with who wrote it, and
 * the way to all of them. One-line answers are also counted - "Fun" eight
 * times reads better as "Fun × 8" than as eight quotes.
 */
@Component({
  selector: 'app-text-result',
  imports: [ImageStripComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './text-result.component.html',
  styleUrl: './text-result.component.scss',
})
export class TextResultComponent {
  readonly question = input.required<Question>();
  readonly number = input.required<number>();
  readonly answers = input.required<WrittenAnswer[]>();
  /** Responses in all, for how many skipped it. */
  readonly total = input.required<number>();

  readonly openAll = output<void>();
  readonly openResponse = output<string>();

  protected readonly shown = computed(() => this.answers().slice(0, SHOWN));
  protected readonly skipped = computed(() => this.total() - this.answers().length);

  /** One-line answers, counted: the same words (whatever their case) together, most common first. */
  protected readonly common = computed(() => {
    if (this.question().multiline) {
      return [];
    }
    const counts = new Map<string, { text: string; count: number }>();
    for (const answer of this.answers()) {
      const key = answer.text.trim().toLowerCase();
      const entry = counts.get(key) ?? { text: answer.text.trim(), count: 0 };
      entry.count++;
      counts.set(key, entry);
    }
    return [...counts.values()]
      .filter((entry) => entry.count > 1)
      .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
      .slice(0, 10);
  });

  protected readonly timeAgo = inject(AdminDates).timeAgo;
}
