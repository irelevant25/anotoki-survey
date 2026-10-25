<?php

// The site settings (api/site_settings.php - anotoki-lib 0.11.0, all three
// parts) and robots.txt and sitemap.xml, through the real server: what every
// page is told; the Site settings page's routes, the ADMIN's alone and
// audited; maintenance - everybody but the site's ADMIN told the site is
// closed, the ADMIN known by a verified token alone, the reserved paths
// answering; Page access - the participant's pages' API paths refused with
// them (423), never to the ADMIN, nothing reserved ever claimed either way,
// a row put in by hand that claims one passed over; and what robots read - by
// the site's configured address, never a request's Host, the open surveys
// only while they are anybody's, never what Page access hides.

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const OWNER = 1; // ADMIN
const EDITH = 2; // EDITOR
const PAT = 101; // takes surveys

/** The address site.local.php names for this file's server. */
const ADDRESS = 'https://survey.test.example';

$GLOBALS['app'] = null;
$GLOBALS['switch'] = null;
before(function (): void {
    // Sign-in required, as the IAM says by default - until a test welcomes visitors.
    $GLOBALS['switch'] = test_application_file(true);
    $GLOBALS['app'] = start_app(test_iam(['application_file' => $GLOBALS['switch']]));
    file_put_contents($GLOBALS['app']['config'] . '/site.local.php', "<?php return ['address' => '" . ADDRESS . "'];\n");
    make_survey('open-one');
    make_survey('past-day');
    dbExec("UPDATE surveys SET closes_on = current_date - 3 WHERE slug = 'past-day'");
    $closed = make_survey('closed-one');
    $answer = as_user(OWNER, 'POST', "/api/admin/surveys/$closed/status", ['status' => 'closed']);
    if ($answer['status'] !== 200) {
        throw new RuntimeException('could not close the survey: ' . $answer['raw']);
    }
    make_survey('drafted', 'draft');
});

function roles_of(int $user): array
{
    return match ($user) {
        OWNER => ['MEMBER', 'ADMIN'],
        EDITH => ['MEMBER', 'EDITOR'],
        default => ['MEMBER'],
    };
}

function as_user(int $user, string $method, string $url, mixed $body = null, array $headers = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, array_merge($headers, bearer(test_token($user, roles_of($user)))));
}

/** Nobody signed in. */
function nobody(string $method, string $url, mixed $body = null, array $headers = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, $headers);
}

/** A survey at /$slug with one question, made as an editor makes one - opened unless it is to stay a draft. Its id. */
function make_survey(string $slug, string $status = 'open'): string
{
    $made = as_user(OWNER, 'POST', '/api/admin/surveys', [
        'survey' => [
            'id' => 'ignored',
            'slug' => $slug,
            'title' => ucfirst($slug),
            'status' => 'draft',
            'intro' => '<p>Hello.</p>',
            'thanks' => '<p>Thank you!</p>',
            'askAboutYou' => false,
            'closesOn' => null,
            'language' => 'en',
            'translations' => new stdClass(),
            'steps' => [
                [
                    'id' => 'step-1',
                    'title' => 'One',
                    'questions' => [
                        [
                            'id' => 'q-element',
                            'type' => 'single',
                            'text' => '<p>Your favourite element?</p>',
                            'images' => [],
                            'required' => true,
                            'options' => [['id' => 'o-anemo', 'label' => 'Anemo', 'other' => false, 'images' => []], ['id' => 'o-geo', 'label' => 'Geo', 'other' => false, 'images' => []]],
                            'layout' => 'list',
                            'minChoices' => null,
                            'maxChoices' => null,
                            'multiline' => true,
                            'maxLength' => null,
                            'placeholder' => '',
                        ],
                    ],
                ],
            ],
        ],
    ]);
    if ($made['status'] !== 201) {
        throw new RuntimeException('could not make the survey: ' . $made['raw']);
    }
    $id = (string) $made['body']['survey']['id'];
    if ($status === 'open') {
        $opened = as_user(OWNER, 'POST', "/api/admin/surveys/$id/status", ['status' => 'open']);
        if ($opened['status'] !== 200) {
            throw new RuntimeException('could not open the survey: ' . $opened['raw']);
        }
    }

    return $id;
}

