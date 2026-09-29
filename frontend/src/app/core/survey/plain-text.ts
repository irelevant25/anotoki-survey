/**
 * The words of an HTML fragment, without its markup: for the one-line summary
 * of a question in the editor's outline, the results' lists, and the CSV.
 *
 * DOMParser builds an inert document - nothing in it runs or loads - so it is
 * safe for text the editor wrote. Blocks and line breaks become spaces.
 */
export function plainText(html: string): string {
  if (!html) {
    return '';
  }
  const spaced = html.replace(/<\/(p|li|h[1-6]|blockquote)>|<br\s*\/?>/gi, '$& ');
  let text: string;
  if (typeof DOMParser !== 'undefined') {
    text = new DOMParser().parseFromString(spaced, 'text/html').body.textContent ?? '';
  } else {
    text = spaced
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');
  }
  return text.replace(/\s+/g, ' ').trim();
}

/** HTML with no words in it - what the editor leaves behind when everything is deleted (`<p></p>`). */
export function isBlankHtml(html: string): boolean {
  return plainText(html) === '';
}
