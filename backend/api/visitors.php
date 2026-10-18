<?php

declare(strict_types=1);

use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Visitors: somebody who takes surveys without signing in, while the IAM says
 * this site does not require it (authLoginRequired()). A visitor is a row of
 * users with a negative id (an IAM id is always positive; migration 006), no
 * name, no address - so its answers are kept, read and counted exactly like a
 * person's: once each, the same queries. Nothing else makes, finds, ends or
 * moves a visitor.
 *
 * The key: 32 random bytes the server makes, base64url without padding (43
 * characters). It leaves the server once, in the X-Visitor-Key header of the
 * 201 whose answers made the visitor (never in a body, a URL or a log); the
 * browser keeps it and sends it back in the X-Visitor-Key request header. The
 * row keeps only its SHA-256, and a request is that visitor when the hash of
 * the key it sends is a row's - the key has 256 bits, so a plain lookup is safe.
 * A key makes somebody a visitor only on the surveys' own routes (the library's
 * Identify there, routes/surveys.php, asks visitorFound()); the one other reader
 * is POST /api/visitor/move (routes/visitor.php), which needs a verified token as
 * well and only hands the key in. A visitor reaches the open surveys and its own
 * answers, and nothing else - no admin panel, no role.
 *
 *   visitorFound()      the visitor of a key, seen now (written at most once an hour); null
 *                       for a key that is nobody's, or no key - the library's Identify answers
 *                       401 visitor_unknown then
 *   visitorMake()       a new visitor, inside the transaction that keeps its first answers -
 *                       after the limits (new ones an hour per address and in all, visitors
 *                       with a key at once); a refused or failed send makes none and counts nothing
 *   visitorHold()       the taker's row held while their answers are written: a visitor's row
 *                       that went meanwhile (moved at sign-in in another tab, ended) is 401
 *                       visitor_unknown, never a database error
 *   visitorSweep()      the clean-up, after somebody's answer: visitors unseen for keep_days
 *                       end (the key's hash cleared; their answers stay, as "Visitor N") - or
 *                       go, when they have no answers left
 *   visitorsForgetEmpty()  ended visitors whose last answers were just deleted go too
 *   visitorMoveInto()   at sign-in, a visitor's answers into the person's (a survey both
 *                       answered keeps the person's answers)
 */

const VISITOR_HEADER = 'X-Visitor-Key';
const VISITOR_KEY_PATTERN = '/^[A-Za-z0-9_-]{43}$/D';

/** The key a request sends, or null when it sends none (an empty header is none). */
function visitorKeyOf(Request $request): ?string
{
    $key = trim($request->getHeaderLine(VISITOR_HEADER));

    return $key === '' ? null : $key;
}

function visitorKeyWellFormed(string $key): bool
{
    return preg_match(VISITOR_KEY_PATTERN, $key) === 1;
}

function visitorHash(string $key): string
{
    return hash('sha256', $key);
}

/**
 * The visitor of this key, seen now - or null for a key that is nobody's, or
 * not a key: the library's Identify (api/auth.php) answers 401 visitor_unknown
 * then, and nothing else is read of the request.
 */
function visitorFound(string $key): ?SiteUser
{
    if (!visitorKeyWellFormed($key)) {
        return null;
    }
    $row = dbOne("SELECT id, (last_seen_at < now() - interval '1 hour')::int AS stale FROM users WHERE visitor_key_hash = ?", [visitorHash($key)]);
    if ($row === null) {
        return null;
    }
    $id = (int) $row['id'];
    if ((int) $row['stale'] === 1) {
        dbExec("UPDATE users SET last_seen_at = now() WHERE id = ? AND last_seen_at < now() - interval '1 hour'", [$id]);
    }

    return visitorUser($id);
}

function visitorUser(int $id): SiteUser
{
    return new SiteUser($id, null, [], true);
}

/**
 * A new visitor for answers about to be kept, and its key - or 429
 * too_many_visitors. Only inside the transaction that keeps them: a refusal
 * here, or anything after it that rolls the transaction back, leaves no
 * visitor and gives its counts back.
 *
 * The counts are rows (visitorCounterHit()), taken in one order - the
 * address's, then everybody's - and held to the end of the transaction: two new
 * visitors at the same moment wait for each other, and the second one counts
 * the first. The count of visitors with a key comes after everybody's row is
 * held, for the same reason. The address's row goes by a keyed HMAC of the
 * address (clientAddressKept(), api/client_address.php) - a pseudonym, never
 * the address in the clear.
 *
 * @return array{0: SiteUser, 1: string}
 */
function visitorMake(Request $request): array
{
    if (!db()->inTransaction()) {
        throw new LogicException('A visitor is made only inside the transaction that keeps its answers.');
    }
    $settings = visitorSettings();

    if (visitorCounterHit('visitors:new:' . clientAddressKept($request, $settings), 3600) > $settings['new_per_hour_per_address']) {
        throw visitorsTooMany('Too many people have answered without signing in from this address within the hour. Sign in to send your answers, or try again later.');
    }
    if (visitorCounterHit('visitors:new', 3600) > $settings['new_per_hour']) {
        throw visitorsTooMany('Too many people have answered without signing in within the hour. Sign in to send your answers, or try again later.');
    }
    if ((int) dbValue('SELECT count(*) FROM users WHERE visitor_key_hash IS NOT NULL') >= $settings['max_active']) {
        throw visitorsTooMany('Too many people are taking surveys without signing in just now. Sign in to send your answers, or try again later.');
    }

    $key = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
    $id = (int) dbValue("INSERT INTO users (id, visitor_key_hash, last_seen_at) VALUES (nextval('visitor_ids'), ?, now()) RETURNING id", [visitorHash($key)]);

    return [visitorUser($id), $key];
}

/**
 * One more on the counter $name, whose count starts again every
 * $windowSeconds: the count now. One statement, which holds the counter's row
 * to the end of the transaction.
 */
function visitorCounterHit(string $name, int $windowSeconds): int
{
    return (int) dbValue(
        'INSERT INTO visitor_counters (name, count, window_ends) VALUES (?, 1, now() + make_interval(secs => ?))
         ON CONFLICT (name) DO UPDATE SET
             count = CASE WHEN visitor_counters.window_ends <= now() THEN 1 ELSE visitor_counters.count + 1 END,
             window_ends = CASE WHEN visitor_counters.window_ends <= now() THEN EXCLUDED.window_ends ELSE visitor_counters.window_ends END
         RETURNING count',
        [$name, $windowSeconds],
    );
}

/**
 * The taker's row, held (FOR SHARE) to the end of the transaction that writes
 * their answers: the move at sign-in and the clean-up wait for it, or it waits
 * for them. A visitor's row that went meanwhile - moved into an account in
 * another tab, ended or deleted by the clean-up - is 401 visitor_unknown, the
 * same as the key it was found by: nothing was written.
 */
function visitorHold(SiteUser $taker): void
{
    if (!db()->inTransaction()) {
        throw new LogicException('A taker\'s row is held only inside a transaction.');
    }
    $held = dbValue('SELECT id FROM users WHERE id = ? AND (id > 0 OR visitor_key_hash IS NOT NULL) FOR SHARE', [$taker->id]);
    if ($held === null) {
        if ($taker->visitor) {
            throw visitorUnknown();
        }
        throw new RuntimeException("The users row of {$taker->id} is gone.");
    }
}

/**
 * The clean-up: the visitors with a key unseen for keep_days - a batch, the
 * longest unseen first, ones another request holds skipped (the next clean-up
 * takes them) - go when they have no answers, and end otherwise: the key's
 * hash is cleared, so the key opens nothing, and the answers stay in the
 * results under the row's "Visitor N". A visitor that is still coming back is
 * never touched, answers or not. Then the counters whose hour is over.
 * Every statement may take sweep_timeout_ms, and waits no longer for a lock.
 *
 * @return array{ended: int, deleted: int, counters: int}
 */
function visitorSweep(): array
{
    $settings = visitorSettings();

    return dbTx(static function () use ($settings): array {
        $timeout = $settings['sweep_timeout_ms'] . 'ms';
        dbValue("SELECT set_config('statement_timeout', ?, true), set_config('lock_timeout', ?, true)", [$timeout, $timeout]);
        $ids = array_map(
            'intval',
            array_column(
                dbAll(
                    'SELECT id FROM users
              WHERE visitor_key_hash IS NOT NULL AND last_seen_at < now() - make_interval(days => ?)
              ORDER BY last_seen_at
              LIMIT ?
              FOR UPDATE SKIP LOCKED',
                    [$settings['keep_days'], $settings['sweep_batch']],
                ),
                'id',
            ),
        );

        $deleted = $ended = 0;
        if ($ids !== []) {
            $list = visitorIdList($ids);
            $deleted = dbExec('DELETE FROM users u WHERE u.id = ANY(?::bigint[]) AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.user_id = u.id)', [$list]);
            $ended = dbExec('UPDATE users SET visitor_key_hash = NULL WHERE id = ANY(?::bigint[])', [$list]);
        }
        $counters = dbExec('DELETE FROM visitor_counters WHERE window_ends < now()');

        return ['ended' => $ended, 'deleted' => $deleted, 'counters' => $counters];
    });
}

/**
 * The clean-up, after this request's answer (afterAnswerAdd()): always when
 * $now (a visitor was just made), else at most once an hour across the site -
 * a marker file's time decides, without a write to the database. It never
 * fails the request it runs after: afterAnswerRun() logs what goes wrong.
 */
function visitorSweepSoon(bool $now = false): void
{
    $marker = storageDir() . '/visitors-swept';
    clearstatcache(true, $marker);
    if (!$now) {
        $last = @filemtime($marker);
        if ($last !== false && $last > time() - 3600) {
            return;
        }
    }
    if (!is_dir(dirname($marker))) {
        @mkdir(dirname($marker), 0777, true);
    }
    // Without a marker that can be written, only the sweeps after a new visitor: never one a request.
    if (!@touch($marker) && !$now) {
        return;
    }

    afterAnswerAdd(static function (): void {
        $swept = visitorSweep();
        if ($swept['ended'] > 0 || $swept['deleted'] > 0) {
            error_log("[visitors] unseen for a long time: {$swept['ended']} ended (their answers stay), {$swept['deleted']} with no answers deleted");
        }
    });
}

/**
 * Of these users, the ended visitors (no key) with no answers left go: what
 * a delete of answers - one person's, or a survey's - calls after it. A
 * visitor that still has its key stays, answers or not, until it is unseen
 * for keep_days (visitorSweep()); a person is never touched.
 *
 * @param int[] $ids
 */
function visitorsForgetEmpty(array $ids): int
{
    $ids = array_values(array_filter($ids, static fn(int $id): bool => $id < 0));
    if ($ids === []) {
        return 0;
    }

    return dbExec(
        'DELETE FROM users u
          WHERE u.id = ANY(?::bigint[]) AND u.id < 0 AND u.visitor_key_hash IS NULL
            AND NOT EXISTS (SELECT 1 FROM responses r WHERE r.user_id = u.id)',
        [visitorIdList($ids)],
    );
}

/** Ids as a PostgreSQL array literal ('{-3,-1}'), for = ANY(?::bigint[]). */
function visitorIdList(array $ids): string
{
    return '{' . implode(',', array_map('intval', $ids)) . '}';
}

/**
 * At sign-in: the answers this key's visitor sent become $person's, in one
 * transaction - the visitor's row held first, then the person's, each waiting
 * at most move_lock_timeout_ms. A survey both answered keeps the person's
 * answers as they are, and the visitor's go (kept); every other answer of the
 * visitor's becomes the person's, with its language and its times (moved);
 * then the visitor's row goes, and its key opens nothing from then on.
 *
 * Three statements, not one: a single statement that had to wait goes on with
 * what it saw before the wait. found false: no visitor has this key - moved
 * already (another tab), ended or deleted by the clean-up, or never there -
 * which is no error, so the move may be asked again. A lock not had in time, a
 * deadlock, a serialization failure or a write that met the person's own (the
 * same survey answered at that moment): 503 visitor_move_retry, nothing moved.
 *
 * @return array{found: bool, moved: int, kept: int}
 */
function visitorMoveInto(SiteUser $person, string $key): array
{
    if ($person->visitor || $person->id <= 0) {
        throw new LogicException('Only a person signed in takes a visitor in.');
    }
    $timeout = visitorSettings()['move_lock_timeout_ms'] . 'ms';

    try {
        return dbTx(static function () use ($person, $key, $timeout): array {
            dbValue("SELECT set_config('lock_timeout', ?, true)", [$timeout]);
            $visitor = dbValue('SELECT id FROM users WHERE visitor_key_hash = ? AND id < 0 FOR UPDATE', [visitorHash($key)]);
            if ($visitor === null) {
                return ['found' => false, 'moved' => 0, 'kept' => 0];
            }
            $visitor = (int) $visitor;
            if (dbValue('SELECT id FROM users WHERE id = ? AND id > 0 FOR UPDATE', [$person->id]) === null) {
                throw new RuntimeException("No users row of {$person->id} to move a visitor's answers into.");
            }

            $kept = dbExec(
                'DELETE FROM responses v USING responses p
                  WHERE v.user_id = ? AND p.user_id = ? AND p.survey_id = v.survey_id',
                [$visitor, $person->id],
            );
            $moved = dbExec('UPDATE responses SET user_id = ? WHERE user_id = ?', [$person->id, $visitor]);
            dbExec('DELETE FROM users WHERE id = ?', [$visitor]);

            return ['found' => true, 'moved' => $moved, 'kept' => $kept];
        });
    } catch (PDOException $e) {
        if (in_array((string) $e->getCode(), ['23505', '40001', '40P01', '55P03'], true)) {
            error_log('[visitors] a move at sign-in did not finish, to be asked again: SQLSTATE ' . $e->getCode());

            throw new ApiError(503, 'visitor_move_retry', 'Moving what this browser answered into your account did not finish this time. Try again in a moment.', ['Retry-After' => '2']);
        }
        throw $e;
    }
}

/** A key that is nobody's (any more), or not a key at all. */
function visitorUnknown(): ApiError
{
    return new ApiError(401, 'visitor_unknown', 'This browser\'s visit without signing in has ended - after a long time unseen, or moved into an account at sign-in. Answers sent from it are kept.');
}

function visitorsTooMany(string $message): ApiError
{
    return new ApiError(429, 'too_many_visitors', $message, ['Retry-After' => '3600']);
}
