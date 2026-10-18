<?php

// Visitors through the real server: while the IAM says this site does not
// require sign-in, somebody who is not signed in takes the open surveys too -
// once each, as a visitor the server makes with their first answers that are
// kept, known by a key only their browser holds. Who a request is (a token
// first, then the switch, then the key), the limits on new visitors, the
// clean-up that ends a visitor and keeps its answers, the move into an account
// at sign-in, and the results that show a visitor as such.
//
// The switch is the tests' answer file (test_application_file()), read on
// every request; the visitor settings are small, and the server believes
// 127.0.0.1 - the tests themselves - about the visitor's address
// (CF-Connecting-IP), so each request can come from an address of its own.
// Two at the same moment: somebody_else() holds a row, begin_call() sends the
// request and sees it wait (the test server answers one request at a time).

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const OWNER = 1;       // ADMIN
const PAT = 101;       // takes surveys, signed in
const QUINN = 102;     // takes surveys, signed in

const KEY_PATTERN = '/^[A-Za-z0-9_-]{43}$/D';

const VISITOR_SETTINGS = [
    'trusted_proxies' => ['127.0.0.1'],
    'new_per_hour_per_address' => 3,
    'new_per_hour' => 6,
    'max_active' => 8,
    'keep_days' => 30,
    'sweep_batch' => 3,
    'move_lock_timeout_ms' => 500,
];

$GLOBALS['app'] = null;
$GLOBALS['switch'] = null;
$GLOBALS['surveys'] = [];
before(function (): void {
    $GLOBALS['switch'] = test_application_file(false);
    $GLOBALS['app'] = start_app(test_iam(['application_file' => $GLOBALS['switch']]), [], VISITOR_SETTINGS);
    foreach (['first', 'second', 'third'] as $slug) {
        $GLOBALS['surveys'][$slug] = make_survey($slug);
    }
});

function roles_of(int $user): array
{
    return $user === OWNER ? ['ADMIN'] : ['MEMBER'];
}

function as_user(int $user, string $method, string $url, mixed $body = null, array $headers = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, array_merge($headers, bearer(test_token($user, roles_of($user)))));
}

/** Nobody signed in, from $ip (a new address each time unless given). */
function nobody(string $method, string $url, mixed $body = null, ?string $ip = null, array $headers = []): array
{
    static $n = 0;
    $ip ??= '198.51.100.' . (++$n % 250 + 1);

    return call($GLOBALS['app']['base'], $method, $url, $body, array_merge($headers, ["CF-Connecting-IP: $ip"]));
}

/** This key's visitor. */
function as_visitor(string $key, string $method, string $url, mixed $body = null, array $headers = []): array
{
    return nobody($method, $url, $body, null, array_merge($headers, ["X-Visitor-Key: $key"]));
}

/** An open survey at /$slug with one question that must be answered, made as an editor makes one. */
function make_survey(string $slug): string
{
    $made = as_user(OWNER, 'POST', '/api/admin/surveys', ['survey' => [
        'id' => 'ignored', 'slug' => $slug, 'title' => ucfirst($slug), 'status' => 'open',
        'intro' => '<p>Hello.</p>', 'thanks' => '<p>Thank you!</p>', 'askAboutYou' => false, 'closesOn' => null,
        'language' => 'en', 'translations' => new stdClass(),
        'steps' => [[
            'id' => 'step-1', 'title' => 'One',
            'questions' => [[
                'id' => 'q-element', 'type' => 'single', 'text' => '<p>Your favourite element?</p>', 'images' => [], 'required' => true,
                'options' => [
                    ['id' => 'o-anemo', 'label' => 'Anemo', 'other' => false, 'images' => []],
                    ['id' => 'o-geo', 'label' => 'Geo', 'other' => false, 'images' => []],
                ],
                'layout' => 'list', 'minChoices' => null, 'maxChoices' => null, 'multiline' => true, 'maxLength' => null, 'placeholder' => '',
            ]],
        ]],
    ]]);
    if ($made['status'] !== 201) {
        throw new RuntimeException('could not make the survey: ' . $made['raw']);
    }
    $id = (string) $made['body']['survey']['id'];
    if (($made['body']['survey']['status'] ?? null) !== 'open') {
        $opened = as_user(OWNER, 'POST', "/api/admin/surveys/$id/status", ['status' => 'open']);
        if ($opened['status'] !== 200) {
            throw new RuntimeException('could not open the survey: ' . $opened['raw']);
        }
    }

    return $id;
}

function answers(string $option = 'o-geo'): array
{
    return ['answers' => ['q-element' => ['optionIds' => [$option], 'other' => '', 'text' => '']], 'startedAt' => isoNow(), 'language' => 'en'];
}

/** Nobody's answers to /$slug that are kept: the new visitor's key. */
function new_visitor(string $slug = 'first', ?string $ip = null): string
{
    $sent = nobody('POST', "/api/surveys/$slug/responses", answers(), $ip);
    assert_same(201, $sent['status'], 'a new visitor: ' . $sent['raw']);
    assert_match(KEY_PATTERN, (string) ($sent['headers']['x-visitor-key'] ?? ''));

    return $sent['headers']['x-visitor-key'];
}

function visitor_id(string $key): ?int
{
    $id = dbValue('SELECT id FROM users WHERE visitor_key_hash = ?', [hash('sha256', $key)]);

    return $id === null ? null : (int) $id;
}

/** The switch: sign-in required or not, as the IAM says it - read on every request. */
function switch_to(bool $required): void
{
    file_put_contents($GLOBALS['switch'], json_encode(['client_id' => TEST_CLIENT, 'name' => 'Test', 'login_required' => $required]));
}

/** No visitor, no count, none of their answers: each test starts here. */
function fresh(): void
{
    switch_to(false);
    dbExec('DELETE FROM visitor_counters');
    dbExec('DELETE FROM users WHERE id < 0');
    dbExec('DELETE FROM responses');
    // The clean-up's hourly marker, just set: no test is swept unless it says so.
    touch(marker());
}

function marker(): string
{
    $dir = $GLOBALS['app']['config'] . '/storage';
    if (!is_dir($dir)) {
        mkdir($dir, 0777, true);
    }

    return "$dir/visitors-swept";
}

