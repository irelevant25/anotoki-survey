<?php

declare(strict_types=1);

use Anotoki\Lib\Admin\Schema as AdminSchema;
use Anotoki\Lib\Auth\Http\AuthRoutes;
use Anotoki\Lib\Backups\Http\BackupsRoutes;
use Anotoki\Lib\ErrorLog\Http\ErrorLogRoutes;
use Anotoki\Lib\Migrations\Http\SiteState;
use Anotoki\Lib\Migrations\MigrationSet;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\People\Schema as PeopleSchema;
use Anotoki\Lib\Translations\Http\TranslationsRoutes;
use Anotoki\Lib\Translations\Schema as TranslationsSchema;

/**
 * The database's migrations, through the anotoki family's library: the
 * Composer package anotoki/lib (Anotoki\Lib\Migrations, in vendor/), one
 * engine and one behaviour while an update waits for every anotoki site.
 * README.md says how it is updated.
 *
 * The migrations are the schema: migrations/survey/NNN_name.sql, applied in
 * natural order, each file in a transaction of its own with its row in the
 * `migrations` table (id, filename, applied_at - the table as it always was;
 * the library reads it as it is) - and around them the library's own sets
 * (vendor/anotoki/lib/backend/migrations/), whose files are recorded as
 * `<set>/NNN_name.sql`: anotoki_admin first (the audit log's table), then the
 * site's, then anotoki_translations (the words' tables where they are
 * missing, the library's words under `anotoki.`) and anotoki_people (where
 * the scrub of the IAM's deleted accounts stands). Four things apply them,
 * each through surveyMigrator() and so under one PostgreSQL advisory lock:
 * setup.php's Save, `php migration.php`, an administrator's "Apply pending"
 * on the admin panel's Migrations page (POST /api/admin/migrations/apply) and
 * the tests' template (tests/tools/testdb.php). A second update at the same
 * time is told it is busy, and applies nothing. The run stops at the first
 * file that fails - every migration is written expecting the ones before it
 * to have run - and that file is rolled back whole. Nothing is ever
 * un-applied: a rollback that half works is worse than none. The Apply and
 * migration.php make a backup of the database first (the library's backups,
 * api/admin_tools.php); a backup that cannot be made stops the update before
 * anything runs. setup.php does not: it applies before its settings are
 * saved, and an installation has nothing to keep yet.
 */

/** The site's own set of migrations: its folder, and the name the Migrations page shows. */
function surveyMigrationSet(): MigrationSet
{
    return new MigrationSet('survey', SURVEY_BACKEND . '/migrations/survey');
}

/**
 * Every set the engine applies, in the order it runs them - the library's
 * README's order:
 *
 *   anotoki_admin          the admin tools' tables (the audit log; feedback, which this site
 *                          takes since 2026-10-18): first, as the library asks - nothing of the
 *                          site's builds on it, and it never meets a table of the site's
 *   survey                 the site's own
 *   anotoki_translations   the words: after the site's own, whose early migrations made the words'
 *                          tables themselves (002), and whose 010, 012 and 014 write the site's own
 *                          words under the library's keys before the library writes its own there
 *   anotoki_people         where the scrub of the IAM's deleted accounts stands: after the site's
 *                          011, which gives users the column the scrub writes
 *
 * A file of a library set never needs one of the site's, nor the other way round.
 *
 * @return list<MigrationSet>
 */
function surveyMigrationSets(): array
{
    return [AdminSchema::migrationSet(), surveyMigrationSet(), TranslationsSchema::migrationSet(), PeopleSchema::migrationSet()];
}

/**
 * The advisory lock every update takes. The site's own key from before the
 * library (any number would do; this one is the site's port), kept so that an
 * update from a version before the library and one from after it still take
 * turns while an upload is half done. A backup takes it too (the library's
 * backups: one backup or update at a time).
 */
const DATABASE_UPDATE_LOCK = 3_300_008_500;

