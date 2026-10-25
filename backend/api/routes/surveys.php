<?php

declare(strict_types=1);

use Anotoki\Lib\Auth\Http\RequireCaller;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * The surveys, for the people taking them. Who is asking is the anotoki
 * library's to say (Identify with this site's visitors, api/auth.php; then
 * RequireCaller): somebody signed in - or, while the IAM says this site does
 * not require sign-in, a visitor (the X-Visitor-Key the server gave this
 * browser) or nobody yet. With sign-in required, all three answer 401
 * sign_in_required without a token, and a key is not even read. Nothing here
 * ever reaches a survey that is a draft, or anybody's answers but the asker's
 * own (its pictures aside: an <img> sends no token, so routes/public.php serves
 * them by their UUID address). Each answer says whether the asker has answered
 * the survey (nobody: never); answering happens once - a visitor's answers are
 * counted like a person's. A person's row in users is kept (RecordPerson); the
 * visitors' clean-up may run after the answer (sweepVisitorsSoon()).
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
 * Page access (the site settings' third part, api/site_settings.php) may
 * govern these pages - the list (/) and a survey (/{slug}) - and refuse their
 * API paths with them: 423 page_locked to whoever the page is not shown to,
 * after the caller's own check (the library's PageAccessGate, $pageAccess).
 *
 * @var \Slim\App $app
 * @var \Anotoki\Lib\Auth\Http\Identify $identifyTaker   Identify that reads a visitor's key (api/index.php)
 * @var \Anotoki\Lib\People\Http\RecordPerson $recordPerson
 * @var \Anotoki\Lib\SiteSettings\Http\PageAccessGate $pageAccess
 */

$app->get('/api/surveys', function (Request $request, Response $response): Response {
    return respondJson($response, ['surveys' => surveysOpen(currentUser($request)?->id)]);
})
    ->add(sweepVisitorsSoon())
    ->add($pageAccess)
    ->add(new RequireCaller(RequireCaller::EMPTY))
    ->add($recordPerson)
    ->add($identifyTaker);

$app->get('/api/surveys/{slug}', function (Request $request, Response $response, array $args): Response {
    return respondJson($response, surveyForParticipant((string) $args['slug'], currentUser($request)?->id));
})
    ->add(sweepVisitorsSoon())
    ->add($pageAccess)
    ->add(new RequireCaller(RequireCaller::EMPTY))
    ->add($recordPerson)
    ->add($identifyTaker);

$app->post('/api/surveys/{slug}/responses', function (Request $request, Response $response, array $args): Response {
    $saved = responseSubmit(currentUser($request), (string) $args['slug'], jsonBody($request), $request);
    $response = respondJson($response, ['id' => $saved['id'], 'submittedAt' => $saved['submittedAt']], 201);
    if (isset($saved['visitorKey'])) {
        $response = $response->withHeader(VISITOR_HEADER, $saved['visitorKey'])->withHeader('Cache-Control', 'no-store');
    }

    return $response;
})
    ->add(sweepVisitorsSoon())
    ->add($pageAccess)
    ->add(new RequireCaller(RequireCaller::MAKE))
    ->add($recordPerson)
    ->add($identifyTaker);
