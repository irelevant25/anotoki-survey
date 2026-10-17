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
 * not say what it must - or that cannot be read cleanly (a slip in an editor:
 * PHP cannot parse, run or open it, or it prints anything as PHP reads it - a
 * byte-order mark or a line before its <?php, no <?php line at all, text after
 * a closing tag; what it prints, the password with it, is caught and never
 * sent: settingsFileReadCleanly()) - the API answers every request but
 * GET /api/site-status (which says so) 503 {code: "not_set_up"}, pointing at
 * /setup.php while the site was never installed, and the frontend shows a "not
 * set up yet" page. A default in a committed file would be a way for the site
 * to run somewhere with settings nobody chose there - which is exactly what
 * this is here to stop.
 *
 * A third file is optional, and nothing writes it - put it there by hand:
 *
 *   visitors.local.php   the limits on visitors (people taking surveys without
 *                        signing in, while the IAM says sign-in is not required)
 *                        and which proxies to believe about a visitor's address -
 *                        Cloudflare's published ranges without it
 *
 *       return ['new_per_hour_per_address' => 60];
 *       return ['trusted_proxies' => []];   // a host not behind Cloudflare: REMOTE_ADDR alone
 *
 *   Every key is optional (VISITOR_DEFAULTS has them all); a value that is not
 *   usable is left out, and a file that cannot be read cleanly (read the same
 *   careful way as the two above) or returns no array is passed over, the
 *   defaults holding - never fatal, never "not set up". Each fault is said in
 *   PHP's error log at most once a day (settingsSaid()), never the file's text.
 *
 * And a fourth, optional too, the same in every anotoki site - put there by
 * hand like the third; setup.php never writes or reads it:
 *
 *   cloudflare.local.php   the secret the owner's Cloudflare zone adds to every
 *                          request through it, in X-Anotoki-Origin (a Transform
 *                          Rule - the owner's decision of 2026-10-13)
 *
 *       return ['origin_secret' => '<a long random value, 32 characters or more>'];
 *
 *   With it, CF-Connecting-IP is believed only on a request that carries that
 *   secret (originSecret()); without it - or with a value that is not a string
 *   with something in it - from Cloudflare's ranges alone, as before. A file
 *   that is there but cannot be read cleanly fails closed: a secret no request
 *   carries, every request from Cloudflare's ranges its edge (originSecretFile()).
 *   The secret is never printed or logged.
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
 * @return array{database: ?array, iam: ?array, visitors: array, origin_secret: ?string, problem: ?string}
 */
function localSettings(bool $reload = false): array
{
    static $settings = null;

    if ($settings !== null && !$reload) {
        return $settings;
    }

    // A file that cannot be read cleanly is no setting - said, rather than a 500
    // on every path (the site's status too, which the pages read to know what to
    // say). It is read through settingsFileReadCleanly(): whatever it prints as
    // PHP reads it - all of it, the password too, from a file without its <?php
    // line - is caught and never sent; what PHP said is not repeated (a parse
    // error's message may quote the file, password and all), only its kind and
    // line, or how many bytes the file printed.
    $unreadable = null;
    $read = static function (string $name) use (&$unreadable): ?array {
        $file = localConfigFile($name);
        if (!is_file($file)) {
            return null;
        }
        $read = settingsFileReadCleanly($file);
        if ($read['problem'] !== null) {
            $unreadable ??= "config/$name.local.php {$read['problem']}.";
            settingsSaid('config', "config/$name.local.php {$read['problem']}: the site is not set up until it is mended.");

            return [];
        }

        return is_array($read['value']) ? $read['value'] : [];
    };

    $database = $read('database');
    $iam = $read('iam');
    $visitors = visitorSettingsChecked(visitorSettingsFile());
    $originSecret = originSecretFile();
    $problem = null;

    if ($database === null) {
        $problem = 'config/database.local.php is missing.';
    } elseif ($iam === null) {
        $problem = 'config/iam.local.php is missing.';
    } else {
        $problem = $unreadable ?? databaseSettingsProblem($database) ?? iamSettingsProblem($iam);
    }

    if ($problem === null && usingTestConfig() && !str_starts_with((string) $database['name'], 'survey_test_')) {
        $problem = 'SURVEY_TEST_CONFIG is only for the tests\' survey_test_ databases.';
    }

    return $settings = ['database' => $database, 'iam' => $iam, 'visitors' => $visitors, 'origin_secret' => $originSecret, 'problem' => $problem];
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
 *                              request from one of them is believed about the visitor's address.
 *                              Cloudflare's published ranges (the owner's rule of 2026-10-11: every
 *                              anotoki site is behind Cloudflare) - the anotoki library's list,
 *                              ClientAddress::CLOUDFLARE, which moves with the library; a list here
 *                              takes its place whole, [] believes nobody (REMOTE_ADDR alone). A
 *                              catch-all range - shorter than /8 for IPv4, /16 for IPv6 (0.0.0.0/0,
 *                              ::/0) - would believe anybody: the list is refused, logged, and the
 *                              default holds (visitorSettingRangeOk())
 *
 * Which header is believed is no setting: Cloudflare's CF-Connecting-IP,
 * pinned in code (api/client_address.php) - never one a local file could
 * point at X-Real-IP, True-Client-IP or X-Forwarded-For, which Cloudflare
 * passes through as the visitor sent them. The visitors' limits and the
 * library's own reading of an address (the error log's,
 * surveyAdminContext()) go by the same proxies and that one header.
 */