function counters(): array
{
    return array_column(dbAll('SELECT name, count FROM visitor_counters ORDER BY name'), 'count', 'name');
}

/**
 * The counter of new visitors from $address as the server names it: a keyed
 * HMAC of what it counts (the address; an IPv6 address's /64) under the
 * server's own installation key - never the address (api/client_address.php).
 * The server is this file's, or $app.
 */
function address_counter(string $address, ?array $app = null): string
{
    $key = \Anotoki\Lib\Support\Keys::derive(\Anotoki\Lib\Support\Keys::installation(($app ?? $GLOBALS['app'])['config'] . '/storage'), 'visitor-limits');

    return 'visitors:new:' . hash_hmac('sha256', \Anotoki\Lib\Support\ClientAddress::bucket($address), $key);
}

function answered_at(array $answer, string $slug): ?string
{
    foreach ($answer['body']['surveys'] ?? [] as $entry) {
        if ($entry['survey']['slug'] === $slug) {
            return $entry['answeredAt'];
        }
    }
    throw new RuntimeException("no survey $slug in " . test_show($answer['body']));
}

/** The server's log, request lines and all. */
function server_log(): string
{
    return (string) file_get_contents($GLOBALS['app']['log']);
}

test('switched off: nobody reads the open surveys - answered by nobody - and reading makes no visitor', function (): void {
    fresh();
    $list = nobody('GET', '/api/surveys');
    assert_same(200, $list['status']);
    $slugs = array_map(static fn(array $entry): string => $entry['survey']['slug'], $list['body']['surveys']);
    sort($slugs);
    assert_same(['first', 'second', 'third'], $slugs, 'every open survey');
    assert_same([null], array_values(array_unique(array_column($list['body']['surveys'], 'answeredAt'))));
    $one = nobody('GET', '/api/surveys/first');
    assert_same([200, 'first', true, null], [$one['status'], $one['body']['survey']['slug'] ?? null, array_key_exists('answeredAt', $one['body']), $one['body']['answeredAt']]);
    assert_same([0, []], [(int) dbValue('SELECT count(*) FROM users WHERE id < 0'), counters()], 'no visitor, nothing counted');
    assert_same(null, $one['headers']['x-visitor-key'] ?? null);
});

test('nobody\'s answers that are kept make a visitor: its key in a header of the 201 and nowhere else, only its hash in the row', function (): void {
    fresh();
    $sent = nobody('POST', '/api/surveys/first/responses', answers(), '203.0.113.9');
    assert_same(201, $sent['status'], $sent['raw']);
    $key = (string) ($sent['headers']['x-visitor-key'] ?? '');
    assert_match(KEY_PATTERN, $key);
    assert_same('no-store', $sent['headers']['cache-control'] ?? null);
    assert_same(['id', 'submittedAt'], array_keys($sent['body']), 'the body as a person\'s');
    assert_no_match('/' . preg_quote($key, '/') . '/', $sent['raw'], 'never in the body');

    $row = dbOne('SELECT id, preferred_username, anonymized_at, visitor_key_hash, last_seen_at > now() - interval \'1 minute\' AS seen FROM users WHERE id < 0');
    assert_true((int) $row['id'] < 0, 'a negative id');
    assert_same([null, null, hash('sha256', $key), true], [$row['preferred_username'], $row['anonymized_at'], $row['visitor_key_hash'], $row['seen']]);
    assert_same((int) $row['id'], (int) dbValue('SELECT user_id FROM responses WHERE id = ?', [$sent['body']['id']]), 'the answers are the visitor\'s');
    assert_same(['visitors:new' => 1, address_counter('203.0.113.9') => 1], counters());

    foreach (['users', 'responses', 'visitor_counters', 'surveys'] as $table) {
        assert_same(0, (int) dbValue("SELECT count(*) FROM $table t WHERE row_to_json(t)::text LIKE ?", ['%' . $key . '%']), "the key is in no row of $table");
        assert_same(0, (int) dbValue("SELECT count(*) FROM $table t WHERE row_to_json(t)::text LIKE '%203.0.113.9%'"), "nor the address in a row of $table: its counter goes by a keyed HMAC of it");
    }
    assert_no_match('/' . preg_quote($key, '/') . '/', server_log(), 'nor in the server\'s log');
});

test('a send that is refused makes nobody a visitor and counts nothing - ten of them, and the next good one still goes through', function (): void {
    fresh();
    $address = '203.0.113.20';
    $refusals = [
        ['/api/surveys/first/responses', ['answers' => new stdClass(), 'startedAt' => isoNow()], 422, 'invalid_answer'],
        ['/api/surveys/no-such-survey/responses', answers(), 404, 'not_found'],
        ['/api/surveys/first/responses', [1, 2], 422, 'invalid_answer'],
    ];
    for ($i = 0; $i < 10; $i++) {
        [$url, $body, $status, $code] = $refusals[$i % 3];
        $refused = nobody('POST', $url, $body, $address);
        assert_same([$status, $code, null], [$refused['status'], $refused['body']['code'] ?? null, $refused['headers']['x-visitor-key'] ?? null], $url);
    }
    // A survey that has closed.
    dbExec("UPDATE surveys SET status = 'closed' WHERE slug = 'third'");
    $closed = nobody('POST', '/api/surveys/third/responses', answers(), $address);
    dbExec("UPDATE surveys SET status = 'open' WHERE slug = 'third'");
    assert_same([409, 'not_open', null], [$closed['status'], $closed['body']['code'] ?? null, $closed['headers']['x-visitor-key'] ?? null]);
    assert_same([0, [], 0], [(int) dbValue('SELECT count(*) FROM users WHERE id < 0'), counters(), (int) dbValue('SELECT count(*) FROM responses')]);

    new_visitor('first', $address);
    assert_same(['visitors:new' => 1, address_counter($address) => 1], counters());
});

