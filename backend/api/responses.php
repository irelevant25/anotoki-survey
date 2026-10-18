<?php

declare(strict_types=1);

use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * Filled surveys: sent by the people taking a survey - once each, while it
 * is open - and read by the admin area. A visitor's (api/visitors.php) are
 * the same rows, under the visitor's negative user id.
 */

/**
 * Keeps a person's answers to the survey at /{slug}: checked question by
 * question as the page checked them (answerProblem), kept as cleanAnswer
 * would keep them.
 *
 * $user null is nobody yet (the IAM said sign-in is not required here): when
 * every check has passed, the answers make a visitor (visitorMake(), $request
 * for its address) in the transaction that keeps them, and its key comes back
 * as `visitorKey` - for the route's X-Visitor-Key header, never the body. A
 * refusal before that makes no visitor and counts nothing; so does one after
 * it, which rolls the visitor back with the answers.
 *
 * `language` in the body is the language the survey's texts were shown in
 * when the answers were sent. It is kept when it is the survey's own or one
 * the survey is translated into, and left out (NULL) when it is anything
 * else. It is a note for whoever reads the results, never a reason to refuse
 * somebody's answers.
 *
 *   201  {id, submittedAt}  (+ visitorKey: a visitor made by these answers)
 *   401  visitor_unknown    the visitor's row went while this was on its way (moved at
 *                           sign-in in another tab, ended): nothing was kept
 *   404  no such survey
 *   409  not_open           it is not taking answers (closed, or its last day is over)
 *   409  already_answered   this person (or visitor) has answered it before
 *   422  invalid_answer     with questionId: the question whose answer is not good enough
 *   429  too_many_visitors  nobody's answers, past a limit on new visitors: nothing was kept
 *
 * @return array{id: string, submittedAt: string, visitorKey?: string}
 */
function responseSubmit(?SiteUser $user, string $slug, mixed $body, ?Request $request = null): array
{
    if ($user === null && $request === null) {
        throw new LogicException('Nobody\'s answers make a visitor, which needs the request.');
    }
    $row = surveySlugOk($slug) ? dbOne('SELECT ' . SURVEY_COLUMNS . " FROM surveys s WHERE s.slug = ? AND s.status <> 'draft'", [$slug]) : null;
    if ($row === null) {
        throw surveyNotFound();
    }
    if (!surveyTakesAnswers($row)) {
        throw new ApiError(409, 'not_open', 'The survey closed before your answers arrived, so they could not be kept.');
    }
    $already = static fn(): ApiError => new ApiError(409, 'already_answered', 'You have already taken this survey - your first answers are the ones kept.');
    // Nobody has answered nothing yet.
    if ($user !== null && dbValue('SELECT 1 FROM responses WHERE survey_id = ? AND user_id = ?', [$row['id'], $user->id])) {
        throw $already();
    }

    if (!is_array($body) || array_is_list($body)) {
        throw new ApiError(422, 'invalid_answer', 'Send the answers as an object.');
    }
    $survey = surveyContent($row);

    $gender = null;
    $age = null;
    if ($survey['askAboutYou']) {
        $aboutYou = $body['aboutYou'] ?? null;
        $gender = is_array($aboutYou) ? $aboutYou['gender'] ?? null : null;
        $age = is_array($aboutYou) ? $aboutYou['age'] ?? null : null;
        if (!in_array($gender, SURVEY_GENDERS, true)) {
            throw new ApiError(422, 'invalid_answer', 'Please choose an answer.', [], ['questionId' => 'about-gender']);
        }
        if (!in_array($age, SURVEY_AGES, true)) {
            throw new ApiError(422, 'invalid_answer', 'Please choose an answer.', [], ['questionId' => 'about-age']);
        }
    }

    $given = $body['answers'] ?? [];
    if (!is_array($given) || ($given !== [] && array_is_list($given))) {
        throw new ApiError(422, 'invalid_answer', 'Send the answers by question.');
    }

    $kept = [];
    $number = 0;
    foreach ($survey['steps'] as $step) {
        foreach ($step['questions'] as $question) {
            $number++;
            $answer = answerFromBody($given[$question['id']] ?? null, $number, $question['id']);
            $problem = answerProblem($question, $answer);
            if ($problem !== null) {
                throw new ApiError(422, 'invalid_answer', "Question $number: $problem", [], ['questionId' => $question['id']]);
            }
            $clean = answerClean($question, $answer);
            if ($clean !== null) {
                $kept[$question['id']] = $clean;
            }
        }
    }

    // When they began, as their browser says - but never in the future, and
    // never before the survey opened.
    $now = new DateTimeImmutable('now', new DateTimeZone('UTC'));
    $startedAt = parseIsoTime($body['startedAt'] ?? null) ?? $now;
    $opened = $row['opened_at'] !== null ? new DateTimeImmutable($row['opened_at']) : null;
    if ($startedAt > $now) {
        $startedAt = $now;
    }
    if ($opened !== null && $startedAt < $opened) {
        $startedAt = $opened;
    }

    $language = $body['language'] ?? null;
    if (!languageCodeOk($language) || ($language !== $survey['language'] && !array_key_exists($language, $survey['translations']))) {
        $language = null;
    }

    try {
        [$saved, $key] = dbTx(static function () use ($user, $request, $row, $gender, $age, $kept, $startedAt, $language): array {
            $key = null;
            if ($user === null) {
                [$user, $key] = visitorMake($request);
            } else {
                // The taker's row, held: a visitor's that went meanwhile is 401 visitor_unknown.
                visitorHold($user);
            }
            // The language through a look at the languages there are: one deleted
            // in this very moment is no language (NULL), not a broken reference.
            $saved = dbOne(
                'INSERT INTO responses (survey_id, user_id, gender, age, answers, started_at, language)
                 VALUES (?, ?, ?, ?, ?::jsonb, ?, (SELECT code FROM languages WHERE code = ?))
                 RETURNING id, submitted_at',
                [$row['id'], $user->id, $gender, $age, jsonText($kept === [] ? new stdClass() : $kept), $startedAt->format('Y-m-d H:i:s.uP'), $language],
            );

            return [$saved, $key];
        });
    } catch (PDOException $e) {
        // Sent twice at once: the second one finds the first.
        if ($e->getCode() === '23505') {
            throw $already();
        }
        throw $e;
    }

    if ($key !== null) {
        visitorSweepSoon(true);

        return ['id' => $saved['id'], 'submittedAt' => isoTime($saved['submitted_at']), 'visitorKey' => $key];
    }

    return ['id' => $saved['id'], 'submittedAt' => isoTime($saved['submitted_at'])];
}

