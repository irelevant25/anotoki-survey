<?php

// The admin panel's Migrations page, through the real server: what the
// database has and lacks, and applying what it lacks - an ADMIN's alone. A
// database behind the code closes the site (503 not_set_up, update: true) but
// for what an administrator needs to apply it: the sign-in's settings, the
// strings and these routes. One update at a time, whoever starts it.
//
// The files are the repository's own (migrations/survey/): a database is made
// "behind" by taking a file's row out of its migrations table, never by
// writing a file there - the owner's running site reads that folder too.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const ADA = 1;      // ADMIN
const EDITH = 2;    // EDITOR
const PAT = 101;    // takes surveys

const FILE_004 = '004_response_language.sql';
const FILE_005 = '005_top_bar_and_sign_in.sql';
const FILE_006 = '006_visitors.sql';

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
    dbExec('DROP TRIGGER IF EXISTS survey_test_refuse ON translation_keys');
    if ((int) dbValue("SELECT count(*) FROM information_schema.columns WHERE table_name = 'responses' AND column_name = 'language'") === 0) {
        dbExec('ALTER TABLE responses ADD COLUMN language VARCHAR(10) REFERENCES languages (code) ON DELETE SET NULL');
    }
    if (dbValue("SELECT to_regclass('visitor_counters')") === null) {
        undo_006();
        foreach (splitSqlStatements((string) file_get_contents(TEST_BACKEND . '/migrations/survey/' . FILE_006)) as $statement) {
            dbExec($statement);
        }
    }
    foreach (migrationFiles() as $file) {
        dbExec('INSERT INTO migrations (filename) VALUES (?) ON CONFLICT DO NOTHING', [$file]);
    }
}

test('up to date: every file applied, in the order it ran, with when - nothing pending, nothing to apply', function (): void {
    $status = as_user(ADA, 'GET', '/api/admin/migrations');
    assert_same(200, $status['status']);
    assert_same(['applied', 'pending'], array_keys($status['body']));
    assert_same(migrationFiles(), array_column($status['body']['applied'], 'name'), 'every file, in the order it ran');
    foreach ($status['body']['applied'] as $row) {
        assert_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/D', (string) $row['applied_at'], 'when, in UTC');
    }
    assert_same([], $status['body']['pending']);
    assert_same('no-store', $status['headers']['cache-control'] ?? null);

    $apply = as_user(ADA, 'POST', '/api/admin/migrations/apply');
    assert_same([200, ['applied' => [], 'failed' => null, 'error' => null]], [$apply['status'], $apply['body']]);
});

test('ADMIN alone: nobody is asked to sign in, a participant and an EDITOR are refused - the list and the Apply, behind or not', function (): void {
    foreach ([false, true] as $isBehind) {
        if ($isBehind) {
            behind(FILE_005);
        }
        foreach (['GET /api/admin/migrations', 'POST /api/admin/migrations/apply'] as $route) {
            [$method, $url] = explode(' ', $route);
            $nobody = anonymous($method, $url);
            assert_same([401, 'sign_in_required'], [$nobody['status'], $nobody['body']['code'] ?? null], "$route, nobody");
            foreach ([PAT => 'a participant', EDITH => 'an EDITOR'] as $user => $who) {
                $refused = as_user($user, $method, $url);
                assert_same([403, 'forbidden'], [$refused['status'], $refused['body']['code'] ?? null], "$route, $who" . ($isBehind ? ', behind' : ''));
            }
            $bad = call($GLOBALS['app']['base'], $method, $url, null, bearer(test_token(ADA, ['ADMIN'], ['exp' => time() - 120])));
            assert_same(401, $bad['status'], "$route: an ADMIN's token that has run out");
        }
    }
    assert_same([FILE_005], pending_now(), 'nothing a refused Apply would have applied was applied');
    current_again();
});

