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
    assert_same(['issuer' => TEST_ISSUER, 'clientId' => 'survey'], $config['body']);
    assert_same('no-store', $config['headers']['cache-control'] ?? null);
    assert_same('nosniff', $config['headers']['x-content-type-options'] ?? null);
});

test('a good token: the person is recorded from it, and their roles are this site\'s', function (): void {
    assert_same(200, with_token(test_token(ANNA, ['EDITOR']))['status']);
    assert_same(['id' => ANNA, 'preferred_username' => 'user' . ANNA, 'email' => 'user' . ANNA . '@example.test'], dbOne('SELECT id, preferred_username, email FROM users WHERE id = ?', [ANNA]));
    assert_same(200, with_token(test_token(ANNA, ['editor']))['status'], 'a role in any case');
    assert_same(403, with_token(test_token(ANNA, ['MEMBER']))['status'], 'a role this site does not have is no role here');
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
