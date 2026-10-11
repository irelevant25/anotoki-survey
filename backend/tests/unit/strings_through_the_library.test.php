<?php

// Migration 010 on a database as its owner left it: the site's words move under
// the anotoki library's keys - every language, reworded or not, with who saved
// it and when; a language left without a string stays without one; the kit's
// own keys go, the three the pages share stay; the library's words that speak
// to the reader read in this site's formal Slovak - whichever of 010 and the
// library's files ran first. And its gate fails loudly where a string would be
// lost.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

use Anotoki\Lib\Migrations\MigrationSet;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\Translations\LibraryWords;
use Anotoki\Lib\Translations\Schema;

const FILE_010 = '010_strings_through_the_library.sql';
const OWNER = 7;
/** When the owner reworded: long before the update, so a string written anew by it would show. */
const REWORDED_AT = '2026-09-01 10:00:00+00';

/** The site's keys only the kit asked for: 010 moves them, and they go. */
const KIT_ONLY = [
    'toast.dismiss' => 'anotoki.ui.dismiss', 'toast.region' => 'anotoki.ui.notifications', 'common.cancel' => 'anotoki.ui.cancel',
    'common.confirm' => 'anotoki.ui.confirm', 'topbar.sections' => 'anotoki.topbar.sections', 'topbar.phoneMenu' => 'anotoki.topbar.phoneMenu',
    'topbar.menuButton' => 'anotoki.topbar.menuButton', 'topbar.menu' => 'anotoki.topbar.menu', 'topbar.roleAdmin' => 'anotoki.topbar.roleAdmin',
    'topbar.roleEditor' => 'anotoki.topbar.roleEditor', 'topbar.account' => 'anotoki.topbar.account', 'topbar.admin' => 'anotoki.topbar.admin',
    'common.signOut' => 'anotoki.topbar.signOut', 'language.button' => 'anotoki.language.button', 'language.notLoaded' => 'anotoki.language.notLoaded',
    'language.notSaved' => 'anotoki.language.notSaved', 'theme.label' => 'anotoki.theme.label', 'theme.light' => 'anotoki.theme.light',
    'theme.dark' => 'anotoki.theme.dark', 'theme.auto' => 'anotoki.theme.auto', 'theme.autoHint' => 'anotoki.theme.autoHint',
    'theme.notSaved' => 'anotoki.theme.notSaved',
];
/** The site's keys its own pages ask for too: 010 copies them, and they stay. */
const SHARED = ['common.close' => 'anotoki.ui.close', 'common.tryAgain' => 'anotoki.ui.retry', 'common.signIn' => 'anotoki.topbar.signIn'];

function server_pdo(string $name): PDO
{
    return dbConnect(machineDatabaseSettings(), $name);
}

/** The site's own files before 010 - and nothing of the library's: a database as the release before this one left it. */
function before_010(PDO $pdo): array
{
    $migrator = new Migrator($pdo, [surveyMigrationSet()], [
        'lock' => DATABASE_UPDATE_LOCK,
        // 010 and every file after it wait, as a draft holds them.
        'ready' => static fn(MigrationSet $set, string $name): bool => strcmp($name, FILE_010) < 0,
    ]);

    return $migrator->apply();
}

/**
 * What the owner did on the Translations page: reworded a word of the bar in
 * Slovak and the Sign in in English (a key the pages share), took the theme
 * switch's Slovak name away (it reads the English), and kept an old wording of
 * the language button that has no {code}.
 */
function owner_rewords(PDO $pdo): void
{
    $pdo->exec("INSERT INTO users (id, preferred_username) VALUES (" . OWNER . ", 'owner')");
    $reword = $pdo->prepare('UPDATE translations SET value = ?, updated_by = ?, updated_at = ? WHERE key_name = ? AND language_code = ?');
    foreach ([
        ['topbar.menu', 'sk', 'Vaša osobná ponuka'],
        ['common.signIn', 'en', 'Log in'],
        ['language.button', 'en', 'Language: {name}'],
        ['home.title', 'en', 'Our surveys'],
    ] as [$key, $code, $value]) {
        $reword->execute([$value, OWNER, REWORDED_AT, $key, $code]);
        assert_same(1, $reword->rowCount(), "$key ($code) reworded");
    }
    $pdo->exec("DELETE FROM translations WHERE key_name = 'theme.label' AND language_code = 'sk'");
}

