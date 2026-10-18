<?php

// The hosted site, as far as this computer can play it: tools/build.php
// makes the upload in a temp folder (with a stand-in for the Angular build),
// and PHP's built-in server serves that folder with no router - so setup.php
// runs as Apache would run it, and /api/... ends at api/index.php, the front
// controller. Asked by a name that is not this computer's, setup.php is the
// real host's: the token, the lock, and then it is gone. Asked from this
// computer by its own name, it is the development setup: no token, a nonce,
// and it stays.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const SITE_HOST = 'survey.example.test';

/** tools/build.php into a new temp folder: [exit code, output, the folder]. */
function build(?string $out = null): array
{
    $out ??= test_temp_dir('dist') . '/dist';
    exec(escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(TEST_BACKEND . '/tools/build.php') . ' --out=' . escapeshellarg($out)
        . ' --frontend=' . escapeshellarg(test_frontend_build()) . ' 2>&1', $lines, $code);

    return [$code, implode("\n", $lines), $out];
}

/** Every file under $dir, relative, forward slashes. */
function tree(string $dir): array
{
    $files = [];
    $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS));
    foreach ($iterator as $file) {
        $files[] = str_replace('\\', '/', substr($file->getPathname(), strlen($dir) + 1));
    }
    sort($files);

    return $files;
}

/** A request to the site by its own name - not this computer's. */
function site(array $site, string $method, string $url, mixed $body = null): array
{
    return call($site['base'], $method, $url, $body, ['Host: ' . SITE_HOST]);
}

function site_form(array $site, string $url, array $fields): array
{
    return call($site['base'], 'POST', $url, http_build_query($fields), ['Host: ' . SITE_HOST, 'Content-Type: application/x-www-form-urlencoded']);
}

/** The setup form as filled in for the database $name. */
function form(string $proof, string $name, array $extra = [], string $field = 'token'): array
{
    $server = machineDatabaseSettings();

    return $extra + [
        $field => $proof,
        'db_host' => (string) $server['host'], 'db_port' => (string) $server['port'], 'db_name' => $name,
        'db_user' => (string) $server['user'], 'db_password' => (string) $server['password'],
        'issuer' => 'https://iam.anotoki.eu', 'client_id' => 'survey',
    ];
}

