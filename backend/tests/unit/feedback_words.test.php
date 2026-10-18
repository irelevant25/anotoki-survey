<?php

// Migration 014: the feedback form's words that speak to the reader, in this
// site's formal Slovak - whichever of 014 and the library's words of the form
// (anotoki_translations/004) ran first: on a new database this site's files
// run first, and 014 writes the keys with the library's English and its own
// Slovak; on every site installed before it the library's file ran long ago,
// and its informal Slovak gives way - but where the owner reworded a word on
// the Translations page, which stays. And its gate fails loudly where the
// library's informal Slovak would be left.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

use Anotoki\Lib\Migrations\MigrationSet;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\Translations\LibraryWords;
use Anotoki\Lib\Translations\Schema as TranslationsSchema;

const FILE_014 = '014_feedback_words.sql';
const OWNER = 7;
/** When the owner reworded: long before the update, so a string written anew by it would show. */
const REWORDED_AT = '2026-09-01 10:00:00+00';

/** This site's formal Slovak of the form's words that speak to the reader - 014's. */
const FORMAL = [
    'anotoki.feedback.title' => 'Pošlite nám spätnú väzbu',
    'anotoki.feedback.lead' => 'Niečo nefunguje, máte nápad alebo otázku? Napíšte nám – čítame každú správu.',
    'anotoki.feedback.message' => 'Vaša správa',
    'anotoki.feedback.email' => 'Vaša e-mailová adresa',
    'anotoki.feedback.emailHint' => 'Len ak chcete odpoveď. Na nič iné ju nepoužijeme.',
    'anotoki.feedback.anonymousHint' => 'Nepôjde s ňou ani Váš účet, ani Vaša adresa.',
    'anotoki.feedback.thanksText' => 'Vaša správa je na ceste k nám.',
    'anotoki.feedback.messageRequired' => 'Najprv napíšte správu.',
    'anotoki.feedback.subjectRequired' => 'Doplňte, prosím, predmet.',
    'anotoki.feedback.tooManyHour' => 'Ďakujeme – no to je veľa správ za krátky čas. Skúste to, prosím, znova o hodinu.',
    'anotoki.feedback.tooManyDay' => 'Ďakujeme – no dnes prišlo veľa správ. Skúste to, prosím, znova zajtra.',
    'anotoki.feedback.unavailable' => 'Správy teraz nemôžete poslať. Skúste to, prosím, znova o pár minút.',
    'anotoki.feedback.signInRequired' => 'Na poslanie správy sa, prosím, prihláste.',
    'anotoki.feedback.failed' => 'Správu sa nepodarilo poslať. Skúste to, prosím, znova – Váš text tu stále je.',
    'anotoki.feedback.network' => 'Stránka nie je dostupná. Skontrolujte pripojenie a skúste to znova.',
    'anotoki.feedback.honeypot' => 'Toto pole nechajte prázdne',
];

function server_pdo(string $name): PDO
{
    return dbConnect(machineDatabaseSettings(), $name);
}

/**
 * The database as the release before this one left it: the site's files before 014, then the library's words - all
 * of them, as on every installed site. Two runs: a file held back holds back every file after it, the library's too.
 */
function before_014(PDO $pdo): void
{
    $site = new Migrator($pdo, [surveyMigrationSet()], [
        'lock' => DATABASE_UPDATE_LOCK,
        'ready' => static fn(MigrationSet $set, string $name): bool => strcmp($name, '014') < 0,
    ]);
    $result = $site->apply();
    assert_same(null, $result['failed'], (string) $result['error']);
    $library = (new Migrator($pdo, [TranslationsSchema::migrationSet()], ['lock' => DATABASE_UPDATE_LOCK]))->apply();
    assert_same(null, $library['failed'], (string) $library['error']);
    assert_true(in_array('004_feedback_words.sql', array_column($library['applied'], 'name'), true), 'the library\'s words of the form are there');
}

/** "key code" => [value, updated_by] of the form's words. */
function feedback_words(PDO $pdo): array
{
    $words = [];
    foreach ($pdo->query("SELECT key_name || ' ' || language_code AS cell, value, updated_by FROM translations WHERE key_name LIKE 'anotoki.feedback.%' ORDER BY 1")->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $words[$row['cell']] = [$row['value'], $row['updated_by'] === null ? null : (int) $row['updated_by']];
    }

    return $words;
}

/** The rows of one of 014's temporary tables, read from the file's text: [key, code, value]. */
function rows_of_014(string $table): array
{
    $sql = str_replace("\r\n", "\n", migration_sql(FILE_014));
    assert_true((bool) preg_match('/CREATE TEMPORARY TABLE ' . $table . '\b.*?\(VALUES\n(.*?)\n\) AS [a-z]\(/s', $sql, $m), "014's $table could not be read");
    preg_match_all("/\\('([^']+)', '([a-z]{2})', '((?:[^']|'')*)'\\)/", $m[1], $rows, PREG_SET_ORDER);

    return array_map(static fn(array $row): array => [$row[1], $row[2], str_replace("''", "'", $row[3])], $rows);
}

test('014 knows the library\'s own Slovak of the form as its 004 writes it, and says the library\'s English word for word: only the Slovak is this site\'s', function (): void {
    $library = rows_of_014('library_words');
    assert_same(16, count($library), 'sixteen words that speak to the reader');
    foreach ($library as [$key, $code, $value]) {
        assert_same(['sk', LibraryWords::all()[$key]['sk'] ?? null], [$code, $value], "$key: the library's own Slovak");
    }
    $site = rows_of_014('site_words');
    assert_same(32, count($site), 'each of them in English and in Slovak');
    foreach ($site as [$key, $code, $value]) {
        if ($code === 'en') {
            assert_same(LibraryWords::all()[$key]['en'] ?? null, $value, "$key: the library's English");
        } else {
            assert_same(FORMAL[$key] ?? null, $value, "$key: this site's Slovak");
        }
    }
    assert_same(array_keys(FORMAL), array_column($library, 0), 'the same keys, in the same order');
    assert_same(array_keys(FORMAL), migration_keys_of_014(), 'every key 014 writes, and no other');
});

