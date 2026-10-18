<?php

// api/survey_rules.php: what a survey may hold, what keeps it from opening,
// and what counts as an answer - the same as the frontend says it
// (core/survey/answer-rules.ts, survey-problems.ts), sentence for sentence.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

function question(array $fields = []): array
{
    return $fields + [
        'id' => 'q1',
        'type' => 'single',
        'text' => '<p>Which one?</p>',
        'images' => [],
        'required' => true,
        'options' => [option('a', 'Anemo'), option('b', 'Geo'), option('o', 'Something else', true)],
        'layout' => 'list',
        'minChoices' => null,
        'maxChoices' => null,
        'multiline' => true,
        'maxLength' => null,
        'placeholder' => '',
    ];
}

function option(string $id, string $label, bool $other = false): array
{
    return ['id' => $id, 'label' => $label, 'other' => $other, 'images' => []];
}

function answer(array $optionIds = [], string $other = '', string $text = ''): array
{
    return ['optionIds' => $optionIds, 'other' => $other, 'text' => $text];
}

/** A survey as the editor sends it: one step, the given questions - written in English, translated into nothing. */
function body(array $questions = [], array $fields = []): array
{
    return $fields + [
        'title' => 'Genshin 1.0',
        'slug' => 'genshin-1-0',
        'intro' => '<p>Hello</p>',
        'thanks' => '<p>Thanks</p>',
        'askAboutYou' => true,
        'closesOn' => null,
        'steps' => [['id' => 's1', 'title' => 'First', 'questions' => $questions ?: [question()]]],
        'language' => 'en',
        'translations' => [],
    ];
}

/** The languages of the site, in its order, as languagesForSurveys() reads them: English and Slovak offered, German hidden. */
const LANGUAGES = [
    'en' => ['name' => 'English', 'enabled' => true],
    'sk' => ['name' => 'Slovak', 'enabled' => true],
    'de' => ['name' => 'German', 'enabled' => false],
];

/**
 * Three questions in two steps, with "About you" before them - the survey
 * frontend/src/app/core/survey/survey-problems.spec.ts checks the same
 * sentences on, in the same order (threeQuestions() there).
 */
function three_questions(array $translations = [], array $fields = []): array
{
    return body(
        [],
        $fields + [
            'steps' => [
                ['id' => 's1', 'title' => 'First', 'questions' => [question(), question(['id' => 'q2', 'type' => 'text', 'text' => '<p>Why?</p>', 'options' => [], 'placeholder' => 'A few words'])]],
                ['id' => 's2', 'title' => 'Second', 'questions' => [question(['id' => 'q3', 'text' => '<p>Again?</p>', 'options' => [option('a', 'Yes'), option('b', 'No')]])]],
            ],
            'translations' => $translations,
        ],
    );
}

/** Nothing of three_questions() left to translate (wholeSlovak() in the spec). */
function whole_slovak(): array
{
    return [
        'title' => 'Genshin 1.0',
        'intro' => '<p>Ahoj</p>',
        'thanks' => '<p>Vďaka</p>',
        'steps' => ['s1' => ['title' => 'Prvý'], 's2' => ['title' => 'Druhý']],
        'questions' => [
            'q1' => ['text' => '<p>Ktorý?</p>', 'placeholder' => '', 'options' => ['a' => ['label' => 'Anemo'], 'b' => ['label' => 'Geo'], 'o' => ['label' => 'Niečo iné']], 'images' => []],
            'q2' => ['text' => '<p>Prečo?</p>', 'placeholder' => 'Pár slov', 'options' => [], 'images' => []],
            'q3' => ['text' => '<p>Znova?</p>', 'placeholder' => '', 'options' => ['a' => ['label' => 'Áno'], 'b' => ['label' => 'Nie']], 'images' => []],
        ],
    ];
}

/** The same with holes in it (brokenSlovak() in the spec). */
function broken_slovak(): array
{
    return [
        'title' => '',
        'intro' => '<p> </p>',
        'thanks' => '',
        'steps' => ['s2' => ['title' => 'Druhý']],
        'questions' => [
            'q1' => ['text' => '', 'placeholder' => '', 'options' => ['a' => ['label' => 'Rovnaké'], 'b' => ['label' => ' rovnaké ']], 'images' => []],
            'q2' => ['text' => '<p>Prečo?</p>', 'placeholder' => '', 'options' => [], 'images' => []],
            'q3' => whole_slovak()['questions']['q3'],
        ],
    ];
}

