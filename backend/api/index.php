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
 *   routes/public.php    GET /api/health, GET /api/site-status, GET /api/auth/config (the anotoki
 *                        library's AuthRoutes), GET /api/images/{id}.{ext}, GET /api/translations/{code}
 *                        (the anotoki library's TranslationsRoutes::bundle), POST /api/client-errors (a
 *                        page's error into the error log: the library's ErrorLogRoutes::client), GET
 *                        /api/site-settings (what every page is told: SiteSettingsRoutes::public), and
 *                        GET /robots.txt and /sitemap.xml (the library's RobotsRoutes - router.php and
 *                        the release's front controller send them here beside /api) - nobody's,
 *                        whatever a request carries
 *   routes/surveys.php   the surveys for the people taking them, and their answers - signed
 *                        in, or as a visitor while the IAM says sign-in is not required
 *   routes/visitor.php   POST /api/visitor/move: at sign-in, a visitor's answers into the account
 *   routes/feedback.php  POST /api/feedback: a message through the library's feedback form -
 *                        anybody's, the sender from the token alone
 *   routes/admin.php     /api/admin/...: the surveys, the results, the pictures (EDITOR, ADMIN);
 *                        the languages and the site's own strings - the library's routes, behind
 *                        the same roles (deleting a language: ADMIN); the migrations, the people,
 *                        the error log, the audit log, feedback, the backups, the site settings
 *                        (ADMIN) - the library's
 *
 * The middleware, outermost first: the error log's outer half (what is
 * answered with a status worth seeing) -> security headers -> the error
 * handler (wrapped by the error log, which writes down what it answers) ->
 * the site gate (the anotoki family's SiteGate, api/migrations.php: 503
 * not_set_up without config/database.local.php and iam.local.php - offering
 * the setup page only while the site was never installed; 503 update_pending
 * while a migration waits, but for the paths that must answer then:
 * siteOpenWhileUpdating(); 503 maintenance while the site's ADMIN has closed
 * it - the site settings, api/site_settings.php - to everybody but that ADMIN,
 * known by the token alone, but for those paths and the settings' reserved
 * ones) -> the scrub of the IAM's deleted accounts (the library's
 * PeopleUpkeep: after the answer, at most hourly, while the site is ready) ->
 * the daily backup (after the answer, the first of a UTC day) -> routing -> on
 * each route but the public ones, who is asking (the library's Identify,
 * api/auth.php) and what they may do - and, on the groups whose data a page
 * holds, whether Page access lets them have it (the library's PageAccessGate,
 * right inside the group's Identify: 423 page_locked). After the answer, what a
 * request left for then (afterAnswerRun(): the visitors' clean-up, the scrub,
 * the daily backup).
 */

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/meddleware/security.php';
require_once __DIR__ . '/meddleware/auth.php';

use Anotoki\Lib\ErrorLog\ErrorLogMiddleware;
use Anotoki\Lib\Migrations\Http\SiteGate;
use Anotoki\Lib\Migrations\Http\SiteState;
use Anotoki\Lib\People\Http\PeopleUpkeep;
use Anotoki\Lib\People\Http\RecordPerson;
use Anotoki\Lib\SiteSettings\Http\PageAccessGate;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;
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
    $responses = $app->getResponseFactory();
    // Who a request is, in front of every route that needs somebody - never of the public ones. The surveys'
    // own routes alone read a visitor's key (api/auth.php).
    $identify = surveyIdentify($responses);
    $identifyTaker = surveyIdentify($responses, visitors: true);
    // A person's row in users, kept from their token (api/people.php) - on the routes that read or write the
    // site's data, never on the Migrations page's, the error log's or the backups'.
    $recordPerson = new RecordPerson(surveyPeople());
    // Page access (the site settings, api/site_settings.php): the API paths a page's row refuses with it, 423 to
    // whoever the page is not shown to - right inside the Identify of each group whose data a page holds (the
    // surveys', the visitor's move, feedback, the editors' admin routes), whose person it reads; never the
    // site's ADMIN, never a reserved path.
    $pageAccess = new PageAccessGate(surveySiteSettings(), $responses);
    // What went wrong, written down where the site's ADMIN reads it (api/admin_tools.php) - PHP's own warnings
    // and fatal errors too.
    $errorLog = surveyErrorLog($app);
    $errorLog->installPhpHandlers();

    require __DIR__ . '/routes/public.php';
    require __DIR__ . '/routes/surveys.php';
    require __DIR__ . '/routes/visitor.php';
    require __DIR__ . '/routes/feedback.php';
    require __DIR__ . '/routes/admin.php';

    // Added in this order, so they run the other way round.
    $app->add(dailyBackupSoon());
    $app->add(new PeopleUpkeep(surveyPeople(), static fn(): bool => $siteState->state() === SiteState::READY, afterAnswerAdd(...)));
    // Closed for maintenance, the site's ADMIN passes - known by the token alone (the gate runs before any route's
    // Identify): a forged, expired or other site's token is nobody's, and nobody is shut out of the reserved paths.
    $app->add(new SiteGate($siteState, $responses, siteOpenWhileUpdating(), exempt: static fn(Request $request): bool => surveyTokenPerson($request)?->isAdmin() ?? false));

    $errorMiddleware = $app->addErrorMiddleware(false, false, false);
    $errorMiddleware->setDefaultErrorHandler(
        $errorLog->wrapHandler(function (Request $request, Throwable $exception) use ($app): Response {
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
        }),
    );

    $app->add(securityHeaders());
    // Outside everything: it sees what was answered in the end, the gate's answers and the error handler's too.
    $app->add(ErrorLogMiddleware::outer($errorLog));

    return $built = $app;
}

/**
 * The daily backup (the library's, api/admin_tools.php): the first request of
 * a UTC day that the site answered as itself lets it run after the answer
 * (dailyIfDue() reads a stamp file, and the backup itself asks whether the
 * database is up to date first). Never for the site's status - which answers
 * in every state - nor for a site that is not set up, nor after an answer
 * that says the server failed: the database may be out of reach.
 */
function dailyBackupSoon(): callable
{
    return function (Request $request, RequestHandler $handler): Response {
        $response = $handler->handle($request);
        if ($response->getStatusCode() < 500 && $request->getUri()->getPath() !== '/api/site-status' && settingsProblem() === null) {
            surveyBackups()->dailyIfDue();
        }

        return $response;
    };
}

// The tests build the app themselves; nothing is served while they load this file.
if (!defined('SURVEY_NO_RUN')) {
    buildSurveyApp()->run();
    // What a request left for after its answer: the visitors' clean-up, the scrub, the daily backup.
    afterAnswerRun();
}
