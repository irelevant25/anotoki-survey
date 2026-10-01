import { Directive, OnChanges, TemplateRef, ViewContainerRef, inject, input } from '@angular/core';

/**
 * Draws its content anew whenever the key changes: `*appKeyed="language()"`.
 *
 * The editor's form is drawn once for each language it is on. A field that
 * stayed while the language changed under it would carry its own state across
 * - a rich text's undo history above all: Ctrl+Z on the Czech tab would bring
 * back what was typed in Slovak, and write it into the Czech translation.
 */
@Directive({ selector: '[appKeyed]' })
export class KeyedDirective implements OnChanges {
  readonly appKeyed = input.required<unknown>();

  private readonly _template = inject<TemplateRef<unknown>>(TemplateRef);
  private readonly _container = inject(ViewContainerRef);

  /** Only the key is an input: every change is another key. */
  ngOnChanges(): void {
    this._container.clear();
    this._container.createEmbeddedView(this._template);
  }
}
