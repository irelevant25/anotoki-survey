<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * The surveys, for the people taking them. Anybody may look - a survey's
 * welcome says what it is about before anybody signs in - and whoever is
 * signed in also learns whether they have answered it. Answering takes a
 * sign-in, and happens once.
 *
 *   GET  /api/surveys                    {surveys: [{survey, answeredAt}]}: the ones taking answers now
 *   GET  /api/surveys/{slug}             {survey, answeredAt}: open or closed, never a draft
 *   POST /api/surveys/{slug}/responses   {aboutYou, answers, startedAt} -> 201 {id, submittedAt}
 *
 * @var \Slim\App $app
 */

$app->get('/api/surveys', function (Request $request, Response $response): Response {
    return respondJson($response, ['surveys' => surveysOpen(currentUser($request)?->id)]);
})->add(optionalUser());

$app->get('/api/surveys/{slug}', function (Request $request, Response $response, array $args): Response {
    return respondJson($response, surveyForParticipant((string) $args['slug'], currentUser($request)?->id));
})->add(optionalUser());

$app->post('/api/surveys/{slug}/responses', function (Request $request, Response $response, array $args): Response {
    return respondJson($response, responseSubmit(currentUser($request), (string) $args['slug'], jsonBody($request)), 201);
})->add(requireUser());
