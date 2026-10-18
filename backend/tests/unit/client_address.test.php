<?php

// Which address a request comes from, for the limits on new visitors
// (api/client_address.php): the anotoki family's one rule (anotoki-lib
// 0.5.0's ClientAddress), the one the library's own error log reads by too
// (surveyAdminContext()); what is kept of an address (a keyed HMAC, never the
// address); and the visitor settings that say which proxies to believe
// (visitorSettingsChecked() in config/config.php) - Cloudflare's published
// ranges unless config/visitors.local.php names others; and the origin secret
// (config/cloudflare.local.php, anotoki-lib 0.5.2): with it, CF-Connecting-IP
// only on a request that carries it in X-Anotoki-Origin. In this process, with
// requests made by hand.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

use Anotoki\Lib\Support\ClientAddress;
use Anotoki\Lib\Support\Keys;
use Slim\Psr7\Factory\ServerRequestFactory;

/** An edge of Cloudflare's (173.245.48.0/20), and one over IPv6 (2400:cb00::/32). */
const EDGE = '173.245.48.17';
const EDGE6 = '2400:cb00:2049:1::a29f:1804';

function request_from(string $remote, array $headers = []): \Psr\Http\Message\ServerRequestInterface
{
    $request = (new ServerRequestFactory())->createServerRequest('POST', '/api/surveys/x/responses', ['REMOTE_ADDR' => $remote]);
    foreach ($headers as $name => $value) {
        $request = $request->withHeader($name, $value);
    }

    return $request;
}

function behind(array $proxies): array
{
    return ['trusted_proxies' => $proxies];
}

/** The secret the owner's zone would add - made up for this run, never a real one. */
define('ORIGIN_SECRET', 'origin-' . bin2hex(random_bytes(20)));

/**
 * $fn with this file's database and IAM settings beside a config/cloudflare.local.php
 * holding $contents (none for null), read afresh - then this file's own settings again.
 */
function with_cloudflare_file(?string $contents, callable $fn): void
{
    $dir = test_temp_dir('cloudflare-settings');
    test_write_config($dir, ['name' => dbName()] + machineDatabaseSettings(), ['issuer' => TEST_ISSUER, 'client_id' => TEST_CLIENT, 'cache_dir' => test_temp_dir('cache'), 'application_file' => test_application_file()]);
    if ($contents !== null) {
        file_put_contents("$dir/cloudflare.local.php", $contents);
    }
    putenv("SURVEY_TEST_CONFIG=$dir");
    localSettings(true);
    try {
        $fn();
    } finally {
        putenv('SURVEY_TEST_CONFIG=' . $GLOBALS['TEST_CONFIG_DIR']);
        localSettings(true);
    }
}

/** $fn with $secret in config/cloudflare.local.php. */
function with_origin_secret(string $secret, callable $fn): void
{
    with_cloudflare_file('<?php return ' . var_export(['origin_secret' => $secret], true) . ";\n", $fn);
}

test('without a word in visitors.local.php, Cloudflare alone is believed - its published ranges, the library\'s list - about whom it carries', function (): void {
    assert_same(ClientAddress::CLOUDFLARE, VISITOR_DEFAULTS['trusted_proxies'], 'the committed default: the library\'s list, which moves with the library');
    assert_true(in_array('173.245.48.0/20', VISITOR_DEFAULTS['trusted_proxies'], true) && in_array('2400:cb00::/32', VISITOR_DEFAULTS['trusted_proxies'], true), 'Cloudflare\'s IPv4 and IPv6 ranges');
    assert_false(array_key_exists('client_ip_header', VISITOR_DEFAULTS), 'which header is believed is no setting: CF-Connecting-IP, pinned in code');

    assert_same('203.0.113.1', clientAddress(request_from(EDGE, ['CF-Connecting-IP' => '203.0.113.1']), VISITOR_DEFAULTS), 'an edge of Cloudflare\'s: the address it names');
    assert_same('2001:db8:5::7', clientAddress(request_from(EDGE6, ['CF-Connecting-IP' => '2001:db8:5::7']), VISITOR_DEFAULTS), 'an edge over IPv6 too');
    assert_same('203.0.113.9', clientAddress(request_from('::ffff:' . EDGE, ['CF-Connecting-IP' => '203.0.113.9']), VISITOR_DEFAULTS), 'an edge\'s IPv4 address written as IPv6 is still the edge');
    assert_same('198.51.100.7', clientAddress(request_from('198.51.100.7', ['CF-Connecting-IP' => '203.0.113.1']), VISITOR_DEFAULTS), 'anybody else\'s header is never believed');
    assert_same('127.0.0.1', clientAddress(request_from('127.0.0.1', ['CF-Connecting-IP' => '203.0.113.1']), VISITOR_DEFAULTS), 'nor this computer\'s');
    foreach (['X-Real-IP', 'True-Client-IP', 'X-Forwarded-For', 'Forwarded', 'X-Client-IP'] as $header) {
        $value = $header === 'Forwarded' ? 'for=203.0.113.2' : '203.0.113.2';
        assert_same(EDGE, clientAddress(request_from(EDGE, [$header => $value]), VISITOR_DEFAULTS), "$header from an edge of Cloudflare's - which passes it through as the visitor sent it - is never believed");
        assert_same('203.0.113.1', clientAddress(request_from(EDGE, [$header => $value, 'CF-Connecting-IP' => '203.0.113.1']), VISITOR_DEFAULTS), "beside CF-Connecting-IP, $header changes nothing");
    }
    assert_same(EDGE, clientAddress(request_from(EDGE, ['CF-Connecting-IP' => '203.0.113.1, 198.51.100.9']), VISITOR_DEFAULTS), 'a list names no one address: the connection\'s');
    assert_same(EDGE, clientAddress(request_from(EDGE, ['CF-Connecting-IP' => 'somewhere']), VISITOR_DEFAULTS), 'no address in it: the connection\'s');
    assert_same(EDGE, clientAddress(request_from(EDGE), VISITOR_DEFAULTS), 'no header at all');
});

