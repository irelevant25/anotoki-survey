<?php

// The people who signed in here, through the real server - the anotoki
// library's people module on this site's users table (api/people.php): their
// row kept from their token, with no address, and on no route that must work
// while an update waits; the People page's routes, the site's ADMIN's alone;
// Delete - every answer of theirs, audited; and the scrub of the accounts the
// IAM deleted (thirty days after their owner asked): the name blanked to the
// IAM's placeholder, the answers kept, a visitor never touched - after an
// answer, at most hourly, or now from the page. The IAM's list is a file here
// (anonymized_file): no test asks an IAM.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const OWNER = 1;       // ADMIN
const EDITH = 2;       // EDITOR
const PAT = 101;       // takes surveys
const QUINN = 102;     // takes surveys
const NEWCOMER = 104;  // signs in only in a test of what records nobody

$GLOBALS['app'] = null;
$GLOBALS['deleted'] = '';
before(function (): void {
    $GLOBALS['deleted'] = test_anonymized_file();
    $GLOBALS['app'] = start_app(test_iam(['anonymized_file' => $GLOBALS['deleted']]));
});

function roles_of(int $user): array
{
    return match ($user) {
        OWNER => ['MEMBER', 'ADMIN'],
        EDITH => ['MEMBER', 'EDITOR'],
        default => ['MEMBER'],
    };
}

function as_user(int $user, string $method, string $url, mixed $body = null, array $claims = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, bearer(test_token($user, roles_of($user), $claims)));
}

/** The IAM deletes these accounts: [sub => when] (the list the scrub reads). */
function iam_deleted(array $accounts): void
{
    test_write_anonymized($GLOBALS['deleted'], $accounts);
}

/** The folder the server keeps the IAM's answers and the scrub's stamp in. */
function iam_cache(): string
{
    return (string) (require $GLOBALS['app']['config'] . '/iam.local.php')['cache_dir'];
}

/** A survey as the editor makes it - one question - opened. Its id. */
function open_survey(string $slug): string
{
    $survey = [
        'id' => 'ignored', 'slug' => $slug, 'title' => "Survey $slug", 'status' => 'draft',
        'intro' => '<p>Hello.</p>', 'thanks' => '<p>Thanks.</p>', 'askAboutYou' => false, 'closesOn' => null,
        'language' => 'en', 'translations' => new stdClass(),
        'steps' => [['id' => 'step-1', 'title' => 'One', 'questions' => [[
            'id' => 'q-words', 'type' => 'text', 'text' => '<p>Anything?</p>', 'images' => [], 'required' => true,
            'options' => [], 'layout' => 'list', 'minChoices' => null, 'maxChoices' => null, 'multiline' => true, 'maxLength' => 200, 'placeholder' => '',
        ]]]],
    ];
    $made = as_user(EDITH, 'POST', '/api/admin/surveys', ['survey' => $survey]);
    assert_same(201, $made['status'], test_show($made['body']));
    $id = $made['body']['survey']['id'];
    assert_same(200, as_user(EDITH, 'POST', "/api/admin/surveys/$id/status", ['status' => 'open'])['status']);

    return $id;
}

function answer(int $user, string $slug, string $words = 'Yes.'): void
{
    $sent = as_user($user, 'POST', "/api/surveys/$slug/responses", [
        'aboutYou' => null, 'answers' => ['q-words' => ['optionIds' => [], 'other' => '', 'text' => $words]],
        'startedAt' => gmdate('Y-m-d\TH:i:s.v\Z'), 'language' => 'en',
    ]);
    assert_same(201, $sent['status'], test_show($sent['body']));
}

/** The People page's answer for the site's ADMIN. */
function people(string $query = ''): array
{
    $list = as_user(OWNER, 'GET', '/api/admin/people' . $query);
    assert_same(200, $list['status'], test_show($list['body']));

    return $list['body'];
}

