<?php

// The site gate and the admin panel's Migrations page, through the real
// server - the anotoki family's library (anotoki/lib, api/migrations.php):
// where the site stands (GET /api/site-status, answered in every state), and
// what everything else answers in each - not set up (the setup page offered
// only to a site never installed), a migration waiting (503 update_pending,
// but for what an administrator needs to sign in and apply it), the database
// out of reach (the site's own answer), ready. And the Migrations page's
// routes, an ADMIN's alone, judged from the token: what the database has and
// lacks, a file's SQL, and applying what it lacks - one update at a time,
// whoever starts it.
//
// The files are the repository's own (migrations/survey/, and the anotoki
// library's set in vendor/): a database is made "behind" by taking a file's row
// out of its migrations table, never by writing a file there - the owner's
// running site reads that folder too.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const ADA = 1;      // ADMIN
const EDITH = 2;    // EDITOR
const PAT = 101;    // takes surveys

const FILE_004 = '004_response_language.sql';
/**
 * The file the tests make the database wait for, and apply again: it writes strings, and runs again over what it
 * wrote (its inserts step aside). Not 005: its gate holds language.button, which 010 moved under the library's key.
 */
const FILE_007 = '007_visitor_strings.sql';
/** A key 007 writes, and its English: gone before it is applied again, and back after. */
const KEY_007 = 'visitor.notice.one';
const ENGLISH_007 = 'You are taking surveys without signing in. This browser remembers which ones you have answered for {count} day after your last visit - sign in, and your answers move into your anotoki account.';
const FILE_006 = '006_visitors.sql';
/** The anotoki library's words: the last file of its set, recorded with the set's name. */
const LIBRARY_002 = ['set' => 'anotoki_translations', 'name' => '002_library_words.sql'];

/** What every closed address answers while a migration waits - the library's words, nothing of the site's. */
const UPDATING = ['code' => 'update_pending', 'message' => 'The site is being updated. Try again in a few minutes.'];

$GLOBALS['app'] = null;
before(function (): void {
    $GLOBALS['app'] = start_app();
});

after(function (): void {
    // A lock a failed test left held would stop nothing else: the connection ends with the file.
    dbValue('SELECT pg_advisory_unlock_all()');
});

function roles_of(int $user): array
{
    return match ($user) {
        ADA => ['ADMIN'],
        EDITH => ['EDITOR'],
        default => [],
    };
}

function as_user(int $user, string $method, string $url, mixed $body = null): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, bearer(test_token($user, roles_of($user))));
}

function anonymous(string $method, string $url): array
{
    return call($GLOBALS['app']['base'], $method, $url);
}

/**
 * A request with its path sent exactly as written - its dot segments and
 * escapes as a crafted request has them (curl would tidy them away first) - by
 * $user (null: nobody). The status and the JSON body.
 *
 * @return array{status: int, body: mixed}
 */
function as_written(?int $user, string $method, string $path): array
{
    $curl = curl_init($GLOBALS['app']['base'] . $path);
    curl_setopt_array($curl, [
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_PATH_AS_IS => true,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => array_merge($user === null ? [] : bearer(test_token($user, roles_of($user))), ['Expect:']),
        CURLOPT_TIMEOUT => 60,
    ]);
    $raw = curl_exec($curl);
    if ($raw === false) {
        throw new RuntimeException("$method $path: no answer (" . curl_error($curl) . ')');
    }

    return ['status' => (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE), 'body' => json_decode((string) $raw, true) ?? $raw];
}

/** A file as the routes name it: with its set, the site's one. */
function file_entry(string $name): array
{
    return ['set' => 'survey', 'name' => $name];
}

/** The pending files, as the Migrations page lists them. */
function pending_now(): array
{
    return array_column(as_user(ADA, 'GET', '/api/admin/migrations')['body']['pending'] ?? [], 'name');
}

/** The database as if $files had never been applied - only their rows go: their tables and strings stay. */
function behind(string ...$files): void
{
    foreach ($files as $file) {
        dbExec('DELETE FROM migrations WHERE filename = ?', [$file]);
    }
}

/** 004 able to run again: its column is gone, as before it ran. */
function undo_004(): void
{
    dbExec('ALTER TABLE responses DROP COLUMN IF EXISTS language');
    behind(FILE_004);
}

