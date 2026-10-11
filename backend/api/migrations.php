<?php

declare(strict_types=1);

use Anotoki\Lib\Migrations\Http\SiteState;
use Anotoki\Lib\Migrations\MigrationSet;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\Translations\Http\TranslationsRoutes;
use Anotoki\Lib\Translations\Schema;

/**
 * The database's migrations, through the anotoki family's library: the
 * Composer package anotoki/lib (Anotoki\Lib\Migrations, in vendor/), one
 * engine and one behaviour while an update waits for every anotoki site.
 * README.md says how it is updated.
 *
 * The migrations are the schema: migrations/survey/NNN_name.sql, applied in
 * natural order, each file in a transaction of its own with its row in the
 * `migrations` table (id, filename, applied_at - the table as it always was;
 * the library reads it as it is) - and after them the library's own set,
 * anotoki_translations (vendor/anotoki/lib/php/migrations/translations: the
 * words' tables where they are missing, the library's words under
 * `anotoki.`), whose files are recorded as `anotoki_translations/NNN_name.sql`.
 * Four things apply them, each through
 * surveyMigrator() and so under one PostgreSQL advisory lock: setup.php's
 * Save, `php migration.php`, an administrator's "Apply pending" on the admin
 * panel's Migrations page (POST /api/admin/migrations/apply) and the tests'
 * template (tests/tools/testdb.php). A second update at the same time is told
 * it is busy, and applies nothing. The run stops at the first file that fails
 * - every migration is written expecting the ones before it to have run -
 * and that file is rolled back whole. Nothing is ever un-applied: a rollback
 * that half works is worse than none.
 */

/** The site's own set of migrations: its folder, and the name the Migrations page shows. */
function surveyMigrationSet(): MigrationSet
{
    return new MigrationSet('survey', SURVEY_BACKEND . '/migrations/survey');
}

/**
 * Every set the engine applies, in the order it runs them: the site's own,
 * then the library's words (Schema::migrationSet(), anotoki_translations).
 * The library's comes after: the site's early migrations made the words'
 * tables themselves (002), and its 010 moves the site's own words under the
 * library's keys before the library writes its own there. A file of the
 * library's set never needs one of the site's, nor the other way round.
 *
 * @return list<MigrationSet>
 */
function surveyMigrationSets(): array
{
    return [surveyMigrationSet(), Schema::migrationSet()];
}

/**
 * The advisory lock every update takes. The site's own key from before the
 * library (any number would do; this one is the site's port), kept so that an
 * update from a version before the library and one from after it still take
 * turns while an upload is half done.
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
 */
function surveyMigrator(PDO $pdo): Migrator
{
    return new Migrator($pdo, surveyMigrationSets(), ['lock' => DATABASE_UPDATE_LOCK]);
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
 */
function surveySiteState(): SiteState
{
    return new SiteState(
        static fn(): ?string => settingsProblem(),
        static fn(): bool => is_file(storageDir() . '/installed.lock'),
        static fn(): Migrator => surveyMigrator(db()),
    );
}

/**
 * What answers while an update waits, when every other path is 503
 * update_pending: the sign-in's settings (an administrator must be able to
 * sign in to apply it), a language's strings (the pages are worded with them:
 * the library's bundle route, exactly /api/translations/{code} -
 * TranslationsRoutes::openPath()), the health check, and the Migrations
 * page's routes - an ADMIN's alone, judged from the token (routes/admin.php).
 * Never anything that reads or writes the site's own data: its tables may be
 * the ones the update brings. Each is exactly the routes there are - the
 * Migrations page's are the list, /file and /apply (MigrationsRoutes::admin):
 * a route a later release of the library adds there is added here too, rather
 * than opening all under it. (The status path, /api/site-status, always
 * answers.)
 *
 * @return list<string>
 */
function siteOpenWhileUpdating(): array
{
    return [
        '/api/auth/config',
        TranslationsRoutes::openPath(),
        '/api/health',
        '~^/api/admin/migrations(/file|/apply)?$~D',
    ];
}
