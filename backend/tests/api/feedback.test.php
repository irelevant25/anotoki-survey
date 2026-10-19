<?php

// Feedback through the real server: the anotoki family's form and admin page
// (anotoki-lib's Feedback, api/admin_tools.php) on this site - the form's
// route (routes/feedback.php) anybody's, whether the IAM requires signing in
// here or not, the sender from the token alone, nothing of where a message
// came from kept with it, the library's limits, its robots' field; the
// Feedback page (routes/admin.php) the site's ADMIN's alone, its status changes
// and deletes audited; what is kept no longer pruned when a message comes; and
// an account the IAM deleted - or a person's answers deleted on the People page
// - leaving its messages' words without their reply address and browser.
//
// The tests stand behind the proxy the visitor settings trust (127.0.0.1): each
// request names its own address in CF-Connecting-IP. The IAM's list of deleted
// accounts is a file (anonymized_file), its answer about signing in another
// (application_file): no test asks an IAM.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const OWNER = 1; // ADMIN
const EDITH = 2; // EDITOR
const PAT = 101; // takes surveys
const QUINN = 102; // takes surveys
const NEWCOMER = 104; // signs in here for the first time by sending a message

/** A file the tests make the database wait for (it runs again over what it wrote). */
const FILE_007 = '007_visitor_strings.sql';

$GLOBALS['app'] = null;
$GLOBALS['deleted'] = '';
$GLOBALS['switch'] = '';
before(function (): void {
    $GLOBALS['deleted'] = test_anonymized_file([]);
    $GLOBALS['switch'] = test_application_file(true);
    $GLOBALS['app'] = start_app(test_iam(['anonymized_file' => $GLOBALS['deleted'], 'application_file' => $GLOBALS['switch']]), [], ['trusted_proxies' => ['127.0.0.1']]);
});

function roles_of(int $user): array
{
    return match ($user) {
        OWNER => ['MEMBER', 'ADMIN'],
        EDITH => ['MEMBER', 'EDITOR'],
        default => ['MEMBER'],
    };
}

/** A request of $user's, from $ip. */
function as_user(int $user, string $method, string $url, mixed $body = null, string $ip = '198.51.100.200', array $headers = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, array_merge($headers, ["CF-Connecting-IP: $ip"], bearer(test_token($user, roles_of($user)))));
}

/** Nobody signed in, from $ip. */
function nobody(string $method, string $url, mixed $body = null, string $ip = '198.51.100.201', array $headers = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, array_merge($headers, ["CF-Connecting-IP: $ip"]));
}

/** A message as the library's form sends one, $fields over it. */
function message(array $fields = []): array
{
    return $fields + ['kind' => 'idea', 'message' => 'More surveys, please.', 'page' => '/contact', 'language' => 'en', 'website' => ''];
}

/** Every message kept, oldest first. */
function kept(): array
{
    return dbAll('SELECT id, kind, status, subject, message, contact_email, user_id, page, language, user_agent, details::text AS details FROM anotoki_feedback ORDER BY id');
}

/** The limits' count, the prune's stamp: the server's storage. */
function storage(string $file = ''): string
{
    return $GLOBALS['app']['config'] . '/storage' . ($file === '' ? '' : "/$file");
}

/** No message, no count - and the day's prune said to be done: each test starts here. */
function fresh(): void
{
    dbExec('DELETE FROM anotoki_feedback');
    @unlink(storage('cache/anotoki-feedback-limits.json'));
    file_put_contents(storage('cache/anotoki-feedback-prune.stamp'), time() . "\n");
    file_put_contents($GLOBALS['switch'], json_encode(['client_id' => TEST_CLIENT, 'name' => 'Test', 'login_required' => true]));
}

/** The IAM deletes these accounts: [sub => when] (the list the scrub reads). */
function iam_deleted(array $accounts): void
{
    test_write_anonymized($GLOBALS['deleted'], $accounts);
}