/** What surveyProblems() and surveyTranslationGaps() take: the survey as surveyFromBody() leaves it. */
function checked(array $body): array
{
    $survey = surveyFromBody($body, LANGUAGES);

    return ['id' => 'x', 'title' => $survey['title'], 'slug' => $survey['slug'], 'content' => $survey['content']];
}

test('one choice: required means one, never two; "Other" needs its words', function (): void {
    $q = question();
    assert_same('Please choose an answer.', answerProblem($q, null));
    assert_same('Please choose an answer.', answerProblem($q, answer(['gone'])), 'an option the question no longer has is no answer');
    assert_same(null, answerProblem($q, answer(['a'])));
    assert_same('Please choose only one.', answerProblem($q, answer(['a', 'b'])));
    assert_same('Please write what "Something else" is for you.', answerProblem($q, answer(['o'], '   ')));
    assert_same(null, answerProblem($q, answer(['o'], 'Hydro')));
    assert_same('Please keep it under 1000 characters.', answerProblem($q, answer(['o'], str_repeat('x', 1001))));
    assert_same(null, answerProblem(question(['required' => false]), null), 'optional: nothing is fine');
});

test('several choices: the limits the question sets, bounded by the options there are', function (): void {
    $q = question(['type' => 'multiple', 'minChoices' => 2, 'maxChoices' => 2]);
    assert_same('Please choose at least 2.', answerProblem($q, null));
    assert_same('Please choose at least 2.', answerProblem($q, answer(['a'])));
    assert_same(null, answerProblem($q, answer(['a', 'b'])));
    assert_same('Please choose at most 2.', answerProblem($q, answer(['a', 'b', 'o'], 'x')));
    assert_same(['min' => 1, 'max' => 3], answerChoiceLimits(question(['type' => 'multiple', 'maxChoices' => 10])));
    assert_same(['min' => 0, 'max' => 0], answerChoiceLimits(question(['options' => []])), 'nothing to choose from traps nobody');
    assert_same(null, answerProblem(question(['options' => []]), null));
});

test('own words: something written, within the limit - and never more than the site takes', function (): void {
    $q = question(['type' => 'text', 'options' => [], 'maxLength' => 10]);
    assert_same('Please write an answer.', answerProblem($q, answer([], '', "  \u{00A0} ")), 'spaces of every kind are nothing');
    assert_same(null, answerProblem($q, answer([], '', '  0123456789  ')), 'counted without the spaces around it');
    assert_same('Please keep it under 10 characters.', answerProblem($q, answer([], '', '01234567890')));
    assert_same(null, answerProblem($q, answer([], '', 'ščťžýáíéúô')), 'characters, not bytes');
    $open = question(['type' => 'text', 'options' => [], 'maxLength' => null, 'required' => false]);
    assert_same('Please keep it under 10000 characters.', answerProblem($open, answer([], '', str_repeat('x', 10001))));
});

test('an answer is kept as cleanAnswer keeps it: the question\'s order, "Other" only when chosen, text trimmed', function (): void {
    $q = question(['type' => 'multiple']);
    assert_same(answer(['a', 'b']), answerClean($q, answer(['b', 'gone', 'a'], 'stale words')));
    assert_same(answer(['o'], 'Hydro'), answerClean($q, answer(['o'], '  Hydro ')));
    assert_same(null, answerClean($q, answer(['gone'])));
    assert_same(answer([], '', 'fine'), answerClean(question(['type' => 'text', 'options' => []]), answer(['a'], 'x', ' fine ')));
});

test('what is not an answer at all is refused, not guessed at - and says which question', function (): void {
    assert_same(null, answerFromBody(null, 1, 'q1'));
    assert_same(answer(['a']), answerFromBody(['optionIds' => ['a', 'a']], 1, 'q1'), 'a choice twice is one choice');
    foreach ([['optionIds' => 'a'], ['optionIds' => [1]], ['text' => ['x']], ['other' => "\xff"], 'text', [1, 2]] as $bad) {
        try {
            answerFromBody($bad, 3, 'q3');
            fail('taken: ' . test_show($bad));
        } catch (ApiError $e) {
            assert_match('/question 3/', $e->getMessage());
            assert_same('q3', $e->extra['questionId'] ?? null, 'with the question, for the page to show');
        }
    }
});

