<?php

declare(strict_types=1);

/**
 * Bringing the database up to date - one update at a time, whoever starts it.
 *
 * Three things apply migrations: setup.php's Save, `php migration.php`, and an
 * administrator's "Apply pending" on the admin panel's Migrations page
 * (POST /api/admin/migrations/apply). Each takes the same PostgreSQL advisory
 * lock first (databaseUpdateLocked()), so two of them never apply the same
 * file at once: the second is told another update is running, and applies
 * nothing. The lock is the database's own, let go when the update ends - or
 * when its connection does, so a request that dies half way never leaves it
 * held.
 *
 * The engine itself (api/migration_runner.php) is the family's and is not
 * changed here: this only decides who may run it, and when.
 */

/** The advisory lock's key - the same number in every way of updating (any number would do; this is the site's port). */
const DATABASE_UPDATE_LOCK = 3_300_008_500;

/**
 * Runs $update holding the lock on $pdo's database and returns what it
 * returned - or null at once, running nothing, when another update holds it.
 *
 * $pdo must not be a pooled connection (PHP's built-in server keeps db() open
 * from one request to the next): a lock left on one by a request that died
 * would outlive it. Callers connect for the update (dbConnect()).
 */
function databaseUpdateLocked(PDO $pdo, callable $update): mixed
{
    $statement = $pdo->prepare('SELECT CASE WHEN pg_try_advisory_lock(?::bigint) THEN 1 ELSE 0 END');
    $statement->execute([DATABASE_UPDATE_LOCK]);
    if ((int) $statement->fetchColumn() !== 1) {
        return null;
    }

    try {
        return $update();
    } finally {
        $pdo->prepare('SELECT pg_advisory_unlock(?::bigint)')->execute([DATABASE_UPDATE_LOCK]);
    }
}

/**
 * What GET /api/admin/migrations answers - the IAM's shape: the migrations the
 * database has, in the order they ran, with when (ISO 8601, UTC); and the
 * files it still needs, in the order they will run. Nothing is written: it
 * works on a database behind the code, even one with no migrations table yet.
 *
 * @return array{applied: list<array{name: string, applied_at: ?string}>, pending: list<array{name: string}>}
 */
function databaseStatus(PDO $pdo): array
{
    $applied = [];
    if ((bool) $pdo->query("SELECT to_regclass('migrations') IS NOT NULL")->fetchColumn()) {
        // applied_at is a timestamp without a zone, written by connections that all run in UTC (dbConnect()).
        $rows = $pdo->query(
            "SELECT filename, to_char(applied_at, 'YYYY-MM-DD\"T\"HH24:MI:SS\"Z\"') AS applied_at FROM migrations ORDER BY id"
        )->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            $applied[] = ['name' => (string) $row['filename'], 'applied_at' => $row['applied_at'] === null ? null : (string) $row['applied_at']];
        }
    }

    return [
        'applied' => $applied,
        'pending' => array_map(static fn(string $name): array => ['name' => $name], pendingMigrationsReadOnly($pdo)),
    ];
}

/**
 * POST /api/admin/migrations/apply: every pending migration in order, each in
 * its own transaction, under the lock, on a connection of its own - stopping
 * at the first that fails, which is rolled back whole (every migration
 * assumes the ones before it ran). Null when another update is running.
 *
 * The file that failed is named, with the database's whole error - what
 * PostgreSQL said, the statement's number and its first lines - as the IAM's
 * page shows it: the route is an ADMIN's alone, and on a host with only FTP
 * the page is where it can be read (the owner's decision for every anotoki
 * site, on this computer and on a host alike). It goes to the server's log as
 * well.
 *
 * @return ?array{applied: string[], failed: ?string, error: ?string}
 */
function databaseApplyUpdate(): ?array
{
    $pdo = dbConnect(databaseSettings());

    return databaseUpdateLocked($pdo, static function () use ($pdo): array {
        $result = applyPendingMigrations($pdo);
        if ($result['failed'] !== null) {
            error_log('[db] the migration ' . $result['failed'] . ' failed: ' . $result['error']);
        }

        return $result;
    });
}