/** 006 able to run again: no visitor, and none of what it adds - as before it ran. */
function undo_006(): void
{
    dbExec('DROP TABLE IF EXISTS visitor_counters');
    dbExec('DROP INDEX IF EXISTS responses_by_user');
    dbExec('DROP INDEX IF EXISTS users_visitors_with_key');
    dbExec('DELETE FROM users WHERE id < 0');
    dbExec('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_visitor_check');
    dbExec('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_visitor_key_hash_unique');
    dbExec('ALTER TABLE users DROP COLUMN IF EXISTS visitor_key_hash');
    dbExec('DROP SEQUENCE IF EXISTS visitor_ids');
    behind(FILE_006);
}

/** Back to current, however a test left it. */
function current_again(): void
{
    dbExec('DROP TRIGGER IF EXISTS survey_test_refuse ON translations');
    if ((int) dbValue("SELECT count(*) FROM information_schema.columns WHERE table_name = 'responses' AND column_name = 'language'") === 0) {
        dbExec('ALTER TABLE responses ADD COLUMN language VARCHAR(10) REFERENCES languages (code) ON DELETE SET NULL');
    }
    if (dbValue("SELECT to_regclass('visitor_counters')") === null) {
        undo_006();
        foreach (\Anotoki\Lib\Migrations\Splitter::split(migration_sql(FILE_006)) as $statement) {
            dbExec($statement);
        }
    }
    foreach (migration_entries() as $entry) {
        dbExec('INSERT INTO migrations (filename) VALUES (?) ON CONFLICT DO NOTHING', [migration_record($entry)]);
    }
}

/**
 * A server of this file's with the settings folder $config (and its database), and nothing checked of it.
 * Up once it serves the app's page, which asks nothing of the database: one out of reach takes seconds
 * to refuse a connection (on Windows), longer than the start waits for an answer.
 */
function start_with(string $config): array
{
    return test_start_server(TEST_BACKEND, TEST_BACKEND . '/router.php', ['SURVEY_TEST_CONFIG' => $config, 'SURVEY_FRONTEND_DIST' => test_frontend_build()], '/index.html');
}

test('ready: the status says so, and the site answers as ever - the sign-in saying nothing of the database', function (): void {
    $status = anonymous('GET', '/api/site-status');
    assert_same([200, ['state' => 'ready', 'installed' => false]], [$status['status'], $status['body']], 'never installed on a real host: this computer');
    assert_same('no-store', $status['headers']['cache-control'] ?? null);
    assert_same(200, as_user(PAT, 'GET', '/api/surveys')['status']);
    assert_same([200, ['issuer' => TEST_ISSUER, 'clientId' => 'survey', 'loginRequired' => true, 'visitorDays' => 30]], [anonymous('GET', '/api/auth/config')['status'], anonymous('GET', '/api/auth/config')['body']]);
});

test('up to date: every file applied, in the order it ran, with when - nothing pending, nothing missing, nothing to apply', function (): void {
    $status = as_user(ADA, 'GET', '/api/admin/migrations');
    assert_same(200, $status['status']);
    assert_same(['sets', 'applied', 'pending', 'missing'], array_keys($status['body']));
    assert_same(['survey', 'anotoki_translations'], $status['body']['sets'], 'the site\'s own, then the anotoki library\'s words');
    assert_same(migration_entries(), array_map(static fn(array $row): array => ['set' => $row['set'], 'name' => $row['name']], $status['body']['applied']), 'every file, in the order it ran');
    foreach ($status['body']['applied'] as $row) {
        assert_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/D', (string) $row['applied_at'], 'when, in UTC');
    }
    assert_same([[], []], [$status['body']['pending'], $status['body']['missing']]);
    assert_same('no-store', $status['headers']['cache-control'] ?? null);

    $apply = as_user(ADA, 'POST', '/api/admin/migrations/apply');
    assert_same([200, ['applied' => [], 'failed' => null, 'error' => null, 'note' => null]], [$apply['status'], $apply['body']]);
});