test('control characters pasted into words are dropped, not refused - line breaks and tabs stay', function (): void {
    assert_same(answer([], 'Hydro', "first line\nsecond\tline"), answerFromBody(['other' => "Hy\x0Bdro\x1B", 'text' => "first line\n\x0Csecond\tline"], 1, 'q1'));
    $survey = surveyFromBody(body([question(['options' => [option('a', "Ane\x0Bmo"), option('b', 'Geo')]])], ['title' => "Genshin\x0C 1.0"]), LANGUAGES);
    assert_same('Genshin 1.0', $survey['title']);
    assert_same('Anemo', $survey['content']['steps'][0]['questions'][0]['options'][0]['label']);
});

test('a space is what the browser\'s trim() takes for one - the same characters, so both sides find the same texts blank', function (): void {
    // String.prototype.trim() and \s in the browser: these and no others (core/survey/localize.spec.ts pins the other side).
    $spaces = [0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0xa0, 0x1680, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000, 0xfeff, ...range(0x2000, 0x200a)];
    $space = static fn(string $character): bool => textTrim($character) === '';
    $found = [];
    for ($point = 1; $point <= 0xffff; $point++) {
        if ($point < 0xd800 || $point > 0xdfff) {
            $character = json_decode(sprintf('"\u%04x"', $point));
            if ($space($character)) {
                $found[] = $point;
            }
            assert_same($space($character), richTextPlain("a{$character}b") === 'a b', sprintf('U+%04X: between words it is a space exactly when around them it is', $point));
        }
    }
    sort($spaces);
    assert_same($spaces, $found, 'every character trim() takes away, and no other');
    assert_same('a', textTrim(" \u{00A0}\u{3000}\t\u{FEFF}a\u{2028}\r\n"));
    assert_same('a  b', textTrim(' a  b '), 'only around it');

    // The next line (U+0085) and the Mongolian vowel separator (U+180E) are spaces to \s and \p{Z} here and
    // none to the browser. A text that holds one is a text: the page says so, and the server must not say otherwise.
    foreach (['U+0085' => "\u{0085}", 'U+180E' => "\u{180E}"] as $name => $character) {
        assert_same($character, textTrim($character), "$name is not a space");
        assert_same(" a$character", ' ' . textTrim("a$character "));
        assert_false(richTextIsBlank("<p>$character</p>"));
        assert_same("a{$character}b", richTextPlain("<p>a{$character}b</p>"));

        $translated = whole_slovak();
        $translated['questions']['q1']['options']['a']['label'] = $character;
        $translated['questions']['q2']['placeholder'] = " $character ";
        $translated['steps']['s1']['title'] = $character;
        $translated['intro'] = "<p>$character</p>";
        $survey = checked(three_questions(['sk' => $translated]));
        assert_same([], surveyTranslationGaps($survey, 'sk'), "a translation that is $name is one: no gap");
        assert_same([], surveyProblems($survey, [], LANGUAGES));
        assert_same('Please write an answer.', answerProblem(question(['type' => 'text', 'options' => []]), answer([], '', ' ')), 'a space is no answer');
        assert_same(null, answerProblem(question(['type' => 'text', 'options' => []]), answer([], '', $character)), 'and this is one, as the page says too');
    }
    assert_true(richTextIsBlank("<p>\u{00A0} \u{2003}</p><p><br></p>"), 'what the browser finds blank is blank');
});

test('a survey from the editor: every field checked, the texts cleaned, nothing else kept', function (): void {
    $survey = surveyFromBody(body([question(['text' => '<p onclick="x()">Which <script>alert(1)</script>one?</p>', 'extra' => 'dropped'])], ['status' => 'open', 'id' => 'mine']), LANGUAGES);
    assert_same('Genshin 1.0', $survey['title']);
    assert_same(['intro', 'thanks', 'askAboutYou', 'steps', 'language', 'translations'], array_keys($survey['content']), 'status and id are not the editor\'s to send');
    assert_same(['en', []], [$survey['content']['language'], $survey['content']['translations']]);
    $q = $survey['content']['steps'][0]['questions'][0];
    assert_same('<p>Which one?</p>', $q['text']);
    assert_false(array_key_exists('extra', $q));
    assert_same([], $survey['imageIds']);
});

