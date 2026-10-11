<?php

// The site's own strings: what the migrations leave in the database against
// what the frontend asks for - so a page never shows a key instead of a
// sentence, and no string is kept that nothing reads - and the rules every
// string keeps. The strings are the anotoki library's to keep (api/translations.php,
// anotoki/lib's Anotoki\Lib\Translations): its checks, its scan's mechanics and
// its file format are tested where they are written. Here: what is this site's
// - its keys and their two languages, its formal Slovak (the library's words
// it takes over in it too), its migrations' layout, and the scan as the site
// sets it up (tools/translation_keys.php).
//
// Nothing here writes to the database: it is what the migrations made.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings
require TEST_BACKEND . '/tools/translation_keys.php';

use Anotoki\Lib\Translations\Cli\KeyScanner;
use Anotoki\Lib\Translations\LibraryWords;
use Anotoki\Lib\Translations\Placeholders;

/**
 * The library's words whose Slovak speaks to the reader - informally (ty), as
 * the other anotoki sites do. This site speaks formally (Vy), so it takes each
 * of them over in its own words (migration 010), and the pages keep the same
 * words for the time they have no strings (FORMAL_SLOVAK, core/translations.ts).
 */
const ADDRESSING_THE_READER = [
    'anotoki.ui.copyFailed', 'anotoki.topbar.menuButton', 'anotoki.topbar.menu', 'anotoki.topbar.account',
    'anotoki.language.notLoaded', 'anotoki.language.notSaved', 'anotoki.theme.notSaved', 'anotoki.siteStatus.unavailableText',
];

/** Where the pages keep the formal Slovak of the library's words, for the time they have no strings. */
const FRONTEND_FORMAL_WORDS = '/core/translations.ts';

/**
 * The migrations that write strings. Until the first of them is there the
 * database has no keys, and the checks against the frontend have nothing to
 * hold it to; from then on every one of them bites.
 *
 * @return string[]
 */
function string_migrations(): array
{
    return array_values(array_filter(
        migration_files(),
        static fn(string $file): bool => (bool) preg_match('/INSERT\s+INTO\s+translation_keys\b/i', migration_sql($file))
    ));
}

/** @return string[] every key the database has, by name */
function database_keys(): array
{
    test_db();

    return array_column(dbAll('SELECT name FROM translation_keys ORDER BY name COLLATE "C"'), 'name');
}

/** The keys that have no string in a language. */
function keys_without(string $code): array
{
    test_db();

    return surveyTranslations()->keysWithout($code);
}

/** A language's strings of these keys: key => text. */
function strings_of(string $code, array $keys): array
{
    test_db();
    $strings = [];
    foreach ($keys as $key) {
        $value = dbValue('SELECT value FROM translations WHERE key_name = ? AND language_code = ?', [$key, $code]);
        if ($value !== null) {
            $strings[$key] = $value;
        }
    }

    return $strings;
}

/** A list in the order of its values: for two lists that must hold the same, whatever order each was written in. */
function in_order(array $list): array
{
    sort($list, SORT_STRING);

    return $list;
}

/** A small frontend to scan: $files as relative path => contents, written with Windows line endings. */
function sources(array $files): string
{
    $root = test_temp_dir('sources');
    foreach ($files as $relative => $contents) {
        if (!is_dir(dirname("$root/$relative"))) {
            mkdir(dirname("$root/$relative"), 0777, true);
        }
        file_put_contents("$root/$relative", str_replace(["\r\n", "\n"], ["\n", "\r\n"], $contents));
    }

    return $root;
}

/**
 * The keys a string migration names, place by place: the rows it inserts into
 * translation_keys, the strings it inserts for each language, and the list its
 * closing gate checks. Read from the file's text - the way the file is
 * written is the pattern every later one follows (003_site_strings.sql).
 *
 * @return array{keys: string[], strings: array<string, string[]>, gate: string[]}
 */
