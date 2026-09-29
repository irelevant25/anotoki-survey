<?php

declare(strict_types=1);

/**
 * What a survey may hold, what keeps it from opening, and what counts as an
 * answer - the server's copy of the frontend's rules:
 *
 *   frontend/src/app/core/survey/survey.model.ts     the shape
 *   frontend/src/app/core/survey/survey-problems.ts  surveyProblems()
 *   frontend/src/app/core/survey/answer-rules.ts     answerProblem(), cleanAnswer()
 *   frontend/src/app/core/survey/about-you.ts        the gender and age keys
 *
 * The browser checks first, so people are told at once; the server checks
 * again, because the browser is not the only thing that can send a request.
 * The two must say the same: change one, change the other (tests/unit/rules.test.php
 * pins the server's side).
 */

const SURVEY_GENDERS = ['male', 'female', 'non-binary', 'undisclosed'];
const SURVEY_AGES = ['under-18', '18-24', '25-34', '35-44', '45-plus', 'undisclosed'];
const SURVEY_ABOUT_YOU_IDS = ['about-gender', 'about-age'];

/** Addresses the site keeps for itself: a survey lives at /{slug}. RESERVED_SLUGS in survey-factory.ts. */
const SURVEY_RESERVED_SLUGS = ['admin', 'preview', 'api', 'auth', 'setup', 'setup-php', 'assets', 'media', 'changelog', 'login', 'logout', 'account'];
const SURVEY_SLUG_MAX = 60;

/** How much one survey may hold - far more than any survey needs, far less than would strain anything. */
const SURVEY_MAX_STEPS = 50;
const SURVEY_MAX_QUESTIONS = 300;
const SURVEY_MAX_OPTIONS = 100;
const SURVEY_MAX_QUESTION_IMAGES = 10;
const SURVEY_MAX_OPTION_IMAGES = 4;
const SURVEY_TITLE_MAX = 200;
const SURVEY_LABEL_MAX = 300;

/** The most anybody may write into one text answer, whatever the question allows; into "Other", less. */
const ANSWER_TEXT_MAX = 10000;
const ANSWER_OTHER_MAX = 1000;

/** The request's survey is not something this site can keep: 422 with a sentence saying why. */
function surveyInvalid(string $message): ApiError
{
    return new ApiError(422, 'invalid_survey', $message);
}

/** An id made by the editor: random, and free of the ":" and "," the results' addresses use between ids. */
function surveyIdOk(mixed $id): bool
{
    return is_string($id) && preg_match('/^[A-Za-z0-9_-]{1,64}$/D', $id) === 1;
}

/** A line of text of at most $max characters, without control characters (textClean). */
function surveyLine(mixed $value, int $max, string $what): string
{
    $text = textClean($value);
    if ($text === null) {
        throw surveyInvalid("$what is not text.");
    }
    if (textLength($text) > $max) {
        throw surveyInvalid("$what is longer than $max characters.");
    }

    return $text;
}

function surveyBool(mixed $value, string $what): bool
{
    if (!is_bool($value)) {
        throw surveyInvalid("$what is not true or false.");
    }

    return $value;
}

/** A number the editor's fields may hold while a survey is written - whole or not, checked properly before it opens. */
function surveyNumber(mixed $value, string $what): int|float|null
{
    if ($value === null) {
        return null;
    }
    if (!(is_int($value) || (is_float($value) && is_finite($value))) || abs($value) > 100000) {
        throw surveyInvalid("$what is not a number.");
    }

    return $value;
}

/** A list (a JSON array) of at most $max items. */
function surveyList(mixed $value, int $max, string $what): array
{
    if (!is_array($value) || !array_is_list($value)) {
        throw surveyInvalid("$what is not a list.");
    }
    if (count($value) > $max) {
        throw surveyInvalid("$what has more than $max items.");
    }

    return $value;
}

/** A day, YYYY-MM-DD, that exists - or null. */
function surveyDay(mixed $value, string $what): ?string
{
    if ($value === null || $value === '') {
        return null;
    }
    if (!is_string($value) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D', $value, $m) || !checkdate((int) $m[2], (int) $m[3], (int) $m[1])) {
        throw surveyInvalid("$what is not a day (YYYY-MM-DD).");
    }

    return $value;
}