test('a survey that is not one is refused, and says where', function (): void {
    $bad = [
        'no steps' => [body([], ['steps' => 'x']), '/The steps is not a list/'],
        'a step without an id' => [body([], ['steps' => [['title' => 'x', 'questions' => []]]]), '/Step 1 is not a step/'],
        'two steps with one id' => [body([], ['steps' => [['id' => 's', 'title' => '', 'questions' => []], ['id' => 's', 'title' => '', 'questions' => []]]]), '/Step 2 has the id/'],
        'an id with a colon' => [body([question(['id' => 'a:b'])]), '/question 1 is not a question/i'],
        'the id of gender' => [body([question(['id' => 'about-gender'])]), '/Question 1 has the id of another question/'],
        'an unknown type' => [body([question(['type' => 'rating'])]), '/no type/'],
        'two options with one id' => [body([question(['options' => [option('a', 'A'), option('a', 'B')]])]), '/has the id of another option/'],
        'a title too long' => [body([], ['title' => str_repeat('x', 201)]), '/The title is longer than 200/'],
        'a day that is not' => [body([], ['closesOn' => '2026-02-30']), '/not a day/'],
        'required as a word' => [body([question(['required' => 'yes'])]), '/must be answered is not true or false/'],
        'a picture from elsewhere' => [body([question(['images' => [['id' => 'https://example.com/x.png', 'alt' => '']]])]), '/not a picture of this site/'],
        'too many pictures on an option' => [
            body([question(['options' => [['id' => 'a', 'label' => 'A', 'other' => false, 'images' => array_fill(0, 5, ['id' => newUuid(), 'alt' => ''])]]])]),
            '/more than 4 items/',
        ],
    ];
    foreach ($bad as $what => [$body, $pattern]) {
        try {
            surveyFromBody($body, LANGUAGES);
            fail("$what was taken");
        } catch (ApiError $e) {
            assert_same(422, $e->status, $what);
            assert_match($pattern, $e->getMessage(), $what);
        }
    }
});

test('what keeps a survey from opening: the editor\'s list, in its words', function (): void {
    $good = surveyFromBody(body(), LANGUAGES);
    $survey = ['id' => 'x', 'title' => $good['title'], 'slug' => $good['slug'], 'content' => $good['content']];
    assert_same([], surveyProblems($survey, [['id' => 'y', 'slug' => 'other']]));
    assert_same(['Another survey already lives at "genshin-1-0".'], surveyProblems($survey, [['id' => 'y', 'slug' => 'genshin-1-0']]));
    assert_same(['The address "admin" belongs to the site itself - choose another.'], surveyProblems(['slug' => 'admin'] + $survey, []));
    foreach (['terms', 'privacy', 'contact'] as $legal) {
        assert_same(["The address \"$legal\" belongs to the site itself - choose another."], surveyProblems(['slug' => $legal] + $survey, []), "/$legal is a legal page's");
        assert_same("The address \"$legal\" belongs to the site itself - choose another.", surveyLiveSlugProblem($legal), 'and no survey opens there');
    }
    assert_same(['The address may hold only small letters, digits and dashes.'], surveyProblems(['slug' => 'Genshin 1.0'] + $survey, []));

    $broken = surveyFromBody(
        body(
            [
                question(['text' => '<p> </p>', 'options' => [option('a', 'Anemo'), option('b', ' anemo ')]]),
                question(['id' => 'q2', 'type' => 'multiple', 'options' => [option('a', 'A'), option('b', '')], 'minChoices' => 3, 'maxChoices' => 2]),
                question(['id' => 'q3', 'type' => 'text', 'options' => [], 'maxLength' => 0]),
            ],
            ['title' => ' '],
        ),
        LANGUAGES,
    );
    $broken['content']['steps'][] = ['id' => 's2', 'title' => '', 'questions' => []];
    assert_same(
        [
            'The survey needs a title.',
            'Step 3 has no questions - add one, or remove the step.',
            'Question 1 has no text.',
            'Question 1 has two options called "anemo".',
            'Question 2 has an option with no label.',
            'Question 2 asks for at least 3 but at most 2.',
            'Question 2 asks for at least 3 but has only 2 options.',
            'Question 3: the longest answer must be at least one character.',
        ],
        surveyProblems(['id' => 'x', 'title' => $broken['title'], 'slug' => 'fine', 'content' => $broken['content']], []),
    );

    $empty = surveyFromBody(body([], ['steps' => []]), LANGUAGES);
    assert_same(['Add at least one question.'], surveyProblems(['id' => 'x', 'title' => 'T', 'slug' => 'fine', 'content' => $empty['content']], []));
});

