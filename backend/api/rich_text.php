<?php

declare(strict_types=1);

/**
 * The HTML of a survey's texts - a question, the welcome, the thanks - as the
 * editor writes it (TipTap: paragraphs, bold, italic, underline, strike, the
 * highlighter, links, lists, and headings on the welcome and thank-you
 * screens), and nothing else.
 *
 * Every text is cleaned here before it is kept, whatever sent it: the
 * frontend shows these texts as HTML to everybody who takes the survey, so
 * what reaches the database must not be able to do anything but look like
 * text. The editor's own output comes out the same as it went in; anything
 * else loses what the editor could not have made - other elements are
 * unwrapped to their text (or dropped with their content, for the ones whose
 * content is not text: scripts, styles, frames, forms), every attribute but a
 * link's address goes, and a link only goes to a web page or an e-mail
 * address. Links open in a new tab, so the survey stays where it was.
 */

/** Elements kept, and the attributes each may keep. */
const RICH_TEXT_ELEMENTS = [
    'p' => [], 'br' => [], 'strong' => [], 'b' => [], 'em' => [], 'i' => [], 'u' => [], 's' => [], 'mark' => [],
    'a' => ['href'], 'ul' => [], 'ol' => ['start'], 'li' => [], 'h2' => [], 'h3' => [],
];

/** Elements dropped together with everything inside them: what they hold is not text to read. */
const RICH_TEXT_DROPPED = [
    'script', 'style', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'svg', 'math', 'noscript',
    'noembed', 'noframes', 'textarea', 'select', 'option', 'button', 'input', 'form', 'head', 'title', 'meta', 'link',
    'base', 'img', 'picture', 'video', 'audio', 'source', 'track', 'canvas', 'map', 'area', 'dialog', 'xmp', 'plaintext',
];

/** The longest text taken, in bytes of HTML: a page of writing is a few kB. */
const RICH_TEXT_MAX_BYTES = 50000;

/** The only links a survey may carry: to a web page, or to write an e-mail. */
function richTextAllowedHref(string $href): ?string
{
    $href = textTrim($href);
    if ($href === '' || strlen($href) > 2000 || preg_match('/[\x00-\x20\x7F]/', $href)) {
        return null;
    }

    return preg_match('~^(https?://[^/?#]+|mailto:[^?#]+@)~i', $href) ? $href : null;
}

/**
 * The HTML, cleaned. Refuses (ApiError 422) text that is not UTF-8 or longer
 * than RICH_TEXT_MAX_BYTES; $what names it for the refusal ("question 3").
 */
function richTextClean(mixed $html, string $what): string
{
    if (!is_string($html)) {
        throw new ApiError(422, 'invalid_survey', "The text of $what is not text.");
    }
    if (strlen($html) > RICH_TEXT_MAX_BYTES) {
        throw new ApiError(422, 'invalid_survey', "The text of $what is too long.");
    }
    if (preg_match('//u', $html) !== 1) {
        throw new ApiError(422, 'invalid_survey', "The text of $what is not valid UTF-8.");
    }
    if (textTrim($html) === '') {
        return '';
    }
    if (!class_exists(DOMDocument::class)) {
        throw new RuntimeException('Cleaning HTML needs PHP\'s dom extension, and this PHP has none.');
    }

    $document = new DOMDocument();
    $errors = libxml_use_internal_errors(true);
    try {
        // The encoding hint makes libxml read UTF-8 (it assumes Latin-1
        // otherwise); the wrapper is the one element the walk starts from.
        $document->loadHTML(
            '<?xml encoding="UTF-8"?><div id="rich-text-root">' . $html . '</div>',
            LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET | LIBXML_NOERROR | LIBXML_NOWARNING
        );
    } finally {
        libxml_clear_errors();
        libxml_use_internal_errors($errors);
    }

    $root = null;
    foreach ($document->childNodes as $node) {
        if ($node instanceof DOMElement && $node->tagName === 'div') {
            $root = $node;
            break;
        }
    }
    if ($root === null) {
        return '';
    }

    $clean = richTextChildren($root);

    // No words at all - an emptied editor's <p></p> - is no text.
    return richTextIsBlank($clean) ? '' : $clean;
}

function richTextChildren(DOMNode $parent): string
{
    $out = '';
    foreach ($parent->childNodes as $child) {
        $out .= richTextNode($child);
    }

    return $out;
}

function richTextNode(DOMNode $node): string
{
    if ($node instanceof DOMText) {
        return richTextEscape(textWithoutControls($node->data), false);
    }
    if (!$node instanceof DOMElement) {
        // Comments, processing instructions, doctype: nothing a reader sees.
        return '';
    }

    $tag = strtolower($node->tagName);
    if (in_array($tag, RICH_TEXT_DROPPED, true)) {
        return '';
    }
    if (!array_key_exists($tag, RICH_TEXT_ELEMENTS)) {
        return richTextChildren($node);
    }
    if ($tag === 'br') {
        return '<br>';
    }

    $attributes = '';
    if ($tag === 'a') {
        $href = richTextAllowedHref($node->getAttribute('href'));
        if ($href === null) {
            // A link to somewhere a survey may not send people is only its words.
            return richTextChildren($node);
        }
        // In the order the editor writes them, so its own text comes back unchanged.
        $attributes = ' target="_blank" rel="noopener noreferrer" href="' . richTextEscape($href, true) . '"';
    } elseif ($tag === 'ol') {
        $start = trim($node->getAttribute('start'));
        if (ctype_digit($start) && (int) $start > 1 && (int) $start <= 100000) {
            $attributes = ' start="' . (int) $start . '"';
        }
    }

    return "<$tag$attributes>" . richTextChildren($node) . "</$tag>";
}

/** As a browser writes text back out (innerHTML), so the editor's own HTML round-trips. */
function richTextEscape(string $text, bool $attribute): string
{
    $text = str_replace('&', '&amp;', $text);
    $text = str_replace("\u{00A0}", '&nbsp;', $text);
    if ($attribute) {
        return str_replace('"', '&quot;', $text);
    }

    return str_replace(['<', '>'], ['&lt;', '&gt;'], $text);
}

/**
 * The words of the HTML, one space between them: what a reader of it would
 * read - plainText() in core/survey/plain-text.ts, with the browser's own
 * spaces (TEXT_SPACE), so both sides find the same texts blank.
 */
function richTextPlain(string $html): string
{
    $spaced = (string) preg_replace('~</(p|li|h[1-6])>|<br\s*/?>~i', '$0 ', $html);
    $text = html_entity_decode(strip_tags($spaced), ENT_QUOTES | ENT_HTML5, 'UTF-8');

    return textTrim((string) preg_replace('/' . TEXT_SPACE . '+/u', ' ', $text));
}

/** HTML with no words in it - what the editor leaves behind when everything is deleted (<p></p>). */
function richTextIsBlank(string $html): bool
{
    return richTextPlain($html) === '';
}