test('REMOTE_ADDR, unless the connection comes from a proxy the settings trust - the edges of a range, never across IPv4 and IPv6; [] trusts nobody', function (): void {
    assert_same('198.51.100.7', clientAddress(request_from('198.51.100.7', ['CF-Connecting-IP' => '203.0.113.1']), behind([])), 'nobody trusted: no header believed');
    assert_same(EDGE, clientAddress(request_from(EDGE, ['CF-Connecting-IP' => '203.0.113.1']), behind([])), 'not even Cloudflare\'s, then');
    assert_same('203.0.113.1', clientAddress(request_from('10.255.255.255', ['CF-Connecting-IP' => '203.0.113.1']), behind(['10.0.0.0/8'])), 'the last address of a range');
    assert_same('11.0.0.0', clientAddress(request_from('11.0.0.0', ['CF-Connecting-IP' => '203.0.113.1']), behind(['10.0.0.0/8'])), 'the first one past it');
    assert_same('203.0.113.1', clientAddress(request_from('192.0.2.10', ['CF-Connecting-IP' => '203.0.113.1']), behind(['192.0.2.10'])), 'a bare address is a range of one');
    assert_same('192.0.2.11', clientAddress(request_from('192.0.2.11', ['CF-Connecting-IP' => '203.0.113.1']), behind(['192.0.2.10'])));
    assert_same('203.0.113.5', clientAddress(request_from('203.0.113.5', ['CF-Connecting-IP' => '198.51.100.1']), behind(['2001:db8::/32'])), 'an IPv4 address is in no IPv6 range');
    assert_same('198.51.100.1', clientAddress(request_from('10.1.2.3', ['X-Real-IP' => '203.0.113.1', 'CF-Connecting-IP' => '198.51.100.1']), behind(['10.0.0.0/8'])), 'CF-Connecting-IP alone, whatever else a trusted proxy sends');
    $named = visitorSettingsChecked(['trusted_proxies' => ['10.0.0.0/8'], 'client_ip_header' => 'X-Real-IP']);
    assert_same('198.51.100.1', clientAddress(request_from('10.1.2.3', ['X-Real-IP' => '203.0.113.1', 'CF-Connecting-IP' => '198.51.100.1']), $named), 'a visitors.local.php naming another header changes nothing: no such setting');
    assert_same('?', clientAddress(request_from(''), VISITOR_DEFAULTS), 'no address at all');
    assert_same('?', clientAddress(request_from('not an address'), VISITOR_DEFAULTS));
});

test('one address, for counting: IPv4 as it is, IPv6 by its /64, an IPv4 address written as IPv6 as the IPv4 one', function (): void {
    assert_same('198.51.100.7', clientAddressCounted(request_from('198.51.100.7'), VISITOR_DEFAULTS));
    assert_same('2001:db8:1:2::/64', clientAddressCounted(request_from('2001:db8:1:2:3:4:5:6'), VISITOR_DEFAULTS));
    assert_same('2001:db8:1:2::/64', clientAddressCounted(request_from('2001:0db8:0001:0002::ffff'), VISITOR_DEFAULTS));
    assert_same('198.51.100.7', clientAddressCounted(request_from('::ffff:198.51.100.7'), VISITOR_DEFAULTS));
    assert_same('2001:db8::/64', clientAddressCounted(request_from(EDGE, ['CF-Connecting-IP' => '2001:db8::1']), VISITOR_DEFAULTS), 'behind Cloudflare too');
    assert_same('?', clientAddressCounted(request_from(''), VISITOR_DEFAULTS));
});

