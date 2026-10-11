<?php

// The admin tools this site takes from the anotoki library (api/admin_tools.php),
// through the real server: the error log (files - what failed, and never what
// it must not hold), the audit log (who did what in the admin panel) and the
// backups (every table by COPY, the pictures' bytes too: made, listed,
// downloaded by a single-use link, restored, deleted - each after a sign-in of
// the last ten minutes; daily after an answer, and before every Apply; after a
// restore, the scrub of the IAM's deleted accounts at once - a restore that
// could not finish it says so, and the next request tries again). A backup
// that fails is written in the site's error log. The site's ADMIN's alone;
// the error log and the backups - but a restore - open while an update waits.
// The IAM's list of deleted accounts is a file here (anonymized_file).

declare(strict_types=1);

require __DIR__ . '/../lib.php'; // before the app loads: a throwaway database and settings

const OWNER = 1;       // ADMIN
const EDITH = 2;       // EDITOR
const PAT = 101;       // takes surveys
const RUTH = 105;      // takes surveys, until the IAM deletes her account
const SAM = 106;       // the same, a day later

/** A file the tests make the database wait for (it runs again over what it wrote). */
const FILE_007 = '007_visitor_strings.sql';

$GLOBALS['app'] = null;
$GLOBALS['deleted'] = '';
$GLOBALS['iam_deleted'] = [];
before(function (): void {
    // The IAM answers, and has deleted nobody - until a test says otherwise.
    $GLOBALS['deleted'] = test_anonymized_file([]);
    $GLOBALS['app'] = start_app(test_iam(['anonymized_file' => $GLOBALS['deleted']]));
});

after(function (): void {
    dbExec('DROP TRIGGER IF EXISTS survey_test_refuse ON images');
});

function roles_of(int $user): array
{
    return match ($user) {
        OWNER => ['MEMBER', 'ADMIN'],
        EDITH => ['MEMBER', 'EDITOR'],
        default => ['MEMBER'],
    };
}

/** A request of $user's - signed in at the IAM $signedInAgo seconds ago (the token's auth_time). */
function as_user(int $user, string $method, string $url, mixed $body = null, int $signedInAgo = 0, array $headers = []): array
{
    return call($GLOBALS['app']['base'], $method, $url, $body, array_merge($headers, bearer(test_token($user, roles_of($user), ['auth_time' => time() - $signedInAgo]))));
}

/** The server's storage: its settings folder's (the tests' own). */
function storage(): string
{
    return $GLOBALS['app']['config'] . '/storage';
}

/** Every line of today's error log, decoded - this file's server's, or the one of the storage $storage. */
function error_lines(?string $storage = null): array
{
    $lines = [];
    foreach (glob(($storage ?? storage()) . '/logs/errors-*.jsonl') ?: [] as $file) {
        foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            $lines[] = json_decode($line, true);
        }
    }

    return $lines;
}

/** The IAM's list of the accounts it deleted, as the scrub reads it - every one so far ([sub => when]). */
function iam_lists_deleted(): void
{
    test_write_anonymized($GLOBALS['deleted'], $GLOBALS['iam_deleted']);
}

/** The scrub's hourly stamp, in the folder the server keeps the IAM's answers in. */
function scrub_stamp(): string
{
    return (string) (require $GLOBALS['app']['config'] . '/iam.local.php')['cache_dir'] . '/anotoki-people.stamp';
}

/** The name the site has for $user. */
function name_of(int $user): ?string
{
    $name = dbValue('SELECT preferred_username FROM users WHERE id = ?', [$user]);

    return $name === null ? null : (string) $name;
}

/** A backup made by the owner, just signed in: its entry. */
function backup_made(string $description): array
{
    $made = as_user(OWNER, 'POST', '/api/admin/backups', ['description' => $description]);
    assert_same(201, $made['status'], test_show($made['body']));

    return $made['body']['backup'];
}

/** The owner restores $backup, confirmed: the answer. */
function restored(array $backup): array
{
    $restored = as_user(OWNER, 'POST', '/api/admin/backups/' . $backup['id'] . '/restore', ['confirm' => substr($backup['id'], -6)]);
    assert_same(200, $restored['status'], test_show($restored['body']));

    return $restored['body'];
}

