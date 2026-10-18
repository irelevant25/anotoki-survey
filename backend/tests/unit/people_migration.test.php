<?php

// Migration 011 on a database as an installed site has it: users loses the
// address (the owner's decision: no anotoki site keeps a copy) and gains
// anonymized_at, the column the anotoki library's scrub writes - and every row
// stays, holding what it held: people with their names and times, visitors
// with their keys, their answers, the surveys' authors. The rule that keeps a
// visitor nameless is written again without the address. And 011's gate fails
// loudly where that rule would not hold.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

use Anotoki\Lib\Migrations\MigrationSet;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\Translations\Schema as TranslationsSchema;

const FILE_011 = '011_people.sql';

function server_pdo(string $name): PDO
{
    return dbConnect(machineDatabaseSettings(), $name);
}

/** The database as the release before this one left an installed site: the site's files before 011, the library's words 001 and 002. */
function before_011(PDO $pdo): void
{
    $migrator = new Migrator(
        $pdo,
        [surveyMigrationSet(), TranslationsSchema::migrationSet()],
        [
            'lock' => DATABASE_UPDATE_LOCK,
            'ready' => static fn(MigrationSet $set, string $name): bool => $set->library ? strcmp($name, '003') < 0 : strcmp($name, FILE_011) < 0,
        ],
    );
    $result = $migrator->apply();
    assert_same(null, $result['failed'], (string) $result['error']);
}

