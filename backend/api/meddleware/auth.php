<?php

declare(strict_types=1);

use Anotoki\Lib\Auth\Http\RequireRole;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;

/**
 * Who may ask what: the anotoki family's checks (anotoki-lib 0.5.1,
 * Anotoki\Lib\Auth\Http), in this site's words. Every route that needs
 * somebody has the library's Identify in front of it (surveyIdentify(),
 * api/auth.php) - who the request is, once - and then one of:
 *
 *   RequirePerson             somebody signed in: 401 sign_in_required for
 *                             nobody, and for a visitor
 *   requireStaff()            EDITOR or ADMIN, from the token (the admin area): 401, or
 *                             403 forbidden in this site's sentence
 *   requireAdmin()            ADMIN alone, from the token (what cannot be undone, the
 *                             migrations, the admin tools): the same
 *   RequireCaller(...)        the surveys' own routes: a person, a visitor - or, while the
 *                             IAM says sign-in is not required, nobody ('empty': the open
 *                             surveys; 'make': answers that make a visitor). While sign-in
 *                             is required, nobody is 401 sign_in_required
 *
 * The roles come from the token alone, never the database: the Migrations
 * routes, the error log's and the backups' work on a database a pending
 * migration has yet to build - from nothing at all. A person's row in users
 * is kept (the library's RecordPerson, api/people.php) on the routes that
 * read or write the site's data, never on those.
 *
 * Only an `Authorization: Bearer` header claims to be somebody: one whose
 * token does not check out - an empty one too - is 401 invalid_token, and
 * nothing else is read; any other scheme (a host's password file sends
 * `Basic`) is nobody. A visitor key makes somebody a visitor only on the
 * surveys' own routes (surveyIdentify(..., visitors: true)); the one other
 * reader of X-Visitor-Key is POST /api/visitor/move, which needs a verified
 * token as well and only hands the key in.
 */

/** EDITOR or ADMIN: the admin area - writing surveys and reading the answers, the site's words. */
function requireStaff(): RequireRole
{
    return RequireRole::any(...ROLES_STAFF)->refusing('forbidden', 'This is for the people who write the surveys. Ask the site\'s administrator for the editor role.');
}

/** ADMIN alone: deleting, the database's migrations, the people, the error log, the audit log, the backups. */
function requireAdmin(): RequireRole
{
    return RequireRole::admin()->refusing('forbidden', 'Only an administrator of the survey site may do this.');
}

/**
 * $check for one method of a group only; the group's other methods pass as
 * they came. For the languages' routes - the anotoki library's, one group
 * (routes/admin.php): an editor adds, renames, orders and switches a language
 * off, as ever; deleting one is an administrator's, as deleting anything is.
 */
function requireFor(string $method, MiddlewareInterface $check): callable
{
    return function (Request $request, RequestHandler $handler) use ($method, $check): Response {
        return strtoupper($request->getMethod()) === strtoupper($method) ? $check->process($request, $handler) : $handler->handle($request);
    };
}

/**
 * On the surveys' own routes: lets the visitors' clean-up run after the
 * answer, at most once an hour (visitorSweepSoon(), api/visitors.php).
 */
function sweepVisitorsSoon(): callable
{
    return function (Request $request, RequestHandler $handler): Response {
        visitorSweepSoon();

        return $handler->handle($request);
    };
}
