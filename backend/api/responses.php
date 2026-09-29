<?php

declare(strict_types=1);

/**
 * Filled surveys: sent by the people taking a survey - once each, while it
 * is open - and read by the admin area.
 */

/**
 * Keeps a person's answers to the survey at /{slug}: checked question by
 * question as the page checked them (answerProblem), kept as cleanAnswer
 * would keep them.
 *
 *   201  {id, submittedAt}
 *   404  no such survey
 *   409  not_open           it is not taking answers (closed, or its last day is over)
 *   409  already_answered   this person has answered it before
 *   422  invalid_answer     with questionId: the question whose answer is not good enough
 *
 * @return array{id: string, submittedAt: string}
 */
function responseSubmit(SiteUser $user, string $slug, mixed $body): array
{
    $row = surveySlugOk($slug) ? dbOne('SELECT ' . SURVEY_COLUMNS . " FROM surveys s WHERE s.slug = ? AND s.status <> 'draft'", [$slug]) : null;
    if ($row === null) {
        throw surveyNotFound();
    }
    if (!surveyTakesAnswers($row)) {
        throw new ApiError(409, 'not_open', 'The survey closed before your answers arrived, so they could not be kept.');
    }
    $already = static fn(): ApiError => new ApiError(409, 'already_answered', 'You have already taken this survey - your first answers are the ones kept.');
    if (dbValue('SELECT 1 FROM responses WHERE survey_id = ? AND user_id = ?', [$row['id'], $user->id])) {
        throw $already();
    }

    if (!is_array($body) || array_is_list($body)) {
        throw new ApiError(422, 'invalid_answer', 'Send the answers as an object.');
    }
    $survey = surveyJson($row);

    $gender = null;
    $age = null;
    if ($survey['askAboutYou']) {
        $aboutYou = $body['aboutYou'] ?? null;
        $gender = is_array($aboutYou) ? ($aboutYou['gender'] ?? null) : null;
        $age = is_array($aboutYou) ? ($aboutYou['age'] ?? null) : null;
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

    try {
        $saved = dbOne(
            'INSERT INTO responses (survey_id, user_id, gender, age, answers, started_at) VALUES (?, ?, ?, ?, ?::jsonb, ?) RETURNING id, submitted_at',
            [$row['id'], $user->id, $gender, $age, jsonText($kept === [] ? new stdClass() : $kept), $startedAt->format('Y-m-d H:i:s.uP')]
        );
    } catch (PDOException $e) {
        // Sent twice at once: the second one finds the first.
        if ($e->getCode() === '23505') {
            throw $already();
        }
        throw $e;
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
        'SELECT r.id, r.survey_id, r.user_id, u.preferred_username, u.email, r.gender, r.age, r.answers, r.started_at, r.submitted_at
           FROM responses r
           JOIN users u ON u.id = r.user_id
          WHERE r.survey_id = ?
          ORDER BY r.submitted_at DESC, r.id',
        [$surveyId]
    );

    return array_map(static function (array $row): array {
        $answers = json_decode((string) $row['answers'], true, 64, JSON_THROW_ON_ERROR);

        return [
            'id' => $row['id'],
            'surveyId' => $row['survey_id'],
            'person' => [
                'id' => (string) $row['user_id'],
                // The IAM always gives a username; the rest is for an account that has none any more.
                'name' => $row['preferred_username'] ?? $row['email'] ?? 'Person ' . $row['user_id'],
                'email' => $row['email'] ?? '',
            ],
            'aboutYou' => $row['gender'] !== null && $row['age'] !== null ? ['gender' => $row['gender'], 'age' => $row['age']] : null,
            'answers' => $answers === [] ? new stdClass() : $answers,
            'startedAt' => isoTime($row['started_at']),
            'submittedAt' => isoTime($row['submitted_at']),
        ];
    }, $rows);
}

/** Deletes one filled survey: its person may take the survey again. */
function responseDelete(string $id): void
{
    if (!isUuid($id) || dbExec('DELETE FROM responses WHERE id = ?', [$id]) === 0) {
        throw new ApiError(404, 'not_found', 'There are no such answers.');
    }
}