test(
    'anybody may send a message - nobody, a person, whether the IAM requires signing in here or not: 201 {ok}, and what is kept is what the form sent, the sender from the token, nothing of where it came from',
    function (): void {
        fresh();
        $sent = nobody(
            'POST',
            '/api/feedback',
            message(['kind' => 'bug', 'subject' => 'The Next button', 'message' => 'It does nothing on step 2.', 'page' => '/autumn?step=2#q', 'language' => 'sk']),
            '203.0.113.9',
            ['User-Agent: TestBrowser/1.0'],
        );
        assert_same([201, ['ok' => true]], [$sent['status'], $sent['body']], 'nobody, while sign-in is required: the Contact page is anybody\'s, and so is its form');
        $row = kept()[0];
        assert_same(
            ['bug', 'new', 'The Next button', 'It does nothing on step 2.', null, null, '/autumn', 'sk', 'TestBrowser/1.0', '{}'],
            [$row['kind'], $row['status'], $row['subject'], $row['message'], $row['contact_email'], $row['user_id'], $row['page'], $row['language'], $row['user_agent'], $row['details']],
            'the page as a path - never its query or fragment -, the language, the browser\'s name; no account, no address',
        );

        // Nothing of where a message came from: no column for it, and the address it came from is nowhere in the row.
        $columns = array_column(dbAll("SELECT column_name FROM information_schema.columns WHERE table_name = 'anotoki_feedback' ORDER BY ordinal_position"), 'column_name');
        assert_same(
            ['id', 'created_at', 'updated_at', 'kind', 'status', 'section', 'subject', 'message', 'details', 'contact_email', 'user_id', 'page', 'language', 'user_agent', 'handled_by', 'handled_at'],
            $columns,
            'the library\'s table: no network address, no hash of one',
        );
        assert_false(str_contains(json_encode(dbAll('SELECT * FROM anotoki_feedback')), '203.0.113.9'), 'the sender\'s address is in no message');

        // A person: their id from the token - never the body's -, and no address the form did not send.
        $person = as_user(PAT, 'POST', '/api/feedback', message(['message' => 'Thank you for the survey.', 'user_id' => 999, 'id' => 999]));
        assert_same(201, $person['status'], test_show($person['body']));
        $row = kept()[1];
        assert_same([PAT, null], [(int) $row['user_id'], $row['contact_email']], 'the token\'s person; the server fills in no address');
        $answer = as_user(PAT, 'POST', '/api/feedback', message(['message' => 'Write back, please.', 'email' => 'pat@example.org']));
        assert_same(201, $answer['status']);
        assert_same('pat@example.org', kept()[2]['contact_email'], 'the reply address the form sent');
        // "Without my name": neither the account nor an address goes with it.
        $anonymous = as_user(PAT, 'POST', '/api/feedback', message(['message' => 'Without my name.', 'email' => 'pat@example.org', 'anonymous' => true]));
        assert_same(201, $anonymous['status']);
        assert_same([null, null], [kept()[3]['user_id'], kept()[3]['contact_email']], 'sent without a name');

        // A person who never touched the site's data before: their row is kept from the token, so the page can name them.
        assert_same(null, dbValue('SELECT id FROM users WHERE id = ?', [NEWCOMER]));
        assert_same(201, as_user(NEWCOMER, 'POST', '/api/feedback', message())['status']);
        assert_same('user' . NEWCOMER, dbValue('SELECT preferred_username FROM users WHERE id = ?', [NEWCOMER]), 'recorded, by name - no address');

        // With visitors welcome, a visitor's key is never read here: they send as nobody, and no visitor is made.
        file_put_contents($GLOBALS['switch'], json_encode(['client_id' => TEST_CLIENT, 'name' => 'Test', 'login_required' => false]));
        $visitors = (int) dbValue('SELECT count(*) FROM users WHERE id < 0');
        $visitor = nobody('POST', '/api/feedback', message(['message' => 'A visitor\'s idea.']), '203.0.113.8', ['X-Visitor-Key: ' . str_repeat('k', 43)]);
        assert_same(201, $visitor['status'], test_show($visitor['body']));
        assert_same([null, $visitors], [kept()[5]['user_id'], (int) dbValue('SELECT count(*) FROM users WHERE id < 0')], 'nobody\'s message; no visitor made');
    },
);

test('only a Bearer token claims to be somebody: one that does not check out is 401 invalid_token, never nobody - and nothing is kept', function (): void {
    fresh();
    foreach (
        ['garbage' => 'Authorization: Bearer garbage', 'empty' => 'Authorization: Bearer ', 'another key' => 'Authorization: Bearer ' . test_token(PAT, [], [], ['iam' => test_forger()])]
        as $case => $header
    ) {
        $refused = nobody('POST', '/api/feedback', message(), '203.0.113.20', [$header]);
        assert_same([401, 'invalid_token'], [$refused['status'], $refused['body']['code'] ?? null], $case);
    }
    $basic = nobody('POST', '/api/feedback', message(), '203.0.113.21', ['Authorization: Basic ' . base64_encode('owner:secret')]);
    assert_same(201, $basic['status'], 'another scheme claims nobody: a host\'s password file sends Basic');
    assert_same([null], array_column(kept(), 'user_id'), 'only that one kept, nobody\'s');
});

