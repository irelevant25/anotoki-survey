import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { TranslatePipe } from '@anotoki/lib/translations';
import { SurveyImage } from '../../core/survey/survey.model';
import { LightboxService } from '../lightbox/lightbox.service';
import { SurveyImageComponent } from '../survey-image/survey-image.component';

/**
 * The pictures under a question's text or a step's own text, as the person
 * taking the survey meets them: one shown whole, in its own proportions; two
 * or three side by side (two on a phone), more in rows. Each is a button that
 * opens it large (the lightbox, with arrows through the others) - named by
 * what it shows, or by its place among them when it says nothing.
 *
 * `lang`: the language of the pictures' descriptions when it is not the
 * page's - the survey's, read in the language it is written in on a page in
 * another. The large view carries it; the buttons' names are the site's
 * sentence around the survey's words, and an attribute has one language.
 */
@Component({
  selector: 'app-image-gallery',
  imports: [SurveyImageComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './image-gallery.component.html',
  styleUrl: './image-gallery.component.scss',
})
export class ImageGalleryComponent {
  readonly images = input.required<SurveyImage[]>();
  readonly lang = input<string | null>(null);

  protected readonly lightbox = inject(LightboxService);
  /** One picture is shown whole; two or three share a row. */
  protected readonly count = computed(() => Math.min(this.images().length, 3));
}
