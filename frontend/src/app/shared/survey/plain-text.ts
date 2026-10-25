/**
 * Words as HTML that shows exactly those words: for text that is not the
 * editor's - a string of the site's own, worded in the reader's language - on
 * its way into something drawn as HTML (the about-you questions' texts, which
 * the page draws as a question's: the family's <anotoki-rich-html>).
 *
 * The words of an HTML text without its markup, and whether it has any, are the
 * anotoki library's (@anotoki/lib/ui/rich-html: richHtmlText(),
 * richHtmlIsBlank() - the server's RichHtml::text() and isBlank(), the same
 * rules), never this site's own.
 */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
