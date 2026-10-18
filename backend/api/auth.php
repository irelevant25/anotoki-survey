<?php

declare(strict_types=1);

use Anotoki\Lib\Auth\AccessTokens;
use Anotoki\Lib\Auth\Http\AuthRoutes;
use Anotoki\Lib\Auth\Http\Identify;
use Anotoki\Lib\Auth\IamClient;
use Anotoki\Lib\Auth\Person;
use Anotoki\Lib\Auth\SignInRule;
use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Who a request comes from: the access token of the anotoki IAM, checked by
 * the anotoki family's library (anotoki-lib 0.5.1's auth module,
 * Anotoki\Lib\Auth - the IAM's SDK moved into the library: RS256 and typ
 * at+jwt pinned, the IAM's published keys, iss, aud, exp). Its `sub` is the
 * user id, its `roles` this site's roles for them:
 *
 *   MEMBER   every account holds it: an ordinary person, who takes surveys
 *   EDITOR   writes surveys, opens and closes them, reads the results
 *   ADMIN    all of that, deletes surveys and answers, applies migrations,
 *            and the admin tools: the people, the error log, the audit log,
 *            the backups
 *
 * Anybody signed in takes surveys; no check here asks for MEMBER (the IAM
 * decided who may sign in). Roles are granted in the IAM's admin panel; taking
 * one away reaches this site within one token's lifetime - taking MEMBER away
 * makes the IAM refuse the person's next sign-in and refresh. There is no
 * login of this site's own: a person is only ever who a verified token says.
 *
 * The IAM also says whether this site requires sign-in at all (its "Sign-in
 * required" switch, read by the library's SignInRule: kept a minute in
 * cache_dir, and true whenever nothing better is known) - relayed to the
 * browser by GET /api/auth/config (the library's AuthRoutes). While it is
 * off, somebody who sends no token may take the open surveys as a visitor
 * (api/visitors.php): a SiteUser with a negative id, `visitor` true and no
 * roles, known by a key the server made - read only on the surveys' own
 * routes (routes/surveys.php). A visitor never passes a person's or a role's
 * check: those are a verified token's alone.
 *
 * What the settings say of the IAM (config/iam.local.php) are the SDK's keys,
 * which the library reads as they are (IamClient::fromArray()).
 */

const ROLE_ADMIN = 'ADMIN';
const ROLE_EDITOR = 'EDITOR';

/** The roles that may use the admin area: write surveys and read the answers. */
const ROLES_STAFF = [ROLE_ADMIN, ROLE_EDITOR];

/**
 * Who a request comes from, as this site's code takes it: the token's person
 * (Person, the library's) - or, on the surveys' own routes, a visitor
 * (`visitor` true: a negative id, no name, no roles).
 */
final class SiteUser
{
    /** @param string[] $roles */
    public function __construct(public readonly int $id, public readonly ?string $name, public readonly array $roles, public readonly bool $visitor = false) {}

    /** The token's person: the IAM's id, the name its token carries (trimmed as the browser trims, at most 200 characters), the roles. */
    public static function of(Person $person): self
    {
        $name = $person->name === null ? '' : textTrim($person->name);

        return new self($person->sub, $name === '' ? null : textClip($name, 200), $person->roles);
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

/**
 * The IAM's settings as the library takes them (the SDK's keys): the issuer,
 * this site's client id and the folder the IAM's keys and answers are kept in
 * - a private one of the site's own. And the tests' seams: their own key set
 * (jwks_file) instead of downloading the IAM's, their own answer to "is
 * sign-in required here" (application_file: a file whose content is the IAM's
 * answer - missing: the IAM out of reach) and their own list of deleted
 * accounts (anonymized_file), instead of asking it; and how long the answer
 * about signing in is kept (60 s by default: a browser check that flips the
 * switch sets 1).
 */
function authIamConfig(): array
{
    $iam = iamSettings();
    $config = [
        'issuer' => rtrim((string) $iam['issuer'], '/'),
        'client_id' => (string) $iam['client_id'],
        'cache_dir' => settingsPath((string) $iam['cache_dir']),
    ];
    foreach (['jwks_file', 'application_file', 'anonymized_file'] as $key) {
        if (is_string($iam[$key] ?? null) && $iam[$key] !== '') {
            $config[$key] = $iam[$key];
        }
    }
    if (is_int($iam['application_ttl'] ?? null) && $iam['application_ttl'] >= 1) {
        $config['application_ttl'] = $iam['application_ttl'];
    }

    return $config;
}

/**
 * The IAM, as the library reads and asks it. Made again whenever the settings
 * say something else (setup.php writes them; a test switches them). While the
 * site is not set up it names no IAM - every token refused, sign-in required -
 * though the site gate answers every route but the status before anybody asks.
 */
function surveyIam(): IamClient
{
    static $made = [];

    $config = settingsProblem() === null ? authIamConfig() : ['cache_dir' => storageDir() . '/cache'];
    $key = (string) json_encode($config);

    return $made[$key] ??= IamClient::fromArray($config);
}

/**
 * Whether this site requires sign-in: the IAM's "Sign-in required" switch for
 * this application (the library's SignInRule) - kept for a minute in
 * cache_dir, a folder only this site writes, since the kept answer is what
 * would open the site to visitors; and true whenever nothing better is known:
 * an application the IAM does not know (404), or an IAM never reached. One
 * answer for a whole request (Identify asks it again for each; reset() for a
 * test's next "request").
 */
function surveySignInRule(): SignInRule
{
    static $rules = [];

    $iam = surveyIam();

    return $rules[spl_object_id($iam)] ??= new SignInRule($iam);
}

/**
 * Does this site require sign-in? surveySignInRule()'s answer (the library
 * says in the log when the IAM did not say, and what it went by).
 */
function authLoginRequired(): bool
{
    return surveySignInRule()->required();
}

/**
 * What the browser needs to sign in: GET /api/auth/config (the library's
 * AuthRoutes, routes/public.php) - the IAM, this site's client id, whether it
 * must sign in (login_required), whether the IAM knows the site at all
 * (sign_in_available) - and how many days a visitor's browser is remembered
 * after its last visit (visitor_days: the visitor settings' keep_days, what
 * the page tells a visitor).
 *
 * @return array<string, mixed>
 */
function authPublicConfig(): array
{
    return AuthRoutes::configBody(surveySignInRule(), surveyIam(), authConfigExtra(...));
}

/** This site's own field of the boot configuration. */
function authConfigExtra(): array
{
    return ['visitor_days' => visitorSettings()['keep_days']];
}

/**
 * Who a request is, once, for the routes it is put in front of (the
 * library's Identify): a Bearer header is a person - a verified token - or 401
 * invalid_token, never anybody else; otherwise, with $visitors and while the
 * IAM says sign-in is not required, an X-Visitor-Key is that visitor
 * (visitorFound(), api/visitors.php) or 401 visitor_unknown; otherwise nobody.
 * Without $visitors a key is never read - the surveys' own routes alone take
 * one (routes/surveys.php). Refusals in this site's error body
 * ({error, code}), the realm the site's name.
 *
 * Never in front of what anybody may ask whatever they carry - the site's
 * status, the sign-in's settings, the strings, a picture: a token that has run
 * out would make them a 401.
 */
function surveyIdentify(ResponseFactoryInterface $responses, bool $visitors = false): Identify
{
    return new Identify(new AccessTokens(surveyIam()), surveySignInRule(), $responses, visitor: $visitors ? visitorFound(...) : null, responder: respondRefusal(...), realm: 'survey');
}

/**
 * The request's person - the token's - or its visitor, as this site's code
 * takes them (after Identify, on the routes it is in front of); null for
 * nobody, and on a route without Identify.
 */
function currentUser(Request $request): ?SiteUser
{
    $person = Identify::person($request);
    if ($person !== null) {
        return SiteUser::of($person);
    }
    $visitor = Identify::visitor($request);

    return $visitor instanceof SiteUser ? $visitor : null;
}

/** The request's person - never a visitor - or null (a route's check makes sure there is one). */
function currentPerson(Request $request): ?SiteUser
{
    $person = Identify::person($request);

    return $person === null ? null : SiteUser::of($person);
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
    'HTTP_FORWARDED',
    'HTTP_X_FORWARDED_FOR',
    'HTTP_X_FORWARDED_HOST',
    'HTTP_X_FORWARDED_PROTO',
    'HTTP_X_REAL_IP',
    'HTTP_CLIENT_IP',
    'HTTP_TRUE_CLIENT_IP',
    'HTTP_CF_CONNECTING_IP',
    'HTTP_X_CLUSTER_CLIENT_IP',
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