function migration_keys(string $file): array
{
    $sql = str_replace("\r\n", "\n", migration_sql($file));
    // The first thing of a row: its key, at the start of a line.
    $rows = static function (string $block): array {
        preg_match_all("/^\\s*\\('([^']+)',/m", $block, $m);

        return $m[1];
    };

    $found = ['keys' => [], 'strings' => [], 'gate' => []];
    if (preg_match('/INSERT\s+INTO\s+translation_keys\b[^;]*?\bVALUES\b(.*?)\nON CONFLICT/s', $sql, $m)) {
        $found['keys'] = $rows($m[1]);
    }
    preg_match_all("/INSERT\\s+INTO\\s+translations\\b[^;]*?SELECT\\s+v\\.key_name,\\s*'([a-z-]+)',[^;]*?\\bVALUES\\b(.*?)\nON CONFLICT/s", $sql, $blocks, PREG_SET_ORDER);
    foreach ($blocks as $block) {
        $found['strings'][$block[1]] = $rows($block[2]);
    }
    if (preg_match('/\nDO \$\$.*?\bVALUES\b(.*?)\)\s*AS\s+k\s*\(name\)/s', $sql, $m)) {
        preg_match_all("/\\('([^']+)'\\)/", $m[1], $gate);
        $found['gate'] = $gate[1];
    }

    return $found;
}

/**
 * The formal Slovak the pages keep for the library's words (FORMAL_SLOVAK in
 * core/translations.ts), read from the file's text: key => words.
 *
 * @return array<string, string>
 */
function frontend_formal_slovak(): array
{
    $source = (string) file_get_contents(translationKeysFrontendRoot() . FRONTEND_FORMAL_WORDS);
    if (!preg_match('/export const FORMAL_SLOVAK\b[^=]*=\s*\{(.*?)\n\};/s', $source, $m)) {
        fail('FORMAL_SLOVAK could not be read from ' . FRONTEND_FORMAL_WORDS);
    }
    preg_match_all("/'(anotoki\\.[A-Za-z0-9.]+)':\\s*'([^']*)'/", $m[1], $pairs, PREG_SET_ORDER);

    return array_column($pairs, 2, 1);
}

/* ------------------------------------------------ what the migrations leave */

test('the two languages the site is released in, English first - and the keys, once a migration writes them', function (): void {
    test_db();
    assert_same([
        ['code' => 'en', 'name' => 'English', 'native_name' => 'English', 'enabled' => true, 'sort_order' => 1],
        ['code' => 'sk', 'name' => 'Slovak', 'native_name' => 'Slovenčina', 'enabled' => true, 'sort_order' => 2],
    ], dbAll('SELECT code, name, native_name, enabled, sort_order FROM languages ORDER BY sort_order'));

    if (string_migrations() === []) {
        assert_same([], array_values(array_filter(database_keys(), static fn(string $key): bool => !LibraryWords::isLibraryKey($key))), 'no migration writes strings yet, so there are none of the site\'s');
    } else {
        assert_true(database_keys() !== [], implode(', ', string_migrations()) . ' left no keys');
    }

    // the database keeps its own rules
    assert_throws(static fn() => dbExec("INSERT INTO languages (code, name, native_name) VALUES ('EN', 'x', 'x')"), '/check/i');
    assert_throws(static fn() => dbExec("INSERT INTO translations (key_name, language_code, value) VALUES ('no.such', 'en', 'x')"), '/foreign key/i');
});

test('every key has an English string, and a Slovak one - the library\'s own keys too', function (): void {
    assert_same([], keys_without('en'), 'keys with no English string: nothing to fall back to');
    assert_same([], keys_without('sk'), 'keys with no Slovak string');
});

test('every string the migrations wrote passes the checks a save makes, as it is - the site\'s and the library\'s alike', function (): void {
    // Otherwise a string nobody could save again would be released: the grid sends a cell back whole, and a
    // rule the seed does not keep (a brace, a length, a placeholder the code does not fill) would refuse it.
    test_db();
    if (string_migrations() !== []) {
        assert_true((int) dbValue('SELECT count(*) FROM translations') > 100, 'the strings are there to check');
    }
    assert_same([], surveyTranslations()->storedRefusals(), 'what a save would refuse, as the library checks it');
});

test('under an option with a field of its own, Slovak asks for the answer - not what the option\'s label means to the reader', function (): void {
    test_db();
    // The label is whatever the survey's author wrote for the option: "čo pre Vás znamená „Iný prehliadač“" asks
    // the reader to explain it. The noun before the quotes takes the case, so the label stands as it is written.
    $strings = array_column(dbAll("SELECT language_code, value FROM translations WHERE key_name = 'answer.problem.writeOther'"), 'value', 'language_code');
    assert_same('Pri možnosti „{label}“ napíšte, prosím, vlastnú odpoveď.', $strings['sk'] ?? null);
    assert_same(['label'], Placeholders::names($strings['en'] ?? ''), 'and the label is the one value the page has for it');
});

