<?php

// The migration engine (api/migration_runner.php, the family's): a database
// is built from migrations/survey/ in order, each file once - and what it
// builds keeps the rules the code leans on.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

function server_pdo(string $name): PDO
{
    return dbConnect(machineDatabaseSettings(), $name);
}

test('an empty database gets every migration, recorded once', function (): void {
    $name = test_empty_db('fresh');
    $pdo = server_pdo($name);
    assert_same(migrationFiles(), pendingMigrationsReadOnly($pdo), 'all of them pending, and nothing written to find out');
    assert_false((bool) $pdo->query("SELECT to_regclass('migrations') IS NOT NULL")->fetchColumn());

    $result = applyPendingMigrations($pdo);
    assert_same(['applied' => migrationFiles(), 'failed' => null, 'error' => null], $result);
    assert_same([], pendingMigrationsReadOnly($pdo));
    assert_same(['applied' => [], 'failed' => null, 'error' => null], applyPendingMigrations($pdo), 'a second run applies nothing');
    foreach (['users', 'surveys', 'responses', 'images', 'survey_images', 'languages', 'translation_keys', 'translations'] as $table) {
        assert_true((bool) $pdo->query("SELECT to_regclass('$table') IS NOT NULL")->fetchColumn(), "the table $table");
    }
    $pdo = null;
});

test('the database itself keeps the rules: one answer per person, one live survey per address', function (): void {
    test_db();
    dbExec("INSERT INTO users (id, preferred_username) VALUES (1, 'anna')");
    $content = jsonText(['intro' => '', 'thanks' => '', 'askAboutYou' => false, 'steps' => []]);
    $a = (string) dbValue("INSERT INTO surveys (slug, title, status, content) VALUES ('same', 'A', 'open', ?::jsonb) RETURNING id", [$content]);
    dbExec("INSERT INTO surveys (slug, title, status, content) VALUES ('same', 'B', 'draft', ?::jsonb)", [$content]);
    assert_throws(static fn() => dbExec("INSERT INTO surveys (slug, title, status, content) VALUES ('same', 'C', 'closed', ?::jsonb)", [$content]), '/surveys_live_slug/');
    assert_throws(static fn() => dbExec("INSERT INTO surveys (slug, title, status, content) VALUES ('x', 'D', 'published', ?::jsonb)", [$content]), '/check/i');

    dbExec("INSERT INTO responses (survey_id, user_id, started_at) VALUES (?, 1, now())", [$a]);
    assert_throws(static fn() => dbExec("INSERT INTO responses (survey_id, user_id, started_at) VALUES (?, 1, now())", [$a]), '/duplicate key/');
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

test('a SQL file splits into statements, never inside a string, a comment or a $$ block', function (): void {
    $sql = "-- a comment; with a semicolon\nCREATE TABLE a (x text DEFAULT 'semi;colon');\n/* block; */ SELECT 1;\n"
        . "DO \$\$ BEGIN IF 1 <> 1 THEN RAISE EXCEPTION 'no;'; END IF; END \$\$;\nSELECT 'it''s';";
    assert_same([
        "CREATE TABLE a (x text DEFAULT 'semi;colon')",
        'SELECT 1',
        "DO \$\$ BEGIN IF 1 <> 1 THEN RAISE EXCEPTION 'no;'; END IF; END \$\$",
        "SELECT 'it''s'",
    ], splitSqlStatements($sql));
});
