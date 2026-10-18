<?php

// api/rich_text.php: the texts of a survey keep what the editor makes and
// nothing that could do more than look like text.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

test('the editor\'s own HTML comes back exactly as it went in', function (): void {
    foreach (
        [
            '<p>Plain</p>',
            '<p><strong>Bold</strong>, <em>italic</em>, <u>under</u>, <s>struck</s> and <mark>marked</mark>.</p>',
            '<h2>Welcome</h2><h3>Smaller</h3><p>Text&nbsp;with a non-breaking space &amp; an ampersand, 1 &lt; 2 &gt; 0, "quotes"</p>',
            '<ul><li><p>One</p></li><li><p>Two</p></li></ul><ol start="3"><li><p>Three</p></li></ol>',
            '<p>A <a target="_blank" rel="noopener noreferrer" href="https://anotoki.eu/?a=1&amp;b=2">link</a> and <a target="_blank" rel="noopener noreferrer" href="mailto:hello@anotoki.eu">mail</a></p>',
            '<p>Line<br>break</p><p></p><p>Ščťžýáíéúô · 日本語 · 🎉</p>',
        ]
        as $html
    ) {
        assert_same($html, richTextClean($html, 'the text'));
    }
});

test('anything that could run, load or pretend is taken out', function (): void {
    $cases = [
        '<p>Hi<script>alert(1)</script></p>' => '<p>Hi</p>',
        '<p onmouseover="alert(1)" style="color:red" class="x">Hi</p>' => '<p>Hi</p>',
        '<img src=x onerror=alert(1)><p>Hi</p>' => '<p>Hi</p>',
        '<p><a href="javascript:alert(1)">click</a></p>' => '<p>click</p>',
        '<p><a href=" JaVaScRiPt:alert(1)">click</a></p>' => '<p>click</p>',
        '<p><a href="data:text/html,x">click</a></p>' => '<p>click</p>',
        '<p><a href="//evil.example/x">click</a></p>' => '<p>click</p>',
        '<p><a href="https://ok.example" onclick="x()" target="_self">ok</a></p>' => '<p><a target="_blank" rel="noopener noreferrer" href="https://ok.example">ok</a></p>',
        '<iframe src="https://evil.example"></iframe><p>Hi</p>' => '<p>Hi</p>',
        '<svg><script>alert(1)</script></svg><p>Hi</p>' => '<p>Hi</p>',
        '<style>p{display:none}</style><p>Hi</p>' => '<p>Hi</p>',
        '<form action="https://evil.example"><button>Send</button></form><p>Hi</p>' => '<p>Hi</p>',
        '<div><span>Unwrapped</span> <font color=red>words</font></div>' => 'Unwrapped words',
        '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>' => '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>',
        '<!-- a comment --><p>Hi</p>' => '<p>Hi</p>',
        '<ol start="0"><li>x</li></ol><ol start="abc"><li>y</li></ol>' => '<ol><li>x</li></ol><ol><li>y</li></ol>',
        '<p>Unclosed <strong>bold' => '<p>Unclosed <strong>bold</strong></p>',
    ];
    foreach ($cases as $in => $out) {
        assert_same($out, richTextClean($in, 'the text'), $in);
    }
});

test('no words is no text; too long or not UTF-8 is refused', function (): void {
    assert_same('', richTextClean('<p></p>', 'the text'));
    assert_same('', richTextClean("<p> \u{00A0} </p><p><br></p>", 'the text'));
    assert_same('', richTextClean('', 'the text'));
    assert_throws(static fn() => richTextClean(str_repeat('x', RICH_TEXT_MAX_BYTES + 1), 'question 2'), '/question 2 is too long/');
    assert_throws(static fn() => richTextClean("<p>\xff</p>", 'the welcome'), '/not valid UTF-8/');
    assert_throws(static fn() => richTextClean(['<p>x</p>'], 'the thanks'), '/not text/');
    assert_same('Which one? Pick', richTextPlain('<p>Which <strong>one</strong>?</p><p>Pick</p>'));
});