test('a plural family has .one, .few and .other in both languages, and nothing else ends in them', function (): void {
    $keys = database_keys();
    $families = [];
    foreach ($keys as $key) {
        if (preg_match('/^(.+)\.(' . implode('|', TRANSLATION_PLURAL_FORMS) . ')$/D', $key, $m)) {
            $families[$m[1]] = true;
        }
    }
    $incomplete = [];
    foreach (array_keys($families) as $family) {
        foreach (TRANSLATION_PLURAL_FORMS as $form) {
            if (!in_array("$family.$form", $keys, true)) {
                $incomplete[] = "$family.$form";
            }
        }
    }
    assert_same([], $incomplete, 'a key ending in .one, .few or .other is a form of a plural, and a plural has all three');
    // "in both languages" is the test above: every key has both.
});

test('no namespace is named after a part of a survey, and every key has a key\'s shape', function (): void {
    // survey.*, step.*, option.* and item.* would read as a survey's own texts, which are not strings of the site.
    $namespaces = array_values(array_unique(array_map(KeyScanner::namespaceOf(...), database_keys())));
    assert_same([], array_values(array_intersect($namespaces, ['survey', 'option', 'step', 'item'])));
    foreach (database_keys() as $key) {
        assert_true(KeyScanner::shapeOk($key), "$key is not the shape of a key, so the scan cannot find it");
    }
});

test('every language a migration writes strings for is one that cannot be deleted', function (): void {
    test_db();
    $written = array_column(dbAll('SELECT DISTINCT language_code FROM translations ORDER BY language_code'), 'language_code');
    assert_same([], array_values(array_diff($written, TRANSLATION_SEEDED_LANGUAGES)), 'add them to TRANSLATION_SEEDED_LANGUAGES: deleting one would make the next string migration fail');

    $languages = array_column(dbAll('SELECT code FROM languages'), 'code');
    assert_same([], array_values(array_diff(TRANSLATION_SEEDED_LANGUAGES, $languages)), 'and each of them is a language here');
    assert_true(in_array('en', TRANSLATION_SEEDED_LANGUAGES, true));
    assert_same(TRANSLATION_SEEDED_LANGUAGES, surveyTranslations()->config()->releasedLanguages, 'and the library is told so: it refuses to delete them');
    if (string_migrations() !== []) {
        assert_same(in_order(TRANSLATION_SEEDED_LANGUAGES), in_order($written), 'the list names exactly the languages the migrations write');
    }
});

test('every key the frontend uses is in the database, and every key of the site\'s in the database is used', function (): void {
    $scan = surveyKeyScanner()->scan(database_keys());
    assert_same([], $scan['problems'], 'what the scan does not let through');

    if (string_migrations() === []) {
        // Nothing is written yet, so nothing the frontend already asks for can
        // be found: from the first migration with strings on, all of it is held.
        return;
    }
    assert_same([], $scan['missing'], 'used by the frontend, not in the database - the page would show the key (php translations.php --status)');
    assert_same([], $scan['unused'], 'in the database, used nowhere - delete them with a migration');
    assert_true(is_file(translationKeysFrontendRoot() . '/' . TRANSLATION_DYNAMIC_KEYS_FILE), 'the keys put together at run time are declared in ' . TRANSLATION_DYNAMIC_KEYS_FILE);
    assert_false(array_key_exists('anotoki.ui.close', $scan['used']), 'the library\'s keys are its own Angular half\'s to ask for: never looked for, never unused');
});

test('the gender and age strings are for exactly the keys the answers are kept by', function (): void {
    $file = translationKeysFrontendRoot() . '/' . TRANSLATION_DYNAMIC_KEYS_FILE;
    $declared = is_file($file) ? KeyScanner::dynamic((string) file_get_contents($file))['prefixes'] : [];
    $keys = database_keys();
    $seeded = string_migrations() !== [];

    foreach (['aboutYou.gender.' => SURVEY_GENDERS, 'aboutYou.age.' => SURVEY_AGES] as $prefix => $expected) {
        // What the frontend declares - held from the moment it lists any.
        if ($seeded || ($declared[$prefix] ?? []) !== []) {
            assert_same(in_order($expected), in_order($declared[$prefix] ?? []), "the tails of '$prefix' in " . TRANSLATION_DYNAMIC_KEYS_FILE);
        }
        if ($seeded) {
            $tails = [];
            foreach ($keys as $key) {
                if (str_starts_with($key, $prefix)) {
                    $tails[] = substr($key, strlen($prefix));
                }
            }
            assert_same(in_order($expected), in_order($tails), "the keys under '$prefix' in the database");
        }
    }
});

