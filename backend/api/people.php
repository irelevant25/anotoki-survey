<?php

declare(strict_types=1);

use Anotoki\Lib\Admin\Schema as AdminSchema;
use Anotoki\Lib\Feedback\Feedback;
use Anotoki\Lib\People\People;
use Anotoki\Lib\People\PeopleColumn;
use Anotoki\Lib\People\PeopleTable;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * The people who signed in here: this site's users table, kept and read by
 * the anotoki family's library (anotoki-lib 0.5.1's people module,
 * Anotoki\Lib\People) - through a mapping, never a table of its own: every
 * answer, every survey's author and every visitor lives in users.
 *
 *   - Recorded from their token (the library's RecordPerson, on the routes that
 *     read or write the site's data - routes/*.php): their row made on a first
 *     request, the name kept to the token's preferred_username (a token without
 *     one keeps the stored name), last_seen_at at most every five minutes.
 *     Never on the Migrations routes, the error log's or the backups': they
 *     work while users waits for an update. A visitor (a negative id) is never
 *     recorded, read or written by the library: it is api/visitors.php's.
 *   - Scrubbed when the IAM deletes their account, thirty days after they asked
 *     (the library's Scrubber, after an answer at most once an hour -
 *     PeopleUpkeep, api/index.php - or the People page's Check now): their
 *     name becomes the IAM's placeholder, deleted-{id}, and anonymized_at the
 *     IAM's time; everything else stays, nobody's now - their answers too (the
 *     owner's "keep everything"). One hook (peopleForgetFeedback()): the
 *     feedback messages they sent lose the reply address they wrote and their
 *     browser's name, their words staying - no other copy of a name lives
 *     here, and no other address at all (migration 011).
 *   - Listed on the admin panel's People page (the library's PeopleRoutes,
 *     /api/admin/people, ADMIN alone - routes/admin.php): with how many surveys
 *     each answered and wrote here, the visitors in one line, where the scrub
 *     stands, and Delete - every answer of theirs, after the page's question
 *     (and, by the library, their feedback's reply address and browser).
 *   - Done again by a restore: a backup made before a Delete still holds the
 *     answers, so a restore deletes them again inside its own transaction, by
 *     the audit log's person.data_deleted (the library's People::replay(), the
 *     Backups' beforeCommit - api/admin_tools.php), then scrubs the accounts
 *     the IAM deleted since (People::afterRestore()).
 */

/** The site's people for the library: users, its name and times, the connection, the IAM, the scrub's hook. */
function surveyPeople(): People
{
    static $made = [];

    $iam = surveyIam();

    return $made[spl_object_id($iam)] ??= new People(
        new PeopleTable(table: 'users', name: 'preferred_username', firstSeen: 'first_seen_at', lastSeen: 'last_seen_at'),
        static fn(): PDO => db(),
        $iam,
        hooks: [peopleForgetFeedback(...)],
    );
}

/**
 * The scrub's hook, for each account the IAM deleted - inside the account's
 * transaction and on the scrub's connection, whether the person had a row here
 * or not: the feedback messages they sent (anotoki_feedback, the library's
 * table) lose the reply address they wrote and their browser's name; the words
 * stay, nobody's now. Idempotent, and nothing before the table is there. The
 * People page's Delete does the same itself (the library's People::delete()).
 */
function peopleForgetFeedback(PDO $pdo, int $sub, ?array $former): void
{
    if (AdminSchema::has($pdo, AdminSchema::FEEDBACK_TABLE)) {
        Feedback::forgetPeopleOn($pdo, [$sub]);
    }
}

/**
 * The People page's own columns: how many surveys each person answered here
 * (a visitor's answers moved into their account count as theirs), and how many
 * they wrote (an editor's).
 *
 * @return list<PeopleColumn>
 */
function peopleColumns(): array
{
    return [
        new PeopleColumn('answered', 'Surveys answered', 'count', static fn(PDO $pdo, array $subs): array => peopleCounts(
            $pdo,
            'SELECT user_id, count(*) FROM responses WHERE user_id = ANY(?::bigint[]) GROUP BY user_id',
            $subs
        )),
        new PeopleColumn('written', 'Surveys written', 'count', static fn(PDO $pdo, array $subs): array => peopleCounts(
            $pdo,
            'SELECT created_by, count(*) FROM surveys WHERE created_by = ANY(?::bigint[]) GROUP BY created_by',
            $subs
        )),
    ];
}

/**
 * [id => count] of one page of people.
 *
 * @param list<int> $subs
 * @return array<int, int>
 */
function peopleCounts(PDO $pdo, string $sql, array $subs): array
{
    $statement = $pdo->prepare($sql);
    $statement->execute([visitorIdList($subs)]);

    return array_map('intval', $statement->fetchAll(PDO::FETCH_KEY_PAIR));
}

/**
 * The visitors line: everybody who answered without signing in and is still
 * listed as "Visitor N" (count), and how many of them their browser can still
 * bring back (active: the key not ended) - their answers move into an
 * account when they sign in.
 *
 * @return array{count: int, active: int}
 */
function peopleVisitors(PDO $pdo): array
{
    $row = $pdo->query('SELECT count(*), count(visitor_key_hash) FROM users WHERE id < 0')->fetch(PDO::FETCH_NUM);

    return ['count' => (int) $row[0], 'active' => (int) $row[1]];
}

/**
 * The People page's Delete: every answer of the person's - their row stays,
 * and so do the surveys they wrote. The library audits it
 * (person.data_deleted) and asks no proof of a recent sign-in: the page's
 * question is all it asks (the owner's decision of 2026-10-11). Null when
 * there is nobody with that id here: the library's 404.
 *
 * The library's hook (anotoki-lib 0.5.0, PeopleRoutes' delete and the
 * restore's replay - api/admin_tools.php): it runs inside the library's
 * transaction (People::delete()), begins none of its own, and does all of its
 * work on the $pdo it is given - never db(): in a restore that is the
 * restore's connection, which holds every restored table, and db() would wait
 * on it while the restore waits on the hook. $request is the page's, or null
 * when a restore does the delete again: the same delete either way (nothing
 * here is kept of what goes).
 *
 * @return ?array{deleted: array<string, int>}
 */
function peopleDelete(PDO $pdo, int $sub, ?Request $request = null): ?array
{
    $deleted = responsesDeleteOf($pdo, $sub);

    return $deleted === null ? null : ['deleted' => ['Answers' => $deleted]];
}

/**
 * The names of the people the admin tools' pages name, by id: the audit log's
 * actors and a backup's maker (AdminContext's names) - the name the site has
 * for each, the IAM's placeholder for one it deleted; a visitor, and an id
 * that is none, has no name.
 *
 * @param list<int|string> $ids
 * @return array<int, string>
 */
function peopleNames(array $ids): array
{
    $ids = array_values(array_filter(
        array_map(static fn(mixed $id): int => is_int($id) ? $id : (is_string($id) && preg_match('/^[1-9][0-9]{0,17}$/D', $id) === 1 ? (int) $id : 0), $ids),
        static fn(int $id): bool => $id > 0
    ));
    if ($ids === []) {
        return [];
    }
    $names = [];
    foreach (dbAll('SELECT id, preferred_username FROM users WHERE id = ANY(?::bigint[]) AND preferred_username IS NOT NULL', [visitorIdList($ids)]) as $row) {
        $names[(int) $row['id']] = (string) $row['preferred_username'];
    }

    return $names;
}
