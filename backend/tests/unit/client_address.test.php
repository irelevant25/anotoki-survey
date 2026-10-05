<?php

// Which address a request comes from, for the limits on new visitors
// (api/client_address.php) - and the visitor settings that say which proxies
// to believe (visitorSettingsChecked() in config/config.php). In this process,
// with requests made by hand.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

use Slim\Psr7\Factory\ServerRequestFactory;

function request_from(string $remote, array $headers = []): \Psr\Http\Message\ServerRequestInterface
{
    $request = (new ServerRequestFactory())->createServerRequest('POST', '/api/surveys/x/responses', ['REMOTE_ADDR' => $remote]);
    foreach ($headers as $name => $value) {
        $request = $request->withHeader($name, $value);
    }

    return $request;
}

function behind(array $proxies, string $header = 'CF-Connecting-IP'): array
{
    return ['trusted_proxies' => $proxies, 'client_ip_header' => $header];
}

test('REMOTE_ADDR, unless the connection comes from a proxy the settings trust', function (): void {
    assert_same('198.51.100.7', clientAddress(request_from('198.51.100.7'), VISITOR_DEFAULTS));
    assert_same('198.51.100.7', clientAddress(request_from('198.51.100.7', ['CF-Connecting-IP' => '203.0.113.1', 'X-Forwarded-For' => '203.0.113.2']), VISITOR_DEFAULTS), 'nobody trusted: no header believed');
    assert_same('198.51.100.7', clientAddress(request_from('198.51.100.7', ['CF-Connecting-IP' => '203.0.113.1']), behind(['10.0.0.0/8'])), 'a header from a connection that is no trusted proxy');
    assert_same('203.0.113.1', clientAddress(request_from('10.1.2.3', ['CF-Connecting-IP' => '203.0.113.1']), behind(['10.0.0.0/8'])), 'a trusted proxy\'s header');
    assert_same('10.1.2.3', clientAddress(request_from('10.1.2.3', ['X-Forwarded-For' => '203.0.113.1']), behind(['10.0.0.0/8'])), 'a header the settings do not name is not read');
    assert_same('10.1.2.3', clientAddress(request_from('10.1.2.3', ['CF-Connecting-IP' => 'somewhere']), behind(['10.0.0.0/8'])), 'no address in it: the connection\'s');
    assert_same('10.1.2.3', clientAddress(request_from('10.1.2.3'), behind(['10.0.0.0/8'])), 'no header at all');
    assert_same('?', clientAddress(request_from(''), VISITOR_DEFAULTS));
});

test('a list such as X-Forwarded-For is read from the right, past the trusted proxies, and what a visitor wrote first is never believed', function (): void {
    $settings = behind(['10.0.0.0/8', '192.0.2.10'], 'X-Forwarded-For');
    assert_same('203.0.113.9', clientAddress(request_from('10.0.0.1', ['X-Forwarded-For' => '1.2.3.4, 203.0.113.9, 192.0.2.10']), $settings), 'the first one no trusted proxy has');
    assert_same('203.0.113.9', clientAddress(request_from('10.0.0.1', ['X-Forwarded-For' => '203.0.113.9']), $settings));
    assert_same('10.0.0.1', clientAddress(request_from('10.0.0.1', ['X-Forwarded-For' => '1.2.3.4, nonsense, 192.0.2.10']), $settings), 'what came before a non-address is not believed');
    assert_same('10.0.0.1', clientAddress(request_from('10.0.0.1', ['X-Forwarded-For' => '10.0.0.2, 192.0.2.10']), $settings), 'only proxies: the connection\'s');
});

test('one address, for counting: IPv4 as it is, IPv6 by its /64, an IPv4 address written as IPv6 as the IPv4 one', function (): void {
    assert_same('198.51.100.7', clientAddressBucket('198.51.100.7'));
    assert_same('2001:db8:1:2::/64', clientAddressBucket('2001:db8:1:2:3:4:5:6'));
    assert_same('2001:db8:1:2::/64', clientAddressBucket('2001:0db8:0001:0002::ffff'));
    assert_same('198.51.100.7', clientAddressBucket('::ffff:198.51.100.7'));
    assert_same('?', clientAddressBucket('?'));
    assert_same('2001:db8::/64', clientAddressCounted(request_from('10.0.0.1', ['CF-Connecting-IP' => '2001:db8::1']), behind(['10.0.0.1'])));
});

