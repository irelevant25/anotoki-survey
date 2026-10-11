<?php

// Migration 012 on a database as its owner left it: the site's four words of
// signing in (the callback page's line and three toasts) move under the
// anotoki library's keys, anotoki.signIn.* - every language, reworded or not,
// with who saved it and when; a language left without a string stays without
// one; the site's four keys go. The library's two words of signing in that
// speak to the reader and had no key here read in this site's formal Slovak -
// whichever of 012 and the library's files ran first. And its gate fails
// loudly where a string would be lost.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

use Anotoki\Lib\Migrations\MigrationSet;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\Translations\LibraryWords;
use Anotoki\Lib\Translations\Schema as TranslationsSchema;

const FILE_012 = '012_sign_in_words.sql';
const OWNER = 7;
/** When the owner reworded: long before the update, so a string written anew by it would show. */
const REWORDED_AT = '2026-09-01 10:00:00+00';

/** The site's keys of signing in, each with the library's key that says the word now. */
const MOVED = [
    'signIn.inProgress' => 'anotoki.signIn.signingIn',
    'signIn.notCompleted' => 'anotoki.signIn.notCompleted',
    'signIn.failed' => 'anotoki.signIn.failed',
    'signIn.storageUnavailable' => 'anotoki.signIn.storageUnavailable',
];

function server_pdo(string $name): PDO
{
    return dbConnect(machineDatabaseSettings(), $name);
}

/** The database as the release before this one left it: the site's files before 011, the library's words 001 and 002 (anotoki-lib 0.3). */
function before_012(PDO $pdo): void
{
    $migrator = new Migrator($pdo, [surveyMigrationSet(), TranslationsSchema::migrationSet()], [
        'lock' => DATABASE_UPDATE_LOCK,
        'ready' => static fn(MigrationSet $set, string $name): bool => $set->library ? strcmp($name, '003') < 0 : strcmp($name, '011') < 0,
    ]);
    $result = $migrator->apply();
    assert_same(null, $result['failed'], (string) $result['error']);
}

/** What the owner did on the Translations page: reworded the toast of a sign-in turned away, and took the storage toast's Slovak away. */
function owner_rewords(PDO $pdo): void
{
    $pdo->exec('INSERT INTO users (id, preferred_username) VALUES (' . OWNER . ", 'owner')");
    $reword = $pdo->prepare('UPDATE translations SET value = ?, updated_by = ?, updated_at = ? WHERE key_name = ? AND language_code = ?');
    $reword->execute(['You did not finish signing in.', OWNER, REWORDED_AT, 'signIn.notCompleted', 'en']);
    assert_same(1, $reword->rowCount(), 'reworded');
    $pdo->exec("DELETE FROM translations WHERE key_name = 'signIn.storageUnavailable' AND language_code = 'sk'");
}

/** "key code" => [value, updated_by, updated_at] of the keys like $like ($stamped false: [value, updated_by]). */
function strings_in(PDO $pdo, string $like, bool $stamped = true): array
{
    $statement = $pdo->prepare("SELECT key_name || ' ' || language_code AS cell, value, updated_by, to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS at
                                  FROM translations WHERE key_name LIKE ? ORDER BY 1");
    $statement->execute([$like]);
    $strings = [];
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $writer = $row['updated_by'] === null ? null : (int) $row['updated_by'];
        $strings[$row['cell']] = $stamped ? [$row['value'], $writer, $row['at']] : [$row['value'], $writer];
    }

    return $strings;
}

/** The site's strings of the four keys as they stand: the library key's cell => [value, writer, when]. */
function what_moves(PDO $pdo): array
{
    $moving = [];
    foreach (MOVED as $own => $library) {
        foreach (strings_in($pdo, $own) as $cell => $string) {
            $moving[$library . ' ' . explode(' ', $cell)[1]] = $string;
        }
    }
    ksort($moving, SORT_STRING);

    return $moving;
}

test('012 on a database as its owner left it, then the library\'s files: the four words move with who and when, a blanked Slovak stays blank, the formal Slovak stands', function (): void {
    $pdo = server_pdo(test_empty_db('owned'));
    before_012($pdo);
    owner_rewords($pdo);
    $moving = what_moves($pdo);
    assert_same(7, count($moving), 'four keys, the Slovak of one taken away');

    $result = surveyMigrator($pdo)->apply();
    assert_same(null, $result['failed'], (string) $result['error']);
    $order = array_map(static fn(array $file): string => $file['set'] . '/' . $file['name'], $result['applied']);
    assert_true(array_search('survey/' . FILE_012, $order, true) < array_search('anotoki_translations/003_sign_in_words.sql', $order, true), '012 before the library\'s words of signing in');

    $moved = array_intersect_key(strings_in($pdo, 'anotoki.signIn.%'), $moving);
    assert_same($moving, $moved, 'every language, reworded or not, with who and when');
    assert_same(['You did not finish signing in.', OWNER, '2026-09-01 10:00:00'], $moved['anotoki.signIn.notCompleted en'], 'the owner\'s rewording, theirs still');
    $words = strings_in($pdo, 'anotoki.signIn.%', false);
    assert_same(['Signing in…', null], $words['anotoki.signIn.signingIn en'], 'the site\'s own words, not the library\'s ("Signing you in…")');
    assert_same('Prihlasujeme Vás…', $words['anotoki.signIn.signingIn sk'][0], 'in its formal Slovak');
    assert_false(array_key_exists('anotoki.signIn.storageUnavailable sk', $words), 'the Slovak the owner took away: none - and the library wrote none in its place');

    // The two that had no key here: the library's English, this site's formal Slovak.
    assert_same(LibraryWords::all()['anotoki.signIn.expired']['en'], $words['anotoki.signIn.expired en'][0]);
    assert_same('Prihlásenie trvalo príliš dlho alebo sa nezačalo na tejto stránke. Skúste to, prosím, znova.', $words['anotoki.signIn.expired sk'][0]);
    assert_same('Prihlásenie teraz nie je dostupné. Skúste to, prosím, znova o pár minút.', $words['anotoki.signIn.unavailable sk'][0]);
    // The ones that speak to nobody: the library's, both languages.
    foreach (['failedTitle', 'retry', 'back'] as $name) {
        foreach (['en', 'sk'] as $code) {
            assert_same([LibraryWords::all()["anotoki.signIn.$name"][$code], null], $words["anotoki.signIn.$name $code"], "$name ($code)");
        }
    }

    assert_same([], $pdo->query("SELECT name FROM translation_keys WHERE name IN ('" . implode("', '", array_keys(MOVED)) . "')")->fetchAll(PDO::FETCH_COLUMN), 'the site\'s four keys are gone');
    assert_same(LibraryWords::all()['anotoki.signIn.failed']['description'], $pdo->query("SELECT description FROM translation_keys WHERE name = 'anotoki.signIn.failed'")->fetchColumn(), 'the descriptions are the library\'s');
    $pdo = null;
});