test('what is kept of an address is a keyed HMAC of what is counted - never the address: one /64, one name', function (): void {
    $kept = clientAddressKept(request_from('198.51.100.7'), VISITOR_DEFAULTS);
    assert_match('/^[0-9a-f]{64}$/D', $kept);
    assert_same(hash_hmac('sha256', '198.51.100.7', Keys::derive(Keys::installation(storageDir()), 'visitor-limits')), $kept, 'under this installation\'s own key, derived for this alone');
    assert_true(hash('sha256', '198.51.100.7') !== $kept, 'never a bare hash, which anybody could match against every IPv4 address there is');
    assert_true($kept !== clientAddressKept(request_from('198.51.100.8'), VISITOR_DEFAULTS), 'another address, another name');
    assert_same(clientAddressKept(request_from('2001:db8:1:2::1'), VISITOR_DEFAULTS), clientAddressKept(request_from('2001:db8:1:2:ffff::9'), VISITOR_DEFAULTS), 'one /64, one counter');
    assert_same(clientAddressKept(request_from('203.0.113.4'), VISITOR_DEFAULTS), clientAddressKept(request_from(EDGE, ['CF-Connecting-IP' => '203.0.113.4']), VISITOR_DEFAULTS), 'the visitor behind Cloudflare is the visitor');
});

test('the library\'s own reading of an address - its error log\'s - goes by the same settings: Cloudflare\'s edges and their header, nobody else\'s', function (): void {
    $context = surveyAdminContext();
    assert_same([ClientAddress::CLOUDFLARE, 'CF-Connecting-IP'], [$context->trustedProxies(), $context->clientHeader()]);
    foreach ([
        'an edge of Cloudflare\'s' => [request_from(EDGE, ['CF-Connecting-IP' => '203.0.113.1']), '203.0.113.1'],
        'anybody else' => [request_from('198.51.100.7', ['CF-Connecting-IP' => '203.0.113.1']), '198.51.100.7'],
        'over IPv6, by its /64' => [request_from(EDGE6, ['CF-Connecting-IP' => '2001:db8:1:2::5']), '2001:db8:1:2::/64'],
    ] as $who => [$request, $bucket]) {
        assert_same($bucket, $context->clientKey($request), $who);
        assert_same(clientAddressCounted($request, visitorSettings()), $context->clientKey($request), "$who: the visitors' limits count the same");
    }
});

test('the origin secret: from a Cloudflare address, CF-Connecting-IP only on a request carrying it in X-Anotoki-Origin - without it, or with a wrong one, the edge; from anywhere else, the connection; with no secret, as before', function (): void {
    $visitor = ['CF-Connecting-IP' => '203.0.113.1'];

    // (a) No secret configured (this file's settings have no cloudflare.local.php): the visitor, as before.
    assert_same(null, originSecret());
    assert_same('203.0.113.1', clientAddress(request_from(EDGE, $visitor), VISITOR_DEFAULTS), 'no secret: the visitor Cloudflare names');
    assert_same('203.0.113.1', clientAddress(request_from(EDGE, $visitor + ['X-Anotoki-Origin' => 'anything']), VISITOR_DEFAULTS), 'and the header changes nothing then');
    assert_same('203.0.113.1', surveyAdminContext()->clientKey(request_from(EDGE, $visitor)), 'the library\'s reading too');

    with_origin_secret(ORIGIN_SECRET, function () use ($visitor): void {
        assert_same(ORIGIN_SECRET, originSecret());
        $context = surveyAdminContext();
        // (b) A secret, no X-Anotoki-Origin: a Worker of anybody's, writing the CF-Connecting-IP it likes - the edge.
        assert_same(EDGE, clientAddress(request_from(EDGE, $visitor), VISITOR_DEFAULTS), 'no X-Anotoki-Origin: the edge it came from');
        assert_same(EDGE6, clientAddress(request_from(EDGE6, ['CF-Connecting-IP' => '2001:db8:5::7']), VISITOR_DEFAULTS), 'over IPv6 too');
        assert_same(EDGE, $context->clientKey(request_from(EDGE, $visitor)), 'the library\'s reading (the error log, the pages\' reports): the edge');
        // (c) A wrong one: the edge.
        foreach ([
            'another value' => 'not the secret',
            'one character short' => substr(ORIGIN_SECRET, 0, -1),
            'one too many' => ORIGIN_SECRET . 'x',
            'in capitals' => strtoupper(ORIGIN_SECRET),
            'empty' => '',
        ] as $case => $sent) {
            assert_same(EDGE, clientAddress(request_from(EDGE, $visitor + ['X-Anotoki-Origin' => $sent]), VISITOR_DEFAULTS), "a wrong secret ($case): the edge");
            assert_same(EDGE, $context->clientKey(request_from(EDGE, $visitor + ['X-Anotoki-Origin' => $sent])), "a wrong secret ($case): the edge for the library too");
        }
        // (d) The right one: the visitor.
        assert_same('203.0.113.1', clientAddress(request_from(EDGE, $visitor + ['X-Anotoki-Origin' => ORIGIN_SECRET]), VISITOR_DEFAULTS), 'the zone\'s secret: the visitor Cloudflare names');
        assert_same('2001:db8:5::7', clientAddress(request_from(EDGE6, ['CF-Connecting-IP' => '2001:db8:5::7', 'X-Anotoki-Origin' => ORIGIN_SECRET]), VISITOR_DEFAULTS), 'over IPv6 too');
        assert_same('203.0.113.1', $context->clientKey(request_from(EDGE, $visitor + ['X-Anotoki-Origin' => ORIGIN_SECRET])), 'the library\'s reading too');
        // (e) The right one from outside Cloudflare's ranges: that connection's - the secret alone opens nothing.
        assert_same('198.51.100.7', clientAddress(request_from('198.51.100.7', $visitor + ['X-Anotoki-Origin' => ORIGIN_SECRET]), VISITOR_DEFAULTS), 'the secret from outside the ranges: the connection');
        assert_same('198.51.100.7', $context->clientKey(request_from('198.51.100.7', $visitor + ['X-Anotoki-Origin' => ORIGIN_SECRET])), 'the library\'s reading too');

        // What the limits count without the secret: the edge, however many visitors a Worker makes up.
        assert_same(EDGE, clientAddressCounted(request_from(EDGE, $visitor), VISITOR_DEFAULTS));
        $kept = array_unique(array_map(static fn(int $i): string => clientAddressKept(request_from(EDGE, ['CF-Connecting-IP' => "203.0.113.$i"]), VISITOR_DEFAULTS), range(1, 20)));
        assert_same([clientAddressKept(request_from(EDGE), VISITOR_DEFAULTS)], array_values($kept), 'twenty made-up visitors from one edge: one counter, the edge\'s');
    });

    // The file gone: as before.
    assert_same('203.0.113.1', clientAddress(request_from(EDGE, $visitor), VISITOR_DEFAULTS));
    assert_same('203.0.113.1', surveyAdminContext()->clientKey(request_from(EDGE, $visitor)));
});

