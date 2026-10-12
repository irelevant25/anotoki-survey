<?php

declare(strict_types=1);

use Anotoki\Lib\Audit\Http\AuditRoutes;
use Anotoki\Lib\Backups\Http\BackupsRoutes;
use Anotoki\Lib\ErrorLog\Http\ErrorLogRoutes;
use Anotoki\Lib\Migrations\Http\MigrationsRoutes;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\People\Http\PeopleRoutes;
use Anotoki\Lib\Translations\Http\TranslationsRoutes;
use Anotoki\Lib\Translations\Translations;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Routing\RouteCollectorProxy;

/**
 * The admin area: EDITOR or ADMIN for everything, ADMIN alone for what cannot
 * be undone (deleting a survey, somebody's answers, or a language), for the
 * database's migrations and for the admin tools (the people, the error log,
 * the audit log, the backups). Who is asking is the anotoki library's
 * Identify (api/auth.php: the token, never a visitor's key) in front of every
 * group; the roles are the token's alone (requireStaff(), requireAdmin(),
 * api/meddleware/auth.php) - nothing read of the database to decide them.
 * Every change here is written into the audit log (api/admin_tools.php): a
 * survey made, opened, closed or deleted, answers deleted, the site's words
 * saved or imported, a language added, changed or deleted, a person's answers
 * deleted, the scrub run, a backup made, downloaded, deleted or restored, the
 * error log cleared, migrations applied. (A survey's every save is not: its
 * revision says that.)
 *
 *   GET    /api/admin/surveys                     {surveys: [summary]}
 *   POST   /api/admin/surveys                     {survey} -> 201 {survey}: a new draft (a copy is made in the browser)
 *   GET    /api/admin/surveys/{id}                {survey}
 *   PUT    /api/admin/surveys/{id}                {revision, survey} -> {survey}; 409 conflict (with the survey as it is), 409 slug_taken
 *   POST   /api/admin/surveys/{id}/status         {status: open|closed, closesOn?} -> {survey}; 422 survey_problems
 *   DELETE /api/admin/surveys/{id}                ADMIN -> 204
 *   GET    /api/admin/surveys/{id}/responses      {responses: [SurveyResponse]}
 *   DELETE /api/admin/responses/{id}              ADMIN -> 204
 *   POST   /api/admin/images                      the picture's bytes (image/*) -> 201 {image}
 *
 * The site's own words - the anotoki library's routes (TranslationsRoutes, the
 * IAM's wire format: snake_case), in this site's error body, behind this
 * site's roles: EDITOR or ADMIN, and deleting a language ADMIN alone. A
 * {code} that is no language code is 404 before any query; a body that is not
 * JSON 415, too large 413, empty 422 empty_body, broken 400 invalid_json; the
 * tables not there yet 503 translations_unavailable:
 *
 *   GET    /api/admin/languages                   {languages: [{code, name, native_name, enabled, sort_order, seeded, strings}]},
 *                                                 hidden ones too
 *   POST   /api/admin/languages                   {code, name, native_name, enabled?} -> 201 {language}, offered unless enabled is
 *                                                 false; 409 language_exists, 422 too_many_languages
 *   PUT    /api/admin/languages/{code}            {name?, native_name?, enabled?, sort_order?} -> {language}; 409 fallback_language
 *   DELETE /api/admin/languages/{code}            ADMIN -> {strings}: how many went with it; 409 fallback_language,
 *                                                 seeded_language, language_in_use (with `surveys`: a survey is written in it,
 *                                                 or translated into it - SurveyLanguageUsage, api/translations.php)
 *   GET    /api/admin/translations                {languages, keys: [{name, description, values: {code: text}}]}
 *   PUT    /api/admin/translations                {values: {key: {code: text}}}, the changed ones -> the grid as it is now
 *   GET    /api/admin/translations/{code}/export  that language's own strings, a file: {key: text}
 *   PUT    /api/admin/translations/{code}/import  {key: text} -> the grid as it is now
 *
 * The database - ADMIN alone, the admin panel's Migrations page: the anotoki
 * family's routes (MigrationsRoutes::admin, api/migrations.php). They answer
 * while a migration waits, when every other route but signing in, the strings,
 * the error log and the backups is 503 update_pending (siteOpenWhileUpdating()):
 *
 *   GET    /api/admin/migrations                  {sets, applied: [{set, name, applied_at}], pending: [{set, name, ready,
 *                                                 blocked}], missing: [{set, name, applied_at}]} - applied in the order they
 *                                                 ran (applied_at ISO 8601, UTC), pending in the order they will; writes nothing
 *   GET    /api/admin/migrations/file?set=&name=  {set, name, sql}: an applied or pending file's SQL; 404 not_found for
 *                                                 anything that is not a file of a set
 *   POST   /api/admin/migrations/apply            {applied: [{set, name}], failed: {set, name} | null, error: string | null,
 *                                                 note: string | null} - a backup of the database as it is first (its name the
 *                                                 note; nothing applied when it cannot be made), then in order, each in its own
 *                                                 transaction, stopping at the first that fails (rolled back whole; error is the
 *                                                 database's whole error, and it is logged too); 409 busy while another update
 *                                                 or a backup runs (setup.php, php migration.php, or this route)
 *
 * The admin tools - ADMIN alone, the anotoki library's routes, each group
 * guarding itself as well (the library asks the token's ADMIN itself, behind
 * this site's check):
 *
 *   /api/admin/people     the People page (PeopleRoutes, api/people.php): GET ?q=&page= the people,
 *                         DELETE /{sub} every answer of theirs (audited inside its own transaction: 503
 *                         feature_unavailable while the audit log's table waits - no delete without its
 *                         entry, which a restore does it again by), POST /sync the scrub of the IAM's
 *                         deleted accounts now
 *   /api/admin/errors     the error log (ErrorLogRoutes): GET ?days=&level=&status=&search=, GET
 *                         /{fingerprint}, DELETE ?before= - open while a migration waits
 *   /api/admin/audit      the audit log (AuditRoutes): GET ?actor=&action=&target_type=&target_id=&from=&to=&page=,
 *                         GET /facets
 *   /api/admin/backups    the backups (BackupsRoutes): GET (each backup's maker by name), GET /proof, POST,
 *                         GET|DELETE /{id}, POST /{id}/ticket, GET /{id}/preview, POST /{id}/restore - making,
 *                         downloading, deleting and restoring after a sign-in of the last ten minutes (403
 *                         reauth_required); a restore only of a backup made here (sealed - 422 archive_invalid
 *                         for any other), the answers deleted for a person since done again inside it; open while
 *                         a migration waits, but the restore
 *   GET /api/admin/backups/{id}/file?ticket=   the download itself: DELIBERATELY outside every check - a
 *                         browser's navigation sends no token, and the single-use ticket is the check
 *
 * Their ADMIN, the Migrations page's and the error log's and the backups' is
 * judged from the token alone, and no person's row is written on them: they
 * must work on a database a pending migration has yet to build - from nothing
 * at all.
 *
 * @var \Slim\App $app
 * @var \Anotoki\Lib\Auth\Http\Identify $identify   Identify that reads no visitor's key (api/index.php)
 * @var \Anotoki\Lib\People\Http\RecordPerson $recordPerson
 * @var \Anotoki\Lib\ErrorLog\ErrorLog $errorLog
 */

