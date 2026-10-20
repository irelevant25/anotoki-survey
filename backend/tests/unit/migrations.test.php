<?php

// The migration engine - the anotoki family's (anotoki/lib, through
// api/migrations.php): a database is built from the library's admin set
// (anotoki_admin) first, then migrations/survey/ in order, then the library's
// words (anotoki_translations) and people (anotoki_people), each file once,
// recorded in the `migrations` table the site has always had - the library's
// files as set/name - by the engine, and by the command line from nothing at
// all - and what it builds keeps the rules the code leans on.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

function server_pdo(string $name): PDO
{
    return dbConnect(machineDatabaseSettings(), $name);
}

/** `php migration.php` with $arguments, for the settings in $config: [exit code, what it printed]. */
function migration_cli(string $config, array $arguments = []): array
{
    $process = proc_open(
        array_merge([PHP_BINARY, TEST_BACKEND . '/migration.php'], $arguments),
        [1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
        $pipes,
        TEST_BACKEND,
        ['SURVEY_TEST_CONFIG' => $config] + getenv(),
    );
    $out = stream_get_contents($pipes[1]) . stream_get_contents($pipes[2]);

    return [proc_close($process), $out];
}

test('an empty database gets every migration, recorded once - in the table the site has always had', function (): void {
    $entries = migration_entries();
    $sets = array_values(array_unique(array_column($entries, 'set')));
    assert_same(
        ['anotoki_admin', 'survey', 'anotoki_translations', 'anotoki_people'],
        $sets,
        'the sets in the order they run: the library\'s admin set first, the site\'s, then the library\'s words and people',
    );
    assert_same(
        [['set' => 'anotoki_admin', 'name' => '001_audit_log.sql'], ['set' => 'anotoki_admin', 'name' => '002_feedback.sql'], ['set' => 'survey', 'name' => '001_initial_schema.sql']],
        array_slice($entries, 0, 3),
        'the files, in the order they run',
    );
    $survey = array_keys(array_filter($entries, static fn(array $entry): bool => $entry['set'] === 'survey'));
    assert_same(range($survey[0], $survey[count($survey) - 1]), $survey, 'the site\'s own one after the other');
    assert_same(['set' => 'survey', 'name' => '017_non_binary_no_longer_offered.sql'], $entries[end($survey)], 'the site\'s last file before the library\'s words');
    assert_same(['set' => 'anotoki_people', 'name' => '001_people.sql'], $entries[count($entries) - 1], 'the people\'s tables last: after 011 adds the column the scrub writes');
    $name = test_empty_db('fresh');
    $migrator = surveyMigrator(server_pdo($name));
    assert_same($entries, $migrator->applicable(), 'all of them pending...');
    $pdo = server_pdo($name);
    assert_false((bool) $pdo->query("SELECT to_regclass('migrations') IS NOT NULL")->fetchColumn(), '...and nothing written to find out');

    $result = $migrator->apply();
    assert_same(['applied' => $entries, 'failed' => null, 'error' => null, 'busy' => false, 'note' => null], $result);
    assert_same([], $migrator->applicable());
    assert_same(['applied' => [], 'failed' => null, 'error' => null, 'busy' => false, 'note' => null], $migrator->apply(), 'a second run applies nothing');
    foreach (
        [
            'users',
            'surveys',
            'responses',
            'images',
            'survey_images',
            'languages',
            'translation_keys',
            'translations',
            'anotoki_audit_log',
            'anotoki_feedback',
            'anotoki_people_sync',
            'anotoki_people_anonymized',
        ]
        as $table
    ) {
        assert_true((bool) $pdo->query("SELECT to_regclass('$table') IS NOT NULL")->fetchColumn(), "the table $table");
    }

    // The bookkeeping table is the one every database of the site already has - never another shape.
    assert_same(
        [['id', 'integer'], ['filename', 'character varying'], ['applied_at', 'timestamp without time zone']],
        $pdo->query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'migrations' ORDER BY ordinal_position")->fetchAll(PDO::FETCH_NUM),
    );
    assert_same(
        array_map('migration_record', $entries),
        $pdo->query('SELECT filename FROM migrations ORDER BY id')->fetchAll(PDO::FETCH_COLUMN),
        'one row a file, in the order they ran - the library\'s with its set',
    );
    $status = $migrator->status();
    assert_same([['anotoki_admin', 'survey', 'anotoki_translations', 'anotoki_people'], [], []], [$status['sets'], $status['pending'], $status['missing']]);
    foreach ($status['applied'] as $row) {
        assert_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/D', (string) $row['applied_at'], 'when, in UTC');
    }
    $migrator = $pdo = null;
});

test('php migration.php builds a database from nothing - made, every file applied - and then says it is up to date', function (): void {
    $files = array_map('migration_record', migration_entries());
    $name = dbName() . '_cli';
    // Not there yet: the command line makes it. Dropped at the end like the file's own.
    $GLOBALS['TEST_DBS'][] = $name;
    $config = test_config_dir(test_iam(), $name);

    [$code, $out] = migration_cli($config, ['--dry-run']);
    assert_same(1, $code, 'a dry run makes nothing - not even the database: ' . $out);
    assert_false(dbExists(machineDatabaseSettings(), $name));

    [$code, $out] = migration_cli($config);
    assert_same(0, $code, $out);
    assert_match('/Database created\./', $out);
    foreach ($files as $file) {
        assert_match('/' . preg_quote($file, '/') . ' \.\.\. .*done/', $out, "$file applied");
    }
    assert_same($files, server_pdo($name)->query('SELECT filename FROM migrations ORDER BY id')->fetchAll(PDO::FETCH_COLUMN));

    [$code, $out] = migration_cli($config, ['--status']);
    assert_same(0, $code, $out);
    assert_match('/' . count($files) . ' applied, 0 pending/', $out);
    [$code, $out] = migration_cli($config);
    assert_same(0, $code, $out);
    assert_match('/Up to date - ' . count($files) . ' migrations\./', $out);

    // Behind by its last file: the dry run names it and applies nothing; the run applies it.
    $last = end($files);
    server_pdo($name)
        ->prepare('DELETE FROM migrations WHERE filename = ?')
        ->execute([$last]);
    [$code, $out] = migration_cli($config, ['--dry-run']);
    assert_same(0, $code, $out);
    assert_match('/would apply ' . preg_quote($last, '/') . '/', $out);
    assert_match('/' . (count($files) - 1) . ' applied, 1 pending/', migration_cli($config, ['--status'])[1]);
    [$code, $out] = migration_cli($config);
    assert_same(0, $code, $out);
    assert_match('/' . preg_quote($last, '/') . ' \.\.\. .*done/', $out);
    assert_match('/Up to date/', migration_cli($config)[1]);
});

test('the database itself keeps the rules: one answer per person, one live survey per address', function (): void {
    test_db();
    dbExec("INSERT INTO users (id, preferred_username) VALUES (1, 'anna')");
    $content = jsonText(['intro' => '', 'thanks' => '', 'askAboutYou' => false, 'steps' => []]);
    $a = (string) dbValue("INSERT INTO surveys (slug, title, status, content) VALUES ('same', 'A', 'open', ?::jsonb) RETURNING id", [$content]);
    dbExec("INSERT INTO surveys (slug, title, status, content) VALUES ('same', 'B', 'draft', ?::jsonb)", [$content]);
    assert_throws(static fn() => dbExec("INSERT INTO surveys (slug, title, status, content) VALUES ('same', 'C', 'closed', ?::jsonb)", [$content]), '/surveys_live_slug/');
    assert_throws(static fn() => dbExec("INSERT INTO surveys (slug, title, status, content) VALUES ('x', 'D', 'published', ?::jsonb)", [$content]), '/check/i');

    dbExec('INSERT INTO responses (survey_id, user_id, started_at) VALUES (?, 1, now())', [$a]);
    assert_throws(static fn() => dbExec('INSERT INTO responses (survey_id, user_id, started_at) VALUES (?, 1, now())', [$a]), '/duplicate key/');
    assert_throws(static fn() => dbExec("INSERT INTO responses (survey_id, user_id, gender, started_at) VALUES (?, 1, 'other', now())", [$a]), '/check/i');

    // The language a survey was read in: a language the site has, or none - and none again when that language goes.
    assert_same(null, dbValue('SELECT language FROM responses WHERE survey_id = ?', [$a]), 'answers from before surveys had languages');
    dbExec("INSERT INTO users (id, preferred_username) VALUES (2, 'ben'), (3, 'cyd')");
    dbExec("INSERT INTO languages (code, name, native_name) VALUES ('de', 'German', 'Deutsch')");
    dbExec("INSERT INTO responses (survey_id, user_id, started_at, language) VALUES (?, 2, now(), 'de')", [$a]);
    assert_throws(static fn() => dbExec("INSERT INTO responses (survey_id, user_id, started_at, language) VALUES (?, 3, now(), 'xx')", [$a]), '/foreign key/');
    dbExec("INSERT INTO responses (survey_id, user_id, started_at, language) VALUES (?, 3, now(), (SELECT code FROM languages WHERE code = 'xx'))", [$a]);
    dbExec("DELETE FROM languages WHERE code = 'de'");
    assert_same([3, 0], [(int) dbValue('SELECT count(*) FROM responses'), (int) dbValue('SELECT count(*) FROM responses WHERE language IS NOT NULL')], 'the answers stay, without the note');

    dbExec('DELETE FROM surveys WHERE id = ?', [$a]);
    assert_same(0, (int) dbValue('SELECT count(*) FROM responses'), 'a survey\'s answers go with it');
});

test('the database keeps the visitors\' rules: a negative id, nameless, never deleted at the IAM, a key\'s hash only theirs and only once; no id 0', function (): void {
    test_db();
    $first = (int) dbValue("SELECT nextval('visitor_ids')");
    assert_same([true, $first - 1], [$first < 0, (int) dbValue("SELECT nextval('visitor_ids')")], 'visitors count down, below every IAM id');
    $hash = hash('sha256', 'a key');
    dbExec('INSERT INTO users (id, visitor_key_hash) VALUES (-50, ?)', [$hash]);
    dbExec('INSERT INTO users (id) VALUES (-51)'); // ended: no key, its answers stay
    assert_throws(static fn() => dbExec('INSERT INTO users (id, visitor_key_hash) VALUES (-52, ?)', [$hash]), '/users_visitor_key_hash_unique/');
    assert_throws(static fn() => dbExec('INSERT INTO users (id, visitor_key_hash) VALUES (52, ?)', [hash('sha256', 'b')]), '/users_visitor_check/');
    assert_throws(static fn() => dbExec("INSERT INTO users (id, preferred_username) VALUES (-53, 'somebody')"), '/users_visitor_check/');
    assert_throws(static fn() => dbExec('INSERT INTO users (id, anonymized_at) VALUES (-54, now())'), '/users_visitor_check/');
    assert_throws(static fn() => dbExec('INSERT INTO users (id) VALUES (0)'), '/users_visitor_check/');
    assert_throws(static fn() => dbExec('INSERT INTO users (id, visitor_key_hash) VALUES (-55, ?)', [strtoupper(hash('sha256', 'c'))]), '/users_visitor_check/');
    assert_throws(static fn() => dbExec("INSERT INTO users (id, visitor_key_hash) VALUES (-56, 'the key itself')"), '/users_visitor_check/');
    assert_throws(static fn() => dbExec("INSERT INTO visitor_counters (name, count, window_ends) VALUES ('x', -1, now())"), '/check/i');
    dbExec('DELETE FROM users WHERE id < 0');
});

// The library tests its splitter through and through; this holds it to what the site's own files are
// written with - a failure is named by its statement, so a wrong split would name the wrong one.
test('a SQL file splits into statements, never inside a string, a comment or a $$ block - with Windows line endings too', function (): void {
    $sql =
        "-- a comment; with a semicolon\nCREATE TABLE a (x text DEFAULT 'semi;colon');\n/* block; */ SELECT 1;\n" .
        "DO \$\$ BEGIN IF 1 <> 1 THEN RAISE EXCEPTION 'no;'; END IF; END \$\$;\nSELECT 'it''s';";
    $statements = ["CREATE TABLE a (x text DEFAULT 'semi;colon')", 'SELECT 1', "DO \$\$ BEGIN IF 1 <> 1 THEN RAISE EXCEPTION 'no;'; END IF; END \$\$", "SELECT 'it''s'"];
    assert_same($statements, \Anotoki\Lib\Migrations\Splitter::split($sql));
    assert_same($statements, \Anotoki\Lib\Migrations\Splitter::split(str_replace("\n", "\r\n", $sql)), 'a checkout with CRLF line endings');
});
