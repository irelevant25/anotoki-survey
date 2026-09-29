import { Directive, ElementRef, afterNextRender, booleanAttribute, inject, input } from '@angular/core';

/**
 * Focuses its element once it has been drawn: `<h1 tabindex="-1" appAutofocus>`.
 *
 * For a field that appears because of what the person just did - the one for
 * "Other", say: focus goes where the person is about to type, instead of
 * staying on the option that opened it.
 */
@Directive({ selector: '[appAutofocus]' })
export class AutofocusDirective {
  readonly appAutofocus = input(true, { transform: booleanAttribute });

  constructor() {
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterNextRender(() => {
      if (this.appAutofocus()) {
        element.focus({ preventScroll: false });
      }
    });
  }
}
