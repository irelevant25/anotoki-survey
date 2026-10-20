<?php

// A survey's life through the real server: an editor writes it, opens it;
// people take it - once each, only while it is open; the results show who
// answered what; an administrator deletes. Pictures go up, come back, and go
// when nothing shows them. A survey is written in one language and may hold
// its texts in others: what goes in, what comes out, and to whom.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const OWNER = 1; // ADMIN
const EDITH = 2; // EDITOR
const PAT = 101; // takes surveys
const QUINN = 102; // takes surveys
const LOOKER = 103; // takes surveys, only ever looks

$GLOBALS['app'] = null;
before(function (): void {
    $GLOBALS['app'] = start_app();
});

function roles_of(int $user): array
{
    return match ($user) {
        OWNER => ['ADMIN'],
        EDITH => ['EDITOR'],
        default => [],
    };
}

function as_user(int $user, string $method, string $url, mixed $body = null, array $headers = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, array_merge($headers, bearer(test_token($user, roles_of($user)))));
}

function anonymous(string $method, string $url, mixed $body = null): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body);
}

/** A survey as the editor makes it (newSurvey() in survey-factory.ts), with two questions and "About you": in English, translated into nothing. */
function draft(array $fields = []): array
{
    return $fields + [
        'id' => 'ignored',
        'slug' => 'genshin-1-0',
        'title' => 'Genshin 1.0',
        'status' => 'open',
        'intro' => '<p>Thank you for taking a few minutes.</p>',
        'thanks' => '<p>Thank you!</p>',
        'askAboutYou' => true,
        'closesOn' => null,
        'language' => 'en',
        'translations' => new stdClass(),
        'steps' => [
            [
                'id' => 'step-1',
                'title' => 'The patch',
                'questions' => [
                    [
                        'id' => 'q-element',
                        'type' => 'single',
                        'text' => '<p>Your favourite element?</p>',
                        'images' => [],
                        'required' => true,
                        'options' => [
                            ['id' => 'o-anemo', 'label' => 'Anemo', 'other' => false, 'images' => []],
                            ['id' => 'o-geo', 'label' => 'Geo', 'other' => false, 'images' => []],
                            ['id' => 'o-other', 'label' => 'Another one', 'other' => true, 'images' => []],
                        ],
                        'layout' => 'list',
                        'minChoices' => null,
                        'maxChoices' => null,
                        'multiline' => true,
                        'maxLength' => null,
                        'placeholder' => '',
                    ],
                    [
                        'id' => 'q-words',
                        'type' => 'text',
                        'text' => '<p>Anything else?</p>',
                        'images' => [],
                        'required' => false,
                        'options' => [],
                        'layout' => 'list',
                        'minChoices' => null,
                        'maxChoices' => null,
                        'multiline' => true,
                        'maxLength' => 200,
                        'placeholder' => '',
                    ],
                ],
            ],
        ],
    ];
}

/** draft()'s texts in Slovak, none left to translate - as the editor sends them: every map an object. */
function slovak(array $fields = []): array
{
    return $fields + [
        'title' => 'Genshin 1.0',
        'intro' => '<p>Ďakujeme, že ste si našli pár minút.</p>',
        'thanks' => '<p>Ďakujeme!</p>',
        'steps' => ['step-1' => ['title' => 'Záplata']],
        'questions' => [
            'q-element' => [
                'text' => '<p>Váš obľúbený živel?</p>',
                'placeholder' => '',
                'options' => ['o-anemo' => ['label' => 'Anemo'], 'o-geo' => ['label' => 'Geo'], 'o-other' => ['label' => 'Iný']],
                'images' => new stdClass(),
            ],
            'q-words' => ['text' => '<p>Ešte niečo?</p>', 'placeholder' => '', 'options' => new stdClass(), 'images' => new stdClass()],
        ],
    ];
}

/** slovak() as it comes back, decoded: an empty map is an empty array to PHP - and a step's entry whole, with its own text and pictures. */
function slovak_kept(array $fields = []): array
{
    $kept = slovak($fields);
    foreach ($kept['steps'] as &$step) {
        $step += ['text' => '', 'images' => []];
    }
    unset($step);
    foreach ($kept['questions'] as &$question) {
        $question['options'] = (array) $question['options'];
        $question['images'] = (array) $question['images'];
    }

    return $kept;
}

/** The smallest PNG there is: one pixel. */
function png(): string
{
    return (string) base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
}

test('who may do what: people read, editors write, only an administrator deletes', function (): void {
    assert_same(401, anonymous('GET', '/api/surveys')['status'], 'nobody signed in sees anything of a survey: not the list');
    assert_same(401, anonymous('GET', '/api/surveys/genshin-1-0')['status'], 'nor one survey');
    assert_same(200, as_user(PAT, 'GET', '/api/surveys')['status'], 'anybody signed in sees the open surveys');
    assert_same(401, anonymous('GET', '/api/admin/surveys')['status']);
    $refused = as_user(PAT, 'GET', '/api/admin/surveys');
    assert_same(403, $refused['status'], 'a person with no role of this site');
    assert_match('/editor role/', $refused['body']['error']);
    assert_same(200, as_user(EDITH, 'GET', '/api/admin/surveys')['status']);
    assert_same(200, as_user(OWNER, 'GET', '/api/admin/surveys')['status']);

    $made = as_user(EDITH, 'POST', '/api/admin/surveys', ['survey' => draft(['slug' => 'to-delete'])]);
    assert_same(201, $made['status'], test_show($made['body']));
    $id = $made['body']['survey']['id'];
    $denied = as_user(EDITH, 'DELETE', "/api/admin/surveys/$id");
    assert_same(403, $denied['status'], 'an editor does not delete');
    assert_match('/Only an administrator/', $denied['body']['error']);
    assert_same(204, as_user(OWNER, 'DELETE', "/api/admin/surveys/$id")['status']);
    assert_same(404, as_user(OWNER, 'GET', "/api/admin/surveys/$id")['status']);
    assert_same(404, as_user(OWNER, 'GET', '/api/admin/surveys/not-a-uuid')['status']);
});