/**
 * The survey an editor sent, as it may be kept: every field the editor has,
 * checked and cleaned, and nothing else. The texts are cleaned HTML
 * (api/rich_text.php); the pictures are ones this site has, with the size it
 * measured. The status and times are not the editor's to send - they come from
 * the database and the status route.
 *
 * @return array{title: string, slug: string, closesOn: ?string, content: array, imageIds: string[]}
 */
function surveyFromBody(mixed $body): array
{
    if (!is_array($body) || array_is_list($body)) {
        throw surveyInvalid('Send the survey as an object.');
    }

    $title = surveyLine($body['title'] ?? null, SURVEY_TITLE_MAX, 'The title');
    $slug = surveyLine($body['slug'] ?? null, 100, 'The address');
    $closesOn = surveyDay($body['closesOn'] ?? null, 'The last day');
    $intro = richTextClean($body['intro'] ?? '', 'the welcome');
    $thanks = richTextClean($body['thanks'] ?? '', 'the thanks');
    $askAboutYou = surveyBool($body['askAboutYou'] ?? null, 'Asking about gender and age');

    $steps = [];
    $stepIds = [];
    $questionIds = [];
    $imageIds = [];
    $questionCount = 0;

    foreach (surveyList($body['steps'] ?? null, SURVEY_MAX_STEPS, 'The steps') as $s => $rawStep) {
        $stepName = 'Step ' . ($s + 1);
        if (!is_array($rawStep) || array_is_list($rawStep) || !surveyIdOk($rawStep['id'] ?? null)) {
            throw surveyInvalid("$stepName is not a step.");
        }
        if (isset($stepIds[$rawStep['id']])) {
            throw surveyInvalid("$stepName has the id of another step.");
        }
        $stepIds[$rawStep['id']] = true;

        $questions = [];
        foreach (surveyList($rawStep['questions'] ?? null, SURVEY_MAX_QUESTIONS, "The questions of $stepName") as $rawQuestion) {
            $questionCount++;
            if ($questionCount > SURVEY_MAX_QUESTIONS) {
                throw surveyInvalid('A survey holds ' . SURVEY_MAX_QUESTIONS . ' questions at most.');
            }
            $question = surveyQuestionFromBody($rawQuestion, "question $questionCount", $imageIds);
            if (isset($questionIds[$question['id']]) || in_array($question['id'], SURVEY_ABOUT_YOU_IDS, true)) {
                throw surveyInvalid("Question $questionCount has the id of another question.");
            }
            $questionIds[$question['id']] = true;
            $questions[] = $question;
        }

        $steps[] = [
            'id' => $rawStep['id'],
            'title' => surveyLine($rawStep['title'] ?? '', SURVEY_TITLE_MAX, "The title of $stepName"),
            'questions' => $questions,
        ];
    }

    return [
        'title' => $title,
        'slug' => $slug,
        'closesOn' => $closesOn,
        'content' => ['intro' => $intro, 'thanks' => $thanks, 'askAboutYou' => $askAboutYou, 'steps' => $steps],
        'imageIds' => array_keys($imageIds),
    ];
}