/** A person's row as the page lists it. */
function listed(int $sub): ?array
{
    foreach (people()['people'] as $person) {
        if ($person['sub'] === (string) $sub) {
            return $person;
        }
    }

    return null;
}

test('the People page\'s routes are the site\'s ADMIN\'s alone: nobody is asked to sign in, a participant and an EDITOR are refused', function (): void {
    foreach (['GET /api/admin/people', 'DELETE /api/admin/people/' . PAT, 'POST /api/admin/people/sync'] as $route) {
        [$method, $url] = explode(' ', $route);
        $nobody = call($GLOBALS['app']['base'], $method, $url);
        assert_same([401, 'sign_in_required'], [$nobody['status'], $nobody['body']['code'] ?? null], "$route, nobody");
        foreach ([PAT => 'a participant', EDITH => 'an EDITOR'] as $user => $who) {
            $refused = as_user($user, $method, $url);
            assert_same([403, 'forbidden', 'Only an administrator of the survey site may do this.'], [$refused['status'], $refused['body']['code'] ?? null, $refused['body']['error'] ?? null], "$route, $who: this site's words, its error body");
        }
        $visitor = call($GLOBALS['app']['base'], $method, $url, null, ['X-Visitor-Key: ' . str_repeat('k', 43)]);
        assert_same(401, $visitor['status'], "$route: a visitor's key is nobody here");
    }
    assert_same(200, as_user(OWNER, 'GET', '/api/admin/people')['status']);
});

test('somebody signed in is recorded from their token - a name, when first and last seen, no address - but never on the routes that work while an update waits', function (): void {
    as_user(PAT, 'GET', '/api/surveys');
    $row = dbOne('SELECT preferred_username, first_seen_at IS NOT NULL AS first, last_seen_at IS NOT NULL AS last, anonymized_at FROM users WHERE id = ?', [PAT]);
    assert_same(['user' . PAT, true, true, null], [$row['preferred_username'], $row['first'], $row['last'], $row['anonymized_at']]);

    // A person who has never been here asks only what must work on a database still waiting for its update.
    foreach (['/api/admin/migrations', '/api/admin/errors', '/api/admin/backups'] as $url) {
        $answer = call($GLOBALS['app']['base'], 'GET', $url, null, bearer(test_token(NEWCOMER, ['MEMBER', 'ADMIN'])));
        assert_same(200, $answer['status'], $url);
    }
    assert_same(null, dbValue('SELECT id FROM users WHERE id = ?', [NEWCOMER]), 'no row written on the Migrations page\'s, the error log\'s or the backups\' routes');
    call($GLOBALS['app']['base'], 'GET', '/api/admin/surveys', null, bearer(test_token(NEWCOMER, ['MEMBER', 'ADMIN'])));
    assert_same((string) NEWCOMER, (string) dbValue('SELECT id FROM users WHERE id = ?', [NEWCOMER]), 'and written on the site\'s own');
    dbExec('DELETE FROM users WHERE id = ?', [NEWCOMER]);
});