const VISITOR_DEFAULTS = [
    'new_per_hour_per_address' => 30,
    'new_per_hour' => 600,
    'max_active' => 20000,
    'keep_days' => 30,
    'sweep_batch' => 50,
    'sweep_timeout_ms' => 2000,
    'move_lock_timeout_ms' => 5000,
    'trusted_proxies' => \Anotoki\Lib\Support\ClientAddress::CLOUDFLARE,
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
 * setup.php never writes this file: it is written by hand, so a slip in it -
 * a parse error, a missing `return`, anything it prints as PHP reads it (a
 * byte-order mark, no <?php line, text after a closing tag) - means the
 * defaults, never a failure of every request. It is read through
 * settingsFileReadCleanly(), like every *.local.php: nothing it prints is
 * sent, and its fault is said at most once a day by its kind and line or its
 * bytes - never what PHP said, which may quote the file.
 */
function visitorSettingsFile(): ?array
{
    $file = localConfigFile('visitors');
    if (!is_file($file)) {
        return null;
    }

    $read = settingsFileReadCleanly($file);
    if ($read['problem'] !== null) {
        settingsSaid('visitors', "config/visitors.local.php {$read['problem']}: the defaults hold.");

        return null;
    }
    if (!is_array($read['value'])) {
        settingsSaid('visitors', 'config/visitors.local.php could not be read (it returns no array): the defaults hold.');

        return null;
    }

    return $read['value'];
}

/**
 * $values (what visitors.local.php returned, null without one) over the
 * defaults: a value of the wrong type or out of range, and a key nobody
 * reads, are left out and logged (at most once a day, by the key's name -
 * never a value) - a typo there must not stop people answering surveys.
 * (client_ip_header, which an earlier version read, is such a key now: the
 * header is pinned in code.)
 */
function visitorSettingsChecked(?array $values): array
{
    $settings = VISITOR_DEFAULTS;
    foreach ($values ?? [] as $key => $value) {
        $usable = match (true) {
            isset(VISITOR_SETTING_RANGES[$key]) => is_int($value) && $value >= VISITOR_SETTING_RANGES[$key][0] && $value <= VISITOR_SETTING_RANGES[$key][1],
            $key === 'trusted_proxies' => is_array($value) && array_is_list($value) && count($value) <= 1000 && array_filter($value, 'visitorSettingRangeOk') === $value,
            default => null,
        };
        if ($usable === true) {
            $settings[$key] = $value;
        } else {
            settingsSaid('visitors', 'config/visitors.local.php: ' . ($usable === null ? "$key is no setting of visitors" : "$key is not usable, the default holds") . '.');
        }
    }

    return $settings;
}

/**
 * An address, or one with a /prefix that fits it (198.51.100.0/24, 2001:db8::/32) - and no catch-all: a
 * prefix shorter than /8 for IPv4 or /16 for IPv6 (0.0.0.0/0, ::/0) would make a proxy of half the
 * Internet, and believe whatever header any of it sent.
 */
function visitorSettingRangeOk(mixed $range): bool
{
    if (!is_string($range) || !preg_match('~^([0-9A-Fa-f:.]{2,45})(/(\d{1,3}))?$~D', $range, $m)) {
        return false;
    }
    $address = @inet_pton($m[1]);
    if ($address === false) {
        return false;
    }
    $bits = strlen($address) * 8;
    $prefix = isset($m[3]) ? (int) $m[3] : $bits;

    return $prefix <= $bits && $prefix >= ($bits === 32 ? 8 : 16);
}

/**
 * The secret the owner's Cloudflare zone adds to every request through it
 * (X-Anotoki-Origin, the library's ClientAddress::ORIGIN_HEADER: a Transform
 * Rule - the owner's decision of 2026-10-13), from config/cloudflare.local.php;
 * null without one, and one no request carries for a file that cannot be read
 * cleanly (originSecretFile()). Cloudflare's published ranges are every Cloudflare
 * customer's, not the owner's zone alone: anybody's Worker can reach the host
 * from them and write the CF-Connecting-IP it likes, a new one for every
 * request. With the secret that header is believed only on a request that
 * carries it, and any other request from Cloudflare counts as the edge it came
 * from - coarser, never looser (api/client_address.php, and the library's own
 * reading of an address, surveyAdminContext()).
 */
function originSecret(): ?string
{
    return localSettings()['origin_secret'];
}

/**
 * What config/cloudflare.local.php says - the IAM's rule, case for case (its
 * iamOriginSecret(), ../anotoki-iam/backend/config/cloudflare.php; the owner's
 * decision of 2026-10-13, docs/decisions.md):
 *
 *   - no file: null, no secret - CF-Connecting-IP from Cloudflare's ranges
 *     alone, which is how the site worked before the file;
 *   - a file read cleanly whose origin_secret is a string with something in it:
 *     that string, trimmed (a header's value never starts or ends with a space);
 *   - a file read cleanly that names no secret - blank, missing, no string, no
 *     array returned: null, no secret, as the IAM reads it;
 *   - a file that is there but cannot be read cleanly - it prints anything (no
 *     <?php line, a byte-order mark or a line before it, text after its closing
 *     tag), PHP cannot parse or run it, or may not open it: a secret no request
 *     carries (originSecretNobodyCarries()), so every request from Cloudflare's
 *     ranges counts as the edge it came from until the file is mended. Its
 *     owner meant a secret, and believing CF-Connecting-IP from Cloudflare's
 *     ranges alone - from anybody's Worker there - would be the looser reading:
 *     a slip of the editor never switches the check off. The site keeps
 *     running all the same: the file is optional, never a reason to be "not
 *     set up".
 *
 * Each fault is said in PHP's error log at most once a day (settingsSaid()),
 * by the kind of error and its line, or the bytes the file printed - never its
 * text: a parse error's message can quote the file, and the secret is never
 * printed or logged.
 */
function originSecretFile(): ?string
{
    $file = localConfigFile('cloudflare');
    if (!is_file($file)) {
        return null;
    }

    $read = settingsFileReadCleanly($file);
    if ($read['problem'] !== null) {
        settingsSaid('cloudflare', "config/cloudflare.local.php {$read['problem']}: no request carries its secret, so every request from Cloudflare's ranges counts as the edge it came from until the file is mended.");

        return originSecretNobodyCarries();
    }

    $values = $read['value'];
    $secret = is_array($values) ? ($values['origin_secret'] ?? null) : null;
    if (!is_string($secret) || trim($secret) === '') {
        settingsSaid('cloudflare', 'config/cloudflare.local.php holds no origin_secret (a string with something in it): CF-Connecting-IP is believed from Cloudflare\'s ranges alone.');

        return null;
    }

    return trim($secret);
}

/**
 * A secret no request can carry: 256 random bits, made once a process and
 * never printed, logged or stored, so no X-Anotoki-Origin matches it - what a
 * cloudflare.local.php that cannot be read cleanly stands for.
 */
function originSecretNobodyCarries(): string
{
    static $secret = null;

    return $secret ??= bin2hex(random_bytes(32));
}

/**
 * Requires a *.local.php - every one is read this way: database, iam,
 * visitors, cloudflare - in a closure of its own, so it sees none of the
 * caller's variables, with whatever it prints caught. A file without its
 * <?php line, with a byte-order mark or a line before it, or with text after a
 * closing tag prints what is outside its PHP when PHP requires it (all of it,
 * the password or the secret too, where the line is missing) ahead of the
 * answer: caught here, it goes nowhere, and the file is read as no file - its
 * problem the number of bytes it printed. One PHP cannot parse or run (a
 * ParseError, an Error, a warning the site's handler throws), or may not open,
 * is no file either, said by the kind of error and its line alone. What each
 * caller makes of no file is its own: the database's or the IAM's leaves the
 * site not set up (localSettings()), the visitors' the defaults, the
 * cloudflare's a secret no request carries.
 *
 * @return array{value: mixed, problem: ?string}
 */
function settingsFileReadCleanly(string $file): array
{
    if (!is_readable($file)) {
        return ['value' => null, 'problem' => 'could not be read (PHP may not open it)'];
    }

    $level = ob_get_level();
    $value = null;
    $failure = null;
    $printed = 0;
    ob_start();
    try {
        $value = (static fn(string $path): mixed => require $path)($file);
    } catch (Throwable $e) {
        $failure = 'could not be read (' . get_class($e) . ' on line ' . $e->getLine() . ')';
    } finally {
        // Every buffer down to the caller's - one the file opened and left open included.
        while (ob_get_level() > $level) {
            $buffer = ob_get_clean();
            if ($buffer === false) {
                break;
            }
            $printed += strlen($buffer);
        }
    }

    if ($failure !== null) {
        return ['value' => null, 'problem' => $failure];
    }
    if ($printed > 0) {
        return ['value' => null, 'problem' => "prints {$printed} bytes of its own (no <?php line, a byte-order mark or a line before it, or text after its closing tag)"];
    }

    return ['value' => $value, 'problem' => null];
}

/**
 * A line in PHP's error log about a settings file written by hand: at most once
 * a day for each thing said - a stamp in storage/cache named by a hash of the
 * line - since the file is read on every request, and a fault left in it is the
 * same fault tomorrow. Where no stamp can be written, once a process.
 */
function settingsSaid(string $topic, string $what): void
{
    static $saidWithoutStamp = [];

    $stamp = storageDir() . '/cache/said-' . substr(hash('sha256', $topic . "\n" . $what), 0, 16) . '.logged';
    clearstatcache(true, $stamp);
    $last = @filemtime($stamp);
    if ($last !== false && time() - $last < 86400) {
        return;
    }
    if (!((is_dir(dirname($stamp)) || @mkdir(dirname($stamp), 0777, true)) && @touch($stamp))) {
        if (isset($saidWithoutStamp[$topic . "\n" . $what])) {
            return;
        }
        $saidWithoutStamp[$topic . "\n" . $what] = true;
    }

    error_log("[{$topic}] {$what}");
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

/**
 * What an iam.local.php must hold, or null when it holds it. The IAM's address
 * is https - http only on this computer (localhost, 127.0.0.1, [::1]), as in
 * development: the anotoki library takes no other (IamClient::secureAddress()),
 * for the keys every token is checked with come from there.
 */
function iamSettingsProblem(array $values): ?string
{
    $issuer = $values['issuer'] ?? null;
    if (!is_string($issuer) || !preg_match('~^https?://[^/\s]+~i', $issuer)) {
        return 'config/iam.local.php needs the IAM\'s address (issuer).';
    }
    if (!\Anotoki\Lib\Auth\IamClient::secureAddress(trim($issuer))) {
        return 'config/iam.local.php needs the IAM\'s address as https:// (http:// only on this computer, for development).';
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