/** @param array<string, true> $imageIds the pictures found so far, added to */
function surveyQuestionFromBody(mixed $raw, string $name, array &$imageIds): array
{
    if (!is_array($raw) || array_is_list($raw) || !surveyIdOk($raw['id'] ?? null)) {
        throw surveyInvalid(ucfirst($name) . ' is not a question.');
    }
    $type = $raw['type'] ?? null;
    if (!in_array($type, ['single', 'multiple', 'text'], true)) {
        throw surveyInvalid(ucfirst($name) . ' has no type this site knows.');
    }
    $layout = $raw['layout'] ?? 'list';
    if (!in_array($layout, ['list', 'columns', 'scale'], true)) {
        throw surveyInvalid(ucfirst($name) . ' has no layout this site knows.');
    }

    $options = [];
    $optionIds = [];
    foreach (surveyList($raw['options'] ?? [], SURVEY_MAX_OPTIONS, "The options of $name") as $o => $rawOption) {
        $optionName = 'option ' . ($o + 1) . " of $name";
        if (!is_array($rawOption) || array_is_list($rawOption) || !surveyIdOk($rawOption['id'] ?? null)) {
            throw surveyInvalid(ucfirst($optionName) . ' is not an option.');
        }
        if (isset($optionIds[$rawOption['id']])) {
            throw surveyInvalid(ucfirst($optionName) . ' has the id of another option.');
        }
        $optionIds[$rawOption['id']] = true;
        $options[] = [
            'id' => $rawOption['id'],
            'label' => surveyLine($rawOption['label'] ?? '', SURVEY_LABEL_MAX, "The label of $optionName"),
            'other' => surveyBool($rawOption['other'] ?? false, "\"Other\" of $optionName"),
            'images' => surveyImagesFromBody($rawOption['images'] ?? [], SURVEY_MAX_OPTION_IMAGES, $optionName, $imageIds),
        ];
    }

    return [
        'id' => $raw['id'],
        'type' => $type,
        'text' => richTextClean($raw['text'] ?? '', $name),
        'images' => surveyImagesFromBody($raw['images'] ?? [], SURVEY_MAX_QUESTION_IMAGES, $name, $imageIds),
        'required' => surveyBool($raw['required'] ?? null, "Whether $name must be answered"),
        'options' => $options,
        'layout' => $layout,
        'minChoices' => surveyNumber($raw['minChoices'] ?? null, "\"At least\" of $name"),
        'maxChoices' => surveyNumber($raw['maxChoices'] ?? null, "\"At most\" of $name"),
        'multiline' => surveyBool($raw['multiline'] ?? true, "The answer box of $name"),
        'maxLength' => surveyNumber($raw['maxLength'] ?? null, "The longest answer to $name"),
        'placeholder' => surveyLine($raw['placeholder'] ?? '', SURVEY_LABEL_MAX, "The hint of $name"),
    ];
}

/**
 * A question's or an option's pictures: id and description from the editor;
 * the size and address are filled in from the file itself (surveyWithImages).
 *
 * @param array<string, true> $imageIds
 */
function surveyImagesFromBody(mixed $raw, int $max, string $name, array &$imageIds): array
{
    $images = [];
    foreach (surveyList($raw, $max, "The pictures of $name") as $i => $rawImage) {
        if (!is_array($rawImage) || array_is_list($rawImage) || !isUuid($rawImage['id'] ?? null)) {
            throw surveyInvalid('Picture ' . ($i + 1) . " of $name is not a picture of this site.");
        }
        $imageIds[$rawImage['id']] = true;
        $images[] = ['id' => $rawImage['id'], 'alt' => surveyLine($rawImage['alt'] ?? '', SURVEY_LABEL_MAX, 'The description of picture ' . ($i + 1) . " of $name")];
    }

    return $images;
}

// ── What keeps a survey from opening ────────────────────────────────────────

/** An address as slugify() leaves it: small letters, digits and single dashes, at most SLUG_MAX. */
function surveySlugOk(string $slug): bool
{
    return strlen($slug) <= SURVEY_SLUG_MAX && preg_match('/^[a-z0-9]+(-[a-z0-9]+)*$/D', $slug) === 1;
}

/**
 * What must be fixed before people can take the survey - surveyProblems() in
 * survey-problems.ts, in the same words. $others: the other surveys' id and
 * slug.
 *
 * @param array{title: string, slug: string, content: array} $survey
 * @param array<array{id: string, slug: string}> $others
 * @return string[]
 */
