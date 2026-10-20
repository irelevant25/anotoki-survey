<?php

declare(strict_types=1);

/**
 * The surveys in the database: read for the people taking them and for the
 * admin area, written by editors.
 *
 * A survey goes out in one shape everywhere - the frontend's Survey
 * (core/survey/survey.model.ts), plus `revision`: the number of its last save.
 * An editor sends back the revision their changes were made to; a survey saved
 * by somebody else in between is refused (409 conflict, with the version that
 * is there now) rather than overwritten.
 *
 * A survey is written in one language and may hold its texts in others
 * (`language`, `translations` in its content). Inside PHP the translations
 * are arrays; wherever a survey leaves PHP - into the database, to the editor,
 * to the people taking it - every map of them is an object
 * (surveyTranslationsJson()).
 */

const SURVEY_COLUMNS = 's.id, s.slug, s.title, s.status, s.closes_on, s.content, s.revision, s.created_at, s.updated_at, s.opened_at, s.closed_at';

/**
 * Open, and its last day not over anywhere on Earth: the day ends at midnight
 * UTC-12, which is noon UTC the day after. The page tells people by their own
 * clock, so nobody is turned away while it still says "open until today".
 */
const SURVEY_TAKING_ANSWERS_SQL = "s.status = 'open' AND (s.closes_on IS NULL OR now() < ((s.closes_on + 1)::timestamp AT TIME ZONE 'UTC') + interval '12 hours')";

/** The same, for a row already read. */
function surveyTakesAnswers(array $row): bool
{
    if ($row['status'] !== 'open') {
        return false;
    }
    if ($row['closes_on'] === null) {
        return true;
    }
    $end = (new DateTimeImmutable($row['closes_on'] . ' 00:00:00', new DateTimeZone('UTC')))->modify('+1 day +12 hours');

    return new DateTimeImmutable('now', new DateTimeZone('UTC')) < $end;
}

/**
 * A survey row's content, for PHP to work with: what the row holds, and for a
 * survey kept before surveys had languages what that means - written in
 * English, translated into nothing. (So no survey needed migrating.) The
 * translations are arrays here.
 *
 * And a step kept without its own text and pictures has none: '' and [].
 * Migration 016 gave the two to every step kept then, but a release from
 * before it, put back on the host after it ran (a rollback), saves its steps
 * without them - and 016 never runs again. So whatever reads a survey here -
 * its problems when it opens, the people taking it, the editor - finds both
 * on every step, as every survey leaving PHP has them.
 */
function surveyContent(array $row): array
{
    $content = json_decode((string) $row['content'], true, 512, JSON_THROW_ON_ERROR);
    $content['language'] = is_string($content['language'] ?? null) ? $content['language'] : SURVEY_LANGUAGE_DEFAULT;
    $content['translations'] = is_array($content['translations'] ?? null) ? $content['translations'] : [];
    foreach ($content['steps'] as &$step) {
        $step['text'] = is_string($step['text'] ?? null) ? $step['text'] : '';
        $step['images'] = is_array($step['images'] ?? null) ? $step['images'] : [];
    }
    unset($step);

    return $content;
}

/** The content as it is written into the database: the translations' maps as objects. */
function surveyContentJson(array $content): string
{
    return jsonText(['translations' => surveyTranslationsJson($content['translations'])] + $content);
}

/**
 * A survey row as the frontend reads it. $offered: for the people taking it,
 * the languages they are offered - a translation into any other language is
 * left out (it is not theirs to read yet); null for the admin area, which
 * gets them all.
 *
 * @param ?string[] $offered
 */