/** The switch: sign-in required or not, as the IAM says it. */
function switch_to(bool $required): void
{
    file_put_contents($GLOBALS['switch'], json_encode(['client_id' => TEST_CLIENT, 'name' => 'Test', 'login_required' => $required]));
}

/** The owner saves switches of the site settings: the page's whole. */
function save_settings(array $settings): array
{
    $saved = as_user(OWNER, 'PUT', '/api/admin/site-settings', ['settings' => $settings]);
    assert_same(200, $saved['status'], $saved['raw']);

    return $saved['body'];
}

/** The owner adds a page's row: its id. */
function add_page(string $path, string $visibility, bool $blocked, array $apiPaths): int
{
    $added = as_user(OWNER, 'POST', '/api/admin/site-settings/pages', ['path' => $path, 'visibility' => $visibility, 'blocked' => $blocked, 'api_paths' => $apiPaths]);
    assert_same(201, $added['status'], $added['raw']);
    foreach ($added['body']['pages'] as $row) {
        if ($row['path'] === $path) {
            return (int) $row['id'];
        }
    }
    fail("the row of $path is not on the page");
}

/** Every page's row gone, and the switches at their defaults: each test starts here. */
function fresh(): void
{
    dbExec('DELETE FROM anotoki_page_access');
    dbExec('DELETE FROM anotoki_site_settings');
    switch_to(true);
}

/** The audit log's entries of the site settings ($prefix: of one kind), oldest first: [action, actor, target id]. */
function settings_audit(string $prefix = ''): array
{
    return array_map(
        static fn(array $row): array => [$row['action'], $row['actor_id'] === null ? null : (int) $row['actor_id'], $row['target_id']],
        dbAll("SELECT action, actor_id, target_id FROM anotoki_audit_log WHERE (action LIKE 'site_settings.%' OR action LIKE 'page_access.%') AND action LIKE ? ORDER BY id", [$prefix . '%']),
    );
}

/** The sitemap's addresses, in its order - valid XML, or the test fails. */
function sitemap_locs(): array
{
    $answer = nobody('GET', '/sitemap.xml');
    assert_same(200, $answer['status'], $answer['raw']);
    assert_same('application/xml; charset=utf-8', $answer['headers']['content-type'] ?? null);
    $xml = simplexml_load_string($answer['raw']);
    assert_true($xml !== false, 'the sitemap is XML: ' . $answer['raw']);
    $locs = [];
    foreach ($xml->url as $url) {
        $locs[] = (string) $url->loc;
    }

    return $locs;
}

const LEGAL = [ADDRESS . '/terms', ADDRESS . '/privacy', ADDRESS . '/contact', ADDRESS . '/about', ADDRESS . '/support'];

test('what every page is told, before anybody signs in: the three parts, at their defaults - whatever a request carries', function (): void {
    fresh();
    $told = nobody('GET', '/api/site-settings');
    assert_same([200, ['maintenance' => false, 'announcement' => null, 'pages' => []]], [$told['status'], $told['body']]);
    assert_same(200, nobody('GET', '/api/site-settings', null, ['Authorization: Bearer not-a-token'])['status'], 'a token that does not check out is no refusal here');
});

