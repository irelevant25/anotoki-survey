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
 * A third file is optional, and nothing writes it - put it there by hand:
 *
 *   visitors.local.php   the limits on visitors (people taking surveys without
 *                        signing in, while the IAM says sign-in is not required)
 *                        and which proxies to believe about a visitor's address
 *
 *       return ['trusted_proxies' => ['173.245.48.0/20', ...], 'new_per_hour_per_address' => 60];
 *
 *   Every key is optional (VISITOR_DEFAULTS has them all); a value that is not
 *   usable is left out and logged, and a file that cannot be read (a parse
 *   error, no array returned) is logged and the defaults hold - never fatal.
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
    $visitors = visitorSettingsChecked(visitorSettingsFile());
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

    return $settings = ['database' => $database, 'iam' => $iam, 'visitors' => $visitors, 'problem' => $problem];
}

/**
 * What visitors.local.php may set, and what holds without it:
 *
 *   new_per_hour_per_address   new visitors an hour from one address (an IPv6 address counts by its /64):
 *                              a school class behind one address must fit
 *   new_per_hour               new visitors an hour in all
 *   max_active                 visitors with a key at once - past any of the three, a new visitor is
 *                              refused (429 too_many_visitors); the ones there are carry on
 *   keep_days                  a visitor unseen this long ends: its key opens nothing, its answers stay
 *   sweep_batch                visitors ended (or deleted) by one clean-up, after somebody's answer
 *   sweep_timeout_ms           how long one statement of the clean-up may take or wait
 *   move_lock_timeout_ms       how long the move at sign-in waits for the rows it takes
 *   trusted_proxies            addresses or CIDR ranges of the proxies in front of the site: only a
 *                              request from one of them is believed about the visitor's address
 *   client_ip_header           the header those proxies put the visitor's address in
 */
const VISITOR_DEFAULTS = [
    'new_per_hour_per_address' => 30,
    'new_per_hour' => 600,
    'max_active' => 20000,
    'keep_days' => 30,
    'sweep_batch' => 50,
    'sweep_timeout_ms' => 2000,
    'move_lock_timeout_ms' => 5000,
    'trusted_proxies' => [],
    'client_ip_header' => 'CF-Connecting-IP',
];

/** The smallest and largest number each numeric setting may be. */
const VISITOR_SETTING_RANGES = [
    'new_per_hour_per_address' => [1, 1000000],
    'new_per_hour' => [1, 10000000],
    'max_active' => [1, 100000000],
    'keep_days' => [1, 3650],
    'sweep_batch' => [1, 10000],
    'sweep_timeout_ms' => [100, 60000],
    'move_lock_timeout_ms' => [100, 60000],
];

/** The visitor settings in use: visitors.local.php's usable values over VISITOR_DEFAULTS. */
function visitorSettings(): array
{
    return localSettings()['visitors'];
}

/**
 * What visitors.local.php returns - null without one. Unlike the other two,
 * setup.php never writes this file: it is written by hand, so a typo in it
 * (a parse error, a missing `return`) is logged and the defaults hold, never
 * a failure of every request.
 */
function visitorSettingsFile(): ?array
{
    $file = localConfigFile('visitors');
    if (!is_file($file)) {
        return null;
    }

    try {
        $values = require $file;
    } catch (Throwable $e) {
        error_log('[visitors] config/visitors.local.php could not be read (' . get_class($e) . ': '
            . $e->getMessage() . ' on line ' . $e->getLine() . '): the defaults hold.');

        return null;
    }
    if (!is_array($values)) {
        error_log('[visitors] config/visitors.local.php could not be read (it returns no array): the defaults hold.');

        return null;
    }

    return $values;
}

/**
 * $values (what visitors.local.php returned, null without one) over the
 * defaults: a value of the wrong type or out of range, and a key nobody
 * reads, are left out and logged - a typo there must not stop people
 * answering surveys.
 */
function visitorSettingsChecked(?array $values): array
{
    $settings = VISITOR_DEFAULTS;
    foreach ($values ?? [] as $key => $value) {
        $usable = match (true) {
            isset(VISITOR_SETTING_RANGES[$key]) => is_int($value) && $value >= VISITOR_SETTING_RANGES[$key][0] && $value <= VISITOR_SETTING_RANGES[$key][1],
            $key === 'trusted_proxies' => is_array($value) && array_is_list($value) && count($value) <= 1000 && array_filter($value, 'visitorSettingRangeOk') === $value,
            $key === 'client_ip_header' => is_string($value) && preg_match('/^[A-Za-z0-9-]{1,64}$/D', $value) === 1,
            default => null,
        };
        if ($usable === true) {
            $settings[$key] = $value;
        } else {
            error_log('[visitors] config/visitors.local.php: ' . ($usable === null ? "$key is no setting of visitors" : "$key is not usable, the default holds") . '.');
        }
    }

    return $settings;
}

/** An address, or one with a /prefix that fits it (198.51.100.0/24, 2001:db8::/32). */
function visitorSettingRangeOk(mixed $range): bool
{
    if (!is_string($range) || !preg_match('~^([0-9A-Fa-f:.]{2,45})(/(\d{1,3}))?$~D', $range, $m)) {
        return false;
    }
    $address = @inet_pton($m[1]);
    if ($address === false) {
        return false;
    }

    return !isset($m[3]) || (int) $m[3] <= strlen($address) * 8;
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
