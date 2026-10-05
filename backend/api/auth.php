<?php

declare(strict_types=1);

use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Who a request comes from: the access token of the anotoki IAM, checked here
 * with the vendored SDK (api/anotoki_iam.php, v1.1.0) - RS256, typ at+jwt, the
 * IAM's published keys, iss, aud, exp. Its `sub` is the user id, its `roles`
 * this site's roles for them:
 *
 *   MEMBER   every account holds it: an ordinary person, who takes surveys
 *   EDITOR   writes surveys, opens and closes them, reads the results
 *   ADMIN    all of that, deletes surveys and answers, applies migrations
 *
 * Anybody signed in takes surveys; no check here asks for MEMBER (the IAM
 * decided who may sign in). Roles are granted in the IAM's admin panel; taking
 * one away reaches this site within one token's lifetime - taking MEMBER away
 * makes the IAM refuse the person's next sign-in and refresh. There is no
 * login of this site's own: a person is only ever who a verified token says.
 *
 * The IAM also says whether this site requires sign-in at all
 * (authLoginRequired(): its "Sign-in required" switch, read through the SDK and
 * relayed to the browser by GET /api/auth/config). While it is off, somebody
 * who sends no token may take the open surveys as a visitor (api/visitors.php):
 * a SiteUser with a negative id, `visitor` true and no roles, known by a key the
 * server made - read only by requireTaker(), on the surveys' own routes. A
 * visitor never passes requireUser() / requireRole(): those are a verified
 * token's alone.
 */

const ROLE_ADMIN = 'ADMIN';
const ROLE_EDITOR = 'EDITOR';

/** The roles that may use the admin area: write surveys and read the answers. */
const ROLES_STAFF = [ROLE_ADMIN, ROLE_EDITOR];

/**
 * Who a request comes from, once the token is checked - or, on the surveys'
 * own routes, a visitor (`visitor` true: a negative id, no name, no roles).
 */
final class SiteUser
{
    /** @param string[] $roles */
    public function __construct(
        public readonly int $id,
        public readonly ?string $name,
        public readonly ?string $email,
        public readonly array $roles,
        public readonly bool $visitor = false,
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

/** The SDK's settings (the verifier's and the switch reader's), from ours. */
function authIamConfig(): array
{
    $iam = iamSettings();
    $config = [
        'issuer' => rtrim((string) $iam['issuer'], '/'),
        'client_id' => (string) $iam['client_id'],
        'cache_dir' => settingsPath((string) $iam['cache_dir']),
    ];
    // The tests' own key set, instead of downloading the IAM's; and their own
    // answer to "is sign-in required here" (a file whose content is the IAM's
    // answer - missing: the IAM out of reach), instead of asking it.
    foreach (['jwks_file', 'application_file'] as $key) {
        if (is_string($iam[$key] ?? null) && $iam[$key] !== '') {
            $config[$key] = $iam[$key];
        }
    }
    // How long the IAM's sign-in answer is kept (60 s by default): a browser
    // check that flips the switch sets 1.
    if (is_int($iam['application_ttl'] ?? null) && $iam['application_ttl'] >= 1) {
        $config['application_ttl'] = $iam['application_ttl'];
    }

    return $config;
}

/**
 * Does this site require sign-in? The IAM's "Sign-in required" switch for this
 * application, read by the SDK (anotoki_iam_login_required()): kept for a
 * minute in cache_dir - a folder only this site writes, since the kept answer
 * is what would open the site to visitors - and true whenever nothing better is
 * known: an application the IAM does not know (404), or an IAM never reached.
 * One answer for the whole request.
 */
function authLoginRequired(): bool
{
    $required = anotoki_iam_login_required(authIamConfig(), $reason);
    if ($reason === 'stale' || $reason === 'never_read') {
        error_log('[auth] the IAM did not say whether sign-in is required (' . $reason . '): ' . ($required ? 'required' : 'not required, as it said last'));
    }

    return $required;
}

/**
 * What the browser needs to sign in: GET /api/auth/config - whether it must,
 * and how many days a visitor's browser is remembered after its last visit
 * (the visitor settings' keep_days: what the page tells a visitor).
 */
function authPublicConfig(): array
{
    $iam = iamSettings();

    return [
        'issuer' => rtrim((string) $iam['issuer'], '/'),
        'clientId' => (string) $iam['client_id'],
        'loginRequired' => authLoginRequired(),
        'visitorDays' => visitorSettings()['keep_days'],
    ];
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

/** The request's Authorization header, however the server passed it ('' for none). */
function authHeader(Request $request): string
{
    $header = $request->getHeaderLine('Authorization');

    return $header !== '' ? $header : (string) anotoki_iam_authorization_header();
}

/**
 * Does the request claim to be somebody? Only the Bearer scheme counts, with or
 * without a token after it: `Basic ...` is what a host behind a password file
 * sends with every request, and says nothing about who is using the site.
 */
function authSentCredentials(Request $request): bool
{
    return anotoki_iam_sent_bearer(authHeader($request));
}

/**
 * The person a request comes from, after recording the visit in users - or
 * null when it claims to be nobody (no Bearer header; another scheme is not
 * looked at). ApiError 401 for a Bearer header whose token does not check out,
 * an empty one included: a request that claims to be somebody is that person or
 * nothing, never somebody signed out. Why a token was refused goes to the
 * server log, never to the client: to somebody holding a token that did not
 * work, the answer is the same.
 */
function requestUser(Request $request): ?SiteUser
{
    if (!authSentCredentials($request)) {
        return null;
    }
    $token = anotoki_iam_bearer_token(authHeader($request));
    if ($token === null) {
        error_log('[auth] token refused: a Bearer header with no token');
        throw authTokenRefused();
    }

    if (!function_exists('openssl_verify')) {
        throw new RuntimeException('Signing in needs PHP\'s openssl extension, and this PHP has none.');
    }

    $claims = anotoki_iam_verify_access_token($token, authIamConfig(), $reason);
    if ($claims === null) {
        error_log('[auth] token refused: ' . $reason);
        throw authTokenRefused();
    }

    $id = (int) anotoki_iam_user_id($claims);
    $name = is_string($claims['preferred_username'] ?? null) && textTrim($claims['preferred_username']) !== '' ? textClip(textTrim($claims['preferred_username']), 200) : null;
    $email = is_string($claims['email'] ?? null) && textTrim($claims['email']) !== '' ? textClip(textTrim($claims['email']), 320) : null;
    usersSeen($id, $name, $email);

    return new SiteUser($id, $name, $email, anotoki_iam_roles($claims));
}

/** The one answer to a Bearer header that names nobody: the same whatever the reason. */
function authTokenRefused(): ApiError
{
    return new ApiError(401, 'invalid_token', 'Your sign-in has run out. Please sign in again.', [
        'WWW-Authenticate' => 'Bearer realm="survey", error="invalid_token"',
    ]);
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
