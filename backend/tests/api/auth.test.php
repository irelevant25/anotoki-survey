<?php

// Signing in through the real server: access tokens the tests sign with their
// own key (the IAM SDK's test helpers), checked against a JWKS file - and once
// against a key set the server downloads from the stand-in IAM. A token that
// does not check out is refused, and nothing else is ever taken for one.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const ANNA = 101;

$GLOBALS['app'] = null;
before(function (): void {
    $GLOBALS['app'] = start_app();
});

function with_token(string $token, string $method = 'GET', string $url = '/api/admin/surveys'): array
{
    return call($GLOBALS['app']['base'], $method, $url, null, bearer($token));
}

test('the sign-in settings the browser reads, without a token', function (): void {
    $config = call($GLOBALS['app']['base'], 'GET', '/api/auth/config');
    assert_same(200, $config['status']);
    assert_same(['issuer' => TEST_ISSUER, 'clientId' => 'survey', 'loginRequired' => true, 'visitorDays' => 30], $config['body'], 'the IAM never reached: sign-in required; a visitor\'s browser remembered for 30 days');
    assert_same('no-store', $config['headers']['cache-control'] ?? null);
    assert_same('nosniff', $config['headers']['x-content-type-options'] ?? null);
});

test('a good token: the person is recorded from it, and their roles are this site\'s', function (): void {
    assert_same(200, with_token(test_token(ANNA, ['EDITOR']))['status']);
    assert_same(['id' => ANNA, 'preferred_username' => 'user' . ANNA, 'email' => 'user' . ANNA . '@example.test'], dbOne('SELECT id, preferred_username, email FROM users WHERE id = ?', [ANNA]));
    assert_same(200, with_token(test_token(ANNA, ['editor']))['status'], 'a role in any case');
    assert_same(403, with_token(test_token(ANNA, ['MEMBER']))['status'], 'MEMBER - every account holds it - is an ordinary person: no admin panel');
    assert_same(200, with_token(test_token(ANNA, ['MEMBER']), 'GET', '/api/surveys')['status'], 'MEMBER alone takes surveys');
    assert_same(403, with_token(test_token(ANNA, ['SOMETHING']))['status'], 'a role this site does not have is no role here');
    assert_same(200, with_token(test_token(ANNA), 'GET', '/api/surveys')['status'], 'no role: still somebody who takes surveys');

    with_token(test_token(ANNA, [], ['preferred_username' => 'anna', 'email' => 'anna@example.test']), 'GET', '/api/surveys');
    assert_same(['anna', 'anna@example.test'], array_values(dbOne('SELECT preferred_username, email FROM users WHERE id = ?', [ANNA])), 'a new name arrives with the next request');
});

test('tokens that are not good are refused, and say only that', function (): void {
    $other = anotoki_iam_test_keypair('survey-test-key'); // the same kid, another key: a forgery
    $bad = [
        'expired' => test_token(ANNA, ['ADMIN'], ['exp' => time() - 120]),
        'for another application' => test_token(ANNA, ['ADMIN'], ['aud' => 'genshin']),
        'from another issuer' => test_token(ANNA, ['ADMIN'], ['iss' => 'https://evil.example']),
        'an ID token (typ JWT)' => test_token(ANNA, ['ADMIN'], [], ['typ' => 'JWT']),
        'alg none' => test_token(ANNA, ['ADMIN'], [], ['alg' => 'none']),
        'an unknown key' => test_token(ANNA, ['ADMIN'], [], ['kid' => 'nope']),
        'signed with another key' => test_token(ANNA, ['ADMIN'], [], ['keys' => $other]),
        'no subject' => test_token(ANNA, ['ADMIN'], ['sub' => '']),
        'garbage' => 'not.a.token',
    ];
    [$header, $payload, $signature] = explode('.', test_token(ANNA));
    $bad['roles added to the payload'] = $header . '.' . anotoki_iam_base64url_encode(json_encode(['roles' => ['ADMIN']] + json_decode(anotoki_iam_base64url_decode($payload), true))) . '.' . $signature;
    foreach ($bad as $what => $token) {
        foreach (['/api/admin/surveys', '/api/surveys'] as $url) {
            $answer = with_token($token, 'GET', $url);
            assert_same(401, $answer['status'], "$what at $url");
            assert_same(['error' => 'Your sign-in has run out. Please sign in again.', 'code' => 'invalid_token'], $answer['body'], $what);
            assert_match('/error="invalid_token"/', $answer['headers']['www-authenticate'] ?? '', $what);
        }
    }
    assert_same(401, call($GLOBALS['app']['base'], 'GET', '/api/admin/surveys', null, ['Authorization: Basic YWRtaW46YWRtaW4='])['status'], 'another scheme');
    assert_same(401, call($GLOBALS['app']['base'], 'GET', '/api/admin/surveys?access_token=' . test_token(ANNA, ['ADMIN']))['status'], 'never from the address');
});

