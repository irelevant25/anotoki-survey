import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, inject, input, viewChildren } from '@angular/core';
import { MAX_OPTION_IMAGES, pastedPictures } from '../../../../core/images/prepare-image';
import { newOption } from '../../../../core/survey/survey-factory';
import { ChoiceOption, QuestionType } from '../../../../core/survey/survey.model';
import { ButtonComponent } from '../../../../ui/button/button.component';
import { ConfirmService } from '../../../../ui/confirm/confirm.service';
import { IconComponent } from '../../../../ui/icon/icon.component';
import { ImageListEditorComponent } from '../image-list-editor/image-list-editor.component';
import { SurveyEditing } from '../survey-editing.service';
import { TranslatedTextComponent } from '../translated-text/translated-text.component';

/**
 * The options of a choice question, written as a list.
 *
 * Made for typing them out quickly: Enter adds the next option below and
 * moves there, Backspace in an empty one removes it, and pasting several
 * lines makes one option of each. "Other" - the option with a field for the
 * person's own words - stays at the bottom, where people expect it: new
 * options go in above it.
 *
 * Removing an option somebody has chosen asks first: their choice would
 * disappear from the results with it.
 *
 * Each option can carry pictures: its picture button opens the file picker,
 * and a picture pasted into its field is added to it.
 *
 * Every change names its option by id and is made to the options as the
 * survey holds them then (SurveyEditing) - a picture landing on one option
 * while another is being typed loses neither.
 *
 * On a translation's tab (SurveyEditing.language) the list is the survey's as
 * it is: each option's label with the field for its translation, and none of
 * the above - no adding, removing or moving, no Enter, Backspace or pasted
 * list. A list pasted into a translation's field must never make options.
 */