test('a visitor: its own answeredAt and nobody else\'s, once each survey, one key for all of them', function (): void {
    fresh();
    $key = new_visitor('first');
    assert_true(answered_at(as_visitor($key, 'GET', '/api/surveys'), 'first') !== null, 'its answer, on the list');
    assert_true(as_visitor($key, 'GET', '/api/surveys/first')['body']['answeredAt'] !== null, 'and on the survey');
    assert_same(null, answered_at(as_visitor($key, 'GET', '/api/surveys'), 'second'));

    $again = as_visitor($key, 'POST', '/api/surveys/first/responses', answers('o-anemo'));
    assert_same([409, 'already_answered'], [$again['status'], $again['body']['code'] ?? null], 'once each');
    $second = as_visitor($key, 'POST', '/api/surveys/second/responses', answers());
    assert_same([201, null], [$second['status'], $second['headers']['x-visitor-key'] ?? null], 'another survey: the same visitor, no new key');
    assert_same(1, (int) dbValue('SELECT count(*) FROM users WHERE id < 0'));
    assert_same(['visitors:new' => 1], array_intersect_key(counters(), ['visitors:new' => 0]), 'a visitor\'s own sends count nothing');

    // Somebody else - another browser, a person - has answered nothing of it.
    $other = new_visitor('second');
    assert_same(null, answered_at(as_visitor($other, 'GET', '/api/surveys'), 'first'), 'another visitor');
    assert_same(null, answered_at(nobody('GET', '/api/surveys'), 'first'), 'nobody');
    assert_same(null, answered_at(as_user(PAT, 'GET', '/api/surveys'), 'first'), 'a person');
    assert_same(2, (int) dbValue("SELECT count(*) FROM responses r JOIN surveys s ON s.id = r.survey_id WHERE s.slug = 'second'"), 'two visitors, two answers');

    // And the other way round: a person's answer is not a visitor's.
    assert_same(201, as_user(PAT, 'POST', '/api/surveys/third/responses', answers())['status']);
    assert_same(null, answered_at(as_visitor($key, 'GET', '/api/surveys'), 'third'));
});

test('keys: one that is nobody\'s, or no key at all, is visitor_unknown; switched on, a key and nobody are asked to sign in, and the visitor is not even seen', function (): void {
    fresh();
    foreach ([str_repeat('A', 43), 'not a key', str_repeat('A', 44), str_repeat('A', 42) . '=', "\u{00e9}" . str_repeat('A', 42)] as $bad) {
        $answer = as_visitor($bad, 'GET', '/api/surveys');
        assert_same([401, 'visitor_unknown'], [$answer['status'], $answer['body']['code'] ?? null], test_show($bad));
    }
    $key = new_visitor();
    dbExec("UPDATE users SET last_seen_at = now() - interval '2 hours' WHERE id < 0");
    $before = dbValue('SELECT last_seen_at FROM users WHERE id < 0');

    switch_to(true);
    foreach (['GET /api/surveys', 'GET /api/surveys/first', 'POST /api/surveys/second/responses'] as $route) {
        [$method, $url] = explode(' ', $route);
        $body = $method === 'POST' ? answers() : null;
        $withKey = as_visitor($key, $method, $url, $body);
        assert_same([401, 'sign_in_required'], [$withKey['status'], $withKey['body']['code'] ?? null], "$route with a key");
        $none = nobody($method, $url, $body);
        assert_same([401, 'sign_in_required'], [$none['status'], $none['body']['code'] ?? null], "$route, nobody");
    }
    assert_same([$before, 1, 1], [dbValue('SELECT last_seen_at FROM users WHERE id < 0'), (int) dbValue('SELECT count(*) FROM responses'), (int) dbValue('SELECT count(*) FROM users WHERE id < 0')], 'not seen, nothing kept, nobody made');
    assert_same(200, as_user(PAT, 'GET', '/api/surveys')['status'], 'a person, as ever');

    switch_to(false);
    assert_true(as_visitor($key, 'GET', '/api/surveys/first')['body']['answeredAt'] !== null, 'switched off again: the same visitor');
    assert_true(dbValue('SELECT last_seen_at FROM users WHERE id < 0') !== $before, 'and seen now');
});

test('a Bearer header is that person or a refusal, never the key; another scheme is no person at all', function (): void {
    fresh();
    $key = new_visitor();
    dbExec("UPDATE users SET last_seen_at = now() - interval '2 hours' WHERE id < 0");
    $before = dbValue('SELECT last_seen_at FROM users WHERE id < 0');
    $other = test_forger(); // the tests' key id, another key
    $refused = [
        'a token that ran out' => 'Bearer ' . test_token(PAT, ['MEMBER'], ['exp' => time() - 120]),
        'a token signed by somebody else' => 'Bearer ' . test_token(PAT, ['MEMBER'], [], ['iam' => $other]),
        'not a token' => 'Bearer x',
        'an empty one' => 'Bearer',
    ];
    foreach ($refused as $what => $header) {
        foreach (['GET /api/surveys', 'POST /api/surveys/second/responses'] as $route) {
            [$method, $url] = explode(' ', $route);
            $answer = as_visitor($key, $method, $url, $method === 'POST' ? answers() : null, ["Authorization: $header"]);
            assert_same([401, 'invalid_token'], [$answer['status'], $answer['body']['code'] ?? null], "$what, $route");
        }
    }
    assert_same([$before, 1], [dbValue('SELECT last_seen_at FROM users WHERE id < 0'), (int) dbValue('SELECT count(*) FROM responses')], 'the visitor neither seen nor written for');

    $basic = as_visitor($key, 'GET', '/api/surveys', null, ['Authorization: Basic YWRtaW46YWRtaW4=']);
    assert_true(answered_at($basic, 'first') !== null, 'Basic (a host\'s password file) says nothing of who it is: the key\'s visitor');

    $person = as_visitor($key, 'GET', '/api/surveys', null, bearer(test_token(PAT, ['MEMBER'])));
    assert_same(null, answered_at($person, 'first'), 'a good token: the person, the key not read');
    $sent = as_visitor($key, 'POST', '/api/surveys/first/responses', answers(), bearer(test_token(PAT, ['MEMBER'])));
    assert_same([201, PAT, null], [$sent['status'], (int) dbValue('SELECT user_id FROM responses WHERE id = ?', [$sent['body']['id']]), $sent['headers']['x-visitor-key'] ?? null], 'the person\'s answers');
});

test('a key opens nothing but the surveys: not the admin panel, not the move without a token', function (): void {
    fresh();
    $key = new_visitor();
    $id = $GLOBALS['surveys']['first'];
    foreach (['GET /api/admin/surveys', "GET /api/admin/surveys/$id/responses", 'GET /api/admin/migrations', 'POST /api/visitor/move'] as $route) {
        [$method, $url] = explode(' ', $route);
        $answer = as_visitor($key, $method, $url);
        assert_same([401, 'sign_in_required'], [$answer['status'], $answer['body']['code'] ?? null], $route);
    }
});

