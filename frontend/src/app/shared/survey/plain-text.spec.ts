import { richHtmlIsBlank, richHtmlText } from '@anotoki/lib/ui/rich-html';
import { escapeHtml } from './plain-text';

describe('escapeHtml', () => {
  it('turns the four characters HTML reads into what shows them', () => {
    expect(escapeHtml('Vek < 18 & viac')).toBe('Vek &lt; 18 &amp; viac');
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('escapes an ampersand once, and only what is there', () => {
    expect(escapeHtml('&lt;')).toBe('&amp;lt;');
    expect(escapeHtml('Koľko máte rokov?')).toBe('Koľko máte rokov?');
    expect(escapeHtml('')).toBe('');
  });

  it('gives HTML whose words are the words that went in', () => {
    for (const words of ['Vek < 18 & viac', 'a "quoted" <b>word</b>', 'R&D &amp; more']) {
      expect(richHtmlText(`<p>${escapeHtml(words)}</p>`)).toBe(words);
    }
    expect(richHtmlIsBlank(`<p>${escapeHtml('<p></p>')}</p>`)).toBe(false);
  });
});
