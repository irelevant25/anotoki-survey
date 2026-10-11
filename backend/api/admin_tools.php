<?php

declare(strict_types=1);

use Anotoki\Lib\Admin\AdminContext;
use Anotoki\Lib\Audit\AuditLog;
use Anotoki\Lib\Auth\Http\Identify;
use Anotoki\Lib\Backups\Backups;
use Anotoki\Lib\Backups\Copy;
use Anotoki\Lib\ErrorLog\ErrorLog;
use Anotoki\Lib\People\Http\PeopleUpkeep;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

/**
 * The admin tools this site takes from the anotoki family's library
 * (anotoki-lib 0.4.1): the error log, the audit log and the backups - for the
 * site's ADMIN alone (the owner's decision: EDITORs see none of them), each an
 * admin page of the library's (routes/admin.php, the frontend's admin.routes.ts).
 * No feedback (the owner's decision for this site) and no file explorer (the
 * pictures live in the database, and are in every backup).
 *
 *   the error log   storage/logs/errors-YYYY-MM-DD.jsonl (UTC days, 30 kept, 64 MB in all): what
 *                   failed - an exception answered 5xx, an answer of 404, 405, 413, 415, 429 or 5xx,
 *                   PHP's own warnings and fatal errors - redacted, with an HMAC of the address bucket
 *                   instead of the address, never a body, a header, a cookie, a query string or a
 *                   token. Files: it works while the database is out of reach or an update waits.
 *   the audit log   the library's table anotoki_audit_log (its set anotoki_admin): who did what in the
 *                   admin panel - a survey made, opened, closed, deleted; answers deleted; the site's
 *                   words saved, imported; a language added, changed, deleted; a person's answers
 *                   deleted, the scrub run; backups made, downloaded, deleted, restored; the error log
 *                   cleared; migrations applied. By the token's sub, never an address.
 *   the backups     storage/backups/<id>.anotoki-backup: every table by COPY through PDO in one
 *                   snapshot (the pictures' bytes too), with the migrations it was made at - daily
 *                   after an answer (14 kept), before every update (5), before a restore (5), and by
 *                   hand (until deleted). Made, downloaded, deleted and restored only after a sign-in
 *                   of the last ten minutes (the token's auth_time); downloaded by a single-use link.
 *                   Not encrypted - the owner's decision of 2026-10-11: only the IAM's backups are.
 *
 * Who acts is the token's person, never a body; whether they are the site's
 * ADMIN, the token's roles (Identify, api/auth.php) - so the error log's and
 * the backups' routes work while an update waits, as the Migrations page's do.
 * The files live under storage/, which the web never reaches (its .htaccess,
 * and each folder's own, GuardedDirectory).
 */

/**
 * What the library's admin tools ask of this site, once: who acts (the
 * token's sub), whether they are the site's ADMIN (the token's roles), the
 * proof a backup asks for (a sign-in of the last ten minutes, from the
 * token's auth_time: 403 reauth_required - the page offers "Sign in again"),
 * the address bucket its limits count (the visitors' trusted-proxy rule,
 * api/client_address.php) and this site's error body.
 */
function surveyAdminContext(): AdminContext
{
    static $context = null;

    return $context ??= new AdminContext(
        actorId: static fn(Request $request): ?int => (Identify::person($request) ?? surveyTokenPerson($request))?->sub,
        proof: AdminContext::recentSignIn(static fn(Request $request): ?int => Identify::person($request)?->authTime),
        clientKey: static fn(Request $request): string => clientAddressCounted($request, visitorSettings()),
        error: respondRefusal(...),
        isAdmin: static fn(Request $request): bool => Identify::person($request)?->isAdmin() ?? false,
    );
}

/**
 * The person of a request's Bearer token, checked as Identify checks one -
 * for the error log, which writes down who met a failure from the request as
 * it came in, before any route's Identify read it (the admin groups have
 * Identify's answer already). Null for no token, or one that does not check
 * out: the error log then names nobody.
 */
function surveyTokenPerson(Request $request): ?\Anotoki\Lib\Auth\Person
{
    $token = \Anotoki\Lib\Auth\Bearer::token(\Anotoki\Lib\Auth\Bearer::header($request));
    if ($token === null || settingsProblem() !== null) {
        return null;
    }

    return (new \Anotoki\Lib\Auth\AccessTokens(surveyIam()))->verify($token);
}

/**
 * The audit log: the library's, on the site's own connection - so an entry
 * written inside a change's transaction commits (or not) with it - and a file
 * the entries wait in while its table waits for an update
 * (storage/logs/audit-pending.jsonl; flushPending() after every Apply).
 */
