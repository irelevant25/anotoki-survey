import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, booleanAttribute, computed, inject, input, signal, viewChild } from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { SpinnerComponent } from '@anotoki/lib/ui/spinner';
import { ImageUploader } from '../../../../core/images/image-uploader.service';
import { IMAGE_TYPES, ImageError, MAX_QUESTION_IMAGES, pictureFiles } from '../../../../core/images/prepare-image';
import { TranslationPlace } from '../../../../core/survey/localize';
import { SurveyImage } from '../../../../core/survey/survey.model';
import { LightboxService } from '../../../../ui/lightbox/lightbox.service';
import { SurveyImageComponent } from '../../../../ui/survey-image/survey-image.component';
import { ImageTarget, SurveyEditing } from '../survey-editing.service';
import { TranslatedTextComponent } from '../translated-text/translated-text.component';

/**
 * The pictures of a question or an option - or of a step, under its own
 * text - in the editor: a row of thumbnails - each opens large, moves left
 * or right, goes - and the way to add more: the button, files dropped on the
 * row, or (through `addFiles`, which the question's or the step's text and
 * the option's field call) a paste.
 *
 * Under a question's or a step's text each picture gets a line for what it
 * shows, for people who cannot see it. `compact`, under an option, is
 * smaller and has none: the option's label says what its pictures show.
 * Empty and compact, it draws nothing at all; the option's picture button
 * opens its file picker (`pick`).
 *
 * Files are made smaller and sent to the server as they come in
 * (ImageUploader), one after another, with a place held for each until it is
 * there. Every change
 * goes straight to the survey (SurveyEditing), to the step, question or
 * option it was made for - so pictures still getting ready arrive even if
 * this row is gone by then (its question folded, or moved to another step).
 *
 * On a translation's tab (SurveyEditing.language) the pictures are the
 * survey's own and stay as they are - none added, moved or removed. Under a
 * question's or a step's text each picture is a row with the field for what
 * it shows in that language (the same picture twice is one row: it has one
 * description); under an option they are only shown.
 */
@Component({
  selector: 'app-image-list-editor',
  imports: [IconComponent, SpinnerComponent, SurveyImageComponent, TranslatedTextComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.is-empty]': 'compact() && !images().length && !preparing() && !problems().length' },
  templateUrl: './image-list-editor.component.html',
  styleUrl: './image-list-editor.component.scss',
})
export class ImageListEditorComponent {
  readonly images = input.required<SurveyImage[]>();
  /** Whose pictures they are: the question, and - for an option's - the option; or (`stepId`) a step, under its own text. */
  readonly questionId = input<string | null>(null);
  readonly optionId = input<string | null>(null);
  readonly stepId = input<string | null>(null);
  readonly max = input(MAX_QUESTION_IMAGES);
  /** "Question 3", "Option 2", "Step 2": for the names of the buttons and fields. */
  readonly label = input('Question');
  readonly compact = input(false, { transform: booleanAttribute });
  /** Words for the large view of a picture that has none - an option's label. */
  readonly caption = input<string | null>(null);

  private readonly _uploader = inject(ImageUploader);
  private readonly _editing = inject(SurveyEditing);
  private readonly _injector = inject(Injector);
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly lightbox = inject(LightboxService);
  protected readonly accept = IMAGE_TYPES.join(',');
  /** A translation is being edited: the pictures cannot be changed, only described in its language. */
  protected readonly translating = computed(() => this._editing.language() !== null);
  /**
   * Each picture once, with its place in the list - a picture used twice
   * shares one translated description - and the place of that description in
   * a translation: under a step's text, or a question's.
   */
  protected readonly distinct = computed(() => {
    const seen = new Set<string>();
    const stepId = this.stepId();
    const questionId = this.questionId() ?? '';
    return this.images().flatMap((image, index) => {
      if (seen.has(image.id)) {
        return [];
      }
      seen.add(image.id);
      const place: TranslationPlace = stepId !== null ? { kind: 'stepImage', stepId, imageId: image.id } : { kind: 'image', questionId, imageId: image.id };
      return [{ image, index, place }];
    });
  });
  /** Pictures still being made ready and sent: a place is held for each. */
  protected readonly preparing = signal(0);
  protected readonly placeholders = computed(() => Array.from({ length: this.preparing() }, (_, i) => i));
  protected readonly dropping = signal(false);
  protected readonly room = computed(() => this.max() - this.images().length - this.preparing());
  /** What went wrong with the last files, said beside the row. */
  protected readonly problems = signal<string[]>([]);