test('the addresses the site keeps for itself are the same on both sides - SURVEY_RESERVED_SLUGS and the frontend\'s RESERVED_SLUGS - the legal pages\' among them', function (): void {
    $source = (string) file_get_contents(dirname(TEST_BACKEND) . '/frontend/src/app/core/survey/survey-factory.ts');
    assert_true((bool) preg_match('/export const RESERVED_SLUGS\b[^=]*=\s*new Set\(\[([^\]]*)\]\)/', $source, $m), 'RESERVED_SLUGS could be read from survey-factory.ts');
    preg_match_all("/'([^']+)'/", $m[1], $slugs);
    assert_same(SURVEY_RESERVED_SLUGS, $slugs[1], 'the same addresses, in the same order');
    foreach (['terms', 'privacy', 'contact'] as $legal) {
        assert_true(in_array($legal, SURVEY_RESERVED_SLUGS, true), "/$legal: a legal page's address, never a survey's");
    }
});

test('a survey says its language and carries its translations: neither is guessed, and no language is dropped', function (): void {
    $without = static function (string $field): array {
        $body = body();
        unset($body[$field]);

        return $body;
    };
    $picture = newUuid();
    $pictured = [question(['images' => [['id' => $picture, 'alt' => 'A map']]])];
    $bad = [
        // A default for either would let a page from before surveys had languages delete every translation with a save.
        // Such a page is who reads the refusal: what is wrong with the body, then what its person can do.
        'no language' => [
            $without('language'),
            '/^Say which language the survey is written in \(language\)\. A page that was open before the site was updated can no longer save: copy what you changed since the last save, then reload the page\.$/',
        ],
        'a language of nothing' => [
            body([], ['language' => null]),
            '/^Say which language the survey is written in \(language\)\. A page that was open before the site was updated can no longer save: copy what you changed since the last save, then reload the page\.$/',
        ],
        'no translations' => [
            $without('translations'),
            '/^Send the translations, or an empty object \(translations\)\. A page that was open before the site was updated can no longer save: copy what you changed since the last save, then reload the page\.$/',
        ],
        'translations of nothing' => [
            body([], ['translations' => null]),
            '/^Send the translations, or an empty object \(translations\)\. A page that was open before the site was updated can no longer save: copy what you changed since the last save, then reload the page\.$/',
        ],
        'a language the site does not have' => [body([], ['language' => 'xx']), '/written in is not a language of this site/'],
        'a language that is no code' => [body([], ['language' => 'EN']), '/written in is not a language of this site/'],
        'a language that is no text' => [body([], ['language' => ['en']]), '/written in is not a language of this site/'],
        // Refused, never dropped: a save does not throw a language of work away.
        'a translation into a language the site does not have' => [body([], ['translations' => ['fr' => []]]), '/translated into a language the site does not have \("fr"\)/'],
        'a translation into no language at all' => [body([], ['translations' => ['<b>' => []]]), '/translated into a language the site does not have\. /'],
        'a translation into its own language' => [body([], ['translations' => ['en' => []]]), '/written in English, so it cannot be translated into it/'],
        'more translations than languages' => [body([], ['translations' => ['sk' => [], 'de' => [], 'fr' => [], 'it' => []]]), '/more languages than the site has/'],
        'translations as a word' => [body([], ['translations' => 'none']), '/the translations is not an object/'],
        'translations as a list' => [body([], ['translations' => [[]]]), '/the translations is not an object/'],
        // Every level that is there is an object (or the empty array an empty one decodes to).
        'a translation as a word' => [body([], ['translations' => ['sk' => 'Ahoj']]), '/The Slovak translation is not an object/'],
        'a translation as a list' => [body([], ['translations' => ['sk' => ['Ahoj']]]), '/The Slovak translation is not an object/'],
        'step titles as a word' => [body([], ['translations' => ['sk' => ['steps' => 'x']]]), '/step titles in Slovak is not an object/'],
        'a step title as a word' => [body([], ['translations' => ['sk' => ['steps' => ['s1' => 'Prvý']]]]), '/The Slovak title of step 1 is not an object/'],
        'questions as a number' => [body([], ['translations' => ['sk' => ['questions' => 1]]]), '/questions in Slovak is not an object/'],
        'a question as a word' => [body([], ['translations' => ['sk' => ['questions' => ['q1' => 'Ktorý?']]]]), '/Question 1 in Slovak is not an object/'],
        'options as a word' => [body([], ['translations' => ['sk' => ['questions' => ['q1' => ['options' => 'x']]]]]), '/options of question 1 in Slovak is not an object/'],
        'an option as a word' => [body([], ['translations' => ['sk' => ['questions' => ['q1' => ['options' => ['b' => 'Geo']]]]]]), '/Option 2 of question 1 in Slovak is not an object/'],
        'picture descriptions as true' => [body([], ['translations' => ['sk' => ['questions' => ['q1' => ['images' => true]]]]]), '/picture descriptions of question 1 in Slovak is not an object/'],
        'a picture description as a word' => [
            body($pictured, ['translations' => ['sk' => ['questions' => ['q1' => ['images' => [$picture => 'Mapa']]]]]]),
            '/Picture 1 of question 1 in Slovak is not an object/',
        ],
        // The same limits as the texts they translate.
        'a translated title too long' => [body([], ['translations' => ['sk' => ['title' => str_repeat('x', 201)]]]), '/The Slovak title is longer than 200/'],
        'a translated title that is no text' => [body([], ['translations' => ['sk' => ['title' => ['x']]]]), '/The Slovak title is not text/'],
        'a translated welcome too long' => [body([], ['translations' => ['sk' => ['intro' => str_repeat('x', 50001)]]]), '/The text of the Slovak welcome is too long/'],
        'a translated thanks that is no text' => [body([], ['translations' => ['sk' => ['thanks' => 5]]]), '/The text of the Slovak thanks is not text/'],
        'a translated step title too long' => [body([], ['translations' => ['sk' => ['steps' => ['s1' => ['title' => str_repeat('x', 201)]]]]]), '/The Slovak title of step 1 is longer than 200/'],
        'a translated question too long' => [body([], ['translations' => ['sk' => ['questions' => ['q1' => ['text' => str_repeat('x', 50001)]]]]]), '/The text of question 1 in Slovak is too long/'],
        'a translated hint too long' => [
            body([], ['translations' => ['sk' => ['questions' => ['q1' => ['placeholder' => str_repeat('x', 301)]]]]]),
            '/The hint of question 1 in Slovak is longer than 300/',
        ],
        'a translated label too long' => [
            body([], ['translations' => ['sk' => ['questions' => ['q1' => ['options' => ['o' => ['label' => str_repeat('x', 301)]]]]]]]),
            '/The label of option 3 of question 1 in Slovak is longer than 300/',
        ],
        'a translated description not UTF-8' => [
            body($pictured, ['translations' => ['sk' => ['questions' => ['q1' => ['images' => [$picture => ['alt' => "\xff"]]]]]]]),
            '/The description of picture 1 of question 1 in Slovak is not text/',
        ],
    ];
    foreach ($bad as $what => [$body, $pattern]) {
        try {
            surveyFromBody($body, LANGUAGES);
            fail("$what was taken");
        } catch (ApiError $e) {
            assert_same([422, 'invalid_survey'], [$e->status, $e->errorCode], $what);
            assert_match($pattern, $e->getMessage(), $what);
        }
    }

    // A hidden language is a language: a survey may be written in it, and translated into it before it is offered.
    $german = surveyFromBody(body([], ['language' => 'de', 'translations' => ['en' => [], 'sk' => []]]), LANGUAGES);
    assert_same(['de', ['en', 'sk']], [$german['content']['language'], array_keys($german['content']['translations'])]);
});