test('the People page: everybody who signed in, newest seen first, with the surveys each answered and wrote; a search; the visitors in a line; where the scrub stands', function (): void {
    open_survey('first');
    open_survey('second');
    answer(PAT, 'first');
    answer(PAT, 'second');
    answer(QUINN, 'first');
    // Two visitors: one whose browser can still come back, one that ended (its answers stay as "Visitor N").
    dbExec("INSERT INTO users (id, visitor_key_hash, last_seen_at) VALUES (nextval('visitor_ids'), ?, now())", [hash('sha256', 'a visitor\'s key')]);
    dbExec("INSERT INTO users (id, last_seen_at) VALUES (nextval('visitor_ids'), now() - interval '40 days')");
    dbExec("UPDATE users SET last_seen_at = now() - interval '1 day' WHERE id = ?", [EDITH]);

    $page = people();
    assert_same([
        ['key' => 'answered', 'label' => 'Surveys answered', 'kind' => 'count'],
        ['key' => 'written', 'label' => 'Surveys written', 'kind' => 'count'],
    ], $page['columns']);
    assert_same([1, 50, true, []], [$page['page'], $page['page_size'], $page['ready'], $page['problems']], 'everything the module needs is there');
    assert_same(['count' => 2, 'active' => 1], $page['visitors'], 'the visitors in one line - never a row of the list');
    foreach ($page['people'] as $person) {
        assert_true((int) $person['sub'] > 0, 'people only: ' . $person['sub']);
    }
    $pat = listed(PAT);
    assert_same(['user' . PAT, 2, null, null, TEST_ISSUER . '/admin/users/' . PAT], [$pat['name'], $pat['answered'], $pat['written'], $pat['anonymized_at'], $pat['iam_url']], 'none written: no count (the page shows 0)');
    assert_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/D', (string) $pat['last_seen_at'], 'when, in UTC');
    $edith = listed(EDITH);
    assert_same([null, 2], [$edith['answered'], $edith['written']], 'the editor wrote both');
    $order = array_column($page['people'], 'sub');
    assert_true(array_search((string) EDITH, $order, true) > array_search((string) PAT, $order, true), 'seen a day ago: after those seen today');
    assert_false(array_key_exists('email', $pat), 'no address: the IAM keeps those, this site none');
    assert_true(array_key_exists('since', $page['sync']) && $page['sync']['since'] === null, 'where the scrub stands: it has found nobody to scrub yet');

    assert_same([(string) PAT], array_column(people('?q=user' . PAT)['people'], 'sub'), 'a search by name');
    assert_same([(string) QUINN], array_column(people('?q=' . QUINN)['people'], 'sub'), 'and by IAM id');
    $bad = as_user(OWNER, 'GET', '/api/admin/people?q=' . rawurlencode(str_repeat('x', 201)));
    assert_same([422, 'invalid_query'], [$bad['status'], $bad['body']['code'] ?? null], 'a search longer than any name');
});

test('Delete: every answer of the person goes - their row and the surveys they wrote stay - and the audit log says who did it; nobody with that id is 404', function (): void {
    $answers = (int) dbValue('SELECT count(*) FROM responses WHERE user_id = ?', [PAT]);
    assert_true($answers > 0, 'Pat has answers to delete');
    $others = (int) dbValue('SELECT count(*) FROM responses WHERE user_id <> ?', [PAT]);

    $deleted = as_user(OWNER, 'DELETE', '/api/admin/people/' . PAT);
    assert_same([200, ['deleted' => ['Answers' => $answers]]], [$deleted['status'], $deleted['body']], 'what went, by the page\'s label');
    assert_same([0, $others], [(int) dbValue('SELECT count(*) FROM responses WHERE user_id = ?', [PAT]), (int) dbValue('SELECT count(*) FROM responses WHERE user_id <> ?', [PAT])], 'theirs gone, nobody else\'s');
    assert_same((string) PAT, (string) dbValue('SELECT id FROM users WHERE id = ?', [PAT]), 'their row stays: they signed in here');
    $entry = dbOne("SELECT actor_id, target_type, target_id, details FROM anotoki_audit_log WHERE action = 'person.data_deleted' ORDER BY id DESC LIMIT 1");
    $details = json_decode((string) $entry['details'], true);
    assert_same([OWNER, 'user', (string) PAT, ['Answers' => $answers]], [(int) $entry['actor_id'], $entry['target_type'], $entry['target_id'], $details['deleted'] ?? null], 'audited, by the token\'s sub');
    assert_match('/^[0-9]{1,18}$/D', (string) ($details['_txid'] ?? ''), 'written inside the delete\'s own transaction, which it names: a restore does the delete again by it');

    foreach (['999999', '-1', 'x', '0'] as $sub) {
        $none = as_user(OWNER, 'DELETE', '/api/admin/people/' . $sub);
        assert_same([404, 'not_found'], [$none['status'], $none['body']['code'] ?? null], "$sub: nobody (a visitor is nobody of the page's)");
    }
});

