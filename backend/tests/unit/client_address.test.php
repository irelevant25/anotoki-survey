<?php

// Which address a request comes from, for the limits on new visitors
// (api/client_address.php): the anotoki family's one rule (anotoki-lib
// 0.5.0's ClientAddress), the one the library's own error log reads by too
// (surveyAdminContext()); what is kept of an address (a keyed HMAC, never the
// address); and the visitor settings that say which proxies to believe
// (visitorSettingsChecked() in config/config.php) - Cloudflare's published
// ranges unless config/visitors.local.php names others. In this process, with
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

test('a visitors.local.php that cannot be read (a parse error, no array returned) is logged and the defaults hold - the site stays up', function (): void {
    $dir = test_temp_dir('visitor-settings-broken');
    test_write_config($dir, ['name' => dbName()] + machineDatabaseSettings(), ['issuer' => TEST_ISSUER, 'client_id' => TEST_CLIENT, 'cache_dir' => test_temp_dir('cache'), 'application_file' => test_application_file()]);
    $log = "$dir/php.log";
    $logBefore = ini_get('error_log');
    ini_set('error_log', $log);
    putenv("SURVEY_TEST_CONFIG=$dir");
    try {
        foreach ([
            'a parse error' => ["<?php return ['keep_days' => 10\n", '/\[visitors\] config\/visitors\.local\.php could not be read \(ParseError: .+\): the defaults hold\./'],
            'no array returned' => ["<?php ['keep_days' => 10];\n", '/\[visitors\] config\/visitors\.local\.php could not be read \(it returns no array\): the defaults hold\./'],
            'a string returned' => ["<?php return 'keep_days=10';\n", '/could not be read \(it returns no array\)/'],
        ] as $case => [$contents, $logged]) {
            file_put_contents("$dir/visitors.local.php", $contents);
            @unlink($log);
            localSettings(true);
            assert_same(null, settingsProblem(), "$case: the site is set up");
            assert_same(VISITOR_DEFAULTS, visitorSettings(), "$case: the defaults");
            assert_same(30, authPublicConfig()['visitor_days'], "$case: /api/auth/config still answers");
            assert_match($logged, (string) @file_get_contents($log), "$case: logged");
        }
    } finally {
        ini_set('error_log', $logBefore === false ? '' : $logBefore);
        putenv('SURVEY_TEST_CONFIG=' . $GLOBALS['TEST_CONFIG_DIR']);
        localSettings(true);
    }
});