/**
 * The strings of keys as they are: "key code" => [value, updated_by, updated_at] (updated_at only for
 * $stamped: a string written by a migration is dated when it ran).
 *
 * @return array<string, array<int, mixed>>
 */
function strings_in(PDO $pdo, string $like, bool $stamped = true): array
{
    $statement = $pdo->prepare("SELECT key_name || ' ' || language_code AS cell, value, updated_by, to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS') AS at
                                  FROM translations WHERE key_name LIKE ? ORDER BY 1");
    $statement->execute([$like]);
    $strings = [];
    foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
        $strings[$row['cell']] = $stamped ? [$row['value'], $row['updated_by'] === null ? null : (int) $row['updated_by'], $row['at']] : [$row['value'], $row['updated_by'] === null ? null : (int) $row['updated_by']];
    }

    return $strings;
}

/** The site's strings of every key 010 takes over, as they stand before it: the library's key's cell => [value, writer, when]. */
function what_moves(PDO $pdo): array
{
    $moving = [];
    foreach (KIT_ONLY + SHARED as $own => $library) {
        foreach (strings_in($pdo, $own) as $cell => $string) {
            $moving[$library . ' ' . explode(' ', $cell)[1]] = $string;
        }
    }
    ksort($moving, SORT_STRING);

    return $moving;
}

test('010 on a database as its owner left it, then the library\'s files: every word moves with who and when, a blanked Slovak stays blank, the formal Slovak stands', function (): void {
    $pdo = server_pdo(test_empty_db('owned'));
    assert_same(null, before_010($pdo)['failed']);
    owner_rewords($pdo);
    $moving = what_moves($pdo);
    $shared = strings_in($pdo, 'common.%');
    $others = strings_in($pdo, 'home.%');

    $result = surveyMigrator($pdo)->apply();
    assert_same(['set' => 'survey', 'name' => FILE_010], $result['applied'][0] ?? null, '010 first...');
    assert_same([['set' => 'anotoki_translations', 'name' => '001_languages_and_strings.sql'], ['set' => 'anotoki_translations', 'name' => '002_library_words.sql']], array_slice($result['applied'], 1), '...then the library\'s files');
    assert_same([null, null], [$result['failed'], $result['error']]);

    // Every string of the site's keys, under the library's key: the same words, the same writer, the same moment.
    $moved = array_intersect_key(strings_in($pdo, 'anotoki.%'), $moving);
    assert_same($moving, $moved, 'every language, reworded or not, with who and when');
    assert_same(['Vaša osobná ponuka', OWNER, '2026-09-01 10:00:00'], $moved['anotoki.topbar.menu sk'], 'the owner\'s rewording, theirs still');
    assert_same(['Log in', OWNER, '2026-09-01 10:00:00'], $moved['anotoki.topbar.signIn en']);
    assert_same('Language: {name}', $moved['anotoki.language.button en'][0], 'an old wording without {code} too - the command line lists it, and the owner rewords it');
    assert_same('Rola: administrátor', $moved['anotoki.topbar.roleAdmin sk'][0], 'the site\'s own words, not the library\'s ("Administrátor")');

    // The Slovak the owner took away: none - and the library wrote none in its place.
    assert_false(array_key_exists('anotoki.theme.label sk', strings_in($pdo, 'anotoki.%')), 'the theme switch\'s Slovak name is still the English\'s');
    assert_same('Theme', strings_in($pdo, 'anotoki.theme.label')['anotoki.theme.label en'][0]);

    // The kit's keys are gone; the three the pages ask for stay as they were, their strings untouched.
    $left = $pdo->query("SELECT name FROM translation_keys WHERE name IN ('" . implode("', '", array_keys(KIT_ONLY + SHARED)) . "') ORDER BY name")->fetchAll(PDO::FETCH_COLUMN);
    assert_same(['common.close', 'common.signIn', 'common.tryAgain'], $left);
    assert_same(array_diff_key($shared, array_flip(array_map(static fn(string $key): string => "$key en", array_keys(KIT_ONLY))), array_flip(array_map(static fn(string $key): string => "$key sk", array_keys(KIT_ONLY)))), strings_in($pdo, 'common.%'), 'the shared keys\' strings as they were');
    assert_same($others, strings_in($pdo, 'home.%'), 'and nothing else of the site\'s');

    // The two that had no key here: the library's English, this site's formal Slovak.
    $formal = strings_in($pdo, 'anotoki.%', false);
    assert_same(['Kopírovanie nefungovalo. Označte text a skopírujte ho ručne.', null], $formal['anotoki.ui.copyFailed sk']);
    assert_same(['Copying did not work. Select the text and copy it yourself.', null], $formal['anotoki.ui.copyFailed en']);
    assert_same(['Skúste to, prosím, znova o pár minút. Táto stránka sa obnoví sama.', null], $formal['anotoki.siteStatus.unavailableText sk']);

    // The rest of the library's words are the library's, in both languages; its descriptions are its own.
    assert_same([LibraryWords::all()['anotoki.ui.loading']['en'], null], $formal['anotoki.ui.loading en']);
    assert_same([LibraryWords::all()['anotoki.ui.loading']['sk'], null], $formal['anotoki.ui.loading sk']);
    assert_same(in_order_keys(LibraryWords::keys()), $pdo->query("SELECT name FROM translation_keys WHERE name LIKE 'anotoki.%' ORDER BY name COLLATE \"C\"")->fetchAll(PDO::FETCH_COLUMN));
    assert_same(LibraryWords::all()['anotoki.topbar.menu']['description'], $pdo->query("SELECT description FROM translation_keys WHERE name = 'anotoki.topbar.menu'")->fetchColumn());
    $pdo = null;
});