/** $user signed in, named in a backup - then their account deleted at the IAM ($when) and scrubbed here: the backup. */
function backup_with_named(int $user, string $when): array
{
    as_user($user, 'GET', '/api/surveys');
    assert_same('user' . $user, name_of($user), 'signed in: named');
    $backup = backup_made("user$user still named");
    $GLOBALS['iam_deleted'][$user] = $when;
    iam_lists_deleted();
    assert_same('done', as_user(OWNER, 'POST', '/api/admin/people/sync')['body']['run']['state'] ?? null);
    assert_same('deleted-' . $user, name_of($user), 'the IAM deleted the account: scrubbed here');

    return $backup;
}

/** The audit log's entries, oldest first: [action, actor_id, target_type, target_id]. */
function audit_entries(): array
{
    return array_map(
        static fn(array $row): array => [$row['action'], $row['actor_id'] === null ? null : (int) $row['actor_id'], $row['target_type'], $row['target_id']],
        dbAll('SELECT action, actor_id, target_type, target_id FROM anotoki_audit_log ORDER BY id')
    );
}

/** A survey with a picture, as the editor makes it - opened. Its id. */
function survey_with_picture(string $slug): string
{
    $image = call($GLOBALS['app']['base'], 'POST', '/api/admin/images', (string) base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), array_merge(['Content-Type: image/png'], bearer(test_token(EDITH, roles_of(EDITH)))));
    assert_same(201, $image['status'], test_show($image['body']));
    $survey = [
        'id' => 'ignored', 'slug' => $slug, 'title' => "Survey $slug", 'status' => 'draft',
        'intro' => '<p>Hello.</p>', 'thanks' => '<p>Thanks.</p>', 'askAboutYou' => false, 'closesOn' => null,
        'language' => 'en', 'translations' => new stdClass(),
        'steps' => [['id' => 'step-1', 'title' => 'One', 'questions' => [[
            'id' => 'q-words', 'type' => 'text', 'text' => '<p>Anything?</p>', 'images' => [['id' => $image['body']['image']['id'], 'alt' => 'A dot']], 'required' => true,
            'options' => [], 'layout' => 'list', 'minChoices' => null, 'maxChoices' => null, 'multiline' => true, 'maxLength' => 200, 'placeholder' => '',
        ]]]],
    ];
    $made = as_user(EDITH, 'POST', '/api/admin/surveys', ['survey' => $survey]);
    assert_same(201, $made['status'], test_show($made['body']));
    $id = $made['body']['survey']['id'];
    assert_same(200, as_user(EDITH, 'POST', "/api/admin/surveys/$id/status", ['status' => 'open'])['status']);

    return $id;
}

test('the admin tools are the site\'s ADMIN\'s alone: nobody is asked to sign in, a participant and an EDITOR are refused in this site\'s words', function (): void {
    foreach ([
        'GET /api/admin/errors', 'DELETE /api/admin/errors', 'GET /api/admin/audit', 'GET /api/admin/audit/facets',
        'GET /api/admin/backups', 'GET /api/admin/backups/proof', 'POST /api/admin/backups',
    ] as $route) {
        [$method, $url] = explode(' ', $route);
        $nobody = call($GLOBALS['app']['base'], $method, $url);
        assert_same([401, 'sign_in_required'], [$nobody['status'], $nobody['body']['code'] ?? null], "$route, nobody");
        foreach ([PAT => 'a participant', EDITH => 'an EDITOR - the owner\'s decision: EDITORs see none of the tools'] as $user => $who) {
            $refused = as_user($user, $method, $url);
            assert_same([403, 'forbidden', 'Only an administrator of the survey site may do this.'], [$refused['status'], $refused['body']['code'] ?? null, $refused['body']['error'] ?? null], "$route, $who");
        }
        $stale = call($GLOBALS['app']['base'], $method, $url, null, bearer(test_token(OWNER, roles_of(OWNER), ['exp' => time() - 120])));
        assert_same([401, 'invalid_token'], [$stale['status'], $stale['body']['code'] ?? null], "$route: an ADMIN's token that has run out");
    }
    assert_same([200, ['kind' => 'recent_sign_in']], [as_user(OWNER, 'GET', '/api/admin/backups/proof')['status'], as_user(OWNER, 'GET', '/api/admin/backups/proof')['body']], 'the proof this site asks: a recent sign-in');
});