test('an editor writes a draft: it is a draft whatever it says, and nobody else sees it', function (): void {
    $made = as_user(EDITH, 'POST', '/api/admin/surveys', ['survey' => draft()]);
    assert_same(201, $made['status']);
    $survey = $made['body']['survey'];
    assert_same('draft', $survey['status'], 'the status is not the editor\'s to send');
    assert_true(isUuid($survey['id']));
    assert_same(1, $survey['revision']);
    assert_same(
        ['id', 'slug', 'title', 'intro', 'thanks', 'askAboutYou', 'status', 'closesOn', 'steps', 'language', 'translations', 'createdAt', 'updatedAt', 'openedAt', 'closedAt', 'revision'],
        array_keys($survey),
    );
    assert_same(['en', []], [$survey['language'], $survey['translations']]);
    assert_same('q-element', $survey['steps'][0]['questions'][0]['id'], 'the editor\'s own ids are kept');
    assert_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/', $survey['createdAt']);

    assert_same(404, as_user(LOOKER, 'GET', '/api/surveys/genshin-1-0')['status'], 'a draft is nobody\'s to take');
    assert_same([], as_user(LOOKER, 'GET', '/api/surveys')['body']['surveys']);

    $list = as_user(EDITH, 'GET', '/api/admin/surveys')['body']['surveys'];
    $mine = array_values(array_filter($list, static fn(array $row): bool => $row['id'] === $survey['id']))[0];
    assert_same(['steps' => 1, 'questions' => 2, 'responses' => 0], ['steps' => $mine['steps'], 'questions' => $mine['questions'], 'responses' => $mine['responses']]);
    $GLOBALS['survey'] = $survey;
});

test('saving: each save made to the version it was made to - never over somebody else\'s', function (): void {
    $survey = $GLOBALS['survey'];
    $id = $survey['id'];

    $saved = as_user(EDITH, 'PUT', "/api/admin/surveys/$id", ['revision' => 1, 'survey' => ['title' => 'Genshin 1.0 - what next?', 'intro' => '<p onclick="x()">Hi<script>1</script></p>'] + $survey]);
    assert_same(200, $saved['status'], test_show($saved['body']));
    assert_same(2, $saved['body']['survey']['revision']);
    assert_same('<p>Hi</p>', $saved['body']['survey']['intro'], 'the text is cleaned');

    $stale = as_user(OWNER, 'PUT', "/api/admin/surveys/$id", ['revision' => 1, 'survey' => ['title' => 'Mine!'] + $survey]);
    assert_same(409, $stale['status'], 'made to revision 1, when 2 is there');
    assert_same('conflict', $stale['body']['code']);
    assert_same('Genshin 1.0 - what next?', $stale['body']['survey']['title'], 'with the version that is there now');
    assert_same(422, as_user(EDITH, 'PUT', "/api/admin/surveys/$id", ['survey' => $survey])['status'], 'no revision: refused');
    assert_same(422, as_user(EDITH, 'PUT', "/api/admin/surveys/$id", ['revision' => 2, 'survey' => ['steps' => 'x'] + $survey])['status']);
    assert_same(2, (int) dbValue('SELECT revision FROM surveys WHERE id = ?', [$id]), 'nothing refused was kept');
    $GLOBALS['survey'] = $saved['body']['survey'];
});

test('opening: refused while there is something to fix; a live address is its own', function (): void {
    $survey = $GLOBALS['survey'];
    $id = $survey['id'];

    // A draft with a problem: an option with no label.
    $broken = $survey;
    $broken['steps'][0]['questions'][0]['options'][1]['label'] = ' ';
    $broken = as_user(EDITH, 'PUT', "/api/admin/surveys/$id", ['revision' => $survey['revision'], 'survey' => $broken])['body']['survey'];
    $refused = as_user(EDITH, 'POST', "/api/admin/surveys/$id/status", ['status' => 'open']);
    assert_same(422, $refused['status']);
    assert_same('survey_problems', $refused['body']['code']);
    assert_same(['Question 1 has an option with no label.'], $refused['body']['problems']);

    $fixed = as_user(EDITH, 'PUT', "/api/admin/surveys/$id", ['revision' => $broken['revision'], 'survey' => $survey])['body']['survey'];
    $opened = as_user(EDITH, 'POST', "/api/admin/surveys/$id/status", ['status' => 'open']);
    assert_same(200, $opened['status'], test_show($opened['body']));
    assert_same('open', $opened['body']['survey']['status']);
    assert_true($opened['body']['survey']['openedAt'] !== null);
    assert_same($fixed['revision'] + 1, $opened['body']['survey']['revision'], 'a status change is a new revision');
    $stale = as_user(OWNER, 'PUT', "/api/admin/surveys/$id", ['revision' => $fixed['revision'], 'survey' => $fixed]);
    assert_same('conflict', $stale['body']['code'] ?? null, 'so an editor still holding the one before is told, rather than saving an old closing day back');
    $opened = $opened['body']['survey'];

    // Another survey may not take the address while this one lives there.
    $twin = as_user(EDITH, 'POST', '/api/admin/surveys', ['survey' => draft()])['body']['survey'];
    assert_same(['Another survey already lives at "genshin-1-0".'], as_user(EDITH, 'POST', "/api/admin/surveys/{$twin['id']}/status", ['status' => 'open'])['body']['problems']);
    // And this one keeps an address people can reach it at.
    $bad = as_user(EDITH, 'PUT', "/api/admin/surveys/$id", ['revision' => $opened['revision'], 'survey' => ['slug' => 'admin'] + $opened]);
    assert_same(422, $bad['status']);
    assert_match('/belongs to the site itself/', $bad['body']['error']);
    as_user(OWNER, 'DELETE', "/api/admin/surveys/{$twin['id']}");
    $GLOBALS['survey'] = $opened;
});