test('config/cloudflare.local.php read cleanly: its value trimmed; one that names no usable secret - empty, spaces, a misspelt key, no string, no array - or a folder in its place fails closed (2026-10-18): a secret no request carries, a forged CF-Connecting-IP from Cloudflare\'s ranges never believed - the file\'s own value in X-Anotoki-Origin neither; logged once a day, never a value; the site set up all the same; deleting the file is what switches the secret off', function (): void {
    with_cloudflare_file(null, function (): void {
        assert_same(null, originSecret(), 'no file: no secret');
    });
    with_origin_secret(" \t" . ORIGIN_SECRET . "\n", function (): void {
        assert_same(ORIGIN_SECRET, originSecret(), 'spaces around it are no part of it: a header\'s value never has them');
        assert_same('203.0.113.7', clientAddress(request_from(EDGE, ['CF-Connecting-IP' => '203.0.113.7', 'X-Anotoki-Origin' => ORIGIN_SECRET]), VISITOR_DEFAULTS), 'and so it matches the header');
    });

    // Each holds the secret somewhere a slip put it - never where the site reads it. Read as "no secret" (the rule
    // before 2026-10-18), every one of them believed anybody's Worker on Cloudflare's ranges about who it is.
    foreach ([
        'an empty value' => "<?php return ['origin_secret' => ''];\n",
        'only spaces' => "<?php return ['origin_secret' => '   '];\n",
        'a misspelt key' => "<?php return ['orgin_secret' => '" . ORIGIN_SECRET . "'];\n",
        'the key in capitals' => "<?php return ['ORIGIN_SECRET' => '" . ORIGIN_SECRET . "'];\n",
        'another key' => "<?php return ['secret' => '" . ORIGIN_SECRET . "'];\n",
        'a number' => "<?php return ['origin_secret' => 123456789012345678];\n",
        'a list' => "<?php return ['origin_secret' => ['" . ORIGIN_SECRET . "']];\n",
        'true' => "<?php return ['origin_secret' => true];\n",
        'an empty array' => "<?php return [];\n",
        'no array returned' => "<?php return '" . ORIGIN_SECRET . "';\n",
        'nothing returned' => "<?php ['origin_secret' => '" . ORIGIN_SECRET . "'];\n",
        'null returned' => "<?php return null;\n",
    ] as $case => $contents) {
        [$log] = logged_while(static function () use ($case, $contents): void {
            with_cloudflare_file($contents, function () use ($case): void {
                $level = ob_get_level();
                ob_start();
                try {
                    fails_closed($case);
                } finally {
                    $printed = (string) ob_get_clean();
                }
                assert_same('', $printed, "$case: nothing of the file printed");
                assert_same($level, ob_get_level(), "$case: no buffer left open");
            });
        });
        assert_same(1, lines_saying($log, '[cloudflare] config/cloudflare.local.php names no usable origin_secret'), "$case: said once, read twice - " . $log);
        assert_true(str_contains($log, 'no request carries its secret, so every request from Cloudflare\'s ranges counts as the edge it came from until the file holds one - or is deleted, which switches the secret off.'), "$case: and that it fails closed, and how to switch it off - " . $log);
        assert_false(str_contains($log, ORIGIN_SECRET), "$case: the log never holds the value");
    }

    // A folder in the file's place - an FTP program's "new folder" given the file's name: something is there, and
    // nothing to read. Taken for "no file" (as is_file() alone would), it believed anybody's Worker again.
    $folder = test_temp_dir('cloudflare-folder');
    test_write_config($folder, ['name' => dbName()] + machineDatabaseSettings(), ['issuer' => TEST_ISSUER, 'client_id' => TEST_CLIENT, 'cache_dir' => test_temp_dir('cache'), 'application_file' => test_application_file()]);
    mkdir("$folder/cloudflare.local.php");
    putenv("SURVEY_TEST_CONFIG=$folder");
    try {
        [$log] = logged_while(static function (): void {
            localSettings(true);
            fails_closed('a folder in its place');
        });
        assert_same(1, lines_saying($log, '[cloudflare] config/cloudflare.local.php is no file (a folder in its place?): no request carries its secret'), 'a folder: said once, read twice - ' . $log);
        rmdir("$folder/cloudflare.local.php");
        localSettings(true);
        assert_same(null, originSecret(), 'the folder gone - nothing there: no secret');
    } finally {
        putenv('SURVEY_TEST_CONFIG=' . $GLOBALS['TEST_CONFIG_DIR']);
        localSettings(true);
    }

    // Switching the secret off is deleting the file: Cloudflare's ranges alone again, the next reading.
    $dir = test_temp_dir('cloudflare-switched-off');
    test_write_config($dir, ['name' => dbName()] + machineDatabaseSettings(), ['issuer' => TEST_ISSUER, 'client_id' => TEST_CLIENT, 'cache_dir' => test_temp_dir('cache'), 'application_file' => test_application_file()]);
    file_put_contents("$dir/cloudflare.local.php", "<?php return ['origin_secret' => ''];\n");
    putenv("SURVEY_TEST_CONFIG=$dir");
    try {
        logged_while(static function (): void {
            localSettings(true);
            assert_same(EDGE, clientAddress(request_from(EDGE, ['CF-Connecting-IP' => '203.0.113.1']), VISITOR_DEFAULTS), 'an emptied value: the edge - an empty value switches nothing off');
        });
        unlink("$dir/cloudflare.local.php");
        localSettings(true);
        assert_same(null, originSecret(), 'the file deleted: no secret');
        assert_same('203.0.113.1', clientAddress(request_from(EDGE, ['CF-Connecting-IP' => '203.0.113.1']), VISITOR_DEFAULTS), 'and CF-Connecting-IP from Cloudflare\'s ranges alone, as before the file');
    } finally {
        putenv('SURVEY_TEST_CONFIG=' . $GLOBALS['TEST_CONFIG_DIR']);
        localSettings(true);
    }
});