test('the error log: what failed - an exception answered, a 404 - with its route and who, and never a query string, a token or what the database said of the values', function (): void {
    // A picture that cannot be kept: the database refuses it, with words that hold an address and a password.
    dbExec("CREATE OR REPLACE FUNCTION survey_test_refuse() RETURNS trigger LANGUAGE plpgsql AS \$\$ BEGIN RAISE EXCEPTION 'the test refuses it for anna@example.test, password=hunter2'; END \$\$");
    dbExec('CREATE TRIGGER survey_test_refuse BEFORE INSERT ON images FOR EACH ROW EXECUTE FUNCTION survey_test_refuse()');
    $failed = call($GLOBALS['app']['base'], 'POST', '/api/admin/images?secret=sesame', (string) base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), array_merge(['Content-Type: image/png'], bearer($token = test_token(EDITH, roles_of(EDITH)))));
    assert_same([503, 'database_unavailable'], [$failed['status'], $failed['body']['code'] ?? null]);
    dbExec('DROP TRIGGER survey_test_refuse ON images');
    $missing = as_user(OWNER, 'GET', '/api/admin/surveys/00000000-0000-0000-0000-000000000000?token=sesame');
    assert_same(404, $missing['status']);

    $lines = error_lines();
    $raw = implode("\n", array_map('json_encode', $lines));
    $refused = array_values(array_filter($lines, static fn(array $line): bool => ($line['type'] ?? null) === 'PDOException'))[0] ?? null;
    assert_true($refused !== null, 'the exception, written down: ' . $raw);
    assert_same([503, 'error', 'POST', '/api/admin/images', EDITH], [$refused['status'], $refused['level'], $refused['method'], $refused['route'], $refused['user_id']], 'its answer, its route, who');
    assert_match('/^[0-9a-f]{12}$/', (string) $refused['client'], 'where from: a keyed hash, never the address');
    assert_true(is_array($refused['trace']) && $refused['trace'] !== [], 'and where in the code');
    $notFound = array_values(array_filter($lines, static fn(array $line): bool => ($line['status'] ?? null) === 404))[0] ?? null;
    assert_same(['Response', 'not_found', '/api/admin/surveys/{id}', OWNER], [$notFound['type'], $notFound['code'], $notFound['route'], $notFound['user_id']], 'a refusal the site decided: its answer\'s line');
    foreach (['sesame', 'hunter2', 'anna@example.test', $token, 'Bearer', '127.0.0.1'] as $never) {
        assert_false(str_contains($raw, $never), "never written: $never");
    }

    $report = as_user(OWNER, 'GET', '/api/admin/errors?days=1')['body'];
    assert_same(2, $report['total'], test_show($report));
    $group = array_values(array_filter($report['groups'], static fn(array $group): bool => $group['status'] === 503))[0];
    $occurrences = as_user(OWNER, 'GET', '/api/admin/errors/' . $group['fingerprint'])['body'];
    assert_same(1, count($occurrences), 'every occurrence of one kind');
    assert_same(2, count(error_lines()), 'the log\'s own routes are never written into it');

    $cleared = as_user(OWNER, 'DELETE', '/api/admin/errors');
    assert_same(200, $cleared['status']);
    assert_same([], error_lines(), 'cleared');
    assert_same(['errors.cleared', OWNER, 'error_log', null], audit_entries()[count(audit_entries()) - 1], 'and audited');
});