test('the status answers anybody, whatever the request carries and whatever the IAM says of signing in - while the site runs and while an update waits', function (): void {
    /** What a browser may send with it: nothing, a token that does not check out, one that has run out, a visitor's key, an ADMIN's token. */
    $senders = [
        'nobody' => [],
        'a token that is no token' => bearer('not-a-token'),
        'a token that has run out' => bearer(test_token(PAT, ['MEMBER'], ['exp' => time() - 120])),
        'a visitor key' => ['X-Visitor-Key: ' . str_repeat('k', 43)],
        'an ADMIN' => bearer(test_token(ADA, ['ADMIN'])),
    ];
    // The IAM says sign-in is required here - and, on the second server, that it is not.
    $required = start_app(test_iam(['application_file' => test_application_file(true)]));
    $open = start_app(test_iam(['application_file' => test_application_file(false)]));
    try {
        // The site's own rule bites where it should: nothing of a survey for nobody while sign-in is required...
        $surveys = call($required['base'], 'GET', '/api/surveys');
        assert_same([401, 'sign_in_required'], [$surveys['status'], $surveys['body']['code'] ?? null], 'the surveys, nobody, sign-in required');
        // ...but never on the status, which the pages must be able to read before anybody can sign in.
        foreach (['ready' => null, 'update_pending' => FILE_007] as $state => $file) {
            if ($file !== null) {
                behind($file);
            }
            foreach ([$required, $open] as $i => $site) {
                foreach ($senders as $who => $headers) {
                    $status = call($site['base'], 'GET', '/api/site-status', null, $headers);
                    assert_same([200, ['state' => $state, 'installed' => false]], [$status['status'], $status['body']], "$state, sign-in " . ($i === 0 ? 'required' : 'not required') . ", $who");
                }
            }
        }
    } finally {
        current_again();
        ($required['stop'])();
        ($open['stop'])();
    }
});

test('a file\'s SQL, for the page\'s View - and nothing that is not a file of the set', function (): void {
    $file = as_user(ADA, 'GET', '/api/admin/migrations/file?set=survey&name=' . FILE_004);
    assert_same([200, ['set' => 'survey', 'name' => FILE_004, 'sql' => migration_sql(FILE_004)]], [$file['status'], $file['body']]);
    foreach (['set=survey&name=' . rawurlencode('../../config/config.php'), 'set=survey&name=' . rawurlencode('../survey/' . FILE_004), 'set=other&name=' . FILE_004, 'set=survey&name=nothing.sql', 'set=survey', 'name=' . FILE_004, ''] as $query) {
        $refused = as_user(ADA, 'GET', '/api/admin/migrations/file?' . $query);
        assert_same([404, ['code' => 'not_found', 'message' => 'No such migration file.']], [$refused['status'], $refused['body']], "?$query");
    }
});

test('ADMIN alone, from the token: nobody is asked to sign in, a participant and an EDITOR are refused - the list, a file and the Apply, behind or not', function (): void {
    foreach ([false, true] as $isBehind) {
        if ($isBehind) {
            behind(FILE_007);
        }
        foreach (['GET /api/admin/migrations', 'GET /api/admin/migrations/file?set=survey&name=' . FILE_007, 'POST /api/admin/migrations/apply'] as $route) {
            [$method, $url] = explode(' ', $route);
            $nobody = anonymous($method, $url);
            assert_same([401, 'sign_in_required'], [$nobody['status'], $nobody['body']['code'] ?? null], "$route, nobody");
            foreach ([PAT => 'a participant', EDITH => 'an EDITOR'] as $user => $who) {
                $refused = as_user($user, $method, $url);
                assert_same([403, 'forbidden', 'Only an administrator of the survey site may do this.'], [$refused['status'], $refused['body']['code'] ?? null, $refused['body']['error'] ?? null], "$route, $who" . ($isBehind ? ', behind' : ''));
            }
            $bad = call($GLOBALS['app']['base'], $method, $url, null, bearer(test_token(ADA, ['ADMIN'], ['exp' => time() - 120])));
            assert_same([401, 'invalid_token'], [$bad['status'], $bad['body']['code'] ?? null], "$route: an ADMIN's token that has run out");
        }
    }
    assert_same([FILE_007], pending_now(), 'nothing a refused Apply would have applied was applied');
    current_again();
});

