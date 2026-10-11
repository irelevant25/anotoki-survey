import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  ViewEncapsulation,
  afterNextRender,
  booleanAttribute,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { Editor } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import { EditorProps } from '@tiptap/pm/view';
import { pastedPictures } from '../../core/images/prepare-image';
import { type SurveyIconName } from '../../core/kit';
import { Placeholder } from '@tiptap/extensions';
import StarterKit from '@tiptap/starter-kit';

type Mark = 'bold' | 'italic' | 'underline' | 'strike' | 'highlight' | 'link' | 'bulletList' | 'orderedList' | 'heading';

interface Tool {
  mark: Mark;
  icon: SurveyIconName;
  label: string;
  keys?: string;
}

const TOOLS: Tool[] = [
  { mark: 'bold', icon: 'bold', label: 'Bold', keys: 'Ctrl+B' },
  { mark: 'italic', icon: 'italic', label: 'Italic', keys: 'Ctrl+I' },
  { mark: 'underline', icon: 'underline', label: 'Underline', keys: 'Ctrl+U' },
  { mark: 'strike', icon: 'strike', label: 'Strikethrough' },
  { mark: 'highlight', icon: 'highlighter', label: 'Highlight' },
];

const LISTS: Tool[] = [
  { mark: 'bulletList', icon: 'listBullets', label: 'Bulleted list' },
  { mark: 'orderedList', icon: 'listOrdered', label: 'Numbered list' },
];

/** The only links a survey may carry: to a web page, or to write a mail. */
const ALLOWED_LINK = /^(https?:|mailto:)/i;

/**
 * A small rich text editor: bold, italic, underline, strikethrough, a
 * highlighter, links and lists - and headings where `headings` allows them
 * (the welcome and thank-you screens, not a question). What it writes is
 * HTML, the same the survey and the results show.
 *
 * It is TipTap (ProseMirror) underneath, which keeps to its own schema: a
 * paste from a web page or a word processor arrives as the few elements the
 * toolbar can make, never as the page's own markup or styles. The server will
 * still clean every text it is sent; this is for tidiness, not for safety.
 *
 * `value` is two-way. A change from outside - another tab, say - replaces
 * what the editor shows only when it differs from what the editor last wrote,
 * so typing never loses its place.
 *
 * ProseMirror draws the text itself, outside Angular's templates, so the
 * styles here are not encapsulated; they live under the `.rte` class instead.
 */
@Component({
  selector: 'app-rich-text-editor',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './rich-text-editor.component.html',
  styleUrl: './rich-text-editor.component.scss',
})
export class RichTextEditorComponent {
  readonly value = model<string>('');
  /** What a screen reader calls the field: "Question 3", "Welcome text". */
  readonly label = input.required<string>();
  readonly placeholder = input('');
  readonly headings = input(false, { transform: booleanAttribute });
  readonly autofocus = input(false, { transform: booleanAttribute });
  readonly invalid = input(false, { transform: booleanAttribute });
  /** A shorter field, for one-line questions. */
  readonly compact = input(false, { transform: booleanAttribute });
  /** Pictures pasted or dropped in are handed out (`pastedImages`) instead of being refused. */
  readonly acceptImages = input(false, { transform: booleanAttribute });

  readonly pastedImages = output<File[]>();

  protected readonly tools = TOOLS;
  protected readonly lists = LISTS;
  protected readonly active = signal<Partial<Record<Mark | 'h2' | 'h3', boolean>>>({});
  protected readonly canUndo = signal(false);
  protected readonly canRedo = signal(false);
  protected readonly focused = signal(false);
  protected readonly linkOpen = signal(false);
  protected readonly linkUrl = signal('');

  private readonly _injector = inject(Injector);
  private readonly _content = viewChild.required<ElementRef<HTMLElement>>('content');
  private readonly _linkInput = viewChild<ElementRef<HTMLInputElement>>('linkInput');
  private _editor: Editor | null = null;
  /** What the editor last wrote into `value`, to tell our own changes from others'. */
  private _last: string | null = null;