test('the library\'s files applied before 010 (an upload applied before 010 arrived): the same words in the end - its own give way, a rewording made on its key since stays', function (): void {
    // The order the engine runs, for comparing.
    $expected = server_pdo(test_empty_db('in_order'));
    before_010($expected);
    owner_rewords($expected);
    surveyMigrator($expected)->apply();

    $pdo = server_pdo(test_empty_db('library_first'));
    before_010($pdo);
    owner_rewords($pdo);
    $moving = what_moves($pdo);
    // The library's set alone first: its words where there were none.
    $first = (new Migrator($pdo, [Schema::migrationSet()], ['lock' => DATABASE_UPDATE_LOCK]))->apply();
    assert_same([null, 2], [$first['failed'], count($first['applied'])]);
    assert_same('Tvoja ponuka', strings_in($pdo, 'anotoki.topbar.menu')['anotoki.topbar.menu sk'][0], 'the library\'s informal words, for now');
    // And the owner rewords one of the library's keys on the Translations page before 010 comes.
    $pdo->exec("UPDATE translations SET value = 'Never mind', updated_by = " . OWNER . ", updated_at = '" . REWORDED_AT . "' WHERE key_name = 'anotoki.ui.cancel' AND language_code = 'en'");

    $result = surveyMigrator($pdo)->apply();
    assert_same([[['set' => 'survey', 'name' => FILE_010]], null], [$result['applied'], $result['failed']], (string) $result['error']);

    $words = strings_in($pdo, 'anotoki.%', false);
    assert_same(['Never mind', OWNER], $words['anotoki.ui.cancel en'], 'a rewording on the library\'s key is the owner\'s, and newer: it stays');
    assert_same(['Vaša osobná ponuka', OWNER], $words['anotoki.topbar.menu sk'], 'the site\'s words over the library\'s');
    assert_false(array_key_exists('anotoki.theme.label sk', $words), 'a Slovak string the site did not have: the library\'s went too');
    assert_same('Kopírovanie nefungovalo. Označte text a skopírujte ho ručne.', $words['anotoki.ui.copyFailed sk'][0], 'the formal Slovak over the library\'s informal');
    assert_same('Skúste to, prosím, znova o pár minút. Táto stránka sa obnoví sama.', $words['anotoki.siteStatus.unavailableText sk'][0]);
    $moved = array_intersect_key(strings_in($pdo, 'anotoki.%'), $moving);
    unset($moving['anotoki.ui.cancel en'], $moved['anotoki.ui.cancel en']);
    assert_same($moving, $moved, 'the rest moved with who and when');

    $inOrder = strings_in($expected, 'anotoki.%', false);
    $inOrder['anotoki.ui.cancel en'] = ['Never mind', OWNER];
    assert_same($inOrder, $words, 'every library word as the engine\'s own order leaves it - but for the owner\'s newer rewording');
    $pdo = $expected = null;
});

