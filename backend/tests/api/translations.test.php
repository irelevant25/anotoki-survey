<?php

// The site's own strings through the real server - the anotoki library's routes
// (TranslationsRoutes, the IAM's wire format: snake_case) as this site wires
// them: its error body ({error, code, ...}), its roles and its languages' use.
// Anybody reads a language's strings with English underneath; editors keep the
// languages and reword the strings - checked whole, the changed ones only,
// never a placeholder the code does not fill; only an administrator deletes a
// language, and never one the site is released in or a survey still uses. The
// keys here are the test's own: the migrations write the real ones, and what
// they leave is held to the frontend in tests/unit/translations.test.php. The
// library's own suite tests its checks string by string; here, that they are
// this site's.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings
require TEST_BACKEND . '/tools/translation_keys.php';

use Anotoki\Lib\Translations\TranslationFile;

const OWNER = 1; // ADMIN
const EDITH = 2; // EDITOR
const PAT = 101; // takes surveys

/** The largest body a write of strings or languages takes: the library's (TranslationsConfig::$bodyLimit). */
const WORDS_BODY_LIMIT = 1024 * 1024;

const ENGLISH = ['code' => 'en', 'name' => 'English', 'native_name' => 'English'];
const SLOVAK = ['code' => 'sk', 'name' => 'Slovak', 'native_name' => 'Slovenčina'];

$GLOBALS['app'] = null;
before(function (): void {
    $GLOBALS['app'] = start_app();
    // This file's copy of the database starts with no string at all: the
    // site's own keys (003 and after) and the library's are taken out of it,
    // and their strings go with them. What the routes do is then said in a
    // handful of keys that are the test's, and does not change with every
    // string the site gains.
    dbExec('DELETE FROM translation_keys');
});

function roles_of(int $user): array
{
    return match ($user) {
        OWNER => ['ADMIN'],
        EDITH => ['EDITOR'],
        default => [],
    };
}

function as_user(int $user, string $method, string $url, mixed $body = null, array $headers = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, array_merge($headers, bearer(test_token($user, roles_of($user)))));
}

function anonymous(string $method, string $url, mixed $body = null, array $headers = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, $headers);
}

/** A save of the grid's changed strings, as the admin page sends it. */
function save(int $user, array $values): array
{
    return as_user($user, 'PUT', '/api/admin/translations', ['values' => $values === [] ? new stdClass() : $values]);
}

/** One string as the database has it: [value, updated_by, updated_at] - or null. */
function stored(string $key, string $code): ?array
{
    $row = dbOne('SELECT value, updated_by, updated_at FROM translations WHERE key_name = ? AND language_code = ?', [$key, $code]);

    return $row === null ? null : array_values($row);
}

/** Every string the database has, as "key code" => value: to see that a refused save wrote nothing. */
function every_string(): array
{
    return array_column(dbAll("SELECT key_name || ' ' || language_code AS cell, value || ' by ' || COALESCE(updated_by::text, 'nobody') AS value FROM translations ORDER BY 1"), 'value', 'cell');
}