function surveyJson(array $row, ?array $offered = null): array
{
    $content = surveyContent($row);
    $translations = $offered === null ? $content['translations'] : array_intersect_key($content['translations'], array_flip($offered));

    return [
        'id' => $row['id'],
        'slug' => $row['slug'],
        'title' => $row['title'],
        'intro' => $content['intro'],
        'thanks' => $content['thanks'],
        'askAboutYou' => $content['askAboutYou'],
        'status' => $row['status'],
        'closesOn' => $row['closes_on'],
        'steps' => $content['steps'],
        'language' => $content['language'],
        'translations' => surveyTranslationsJson($translations),
        'createdAt' => isoTime($row['created_at']),
        'updatedAt' => isoTime($row['updated_at']),
        'openedAt' => isoTime($row['opened_at']),
        'closedAt' => isoTime($row['closed_at']),
        'revision' => (int) $row['revision'],
    ];
}

function surveyNotFound(): ApiError
{
    return new ApiError(404, 'not_found', 'There is no such survey.');
}

// ── For the people taking them ──────────────────────────────────────────────

/**
 * The surveys taking answers now, newest first, each with when this person -
 * or visitor - answered it (null: not yet; always for nobody, $userId null:
 * `user_id = NULL` matches no row).
 *
 * @return array<array{survey: array, answeredAt: ?string}>
 */
function surveysOpen(?int $userId): array
{
    $rows = dbAll(
        'SELECT ' .
            SURVEY_COLUMNS .
            ', r.submitted_at AS answered_at
           FROM surveys s
           LEFT JOIN responses r ON r.survey_id = s.id AND r.user_id = ?
          WHERE ' .
            SURVEY_TAKING_ANSWERS_SQL .
            '
          ORDER BY s.opened_at DESC NULLS LAST, s.created_at DESC',
        [$userId],
    );
    $offered = $rows === [] ? [] : languagesOffered();

    return array_map(static fn(array $row): array => ['survey' => surveyJson($row, $offered), 'answeredAt' => isoTime($row['answered_at'])], $rows);
}

/**
 * The survey at /{slug} for the people taking it - open or closed, never a
 * draft - and when this person or visitor answered it (null for nobody).
 *
 * @return array{survey: array, answeredAt: ?string}
 */
function surveyForParticipant(string $slug, ?int $userId): array
{
    // Only a survey that is not a draft is reachable, and such a survey's
    // address is always a valid one; anything else is nobody's (and bytes that
    // are not UTF-8 never reach the database, which would refuse them).
    if (!surveySlugOk($slug)) {
        throw surveyNotFound();
    }
    $row = dbOne(
        'SELECT ' .
            SURVEY_COLUMNS .
            ', r.submitted_at AS answered_at
           FROM surveys s
           LEFT JOIN responses r ON r.survey_id = s.id AND r.user_id = ?
          WHERE s.slug = ? AND s.status <> \'draft\'',
        [$userId, $slug],
    );
    if ($row === null) {
        throw surveyNotFound();
    }

    return ['survey' => surveyJson($row, languagesOffered()), 'answeredAt' => isoTime($row['answered_at'])];
}

// ── For the admin area ──────────────────────────────────────────────────────

/**
 * Every survey, without its questions: what the list of surveys shows, and
 * what the editor checks an address against.
 */
function surveySummaries(): array
{
    $rows = dbAll(
        "SELECT s.id, s.slug, s.title, s.status, s.closes_on, s.created_at, s.updated_at, s.opened_at, s.closed_at, s.revision,
                jsonb_array_length(s.content->'steps') AS steps,
                (SELECT count(*) FROM jsonb_array_elements(s.content->'steps') AS step, jsonb_array_elements(step->'questions') AS question) AS questions,
                (SELECT count(*) FROM responses r WHERE r.survey_id = s.id) AS responses
           FROM surveys s
          ORDER BY s.updated_at DESC",
    );

    return array_map(
        static fn(array $row): array => [
            'id' => $row['id'],
            'slug' => $row['slug'],
            'title' => $row['title'],
            'status' => $row['status'],
            'closesOn' => $row['closes_on'],
            'createdAt' => isoTime($row['created_at']),
            'updatedAt' => isoTime($row['updated_at']),
            'openedAt' => isoTime($row['opened_at']),
            'closedAt' => isoTime($row['closed_at']),
            'revision' => (int) $row['revision'],
            'steps' => (int) $row['steps'],
            'questions' => (int) $row['questions'],
            'responses' => (int) $row['responses'],
        ],
        $rows,
    );
}

