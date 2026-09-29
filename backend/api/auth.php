<?php

declare(strict_types=1);

use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Who a request comes from: the access token of the anotoki IAM, checked here
 * with the vendored verifier (api/anotoki_iam.php, v1.0.1) - RS256, typ
 * at+jwt, the IAM's published keys, iss, aud, exp. Its `sub` is the user id,
 * its `roles` this site's roles for them:
 *
 *   EDITOR   writes surveys, opens and closes them, reads the results
 *   ADMIN    all of that, and deletes surveys and answers
 *
 * Anybody else signed in takes surveys. Roles are granted in the IAM's admin
 * console; taking one away reaches this site within one token's lifetime.
 * There is no other way in: no login of this site's own, no "no sign-in"
 * mode - a person is only ever who a verified token says.
 */

const ROLE_ADMIN = 'ADMIN';
const ROLE_EDITOR = 'EDITOR';

/** The roles that may use the admin area: write surveys and read the answers. */
const ROLES_STAFF = [ROLE_ADMIN, ROLE_EDITOR];

/** Who a request comes from, once the token is checked. */
final class SiteUser
{
    /** @param string[] $roles */
    public function __construct(
        public readonly int $id,
        public readonly ?string $name,
        public readonly ?string $email,
        public readonly array $roles,
    ) {
    }

    public function has(string ...$roles): bool
    {
        return array_intersect($roles, $this->roles) !== [];
    }
}

/** A path from the settings: relative ones are relative to backend/. */
function settingsPath(string $path): string
{
    return preg_match('~^([A-Za-z]:)?[\\\\/]~', $path) ? $path : SURVEY_BACKEND . '/' . $path;
}

/** The verifier's settings, from ours. */
function authIamConfig(): array
{
    $iam = iamSettings();
    $config = [
        'issuer' => rtrim((string) $iam['issuer'], '/'),
        'client_id' => (string) $iam['client_id'],
        'cache_dir' => settingsPath((string) $iam['cache_dir']),
    ];
    // The tests' own key set, instead of downloading the IAM's.
    if (is_string($iam['jwks_file'] ?? null) && $iam['jwks_file'] !== '') {
        $config['jwks_file'] = $iam['jwks_file'];
    }

    return $config;
}

/** What the browser needs to sign in: GET /api/auth/config. */
function authPublicConfig(): array
{
    $iam = iamSettings();

    return ['issuer' => rtrim((string) $iam['issuer'], '/'), 'clientId' => (string) $iam['client_id']];
}

/** 127.0.0.1 and the like, ::1, and the IPv4-mapped form of 127.x. */
function isLoopback(string $ip): bool
{
    if ($ip === '::1') {
        return true;
    }
    if (strncasecmp($ip, '::ffff:', 7) === 0) {
        $ip = substr($ip, 7);
    }

    return (bool) preg_match('/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/D', $ip);
}

/** A Host header naming this computer: localhost, [::1] or 127.x, with any port. */
function isLocalHostName(string $host): bool
{
    $name = strtolower((string) preg_replace('/:\d+$/', '', trim($host)));

    return $name === 'localhost' || $name === '[::1]' || isLoopback($name);
}

/**
 * Headers whose presence means a proxy relayed the request: then it did not
 * come from this computer, whatever REMOTE_ADDR says. (The same list as the
 * IAM's setup.)
 */
const FORWARDING_HEADERS = [
    'HTTP_FORWARDED', 'HTTP_X_FORWARDED_FOR', 'HTTP_X_FORWARDED_HOST', 'HTTP_X_FORWARDED_PROTO',
    'HTTP_X_REAL_IP', 'HTTP_CLIENT_IP', 'HTTP_TRUE_CLIENT_IP', 'HTTP_CF_CONNECTING_IP', 'HTTP_X_CLUSTER_CLIENT_IP',
];

/** Did a proxy relay this request? $server is $_SERVER (or a PSR-7 request's server params). */
function wasForwarded(array $server): bool
{
    foreach (FORWARDING_HEADERS as $header) {
        if (isset($server[$header]) && $server[$header] !== '') {
            return true;
        }
    }

    return false;
}

/**
 * Is this the developer's own computer asking - setup.php without its token?
 * Only under PHP's built-in web server (php -S), only for a request from this
 * computer that no proxy relayed, and only when the browser asked for this
 * computer by name: a page elsewhere that points its own host name at
 * 127.0.0.1 (DNS rebinding) would otherwise drive the setup. Under Apache - a
 * hosted site - never: behind a proxy every request looks local.
 */
function isThisComputer(string $sapi, string $remoteAddr, string $host, bool $forwarded = false): bool
{
    return !$forwarded && $sapi === 'cli-server' && isLoopback($remoteAddr) && isLocalHostName($host);
}

/** The same for an API request: may it be told what is missing, and which database is used? */
function askedFromThisComputer(Request $request): bool
{
    return isThisComputer(PHP_SAPI, requestRemoteAddr($request), $request->getHeaderLine('Host'), wasForwarded($request->getServerParams()));
}

/**
 * The person a request comes from, after recording the visit in users - or
 * null when it carries no token at all. ApiError 401 for a token that does not
 * check out. Why a token was refused goes to the server log, never to the
 * client: to somebody holding a token that did not work, the answer is the same.
 */
function requestUser(Request $request): ?SiteUser
{
    $header = $request->getHeaderLine('Authorization');
    $token = anotoki_iam_bearer_token($header !== '' ? $header : anotoki_iam_authorization_header());
    if ($token === null) {
        return null;
    }

    if (!function_exists('openssl_verify')) {
        throw new RuntimeException('Signing in needs PHP\'s openssl extension, and this PHP has none.');
    }

    $claims = anotoki_iam_verify_access_token($token, authIamConfig(), $reason);
    if ($claims === null) {
        error_log('[auth] token refused: ' . $reason);
        throw new ApiError(401, 'invalid_token', 'Your sign-in has run out. Please sign in again.', [
            'WWW-Authenticate' => 'Bearer realm="survey", error="invalid_token"',
        ]);
    }

    $id = (int) anotoki_iam_user_id($claims);
    $name = is_string($claims['preferred_username'] ?? null) && textTrim($claims['preferred_username']) !== '' ? textClip(textTrim($claims['preferred_username']), 200) : null;
    $email = is_string($claims['email'] ?? null) && textTrim($claims['email']) !== '' ? textClip(textTrim($claims['email']), 320) : null;
    usersSeen($id, $name, $email);

    return new SiteUser($id, $name, $email, anotoki_iam_roles($claims));
}

/**
 * Keeps the users row of a request's person: made on the first visit, the
 * name and address refreshed from the token when they change, last_seen_at at
 * most every five minutes.
 */
function usersSeen(int $id, ?string $name, ?string $email): void
{
    dbExec(
        "INSERT INTO users (id, preferred_username, email) VALUES (?, ?, ?)
         ON CONFLICT (id) DO UPDATE SET preferred_username = EXCLUDED.preferred_username, email = EXCLUDED.email, last_seen_at = now()
         WHERE users.preferred_username IS DISTINCT FROM EXCLUDED.preferred_username
            OR users.email IS DISTINCT FROM EXCLUDED.email
            OR users.last_seen_at < now() - interval '5 minutes'",
        [$id, $name, $email]
    );
}