/**
 * A cloudflare.local.php that is there but holds no usable secret - it cannot be
 * read cleanly, or it names none - fails closed: its secret is one no request
 * carries - not the file's (never read, or not where the site reads it), never
 * none - so a request from Cloudflare's ranges is the edge it came from, without
 * X-Anotoki-Origin and with the very value the file holds; from anywhere else,
 * the connection, as ever.
 */
function fails_closed(string $case): void
{
    $secret = originSecret();
    assert_true(is_string($secret) && preg_match('/^[0-9a-f]{64}$/D', $secret) === 1 && $secret !== ORIGIN_SECRET, "$case: a secret no request carries, not the file's");
    localSettings(true);
    assert_same($secret, originSecret(), "$case: the same one all through the process");
    assert_same(null, settingsProblem(), "$case: the site is set up all the same - the file is optional");

    $forged = ['CF-Connecting-IP' => '203.0.113.1'];
    assert_same(EDGE, clientAddress(request_from(EDGE, $forged), VISITOR_DEFAULTS), "$case: a forged CF-Connecting-IP from Cloudflare's ranges is not believed - the edge");
    assert_same(EDGE6, clientAddress(request_from(EDGE6, ['CF-Connecting-IP' => '2001:db8:5::7']), VISITOR_DEFAULTS), "$case: over IPv6 too");
    assert_same(EDGE, clientAddress(request_from(EDGE, $forged + ['X-Anotoki-Origin' => ORIGIN_SECRET]), VISITOR_DEFAULTS), "$case: the edge with the file's own value too");
    assert_same('198.51.100.7', clientAddress(request_from('198.51.100.7', $forged), VISITOR_DEFAULTS), "$case: from elsewhere, the connection");
    assert_same(EDGE, surveyAdminContext()->clientKey(request_from(EDGE, $forged)), "$case: the library's reading (the error log, the pages' reports): the edge");
    $kept = array_unique(array_map(static fn(int $i): string => clientAddressKept(request_from(EDGE, ['CF-Connecting-IP' => "203.0.113.$i"]), VISITOR_DEFAULTS), range(1, 20)));
    assert_same([clientAddressKept(request_from(EDGE), VISITOR_DEFAULTS)], array_values($kept), "$case: twenty made-up visitors from one edge - one counter, the edge's");
}

