<?php

// api/survey_rules.php: what a survey may hold, what keeps it from opening,
// and what counts as an answer - the same as the frontend says it
// (core/survey/answer-rules.ts, survey-problems.ts), sentence for sentence.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

function question(array $fields = []): array
{
    return $fields + [
        'id' => 'q1', 'type' => 'single', 'text' => '<p>Which one?</p>', 'images' => [], 'required' => true,
        'options' => [option('a', 'Anemo'), option('b', 'Geo'), option('o', 'Something else', true)],
        'layout' => 'list', 'minChoices' => null, 'maxChoices' => null, 'multiline' => true, 'maxLength' => null, 'placeholder' => '',
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

/** A survey as the editor sends it: one step, the given questions. */
function body(array $questions = [], array $fields = []): array
{
    return $fields + [
        'title' => 'Genshin 1.0', 'slug' => 'genshin-1-0', 'intro' => '<p>Hello</p>', 'thanks' => '<p>Thanks</p>',
        'askAboutYou' => true, 'closesOn' => null,
        'steps' => [['id' => 's1', 'title' => 'First', 'questions' => $questions ?: [question()]]],
    ];
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
    assert_same(answer([], "Hydro", "first line\nsecond\tline"), answerFromBody(['other' => "Hy\x0Bdro\x1B", 'text' => "first line\n\x0Csecond\tline"], 1, 'q1'));
    $survey = surveyFromBody(body([question(['options' => [option('a', "Ane\x0Bmo"), option('b', 'Geo')]])], ['title' => "Genshin\x0C 1.0"]));
    assert_same('Genshin 1.0', $survey['title']);
    assert_same('Anemo', $survey['content']['steps'][0]['questions'][0]['options'][0]['label']);
});

test('a survey from the editor: every field checked, the texts cleaned, nothing else kept', function (): void {
    $survey = surveyFromBody(body([question(['text' => '<p onclick="x()">Which <script>alert(1)</script>one?</p>', 'extra' => 'dropped'])], ['status' => 'open', 'id' => 'mine']));
    assert_same('Genshin 1.0', $survey['title']);
    assert_same(['intro', 'thanks', 'askAboutYou', 'steps'], array_keys($survey['content']), 'status and id are not the editor\'s to send');
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
        'too many pictures on an option' => [body([question(['options' => [['id' => 'a', 'label' => 'A', 'other' => false, 'images' => array_fill(0, 5, ['id' => newUuid(), 'alt' => ''])]]])]), '/more than 4 items/'],
    ];
    foreach ($bad as $what => [$body, $pattern]) {
        try {
            surveyFromBody($body);
            fail("$what was taken");
        } catch (ApiError $e) {
            assert_same(422, $e->status, $what);
            assert_match($pattern, $e->getMessage(), $what);
        }
    }
});

test('what keeps a survey from opening: the editor\'s list, in its words', function (): void {
    $good = surveyFromBody(body());
    $survey = ['id' => 'x', 'title' => $good['title'], 'slug' => $good['slug'], 'content' => $good['content']];
    assert_same([], surveyProblems($survey, [['id' => 'y', 'slug' => 'other']]));
    assert_same(['Another survey already lives at "genshin-1-0".'], surveyProblems($survey, [['id' => 'y', 'slug' => 'genshin-1-0']]));
    assert_same(['The address "admin" belongs to the site itself - choose another.'], surveyProblems(['slug' => 'admin'] + $survey, []));
    assert_same(['The address may hold only small letters, digits and dashes.'], surveyProblems(['slug' => 'Genshin 1.0'] + $survey, []));

    $broken = surveyFromBody(body([
        question(['text' => '<p> </p>', 'options' => [option('a', 'Anemo'), option('b', ' anemo ')]]),
        question(['id' => 'q2', 'type' => 'multiple', 'options' => [option('a', 'A'), option('b', '')], 'minChoices' => 3, 'maxChoices' => 2]),
        question(['id' => 'q3', 'type' => 'text', 'options' => [], 'maxLength' => 0]),
    ], ['title' => ' ']));
    $broken['content']['steps'][] = ['id' => 's2', 'title' => '', 'questions' => []];
    assert_same([
        'The survey needs a title.',
        'Step 3 has no questions - add one, or remove the step.',
        'Question 1 has no text.',
        'Question 1 has two options called "anemo".',
        'Question 2 has an option with no label.',
        'Question 2 asks for at least 3 but at most 2.',
        'Question 2 asks for at least 3 but has only 2 options.',
        'Question 3: the longest answer must be at least one character.',
    ], surveyProblems(['id' => 'x', 'title' => $broken['title'], 'slug' => 'fine', 'content' => $broken['content']], []));

    $empty = surveyFromBody(body([], ['steps' => []]));
    assert_same(['Add at least one question.'], surveyProblems(['id' => 'x', 'title' => 'T', 'slug' => 'fine', 'content' => $empty['content']], []));
});
