import { ChangeDetectionStrategy, Component, booleanAttribute, computed, effect, input, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@anotoki/lib/translations';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { SurveyImage } from '../../survey/survey.model';

/**
 * One of a survey's pictures: a soft shimmer while it loads, the picture, or
 * a crossed-out picture if its file is gone. The box takes the size its parent
 * gives it; `natural` gives it the picture's own proportions instead.
 */
@Component({
  selector: 'app-survey-image',
  imports: [IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'survey-image',
    '[attr.data-fit]': 'fit()',
    '[class.is-loaded]': 'loaded()',
    '[style.aspect-ratio]': 'natural() ? image().width + " / " + image().height : null',
  },
  templateUrl: './survey-image.component.html',
  styleUrl: './survey-image.component.scss',
})
export class SurveyImageComponent {
  readonly image = input.required<SurveyImage>();
  /** `cover` fills the box and crops; `contain` shows all of it. */
  readonly fit = input<'contain' | 'cover'>('cover');
  /** Words beside the picture already say what it shows: a screen reader passes over it. */
  readonly decorative = input(false, { transform: booleanAttribute });
  readonly natural = input(false, { transform: booleanAttribute });

  protected readonly source = computed(() => this.image().src);
  protected readonly loaded = signal(false);
  protected readonly broken = signal(false);

  constructor() {
    // Another picture in the same place starts over: not loaded, not broken.
    effect(() => {
      this.source();
      untracked(() => {
        this.loaded.set(false);
        this.broken.set(false);
      });
    });
  }
}