  private readonly _fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  /** Opens the file picker - from a click, which a browser requires for it. */
  pick(): void {
    if (!this.translating()) {
      this._fileInput().nativeElement.click();
    }
  }

  /** Takes pictures in: each made ready in turn; the ones that fail say why, the rest are added. */
  async addFiles(files: readonly File[]): Promise<void> {
    // Pictures are the survey's own: a translation's tab adds none.
    if (!files.length || this.translating()) {
      return;
    }
    // Where they go is settled now, before anything can move.
    const target = this._target();
    const compact = this.compact();
    const problems: string[] = [];
    const room = this.room();
    const taking = files.slice(0, Math.max(0, room));
    if (files.length > taking.length) {
      problems.push(room > 0 ? `Only ${room} more ${room === 1 ? 'fits' : 'fit'}: ${this.label()} takes ${this.max()} pictures at most.` : `${this.label()} takes ${this.max()} pictures at most.`);
    }
    this.problems.set(problems);
    this.preparing.update((count) => count + taking.length);
    const added: SurveyImage[] = [];
    for (const file of taking) {
      try {
        const image = await this._uploader.add(file);
        added.push(compact ? { ...image, alt: '' } : image);
      } catch (error) {
        problems.push(error instanceof ImageError ? error.message : `"${file.name}" could not be added.`);
      } finally {
        this.preparing.update((count) => count - 1);
      }
    }
    this.problems.set([...problems]);
    if (added.length) {
      this._editing.updateImages(target, (images) => [...images, ...added]);
    }
  }

  protected onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // Emptied, so choosing the same file again is still a change.
    input.value = '';
    void this.addFiles(files);
  }

  protected onDragOver(event: DragEvent): void {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      this.dropping.set(true);
    }
  }

  protected onDragLeave(event: DragEvent): void {
    const zone = event.currentTarget as HTMLElement;
    if (!zone.contains(event.relatedTarget as Node | null)) {
      this.dropping.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    if (!event.dataTransfer?.types.includes('Files')) {
      return;
    }
    event.preventDefault();
    this.dropping.set(false);
    void this.addFiles(pictureFiles(event.dataTransfer.files));
  }

  /** A picture gone; the focus moves to the one after it, the one before, or the add button - never to the page. */
  protected remove(imageId: string): void {
    const images = this.images();
    const at = images.findIndex((image) => image.id === imageId);
    const next = images[at + 1] ?? images[at - 1] ?? null;
    this._change((list) => list.filter((image) => image.id !== imageId));
    this._focusLater(next ? `[data-image="${next.id}"] .thumb-view` : '.add');
  }

  /** A picture a place to the left or right; the focus stays on it. */
  protected move(imageId: string, by: -1 | 1): void {
    const images = this.images();
    const at = images.findIndex((image) => image.id === imageId);
    const to = at + by;
    if (at < 0 || to < 0 || to >= images.length) {
      return;
    }
    this._change((list) => {
      const from = list.findIndex((image) => image.id === imageId);
      const copy = [...list];
      if (from >= 0 && from + by >= 0 && from + by < copy.length) {
        [copy[from], copy[from + by]] = [copy[from + by], copy[from]];
      }
      return copy;
    });
    // At an end now, the same button is disabled: the other one takes the focus.
    const atEnd = to === 0 || to === images.length - 1;
    const direction = atEnd ? (by < 0 ? 'right' : 'left') : by < 0 ? 'left' : 'right';
    this._focusLater(`[data-image="${imageId}"] [data-move="${direction}"]`);
  }

  protected setAlt(imageId: string, event: Event): void {
    const alt = (event.target as HTMLInputElement).value;
    this._change((list) => list.map((image) => (image.id === imageId ? { ...image, alt } : image)));
  }

  private _change(change: (images: SurveyImage[]) => SurveyImage[]): void {
    if (!this.translating()) {
      this._editing.updateImages(this._target(), change);
    }
  }

  /** Whose pictures these are, as the survey is now: a step's, or a question's (or one of its options'). */
  private _target(): ImageTarget {
    const stepId = this.stepId();
    return stepId !== null ? this._editing.stepTarget(stepId) : this._editing.target(this.questionId() ?? '', this.optionId());
  }

  private _focusLater(selector: string): void {
    afterNextRender(() => this._host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this._injector });
  }
}