test('only a Bearer header claims to be somebody: an empty one is a refused token, another scheme is nobody', function (): void {
    foreach (['/api/surveys', '/api/admin/surveys'] as $url) {
        foreach (['Authorization: Bearer', 'Authorization: bearer ', "Authorization: Bearer \t "] as $header) {
            $answer = call($GLOBALS['app']['base'], 'GET', $url, null, [$header]);
            assert_same([401, 'invalid_token'], [$answer['status'], $answer['body']['code'] ?? null], "'$header' at $url: somebody whose token is missing, never nobody");
        }
        // What a host behind a password file sends with every request: says nothing of who is using the site.
        $basic = call($GLOBALS['app']['base'], 'GET', $url, null, ['Authorization: Basic YWRtaW46YWRtaW4=']);
        assert_same([401, 'sign_in_required'], [$basic['status'], $basic['body']['code'] ?? null], "Basic at $url: nobody signed in");
        $none = call($GLOBALS['app']['base'], 'GET', $url);
        assert_same([401, 'sign_in_required'], [$none['status'], $none['body']['code'] ?? null], "no header at $url");
    }
});

test('the IAM\'s "Sign-in required" switch, relayed to the browser - off, nobody reads the open surveys; on, nothing of a survey without a token', function (): void {
    $file = test_application_file(false);
    $app = start_app(test_iam(['application_file' => $file]));
    $config = call($app['base'], 'GET', '/api/auth/config');
    assert_same(['issuer' => TEST_ISSUER, 'clientId' => 'survey', 'loginRequired' => false, 'visitorDays' => 30], $config['body'], 'switched off');
    $surveys = call($app['base'], 'GET', '/api/surveys');
    assert_same([200, []], [$surveys['status'], $surveys['body']['surveys'] ?? null], 'switched off, nobody reads the open surveys (tests/api/visitors.test.php has the rest)');

    file_put_contents($file, json_encode(['client_id' => TEST_CLIENT, 'name' => 'Test', 'login_required' => true]));
    assert_same(true, call($app['base'], 'GET', '/api/auth/config')['body']['loginRequired'], 'switched on');
    $refused = call($app['base'], 'GET', '/api/surveys');
    assert_same([401, 'sign_in_required'], [$refused['status'], $refused['body']['code'] ?? null], 'switched on: nobody is asked to sign in');
    unlink($file);
    assert_same(true, call($app['base'], 'GET', '/api/auth/config')['body']['loginRequired'], 'the IAM out of reach, never read: required');
    ($app['stop'])();
});

test('no CORS: a page on another site gets nothing to let it through', function (): void {
    $preflight = call($GLOBALS['app']['base'], 'OPTIONS', '/api/admin/surveys', null, ['Origin: https://evil.example', 'Access-Control-Request-Method: POST']);
    assert_same(405, $preflight['status']);
    assert_false(isset($preflight['headers']['access-control-allow-origin']));
    $form = call($GLOBALS['app']['base'], 'POST', '/api/surveys/x/responses', 'answers=1', array_merge(['Content-Type: application/x-www-form-urlencoded'], bearer(test_token(ANNA))));
    assert_true(in_array($form['status'], [404, 415], true), 'a form post is never read as JSON');
});

test('keys from the IAM itself: downloaded, and cached on disk', function (): void {
    $keys = test_temp_dir('fake-iam');
    file_put_contents("$keys/key.json", json_encode(test_keys()));
    $port = test_free_port();
    $issuer = "http://127.0.0.1:$port";
    test_start_server(TEST_BACKEND . '/tests/tools', TEST_BACKEND . '/tests/tools/fake-iam.php', ['FAKE_IAM_DIR' => $keys, 'FAKE_IAM_ISSUER' => $issuer], '/.well-known/openid-configuration', $port);
    $cache = test_temp_dir('jwks-cache');
    $app = start_app(['issuer' => $issuer, 'client_id' => TEST_CLIENT, 'cache_dir' => $cache]);

    $token = anotoki_iam_test_sign(anotoki_iam_test_claims(['issuer' => $issuer, 'client_id' => TEST_CLIENT], ANNA, ['ADMIN']), test_keys()['private_pem'], test_keys()['kid']);
    assert_same(200, call($app['base'], 'GET', '/api/admin/surveys', null, bearer($token))['status']);
    assert_true(glob("$cache/*") !== [], 'the key set is cached on disk');
});

