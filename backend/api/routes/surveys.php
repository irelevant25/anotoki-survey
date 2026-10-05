<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * The surveys, for the people taking them. Who is asking is requireTaker()'s
 * (api/meddleware/auth.php): somebody signed in - or, while the IAM says this
 * site does not require sign-in, a visitor (the X-Visitor-Key the server gave
 * this browser) or nobody yet. With sign-in required, all three answer 401
 * sign_in_required without a token. Nothing here ever reaches a survey that is
 * a draft, or anybody's answers but the asker's own (its pictures aside: an
 * <img> sends no token, so routes/public.php serves them by their UUID address).
 * Each answer says whether the asker has answered the survey (nobody: never);
 * answering happens once - a visitor's answers are counted like a person's.
 *
 *   GET  /api/surveys                    {surveys: [{survey, answeredAt}]}: the ones taking answers now
 *   GET  /api/surveys/{slug}             {survey, answeredAt}: open or closed, never a draft
 *   POST /api/surveys/{slug}/responses   {aboutYou, answers, startedAt, language} -> 201 {id, submittedAt};
 *                                        `language`: the one the survey was read in - kept when it is
 *                                        one of the survey's, never a reason to refuse the answers.
 *                                        From nobody, answers that are kept make a visitor: the 201
 *                                        carries its key in the X-Visitor-Key header (nowhere else),
 *                                        or it is 429 too_many_visitors and nothing is kept
 *
 * @var \Slim\App $app
 */

$app->get('/api/surveys', function (Request $request, Response $response): Response {
    return respondJson($response, ['surveys' => surveysOpen(currentUser($request)?->id)]);
})->add(requireTaker());

$app->get('/api/surveys/{slug}', function (Request $request, Response $response, array $args): Response {
    return respondJson($response, surveyForParticipant((string) $args['slug'], currentUser($request)?->id));
})->add(requireTaker());

$app->post('/api/surveys/{slug}/responses', function (Request $request, Response $response, array $args): Response {
    $saved = responseSubmit(currentUser($request), (string) $args['slug'], jsonBody($request), $request);
    $response = respondJson($response, ['id' => $saved['id'], 'submittedAt' => $saved['submittedAt']], 201);
    if (isset($saved['visitorKey'])) {
        $response = $response->withHeader(VISITOR_HEADER, $saved['visitorKey'])->withHeader('Cache-Control', 'no-store');
    }

    return $response;
})->add(requireTaker());