test('no delete without its entry: one whose audit entry cannot be written is undone - a restore could not do it again', function (): void {
    $answers = dbAll('SELECT id FROM responses WHERE user_id = ? ORDER BY id', [QUINN]);
    assert_true($answers !== [], 'Quinn has answers to delete');
    dbExec("CREATE OR REPLACE FUNCTION survey_test_refuse_entry() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN IF NEW.action = 'person.data_deleted' THEN RAISE EXCEPTION 'the test refuses the entry'; END IF; RETURN NEW; END \$\$");
    dbExec('CREATE TRIGGER survey_test_refuse_entry BEFORE INSERT ON anotoki_audit_log FOR EACH ROW EXECUTE FUNCTION survey_test_refuse_entry()');
    try {
        $refused = as_user(OWNER, 'DELETE', '/api/admin/people/' . QUINN);
        assert_true($refused['status'] >= 500, 'not done: ' . test_show($refused['body']));
    } finally {
        dbExec('DROP TRIGGER survey_test_refuse_entry ON anotoki_audit_log');
        dbExec('DROP FUNCTION survey_test_refuse_entry()');
    }
    assert_same($answers, dbAll('SELECT id FROM responses WHERE user_id = ? ORDER BY id', [QUINN]), 'every answer of Quinn\'s still there');
    assert_same(0, (int) dbValue("SELECT count(*) FROM anotoki_audit_log WHERE action = 'person.data_deleted' AND target_id = ?", [(string) QUINN]), 'and no entry');
});

test('a person\'s answers are deleted only inside the transaction the library holds: on a connection with none - the site\'s own, beside a restore - the delete refuses, and nothing goes', function (): void {
    $answers = dbAll('SELECT id FROM responses WHERE user_id = ? ORDER BY id', [QUINN]);
    assert_true($answers !== [], 'Quinn has answers to delete');
    assert_false(db()->inTransaction(), 'the site\'s connection, in no transaction');
    assert_throws(static fn() => responsesDeleteOf(db(), QUINN), '/only inside the transaction the library holds/');
    assert_same($answers, dbAll('SELECT id FROM responses WHERE user_id = ? ORDER BY id', [QUINN]), 'every answer of Quinn\'s still there');
});

