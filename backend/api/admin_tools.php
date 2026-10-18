<?php

declare(strict_types=1);

use Anotoki\Lib\Admin\AdminContext;
use Anotoki\Lib\Audit\AuditLog;
use Anotoki\Lib\Auth\Http\Identify;
use Anotoki\Lib\Backups\Backups;
use Anotoki\Lib\Backups\Copy;
use Anotoki\Lib\ErrorLog\ErrorLog;
use Anotoki\Lib\Feedback\Feedback;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\App;

/**
 * The admin tools this site takes from the anotoki family's library
 * (anotoki-lib 0.5.1, feedback since 0.6.2): the error log, the audit log,
 * feedback and the backups - for the site's ADMIN alone (the owner's decision:
 * EDITORs see none of them), each an admin page of the library's
 * (routes/admin.php, the frontend's admin.routes.ts). No file explorer (the
 * pictures live in the database, and are in every backup).
 *
 *   feedback        the library's table anotoki_feedback (its set anotoki_admin, 002): what people
 *                   tell the site through the library's form (the Contact page opens it; the family's
 *                   footer will too) - the owner's wish of 2026-10-18, which ended "no feedback" here.
 *                   Anybody may send one (routes/feedback.php): a person's id from the token alone,
 *                   never the body, unless they send it without their name; a reply address only if
 *                   they write one (the form fills none in: the IAM is the only holder of anybody's
 *                   address - docs/decisions.md); the page as a path, its language, the browser's name;
 *                   nothing of where it came from. 5 an hour and 20 a day from one sender (a person by
 *                   their account, anybody else by an HMAC of their address bucket, in a file of
 *                   storage/cache that keeps a day of them), 300 a day from the visitors and as many
 *                   from the people signed in. Kept: spam 30 days, resolved 365, the rest until
 *                   somebody deletes it - pruned at most once a day, after a message is sent or the
 *                   Feedback page is opened (Feedback::pruneIfDue()). An account the IAM deletes keeps
 *                   its messages' words, never their reply address or browser (the people's scrub,
 *                   api/people.php). No mail is sent: the admin panel counts what is new.
 *
 *   the error log   storage/logs/errors-YYYY-MM-DD.jsonl (UTC days, 30 kept, 64 MB in all): what
 *                   failed - an exception answered 5xx (with the chain of what caused it), an answer
 *                   of 404, 405, 413, 415, 429 or 5xx, PHP's own warnings and fatal errors, and the
 *                   pages' own errors (POST /api/client-errors, routes/public.php: the browser's
 *                   @anotoki/lib/error-report) - redacted, with an HMAC of the address bucket instead
 *                   of the address, never a body, a header, a cookie, a query string or a token.
 *                   Files: it works while the database is out of reach or an update waits.
 *   the audit log   the library's table anotoki_audit_log (its set anotoki_admin): who did what in the
 *                   admin panel - a survey made, opened, closed, deleted; answers deleted; the site's
 *                   words saved, imported; a language added, changed, deleted; a person's answers
 *                   deleted (inside the delete's own transaction: a restore does it again by it), the
 *                   scrub run; backups made, downloaded, deleted, restored; the error log cleared;
 *                   migrations applied. By the token's sub, never an address.
 *   the backups     storage/backups/<id>.anotoki-backup: every table by COPY through PDO in one
 *                   snapshot (the pictures' bytes too), with the migrations it was made at - daily
 *                   after an answer (14 kept), before every update (5), before a restore (5), and by
 *                   hand (until deleted). Made, downloaded, deleted and restored only after a sign-in
 *                   of the last ten minutes (the token's auth_time); downloaded by a single-use link.
 *                   Not encrypted - the owner's decision of 2026-10-11: only the IAM's backups are -
 *                   but sealed (an HMAC of its id and its SHA-256 under the installation's key,
 *                   storage/anotoki-lib.key): only a backup made here is restored here. One made
 *                   before anotoki-lib 0.5.0 has no seal and is restored offline (docs/operations.md).
 *
 * Who acts is the token's person, never a body; whether they are the site's
 * ADMIN, the token's roles (Identify, api/auth.php) - so the error log's and
 * the backups' routes work while an update waits, as the Migrations page's do.
 * The files live under storage/, which the web never reaches (its .htaccess,
 * and each folder's own, GuardedDirectory), each the site's own user's alone.
 */

