<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * What anybody may ask, signed in or not:
 *
 *   GET /api/health               is the API up - and, asked from this computer,
 *                                 which database it uses and what it still needs
 *   GET /api/auth/config          how the browser signs in: {issuer, clientId}
 *   GET /api/images/{id}.{ext}    a survey's picture (see api/images.php)
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

$app->get('/api/auth/config', function (Request $request, Response $response): Response {
    return respondJson($response, authPublicConfig());
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