test('a database behind: the site is not set up (update: true) - but signing in, the strings and the migrations answer', function (): void {
    behind(FILE_005);

    $surveys = as_user(PAT, 'GET', '/api/surveys');
    assert_same([503, 'not_set_up', true, '/setup.php'], [$surveys['status'], $surveys['body']['code'], $surveys['body']['update'] ?? null, $surveys['body']['setup'] ?? null]);
    assert_match('/Migrations page/', (string) $surveys['body']['error']);
    foreach (['GET /api/admin/surveys', 'GET /api/admin/translations', 'GET /api/admin/languages'] as $route) {
        [$method, $url] = explode(' ', $route);
        $closed = as_user(ADA, $method, $url);
        assert_same([503, true], [$closed['status'], $closed['body']['update'] ?? null], "$route, even for an ADMIN");
    }
    $picture = anonymous('GET', '/api/images/00000000-0000-0000-0000-000000000000.png');
    assert_same(503, $picture['status'], 'a picture too');

    $config = anonymous('GET', '/api/auth/config');
    assert_same([200, ['issuer' => TEST_ISSUER, 'clientId' => 'survey', 'loginRequired' => true, 'visitorDays' => 30, 'update' => true]], [$config['status'], $config['body']], 'the sign-in, saying an update waits');
    $strings = anonymous('GET', '/api/translations/sk');
    assert_same([200, 'sk'], [$strings['status'], $strings['body']['language'] ?? null], 'the strings: the boot page and the admin panel\'s bar are worded with them');
    assert_same(503, anonymous('GET', '/api/translations')['status'], 'only a language\'s strings - an address beside them is closed like the rest');

    $status = as_user(ADA, 'GET', '/api/admin/migrations');
    assert_same(200, $status['status']);
    assert_same([['name' => FILE_005]], $status['body']['pending']);
    assert_false(in_array(FILE_005, array_column($status['body']['applied'], 'name'), true));

    current_again();
    $open = as_user(PAT, 'GET', '/api/surveys');
    assert_same(200, $open['status'], 'current again: the site runs');
    assert_same(['issuer' => TEST_ISSUER, 'clientId' => 'survey', 'loginRequired' => true, 'visitorDays' => 30], anonymous('GET', '/api/auth/config')['body'], 'and the sign-in says nothing of an update');
});

test('several pending, in the order they will run; Apply runs them all and the site runs again', function (): void {
    undo_004();
    behind(FILE_005);
    // What 005 writes, gone: it comes back with the Apply.
    dbExec("DELETE FROM translation_keys WHERE name = 'signedOut.heading'");
    assert_same([FILE_004, FILE_005], pending_now());

    $apply = as_user(ADA, 'POST', '/api/admin/migrations/apply');
    assert_same([200, ['applied' => [FILE_004, FILE_005], 'failed' => null, 'error' => null]], [$apply['status'], $apply['body']]);
    assert_same([], pending_now());
    assert_same('You are not signed in', dbValue("SELECT value FROM translations WHERE key_name = 'signedOut.heading' AND language_code = 'en'"));
    assert_same(200, as_user(PAT, 'GET', '/api/surveys')['status']);
    $last = array_slice(as_user(ADA, 'GET', '/api/admin/migrations')['body']['applied'], -2);
    assert_same([FILE_004, FILE_005], array_column($last, 'name'), 'applied, last in the order they ran');
});

test('a file that fails: what ran before it stands, it is rolled back whole and named, with the database\'s whole error - and logged', function (): void {
    undo_004();
    behind(FILE_005);
    dbExec("DELETE FROM translation_keys WHERE name = 'signedOut.heading'");
    // 005 fails part way: its keys are written first, then the update of language.button's description is refused.
    dbExec("CREATE OR REPLACE FUNCTION survey_test_refuse() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'the test refuses to change %', OLD.name; END \$\$");
    dbExec("CREATE TRIGGER survey_test_refuse BEFORE UPDATE ON translation_keys FOR EACH ROW WHEN (OLD.name = 'language.button') EXECUTE FUNCTION survey_test_refuse()");

    $apply = as_user(ADA, 'POST', '/api/admin/migrations/apply');
    assert_same(200, $apply['status']);
    assert_same([[FILE_004], FILE_005], [$apply['body']['applied'], $apply['body']['failed']], 'what ran first, and the file that failed');
    $error = (string) $apply['body']['error'];
    assert_match('/^statement \d+ of \d+: SQLSTATE\[P0001\]: Raise exception: 7 ERROR:  the test refuses to change language\.button/', $error, 'PostgreSQL\'s own words, with the statement\'s number');
    assert_match('/\n\n  UPDATE translation_keys/', $error, 'and the statement\'s first lines');

    assert_same([FILE_005], pending_now(), '004 stands, 005 waits');
    assert_same(null, dbValue("SELECT name FROM translation_keys WHERE name = 'signedOut.heading'"), 'the keys 005 wrote before it failed were rolled back with it');
    $log = implode("\n", server_problems($GLOBALS['app']));
    assert_match('/\[db\] the migration ' . preg_quote(FILE_005, '/') . ' failed: statement \d+ of \d+: SQLSTATE\[P0001\]/', $log, 'the server\'s log has it too');
    assert_same(503, as_user(PAT, 'GET', '/api/surveys')['status'], 'still behind');

    // Whatever was in the way is gone: the next Apply goes through.
    dbExec('DROP TRIGGER survey_test_refuse ON translation_keys');
    $again = as_user(ADA, 'POST', '/api/admin/migrations/apply');
    assert_same(['applied' => [FILE_005], 'failed' => null, 'error' => null], $again['body']);
    assert_same('You are not signed in', dbValue("SELECT value FROM translations WHERE key_name = 'signedOut.heading' AND language_code = 'en'"));
    assert_same(200, as_user(PAT, 'GET', '/api/surveys')['status']);
});