function surveyRow(string $id, bool $lock = false): ?array
{
    if (!isUuid($id)) {
        return null;
    }

    return dbOne('SELECT ' . SURVEY_COLUMNS . ' FROM surveys s WHERE s.id = ?' . ($lock ? ' FOR UPDATE' : ''), [$id]);
}

function surveyById(string $id): array
{
    $row = surveyRow($id);
    if ($row === null) {
        throw surveyNotFound();
    }

    return surveyJson($row);
}

/**
 * The pictures of a survey as it is kept - a step's, a question's, an
 * option's: each with the size of its file and the address it is served at. A
 * picture this site does not have (any more) is refused - it could only ever
 * show as missing.
 *
 * @param array{content: array, imageIds: string[]} $survey from surveyFromBody()
 */
function surveyContentWithImages(array $survey): array
{
    $meta = imagesMeta($survey['imageIds']);
    $missing = array_diff($survey['imageIds'], array_keys($meta));
    if ($missing !== []) {
        throw new ApiError(422, 'unknown_image', 'A picture in this survey is not on the server (any more). Remove it and add it again.');
    }

    $fill = static function (array $images) use ($meta): array {
        return array_map(
            static fn(array $image): array => $image + [
                'width' => $meta[$image['id']]['width'],
                'height' => $meta[$image['id']]['height'],
                'src' => imageSrc($image['id'], $meta[$image['id']]['type']),
            ],
            $images,
        );
    };

    $content = $survey['content'];
    foreach ($content['steps'] as &$step) {
        $step['images'] = $fill($step['images']);
        foreach ($step['questions'] as &$question) {
            $question['images'] = $fill($question['images']);
            foreach ($question['options'] as &$option) {
                $option['images'] = $fill($option['images']);
            }
            unset($option);
        }
        unset($question);
    }
    unset($step);

    return $content;
}

/**
 * Which pictures the survey shows now - under a step's text, under a
 * question's, on an option: the list the clean-up goes by. A step or a
 * question that goes takes its pictures out of it with the next save, and the
 * clean-up deletes them once nothing shows them (images.php).
 */