test('the Site settings page\'s routes are the site\'s ADMIN\'s alone - nobody 401, an editor and a member 403 - and say what is reserved', function (): void {
    fresh();
    assert_same(401, nobody('GET', '/api/admin/site-settings')['status']);
    assert_same(403, as_user(EDITH, 'GET', '/api/admin/site-settings')['status'], 'an EDITOR reads none of the System pages');
    assert_same(403, as_user(PAT, 'GET', '/api/admin/site-settings')['status']);
    assert_same(403, as_user(EDITH, 'PUT', '/api/admin/site-settings', ['settings' => ['maintenance_mode' => true]])['status']);
    assert_same(403, as_user(EDITH, 'POST', '/api/admin/site-settings/pages', ['path' => '/', 'visibility' => 'ADMIN'])['status']);

    $page = as_user(OWNER, 'GET', '/api/admin/site-settings');
    assert_same(200, $page['status'], $page['raw']);
    assert_same(['getting_in', 'announcement', 'page_access'], $page['body']['parts'], 'all three parts');
    foreach (['/api/auth/config', '/api/images', '/api/site-status', '/api/translations', '/api/site-settings', '/api/admin/site-settings'] as $path) {
        assert_true(in_array($path, $page['body']['reserved']['api_paths'], true), "$path is reserved");
    }
    assert_false(in_array('/api/surveys', $page['body']['reserved']['api_paths'], true), 'the surveys\' own routes are not: maintenance closes them, Page access may refuse them');
    foreach (['/auth', '/staff', '/admin', '/preview', '/terms', '/privacy', '/contact', '/about', '/support'] as $path) {
        assert_true(in_array($path, $page['body']['reserved']['pages'], true), "$path is no row's to govern");
    }
    assert_same(0, (int) dbValue('SELECT count(*) FROM anotoki_site_settings WHERE updated_by <> 1'), 'nobody else wrote anything');
});

test('the announcement: the ADMIN saves it - audited, by the token\'s person - and every page is told it', function (): void {
    fresh();
    $whole = save_settings(['announcement_enabled' => true, 'announcement_level' => 'warning', 'announcement_message' => ['en' => 'Back at five.', 'sk' => 'Späť o piatej.']]);
    assert_same(true, $whole['settings']['announcement_enabled']['value']);
    assert_same('user' . OWNER, $whole['settings']['announcement_enabled']['updated_by_name'], 'who changed it last, by the name the site has');
    $told = nobody('GET', '/api/site-settings')['body'];
    assert_same(['level' => 'warning', 'message' => ['en' => 'Back at five.', 'sk' => 'Späť o piatej.']], $told['announcement']);
    assert_same([['site_settings.changed', OWNER, null]], settings_audit());

    // A message that is no text, or a kind there is none of: refused, and nothing changes.
    $refused = as_user(OWNER, 'PUT', '/api/admin/site-settings', ['settings' => ['announcement_level' => 'panic']]);
    assert_same([422, 'invalid_setting'], [$refused['status'], $refused['body']['code'] ?? null], $refused['raw']);
    assert_same('warning', nobody('GET', '/api/site-settings')['body']['announcement']['level']);
});

