import { type ToolbarTool } from '@anotoki/lib/ui/rich-text';

/**
 * The buttons of a survey's text editor (the anotoki family's
 * <anotoki-html-editor>, anotoki-lib 0.11.0 - the survey's own editor, TipTap,
 * before it): the words' formats, the two lists, a link, clearing, undo and
 * redo - what the survey's editor always had. Beside them each editor names its
 * own: the highlighter (`highlight`) everywhere, the headings (`[headings]="[2,
 * 3]"`) on the welcome and the thank-you screens, and `images` where pictures
 * pasted or dropped go under the text (a question's, a step's own) - through
 * the survey's own picture handling (the image list, prepare-image.ts), never
 * into the text.
 *
 * No indent, no sizes, fonts or colours: the survey's texts are read in the
 * survey's own typography (styles.scss, `.rich`), and its server keeps only
 * what the family's allow-list keeps (backend/api/rich_text.php).
 */
export const SURVEY_TEXT_TOOLS: readonly ToolbarTool[] = ['bold', 'italic', 'underline', 'strike', '|', 'bulletList', 'orderedList', '|', 'link', 'clear', '|', 'undo', 'redo'];

/** The headings a welcome or a thank-you text may hold: the page's own title is its h1. */
export const SURVEY_TEXT_HEADINGS = [2, 3] as const;