test('a translation is built from the survey itself: its ids only, its texts cleaned like the ones they translate', function (): void {
    $picture = newUuid();
    $elsewhere = newUuid();
    $survey = surveyFromBody(
        body(
            [question(['images' => [['id' => $picture, 'alt' => 'A map'], ['id' => $picture, 'alt' => 'A map']]])],
            [
                'translations' => [
                    'sk' => [
                        'title' => "Gen\x0Cshin 1.0",
                        'intro' => '<p onclick="x()">Ahoj<script>alert(1)</script></p>',
                        'thanks' => '<p></p>',
                        'extra' => 'dropped',
                        'steps' => ['s1' => ['title' => 'Prvý', 'extra' => 'dropped'], 'gone' => ['title' => 'Nikde'], 'a:b' => 'not even looked at'],
                        'questions' => [
                            'q1' => [
                                'text' => '<p>Ktorý <img src="x" onerror="alert(1)">?</p>',
                                'placeholder' => 'Nič',
                                'type' => 'text',
                                'required' => false,
                                'options' => ['a' => ['label' => "Ane\x0Bmo", 'other' => true], 'gone' => ['label' => 'Nikde']],
                                'images' => [$picture => ['alt' => 'Mapa', 'src' => 'https://evil.example/x.png'], $elsewhere => ['alt' => 'Inde']],
                            ],
                            'gone' => ['text' => '<p>Nikde</p>'],
                            'about-gender' => ['text' => '<p>Nikde</p>'],
                        ],
                    ],
                ],
            ],
        ),
        LANGUAGES,
    );

    assert_same(
        [
            'sk' => [
                'title' => 'Genshin 1.0',
                'intro' => '<p>Ahoj</p>',
                'thanks' => '',
                'steps' => ['s1' => ['title' => 'Prvý']],
                'questions' => ['q1' => ['text' => '<p>Ktorý ?</p>', 'placeholder' => 'Nič', 'options' => ['a' => ['label' => 'Anemo']], 'images' => [$picture => ['alt' => 'Mapa']]]],
            ],
        ],
        $survey['content']['translations'],
        'what the survey has, and nothing else',
    );
    assert_same([$picture], $survey['imageIds'], 'a translation names no picture of its own');
    assert_same(['single', true], [$survey['content']['steps'][0]['questions'][0]['type'], $survey['content']['steps'][0]['questions'][0]['required']], 'and changes nothing of the survey');

    // Nothing sent for a language is a translation with nothing in it yet.
    $empty = surveyFromBody(body([], ['translations' => ['sk' => []]]), LANGUAGES);
    assert_same(['sk' => ['title' => '', 'intro' => '', 'thanks' => '', 'steps' => [], 'questions' => []]], $empty['content']['translations']);
});

