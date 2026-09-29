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
    foreach (['api/index.php', 'api/.htaccess', 'api/bootstrap.php', 'api/anotoki_iam.php', 'api/routes/admin.php', 'api/meddleware/setup.php',
        'config/config.php', 'config/.htaccess', 'migrations/survey/001_initial_schema.sql', 'migrations/.htaccess', 'vendor/autoload.php',
        'vendor/slim/slim/Slim/App.php', 'vendor/.htaccess', 'storage/.htaccess', 'media/font-TEST.woff2'] as $file) {
        assert_true(in_array($file, $files, true), "$file is in the upload");
    }
    foreach ($files as $file) {
        assert_false((bool) preg_match('~\.local\.php$|^tests/|^tools/|router\.php|migration\.php|^secret\.php|^\.htaccess.+|^composer\.(json|lock)$|package\.json~', $file), "$file should not be uploaded");
    }
    assert_same(md5_file(TEST_BACKEND . '/api/anotoki_iam.php'), md5_file("$dist/api/anotoki_iam.php"), 'the IAM\'s verifier as it is');
    foreach (['config', 'migrations', 'vendor', 'storage'] as $folder) {
        assert_match('/Require all denied/', (string) file_get_contents("$dist/$folder/.htaccess"), "$folder/ is closed to the web");
    }
    $htaccess = (string) file_get_contents("$dist/.htaccess");
    assert_match('~RewriteRule \^api\(/\|\$\) - \[L\]~', $htaccess, '/api/ goes through to api/.htaccess');
    assert_match('~RewriteRule \^\(config\|migrations\|vendor\|storage\)\(/\|\$\) - \[F,L\]~', $htaccess, 'the backend\'s folders are refused');
    assert_match('~RewriteRule \^ index\.html \[L\]~', $htaccess, 'the app\'s routes get the app');
    assert_match('~SetEnvIf Authorization "\(\.\+\)" HTTP_AUTHORIZATION=\$1~', $htaccess, 'the token reaches PHP under CGI too');
    assert_match("~img-src 'self' data: blob:~", $htaccess);
    assert_true(str_contains($htaccess, '<FilesMatch "^(index\.html|theme-boot\.js)$">') && str_contains($htaccess, 'Header set Cache-Control "no-cache"'), 'the shell is asked for again each time');
    assert_true(str_contains($htaccess, "<FilesMatch \"^\\.\">\n    Require all denied"), 'dot-files - the build\'s marker too - are never served');

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

test('the setup page on a real host: the token, the tests, the database - and then it is gone', function (): void {
    [, , $dist] = build();
    $database = test_empty_db('site');
    $site = test_start_server($dist, null, ['SURVEY_TEST_CONFIG' => null], '/index.html');

    $notYet = site($site, 'GET', '/api/auth/config');
    assert_same(503, $notYet['status'], 'not set up: the API says so');
    assert_same(['not_set_up', '/setup.php'], [$notYet['body']['code'], $notYet['body']['setup']]);
    assert_false(isset($notYet['body']['detail']), 'and tells a stranger nothing more');

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

    $done = site_form($site, '/setup.php', form($token, $database));
    assert_match('/<h1>Installed<\/h1>/', $done['raw']);
    assert_match('/Made the tables \(001_initial_schema\.sql\)/', $done['raw']);
    assert_match('/The setup page has deleted itself/', $done['raw']);
    assert_same(['issuer' => 'https://iam.anotoki.eu', 'client_id' => 'survey', 'cache_dir' => 'storage/cache'], require "$dist/config/iam.local.php");
    assert_same($database, (require "$dist/config/database.local.php")['name']);
    assert_true(is_file("$dist/storage/installed.lock"));
    assert_false(is_file("$dist/setup.php"), 'the setup page deleted itself');
    assert_false(is_file("$dist/storage/setup-token.php"), 'and the token');

    // the site itself, through api/index.php
    assert_same(['issuer' => 'https://iam.anotoki.eu', 'clientId' => 'survey'], site($site, 'GET', '/api/auth/config')['body']);
    assert_same(['surveys' => []], site($site, 'GET', '/api/surveys')['body']);
    assert_same(401, site($site, 'GET', '/api/admin/surveys')['status']);
    assert_same(['ok' => true], site($site, 'GET', '/api/health')['body'], 'a stranger learns only that it is up');

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