test('taking it: people signed in look, and answer - once', function (): void {
    $survey = $GLOBALS['survey'];

    $look = as_user(LOOKER, 'GET', '/api/surveys/genshin-1-0');
    assert_same(200, $look['status']);
    assert_same(null, $look['body']['answeredAt']);
    assert_same($survey['id'], as_user(LOOKER, 'GET', '/api/surveys')['body']['surveys'][0]['survey']['id']);

    $answers = [
        'aboutYou' => ['gender' => 'female', 'age' => '25-34'],
        'answers' => ['q-element' => ['optionIds' => ['o-other', 'gone'], 'other' => '  Hydro ', 'text' => 'ignored'], 'unknown-question' => ['text' => 'x']],
        'startedAt' => gmdate('Y-m-d\TH:i:s', time() - 90) . '.000Z',
    ];
    assert_same(401, anonymous('POST', '/api/surveys/genshin-1-0/responses', $answers)['status']);

    $missing = as_user(PAT, 'POST', '/api/surveys/genshin-1-0/responses', ['answers' => []] + $answers);
    assert_same(422, $missing['status']);
    assert_same(['invalid_answer', 'q-element'], [$missing['body']['code'], $missing['body']['questionId']]);
    assert_same('Question 1: Please choose an answer.', $missing['body']['error']);
    $noAge = as_user(PAT, 'POST', '/api/surveys/genshin-1-0/responses', ['aboutYou' => ['gender' => 'female', 'age' => '99']] + $answers);
    assert_same('about-age', $noAge['body']['questionId'] ?? null);
    $long = as_user(PAT, 'POST', '/api/surveys/genshin-1-0/responses', ['answers' => ['q-element' => ['optionIds' => ['o-anemo']], 'q-words' => ['text' => str_repeat('x', 201)]]] + $answers);
    assert_same('Question 2: Please keep it under 200 characters.', $long['body']['error']);

    $sent = as_user(PAT, 'POST', '/api/surveys/genshin-1-0/responses', $answers);
    assert_same(201, $sent['status'], test_show($sent['body']));
    assert_true(isUuid($sent['body']['id']));
    $kept = dbOne('SELECT gender, age, answers::text AS answers FROM responses WHERE id = ?', [$sent['body']['id']]);
    assert_same(['gender' => 'female', 'age' => '25-34'], ['gender' => $kept['gender'], 'age' => $kept['age']]);
    assert_same(['q-element' => ['text' => '', 'other' => 'Hydro', 'optionIds' => ['o-other']]], json_decode($kept['answers'], true), 'kept as cleanAnswer keeps it');

    $again = as_user(PAT, 'POST', '/api/surveys/genshin-1-0/responses', $answers);
    assert_same(409, $again['status']);
    assert_same('already_answered', $again['body']['code']);
    assert_same($sent['body']['submittedAt'], as_user(PAT, 'GET', '/api/surveys/genshin-1-0')['body']['answeredAt']);
    assert_same(null, as_user(QUINN, 'GET', '/api/surveys/genshin-1-0')['body']['answeredAt'], 'somebody else has not');

    // A soft line break pasted from a word processor: dropped, not a reason to refuse the answers forever.
    $quinn = as_user(QUINN, 'POST', '/api/surveys/genshin-1-0/responses', [
        'aboutYou' => ['gender' => 'undisclosed', 'age' => 'undisclosed'],
        'answers' => ['q-element' => ['optionIds' => ['o-geo']], 'q-words' => ['text' => " More\x0B Geo! "]],
        'startedAt' => '2999-01-01T00:00:00.000Z',
    ]);
    assert_same(201, $quinn['status'], test_show($quinn['body']));
    assert_true(strtotime((string) dbValue('SELECT started_at FROM responses WHERE id = ?', [$quinn['body']['id']])) <= time(), 'a start in the future is taken as now');

    // An address that is not one - not even UTF-8 - is no survey, not a database error.
    assert_same(404, as_user(LOOKER, 'GET', '/api/surveys/%FF')['status']);
    assert_same(404, as_user(QUINN, 'POST', '/api/surveys/%C3/responses', $answers)['status']);
    assert_same(404, as_user(LOOKER, 'GET', '/api/surveys/Not%20a%20slug')['status']);
});

test('the results: every filled survey with who filled it; an administrator can delete one', function (): void {
    $id = $GLOBALS['survey']['id'];
    assert_same(403, as_user(PAT, 'GET', "/api/admin/surveys/$id/responses")['status']);
    $responses = as_user(EDITH, 'GET', "/api/admin/surveys/$id/responses")['body']['responses'];
    assert_same(2, count($responses));
    $quinn = $responses[0];
    assert_same(['id' => (string) QUINN, 'name' => 'user' . QUINN, 'visitor' => false], $quinn['person'], 'newest first, named from the token - and no address: the IAM keeps those, this site none');
    assert_same(['gender' => 'undisclosed', 'age' => 'undisclosed'], $quinn['aboutYou']);
    assert_json_same(['q-element' => ['text' => '', 'other' => '', 'optionIds' => ['o-geo']], 'q-words' => ['text' => 'More Geo!', 'other' => '', 'optionIds' => []]], $quinn['answers']);
    assert_same($id, $quinn['surveyId']);

    assert_same(403, as_user(EDITH, 'DELETE', "/api/admin/responses/{$quinn['id']}")['status']);
    assert_same(204, as_user(OWNER, 'DELETE', "/api/admin/responses/{$quinn['id']}")['status']);
    assert_same(404, as_user(OWNER, 'DELETE', "/api/admin/responses/{$quinn['id']}")['status']);
    assert_same(null, as_user(QUINN, 'GET', '/api/surveys/genshin-1-0')['body']['answeredAt'], 'deleted: Quinn may take it again');
});

test('closing: the answers stay, new ones do not come in; a closed survey still shows its page', function (): void {
    $id = $GLOBALS['survey']['id'];
    $closed = as_user(EDITH, 'POST', "/api/admin/surveys/$id/status", ['status' => 'closed']);
    assert_same('closed', $closed['body']['survey']['status']);
    assert_true($closed['body']['survey']['closedAt'] !== null);
    $late = as_user(QUINN, 'POST', '/api/surveys/genshin-1-0/responses', ['aboutYou' => ['gender' => 'male', 'age' => '18-24'], 'answers' => ['q-element' => ['optionIds' => ['o-geo']]]]);
    assert_same(409, $late['status']);
    assert_same('not_open', $late['body']['code']);
    assert_same('closed', as_user(LOOKER, 'GET', '/api/surveys/genshin-1-0')['body']['survey']['status']);
    assert_same([], as_user(LOOKER, 'GET', '/api/surveys')['body']['surveys']);

    // Reopened with a last day long gone: closed to answers all the same.
    $reopened = as_user(EDITH, 'POST', "/api/admin/surveys/$id/status", ['status' => 'open', 'closesOn' => '2020-01-01']);
    assert_same(['open', '2020-01-01', null], [$reopened['body']['survey']['status'], $reopened['body']['survey']['closesOn'], $reopened['body']['survey']['closedAt']]);
    assert_same('not_open', as_user(QUINN, 'POST', '/api/surveys/genshin-1-0/responses', ['answers' => []])['body']['code']);
    // With the day dropped, as the editor reopens it: open again.
    as_user(EDITH, 'POST', "/api/admin/surveys/$id/status", ['status' => 'open', 'closesOn' => null]);
    assert_same(1, count(as_user(LOOKER, 'GET', '/api/surveys')['body']['surveys']));
    assert_same(
        409,
        as_user(EDITH, 'POST', '/api/admin/surveys/' . as_user(EDITH, 'POST', '/api/admin/surveys', ['survey' => draft(['slug' => 'x'])])['body']['survey']['id'] . '/status', ['status' => 'closed'])[
            'status'
        ],
        'a draft cannot close',
    );
});