/** Every filled survey of a survey, newest first, with who filled it: SurveyResponse in the frontend. */
function responsesOf(string $surveyId): array
{
    if (surveyRow($surveyId) === null) {
        throw surveyNotFound();
    }
    $rows = dbAll(
        'SELECT r.id, r.survey_id, r.user_id, u.preferred_username, r.gender, r.age, r.answers, r.language, r.started_at, r.submitted_at
           FROM responses r
           JOIN users u ON u.id = r.user_id
          WHERE r.survey_id = ?
          ORDER BY r.submitted_at DESC, r.id',
        [$surveyId],
    );

    return array_map(static function (array $row): array {
        $answers = json_decode((string) $row['answers'], true, 64, JSON_THROW_ON_ERROR);
        // A visitor (a negative id) has no name: "Visitor 12", from its own id.
        $visitor = (int) $row['user_id'] < 0;

        return [
            'id' => $row['id'],
            'surveyId' => $row['survey_id'],
            'person' => [
                'id' => (string) $row['user_id'],
                // The IAM's name - its placeholder, deleted-{id}, once it deleted the account (api/people.php). The
                // IAM always gives a username; the rest is for a row that has none. No address: the IAM keeps
                // people's addresses, this site none (migration 011).
                'name' => $visitor ? 'Visitor ' . -(int) $row['user_id'] : $row['preferred_username'] ?? 'Person ' . $row['user_id'],
                'visitor' => $visitor,
            ],
            'aboutYou' => $row['gender'] !== null && $row['age'] !== null ? ['gender' => $row['gender'], 'age' => $row['age']] : null,
            'answers' => $answers === [] ? new stdClass() : $answers,
            // The language the survey was read in; null when nobody said, or said one the survey is not in.
            'language' => $row['language'],
            'startedAt' => isoTime($row['started_at']),
            'submittedAt' => isoTime($row['submitted_at']),
        ];
    }, $rows);
}

/**
 * Deletes one filled survey: its person may take the survey again (a visitor
 * too, while its key lives; an ended visitor left with no answers goes).
 * Answers whose they were and which survey's, for the audit log.
 *
 * @return array{survey_id: string, user_id: int}
 */
function responseDelete(string $id): array
{
    $gone = static fn(): ApiError => new ApiError(404, 'not_found', 'There are no such answers.');
    if (!isUuid($id)) {
        throw $gone();
    }

    return dbTx(static function () use ($id, $gone): array {
        $row = dbOne('DELETE FROM responses WHERE id = ? RETURNING survey_id, user_id', [$id]);
        if ($row === null) {
            throw $gone();
        }
        visitorsForgetEmpty([(int) $row['user_id']]);

        return ['survey_id' => (string) $row['survey_id'], 'user_id' => (int) $row['user_id']];
    });
}

/**
 * Deletes every filled survey of one person - what the People page's Delete
 * takes (peopleDelete(), api/people.php) - holding their row first, as a send
 * of their answers does (visitorHold()): one at that moment waits for the
 * other. Their row stays: they are somebody who signed in, and the surveys
 * they wrote are theirs. Null when there is nobody (no person) with that id.
 *
 * Only inside the transaction the library holds around the delete
 * (People::delete(), anotoki-lib 0.5.0) - the page's, or a restore's that
 * does it again: it begins, commits and rolls back none of its own, and works
 * on $pdo alone.
 */
function responsesDeleteOf(PDO $pdo, int $userId): ?int
{
    if (!$pdo->inTransaction()) {
        throw new LogicException('A person\'s answers are deleted only inside the transaction the library holds around the delete.');
    }
    if ($userId <= 0) {
        return null;
    }
    $held = $pdo->prepare('SELECT id FROM users WHERE id = ? AND id > 0 FOR UPDATE');
    $held->execute([$userId]);
    if ($held->fetchColumn() === false) {
        return null;
    }
    $deleted = $pdo->prepare('DELETE FROM responses WHERE user_id = ?');
    $deleted->execute([$userId]);

    return $deleted->rowCount();
}