test('the switch from the stand-in IAM: its public route, kept a minute in cache_dir, a 404 is "required", an IAM gone keeps the last answer', function (): void {
    $keys = test_temp_dir('fake-iam-switch');
    file_put_contents("$keys/key.json", json_encode(test_keys()));
    $port = test_free_port();
    $issuer = "http://127.0.0.1:$port";
    $iam = test_start_server(TEST_BACKEND . '/tests/tools', TEST_BACKEND . '/tests/tools/fake-iam.php', ['FAKE_IAM_DIR' => $keys, 'FAKE_IAM_ISSUER' => $issuer], '/.well-known/openid-configuration', $port);
    $standIn = static fn(array $changes = []): array => call($issuer, 'POST', '/_test/state', (object) $changes)['body'];
    $route = '/api/public/applications/' . TEST_CLIENT;
    $asked = static fn(): int => count(array_filter($standIn()['log'], static fn(string $line): bool => $line === "GET $route"));

    // The route itself, as the real IAM answers it.
    $answer = call($issuer, 'GET', $route);
    assert_same([200, ['client_id' => TEST_CLIENT, 'name' => 'Test site', 'login_required' => true]], [$answer['status'], $answer['body']], 'the stand-in\'s default: sign-in required');
    assert_same('public, max-age=60', $answer['headers']['cache-control'] ?? null, 'cacheable for a minute');
    assert_same(['MEMBER', 'ADMIN'], $standIn()['user']['roles'], 'its default person holds MEMBER, as every account does');
    $standIn(['application_missing' => true]);
    assert_same(404, call($issuer, 'GET', $route)['status'], 'an unknown or switched-off application');
    $standIn(['application_missing' => false, 'down' => true]);
    assert_same(503, call($issuer, 'GET', $route)['status'], 'the IAM out of reach');
    $standIn(['down' => false]);

    // The site asking it.
    $cache = test_temp_dir('switch-cache');
    $app = start_app(['issuer' => $issuer, 'client_id' => TEST_CLIENT, 'cache_dir' => $cache]);
    $required = static fn(): mixed => call($app['base'], 'GET', '/api/auth/config')['body']['loginRequired'] ?? null;
    $kept = $cache . '/anotoki-iam-application-' . sha1($issuer . ' ' . TEST_CLIENT) . '.json';
    // A minute later, without waiting one: every time in the kept answer two minutes back.
    $later = static function () use ($kept): void {
        $record = json_decode((string) file_get_contents($kept), true);
        foreach (['fetched_at', 'failed_at', 'tried_at'] as $at) {
            $record[$at] = $record[$at] > 0 ? $record[$at] - 120 : 0;
        }
        file_put_contents($kept, json_encode($record));
    };

    $standIn(['login_required' => false]);
    $before = $asked();
    assert_same(false, $required(), 'switched off in the IAM: the site says so');
    assert_true(is_file($kept), 'the answer is kept in the site\'s cache_dir');
    assert_same(false, $required());
    assert_same($before + 1, $asked(), 'asked once a minute, not once a request');

    $standIn(['login_required' => true]);
    assert_same(false, $required(), 'within the minute: the kept answer');
    $later();
    assert_same(true, $required(), 'a minute on: asked again, switched on');

    $standIn(['login_required' => false]);
    $later();
    assert_same(false, $required());
    $standIn(['down' => true]);
    $later();
    assert_same(false, $required(), 'the IAM out of reach: the last answer it gave');
    $tries = $asked();
    assert_same(false, $required());
    assert_same($tries, $asked(), 'and it is not asked again for a minute');

    $standIn(['down' => false, 'application_missing' => true]);
    $later();
    assert_same(true, $required(), 'the IAM does not know the site (404): sign-in required, whatever it said before');
    $standIn(['application_missing' => false]);
    assert_same([], server_problems($app));
    ($app['stop'])();
    ($iam['stop'])();
});