test(
    'what the form checks, the server checks: the kind, the message, an address, the lengths, the body - 422 and nothing kept; the robots\' field filled: the same 201, and nothing kept',
    function (): void {
        fresh();
        foreach (
            [
                'no kind' => [message(['kind' => 'complaint']), 422, 'kind_unknown'],
                'no message' => [message(['message' => "  \n "]), 422, 'message_required'],
                'too long' => [message(['message' => str_repeat('a', 10001)]), 422, 'too_long'],
                'a long subject' => [message(['subject' => str_repeat('s', 201)]), 422, 'subject_too_long'],
                'no address' => [message(['email' => 'pat at example']), 422, 'email_invalid'],
                'an address that would add a recipient' => [message(['email' => 'pat@example.org?bcc=everybody@example.org']), 422, 'email_invalid'],
            ]
            as $case => [$body, $status, $code]
        ) {
            $refused = nobody('POST', '/api/feedback', $body, '203.0.113.30');
            assert_same([$status, $code], [$refused['status'], $refused['body']['code'] ?? null], $case);
        }
        $notJson = call($GLOBALS['app']['base'], 'POST', '/api/feedback', 'kind=idea&message=hello', ['Content-Type: application/x-www-form-urlencoded', 'CF-Connecting-IP: 203.0.113.30']);
        assert_same(415, $notJson['status'], 'JSON only');
        $huge = nobody('POST', '/api/feedback', message(['message' => str_repeat('x', 70000)]), '203.0.113.30');
        assert_same(413, $huge['status'], 'a body of at most 64 KB');
        assert_same([], kept(), 'none of them kept');

        $robot = nobody('POST', '/api/feedback', message(['website' => 'https://spam.example']), '203.0.113.31');
        assert_same([201, ['ok' => true]], [$robot['status'], $robot['body']], 'word for word a kept message\'s answer');
        assert_same([], kept(), 'and nothing kept');
    },
);

test(
    'the limits: 5 an hour from one sender - a person by their account wherever they are, anybody else by their address; a message "without my name" by its address; the count keeps no address',
    function (): void {
        fresh();
        for ($i = 1; $i <= 5; $i++) {
            assert_same(201, nobody('POST', '/api/feedback', message(['message' => "Idea $i"]), '203.0.113.40')['status'], "message $i from one address");
        }
        $sixth = nobody('POST', '/api/feedback', message(['message' => 'Idea 6']), '203.0.113.40');
        assert_same([429, 'too_many'], [$sixth['status'], $sixth['body']['code'] ?? null], 'the sixth within the hour');
        assert_true(($sixth['body']['retry_after'] ?? 0) > 3000, 'and when one more fits: within the hour');
        assert_same(201, nobody('POST', '/api/feedback', message(['message' => 'Mine']), '203.0.113.41')['status'], 'another address: a budget of its own');

        for ($i = 1; $i <= 5; $i++) {
            assert_same(201, as_user(QUINN, 'POST', '/api/feedback', message(['message' => "Quinn's $i"]), "198.51.100.$i")['status'], "Quinn's message $i, each from another address");
        }
        $over = as_user(QUINN, 'POST', '/api/feedback', message(['message' => "Quinn's 6"]), '198.51.100.99');
        assert_same([429, 'too_many'], [$over['status'], $over['body']['code'] ?? null], 'a person is counted by their account: a new address changes nothing');
        $anonymous = as_user(QUINN, 'POST', '/api/feedback', message(['message' => 'Without my name', 'anonymous' => true]), '198.51.100.98');
        assert_same(201, $anonymous['status'], '"without my name" is counted by its address, never tied to the account');
        assert_same(12, count(kept()));

        $count = (string) file_get_contents(storage('cache/anotoki-feedback-limits.json'));
        foreach (['203.0.113.40', '203.0.113.41', '198.51.100.98', (string) QUINN] as $what) {
            assert_false(str_contains($count, $what), "the count holds no $what in the clear");
        }
        $state = json_decode($count, true);
        foreach (array_merge(array_keys($state['visitors'] ?? []), array_keys($state['accounts'] ?? [])) as $sender) {
            assert_match('/^[0-9a-f]{64}$/D', (string) $sender, 'each sender a keyed hash');
        }
    },
);