test('a migration waiting: 503 update_pending with Retry-After everywhere - but signing in, the strings, the health and the Migrations page', function (): void {
    behind(FILE_007);

    $status = anonymous('GET', '/api/site-status');
    assert_same([200, ['state' => 'update_pending', 'installed' => false]], [$status['status'], $status['body']], 'the status always answers');
    foreach ([
        [PAT, 'GET /api/surveys'], [PAT, 'GET /api/surveys/x'], [PAT, 'POST /api/visitor/move'],
        [ADA, 'GET /api/admin/surveys'], [ADA, 'GET /api/admin/translations'], [ADA, 'GET /api/admin/languages'],
        [null, 'GET /api/images/00000000-0000-0000-0000-000000000000.png'], [null, 'GET /api/translations'], [null, 'GET /api/no-such-address'],
    ] as [$user, $route]) {
        [$method, $url] = explode(' ', $route);
        $closed = $user === null ? anonymous($method, $url) : as_user($user, $method, $url);
        assert_same([503, UPDATING], [$closed['status'], $closed['body']], "$route" . ($user === ADA ? ', even for an ADMIN' : '') . ': no error of the site\'s, no setup page');
        assert_same(['60', 'no-store'], [$closed['headers']['retry-after'] ?? null, $closed['headers']['cache-control'] ?? null], $route);
    }

    $config = anonymous('GET', '/api/auth/config');
    assert_same([200, ['issuer' => TEST_ISSUER, 'clientId' => 'survey', 'loginRequired' => true, 'visitorDays' => 30]], [$config['status'], $config['body']], 'the sign-in: an administrator must be able to sign in to apply it');
    $strings = anonymous('GET', '/api/translations/sk');
    assert_same([200, 'sk'], [$strings['status'], $strings['body']['language'] ?? null], 'the strings: the pages are worded with them');
    $health = anonymous('GET', '/api/health');
    assert_same([200, [FILE_007]], [$health['status'], $health['body']['pending'] ?? null], 'the health check, and - asked from this computer - what waits');

    $list = as_user(ADA, 'GET', '/api/admin/migrations');
    assert_same(200, $list['status']);
    assert_same([['set' => 'survey', 'name' => FILE_007, 'ready' => true, 'blocked' => false]], $list['body']['pending']);
    assert_false(in_array(FILE_007, array_column($list['body']['applied'], 'name'), true));
    assert_same(200, as_user(ADA, 'GET', '/api/admin/migrations/file?set=survey&name=' . FILE_007)['status']);

    current_again();
    assert_same(['state' => 'ready', 'installed' => false], anonymous('GET', '/api/site-status')['body']);
    assert_same(200, as_user(PAT, 'GET', '/api/surveys')['status'], 'current again: the site runs');
});

test('a migration waiting: an address dressed up as an open one stays closed - dot segments, escaped slashes, anything under the Migrations page that is not its route', function (): void {
    behind(FILE_007);

    foreach ([
        '/api/admin/migrations/../../surveys',
        '/api/admin/migrations/%2e%2e/%2e%2e/surveys',
        '/api/admin/migrations%2F..%2F..%2Fsurveys',
        '/api/admin/migrations/file/../../../surveys',
        '/api/admin/migrations/apply/..',
        '/api/admin/migrations/',
        '/api/admin/migrations/anything',
        '/api/translations/sk/../../surveys',
        '/api/translations/..%2F..%2Fsurveys',
        '/api/auth/config/../../surveys',
        '/api/health/../surveys',
        '/api/site-status/../surveys',
    ] as $path) {
        foreach ([ADA, null] as $user) {
            $closed = as_written($user, 'GET', $path);
            assert_same([503, UPDATING], [$closed['status'], $closed['body']], "$path, " . ($user === null ? 'nobody signed in' : 'an ADMIN') . ': closed by the gate, not left to the routes');
        }
    }
    $write = as_written(ADA, 'POST', '/api/admin/migrations/apply/../../surveys');
    assert_same([503, UPDATING], [$write['status'], $write['body']], 'nor a write');

    // The routes themselves are open as they are - to an ADMIN, as ever.
    assert_same(200, as_written(ADA, 'GET', '/api/admin/migrations')['status']);
    assert_same(200, as_written(ADA, 'GET', '/api/admin/migrations/file?set=survey&name=' . FILE_007)['status']);
    current_again();
});

