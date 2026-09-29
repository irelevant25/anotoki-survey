<?php

declare(strict_types=1);

/**
 * config/config.php - where this installation's settings come from.
 *
 * Two files beside this one. setup.php writes both; git ignores both; and both
 * are required:
 *
 *   database.local.php   the PostgreSQL connection
 *
 *       return ['host' => '127.0.0.1', 'port' => 5432, 'name' => 'anotoki_survey',
 *               'user' => 'postgres', 'password' => '...'];
 *
 *   iam.local.php        the anotoki IAM, which signs everybody in
 *
 *       return [
 *           'issuer' => 'http://localhost:4300',  // https://iam.anotoki.eu on the live site
 *           'client_id' => 'survey',              // this site's name in the IAM
 *           'cache_dir' => 'storage/cache',       // the IAM's signing keys are cached here (relative to backend/)
 *       ];
 *
 * There is nothing to fall back on. Without both files, or with one that does
 * not say what it must, the API answers every request 503 {code: "not_set_up"}
 * pointing at /setup.php, and the frontend shows a "not set up yet" page. A
 * default in a committed file would be a way for the site to run somewhere
 * with settings nobody chose there - which is exactly what this is here to stop.
 *
 * The tests run against throwaway databases with settings of their own:
 * SURVEY_TEST_CONFIG names a folder holding the same two files, and it is only
 * honoured while the database named there is a survey_test_ one.
 */

/** What is wrong with the settings: a missing or unusable file. */
final class NotSetUp extends RuntimeException
{
}

/** The folder the *.local.php files are read from (and setup.php writes to). */
function configDir(): string
{
    $test = getenv('SURVEY_TEST_CONFIG');

    return is_string($test) && $test !== '' ? rtrim(str_replace('\\', '/', $test), '/') : __DIR__;
}

/** True while the tests' own settings are in use. */
function usingTestConfig(): bool
{
    return configDir() !== __DIR__;
}

function localConfigFile(string $name): string
{
    return configDir() . '/' . $name . '.local.php';
}

/**
 * Where PHP writes at run time: the setup token and lock, the IAM's key cache.
 * storage/ beside config/ - or, with the tests' settings, a folder inside theirs.
 */
function storageDir(): string
{
    return usingTestConfig() ? configDir() . '/storage' : dirname(__DIR__) . '/storage';
}

/**
 * The settings, read once per request - and again with $reload, after
 * setup.php has written them.
 *
 * @return array{database: ?array, iam: ?array, problem: ?string}
 */
function localSettings(bool $reload = false): array
{
    static $settings = null;

    if ($settings !== null && !$reload) {
        return $settings;
    }

    $read = static function (string $name): ?array {
        $file = localConfigFile($name);
        if (!is_file($file)) {
            return null;
        }
        $values = require $file;

        return is_array($values) ? $values : [];
    };

    $database = $read('database');
    $iam = $read('iam');
    $problem = null;

    if ($database === null) {
        $problem = 'config/database.local.php is missing.';
    } elseif ($iam === null) {
        $problem = 'config/iam.local.php is missing.';
    } else {
        $problem = databaseSettingsProblem($database) ?? iamSettingsProblem($iam);
    }

    if ($problem === null && usingTestConfig() && !str_starts_with((string) $database['name'], 'survey_test_')) {
        $problem = 'SURVEY_TEST_CONFIG is only for the tests\' survey_test_ databases.';
    }

    return $settings = ['database' => $database, 'iam' => $iam, 'problem' => $problem];
}

/** Null when the site is set up; otherwise a sentence saying what is missing. */
function settingsProblem(): ?string
{
    return localSettings()['problem'];
}

/** What a database.local.php must hold, or null when it holds it. */
function databaseSettingsProblem(array $values): ?string
{
    $host = $values['host'] ?? null;
    $port = $values['port'] ?? null;

    if (!is_string($host) || !preg_match('/^[A-Za-z0-9._:\[\]-]{1,100}$/D', $host)) {
        return 'config/database.local.php needs the database server (host).';
    }
    if (!(is_int($port) || (is_string($port) && ctype_digit($port))) || (int) $port < 1 || (int) $port > 65535) {
        return 'config/database.local.php needs the database port (usually 5432).';
    }
    if (!is_string($values['name'] ?? null) || !preg_match('/^[A-Za-z0-9_]{1,63}$/D', $values['name'])) {
        return 'config/database.local.php needs the database name (letters, digits and _).';
    }
    if (!is_string($values['user'] ?? null) || $values['user'] === '') {
        return 'config/database.local.php needs the database user.';
    }
    if (!array_key_exists('password', $values) || !is_string($values['password'])) {
        return 'config/database.local.php needs the database password (it may be empty, but it must be there).';
    }

    return null;
}

/** What an iam.local.php must hold, or null when it holds it. */
function iamSettingsProblem(array $values): ?string
{
    $issuer = $values['issuer'] ?? null;
    if (!is_string($issuer) || !preg_match('~^https?://[^/\s]+~i', $issuer)) {
        return 'config/iam.local.php needs the IAM\'s address (issuer).';
    }
    if (!is_string($values['client_id'] ?? null) || !preg_match('/^[A-Za-z0-9._-]{1,100}$/D', $values['client_id'])) {
        return 'config/iam.local.php needs this site\'s client id in the IAM.';
    }
    if (!is_string($values['cache_dir'] ?? null) || $values['cache_dir'] === '') {
        return 'config/iam.local.php needs cache_dir, where the IAM\'s keys are cached.';
    }

    return null;
}

/** The database settings; NotSetUp when there are none to use. */
function databaseSettings(): array
{
    $settings = localSettings();
    if ($settings['problem'] !== null) {
        throw new NotSetUp($settings['problem']);
    }

    return $settings['database'];
}

/** The IAM settings; NotSetUp when there are none to use. */
function iamSettings(): array
{
    $settings = localSettings();
    if ($settings['problem'] !== null) {
        throw new NotSetUp($settings['problem']);
    }

    return $settings['iam'];
}

/**
 * Writes one of the *.local.php files and reads the settings again.
 *
 * The database one holds a password, so the file is readable by its owner
 * only: on a shared host the other customers are the ones not to trust.
 */
function writeLocalConfig(string $name, array $values): void
{
    writePrivateFile(
        localConfigFile($name),
        "<?php\n\n// anotoki survey: this installation's {$name} settings, written by setup.php.\n"
        . "// Never commit it (git ignores it) - see config/config.php.\n\nreturn "
        . var_export($values, true) . ";\n"
    );
    localSettings(true);
}

/**
 * A file only its owner can read: umask sets the mode as the file is made,
 * chmod covers one that was there already. (Both do nothing on Windows, where
 * the folder's permissions apply.)
 */
function writePrivateFile(string $file, string $contents): void
{
    $umask = umask(0077);
    try {
        $written = @file_put_contents($file, $contents);
    } finally {
        umask($umask);
    }

    if ($written !== strlen($contents)) {
        throw new RuntimeException('Cannot write ' . basename(dirname($file)) . '/' . basename($file) . '.');
    }

    @chmod($file, 0600);

    // A PHP that caches compiled files would otherwise keep reading the old settings.
    if (function_exists('opcache_invalidate')) {
        @opcache_invalidate($file, true);
    }
}