test('the Feedback page is the site\'s ADMIN\'s alone: nobody is asked to sign in, a participant and an EDITOR are refused in this site\'s words, a visitor\'s key is nobody', function (): void {
    foreach (
        ['GET /api/admin/feedback', 'GET /api/admin/feedback/facets', 'GET /api/admin/feedback/unread', 'GET /api/admin/feedback/1', 'PUT /api/admin/feedback/1/status', 'DELETE /api/admin/feedback/1']
        as $route
    ) {
        [$method, $url] = explode(' ', $route);
        $body = $method === 'PUT' ? ['status' => 'resolved'] : null;
        $nobody = nobody($method, $url, $body);
        assert_same([401, 'sign_in_required'], [$nobody['status'], $nobody['body']['code'] ?? null], "$route, nobody");
        foreach ([PAT => 'a participant', EDITH => 'an EDITOR'] as $user => $who) {
            $refused = as_user($user, $method, $url, $body);
            assert_same(
                [403, 'forbidden', 'Only an administrator of the survey site may do this.'],
                [$refused['status'], $refused['body']['code'] ?? null, $refused['body']['error'] ?? null],
                "$route, $who",
            );
        }
        assert_same(401, nobody($method, $url, $body, '198.51.100.201', ['X-Visitor-Key: ' . str_repeat('k', 43)])['status'], "$route: a visitor's key is nobody here");
    }
});

test('the Feedback page: newest first, each sender by name; the counts; a new message opened is read; a status change and a delete audited - the delete inside its own transaction', function (): void {
    fresh();
    // The owner's row, as any page of the site keeps it (the admin tools' routes record nobody): the page names who handled what.
    assert_same(200, as_user(OWNER, 'GET', '/api/surveys')['status']);
    assert_same(201, as_user(PAT, 'POST', '/api/feedback', message(['kind' => 'bug', 'message' => 'The picture does not open.', 'email' => 'pat@example.org']))['status']);
    assert_same(201, nobody('POST', '/api/feedback', message(['message' => 'An idea from nobody.']), '203.0.113.50')['status']);

    $list = as_user(OWNER, 'GET', '/api/admin/feedback');
    assert_same(200, $list['status'], test_show($list['body']));
    assert_same([2, 1, 25], [$list['body']['total'], $list['body']['page'], $list['body']['pageSize']]);
    [$newest, $older] = $list['body']['items'];
    assert_same(['An idea from nobody.', null, null], [$newest['message'], $newest['user_id'], $newest['user_name']], 'newest first; nobody\'s');
    assert_same([PAT, 'user' . PAT, 'pat@example.org', 'bug'], [$older['user_id'], $older['user_name'], $older['contact_email'], $older['kind']], 'a person by the name the site has for them');
    assert_same(['bug' => 1, 'idea' => 1, 'other' => 0], as_user(OWNER, 'GET', '/api/admin/feedback/facets')['body']['byKind']);
    assert_same(['unread' => 2], as_user(OWNER, 'GET', '/api/admin/feedback/unread')['body'], 'the admin bar\'s count');
    assert_same(1, as_user(OWNER, 'GET', '/api/admin/feedback?kind=bug&search=picture')['body']['total'], 'narrowed by kind and words');

    // Opening one only reads it (anotoki-lib 0.8.1): a GET changes nothing. The page marks a new one read by a PUT of its own.
    $opened = as_user(OWNER, 'GET', '/api/admin/feedback/' . $older['id']);
    assert_same([200, 'new'], [$opened['status'], $opened['body']['message']['status']], 'opened: still new');
    assert_same(['unread' => 2], as_user(OWNER, 'GET', '/api/admin/feedback/unread')['body'], 'a GET marks nothing read');
    $marked = as_user(OWNER, 'PUT', '/api/admin/feedback/' . $older['id'] . '/read', new stdClass());
    assert_same([200, 'read'], [$marked['status'], $marked['body']['message']['status'] ?? null], 'marked read by its own write - nobody named for it');
    assert_same(['unread' => 1], as_user(OWNER, 'GET', '/api/admin/feedback/unread')['body']);

    $resolved = as_user(OWNER, 'PUT', '/api/admin/feedback/' . $older['id'] . '/status', ['status' => 'resolved']);
    assert_same(
        [200, 'resolved', OWNER, 'user' . OWNER],
        [$resolved['status'], $resolved['body']['message']['status'], $resolved['body']['message']['handled_by'], $resolved['body']['message']['handled_by_name']],
    );
    $entry = dbOne("SELECT actor_id, target_type, target_id, details FROM anotoki_audit_log WHERE action = 'feedback.status_changed' ORDER BY id DESC LIMIT 1");
    // JSONB keeps an object's keys in an order of its own: compared sorted.
    assert_same(
        [OWNER, 'feedback', (string) $older['id'], sorted(['from' => 'read', 'to' => 'resolved'])],
        [(int) $entry['actor_id'], $entry['target_type'], $entry['target_id'], sorted(json_decode((string) $entry['details'], true))],
        'audited, by the token\'s person',
    );
    $unknown = as_user(OWNER, 'PUT', '/api/admin/feedback/' . $older['id'] . '/status', ['status' => 'archived']);
    assert_same([422, 'status_unknown'], [$unknown['status'], $unknown['body']['code'] ?? null]);

    $deleted = as_user(OWNER, 'DELETE', '/api/admin/feedback/' . $older['id']);
    assert_same([200, ['deleted' => true]], [$deleted['status'], $deleted['body']]);
    assert_same(['An idea from nobody.'], array_column(kept(), 'message'), 'that one gone');
    $entry = dbOne("SELECT actor_id, target_id, details FROM anotoki_audit_log WHERE action = 'feedback.deleted' ORDER BY id DESC LIMIT 1");
    $details = json_decode((string) $entry['details'], true);
    assert_same(
        [OWNER, (string) $older['id'], 'bug', 'resolved'],
        [(int) $entry['actor_id'], $entry['target_id'], $details['kind'] ?? null, $details['status'] ?? null],
        'audited with what a restore deletes it again by',
    );
    assert_match('/^[0-9]{1,18}$/D', (string) ($details['_txid'] ?? ''), 'written inside the delete\'s own transaction');
    assert_false(str_contains((string) $entry['details'], 'pat@example.org'), 'the entry holds no reply address');
    foreach (['GET', 'DELETE'] as $method) {
        assert_same(
            [404, 'not_found'],
            [as_user(OWNER, $method, '/api/admin/feedback/' . $older['id'])['status'], as_user(OWNER, $method, '/api/admin/feedback/' . $older['id'])['body']['code'] ?? null],
            "$method of a message that is gone",
        );
    }
});

