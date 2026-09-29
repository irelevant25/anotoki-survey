import { Injectable, signal } from '@angular/core';
import { SurveyImage } from '../../core/survey/survey.model';

export interface LightboxView {
  images: SurveyImage[];
  index: number;
  /** Words for a picture that has none of its own - the option it belongs to, say. */
  caption: string | null;
}

/**
 * A picture shown large, over the page: `lightbox.open(images, index)`. One
 * set of pictures at a time; LightboxComponent, in the app's root, draws it.
 */
@Injectable({ providedIn: 'root' })
export class LightboxService {
  private readonly _view = signal<LightboxView | null>(null);

  readonly view = this._view.asReadonly();

  open(images: readonly SurveyImage[], index = 0, caption: string | null = null): void {
    if (images.length) {
      this._view.set({ images: [...images], index: Math.min(Math.max(0, index), images.length - 1), caption });
    }
  }

  close(): void {
    this._view.set(null);
  }

  /** The picture before (-1) or after (1), going round at the ends. */
  move(by: number): void {
    this._view.update((view) => (view ? { ...view, index: (view.index + by + view.images.length) % view.images.length } : view));
  }
}