test('the scrub, now from the page: an account the IAM deleted loses its name and keeps its answers - nobody else is touched, and its token never brings a row back', function (): void {
    answer(QUINN, 'second', 'Kept.');
    $answers = dbAll('SELECT id, answers FROM responses WHERE user_id = ? ORDER BY id', [QUINN]);
    $everybodyElse = dbAll('SELECT id, preferred_username, anonymized_at, visitor_key_hash FROM users WHERE id <> ? ORDER BY id', [QUINN]);
    iam_deleted([QUINN => '2026-11-01T10:00:00Z', 555 => '2026-11-01T10:00:05Z']);

    $sync = as_user(OWNER, 'POST', '/api/admin/people/sync');
    assert_same(200, $sync['status'], test_show($sync['body']));
    assert_same(['done', 2, 1], [$sync['body']['run']['state'], $sync['body']['run']['handled'], $sync['body']['run']['scrubbed']], 'two ids listed, one of them somebody here');
    assert_same(['2026-11-01T10:00:05Z', null, 1], [$sync['body']['sync']['since'], $sync['body']['sync']['error'], $sync['body']['sync']['scrubbed']]);

    $row = dbOne("SELECT preferred_username, to_char(anonymized_at AT TIME ZONE 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS at FROM users WHERE id = ?", [QUINN]);
    assert_same(['deleted-' . QUINN, '2026-11-01T10:00:00Z'], [$row['preferred_username'], $row['at']], 'the IAM\'s own placeholder, and the IAM\'s time');
    assert_same($answers, dbAll('SELECT id, answers FROM responses WHERE user_id = ? ORDER BY id', [QUINN]), 'the answers stay - nobody\'s now');
    assert_same($everybodyElse, dbAll('SELECT id, preferred_username, anonymized_at, visitor_key_hash FROM users WHERE id <> ? ORDER BY id', [QUINN]), 'nobody else, a visitor least of all');
    assert_same(
        [[QUINN, true], [555, false]],
        array_map(static fn(array $r): array => [(int) $r['sub'], (bool) $r['had_row']], dbAll('SELECT sub, had_row FROM anotoki_people_anonymized ORDER BY sub')),
        'every id the IAM listed is in the site\'s own list of the ids it scrubbed'
    );
    assert_same(['deleted-' . QUINN, '2026-11-01T10:00:00Z'], [listed(QUINN)['name'], listed(QUINN)['anonymized_at']], 'the page shows it deleted');
    $results = as_user(EDITH, 'GET', '/api/admin/surveys/' . dbValue("SELECT id FROM surveys WHERE slug = 'second'") . '/responses')['body']['responses'];
    assert_true(in_array('deleted-' . QUINN, array_column(array_column($results, 'person'), 'name'), true), 'and so do the results');

    // A token of somebody listed (the IAM issues none for thirty days before - but were there one): nothing comes back.
    as_user(QUINN, 'GET', '/api/surveys', null, ['preferred_username' => 'quinn again']);
    assert_same('deleted-' . QUINN, dbValue('SELECT preferred_username FROM users WHERE id = ?', [QUINN]), 'an anonymized row is never written');
    as_user(555, 'GET', '/api/surveys');
    assert_same(null, dbValue('SELECT id FROM users WHERE id = 555'), 'and no row is made for an id the IAM listed');

    $audit = dbOne("SELECT actor_id, details FROM anotoki_audit_log WHERE action = 'people.synced' ORDER BY id DESC LIMIT 1");
    assert_same([OWNER, ['state' => 'done', 'handled' => 2, 'scrubbed' => 1]], [(int) $audit['actor_id'], json_decode((string) $audit['details'], true)], 'audited');

    $again = as_user(OWNER, 'POST', '/api/admin/people/sync')['body'];
    assert_same([1, 0], [$again['sync']['scrubbed'], $again['run']['scrubbed']], 'run again over the same list: nothing changes (the IAM\'s since is inclusive)');
});

test('the scrub after an answer, at most once an hour - and an IAM out of reach keeps its place and says why', function (): void {
    $stamp = iam_cache() . '/anotoki-people.stamp';
    iam_deleted([QUINN => '2026-11-01T10:00:00Z', PAT => '2026-11-02T10:00:00Z']);
    touch($stamp);
    as_user(OWNER, 'GET', '/api/surveys');
    assert_same('user' . PAT, dbValue('SELECT preferred_username FROM users WHERE id = ?', [PAT]), 'within the hour: not yet');

    touch($stamp, time() - 7200);
    as_user(OWNER, 'GET', '/api/surveys');
    // The built-in server answers one request at a time: the next waits for the work after the last answer.
    as_user(OWNER, 'GET', '/api/surveys');
    assert_same('deleted-' . PAT, dbValue('SELECT preferred_username FROM users WHERE id = ?', [PAT]), 'the hour over: after an answer, the scrub ran');
    assert_true(filemtime($stamp) > time() - 60, 'and the hour is claimed again');

    @unlink($GLOBALS['deleted']);
    $down = as_user(OWNER, 'POST', '/api/admin/people/sync')['body'];
    assert_same('unreachable', $down['run']['state']);
    assert_same(['2026-11-02T10:00:00Z', true], [$down['sync']['since'], is_string($down['sync']['error'])], 'its place kept, and why it stopped - for the page');
    // The database's refusal of the entry this file made it refuse is in the server's log, as every one is.
    assert_same([], array_values(array_filter(server_problems($GLOBALS['app']), static fn(string $line): bool => !str_contains($line, 'the test refuses the entry'))));
});
