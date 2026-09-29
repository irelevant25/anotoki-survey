<?php

declare(strict_types=1);

/**
 * What every entry point loads first - the API's front controller
 * (api/index.php), setup.php, the command-line tools and the tests: the
 * settings, the error handling, and the site's functions. It serves nothing
 * itself.
 *
 * The same relative layout holds in the repository (backend/) and in the
 * upload tools/build.php makes: api/, config/, migrations/, storage/ and
 * vendor/ side by side.
 */

if (PHP_VERSION_ID < 80200) {
    $message = 'The survey site needs PHP 8.2 or newer; this is PHP ' . PHP_VERSION . '.';
    if (PHP_SAPI === 'cli') {
        fwrite(STDERR, $message . "\n");
    } else {
        http_response_code(500);
        header('Content-Type: text/plain; charset=utf-8');
        echo $message;
    }
    exit(1);
}

/** backend/ - or, on the live site, the web root the upload went into. */
define('SURVEY_BACKEND', dirname(__DIR__));

// Times the site writes are UTC ISO strings, the way the browser's
// toISOString() writes them.
date_default_timezone_set('UTC');

// A PHP message belongs in the log, never in an answer to the browser. The
// hosting runs with display_errors on, so this is not a formality.
ini_set('display_errors', PHP_SAPI === 'cli' ? 'stderr' : '0');
ini_set('log_errors', '1');

// A warning is a bug: fail loudly rather than carry on with a wrong value.
// Deprecations only go to the log - a newer PHP deprecating something a
// dependency calls must not stop anybody answering a survey.
set_error_handler(static function (int $level, string $message, string $file, int $line): bool {
    if (!(error_reporting() & $level)) {
        return false;
    }
    if ($level === E_DEPRECATED || $level === E_USER_DEPRECATED) {
        return false;
    }
    throw new ErrorException($message, 0, $level, $file, $line);
});

require_once SURVEY_BACKEND . '/vendor/autoload.php';
require_once SURVEY_BACKEND . '/config/config.php';
require_once __DIR__ . '/anotoki_iam.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/migration_runner.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/rich_text.php';
require_once __DIR__ . '/survey_rules.php';
require_once __DIR__ . '/surveys.php';
require_once __DIR__ . '/responses.php';
require_once __DIR__ . '/images.php';
