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
 * that are not there - and the answer then says `update: true`. The frontend
 * shows its "not set up yet" page on that code.
 *
 * /api/health answers either way (it says itself what is missing).
 *
 * While only a migration waits, what an administrator needs to apply it is
 * let through (SETUP_GATE_OPEN_WHILE_BEHIND), with the request marked
 * `databaseBehind`: the sign-in's settings, the site's strings (read-only -
 * the boot pages and the admin panel's bar are worded with them), and the
 * migrations routes - still behind a verified token and the ADMIN role
 * (routes/admin.php). Never while the settings are missing: then there is no
 * database to update, and setup.php is the way.
 */
function setupGate(): callable
{
    return function (Request $request, RequestHandler $handler): Response {
        $path = $request->getUri()->getPath();
        if ($path === '/api/health') {
            return $handler->handle($request);
        }

        $problem = settingsProblem();
        $update = false;
        if ($problem === null && pendingMigrationsReadOnly(db()) !== []) {
            if (setupGateOpenWhileBehind($path)) {
                return $handler->handle($request->withAttribute('databaseBehind', true));
            }
            $problem = 'The database needs an update: an administrator applies it on the admin panel\'s Migrations page, or open /setup.php.';
            $update = true;
        }
        if ($problem === null) {
            return $handler->handle($request);
        }

        // What is missing, for whoever sits at this computer; a visitor of a
        // half-installed site only learns that it is not ready.
        $extra = ['setup' => '/setup.php'];
        if ($update) {
            $extra['update'] = true;
        }
        if (askedFromThisComputer($request)) {
            $extra['detail'] = $problem;
        }

        return respondError(new \Slim\Psr7\Response(), 503, 'not_set_up', $update ? notUpToDateMessage() : notSetUpMessage(), [], $extra);
    };
}

/** The addresses answered while the database waits for a migration: exact paths, and the strings of a language. */
const SETUP_GATE_OPEN_WHILE_BEHIND = ['/api/auth/config', '/api/admin/migrations', '/api/admin/migrations/apply'];

function setupGateOpenWhileBehind(string $path): bool
{
    return in_array($path, SETUP_GATE_OPEN_WHILE_BEHIND, true) || (bool) preg_match('~^/api/translations/[^/]+$~D', $path);
}

function notSetUpMessage(): string
{
    return 'The survey site is not set up yet. Open /setup.php to set it up.';
}

function notUpToDateMessage(): string
{
    return 'The survey site\'s database needs an update. An administrator applies it on the admin panel\'s Migrations page, or with /setup.php.';
}