test('the library\'s files applied before 012 (an upload applied before 012 arrived): the same words in the end - its own give way, a rewording made on its key since stays', function (): void {
    $expected = server_pdo(test_empty_db('in_order'));
    before_012($expected);
    owner_rewords($expected);
    assert_same(null, surveyMigrator($expected)->apply()['failed']);

    $pdo = server_pdo(test_empty_db('library_first'));
    before_012($pdo);
    owner_rewords($pdo);
    $moving = what_moves($pdo);
    $first = (new Migrator($pdo, [TranslationsSchema::migrationSet()], ['lock' => DATABASE_UPDATE_LOCK]))->apply();
    assert_same(null, $first['failed']);
    assert_same('Prihlasujeme ťa…', strings_in($pdo, 'anotoki.signIn.signingIn')['anotoki.signIn.signingIn sk'][0], 'the library\'s informal words, for now');
    // The owner rewords one of the library's words of signing in before 012 comes.
    $pdo->exec("UPDATE translations SET value = 'Prihlásenie teraz nejde.', updated_by = " . OWNER . ", updated_at = '" . REWORDED_AT . "' WHERE key_name = 'anotoki.signIn.unavailable' AND language_code = 'sk'");

    $result = surveyMigrator($pdo)->apply();
    assert_same(null, $result['failed'], (string) $result['error']);
    $words = strings_in($pdo, 'anotoki.signIn.%', false);
    assert_same(['Prihlásenie teraz nejde.', OWNER], $words['anotoki.signIn.unavailable sk'], 'a rewording on the library\'s key is the owner\'s, and newer: it stays');
    assert_same('Prihlasujeme Vás…', $words['anotoki.signIn.signingIn sk'][0], 'the site\'s words over the library\'s');
    assert_false(array_key_exists('anotoki.signIn.storageUnavailable sk', $words), 'a Slovak string the site did not have: the library\'s went too');
    assert_same('Prihlásenie trvalo príliš dlho alebo sa nezačalo na tejto stránke. Skúste to, prosím, znova.', $words['anotoki.signIn.expired sk'][0], 'the formal Slovak over the library\'s informal');
    assert_same($moving, array_intersect_key(strings_in($pdo, 'anotoki.signIn.%'), $moving), 'the rest moved with who and when');

    $inOrder = strings_in($expected, 'anotoki.signIn.%', false);
    $inOrder['anotoki.signIn.unavailable sk'] = ['Prihlásenie teraz nejde.', OWNER];
    assert_same($inOrder, $words, 'every word of signing in as the engine\'s own order leaves it - but for the owner\'s newer rewording');
    $pdo = $expected = null;
});

test('012\'s gate: a string that would not move fails the file loudly, and nothing of it is kept - the next Apply goes through', function (): void {
    $pdo = server_pdo(test_empty_db('lost'));
    before_012($pdo);
    owner_rewords($pdo);
    $before = strings_in($pdo, 'signIn.%');
    // Something in the way of one string: its insert under the library's key does nothing.
    $pdo->exec("CREATE FUNCTION survey_test_swallow() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RETURN NULL; END \$\$");
    $pdo->exec("CREATE TRIGGER survey_test_swallow BEFORE INSERT ON translations FOR EACH ROW WHEN (NEW.key_name = 'anotoki.signIn.notCompleted' AND NEW.language_code = 'sk') EXECUTE FUNCTION survey_test_swallow()");

    $result = surveyMigrator($pdo)->apply();
    assert_same(['set' => 'survey', 'name' => FILE_012], $result['failed'], (string) $result['error']);
    assert_match('/strings that did not move under the library\'s keys: anotoki\.signIn\.notCompleted \(sk\)/', (string) $result['error']);
    assert_same($before, strings_in($pdo, 'signIn.%'), 'rolled back whole: the site\'s keys and strings as they were');
    assert_same(0, (int) $pdo->query("SELECT count(*) FROM translation_keys WHERE name LIKE 'anotoki.signIn.%'")->fetchColumn(), 'no library key of signing in either');

    $pdo->exec('DROP TRIGGER survey_test_swallow ON translations');
    $again = surveyMigrator($pdo)->apply();
    assert_same(null, $again['failed'], (string) $again['error']);
    assert_same(['You did not finish signing in.', OWNER, '2026-09-01 10:00:00'], strings_in($pdo, 'anotoki.signIn.notCompleted')['anotoki.signIn.notCompleted en']);
    $pdo = null;
});