/** The largest survey taken in one save: a long survey with long texts is a few hundred kB. */
const SURVEY_BODY_LIMIT = 2 * 1024 * 1024;

$app->group('/api/admin', function (RouteCollectorProxy $group): void {
    $group->get('/surveys', function (Request $request, Response $response): Response {
        return respondJson($response, ['surveys' => surveySummaries()]);
    });

    $group->post('/surveys', function (Request $request, Response $response): Response {
        $body = jsonBody($request, SURVEY_BODY_LIMIT);
        $survey = surveyCreate(currentPerson($request), is_array($body) ? ($body['survey'] ?? null) : null);
        surveyAudited($request, 'survey.created', 'survey', $survey['id'], ['title' => $survey['title'], 'slug' => $survey['slug']]);

        return respondJson($response, ['survey' => $survey], 201);
    });

    $group->get('/surveys/{id}', function (Request $request, Response $response, array $args): Response {
        return respondJson($response, ['survey' => surveyById((string) $args['id'])]);
    });

    $group->put('/surveys/{id}', function (Request $request, Response $response, array $args): Response {
        $body = jsonBody($request, SURVEY_BODY_LIMIT);
        $body = is_array($body) ? $body : [];

        return respondJson($response, ['survey' => surveySave(currentPerson($request), (string) $args['id'], $body['revision'] ?? null, $body['survey'] ?? null)]);
    });

    $group->post('/surveys/{id}/status', function (Request $request, Response $response, array $args): Response {
        $survey = surveySetStatus(currentPerson($request), (string) $args['id'], jsonBody($request));
        surveyAudited($request, $survey['status'] === 'open' ? 'survey.opened' : 'survey.closed', 'survey', $survey['id'], ['title' => $survey['title'], 'closes_on' => $survey['closesOn'] ?? null]);

        return respondJson($response, ['survey' => $survey]);
    });

    $group->delete('/surveys/{id}', function (Request $request, Response $response, array $args): Response {
        $deleted = surveyDelete((string) $args['id']);
        surveyAudited($request, 'survey.deleted', 'survey', (string) $args['id'], $deleted);

        return $response->withStatus(204);
    })->add(requireAdmin());

    $group->get('/surveys/{id}/responses', function (Request $request, Response $response, array $args): Response {
        return respondJson($response, ['responses' => responsesOf((string) $args['id'])]);
    });

    $group->delete('/responses/{id}', function (Request $request, Response $response, array $args): Response {
        $deleted = responseDelete((string) $args['id']);
        surveyAudited($request, 'response.deleted', 'response', (string) $args['id'], $deleted);

        return $response->withStatus(204);
    })->add(requireAdmin());

    $group->post('/images', function (Request $request, Response $response): Response {
        if (!str_starts_with(strtolower($request->getHeaderLine('Content-Type')), 'image/')) {
            throw new ApiError(415, 'not_an_image', 'Send the picture itself, as image/webp, image/png, image/jpeg, image/gif or image/avif.');
        }

        return respondJson($response, ['image' => imageStore(currentPerson($request), requestBytes($request, IMAGE_MAX_BYTES))], 201);
    });
})->add(requireStaff())->add($recordPerson)->add($identify);