test(
    'kept no longer: spam 30 days after it was marked, a resolved message 365 days after - each at the first clean-up after that, run once a day at most, after a message is sent or the Feedback page is opened; the rest stays',
    function (): void {
        fresh();
        $old = static function (string $status, string $handled, string $text): void {
            dbExec(
                "INSERT INTO anotoki_feedback (kind, status, message, created_at, updated_at, handled_at) VALUES ('idea', ?, ?, now() - interval '2 years', now() - CAST(? AS interval), now() - CAST(? AS interval))",
                [$status, $text, $handled, $handled],
            );
        };
        $old('spam', '31 days', 'Spam, marked 31 days ago');
        $old('spam', '29 days', 'Spam, marked 29 days ago');
        $old('resolved', '366 days', 'Resolved 366 days ago');
        $old('resolved', '364 days', 'Resolved 364 days ago');
        $old('new', '3 years', 'New, never dealt with');
        $old('read', '3 years', 'Read, never dealt with');

        // The day's clean-up done already (fresh()): a message comes, nothing goes.
        assert_same(201, nobody('POST', '/api/feedback', message(['message' => 'Today\'s.']), '203.0.113.60')['status']);
        assert_same(7, count(kept()), 'once a day at most');

        // Due again: the next message lets it run, after the answer.
        unlink(storage('cache/anotoki-feedback-prune.stamp'));
        assert_same(201, nobody('POST', '/api/feedback', message(['message' => 'Tomorrow\'s.']), '203.0.113.61')['status']);
        assert_same(
            ['Spam, marked 29 days ago', 'Resolved 364 days ago', 'New, never dealt with', 'Read, never dealt with', 'Today\'s.', 'Tomorrow\'s.'],
            array_column(kept(), 'message'),
            'spam past 30 days and resolved past 365 gone; the rest kept until somebody deletes it',
        );

        // The Feedback page opened, due again: the same clean-up.
        $old('spam', '40 days', 'Spam, marked 40 days ago');
        unlink(storage('cache/anotoki-feedback-prune.stamp'));
        assert_same(200, as_user(OWNER, 'GET', '/api/admin/feedback')['status']);
        assert_false(in_array('Spam, marked 40 days ago', array_column(kept(), 'message'), true), 'the page opened: the clean-up ran after its answer');
    },
);

