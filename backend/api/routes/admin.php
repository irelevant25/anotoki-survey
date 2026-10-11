<?php

declare(strict_types=1);

use Anotoki\Lib\Migrations\Http\MigrationsRoutes;
use Anotoki\Lib\Migrations\Migrator;
use Anotoki\Lib\Translations\Http\TranslationsRoutes;
use Anotoki\Lib\Translations\Translations;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Routing\RouteCollectorProxy;

/**
 * The admin area: EDITOR or ADMIN for everything, ADMIN alone for what cannot
 * be undone (deleting a survey, somebody's answers, or a language) and for the
 * database's migrations.
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
 * while a migration waits, when every other route but signing in and the
 * strings is 503 update_pending (siteOpenWhileUpdating()):
 *
 *   GET    /api/admin/migrations                  {sets, applied: [{set, name, applied_at}], pending: [{set, name, ready,
 *                                                 blocked}], missing: [{set, name, applied_at}]} - applied in the order they
 *                                                 ran (applied_at ISO 8601, UTC), pending in the order they will; writes nothing
 *   GET    /api/admin/migrations/file?set=&name=  {set, name, sql}: an applied or pending file's SQL; 404 not_found for
 *                                                 anything that is not a file of the set
 *   POST   /api/admin/migrations/apply            {applied: [{set, name}], failed: {set, name} | null, error: string | null,
 *                                                 note: null} - in order, each in its own transaction, stopping at the first
 *                                                 that fails (rolled back whole; error is the database's whole error, and it is
 *                                                 logged too); 409 busy while another update runs (setup.php, php
 *                                                 migration.php, or this route)
 *
 * Their ADMIN is judged from the token alone (requireTokenRole()): the role
 * check of the rest records the visit in `users`, and these must work on a
 * database a pending migration has yet to build - from nothing at all.
 *
 * @var \Slim\App $app
 */

/** The largest survey taken in one save: a long survey with long texts is a few hundred kB. */
const SURVEY_BODY_LIMIT = 2 * 1024 * 1024;

$app->group('/api/admin', function (RouteCollectorProxy $group): void {
    $group->get('/surveys', function (Request $request, Response $response): Response {
        return respondJson($response, ['surveys' => surveySummaries()]);
    });

    $group->post('/surveys', function (Request $request, Response $response): Response {
        $body = jsonBody($request, SURVEY_BODY_LIMIT);

        return respondJson($response, ['survey' => surveyCreate(currentUser($request), is_array($body) ? ($body['survey'] ?? null) : null)], 201);
    });

    $group->get('/surveys/{id}', function (Request $request, Response $response, array $args): Response {
        return respondJson($response, ['survey' => surveyById((string) $args['id'])]);
    });

    $group->put('/surveys/{id}', function (Request $request, Response $response, array $args): Response {
        $body = jsonBody($request, SURVEY_BODY_LIMIT);
        $body = is_array($body) ? $body : [];

        return respondJson($response, ['survey' => surveySave(currentUser($request), (string) $args['id'], $body['revision'] ?? null, $body['survey'] ?? null)]);
    });

    $group->post('/surveys/{id}/status', function (Request $request, Response $response, array $args): Response {
        return respondJson($response, ['survey' => surveySetStatus(currentUser($request), (string) $args['id'], jsonBody($request))]);
    });

    $group->delete('/surveys/{id}', function (Request $request, Response $response, array $args): Response {
        surveyDelete((string) $args['id']);

        return $response->withStatus(204);
    })->add(requireRole(ROLE_ADMIN));

    $group->get('/surveys/{id}/responses', function (Request $request, Response $response, array $args): Response {
        return respondJson($response, ['responses' => responsesOf((string) $args['id'])]);
    });

    $group->delete('/responses/{id}', function (Request $request, Response $response, array $args): Response {
        responseDelete((string) $args['id']);

        return $response->withStatus(204);
    })->add(requireRole(ROLE_ADMIN));

    $group->post('/images', function (Request $request, Response $response): Response {
        if (!str_starts_with(strtolower($request->getHeaderLine('Content-Type')), 'image/')) {
            throw new ApiError(415, 'not_an_image', 'Send the picture itself, as image/webp, image/png, image/jpeg, image/gif or image/avif.');
        }

        return respondJson($response, ['image' => imageStore(currentUser($request), requestBytes($request, IMAGE_MAX_BYTES))], 201);
    });
})->add(requireRole(...ROLES_STAFF));

// The site's words: the anotoki library's routes, with this site's roles and
// error body. Who saved a string is the request's person - the token's, put
// there by requireRole() - and nothing a body says (translationWriter()).
$translations = static fn(): Translations => surveyTranslations();

TranslationsRoutes::strings($app, '/api/admin', $translations, translationWriter(...), respondRefusal(...))
    ->add(requireRole(...ROLES_STAFF));

// Added in this order, so they run the other way round: the editors' check first, then deleting for an ADMIN alone.
TranslationsRoutes::languages($app, '/api/admin', $translations, respondRefusal(...))
    ->add(requireRoleFor('DELETE', ROLE_ADMIN))
    ->add(requireRole(...ROLES_STAFF));

// The Migrations page's routes. Each request has a connection of its own
// (surveyMigrator()'s rule: an Apply's lock must never sit on the pooled db()),
// and a file that fails is in the server's log as well as on the page.
MigrationsRoutes::admin(
    $app,
    '/api/admin/migrations',
    static fn(): Migrator => surveyMigrator(dbConnect(databaseSettings())),
    static function (Request $request, array $result): void {
        if ($result['failed'] !== null) {
            error_log('[db] the migration ' . $result['failed']['name'] . ' failed: ' . $result['error']);
        }
    },
)->add(requireTokenRole(ROLE_ADMIN));