test('010\'s gate: a string that would not move fails the file loudly, and nothing of it is kept - the next Apply goes through', function (): void {
    $pdo = server_pdo(test_empty_db('lost'));
    before_010($pdo);
    owner_rewords($pdo);
    $before = strings_in($pdo, '%');
    // Something in the way of one string: its insert under the library's key does nothing.
    $pdo->exec("CREATE FUNCTION survey_test_swallow() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RETURN NULL; END \$\$");
    $pdo->exec("CREATE TRIGGER survey_test_swallow BEFORE INSERT ON translations FOR EACH ROW WHEN (NEW.key_name = 'anotoki.topbar.menu' AND NEW.language_code = 'sk') EXECUTE FUNCTION survey_test_swallow()");

    $result = surveyMigrator($pdo)->apply();
    assert_same([[], ['set' => 'survey', 'name' => FILE_010]], [$result['applied'], $result['failed']]);
    assert_match('/strings that did not move under the library\'s keys: anotoki\.topbar\.menu \(sk\)/', (string) $result['error']);
    assert_same($before, strings_in($pdo, '%'), 'rolled back whole: the site\'s keys and strings as they were');
    assert_same(0, (int) $pdo->query("SELECT count(*) FROM translation_keys WHERE name LIKE 'anotoki.%'")->fetchColumn(), 'no library key either');

    $pdo->exec('DROP TRIGGER survey_test_swallow ON translations');
    $again = surveyMigrator($pdo)->apply();
    assert_same([null, 3], [$again['failed'], count($again['applied'])]);
    assert_same(['Vaša osobná ponuka', OWNER, '2026-09-01 10:00:00'], strings_in($pdo, 'anotoki.topbar.menu')['anotoki.topbar.menu sk']);
    $pdo = null;
});

test('010 run again over what it did (a database whose record of it went) changes nothing, and passes its gate', function (): void {
    $pdo = server_pdo(test_empty_db('again'));
    before_010($pdo);
    owner_rewords($pdo);
    surveyMigrator($pdo)->apply();
    $done = strings_in($pdo, '%');
    $keys = $pdo->query('SELECT name, description FROM translation_keys ORDER BY name COLLATE "C"')->fetchAll(PDO::FETCH_ASSOC);

    $pdo->prepare('DELETE FROM migrations WHERE filename = ?')->execute([FILE_010]);
    $result = surveyMigrator($pdo)->apply();
    assert_same([[['set' => 'survey', 'name' => FILE_010]], null], [$result['applied'], $result['failed']], (string) $result['error']);
    assert_same($done, strings_in($pdo, '%'), 'every string as it was, with who and when');
    $after = $pdo->query('SELECT name, description FROM translation_keys ORDER BY name COLLATE "C"')->fetchAll(PDO::FETCH_ASSOC);
    assert_same(array_column($keys, 'name'), array_column($after, 'name'), 'the same keys');
    $pdo = null;
});

/** Library keys in the order the database sorts them (COLLATE "C"). */
function in_order_keys(array $keys): array
{
    sort($keys, SORT_STRING);

    return $keys;
}