  constructor() {
    afterNextRender(() => {
      this._last = this.value();
      this._editor = new Editor({
        element: this._content().nativeElement,
        extensions: [
          StarterKit.configure({
            heading: this.headings() ? { levels: [2, 3] } : false,
            blockquote: false,
            code: false,
            codeBlock: false,
            horizontalRule: false,
            link: {
              openOnClick: false,
              autolink: true,
              defaultProtocol: 'https',
              HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
              // Web and mail addresses only, however a link arrives - typed,
              // pasted, found by autolink or read from stored text.
              isAllowedUri: (url, { defaultValidate }) => ALLOWED_LINK.test(url.trim()) && defaultValidate(url),
            },
          }),
          Highlight,
          Placeholder.configure({ placeholder: () => this.placeholder() }),
        ],
        content: this.value(),
        editorProps: this._editorProps(this.label()),
        onUpdate: ({ editor }) => {
          const html = editor.isEmpty ? '' : editor.getHTML();
          this._last = html;
          this.value.set(html);
        },
        onTransaction: () => this._refresh(),
        onFocus: () => this.focused.set(true),
        onBlur: () => this.focused.set(false),
      });
      this._refresh();
      if (this.autofocus()) {
        this._editor.commands.focus('end');
      }
    });

    effect(() => {
      const value = this.value();
      if (this._editor && value !== this._last) {
        this._last = value;
        this._editor.commands.setContent(value, { emitUpdate: false });
      }
    });

    effect(() => {
      const label = this.label();
      this._editor?.setOptions({ editorProps: this._editorProps(label) });
    });

    inject(DestroyRef).onDestroy(() => this._editor?.destroy());
  }

  /**
   * The editable's attributes, and what becomes of pictures pasted or dropped
   * into it: handed out through `pastedImages` where the field takes them (a
   * question's text - the pictures go under the question), left to the
   * browser elsewhere. The text itself never holds a picture, and text that
   * comes with a picture (cells from a spreadsheet) is pasted as text.
   */
  private _editorProps(label: string): EditorProps {
    const takePictures = (data: DataTransfer | undefined | null): boolean => {
      const pictures = this.acceptImages() ? pastedPictures(data) : [];
      if (pictures.length) {
        this.pastedImages.emit(pictures);
      }
      return pictures.length > 0;
    };
    return {
      attributes: { class: 'rich rte-content', role: 'textbox', 'aria-multiline': 'true', 'aria-label': label },
      handlePaste: (_view, event) => takePictures(event.clipboardData),
      handleDrop: (_view, event) => takePictures((event as DragEvent).dataTransfer),
    };
  }

  focus(): void {
    this._editor?.commands.focus('end');
  }

  protected apply(mark: Mark): void {
    const chain = this._editor?.chain().focus();
    if (!chain) {
      return;
    }
    switch (mark) {
      case 'bold':
        chain.toggleBold().run();
        break;
      case 'italic':
        chain.toggleItalic().run();
        break;
      case 'underline':
        chain.toggleUnderline().run();
        break;
      case 'strike':
        chain.toggleStrike().run();
        break;
      case 'highlight':
        chain.toggleHighlight().run();
        break;
      case 'bulletList':
        chain.toggleBulletList().run();
        break;
      case 'orderedList':
        chain.toggleOrderedList().run();
        break;
      default:
        break;
    }
  }

  protected heading(level: 2 | 3): void {
    this._editor?.chain().focus().toggleHeading({ level }).run();
  }

  protected clearFormatting(): void {
    this._editor?.chain().focus().unsetAllMarks().clearNodes().run();
  }

  protected undo(): void {
    this._editor?.chain().focus().undo().run();
  }

  protected redo(): void {
    this._editor?.chain().focus().redo().run();
  }

  protected toggleLink(): void {
    if (this.linkOpen()) {
      this.linkOpen.set(false);
      return;
    }
    const href = (this._editor?.getAttributes('link')['href'] as string | undefined) ?? '';
    this.linkUrl.set(href);
    this.linkOpen.set(true);
    // After the field is drawn - zoneless, that is later than a microtask.
    afterNextRender(() => this._linkInput()?.nativeElement.select(), { injector: this._injector });
  }

  protected saveLink(event?: Event): void {
    event?.preventDefault();
    const url = this.linkUrl().trim();
    const chain = this._editor?.chain().focus().extendMarkRange('link');
    if (!chain) {
      return;
    }
    if (!url) {
      chain.unsetLink().run();
    } else {
      // Only web and mail addresses: a javascript: link in a survey would be a trap for everybody who takes it.
      const href = /^(https?:|mailto:)/i.test(url) ? url : `https://${url.replace(/^\/+/, '')}`;
      chain.setLink({ href }).run();
    }
    this.linkOpen.set(false);
  }

  protected removeLink(): void {
    this._editor?.chain().focus().extendMarkRange('link').unsetLink().run();
    this.linkOpen.set(false);
  }

  protected onLinkKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.linkOpen.set(false);
      this._editor?.commands.focus();
    }
  }

  private _refresh(): void {
    const editor = this._editor;
    if (!editor) {
      return;
    }
    this.active.set({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strike: editor.isActive('strike'),
      highlight: editor.isActive('highlight'),
      link: editor.isActive('link'),
      bulletList: editor.isActive('bulletList'),
      orderedList: editor.isActive('orderedList'),
      h2: editor.isActive('heading', { level: 2 }),
      h3: editor.isActive('heading', { level: 3 }),
    });
    this.canUndo.set(editor.can().undo());
    this.canRedo.set(editor.can().redo());
  }
}