test('limits on new visitors - an address\'s, everybody\'s, and how many at once: 429 too_many_visitors, nothing kept, the ones there carry on', function (): void {
    fresh();
    $keys = [];
    for ($i = 0; $i < 3; $i++) {
        $keys[] = new_visitor('first', '203.0.113.30');
    }
    $fourth = nobody('POST', '/api/surveys/first/responses', answers(), '203.0.113.30');
    assert_same([429, 'too_many_visitors', '3600', null], [$fourth['status'], $fourth['body']['code'] ?? null, $fourth['headers']['retry-after'] ?? null, $fourth['headers']['x-visitor-key'] ?? null]);
    assert_match('/this address/', (string) $fourth['body']['error']);
    assert_same([3, 3], [(int) dbValue('SELECT count(*) FROM users WHERE id < 0'), (int) dbValue('SELECT count(*) FROM responses')], 'nothing kept');
    assert_same(3, counters()[address_counter('203.0.113.30')], 'the refused one counted nothing');
    assert_same(201, as_visitor($keys[0], 'POST', '/api/surveys/second/responses', answers())['status'], 'a visitor there already carries on');
    new_visitor('first', '203.0.113.31');

    // An IPv6 address counts by its /64; one written as IPv6 that is IPv4 counts as that.
    fresh();
    foreach (['2001:db8:1:2::1', '2001:db8:1:2:aaaa::7', '2001:db8:1:2:ffff:ffff:ffff:ffff'] as $ip) {
        new_visitor('first', $ip);
    }
    assert_same(429, nobody('POST', '/api/surveys/first/responses', answers(), '2001:db8:1:2::99')['status'], 'the same /64');
    new_visitor('first', '2001:db8:1:3::1');
    new_visitor('first', '::ffff:198.51.100.200');
    assert_true(isset(counters()[address_counter('198.51.100.200')]), 'an IPv4-mapped address is the IPv4 address: ' . test_show(counters()));
    assert_same(3, counters()[address_counter('2001:db8:1:2::')] ?? null, 'the /64 counted as one');

    // Everybody's, within the hour.
    fresh();
    dbExec("INSERT INTO visitor_counters (name, count, window_ends) VALUES ('visitors:new', 6, now() + interval '30 minutes')");
    $all = nobody('POST', '/api/surveys/first/responses', answers());
    assert_same([429, 'too_many_visitors'], [$all['status'], $all['body']['code'] ?? null]);
    assert_match('/within the hour/', (string) $all['body']['error']);
    dbExec("UPDATE visitor_counters SET window_ends = now() - interval '1 second' WHERE name = 'visitors:new'");
    new_visitor();
    assert_same(1, counters()['visitors:new'], 'an hour later the count starts again');

    // How many have a key at once: an ended visitor is not one of them.
    fresh();
    for ($i = 1; $i <= 8; $i++) {
        dbExec('INSERT INTO users (id, visitor_key_hash) VALUES (?, ?)', [-1000 - $i, hash('sha256', "filler $i")]);
    }
    $full = nobody('POST', '/api/surveys/first/responses', answers());
    assert_same([429, 'too_many_visitors'], [$full['status'], $full['body']['code'] ?? null]);
    assert_match('/just now/', (string) $full['body']['error']);
    dbExec('UPDATE users SET visitor_key_hash = NULL WHERE id = -1001');
    new_visitor();
});

test('two new visitors from one address at the same moment: the second waits for the first\'s count, and counts it', function (): void {
    fresh();
    $address = '203.0.113.40';
    // Somebody else is being made a visitor from the address - the third this hour - and is not finished.
    $other = somebody_else();
    $other->beginTransaction();
    $other->prepare("INSERT INTO visitor_counters (name, count, window_ends) VALUES (?, 3, now() + interval '1 hour')")->execute([address_counter($address)]);
    $pending = begin_call($GLOBALS['app']['base'], 'POST', '/api/surveys/first/responses', answers(), ["CF-Connecting-IP: $address"]);
    try {
        if (!$pending['waits']()) {
            fail('it did not wait for the other new visitor, and answered ' . test_show($pending['answer']()));
        }
        $other->commit();
        $answer = $pending['answer']();
        assert_same([429, 'too_many_visitors'], [$answer['status'], $answer['body']['code'] ?? null], 'the fourth from the address: ' . test_show($answer['body']));
        assert_same(0, (int) dbValue('SELECT count(*) FROM users WHERE id < 0'));
    } finally {
        if ($other->inTransaction()) {
            $other->rollBack();
        }
        $pending['answer']();
    }
});

test('how many visitors there are is counted only once everybody\'s count is held: one made at the same moment is counted', function (): void {
    fresh();
    for ($i = 1; $i <= 7; $i++) {
        dbExec('INSERT INTO users (id, visitor_key_hash) VALUES (?, ?)', [-1000 - $i, hash('sha256', "filler $i")]);
    }
    // Somebody else is being made the eighth visitor, the most there may be, and is not finished.
    $other = somebody_else();
    $other->beginTransaction();
    $other->exec("INSERT INTO visitor_counters (name, count, window_ends) VALUES ('visitors:new', 1, now() + interval '1 hour')");
    $other->exec("INSERT INTO users (id, visitor_key_hash) VALUES (-1008, '" . hash('sha256', 'filler 8') . "')");
    $pending = begin_call($GLOBALS['app']['base'], 'POST', '/api/surveys/first/responses', answers(), ['CF-Connecting-IP: 203.0.113.41']);
    try {
        if (!$pending['waits']()) {
            fail('it did not wait for the other new visitor, and answered ' . test_show($pending['answer']()));
        }
        $other->commit();
        $answer = $pending['answer']();
        assert_same([429, 'too_many_visitors'], [$answer['status'], $answer['body']['code'] ?? null], 'the ninth: ' . test_show($answer['body']));
        assert_same(8, (int) dbValue('SELECT count(*) FROM users WHERE visitor_key_hash IS NOT NULL'));
    } finally {
        if ($other->inTransaction()) {
            $other->rollBack();
        }
        $pending['answer']();
    }
});