test('the audit log: who made, opened, closed and deleted a survey, deleted answers, reworded the words, added and deleted a language - by the token\'s person, named', function (): void {
    $id = survey_with_picture('audited');
    $sent = as_user(PAT, 'POST', '/api/surveys/audited/responses', [
        'aboutYou' => null, 'answers' => ['q-words' => ['optionIds' => [], 'other' => '', 'text' => 'Yes.']], 'startedAt' => gmdate('Y-m-d\TH:i:s.v\Z'), 'language' => 'en',
    ]);
    assert_same(201, $sent['status'], test_show($sent['body']));
    assert_same(200, as_user(EDITH, 'POST', "/api/admin/surveys/$id/status", ['status' => 'closed'])['status']);
    assert_same(204, as_user(OWNER, 'DELETE', '/api/admin/responses/' . $sent['body']['id'])['status']);
    assert_same(200, as_user(EDITH, 'PUT', '/api/admin/translations', ['values' => ['home.title' => ['en' => 'Our surveys']]])['status']);
    assert_same(201, as_user(EDITH, 'POST', '/api/admin/languages', ['code' => 'cs', 'name' => 'Czech', 'native_name' => 'Čeština', 'enabled' => false])['status']);
    assert_same(200, as_user(OWNER, 'DELETE', '/api/admin/languages/cs')['status']);
    assert_same(204, as_user(OWNER, 'DELETE', "/api/admin/surveys/$id")['status']);

    $entries = array_values(array_filter(audit_entries(), static fn(array $entry): bool => $entry[0] !== 'errors.cleared'));
    assert_same([
        ['survey.created', EDITH, 'survey', $id],
        ['survey.opened', EDITH, 'survey', $id],
        ['survey.closed', EDITH, 'survey', $id],
        ['response.deleted', OWNER, 'response', $sent['body']['id']],
        ['translations.saved', EDITH, null, null],
        ['language.created', EDITH, 'language', 'cs'],
        ['language.deleted', OWNER, 'language', 'cs'],
        ['survey.deleted', OWNER, 'survey', $id],
    ], $entries);
    $deleted = json_decode((string) dbValue("SELECT details FROM anotoki_audit_log WHERE action = 'survey.deleted'"), true);
    assert_json_same(['title' => 'Survey audited', 'slug' => 'audited', 'responses' => 0], $deleted, 'what it was');
    assert_same(0, (int) dbValue('SELECT count(*) FROM anotoki_audit_log WHERE ip IS NOT NULL'), 'no address is kept');

    $page = as_user(OWNER, 'GET', '/api/admin/audit?action=survey.')['body'];
    assert_same([4, 50], [$page['total'], $page['pageSize']], 'the survey.* family: made, opened, closed, deleted');
    assert_same(['user' . OWNER, 'survey.deleted'], [$page['items'][0]['actor_username'], $page['items'][0]['action']], 'newest first, the actor by the name the site has');
    $facets = as_user(OWNER, 'GET', '/api/admin/audit/facets')['body'];
    assert_true(in_array('survey.created', $facets['actions'], true) && in_array(['id' => EDITH, 'username' => 'user' . EDITH], $facets['actors'], true), test_show($facets));
});