test('maintenance: everybody but the site\'s ADMIN is told the site is closed - the ADMIN by a verified token alone; a forged, expired or another site\'s token is nobody\'s', function (): void {
    fresh();
    save_settings(['maintenance_mode' => true, 'maintenance_message' => ['en' => 'Moving house.', 'sk' => 'Sťahujeme sa.']]);
    try {
        $closed = static function (array $answer, string $who): void {
            assert_same([503, 'maintenance'], [$answer['status'], $answer['body']['code'] ?? null], "$who: " . $answer['raw']);
            assert_same('300', $answer['headers']['retry-after'] ?? null, "$who: come back later");
            assert_same(['en' => 'Moving house.', 'sk' => 'Sťahujeme sa.'], $answer['body']['maintenance_message'] ?? null);
        };
        $closed(nobody('GET', '/api/surveys'), 'nobody');
        $closed(as_user(PAT, 'GET', '/api/surveys'), 'a member');
        $closed(
            as_user(PAT, 'POST', '/api/surveys/open-one/responses', [
                'answers' => ['q-element' => ['optionIds' => ['o-geo'], 'other' => '', 'text' => '']],
                'startedAt' => isoNow(),
                'language' => 'en',
            ]),
            'a member\'s answers',
        );
        assert_same(0, (int) dbValue('SELECT count(*) FROM responses'), 'nothing kept while the site is closed');
        $closed(as_user(EDITH, 'GET', '/api/admin/surveys'), 'an editor');
        $closed(nobody('GET', '/robots.txt'), 'a robot');
        $closed(nobody('GET', '/api/admin/surveys', null, bearer(test_token(OWNER, ['ADMIN'], [], ['iam' => test_forger()]))), 'an ADMIN token signed by another key');
        $closed(nobody('GET', '/api/admin/surveys', null, bearer(test_token(OWNER, ['ADMIN'], ['exp' => time() - 3600]))), 'an expired ADMIN token');
        $closed(nobody('GET', '/api/admin/surveys', null, bearer(test_token(OWNER, ['ADMIN'], ['aud' => 'genshin']))), 'an ADMIN token of another site');

        // The site's ADMIN uses the site as it is.
        assert_same(200, as_user(OWNER, 'GET', '/api/surveys')['status']);
        assert_same(200, as_user(OWNER, 'GET', '/api/admin/surveys')['status']);
        assert_same(200, as_user(OWNER, 'GET', '/api/admin/site-settings')['status']);

        // What anybody still reaches: the status - which says so -, the sign-in's settings, the words, the settings, the pictures.
        $status = nobody('GET', '/api/site-status');
        assert_same([200, ['state' => 'maintenance', 'installed' => false, 'maintenance_message' => ['en' => 'Moving house.', 'sk' => 'Sťahujeme sa.']]], [$status['status'], $status['body']]);
        assert_same(200, nobody('GET', '/api/auth/config')['status'], 'an administrator signs in with it, at /staff');
        assert_same(200, nobody('GET', '/api/translations/en')['status']);
        assert_same(true, nobody('GET', '/api/site-settings')['body']['maintenance']);
        assert_same(
            [404, 'not_found'],
            [nobody('GET', '/api/images/00000000-0000-4000-8000-000000000000.webp')['status'], nobody('GET', '/api/images/00000000-0000-4000-8000-000000000000.webp')['body']['code'] ?? null],
            'a picture is asked for as ever',
        );
    } finally {
        save_settings(['maintenance_mode' => false]);
    }
    assert_same([401, 'sign_in_required'], [nobody('GET', '/api/surveys')['status'], nobody('GET', '/api/surveys')['body']['code'] ?? null], 'open again: nobody is asked to sign in, as before');
    assert_same(200, nobody('GET', '/robots.txt')['status']);
});

test(
    'Page access: a row keeps the list of surveys for people signed in - its API paths 423 to nobody, never to a member; for editors, then switched off - never for the ADMIN; all audited',
    function (): void {
        fresh();
        switch_to(false); // visitors welcome: nobody may take the surveys - but for the row
        try {
            assert_same(200, nobody('GET', '/api/surveys')['status'], 'anybody\'s, before the row');
            $id = add_page('/', 'USER', false, ['/api/surveys']);
            assert_same([['path' => '/', 'visibility' => 'USER', 'blocked' => false]], nobody('GET', '/api/site-settings')['body']['pages'], 'what every page is told: never the row\'s API paths');
            $locked = nobody('GET', '/api/surveys');
            assert_same([423, 'page_locked'], [$locked['status'], $locked['body']['code'] ?? null], $locked['raw']);
            assert_same(423, nobody('GET', '/api/surveys/open-one')['status'], 'an API path covers what begins with it');
            $sent = nobody('POST', '/api/surveys/open-one/responses', [
                'answers' => ['q-element' => ['optionIds' => ['o-geo'], 'other' => '', 'text' => '']],
                'startedAt' => isoNow(),
                'language' => 'en',
            ]);
            assert_same(423, $sent['status'], 'nobody\'s answers neither');
            assert_same(0, (int) dbValue('SELECT count(*) FROM users WHERE id < 0'), 'and no visitor made of them');
            assert_same(200, as_user(PAT, 'GET', '/api/surveys')['status'], 'a member is somebody signed in');

            $changed = as_user(OWNER, 'PUT', '/api/admin/site-settings/pages', ['pages' => [['id' => $id, 'visibility' => 'EDITOR']]]);
            assert_same(200, $changed['status'], $changed['raw']);
            assert_same(423, as_user(PAT, 'GET', '/api/surveys')['status'], 'for editors and administrators: a member is refused');
            assert_same(200, as_user(EDITH, 'GET', '/api/surveys')['status']);

            as_user(OWNER, 'PUT', '/api/admin/site-settings/pages', ['pages' => [['id' => $id, 'visibility' => 'PUBLIC', 'blocked' => true]]]);
            assert_same(423, as_user(EDITH, 'GET', '/api/surveys')['status'], 'switched off: an editor too');
            assert_same(200, as_user(OWNER, 'GET', '/api/surveys')['status'], 'never the site\'s ADMIN: whoever switched it off must be able to look at it');

            assert_same(200, as_user(OWNER, 'DELETE', "/api/admin/site-settings/pages/$id")['status']);
            assert_same(200, nobody('GET', '/api/surveys')['status'], 'the row gone: anybody\'s again');
            assert_same(
                [['page_access.added', OWNER, (string) $id], ['page_access.changed', OWNER, (string) $id], ['page_access.changed', OWNER, (string) $id], ['page_access.removed', OWNER, (string) $id]],
                settings_audit('page_access.'),
            );
        } finally {
            switch_to(true);
        }
    },
);