test('a visitor whose row goes while its answers are on their way - moved at sign-in in another tab, ended - is visitor_unknown, never a database error', function (): void {
    foreach (['moved into an account' => 'DELETE FROM users WHERE id = %d', 'ended by the clean-up' => 'UPDATE users SET visitor_key_hash = NULL WHERE id = %d'] as $what => $sql) {
        fresh();
        $key = new_visitor('first');
        $id = visitor_id($key);
        $other = somebody_else();
        $other->beginTransaction();
        $other->query("SELECT id FROM users WHERE id = $id FOR UPDATE");
        $other->exec(sprintf($sql, $id));
        $pending = begin_call($GLOBALS['app']['base'], 'POST', '/api/surveys/second/responses', answers(), ["X-Visitor-Key: $key"]);
        try {
            if (!$pending['waits']()) {
                fail("$what: it did not wait for the row, and answered " . test_show($pending['answer']()));
            }
            $other->commit();
            $answer = $pending['answer']();
            assert_same([401, 'visitor_unknown'], [$answer['status'], $answer['body']['code'] ?? null], "$what: " . test_show($answer['body']));
            assert_same(0, (int) dbValue("SELECT count(*) FROM responses r JOIN surveys s ON s.id = r.survey_id WHERE s.slug = 'second'"), "$what: nothing kept");
        } finally {
            if ($other->inTransaction()) {
                $other->rollBack();
            }
            $pending['answer']();
        }
    }
});

test('seen: a visitor\'s last visit is written at most once an hour', function (): void {
    fresh();
    $key = new_visitor();
    dbExec("UPDATE users SET last_seen_at = now() - interval '30 minutes' WHERE id < 0");
    $before = dbValue('SELECT last_seen_at FROM users WHERE id < 0');
    as_visitor($key, 'GET', '/api/surveys');
    assert_same($before, dbValue('SELECT last_seen_at FROM users WHERE id < 0'), 'half an hour ago: left as it is');
    dbExec("UPDATE users SET last_seen_at = now() - interval '61 minutes' WHERE id < 0");
    as_visitor($key, 'GET', '/api/surveys/first');
    assert_true((bool) dbValue("SELECT last_seen_at > now() - interval '1 minute' FROM users WHERE id < 0"), 'over an hour ago: now');
});

test('the clean-up: unseen for keep_days, a visitor ends and its answers stay as "Visitor N" - or it goes, with none; one still coming back is never touched', function (): void {
    fresh();
    $ended = new_visitor('first');
    $recent = new_visitor('first');
    $answersDeleted = new_visitor('second');
    $empty = new_visitor('third');
    [$endedId, $recentId, $answersDeletedId, $emptyId] = array_map('visitor_id', [$ended, $recent, $answersDeleted, $empty]);
    // An ADMIN deleted these two's only answers; one of them still comes back.
    foreach ([$answersDeletedId, $emptyId] as $id) {
        $response = (string) dbValue('SELECT id FROM responses WHERE user_id = ?', [$id]);
        assert_same(204, as_user(OWNER, 'DELETE', "/api/admin/responses/$response")['status']);
    }
    as_user(PAT, 'GET', '/api/surveys');
    dbExec("UPDATE users SET last_seen_at = now() - interval '31 days' WHERE id IN (?, ?, ?)", [$endedId, $emptyId, PAT]);
    dbExec("UPDATE users SET last_seen_at = now() - interval '29 days' WHERE id = ?", [$recentId]);
    dbExec("INSERT INTO visitor_counters (name, count, window_ends) VALUES ('visitors:new:old', 2, now() - interval '2 hours'), ('visitors:new:now', 1, now() + interval '10 minutes')");

    // The marker is fresh: no clean-up yet.
    nobody('GET', '/api/surveys');
    assert_same(4, (int) dbValue('SELECT count(*) FROM users WHERE visitor_key_hash IS NOT NULL'), 'not before the hour is over');

    touch(marker(), time() - 3700);
    nobody('GET', '/api/surveys');
    assert_same(null, dbValue('SELECT visitor_key_hash FROM users WHERE id = ?', [$endedId]), 'unseen for 31 days, with answers: ended');
    assert_same(1, (int) dbValue('SELECT count(*) FROM responses WHERE user_id = ?', [$endedId]), 'its answers stay');
    assert_same(null, dbValue('SELECT id FROM users WHERE id = ?', [$emptyId]), 'unseen for 31 days, no answers: gone');
    assert_same(hash('sha256', $recent), dbValue('SELECT visitor_key_hash FROM users WHERE id = ?', [$recentId]), '29 days: untouched');
    assert_same(hash('sha256', $answersDeleted), dbValue('SELECT visitor_key_hash FROM users WHERE id = ?', [$answersDeletedId]), 'a visitor still coming back stays, though an ADMIN deleted its answers');
    assert_same(PAT, (int) dbValue('SELECT id FROM users WHERE id = ?', [PAT]), 'a person is never touched');
    assert_same([false, true], [array_key_exists('visitors:new:old', counters()), array_key_exists('visitors:new:now', counters())], 'the counters whose hour is over are gone, the others stay');
    assert_match('/\[visitors\] unseen for a long time: 1 ended \(their answers stay\), 1 with no answers deleted/', server_log());

    $gone = as_visitor($ended, 'GET', '/api/surveys');
    assert_same([401, 'visitor_unknown'], [$gone['status'], $gone['body']['code'] ?? null], 'the ended visitor\'s key opens nothing');
    $people = as_user(OWNER, 'GET', '/api/admin/surveys/' . $GLOBALS['surveys']['first'] . '/responses')['body']['responses'];
    $names = array_column(array_column($people, 'person'), 'name');
    assert_true(in_array('Visitor ' . -$endedId, $names, true), 'the results still show it: ' . test_show($names));
    assert_same(201, as_visitor($answersDeleted, 'POST', '/api/surveys/second/responses', answers())['status'], 'the visitor whose answers were deleted may answer again');
});

