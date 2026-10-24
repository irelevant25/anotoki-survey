import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { SurveyImage } from '../../../../shared/survey/survey.model';
import { LightboxService } from '../../../../shared/ui/lightbox/lightbox.service';
import { SurveyImageComponent } from '../../../../shared/ui/survey-image/survey-image.component';

/**
 * A question's pictures as a row of small thumbnails - on the results and in
 * a person's filled survey, where the question is read, not answered. Each
 * opens large.
 */
@Component({
  selector: 'app-image-strip',
  imports: [SurveyImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './image-strip.component.html',
  styleUrl: './image-strip.component.scss',
})
export class ImageStripComponent {
  readonly images = input.required<SurveyImage[]>();
  /** "Question 3": for the buttons' names. */
  readonly label = input('Question');

  protected readonly lightbox = inject(LightboxService);
}