test('several pending, in the order they will run; Apply runs them all and the site runs again', function (): void {
    undo_004();
    behind(FILE_007);
    // What 007 writes, gone: it comes back with the Apply.
    dbExec('DELETE FROM translation_keys WHERE name = ?', [KEY_007]);
    assert_same([FILE_004, FILE_007], pending_now());

    $apply = as_user(ADA, 'POST', '/api/admin/migrations/apply');
    assert_same([200, ['applied' => [file_entry(FILE_004), file_entry(FILE_007)], 'failed' => null, 'error' => null, 'note' => null]], [$apply['status'], $apply['body']]);
    assert_same([], pending_now());
    assert_same(ENGLISH_007, dbValue("SELECT value FROM translations WHERE key_name = ? AND language_code = 'en'", [KEY_007]));
    assert_same('ready', anonymous('GET', '/api/site-status')['body']['state']);
    assert_same(200, as_user(PAT, 'GET', '/api/surveys')['status']);
    $last = array_slice(as_user(ADA, 'GET', '/api/admin/migrations')['body']['applied'], -2);
    assert_same([FILE_004, FILE_007], array_column($last, 'name'), 'applied, last in the order they ran');
});

test('a file that fails: what ran before it stands, it is rolled back whole and named, with the database\'s whole error - and logged', function (): void {
    undo_004();
    behind(FILE_007);
    dbExec('DELETE FROM translation_keys WHERE name = ?', [KEY_007]);
    // 007 fails part way: its keys and their English are written first, then its Slovak string of that key is refused.
    dbExec("CREATE OR REPLACE FUNCTION survey_test_refuse() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'the test refuses to write %', NEW.key_name; END \$\$");
    dbExec("CREATE TRIGGER survey_test_refuse BEFORE INSERT ON translations FOR EACH ROW WHEN (NEW.key_name = 'visitor.notice.one' AND NEW.language_code = 'sk') EXECUTE FUNCTION survey_test_refuse()");

    $apply = as_user(ADA, 'POST', '/api/admin/migrations/apply');
    assert_same(200, $apply['status'], 'a failed file is still an answer: the page shows it');
    assert_same([[file_entry(FILE_004)], file_entry(FILE_007), null], [$apply['body']['applied'], $apply['body']['failed'], $apply['body']['note']], 'what ran first, and the file that failed');
    $error = (string) $apply['body']['error'];
    assert_match('/^statement 3 of 4: SQLSTATE\[P0001\]: Raise exception: 7 ERROR:  the test refuses to write visitor\.notice\.one/', $error, 'PostgreSQL\'s own words, with the statement\'s number');
    assert_match('/\n\n  INSERT INTO translations/', $error, 'and the statement\'s first lines');

    assert_same([FILE_007], pending_now(), '004 stands, 007 waits');
    assert_same(null, dbValue('SELECT name FROM translation_keys WHERE name = ?', [KEY_007]), 'the keys 007 wrote before it failed were rolled back with it');
    $log = implode("\n", server_problems($GLOBALS['app']));
    assert_match('/\[db\] the migration ' . preg_quote(FILE_007, '/') . ' failed: statement \d+ of \d+: SQLSTATE\[P0001\]/', $log, 'the server\'s log has it too');
    assert_same([503, UPDATING], [as_user(PAT, 'GET', '/api/surveys')['status'], as_user(PAT, 'GET', '/api/surveys')['body']], 'still waiting');

    // Whatever was in the way is gone: the next Apply goes through.
    dbExec('DROP TRIGGER survey_test_refuse ON translations');
    $again = as_user(ADA, 'POST', '/api/admin/migrations/apply');
    assert_same(['applied' => [file_entry(FILE_007)], 'failed' => null, 'error' => null, 'note' => null], $again['body']);
    assert_same(ENGLISH_007, dbValue("SELECT value FROM translations WHERE key_name = ? AND language_code = 'en'", [KEY_007]));
    assert_same(200, as_user(PAT, 'GET', '/api/surveys')['status']);
});

