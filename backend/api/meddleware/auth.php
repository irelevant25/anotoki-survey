<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;

/**
 * Middleware: who the request comes from, put on the request as `user`.
 *
 * A person only ever comes from here - a verified token (requestUser() in
 * api/auth.php) - never from a body or an address, so every "mine" below it
 * is theirs. Only an `Authorization: Bearer` header claims to be somebody
 * (authSentCredentials()): one whose token does not check out - an empty one
 * too - is 401 invalid_token, and nothing else is read; any other scheme (a
 * host's password file sends `Basic`) is nobody.
 *
 * Who a request is, on the surveys' own routes (requireTaker()), in this order:
 *
 *   1. a Bearer header: that person, or 401 - a bad token never falls back to a
 *      visitor key, which is not even read;
 *   2. else, while the IAM says this site requires sign-in (authLoginRequired()):
 *      401 sign_in_required - a visitor key sent is never looked up, nor seen;
 *   3. else an X-Visitor-Key: that visitor (api/visitors.php; a key that is
 *      nobody's, or not a key: 401 visitor_unknown);
 *   4. else nobody: the open surveys, and answers - which make a visitor.
 *
 * A visitor key makes somebody a visitor only in requireTaker(); the one other
 * reader is POST /api/visitor/move, which needs a verified token as well and
 * only hands the key in. Everything else is a verified token's alone:
 * requireUser() and requireRole() refuse a visitor as they refuse nobody (401
 * sign_in_required).
 */

/**
 * Somebody signed in: 401 without a token. Every route but the public ones
 * (api/routes/public.php) and the surveys' own (requireTaker()) takes it or
 * requireRole(): nothing else of the site reaches anybody without a token -
 * a survey's pictures aside, which an <img> loads with no token, by an
 * address nobody can guess.
 */
function requireUser(): callable
{
    return function (Request $request, RequestHandler $handler): Response {
        return $handler->handle($request->withAttribute('user', signedInUser($request)));
    };
}

/**
 * Somebody signed in with one of $roles: 401 without a token, 403 without the
 * role. It checks the token itself; inside a group that checked it already
 * (the admin routes, where deleting takes ADMIN on top), it asks the person
 * the group found.
 */
function requireRole(string ...$roles): callable
{
    return function (Request $request, RequestHandler $handler) use ($roles): Response {
        $user = signedInUser($request);
        if (!$user->has(...$roles)) {
            throw roleRefused($roles);
        }

        return $handler->handle($request->withAttribute('user', $user));
    };
}

/**
 * requireRole() judged from the token alone: the same 401 and 403, but
 * nothing read from or written to the database - requireRole() records the
 * visit in `users`. For the Migrations page's routes (routes/admin.php),
 * which must work on a database a pending migration has yet to build, from
 * nothing at all.
 */
function requireTokenRole(string ...$roles): callable
{
    return function (Request $request, RequestHandler $handler) use ($roles): Response {
        $user = requestUser($request, false);
        if ($user === null) {
            throw signInRequired();
        }
        if (!$user->has(...$roles)) {
            throw roleRefused($roles);
        }

        return $handler->handle($request->withAttribute('user', $user));
    };
}

/** The 403 of somebody signed in without one of $roles. */
function roleRefused(array $roles): ApiError
{
    return new ApiError(403, 'forbidden', in_array(ROLE_EDITOR, $roles, true)
        ? 'This is for the people who write the surveys. Ask the site\'s administrator for the editor role.'
        : 'Only an administrator of the survey site may do this.');
}

/**
 * Who takes the surveys: the person of a token; else - while the IAM says
 * sign-in is not required - the visitor of the request's key, or nobody (the
 * `user` attribute null). The order of the header comment above, exactly: the
 * IAM is asked only for a request that sends no token, and the key is read
 * only after it said "not required". Lets the visitors' clean-up run after the
 * answer, at most once an hour (visitorSweepSoon()).
 */
function requireTaker(): callable
{
    return function (Request $request, RequestHandler $handler): Response {
        $user = requestUser($request);
        if ($user === null) {
            if (authLoginRequired()) {
                throw signInRequired();
            }
            $key = visitorKeyOf($request);
            if ($key !== null) {
                $user = visitorFind($key);
            }
        }
        visitorSweepSoon();

        return $handler->handle($request->withAttribute('user', $user));
    };
}

/**
 * The person an outer middleware found, or the token's - 401 when there is
 * nobody, and for a visitor: a visitor is nobody here.
 */
function signedInUser(Request $request): SiteUser
{
    $user = currentUser($request);
    if ($user === null || $user->visitor) {
        $user = requestUser($request);
    }
    if ($user === null) {
        throw signInRequired();
    }

    return $user;
}

function signInRequired(): ApiError
{
    return new ApiError(401, 'sign_in_required', 'Please sign in.', ['WWW-Authenticate' => 'Bearer realm="survey"']);
}

/**
 * The request's person - after requireUser() or requireRole(); after
 * requireTaker() the person or the visitor, null for nobody; null on a route
 * with none of them.
 */
function currentUser(Request $request): ?SiteUser
{
    $user = $request->getAttribute('user');

    return $user instanceof SiteUser ? $user : null;
}