test('the build: exactly what to upload - no settings, no tools, no composer files', function (): void {
    [$code, $out, $dist] = build();
    assert_same(0, $code, $out);
    $files = tree($dist);
    $top = array_values(array_unique(array_map(static fn(string $file): string => explode('/', $file)[0], $files)));
    sort($top);
    assert_same(['.htaccess', '.survey-build', 'api', 'config', 'index.html', 'main-TEST.js', 'media', 'migrations', 'setup.php', 'storage', 'styles-TEST.css', 'theme-boot.js', 'vendor'], $top);
    foreach (['api/index.php', 'api/.htaccess', 'api/bootstrap.php', 'api/translations.php', 'api/routes/admin.php', 'api/migrations.php',
        'api/auth.php', 'api/people.php', 'api/admin_tools.php',
        'config/config.php', 'config/.htaccess', 'migrations/survey/001_initial_schema.sql', 'migrations/.htaccess', 'vendor/autoload.php',
        'vendor/slim/slim/Slim/App.php', 'vendor/anotoki/lib/php/src/Migrations/Migrator.php', 'vendor/anotoki/lib/php/src/Migrations/Http/SiteGate.php',
        'migrations/survey/010_strings_through_the_library.sql', 'migrations/survey/011_people.sql', 'migrations/survey/012_sign_in_words.sql',
        'migrations/survey/013_legal_pages.sql', 'vendor/anotoki/lib/php/migrations/translations/005_legal_words.sql',
        'migrations/survey/014_feedback_words.sql', 'migrations/survey/015_whats_new_and_feedback.sql', 'api/routes/feedback.php',
        'vendor/anotoki/lib/php/src/Feedback/Feedback.php', 'vendor/anotoki/lib/php/migrations/admin/002_feedback.sql',
        'vendor/anotoki/lib/php/migrations/translations/010_backups_where_words.sql',
        'vendor/anotoki/lib/php/migrations/translations/011_privacy_words_made_true.sql',
        // The anotoki library's words: its code, its migration set and the words it ships - run and read on the host.
        'vendor/anotoki/lib/php/src/Translations/Translations.php', 'vendor/anotoki/lib/php/src/Translations/Http/TranslationsRoutes.php',
        'vendor/anotoki/lib/php/migrations/translations/001_languages_and_strings.sql', 'vendor/anotoki/lib/php/migrations/translations/002_library_words.sql',
        'vendor/anotoki/lib/php/migrations/translations/003_sign_in_words.sql',
        'vendor/anotoki/lib/php/resources/library-words.json',
        // Signing in, the people and the admin tools: the library's, run on the host - the IAM's SDK is no file of this site's any more.
        'vendor/anotoki/lib/php/src/Auth/AccessTokens.php', 'vendor/anotoki/lib/php/src/Auth/Http/Identify.php',
        'vendor/anotoki/lib/php/src/People/Scrubber.php', 'vendor/anotoki/lib/php/migrations/people/001_people.sql',
        'vendor/anotoki/lib/php/src/Backups/Backups.php', 'vendor/anotoki/lib/php/src/ErrorLog/ErrorLog.php', 'vendor/anotoki/lib/php/src/Audit/AuditLog.php',
        'vendor/anotoki/lib/php/migrations/admin/001_audit_log.sql',
        'vendor/.htaccess', 'storage/.htaccess', 'media/font-TEST.woff2'] as $file) {
        assert_true(in_array($file, $files, true), "$file is in the upload");
    }
    assert_false(in_array('api/anotoki_iam.php', $files, true), 'the IAM\'s PHP SDK is the library\'s now (Anotoki\Lib\Auth)');
    assert_false(in_array('tools/translation_keys.php', $files, true), 'the key scan stays on computers with a shell');
    foreach ($files as $file) {
        // ^translations\.php$ is the command line's, beside setup.php - anchored, because api/translations.php is the API's and must be there.
        assert_false((bool) preg_match('~\.local\.php$|^tests/|^tools/|router\.php|migration\.php|^translations\.php$|^secret\.php|^\.htaccess.+|^composer\.(json|lock)$|package\.json~', $file), "$file should not be uploaded");
    }
    assert_false(is_dir("$dist/tools"), 'tools/ - the build itself, the key scan - is for computers with a shell');
    foreach (['config', 'migrations', 'vendor', 'storage'] as $folder) {
        assert_match('/Require all denied/', (string) file_get_contents("$dist/$folder/.htaccess"), "$folder/ is closed to the web");
    }
    $htaccess = (string) file_get_contents("$dist/.htaccess");
    assert_match('~RewriteRule \^api\(/\|\$\) - \[L\]~', $htaccess, '/api/ goes through to api/.htaccess');
    assert_match('~RewriteRule \^\(config\|migrations\|vendor\|storage\)\(/\|\$\) - \[F,L\]~', $htaccess, 'the backend\'s folders are refused');
    assert_match('~RewriteRule \^ index\.html \[L\]~', $htaccess, 'the app\'s routes get the app');
    assert_match('~SetEnvIf Authorization "\(\.\+\)" HTTP_AUTHORIZATION=\$1~', $htaccess, 'the token reaches PHP under CGI too');
    assert_match("~img-src 'self' data: blob:~", $htaccess);
    assert_match("~Content-Security-Policy \"default-src 'self'; script-src 'self' https://umami\\.anotoki\\.eu;~", $htaccess, 'scripts from this origin and the family\'s visitor counter, nothing else');
    assert_true(str_contains($htaccess, '<FilesMatch "^(index\.html|theme-boot\.js|changelog\.json)$">') && str_contains($htaccess, 'Header set Cache-Control "no-cache"'), 'the shell - and the list of versions, whose newest is the version the pages show - is asked for again each time');
    // \R: the file has the line endings of the checkout that built it (CRLF on Windows), and Apache reads either.
    assert_match('~<FilesMatch "\^\\\\\.">\R    Require all denied~', $htaccess, 'dot-files - the build\'s marker too - are never served');

    // over a folder that is not a build, or inside the repository: refused
    $other = test_temp_dir('not-a-build');
    file_put_contents("$other/precious.txt", 'keep me');
    [$code] = build($other);
    assert_same(1, $code, 'a folder that is not an earlier build');
    assert_same('keep me', file_get_contents("$other/precious.txt"));
    [$code] = build(TEST_BACKEND . '/zz-build-test');
    assert_same(1, $code, 'never inside the repository\'s own folders');
    assert_false(file_exists(TEST_BACKEND . '/zz-build-test'));
});