/**
 * What the library's admin tools ask of this site, once: who acts (the
 * token's sub), whether they are the site's ADMIN (the token's roles), the
 * proof a backup asks for (a sign-in of the last ten minutes, from the
 * token's auth_time: 403 reauth_required - the page offers "Sign in again"),
 * whose address a request comes from (the visitors' settings' proxies -
 * Cloudflare's published ranges unless config/visitors.local.php says
 * otherwise - and Cloudflare's CF-Connecting-IP, the library's default
 * header, never a setting, believed with the origin secret only on a request
 * that carries it - config/cloudflare.local.php: the library's one rule,
 * ClientAddress, which the visitors' limits read by too,
 * api/client_address.php), the people's names (a backup's maker, the audit
 * log's actors) and this site's error body. One for each settings folder (the
 * tests use more than one).
 */
function surveyAdminContext(): AdminContext
{
    static $made = [];

    // The header is the library's default, Cloudflare's CF-Connecting-IP: pinned, never read from a setting.
    return $made[configDir()] ??= new AdminContext(
        actorId: static fn(Request $request): ?int => (Identify::person($request) ?? surveyTokenPerson($request))?->sub,
        proof: AdminContext::recentSignIn(static fn(Request $request): ?int => Identify::person($request)?->authTime),
        error: respondRefusal(...),
        isAdmin: static fn(Request $request): bool => Identify::person($request)?->isAdmin() ?? false,
        names: peopleNames(...),
        trustedProxies: visitorSettings()['trusted_proxies'],
        originSecret: originSecret(),
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
 * Feedback: the form's messages and the admin page's list - the library's,
 * on the site's own connection, with the library's kinds (bug, idea, other),
 * limits and keeping (spam 30 days, resolved 365 - the Privacy page says so,
 * migration 015) and no places of the site to choose from. The limits are
 * counted in the settings folder's storage, the prune runs after the answer
 * (afterAnswerAdd()). One for each settings folder (the tests use more than one).
 */
function surveyFeedback(): Feedback
{
    static $made = [];

    $storage = storageDir();

    return $made[$storage] ??= new Feedback(static fn(): PDO => db(), [
        'storage' => $storage,
        'defer' => afterAnswerAdd(...),
    ]);
}

/**
 * Who sent a feedback message: the person of a verified token (Identify, in
 * front of the route) - their id, nothing else; null for nobody, and for a
 * visitor, whose key is never read there. The reply address is only the one
 * the form sent.
 */
function surveyFeedbackSender(Request $request): ?array
{
    $person = Identify::person($request);

    return $person === null ? null : ['id' => $person->sub];
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
 * after-the-answer runner (the daily backup), and a restore's two hooks, the
 * people module's own (anotoki-lib 0.5.0, People::restoreHooks()):
 *
 *   - inside the restore's transaction, before anybody sees its rows: every
 *     person's answers deleted since the backup was made (the audit log's
 *     person.data_deleted, which is never restored) deleted again, by the
 *     People page's own hook on the restore's connection (peopleDelete()) - a
 *     restore never brings back what a person asked to have deleted; one that
 *     cannot do it again is rolled back whole;
 *   - once it committed, the scrub of the IAM's deleted accounts at once: the
 *     restored database brings back the scrub's place of its day, and with it
 *     the names of whoever the IAM deleted since. One that does not finish -
 *     the IAM out of reach, its time up, a run already going - is the
 *     restore's after_restore_error (the Backups page's note; the error log),
 *     and the hourly upkeep's stamp goes after this answer (afterAnswerAdd()),
 *     so the next request runs the scrub again instead of an hour later.
 *
 * A backup that fails - the daily one after an answer, the one before an
 * update, the work after a restore - is written in the site's error log, where
 * its ADMIN reads it, as well as PHP's.
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
        ...surveyPeople()->restoreHooks(delete: peopleDelete(...), defer: afterAnswerAdd(...)),
    ]);
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
