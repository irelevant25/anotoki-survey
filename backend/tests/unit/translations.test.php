<?php

// The site's own strings: what the migrations leave in the database against
// what the frontend asks for - so a page never shows a key instead of a
// sentence, and no string is kept that nothing reads - and the rules a string
// must keep (api/translations.php), with the scan that finds the frontend's
// keys (tools/translation_keys.php) tested on sources of its own.
//
// Nothing here writes to the database: it is what the migrations made.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings
require TEST_BACKEND . '/tools/translation_keys.php';

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
        migrationFiles(),
        static fn(string $file): bool => (bool) preg_match('/INSERT\s+INTO\s+translation_keys\b/i', (string) file_get_contents(migrationsRoot() . '/' . MIGRATIONS_ALIAS . '/' . $file))
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

    return array_column(dbAll(
        'SELECT k.name FROM translation_keys k
          WHERE NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = ?)
          ORDER BY k.name COLLATE "C"',
        [$code]
    ), 'name');
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
        // Whatever line endings this file itself was checked out with.
        file_put_contents("$root/$relative", str_replace(["\r\n", "\n"], ["\n", "\r\n"], $contents));
    }

    return $root;
}

/** What translationsCheck() refuses $values with: [code, extra] - or the changes it would make. */
function check(mixed $values, array $english = ['test.hello' => 'Hello, {name}!', 'test.bye' => 'Goodbye', 'test.count' => '{count} questions', 'test.step' => 'Step {n} of {m}']): array
{
    try {
        return translationsCheck($values, ['test.hello', 'test.bye', 'test.count', 'test.step', 'test.new'], ['en' => 'English', 'sk' => 'Slovak'], $english);
    } catch (ApiError $e) {
        assert_same(422, $e->status);

        return [$e->errorCode, $e->extra];
    }
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
    $sql = str_replace("\r\n", "\n", (string) file_get_contents(migrationsRoot() . '/' . MIGRATIONS_ALIAS . '/' . $file));
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

/* ------------------------------------------------ what the migrations leave */

test('the two languages the site is released in, English first - and the keys, once a migration writes them', function (): void {
    test_db();
    assert_same([
        ['code' => 'en', 'name' => 'English', 'native_name' => 'English', 'enabled' => true, 'sort_order' => 1],
        ['code' => 'sk', 'name' => 'Slovak', 'native_name' => 'Slovenčina', 'enabled' => true, 'sort_order' => 2],
    ], dbAll('SELECT code, name, native_name, enabled, sort_order FROM languages ORDER BY sort_order'));

    if (string_migrations() === []) {
        assert_same([], database_keys(), 'no migration writes strings yet, so there are none');
    } else {
        assert_true(database_keys() !== [], implode(', ', string_migrations()) . ' left no keys');
    }

    // the database keeps its own rules
    assert_throws(static fn() => dbExec("INSERT INTO languages (code, name, native_name) VALUES ('EN', 'x', 'x')"), '/check/i');
    assert_throws(static fn() => dbExec("INSERT INTO translations (key_name, language_code, value) VALUES ('no.such', 'en', 'x')"), '/foreign key/i');
});

test('every key has an English string, and a Slovak one', function (): void {
    assert_same([], keys_without('en'), 'keys with no English string: nothing to fall back to');
    assert_same([], keys_without('sk'), 'keys with no Slovak string');
});

test('a translation uses no placeholder its English string does not have', function (): void {
    test_db();
    $english = translationsOf(TRANSLATION_FALLBACK);
    $wrong = [];
    foreach (dbAll('SELECT key_name, language_code, value FROM translations WHERE language_code <> ? ORDER BY key_name COLLATE "C", language_code', [TRANSLATION_FALLBACK]) as $row) {
        $extra = array_diff(translationPlaceholders($row['value']), translationPlaceholders($english[$row['key_name']] ?? ''));
        if ($extra !== []) {
            $wrong[] = "{$row['key_name']} ({$row['language_code']}): {" . implode('}, {', $extra) . '}';
        }
    }
    assert_same([], $wrong, 'the site fills in only the placeholders the English string has');
});

test('under an option with a field of its own, Slovak asks for the answer - not what the option\'s label means to the reader', function (): void {
    test_db();
    // The label is whatever the survey's author wrote for the option: "čo pre Vás znamená „Iný prehliadač“" asks
    // the reader to explain it. The noun before the quotes takes the case, so the label stands as it is written.
    $strings = array_column(dbAll("SELECT language_code, value FROM translations WHERE key_name = 'answer.problem.writeOther'"), 'value', 'language_code');
    assert_same('Pri možnosti „{label}“ napíšte, prosím, vlastnú odpoveď.', $strings['sk'] ?? null);
    assert_same(['label'], translationPlaceholders($strings['en'] ?? ''), 'and the label is the one value the page has for it');
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

test('no namespace is named after a part of a survey', function (): void {
    // survey.*, step.*, option.* and item.* would read as a survey's own texts, which are not strings of the site.
    $namespaces = array_values(array_unique(array_map('translationKeyNamespace', database_keys())));
    assert_same([], array_values(array_intersect($namespaces, ['survey', 'option', 'step', 'item'])));
    foreach (database_keys() as $key) {
        assert_true(translationKeyShapeOk($key), "$key is not the shape of a key, so the scan cannot find it");
    }
});

test('every language a migration writes strings for is one that cannot be deleted', function (): void {
    test_db();
    $written = array_column(dbAll('SELECT DISTINCT language_code FROM translations ORDER BY language_code'), 'language_code');
    assert_same([], array_values(array_diff($written, TRANSLATION_SEEDED_LANGUAGES)), 'add them to TRANSLATION_SEEDED_LANGUAGES: deleting one would make the next string migration fail');

    $languages = array_column(dbAll('SELECT code FROM languages'), 'code');
    assert_same([], array_values(array_diff(TRANSLATION_SEEDED_LANGUAGES, $languages)), 'and each of them is a language here');
    assert_true(in_array(TRANSLATION_FALLBACK, TRANSLATION_SEEDED_LANGUAGES, true));
    if (string_migrations() !== []) {
        assert_same(in_order(TRANSLATION_SEEDED_LANGUAGES), in_order($written), 'the list names exactly the languages the migrations write');
    }
});

test('every key the frontend uses is in the database, and every key in the database is used', function (): void {
    $scan = translationKeysScan(translationKeysFrontendRoot(), database_keys());
    assert_same([], $scan['problems'], 'what the scan does not let through');

    if (string_migrations() === []) {
        // Nothing is written yet, so nothing the frontend already asks for can
        // be found: from the first migration with strings on, all of it is held.
        return;
    }
    assert_same([], $scan['missing'], 'used by the frontend, not in the database - the page would show the key (php translations.php --status)');
    assert_same([], $scan['unused'], 'in the database, used nowhere - delete them with a migration');
    assert_true(is_file(translationKeysFrontendRoot() . '/' . TRANSLATION_DYNAMIC_KEYS_FILE), 'the keys put together at run time are declared in ' . TRANSLATION_DYNAMIC_KEYS_FILE);
});

test('the gender and age strings are for exactly the keys the answers are kept by', function (): void {
    $file = translationKeysFrontendRoot() . '/' . TRANSLATION_DYNAMIC_KEYS_FILE;
    $declared = is_file($file) ? translationKeysDynamic((string) file_get_contents($file))['prefixes'] : [];
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

/* -------------------------------------------------- the rules a string keeps */

test('a language code: two small letters, or two and two - and nothing else reaches a query', function (): void {
    foreach (['en', 'sk', 'pt-br', 'zh-tw'] as $code) {
        assert_true(languageCodeOk($code), $code);
    }
    foreach (['', 'e', 'eng', 'EN', 'En', 'en-', 'en-GB', 'en_gb', 'en-gbr', 'e1', ' en', "en\n", "sk\0", "\xFF\xFE", 'en-gb-x', 5, null, ['en'], true] as $code) {
        assert_false(languageCodeOk($code), test_show($code));
    }
    assert_same(null, languageRow("\xFF"), 'no query for what is not a code: bytes that are not text would be a database error');
});

test('placeholders: {name}, the same expression as the frontend fills in', function (): void {
    assert_same(['name', 'count'], translationPlaceholders('Hello, {name}! {count} of {count} - {name}'));
    assert_same(['a_b', 'A1'], translationPlaceholders('{a_b} {A1}'));
    assert_same([], translationPlaceholders('{} {1a} { name } {na-me} {_x} plain'));
});

test('a save is checked whole: the shape, the key, the language, the text, its length, its placeholders', function (): void {
    assert_same([], check([]), 'nothing to change');
    assert_same(
        [['key' => 'test.bye', 'language' => 'en', 'value' => 'Bye'], ['key' => 'test.hello', 'language' => 'sk', 'value' => 'Dobrý deň, {name}!']],
        check(['test.hello' => ['sk' => "  Dobrý\x07 deň, {name}! \u{00A0}"], 'test.bye' => ['en' => 'Bye']]),
        'control characters dropped, the spaces around it gone'
    );
    assert_same([['key' => 'test.hello', 'language' => 'sk', 'value' => null]], check(['test.hello' => ['sk' => " \t "]]), 'an empty string in another language: that string goes');
    assert_same([], check(['test.hello' => []]), 'a key with nothing to change');

    // Whatever order the cells were typed in, they are written by key and then by language: two
    // saves of the same strings take their rows in one order, and neither waits for the other for ever.
    $ordered = static fn(array $values): array => array_map(static fn(array $change): string => $change['key'] . ' ' . $change['language'], check($values));
    assert_same(['test.bye sk', 'test.hello en', 'test.hello sk'], $ordered(['test.hello' => ['sk' => 'A {name}', 'en' => 'B {name}'], 'test.bye' => ['sk' => 'C']]));
    assert_same(['test.bye sk', 'test.hello en', 'test.hello sk'], $ordered(['test.bye' => ['sk' => ''], 'test.hello' => ['en' => 'B {name}', 'sk' => '']]), 'the ones that go among the ones that are written');
    assert_same($ordered(['test.step' => ['sk' => 'x'], 'test.count' => ['sk' => 'y'], 'test.bye' => ['sk' => 'z']]), $ordered(['test.bye' => ['sk' => 'z'], 'test.count' => ['sk' => 'y'], 'test.step' => ['sk' => 'x']]));

    $invalid = [
        'nothing' => null, 'a text' => 'text', 'a number' => 5, 'a list' => ['a', 'b'],
        'a key with a text' => ['test.hello' => 'Hello'], 'a key with a list' => ['test.hello' => ['a', 'b']],
        'a number for a string' => ['test.hello' => ['sk' => 5]], 'a list for a string' => ['test.hello' => ['sk' => ['x']]], 'null for a string' => ['test.hello' => ['sk' => null]],
        '2001 characters' => ['test.bye' => ['sk' => str_repeat('á', 2001)]],
    ];
    foreach ($invalid as $what => $values) {
        assert_same('invalid_value', check($values)[0], $what);
    }
    assert_same(2000, textLength(check(['test.bye' => ['sk' => str_repeat('á', 2000)]])[0]['value']), '2000 characters, not bytes');

    assert_same(['unknown_key', ['key' => 'no.such', 'keys' => ['no.such', '12']]], check(['test.bye' => ['en' => 'Bye'], 'no.such' => ['en' => 'x'], '12' => ['sk' => 'y']]), 'every unknown key is named');
    assert_same(['unknown_language', ['key' => 'test.bye', 'language' => 'de']], check(['test.bye' => ['de' => 'Tschüss']]));
    assert_same(['fallback_required', ['key' => 'test.bye', 'language' => 'en']], check(['test.bye' => ['en' => "\x07 "]]), 'English is what the others fall back to');

    // the order of the checks: the key before the language, the language before the text
    assert_same('unknown_key', check(['no.such' => ['xx' => 5]])[0]);
    assert_same('unknown_language', check(['test.bye' => ['xx' => 5]])[0]);
    assert_same('invalid_value', check(['no.such' => 'text'])[0], 'the shape first');
});

test('a string with nothing in it to see is an empty one - and one too long to trim is too long, never empty', function (): void {
    // A zero-width space, a word joiner, a soft hyphen: trim() leaves each, and the page would draw an empty place.
    $unseen = ['a zero-width space' => "\u{200B}", 'a word joiner' => "\u{2060}", 'a soft hyphen' => "\u{00AD}", 'several, with spaces' => " \u{200B}\u{00A0}\u{200D}\t\u{FEFF} ", 'nothing' => '', 'spaces' => " \n "];
    foreach ($unseen as $what => $text) {
        assert_true(textBlank($text), $what);
        assert_same([['key' => 'test.bye', 'language' => 'sk', 'value' => null]], check(['test.bye' => ['sk' => $text]]), "$what in another language: that string goes");
        assert_same(['fallback_required', ['key' => 'test.bye', 'language' => 'en']], check(['test.bye' => ['en' => $text]]), "$what in English");
        try {
            languageName($text, 'The name in English');
            fail("$what was taken for a language's name");
        } catch (ApiError $e) {
            assert_same('invalid_language', $e->errorCode, $what);
        }
    }
    assert_true(textBlank("\xFF\xFE"), 'bytes that are not text are nothing to read');

    // A character of that kind inside a word is part of the word: Persian and Indic spelling needs it.
    foreach (["Ah\u{200C}oj", "\u{200B}Ahoj", 'a', '.', "\u{0301}"] as $text) {
        assert_false(textBlank($text), test_show($text));
    }
    assert_same("Ah\u{200C}oj", check(['test.bye' => ['sk' => " Ah\u{200C}oj "]])[0]['value'], 'kept as it was written');
    assert_same("می\u{200C}خواهم", languageName("می\u{200C}خواهم", 'The name as its speakers write it'));
    // textTrim() itself is the browser's trim(), and takes none of them away.
    assert_same("\u{200B}", textTrim(" \u{200B} "));

    // More spaces inside it than the expression can get through: the text comes back as it is,
    // and is refused for its length - not taken for an empty one, which would delete the stored string.
    $long = 'a' . str_repeat(' ', 1100000) . 'b';
    assert_same($long, textTrim($long));
    assert_false(textBlank($long));
    assert_same(['invalid_value', ['key' => 'test.bye', 'language' => 'sk']], check(['test.bye' => ['sk' => $long]]));
    assert_same(['invalid_value', ['key' => 'test.bye', 'language' => 'en']], check(['test.bye' => ['en' => $long]]), 'not fallback_required either');
    try {
        languageName($long, 'The name in English');
        fail('taken for a name');
    } catch (ApiError $e) {
        assert_match('/1 to 50 characters/', $e->getMessage());
    }
    assert_same('b', textTrim(str_repeat(' ', 1100000) . 'b'), 'a run at either end is still trimmed');
    assert_same('a', textTrim('a' . str_repeat("\u{00A0}", 600000)));
});

test('placeholders are the code\'s: English keeps exactly its own, a translation may leave one out but never add one', function (): void {
    assert_same('Hi, {name}!', check(['test.hello' => ['en' => 'Hi, {name}!']])[0]['value'], 'reworded, the placeholder kept');
    assert_same(['placeholder_changed', ['key' => 'test.hello', 'language' => 'en', 'placeholder' => 'name']], check(['test.hello' => ['en' => 'Hi!']]));
    assert_same(['placeholder_changed', ['key' => 'test.hello', 'language' => 'en', 'placeholder' => 'who']], check(['test.hello' => ['en' => 'Hi, {name} and {who}!']]));
    assert_same(['placeholder_changed', ['key' => 'test.bye', 'language' => 'en', 'placeholder' => 'name']], check(['test.bye' => ['en' => 'Bye, {name}']]));

    assert_same('Vitajte!', check(['test.hello' => ['sk' => 'Vitajte!']])[0]['value'], 'a translation may say it without the placeholder');
    assert_same(['unknown_placeholder', ['key' => 'test.hello', 'language' => 'sk', 'placeholder' => 'meno']], check(['test.hello' => ['sk' => 'Ahoj, {name} {meno}!']]));
    // English sent with it does not change what the key has: the stored English string does
    assert_same('unknown_placeholder', check(['test.hello' => ['sk' => 'Ahoj {who}', 'en' => 'Hi {who}']])[0]);
    assert_same('placeholder_changed', check(['test.hello' => ['en' => 'Hi {who}', 'sk' => 'Ahoj {who}']])[0]);

    // a key with no English string yet: the English sent with it is what counts
    assert_same(2, count(check(['test.new' => ['sk' => 'Nové {a}', 'en' => 'New {a}']])));
    assert_same('unknown_placeholder', check(['test.new' => ['sk' => 'Nové {a}']])[0], 'with no English at all there is no placeholder to use');
    assert_same(1, count(check(['test.new' => ['sk' => 'Nové']])));
});

test('a brace is only ever part of a placeholder: one written any other way is refused, not shown to everybody', function (): void {
    // What the page would leave exactly as it is written: the name translated, a space inside, a brace too few or too many.
    $wrong = [
        'the name translated' => ['test.count', 'sk', '{počet} otázok'],
        'spaces inside' => ['test.count', 'sk', '{ count } otázok'],
        'never closed' => ['test.count', 'sk', '{count otázok'],
        'a space before it closes' => ['test.count', 'sk', '{count } otázok'],
        'two braces' => ['test.count', 'sk', '{{count}} otázok'],
        'one of two never closed' => ['test.step', 'sk', 'Krok {n / {m}'],
        'two braces in English' => ['test.step', 'en', 'Step {{n}} of {m}'],
        'a brace that only closes' => ['test.bye', 'sk', 'Dovidenia }'],
        'a brace in a string with no placeholder' => ['test.bye', 'en', 'Good {bye'],
        'an empty pair' => ['test.count', 'sk', '{count} {} otázok'],
    ];
    foreach ($wrong as $what => [$key, $code, $text]) {
        assert_same(['invalid_placeholder', ['key' => $key, 'language' => $code]], check([$key => [$code => $text]]), $what);
    }
    try {
        translationsCheck(['test.step' => ['sk' => 'Krok { n }']], ['test.step'], ['sk' => 'Slovak'], ['test.step' => 'Step {n} of {m}']);
        fail('taken');
    } catch (ApiError $e) {
        assert_same('The Slovak string of "test.step" has a { or } that is not part of a placeholder. A placeholder is written exactly as the English string has it, like {n}: no spaces, and its name is not translated.', $e->getMessage(), 'it says how one is written, with one of the key\'s own');
    }
    // A key with no placeholder has none to give as the example: "like {count}" would be advice that is refused next.
    foreach (['sk' => ['Slovak', 'Dovidenia }'], 'en' => ['English', 'Good {bye']] as $code => [$name, $text]) {
        try {
            translationsCheck(['test.bye' => [$code => $text]], ['test.bye'], [$code => $name], ['test.bye' => 'Goodbye']);
            fail('taken');
        } catch (ApiError $e) {
            assert_same("The $name string of \"test.bye\" has a { or } that is not part of a placeholder. This key has no placeholder, so its strings can hold no { or }.", $e->getMessage(), "$name: it names no placeholder the key does not have");
        }
    }
    // And the advice it does give is advice that is taken: the example is one the check accepts.
    assert_same('Krok {n}', translationsCheck(['test.step' => ['sk' => 'Krok {n}']], ['test.step'], ['sk' => 'Slovak'], ['test.step' => 'Step {n} of {m}'])[0]['value']);

    // Before the placeholders are compared: a well-made one the key does not have is still the other refusal.
    assert_same('unknown_placeholder', check(['test.count' => ['sk' => '{meno} otázok']])[0]);
    assert_same('unknown_placeholder', check(['test.count' => ['sk' => '{Count} otázok']])[0], 'a placeholder\'s name is as it is written, capitals too');
    assert_same('placeholder_changed', check(['test.step' => ['en' => 'Step {n}']])[0]);
    // And what was fine is fine.
    assert_same('{count} otázok', check(['test.count' => ['sk' => '{count} otázok']])[0]['value']);
    assert_same('Krok {n} / {m}', check(['test.step' => ['sk' => 'Krok {n} / {m}']])[0]['value']);
    assert_same('Ahoj, {name}!', check(['test.hello' => ['sk' => 'Ahoj, {name}!']])[0]['value']);
    assert_same('Vitajte!', check(['test.hello' => ['sk' => 'Vitajte!']])[0]['value']);
});

test('every string the migrations wrote passes the checks a save makes, as it is', function (): void {
    // Otherwise a string nobody could save again would be released: the grid sends a cell back
    // whole, and a rule the seed does not keep (a brace, a length, a space at its end) would refuse it.
    test_db();
    $languages = array_column(dbAll('SELECT code, name FROM languages'), 'name', 'code');
    $stored = [];
    foreach (dbAll('SELECT key_name, language_code, value FROM translations ORDER BY key_name COLLATE "C", language_code') as $row) {
        $stored[$row['key_name']][$row['language_code']] = $row['value'];
    }
    if (string_migrations() !== []) {
        assert_true(count($stored) > 100, 'the strings are there to check');
    }

    $changes = translationsCheck($stored, database_keys(), $languages, translationsOf(TRANSLATION_FALLBACK));
    $checked = [];
    foreach ($changes as $change) {
        $checked[$change['key']][$change['language']] = $change['value'];
    }
    assert_same($stored, $checked, 'every string comes back as it is kept');
});

test('a string migration\'s gate checks exactly the keys the migration writes, and writes each in every language', function (): void {
    foreach (string_migrations() as $file) {
        $found = migration_keys($file);
        assert_true($found['keys'] !== [], "$file: the keys it inserts could not be read");
        assert_same($found['keys'], array_values(array_unique($found['keys'])), "$file: a key is inserted twice");
        assert_same(in_order($found['keys']), in_order($found['gate']), "$file: the keys its gate checks are not the keys it inserts - a key left out of the gate could lack a string and nothing would say so");
        assert_same(in_order(TRANSLATION_SEEDED_LANGUAGES), in_order(array_keys($found['strings'])), "$file: one block of strings a language");
        foreach ($found['strings'] as $code => $keys) {
            assert_same(in_order($found['keys']), in_order($keys), "$file: the keys with a string in \"$code\" are not the keys it inserts");
        }
    }
});

test('If-None-Match is compared the weak way: any tag of the list, with or without W/, or * - and as a server that compresses sends it back', function (): void {
    $etag = '"abc"';
    foreach (['"abc"', 'W/"abc"', '"x", "abc"', '"x" ,W/"abc" , "y"', '*', ' "abc" '] as $header) {
        assert_true(translationsNotModified($header, $etag), $header);
    }
    // Apache's mod_deflate and mod_brotli mark the tag of an answer they compressed, inside the quotes.
    foreach (['"abc-gzip"', 'W/"abc-gzip"', '"abc-br"', 'W/"abc-br"', '"abc-zstd"', '"x", "abc-gzip"', '"x-gzip" , W/"abc-gzip"'] as $header) {
        assert_true(translationsNotModified($header, $etag), $header);
    }
    foreach (['', 'abc', '"abd"', 'W/"x"', '"abc', 'w/"abc"', '"abd-gzip"', '"abc-gzipx"', '"abc-deflate"', 'abc-gzip"', '"abc-gzip', '"x-gzip"', '"abc-gzip-gzip"', '"abc"-gzip'] as $header) {
        assert_false(translationsNotModified($header, $etag), $header);
    }
});

/* ------------------------------------------------------------------ the scan */

test('the scan: a quoted literal with a key\'s shape in a namespace the database has - never an attribute\'s value, a comment, a spec', function (): void {
    $root = sources([
        'pages/home/home.component.html' => <<<'HTML'
            <!-- {{ 'home.inAComment' | translate }} -->
            <h1>{{ 'home.title' | translate }}</h1>
            <p [text]="error.message" title="home.anAttribute" [class.on]="home.expression"></p>
            <button [attr.aria-label]="'common.close' | translate" (click)="close()">x</button>
            <span>{{ 'home.questions' | translatePlural: n }}</span>
            <span>{{ "home.doubleQuoted" | translate }}</span>
            <p>Don't stop: {{ 'home.afterAnApostrophe' | translate: { day: d } }} - it's fine</p>
            <!--
              'home.inALongComment'
            -->
            <em>{{ 'home.missing' | translate }}</em>
            HTML,
        'pages/home/home.component.ts' => <<<'TS'
            import { Home } from './home.model';
            import { Survey } from '../../core/survey/survey.model';
            // 'home.inALineComment' is what a comment explains
            /* 'home.inABlockComment'
               'home.stillInIt' */
            const address = 'http://example.test/'; const afterIt = 'home.afterAnAddress';
            const accept = 'image/*'; const afterAGlob = 'home.afterAGlob'; /* and 'home.afterTheGlob' is a comment */
            const quote = 'it\'s'; const afterAQuote = 'home.afterAnEscape';
            this.toasts.show(this.i18n.t('home.saved'), `${this.i18n.t("home.inATemplate")}`);
            const notOurs = ['survey.model', 'theme-boot.js', 'home', '.home.title', 'Home.title', 'home..title', 'home.ti tle', 'survey.', `survey.${kind}`];
            const inBackticks = `home.inBackticks`; const sentence = `home.title is ${what}, they say`;
            const label = word('aboutYou.gender.' + gender.key) + word(`aboutYou.age.${age.key}`);
            TS,
        'pages/home/home.component.spec.ts' => "expect(text).toBe('home.onlyInASpec');\n",
        'core/testing/example.ts' => "export const example = 'home.onlyInTesting';\n",
        'core/auth/anotoki-auth.d.ts' => "export const sdk = 'home.inTheSdk';\n",
        'core/auth/auth.service.ts' => "const key = 'home.inTheAuthService';\n",
        'pages/home/home.component.scss' => "/* 'home.inAStyle' */\n",
        'core/i18n/dynamic-keys.ts' => <<<'TS'
            /** The keys put together at run time: 'comment.': ['ignored']. */
            export const DYNAMIC_KEYS: Record<string, readonly string[]> = {
              // a comment: 'also.': ['ignored']
              'aboutYou.gender.': ['male', 'female'],
              'aboutYou.age.': [
                'under-18',
                "18-24",
              ],
              'answer.rule.': ['any', 'atLeast'],
              'error.': [],
            };
            TS,
    ]);
    $database = [
        'home.title', 'home.questions.one', 'home.questions.few', 'home.questions.other', 'home.doubleQuoted', 'home.afterAnApostrophe',
        'home.afterAnAddress', 'home.afterAGlob', 'home.afterAnEscape', 'home.saved', 'home.inATemplate', 'home.inTheAuthService', 'home.inBackticks',
        'home.inAComment', 'home.inALineComment', 'home.inABlockComment', 'home.onlyInASpec', 'home.onlyInTesting', 'home.inTheSdk', 'home.anAttribute', 'home.expression',
        'common.close', 'common.unused', 'error.message', 'error.unknown',
        'aboutYou.gender.male', 'aboutYou.gender.female', 'aboutYou.gender.other', 'aboutYou.age.under-18', 'aboutYou.age.18-24',
        'answer.rule.any', 'answer.rule.atLeast.one', 'answer.rule.atLeast.few', 'answer.rule.atLeast.other',
    ];
    $scan = translationKeysScan($root, $database);

    assert_same([], $scan['problems']);
    assert_same(['home.missing' => ['pages/home/home.component.html:11']], $scan['missing'], 'asked for, and not there');
    assert_same([
        'aboutYou.gender.other', 'common.unused', 'error.message', 'error.unknown',
        'home.anAttribute', 'home.expression', 'home.inABlockComment', 'home.inAComment', 'home.inALineComment', 'home.inTheSdk', 'home.onlyInASpec', 'home.onlyInTesting',
    ], $scan['unused'], 'an attribute\'s value is an expression; comments, specs, the example data and the vendored SDK do not count; nor does a key under a declared prefix that is not listed');
    assert_same(['pages/home/home.component.html:2'], $scan['used']['home.title'], 'with the file and the line');
    assert_same(['pages/home/home.component.ts:7'], $scan['used']['home.afterAGlob'], 'the lines are the file\'s, comments or not');
    assert_same(['pages/home/home.component.html:5'], $scan['used']['home.questions.few'], 'a plural is asked for by its family\'s name');
    assert_same(['core/i18n/dynamic-keys.ts'], $scan['used']['answer.rule.atLeast.other'], 'a declared key may be a family too');
    assert_same(['core/i18n/dynamic-keys.ts'], $scan['used']['aboutYou.age.18-24']);
    assert_same(count($database) - count($scan['unused']), count($scan['used']));

    // A namespace the database does not have is nobody's key - 'survey.model' is a file.
    assert_same([], translationKeysScan($root, [])['used']);
    assert_same(['aboutYou.age.18-24', 'aboutYou.age.under-18', 'aboutYou.gender.female', 'aboutYou.gender.male', 'answer.rule.any', 'answer.rule.atLeast'], array_keys(translationKeysScan($root, [])['missing']), 'but what is declared must exist, whatever the database has');
    assert_same(['pages/home/home.component.ts:11'], $scan['used']['home.inBackticks'], 'a template literal with nothing put into it is a literal');
    assert_same(['home.afterAGlob', 'home.afterAnAddress', 'home.afterAnApostrophe', 'home.afterAnEscape', 'home.doubleQuoted', 'home.inATemplate', 'home.inBackticks', 'home.inTheAuthService', 'home.missing', 'home.questions', 'home.saved', 'home.title'],
        array_values(array_filter(array_keys(translationKeysScan($root, ['home.x'])['missing']), static fn(string $key): bool => str_starts_with($key, 'home.'))), 'every literal of a namespace the database has');
});

test('the scan: a plural family with a form missing names the form', function (): void {
    $root = sources(['a.component.html' => "{{ 'take.steps' | translatePlural: n }}\n{{ 'take.step' | translate }}\n"]);
    $scan = translationKeysScan($root, ['take.steps.one', 'take.steps.other', 'take.step']);
    assert_same(['take.steps.few' => ['a.component.html:1']], $scan['missing']);
    assert_same(['take.step', 'take.steps.one', 'take.steps.other'], array_keys($scan['used']));
    assert_same([], $scan['unused']);
    assert_same([], $scan['problems'], 'a family with a form missing is a family: the form is what is missing');
});

test('the scan: a key asked for the wrong way - a family as one string, one string as a family - shows the key, and fails', function (): void {
    // Both "exist", so by the keys alone all is well - and t('take.minutes') finds no such key, plural('take.start') no take.start.other.
    $root = sources([
        'a.component.html' => <<<'HTML'
            <p>{{ 'take.minutes' | translate: { count: n } }}</p>
            <p>{{ "take.start" | translatePlural: n }}</p>
            <p [title]="'take.minutes' | translatePlural: n">{{ "take.start" | translate }}</p>
            <!-- {{ 'take.minutes' | translate }} -->
            <p>{{ 'other.minutes' | translate }} {{ (wide ? 'take.minutes' : 'take.start') | translate }}</p>
            HTML,
        'a.component.ts' => <<<'TS'
            const a = this.i18n.t('take.start') + this._i18n.plural("take.minutes", count);
            const b = this.i18n.t( "take.minutes", { count }) + i18n.plural(`take.start`, 2);
            const c = i18n.around('take.minutes', 'count') + (i18n.has('take.minutes') ? 1 : 0) + i18n.has('take.start');
            // i18n.t('take.minutes') in a comment
            const d = set.has('title') && map.t('survey.minutes') && i18n.plural(key, count) && i18n.t(TABLE[kind] ?? 'take.start');
            TS,
    ]);
    $database = ['take.minutes.one', 'take.minutes.few', 'take.minutes.other', 'take.start'];
    $scan = translationKeysScan($root, $database);
    assert_same([
        "a.component.html:1: 'take.minutes' is a plural family and is asked for as one string - the page would show the key",
        "a.component.html:2: 'take.start' is asked for as a plural, and there is no take.start.one, .few or .other - the page would show the key",
        "a.component.ts:2: 'take.minutes' is a plural family and is asked for as one string - the page would show the key",
        "a.component.ts:2: 'take.start' is asked for as a plural, and there is no take.start.one, .few or .other - the page would show the key",
        "a.component.ts:3: 'take.minutes' is a plural family and is asked for as one string - the page would show the key",
        "a.component.ts:3: 'take.minutes' is a plural family and is asked for as one string - the page would show the key",
    ], $scan['problems'], 'each place it is asked for wrongly, in either quote; the right way round, a comment, another namespace and a key that comes through a variable are let be');
    assert_same([], $scan['missing'], 'by the keys alone nothing is missing - which is why it has to be said');
    assert_same([], $scan['unused']);

    // Asked for as a plural with no key of that name at all: both are said.
    $none = translationKeysScan(sources(['a.component.html' => "{{ 'take.hours' | translatePlural: n }}\n"]), ['take.start']);
    assert_same(['take.hours'], array_keys($none['missing']));
    assert_match("/^a\\.component\\.html:1: 'take\\.hours' is asked for as a plural/", $none['problems'][0] ?? '');
});

test('the scan: a key put together at run time is put together from a declared prefix, or the scan fails', function (): void {
    $files = [
        'a.service.ts' => <<<'TS'
            const refused = this.i18n.t('take.refused.' + kind);
            const again = this.i18n.t(`take.refused.${kind}`) + this.i18n.t(`take.refused${suffix}`) + this.i18n.t("take." + part + '.title');
            const declared = word('aboutYou.gender.' + key) + word(`aboutYou.gender.${key}`);
            const whole = i18n.t(`take.inBackticks`) + i18n.t(`take.notThere`);
            const notOurs = ['survey.' + kind, `survey.${kind}`, `take.refused is ${kind}`, 'take', 'take. ', `${kind}.take.`];
            // 'take.commented.' + kind
            TS,
        'a.component.html' => "<p>{{ ('take.shown.' + kind) | translate }}</p>\n<p class=\"take.\" [title]=\"'take.title.' + kind\"></p>\n",
        'core/i18n/dynamic-keys.ts' => "export const DYNAMIC_KEYS = {\n  'aboutYou.gender.': ['male'],\n};\n",
    ];
    $database = ['take.start', 'take.inBackticks', 'aboutYou.gender.male'];
    $scan = translationKeysScan(sources($files), $database);
    assert_same([
        "a.component.html:1: a key is put together from 'take.shown.', which core/i18n/dynamic-keys.ts does not declare",
        "a.component.html:2: a key is put together from 'take.title.', which core/i18n/dynamic-keys.ts does not declare",
        "a.service.ts:1: a key is put together from 'take.refused.', which core/i18n/dynamic-keys.ts does not declare",
        "a.service.ts:2: a key is put together from 'take.refused.', which core/i18n/dynamic-keys.ts does not declare",
        "a.service.ts:2: a key is put together from 'take.refused', which core/i18n/dynamic-keys.ts does not declare",
        "a.service.ts:2: a key is put together from 'take.', which core/i18n/dynamic-keys.ts does not declare",
    ], $scan['problems'], 'a literal ending in a dot, a template literal going on with ${...}; a declared prefix, another namespace, a sentence and a comment are let be');
    assert_same(['take.notThere' => ['a.service.ts:4']], $scan['missing'], 'a key in backticks is asked for like any other');
    assert_same(['a.service.ts:4'], $scan['used']['take.inBackticks']);
    assert_same(['take.start'], $scan['unused']);

    // Declared, the same sources pass - and the keys under the prefix are then held like any others.
    $files['core/i18n/dynamic-keys.ts'] = "export const DYNAMIC_KEYS = {\n  'aboutYou.gender.': ['male'],\n  'take.refused.': ['closed'],\n  'take.shown.': [],\n  'take.title.': [],\n  'take.': [],\n};\n";
    $declared = translationKeysScan(sources($files), $database);
    assert_same(["a.service.ts:2: a key is put together from 'take.refused', which core/i18n/dynamic-keys.ts does not declare"], $declared['problems'], 'what is left is the one that is no prefix at all');
    assert_same(['take.notThere', 'take.refused.closed'], array_keys($declared['missing']), 'and a declared key that is not in the database is missing');
});

test('the scan fails a template that gives innerHTML a translated string, on one line or several - and a list of tails it cannot read', function (): void {
    $root = sources([
        'a.component.html' => "<p [innerHTML]=\"text()\"></p>\n<p>{{ 'home.title' | translate }}</p>\n<p [innerHTML]=\"'home.title' | translate\"></p>\n<!-- <p [innerHTML]=\"'home.title' | translatePlural: 2\"></p> -->\n"
            // Broken over lines, as Prettier breaks a long binding.
            . "<div\n  class=\"rich\"\n  [innerHTML]=\"\n    'home.title'\n      | translate: { name: name() }\n  \"\n></div>\n"
            // A translated string beside the binding, not in it: drawn as text like any other.
            . "<p [innerHTML]=\"survey().intro\" [attr.aria-label]=\"'home.title' | translate\">{{ 'home.title' | translate }}</p>\n"
            . "<p [innerHtml]='i18n.t(\"home.title\")'></p>\n",
        'a.component.ts' => "el.innerHTML = this.i18n.translate('home.title');\n",
        'core/i18n/dynamic-keys.ts' => "export const DYNAMIC_KEYS = {\n  'aboutYou.gender.': GENDERS.map((g) => g.key),\n  'aboutYou.age.': [...AGES],\n  'error.': ['offline', 'not a key', ''],\n  'time.': ['justNow'],\n};\n",
    ]);
    $scan = translationKeysScan($root, ['home.title', 'time.justNow', 'error.offline']);
    assert_same(7, count($scan['problems']), test_show($scan['problems']));
    assert_match('/^a\.component\.html:3: innerHTML is given a translated string - a string is text/', $scan['problems'][0]);
    assert_match('/^a\.component\.html:7: innerHTML is given a translated string/', $scan['problems'][1], 'on the line the binding begins');
    assert_match('/^a\.component\.html:13: innerHTML is given a translated string/', $scan['problems'][2], 'asked for with t() in the template, and however the attribute is written - line 12, with a translated string beside the binding, is let be');
    assert_match("/dynamic-keys\\.ts: the tails of 'aboutYou\\.gender\\.' are not written out/", $scan['problems'][3]);
    assert_match("/the tails of 'aboutYou\\.age\\.' are not written out/", $scan['problems'][4]);
    assert_match("/'error\\.' \\+ 'not a key' is not a key/", $scan['problems'][5]);
    assert_match("/'error\\.' \\+ '' is not a key/", $scan['problems'][6]);
    assert_same([], $scan['missing'], 'what could be read was read');
    assert_same([], $scan['unused']);

    $empty = translationKeysScan(sources(['core/i18n/dynamic-keys.ts' => "export const DYNAMIC_KEYS = makeKeys();\n"]), []);
    assert_match('/could be read from it/', $empty['problems'][0] ?? '');
});

test('the scan reads the real frontend: only the files it should, and their comments are not keys', function (): void {
    $root = translationKeysFrontendRoot();
    $files = translationKeySourceFiles($root);
    assert_true(in_array('app.routes.ts', $files, true) && in_array('layouts/top-bar/top-bar.component.html', $files, true), 'the sources are where the scan looks');
    foreach ($files as $file) {
        assert_match('/\.(ts|html)$/', $file);
        assert_no_match('~\.spec\.ts$|^core/testing/|^core/auth/anotoki-auth\.~', $file);
    }
    assert_same("a\n\n\nb 'c/*' \"d//\" `e\n//` f \ng", translationKeySourceText("a\r\n/* x\r\n 'y' */\r\nb 'c/*' \"d//\" `e\n//` f // 'z'\r\ng", false), 'comments out, strings as they are, line for line');
    assert_same("a\n\nb", translationKeySourceText("a<!-- 'x'\n -->\nb", true));
});

/* --------------------------------------------------- a language as a file */

test('a language\'s strings as a file: flat JSON, the letters as they are, {} for none', function (): void {
    $dir = test_temp_dir('strings');
    assert_same("{}\n", translationFileText([]));
    assert_same("{}\n", translationFileText(new stdClass()));
    assert_same("{\n    \"home.title\": \"Prieskumy – „otvorené“\",\n    \"a/b\": \"1\"\n}\n", translationFileText(['home.title' => 'Prieskumy – „otvorené“', 'a/b' => '1']));

    $values = ['home.title' => 'Prieskumy', 'time.justNow' => "práve\nteraz", '12' => 'a key that looks like a number'];
    translationFileWrite("$dir/sk.json", $values);
    assert_same($values, translationFileRead("$dir/sk.json"));
    file_put_contents("$dir/windows.json", "\xEF\xBB\xBF" . str_replace("\n", "\r\n", translationFileText($values)));
    assert_same($values, translationFileRead("$dir/windows.json"), 'as an editor on Windows saves it');
    file_put_contents("$dir/empty.json", "{}\n");
    assert_same([], translationFileRead("$dir/empty.json"));

    file_put_contents("$dir/list.json", '["a", "b"]');
    file_put_contents("$dir/broken.json", '{"a": ');
    file_put_contents("$dir/text.json", '"a"');
    assert_throws(static fn() => translationFileRead("$dir/list.json"), '/one flat object/');
    assert_throws(static fn() => translationFileRead("$dir/text.json"), '/one flat object/');
    assert_throws(static fn() => translationFileRead("$dir/broken.json"), '/is not JSON/');
    assert_throws(static fn() => translationFileRead("$dir/nothing.json"), '/There is no file/');
});