@Component({
  selector: 'app-options-editor',
  imports: [CdkDropList, CdkDrag, CdkDragHandle, ButtonComponent, IconComponent, ImageListEditorComponent, TranslatedTextComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './options-editor.component.html',
  styleUrl: './options-editor.component.scss',
})
export class OptionsEditorComponent {
  readonly options = input.required<ChoiceOption[]>();
  readonly questionId = input.required<string>();
  readonly type = input.required<QuestionType>();
  /** How many people chose each option, by option id. */
  readonly counts = input<Record<string, number>>({});
  /** "Question 3", for the fields' names. */
  readonly questionLabel = input('Question');

  private readonly _editing = inject(SurveyEditing);
  private readonly _confirm = inject(ConfirmService);
  private readonly _injector = inject(Injector);
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly _imageLists = viewChildren(ImageListEditorComponent);

  /** A translation is being edited: the options are listed with their translations, and cannot be changed. */
  protected readonly translating = computed(() => this._editing.language() !== null);
  protected readonly hasOther = computed(() => this.options().some((option) => option.other));
  protected readonly maxImages = MAX_OPTION_IMAGES;

  /** The option's file picker, from its picture button. */
  protected pickImages(optionId: string): void {
    if (!this.translating()) {
      this._imageList(optionId)?.pick();
    }
  }

  protected rename(optionId: string, event: Event): void {
    const label = (event.target as HTMLInputElement).value;
    this._update((options) => options.map((option) => (option.id === optionId ? { ...option, label } : option)));
  }

  /** A new, empty option: after the one named, or at the end - above "Other" either way. */
  protected add(afterId?: string): void {
    const added = newOption();
    this._update((options) => {
      const copy = [...options];
      const after = afterId ? copy.findIndex((option) => option.id === afterId) : -1;
      const otherAt = copy.findIndex((option) => option.other);
      let at = after >= 0 ? after + 1 : copy.length;
      if (otherAt >= 0 && at > otherAt) {
        at = otherAt;
      }
      copy.splice(at, 0, added);
      return copy;
    });
    this._focus(added.id);
  }

  protected addOther(): void {
    const added = newOption('Other', true);
    this._update((options) => (options.some((option) => option.other) ? options : [...options, added]));
    this._focus(added.id);
  }

  protected async remove(optionId: string): Promise<void> {
    const options = this.options();
    const at = options.findIndex((option) => option.id === optionId);
    const option = options[at];
    if (!option) {
      return;
    }
    const chosen = this.counts()[option.id] ?? 0;
    if (chosen > 0) {
      const sure = await this._confirm.ask({
        title: `Remove "${option.label || 'this option'}"?`,
        message: `${chosen} ${chosen === 1 ? 'person has' : 'people have'} chosen it. Their choice disappears from the results with it.`,
        confirmLabel: 'Remove',
        tone: 'danger',
      });
      if (!sure) {
        return;
      }
    }
    this._update((list) => list.filter((item) => item.id !== optionId));
    const next = options[at - 1] ?? options[at + 1];
    if (next) {
      this._focus(next.id);
    }
  }

  protected move(optionId: string, by: -1 | 1): void {
    this._update((options) => {
      const from = options.findIndex((option) => option.id === optionId);
      const to = from + by;
      if (from < 0 || to < 0 || to >= options.length) {
        return options;
      }
      const copy = [...options];
      moveItemInArray(copy, from, to);
      return copy;
    });
    this._focus(optionId);
  }

  protected drop(event: CdkDragDrop<ChoiceOption[], ChoiceOption[], string>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }
    const optionId = event.item.data;
    this._update((options) => {
      const from = options.findIndex((option) => option.id === optionId);
      if (from < 0) {
        return options;
      }
      const copy = [...options];
      moveItemInArray(copy, from, Math.min(event.currentIndex, copy.length - 1));
      return copy;
    });
  }

  protected onKeydown(event: KeyboardEvent, optionId: string): void {
    // The Enter that ends a Japanese or Chinese input composition belongs to
    // the composition, not to the list (Chrome and Safari mark it 229).
    if (event.isComposing || event.keyCode === 229 || this.translating()) {
      return;
    }
    const input = event.target as HTMLInputElement;
    if (event.key === 'Enter') {
      event.preventDefault();
      this.add(optionId);
    } else if (event.key === 'Backspace' && input.value === '' && this.options().length > 1) {
      event.preventDefault();
      void this.remove(optionId);
    } else if (event.key === 'ArrowDown' && event.altKey) {
      event.preventDefault();
      this.move(optionId, 1);
    } else if (event.key === 'ArrowUp' && event.altKey) {
      event.preventDefault();
      this.move(optionId, -1);
    }
  }

  /**
   * A picture pasted into an option's field is a picture for that option; a
   * pasted list makes the first line this option and one new option of each
   * line after it.
   */
  protected onPaste(event: ClipboardEvent, optionId: string): void {
    if (this.translating()) {
      return;
    }
    const pictures = pastedPictures(event.clipboardData);
    if (pictures.length) {
      event.preventDefault();
      void this._imageList(optionId)?.addFiles(pictures);
      return;
    }
    const text = event.clipboardData?.getData('text/plain') ?? '';
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').trim())
      .filter(Boolean);
    if (lines.length < 2) {
      return;
    }
    event.preventDefault();
    const current = this.options().find((option) => option.id === optionId);
    const fillsThis = !current?.label.trim();
    const added = (fillsThis ? lines.slice(1) : lines).map((label) => newOption(label));
    this._update((options) => {
      const at = options.findIndex((option) => option.id === optionId);
      if (at < 0) {
        return options;
      }
      const copy = [...options];
      if (fillsThis) {
        copy[at] = { ...copy[at], label: lines[0] };
      }
      copy.splice(at + 1, 0, ...added);
      return copy;
    });
    this._focus(added.at(-1)?.id ?? optionId);
  }

  /** The options themselves - never from a translation's tab, whatever asked for it. */
  private _update(change: (options: ChoiceOption[]) => ChoiceOption[]): void {
    if (!this.translating()) {
      this._editing.updateOptions(this.questionId(), change);
    }
  }

  private _imageList(optionId: string): ImageListEditorComponent | undefined {
    return this._imageLists().find((list) => list.optionId() === optionId);
  }

  /** The field of an option, once it is drawn - wherever it moved to. */
  private _focus(optionId: string): void {
    afterNextRender(() => this._host.nativeElement.querySelector<HTMLInputElement>(`input[data-option="${optionId}"]`)?.focus(), { injector: this._injector });
  }
}