test('a cloudflare.local.php that cannot be read cleanly - it does not start with <?php (no <?php line, a byte-order mark or a line before it - before declare(strict_types=1) too, which PHP cannot even compile), it prints (text after a closing tag), PHP cannot parse or run it - fails closed: never printed, a secret no request carries, every request from Cloudflare\'s ranges its edge; its fault logged once by its kind, its start or its bytes, never its text', function (): void {
    $secret = var_export(['origin_secret' => ORIGIN_SECRET], true);
    // A secret written bare is a constant PHP does not know, whose error quotes it; two strings side by side are a
    // parse error quoting the second.
    $bare = 'secret_' . bin2hex(random_bytes(16));
    foreach ([
        // Written by hand without its first line, or saved with a BOM or a line before it: PHP would print what comes
        // before its <?php ahead of every answer - and with declare(strict_types=1) after it could not even compile
        // it, a fatal error no handler catches (this process would end here; every request a 500, the file never
        // failing closed). None is compiled: a file that does not start with <?php is passed over unread.
        'no <?php line' => ["return {$secret};\n", 'does not start with <?php'],
        'a byte-order mark' => ["\xEF\xBB\xBF<?php\n\nreturn {$secret};\n", 'does not start with <?php'],
        'a line before its <?php' => ["\n<?php\n\nreturn {$secret};\n", 'does not start with <?php'],
        'a byte-order mark before <?php declare(strict_types=1)' => ["\xEF\xBB\xBF<?php declare(strict_types=1);\n\nreturn {$secret};\n", 'does not start with <?php'],
        'a blank line before <?php declare(strict_types=1)' => ["\n<?php declare(strict_types=1);\n\nreturn {$secret};\n", 'does not start with <?php'],
        // Text after a closing tag, or echoed: printed all the same, and caught.
        'text after a closing tag' => ["<?php \$kept = 1; ?>\n" . ORIGIN_SECRET . "\n<?php return {$secret};\n", 'prints ' . (strlen(ORIGIN_SECRET) + 1) . ' bytes of its own'],
        'a buffer of its own left open' => ["<?php ob_start(); echo '" . ORIGIN_SECRET . "'; return {$secret};\n", 'prints ' . strlen(ORIGIN_SECRET) . ' bytes of its own'],
        'a parse error' => ["<?php return ['origin_secret' => 'x' '" . ORIGIN_SECRET . "'];\n", 'could not be read (ParseError on line 1)'],
        'a bare word' => ["<?php return ['origin_secret' => $bare];\n", 'could not be read (Error on line 1)'],
    ] as $case => [$contents, $fault]) {
        [$log] = logged_while(static function () use ($case, $contents): void {
            with_cloudflare_file($contents, function () use ($case): void {
                $level = ob_get_level();
                ob_start();
                try {
                    fails_closed($case);
                } finally {
                    $printed = (string) ob_get_clean();
                }
                assert_same('', $printed, "$case: nothing of the file printed");
                assert_same($level, ob_get_level(), "$case: no buffer of the file's left open");
            });
        });
        assert_same(1, lines_saying($log, "[cloudflare] config/cloudflare.local.php $fault"), "$case: its fault said once, read twice - " . $log);
        assert_true(str_contains($log, 'no request carries its secret, so every request from Cloudflare\'s ranges counts as the edge it came from'), "$case: and that it fails closed - " . $log);
        assert_false(str_contains($log, ORIGIN_SECRET) || str_contains($log, $bare), "$case: the log never holds the value");
        assert_false(str_contains($log, 'strict_types'), "$case: nor what PHP said of it");
    }

    // Mended - the file gone, or read cleanly - and the next reading is as the file says.
    assert_same('203.0.113.1', clientAddress(request_from(EDGE, ['CF-Connecting-IP' => '203.0.113.1']), VISITOR_DEFAULTS), 'the file gone: Cloudflare\'s ranges alone again');
    with_origin_secret(ORIGIN_SECRET, function (): void {
        assert_same(ORIGIN_SECRET, originSecret(), 'read cleanly again: its own secret');
    });
});