function surveyAudit(): AuditLog
{
    static $made = [];

    $pending = storageDir() . '/logs/audit-pending.jsonl';

    return $made[$pending] ??= new AuditLog(static fn(): PDO => db(), [
        'pendingFile' => $pending,
        // A name typed into the page's actor filter: the people of that name here.
        'actorIds' => static fn(string $name): array => array_map('intval', array_column(
            dbAll("SELECT id FROM users WHERE id > 0 AND strpos(lower(preferred_username), lower(?)) > 0 LIMIT 50", [$name]),
            'id'
        )),
    ]);
}

/** One entry of the audit log, by the request's person (the token's sub). Never throws. */
function surveyAudited(Request $request, string $action, ?string $targetType = null, int|string|null $targetId = null, array $details = []): void
{
    surveyAudit()->record($request, Identify::person($request)?->sub, $action, $targetType, $targetId, $details);
}

/**
 * The error log: the library's files under storage/logs, for the app $app
 * (its routes' patterns name each line's route) - or, with no app, for what
 * fails outside a request's route: a backup (surveyBackups()). An ApiError is
 * a refusal the site decided, not a failure: its answer's line is written when
 * its status is one the log keeps (a 404, a 429, a 503), as any answer's is.
 */
function surveyErrorLog(?App $app = null): ErrorLog
{
    return new ErrorLog(storageDir() . '/logs', [
        'root' => SURVEY_BACKEND,
        'context' => surveyAdminContext(),
        'app' => $app,
        'ignoreExceptions' => [ApiError::class],
    ]);
}

/**
 * The backups: the library's, of this site's database, under storage/backups
 * - the Migrations' lock (one backup or update at a time), its migrator (the
 * schema a backup records, and compares before a restore), the audit log, the
 * after-the-answer runner (the daily backup), and after a restore the scrub of
 * the IAM's deleted accounts run again (surveyScrubAfterRestore()). A backup
 * that fails - the daily one after an answer, the one before an update, the
 * work after a restore - is written in the site's error log, where its ADMIN
 * reads it, as well as PHP's.
 */
function surveyBackups(): Backups
{
    static $made = [];

    $directory = storageDir() . '/backups';

    return $made[$directory] ??= new Backups(static fn(): PDO => surveyCopyConnection(), $directory, [
        'site' => 'survey',
        'migrator' => static fn(PDO $pdo): \Anotoki\Lib\Migrations\Migrator => surveyMigrator($pdo),
        'lock' => DATABASE_UPDATE_LOCK,
        'audit' => surveyAudit(),
        'defer' => afterAnswerAdd(...),
        'storage' => storageDir(),
        'onError' => static function (Throwable $e): void {
            error_log('[backups] ' . get_class($e) . ': ' . \Anotoki\Lib\Support\Redactor::text($e->getMessage()));
            surveyErrorLog()->record($e);
        },
        'afterRestore' => static function (array $manifest, PDO $pdo): void {
            surveyScrubAfterRestore($pdo);
        },
    ]);
}

/**
 * After a restore, the scrub of the IAM's deleted accounts at once: the
 * restored database brings back the scrub's place of its day, and with it the
 * names of whoever the IAM deleted since. A scrub that does not finish - the
 * IAM out of reach, its time up with more to read, a run already going - is
 * the restore's failure to say (the library's after_restore_error, the
 * Backups page's note; the error log), never a restore that looks complete
 * with a deleted person named again. And the hourly upkeep's stamp goes, so
 * the next request runs the scrub again instead of an hour later - after this
 * answer: this request's own upkeep would claim the hour again at once, and
 * meet the IAM as it is this moment.
 */
function surveyScrubAfterRestore(PDO $pdo): void
{
    $people = surveyPeople();
    $run = $people->scrubber($pdo)->run();
    if ($run['state'] === 'done') {
        return;
    }

    $cache = $people->iam->cacheDirectory();
    if ($cache !== null) {
        afterAnswerAdd(static function () use ($cache): void {
            @unlink($cache . '/' . PeopleUpkeep::STAMP);
        });
    }
    $why = match ($run['state']) {
        'unreachable', 'stopped' => lcfirst(rtrim((string) $run['error'], '.')),
        'more' => 'its time ran out with more of the IAM\'s list to read',
        'busy' => 'another check was running',
        'not_ready' => 'what it needs is not there: ' . implode('; ', $run['problems']),
        default => 'it ended ' . $run['state'],
    };

    throw new RuntimeException(
        "the accounts the IAM deleted were not checked again ($why). Whoever it deleted since this backup was made may be named here "
        . 'until they are: the check runs again with the next request, and at once with Check now on the People page.'
    );
}

/**
 * A connection of its own for the backups: COPY in and out of every table, as
 * Pdo\Pgsql where PHP has it (8.4 and newer: PHP 8.5 deprecates the PDO calls
 * the older ones need) - in UTC, as every connection of the site.
 */
function surveyCopyConnection(): PDO
{
    $settings = databaseSettings();
    $pdo = Copy::connect(dbDsn($settings), (string) $settings['user'], (string) $settings['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
    $pdo->exec("SET TIME ZONE 'UTC'");

    return $pdo;
}
