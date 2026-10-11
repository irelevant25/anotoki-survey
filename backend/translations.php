<?php

declare(strict_types=1);

/**
 * translations.php - the site's own strings from the command line. For a
 * computer with a shell and the whole repository; it is never uploaded (the
 * live site's strings are edited in the admin panel).
 *
 *   php translations.php --status            the keys the frontend uses against the database's;
 *                                            exit 1 when one is missing, has no English string, or is
 *                                            asked for in a way the scan does not let through
 *   php translations.php --export sk [file]  a language's own strings as flat JSON (to the screen without a file)
 *   php translations.php --import sk file    and back in: checked as a save in the admin panel is,
 *                                            all of it or none of it; an empty string is passed over
 *
 * The anotoki library's command (Anotoki\Lib\Translations\Cli\TranslationsCommand)
 * on this site's words (surveyTranslations(), api/translations.php) and its
 * frontend (surveyKeyScanner(), tools/translation_keys.php): the strings live
 * in the database so they can be reworded in the admin panel, which means
 * nothing stops a page asking for a key no migration wrote - it would show
 * the key itself. --status is the check for that, and the same scan runs in
 * the tests (tests/unit/translations.test.php holds the database to it). It
 * refuses while a migration waits: the strings of a database behind the code
 * are not the release's. An import is written by nobody, as a migration's
 * strings are.
 *
 * It works on the database in config/database.local.php, which setup.php writes.
 */

use Anotoki\Lib\Translations\Cli\TranslationsCommand;
use Anotoki\Lib\Translations\Translations;

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/api/bootstrap.php';
require_once __DIR__ . '/tools/translation_keys.php';

$problem = settingsProblem();
if ($problem !== null && !in_array($argv[1] ?? '', ['--help', '-h'], true)) {
    echo "\033[31mNot set up yet: $problem\033[0m\n";
    echo "  Run the backend (composer start) and open http://localhost:8500/setup.php.\n";
    exit(1);
}

$command = new TranslationsCommand(
    static fn(): Translations => surveyTranslations(),
    surveyKeyScanner(),
    // What waits: the site's own files by their names, the library's with their set.
    pending: static fn(): array => array_map(
        static fn(array $file): string => $file['set'] === surveyMigrationSet()->name ? $file['name'] : $file['set'] . '/' . $file['name'],
        surveyMigrator(db())->applicable()
    ),
    title: 'survey' . ($problem === null ? ' (' . dbName() . ')' : '') . ": the site's own strings",
);

exit($command->run($argv));
