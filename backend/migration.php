<?php

declare(strict_types=1);

/**
 * migration.php - brings the database up to date from the migrations, and
 * nothing else. For a computer with a shell; the live site has none, and an
 * administrator's "Apply pending" on the admin panel's Migrations page (or
 * setup.php) does the same there. All three take one lock
 * (api/migrations.php): a second update at the same time applies nothing.
 *
 *   php migration.php              create the database if missing, apply what is pending
 *   php migration.php --status     say what has run and what has not
 *   php migration.php --dry-run    say what would be applied, and apply nothing
 *
 * The migrations are the schema (migrations/survey/NNN_name.sql): a database
 * is what you get by applying 001 and everything after it in order. A file
 * recorded as applied is never run again, so editing one that has been
 * applied changes nothing where it ran - write another instead.
 *
 * The connection is config/database.local.php, which setup.php writes. The
 * engine is the anotoki family's (anotoki/lib, through api/migrations.php).
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

require_once __DIR__ . '/api/bootstrap.php';

function colour(string $colour, string $text): string
{
    $codes = ['red' => 31, 'green' => 32, 'yellow' => 33, 'cyan' => 36];

    return "\033[" . ($codes[$colour] ?? 0) . 'm' . $text . "\033[0m";
}

function say(string $colour, string $text): void
{
    echo colour($colour, $text) . "\n";
}

$options = getopt('', ['status', 'dry-run', 'help']);

if (isset($options['help'])) {
    echo file_get_contents(__FILE__, false, null, 0, 1000);
    exit(0);
}

$problem = settingsProblem();
if ($problem !== null) {
    say('red', 'Not set up yet: ' . $problem);
    echo "  Run the backend (composer start) and open http://localhost:8500/setup.php.\n";
    exit(1);
}

$statusOnly = isset($options['status']);
$dryRun = isset($options['dry-run']);
$settings = databaseSettings();
$name = (string) $settings['name'];

say('cyan', "\n== survey ({$name})");

try {
    if (!$statusOnly && !$dryRun && ensureDatabase($settings, $name)) {
        say('green', '  Database created.');
    }
    // A connection of its own: the update below holds its lock on it.
    $migrator = surveyMigrator(dbConnect($settings));
    $status = $migrator->status();
} catch (Throwable $e) {
    say('red', '  Cannot reach it: ' . $e->getMessage());
    exit(1);
}

$files = $migrator->files(surveyMigrationSet());
$pending = array_column($status['pending'], 'name');

if ($statusOnly) {
    foreach ($files as $file) {
        $done = !in_array($file, $pending, true);
        echo '  ' . ($done ? colour('green', 'v') : colour('yellow', '.')) . ' ' . $file . ($done ? '' : colour('yellow', '   pending')) . "\n";
    }
    foreach ($status['missing'] as $missing) {
        echo '  ' . colour('red', '?') . ' ' . $missing['name'] . colour('red', '   recorded as applied, but the file is not here') . "\n";
    }
    printf("  %d applied, %d pending\n", count($files) - count($pending), count($pending));
    exit(0);
}

if (!$pending) {
    say('green', '  Up to date - ' . count($files) . ' migration' . (count($files) === 1 ? '' : 's') . '.');
    exit(0);
}

if ($dryRun) {
    foreach ($migrator->applicable() as $file) {
        say('yellow', '  would apply ' . $file['name']);
    }
    exit(0);
}

// The lock setup.php and an administrator's Apply on the Migrations page take
// too: one update at a time. What is pending is read again under it - another
// update may have applied some of it meanwhile.
$result = $migrator->apply();

if ($result['busy']) {
    say('red', '  Another database update is running (setup.php, or an administrator\'s Apply on the Migrations page). Nothing was applied: try again in a moment.');
    exit(1);
}

foreach ($result['applied'] as $file) {
    echo '  ' . $file['name'] . ' ... ' . colour('green', 'done') . "\n";
}

if ($result['failed'] !== null) {
    echo '  ' . $result['failed']['name'] . ' ... ' . colour('red', 'FAILED') . "\n";
    say('red', '    ' . str_replace("\n", "\n    ", (string) $result['error']));
    say('yellow', '    Nothing from this file was applied. The migrations before it stand.');
    exit(1);
}

exit(0);