// The site's words: the anotoki library's routes, with this site's roles, error
// body and audit log. Who saved a string is the request's person - the
// token's - and nothing a body says (translationWriter()).
$translations = static fn(): Translations => surveyTranslations();
$audited = static function (Request $request, string $action, ?string $type, ?string $id, array $details): void {
    surveyAudited($request, $action, $type, $id, $details);
};

TranslationsRoutes::strings($app, '/api/admin', $translations, translationWriter(...), respondRefusal(...), $audited)
    ->add(requireStaff())->add($recordPerson)->add($identify);

// Added in this order, so they run the other way round: who is asking, their
// row, the editors' check, then deleting for an ADMIN alone.
TranslationsRoutes::languages($app, '/api/admin', $translations, respondRefusal(...), $audited)
    ->add(requireFor('DELETE', requireAdmin()))
    ->add(requireStaff())->add($recordPerson)->add($identify);

// The Migrations page's routes. Each request has a connection of its own
// (surveyMigrator()'s rule: an Apply's lock must never sit on the pooled db()),
// a backup comes first, and a file that fails is in the server's log as well as
// on the page. After every Apply: the audit entries kept in a file while the
// audit log's table waited (it may have just come), then the Apply's own.
MigrationsRoutes::admin(
    $app,
    '/api/admin/migrations',
    static fn(): Migrator => surveyMigrator(dbConnect(databaseSettings()), true),
    static function (Request $request, array $result): void {
        if ($result['failed'] !== null) {
            error_log('[db] the migration ' . $result['failed']['name'] . ' failed: ' . $result['error']);
        }
        surveyAudit()->flushPending();
        if ($result['applied'] !== [] || $result['failed'] !== null) {
            $named = static fn(array $file): string => $file['set'] === surveyMigrationSet()->name ? $file['name'] : $file['set'] . '/' . $file['name'];
            surveyAudited($request, 'migrations.applied', null, null, [
                'applied' => array_map($named, $result['applied']),
                'failed' => $result['failed'] === null ? null : $named($result['failed']),
                'note' => $result['note'] ?? null,
            ]);
        }
    },
)->add(requireAdmin())->add($identify);

// The admin tools: the anotoki library's routes, each group guarding itself
// (the token's ADMIN, through surveyAdminContext()) behind this site's own
// check, in this site's error body. The People page records a person's row
// on none of them: the error log and the backups work while an update waits.
// A person's Delete is the same hook a restore does it again with
// (peopleDelete(), surveyBackups()): the library holds its transaction, and
// writes its person.data_deleted inside it - no delete without its entry.
PeopleRoutes::admin(
    $app,
    '/api/admin/people',
    surveyPeople(),
    columns: peopleColumns(),
    visitors: peopleVisitors(...),
    delete: peopleDelete(...),
    error: respondRefusal(...),
    audit: surveyAudit(),
    context: surveyAdminContext(),
)->add(requireAdmin())->add($identify);

ErrorLogRoutes::admin($app, '/api/admin/errors', $errorLog, surveyAdminContext(), surveyAudit())
    ->add(requireAdmin())->add($identify);

AuditRoutes::admin($app, '/api/admin/audit', surveyAudit(), surveyAdminContext(), peopleNames(...))
    ->add(requireAdmin())->add($identify);

BackupsRoutes::admin($app, '/api/admin/backups', surveyBackups(), surveyAdminContext())
    ->add(requireAdmin())->add($identify);

// DELIBERATELY outside every check: a browser's navigation sends no token, so
// the download's single-use ticket (60 seconds, for one backup, made after the
// ADMIN's proof and audited) is its check.
BackupsRoutes::file($app, '/api/admin/backups', surveyBackups(), surveyAdminContext());
