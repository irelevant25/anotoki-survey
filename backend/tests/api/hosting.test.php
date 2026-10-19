<?php

// The hosted site, as far as this computer can play it: anotoki-deploy (the
// anotoki library's deploy tool) builds the release into a temp folder that
// plays the site's folder on the host - frontend/ and backend/, with config/
// and storage/ to come beside them (with a stand-in for the Angular build) -
// and PHP's built-in server serves frontend/ as Apache would, through a router
// that plays frontend/.htaccess: a file of the app as it is, every other
// address to index.php, the front controller, which hands /api/... to the API
// and /setup.php to the setup page. Asked by a name that is not this
// computer's, setup.php is the real host's: the token, the lock, and then it is
// gone. Asked from this computer by its own name, it is the development setup:
// no token, a nonce, and it stays.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const SITE_HOST = 'survey.example.test';

/** anotoki-deploy: the site's dev dependency, or the library's checkout beside this repository. */
function deploy_tool(): string
{
    foreach ([dirname(TEST_BACKEND) . '/frontend/node_modules/@anotoki/deploy/cli.mjs', dirname(TEST_BACKEND, 2) . '/anotoki-lib/deploy/cli.mjs'] as $cli) {
        if (is_file($cli)) {
            return $cli;
        }
    }
    throw new RuntimeException('No anotoki-deploy: neither frontend/node_modules/@anotoki/deploy nor ../anotoki-lib/deploy.');
}

/** anotoki-deploy build into a new temp folder - the site's folder on the host: [exit code, output, the folder]. */
function build(?string $out = null): array
{
    $out ??= test_temp_dir('site') . '/site';
    exec('node ' . escapeshellarg(deploy_tool()) . ' build --root ' . escapeshellarg(dirname(TEST_BACKEND)) . ' --out ' . escapeshellarg($out)
        . ' --frontend ' . escapeshellarg(test_frontend_build()) . ' 2>&1', $lines, $code);

    return [$code, implode("\n", $lines), $out];
}