test('the visitor settings: what is usable is taken, anything else left out - never fatal', function (): void {
    assert_same(VISITOR_DEFAULTS, visitorSettingsChecked(null), 'no file: the defaults');
    $taken = visitorSettingsChecked(['new_per_hour_per_address' => 60, 'trusted_proxies' => ['173.245.48.0/20', '2400:cb00::/32', '127.0.0.1', '10.0.0.0/8', '2001:db8::/16'], 'keep_days' => 7]);
    assert_same([60, ['173.245.48.0/20', '2400:cb00::/32', '127.0.0.1', '10.0.0.0/8', '2001:db8::/16'], 7], [$taken['new_per_hour_per_address'], $taken['trusted_proxies'], $taken['keep_days']]);
    assert_same([], visitorSettingsChecked(['trusted_proxies' => []])['trusted_proxies'], 'an empty list: nobody believed, REMOTE_ADDR alone (a host not behind Cloudflare)');
    foreach (['X-Real-IP', 'True-Client-IP', 'X-Forwarded-For', 'CF-Connecting-IP'] as $header) {
        assert_false(array_key_exists('client_ip_header', visitorSettingsChecked(['client_ip_header' => $header])), "client_ip_header ($header) is no setting: left out, logged - the header is pinned");
    }
    // A catch-all range would make a proxy of half the Internet: the list is refused whole, and Cloudflare's holds.
    foreach ([['0.0.0.0/0'], ['::/0'], ['173.245.48.0/20', '0.0.0.0/0'], ['10.0.0.0/7'], ['2001::/15'], ['128.0.0.0/1']] as $catchAll) {
        assert_same(ClientAddress::CLOUDFLARE, visitorSettingsChecked(['trusted_proxies' => $catchAll])['trusted_proxies'], 'refused, the default holding: ' . implode(', ', $catchAll));
    }
    assert_same('198.51.100.7', clientAddress(request_from('198.51.100.7', ['CF-Connecting-IP' => '203.0.113.1']), visitorSettingsChecked(['trusted_proxies' => ['0.0.0.0/0']])), 'so a catch-all in the file believes nobody it names');
    $refused = visitorSettingsChecked([
        'new_per_hour_per_address' => '60', 'new_per_hour' => 0, 'max_active' => -1, 'keep_days' => 3651, 'sweep_batch' => 1.5,
        'trusted_proxies' => ['10.0.0.0/33'], 'client_ip_header' => 'X Real IP', 'nonsense' => true,
    ]);
    assert_same(VISITOR_DEFAULTS, $refused, 'every one of them the default');
    assert_same(VISITOR_DEFAULTS['trusted_proxies'], visitorSettingsChecked(['trusted_proxies' => '10.0.0.0/8'])['trusted_proxies'], 'one range, not a list');
    assert_same(VISITOR_DEFAULTS['trusted_proxies'], visitorSettingsChecked(['trusted_proxies' => ['a' => '10.0.0.0/8']])['trusted_proxies'], 'a map, not a list');
    assert_true(visitorSettingRangeOk('::1') && visitorSettingRangeOk('2001:db8::/128') && visitorSettingRangeOk('10.0.0.0/8') && visitorSettingRangeOk('2001:db8::/16') && visitorSettingRangeOk('192.0.2.10'));
    assert_false(visitorSettingRangeOk('2001:db8::/129') || visitorSettingRangeOk('300.1.1.1') || visitorSettingRangeOk('10.0.0.0/') || visitorSettingRangeOk(42));
    assert_false(visitorSettingRangeOk('0.0.0.0/0') || visitorSettingRangeOk('::/0') || visitorSettingRangeOk('10.0.0.0/7') || visitorSettingRangeOk('2001::/15'), 'no catch-all: shorter than /8 (IPv4) or /16 (IPv6)');
});

test('the visitor settings come from config/visitors.local.php beside the others, and /api/auth/config says how long a visitor is remembered', function (): void {
    $dir = test_temp_dir('visitor-settings');
    test_write_config($dir, ['name' => dbName()] + machineDatabaseSettings(), ['issuer' => TEST_ISSUER, 'client_id' => TEST_CLIENT, 'cache_dir' => test_temp_dir('cache'), 'application_file' => test_application_file()]);
    file_put_contents("$dir/visitors.local.php", "<?php return ['keep_days' => 14, 'max_active' => 'many'];\n");
    putenv("SURVEY_TEST_CONFIG=$dir");
    localSettings(true);
    try {
        assert_same([14, VISITOR_DEFAULTS['max_active']], [visitorSettings()['keep_days'], visitorSettings()['max_active']]);
        assert_same(14, authPublicConfig()['visitor_days']);
    } finally {
        putenv('SURVEY_TEST_CONFIG=' . $GLOBALS['TEST_CONFIG_DIR']);
        localSettings(true);
    }
    assert_same(30, visitorSettings()['keep_days'], 'without one: the default');
});