test('the anotoki library\'s files wait as the site\'s own do: the site closed, the Migrations page naming them with their set, the Apply running them', function (): void {
    behind(migration_record(LIBRARY_002));
    $status = anonymous('GET', '/api/site-status');
    assert_same(['state' => 'update_pending', 'installed' => false], $status['body']);
    assert_same([503, UPDATING], [as_user(PAT, 'GET', '/api/surveys')['status'], as_user(PAT, 'GET', '/api/surveys')['body']]);

    $list = as_user(ADA, 'GET', '/api/admin/migrations');
    assert_same([LIBRARY_002 + ['ready' => true, 'blocked' => false]], $list['body']['pending']);
    $file = as_user(ADA, 'GET', '/api/admin/migrations/file?set=anotoki_translations&name=002_library_words.sql');
    assert_same(200, $file['status']);
    assert_match('/^-- anotoki_translations 002/', (string) $file['body']['sql'], 'its SQL, from the library\'s folder');
    $health = anonymous('GET', '/api/health');
    assert_same(['002_library_words.sql'], $health['body']['pending'] ?? null, 'the health check says what waits');

    // Run again over what it wrote: it writes descriptions, and no string over one that is there.
    $before = dbAll("SELECT key_name, language_code, value, updated_at, updated_by FROM translations WHERE key_name LIKE 'anotoki.%' ORDER BY 1, 2");
    $apply = as_user(ADA, 'POST', '/api/admin/migrations/apply');
    assert_same([200, ['applied' => [LIBRARY_002], 'failed' => null, 'error' => null, 'note' => null]], [$apply['status'], $apply['body']]);
    assert_same($before, dbAll("SELECT key_name, language_code, value, updated_at, updated_by FROM translations WHERE key_name LIKE 'anotoki.%' ORDER BY 1, 2"), 'the words as they were');
    assert_same(['state' => 'ready', 'installed' => false], anonymous('GET', '/api/site-status')['body']);
    assert_same(1, (int) dbValue('SELECT count(*) FROM migrations WHERE filename = ?', ['anotoki_translations/002_library_words.sql']), 'recorded once, with its set');
});

test('one update at a time: while another holds the lock, Apply and php migration.php apply nothing and say so', function (): void {
    behind(FILE_007);
    // Another update running: this test's own connection holds the lock setup.php, migration.php and Apply take.
    dbValue('SELECT pg_advisory_lock(?::bigint)', [DATABASE_UPDATE_LOCK]);
    try {
        $busy = as_user(ADA, 'POST', '/api/admin/migrations/apply');
        assert_same([409, ['code' => 'busy', 'message' => 'Another database update is running. Nothing was applied. Wait a moment, then look again.']], [$busy['status'], $busy['body']]);
        assert_same([FILE_007], pending_now(), 'nothing was applied');
        assert_same(200, as_user(ADA, 'GET', '/api/admin/migrations')['status'], 'the list is read all the same');

        $command = [PHP_BINARY, TEST_BACKEND . '/migration.php'];
        $process = proc_open($command, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, TEST_BACKEND, ['SURVEY_TEST_CONFIG' => $GLOBALS['TEST_CONFIG_DIR']] + getenv());
        $out = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
        $code = proc_close($process);
        assert_same(1, $code, 'php migration.php: ' . $out);
        assert_match('/Another database update is running/', $out);
        assert_same([FILE_007], pending_now(), 'nor by the command line');
    } finally {
        dbValue('SELECT pg_advisory_unlock(?::bigint)', [DATABASE_UPDATE_LOCK]);
    }

    $apply = as_user(ADA, 'POST', '/api/admin/migrations/apply');
    assert_same(['applied' => [file_entry(FILE_007)], 'failed' => null, 'error' => null, 'note' => null], $apply['body'], 'the lock let go: the Apply goes through');
});