test('as JSON every map of a translation is an object - empty, or with ids that look like numbers', function (): void {
    assert_same('{}', jsonText(surveyTranslationsJson([])));
    $empty = surveyFromBody(body([], ['translations' => ['sk' => ['questions' => ['q1' => []]]]]), LANGUAGES);
    assert_same(
        '{"sk":{"title":"","intro":"","thanks":"","steps":{},"questions":{"q1":{"text":"","placeholder":"","options":{},"images":{}}}}}',
        jsonText(surveyTranslationsJson($empty['content']['translations'])),
    );
    assert_same('{"sk":{"title":"","intro":"","thanks":"","steps":{},"questions":{}}}', jsonText(surveyTranslationsJson(['sk' => []])), 'and one kept with less than all of it goes out whole');

    // Steps, questions and options called "0" and "1": a list to PHP, a map by id to everybody else.
    $numbered = surveyFromBody(
        body(
            [],
            [
                'steps' => [
                    ['id' => '0', 'title' => 'First', 'questions' => [question(['id' => '0', 'options' => [option('0', 'Yes'), option('1', 'No')]])]],
                    ['id' => '1', 'title' => 'Second', 'questions' => [question(['id' => '1', 'type' => 'text', 'options' => []])]],
                ],
                'translations' => [
                    'sk' => [
                        'steps' => [['title' => 'Prvý'], ['title' => 'Druhý']],
                        'questions' => [['text' => '<p>Ktorý?</p>', 'options' => [['label' => 'Áno'], ['label' => 'Nie']]], ['text' => '<p>Prečo?</p>']],
                    ],
                ],
            ],
        ),
        LANGUAGES,
    );
    assert_same(
        '{"sk":{"title":"","intro":"","thanks":"","steps":{"0":{"title":"Prvý"},"1":{"title":"Druhý"}},"questions":{' .
            '"0":{"text":"<p>Ktorý?</p>","placeholder":"","options":{"0":{"label":"Áno"},"1":{"label":"Nie"}},"images":{}},' .
            '"1":{"text":"<p>Prečo?</p>","placeholder":"","options":{},"images":{}}}}}',
        jsonText(surveyTranslationsJson($numbered['content']['translations'])),
    );
    assert_same([], surveyTranslationGaps(['title' => '', 'content' => ['intro' => '', 'thanks' => ''] + $numbered['content']], 'sk'), 'and found by those ids');
});