/** $fn with $contents in config/visitors.local.php - a settings folder of its own, its storage's stamps new. */
function with_visitors_file(string $contents, callable $fn): void
{
    $dir = test_temp_dir('visitor-settings-broken');
    test_write_config($dir, ['name' => dbName()] + machineDatabaseSettings(), ['issuer' => TEST_ISSUER, 'client_id' => TEST_CLIENT, 'cache_dir' => test_temp_dir('cache'), 'application_file' => test_application_file()]);
    file_put_contents("$dir/visitors.local.php", $contents);
    putenv("SURVEY_TEST_CONFIG=$dir");
    try {
        $fn();
    } finally {
        putenv('SURVEY_TEST_CONFIG=' . $GLOBALS['TEST_CONFIG_DIR']);
        localSettings(true);
    }
}

test('a visitors.local.php that cannot be read cleanly - a parse error, no array returned, a start that is not <?php (no <?php line, a byte-order mark, a blank line before declare(strict_types=1)), anything it prints - means the defaults and the site stays up: nothing of it printed, its fault said once a day by its kind and line, its start or its bytes, never what PHP said nor the file\'s text', function (): void {
    // A range the file names, to look for in the log - and a word a parse error's message would quote.
    $mine = "['keep_days' => 10, 'trusted_proxies' => ['192.0.2.0/24']]";
    foreach ([
        'a parse error' => ["<?php return ['keep_days' => 10 'unexpected-words'];\n", 'could not be read (ParseError on line 1)'],
        'no array returned' => ["<?php {$mine};\n", 'could not be read (it returns no array)'],
        'a string returned' => ["<?php return 'keep_days=10 192.0.2.0/24';\n", 'could not be read (it returns no array)'],
        'no <?php line' => ["return {$mine};\n", 'does not start with <?php'],
        'a byte-order mark' => ["\xEF\xBB\xBF<?php return {$mine};\n", 'does not start with <?php'],
        // Compiled, a fatal error no handler catches: never compiled.
        'a blank line before <?php declare(strict_types=1)' => ["\n<?php declare(strict_types=1);\nreturn {$mine};\n", 'does not start with <?php'],
        'text after a closing tag' => ["<?php \$kept = 1; ?>\n192.0.2.0/24\n<?php return {$mine};\n", 'prints 13 bytes of its own'],
    ] as $case => [$contents, $fault]) {
        [$log] = logged_while(static function () use ($case, $contents): void {
            with_visitors_file($contents, static function () use ($case): void {
                $level = ob_get_level();
                ob_start();
                try {
                    foreach (['read', 'read again'] as $time) {
                        localSettings(true);
                        assert_same(null, settingsProblem(), "$case, $time: the site is set up - never \"not set up\"");
                        assert_same(VISITOR_DEFAULTS, visitorSettings(), "$case, $time: the defaults - none of the file's limits, nor its proxies");
                        assert_same(30, authPublicConfig()['visitor_days'], "$case, $time: /api/auth/config still answers");
                    }
                } finally {
                    $printed = (string) ob_get_clean();
                }
                assert_same('', $printed, "$case: nothing of the file printed");
                assert_same($level, ob_get_level(), "$case: no buffer left open");
            });
        });
        assert_same(1, lines_saying($log, "[visitors] config/visitors.local.php $fault"), "$case: its fault said once, read twice - " . $log);
        assert_true(str_contains($log, 'the defaults hold.'), "$case: and that the defaults hold - " . $log);
        assert_false(str_contains($log, 'unexpected') || str_contains($log, '192.0.2.0') || str_contains($log, 'keep_days') || str_contains($log, 'strict_types'), "$case: never what PHP said, nor the file's text - " . $log);
    }

    // Read cleanly, with values nobody can use: each left out, said once by the key's name - never its value.
    [$log] = logged_while(static function (): void {
        with_visitors_file("<?php return ['keep_days' => 'ten-days', 'client_ip_header' => 'X-Real-IP', 'new_per_hour' => 50];\n", static function (): void {
            foreach (['read', 'read again'] as $time) {
                localSettings(true);
                assert_same([VISITOR_DEFAULTS['keep_days'], 50, false], [visitorSettings()['keep_days'], visitorSettings()['new_per_hour'], array_key_exists('client_ip_header', visitorSettings())], "$time: the usable value taken, the others left out");
            }
        });
    });
    assert_same(1, lines_saying($log, '[visitors] config/visitors.local.php: keep_days is not usable, the default holds.'), 'said once, read twice - ' . $log);
    assert_same(1, lines_saying($log, '[visitors] config/visitors.local.php: client_ip_header is no setting of visitors.'), 'said once, read twice - ' . $log);
    assert_false(str_contains($log, 'ten-days') || str_contains($log, 'X-Real-IP'), 'never a value - ' . $log);
});
