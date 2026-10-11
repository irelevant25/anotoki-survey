<?php

// config/config.php: the settings come from the two *.local.php files and
// nowhere else - without them the site is not set up, a committed file can
// never stand in for them, and the tests' own folder is only ever for a
// throwaway database.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

/** $fn with SURVEY_TEST_CONFIG pointing at $dir, then the file's own folder again. */
function with_config_dir(string $dir, callable $fn): mixed
{
    putenv("SURVEY_TEST_CONFIG=$dir");
    localSettings(true);
    try {
        return $fn();
    } finally {
        putenv('SURVEY_TEST_CONFIG=' . $GLOBALS['TEST_CONFIG_DIR']);
        localSettings(true);
    }
}

function good_database(): array
{
    return ['host' => '127.0.0.1', 'port' => 5432, 'name' => 'survey_test_config', 'user' => 'postgres', 'password' => ''];
}

/**
 * The development settings - with the IAM's answer about sign-in from a file
 * that is not there: asked through these, the SDK would call the development
 * IAM (it may be running here) and keep its answer in backend/storage/cache,
 * the running site's own.
 */
function good_iam(): array
{
    return ['issuer' => 'http://localhost:4300', 'client_id' => 'survey', 'cache_dir' => 'storage/cache', 'application_file' => test_application_file()];
}

function write_settings(string $dir, ?array $database, mixed $iam): void
{
    if ($database !== null) {
        file_put_contents("$dir/database.local.php", '<?php return ' . var_export($database, true) . ';');
    }
    file_put_contents("$dir/iam.local.php", '<?php return ' . var_export($iam, true) . ';');
}

test('without the *.local.php files the site is not set up, and says which one is missing', function (): void {
    $dir = test_temp_dir('empty-config');
    assert_same('config/database.local.php is missing.', with_config_dir($dir, 'settingsProblem'));
    assert_throws(static fn() => with_config_dir($dir, 'databaseSettings'), '/database\.local\.php is missing/');
    assert_throws(static fn() => with_config_dir($dir, 'iamSettings'), '/missing/');

    file_put_contents("$dir/database.local.php", '<?php return ' . var_export(good_database(), true) . ';');
    assert_same('config/iam.local.php is missing.', with_config_dir($dir, 'settingsProblem'));

    write_settings($dir, null, good_iam());
    assert_same(null, with_config_dir($dir, 'settingsProblem'));
    write_settings($dir, null, ['application_file' => test_application_file(false)] + good_iam());
    assert_same(null, with_config_dir($dir, 'settingsProblem'), 'a file standing in for the IAM\'s answer is allowed');
    assert_same(['issuer' => 'http://localhost:4300', 'client_id' => 'survey', 'login_required' => false, 'sign_in_available' => true, 'visitor_days' => 30], with_config_dir($dir, 'authPublicConfig'));
});

test('a settings file that does not say what it must is no setting', function (): void {
    $bad = [
        'no host' => [['host' => ''] + good_database(), good_iam(), '/database server/'],
        'a port that is no number' => [['port' => 'five'] + good_database(), good_iam(), '/port/'],
        'a port out of range' => [['port' => 70000] + good_database(), good_iam(), '/port/'],
        'an odd database name' => [['name' => 'survey test'] + good_database(), good_iam(), '/database name/'],
        'no user' => [['user' => ''] + good_database(), good_iam(), '/user/'],
        'no password key at all' => [array_diff_key(good_database(), ['password' => 1]), good_iam(), '/password/'],
        'no issuer' => [good_database(), ['issuer' => ''] + good_iam(), '/issuer/'],
        'an issuer that is no address' => [good_database(), ['issuer' => 'iam.anotoki.eu'] + good_iam(), '/issuer/'],
        // The anotoki library takes the IAM's keys over https alone (http on this computer): no other issuer is set up.
        'an issuer over plain http elsewhere' => [good_database(), ['issuer' => 'http://iam.anotoki.eu'] + good_iam(), '/https:\/\//'],
        'no client id' => [good_database(), ['client_id' => ''] + good_iam(), '/client id/'],
        'no cache folder' => [good_database(), ['cache_dir' => ''] + good_iam(), '/cache_dir/'],
        'a file that returns nothing' => [good_database(), null, '/issuer/'],
    ];
    foreach ($bad as $what => [$database, $iam, $pattern]) {
        $dir = test_temp_dir('bad-config');
        write_settings($dir, $database, $iam);
        $problem = with_config_dir($dir, 'settingsProblem');
        assert_true(is_string($problem), "$what is refused");
        assert_match($pattern, (string) $problem, $what);
    }
});

test('the tests\' settings folder is honoured only for a survey_test_ database', function (): void {
    $dir = test_temp_dir('real-name');
    write_settings($dir, ['name' => 'anotoki_survey'] + good_database(), good_iam());
    assert_match('/only for the tests/', (string) with_config_dir($dir, 'settingsProblem'));
});

test('setup.php writes a settings file only its owner can read, and it is read at once', function (): void {
    $dir = test_temp_dir('written');
    with_config_dir($dir, static function (): void {
        writeLocalConfig('database', good_database());
        writeLocalConfig('iam', good_iam());
        assert_same(null, settingsProblem());
    });
    assert_match('/Never commit it/', (string) file_get_contents("$dir/database.local.php"));
    if (PHP_OS_FAMILY !== 'Windows') {
        assert_same('600', decoct(fileperms("$dir/database.local.php") & 0777));
    }
});