test('what is left to translate: the places the page finds, in its order', function (): void {
    assert_same([], surveyTranslationGaps(checked(three_questions(['sk' => whole_slovak()])), 'sk'));
    assert_same(
        [
            ['kind' => 'title'],
            ['kind' => 'intro'],
            ['kind' => 'thanks'],
            ['kind' => 'step', 'stepId' => 's1'],
            ['kind' => 'text', 'questionId' => 'q1'],
            ['kind' => 'option', 'questionId' => 'q1', 'optionId' => 'o'],
            ['kind' => 'placeholder', 'questionId' => 'q2'],
        ],
        surveyTranslationGaps(checked(three_questions(['sk' => broken_slovak()])), 'sk'),
    );

    // A language the survey is not translated into has everything to translate.
    assert_same(14, count(surveyTranslationGaps(checked(three_questions()), 'sk')));

    // A question counts what its type shows: no hint for a choice, no options for own words. The same picture twice is one description.
    $picture = newUuid();
    $survey = checked(
        body(
            [
                question([
                    'placeholder' => 'Kept from when it was own words',
                    'images' => [['id' => $picture, 'alt' => 'A map'], ['id' => $picture, 'alt' => 'A map'], ['id' => newUuid(), 'alt' => ' ']],
                ]),
                question(['id' => 'q2', 'type' => 'text', 'placeholder' => 'A few words']),
            ],
            ['title' => ' ', 'intro' => '<p></p>', 'thanks' => '', 'translations' => ['sk' => []]],
        ),
    );
    $survey['content']['steps'][0]['title'] = '';
    assert_same(
        [
            ['kind' => 'text', 'questionId' => 'q1'],
            ['kind' => 'option', 'questionId' => 'q1', 'optionId' => 'a'],
            ['kind' => 'option', 'questionId' => 'q1', 'optionId' => 'b'],
            ['kind' => 'option', 'questionId' => 'q1', 'optionId' => 'o'],
            ['kind' => 'image', 'questionId' => 'q1', 'imageId' => $picture],
            ['kind' => 'text', 'questionId' => 'q2'],
            ['kind' => 'placeholder', 'questionId' => 'q2'],
        ],
        surveyTranslationGaps($survey, 'sk'),
        'and where the survey says nothing there is nothing to translate',
    );
});

test('a translation people are offered must be whole before the survey opens: the editor\'s list, in its words', function (): void {
    assert_same([], surveyProblems(checked(three_questions(['sk' => whole_slovak()])), [], LANGUAGES));
    assert_same([], surveyProblems(checked(three_questions()), [], LANGUAGES));

    // After the problems of the survey itself, in the order of the document.
    $broken = checked(three_questions(['sk' => broken_slovak()]));
    assert_same(
        [
            'The address "admin" belongs to the site itself - choose another.',
            'Slovak: the title is missing.',
            'Slovak: the welcome text is missing.',
            'Slovak: the thank-you text is missing.',
            'Slovak: the title of step 2 is missing.',
            'Slovak: question 1 has 2 texts to translate.',
            'Slovak: question 1 has two options called "rovnaké".',
            'Slovak: question 2 has 1 text to translate.',
        ],
        surveyProblems(['slug' => 'admin'] + $broken, [], LANGUAGES),
    );
    // Steps are numbered as people see them: without "About you" the first step is step 1.
    $plain = $broken;
    $plain['content']['askAboutYou'] = false;
    assert_true(in_array('Slovak: the title of step 1 is missing.', surveyProblems($plain, [], LANGUAGES), true));
    // A survey with no title has none to translate.
    assert_same(['The survey needs a title.', 'Slovak: the welcome text is missing.'], array_slice(surveyProblems(['title' => ' '] + $broken, [], LANGUAGES), 0, 2));

    // Only the languages people are offered, in the languages' order - and none when it is told of none.
    $two = checked(three_questions(['de' => [], 'sk' => ['title' => ''] + whole_slovak()]));
    assert_same(['Slovak: the title is missing.'], surveyProblems($two, [], LANGUAGES));
    assert_same([], surveyProblems($two, []));
    $offered = array_map(static fn(array $language): array => ['enabled' => true] + $language, LANGUAGES);
    assert_same(
        [
            'Slovak: the title is missing.',
            'German: the title is missing.',
            'German: the welcome text is missing.',
            'German: the thank-you text is missing.',
            'German: the title of step 2 is missing.',
            'German: question 1 has 4 texts to translate.',
            'German: question 2 has 2 texts to translate.',
            'German: the title of step 3 is missing.',
            'German: question 3 has 3 texts to translate.',
        ],
        surveyProblems($two, [], $offered),
    );

    // A language the site does not know (deleted since), and the one the survey is written in, are nobody's to translate.
    $stray = $two;
    $stray['content']['translations'] = ['fr' => [], 'en' => []];
    assert_same([], surveyProblems($stray, [], $offered));
    // A survey kept before surveys had languages has neither field: nothing to find, nothing to trip on.
    $old = checked(three_questions());
    unset($old['content']['language'], $old['content']['translations']);
    assert_same([], surveyProblems($old, [], LANGUAGES));
});
