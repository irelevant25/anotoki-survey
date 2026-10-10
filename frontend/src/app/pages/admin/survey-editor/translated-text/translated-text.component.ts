import { ChangeDetectionStrategy, Component, booleanAttribute, computed, inject, input } from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui';
import { TranslationPlace } from '../../../../core/survey/localize';
import { isBlankHtml } from '../../../../core/survey/plain-text';
import { RichTextEditorComponent } from '../../../../ui/rich-text-editor/rich-text-editor.component';
import { SurveyEditing } from '../survey-editing.service';
import { placeKey } from '../translating';

/**
 * One text of the survey while it is being translated: the original, shown
 * the whole time and never editable here, and the field for the same text in
 * the language of the tab - under the original, or beside it on a screen wide
 * enough for both.
 *
 * A rich text (the welcome, the thanks, a question) is drawn as people will
 * read it, so its lists, bold words and links can be seen and written again
 * in the translation; a line is shown as the line it is. The original says
 * which language it is in (`lang`), and so does the field - for the spelling
 * checker and for a screen reader's voice. The field has no placeholder: the
 * original is right there.
 *
 * A text the original has and the translation lacks is marked as missing. One
 * the original does not have is not asked for; if the translation still holds
 * words for it (the original was emptied later), they are shown so that they
 * can be taken out.
 *
 * It writes through SurveyEditing, to the translation the page is on.
 */
@Component({
  selector: 'app-translated-text',
  imports: [IconComponent, RichTextEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './translated-text.component.html',
  styleUrl: './translated-text.component.scss',
})
export class TranslatedTextComponent {
  /** Which text of the survey this is. */
  readonly place = input.required<TranslationPlace>();
  /** The text in the language the survey is written in. */
  readonly original = input.required<string>();
  /** What the text is, for a screen reader and for the note when it is empty: "Title", "Question 3", "Question 3, option 2". */
  readonly label = input.required<string>();
  /** HTML from the editor - the welcome, the thanks, a question's text - rather than a line. */
  readonly rich = input(false, { transform: booleanAttribute });
  /** A rich text that may hold headings (the welcome and the thanks). */
  readonly headings = input(false, { transform: booleanAttribute });
  /** A row of a list - an option, a picture's description, a step's title: no language names above the two. */
  readonly compact = input(false, { transform: booleanAttribute });
  /** The longest line the field takes: the same as the original's. */
  readonly maxLength = input<number | null>(null);

  protected readonly editing = inject(SurveyEditing);

  /** What the field carries as `data-place`: the page finds it by this, for "Next missing". */
  protected readonly key = computed(() => placeKey(this.place()));
  protected readonly value = computed(() => this.editing.text(this.place()));
  protected readonly hasOriginal = computed(() => !this._blank(this.original()));
  protected readonly hasValue = computed(() => !this._blank(this.value()));
  /** The original says something here and the translation does not yet. */
  protected readonly missing = computed(() => this.hasOriginal() && !this.hasValue());
  /** The translation still says something the original no longer does. */
  protected readonly leftOver = computed(() => !this.hasOriginal() && this.hasValue());
  protected readonly fieldLabel = computed(() => `${this.label()} in ${this.editing.languageName()}`);

  protected write(text: string): void {
    this.editing.setText(this.place(), text);
  }

  protected onInput(event: Event): void {
    this.write((event.target as HTMLInputElement).value);
  }

  private _blank(text: string): boolean {
    return this.rich() ? isBlankHtml(text) : !text.trim();
  }
}
