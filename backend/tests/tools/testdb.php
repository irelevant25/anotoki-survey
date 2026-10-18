<?php

declare(strict_types=1);

/**
 * The tests' throwaway databases (used by tests/run.php):
 *
 *   php tests/tools/testdb.php template           make or update survey_test_template: its tables
 *   php tests/tools/testdb.php template --fresh   drop the template and build it again from every migration
 *   php tests/tools/testdb.php create NAME        a new test database, copied from the template
 *   php tests/tools/testdb.php drop NAME          drop a test database
 *   php tests/tools/testdb.php sweep              drop test databases more than 6 hours old
 *                                                 (left behind by a run that was killed)
 *
 * The template only ever gets the migrations it has not seen - as every
 * database does, through the same engine (surveyMigrator(), api/migrations.php).
 * So a migration edited after the template applied it (one still being
 * written; never one that has been released) is not applied again: --fresh is
 * for exactly that. It is the only thing that drops the template, so not while
 * tests are running - they copy it. Two runs that start at the same moment
 * (the PHP tests and the browser check) take turns: the engine's lock.
 *
 * It only ever touches databases whose name starts with survey_test_, on the
 * server named in config/database.local.php.
 */

const TEMPLATE = 'survey_test_template';

$command = $argv[1] ?? '';
$name = $argv[2] ?? '';

// The site's functions, but never its settings: nothing here reads or writes
// the site's own database.
putenv('SURVEY_TEST_CONFIG');
require __DIR__ . '/../../api/bootstrap.php';

$file = SURVEY_BACKEND . '/config/database.local.php';
if (!is_file($file)) {
    fwrite(STDERR, "testdb: there is no config/database.local.php yet - open /setup.php first.\n");
    exit(1);
}
$server = require $file;

function testName(string $name): string
{
    if (!preg_match('/^survey_test_[a-z0-9_]+$/D', $name) || $name === TEMPLATE) {
        fwrite(STDERR, "testdb: not a test database name: $name\n");
        exit(1);
    }

    return $name;
}

switch ($command) {
    case 'template':
        if ($name !== '' && $name !== '--fresh') {
            fwrite(STDERR, "testdb: template takes --fresh and nothing else: $name\n");
            exit(1);
        }
        if ($name === '--fresh') {
            // The name is the constant above, never an argument: only ever the template.
            dbServer($server)->exec('DROP DATABASE IF EXISTS "' . TEMPLATE . '" WITH (FORCE)');
        }
        ensureDatabase($server, TEMPLATE);
        $migrator = surveyMigrator(dbConnect($server, TEMPLATE));
        // Another run updating the template at this moment: wait for it (half a minute at most), then look again.
        for ($tries = 1; ($result = $migrator->apply())['busy'] && $tries < 60; $tries++) {
            usleep(500000);
        }
        $migrator = null;
        if ($result['busy']) {
            fwrite(STDERR, 'testdb: another run kept updating ' . TEMPLATE . " for half a minute: try again.\n");
            exit(1);
        }
        if ($result['failed'] !== null) {
            fwrite(STDERR, "testdb: {$result['failed']['name']} failed: {$result['error']}\n");
            exit(1);
        }
        $applied = array_column($result['applied'], 'name');
        echo TEMPLATE . ': ' . ($applied ? ($name === '--fresh' ? 'built again (' : 'updated (') . implode(', ', $applied) . ')' : 'up to date') . "\n";
        break;

    case 'create':
        dbServer($server)->exec('CREATE DATABASE "' . testName($name) . '" ENCODING \'UTF8\' TEMPLATE "' . TEMPLATE . '"');
        dbServer($server)->exec('COMMENT ON DATABASE "' . $name . "\" IS 'survey test " . time() . "'");
        echo "$name\n";
        break;

    case 'drop':
        dbServer($server)->exec('DROP DATABASE IF EXISTS "' . testName($name) . '" WITH (FORCE)');
        break;

    case 'sweep':
        $rows = dbServer($server)->query("SELECT datname, shobj_description(oid, 'pg_database') AS note FROM pg_database WHERE datname LIKE 'survey\\_test\\_%'")->fetchAll();
        foreach ($rows as $row) {
            if ($row['datname'] !== TEMPLATE && preg_match('/^survey test (\d+)$/', (string) $row['note'], $m) && (int) $m[1] < time() - 6 * 3600) {
                dbServer($server)->exec('DROP DATABASE IF EXISTS "' . testName($row['datname']) . '" WITH (FORCE)');
                echo "dropped {$row['datname']}\n";
            }
        }
        break;

    default:
        fwrite(STDERR, "usage: php tests/tools/testdb.php template [--fresh] | create NAME | drop NAME | sweep\n");
        exit(1);
}
