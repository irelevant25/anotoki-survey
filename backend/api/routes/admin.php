<?php

declare(strict_types=1);

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
 * The site's own words (api/translations.php); a {code} that is not a
 * language's is 404:
 *
 *   GET    /api/admin/languages                   {languages: [{code, name, nativeName, enabled, sortOrder, seeded}]}, hidden ones too
 *   POST   /api/admin/languages                   {code, name, nativeName, enabled?} -> 201 {language}, offered unless enabled is false;
 *                                                 409 language_exists, 422 too_many_languages
 *   PUT    /api/admin/languages/{code}            {name?, nativeName?, enabled?, sortOrder?} -> {language}; 409 fallback_language
 *   DELETE /api/admin/languages/{code}            ADMIN -> 204; 409 fallback_language, seeded_language, language_in_use
 *   GET    /api/admin/translations                {languages, keys: [{name, description, values: {code: text}}]}
 *   PUT    /api/admin/translations                {values: {key: {code: text}}}, the changed ones -> the grid as it is now
 *   GET    /api/admin/translations/{code}/export  that language's own strings: {key: text}
 *   PUT    /api/admin/translations/{code}/import  {key: text} -> the grid as it is now
 *
 * The database (api/database_update.php) - ADMIN alone, the admin panel's
 * Migrations page, the IAM's shape. These two are answered while the database
 * is behind the code, when every other route but signing in and the strings
 * is 503 not_set_up with update: true (meddleware/setup.php):
 *
 *   GET    /api/admin/migrations                  {applied: [{name, applied_at}], pending: [{name}]} - applied in the
 *                                                 order they ran (applied_at ISO 8601, UTC), pending in the order they will
 *   POST   /api/admin/migrations/apply            {applied: [file], failed: file | null, error: string | null} - in order,
 *                                                 each in its own transaction, stopping at the first that fails (rolled back
 *                                                 whole; error is the database's whole error, as the IAM's page shows it, and
 *                                                 it is logged too); 409 busy while another update runs (setup.php,
 *                                                 php migration.php, or this route)
 *
 * (The users table, which the role check writes to, is there from 001: a
 * database without even that is not set up, and setup.php is the way.)
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

    $group->get('/languages', function (Request $request, Response $response): Response {
        return respondJson($response, ['languages' => languagesAll()]);
    });

    $group->post('/languages', function (Request $request, Response $response): Response {
        return respondJson($response, ['language' => languageCreate(jsonBody($request))], 201);
    });

    $group->put('/languages/{code}', function (Request $request, Response $response, array $args): Response {
        return respondJson($response, ['language' => languageUpdate((string) $args['code'], jsonBody($request))]);
    });

    $group->delete('/languages/{code}', function (Request $request, Response $response, array $args): Response {
        languageDelete((string) $args['code']);

        return $response->withStatus(204);
    })->add(requireRole(ROLE_ADMIN));

    $group->get('/translations', function (Request $request, Response $response): Response {
        return respondJson($response, translationGrid());
    });

    // Who saved a string is the request's person - the token's - and nothing a body says.
    $group->put('/translations', function (Request $request, Response $response): Response {
        $body = jsonBody($request, TRANSLATIONS_BODY_LIMIT);
        translationsSave(is_array($body) ? ($body['values'] ?? null) : null, currentUser($request)->id);

        return respondJson($response, translationGrid());
    });

    $group->get('/translations/{code}/export', function (Request $request, Response $response, array $args): Response {
        return respondJson($response, translationsExport((string) $args['code']));
    });

    $group->put('/translations/{code}/import', function (Request $request, Response $response, array $args): Response {
        translationsImport((string) $args['code'], jsonBody($request, TRANSLATIONS_BODY_LIMIT), currentUser($request)->id);

        return respondJson($response, translationGrid());
    });

    $group->get('/migrations', function (Request $request, Response $response): Response {
        return respondJson($response, databaseStatus(db()));
    })->add(requireRole(ROLE_ADMIN));

    $group->post('/migrations/apply', function (Request $request, Response $response): Response {
        $result = databaseApplyUpdate();
        if ($result === null) {
            throw new ApiError(409, 'busy', 'Another database update is running (another Apply, setup.php or php migration.php). Nothing was applied. Wait a moment, then look again.');
        }

        return respondJson($response, $result);
    })->add(requireRole(ROLE_ADMIN));
})->add(requireRole(...ROLES_STAFF));