/** frontend/.htaccess as PHP's built-in server can play it: a file of the app as it is, every other address to index.php. */
function release_router(): string
{
    $router = test_temp_dir('router') . '/router.php';
    file_put_contents(
        $router,
        "<?php\n\$path = (string) parse_url((string) \$_SERVER['REQUEST_URI'], PHP_URL_PATH);\n" .
            "if (\$path !== '/' && is_file(\$_SERVER['DOCUMENT_ROOT'] . \$path)) {\n    return false;\n}\n" .
            "require \$_SERVER['DOCUMENT_ROOT'] . '/index.php';\n",
    );

    return $router;
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

test('the build: the release - the app in frontend/, the code in backend/, nothing of the host', function (): void {
    [$code, $out, $root] = build();
    assert_same(0, $code, $out);
    $files = tree($root);
    $top = array_values(array_unique(array_map(static fn(string $file): string => explode('/', $file)[0], $files)));
    sort($top);
    assert_same(['.anotoki-deploy', 'backend', 'frontend'], $top, 'a release: frontend/ and backend/ - config/ and storage/ are the host\'s, never in it');
    foreach (['frontend/index.html', 'frontend/index.php', 'frontend/.htaccess', 'frontend/main-TEST.js', 'frontend/styles-TEST.css', 'frontend/theme-boot.js', 'frontend/media/font-TEST.woff2'] as $file) {
        assert_true(in_array($file, $files, true), "$file is in the release");
    }
    foreach (['api/index.php', 'api/bootstrap.php', 'api/translations.php', 'api/routes/admin.php', 'api/migrations.php',
        'api/auth.php', 'api/people.php', 'api/admin_tools.php', 'setup.php', '.htaccess', 'release.json',
        'config/config.php', 'migrations/survey/001_initial_schema.sql', 'vendor/autoload.php',
        'vendor/slim/slim/Slim/App.php', 'vendor/anotoki/lib/backend/src/Migrations/Migrator.php', 'vendor/anotoki/lib/backend/src/Migrations/Http/SiteGate.php',
        'migrations/survey/010_strings_through_the_library.sql', 'migrations/survey/011_people.sql', 'migrations/survey/012_sign_in_words.sql',
        'migrations/survey/013_legal_pages.sql', 'vendor/anotoki/lib/backend/migrations/translations/005_legal_words.sql',
        'migrations/survey/014_feedback_words.sql', 'migrations/survey/015_whats_new_and_feedback.sql', 'api/routes/feedback.php',
        'vendor/anotoki/lib/backend/src/Feedback/Feedback.php', 'vendor/anotoki/lib/backend/migrations/admin/002_feedback.sql',
        'vendor/anotoki/lib/backend/migrations/translations/010_backups_where_words.sql',
        'vendor/anotoki/lib/backend/migrations/translations/011_privacy_words_made_true.sql',
        'vendor/anotoki/lib/backend/migrations/translations/012_footer_words.sql',
        'vendor/anotoki/lib/backend/migrations/translations/013_about_and_support_words.sql',
        // The anotoki library's words: its code, its migration set and the words it ships - run and read on the host.
        'vendor/anotoki/lib/backend/src/Translations/Translations.php', 'vendor/anotoki/lib/backend/src/Translations/Http/TranslationsRoutes.php',
        'vendor/anotoki/lib/backend/migrations/translations/001_languages_and_strings.sql', 'vendor/anotoki/lib/backend/migrations/translations/002_library_words.sql',
        'vendor/anotoki/lib/backend/migrations/translations/003_sign_in_words.sql',
        'vendor/anotoki/lib/backend/resources/library-words.json',
        // Signing in, the people and the admin tools: the library's, run on the host - the IAM's SDK is no file of this site's any more.
        'vendor/anotoki/lib/backend/src/Auth/AccessTokens.php', 'vendor/anotoki/lib/backend/src/Auth/Http/Identify.php',
        'vendor/anotoki/lib/backend/src/People/Scrubber.php', 'vendor/anotoki/lib/backend/migrations/people/001_people.sql',
        'vendor/anotoki/lib/backend/src/Backups/Backups.php', 'vendor/anotoki/lib/backend/src/ErrorLog/ErrorLog.php', 'vendor/anotoki/lib/backend/src/Audit/AuditLog.php',
        'vendor/anotoki/lib/backend/migrations/admin/001_audit_log.sql'] as $file) {
        assert_true(in_array("backend/$file", $files, true), "backend/$file is in the release");
    }
    assert_false(in_array('backend/api/anotoki_iam.php', $files, true), 'the IAM\'s PHP SDK is the library\'s now (Anotoki\Lib\Auth)');
    foreach ($files as $file) {
        // ^backend/translations\.php$ is the command line's, beside setup.php - anchored, because api/translations.php is the API's and must be there.
        assert_false((bool) preg_match('~\.local\.php$|^backend/(tests|tools|storage)/|router\.php|^backend/migration\.php$|^backend/translations\.php$|secret\.php|^backend/api/\.htaccess|^backend/composer\.(json|lock)$|package\.json~', $file), "$file should not be in the release");
    }
    assert_match('/Require all denied/', (string) file_get_contents("$root/backend/.htaccess"), 'backend/ is closed to the web');
    assert_same('survey', json_decode((string) file_get_contents("$root/backend/release.json"), true)['site'], 'release.json says whose release it is');

    $htaccess = (string) file_get_contents("$root/frontend/.htaccess");
    assert_true(str_contains($htaccess, 'RewriteRule ^(api)(/|$) index.php [L]'), '/api/ goes to the front controller');
    assert_true(str_contains($htaccess, 'RewriteRule ^setup\.php$ index.php [L]'), 'and the setup page');
    assert_true(str_contains($htaccess, "RewriteCond %{REQUEST_URI} !\\.[^/]*$\n    RewriteRule ^ index.html [L]"), 'the app\'s routes get the app; an old bundle stays a 404');
    assert_true(str_contains($htaccess, 'SetEnvIf Authorization "(.+)" HTTP_AUTHORIZATION=$1'), 'the token reaches PHP under CGI too');
    assert_true(str_contains($htaccess, "Content-Security-Policy \"default-src 'self'; script-src 'self' https://umami.anotoki.eu;"), 'scripts from this origin and the family\'s visitor counter, nothing else');
    assert_true(str_contains($htaccess, "img-src 'self' data: blob:"));
    assert_true(str_contains($htaccess, '<FilesMatch "^(index\.html|theme-boot\.js|changelog\.json)$">'), 'the shell - and the list of versions, whose newest is the version the pages show - is asked for again each time');
    assert_no_match('/^\s*(Options|DirectoryIndex|RewriteBase)/m', $htaccess, 'nothing the host has refused with a 500');

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

test('the release\'s .htaccess lets a visitor run the front controller, the setup page and the host check alone - and refuses every other PHP file; the host check is never part of a build', function (): void {
    [$code, $out, $root] = build();
    assert_same(0, $code, $out);
    $htaccess = (string) file_get_contents("$root/frontend/.htaccess");

    // Apache reads a <FilesMatch> as a PCRE against the file's name, the later section winning: every PHP file is
    // refused, then the ones a visitor may run are granted. Read here as Apache reads them.
    preg_match_all('~<FilesMatch "([^"]+)">\R\s*Require all (granted|denied)\R</FilesMatch>~', $htaccess, $sections, PREG_SET_ORDER);
    $rules = array_map(static fn(array $section): array => [$section[1], $section[2]], $sections);
    assert_same([['\.(php|phtml|phar)$', 'denied'], ['^(index|setup|host-check)\.php$', 'granted'], ['^\.', 'denied']], $rules, 'PHP refused, three files granted, dot-files refused - in that order');
    $runs = static function (string $name) use ($rules): bool {
        $allowed = true;
        foreach ($rules as [$pattern, $verdict]) {
            if (preg_match('~' . $pattern . '~', $name) === 1) {
                $allowed = $verdict === 'granted';
            }
        }

        return $allowed && preg_match('~\.(php|phtml|phar)$~', $name) === 1;
    };
    assert_true($runs('index.php'), 'the front controller: /api/... and /setup.php end there');
    assert_true($runs('setup.php'), 'the setup page\'s address - which the front controller answers while backend/setup.php is there');
    assert_true($runs('host-check.php'), 'the host check: uploaded by hand, opened with the token written into it, and deleted again');
    foreach (['bootstrap.php', 'config.php', 'migration.php', 'translations.php', 'router.php', 'phpinfo.php', 'xsetup.php', 'setup.php.php',
        'host-checks.php', 'my-host-check.php', 'host-check.phtml', 'host-check.phar', '.host-check.php'] as $other) {
        assert_false($runs($other), "$other: never run for a visitor");
    }

    // Inert while it is not there: no file of that name in the release, and a path that is no file is the app's route.
    assert_false(file_exists("$root/frontend/host-check.php"), 'the host check is never part of a build: it lives in tools/, which no build copies');
    assert_true(is_file(dirname(TEST_BACKEND) . '/tools/host-check.php'), 'it is the repository\'s tools/host-check.php');
    assert_match('~define\(\'HOST_CHECK_TOKEN\', \'\'\);~', (string) file_get_contents(dirname(TEST_BACKEND) . '/tools/host-check.php'), 'and its token is empty in the repository: without one written into it, it answers 404 to everybody');
});

test('the setup page on a real host: the token, the tests, the database - the settings beside the release - and then it is gone', function (): void {
    [, , $root] = build();
    $database = test_empty_db('site');
    $site = test_start_server("$root/frontend", release_router(), ['SURVEY_TEST_CONFIG' => null], '/index.html');

    $notYet = site($site, 'GET', '/api/auth/config');
    assert_same(503, $notYet['status'], 'not set up: the API says so');
    assert_same(['not_set_up', false, '/setup.php'], [$notYet['body']['code'], $notYet['body']['installed'], $notYet['body']['setup']], 'never installed: the way to the setup page');
    assert_false(isset($notYet['body']['detail']), 'and tells a stranger nothing more');
    assert_same(['state' => 'not_set_up', 'installed' => false], site($site, 'GET', '/api/site-status')['body']);

    $first = site($site, 'GET', '/setup.php');
    assert_match('/<h1>Install the survey site<\/h1>/', $first['raw']);
    assert_same('noindex, nofollow', $first['headers']['x-robots-tag'] ?? null);
    $token = (require "$root/storage/setup-token.php")['token'];
    assert_match('/^[0-9a-f]{48}$/', $token);
    assert_false(str_contains($first['raw'], $token), 'the token is never shown');
    assert_match('/id="issuer" name="issuer" type="text" value=""/', $first['raw'], 'no development IAM offered to a live site');
    assert_match('/Require all denied/', (string) file_get_contents("$root/storage/.htaccess"), 'storage/, made by the setup page beside the release, is closed to the web');

    assert_same(403, site_form($site, '/setup.php?test=database', form('wrong', $database))['status']);
    $test = site_form($site, '/setup.php?test=database', form($token, $database));
    assert_same(true, $test['body']['ok'], (string) ($test['body']['message'] ?? ''));
    assert_match('/Enter the IAM|https:\/\//', (string) site_form($site, '/setup.php?test=iam', form($token, $database, ['issuer' => 'http://evil.example']))['body']['message']);

    assert_match('/That is not the token/', site_form($site, '/setup.php', form('wrong', $database))['raw']);
    assert_false(is_file("$root/config/database.local.php"), 'nothing written yet');

    // The origin secret is uploaded by hand (config/config.php); the setup page neither writes nor reads it.
    $originSecret = 'origin-' . bin2hex(random_bytes(20));
    $cloudflare = "<?php return ['origin_secret' => '$originSecret'];\n";
    @mkdir("$root/config", 0700, true);
    file_put_contents("$root/config/cloudflare.local.php", $cloudflare);

    $done = site_form($site, '/setup.php', form($token, $database));
    assert_same($cloudflare, file_get_contents("$root/config/cloudflare.local.php"), 'the origin secret, uploaded by hand: left as it was');
    assert_false(str_contains($done['raw'], $originSecret), 'and never shown');
    assert_match('/<h1>Installed<\/h1>/', $done['raw']);
    assert_match('/Made the tables \(anotoki_admin\/001_audit_log\.sql, anotoki_admin\/002_feedback\.sql, 001_initial_schema\.sql, 002_/', $done['raw'], 'the library\'s admin set first, by its set; the site\'s own by their names');
    assert_match('/anotoki_people\/001_people\.sql\)/', $done['raw'], 'the library\'s people last');
    assert_match('/The setup page has deleted itself/', $done['raw']);
    assert_same(['issuer' => 'https://iam.anotoki.eu', 'client_id' => 'survey', 'cache_dir' => 'storage/cache'], require "$root/config/iam.local.php");
    assert_same($database, (require "$root/config/database.local.php")['name']);
    assert_true(is_file("$root/storage/installed.lock"));
    assert_true(is_dir("$root/storage/cache"), 'the IAM\'s cache: storage/cache beside the release, as the setting says');
    assert_false(is_dir("$root/backend/storage"), 'and nothing of the state inside the release');
    assert_false(is_file("$root/backend/setup.php"), 'the setup page deleted itself');
    assert_false(is_file("$root/storage/setup-token.php"), 'and the token');

    // the site itself, through the front controller - asking files, not the real IAM,
    // whether sign-in is required and whom it deleted (none there: the IAM out
    // of reach - required, nobody scrubbed)
    file_put_contents("$root/config/iam.local.php", '<?php return ' . var_export(['application_file' => test_application_file(), 'anonymized_file' => test_anonymized_file()] + (require "$root/config/iam.local.php"), true) . ";\n");
    assert_same(['issuer' => 'https://iam.anotoki.eu', 'client_id' => 'survey', 'login_required' => true, 'sign_in_available' => true, 'visitor_days' => 30], site($site, 'GET', '/api/auth/config')['body']);
    assert_same(401, site($site, 'GET', '/api/surveys')['status'], 'nothing of a survey without a sign-in');
    assert_same(401, site($site, 'GET', '/api/admin/surveys')['status']);
    assert_same(['ok' => true], site($site, 'GET', '/api/health')['body'], 'a stranger learns only that it is up');
    assert_same(['state' => 'ready', 'installed' => true], site($site, 'GET', '/api/site-status')['body']);

    // Its settings lost after the install (a file deleted on the host): not set up - and never the setup page
    // again, which has deleted itself; the site is "not available right now" until the file is back.
    rename("$root/config/iam.local.php", "$root/config/iam.local.php.away");
    $lost = site($site, 'GET', '/api/auth/config');
    assert_same([503, ['code' => 'not_set_up', 'installed' => true, 'message' => 'The site is not available right now. Try again in a few minutes.']], [$lost['status'], $lost['body']]);
    assert_same(['state' => 'not_set_up', 'installed' => true], site($site, 'GET', '/api/site-status')['body']);
    rename("$root/config/iam.local.php.away", "$root/config/iam.local.php");
    assert_same(200, site($site, 'GET', '/api/auth/config')['status'], 'back: the site runs');

    // the next release brings the setup page again: refuses, and deletes itself again
    copy(TEST_BACKEND . '/setup.php', "$root/backend/setup.php");
    assert_match('/Already set up/', site($site, 'GET', '/setup.php')['raw']);
    assert_false(is_file("$root/backend/setup.php"));
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
