import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';
import { IconComponent } from '../../../ui/icon/icon.component';

/**
 * The top of a survey: the night sky of the anotoki sign-in pages, the
 * survey's name - and, while it is being taken, where the person is: "Step 2
 * of 5", and a bar with one segment per step, so how many there are is plain
 * before anybody counts. (The step's own title is the page's heading, under
 * the hero.)
 *
 * The step line is two strings, because the eye and the ear need different
 * words: `take.step` is what is seen, cut around the number so the number can
 * be set in bold ("Krok 2 / 5"), and `take.stepSpoken` is what the progress
 * bar says ("Krok 2, spolu krokov: 5"). A string that leaves the number out is
 * shown as it is, with no number beside it.
 */
@Component({
  selector: 'app-survey-hero',
  imports: [IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './survey-hero.component.html',
  styleUrl: './survey-hero.component.scss',
})
export class SurveyHeroComponent {
  private readonly _i18n = inject(TranslationService);

  readonly heading = input.required<string>();
  /** The small line above the name. No words of its own: the page says them, in the reader's language. */
  readonly eyebrow = input.required<string>();
  /** The step the person is on, from 1; 0 for no progress (the welcome, the thanks). */
  readonly current = input(0);
  readonly total = input(0);
  /**
   * The language the survey's own words here are in - its name - when it is
   * not the page's. Null: the page's own.
   */
  readonly lang = input<string | null>(null);

  protected readonly segments = computed(() => Array.from({ length: this.total() }, (_, i) => i + 1));
  /** "Step " and " of 5": the step line before and after its number - and whether the string has a place for it. Worded here, so it follows the language. */
  protected readonly where = computed(() => this._i18n.around('take.step', 'n', { m: this.total() }));
}