test('the clean-up takes a batch at a time, the longest unseen first, and the next one the rest', function (): void {
    fresh();
    // Each new visitor's answers run a clean-up too: all four first, then their last visits.
    $ids = [];
    for ($i = 0; $i < 4; $i++) {
        $ids[] = visitor_id(new_visitor());
    }
    foreach ($ids as $i => $id) {
        dbExec('UPDATE users SET last_seen_at = now() - make_interval(days => ?) WHERE id = ?', [40 - $i, $id]);
    }
    touch(marker(), time() - 3700);
    nobody('GET', '/api/surveys');
    assert_same([$ids[3]], array_map('intval', array_column(dbAll('SELECT id FROM users WHERE visitor_key_hash IS NOT NULL'), 'id')), 'three of four: the newest waits');
    touch(marker(), time() - 3700);
    nobody('GET', '/api/surveys');
    assert_same(0, (int) dbValue('SELECT count(*) FROM users WHERE visitor_key_hash IS NOT NULL'));
});

test('a clean-up that fails never fails the request it ran after: the answers are kept, and the log says why', function (): void {
    fresh();
    $old = new_visitor();
    dbExec("UPDATE users SET last_seen_at = now() - interval '40 days' WHERE id = ?", [visitor_id($old)]);
    dbExec("CREATE OR REPLACE FUNCTION survey_test_refuse() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'the test refuses to end visitor %', OLD.id; END \$\$");
    dbExec('CREATE TRIGGER survey_test_refuse BEFORE UPDATE ON users FOR EACH ROW WHEN (OLD.visitor_key_hash IS NOT NULL AND NEW.visitor_key_hash IS NULL) EXECUTE FUNCTION survey_test_refuse()');
    try {
        // A new visitor: the clean-up runs after this answer, whatever the marker says.
        $sent = nobody('POST', '/api/surveys/second/responses', answers());
        assert_same(201, $sent['status'], $sent['raw']);
        assert_match(KEY_PATTERN, (string) ($sent['headers']['x-visitor-key'] ?? ''));
        assert_same(1, (int) dbValue('SELECT count(*) FROM responses WHERE id = ?', [$sent['body']['id']]), 'kept');
        assert_match('/\[after the answer\] PDOException: .*the test refuses to end visitor/', server_log());
        assert_same(hash('sha256', $old), dbValue('SELECT visitor_key_hash FROM users WHERE id = ?', [visitor_id($old)]), 'rolled back whole');
    } finally {
        dbExec('DROP TRIGGER IF EXISTS survey_test_refuse ON users');
    }
});

test('an ADMIN deleting answers: an ended visitor left with none goes - one answer, or a whole survey - and the rest stay', function (): void {
    fresh();
    $one = visitor_id(new_visitor('first'));
    $two = new_visitor('first');
    assert_same(201, as_visitor($two, 'POST', '/api/surveys/third/responses', answers())['status']);
    $two = visitor_id($two);
    $alive = visitor_id(new_visitor('first'));
    dbExec('UPDATE users SET visitor_key_hash = NULL WHERE id IN (?, ?)', [$one, $two]);

    $answer = (string) dbValue('SELECT id FROM responses WHERE user_id = ?', [$one]);
    assert_same(204, as_user(OWNER, 'DELETE', "/api/admin/responses/$answer")['status']);
    assert_same(null, dbValue('SELECT id FROM users WHERE id = ?', [$one]), 'an ended visitor with no answers left goes');

    $doomed = make_survey('doomed');
    $three = new_visitor('doomed');
    dbExec('INSERT INTO responses (survey_id, user_id, started_at) VALUES (?, ?, now())', [$doomed, $two]);
    $three = visitor_id($three);
    dbExec('UPDATE users SET visitor_key_hash = NULL WHERE id = ?', [$three]);
    assert_same(204, as_user(OWNER, 'DELETE', "/api/admin/surveys/$doomed")['status']);
    assert_same(null, dbValue('SELECT id FROM users WHERE id = ?', [$three]), 'answers only there: gone with the survey');
    assert_same($two, (int) dbValue('SELECT id FROM users WHERE id = ?', [$two]), 'answers elsewhere too: stays');
    assert_same($alive, (int) dbValue('SELECT id FROM users WHERE id = ?', [$alive]));
});

test('the move at sign-in: the visitor\'s answers become the person\'s, a survey both answered keeps the person\'s, and the key opens nothing after', function (): void {
    fresh();
    $key = new_visitor('first');
    assert_same(201, as_visitor($key, 'POST', '/api/surveys/second/responses', answers('o-anemo') + ['language' => 'en'])['status']);
    $visitor = visitor_id($key);
    assert_same(201, as_user(PAT, 'POST', '/api/surveys/first/responses', answers('o-anemo'))['status']);
    assert_same(201, as_user(QUINN, 'POST', '/api/surveys/second/responses', answers())['status']);
    $mine = dbOne("SELECT r.* FROM responses r JOIN surveys s ON s.id = r.survey_id WHERE s.slug = 'first' AND r.user_id = ?", [PAT]);
    $theirs = dbOne("SELECT r.* FROM responses r JOIN surveys s ON s.id = r.survey_id WHERE s.slug = 'second' AND r.user_id = ?", [$visitor]);
    $quinn = dbAll('SELECT * FROM responses WHERE user_id = ?', [QUINN]);

    $moved = as_user(PAT, 'POST', '/api/visitor/move', null, ["X-Visitor-Key: $key"]);
    assert_same([200, ['found' => true, 'moved' => 1, 'kept' => 1]], [$moved['status'], $moved['body']]);
    assert_same($mine, dbOne('SELECT * FROM responses WHERE id = ?', [$mine['id']]), 'the person\'s own answers to a survey both answered, as they were');
    assert_same(array_replace($theirs, ['user_id' => PAT]), dbOne('SELECT * FROM responses WHERE id = ?', [$theirs['id']]), 'the other survey\'s now the person\'s, with its language and times');
    assert_same(2, (int) dbValue('SELECT count(*) FROM responses WHERE user_id = ?', [PAT]));
    assert_same([0, null], [(int) dbValue('SELECT count(*) FROM responses WHERE user_id = ?', [$visitor]), dbValue('SELECT id FROM users WHERE id = ?', [$visitor])], 'the visitor is gone');
    assert_same($quinn, dbAll('SELECT * FROM responses WHERE user_id = ?', [QUINN]), 'nobody else\'s answers touched');
    assert_same([401, 'visitor_unknown'], [as_visitor($key, 'GET', '/api/surveys')['status'], as_visitor($key, 'GET', '/api/surveys')['body']['code'] ?? null]);

    $again = as_user(PAT, 'POST', '/api/visitor/move', null, ["X-Visitor-Key: $key"]);
    assert_same([200, ['found' => false, 'moved' => 0, 'kept' => 0]], [$again['status'], $again['body']], 'asked again (another tab): nothing to move, no error');

    $none = as_user(PAT, 'POST', '/api/visitor/move');
    assert_same([422, 'invalid_visitor_key'], [$none['status'], $none['body']['code'] ?? null], 'no key');
    $bad = as_user(PAT, 'POST', '/api/visitor/move', null, ['X-Visitor-Key: not a key']);
    assert_same([422, 'invalid_visitor_key'], [$bad['status'], $bad['body']['code'] ?? null], 'not a key');

    // Switched on, what a visitor answered before still comes in at sign-in.
    $later = new_visitor('third');
    switch_to(true);
    $on = as_user(QUINN, 'POST', '/api/visitor/move', null, ["X-Visitor-Key: $later"]);
    assert_same([200, ['found' => true, 'moved' => 1, 'kept' => 0]], [$on['status'], $on['body']], 'switched on, it still moves');
    assert_same(0, (int) dbValue('SELECT count(*) FROM users WHERE id < 0'));
});

