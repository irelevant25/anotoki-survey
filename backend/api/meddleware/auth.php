<?php

declare(strict_types=1);

use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;
use Psr\Http\Server\RequestHandlerInterface as RequestHandler;

/**
 * Middleware: who the request comes from (requestUser() in api/auth.php), put
 * on the request as `user` - a SiteUser, or null for nobody signed in.
 *
 * The person only ever comes from here - a verified token - never from a body
 * or an address, so every "mine" below it is theirs.
 */

/** Anybody - `user` is null without a token. A token that does not check out is still 401. */
function optionalUser(): callable
{
    return function (Request $request, RequestHandler $handler): Response {
        return $handler->handle($request->withAttribute('user', requestUser($request)));
    };
}

/** Somebody signed in: 401 without a token. */
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
            throw new ApiError(403, 'forbidden', in_array(ROLE_EDITOR, $roles, true)
                ? 'This is for the people who write the surveys. Ask the site\'s administrator for the editor role.'
                : 'Only an administrator of the survey site may do this.');
        }

        return $handler->handle($request->withAttribute('user', $user));
    };
}

/** The person an outer middleware found, or the token's - 401 when there is nobody. */
function signedInUser(Request $request): SiteUser
{
    $user = currentUser($request) ?? requestUser($request);
    if ($user === null) {
        throw new ApiError(401, 'sign_in_required', 'Please sign in.', ['WWW-Authenticate' => 'Bearer realm="survey"']);
    }

    return $user;
}

/** The request's person - after optionalUser() (null for nobody), requireUser() or requireRole(). */
function currentUser(Request $request): ?SiteUser
{
    $user = $request->getAttribute('user');

    return $user instanceof SiteUser ? $user : null;
}