/* --------------------------------------------------------- the library's words */

test('the library\'s words are all here, each in both languages - and its Slovak that speaks to the reader is this site\'s formal Slovak', function (): void {
    test_db();
    $library = array_values(array_filter(database_keys(), LibraryWords::isLibraryKey(...)));
    assert_same(in_order(LibraryWords::keys()), in_order($library), 'every key the library ships, and no other under anotoki.');

    // The words that speak to the reader: the site's formal Slovak (Vy, with its capital) - never the library's ty.
    $slovak = strings_of('sk', ADDRESSING_THE_READER);
    foreach (ADDRESSING_THE_READER as $key) {
        assert_true(isset($slovak[$key]), "$key has its Slovak");
        assert_true($slovak[$key] !== (LibraryWords::all()[$key]['sk'] ?? null), "$key is not the library's informal Slovak: " . $slovak[$key]);
        assert_match('/Vaša|Váš|Skúste|Označte/u', $slovak[$key], "$key speaks formally: " . $slovak[$key]);
    }
    // Where the library's Slovak does not speak to anybody, the site's own words stand - or the library's.
    assert_same('Ponuka', strings_of('sk', ['anotoki.topbar.phoneMenu'])['anotoki.topbar.phoneMenu'] ?? null);
    assert_same('Načítava sa…', strings_of('sk', ['anotoki.ui.loading'])['anotoki.ui.loading'] ?? null, 'a word the site had none of: the library\'s');

    // The descriptions are the library's (its 002 wrote them after 010).
    foreach (dbAll("SELECT name, description FROM translation_keys WHERE name LIKE 'anotoki.%'") as $row) {
        assert_same(LibraryWords::all()[$row['name']]['description'] ?? null, $row['description'], $row['name']);
    }
});

test('the pages keep the same formal Slovak for the time they have no strings - word for word the database\'s', function (): void {
    $kept = frontend_formal_slovak();
    assert_same(in_order(ADDRESSING_THE_READER), in_order(array_keys($kept)), 'FORMAL_SLOVAK has exactly the library\'s words that speak to the reader');
    assert_same(strings_of('sk', ADDRESSING_THE_READER), array_merge(array_fill_keys(ADDRESSING_THE_READER, null), $kept), 'and the words are the migrations\'');
});

/* ------------------------------------------------- the string migrations' layout */

test('a string migration\'s gate checks exactly the keys the migration writes, and writes each in every language', function (): void {
    $taking = [];
    foreach (string_migrations() as $file) {
        $found = migration_keys($file);
        assert_true($found['keys'] !== [], "$file: the keys it inserts could not be read");
        assert_same($found['keys'], array_values(array_unique($found['keys'])), "$file: a key is inserted twice");
        assert_same(in_order($found['keys']), in_order($found['gate']), "$file: the keys its gate checks are not the keys it inserts - a key left out of the gate could lack a string and nothing would say so");

        $library = array_values(array_filter($found['keys'], LibraryWords::isLibraryKey(...)));
        if ($library === []) {
            // The site's own keys: 003's layout, one block of strings a language.
            assert_same(in_order(TRANSLATION_SEEDED_LANGUAGES), in_order(array_keys($found['strings'])), "$file: one block of strings a language");
            foreach ($found['strings'] as $code => $keys) {
                assert_same(in_order($found['keys']), in_order($keys), "$file: the keys with a string in \"$code\" are not the keys it inserts");
            }
            continue;
        }
        // Taking library keys over (010): library keys only - the namespace anotoki. is the library's - each one
        // the library ships; their strings come from the site's own keys, or in the site's own words.
        assert_same($found['keys'], $library, "$file: a migration that takes library keys over writes no key of the site's");
        assert_same([], array_values(array_diff($library, LibraryWords::keys())), "$file: keys under anotoki. that the library does not ship");
        $taking[] = $file;
    }
    assert_same(['010_strings_through_the_library.sql'], $taking, 'the one migration that takes the library\'s words over');
});