test('one update at a time: while another holds the lock, Apply and php migration.php apply nothing and say so', function (): void {
    behind(FILE_005);
    // Another update running: this test's own connection holds the lock setup.php, migration.php and Apply take.
    dbValue('SELECT pg_advisory_lock(?::bigint)', [DATABASE_UPDATE_LOCK]);
    try {
        $busy = as_user(ADA, 'POST', '/api/admin/migrations/apply');
        assert_same([409, 'busy'], [$busy['status'], $busy['body']['code'] ?? null]);
        assert_match('/Nothing was applied/', (string) $busy['body']['error']);
        assert_same([FILE_005], pending_now(), 'nothing was applied');
        assert_same(200, as_user(ADA, 'GET', '/api/admin/migrations')['status'], 'the list is read all the same');

        $command = [PHP_BINARY, TEST_BACKEND . '/migration.php'];
        $process = proc_open($command, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, TEST_BACKEND, ['SURVEY_TEST_CONFIG' => $GLOBALS['TEST_CONFIG_DIR']] + getenv());
        $out = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);
        $code = proc_close($process);
        assert_same(1, $code, 'php migration.php: ' . $out);
        assert_match('/Another database update is running/', $out);
        assert_same([FILE_005], pending_now(), 'nor by the command line');
    } finally {
        dbValue('SELECT pg_advisory_unlock(?::bigint)', [DATABASE_UPDATE_LOCK]);
    }

    $apply = as_user(ADA, 'POST', '/api/admin/migrations/apply');
    assert_same(['applied' => [FILE_005], 'failed' => null, 'error' => null], $apply['body'], 'the lock let go: the Apply goes through');
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
    assert_same([200, ['applied' => [FILE_006], 'failed' => null, 'error' => null]], [$apply['status'], $apply['body']]);
    assert_same($people, dbAll('SELECT id, preferred_username, email, first_seen_at, last_seen_at FROM users ORDER BY id'), 'the people as they were');
    assert_same([0, $answers], [(int) dbValue('SELECT count(*) FROM users WHERE visitor_key_hash IS NOT NULL'), dbAll('SELECT * FROM responses ORDER BY id')], 'no key, the answers as they were');
    assert_same([-1, 'responses_by_user'], [(int) dbValue("SELECT nextval('visitor_ids')"), dbValue("SELECT to_regclass('responses_by_user')::text")], 'visitors count down from -1; answers are found by person');
    dbExec('DELETE FROM surveys WHERE id = ?', [$survey]);
});

test('a database behind by 006: the surveys are not set up for nobody, a visitor key or a person alike - nor the move at sign-in', function (): void {
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
                assert_same([503, 'not_set_up', true], [$answer['status'], $answer['body']['code'] ?? null, $answer['body']['update'] ?? null], "$route, $who");
            }
        }
        $move = call($site['base'], 'POST', '/api/visitor/move', null, array_merge(bearer(test_token(PAT, ['MEMBER'])), $key));
        assert_same([503, 'not_set_up'], [$move['status'], $move['body']['code'] ?? null], 'the move');
        assert_same(false, call($site['base'], 'GET', '/api/auth/config')['body']['loginRequired'], 'the sign-in still answers, and says what the IAM says');
        assert_same(0, (int) dbValue('SELECT count(*) FROM users WHERE id < 0'), 'nobody was made a visitor');
    } finally {
        current_again();
        ($site['stop'])();
    }
});

test('the settings missing: the migrations routes are not set up either - the database is setup.php\'s', function (): void {
    $dir = test_temp_dir('no-iam');
    // Only the database's settings: the IAM's are missing.
    file_put_contents("$dir/database.local.php", '<?php return ' . var_export(['name' => dbName()] + machineDatabaseSettings(), true) . ";\n");
    $site = test_start_server(TEST_BACKEND, TEST_BACKEND . '/router.php', ['SURVEY_TEST_CONFIG' => $dir, 'SURVEY_FRONTEND_DIST' => test_frontend_build()], '/api/health');
    foreach (['GET /api/admin/migrations', 'POST /api/admin/migrations/apply', 'GET /api/auth/config'] as $route) {
        [$method, $url] = explode(' ', $route);
        $answer = call($site['base'], $method, $url, null, bearer(test_token(ADA, ['ADMIN'])));
        assert_same([503, 'not_set_up', null], [$answer['status'], $answer['body']['code'] ?? null, $answer['body']['update'] ?? null], $route);
    }
    ($site['stop'])();
});
