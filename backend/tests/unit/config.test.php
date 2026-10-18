<?php

// config/config.php: the settings come from the two *.local.php files and
// nowhere else - without them the site is not set up, a committed file can
// never stand in for them, one that cannot be read cleanly is none (nothing of
// it printed, its fault said once a day, never its text), and the tests' own
// folder is only ever for a throwaway database.

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
    assert_same(
        ['issuer' => 'http://localhost:4300', 'client_id' => 'survey', 'login_required' => false, 'sign_in_available' => true, 'visitor_days' => 30],
        with_config_dir($dir, 'authPublicConfig'),
    );
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

test(
    'a database.local.php or iam.local.php that cannot be read cleanly - it does not start with <?php (no <?php line, a byte-order mark or a line before it - before declare(strict_types=1) too, which PHP cannot even compile), it prints (text after a closing tag), PHP cannot parse or run it - leaves the site not set up: nothing of it printed, the problem by its kind and line, its start or its bytes, said once a day - never the password, never what PHP said',
    function (): void {
        $password = 'sesame-' . bin2hex(random_bytes(12));
        // A value written bare is a constant PHP does not know, whose error quotes it; two strings side by side are a
        // parse error quoting the second.
        $bare = 'sesame_' . bin2hex(random_bytes(12));
        $values = [
            'database' => var_export(['password' => $password] + good_database(), true),
            'iam' => var_export(['client_id' => $password] + good_iam(), true),
        ];
        foreach ($values as $name => $mine) {
            foreach (
                [
                    // Required, these would print what comes before their <?php - all of it, the password too, where the
                    // line is missing - so none is compiled: a file that does not start with <?php is passed over unread.
                    'no <?php line' => ["return {$mine};\n", 'does not start with <?php'],
                    'a byte-order mark and no <?php line' => ["\xEF\xBB\xBFreturn {$mine};\n", 'does not start with <?php'],
                    'a byte-order mark' => ["\xEF\xBB\xBF<?php return {$mine};\n", 'does not start with <?php'],
                    'a line before its <?php' => ["\n<?php return {$mine};\n", 'does not start with <?php'],
                    // Compiled, either is a fatal error no try, no handler and no buffer catches ("strict_types declaration
                    // must be the very first statement"): this process would end here - and a request, a 500.
                    'a byte-order mark before <?php declare(strict_types=1)' => ["\xEF\xBB\xBF<?php declare(strict_types=1);\n\nreturn {$mine};\n", 'does not start with <?php'],
                    'a blank line before <?php declare(strict_types=1)' => ["\n<?php declare(strict_types=1);\n\nreturn {$mine};\n", 'does not start with <?php'],
                    // A file that does start with <?php and prints all the same: caught.
                    'text after a closing tag' => ["<?php \$kept = 1; ?>\n{$password}\n<?php return {$mine};\n", 'prints ' . (strlen($password) + 1) . ' bytes of its own'],
                    'a parse error' => ["<?php return ['password' => 'x' '{$password}'];\n", 'could not be read (ParseError on line 1)'],
                    'a bare word' => ["<?php return ['password' => {$bare}];\n", 'could not be read (Error on line 1)'],
                ]
                as $case => [$contents, $fault]
            ) {
                $what = "config/$name.local.php, $case";
                $dir = test_temp_dir('unreadable-config');
                write_settings($dir, good_database(), good_iam());
                file_put_contents("$dir/$name.local.php", $contents);
                [$log, [$problems, $printed, $buffers]] = logged_while(static function () use ($dir): array {
                    $level = ob_get_level();
                    ob_start();
                    try {
                        // Read three times: as the folder is taken, then twice more - and asked for the database's settings.
                        $problems = with_config_dir($dir, static function (): array {
                            $problems = [settingsProblem(), localSettings(true)['problem'], localSettings(true)['problem']];
                            try {
                                databaseSettings();
                                $problems[] = null;
                            } catch (NotSetUp $e) {
                                $problems[] = $e->getMessage();
                            }

                            return $problems;
                        });
                    } finally {
                        $printed = (string) ob_get_clean();
                    }

                    return [$problems, $printed, ob_get_level() - $level];
                });
                assert_same('', $printed, "$what: nothing of the file printed");
                assert_same(0, $buffers, "$what: no buffer of the file's left open");
                foreach ($problems as $problem) {
                    assert_true(
                        is_string($problem) && str_starts_with($problem, "config/$name.local.php $fault") && str_ends_with($problem, '.'),
                        "$what: not set up, said by its kind and line, its start or its bytes - " . test_show($problem),
                    );
                    assert_false(str_contains((string) $problem, 'sesame') || str_contains((string) $problem, 'unexpected'), "$what: never the file's text, nor what PHP said");
                }
                assert_same(1, lines_saying($log, "[config] config/$name.local.php $fault"), "$what: said once, read three times - " . $log);
                assert_true(str_contains($log, 'the site is not set up until it is mended.'), "$what: and what it means - " . $log);
                assert_false(
                    str_contains($log, 'sesame') || str_contains($log, 'unexpected') || str_contains($log, 'strict_types'),
                    "$what: the log never holds the password, nor what PHP said - " . $log,
                );

                // Mended - written again as setup.php writes it - and the next reading is set up.
                write_settings($dir, good_database(), good_iam());
                assert_same(null, with_config_dir($dir, 'settingsProblem'), "$what: mended, set up again");
            }
        }
    },
);

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