test('the site\'s ADMIN is never locked out: a row keeping the editors\' admin API for administrators alone refuses an editor - never the ADMIN', function (): void {
    fresh();
    add_page('/', 'ADMIN', false, ['/api/admin/surveys', '/api/admin/translations']);
    assert_same([423, 'page_locked'], [as_user(EDITH, 'GET', '/api/admin/surveys')['status'], as_user(EDITH, 'GET', '/api/admin/surveys')['body']['code'] ?? null]);
    assert_same(423, as_user(EDITH, 'GET', '/api/admin/translations')['status']);
    assert_same(403, as_user(PAT, 'GET', '/api/admin/surveys')['status'], 'a member is refused for the role first');
    assert_same(200, as_user(OWNER, 'GET', '/api/admin/surveys')['status']);
    assert_same(200, as_user(OWNER, 'GET', '/api/admin/translations')['status']);

    // Closed and locked at once: the ADMIN still has everything.
    save_settings(['maintenance_mode' => true]);
    try {
        assert_same(200, as_user(OWNER, 'GET', '/api/admin/surveys')['status']);
        assert_same(200, as_user(OWNER, 'GET', '/api/admin/site-settings')['status'], 'and can open the site again');
    } finally {
        save_settings(['maintenance_mode' => false]);
    }
});

test('nothing reserved can be claimed, either way round - and a row put in by hand that claims one is passed over', function (): void {
    fresh();
    foreach (['/api/auth/config', '/api/auth', '/api/a', '/api/images', '/api/im', '/api/images/x', '/api/site-settings', '/api/site-status', '/api/translations/en', '/api/'] as $apiPath) {
        $refused = as_user(OWNER, 'POST', '/api/admin/site-settings/pages', ['path' => '/', 'visibility' => 'USER', 'blocked' => false, 'api_paths' => [$apiPath]]);
        assert_same([422, 'invalid_api_path'], [$refused['status'], $refused['body']['code'] ?? null], "$apiPath: " . $refused['raw']);
    }
    foreach (['/staff', '/preview', '/preview/:surveyId', '/:slug', '/admin/people', '/auth/callback', '/privacy', '/about'] as $page) {
        $refused = as_user(OWNER, 'POST', '/api/admin/site-settings/pages', ['path' => $page, 'visibility' => 'ADMIN', 'blocked' => true, 'api_paths' => []]);
        assert_same([422, 'invalid_page'], [$refused['status'], $refused['body']['code'] ?? null], "$page: " . $refused['raw']);
    }
    assert_same([], dbAll('SELECT path FROM anotoki_page_access'), 'none of them was kept');

    // Put in by hand, past the page: passed over - the pictures and the sign-in's settings answer, and nobody is told the page is governed.
    dbExec("INSERT INTO anotoki_page_access (path, visibility, blocked, api_paths) VALUES ('/', 'ADMIN', true, ARRAY['/api/images', '/api/auth/config']), ('/staff', 'ADMIN', true, '{}')");
    try {
        assert_same(404, nobody('GET', '/api/images/00000000-0000-4000-8000-000000000000.webp')['status'], 'a picture is asked for as ever - never 423');
        assert_same(200, nobody('GET', '/api/auth/config')['status']);
        assert_same(['/'], array_column(nobody('GET', '/api/site-settings')['body']['pages'], 'path'), 'the list\'s row governs its page; /staff is no row\'s');
    } finally {
        dbExec('DELETE FROM anotoki_page_access');
    }
});

