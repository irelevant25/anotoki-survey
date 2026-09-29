<?php

// A survey's life through the real server: an editor writes it, opens it;
// people take it - once each, only while it is open; the results show who
// answered what; an administrator deletes. Pictures go up, come back, and go
// when nothing shows them.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const OWNER = 1;       // ADMIN
const EDITH = 2;       // EDITOR
const PAT = 101;       // takes surveys
const QUINN = 102;     // takes surveys

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

/** A survey as the editor makes it (newSurvey() in survey-factory.ts), with two questions and "About you". */
function draft(array $fields = []): array
{
    return $fields + [
        'id' => 'ignored', 'slug' => 'genshin-1-0', 'title' => 'Genshin 1.0', 'status' => 'open',
        'intro' => '<p>Thank you for taking a few minutes.</p>', 'thanks' => '<p>Thank you!</p>',
        'askAboutYou' => true, 'closesOn' => null,
        'steps' => [[
            'id' => 'step-1', 'title' => 'The patch',
            'questions' => [
                [
                    'id' => 'q-element', 'type' => 'single', 'text' => '<p>Your favourite element?</p>', 'images' => [], 'required' => true,
                    'options' => [
                        ['id' => 'o-anemo', 'label' => 'Anemo', 'other' => false, 'images' => []],
                        ['id' => 'o-geo', 'label' => 'Geo', 'other' => false, 'images' => []],
                        ['id' => 'o-other', 'label' => 'Another one', 'other' => true, 'images' => []],
                    ],
                    'layout' => 'list', 'minChoices' => null, 'maxChoices' => null, 'multiline' => true, 'maxLength' => null, 'placeholder' => '',
                ],
                [
                    'id' => 'q-words', 'type' => 'text', 'text' => '<p>Anything else?</p>', 'images' => [], 'required' => false,
                    'options' => [], 'layout' => 'list', 'minChoices' => null, 'maxChoices' => null, 'multiline' => true, 'maxLength' => 200, 'placeholder' => '',
                ],
            ],
        ]],
    ];
}

/** The smallest PNG there is: one pixel. */
function png(): string
{
    return (string) base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
}

test('who may do what: people read, editors write, only an administrator deletes', function (): void {
    assert_same(200, anonymous('GET', '/api/surveys')['status'], 'anybody sees the open surveys');
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
    assert_same(['id', 'slug', 'title', 'intro', 'thanks', 'askAboutYou', 'status', 'closesOn', 'steps', 'createdAt', 'updatedAt', 'openedAt', 'closedAt', 'revision'], array_keys($survey));
    assert_same('q-element', $survey['steps'][0]['questions'][0]['id'], 'the editor\'s own ids are kept');
    assert_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/', $survey['createdAt']);

    assert_same(404, anonymous('GET', '/api/surveys/genshin-1-0')['status'], 'a draft is nobody\'s to take');
    assert_same([], anonymous('GET', '/api/surveys')['body']['surveys']);

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

test('taking it: anybody may look, only a signed-in person answers - once', function (): void {
    $survey = $GLOBALS['survey'];

    $look = anonymous('GET', '/api/surveys/genshin-1-0');
    assert_same(200, $look['status']);
    assert_same(null, $look['body']['answeredAt']);
    assert_same($survey['id'], anonymous('GET', '/api/surveys')['body']['surveys'][0]['survey']['id']);

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
    $quinn = as_user(QUINN, 'POST', '/api/surveys/genshin-1-0/responses', ['aboutYou' => ['gender' => 'undisclosed', 'age' => 'undisclosed'], 'answers' => ['q-element' => ['optionIds' => ['o-geo']], 'q-words' => ['text' => " More\x0B Geo! "]], 'startedAt' => '2999-01-01T00:00:00.000Z']);
    assert_same(201, $quinn['status'], test_show($quinn['body']));
    assert_true(strtotime((string) dbValue('SELECT started_at FROM responses WHERE id = ?', [$quinn['body']['id']])) <= time(), 'a start in the future is taken as now');

    // An address that is not one - not even UTF-8 - is no survey, not a database error.
    assert_same(404, anonymous('GET', '/api/surveys/%FF')['status']);
    assert_same(404, as_user(QUINN, 'POST', '/api/surveys/%C3/responses', $answers)['status']);
    assert_same(404, anonymous('GET', '/api/surveys/Not%20a%20slug')['status']);
});

test('the results: every filled survey with who filled it; an administrator can delete one', function (): void {
    $id = $GLOBALS['survey']['id'];
    assert_same(403, as_user(PAT, 'GET', "/api/admin/surveys/$id/responses")['status']);
    $responses = as_user(EDITH, 'GET', "/api/admin/surveys/$id/responses")['body']['responses'];
    assert_same(2, count($responses));
    $quinn = $responses[0];
    assert_same(['id' => (string) QUINN, 'name' => 'user' . QUINN, 'email' => 'user' . QUINN . '@example.test'], $quinn['person'], 'newest first, named from the token');
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
    assert_same('closed', anonymous('GET', '/api/surveys/genshin-1-0')['body']['survey']['status']);
    assert_same([], anonymous('GET', '/api/surveys')['body']['surveys']);

    // Reopened with a last day long gone: closed to answers all the same.
    $reopened = as_user(EDITH, 'POST', "/api/admin/surveys/$id/status", ['status' => 'open', 'closesOn' => '2020-01-01']);
    assert_same(['open', '2020-01-01', null], [$reopened['body']['survey']['status'], $reopened['body']['survey']['closesOn'], $reopened['body']['survey']['closedAt']]);
    assert_same('not_open', as_user(QUINN, 'POST', '/api/surveys/genshin-1-0/responses', ['answers' => []])['body']['code']);
    // With the day dropped, as the editor reopens it: open again.
    as_user(EDITH, 'POST', "/api/admin/surveys/$id/status", ['status' => 'open', 'closesOn' => null]);
    assert_same(1, count(anonymous('GET', '/api/surveys')['body']['surveys']));
    assert_same(409, as_user(EDITH, 'POST', '/api/admin/surveys/' . as_user(EDITH, 'POST', '/api/admin/surveys', ['survey' => draft(['slug' => 'x'])])['body']['survey']['id'] . '/status', ['status' => 'closed'])['status'], 'a draft cannot close');
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

test('the server said nothing it should not have', function (): void {
    assert_same([], server_problems($GLOBALS['app']));
});