function surveyProblems(array $survey, array $others): array
{
    $problems = [];
    $content = $survey['content'];

    if (textTrim($survey['title']) === '') {
        $problems[] = 'The survey needs a title.';
    }
    $slug = $survey['slug'];
    if ($slug === '' || !surveySlugOk($slug)) {
        $problems[] = 'The address may hold only small letters, digits and dashes.';
    } elseif (in_array($slug, SURVEY_RESERVED_SLUGS, true)) {
        $problems[] = "The address \"$slug\" belongs to the site itself - choose another.";
    } else {
        foreach ($others as $other) {
            if ($other['id'] !== ($survey['id'] ?? null) && $other['slug'] === $slug) {
                $problems[] = "Another survey already lives at \"$slug\".";
                break;
            }
        }
    }

    // Numbered straight through the steps, as people see them.
    $questions = [];
    foreach ($content['steps'] as $step) {
        foreach ($step['questions'] as $question) {
            $questions[] = [count($questions) + 1, $question];
        }
    }
    if ($questions === []) {
        $problems[] = 'Add at least one question.';
    }
    // Steps are numbered as people see them too: "About you", when asked, is step 1.
    $firstStep = $content['askAboutYou'] ? 2 : 1;
    foreach ($content['steps'] as $index => $step) {
        if ($step['questions'] === []) {
            $problems[] = 'Step ' . ($index + $firstStep) . ' has no questions - add one, or remove the step.';
        }
    }

    foreach ($questions as [$n, $question]) {
        $name = "Question $n";
        if (richTextIsBlank($question['text'])) {
            $problems[] = "$name has no text.";
        }
        if ($question['type'] === 'text') {
            if ($question['maxLength'] !== null && $question['maxLength'] < 1) {
                $problems[] = "$name: the longest answer must be at least one character.";
            }
            continue;
        }

        $options = $question['options'];
        if (count($options) < 2) {
            $problems[] = "$name needs at least two options.";
        }
        foreach ($options as $option) {
            if (textTrim($option['label']) === '') {
                $problems[] = "$name has an option with no label.";
                break;
            }
        }
        $seen = [];
        foreach ($options as $option) {
            $key = textLower(textTrim($option['label']));
            if ($key !== '' && isset($seen[$key])) {
                $problems[] = "$name has two options called \"" . textTrim($option['label']) . '".';
                break;
            }
            $seen[$key] = true;
        }

        if ($question['type'] === 'multiple') {
            $min = $question['minChoices'];
            $max = $question['maxChoices'];
            if ($min !== null && ($min < 0 || !is_int($min))) {
                $problems[] = "$name: \"at least\" must be a whole number, 0 or more.";
            }
            if ($max !== null && ($max < 1 || !is_int($max))) {
                $problems[] = "$name: \"at most\" must be a whole number, 1 or more.";
            }
            if ($min !== null && $max !== null && $min > $max) {
                $problems[] = "$name asks for at least $min but at most $max.";
            }
            if ($min !== null && $min > count($options)) {
                $problems[] = "$name asks for at least $min but has only " . count($options) . ' options.';
            }
        }
    }

    return $problems;
}

/** Lower case the way the browser's toLowerCase() does it, for comparing labels (ASCII only without mbstring). */
function textLower(string $text): string
{
    return function_exists('mb_strtolower') ? mb_strtolower($text, 'UTF-8') : strtolower($text);
}

// ── Answers ─────────────────────────────────────────────────────────────────

/**
 * An answer as the browser sent it, in the shape answer-rules.ts works with -
 * or null when nothing was sent for the question. Refuses what is not an
 * answer at all (with the question, so the page can show where); control
 * characters in the words are dropped, as the page drops them (textClean).
 *
 * @return ?array{optionIds: string[], other: string, text: string}
 */
function answerFromBody(mixed $raw, int $number, string $questionId): ?array
{
    $refuse = static fn(string $message): ApiError => new ApiError(422, 'invalid_answer', $message, [], ['questionId' => $questionId]);

    if ($raw === null) {
        return null;
    }
    if (!is_array($raw) || ($raw !== [] && array_is_list($raw))) {
        throw $refuse("The answer to question $number is not an answer.");
    }
    $optionIds = $raw['optionIds'] ?? [];
    if (!is_array($optionIds) || !array_is_list($optionIds) || count($optionIds) > SURVEY_MAX_OPTIONS) {
        throw $refuse("The choices for question $number are not a list.");
    }
    foreach ($optionIds as $id) {
        if (!is_string($id)) {
            throw $refuse("The choices for question $number are not a list.");
        }
    }
    $other = textClean($raw['other'] ?? '');
    $text = textClean($raw['text'] ?? '');
    if ($other === null || $text === null) {
        throw $refuse("The answer to question $number is not text.");
    }

    return ['optionIds' => array_values(array_unique($optionIds)), 'other' => $other, 'text' => $text];
}

function answerIsChoice(array $question): bool
{
    return $question['type'] === 'single' || $question['type'] === 'multiple';
}

