import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, effect, inject, input, output, viewChild } from '@angular/core';
import { IconComponent } from '../icon/icon.component';
import { uniqueId } from '../unique-id';

/**
 * A panel that slides in from the right, over the page: for looking closer at
 * one thing - the people behind a number, one person's answers - without
 * losing the page it was opened from. On a phone it takes the whole screen.
 *
 * Like DialogComponent it is a native `<dialog>` opened with `showModal()`:
 * the page behind is inert, Escape and the backdrop ask to close it
 * (`dismiss`), and focus comes back where it was. Its content can change
 * while it is open - a list, then one of its entries, with `back` between
 * them - and each change starts the reader at the top again.
 */
@Component({
  selector: 'app-drawer',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './drawer.component.html',
  styleUrl: './drawer.component.scss',
})
export class DrawerComponent {
  readonly heading = input.required<string>();
  readonly subheading = input<string | null>(null);
  /** Shows a back button with these words ("All 12 people"); null for none. */
  readonly backLabel = input<string | null>(null);

  readonly dismiss = output<void>();
  readonly back = output<void>();

  protected readonly headingId = uniqueId('drawer-title');
  protected pointerDownTarget: EventTarget | null = null;

  private readonly _dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly _body = viewChild.required<ElementRef<HTMLElement>>('body');
  private readonly _title = viewChild.required<ElementRef<HTMLElement>>('title');
  private readonly _returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  private _shown = false;

  constructor() {
    afterNextRender(() => {
      const dialog = this._dialog().nativeElement;
      if (!dialog.open) {
        dialog.showModal();
      }
      this._shown = true;
      this._title().nativeElement.focus();
    });

    // New content, new reading: back to its top, with the title in focus.
    effect(() => {
      this.heading();
      this.subheading();
      if (this._shown) {
        this._body().nativeElement.scrollTop = 0;
        queueMicrotask(() => this._title().nativeElement.focus({ preventScroll: true }));
      }
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

  /** The backdrop is the <dialog> itself; only a click that also started there closes it. */
  protected onClick(event: MouseEvent): void {
    const dialog = this._dialog().nativeElement;
    if (event.target === dialog && this.pointerDownTarget === dialog) {
      this.dismiss.emit();
    }
  }
}
