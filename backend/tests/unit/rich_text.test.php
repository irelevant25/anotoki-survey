<?php

// api/rich_text.php: the texts of a survey keep what the editor makes and
// nothing that could do more than look like text - through the anotoki
// library's allow-list (anotoki-lib 0.11.0, Anotoki\Lib\RichHtml, the same
// rules as the pages' <anotoki-rich-html>), with this site's own refusals
// around it: what is not text, not UTF-8 or too long.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

use Anotoki\Lib\RichHtml\RichHtml;

test('the editor\'s own HTML comes back exactly as it went in - the stored texts of before too', function (): void {
    foreach (
        [
            '<p>Plain</p>',
            '<p><strong>Bold</strong>, <em>italic</em>, <u>under</u>, <s>struck</s> and <mark>marked</mark>.</p>',
            '<h2>Welcome</h2><h3>Smaller</h3><p>Text&nbsp;with a non-breaking space &amp; an ampersand, 1 &lt; 2 &gt; 0, "quotes"</p>',
            // The editor before 0.11.0 (TipTap) wrote a list's items as paragraphs; the family's writes them bare.
            '<ul><li><p>One</p></li><li><p>Two</p></li></ul><ol start="3"><li><p>Three</p></li></ol>',
            '<ul><li>One</li><li>Two</li></ul><ol start="3"><li>Three</li></ol>',
            '<p>A <a target="_blank" rel="noopener noreferrer" href="https://anotoki.eu/?a=1&amp;b=2">link</a> and <a target="_blank" rel="noopener noreferrer" href="mailto:hello@anotoki.eu">mail</a></p>',
            '<p>Line<br>break</p><p></p><p>Ščťžýáíéúô · 日本語 · 🎉</p>',
        ]
        as $html
    ) {
        assert_same($html, richTextClean($html, 'the text'));
    }
});

test('anything that could run, load, leave the text\'s box or pretend is taken out', function (): void {
    $cases = [
        '<p>Hi<script>alert(1)</script></p>' => '<p>Hi</p>',
        '<p onmouseover="alert(1)" class="x">Hi</p>' => '<p>Hi</p>',
        '<img src=x onerror=alert(1)><p>Hi</p>' => '<p>Hi</p>',
        '<p><a href="javascript:alert(1)">click</a></p>' => '<p>click</p>',
        '<p><a href=" JaVaScRiPt:alert(1)">click</a></p>' => '<p>click</p>',
        '<p><a href="data:text/html,x">click</a></p>' => '<p>click</p>',
        '<p><a href="//evil.example/x">click</a></p>' => '<p>click</p>',
        '<p><a href="https://ok.example/a&quot;b">a quote in it</a></p>' => '<p>a quote in it</p>',
        '<p><a href="https://ok.example" onclick="x()" target="_self">ok</a></p>' => '<p><a target="_blank" rel="noopener noreferrer" href="https://ok.example">ok</a></p>',
        '<iframe src="https://evil.example"></iframe><p>Hi</p>' => '<p>Hi</p>',
        '<svg><script>alert(1)</script></svg><p>Hi</p>' => '<p>Hi</p>',
        '<style>p{display:none}</style><p>Hi</p>' => '<p>Hi</p>',
        '<p style="position:fixed;top:0;background:url(https://evil.example/x.png)">Hi</p>' => '<p>Hi</p>',
        '<form action="https://evil.example"><button>Send</button></form><p>Hi</p>' => '<p>Hi</p>',
        '<h1>Big</h1><blockquote>quoted</blockquote>' => 'Bigquoted',
        '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>' => '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
        '<!-- a comment --><p>Hi</p>' => '<p>Hi</p>',
        '<ol start="0"><li>x</li></ol><ol start="abc"><li>y</li></ol>' => '<ol><li>x</li></ol><ol><li>y</li></ol>',
        '<p>Unclosed <strong>bold' => '<p>Unclosed <strong>bold</strong></p>',
        // The characters that turn a text's direction, which could make a link read as another.
        "<p>a\u{202E}b</p>" => '<p>ab</p>',
    ];
    foreach ($cases as $in => $out) {
        assert_same($out, richTextClean($in, 'the text'), $in);
    }
});

test('what the family\'s allow-list keeps besides the survey\'s editor - another family editor\'s, bounded - is what the pages draw', function (): void {
    // Kept since anotoki-lib 0.11.0 (the stricter of the two sites' rules, but for what genshin's texts need): a
    // line as a div, h4, span, font, strike, and five inline styles, each value as its property takes it. The
    // survey's editor writes none of them; the pages' view keeps exactly the same (one list, both halves).
    $cases = [
        '<div><span>Kept</span> <font color=red>words</font></div>' => '<div><span>Kept</span> <font color="red">words</font></div>',
        '<p onclick="x()" style="color:red; font-size: 500px; margin-left: -20px">Hi</p>' => '<p style="color: red;">Hi</p>',
        '<h4>Small</h4><p><strike>gone</strike></p>' => '<h4>Small</h4><p><strike>gone</strike></p>',
    ];
    foreach ($cases as $in => $out) {
        assert_same($out, richTextClean($in, 'the text'), $in);
        assert_same(RichHtml::clean($in), richTextClean($in, 'the text'), "the library's rule, word for word: $in");
    }
});

test('no words is no text; not text, too long or not UTF-8 is refused', function (): void {
    assert_same('', richTextClean('<p></p>', 'the text'));
    assert_same('', richTextClean("<p> \u{00A0} </p><p><br></p>", 'the text'));
    assert_same('', richTextClean('', 'the text'));
    assert_same('', richTextClean('<script>alert(1)</script>', 'the text'), 'what the allow-list drops is no words');
    assert_throws(static fn() => richTextClean(str_repeat('x', RICH_TEXT_MAX_BYTES + 1), 'question 2'), '/question 2 is too long/');
    assert_throws(static fn() => richTextClean("<p>\xff</p>", 'the welcome'), '/not valid UTF-8/');
    assert_throws(static fn() => richTextClean(['<p>x</p>'], 'the thanks'), '/not text/');
    assert_same('Which one? Pick', RichHtml::text('<p>Which <strong>one</strong>?</p><p>Pick</p>'));
});