test('006 on a database with people and their answers: the Apply runs it, its gate passes, and nothing of theirs changes', function (): void {
    current_again();
    assert_same(200, as_user(PAT, 'GET', '/api/surveys')['status'], 'a person, recorded');
    $survey = (string) dbValue("INSERT INTO surveys (slug, title, status, content) VALUES ('before-006', 'Before', 'open', ?::jsonb) RETURNING id", [jsonText(['intro' => '', 'thanks' => '', 'askAboutYou' => false, 'steps' => []])]);
    dbExec("INSERT INTO responses (survey_id, user_id, started_at, language) VALUES (?, ?, now(), 'en')", [$survey, PAT]);
    undo_006();
    $people = dbAll('SELECT id, preferred_username, email, first_seen_at, last_seen_at FROM users ORDER BY id');
    $answers = dbAll('SELECT * FROM responses ORDER BY id');
    assert_same([FILE_006], pending_now());

    $apply = as_user(ADA, 'POST', '/api/admin/migrations/apply');
    assert_same([200, ['applied' => [file_entry(FILE_006)], 'failed' => null, 'error' => null, 'note' => null]], [$apply['status'], $apply['body']]);
    assert_same($people, dbAll('SELECT id, preferred_username, email, first_seen_at, last_seen_at FROM users ORDER BY id'), 'the people as they were');
    assert_same([0, $answers], [(int) dbValue('SELECT count(*) FROM users WHERE visitor_key_hash IS NOT NULL'), dbAll('SELECT * FROM responses ORDER BY id')], 'no key, the answers as they were');
    assert_same([-1, 'responses_by_user'], [(int) dbValue("SELECT nextval('visitor_ids')"), dbValue("SELECT to_regclass('responses_by_user')::text")], 'visitors count down from -1; answers are found by person');
    dbExec('DELETE FROM surveys WHERE id = ?', [$survey]);
});

test('a database waiting for 006: the surveys are closed for nobody, a visitor key or a person alike - nor the move at sign-in', function (): void {
    current_again();
    // A site where visitors are welcome: the IAM says sign-in is not required.
    $site = start_app(test_iam(['application_file' => test_application_file(false)]));
    behind(FILE_006);
    try {
        $key = ['X-Visitor-Key: ' . str_repeat('k', 43)];
        foreach ([[[], 'nobody'], [$key, 'a visitor key'], [bearer(test_token(PAT, ['MEMBER'])), 'a person']] as [$headers, $who]) {
            foreach (['GET /api/surveys', 'GET /api/surveys/x', 'POST /api/surveys/x/responses'] as $route) {
                [$method, $url] = explode(' ', $route);
                $answer = call($site['base'], $method, $url, $method === 'POST' ? ['answers' => new stdClass()] : null, $headers);
                assert_same([503, UPDATING], [$answer['status'], $answer['body']], "$route, $who");
            }
        }
        $move = call($site['base'], 'POST', '/api/visitor/move', null, array_merge(bearer(test_token(PAT, ['MEMBER'])), $key));
        assert_same([503, 'update_pending'], [$move['status'], $move['body']['code'] ?? null], 'the move');
        assert_same(false, call($site['base'], 'GET', '/api/auth/config')['body']['loginRequired'], 'the sign-in still answers, and says what the IAM says');
        assert_same(0, (int) dbValue('SELECT count(*) FROM users WHERE id < 0'), 'nobody was made a visitor');
    } finally {
        current_again();
        ($site['stop'])();
    }
});

test('a database with nothing in it: an ADMIN builds it on the Migrations page - the check asks nothing of its tables', function (): void {
    $site = start_with(test_config_dir(test_iam(), test_empty_db('empty')));
    $admin = bearer(test_token(ADA, ['ADMIN']));
    try {
        assert_same(['state' => 'update_pending', 'installed' => false], call($site['base'], 'GET', '/api/site-status')['body']);
        $list = call($site['base'], 'GET', '/api/admin/migrations', null, $admin);
        $pending = array_map(static fn(array $row): array => ['set' => $row['set'], 'name' => $row['name']], $list['body']['pending']);
        assert_same([200, migration_entries(), [], []], [$list['status'], $pending, $list['body']['applied'], $list['body']['missing']]);
        $editor = call($site['base'], 'POST', '/api/admin/migrations/apply', null, bearer(test_token(EDITH, ['EDITOR'])));
        assert_same([403, 'forbidden'], [$editor['status'], $editor['body']['code'] ?? null]);

        $apply = call($site['base'], 'POST', '/api/admin/migrations/apply', null, $admin);
        assert_same([200, migration_entries(), null], [$apply['status'], $apply['body']['applied'], $apply['body']['failed']]);
        $bundle = call($site['base'], 'GET', '/api/translations/sk');
        assert_same([200, 'Vaša ponuka'], [$bundle['status'], $bundle['body']['values']['anotoki.topbar.menu'] ?? null], 'the words from nothing too: the library\'s keys, in the site\'s formal Slovak');
        assert_same(['state' => 'ready', 'installed' => false], call($site['base'], 'GET', '/api/site-status')['body']);
        assert_same(200, call($site['base'], 'GET', '/api/surveys', null, bearer(test_token(PAT, ['MEMBER'])))['status'], 'and the site runs');
    } finally {
        ($site['stop'])();
    }
});