/** The keys a migration would have written, with their first strings. */
function seed_strings(): void
{
    dbExec("INSERT INTO translation_keys (name, description) VALUES
        ('test.hello', 'A greeting; {name} is who is greeted'), ('test.bye', NULL), ('test.count', 'How far; {count} of {total}'), ('test.new', 'A key with no string yet')");
    dbExec("INSERT INTO translations (key_name, language_code, value) VALUES
        ('test.hello', 'en', 'Hello, {name}!'), ('test.hello', 'sk', 'Dobrý deň, {name}!'), ('test.bye', 'en', 'Goodbye'), ('test.count', 'en', '{count} of {total}')");
}

/** A survey row as the database holds one - $content added to what every survey has. */
function survey_row(string $slug, array $content): string
{
    return (string) dbValue('INSERT INTO surveys (slug, title, content) VALUES (?, ?, ?::jsonb) RETURNING id', [
        $slug,
        $slug,
        jsonText($content + ['intro' => '', 'thanks' => '', 'askAboutYou' => false, 'steps' => []]),
    ]);
}

/** translations.php on this file's database: [exit code, what it printed]. */
function cli(string ...$arguments): array
{
    exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(TEST_BACKEND . '/translations.php') . ' ' . implode(' ', array_map('escapeshellarg', $arguments)) . ' 2>&1', $lines, $code);

    return [$code, implode("\n", $lines)];
}

/**
 * A request as $user, sent and not waited for (begin_call() in tests/lib.php,
 * with somebody_else() for the other side).
 *
 * @return array{waits: callable(): bool, answer: callable(): array}
 */
function begin_as(int $user, string $method, string $url, mixed $body = null): array
{
    return begin_call($GLOBALS['app']['base'], $method, $url, $body, bearer(test_token($user, roles_of($user))));
}

test('before there is any string: the bundle says the words are not there yet, the admin pages see an empty grid', function (): void {
    foreach (['en', 'sk'] as $code) {
        $none = anonymous('GET', "/api/translations/$code");
        assert_same(
            [503, 'translations_unavailable', '60'],
            [$none['status'], $none['body']['code'] ?? null, $none['headers']['retry-after'] ?? null],
            "$code: no English string, nothing to answer with - the pages read what they have",
        );
        assert_same(['error', 'code'], array_keys($none['body']), 'in this site\'s error body');
    }

    $export = as_user(EDITH, 'GET', '/api/admin/translations/sk/export');
    assert_same([200, "{}\n"], [$export['status'], $export['raw']], 'the export of a language with no strings: an empty file');
    assert_same([], as_user(EDITH, 'GET', '/api/admin/translations')['body']['keys']);
});

test('the bundle: a language\'s strings with English underneath, the same for everybody - in the family\'s wire format', function (): void {
    seed_strings();
    $english = ['test.hello' => 'Hello, {name}!', 'test.bye' => 'Goodbye', 'test.count' => '{count} of {total}'];

    $slovak = anonymous('GET', '/api/translations/sk');
    assert_same(['language', 'languages', 'values', 'english'], array_keys($slovak['body']));
    assert_same('sk', $slovak['body']['language']);
    assert_same([ENGLISH, SLOVAK], $slovak['body']['languages'], 'each language: code, name, native_name');
    assert_json_same(['test.hello' => 'Dobrý deň, {name}!'] + $english, $slovak['body']['values'], 'a key with no Slovak string comes in English');
    assert_json_same($english, $slovak['body']['english'], 'English itself, for the admin panel');
    assert_false(array_key_exists('test.new', $slovak['body']['values']), 'a key with no string at all is not there: the page shows the key');
    assert_same('application/json; charset=utf-8', $slovak['headers']['content-type'] ?? null);

    $own = anonymous('GET', '/api/translations/en');
    assert_same(['language', 'languages', 'values'], array_keys($own['body']), 'no second copy of English');
    assert_json_same($english, $own['body']['values']);

    // A language the site does not have: answered in English, and told so.
    $unknown = anonymous('GET', '/api/translations/de');
    assert_same([200, 'en'], [$unknown['status'], $unknown['body']['language']]);
    assert_same($own['raw'], $unknown['raw']);
    assert_same($own['raw'], anonymous('GET', '/api/translations/pt-br')['raw']);

    // A code with a region that is not offered itself is answered by its language, when that one is: a
    // Slovak browser's first wish is "sk-sk", and it gets Slovak at once - not English and a second request.
    $regional = anonymous('GET', '/api/translations/sk-sk');
    assert_same([200, 'sk'], [$regional['status'], $regional['body']['language']], '"language" says which one it is');
    assert_same($slovak['raw'], $regional['raw'], 'the Slovak bundle itself');
    assert_same($slovak['headers']['etag'], $regional['headers']['etag'], 'under the same tag');
    assert_same($own['raw'], anonymous('GET', '/api/translations/en-gb')['raw'], 'and English by English');
    assert_same(404, anonymous('GET', '/api/translations/sk-SK')['status'], 'a code is small letters: what is not one is still no language');

    // Nobody is asked who they are: a token is not looked at - not a good one, not a bad one.
    $withToken = call($GLOBALS['app']['base'], 'GET', '/api/translations/sk', null, bearer(test_token(555)));
    assert_same($slovak['raw'], $withToken['raw']);
    assert_same(0, (int) dbValue('SELECT count(*) FROM users WHERE id = 555'), 'nobody was recorded as having been here');
    $badToken = call($GLOBALS['app']['base'], 'GET', '/api/translations/sk', null, bearer('not.a.token'));
    assert_same([200, $slovak['raw']], [$badToken['status'], $badToken['raw']], 'a sign-in that ran out still reads in its language');
});

test('a code that is not one is 404, and the database never hears of it', function (): void {
    foreach (['EN', 'Sk', 'e', 'eng', 'en-', 'en-GB', 'en_gb', 'en-gbr', 'sk%0A', '%20sk', 'sk%27', '%FF', '%C3%28', 'en.json'] as $code) {
        $answer = anonymous('GET', "/api/translations/$code");
        assert_same([404, 'not_found'], [$answer['status'], $answer['body']['code'] ?? null], $code);
    }
    assert_same(404, anonymous('GET', '/api/translations/en/more')['status']);
    assert_same(404, anonymous('GET', '/api/translations')['status'], 'there is no list of its own: the bundle carries it');
    assert_same(404, anonymous('GET', '/api/languages')['status']);
    assert_same(405, anonymous('PUT', '/api/translations/sk', ['values' => ['test.bye' => 'x']])['status'], 'nothing is written here');

    // The admin routes: a code that is not one is no language.
    foreach (['%FF', 'SK', 'eng'] as $code) {
        assert_same(404, as_user(OWNER, 'PUT', "/api/admin/languages/$code", ['name' => 'X'])['status'], $code);
        assert_same(404, as_user(OWNER, 'DELETE', "/api/admin/languages/$code")['status'], $code);
        assert_same(404, as_user(OWNER, 'GET', "/api/admin/translations/$code/export")['status'], $code);
        assert_same(404, as_user(OWNER, 'PUT', "/api/admin/translations/$code/import", ['test.bye' => 'x'])['status'], $code);
    }
    assert_same([], server_problems($GLOBALS['app']), 'bytes that are not text reached no query (that would be a [db] error and a 503)');
});

test('asked again: 304 for the tag the browser holds - compared weakly - with the headers a cache needs', function (): void {
    $first = anonymous('GET', '/api/translations/sk');
    $etag = $first['headers']['etag'] ?? '';
    assert_same('"' . md5($first['raw']) . '"', $etag);
    assert_same('no-cache', $first['headers']['cache-control'] ?? null, 'kept, and asked about every time');

    // As the tag comes back from behind a server that compressed the answer: weakened (a proxy), or marked
    // inside the quotes (Apache's mod_deflate, mod_brotli) - without the second the 304 would never be answered there.
    $marked = static fn(string $suffix): string => substr($etag, 0, -1) . $suffix . '"';
    foreach ([$etag, "W/$etag", "\"other\", W/$etag", "\"a\" , $etag , \"b\"", '*', $marked('-gzip'), 'W/' . $marked('-gzip'), $marked('-br'), '"other-gzip", ' . $marked('-zstd')] as $held) {
        $again = anonymous('GET', '/api/translations/sk', null, ["If-None-Match: $held"]);
        assert_same([304, ''], [$again['status'], $again['raw']], $held);
        assert_same([$etag, 'no-cache'], [$again['headers']['etag'] ?? null, $again['headers']['cache-control'] ?? null], "the 304's own headers ($held): never no-store");
    }
    foreach (['"other"', 'W/"other"', trim($etag, '"'), '"' . md5('x') . '"', '"' . md5('x') . '-gzip"', $marked('-gzipped'), $marked('-gzip-gzip')] as $held) {
        $again = anonymous('GET', '/api/translations/sk', null, ["If-None-Match: $held"]);
        assert_same([200, $first['raw']], [$again['status'], $again['raw']], $held);
    }
    assert_true($etag !== anonymous('GET', '/api/translations/en')['headers']['etag'], 'another language, another tag');

    // A string changes: the tag the browser holds is no longer the answer's.
    dbExec("UPDATE translations SET value = 'Bye' WHERE key_name = 'test.bye' AND language_code = 'en'");
    $changed = anonymous('GET', '/api/translations/sk', null, ["If-None-Match: $etag"]);
    assert_same([200, 'Bye'], [$changed['status'], $changed['body']['values']['test.bye']]);
    assert_true($changed['headers']['etag'] !== $etag);
    dbExec("UPDATE translations SET value = 'Goodbye' WHERE key_name = 'test.bye' AND language_code = 'en'");
    assert_same($etag, anonymous('GET', '/api/translations/sk')['headers']['etag'], 'the same strings, the same tag');
});

test('who may do what: the strings and the languages are for editors - deleting a language for an administrator', function (): void {
    $before = [every_string(), dbAll('SELECT * FROM languages ORDER BY code')];
    $routes = [
        ['GET', '/api/admin/languages', null],
        ['POST', '/api/admin/languages', ['code' => 'xx', 'name' => 'Nobody\'s', 'native_name' => 'Nobody\'s']],
        ['PUT', '/api/admin/languages/sk', ['enabled' => false, 'name' => 'Changed']],
        ['DELETE', '/api/admin/languages/sk', null],
        ['GET', '/api/admin/translations', null],
        ['PUT', '/api/admin/translations', ['values' => ['test.bye' => ['en' => 'Changed']]]],
        ['GET', '/api/admin/translations/sk/export', null],
        ['PUT', '/api/admin/translations/sk/import', ['test.bye' => 'Changed']],
    ];
    foreach ($routes as [$method, $url, $body]) {
        $signedOut = anonymous($method, $url, $body);
        assert_same([401, 'sign_in_required'], [$signedOut['status'], $signedOut['body']['code'] ?? null], "$method $url, signed out");
        $noRole = as_user(PAT, $method, $url, $body);
        assert_same([403, 'forbidden'], [$noRole['status'], $noRole['body']['code'] ?? null], "$method $url, with no role of this site");
        assert_same(401, call($GLOBALS['app']['base'], $method, $url, $body, bearer(test_token(OWNER, ['ADMIN'], ['exp' => time() - 120])))['status'], "$method $url, a token that ran out");
        // Who asks comes before what is sent: a body the route would refuse is not even read.
        assert_same(401, anonymous($method, $url, 'not json', ['Content-Type: text/plain'])['status'], "$method $url, signed out, a body that is no JSON");
    }
    assert_same($before, [every_string(), dbAll('SELECT * FROM languages ORDER BY code')], 'and nothing of it was done');

    foreach ([EDITH, OWNER] as $staff) {
        assert_same(200, as_user($staff, 'GET', '/api/admin/languages')['status']);
        assert_same(200, as_user($staff, 'GET', '/api/admin/translations')['status']);
        assert_same(200, as_user($staff, 'GET', '/api/admin/translations/sk/export')['status']);
    }

    // A role in the body, an address or a header of the request is nobody's role.
    assert_same(403, as_user(PAT, 'GET', '/api/admin/languages?role=ADMIN', null, ['X-Roles: ADMIN'])['status']);

    // An editor keeps the languages - adds, renames, orders, switches off - as ever; deletes none.
    assert_same(201, as_user(EDITH, 'POST', '/api/admin/languages', ['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch'])['status'], 'an editor adds a language');
    assert_same(200, as_user(EDITH, 'PUT', '/api/admin/languages/de', ['enabled' => true])['status'], 'and changes one');
    $denied = as_user(EDITH, 'DELETE', '/api/admin/languages/de');
    assert_same([403, 'forbidden'], [$denied['status'], $denied['body']['code']], 'an editor does not delete one');
    assert_match('/Only an administrator/', $denied['body']['error']);
    assert_same(403, as_user(EDITH, 'DELETE', '/api/admin/languages/en')['status'], 'refused for who asks before anything else is said');
    assert_same(1, (int) dbValue("SELECT count(*) FROM languages WHERE code = 'de'"));
});

test('languages: added after the others, offered at once or hidden as the body says; renamed, reordered, switched off - English never', function (): void {
    $list = as_user(EDITH, 'GET', '/api/admin/languages');
    assert_same(
        [
            ENGLISH + ['enabled' => true, 'sort_order' => 1, 'seeded' => true, 'strings' => 3],
            SLOVAK + ['enabled' => true, 'sort_order' => 2, 'seeded' => true, 'strings' => 1],
            ['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch', 'enabled' => true, 'sort_order' => 3, 'seeded' => false, 'strings' => 0],
        ],
        $list['body']['languages'],
        'each with how many strings of its own it has',
    );
    assert_same('no-store', $list['headers']['cache-control'] ?? null);

    // What a new language is: last, and offered unless the body says otherwise - whatever else the body says.
    $made = as_user(EDITH, 'POST', '/api/admin/languages', ['code' => 'pt-br', 'name' => "  Portuguese\x07 (Brazil) ", 'native_name' => str_repeat('ç', 50), 'sort_order' => 0, 'seeded' => true]);
    assert_same(201, $made['status'], test_show($made['body']));
    assert_same(
        ['language' => ['code' => 'pt-br', 'name' => 'Portuguese (Brazil)', 'native_name' => str_repeat('ç', 50), 'enabled' => true, 'sort_order' => 4, 'seeded' => false, 'strings' => 0]],
        $made['body'],
    );
    assert_same('pt-br', anonymous('GET', '/api/translations/pt-br')['body']['language'], 'offered, a code with a region answers itself');

    // Hidden from the start when the body says so (the Languages page does): there for its strings to be
    // written and for surveys to be translated into, offered to nobody until somebody switches it on.
    $hidden = as_user(EDITH, 'POST', '/api/admin/languages', ['code' => 'fr', 'name' => 'French', 'native_name' => 'Français', 'enabled' => false]);
    assert_same(201, $hidden['status'], test_show($hidden['body']));
    assert_same(['language' => ['code' => 'fr', 'name' => 'French', 'native_name' => 'Français', 'enabled' => false, 'sort_order' => 5, 'seeded' => false, 'strings' => 0]], $hidden['body']);
    $french = anonymous('GET', '/api/translations/fr');
    assert_same(['en', ['en', 'sk', 'de', 'pt-br']], [$french['body']['language'], array_column($french['body']['languages'], 'code')], 'nobody is offered it');
    assert_true(in_array('fr', array_column(as_user(EDITH, 'GET', '/api/admin/languages')['body']['languages'], 'code'), true), 'the admin panel has it');
    assert_same(true, as_user(EDITH, 'PUT', '/api/admin/languages/fr', ['enabled' => true])['body']['language']['enabled']);
    assert_same('fr', anonymous('GET', '/api/translations/fr-ca')['body']['language'], 'switched on, it is offered - and answers for its regions');
    $shown = as_user(EDITH, 'POST', '/api/admin/languages', ['code' => 'it', 'name' => 'Italian', 'native_name' => 'Italiano', 'enabled' => true]);
    assert_same([201, true], [$shown['status'], $shown['body']['language']['enabled'] ?? null], 'and true is what it is without saying');
    dbExec("DELETE FROM languages WHERE code IN ('fr', 'it')");

    $twice = as_user(OWNER, 'POST', '/api/admin/languages', ['code' => 'de', 'name' => 'Deutsch', 'native_name' => 'Deutsch']);
    assert_same([409, 'language_exists'], [$twice['status'], $twice['body']['code']]);
    $invalid = [
        'enabled as text' => ['code' => 'fr', 'name' => 'French', 'native_name' => 'Français', 'enabled' => 'false'],
        'enabled as a number' => ['code' => 'fr', 'name' => 'French', 'native_name' => 'Français', 'enabled' => 0],
        'enabled as nothing' => ['code' => 'fr', 'name' => 'French', 'native_name' => 'Français', 'enabled' => null],
        'a name nobody can see' => ['code' => 'fr', 'name' => "\u{200B}\u{2060}", 'native_name' => 'Français'],
        'a native name that is a soft hyphen' => ['code' => 'fr', 'name' => 'French', 'native_name' => " \u{00AD} "],
        'a list' => ['de'],
        'no code' => ['name' => 'French', 'native_name' => 'Français'],
        'a code in capitals' => ['code' => 'FR', 'name' => 'French', 'native_name' => 'Français'],
        'three letters' => ['code' => 'fra', 'name' => 'French', 'native_name' => 'Français'],
        'a code that is a number' => ['code' => 12, 'name' => 'French', 'native_name' => 'Français'],
        'no name' => ['code' => 'fr', 'native_name' => 'Français'],
        'an empty name' => ['code' => 'fr', 'name' => " \x07 ", 'native_name' => 'Français'],
        'a name of 51 characters' => ['code' => 'fr', 'name' => str_repeat('é', 51), 'native_name' => 'Français'],
        'a name that is not text' => ['code' => 'fr', 'name' => ['French'], 'native_name' => 'Français'],
        'no native name' => ['code' => 'fr', 'name' => 'French'],
        'a native name that is a number' => ['code' => 'fr', 'name' => 'French', 'native_name' => 5],
        'the name the old way (nativeName)' => ['code' => 'fr', 'name' => 'French', 'nativeName' => 'Français'],
    ];
    foreach ($invalid as $what => $body) {
        $refused = as_user(EDITH, 'POST', '/api/admin/languages', $body);
        assert_same([422, 'invalid_language'], [$refused['status'], $refused['body']['code'] ?? null], $what);
    }
    $bodies = [
        'no body' => [null, [], 415, 'unsupported_media_type'],
        'a form' => ['code=fr', ['Content-Type: application/x-www-form-urlencoded'], 415, 'unsupported_media_type'],
        'nothing in it' => ['', ['Content-Type: application/json'], 422, 'empty_body'],
        'broken' => ['{"code": ', ['Content-Type: application/json'], 400, 'invalid_json'],
    ];
    foreach ($bodies as $what => [$body, $headers, $status, $code]) {
        $refused = as_user(EDITH, 'POST', '/api/admin/languages', $body, $headers);
        assert_same([$status, $code], [$refused['status'], $refused['body']['code'] ?? null], $what);
    }
    assert_same(4, (int) dbValue('SELECT count(*) FROM languages'));

    // Offered at once: it has no strings, so it reads in English - but it is that language.
    $german = anonymous('GET', '/api/translations/de');
    assert_same('de', $german['body']['language']);
    assert_same(['en', 'sk', 'de', 'pt-br'], array_column($german['body']['languages'], 'code'));
    assert_same(['code', 'name', 'native_name'], array_keys($german['body']['languages'][2]), 'only what a chooser shows');
    assert_json_same($german['body']['english'], $german['body']['values']);

    // Changed: only what is sent.
    $renamed = as_user(EDITH, 'PUT', '/api/admin/languages/de', ['name' => ' German (Germany) ', 'sort_order' => 0, 'code' => 'xx', 'seeded' => true]);
    assert_same(['language' => ['code' => 'de', 'name' => 'German (Germany)', 'native_name' => 'Deutsch', 'enabled' => true, 'sort_order' => 0, 'seeded' => false, 'strings' => 0]], $renamed['body']);
    assert_same(['de', 'en', 'sk', 'pt-br'], array_column(anonymous('GET', '/api/translations/en')['body']['languages'], 'code'), 'in its new place');
    assert_same('German (Germany)', as_user(EDITH, 'PUT', '/api/admin/languages/de', new stdClass())['body']['language']['name'], 'nothing sent, nothing changed');
    assert_same('Deutsch (DE)', as_user(EDITH, 'PUT', '/api/admin/languages/de', ['native_name' => 'Deutsch (DE)'])['body']['language']['native_name']);
    $changes = [
        'enabled as text' => ['enabled' => 'false'],
        'enabled as a number' => ['enabled' => 0],
        'half an order' => ['sort_order' => 1.5],
        'an order as text' => ['sort_order' => '3'],
        'an order below 0' => ['sort_order' => -1],
        'an order above 1000' => ['sort_order' => 1001],
        'an empty name' => ['name' => ''],
        'a long native name' => ['native_name' => str_repeat('x', 51)],
        'a list' => ['name'],
    ];
    foreach ($changes as $what => $body) {
        $refused = as_user(EDITH, 'PUT', '/api/admin/languages/de', $body);
        assert_same([422, 'invalid_language'], [$refused['status'], $refused['body']['code'] ?? null], $what);
    }
    assert_same(1000, as_user(EDITH, 'PUT', '/api/admin/languages/de', ['sort_order' => 1000])['body']['language']['sort_order']);
    assert_same(404, as_user(EDITH, 'PUT', '/api/admin/languages/fr', ['name' => 'French'])['status'], 'a language there is not');

    // Switched off: no longer offered, and asked for by name it reads in English. Never refused - but for English.
    $hidden = as_user(EDITH, 'PUT', '/api/admin/languages/sk', ['enabled' => false]);
    assert_same([200, false], [$hidden['status'], $hidden['body']['language']['enabled']], 'Slovak too: surveys keep their texts in it');
    $slovak = anonymous('GET', '/api/translations/sk');
    assert_same('en', $slovak['body']['language']);
    assert_same(['en', 'pt-br', 'de'], array_column($slovak['body']['languages'], 'code'));
    assert_false(array_key_exists('english', $slovak['body']));
    assert_same('en', anonymous('GET', '/api/translations/sk-sk')['body']['language'], 'nor does it answer for its regions');
    assert_same(['en', 'sk', 'pt-br', 'de'], array_column(as_user(EDITH, 'GET', '/api/admin/languages')['body']['languages'], 'code'), 'the admin panel sees the hidden ones');
    assert_same(true, as_user(EDITH, 'PUT', '/api/admin/languages/sk', ['enabled' => true])['body']['language']['enabled']);

    $english = as_user(OWNER, 'PUT', '/api/admin/languages/en', ['enabled' => false, 'name' => 'Changed']);
    assert_same([409, 'fallback_language'], [$english['status'], $english['body']['code']]);
    assert_same(
        ENGLISH + ['enabled' => true, 'sort_order' => 5, 'seeded' => true, 'strings' => 3],
        as_user(OWNER, 'PUT', '/api/admin/languages/en', ['enabled' => true, 'sort_order' => 5])['body']['language'],
        'on is what it is; its place is anybody\'s to choose',
    );
    as_user(OWNER, 'PUT', '/api/admin/languages/en', ['sort_order' => 1]);

    // At most 20.
    for ($i = 0; $i < 16; $i++) {
        dbExec('INSERT INTO languages (code, name, native_name, sort_order) VALUES (?, ?, ?, 500)', ['x' . chr(97 + $i), "Filler $i", "Filler $i"]);
    }
    $full = as_user(EDITH, 'POST', '/api/admin/languages', ['code' => 'fr', 'name' => 'French', 'native_name' => 'Français']);
    assert_same([422, 'too_many_languages'], [$full['status'], $full['body']['code']]);
    assert_same(
        'language_exists',
        as_user(EDITH, 'POST', '/api/admin/languages', ['code' => 'de', 'name' => 'German', 'native_name' => 'Deutsch'])['body']['code'],
        'one that is there is said to be there, full or not',
    );
    dbExec("DELETE FROM languages WHERE name LIKE 'Filler %'");
    $french = as_user(EDITH, 'POST', '/api/admin/languages', ['code' => 'fr', 'name' => 'French', 'native_name' => 'Français']);
    assert_same([201, 1000], [$french['status'], $french['body']['language']['sort_order']], 'last - and never past what an order may be');
    dbExec("DELETE FROM languages WHERE code = 'fr'");
});

test('two people adding the last language the site keeps, at the same moment: one waits for the other, and the most holds', function (): void {
    $fillers = 20 - 1 - (int) dbValue('SELECT count(*) FROM languages');
    for ($i = 0; $i < $fillers; $i++) {
        dbExec('INSERT INTO languages (code, name, native_name, sort_order) VALUES (?, ?, ?, 500)', ['q' . chr(97 + $i), "Filler $i", "Filler $i"]);
    }
    assert_same(19, (int) dbValue('SELECT count(*) FROM languages'), 'room for one more');

    // Somebody adds the twentieth and is not finished. Counting alone, a second request would not see that
    // row, would find room and add a twenty-first.
    $other = somebody_else();
    $other->beginTransaction();
    $other->exec("INSERT INTO languages (code, name, native_name, sort_order) VALUES ('qz', 'Filler of somebody else', 'Filler', 500)");
    $second = begin_as(EDITH, 'POST', '/api/admin/languages', ['code' => 'qy', 'name' => 'One too many', 'native_name' => 'One too many']);
    try {
        if (!$second['waits']()) {
            fail('it did not wait for whoever is adding one, and answered ' . test_show($second['answer']()));
        }
        $other->commit();
        $answer = $second['answer']();
        assert_same([422, 'too_many_languages'], [$answer['status'], $answer['body']['code'] ?? null], test_show($answer['body']));
        assert_same([20, 0], [(int) dbValue('SELECT count(*) FROM languages'), (int) dbValue("SELECT count(*) FROM languages WHERE code = 'qy'")]);

        // Reading goes on while somebody adds one: only what writes the table waits.
        $other->beginTransaction();
        $other->exec('LOCK TABLE languages IN SHARE ROW EXCLUSIVE MODE');
        assert_same(200, anonymous('GET', '/api/translations/sk')['status'], 'the page\'s strings');
        assert_same(200, save(EDITH, ['test.hello' => ['sk' => 'Dobrý deň, {name}!']])['status'], 'and a save of strings, which holds the languages\' rows');
        $other->rollBack();
    } finally {
        if ($other->inTransaction()) {
            $other->rollBack();
        }
        $second['answer']();
        dbExec("DELETE FROM languages WHERE name LIKE 'Filler %' OR code = 'qy'");
    }
    assert_same(['en', 'sk', 'pt-br', 'de'], array_column(as_user(EDITH, 'GET', '/api/admin/languages')['body']['languages'], 'code'), 'and the languages are what they were');
});

test('saving strings: the changed ones, by whoever saved them; a string sent as it is stays as it was; the last save is kept', function (): void {
    $grid = as_user(EDITH, 'GET', '/api/admin/translations');
    assert_same(['languages', 'keys'], array_keys($grid['body']));
    assert_same(as_user(EDITH, 'GET', '/api/admin/languages')['body']['languages'], $grid['body']['languages'], 'every language, hidden or not');
    assert_same(
        [
            ['name' => 'test.bye', 'description' => '', 'values' => ['en' => 'Goodbye']],
            ['name' => 'test.count', 'description' => 'How far; {count} of {total}', 'values' => ['en' => '{count} of {total}']],
            ['name' => 'test.hello', 'description' => 'A greeting; {name} is who is greeted', 'values' => ['en' => 'Hello, {name}!', 'sk' => 'Dobrý deň, {name}!']],
            ['name' => 'test.new', 'description' => 'A key with no string yet', 'values' => []],
        ],
        $grid['body']['keys'],
        'by name',
    );
    assert_true(str_contains($grid['raw'], '{"name":"test.new","description":"A key with no string yet","values":{}}'), 'no strings is {} and not []');

    $untouched = stored('test.bye', 'en');
    $saved = save(EDITH, ['test.hello' => ['sk' => "  Ahoj,\x07 {name}! "]]);
    assert_same(200, $saved['status'], test_show($saved['body']));
    assert_same(['en' => 'Hello, {name}!', 'sk' => 'Ahoj, {name}!'], $saved['body']['keys'][2]['values'], 'answered with the grid as it is now; the text cleaned');
    assert_same(['Ahoj, {name}!', EDITH], array_slice(stored('test.hello', 'sk'), 0, 2), 'who saved it is the token\'s person');
    assert_same($untouched, stored('test.bye', 'en'), 'what was not sent was not touched');
    assert_same(['Hello, {name}!', null], array_slice(stored('test.hello', 'en'), 0, 2), 'nor its English, written by a migration: nobody');

    // A writer named in the body is nobody's say.
    assert_same(200, as_user(EDITH, 'PUT', '/api/admin/translations', ['values' => ['test.bye' => ['sk' => 'Zbohom']], 'updated_by' => OWNER, 'user' => OWNER])['status']);
    assert_same(['Zbohom', EDITH], array_slice(stored('test.bye', 'sk'), 0, 2));
    dbExec("DELETE FROM translations WHERE key_name = 'test.bye' AND language_code = 'sk'");

    // Somebody else's page still shows the old grid and sends strings as they are: nothing is rewritten.
    $edith = stored('test.hello', 'sk');
    assert_same(200, save(OWNER, ['test.hello' => ['sk' => 'Ahoj, {name}!', 'en' => 'Hello, {name}!'], 'test.bye' => ['en' => ' Goodbye ']])['status']);
    assert_same($edith, stored('test.hello', 'sk'), 'still Edith\'s, from when she saved it');
    assert_same($untouched, stored('test.bye', 'en'));

    // Two people, one string: the last save is kept, and says whose it is. Other people's changes come back with every save.
    assert_same(200, save(EDITH, ['test.hello' => ['sk' => 'Vitajte, {name}!']])['status']);
    $owner = save(OWNER, ['test.hello' => ['sk' => 'Vitajte!'], 'test.bye' => ['sk' => 'Dovidenia']]);
    assert_same(['en' => 'Hello, {name}!', 'sk' => 'Vitajte!'], $owner['body']['keys'][2]['values'], 'a translation may leave a placeholder out');
    assert_same(['Vitajte!', OWNER], array_slice(stored('test.hello', 'sk'), 0, 2));
    assert_true(stored('test.hello', 'sk')[2] > $edith[2], 'and when');
    assert_same(['en' => 'Goodbye', 'sk' => 'Dovidenia'], save(EDITH, [])['body']['keys'][0]['values'], 'a save of nothing is the fresh grid');

    // English reworded: its placeholders stay. A string for a key that had none: English first.
    assert_same(200, save(EDITH, ['test.hello' => ['en' => 'Hi, {name}!'], 'test.new' => ['en' => 'New: {what}', 'sk' => 'Nové: {what}']])['status']);
    assert_same(['Hi, {name}!', EDITH], array_slice(stored('test.hello', 'en'), 0, 2));
    assert_same('Nové: {what}', anonymous('GET', '/api/translations/sk')['body']['values']['test.new']);

    // An empty string: that language has none of its own again, and reads in English.
    assert_same(200, save(EDITH, ['test.hello' => ['sk' => "  \t"]])['status']);
    assert_same(null, stored('test.hello', 'sk'));
    assert_same('Hi, {name}!', anonymous('GET', '/api/translations/sk')['body']['values']['test.hello']);
    assert_same(200, save(EDITH, ['test.hello' => ['sk' => ' ']])['status'], 'and once more, when there is none');
    assert_same(200, save(EDITH, ['test.hello' => ['sk' => 'Vitajte, {name}!']])['status']);

    // Empty is what nobody can see: a zero-width space alone is not kept as a string that draws an empty place.
    assert_same(200, save(EDITH, ['test.hello' => ['sk' => "\u{200B}"]])['status']);
    assert_same(null, stored('test.hello', 'sk'), 'that string goes, like any empty one');
    $unseen = save(EDITH, ['test.hello' => ['en' => " \u{2060}\u{00AD} "]]);
    assert_same([422, 'fallback_required'], [$unseen['status'], $unseen['body']['code']], 'and English is not left with one');
    assert_same(200, save(EDITH, ['test.hello' => ['sk' => "Vitajte,\u{200C} {name}!"]])['status'], 'inside a text such a character is part of it');
    assert_same("Vitajte,\u{200C} {name}!", stored('test.hello', 'sk')[0]);
    assert_same(200, save(EDITH, ['test.hello' => ['sk' => 'Vitajte, {name}!']])['status']);
});

test('saving strings: all of it is checked before any of it is written, and each refusal names its key - in this site\'s error body', function (): void {
    $before = every_string();
    $refusals = [
        'unknown_key' => [['test.bye' => ['en' => 'Bye'], 'no.such' => ['en' => 'x'], 'nor.this' => ['sk' => 'y']], ['key' => 'no.such', 'keys' => ['no.such', 'nor.this']]],
        'unknown_language' => [['test.bye' => ['sk' => 'Zbohom', 'hu' => 'Viszlát']], ['key' => 'test.bye', 'language' => 'hu']],
        'fallback_required' => [['test.count' => ['sk' => '{count} / {total}'], 'test.bye' => ['en' => '  ']], ['key' => 'test.bye', 'language' => 'en']],
        'placeholder_changed' => [['test.bye' => ['sk' => 'Zbohom'], 'test.hello' => ['en' => 'Hi!']], ['key' => 'test.hello', 'language' => 'en', 'placeholder' => 'name']],
        'unknown_placeholder' => [['test.bye' => ['sk' => 'Zbohom'], 'test.hello' => ['sk' => 'Ahoj, {meno}!']], ['key' => 'test.hello', 'language' => 'sk', 'placeholder' => 'meno']],
        // What the page would show as braces and a word: the name translated into something that is no name, a space inside.
        'invalid_placeholder' => [['test.bye' => ['sk' => 'Zbohom'], 'test.count' => ['sk' => '{počet} / { total }']], ['key' => 'test.count', 'language' => 'sk']],
    ];
    foreach ($refusals as $code => [$values, $about]) {
        $refused = save(EDITH, $values);
        assert_same([422, $code], [$refused['status'], $refused['body']['code'] ?? null], test_show($refused['body']));
        assert_same(['error', 'code'], array_slice(array_keys($refused['body']), 0, 2), 'the site\'s error body: the sentence, then the code');
        assert_same($about, array_diff_key($refused['body'], ['error' => 0, 'code' => 0]), "$code says what it is about");
        assert_same($before, every_string(), "$code: nothing of that save was written - not the good strings before the bad one either");
    }
    $added = save(EDITH, ['test.hello' => ['en' => 'Hi, {name} - {title}!']]);
    assert_same(['placeholder_changed', 'title'], [$added['body']['code'], $added['body']['placeholder']], 'a placeholder the code does not fill');
    assert_match('/test\.hello.*\{title\}/', $added['body']['error'], 'the sentence names the key and the placeholder');
    assert_match('/Slovak.*test\.hello.*\{meno\}/', save(EDITH, ['test.hello' => ['sk' => '{meno}']])['body']['error']);
    $braces = save(EDITH, ['test.hello' => ['en' => 'Hi, {{name}}!']]);
    assert_same([422, 'invalid_placeholder'], [$braces['status'], $braces['body']['code']], 'in English too');
    assert_match('/English.*test\.hello.*not part of a placeholder.*like \{name\}/', $braces['body']['error'], 'it says how a placeholder is written, with the key\'s own');

    $invalid = [
        'no values' => ['strings' => []],
        'values as text' => ['values' => 'test.bye'],
        'values as a list' => ['values' => [['test.bye' => ['en' => 'x']]]],
        'a key with a text' => ['values' => ['test.bye' => 'Bye']],
        'a string that is a number' => ['values' => ['test.bye' => ['sk' => 5]]],
        'a string that is an object' => ['values' => ['test.bye' => ['sk' => ['one' => 'x']]]],
        'a string that is null' => ['values' => ['test.bye' => ['sk' => null]]],
        '2001 characters' => ['values' => ['test.bye' => ['sk' => str_repeat('ž', 2001)]]],
    ];
    foreach ($invalid as $what => $body) {
        $refused = as_user(EDITH, 'PUT', '/api/admin/translations', $body);
        assert_same([422, 'invalid_value'], [$refused['status'], $refused['body']['code'] ?? null], $what);
    }
    assert_same($before, every_string());

    assert_same(200, save(EDITH, ['test.count' => ['sk' => str_repeat('ž', 2000)]])['status'], '2000 characters, counted as people count them');
    assert_same(200, save(EDITH, ['test.count' => ['sk' => '']])['status']);

    // A text with more spaces inside it than can be trimmed (and still under the body's limit) is too long -
    // never an empty one: that would delete the stored string with a 200, or pass it over in an import.
    $spaces = 'Ahoj' . str_repeat(' ', 1040000) . '{name}';
    foreach (['sk', 'en'] as $code) {
        $refused = save(EDITH, ['test.hello' => [$code => $spaces]]);
        assert_same([422, 'invalid_value'], [$refused['status'], $refused['body']['code'] ?? null], "a million spaces inside the \"$code\" string");
    }
    $refused = as_user(EDITH, 'PUT', '/api/admin/translations/sk/import', ['test.hello' => $spaces]);
    assert_same([422, 'invalid_value'], [$refused['status'], $refused['body']['code'] ?? null], 'nor is it passed over as an empty one');
    assert_same($before, every_string());

    // The body: JSON, something in it, and no more than the limit.
    assert_same(
        [415, 'unsupported_media_type'],
        [($r = as_user(EDITH, 'PUT', '/api/admin/translations', 'values=x', ['Content-Type: application/x-www-form-urlencoded']))['status'], $r['body']['code'] ?? null],
    );
    assert_same([415, 'unsupported_media_type'], [($r = as_user(EDITH, 'PUT', '/api/admin/translations'))['status'], $r['body']['code'] ?? null], 'no body at all');
    assert_same([422, 'empty_body'], [($r = as_user(EDITH, 'PUT', '/api/admin/translations', '', ['Content-Type: application/json']))['status'], $r['body']['code'] ?? null]);
    assert_same([400, 'invalid_json'], [($r = as_user(EDITH, 'PUT', '/api/admin/translations', '{"values": ', ['Content-Type: application/json']))['status'], $r['body']['code'] ?? null]);
    $large = as_user(EDITH, 'PUT', '/api/admin/translations', ['values' => ['test.bye' => ['sk' => str_repeat('x', WORDS_BODY_LIMIT)]]]);
    assert_same([413, 'too_large'], [$large['status'], $large['body']['code']]);
    assert_same(413, as_user(EDITH, 'PUT', '/api/admin/translations/sk/import', ['test.bye' => str_repeat('x', WORDS_BODY_LIMIT)])['status']);
    // More than any other route takes, and still a save here.
    $room = save(EDITH, ['test.bye' => ['sk' => 'Dovidenia'], 'test.hello' => ['en' => 'Hi, {name}!' . str_repeat(' ', BODY_LIMIT)]]);
    assert_same(200, $room['status'], test_show($room['body']['code'] ?? ''));
    assert_same($before, every_string(), 'and after all of it, the strings are what they were');
});

test('a language out as a file and back in: its own strings only; unknown keys refused, empty ones passed over', function (): void {
    $export = as_user(EDITH, 'GET', '/api/admin/translations/sk/export');
    assert_same(200, $export['status']);
    assert_same(['test.bye' => 'Dovidenia', 'test.hello' => 'Vitajte, {name}!', 'test.new' => 'Nové: {what}'], $export['body'], 'not merged with English: test.count is not there');
    assert_same('attachment; filename="translations-sk.json"', $export['headers']['content-disposition'] ?? null, 'a file, with its name');
    assert_same(TranslationFile::text($export['body']), $export['raw'], 'in the command line\'s format');
    assert_same(404, as_user(EDITH, 'GET', '/api/admin/translations/fr/export')['status']);
    assert_same("{}\n", as_user(EDITH, 'GET', '/api/admin/translations/pt-br/export')['raw']);

    // Into German: the empty ones are keys nobody translated yet.
    $in = as_user(OWNER, 'PUT', '/api/admin/translations/de/import', ['test.hello' => " Hallo, {name}!\x07", 'test.bye' => '', 'test.count' => "  \t ", 'test.new' => 'Neu']);
    assert_same(200, $in['status'], test_show($in['body']));
    assert_same(['languages', 'keys'], array_keys($in['body']), 'answered with the grid as it is now');
    assert_same(['test.hello' => 'Hallo, {name}!', 'test.new' => 'Neu'], as_user(EDITH, 'GET', '/api/admin/translations/de/export')['body']);
    assert_same(['Hallo, {name}!', OWNER], array_slice(stored('test.hello', 'de'), 0, 2), 'by who imported it');

    // An empty string deletes nothing - not in English either, where a save would refuse it.
    $before = every_string();
    assert_same(200, as_user(EDITH, 'PUT', '/api/admin/translations/de/import', ['test.hello' => '', 'test.new' => 'Neu'])['status']);
    assert_same(200, as_user(EDITH, 'PUT', '/api/admin/translations/en/import', ['test.bye' => ' ', 'test.hello' => 'Hi, {name}!'])['status']);
    assert_same(200, as_user(EDITH, 'PUT', '/api/admin/translations/de/import', ['test.hello' => "\u{200B}", 'test.new' => " \u{2060}\u{00AD}"])['status'], 'nor one that only looks empty');
    assert_same(200, as_user(EDITH, 'PUT', '/api/admin/translations/de/import', new stdClass())['status'], 'an empty file');
    assert_same($before, every_string(), 'what was there stays, as it was and by whom');

    $unknown = as_user(EDITH, 'PUT', '/api/admin/translations/de/import', ['test.bye' => 'Tschüss', 'no.such' => 'x', 'nor.this' => '', 'test.count' => '{count} von {total}']);
    assert_same([422, 'unknown_key'], [$unknown['status'], $unknown['body']['code']]);
    assert_same(['no.such', 'nor.this'], $unknown['body']['keys'], 'every key the site does not have, empty or not');
    assert_match('/no\.such.*nor\.this/', $unknown['body']['error']);

    $refusals = [
        'unknown_placeholder' => ['de', ['test.bye' => 'Tschüss', 'test.hello' => 'Hallo, {dich}!']],
        'placeholder_changed' => ['en', ['test.hello' => 'Hi!']],
        'invalid_value' => ['de', ['test.hello' => ['de' => 'Hallo']]],
    ];
    foreach ($refusals as $code => [$language, $body]) {
        $refused = as_user(EDITH, 'PUT', "/api/admin/translations/$language/import", $body);
        assert_same([422, $code], [$refused['status'], $refused['body']['code'] ?? null], test_show($refused['body']));
    }
    // A JSON list is a map whose keys are numbers - keys the site does not have (anotoki-lib 0.4.0: unknown_key); a
    // text is no map at all.
    foreach (['a list' => [['Hallo', 'Tschüss'], [], 'unknown_key'], 'a text' => ['"Hallo"', ['Content-Type: application/json'], 'invalid_value']] as $what => [$body, $headers, $code]) {
        $refused = as_user(EDITH, 'PUT', '/api/admin/translations/de/import', $body, $headers);
        assert_same([422, $code], [$refused['status'], $refused['body']['code'] ?? null], $what);
    }
    assert_same(404, as_user(EDITH, 'PUT', '/api/admin/translations/fr/import', ['test.bye' => 'Au revoir'])['status'], 'a language there is not');
    assert_same($before, every_string(), 'nothing refused was kept');

    // What came out goes back in, and nothing changes.
    $german = as_user(EDITH, 'GET', '/api/admin/translations/de/export')['body'];
    assert_same(200, as_user(EDITH, 'PUT', '/api/admin/translations/de/import', $german)['status']);
    assert_same($before, every_string());
});

test('the command line: --export and --import on the same strings, by nobody; --status reads the frontend', function (): void {
    $dir = test_temp_dir('cli');

    [$code, $out] = cli('--export', 'de', "$dir/de.json");
    assert_same(0, $code, $out);
    assert_same(TranslationFile::text(['test.hello' => 'Hallo, {name}!', 'test.new' => 'Neu']), file_get_contents("$dir/de.json"));
    [$code, $out] = cli('--export', 'sk');
    assert_same([0, ['test.bye' => 'Dovidenia', 'test.hello' => 'Vitajte, {name}!', 'test.new' => 'Nové: {what}']], [$code, json_decode($out, true)], 'to the screen without a file');
    [$code, $out] = cli('--export=sk');
    assert_same([0, 'Dovidenia'], [$code, json_decode($out, true)['test.bye'] ?? null], 'the code after = too');
    [$code, $out] = cli('--export', 'pt-br');
    assert_same([0, '{}'], [$code, trim($out)]);
    assert_same(1, cli('--export', 'fr')[0], 'a language there is not');
    assert_same(1, cli('--export', 'EN')[0], 'a code that is not one');

    $before = every_string();
    TranslationFile::write("$dir/de.json", ['test.hello' => 'Guten Tag, {name}!', 'test.bye' => 'Tschüss', 'test.count' => '', 'test.new' => 'Neu']);
    [$code, $out] = cli('--import', 'de', "$dir/de.json");
    assert_same(0, $code, $out);
    assert_match('/4 strings in .*: 2 changed/', $out);
    assert_same(['Guten Tag, {name}!', null], array_slice(stored('test.hello', 'de'), 0, 2), 'written by nobody, as a migration\'s are');
    assert_same(['Tschüss', null], array_slice(stored('test.bye', 'de'), 0, 2));
    assert_same($before['test.new de'], every_string()['test.new de'], 'a string as it was is still whose it was');

    // Checked as a save is, and all of it or none of it.
    $before = every_string();
    TranslationFile::write("$dir/bad.json", ['test.bye' => 'Auf Wiedersehen', 'test.hello' => 'Hallo, {dich}!']);
    [$code, $out] = cli('--import', 'de', "$dir/bad.json");
    assert_same(1, $code);
    assert_match('/unknown_placeholder.*\{dich\}/', $out);
    TranslationFile::write("$dir/unknown.json", ['test.bye' => 'Auf Wiedersehen', 'no.such' => 'x', 'nor.this' => 'y']);
    [$code, $out] = cli('--import', 'de', "$dir/unknown.json");
    assert_same(1, $code);
    assert_match('/unknown_key/', $out);
    assert_match('/^\s+no\.such$/m', $out, 'the keys, one a line');
    assert_match('/^\s+nor\.this$/m', $out);
    file_put_contents("$dir/list.json", '["a"]');
    assert_same(1, cli('--import', 'de', "$dir/list.json")[0]);
    assert_same(1, cli('--import', 'de', "$dir/nothing.json")[0]);
    assert_same(1, cli('--import', 'fr', "$dir/de.json")[0]);
    assert_same(1, cli('--import', 'de')[0], 'no file named');
    assert_same(1, cli('--nonsense')[0]);
    assert_same($before, every_string(), 'nothing refused was kept');

    // --status: the test's keys are the database's, and no page asks for them.
    [$code, $out] = cli('--status');
    assert_match('/the database has\s+4 keys/', $out, $out);
    assert_match('/In the database, used nowhere.*\n\s+test\.bye\n\s+test\.count\n\s+test\.hello\n\s+test\.new\n/', $out);
    assert_match('/\n\s+de\s+German \(Germany\)\s+3 \/ 4\n/', $out, 'how much of each language there is');
    // A key is missing: exit 1. Here it is the keys the frontend puts together at run time, which must be
    // there whatever else the database has; a literal counts once the database has its namespace.
    assert_same(1, $code, $out);
    assert_match('/Not clean\./', $out);
    assert_no_match('/  Clean\./', $out);
    assert_match('/Used by the frontend, not in the database.*\n\s+aboutYou\.gender\.male\n\s+core\/i18n\/dynamic-keys\.ts\n/s', $out, 'each missing key, with where it is asked for');
    assert_no_match('/\n\s+home\.title\n/', $out, 'the database has no "home" keys, so home.title is nobody\'s key yet');
    dbExec("INSERT INTO translation_keys (name) VALUES ('home.zzzProbe')");
    dbExec("INSERT INTO translations (key_name, language_code, value) VALUES ('home.zzzProbe', 'en', 'A probe')");
    [$code, $out] = cli('--status');
    assert_same(1, $code, $out);
    assert_match(
        '/Used by the frontend, not in the database.*\n\s+home\.title\n\s+pages\/\S+\.html:\d+\n/s',
        $out,
        'with one "home" key in the database, every home.* the pages ask for is missing - named, with the file and the line',
    );
    assert_match('/In the database, used nowhere.*\n\s+home\.zzzProbe\n/s', $out);
    dbExec("DELETE FROM translation_keys WHERE name = 'home.zzzProbe'");

    // Nothing missing: exit 0, and "Clean." - on a database as the migrations leave it, which is what a release is.
    $released = dbName() . '_released';
    test_copy_template($released);
    $config = (string) getenv('SURVEY_TEST_CONFIG');
    putenv('SURVEY_TEST_CONFIG=' . test_config_dir(test_iam(), $released));
    try {
        [$code, $out] = cli('--status');
    } finally {
        putenv("SURVEY_TEST_CONFIG=$config");
    }
    assert_match('/== survey \(' . preg_quote($released, '/') . '\)/', $out, 'it read the database it was pointed at');
    assert_same(0, $code, $out);
    assert_match('/Clean\./', $out);
    assert_no_match('/Not clean\.|Used by the frontend, not in the database|No English string|does not let through|used nowhere|Stored as a save would not take them/', $out, $out);

    // A key with no English string: nothing to fall back to.
    dbExec("INSERT INTO translation_keys (name) VALUES ('test.noEnglish')");
    [$code, $out] = cli('--status');
    assert_same(1, $code, $out);
    assert_match('/No English string.*\n\s+test\.noEnglish\n/', $out);
    dbExec("DELETE FROM translation_keys WHERE name = 'test.noEnglish'");
});

test('deleting a language: never English, never one the site is released in, not one a survey uses - and its strings go with it', function (): void {
    $english = as_user(OWNER, 'DELETE', '/api/admin/languages/en');
    assert_same([409, 'fallback_language'], [$english['status'], $english['body']['code']]);
    $slovak = as_user(OWNER, 'DELETE', '/api/admin/languages/sk');
    assert_same([409, 'seeded_language'], [$slovak['status'], $slovak['body']['code']], 'the next migration with strings would fail without it');
    assert_same(404, as_user(OWNER, 'DELETE', '/api/admin/languages/fr')['status']);

    // Surveys as the database holds them: written in German, translated into it, and one from before surveys said their language.
    $written = survey_row('written-in-german', ['language' => 'de', 'translations' => new stdClass()]);
    $translated = survey_row('translated-into-german', ['language' => 'en', 'translations' => ['sk' => ['title' => 'x'], 'de' => ['title' => 'y']]]);
    survey_row('from-before', []);

    $inUse = as_user(OWNER, 'DELETE', '/api/admin/languages/de');
    assert_same([409, 'language_in_use', 2], [$inUse['status'], $inUse['body']['code'], $inUse['body']['surveys'] ?? null], test_show($inUse['body']));
    assert_match('/^2 surveys are /', $inUse['body']['error']);
    dbExec('DELETE FROM surveys WHERE id = ?', [$written]);
    $inUse = as_user(OWNER, 'DELETE', '/api/admin/languages/de');
    assert_same([409, 1], [$inUse['status'], $inUse['body']['surveys']]);
    assert_match('/^1 survey is /', $inUse['body']['error']);
    assert_true(stored('test.hello', 'de') !== null, 'refused: its strings are still there');

    // A language no survey uses goes, with the old survey and the others there.
    $portuguese = as_user(OWNER, 'DELETE', '/api/admin/languages/pt-br');
    assert_same([200, ['strings' => 0]], [$portuguese['status'], $portuguese['body']], 'and says how many of its strings went with it');
    assert_same(['en', 'sk', 'de'], array_column(as_user(OWNER, 'GET', '/api/admin/languages')['body']['languages'], 'code'));

    dbExec('DELETE FROM surveys WHERE id = ?', [$translated]);
    $strings = (int) dbValue("SELECT count(*) FROM translations WHERE language_code = 'de'");
    assert_true($strings > 0);
    $gone = as_user(OWNER, 'DELETE', '/api/admin/languages/de');
    assert_same([200, ['strings' => $strings]], [$gone['status'], $gone['body']]);
    assert_same(0, (int) dbValue("SELECT count(*) FROM translations WHERE language_code = 'de'"), 'and its strings');
    assert_same(4, (int) dbValue('SELECT count(*) FROM translation_keys'), 'the keys are the code\'s, and stay');
    assert_same(404, as_user(OWNER, 'DELETE', '/api/admin/languages/de')['status']);
    assert_same('en', anonymous('GET', '/api/translations/de')['body']['language']);
    assert_same(['en', 'sk'], array_column(as_user(EDITH, 'GET', '/api/admin/translations')['body']['languages'], 'code'));
});

test('a language deleted while a survey in it is being saved: each waits for the other, and no survey is left in a language the site does not have', function (): void {
    // A survey as the editor sends it, translated into Italian.
    $translated = [
        'title' => 'Being saved',
        'slug' => 'being-saved',
        'closesOn' => null,
        'intro' => '',
        'thanks' => '',
        'askAboutYou' => false,
        'steps' => [],
        'language' => 'en',
        'translations' => ['it' => ['title' => 'Salvato']],
    ];
    $made = as_user(EDITH, 'POST', '/api/admin/surveys', ['survey' => ['translations' => new stdClass()] + $translated]);
    assert_same(201, $made['status'], test_show($made['body']));
    $id = $made['body']['survey']['id'];
    $italian = static function (): void {
        dbExec("INSERT INTO languages (code, name, native_name, sort_order) VALUES ('it', 'Italian', 'Italiano', 9) ON CONFLICT DO NOTHING");
    };
    $there = static fn(): int => (int) dbValue("SELECT count(*) FROM languages WHERE code = 'it'");
    $other = somebody_else();
    $pending = null;

    try {
        // The save first. It holds the language's row (as surveyLanguagesLock() does), has written a survey
        // in the language and is not finished: the delete cannot see that survey yet - so it must wait, and
        // look when the save is done. Deleting on what it saw before the wait would leave the survey in a
        // language that is gone.
        $italian();
        $other->beginTransaction();
        $other->query("SELECT code FROM languages WHERE code = 'it' FOR SHARE")->fetchAll();
        $other->exec(
            "INSERT INTO surveys (slug, title, content) VALUES ('written-meanwhile', 'Written meanwhile', '{\"intro\": \"\", \"thanks\": \"\", \"askAboutYou\": false, \"steps\": [], \"language\": \"it\", \"translations\": {}}'::jsonb)",
        );
        $pending = begin_as(OWNER, 'DELETE', '/api/admin/languages/it');
        if (!$pending['waits']()) {
            fail('the delete did not wait for the save, and answered ' . test_show($pending['answer']()));
        }
        $other->commit();
        $answer = $pending['answer']();
        assert_same(
            [409, 'language_in_use', 1],
            [$answer['status'], $answer['body']['code'] ?? null, $answer['body']['surveys'] ?? null],
            'it counts after the wait, and finds the survey: ' . test_show($answer['body']),
        );
        assert_same(1, $there(), 'the language is still there');
        dbExec("DELETE FROM surveys WHERE slug = 'written-meanwhile'");

        // The delete first, not finished. The save of a survey translated into the language was checked
        // against the languages before its transaction, when the language was still there: it must wait
        // on the language's row, and be refused when the row is gone.
        $other->beginTransaction();
        $other->query("SELECT 1 FROM languages WHERE code = 'it' FOR UPDATE")->fetchAll();
        $other->exec("DELETE FROM languages WHERE code = 'it'");
        $pending = begin_as(EDITH, 'PUT', "/api/admin/surveys/$id", ['revision' => 1, 'survey' => $translated]);
        if (!$pending['waits']()) {
            fail('the save did not wait for the delete, and answered ' . test_show($pending['answer']()));
        }
        $other->commit();
        $answer = $pending['answer']();
        assert_same([422, 'invalid_survey'], [$answer['status'], $answer['body']['code'] ?? null], test_show($answer['body']));
        assert_same('A language of this survey has just been deleted from the site. Add the language again, or take it out of the survey.', $answer['body']['error']);
        assert_same(
            [0, 1, '{}'],
            [$there(), (int) dbValue('SELECT revision FROM surveys WHERE id = ?', [$id]), dbValue("SELECT content->>'translations' FROM surveys WHERE id = ?", [$id])],
            'nothing of the save was kept',
        );

        // A new survey in the language, the same: refused, not made.
        $italian();
        $other->beginTransaction();
        $other->exec("DELETE FROM languages WHERE code = 'it'");
        $pending = begin_as(EDITH, 'POST', '/api/admin/surveys', ['survey' => ['slug' => 'made-meanwhile', 'language' => 'it', 'translations' => new stdClass()] + $translated]);
        if (!$pending['waits']()) {
            fail('the new survey did not wait for the delete, and was answered ' . test_show($pending['answer']()));
        }
        $other->commit();
        $answer = $pending['answer']();
        assert_same([422, 'invalid_survey'], [$answer['status'], $answer['body']['code'] ?? null], test_show($answer['body']));
        assert_same(0, (int) dbValue("SELECT count(*) FROM surveys WHERE slug = 'made-meanwhile'"));

        // One after the other, nobody waits - and each sees what the other did.
        $italian();
        $saved = as_user(EDITH, 'PUT', "/api/admin/surveys/$id", ['revision' => 1, 'survey' => $translated]);
        assert_same([200, ['it']], [$saved['status'], array_keys($saved['body']['survey']['translations'] ?? [])], test_show($saved['body']));
        assert_same('language_in_use', as_user(OWNER, 'DELETE', '/api/admin/languages/it')['body']['code'] ?? null);
        assert_same(204, as_user(OWNER, 'DELETE', "/api/admin/surveys/$id")['status']);
        assert_same(200, as_user(OWNER, 'DELETE', '/api/admin/languages/it')['status']);
        // While a survey is being saved, a save of the site's strings and other surveys' saves go on: the rows are shared.
        $other->beginTransaction();
        $other->query("SELECT code FROM languages WHERE code IN ('en', 'sk') FOR SHARE")->fetchAll();
        assert_same(200, save(EDITH, ['test.hello' => ['sk' => 'Vitajte, {name}!']])['status']);
        $another = as_user(EDITH, 'POST', '/api/admin/surveys', ['survey' => ['slug' => 'another', 'translations' => ['sk' => new stdClass()]] + $translated]);
        assert_same(201, $another['status'], test_show($another['body']));
        assert_same(204, as_user(OWNER, 'DELETE', "/api/admin/surveys/{$another['body']['survey']['id']}")['status']);
        $other->rollBack();
    } finally {
        if ($other->inTransaction()) {
            $other->rollBack();
        }
        if ($pending !== null) {
            $pending['answer']();
        }
        dbExec("DELETE FROM surveys WHERE slug IN ('being-saved', 'written-meanwhile', 'made-meanwhile', 'another')");
        dbExec("DELETE FROM languages WHERE code = 'it'");
    }
    assert_same(['en', 'sk'], array_column(as_user(EDITH, 'GET', '/api/admin/languages')['body']['languages'], 'code'));
});

test('the server said nothing it should not have', function (): void {
    assert_same([], server_problems($GLOBALS['app']));
});
