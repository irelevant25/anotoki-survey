<?php

// authLoginRequired(): the IAM's "Sign-in required" switch for this site, read
// by the anotoki library (Anotoki\Lib\Auth\SignInRule: its own tests cover the
// cache, the single flight and the lock). Here: what our settings hand it
// (authIamConfig(), surveyIam()), and the answers the site gets - all offline,
// from the tests' application_file or a kept answer in a cache folder of the
// test's own; the tests' issuer is never asked (tests/api/auth.test.php asks
// the library's stand-in IAM).

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

/** $fn with the IAM settings $iam (the database's as the tests have it), then the file's own again. */
function with_iam(array $iam, callable $fn): mixed
{
    $dir = test_write_config(test_temp_dir('switch-config'), ['name' => dbName()] + machineDatabaseSettings(), $iam);
    putenv("SURVEY_TEST_CONFIG=$dir");
    localSettings(true);
    try {
        return $fn();
    } finally {
        putenv('SURVEY_TEST_CONFIG=' . $GLOBALS['TEST_CONFIG_DIR']);
        localSettings(true);
    }
}

function iam_settings(array $extra = []): array
{
    return $extra + ['issuer' => TEST_ISSUER, 'client_id' => TEST_CLIENT, 'cache_dir' => test_temp_dir('switch-cache')];
}

/** The next request's answer: the rule holds one answer for a whole request (Identify starts each anew). */
function next_request(): bool
{
    surveySignInRule()->reset();

    return authLoginRequired();
}

test('the library gets the tests\' answer file and a whole number of seconds to keep the answer - nothing else of ours', function (): void {
    $file = test_application_file(false);
    $config = with_iam(iam_settings(['application_file' => $file, 'application_ttl' => 1]), 'authIamConfig');
    assert_same($file, $config['application_file']);
    assert_same(1, $config['application_ttl']);
    $client = with_iam(iam_settings(['application_file' => $file, 'application_ttl' => 1]), 'surveyIam');
    assert_same([$file, 1, TEST_ISSUER, TEST_CLIENT], [$client->applicationFile, $client->applicationTtl, $client->issuer, $client->clientId], 'as the library reads them');

    foreach (['a string' => '1', 'zero' => 0, 'a fraction' => 1.5] as $what => $ttl) {
        assert_false(isset(with_iam(iam_settings(['application_ttl' => $ttl]), 'authIamConfig')['application_ttl']), "$what is no ttl");
    }
    assert_false(isset(with_iam(iam_settings(['application_file' => '']), 'authIamConfig')['application_file']), 'an empty file name is none');
    assert_same(SURVEY_BACKEND . '/storage/cache', with_iam(iam_settings(['cache_dir' => 'storage/cache']), 'authIamConfig')['cache_dir'], 'a relative cache folder is the backend\'s');
});

test('the switch from the answer file: off, on - and anything that is not a clear answer about this site is "required"', function (): void {
    assert_same(false, with_iam(iam_settings(['application_file' => test_application_file(false)]), 'next_request'), 'switched off');
    assert_same(true, with_iam(iam_settings(['application_file' => test_application_file(true)]), 'next_request'), 'switched on');
    assert_same(true, with_iam(iam_settings(['application_file' => test_application_file()]), 'next_request'), 'no answer at all (the IAM out of reach), and none ever read');

    $unclear = [
        'another site\'s answer' => ['client_id' => 'genshin'],
        'login_required as a string' => ['login_required' => 'false'],
        'login_required as a number' => ['login_required' => 0],
    ];
    foreach ($unclear as $what => $answer) {
        assert_same(true, with_iam(iam_settings(['application_file' => test_application_file(false, $answer)]), 'next_request'), $what);
    }
    $garbage = test_application_file();
    file_put_contents($garbage, '<html>a proxy\'s error page</html>');
    assert_same(true, with_iam(iam_settings(['application_file' => $garbage]), 'next_request'), 'not JSON');
});

test('the answer file is read on every request: a test may flip the switch between two requests', function (): void {
    $file = test_application_file(false);
    with_iam(iam_settings(['application_file' => $file]), static function () use ($file): void {
        assert_same(false, next_request());
        file_put_contents($file, json_encode(['client_id' => TEST_CLIENT, 'name' => 'Test', 'login_required' => true]));
        assert_same(false, authLoginRequired(), 'one answer for the whole request');
        assert_same(true, next_request());
    });
});

test('a kept answer, fresh: used without asking the IAM, and held for the rest of the request', function (): void {
    $settings = iam_settings();
    $kept = $settings['cache_dir'] . '/anotoki-iam-application-' . sha1(TEST_ISSUER . ' ' . TEST_CLIENT) . '.json';
    $keep = static fn(bool $required): int|false => file_put_contents($kept, json_encode(['login_required' => $required, 'fetched_at' => time(), 'failed_at' => 0, 'tried_at' => time()]));
    $keep(false);

    with_iam($settings, static function () use ($keep): void {
        assert_same(false, next_request(), 'the kept answer (the tests\' issuer exists nowhere: asking it would fail closed)');
        $keep(true);
        assert_same(false, authLoginRequired(), 'one answer for the whole request');
        assert_same(true, next_request(), 'the next request reads the kept answer again');
    });
});

test('the browser\'s boot configuration: the library\'s fields, and the days a visitor is kept', function (): void {
    $file = test_application_file(false);
    assert_same(
        ['issuer' => TEST_ISSUER, 'client_id' => TEST_CLIENT, 'login_required' => false, 'sign_in_available' => true, 'visitor_days' => 30],
        with_iam(iam_settings(['application_file' => $file]), static function (): array {
            surveySignInRule()->reset();

            return authPublicConfig();
        })
    );
});
