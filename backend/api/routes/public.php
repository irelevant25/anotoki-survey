<?php

declare(strict_types=1);

use Anotoki\Lib\Auth\Http\AuthRoutes;
use Anotoki\Lib\Migrations\Http\MigrationsRoutes;
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
 *
 * Without the settings everything but the status is 503 not_set_up (the site
 * gate). The health, the sign-in settings and the strings are answered while a
 * migration waits (siteOpenWhileUpdating()); a picture, like everything else
 * of the site, is 503 update_pending then.
 *
 * @var \Slim\App $app
 * @var \Anotoki\Lib\Migrations\Http\SiteState $siteState
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