test('backups: made after a recent sign-in, listed, downloaded once by its link, restored - the pictures\' bytes too - and deleted; every step audited', function (): void {
    $id = survey_with_picture('kept');
    $picture = (string) dbValue('SELECT id FROM images ORDER BY created_at DESC LIMIT 1');
    $bytes = stream_get_contents(db()->query("SELECT bytes FROM images WHERE id = '$picture'")->fetchColumn());

    $old = as_user(OWNER, 'POST', '/api/admin/backups', ['description' => 'before'], 3600);
    assert_same([403, 'reauth_required'], [$old['status'], $old['body']['code'] ?? null], 'a sign-in an hour old is no proof');
    $made = as_user(OWNER, 'POST', '/api/admin/backups', ['description' => 'Before the test']);
    assert_same(201, $made['status'], test_show($made['body']));
    $backup = $made['body']['backup'];
    assert_same(['manual', 'Before the test', OWNER], [$backup['kind'], $backup['description'], $backup['created_by']]);
    assert_true(is_file(storage() . '/backups/' . $backup['id'] . '.anotoki-backup'), 'in the site\'s storage');

    $list = as_user(OWNER, 'GET', '/api/admin/backups')['body'];
    assert_same([$backup['id']], array_column($list['backups'], 'id'));
    assert_same([true, true, false], [$list['status']['copy_available'], $list['status']['restorable'], $list['status']['encrypted']], test_show($list['status']['problems']));
    assert_true($list['backups'][0]['restorable'], 'this database\'s schema: restorable here');

    $ticket = as_user(OWNER, 'POST', '/api/admin/backups/' . $backup['id'] . '/ticket', new stdClass(), 3600);
    assert_same([403, 'reauth_required'], [$ticket['status'], $ticket['body']['code'] ?? null], 'a download asks the proof too');
    $ticket = as_user(OWNER, 'POST', '/api/admin/backups/' . $backup['id'] . '/ticket', new stdClass());
    assert_same([200, 60], [$ticket['status'], $ticket['body']['expires_in'] ?? null]);
    assert_match('~^/api/admin/backups/' . preg_quote($backup['id'], '~') . '/file\?ticket=~', (string) $ticket['body']['url']);
    $file = call($GLOBALS['app']['base'], 'GET', $ticket['body']['url']);
    assert_same([200, 'application/octet-stream', 'no-store', 'no-referrer'], [$file['status'], $file['headers']['content-type'] ?? null, $file['headers']['cache-control'] ?? null, $file['headers']['referrer-policy'] ?? null], 'the file, to a navigation without a token: the ticket is the check');
    assert_match('/^attachment; filename="/', (string) ($file['headers']['content-disposition'] ?? ''));
    assert_true(str_starts_with($file['raw'], "ANOTOKI-BACKUP 1\n"), 'the archive');
    $again = call($GLOBALS['app']['base'], 'GET', $ticket['body']['url']);
    assert_same([403, 'ticket_invalid'], [$again['status'], $again['body']['code'] ?? null], 'used once');

    // What changes after the backup goes with the restore: the survey and its picture deleted, a survey added.
    assert_same(204, as_user(OWNER, 'DELETE', "/api/admin/surveys/$id")['status']);
    dbExec('DELETE FROM images WHERE id = ?', [$picture]);
    $later = survey_with_picture('later');
    $wrong = as_user(OWNER, 'POST', '/api/admin/backups/' . $backup['id'] . '/restore', ['confirm' => 'nope']);
    assert_same([422, 'confirm_mismatch'], [$wrong['status'], $wrong['body']['code'] ?? null]);
    $restored = as_user(OWNER, 'POST', '/api/admin/backups/' . $backup['id'] . '/restore', ['confirm' => substr($backup['id'], -6)]);
    assert_same(200, $restored['status'], test_show($restored['body']));
    assert_same([$backup['id'], null], [$restored['body']['restored'], $restored['body']['after_restore_error']]);
    assert_same([$id, null], [(string) dbValue("SELECT id FROM surveys WHERE slug = 'kept'"), dbValue('SELECT id FROM surveys WHERE id = ?', [$later])], 'the database as the backup had it');
    assert_same($bytes, stream_get_contents(db()->query("SELECT bytes FROM images WHERE id = '$picture'")->fetchColumn()), 'the picture\'s bytes, as they were');
    $actions = array_column(audit_entries(), 0);
    assert_true(in_array('survey.deleted', $actions, true), 'the audit log is never restored: what happened since stays in it');
    foreach (['backup.created', 'backup.downloaded', 'backup.restored'] as $action) {
        assert_true(in_array($action, $actions, true), "audited: $action");
    }
    $kinds = array_count_values(array_column(as_user(OWNER, 'GET', '/api/admin/backups')['body']['backups'], 'kind'));
    assert_same(1, $kinds['before-restore'] ?? 0, 'what was there before the restore, kept first');

    assert_same(200, as_user(OWNER, 'DELETE', '/api/admin/backups/' . $backup['id'], new stdClass())['status']);
    clearstatcache();
    assert_false(is_file(storage() . '/backups/' . $backup['id'] . '.anotoki-backup'), 'the file gone');
    assert_true(in_array('backup.deleted', array_column(audit_entries(), 0), true));
});

