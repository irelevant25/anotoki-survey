<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;

/**
 * Middleware: nothing runs before the site is set up.
 *
 * Without config/database.local.php and config/iam.local.php (see
 * config/config.php) every request is answered 503 {code: "not_set_up"}, with
 * the address of the setup page. The same when the database is behind the code
 * - a migration not applied yet: nothing is read from, or written into, tables
 * that are not there. The frontend shows its "not set up yet" page on that code.
 *
 * /api/health answers either way (it says itself what is missing).
 */
function setupGate(): callable
{
    return function (Request $request, RequestHandler $handler): Response {
        if ($request->getUri()->getPath() === '/api/health') {
            return $handler->handle($request);
        }

        $problem = settingsProblem();
        if ($problem === null && pendingMigrationsReadOnly(db()) !== []) {
            $problem = 'The database needs an update: open /setup.php to apply it.';
        }
        if ($problem === null) {
            return $handler->handle($request);
        }

        // What is missing, for whoever sits at this computer; a visitor of a
        // half-installed site only learns that it is not ready.
        $extra = ['setup' => '/setup.php'];
        if (askedFromThisComputer($request)) {
            $extra['detail'] = $problem;
        }

        return respondError(new \Slim\Psr7\Response(), 503, 'not_set_up', notSetUpMessage(), [], $extra);
    };
}

function notSetUpMessage(): string
{
    return 'The survey site is not set up yet. Open /setup.php to set it up.';
}
