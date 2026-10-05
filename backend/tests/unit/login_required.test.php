<?php

// authLoginRequired(): the IAM's "Sign-in required" switch for this site, read
// through the vendored SDK (anotoki_iam_login_required(); its own test.php
// covers the cache, the single flight and the lock). Here: what our settings
// hand it, and the answers the site gets - all offline, from the tests'
// application_file or a kept answer in a cache folder of the test's own; the
// tests' issuer is never asked (tests/api/auth.test.php asks the stand-in IAM).

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

/** $fn with the IAM settings $iam (the database's as the tests have it), then the file's own again. */
function with_iam(array $iam, callable $fn): mixed
{
    $dir = test_write_config(test_temp_dir('switch-config'), ['name' => dbName()] + machineDatabaseSettings(), $iam);
    putenv("SURVEY_TEST_CONFIG=$dir");
    localSettings(true);
    anotoki_iam_login_required_reset();
    try {
        return $fn();
    } finally {
        putenv('SURVEY_TEST_CONFIG=' . $GLOBALS['TEST_CONFIG_DIR']);
        localSettings(true);
        anotoki_iam_login_required_reset();
    }
}

function iam_settings(array $extra = []): array
{
    return $extra + ['issuer' => TEST_ISSUER, 'client_id' => TEST_CLIENT, 'cache_dir' => test_temp_dir('switch-cache')];
}

test('the SDK gets the tests\' answer file and a whole number of seconds to keep the answer - nothing else of ours', function (): void {
    $file = test_application_file(false);
    $config = with_iam(iam_settings(['application_file' => $file, 'application_ttl' => 1]), 'authIamConfig');
    assert_same($file, $config['application_file']);
    assert_same(1, $config['application_ttl']);

    foreach (['a string' => '1', 'zero' => 0, 'a fraction' => 1.5] as $what => $ttl) {
        assert_false(isset(with_iam(iam_settings(['application_ttl' => $ttl]), 'authIamConfig')['application_ttl']), "$what is no ttl");
    }
    assert_false(isset(with_iam(iam_settings(['application_file' => '']), 'authIamConfig')['application_file']), 'an empty file name is none');
});

test('the switch from the answer file: off, on - and anything that is not a clear answer about this site is "required"', function (): void {
    assert_same(false, with_iam(iam_settings(['application_file' => test_application_file(false)]), 'authLoginRequired'), 'switched off');
    assert_same(true, with_iam(iam_settings(['application_file' => test_application_file(true)]), 'authLoginRequired'), 'switched on');
    assert_same(true, with_iam(iam_settings(['application_file' => test_application_file()]), 'authLoginRequired'), 'no answer at all (the IAM out of reach), and none ever read');

    $unclear = [
        'another site\'s answer' => ['client_id' => 'genshin'],
        'login_required as a string' => ['login_required' => 'false'],
        'login_required as a number' => ['login_required' => 0],
    ];
    foreach ($unclear as $what => $answer) {
        assert_same(true, with_iam(iam_settings(['application_file' => test_application_file(false, $answer)]), 'authLoginRequired'), $what);
    }
    $garbage = test_application_file();
    file_put_contents($garbage, '<html>a proxy\'s error page</html>');
    assert_same(true, with_iam(iam_settings(['application_file' => $garbage]), 'authLoginRequired'), 'not JSON');
});

test('the answer file is read on every call: a test may flip the switch between two requests', function (): void {
    $file = test_application_file(false);
    with_iam(iam_settings(['application_file' => $file]), static function () use ($file): void {
        assert_same(false, authLoginRequired());
        file_put_contents($file, json_encode(['client_id' => TEST_CLIENT, 'name' => 'Test', 'login_required' => true]));
        assert_same(true, authLoginRequired());
    });
});

test('a kept answer, fresh: used without asking the IAM, and held for the rest of the request', function (): void {
    $settings = iam_settings();
    $kept = $settings['cache_dir'] . '/anotoki-iam-application-' . sha1(TEST_ISSUER . ' ' . TEST_CLIENT) . '.json';
    $keep = static fn(bool $required): int|false => file_put_contents($kept, json_encode(['login_required' => $required, 'fetched_at' => time(), 'failed_at' => 0, 'tried_at' => time()]));
    $keep(false);

    with_iam($settings, static function () use ($keep): void {
        assert_same(false, authLoginRequired(), 'the kept answer (the tests\' issuer exists nowhere: asking it would fail closed)');
        $keep(true);
        assert_same(false, authLoginRequired(), 'one answer for the whole request');
        anotoki_iam_login_required_reset();
        assert_same(true, authLoginRequired(), 'the next request reads the kept answer again');
    });
});