test('a restore, the IAM answering: whoever it deleted since the backup was made is scrubbed again before the restore answers', function (): void {
    $backup = backup_with_named(RUTH, '2026-11-01T10:00:00Z');

    $restored = restored($backup);
    assert_same([$backup['id'], null], [$restored['restored'], $restored['after_restore_error']], test_show($restored));
    assert_same('deleted-' . RUTH, name_of(RUTH), 'the backup\'s name for her, gone again at once');
    assert_same([], array_values(array_filter(error_lines(), static fn(array $line): bool => ($line['type'] ?? null) === 'RuntimeException')), 'nothing failed');
});

test('a restore, the IAM out of reach: it stands and says the check did not finish - in the error log too - and the next request checks again, not an hour later', function (): void {
    $backup = backup_with_named(SAM, '2026-11-02T10:00:00Z');
    touch(scrub_stamp()); // the hour's check has just run: without the restore's word, the next is an hour away
    @unlink($GLOBALS['deleted']); // and now the IAM cannot be reached

    $restored = restored($backup);
    assert_same($backup['id'], $restored['restored'], 'the restore stands');
    assert_same(
        'the accounts the IAM deleted were not checked again (the IAM could not be reached). Whoever it deleted since this backup was made may be named here until they are: the check runs again with the next request, and at once with Check now on the People page.',
        $restored['after_restore_error'],
        'and says what it could not do - the Backups page shows it'
    );
    assert_same('user' . SAM, name_of(SAM), 'the backup\'s name for him is back, for now');
    $logged = array_values(array_filter(error_lines(), static fn(array $line): bool => str_starts_with((string) ($line['message'] ?? ''), 'the accounts the IAM deleted were not checked again')));
    assert_same([['RuntimeException', 'error', 500]], array_map(static fn(array $line): array => [$line['type'], $line['level'], $line['status']], $logged), 'in the site\'s error log, where its ADMIN reads it: ' . test_show(error_lines()));
    assert_true(str_contains((string) file_get_contents($GLOBALS['app']['log']), '[backups] RuntimeException: the accounts the IAM deleted were not checked again'), 'and in PHP\'s, as ever');

    // The IAM answers again. The next request - the restore's own after-the-answer work done before it is served -
    // finds the hour free and checks after its answer; the one after it waits for that.
    iam_lists_deleted();
    as_user(OWNER, 'GET', '/api/surveys');
    as_user(OWNER, 'GET', '/api/surveys');
    assert_same('deleted-' . SAM, name_of(SAM), 'scrubbed again by the next request\'s check');
    clearstatcache();
    assert_true(filemtime(scrub_stamp()) > time() - 60, 'which claimed the hour anew');
});

test('a backup that fails is in the site\'s error log, where its ADMIN reads it - not only in PHP\'s', function (): void {
    // A server of its own (the same database), whose backups' folder cannot be made: a file where it goes. Never
    // this file's server: PHP remembers for a while what a path was, and a folder put back would fail its backups.
    $other = start_app(test_iam(['anonymized_file' => $GLOBALS['deleted']]));
    try {
        file_put_contents($other['config'] . '/storage/backups', 'a file where the backups\' folder goes');
        test_daily_backup_due($other['config']);
        call($other['base'], 'GET', '/api/health');
        // The built-in server answers one request at a time: the next waits for the work after the last answer.
        call($other['base'], 'GET', '/api/health');

        $lines = error_lines($other['config'] . '/storage');
        $messages = array_column(array_filter($lines, static fn(array $line): bool => ($line['type'] ?? null) === 'RuntimeException'), 'message');
        assert_same(['The daily backup failed: The backups folder cannot be written.'], array_values($messages), test_show($lines));
        assert_true(str_contains((string) file_get_contents($other['log']), '[backups] RuntimeException: The daily backup failed'), 'and in PHP\'s, as ever');
    } finally {
        $other['stop']();
    }
});