function surveyImagesRecord(string $surveyId, array $imageIds): void
{
    dbExec('DELETE FROM survey_images WHERE survey_id = ?', [$surveyId]);
    foreach ($imageIds as $imageId) {
        dbExec('INSERT INTO survey_images (survey_id, image_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [$surveyId, $imageId]);
    }
}

/** A survey people can reach must have an address they can type. */
function surveyLiveSlugProblem(string $slug): ?string
{
    if (!surveySlugOk($slug)) {
        return 'The address may hold only small letters, digits and dashes.';
    }
    if (in_array($slug, SURVEY_RESERVED_SLUGS, true)) {
        return "The address \"$slug\" belongs to the site itself - choose another.";
    }

    return null;
}

function surveySlugTaken(string $slug): ApiError
{
    return new ApiError(409, 'slug_taken', "Another survey already lives at \"$slug\" - choose another address.");
}

/**
 * Holds the languages a survey is about to be kept in - the one it is written
 * in and every one it is translated into - until the save is done. The body
 * was checked against the languages a moment ago, outside the transaction;
 * without this, one of them could be deleted in that moment (a language's
 * delete - the library's, which asks SurveyLanguageUsage::refuseDelete() -
 * counts the surveys that use a language, and cannot see a save that is not
 * finished), and the survey would be left in a language the site no longer
 * has. With it the two wait for each other on the language's row: a delete
 * that comes second finds the survey, a save that comes second is refused
 * here.
 *
 * Called inside the save's transaction - in surveySave() after the survey's
 * own row is held, so everybody takes the two in the same order (a delete
 * holds the language and only reads the surveys). FOR SHARE: saves do not
 * wait for each other, nor for a save of the site's strings.
 *
 * @param array{language: string, translations: array<string, mixed>} $content from surveyFromBody()
 */
function surveyLanguagesLock(array $content): void
{
    $codes = array_map('strval', [$content['language'], ...array_keys($content['translations'])]);
    $found = dbAll('SELECT code FROM languages WHERE code IN (' . implode(', ', array_fill(0, count($codes), '?')) . ') FOR SHARE', $codes);
    if (count($found) !== count($codes)) {
        throw surveyInvalid('A language of this survey has just been deleted from the site. Add the language again, or take it out of the survey.');
    }
}

/** A new draft from what the editor sent. */
function surveyCreate(SiteUser $user, mixed $body): array
{
    $survey = surveyFromBody($body, languagesForSurveys());

    $row = dbTx(static function () use ($user, $survey): array {
        surveyLanguagesLock($survey['content']);
        $content = surveyContentWithImages($survey);
        $id = (string) dbValue('INSERT INTO surveys (slug, title, closes_on, content, created_by, updated_by) VALUES (?, ?, ?, ?::jsonb, ?, ?) RETURNING id', [
            $survey['slug'],
            $survey['title'],
            $survey['closesOn'],
            surveyContentJson($content),
            $user->id,
            $user->id,
        ]);
        surveyImagesRecord($id, $survey['imageIds']);

        return surveyRow($id);
    });

    return surveyJson($row);
}

/**
 * Saves an editor's version of the survey, made to revision $revision. A
 * survey people can reach keeps an address they can reach it at.
 *
 * The language a survey is written in does not change while a translation is
 * kept across the change: the texts of the document and those of the
 * translation would swap meaning under whoever is translating. So it is
 * refused when the language differs and both the survey as it is kept and the
 * one sent hold translations. Removing the translations and changing the
 * language in one save is taken - the revision says whoever sent it saw what
 * they removed, and it is what two saves would do; so is a first translation
 * that arrives together with a new language. (The editor asks for more: it
 * locks "Written in" while the survey has any translation.)
 */
function surveySave(SiteUser $user, string $id, mixed $revision, mixed $body): array
{
    if (!is_int($revision)) {
        throw new ApiError(422, 'invalid_survey', 'Say which version of the survey the changes were made to (revision).');
    }
    $survey = surveyFromBody($body, languagesForSurveys());

    $row = dbTx(static function () use ($user, $id, $revision, $survey): array {
        $current = surveyRow($id, true);
        if ($current === null) {
            throw surveyNotFound();
        }
        if ((int) $current['revision'] !== $revision) {
            throw new ApiError(409, 'conflict', 'Somebody else has saved this survey since you opened it.', [], ['survey' => surveyJson($current)]);
        }
        surveyLanguagesLock($survey['content']);
        if ($current['status'] !== 'draft') {
            $problem = surveyLiveSlugProblem($survey['slug']);
            if ($problem !== null) {
                throw new ApiError(422, 'invalid_survey', $problem . ' People can reach this survey, so its address must work.');
            }
        }
        $stored = surveyContent($current);
        if ($survey['content']['language'] !== $stored['language'] && $stored['translations'] !== [] && $survey['content']['translations'] !== []) {
            throw surveyInvalid('The language a survey is written in can be changed only while it has no translations. Remove them first.');
        }

        $content = surveyContentWithImages($survey);
        try {
            dbExec('UPDATE surveys SET slug = ?, title = ?, closes_on = ?, content = ?::jsonb, revision = revision + 1, updated_at = now(), updated_by = ? WHERE id = ?', [
                $survey['slug'],
                $survey['title'],
                $survey['closesOn'],
                surveyContentJson($content),
                $user->id,
                $id,
            ]);
        } catch (PDOException $e) {
            if (dbIsUniqueViolation($e, 'surveys_live_slug')) {
                throw surveySlugTaken($survey['slug']);
            }
            throw $e;
        }
        surveyImagesRecord($id, $survey['imageIds']);

        return surveyRow($id);
    });

    imagesCleanup();

    return surveyJson($row);
}

/**
 * Opens or closes a survey. Opening is refused while the survey has anything
 * to fix (surveyProblems) - an unfinished translation into a language people
 * are offered too; `closesOn`, when sent, is the last day it opens with - the
 * editor drops a day that has passed when it reopens a survey.
 *
 * Either way it is a new revision: the closing day is part of what an editor
 * saves, so an editor still holding the revision before must be told, not
 * allowed to put an old day back with their next save.
 */
function surveySetStatus(SiteUser $user, string $id, mixed $body): array
{
    if (!is_array($body) || !in_array($body['status'] ?? null, ['open', 'closed'], true)) {
        throw new ApiError(422, 'invalid_status', 'A survey can be opened ("open") or closed ("closed").');
    }
    $status = $body['status'];
    $setClosesOn = array_key_exists('closesOn', $body);
    $closesOn = $setClosesOn ? surveyDay($body['closesOn'], 'The last day') : null;

    $row = dbTx(static function () use ($user, $id, $status, $setClosesOn, $closesOn): array {
        $current = surveyRow($id, true);
        if ($current === null) {
            throw surveyNotFound();
        }

        if ($status === 'closed') {
            if ($current['status'] === 'draft') {
                throw new ApiError(409, 'not_open', 'The survey has not been opened, so there is nothing to close.');
            }
            dbExec("UPDATE surveys SET status = 'closed', closed_at = COALESCE(closed_at, now()), revision = revision + 1, updated_at = now(), updated_by = ? WHERE id = ?", [$user->id, $id]);

            return surveyRow($id);
        }

        $others = dbAll('SELECT id, slug FROM surveys WHERE id <> ?', [$id]);
        $problems = surveyProblems(['id' => $id, 'title' => $current['title'], 'slug' => $current['slug'], 'content' => surveyContent($current)], $others, languagesForSurveys());
        if ($problems !== []) {
            throw new ApiError(422, 'survey_problems', 'Fix what the editor lists before the survey opens.', [], ['problems' => $problems]);
        }

        try {
            dbExec(
                "UPDATE surveys SET status = 'open', opened_at = COALESCE(opened_at, now()), closed_at = NULL, closes_on = " .
                    ($setClosesOn ? '?' : 'closes_on') .
                    ', revision = revision + 1, updated_at = now(), updated_by = ? WHERE id = ?',
                $setClosesOn ? [$closesOn, $user->id, $id] : [$user->id, $id],
            );
        } catch (PDOException $e) {
            if (dbIsUniqueViolation($e, 'surveys_live_slug')) {
                throw surveySlugTaken($current['slug']);
            }
            throw $e;
        }

        return surveyRow($id);
    });

    return surveyJson($row);
}

/**
 * Deletes the survey and every answer it was given. Answers what it was - its
 * title, its address and how many answers went with it - for the audit log.
 *
 * @return array{title: string, slug: string, responses: int}
 */
function surveyDelete(string $id): array
{
    if (!isUuid($id)) {
        throw surveyNotFound();
    }
    $deleted = dbTx(static function () use ($id): array {
        // Its answers go with it; an ended visitor left with none goes too.
        $visitors = array_map('intval', array_column(dbAll('SELECT DISTINCT user_id FROM responses WHERE survey_id = ? AND user_id < 0', [$id]), 'user_id'));
        $responses = (int) dbValue('SELECT count(*) FROM responses WHERE survey_id = ?', [$id]);
        $row = dbOne('DELETE FROM surveys WHERE id = ? RETURNING title, slug', [$id]);
        if ($row === null) {
            throw surveyNotFound();
        }
        visitorsForgetEmpty($visitors);

        return ['title' => (string) $row['title'], 'slug' => (string) $row['slug'], 'responses' => $responses];
    });
    imagesCleanup();

    return $deleted;
}