test('the web root\'s .htaccess lets a visitor run two PHP files alone - the setup page and the host check, each while it is there - and refuses every other one; the host check is never part of a build', function (): void {
    [$code, $out, $dist] = build();
    assert_same(0, $code, $out);
    $htaccess = (string) file_get_contents("$dist/.htaccess");

    // Apache reads a <FilesMatch> as a PCRE against the file's name, the later section winning: every PHP file is
    // refused, then the ones a visitor may run are granted. Read here as Apache reads them.
    preg_match_all('~<FilesMatch "([^"]+)">\R\s*Require all (granted|denied)\R</FilesMatch>~', $htaccess, $sections, PREG_SET_ORDER);
    $rules = array_map(static fn(array $section): array => [$section[1], $section[2]], $sections);
    assert_same([['\.(php|phtml|phar)$', 'denied'], ['^(setup|host-check)\.php$', 'granted'], ['^\.', 'denied']], $rules, 'PHP refused, two files granted, dot-files refused - in that order');
    $runs = static function (string $name) use ($rules): bool {
        $allowed = true;
        foreach ($rules as [$pattern, $verdict]) {
            if (preg_match('~' . $pattern . '~', $name) === 1) {
                $allowed = $verdict === 'granted';
            }
        }

        return $allowed && preg_match('~\.(php|phtml|phar)$~', $name) === 1;
    };
    assert_true($runs('setup.php'), 'the setup page - which deletes itself once a real host is installed');
    assert_true($runs('host-check.php'), 'the host check: uploaded by hand, opened with the token written into it, and deleted again');
    foreach (['index.php', 'bootstrap.php', 'config.php', 'migration.php', 'translations.php', 'router.php', 'phpinfo.php', 'xsetup.php', 'setup.php.php',
        'host-checks.php', 'my-host-check.php', 'host-check.phtml', 'host-check.phar', '.host-check.php'] as $other) {
        assert_false($runs($other), "$other: never run for a visitor");
    }

    // Inert while it is not there: no file of that name in the build, and a path that is no file is the app's route.
    assert_false(file_exists("$dist/host-check.php"), 'the host check is never part of a build: it lives in tools/, which no build copies');
    assert_true(is_file(dirname(TEST_BACKEND) . '/tools/host-check.php'), 'it is the repository\'s tools/host-check.php');
    assert_match('~RewriteCond %\{REQUEST_FILENAME\} !-f\R\s*RewriteCond %\{REQUEST_FILENAME\} !-d\R\s*RewriteRule \^ index\.html \[L\]~', $htaccess, 'a path that is no file - the host check deleted - gets the app');
    assert_match('~define\(\'HOST_CHECK_TOKEN\', \'\'\);~', (string) file_get_contents(dirname(TEST_BACKEND) . '/tools/host-check.php'), 'and its token is empty in the repository: without one written into it, it answers 404 to everybody');
});