test('the daily backup: the first answer of a UTC day lets it run after the answer, once', function (): void {
    $before = glob(storage() . '/backups/*-daily-*.anotoki-backup') ?: [];
    assert_same([], $before);
    test_daily_backup_due($GLOBALS['app']['config']);
    as_user(PAT, 'GET', '/api/surveys');
    // The built-in server answers one request at a time: the next waits for the work after the last answer.
    as_user(PAT, 'GET', '/api/surveys');
    assert_same(1, count(glob(storage() . '/backups/*-daily-*.anotoki-backup') ?: []), 'made, after the answer');
    as_user(PAT, 'GET', '/api/surveys');
    assert_same(1, count(glob(storage() . '/backups/*-daily-*.anotoki-backup') ?: []), 'once a day');
});

test('while an update waits: the error log and the backups answer the ADMIN - never a restore - and the audit log and the people wait too', function (): void {
    $made = as_user(OWNER, 'POST', '/api/admin/backups', ['description' => 'Just before the update']);
    assert_same(201, $made['status']);
    dbExec('DELETE FROM migrations WHERE filename = ?', [FILE_007]);
    try {
        assert_same(200, as_user(OWNER, 'GET', '/api/admin/errors')['status'], 'what went wrong is most worth seeing now');
        assert_same(200, as_user(OWNER, 'GET', '/api/admin/backups')['status']);
        assert_same(201, as_user(OWNER, 'POST', '/api/admin/backups', ['description' => 'Again'])['status'], 'a backup just before the Apply is the point');
        $closed = [
            'POST /api/admin/backups/' . $made['body']['backup']['id'] . '/restore' => 'a restore',
            'GET /api/admin/audit' => 'the audit log (its table may be the update\'s)',
            'GET /api/admin/people' => 'the people',
        ];
        foreach ($closed as $route => $what) {
            [$method, $url] = explode(' ', $route);
            $answer = as_user(OWNER, $method, $url, $method === 'POST' ? ['confirm' => substr($made['body']['backup']['id'], -6)] : null);
            assert_same([503, 'update_pending'], [$answer['status'], $answer['body']['code'] ?? null], $what);
        }
        // Addresses dressed up as an open one, sent exactly as written (curl would tidy the dot segments away).
        foreach (['/api/admin/backups/../surveys', '/api/admin/errors/../../admin/surveys', '/api/admin/backups/%2e%2e/people', '/api/admin/errors/anything'] as $path) {
            $curl = curl_init($GLOBALS['app']['base'] . $path);
            curl_setopt_array($curl, [CURLOPT_PATH_AS_IS => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => bearer(test_token(OWNER, roles_of(OWNER)))]);
            $body = json_decode((string) curl_exec($curl), true);
            assert_same([503, 'update_pending'], [(int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE), $body['code'] ?? null], "$path: closed by the gate, not left to the routes");
        }
        $editor = as_user(EDITH, 'GET', '/api/admin/backups');
        assert_same(403, $editor['status'], 'judged from the token alone, as the Migrations page\'s');

        $apply = as_user(OWNER, 'POST', '/api/admin/migrations/apply');
        assert_same([[['set' => 'survey', 'name' => FILE_007]], null], [$apply['body']['applied'], $apply['body']['failed']]);
        assert_match('/^A backup of the database as it was is \d{8}-\d{6}Z-before-migration-[0-9a-f]{32}\.$/D', (string) $apply['body']['note'], 'a backup before the update');
        $entry = dbOne("SELECT actor_id, details FROM anotoki_audit_log WHERE action = 'migrations.applied' ORDER BY id DESC LIMIT 1");
        assert_same([OWNER, [FILE_007]], [(int) $entry['actor_id'], json_decode((string) $entry['details'], true)['applied']], 'the Apply, audited');
    } finally {
        dbExec('INSERT INTO migrations (filename) VALUES (?) ON CONFLICT DO NOTHING', [FILE_007]);
    }
    // The site's own line of a database's refusal (api/index.php) is in the server's log, as it always was - the one this file caused.
    assert_same([], array_values(array_filter(server_problems($GLOBALS['app']), static fn(string $line): bool => !str_contains($line, 'the test refuses it'))));
});
