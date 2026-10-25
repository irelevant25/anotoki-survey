<?php

declare(strict_types=1);

use Anotoki\Lib\Auth\Http\AuthRoutes;
use Anotoki\Lib\ErrorLog\Http\ErrorLogRoutes;
use Anotoki\Lib\Migrations\Http\MigrationsRoutes;
use Anotoki\Lib\Robots\Http\RobotsRoutes;
use Anotoki\Lib\SiteSettings\Http\SiteSettingsRoutes;
use Anotoki\Lib\Translations\Http\TranslationsRoutes;
use Anotoki\Lib\Translations\Translations;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * What anybody may ask, signed in or not - with no check of who is asking in
 * front of any of them (the library's Identify is on the other routes only):
 * whatever a request carries, a token that has run out too, they answer.
 *
 *   GET /api/health               is the API up - and, asked from this computer,
 *                                 which database it uses and what it still needs
 *   GET /api/site-status          where the site stands: {state, installed} - state
 *                                 ready | not_set_up | update_pending | unavailable
 *                                 (the anotoki family's, api/migrations.php); answered
 *                                 in every state, and it says nothing else
 *   GET /api/auth/config          how the browser signs in - the anotoki library's route
 *                                 (AuthRoutes::config): {issuer, client_id, login_required,
 *                                 sign_in_available, visitor_days} - the IAM's "Sign-in
 *                                 required", true unless it said otherwise; whether the IAM
 *                                 knows this site at all; visitor_days is keep_days, the days
 *                                 the visitor notice tells people their browser is remembered
 *   GET /api/images/{id}.{ext}    a survey's picture (see api/images.php)
 *   GET /api/translations/{code}  the site's own words in a language, English under
 *                                 them, with the languages on offer: {language,
 *                                 languages: [{code, name, native_name}], values,
 *                                 english?} - the anotoki library's route
 *                                 (TranslationsRoutes::bundle, api/translations.php);
 *                                 "sk-sk" is answered by "sk" when only that is offered
 *   POST /api/client-errors       an error a page met, into the site's error log - the
 *                                 anotoki library's route (ErrorLogRoutes::client), sent by
 *                                 its @anotoki/lib/error-report: {type?, message, page?,
 *                                 stack?, status?} -> 204; JSON only (415), 8 KB at most
 *                                 (413), a message (422); 20 an hour from one sender - a
 *                                 person signed in by their account (the token, checked as
 *                                 Identify checks one: surveyTokenPerson()), anybody else by
 *                                 an HMAC of their address bucket - and 500 a day from the
 *                                 visitors and as many from the people signed in, each its
 *                                 own budget (429 too_many, Retry-After); every text redacted
 *                                 again, never a token, an address or a stored value
 *   GET /api/site-settings        what every page is told before anybody signs in - the anotoki
 *                                 library's route (SiteSettingsRoutes::public, api/site_settings.php):
 *                                 {maintenance, announcement: null | {level, message: {en, sk, ...}},
 *                                 pages: [{path, visibility, blocked}]} - never a page's API paths
 *   GET /robots.txt               what robots leave alone (/admin, /api, /auth, /preview, /staff) and
 *                                 where the sitemap is, by the site's configured address (siteAddress())
 *   GET /sitemap.xml              the public pages: the legal pages, About and Support - and, while the
 *                                 IAM says sign-in is not required, the list of open surveys and each open
 *                                 survey's page; never what Page access hides (the library's RobotsRoutes,
 *                                 api/site_settings.php). Both kept an hour by a browser or the edge
 *
 * Without the settings everything but the status is 503 not_set_up (the site
 * gate). The health, the sign-in settings and the strings are answered while a
 * migration waits (siteOpenWhileUpdating()); a picture and a page's error, like
 * everything else of the site, are 503 update_pending then. While the site's
 * ADMIN has closed it for maintenance, the status says `maintenance`, and the
 * sign-in settings, the strings, the pictures and the site settings answer
 * (the reserved paths, api/site_settings.php) - robots.txt and the sitemap are
 * 503 then, with Retry-After: a robot keeps what it had.
 *
 * @var \Slim\App $app
 * @var \Anotoki\Lib\Migrations\Http\SiteState $siteState
 * @var \Anotoki\Lib\ErrorLog\ErrorLog $errorLog
 */

$app->get('/api/health', function (Request $request, Response $response): Response {
    $problem = settingsProblem();
    $health = ['ok' => $problem === null];

    if (askedFromThisComputer($request)) {
        $health['problem'] = $problem;
        if ($problem === null) {
            $health['database'] = dbName();
            $health['pending'] = array_column(surveyMigrator(db())->status()['pending'], 'name');
        }
    }

    return respondJson($response, $health, $problem === null ? 200 : 503);
});

// What the pages ask before anything else: the site gate lets it through in
// every state, and the frontend draws the site - or the page that says why not.
MigrationsRoutes::status($app, $siteState);

// Answered while a migration waits too (siteOpenWhileUpdating()): an
// administrator must be able to sign in to apply it. `login_required` relays
// the IAM's "Sign-in required" switch (the library's SignInRule, api/auth.php),
// so the browser never asks the IAM for it.
AuthRoutes::config($app, surveySignInRule(), surveyIam(), extra: authConfigExtra(...));

$app->get('/api/images/{file}', function (Request $request, Response $response, array $args): Response {
    if (!preg_match('/^([0-9a-f-]{36})\.(webp|png|jpg|gif|avif)$/D', (string) $args['file'], $m) || ($image = imageFind($m[1])) === null) {
        throw new ApiError(404, 'not_found', 'There is no such picture.');
    }

    $etag = '"' . $m[1] . '"';
    $response = $response
        ->withHeader('Cache-Control', 'public, max-age=31536000, immutable')
        ->withHeader('ETag', $etag)
        // A picture is shown, never run: no script, no plugin, nothing it could load.
        ->withHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    if (in_array($etag, array_map('trim', explode(',', $request->getHeaderLine('If-None-Match'))), true)) {
        return $response->withStatus(304);
    }

    $response->getBody()->write($image['bytes']);

    return $response
        ->withHeader('Content-Type', $image['type'])
        ->withHeader('Content-Length', (string) strlen($image['bytes']))
        ->withHeader('Content-Disposition', 'inline; filename="' . $m[1] . '.' . IMAGE_TYPES[$image['type']] . '"');
});

// The anotoki library's route (TranslationsRoutes::bundle). No middleware for
// who is asking, on purpose: the words are the same for everybody, so a token -
// even one that would not check out - is not looked at, and a page whose
// sign-in has run out still reads in its language. A code that is none is a
// 404 before any query; the browser asks every time (ETag, no-cache) and is
// told "the same as you have" in a 304; without the tables or an English
// string - between an upload and its Apply, or the database out of reach -
// 503 translations_unavailable, and the pages read what they have.
TranslationsRoutes::bundle($app, static fn(): Translations => surveyTranslations(), respondRefusal(...));

// The pages' own errors (the anotoki library's route, the owner's decision of
// 2026-10-11: every site's error log holds its pages' errors too). Nobody's
// route - a visitor's page fails as anybody's does - so no Identify in front
// of it: who sends a report only says which budget it counts against (a
// token is checked as Identify checks one; one that does not check out counts
// as nobody's, never a refusal), and a visitor's key is never read here. The
// library caps it and redacts every text again; the log's own routes never
// write themselves into it.
ErrorLogRoutes::client($app, '/api/client-errors', $errorLog, surveyAdminContext());

// What every page is told as it starts (the anotoki library's route, the site
// settings - api/site_settings.php): whether the site is closed, the
// announcement, the pages Page access governs. A reserved path: it answers
// while the site is closed, and no page's row may claim it.
SiteSettingsRoutes::public($app, surveySiteSettings());

// robots.txt and sitemap.xml (the anotoki library's routes, the owner's request
// of 2026-10-25: every anotoki site answers both from its PHP). Behind the gate
// as any route: while the site cannot run, or is closed, a robot is told 503
// with Retry-After and keeps what it had.
RobotsRoutes::robots($app, surveyRobots());
RobotsRoutes::sitemap($app, surveyRobots());