test('the setup page on a real host: the token, the tests, the database - and then it is gone', function (): void {
    [, , $dist] = build();
    $database = test_empty_db('site');
    $site = test_start_server($dist, null, ['SURVEY_TEST_CONFIG' => null], '/index.html');

    $notYet = site($site, 'GET', '/api/auth/config');
    assert_same(503, $notYet['status'], 'not set up: the API says so');
    assert_same(['not_set_up', false, '/setup.php'], [$notYet['body']['code'], $notYet['body']['installed'], $notYet['body']['setup']], 'never installed: the way to the setup page');
    assert_false(isset($notYet['body']['detail']), 'and tells a stranger nothing more');
    assert_same(['state' => 'not_set_up', 'installed' => false], site($site, 'GET', '/api/site-status')['body']);

    $first = site($site, 'GET', '/setup.php');
    assert_match('/<h1>Install the survey site<\/h1>/', $first['raw']);
    assert_same('noindex, nofollow', $first['headers']['x-robots-tag'] ?? null);
    $token = (require "$dist/storage/setup-token.php")['token'];
    assert_match('/^[0-9a-f]{48}$/', $token);
    assert_false(str_contains($first['raw'], $token), 'the token is never shown');
    assert_match('/id="issuer" name="issuer" type="text" value=""/', $first['raw'], 'no development IAM offered to a live site');

    assert_same(403, site_form($site, '/setup.php?test=database', form('wrong', $database))['status']);
    $test = site_form($site, '/setup.php?test=database', form($token, $database));
    assert_same(true, $test['body']['ok'], (string) ($test['body']['message'] ?? ''));
    assert_match('/Enter the IAM|https:\/\//', (string) site_form($site, '/setup.php?test=iam', form($token, $database, ['issuer' => 'http://evil.example']))['body']['message']);

    assert_match('/That is not the token/', site_form($site, '/setup.php', form('wrong', $database))['raw']);
    assert_false(is_file("$dist/config/database.local.php"), 'nothing written yet');

    // The origin secret is uploaded by hand (config/config.php); the setup page neither writes nor reads it.
    $originSecret = 'origin-' . bin2hex(random_bytes(20));
    $cloudflare = "<?php return ['origin_secret' => '$originSecret'];\n";
    file_put_contents("$dist/config/cloudflare.local.php", $cloudflare);

    $done = site_form($site, '/setup.php', form($token, $database));
    assert_same($cloudflare, file_get_contents("$dist/config/cloudflare.local.php"), 'the origin secret, uploaded by hand: left as it was');
    assert_false(str_contains($done['raw'], $originSecret), 'and never shown');
    assert_match('/<h1>Installed<\/h1>/', $done['raw']);
    assert_match('/Made the tables \(anotoki_admin\/001_audit_log\.sql, anotoki_admin\/002_feedback\.sql, 001_initial_schema\.sql, 002_/', $done['raw'], 'the library\'s admin set first, by its set; the site\'s own by their names');
    assert_match('/anotoki_people\/001_people\.sql\)/', $done['raw'], 'the library\'s people last');
    assert_match('/The setup page has deleted itself/', $done['raw']);
    assert_same(['issuer' => 'https://iam.anotoki.eu', 'client_id' => 'survey', 'cache_dir' => 'storage/cache'], require "$dist/config/iam.local.php");
    assert_same($database, (require "$dist/config/database.local.php")['name']);
    assert_true(is_file("$dist/storage/installed.lock"));
    assert_false(is_file("$dist/setup.php"), 'the setup page deleted itself');
    assert_false(is_file("$dist/storage/setup-token.php"), 'and the token');

    // the site itself, through api/index.php - asking files, not the real IAM,
    // whether sign-in is required and whom it deleted (none there: the IAM out
    // of reach - required, nobody scrubbed)
    file_put_contents("$dist/config/iam.local.php", '<?php return ' . var_export(['application_file' => test_application_file(), 'anonymized_file' => test_anonymized_file()] + (require "$dist/config/iam.local.php"), true) . ";\n");
    assert_same(['issuer' => 'https://iam.anotoki.eu', 'client_id' => 'survey', 'login_required' => true, 'sign_in_available' => true, 'visitor_days' => 30], site($site, 'GET', '/api/auth/config')['body']);
    assert_same(401, site($site, 'GET', '/api/surveys')['status'], 'nothing of a survey without a sign-in');
    assert_same(401, site($site, 'GET', '/api/admin/surveys')['status']);
    assert_same(['ok' => true], site($site, 'GET', '/api/health')['body'], 'a stranger learns only that it is up');
    assert_same(['state' => 'ready', 'installed' => true], site($site, 'GET', '/api/site-status')['body']);

    // Its settings lost after the install (a file deleted on the host): not set up - and never the setup page
    // again, which has deleted itself; the site is "not available right now" until the file is back.
    rename("$dist/config/iam.local.php", "$dist/config/iam.local.php.away");
    $lost = site($site, 'GET', '/api/auth/config');
    assert_same([503, ['code' => 'not_set_up', 'installed' => true, 'message' => 'The site is not available right now. Try again in a few minutes.']], [$lost['status'], $lost['body']]);
    assert_same(['state' => 'not_set_up', 'installed' => true], site($site, 'GET', '/api/site-status')['body']);
    rename("$dist/config/iam.local.php.away", "$dist/config/iam.local.php");
    assert_same(200, site($site, 'GET', '/api/auth/config')['status'], 'back: the site runs');

    // uploaded again by mistake: refuses, and deletes itself again
    copy(TEST_BACKEND . '/setup.php', "$dist/setup.php");
    assert_match('/Already set up/', site($site, 'GET', '/setup.php')['raw']);
    assert_false(is_file("$dist/setup.php"));
    assert_same([], server_problems($site));
});

