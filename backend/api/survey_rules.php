<?php

declare(strict_types=1);

/**
 * What a survey may hold, what keeps it from opening, and what counts as an
 * answer - the server's copy of the frontend's rules:
 *
 *   frontend/src/app/core/survey/survey.model.ts     the shape
 *   frontend/src/app/core/survey/survey-problems.ts  surveyProblems()
 *   frontend/src/app/core/survey/localize.ts         translationGaps(), pruneTranslations()
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

/**
 * Addresses the site keeps for itself: a survey lives at /{slug}. RESERVED_SLUGS in survey-factory.ts. The legal
 * pages - terms, privacy, contact - and the About and Support pages - about, support - are routes of their own,
 * matched before a survey's address.
 */
const SURVEY_RESERVED_SLUGS = [
    'admin',
    'preview',
    'api',
    'auth',
    'setup',
    'setup-php',
    'assets',
    'media',
    'changelog',
    'login',
    'logout',
    'account',
    'terms',
    'privacy',
    'contact',
    'about',
    'support',
];
const SURVEY_SLUG_MAX = 60;

/** How much one survey may hold - far more than any survey needs, far less than would strain anything. */
const SURVEY_MAX_STEPS = 50;
const SURVEY_MAX_QUESTIONS = 300;
const SURVEY_MAX_OPTIONS = 100;
const SURVEY_MAX_QUESTION_IMAGES = 10;
const SURVEY_MAX_OPTION_IMAGES = 4;
/** The pictures under a step's own text: as many as under a question's (MAX_STEP_IMAGES in prepare-image.ts). */
const SURVEY_MAX_STEP_IMAGES = 10;
const SURVEY_TITLE_MAX = 200;
const SURVEY_LABEL_MAX = 300;

/** The language of a survey kept before surveys said theirs: the site was English then. */
const SURVEY_LANGUAGE_DEFAULT = 'en';

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
 * (api/rich_text.php) - a question's, and a step's own text alike; the
 * pictures - a question's, an option's, a step's - are ones this site has,
 * with the size it measured. The status and times are not the editor's to
 * send - they come from the database and the status route.
 *
 * $languages: every language the site has, offered or hidden -
 * [code => ['name' => its name in English, 'enabled' => bool]]
 * (languagesForSurveys()). The survey is written in one of them and may be
 * translated into others; a language the site does not have is refused, never
 * dropped - a save does not throw a whole language of work away.
 *
 * The translations come back as arrays ([code => [...]], the maps inside by
 * id); surveyTranslationsJson() makes objects of them for JSON.
 *
 * @param array<string, array{name: string, enabled: bool}> $languages
 * @return array{title: string, slug: string, closesOn: ?string, content: array, imageIds: string[]}
 */
function surveyFromBody(mixed $body, array $languages): array
{
    if (!is_array($body) || array_is_list($body)) {
        throw surveyInvalid('Send the survey as an object.');
    }
    // Both must be said. Filling in "English, no translations" for a body
    // without them would let a page from before surveys had languages save a
    // survey - and delete every translation it has without a word. Such a
    // page is the only thing in a browser that sends one, and its person is
    // who reads the refusal: so it says what is wrong with the body first, and
    // then what that person can do, which is not "try again".
    $outdated = ' A page that was open before the site was updated can no longer save: copy what you changed since the last save, then reload the page.';
    if (($body['language'] ?? null) === null) {
        throw surveyInvalid('Say which language the survey is written in (language).' . $outdated);
    }
    if (($body['translations'] ?? null) === null) {
        throw surveyInvalid('Send the translations, or an empty object (translations).' . $outdated);
    }
    $language = $body['language'];
    if (!languageCodeOk($language) || !isset($languages[$language])) {
        throw surveyInvalid('The language the survey is written in is not a language of this site.');
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

        // A step's own text and pictures, above its questions or alone: the same rich text as a question's and
        // the same pictures as under it. Neither has to be sent - nothing there is a step with no text and no
        // pictures, and every step there was before steps had them is one (migration 016).
        $stepWhat = 'step ' . ($s + 1);
        $steps[] = [
            'id' => $rawStep['id'],
            'title' => surveyLine($rawStep['title'] ?? '', SURVEY_TITLE_MAX, "The title of $stepName"),
            'text' => richTextClean($rawStep['text'] ?? '', $stepWhat),
            'images' => surveyImagesFromBody($rawStep['images'] ?? [], SURVEY_MAX_STEP_IMAGES, $stepWhat, $imageIds),
            'questions' => $questions,
        ];
    }

    return [
        'title' => $title,
        'slug' => $slug,
        'closesOn' => $closesOn,
        'content' => [
            'intro' => $intro,
            'thanks' => $thanks,
            'askAboutYou' => $askAboutYou,
            'steps' => $steps,
            'language' => $language,
            'translations' => surveyTranslationsFromBody($body['translations'], $steps, $language, $languages),
        ],
        // A translation names no picture of its own: it only describes the survey's.
        'imageIds' => array_keys($imageIds),
    ];
}