test('pictures: up as bytes, checked by what they are, served for good, cleared when nothing shows them', function (): void {
    $upload = as_user(EDITH, 'POST', '/api/admin/images', png(), ['Content-Type: image/png']);
    assert_same(201, $upload['status'], test_show($upload['body']));
    $image = $upload['body']['image'];
    assert_same(['id', 'alt', 'width', 'height', 'src'], array_keys($image));
    assert_same([1, 1, '/api/images/' . $image['id'] . '.png'], [$image['width'], $image['height'], $image['src']]);

    $served = anonymous('GET', $image['src']);
    assert_same(200, $served['status']);
    assert_same(png(), $served['raw']);
    assert_same('image/png', $served['headers']['content-type'] ?? null);
    assert_same('public, max-age=31536000, immutable', $served['headers']['cache-control'] ?? null);
    assert_match('/sandbox/', $served['headers']['content-security-policy'] ?? '');
    assert_same(304, call($GLOBALS['app']['base'], 'GET', $image['src'], null, ['If-None-Match: "' . $image['id'] . '"'])['status']);

    // Refused: what is not a picture, whatever it is called - an SVG above all.
    $svg = as_user(EDITH, 'POST', '/api/admin/images', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', ['Content-Type: image/png']);
    assert_same(415, $svg['status']);
    assert_same(415, as_user(EDITH, 'POST', '/api/admin/images', png(), ['Content-Type: application/json'])['status']);
    assert_same(403, as_user(PAT, 'POST', '/api/admin/images', png(), ['Content-Type: image/png'])['status']);

    // In a survey: the size and address come from the file, whatever the editor says.
    $survey = as_user(EDITH, 'POST', '/api/admin/surveys', ['survey' => draft(['slug' => 'with-pictures'])])['body']['survey'];
    $withPicture = $survey;
    $withPicture['steps'][0]['questions'][0]['images'] = [['id' => $image['id'], 'alt' => 'One pixel', 'width' => 9999, 'height' => 9999, 'src' => 'https://evil.example/x.png']];
    $saved = as_user(EDITH, 'PUT', "/api/admin/surveys/{$survey['id']}", ['revision' => 1, 'survey' => $withPicture]);
    assert_same(200, $saved['status'], test_show($saved['body']));
    assert_json_same(['id' => $image['id'], 'alt' => 'One pixel', 'width' => 1, 'height' => 1, 'src' => $image['src']], $saved['body']['survey']['steps'][0]['questions'][0]['images'][0]);
    $unknown = $withPicture;
    $unknown['steps'][0]['questions'][0]['images'][0]['id'] = newUuid();
    assert_same('unknown_image', as_user(EDITH, 'PUT', "/api/admin/surveys/{$survey['id']}", ['revision' => 2, 'survey' => $unknown])['body']['code']);

    // An old picture nothing shows goes with the next save; a new one waits a day.
    $orphan = as_user(EDITH, 'POST', '/api/admin/images', png(), ['Content-Type: image/png'])['body']['image'];
    dbExec("UPDATE images SET created_at = now() - interval '2 days'");
    as_user(EDITH, 'PUT', "/api/admin/surveys/{$survey['id']}", ['revision' => 2, 'survey' => $withPicture]);
    assert_same(404, anonymous('GET', $orphan['src'])['status'], 'nothing showed it');
    assert_same(200, anonymous('GET', $image['src'])['status'], 'the survey still shows this one');
    as_user(OWNER, 'DELETE', "/api/admin/surveys/{$survey['id']}");
    assert_same(404, anonymous('GET', $image['src'])['status'], 'the survey is gone, and with it the picture');
});

test('a survey says its language and holds its translations: neither is guessed, and no language is dropped', function (): void {
    // What a page from before surveys had languages sends: refused, not filled in - or its next save would delete every translation.
    $old = draft(['slug' => 'two-languages']);
    unset($old['language'], $old['translations']);
    // Its person is who reads the refusal: what is wrong with the body, and then what they can do about it.
    $outdated = ' A page that was open before the site was updated can no longer save: copy what you changed since the last save, then reload the page.';
    $refused = as_user(EDITH, 'POST', '/api/admin/surveys', ['survey' => $old]);
    assert_same([422, 'invalid_survey', 'Say which language the survey is written in (language).' . $outdated], [$refused['status'], $refused['body']['code'], $refused['body']['error']]);
    $refused = as_user(EDITH, 'POST', '/api/admin/surveys', ['survey' => $old + ['language' => 'en']]);
    assert_same([422, 'invalid_survey', 'Send the translations, or an empty object (translations).' . $outdated], [$refused['status'], $refused['body']['code'], $refused['body']['error']]);

    $refused = as_user(EDITH, 'POST', '/api/admin/surveys', ['survey' => draft(['slug' => 'two-languages', 'language' => 'xx'])]);
    assert_same([422, 'invalid_survey'], [$refused['status'], $refused['body']['code']], 'written in a language the site does not have');
    $refused = as_user(EDITH, 'POST', '/api/admin/surveys', ['survey' => draft(['slug' => 'two-languages', 'translations' => ['sk' => slovak(), 'fr' => slovak()]])]);
    assert_same(422, $refused['status'], 'translated into a language the site does not have: refused, never dropped');
    assert_match('/does not have \("fr"\)/', $refused['body']['error']);
    $refused = as_user(EDITH, 'POST', '/api/admin/surveys', ['survey' => draft(['slug' => 'two-languages', 'translations' => ['en' => slovak()]])]);
    assert_match('/written in English, so it cannot be translated into it/', $refused['body']['error'] ?? '');
    assert_same(0, (int) dbValue("SELECT count(*) FROM surveys WHERE slug = 'two-languages'"), 'nothing refused was kept');

    // No translations: an object all the same, in the answer and in the database.
    $made = as_user(EDITH, 'POST', '/api/admin/surveys', ['survey' => draft(['slug' => 'two-languages'])]);
    assert_same(201, $made['status'], test_show($made['body']));
    assert_true(str_contains($made['raw'], '"language":"en","translations":{},'), $made['raw']);
    $id = $made['body']['survey']['id'];
    assert_same('object', dbValue("SELECT jsonb_typeof(content->'translations') FROM surveys WHERE id = ?", [$id]));

    // A translation with nothing in it yet, and a question with no options or pictures in it: objects at every level.
    $saved = as_user(EDITH, 'PUT', "/api/admin/surveys/$id", ['revision' => 1, 'survey' => ['translations' => ['sk' => ['questions' => ['q-words' => new stdClass()]]]] + $made['body']['survey']]);
    assert_same(200, $saved['status'], test_show($saved['body']));
    $whole = '"translations":{"sk":{"title":"","intro":"","thanks":"","steps":{},"questions":{"q-words":{"text":"","placeholder":"","options":{},"images":{}}}}}';
    assert_true(str_contains($saved['raw'], $whole), $saved['raw']);
    assert_true(str_contains(as_user(EDITH, 'GET', "/api/admin/surveys/$id")['raw'], $whole), 'and when it is read again');
    assert_same(
        ['object', 'object', 'object', 'object', 'object'],
        array_values(
            dbOne(
                "SELECT jsonb_typeof(content->'translations') AS a, jsonb_typeof(content#>'{translations,sk,steps}') AS b, jsonb_typeof(content#>'{translations,sk,questions}') AS c,
                    jsonb_typeof(content#>'{translations,sk,questions,q-words,options}') AS d, jsonb_typeof(content#>'{translations,sk,questions,q-words,images}') AS e
               FROM surveys WHERE id = ?",
                [$id],
            ),
        ),
        'and in the database, all five levels',
    );

    // The whole translation - with words for things the survey does not have, which are dropped, and markup, which is cleaned.
    $sent = slovak(['intro' => '<p onclick="x()">Ďakujeme<script>1</script></p>']);
    $sent['steps']['gone'] = ['title' => 'Nikde'];
    $sent['questions']['gone'] = ['text' => '<p>Nikde</p>'];
    $sent['questions']['q-element']['options']['gone'] = ['label' => 'Nikde'];
    $sent['questions']['q-element']['images'] = [newUuid() => ['alt' => 'Nikde']];
    $saved = as_user(EDITH, 'PUT', "/api/admin/surveys/$id", ['revision' => 2, 'survey' => ['translations' => ['sk' => $sent]] + $made['body']['survey']]);
    assert_same(200, $saved['status'], test_show($saved['body']));
    assert_json_same(['sk' => slovak_kept(['intro' => '<p>Ďakujeme</p>'])], $saved['body']['survey']['translations']);
    assert_true(str_contains($saved['raw'], '"options":{}') && str_contains($saved['raw'], '"images":{}'), $saved['raw']);

    // Somebody else's save in between: the version that is there comes back with its maps as objects too.
    $stale = as_user(OWNER, 'PUT', "/api/admin/surveys/$id", ['revision' => 2, 'survey' => $made['body']['survey']]);
    assert_same([409, 'conflict'], [$stale['status'], $stale['body']['code']]);
    assert_same('<p>Ďakujeme</p>', $stale['body']['survey']['translations']['sk']['intro']);
    assert_true(str_contains($stale['raw'], '"options":{}') && str_contains($stale['raw'], '"images":{}'), $stale['raw']);
    assert_same(3, (int) dbValue('SELECT revision FROM surveys WHERE id = ?', [$id]));
    $GLOBALS['translated'] = $saved['body']['survey'];
});

test('steps, questions and options called "0" and "1" keep their translations: a map by id, never a list', function (): void {
    $numbered = draft([
        'slug' => 'numbered',
        'steps' => [
            [
                'id' => '0',
                'title' => 'One',
                'questions' => [
                    [
                        'id' => '0',
                        'type' => 'single',
                        'text' => '<p>Yes or no?</p>',
                        'images' => [],
                        'required' => true,
                        'options' => [['id' => '0', 'label' => 'Yes', 'other' => false, 'images' => []], ['id' => '1', 'label' => 'No', 'other' => false, 'images' => []]],
                        'layout' => 'list',
                        'minChoices' => null,
                        'maxChoices' => null,
                        'multiline' => true,
                        'maxLength' => null,
                        'placeholder' => '',
                    ],
                    [
                        'id' => '1',
                        'type' => 'text',
                        'text' => '<p>Why?</p>',
                        'images' => [],
                        'required' => false,
                        'options' => [],
                        'layout' => 'list',
                        'minChoices' => null,
                        'maxChoices' => null,
                        'multiline' => true,
                        'maxLength' => null,
                        'placeholder' => '',
                    ],
                ],
            ],
        ],
        // As a browser writes them: objects whose keys are "0" and "1".
        'translations' => [
            'sk' => [
                'title' => 'Genshin 1.0',
                'steps' => (object) ['0' => ['title' => 'Jeden']],
                'questions' => (object) [
                    '0' => ['text' => '<p>Áno alebo nie?</p>', 'options' => (object) ['0' => ['label' => 'Áno'], '1' => ['label' => 'Nie']]],
                    '1' => ['text' => '<p>Prečo?</p>'],
                ],
            ],
        ],
    ]);
    $made = as_user(EDITH, 'POST', '/api/admin/surveys', ['survey' => $numbered]);
    assert_same(201, $made['status'], test_show($made['body']));
    $kept =
        '"translations":{"sk":{"title":"Genshin 1.0","intro":"","thanks":"","steps":{"0":{"title":"Jeden","text":"","images":{}}},"questions":{' .
        '"0":{"text":"<p>Áno alebo nie?</p>","placeholder":"","options":{"0":{"label":"Áno"},"1":{"label":"Nie"}},"images":{}},' .
        '"1":{"text":"<p>Prečo?</p>","placeholder":"","options":{},"images":{}}}}}';
    assert_true(str_contains($made['raw'], $kept), $made['raw']);

    // Saved again exactly as it came - what the editor does with every change - it is still the same.
    $survey = json_decode($made['raw'])->survey;
    $again = as_user(EDITH, 'PUT', "/api/admin/surveys/{$survey->id}", ['revision' => 1, 'survey' => $survey]);
    assert_same(200, $again['status'], test_show($again['body']));
    assert_true(str_contains($again['raw'], $kept), $again['raw']);
    assert_same(204, as_user(OWNER, 'DELETE', "/api/admin/surveys/{$survey->id}")['status']);
});

test('the language a survey is written in does not change while a translation is kept across the change', function (): void {
    $survey = $GLOBALS['translated'];
    $id = $survey['id'];
    $german = as_user(OWNER, 'POST', '/api/admin/languages', ['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch']);
    assert_same(201, $german['status'], test_show($german['body']));
    $put = static fn(array $fields, int $revision): array => as_user(EDITH, 'PUT', "/api/admin/surveys/$id", ['revision' => $revision, 'survey' => $fields + $survey]);
    // What the database holds: [revision, language, the languages it is translated into].
    $kept = static function () use ($id): array {
        $row = dbOne(
            "SELECT revision, content->>'language' AS language, (SELECT string_agg(code, ',' ORDER BY code) FROM jsonb_object_keys(content->'translations') AS code) AS translations FROM surveys WHERE id = ?",
            [$id],
        );

        return [(int) $row['revision'], $row['language'], $row['translations']];
    };

    // Translated into Slovak, and a translation stays in the save: the texts would swap meaning under whoever
    // is translating. Its own Slovak kept, or another translation in its place - it stays written in English.
    foreach ([['language' => 'de'], ['language' => 'sk', 'translations' => ['de' => slovak()]], ['language' => 'de', 'translations' => ['sk' => slovak(), 'en' => slovak()]]] as $fields) {
        $refused = $put($fields, 3);
        assert_same([422, 'invalid_survey'], [$refused['status'], $refused['body']['code']], test_show(array_keys($fields)));
        assert_match('/only while it has no translations/', $refused['body']['error']);
    }
    assert_same([3, 'en', 'sk'], $kept(), 'nothing of it was kept');

    // The translations removed and the language changed in one save: taken. Whoever sent it saw what they
    // removed (the revision says so), and it is what two saves would do - refused, an editor whose save of
    // the removal failed could never save again.
    $changed = $put(['language' => 'de', 'translations' => new stdClass()], 3);
    assert_same([200, 'de', []], [$changed['status'], $changed['body']['survey']['language'] ?? null, $changed['body']['survey']['translations'] ?? null], test_show($changed['body']));
    assert_same([4, 'de', null], $kept());

    // And a first translation that arrives with the new language, into a survey that has none.
    $back = $put([], 4);
    assert_same([200, 'en', ['sk']], [$back['status'], $back['body']['survey']['language'], array_keys($back['body']['survey']['translations'])], test_show($back['body']));
    assert_same([5, 'en', 'sk'], $kept());
    $GLOBALS['translated'] = $back['body']['survey'];
});

test('a translation people are offered must be whole before the survey opens; they are sent only the languages they are offered', function (): void {
    $survey = $GLOBALS['translated'];
    $id = $survey['id'];
    $open = static fn(): array => as_user(EDITH, 'POST', "/api/admin/surveys/$id/status", ['status' => 'open']);

    // Slovak with two holes, German with nothing in it yet.
    $holes = slovak(['title' => ' ']);
    unset($holes['questions']['q-element']['options']['o-other']);
    $saved = as_user(EDITH, 'PUT', "/api/admin/surveys/$id", ['revision' => $survey['revision'], 'survey' => ['translations' => ['sk' => $holes, 'de' => new stdClass()]] + $survey]);
    assert_same(200, $saved['status'], test_show($saved['body']));
    $refused = $open();
    assert_same([422, 'survey_problems'], [$refused['status'], $refused['body']['code']]);
    assert_same(
        [
            'Slovak: the title is missing.',
            'Slovak: question 1 has 1 text to translate.',
            'German: the title is missing.',
            'German: the welcome text is missing.',
            'German: the thank-you text is missing.',
            'German: the title of step 2 is missing.',
            'German: question 1 has 4 texts to translate.',
            'German: question 2 has 1 text to translate.',
        ],
        $refused['body']['problems'],
        'in the languages\' order, each in the order of the document',
    );

    // A hidden language may be as unfinished as it likes: nobody is offered it.
    assert_same(200, as_user(OWNER, 'PUT', '/api/admin/languages/de', ['enabled' => false])['status']);
    assert_same(['Slovak: the title is missing.', 'Slovak: question 1 has 1 text to translate.'], $open()['body']['problems'] ?? null);
    $saved = as_user(EDITH, 'PUT', "/api/admin/surveys/$id", [
        'revision' => $saved['body']['survey']['revision'],
        'survey' => ['translations' => ['sk' => slovak(), 'de' => new stdClass()]] + $survey,
    ]);
    assert_same(200, $saved['status'], test_show($saved['body']));
    $opened = $open();
    assert_same([200, 'open'], [$opened['status'], $opened['body']['survey']['status'] ?? null], test_show($opened['body']));

    // The editor has every language; the people taking it, the ones they are offered.
    $languages = array_keys($opened['body']['survey']['translations']);
    sort($languages);
    assert_same(['de', 'sk'], $languages);
    $taken = as_user(LOOKER, 'GET', '/api/surveys/two-languages');
    assert_same([200, 'en', ['sk']], [$taken['status'], $taken['body']['survey']['language'], array_keys($taken['body']['survey']['translations'])]);
    assert_json_same(slovak_kept(), $taken['body']['survey']['translations']['sk']);
    assert_true(str_contains($taken['raw'], '"options":{}') && str_contains($taken['raw'], '"images":{}'), $taken['raw']);
    assert_false(str_contains($taken['raw'], '"de"'), 'not a word of the hidden one');
    $listed = as_user(PAT, 'GET', '/api/surveys');
    $mine = array_values(array_filter($listed['body']['surveys'], static fn(array $item): bool => $item['survey']['id'] === $id))[0];
    assert_same(['sk'], array_keys($mine['survey']['translations']), 'in the list of open surveys too');
    assert_true(str_contains($listed['raw'], '"translations":{}'), 'and a survey with none has an object there');

    // Hidden Slovak: the survey goes out in its own language alone - and stays open.
    assert_same(200, as_user(OWNER, 'PUT', '/api/admin/languages/sk', ['enabled' => false])['status']);
    $taken = as_user(LOOKER, 'GET', '/api/surveys/two-languages');
    assert_same(['open', []], [$taken['body']['survey']['status'], $taken['body']['survey']['translations']]);
    assert_true(str_contains($taken['raw'], '"translations":{}'), $taken['raw']);
    assert_same(200, as_user(OWNER, 'PUT', '/api/admin/languages/sk', ['enabled' => true])['status']);
});

test('answers say which language the survey was read in - when it is one of the survey\'s; never a reason to refuse them', function (): void {
    $id = $GLOBALS['translated']['id'];
    // A language the site has and this survey does not.
    assert_same(201, as_user(OWNER, 'POST', '/api/admin/languages', ['code' => 'fr', 'name' => 'French', 'native_name' => 'Français'])['status']);
    $send = static fn(int $user, array $more): array => as_user(
        $user,
        'POST',
        '/api/surveys/two-languages/responses',
        $more + [
            'aboutYou' => ['gender' => 'undisclosed', 'age' => 'undisclosed'],
            'answers' => ['q-element' => ['optionIds' => ['o-geo']]],
        ],
    );

    $cases = [
        201 => ['language' => 'en'], // the language the survey is written in
        202 => ['language' => 'sk'], // one it is translated into
        203 => ['language' => 'de'], // and another, though hidden now: it was one of the survey's
        204 => ['language' => ['sk']], // not text
        205 => ['language' => str_repeat('s', 300)], // not a code
        206 => ['language' => 'xx'], // no language of the site
        207 => ['language' => 'fr'], // a language the survey does not have
        208 => [], // none said (a page from before)
        209 => ['language' => 'SK'], // a code is small letters
    ];
    $expected = [201 => 'en', 202 => 'sk', 203 => 'de', 204 => null, 205 => null, 206 => null, 207 => null, 208 => null, 209 => null];
    foreach ($cases as $user => $more) {
        $sent = $send($user, $more);
        assert_same(201, $sent['status'], "user $user: " . test_show($sent['body']));
        assert_same($expected[$user], dbValue('SELECT language FROM responses WHERE id = ?', [$sent['body']['id']]), "user $user");
    }

    // The results say it, person by person.
    $responses = as_user(EDITH, 'GET', "/api/admin/surveys/$id/responses")['body']['responses'];
    assert_same(['id', 'surveyId', 'person', 'aboutYou', 'answers', 'language', 'startedAt', 'submittedAt'], array_keys($responses[0]));
    $read = [];
    foreach ($responses as $response) {
        $read[(int) $response['person']['id']] = $response['language'];
    }
    ksort($read);
    assert_same($expected, $read);

    // A language that goes - once no survey is translated into it - takes the note with it, and leaves the answers.
    $survey = as_user(EDITH, 'GET', "/api/admin/surveys/$id")['body']['survey'];
    assert_same('language_in_use', as_user(OWNER, 'DELETE', '/api/admin/languages/de')['body']['code'] ?? null);
    $saved = as_user(EDITH, 'PUT', "/api/admin/surveys/$id", ['revision' => $survey['revision'], 'survey' => ['translations' => ['sk' => $survey['translations']['sk']]] + $survey]);
    assert_same(200, $saved['status'], test_show($saved['body']));
    assert_same(200, as_user(OWNER, 'DELETE', '/api/admin/languages/de')['status']);
    assert_same(
        [9, 0, 1],
        [
            (int) dbValue('SELECT count(*) FROM responses WHERE survey_id = ?', [$id]),
            (int) dbValue("SELECT count(*) FROM responses WHERE survey_id = ? AND language = 'de'", [$id]),
            (int) dbValue("SELECT count(*) FROM responses WHERE survey_id = ? AND language = 'sk'", [$id]),
        ],
    );

    assert_same(204, as_user(OWNER, 'DELETE', "/api/admin/surveys/$id")['status']);
    assert_same(200, as_user(OWNER, 'DELETE', '/api/admin/languages/fr')['status']);
});

test('a step of its own text and pictures, with no question: cleaned on the way in, its pictures the survey\'s, opened, and taken with nothing to answer on it', function (): void {
    $map = as_user(EDITH, 'POST', '/api/admin/images', png(), ['Content-Type: image/png'])['body']['image'];
    $shared = as_user(EDITH, 'POST', '/api/admin/images', png(), ['Content-Type: image/png'])['body']['image'];
    // A usability test's task, written with everything a text must not carry - and a picture a question shows too.
    $task = [
        'id' => 'step-task',
        'title' => 'The task',
        'text' =>
            '<p onclick="steal()">Go to <a href="javascript:alert(1)">the genshin site</a>, find <mark>Mondstadt</mark><script>alert(1)</script><img src="x" onerror="alert(1)">, then come back.</p>' .
            '<style>p{display:none}</style><p><a href="https://genshin.anotoki.eu">genshin.anotoki.eu</a></p>',
        'images' => [['id' => $map['id'], 'alt' => 'The map', 'width' => 9999, 'height' => 9999, 'src' => 'https://evil.example/x.png'], ['id' => $shared['id'], 'alt' => '']],
        'questions' => [],
    ];
    $clean = '<p>Go to the genshin site, find <mark>Mondstadt</mark>, then come back.</p><p><a target="_blank" rel="noopener noreferrer" href="https://genshin.anotoki.eu">genshin.anotoki.eu</a></p>';
    $base = draft(['slug' => 'usability']);
    $base['steps'][0]['questions'][0]['images'] = [['id' => $shared['id'], 'alt' => 'Shared']];
    $made = as_user(EDITH, 'POST', '/api/admin/surveys', ['survey' => ['steps' => [$task, $base['steps'][0]]] + $base]);
    assert_same(201, $made['status'], test_show($made['body']));
    $survey = $made['body']['survey'];
    $step = $survey['steps'][0];
    assert_same($clean, $step['text'], 'no script, handler, style, picture or javascript: link: what the editor makes, and nothing else');
    assert_json_same(
        [['id' => $map['id'], 'alt' => 'The map', 'width' => 1, 'height' => 1, 'src' => $map['src']], ['id' => $shared['id'], 'alt' => '', 'width' => 1, 'height' => 1, 'src' => $shared['src']]],
        $step['images'],
        'the size and the address are the file\'s',
    );
    assert_same([[], 'step-1'], [$step['questions'], $survey['steps'][1]['id']]);
    assert_same($clean, dbValue("SELECT content->'steps'->0->>'text' FROM surveys WHERE id = ?", [$survey['id']]), 'kept clean');
    assert_same(2, (int) dbValue('SELECT count(*) FROM survey_images WHERE survey_id = ?', [$survey['id']]), 'its pictures are the survey\'s: the clean-up leaves them');
    // A step's picture the server does not have: refused, as a question's is.
    $unknown = $survey;
    $unknown['steps'][0]['images'][0]['id'] = newUuid();
    assert_same(
        [422, 'unknown_image'],
        (static fn(array $r): array => [$r['status'], $r['body']['code'] ?? null])(as_user(EDITH, 'PUT', "/api/admin/surveys/{$survey['id']}", ['revision' => 1, 'survey' => $unknown])),
    );

    // A step people only read is nothing to fix: it opens.
    $opened = as_user(EDITH, 'POST', "/api/admin/surveys/{$survey['id']}/status", ['status' => 'open']);
    assert_same(200, $opened['status'], test_show($opened['body']));

    // People get it as it is kept - and the step, as any, counts in the survey's steps.
    $taken = as_user(LOOKER, 'GET', '/api/surveys/usability');
    assert_same([200, $clean, 2], [$taken['status'], $taken['body']['survey']['steps'][0]['text'], count($taken['body']['survey']['steps'])]);
    foreach (['<script', 'onclick', 'onerror', 'javascript:', '<style', '<img'] as $never) {
        assert_false(str_contains($taken['raw'], $never), "nobody taking it is sent $never");
    }
    $listed = array_values(array_filter(as_user(EDITH, 'GET', '/api/admin/surveys')['body']['surveys'], static fn(array $row): bool => $row['id'] === $survey['id']))[0];
    assert_same(['steps' => 2, 'questions' => 2], ['steps' => $listed['steps'], 'questions' => $listed['questions']]);

    // Taken: nothing is asked on the step of text; the answers are the questions'.
    $sent = as_user(PAT, 'POST', '/api/surveys/usability/responses', [
        'aboutYou' => ['gender' => 'female', 'age' => '25-34'],
        'answers' => ['q-element' => ['optionIds' => ['o-anemo']], 'step-task' => ['text' => 'not a question']],
        'startedAt' => gmdate('Y-m-d\TH:i:s', time() - 300) . '.000Z',
    ]);
    assert_same(201, $sent['status'], test_show($sent['body']));
    assert_same(
        ['q-element' => ['text' => '', 'other' => '', 'optionIds' => ['o-anemo']]],
        json_decode((string) dbValue('SELECT answers::text FROM responses WHERE id = ?', [$sent['body']['id']]), true),
    );

    // The step goes: the picture only it showed goes too (once a day old - an upload may be on its way into a save);
    // the one a question shows as well stays.
    dbExec("UPDATE images SET created_at = now() - interval '2 days' WHERE id IN (?, ?)", [$map['id'], $shared['id']]);
    $without = $opened['body']['survey'];
    $without['steps'] = [$without['steps'][1]];
    $saved = as_user(EDITH, 'PUT', "/api/admin/surveys/{$survey['id']}", ['revision' => $without['revision'], 'survey' => $without]);
    assert_same(200, $saved['status'], test_show($saved['body']));
    assert_same(404, anonymous('GET', $map['src'])['status'], 'nothing shows it any more');
    assert_same(200, anonymous('GET', $shared['src'])['status'], 'a question still shows it');
    assert_same(204, as_user(OWNER, 'DELETE', "/api/admin/surveys/{$survey['id']}")['status']);
});

test('a step\'s own text and its pictures\' descriptions in another language: cleaned, the step\'s own pictures only, every map an object', function (): void {
    $map = as_user(EDITH, 'POST', '/api/admin/images', png(), ['Content-Type: image/png'])['body']['image'];
    $task = ['id' => '0', 'title' => '', 'text' => '<p>Go to the site, then come back.</p>', 'images' => [['id' => $map['id'], 'alt' => 'The map']], 'questions' => []];
    $base = draft(['slug' => 'usability-sk']);
    $translation = slovak();
    $translation['steps'] = (object) [
        '0' => ['text' => '<p onclick="x()">Choďte na stránku<script>alert(1)</script>, potom sa vráťte.</p>', 'images' => (object) [$map['id'] => ['alt' => 'Mapa'], newUuid() => ['alt' => 'Inde']]],
        'step-1' => ['title' => 'Záplata'],
    ];
    $made = as_user(EDITH, 'POST', '/api/admin/surveys', ['survey' => ['steps' => [$task, $base['steps'][0]], 'translations' => ['sk' => $translation]] + $base]);
    assert_same(201, $made['status'], test_show($made['body']));
    $whole = '"steps":{"0":{"title":"","text":"<p>Choďte na stránku, potom sa vráťte.</p>","images":{"' . $map['id'] . '":{"alt":"Mapa"}}},"step-1":{"title":"Záplata","text":"","images":{}}}';
    assert_true(str_contains($made['raw'], $whole), $made['raw']);
    assert_same('object', dbValue("SELECT jsonb_typeof(content#>'{translations,sk,steps,step-1,images}') FROM surveys WHERE id = ?", [$made['body']['survey']['id']]), 'in the database too');

    // Whole, it opens - and people reading Slovak are sent it.
    $opened = as_user(EDITH, 'POST', "/api/admin/surveys/{$made['body']['survey']['id']}/status", ['status' => 'open']);
    assert_same(200, $opened['status'], test_show($opened['body']));
    assert_true(str_contains(as_user(LOOKER, 'GET', '/api/surveys/usability-sk')['raw'], $whole));

    // Its text left out: a text still to translate, said as the editor says it - "About you" is step 1.
    $survey = $opened['body']['survey'];
    $gap = $survey;
    $gap['translations']['sk']['steps']['0']['text'] = '<p> </p>';
    $saved = as_user(EDITH, 'PUT', "/api/admin/surveys/{$survey['id']}", ['revision' => $survey['revision'], 'survey' => $gap]);
    assert_same(200, $saved['status'], test_show($saved['body']));
    as_user(EDITH, 'POST', "/api/admin/surveys/{$survey['id']}/status", ['status' => 'closed']);
    assert_same(['Slovak: step 2 has 1 text to translate.'], as_user(EDITH, 'POST', "/api/admin/surveys/{$survey['id']}/status", ['status' => 'open'])['body']['problems'] ?? null);
    assert_same(204, as_user(OWNER, 'DELETE', "/api/admin/surveys/{$survey['id']}")['status']);
});

test('the server said nothing it should not have', function (): void {
    assert_same([], server_problems($GLOBALS['app']));
});
