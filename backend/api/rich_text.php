<?php

declare(strict_types=1);

use Anotoki\Lib\RichHtml\RichHtml;

/**
 * The HTML of a survey's texts - a question, a step's own text, the welcome,
 * the thanks - as the editor writes it (the anotoki family's
 * <anotoki-html-editor>: paragraphs, bold, italic, underline, strike, the
 * highlighter, links, lists, and headings on the welcome and thank-you
 * screens), through the family's allow-list and nothing else.
 *
 * Every text is cleaned here before it is kept, whatever sent it: the pages
 * show these texts to everybody who takes the survey, so what reaches the
 * database must not be able to do anything but look like text. The cleaning
 * is the anotoki library's (anotoki-lib 0.11.0, Anotoki\Lib\RichHtml - the same
 * rules, step for step, as the pages' own view, <anotoki-rich-html>, which
 * draws every text through them again): the HTML read as a browser reads it,
 * the allow-list's elements kept (p, div, br, h2-h4, ul, ol with its start, li,
 * b, strong, i, em, u, s, strike, mark, span, font, a), a link only to a web
 * page or a mail address - and every link opening in a new tab, so the survey
 * stays where it was -, five inline styles bounded (the editor here writes
 * none), scripts, styles, frames, forms and pictures dropped with what they
 * hold, everything else unwrapped to its words. The editor's own output comes
 * out the same as it went in. What stays this site's: how long a text may be,
 * that it is UTF-8, that it is text at all - and that no words is no text.
 */

/** The longest text taken, in bytes of HTML: a page of writing is a few kB. */
const RICH_TEXT_MAX_BYTES = 50000;

/**
 * The HTML, cleaned (RichHtml::clean()) - '' when it holds no words (an
 * emptied editor's <p></p>). Refuses (ApiError 422) what is not text, text that
 * is not UTF-8 and text longer than RICH_TEXT_MAX_BYTES; $what names it for the
 * refusal ("question 3").
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
    $clean = RichHtml::clean($html);

    // No words at all - an emptied editor's <p></p> - is no text.
    return RichHtml::isBlank($clean) ? '' : $clean;
}