test('the move waits for the person\'s own answers being written at that moment, and keeps them', function (): void {
    fresh();
    $key = new_visitor('first');
    as_user(PAT, 'GET', '/api/surveys');
    // The person sends the same survey in another tab, and that is not finished. Its insert holds the
    // person's row as every answer does (FOR KEY SHARE, the foreign key's) - which the move's own
    // bookkeeping of the person (usersSeen()) does not wait for: only its FOR UPDATE does.
    $other = somebody_else();
    $other->beginTransaction();
    $other->exec("INSERT INTO responses (survey_id, user_id, started_at) VALUES ('" . $GLOBALS['surveys']['first'] . "', " . PAT . ', now())');
    $pending = begin_call($GLOBALS['app']['base'], 'POST', '/api/visitor/move', null, array_merge(bearer(test_token(PAT, ['MEMBER'])), ["X-Visitor-Key: $key"]));
    try {
        if (!$pending['waits']()) {
            fail('the move did not wait, and answered ' . test_show($pending['answer']()));
        }
        $other->commit();
        $answer = $pending['answer']();
        assert_same([200, ['found' => true, 'moved' => 0, 'kept' => 1]], [$answer['status'], $answer['body']], 'the person\'s answers kept, the visitor\'s let go');
        assert_same(1, (int) dbValue('SELECT count(*) FROM responses WHERE user_id = ?', [PAT]));
    } finally {
        if ($other->inTransaction()) {
            $other->rollBack();
        }
        $pending['answer']();
    }
});

test('a move that cannot have its rows in time: 503 visitor_move_retry, nothing moved - and asked again, it goes through', function (): void {
    fresh();
    $key = new_visitor('first');
    $visitor = visitor_id($key);
    $other = somebody_else();
    $other->beginTransaction();
    $other->query("SELECT id FROM users WHERE id = $visitor FOR UPDATE");
    try {
        $answer = as_user(PAT, 'POST', '/api/visitor/move', null, ["X-Visitor-Key: $key"]);
        assert_same([503, 'visitor_move_retry', '2'], [$answer['status'], $answer['body']['code'] ?? null, $answer['headers']['retry-after'] ?? null]);
    } finally {
        $other->rollBack();
    }
    assert_same([$visitor, 1], [visitor_id($key), (int) dbValue('SELECT count(*) FROM responses WHERE user_id = ?', [$visitor])], 'nothing moved');
    $again = as_user(PAT, 'POST', '/api/visitor/move', null, ["X-Visitor-Key: $key"]);
    assert_same([200, ['found' => true, 'moved' => 1, 'kept' => 0]], [$again['status'], $again['body']]);
});

test('the results: a visitor is "Visitor N" from its own id, with no address, and says it is one', function (): void {
    fresh();
    $visitor = visitor_id(new_visitor('first'));
    assert_same(201, as_user(PAT, 'POST', '/api/surveys/first/responses', answers())['status']);
    $people = array_column(as_user(OWNER, 'GET', '/api/admin/surveys/' . $GLOBALS['surveys']['first'] . '/responses')['body']['responses'], 'person', 'id');
    $byId = array_column($people, null, 'id');
    assert_same(['id' => (string) $visitor, 'name' => 'Visitor ' . -$visitor, 'visitor' => true], $byId[(string) $visitor]);
    assert_same(['id' => (string) PAT, 'name' => 'user' . PAT, 'visitor' => false], $byId[(string) PAT], 'a person by their IAM name; nobody\'s address');
});

test('the error log reads where a request comes from by these same settings: behind the proxy they trust, each visitor\'s pages report on their own budget', function (): void {
    // This file's visitors.local.php trusts 127.0.0.1 - the tests - about CF-Connecting-IP: so does the error log
    // (surveyAdminContext()), whose pages' reports count 20 an hour a sender.
    $report = static fn(string $ip, string $message): array => nobody('POST', '/api/client-errors', ['message' => $message], $ip);
    for ($i = 1; $i <= 20; $i++) {
        assert_same(204, $report('203.0.113.70', "A page's error $i")['status'], "report $i from one visitor");
    }
    $over = $report('203.0.113.70', 'One too many');
    assert_same([429, 'too_many'], [$over['status'], $over['body']['code'] ?? null], 'the 21st from that visitor within the hour');
    assert_same(204, $report('203.0.113.71', 'Another visitor\'s')['status'], 'another visitor behind the same proxy: a budget of their own');
});