test('ranges: IPv4 and IPv6, a bare address, the edges of a prefix, and never across the two', function (): void {
    assert_true(clientAddressInRanges('10.255.255.255', ['10.0.0.0/8']));
    assert_false(clientAddressInRanges('11.0.0.0', ['10.0.0.0/8']));
    assert_true(clientAddressInRanges('172.16.0.1', ['172.16.0.0/12']) && clientAddressInRanges('172.31.255.255', ['172.16.0.0/12']));
    assert_false(clientAddressInRanges('172.32.0.0', ['172.16.0.0/12']));
    assert_true(clientAddressInRanges('192.0.2.10', ['192.0.2.10']));
    assert_false(clientAddressInRanges('192.0.2.11', ['192.0.2.10']));
    assert_true(clientAddressInRanges('2400:cb00:1::1', ['2400:cb00::/32']));
    assert_false(clientAddressInRanges('2400:cb01::1', ['2400:cb00::/32']));
    assert_true(clientAddressInRanges('203.0.113.5', ['0.0.0.0/0']));
    assert_false(clientAddressInRanges('203.0.113.5', ['::/0']), 'an IPv4 address is in no IPv6 range');
    assert_false(clientAddressInRanges('not an address', ['0.0.0.0/0']));
    assert_false(clientAddressInRanges('10.0.0.1', ['nonsense', '']));
});

test('the visitor settings: what is usable is taken, anything else left out - never fatal', function (): void {
    assert_same(VISITOR_DEFAULTS, visitorSettingsChecked(null), 'no file: the defaults');
    $taken = visitorSettingsChecked(['new_per_hour_per_address' => 60, 'trusted_proxies' => ['173.245.48.0/20', '2400:cb00::/32', '127.0.0.1'], 'client_ip_header' => 'X-Real-IP', 'keep_days' => 7]);
    assert_same([60, ['173.245.48.0/20', '2400:cb00::/32', '127.0.0.1'], 'X-Real-IP', 7], [$taken['new_per_hour_per_address'], $taken['trusted_proxies'], $taken['client_ip_header'], $taken['keep_days']]);
    $refused = visitorSettingsChecked([
        'new_per_hour_per_address' => '60', 'new_per_hour' => 0, 'max_active' => -1, 'keep_days' => 3651, 'sweep_batch' => 1.5,
        'trusted_proxies' => ['10.0.0.0/33'], 'client_ip_header' => 'X Real IP', 'nonsense' => true,
    ]);
    assert_same(VISITOR_DEFAULTS, $refused, 'every one of them the default');
    assert_same(VISITOR_DEFAULTS['trusted_proxies'], visitorSettingsChecked(['trusted_proxies' => '10.0.0.0/8'])['trusted_proxies'], 'one range, not a list');
    assert_same(VISITOR_DEFAULTS['trusted_proxies'], visitorSettingsChecked(['trusted_proxies' => ['a' => '10.0.0.0/8']])['trusted_proxies'], 'a map, not a list');
    assert_true(visitorSettingRangeOk('::1') && visitorSettingRangeOk('2001:db8::/128') && visitorSettingRangeOk('0.0.0.0/0'));
    assert_false(visitorSettingRangeOk('2001:db8::/129') || visitorSettingRangeOk('300.1.1.1') || visitorSettingRangeOk('10.0.0.0/') || visitorSettingRangeOk(42));
});

test('the visitor settings come from config/visitors.local.php beside the others, and /api/auth/config says how long a visitor is remembered', function (): void {
    $dir = test_temp_dir('visitor-settings');
    test_write_config($dir, ['name' => dbName()] + machineDatabaseSettings(), ['issuer' => TEST_ISSUER, 'client_id' => TEST_CLIENT, 'cache_dir' => test_temp_dir('cache'), 'application_file' => test_application_file()]);
    file_put_contents("$dir/visitors.local.php", "<?php return ['keep_days' => 14, 'max_active' => 'many'];\n");
    putenv("SURVEY_TEST_CONFIG=$dir");
    localSettings(true);
    try {
        assert_same([14, VISITOR_DEFAULTS['max_active']], [visitorSettings()['keep_days'], visitorSettings()['max_active']]);
        assert_same(14, authPublicConfig()['visitorDays']);
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
            assert_same(30, authPublicConfig()['visitorDays'], "$case: /api/auth/config still answers");
            assert_match($logged, (string) @file_get_contents($log), "$case: logged");
        }
    } finally {
        ini_set('error_log', $logBefore === false ? '' : $logBefore);
        putenv('SURVEY_TEST_CONFIG=' . $GLOBALS['TEST_CONFIG_DIR']);
        localSettings(true);
    }
});