test(
    'robots.txt: robots kept out of the admin panel, the API, the sign-in\'s way back, the preview and the staff route - the sitemap by the site\'s configured address, never a request\'s Host',
    function (): void {
        fresh();
        $robots = nobody('GET', '/robots.txt', null, ['Host: evil.example']);
        assert_same(200, $robots['status'], $robots['raw']);
        assert_same('text/plain; charset=utf-8', $robots['headers']['content-type'] ?? null);
        assert_same('public, max-age=3600', $robots['headers']['cache-control'] ?? null, 'kept an hour by a browser or the edge');
        assert_same(
            "# The robots of every search engine: what to leave alone, and where the site's pages are listed.\nUser-agent: *\nDisallow: /admin\nDisallow: /api\nDisallow: /auth\nDisallow: /preview\nDisallow: /staff\n\nSitemap: " .
                ADDRESS .
                "/sitemap.xml\n",
            $robots['raw'],
        );

        // No file naming another: the address of where the code runs - a checkout's, here.
        rename($GLOBALS['app']['config'] . '/site.local.php', $GLOBALS['app']['config'] . '/site.local.php.away');
        try {
            assert_true(str_contains(nobody('GET', '/robots.txt', null, ['Host: evil.example'])['raw'], "\nSitemap: " . SURVEY_DEVELOPMENT_ADDRESS . "/sitemap.xml\n"));
        } finally {
            rename($GLOBALS['app']['config'] . '/site.local.php.away', $GLOBALS['app']['config'] . '/site.local.php');
        }
    },
);

test(
    'sitemap.xml: the public pages always; the list and each open survey only while visitors are welcome - never a draft, a closed one or one past its last day; never what Page access hides',
    function (): void {
        fresh();
        assert_same(LEGAL, sitemap_locs(), 'a sign-in required: the legal pages, About and Support alone - the surveys\' pages send everybody to the IAM');

        switch_to(false);
        try {
            assert_same([...LEGAL, ADDRESS . '/', ADDRESS . '/open-one'], sitemap_locs(), 'visitors welcome: the list and the one open survey');
            $raw = nobody('GET', '/sitemap.xml')['raw'];
            $updated = substr((string) dbValue("SELECT to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') FROM surveys WHERE slug = 'open-one'"), 0, 10);
            assert_true(str_contains($raw, '<url><loc>' . ADDRESS . "/open-one</loc><lastmod>$updated</lastmod></url>"), 'the survey with the day it last changed: ' . $raw);
            foreach (['drafted', 'closed-one', 'past-day'] as $never) {
                assert_false(str_contains($raw, "/$never<"), "$never: never in the sitemap");
            }

            // Page access hides from robots what it hides from people: the survey kept for people signed in, the list switched off.
            add_page('/open-one', 'USER', false, []);
            add_page('/', 'PUBLIC', true, []);
            assert_same(LEGAL, sitemap_locs(), 'what Page access hides stays out');
        } finally {
            switch_to(true);
        }
    },
);
