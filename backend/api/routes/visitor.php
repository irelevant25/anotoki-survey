<?php

declare(strict_types=1);

use Anotoki\Lib\Auth\Http\RequirePerson;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * At sign-in, what this browser answered as a visitor becomes the signed-in
 * person's - the one place the two meet, so it takes both: the person's token
 * (the library's RequirePerson; a visitor alone is refused - its key is not
 * even looked up here) and the visitor's key, which the route hands in.
 *
 *   POST /api/visitor/move   X-Visitor-Key: <key>   -> {found, moved, kept}
 *
 * In one transaction (visitorMoveInto()): a survey both answered keeps the
 * person's answers as they are, and the visitor's go (kept); every other answer
 * becomes the person's (moved); the visitor is gone, and its key opens nothing
 * from then on. A key nobody has - moved already by another tab, ended by the
 * clean-up, never there - is {found: false} with zeros, so the move may be asked
 * again safely. No key, or one that is not a key: 422 invalid_visitor_key. A
 * send of either at that moment: 503 visitor_move_retry (ask again).
 *
 * It works whether or not the IAM says this site requires sign-in: switching
 * that on stops a key from being somebody, not from being handed in with a
 * token - so what a visitor answered before still comes into their account
 * when they sign in. Never while a migration waits (the site gate).
 *
 * @var \Slim\App $app
 * @var \Anotoki\Lib\Auth\Http\Identify $identify   Identify that reads no visitor's key (api/index.php)
 * @var \Anotoki\Lib\People\Http\RecordPerson $recordPerson
 */

$app->post('/api/visitor/move', function (Request $request, Response $response): Response {
    $key = visitorKeyOf($request);
    if ($key === null) {
        throw new ApiError(422, 'invalid_visitor_key', 'The X-Visitor-Key header is required.');
    }
    if (!visitorKeyWellFormed($key)) {
        throw new ApiError(422, 'invalid_visitor_key', 'The X-Visitor-Key header is not a visitor key.');
    }

    return respondJson($response, visitorMoveInto(currentPerson($request), $key));
})->add($recordPerson)->add(new RequirePerson())->add($identify);