/**
 * An object of a translation as it came: a JSON object, or the empty array
 * an empty one looks like once decoded. Anything else where a level of a
 * translation should be is refused - a string there is not "no translation".
 *
 * $byId: the level is a map by id. Ids may be "0" and "1", and such a map is
 * a list to PHP once decoded, so a list is taken there; where the keys are
 * names (title, steps, label...) a list is not an object.
 */
function surveyMap(mixed $value, string $what, bool $byId = false): array
{
    if (!is_array($value) || (!$byId && $value !== [] && array_is_list($value))) {
        throw surveyInvalid("$what is not an object.");
    }

    return $value;
}

/**
 * The translations an editor sent, as they may be kept: [code => translation],
 * each language one the site has and not the one the survey is written in.
 *
 * @param array $steps the survey's own steps, already checked
 * @param array<string, array{name: string, enabled: bool}> $languages
 */
function surveyTranslationsFromBody(mixed $raw, array $steps, string $language, array $languages): array
{
    $raw = surveyMap($raw, 'What was sent as the translations');
    if (count($raw) > count($languages)) {
        throw surveyInvalid('The survey is translated into more languages than the site has.');
    }

    $translations = [];
    foreach ($raw as $code => $rawTranslation) {
        if (!languageCodeOk($code) || !isset($languages[$code])) {
            throw surveyInvalid('The survey is translated into a language the site does not have' . (languageCodeOk($code) ? " (\"$code\")" : '') . '. Add the language, or remove the translation.');
        }
        if ($code === $language) {
            throw surveyInvalid("The survey is written in {$languages[$code]['name']}, so it cannot be translated into it as well.");
        }
        $translations[$code] = surveyTranslationFromBody($rawTranslation, $steps, $languages[$code]['name']);
    }

    return $translations;
}

/**
 * One translation: the survey's texts in another language, each found by the
 * id of what it belongs to (SurveyTranslation in survey.model.ts).
 *
 * It is built by walking the survey's own steps, questions, options and
 * pictures and asking what was sent for each - never by going through the
 * maps that were sent. So words for an id the survey does not have are
 * dropped without anybody looking at them (pruneTranslations() in
 * localize.ts does the same in the editor), the work is bounded by what a
 * survey may hold, and an id is never read back from an array key (PHP makes
 * a number of a key like "12"). Every text is cleaned and measured exactly
 * like the one it translates. A step's entry holds its title, its own text and
 * what its pictures show; a question's its text, hint, labels and what the
 * pictures under its text show.
 *
 * @param array  $steps the survey's own steps, already checked
 * @param string $name  the language's name in English, for the refusals ("Slovak")
 * @return array{title: string, intro: string, thanks: string, steps: array, questions: array}
 */