/** isAnswered(): something chosen that the question still has, or something written. */
function answerIsAnswered(array $question, ?array $answer): bool
{
    if ($answer === null) {
        return false;
    }
    if (answerIsChoice($question)) {
        foreach ($question['options'] as $option) {
            if (in_array($option['id'], $answer['optionIds'], true)) {
                return true;
            }
        }

        return false;
    }

    return textTrim($answer['text']) !== '';
}

/** textLimit(): the longest answer a text question takes, or null - below one is no limit. */
function answerTextLimit(array $question): ?int
{
    $max = $question['maxLength'];

    return $max !== null && $max >= 1 ? (int) floor($max) : null;
}

/**
 * choiceLimits(): the fewest and the most options a person may pick. A single
 * choice is one; several are bounded by the question's limits, by the options
 * there are, and - for a required question - by at least one.
 *
 * @return array{min: int, max: int}
 */
function answerChoiceLimits(array $question): array
{
    $count = count($question['options']);
    if ($count === 0) {
        return ['min' => 0, 'max' => 0];
    }
    if ($question['type'] === 'single') {
        return ['min' => $question['required'] ? 1 : 0, 'max' => 1];
    }
    // Math.max / Math.min over the numbers the editor keeps, whole or not - as the browser does.
    $max = max(1, min($question['maxChoices'] ?? $count, $count));
    $min = min(max($question['minChoices'] ?? 0, $question['required'] ? 1 : 0), $max);

    return ['min' => (int) ceil($min), 'max' => (int) floor($max)];
}

/** answerProblem(): why an answer cannot be accepted, in the browser's words - or null when it can. */
function answerProblem(array $question, ?array $answer): ?string
{
    if (!answerIsAnswered($question, $answer)) {
        if (!$question['required']) {
            return null;
        }
        if ($question['type'] === 'text') {
            return 'Please write an answer.';
        }
        $min = answerChoiceLimits($question)['min'];
        if ($min === 0) {
            return null;
        }

        return $question['type'] === 'single' || $min <= 1 ? 'Please choose an answer.' : "Please choose at least $min.";
    }

    if ($question['type'] === 'text') {
        $limit = min(answerTextLimit($question) ?? ANSWER_TEXT_MAX, ANSWER_TEXT_MAX);

        return textLength(textTrim($answer['text'])) > $limit ? "Please keep it under $limit characters." : null;
    }

    $chosen = array_values(array_filter($question['options'], static fn(array $option): bool => in_array($option['id'], $answer['optionIds'], true)));
    ['min' => $min, 'max' => $max] = answerChoiceLimits($question);
    if (count($chosen) < $min) {
        return "Please choose at least $min.";
    }
    if (count($chosen) > $max) {
        return $max === 1 ? 'Please choose only one.' : "Please choose at most $max.";
    }
    foreach ($chosen as $option) {
        if ($option['other']) {
            if (textTrim($answer['other']) === '') {
                return 'Please write what "' . $option['label'] . '" is for you.';
            }
            if (textLength(textTrim($answer['other'])) > ANSWER_OTHER_MAX) {
                return 'Please keep it under ' . ANSWER_OTHER_MAX . ' characters.';
            }
            break;
        }
    }

    return null;
}

/**
 * cleanAnswer(): the answer as it is kept - only options the question still
 * has, in the question's order; the "Other" text only while "Other" is chosen;
 * text trimmed - or null for nothing given.
 *
 * @return ?array{optionIds: string[], other: string, text: string}
 */
function answerClean(array $question, ?array $answer): ?array
{
    if ($answer === null || !answerIsAnswered($question, $answer)) {
        return null;
    }
    if ($question['type'] === 'text') {
        return ['optionIds' => [], 'other' => '', 'text' => textTrim($answer['text'])];
    }
    $optionIds = [];
    $otherChosen = false;
    foreach ($question['options'] as $option) {
        if (in_array($option['id'], $answer['optionIds'], true)) {
            $optionIds[] = $option['id'];
            $otherChosen = $otherChosen || $option['other'];
        }
    }

    return $optionIds === [] ? null : ['optionIds' => $optionIds, 'other' => $otherChosen ? textTrim($answer['other']) : '', 'text' => ''];
}