/**
 * The engine on $pdo.
 *
 * An update (apply()) holds its lock on $pdo's session, so whatever applies
 * gives it a connection of its own (dbConnect()), never db(): PHP's built-in
 * server keeps db() open from one request to the next, and a lock left on it
 * by a request that died would outlive the request. Reading - status(),
 * applicable() - is fine on db().
 *
 * With $backupFirst a backup of the database as it is comes before anything
 * is applied (the library's beforeApplyHook(): once for each list of pending
 * files, its name the Apply's note; nothing applied when it cannot be made; a
 * database with nothing applied yet has nothing to keep). The Apply and
 * migration.php ask for it - they update the site's own database, with its
 * settings saved; setup.php (whose settings are not saved yet when it
 * applies) and the tests' template, a copy nobody keeps, do not.
 */
function surveyMigrator(PDO $pdo, bool $backupFirst = false): Migrator
{
    $options = ['lock' => DATABASE_UPDATE_LOCK];
    if ($backupFirst) {
        $options['beforeApply'] = surveyBackups()->beforeApplyHook();
    }

    return new Migrator($pdo, surveyMigrationSets(), $options);
}

/**
 * Where the site stands - for the SiteGate in front of every route
 * (api/index.php) and for GET /api/site-status - asked afresh on every
 * request:
 *
 *   not_set_up       config/database.local.php or iam.local.php missing or
 *                    incomplete (settingsProblem())
 *   update_pending   a migration file waits to be applied
 *   unavailable      the database cannot be reached
 *   ready            otherwise
 *
 * `installed` - storage/installed.lock, which setup.php writes when it
 * finishes on a real host - decides whether a site that is not set up offers
 * its setup page: only while it was never installed (on this computer the lock
 * is never written, so a developer always gets the link).
 *
 * A ready site its ADMIN closed for maintenance (the site settings' "Getting
 * in", api/site_settings.php - anotoki-lib 0.11.0) is still ready here - its
 * database is fine, and the scrub and the day's backup run on - but the status
 * path says `maintenance`, with the administrators' message, and the SiteGate
 * answers everybody but the site's ADMIN 503 maintenance.
 */
function surveySiteState(): SiteState
{
    return new SiteState(
        static fn(): ?string => settingsProblem(),
        static fn(): bool => is_file(storageDir() . '/installed.lock'),
        static fn(): Migrator => surveyMigrator(db()),
        settings: surveySiteSettings(),
    );
}

/**
 * What answers while an update waits, when every other path is 503
 * update_pending: the sign-in's settings (an administrator must be able to
 * sign in to apply it - the library's AuthRoutes::openPath()), a language's
 * strings (the pages are worded with them: the library's bundle route,
 * exactly /api/translations/{code} - TranslationsRoutes::openPath()), the
 * health check, the Migrations page's routes, and the two admin tools that
 * need no table - the error log (what went wrong is most worth seeing then)
 * and the backups (a backup just before the Apply is the point; a restore
 * stays closed) - an ADMIN's alone, judged from the token (routes/admin.php).
 * Never anything that reads or writes the site's own data: its tables may be
 * the ones the update brings. Each is exactly the routes there are - the
 * Migrations page's are the list, /file and /apply (MigrationsRoutes::admin),
 * the error log's and the backups' the library's own lists (openPaths()): a
 * route a later release of the library adds there is added here too, rather
 * than opening all under it. (The status path, /api/site-status, always
 * answers.) The same paths answer while the site is closed for maintenance,
 * beside the site settings' reserved ones (api/site_settings.php).
 *
 * @return list<string>
 */
function siteOpenWhileUpdating(): array
{
    return [AuthRoutes::openPath(), TranslationsRoutes::openPath(), '/api/health', '~^/api/admin/migrations(/file|/apply)?$~D', ...ErrorLogRoutes::openPaths(), ...BackupsRoutes::openPaths()];
}