function surveyTranslationFromBody(mixed $raw, array $steps, string $name): array
{
    $raw = surveyMap($raw, "The $name translation");
    $rawSteps = surveyMap($raw['steps'] ?? [], "The map of steps in $name", true);
    $rawQuestions = surveyMap($raw['questions'] ?? [], "The map of questions in $name", true);

    $translation = [
        'title' => surveyLine($raw['title'] ?? '', SURVEY_TITLE_MAX, "The $name title"),
        'intro' => richTextClean($raw['intro'] ?? '', "the $name welcome"),
        'thanks' => richTextClean($raw['thanks'] ?? '', "the $name thanks"),
        'steps' => [],
        'questions' => [],
    ];

    $number = 0;
    foreach ($steps as $s => $step) {
        $rawStep = $rawSteps[$step['id']] ?? null;
        if ($rawStep !== null) {
            // The step's entry - its title, its own text, its pictures' descriptions - and then each by its own name.
            $rawStep = surveyMap($rawStep, "The $name entry of step " . ($s + 1));
            $stepName = "the $name title of step " . ($s + 1);
            // The step's own text and the pictures under it, as a question's: only the step's own pictures are
            // looked up, and the same one twice shares one description.
            $stepWhat = 'step ' . ($s + 1) . " in $name";
            $rawImages = surveyMap($rawStep['images'] ?? [], "The map of picture descriptions of $stepWhat", true);
            $images = [];
            foreach ($step['images'] as $i => $image) {
                $rawImage = $rawImages[$image['id']] ?? null;
                if ($rawImage !== null && !isset($images[$image['id']])) {
                    $imageName = 'picture ' . ($i + 1) . " of $stepWhat";
                    $images[$image['id']] = ['alt' => surveyLine(surveyMap($rawImage, ucfirst($imageName))['alt'] ?? '', SURVEY_LABEL_MAX, "The description of $imageName")];
                }
            }
            $translation['steps'][$step['id']] = [
                'title' => surveyLine($rawStep['title'] ?? '', SURVEY_TITLE_MAX, ucfirst($stepName)),
                'text' => richTextClean($rawStep['text'] ?? '', $stepWhat),
                'images' => $images,
            ];
        }

        foreach ($step['questions'] as $question) {
            $number++;
            $rawQuestion = $rawQuestions[$question['id']] ?? null;
            if ($rawQuestion === null) {
                continue;
            }
            $questionName = "question $number in $name";
            $rawQuestion = surveyMap($rawQuestion, ucfirst($questionName));
            $rawOptions = surveyMap($rawQuestion['options'] ?? [], "The map of options of $questionName", true);
            $rawImages = surveyMap($rawQuestion['images'] ?? [], "The map of picture descriptions of $questionName", true);

            $options = [];
            foreach ($question['options'] as $o => $option) {
                $rawOption = $rawOptions[$option['id']] ?? null;
                if ($rawOption !== null) {
                    $optionName = 'option ' . ($o + 1) . " of $questionName";
                    $options[$option['id']] = ['label' => surveyLine(surveyMap($rawOption, ucfirst($optionName))['label'] ?? '', SURVEY_LABEL_MAX, "The label of $optionName")];
                }
            }
            // The pictures under the question's text; the same one twice shares one description.
            $images = [];
            foreach ($question['images'] as $i => $image) {
                $rawImage = $rawImages[$image['id']] ?? null;
                if ($rawImage !== null && !isset($images[$image['id']])) {
                    $imageName = 'picture ' . ($i + 1) . " of $questionName";
                    $images[$image['id']] = ['alt' => surveyLine(surveyMap($rawImage, ucfirst($imageName))['alt'] ?? '', SURVEY_LABEL_MAX, "The description of $imageName")];
                }
            }

            $translation['questions'][$question['id']] = [
                'text' => richTextClean($rawQuestion['text'] ?? '', $questionName),
                'placeholder' => surveyLine($rawQuestion['placeholder'] ?? '', SURVEY_LABEL_MAX, "The hint of $questionName"),
                'options' => $options,
                'images' => $images,
            ];
        }
    }

    return $translation;
}

/**
 * A survey's translations as they go out as JSON - to the database, to the
 * editor, to the people taking it: every map an object at all six levels
 * (the translations, each one's steps and questions, each step's images, each
 * question's options and images), empty or not, whatever its ids look like.
 * Left to itself PHP writes an empty map as [] and one with the ids "0" and
 * "1" as a list - and an editor that got [] where a map should be would lose
 * the next text it writes into it. Used wherever a survey leaves PHP; inside
 * PHP the translations stay arrays.
 *
 * Shaped from what is there, so a translation kept with less than all of it -
 * a step's entry from before steps had their own text, which holds a title
 * alone - goes out whole.
 *
 * @param array<string, mixed> $translations [code => translation], as surveyFromBody() or json_decode() gives them
 */
function surveyTranslationsJson(array $translations): object
{
    $text = static fn(mixed $value): string => is_string($value) ? $value : '';
    $map = static fn(mixed $value): array => is_array($value) ? $value : [];

    $out = [];
    foreach ($translations as $code => $translation) {
        $translation = $map($translation);
        $steps = [];
        foreach ($map($translation['steps'] ?? null) as $id => $step) {
            $step = $map($step);
            $steps[$id] = [
                'title' => $text($step['title'] ?? null),
                'text' => $text($step['text'] ?? null),
                'images' => (object) $map($step['images'] ?? null),
            ];
        }
        $questions = [];
        foreach ($map($translation['questions'] ?? null) as $id => $question) {
            $question = $map($question);
            $questions[$id] = [
                'text' => $text($question['text'] ?? null),
                'placeholder' => $text($question['placeholder'] ?? null),
                'options' => (object) $map($question['options'] ?? null),
                'images' => (object) $map($question['images'] ?? null),
            ];
        }
        $out[$code] = [
            'title' => $text($translation['title'] ?? null),
            'intro' => $text($translation['intro'] ?? null),
            'thanks' => $text($translation['thanks'] ?? null),
            'steps' => (object) $steps,
            'questions' => (object) $questions,
        ];
    }

    return (object) $out;
}

