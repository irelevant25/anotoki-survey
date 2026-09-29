import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { IconComponent } from '../../../ui/icon/icon.component';

/**
 * The top of a survey: the night sky of the anotoki sign-in pages, the
 * survey's name - and, while it is being taken, where the person is: "Step 2
 * of 5", the step's title, and a bar with one segment per step, so how many
 * there are is plain before anybody counts.
 */
@Component({
  selector: 'app-survey-hero',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './survey-hero.component.html',
  styleUrl: './survey-hero.component.scss',
})
export class SurveyHeroComponent {
  readonly heading = input.required<string>();
  readonly eyebrow = input('Survey');
  /** The step the person is on, from 1; 0 for no progress (the welcome, the thanks). */
  readonly current = input(0);
  readonly total = input(0);
  readonly stepTitle = input('');

  protected readonly segments = computed(() => Array.from({ length: this.total() }, (_, i) => i + 1));
}
