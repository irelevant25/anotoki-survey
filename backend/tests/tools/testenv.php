<?php

declare(strict_types=1);

/**
 * A throwaway copy of the site to try things on by hand or in a browser - its
 * own survey_test_ database and settings folder, never your data:
 *
 *   php tests/tools/testenv.php FOLDER [--db=survey_test_manual] [--issuer=URL] [--jwks=FILE]
 *
 * makes the database (a copy of survey_test_template; php tests/run.php keeps
 * that up to date) unless it exists, and writes FOLDER/database.local.php and
 * FOLDER/iam.local.php. Then serve it:
 *
 *   SURVEY_TEST_CONFIG=FOLDER php -S 127.0.0.1:8590 router.php
 *
 * and drop it afterwards: php tests/tools/testdb.php drop survey_test_manual.
 * The IAM is --issuer: the anotoki library's stand-in IAM,
 * vendor/anotoki/lib/php/testing/stand-in-iam.php (its header says how to run
 * it), never the real one; --jwks gives it a key set on disk instead of the
 * one it would download.
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}

// By hand rather than getopt(), which stops at the folder and reads no option after it.
$folder = '';
$options = [];
foreach (array_slice($argv, 1) as $argument) {
    if (preg_match('/^--(db|issuer|jwks)=(.*)$/', $argument, $m)) {
        $options[$m[1]] = $m[2];
    } elseif ($folder === '' && !str_starts_with($argument, '--')) {
        $folder = $argument;
    }
}
if ($folder === '') {
    fwrite(STDERR, "usage: php tests/tools/testenv.php FOLDER [--db=survey_test_manual] [--issuer=URL] [--jwks=FILE]\n");
    exit(1);
}

$database = (string) ($options['db'] ?? 'survey_test_manual');
if (!preg_match('/^survey_test_[a-z0-9_]+$/D', $database) || $database === 'survey_test_template') {
    fwrite(STDERR, "testenv: only a survey_test_ database, never the template: $database\n");
    exit(1);
}

putenv('SURVEY_TEST_CONFIG');
require __DIR__ . '/../../api/bootstrap.php';

$machine = SURVEY_BACKEND . '/config/database.local.php';
if (!is_file($machine)) {
    fwrite(STDERR, "testenv: there is no config/database.local.php yet - open /setup.php first.\n");
    exit(1);
}
$server = require $machine;

if (!dbExists($server, $database)) {
    dbServer($server)->exec('CREATE DATABASE "' . $database . '" ENCODING \'UTF8\' TEMPLATE "survey_test_template"');
    dbServer($server)->exec('COMMENT ON DATABASE "' . $database . "\" IS 'survey test " . time() . "'");
    echo "made $database\n";
}

if (!is_dir($folder) && !mkdir($folder, 0777, true)) {
    fwrite(STDERR, "testenv: cannot make $folder\n");
    exit(1);
}
$iam = [
    'issuer' => rtrim((string) ($options['issuer'] ?? 'http://127.0.0.1:8597'), '/'),
    'client_id' => 'survey',
    'cache_dir' => rtrim(str_replace('\\', '/', $folder), '/') . '/cache',
];
if (isset($options['jwks'])) {
    $iam['jwks_file'] = (string) $options['jwks'];
}
file_put_contents("$folder/database.local.php", '<?php return ' . var_export(['name' => $database] + $server, true) . ";\n");
file_put_contents("$folder/iam.local.php", '<?php return ' . var_export($iam, true) . ";\n");
echo "settings in $folder (IAM {$iam['issuer']}, database $database)\n";