test('an account the IAM deleted: the messages it sent keep their words, and lose the reply address and the browser - had it a row here or not; nobody else\'s are touched', function (): void {
    fresh();
    assert_same(201, as_user(PAT, 'POST', '/api/feedback', message(['message' => 'Pat\'s words.', 'email' => 'pat@example.org']), '198.51.100.30', ['User-Agent: PatBrowser'])['status']);
    assert_same(201, as_user(QUINN, 'POST', '/api/feedback', message(['message' => 'Quinn\'s words.', 'email' => 'quinn@example.org']), '198.51.100.31', ['User-Agent: QuinnBrowser'])['status']);
    // A sender the site has no row of (made before the row was kept, say): the IAM's list reaches them too.
    dbExec("INSERT INTO anotoki_feedback (kind, message, contact_email, user_id, user_agent) VALUES ('other', 'Words of 555.', 'x@example.org', 555, 'OldBrowser')");

    iam_deleted([PAT => '2026-11-01T10:00:00Z', 555 => '2026-11-01T10:00:05Z']);
    $sync = as_user(OWNER, 'POST', '/api/admin/people/sync');
    assert_same(200, $sync['status'], test_show($sync['body']));

    $byText = array_column(kept(), null, 'message');
    assert_same(
        [PAT, null, null],
        [(int) $byText['Pat\'s words.']['user_id'], $byText['Pat\'s words.']['contact_email'], $byText['Pat\'s words.']['user_agent']],
        'Pat\'s words stay, his address and browser go',
    );
    assert_same([null, null], [$byText['Words of 555.']['contact_email'], $byText['Words of 555.']['user_agent']], 'and those of an account with no row here');
    assert_same(['quinn@example.org', 'QuinnBrowser'], [$byText['Quinn\'s words.']['contact_email'], $byText['Quinn\'s words.']['user_agent']], 'nobody else\'s');
    $listed = array_column(as_user(OWNER, 'GET', '/api/admin/feedback')['body']['items'], 'user_name', 'message');
    assert_same('deleted-' . PAT, $listed['Pat\'s words.'], 'the page names him by the IAM\'s placeholder');
    iam_deleted([]);
});

test('the People page\'s Delete of a person\'s answers takes their messages\' reply address and browser too (the library\'s), and leaves the words', function (): void {
    fresh();
    assert_same(201, as_user(QUINN, 'POST', '/api/feedback', message(['message' => 'Quinn again.', 'email' => 'quinn@example.org']), '198.51.100.32', ['User-Agent: QuinnBrowser'])['status']);
    $deleted = as_user(OWNER, 'DELETE', '/api/admin/people/' . QUINN);
    assert_same(200, $deleted['status'], test_show($deleted['body']));
    assert_same([['Quinn again.', null, null]], array_map(static fn(array $row): array => [$row['message'], $row['contact_email'], $row['user_agent']], kept()));
});

test('while an update waits the form is closed, as everything that writes the site\'s data: 503 update_pending, nothing kept - and so is the Feedback page', function (): void {
    fresh();
    dbExec('DELETE FROM migrations WHERE filename = ?', [FILE_007]);
    try {
        $closed = nobody('POST', '/api/feedback', message(), '203.0.113.70');
        assert_same([503, 'update_pending'], [$closed['status'], $closed['body']['code'] ?? null]);
        $page = as_user(OWNER, 'GET', '/api/admin/feedback');
        assert_same([503, 'update_pending'], [$page['status'], $page['body']['code'] ?? null], 'not one of the routes an update leaves open');
    } finally {
        dbExec('INSERT INTO migrations (filename) VALUES (?) ON CONFLICT DO NOTHING', [FILE_007]);
    }
    assert_same([], kept());
    assert_same(201, nobody('POST', '/api/feedback', message(), '203.0.113.71')['status'], 'up to date again: open');
});

test('the server said nothing it should not have', function (): void {
    assert_same([], server_problems($GLOBALS['app']));
});
