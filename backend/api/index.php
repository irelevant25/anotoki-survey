<?php

declare(strict_types=1);

/**
 * The API's front controller.
 *
 * On the live site api/.htaccess sends every /api/... request here (the web
 * root's own .htaccess, written by tools/build.php, lets /api/ through to it).
 * Under PHP's built-in server router.php does the same. Slim routes on the
 * original path, so every route starts with /api/.
 *
 *   routes/public.php    GET /api/health, GET /api/site-status, GET /api/auth/config,
 *                        GET /api/images/{id}.{ext}, GET /api/translations/{code} (the
 *                        anotoki library's TranslationsRoutes::bundle)
 *   routes/surveys.php   the surveys for the people taking them, and their answers - signed
 *                        in, or as a visitor while the IAM says sign-in is not required
 *   routes/visitor.php   POST /api/visitor/move: at sign-in, a visitor's answers into the account
 *   routes/admin.php     /api/admin/...: the surveys, the results, the pictures (EDITOR, ADMIN);
 *                        the languages and the site's own strings - the library's routes, behind
 *                        the same roles (deleting a language: ADMIN); the migrations (ADMIN)
 *
 * The middleware, outermost first: security headers -> the error handler ->
 * the site gate (the anotoki family's SiteGate, api/migrations.php: 503
 * not_set_up without config/database.local.php and iam.local.php - offering
 * the setup page only while the site was never installed; 503 update_pending
 * while a migration waits, but for the paths that must answer then:
 * siteOpenWhileUpdating()) -> routing -> on each route, who is asking. After
 * the answer, what a request left for then (afterAnswerRun(): the visitors'
 * clean-up).
 */

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/meddleware/security.php';
require_once __DIR__ . '/meddleware/auth.php';

use Anotoki\Lib\Migrations\Http\SiteGate;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Slim\Exception\HttpMethodNotAllowedException;
use Slim\Exception\HttpNotFoundException;
use Slim\Factory\AppFactory;

/**
 * The application: every route and middleware, not yet running. Built once -
 * the route files are required here, and a second build would register them
 * twice.
 */
function buildSurveyApp(): \Slim\App
{
    static $built = null;

    if ($built !== null) {
        return $built;
    }

    $app = AppFactory::create();
    // Where the site stands: the gate below asks it on every request, and GET /api/site-status (routes/public.php) says it.
    $siteState = surveySiteState();

    require __DIR__ . '/routes/public.php';
    require __DIR__ . '/routes/surveys.php';
    require __DIR__ . '/routes/visitor.php';
    require __DIR__ . '/routes/admin.php';

    // Added in this order, so they run the other way round.
    $app->add(new SiteGate($siteState, $app->getResponseFactory(), siteOpenWhileUpdating()));

    $errorMiddleware = $app->addErrorMiddleware(false, false, false);
    $errorMiddleware->setDefaultErrorHandler(function (Request $request, Throwable $exception) use ($app): Response {
        $response = $app->getResponseFactory()->createResponse();

        if ($exception instanceof ApiError) {
            return respondError($response, $exception->status, $exception->errorCode, $exception->getMessage(), $exception->headers, $exception->extra);
        }
        if ($exception instanceof HttpNotFoundException) {
            return respondError($response, 404, 'not_found', 'Not found');
        }
        if ($exception instanceof HttpMethodNotAllowedException) {
            return respondError($response, 405, 'method_not_allowed', 'Method not allowed', ['Allow' => implode(', ', $exception->getAllowedMethods())]);
        }
        // The settings found wanting past the gate, which answers that itself before any route - and offers
        // the setup page only to a site never installed. This one never does.
        if ($exception instanceof NotSetUp) {
            return respondError($response, 503, 'not_set_up', 'The site is not available right now. Try again in a few minutes.');
        }
        if ($exception instanceof PDOException) {
            error_log('[db] ' . $exception->getMessage());

            return respondError($response, 503, 'database_unavailable', 'The database is not reachable right now.');
        }

        error_log('[server] ' . get_class($exception) . ': ' . $exception->getMessage() . ' @ ' . $exception->getFile() . ':' . $exception->getLine());

        return respondError($response, 500, 'server_error', 'Something went wrong on the server.');
    });

    $app->add(securityHeaders());

    return $built = $app;
}

// The tests build the app themselves; nothing is served while they load this file.
if (!defined('SURVEY_NO_RUN')) {
    buildSurveyApp()->run();
    // What a request left for after its answer: the visitors' clean-up.
    afterAnswerRun();
}