test('010 knows the library\'s own words as its 002 writes them - what it replaces where the library\'s files ran first', function (): void {
    $sql = str_replace("\r\n", "\n", migration_sql('010_strings_through_the_library.sql'));
    assert_true((bool) preg_match('/CREATE TEMPORARY TABLE library_words\b.*?\(VALUES\n(.*?)\n\) AS w/s', $sql, $m), 'the library\'s words could not be read from 010');
    preg_match_all("/\\('([^']+)', '([a-z]{2})', '((?:[^']|'')*)'\\)/", $m[1], $rows, PREG_SET_ORDER);
    assert_true(count($rows) > 40, 'its rows were read');
    foreach ($rows as [, $key, $code, $value]) {
        assert_same(LibraryWords::all()[$key][$code] ?? null, str_replace("''", "'", $value), "$key ($code)");
    }
    $keys = array_values(array_unique(array_column($rows, 1)));
    assert_same(in_order(migration_keys('010_strings_through_the_library.sql')['keys']), in_order($keys), 'every key 010 writes, and no other');
});

/* -------------------------------------------------------------------- the scan */

test('the scan as this site has it: the specs, the specs\' helpers and the vendored sign-in SDK are not read; keys put together at run time are declared', function (): void {
    $root = sources([
        'pages/home/home.component.html' => "<h1>{{ 'home.title' | translate }}</h1>\n<p>{{ 'home.questions' | translatePlural: n }}</p>\n<p [innerHTML]=\"'home.title' | translate\"></p>\n",
        'pages/home/home.component.ts' => "const refused = this.i18n.t('take.refused.' + kind);\nconst gender = this.i18n.t(`aboutYou.gender.\${key}`);\n",
        'pages/home/home.component.spec.ts' => "expect(text).toBe('home.onlyInASpec');\n",
        'core/testing/example.ts' => "export const example = 'home.onlyInTesting';\n",
        'core/auth/anotoki-auth.d.ts' => "export const sdk = 'home.inTheSdk';\n",
        'core/i18n/dynamic-keys.ts' => "export const DYNAMIC_KEYS = {\n  'aboutYou.gender.': ['male', 'female'],\n};\n",
    ]);
    $database = ['home.title', 'home.questions.one', 'home.questions.few', 'home.questions.other', 'home.onlyInASpec', 'home.onlyInTesting', 'home.inTheSdk',
        'take.start', 'aboutYou.gender.male', 'aboutYou.gender.female', 'anotoki.ui.close'];
    $scan = surveyKeyScanner($root)->scan($database);

    assert_same(['core/i18n/dynamic-keys.ts', 'pages/home/home.component.html', 'pages/home/home.component.ts'], surveyKeyScanner($root)->sourceFiles());
    assert_same(['home.inTheSdk', 'home.onlyInASpec', 'home.onlyInTesting', 'take.start'], $scan['unused'], 'the specs, core/testing/ and the SDK do not count; the library\'s keys are never unused');
    assert_same(['aboutYou.gender.female', 'aboutYou.gender.male', 'home.questions.few', 'home.questions.one', 'home.questions.other', 'home.title'], array_keys($scan['used']), 'a plural by its family\'s name; the declared keys');
    assert_same(2, count($scan['problems']), test_show($scan['problems']));
    assert_match("/^pages\\/home\\/home\\.component\\.html:3: innerHTML is given a translated string/", $scan['problems'][0]);
    assert_match("/^pages\\/home\\/home\\.component\\.ts:1: a key is put together from 'take\\.refused\\.', which core\\/i18n\\/dynamic-keys\\.ts does not declare/", $scan['problems'][1]);
});

test('the scan reads the real frontend: only the files it should, and their comments are not keys', function (): void {
    $files = surveyKeyScanner()->sourceFiles();
    assert_true(in_array('app.routes.ts', $files, true) && in_array('layouts/top-bar/top-bar.component.html', $files, true), 'the sources are where the scan looks');
    foreach ($files as $file) {
        assert_match('/\.(ts|html)$/', $file);
        assert_no_match('~\.spec\.ts$|^core/testing/|^core/auth/anotoki-auth\.~', $file);
    }
});