/** The keys 014 inserts into translation_keys. */
function migration_keys_of_014(): array
{
    $sql = str_replace("\r\n", "\n", migration_sql(FILE_014));
    preg_match('/INSERT\s+INTO\s+translation_keys\b[^;]*?\bVALUES\b(.*?)\nON CONFLICT/s', $sql, $m);
    preg_match_all("/^\\s*\\('([^']+)',/m", $m[1] ?? '', $keys);

    return $keys[1];
}

test('a new database: 014 runs before the library\'s words of the form, and writes these sixteen with the library\'s English and this site\'s Slovak - the library\'s file then gives them its descriptions, and the other words their strings', function (): void {
    $pdo = server_pdo(test_empty_db('new'));
    $result = surveyMigrator($pdo)->apply();
    assert_same(null, $result['failed'], (string) $result['error']);
    $order = array_map(static fn(array $file): string => $file['set'] . '/' . $file['name'], $result['applied']);
    assert_true(array_search('survey/' . FILE_014, $order, true) < array_search('anotoki_translations/004_feedback_words.sql', $order, true), '014 before the library\'s words of the form');

    $words = feedback_words($pdo);
    foreach (FORMAL as $key => $slovak) {
        assert_same([$slovak, null], $words["$key sk"] ?? null, "$key: this site's formal Slovak");
        assert_same([LibraryWords::all()[$key]['en'], null], $words["$key en"] ?? null, "$key: the library's English");
    }
    foreach (['send', 'kind', 'kindBug', 'subject', 'tooLong'] as $name) {
        foreach (['en', 'sk'] as $code) {
            assert_same([LibraryWords::all()["anotoki.feedback.$name"][$code], null], $words["anotoki.feedback.$name $code"] ?? null, "$name ($code): speaks to nobody - the library's own");
        }
    }
    $descriptions = $pdo->query("SELECT name, description FROM translation_keys WHERE name LIKE 'anotoki.feedback.%'")->fetchAll(PDO::FETCH_KEY_PAIR);
    foreach ($descriptions as $key => $description) {
        assert_same(LibraryWords::all()[$key]['description'], $description, "$key: the library's description");
    }
    $pdo = null;
});

test('an installed site - the library\'s words of the form there long since: its informal Slovak gives way to this site\'s formal one, an owner\'s rewording stays, the English is the library\'s', function (): void {
    $pdo = server_pdo(test_empty_db('installed'));
    before_014($pdo);
    $before = feedback_words($pdo);
    assert_same(LibraryWords::all()['anotoki.feedback.title']['sk'], $before['anotoki.feedback.title sk'][0] ?? null, 'the library\'s informal words, for now');
    // The owner rewords one of them on the Translations page before 014 comes.
    $pdo->exec('INSERT INTO users (id, preferred_username) VALUES (' . OWNER . ", 'owner')");
    $pdo->exec("UPDATE translations SET value = 'Napíšte nám, prosím.', updated_by = " . OWNER . ", updated_at = '" . REWORDED_AT . "' WHERE key_name = 'anotoki.feedback.lead' AND language_code = 'sk'");

    $result = surveyMigrator($pdo)->apply();
    assert_same(null, $result['failed'], (string) $result['error']);
    $words = feedback_words($pdo);
    foreach (FORMAL as $key => $slovak) {
        if ($key === 'anotoki.feedback.lead') {
            assert_same(['Napíšte nám, prosím.', OWNER], $words["$key sk"], 'the owner\'s rewording, theirs still');
            continue;
        }
        assert_same([$slovak, null], $words["$key sk"], "$key: the formal Slovak over the library's informal");
    }
    foreach ($before as $cell => $string) {
        if (!str_ends_with($cell, ' sk') || !array_key_exists(explode(' ', $cell)[0], FORMAL)) {
            assert_same($string, $words[$cell], "$cell: untouched - the English, and the words that speak to nobody");
        }
    }
    $pdo = null;
});

test('014\'s gate: the library\'s informal Slovak left behind fails the file loudly, nothing of it kept - and the next Apply goes through', function (): void {
    $pdo = server_pdo(test_empty_db('gate'));
    before_014($pdo);
    $before = feedback_words($pdo);
    // Something in the way of one word: its update does nothing.
    $pdo->exec("CREATE FUNCTION survey_test_swallow() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RETURN NULL; END \$\$");
    $pdo->exec("CREATE TRIGGER survey_test_swallow BEFORE UPDATE ON translations FOR EACH ROW WHEN (OLD.key_name = 'anotoki.feedback.failed' AND OLD.language_code = 'sk') EXECUTE FUNCTION survey_test_swallow()");

    $result = surveyMigrator($pdo)->apply();
    assert_same(['set' => 'survey', 'name' => FILE_014], $result['failed'], (string) $result['error']);
    assert_match('/the library\'s informal Slovak is still there: anotoki\.feedback\.failed/', (string) $result['error']);
    assert_same($before, feedback_words($pdo), 'rolled back whole: every word as it was');

    $pdo->exec('DROP TRIGGER survey_test_swallow ON translations');
    $again = surveyMigrator($pdo)->apply();
    assert_same(null, $again['failed'], (string) $again['error']);
    assert_same([FORMAL['anotoki.feedback.failed'], null], feedback_words($pdo)['anotoki.feedback.failed sk']);
    $pdo = null;
});