test('with the origin secret, a Worker writing a new CF-Connecting-IP every time is one sender - the edge - in the visitors\' limit and the pages\' reports alike; through the zone, each visitor their own', function (): void {
    fresh();
    // A server of its own with a config/cloudflare.local.php: the proxy this file trusts (127.0.0.1, the tests)
    // stands for an edge of Cloudflare's, which carries anybody's requests - the owner's zone's alone with the secret.
    $secret = 'origin-' . bin2hex(random_bytes(20));
    $app = start_app(test_iam(['application_file' => $GLOBALS['switch']]), [], VISITOR_SETTINGS, ['origin_secret' => $secret]);
    touch($app['config'] . '/storage/visitors-swept'); // no clean-up in this test, as fresh() says for the other server
    try {
        $answer = static fn(string $ip, array $headers = []): array => call($app['base'], 'POST', '/api/surveys/first/responses', answers(), array_merge(["CF-Connecting-IP: $ip"], $headers));
        for ($i = 1; $i <= 3; $i++) {
            $made = $answer("203.0.113.8$i");
            assert_same(201, $made['status'], "made-up visitor $i: " . $made['raw']);
        }
        $fourth = $answer('203.0.113.89');
        assert_same([429, 'too_many_visitors'], [$fourth['status'], $fourth['body']['code'] ?? null], 'the fourth, from an address never seen: the edge\'s limit is spent');
        $wrong = $answer('203.0.113.90', ['X-Anotoki-Origin: not the secret']);
        assert_same([429, 'too_many_visitors'], [$wrong['status'], $wrong['body']['code'] ?? null], 'a wrong secret: the edge too');
        assert_same(3, counters()[address_counter('127.0.0.1', $app)] ?? null, 'counted as the edge: ' . test_show(counters()));
        foreach (['203.0.113.81', '203.0.113.89', '203.0.113.90'] as $claimed) {
            assert_false(isset(counters()[address_counter($claimed, $app)]), "never as $claimed, the address it claimed");
        }
        $real = $answer('203.0.113.91', ["X-Anotoki-Origin: $secret"]);
        assert_same(201, $real['status'], 'through the owner\'s zone: the visitor it names - ' . $real['raw']);
        assert_same(1, counters()[address_counter('203.0.113.91', $app)] ?? null, 'counted as that visitor');

        // The pages' own errors: the library's limit (20 an hour a sender), by surveyAdminContext()'s reading.
        $report = static fn(string $ip, array $headers = []): array => call($app['base'], 'POST', '/api/client-errors', ['message' => "A page's error from $ip"], array_merge(["CF-Connecting-IP: $ip"], $headers));
        for ($i = 1; $i <= 20; $i++) {
            assert_same(204, $report("198.51.100.$i")['status'], "report $i, from a made-up visitor");
        }
        $over = $report('198.51.100.21');
        assert_same([429, 'too_many'], [$over['status'], $over['body']['code'] ?? null], 'the 21st, from an address never seen: the edge\'s budget is spent');
        assert_same(204, $report('198.51.100.22', ["X-Anotoki-Origin: $secret"])['status'], 'through the zone: a visitor with a budget of their own');
        assert_same([], server_problems($app), 'its server said nothing it should not have');
    } finally {
        $app['stop']();
    }
});

test('a config/cloudflare.local.php that cannot be read cleanly - saved with a byte-order mark before <?php declare(strict_types=1), a file PHP could not even compile - fails closed: never printed, the site keeps answering, and a Worker writing a new CF-Connecting-IP every time is one sender, the edge - the file\'s own secret in X-Anotoki-Origin too', function (): void {
    fresh();
    // The owner meant a secret, and the file holds one - but it starts with a byte-order mark, before a
    // declare(strict_types=1): compiled, a fatal error no handler catches, every request a 500. The site never
    // compiles it, reads no secret from it, and believes no CF-Connecting-IP from the proxy it trusts (127.0.0.1,
    // standing for an edge of Cloudflare's) - never "no secret", which would believe anybody's Worker there.
    $secret = 'origin-' . bin2hex(random_bytes(20));
    $app = start_app(test_iam(['application_file' => $GLOBALS['switch']]), [], VISITOR_SETTINGS);
    file_put_contents($app['config'] . '/cloudflare.local.php', "\xEF\xBB\xBF<?php declare(strict_types=1);\n\nreturn " . var_export(['origin_secret' => $secret], true) . ";\n");
    touch($app['config'] . '/storage/visitors-swept'); // no clean-up in this test, as fresh() says for the other server
    try {
        $answer = static fn(string $ip, array $headers = []): array => call($app['base'], 'POST', '/api/surveys/first/responses', answers(), array_merge(["CF-Connecting-IP: $ip"], $headers));
        for ($i = 1; $i <= 3; $i++) {
            $made = $answer("203.0.113.6$i", ["X-Anotoki-Origin: $secret"]);
            assert_same(201, $made['status'], "made-up visitor $i: " . $made['raw']);
            assert_true(str_starts_with($made['raw'], '{') && !str_contains($made['raw'], $secret), "made-up visitor $i: nothing of the file printed ahead of the answer");
        }
        $fourth = $answer('203.0.113.69', ["X-Anotoki-Origin: $secret"]);
        assert_same([429, 'too_many_visitors'], [$fourth['status'], $fourth['body']['code'] ?? null], 'the fourth, from an address never seen: the edge\'s limit is spent');
        assert_same(3, counters()[address_counter('127.0.0.1', $app)] ?? null, 'every one counted as the edge: ' . test_show(counters()));
        foreach (['203.0.113.61', '203.0.113.69'] as $claimed) {
            assert_false(isset(counters()[address_counter($claimed, $app)]), "never as $claimed, the address it claimed");
        }

        $status = call($app['base'], 'GET', '/api/site-status');
        assert_same([200, 'ready'], [$status['status'], $status['body']['state'] ?? null], 'the site keeps running: the file is optional');
        assert_false(str_contains($status['raw'], $secret), 'and says nothing of it');

        $log = (string) file_get_contents($app['log']);
        assert_true(str_contains($log, '[cloudflare] config/cloudflare.local.php does not start with <?php') && str_contains($log, 'no request carries its secret'), 'said in the server\'s log: ' . $log);
        assert_same(1, substr_count($log, '[cloudflare] config/cloudflare.local.php does not start with <?php'), 'once, read on every request');
        assert_false(str_contains($log, $secret), 'never the secret');
        assert_false(str_contains($log, 'strict_types'), 'never compiled: no fatal error');
        assert_same([], server_problems($app), 'its server said nothing it should not have');
    } finally {
        $app['stop']();
    }
});

test('the server said nothing it should not have', function (): void {
    assert_same([], server_problems($GLOBALS['app']));
});
