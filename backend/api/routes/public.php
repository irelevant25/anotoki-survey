<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * What anybody may ask, signed in or not:
 *
 *   GET /api/health               is the API up - and, asked from this computer,
 *                                 which database it uses and what it still needs
 *   GET /api/auth/config          how the browser signs in: {issuer, clientId,
 *                                 loginRequired, visitorDays} - the IAM's "Sign-in
 *                                 required", true unless it said otherwise; visitorDays
 *                                 is keep_days, the days the visitor notice tells people
 *                                 their browser is remembered - and update: true
 *                                 while a migration waits
 *   GET /api/images/{id}.{ext}    a survey's picture (see api/images.php)
 *   GET /api/translations/{code}  the site's own words in a language, with the
 *                                 languages on offer (see api/translations.php);
 *                                 "sk-sk" is answered by "sk" when only that is offered
 *
 * The health, the sign-in settings and the strings are answered while the
 * database waits for a migration as well (meddleware/setup.php); a picture,
 * like everything else of the site, is 503 not_set_up then.
 *
 * @var \Slim\App $app
 */

$app->get('/api/health', function (Request $request, Response $response): Response {
    $problem = settingsProblem();
    $health = ['ok' => $problem === null];

    if (askedFromThisComputer($request)) {
        $health['problem'] = $problem;
        if ($problem === null) {
            $health['database'] = dbName();
            $health['pending'] = pendingMigrationsReadOnly(db());
        }
    }

    return respondJson($response, $health, $problem === null ? 200 : 503);
});

// Answered while the database waits for a migration too (the setup gate lets
// it through): an administrator must be able to sign in to apply it. It then
// says so - `update: true` - and the site draws its "not set up yet" page,
// with a link to the Migrations page for an ADMIN. `loginRequired` relays the
// IAM's "Sign-in required" switch (authLoginRequired()), so the browser never
// asks the IAM for it.
$app->get('/api/auth/config', function (Request $request, Response $response): Response {
    return respondJson($response, authPublicConfig() + ($request->getAttribute('databaseBehind') === true ? ['update' => true] : []));
});

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

// No middleware for who is asking, on purpose: the words are the same for
// everybody, so a token - even one that would not check out - is not looked at,
// and a page whose sign-in has run out still reads in its language.
$app->get('/api/translations/{code}', function (Request $request, Response $response, array $args): Response {
    // Before any query: only a code is looked up (a wrong address is a 404, not
    // a database refusing bytes that are not text).
    $code = (string) $args['code'];
    if (!languageCodeOk($code)) {
        throw new ApiError(404, 'not_found', 'There is no such language.');
    }

    // The strings change when somebody saves one in the admin area, or with a
    // release: the browser asks every time (no-cache) and is told "the same as
    // you have" in a few bytes. Both headers are set before that answer, so it
    // carries them too - without them it would go out as no-store. The tag is
    // compared as it may come back from behind a server that compresses
    // (translationsNotModified).
    $body = jsonText(translationBundle($code));
    $etag = '"' . md5($body) . '"';
    $response = $response->withHeader('ETag', $etag)->withHeader('Cache-Control', 'no-cache');
    if (translationsNotModified($request->getHeaderLine('If-None-Match'), $etag)) {
        return $response->withStatus(304);
    }

    $response->getBody()->write($body);

    return $response->withHeader('Content-Type', 'application/json; charset=utf-8');
});