test('not set up and never installed: 503 not_set_up everywhere but the status - with the way to the setup page', function (): void {
    $dir = test_temp_dir('no-iam');
    // Only the database's settings: the IAM's are missing.
    file_put_contents("$dir/database.local.php", '<?php return ' . var_export(['name' => dbName()] + machineDatabaseSettings(), true) . ";\n");
    $site = start_with($dir);
    $routes = ['GET /api/health', 'GET /api/auth/config', 'GET /api/translations/en', 'GET /api/surveys', 'GET /api/admin/migrations', 'POST /api/admin/migrations/apply'];
    // Whatever comes with the question - nothing, a token nothing can check now, a visitor's key - the status answers it.
    $senders = [[], bearer(test_token(ADA, ['ADMIN'])), bearer('not-a-token'), ['X-Visitor-Key: ' . str_repeat('k', 43)]];
    try {
        foreach ($senders as $headers) {
            $status = call($site['base'], 'GET', '/api/site-status', null, $headers);
            assert_same([200, ['state' => 'not_set_up', 'installed' => false]], [$status['status'], $status['body']], implode(', ', $headers) ?: 'nobody');
        }
        foreach ($routes as $route) {
            [$method, $url] = explode(' ', $route);
            $answer = call($site['base'], $method, $url, null, bearer(test_token(ADA, ['ADMIN'])));
            assert_same([503, ['code' => 'not_set_up', 'installed' => false, 'message' => 'This site is not set up yet. Its setup page connects it to its database.', 'setup' => '/setup.php']], [$answer['status'], $answer['body']], $route);
        }

        // Installed once on a real host (setup.php wrote storage/installed.lock): never the setup page again.
        mkdir("$dir/storage", 0777, true);
        file_put_contents("$dir/storage/installed.lock", "{}\n");
        foreach ($senders as $headers) {
            $status = call($site['base'], 'GET', '/api/site-status', null, $headers);
            assert_same([200, ['state' => 'not_set_up', 'installed' => true]], [$status['status'], $status['body']], (implode(', ', $headers) ?: 'nobody') . ', installed');
        }
        foreach ($routes as $route) {
            [$method, $url] = explode(' ', $route);
            $answer = call($site['base'], $method, $url, null, bearer(test_token(ADA, ['ADMIN'])));
            assert_same([503, ['code' => 'not_set_up', 'installed' => true, 'message' => 'The site is not available right now. Try again in a few minutes.']], [$answer['status'], $answer['body']], "$route, installed");
        }
    } finally {
        ($site['stop'])();
    }
});

test('the database out of reach: the status says unavailable, and everything else is the site\'s own answer', function (): void {
    $dir = test_config_dir(test_iam());
    // This file's database, on a port where nothing listens.
    file_put_contents("$dir/database.local.php", '<?php return ' . var_export(['name' => dbName(), 'port' => test_free_port()] + machineDatabaseSettings(), true) . ";\n");
    $site = start_with($dir);
    try {
        assert_same([200, ['state' => 'unavailable', 'installed' => false]], [call($site['base'], 'GET', '/api/site-status')['status'], call($site['base'], 'GET', '/api/site-status')['body']]);
        assert_same(200, call($site['base'], 'GET', '/api/auth/config')['status'], 'the sign-in needs no database');
        $surveys = call($site['base'], 'GET', '/api/surveys', null, bearer(test_token(PAT, ['MEMBER'])));
        assert_same([503, 'database_unavailable'], [$surveys['status'], $surveys['body']['code'] ?? null]);
    } finally {
        ($site['stop'])();
    }
});
