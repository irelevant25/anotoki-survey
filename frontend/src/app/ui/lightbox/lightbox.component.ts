import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, inject, input, output, viewChild } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { SurveyImageComponent } from '../survey-image/survey-image.component';
import { LightboxView } from './lightbox.service';

/**
 * Pictures shown large, one at a time, over a dark page: the picture as big as
 * the screen allows, what it shows under it, and - for several - the arrows,
 * the arrow keys, or a swipe to the next. Escape, the close button or a click
 * beside the picture close it.
 *
 * A native `<dialog>` opened with `showModal()`, like DialogComponent: the
 * page behind is inert, and focus comes back where it was.
 */
@Component({
  selector: 'app-lightbox',
  imports: [IconComponent, SurveyImageComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './lightbox.component.html',
  styleUrl: './lightbox.component.scss',
})
export class LightboxComponent {
  readonly view = input.required<LightboxView>();

  readonly dismiss = output<void>();
  readonly move = output<number>();

  protected readonly image = computed(() => this.view().images[this.view().index]);
  protected readonly many = computed(() => this.view().images.length > 1);
  protected readonly caption = computed(() => this.image().alt || this.view().caption || '');
  protected readonly ratio = computed(() => this.image().width / Math.max(1, this.image().height));

  private readonly _dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly _close = viewChild.required<ElementRef<HTMLButtonElement>>('closeButton');
  private readonly _returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  private _swipeFrom: number | null = null;
  /** Where the last press began: a click that began on the picture or its words (selecting them) does not close. */
  private _pressedOn: EventTarget | null = null;

  constructor() {
    afterNextRender(() => {
      const dialog = this._dialog().nativeElement;
      if (!dialog.open) {
        dialog.showModal();
      }
      this._close().nativeElement.focus();
    });

    inject(DestroyRef).onDestroy(() => {
      const dialog = this._dialog().nativeElement;
      if (dialog.open) {
        dialog.close();
      }
      if (this._returnFocus?.isConnected) {
        this._returnFocus.focus({ preventScroll: true });
      }
    });
  }

  protected onCancel(event: Event): void {
    event.preventDefault();
    this.dismiss.emit();
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.dismiss.emit();
    } else if (this.many() && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      this.move.emit(event.key === 'ArrowLeft' ? -1 : 1);
    }
  }

  /** A click on the dark around the picture - not on it, not on a button - closes. */
  protected onClick(event: MouseEvent): void {
    const outside = (target: EventTarget | null) => target === this._dialog().nativeElement || (target instanceof HTMLElement && target.classList.contains('stage'));
    if (outside(event.target) && outside(this._pressedOn)) {
      this.dismiss.emit();
    }
  }

  protected onPointerDown(event: PointerEvent): void {
    this._pressedOn = event.target;
    this._swipeFrom = event.pointerType === 'mouse' ? null : event.clientX;
  }

  /** The browser took the gesture over (a pinch, a scroll): no swipe. */
  protected onPointerCancel(): void {
    this._swipeFrom = null;
  }

  /** A swipe of a finger to either side: the next picture, or the one before. */
  protected onPointerUp(event: PointerEvent): void {
    if (this._swipeFrom !== null && this.many()) {
      const distance = event.clientX - this._swipeFrom;
      if (Math.abs(distance) > 50) {
        this.move.emit(distance < 0 ? 1 : -1);
      }
    }
    this._swipeFrom = null;
  }
}