/**
 * The places where the survey has a text and its translation into $code has
 * none - translationGaps() in localize.ts, in the same order: the title, the
 * welcome, the thanks, then step by step its title, its own text and the
 * descriptions of its pictures, and each question's text, hint, option labels
 * and picture descriptions. A question counts what its type shows (a hint for
 * "own words", options for a choice); the same picture twice is one
 * description. Rich text is empty when it has no words, a line when it is
 * only spaces.
 *
 * @param array{title: string, content: array} $survey
 * @return array<array{kind: string, stepId?: string, questionId?: string, optionId?: string, imageId?: string}>
 */
function surveyTranslationGaps(array $survey, string $code): array
{
    $content = $survey['content'];
    $translation = $content['translations'][$code] ?? [];
    $line = static fn(mixed $value): bool => !is_string($value) || textTrim($value) === '';
    $rich = static fn(mixed $value): bool => !is_string($value) || richTextIsBlank($value);

    $gaps = [];
    if (!$line($survey['title']) && $line($translation['title'] ?? null)) {
        $gaps[] = ['kind' => 'title'];
    }
    if (!$rich($content['intro']) && $rich($translation['intro'] ?? null)) {
        $gaps[] = ['kind' => 'intro'];
    }
    if (!$rich($content['thanks']) && $rich($translation['thanks'] ?? null)) {
        $gaps[] = ['kind' => 'thanks'];
    }

    foreach ($content['steps'] as $step) {
        $stepId = $step['id'];
        if (!$line($step['title']) && $line($translation['steps'][$stepId]['title'] ?? null)) {
            $gaps[] = ['kind' => 'step', 'stepId' => $stepId];
        }
        if (!$rich($step['text']) && $rich($translation['steps'][$stepId]['text'] ?? null)) {
            $gaps[] = ['kind' => 'stepText', 'stepId' => $stepId];
        }
        $described = [];
        foreach ($step['images'] as $image) {
            if (!$line($image['alt']) && !isset($described[$image['id']])) {
                $described[$image['id']] = true;
                if ($line($translation['steps'][$stepId]['images'][$image['id']]['alt'] ?? null)) {
                    $gaps[] = ['kind' => 'stepImage', 'stepId' => $stepId, 'imageId' => $image['id']];
                }
            }
        }
        foreach ($step['questions'] as $question) {
            $questionId = $question['id'];
            $entry = $translation['questions'][$questionId] ?? [];
            if (!$rich($question['text']) && $rich($entry['text'] ?? null)) {
                $gaps[] = ['kind' => 'text', 'questionId' => $questionId];
            }
            if ($question['type'] !== 'text') {
                foreach ($question['options'] as $option) {
                    if (!$line($option['label']) && $line($entry['options'][$option['id']]['label'] ?? null)) {
                        $gaps[] = ['kind' => 'option', 'questionId' => $questionId, 'optionId' => $option['id']];
                    }
                }
            } elseif (!$line($question['placeholder']) && $line($entry['placeholder'] ?? null)) {
                $gaps[] = ['kind' => 'placeholder', 'questionId' => $questionId];
            }
            $described = [];
            foreach ($question['images'] as $image) {
                if (!$line($image['alt']) && !isset($described[$image['id']])) {
                    $described[$image['id']] = true;
                    if ($line($entry['images'][$image['id']]['alt'] ?? null)) {
                        $gaps[] = ['kind' => 'image', 'questionId' => $questionId, 'imageId' => $image['id']];
                    }
                }
            }
        }
    }

    return $gaps;
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

/**
 * A step with nothing in it for anybody: no question, no text with words in
 * it, no picture - stepIsEmpty() in survey-outline.ts. A step with only text
 * or pictures is a step people read and leave with Next.
 */
function surveyStepIsEmpty(array $step): bool
{
    return $step['questions'] === [] && richTextIsBlank($step['text']) && $step['images'] === [];
}

/** An address as slugify() leaves it: small letters, digits and single dashes, at most SLUG_MAX. */
function surveySlugOk(string $slug): bool
{
    return strlen($slug) <= SURVEY_SLUG_MAX && preg_match('/^[a-z0-9]+(-[a-z0-9]+)*$/D', $slug) === 1;
}

/**
 * What must be fixed before people can take the survey - surveyProblems() in
 * survey-problems.ts, in the same words and the same order. $others: the
 * other surveys' id and slug. $languages: every language the site has, in its
 * order ([code => ['name' => in English, 'enabled' => bool]]) - a translation
 * into one people are offered must be whole, or they would be shown the
 * survey in its own language without anybody having meant it; one into a
 * hidden language may be as unfinished as it likes.
 *
 * @param array{title: string, slug: string, content: array} $survey
 * @param array<array{id: string, slug: string}> $others
 * @param array<string, array{name: string, enabled: bool}> $languages
 * @return string[]
 */
function surveyProblems(array $survey, array $others, array $languages = []): array
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
    // Steps are numbered as people see them too: "About you", when asked, is step 1. A step may be only text
    // and pictures - a task to read and do before the next step asks about it - but not nothing at all.
    $firstStep = $content['askAboutYou'] ? 2 : 1;
    foreach ($content['steps'] as $index => $step) {
        if (surveyStepIsEmpty($step)) {
            $problems[] = 'Step ' . ($index + $firstStep) . ' is empty - add a question, text or a picture, or remove the step.';
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

    foreach ($languages as $code => $language) {
        if ($language['enabled'] && $code !== ($content['language'] ?? SURVEY_LANGUAGE_DEFAULT) && isset($content['translations'][$code])) {
            array_push($problems, ...surveyTranslationProblems($survey, (string) $code, $language['name'], $firstStep));
        }
    }

    return $problems;
}

/**
 * What a translation still lacks - translationProblems() in
 * survey-problems.ts - in the order of the document: the title, the welcome,
 * the thanks, then step by step its title, how many of its own texts are left
 * (its text and its pictures' descriptions: one problem a step), and,
 * question by question, how many of its texts are left (one problem a
 * question, however many) and two options that would read the same.
 *
 * @param string $name the language's name in English
 * @return string[]
 */
function surveyTranslationProblems(array $survey, string $code, string $name, int $firstStep): array
{
    $content = $survey['content'];
    $translation = $content['translations'][$code] ?? [];

    $missing = [];
    $texts = [];
    foreach (surveyTranslationGaps($survey, $code) as $gap) {
        if (in_array($gap['kind'], ['title', 'intro', 'thanks'], true)) {
            $missing[$gap['kind']] = true;
        } elseif ($gap['kind'] === 'step') {
            $missing['step ' . $gap['stepId']] = true;
        } elseif ($gap['kind'] === 'stepText' || $gap['kind'] === 'stepImage') {
            // Counted by a key that is never a number to PHP, whatever the id looks like.
            $texts['step ' . $gap['stepId']] = ($texts['step ' . $gap['stepId']] ?? 0) + 1;
        } else {
            $texts['question ' . $gap['questionId']] = ($texts['question ' . $gap['questionId']] ?? 0) + 1;
        }
    }

    $problems = [];
    if (isset($missing['title'])) {
        $problems[] = "$name: the title is missing.";
    }
    if (isset($missing['intro'])) {
        $problems[] = "$name: the welcome text is missing.";
    }
    if (isset($missing['thanks'])) {
        $problems[] = "$name: the thank-you text is missing.";
    }

    $number = 0;
    foreach ($content['steps'] as $index => $step) {
        if (isset($missing['step ' . $step['id']])) {
            $problems[] = "$name: the title of step " . ($index + $firstStep) . ' is missing.';
        }
        $count = $texts['step ' . $step['id']] ?? 0;
        if ($count > 0) {
            $problems[] = "$name: step " . ($index + $firstStep) . ' has ' . ($count === 1 ? '1 text' : "$count texts") . ' to translate.';
        }
        foreach ($step['questions'] as $question) {
            $number++;
            $count = $texts['question ' . $question['id']] ?? 0;
            if ($count > 0) {
                $problems[] = "$name: question $number has " . ($count === 1 ? '1 text' : "$count texts") . ' to translate.';
            }
            if ($question['type'] === 'text') {
                continue;
            }
            $seen = [];
            foreach ($question['options'] as $option) {
                $label = $translation['questions'][$question['id']]['options'][$option['id']]['label'] ?? '';
                $label = is_string($label) ? textTrim($label) : '';
                $key = textLower($label);
                if ($key !== '' && isset($seen[$key])) {
                    $problems[] = "$name: question $number has two options called \"$label\".";
                    break;
                }
                $seen[$key] = true;
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