/** People, visitors, a survey and answers - with the addresses the site kept before 011. */
function lived_in(PDO $pdo): void
{
    $pdo->exec("INSERT INTO users (id, preferred_username, email, first_seen_at, last_seen_at) VALUES
        (1, 'owner', 'owner@example.test', '2026-09-01 08:00:00+00', '2026-10-10 18:00:00+00'),
        (101, 'pat', 'pat@example.test', '2026-09-20 10:00:00+00', '2026-10-09 09:30:00+00'),
        (102, NULL, 'only-an-address@example.test', '2026-09-21 10:00:00+00', '2026-09-21 10:00:00+00')");
    $pdo->exec("INSERT INTO users (id, visitor_key_hash, last_seen_at) VALUES (nextval('visitor_ids'), '" . hash('sha256', 'a key') . "', '2026-10-08 12:00:00+00')");
    $pdo->exec("INSERT INTO users (id, last_seen_at) VALUES (nextval('visitor_ids'), '2026-08-01 12:00:00+00')");
    $survey = $pdo
        ->query(
            "INSERT INTO surveys (slug, title, status, content, created_by) VALUES ('lived', 'Lived', 'open', '{\"intro\": \"\", \"thanks\": \"\", \"askAboutYou\": false, \"steps\": []}'::jsonb, 1) RETURNING id",
        )
        ->fetchColumn();
    $answer = $pdo->prepare("INSERT INTO responses (survey_id, user_id, started_at, language) VALUES (?, ?, now(), 'en')");
    foreach ([101, 102, -1] as $user) {
        $answer->execute([$survey, $user]);
    }
}

/** What users holds but the address, row by row. */
function users_kept(PDO $pdo): array
{
    return $pdo
        ->query(
            "SELECT id, preferred_username, to_char(first_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS first, to_char(last_seen_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS last, visitor_key_hash FROM users ORDER BY id",
        )
        ->fetchAll(PDO::FETCH_ASSOC);
}

test('011 on a database an installed site has: the address goes, anonymized_at comes, every row stays as it was - and the library\'s people come after it', function (): void {
    $pdo = server_pdo(test_empty_db('lived'));
    before_011($pdo);
    lived_in($pdo);
    $users = users_kept($pdo);
    $answers = $pdo->query('SELECT id, survey_id, user_id FROM responses ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);
    $authors = $pdo->query('SELECT id, created_by FROM surveys ORDER BY id')->fetchAll(PDO::FETCH_ASSOC);

    $result = surveyMigrator($pdo)->apply();
    assert_same(null, $result['failed'], (string) $result['error']);
    $order = array_map(static fn(array $file): string => $file['set'] . '/' . $file['name'], $result['applied']);
    assert_true(array_search('survey/' . FILE_011, $order, true) < array_search('anotoki_people/001_people.sql', $order, true), '011 before the library\'s people: ' . implode(', ', $order));

    $columns = $pdo
        ->query("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'users' AND column_name IN ('email', 'anonymized_at')")
        ->fetchAll(PDO::FETCH_NUM);
    assert_same([['anonymized_at', 'timestamp with time zone', 'YES']], $columns, 'no address any more; when the IAM deleted the account');
    assert_same($users, users_kept($pdo), 'every row, holding what it held: names, times, keys');
    assert_same(0, (int) $pdo->query('SELECT count(*) FROM users WHERE anonymized_at IS NOT NULL')->fetchColumn(), 'nobody marked deleted - only the scrub does that');
    assert_same($answers, $pdo->query('SELECT id, survey_id, user_id FROM responses ORDER BY id')->fetchAll(PDO::FETCH_ASSOC), 'the answers, everybody\'s');
    assert_same($authors, $pdo->query('SELECT id, created_by FROM surveys ORDER BY id')->fetchAll(PDO::FETCH_ASSOC), 'the surveys\' authors');
    assert_true((bool) $pdo->query("SELECT to_regclass('anotoki_people_sync') IS NOT NULL AND to_regclass('anotoki_people_anonymized') IS NOT NULL")->fetchColumn(), 'the library\'s two tables');

    // The rule keeps a visitor nameless - and never deleted at the IAM, which knows no visitor - without the address.
    foreach (["(-500, 'somebody', NULL)", '(-501, NULL, now())'] as $values) {
        assert_throws(static fn() => $pdo->exec("INSERT INTO users (id, preferred_username, anonymized_at) VALUES $values"), '/users_visitor_check/');
    }
    assert_throws(static fn() => $pdo->exec('INSERT INTO users (id) VALUES (0)'), '/users_visitor_check/');
    $pdo->exec("INSERT INTO users (id, preferred_username, anonymized_at) VALUES (900, 'deleted-900', now())");
    assert_same('deleted-900', $pdo->query('SELECT preferred_username FROM users WHERE id = 900')->fetchColumn(), 'a person the scrub blanked: what the rule allows');
    $pdo = null;
});

test('011\'s gate: a rule that would let a visitor have a name fails the file loudly, and nothing of it is kept - the next Apply goes through', function (): void {
    $pdo = server_pdo(test_empty_db('gate'));
    before_011($pdo);
    lived_in($pdo);
    $users = users_kept($pdo);
    // Something in the way of the rule: every new row's name taken away - so the gate's named visitor gets in.
    $pdo->exec("CREATE FUNCTION survey_test_nameless() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN NEW.preferred_username := NULL; RETURN NEW; END \$\$");
    $pdo->exec('CREATE TRIGGER survey_test_nameless BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION survey_test_nameless()');

    $result = surveyMigrator($pdo)->apply();
    assert_same(['set' => 'survey', 'name' => FILE_011], $result['failed'], 'refused: ' . $result['error']);
    assert_match('/011: users takes a visitor with a name/', (string) $result['error']);
    assert_same(
        1,
        (int) $pdo->query("SELECT count(*) FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'email'")->fetchColumn(),
        'rolled back whole: the address still there',
    );
    assert_same([], $pdo->query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'anonymized_at'")->fetchAll(PDO::FETCH_COLUMN));
    assert_same($users, users_kept($pdo), 'and every row as it was');

    $pdo->exec('DROP TRIGGER survey_test_nameless ON users');
    $again = surveyMigrator($pdo)->apply();
    assert_same(null, $again['failed'], (string) $again['error']);
    assert_same($users, users_kept($pdo));
    $pdo = null;
});