test('the setup page on this computer: no token but a nonce, the development values, and it stays', function (): void {
    $config = test_temp_dir('setup-config');
    $database = test_empty_db('local');
    $app = test_start_server(TEST_BACKEND, TEST_BACKEND . '/router.php', ['SURVEY_TEST_CONFIG' => $config, 'SURVEY_FRONTEND_DIST' => test_frontend_build()], '/api/health');
    $local = static fn(string $method, string $url, ?array $fields = null, array $headers = []): array => call(
        $app['base'], $method, $url, $fields === null ? null : http_build_query($fields),
        array_merge(['Host: localhost'], $fields === null ? [] : ['Content-Type: application/x-www-form-urlencoded'], $headers)
    );

    $first = $local('GET', '/setup.php');
    assert_match('/<h1>Set up the survey site<\/h1>/', $first['raw']);
    assert_no_match('/name="token"/', $first['raw'], 'no token to ask for');
    assert_true(preg_match('/name="nonce" value="([0-9a-f]{32})"/', $first['raw'], $m) === 1);
    $nonce = $m[1];
    assert_same($nonce, $first['cookies']['survey_setup_nonce'] ?? null);
    assert_match('/value="http:\/\/localhost:4300"/', $first['raw'], 'the development IAM');
    assert_match('/value="anotoki_survey"/', $first['raw']);
    assert_match('~<script src="setup\.php\?asset=js">~', $first['raw'], 'the buttons\' script is a file, not inline');

    $cookie = ['Cookie: survey_setup_nonce=' . $nonce];
    assert_match('/out of date/', $local('POST', '/setup.php', form($nonce, $database, [], 'nonce'))['raw'], 'without the cookie: refused');
    assert_match('/out of date/', $local('POST', '/setup.php', form($nonce, $database, [], 'nonce'), array_merge($cookie, ['Origin: https://evil.example']))['raw'], 'from another site: refused');
    $saved = $local('POST', '/setup.php', form($nonce, $database, ['issuer' => 'http://localhost:4300'], 'nonce'), $cookie);
    assert_match('/<h1>Saved<\/h1>/', $saved['raw']);
    assert_same('http://localhost:4300', (require "$config/iam.local.php")['issuer']);
    assert_true(is_file(TEST_BACKEND . '/setup.php'), 'the repository\'s own setup page is never deleted');

    $again = $local('GET', '/setup.php');
    assert_match('/This copy is set up/', $again['raw']);
    assert_match('/placeholder="saved - leave empty to keep it"/', $again['raw']);
    assert_false(str_contains($again['raw'], (string) machineDatabaseSettings()['password']) && machineDatabaseSettings()['password'] !== '', 'never the password');
});
