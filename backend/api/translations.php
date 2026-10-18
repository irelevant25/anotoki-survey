<?php

declare(strict_types=1);

use Anotoki\Lib\Support\Refusal;
use Anotoki\Lib\Translations\LanguageCode;
use Anotoki\Lib\Translations\LanguageUsage;
use Anotoki\Lib\Translations\Translations;
use Anotoki\Lib\Translations\TranslationsConfig;
use Psr\Http\Message\ResponseInterface as Response;
use Psr\Http\Message\ServerRequestInterface as Request;

/**
 * The site's own words, in the languages it speaks - the languages, the
 * strings a page asks for by key, and the grid the admin panel edits them in -
 * through the anotoki family's library (anotoki/lib 0.3.0's
 * Anotoki\Lib\Translations, in vendor/; docs/decisions.md): the family's one
 * implementation of the three tables every anotoki site keeps,
 * its routes (api/routes/public.php, api/routes/admin.php) and its command
 * line (translations.php). One wire format for every site, the IAM's
 * (snake_case). (A survey's own texts are not here - they are in the
 * survey's document.)
 *
 * What is this site's own stays here: the languages it is released in, what a
 * language deleted would leave behind (a survey written in it - its
 * LanguageUsage), who saved a string (the token's person) and its error body.
 * Its keys, their English and their formal Slovak are its migrations'
 * (migrations/survey/); the library's own words are under `anotoki.`.
 */

/**
 * The languages the migrations write strings for. They cannot be deleted: the
 * next migration with strings would fail on the missing language, and a failed
 * migration closes the whole site - on a host with no shell to mend it from.
 * tests/unit/translations.test.php keeps this list true.
 */
const TRANSLATION_SEEDED_LANGUAGES = ['en', 'sk'];

/**
 * How many surveys are written in the language, or hold a translation in it.
 * A survey kept before surveys said their language is in English and has no
 * translations. (jsonb_exists, because the JSONB ? operator cannot be written
 * in a query whose values are ? parameters.)
 */
const LANGUAGE_IN_SURVEYS_SQL = "COALESCE(s.content->>'language', 'en') = ? OR jsonb_exists(COALESCE(s.content->'translations', '{}'::jsonb), ?)";

/**
 * A language code as the site writes them: "sk", "pt-br" - the library's rule
 * (LanguageCode::ok), which the frontend's languageCode() keeps too. Asked
 * before any query that takes a code from outside: anything else is no
 * language, and bytes that are not UTF-8 never reach the database.
 */
function languageCodeOk(mixed $code): bool
{
    return LanguageCode::ok($code);
}

/** The site's words on $pdo (the site's own connection by default): the library, as this site configures it. */
function surveyTranslations(?PDO $pdo = null): Translations
{
    return new Translations($pdo ?? db(), new TranslationsConfig(releasedLanguages: TRANSLATION_SEEDED_LANGUAGES, usage: new SurveyLanguageUsage()));
}

/**
 * A language the surveys use cannot be deleted - its texts in it would be left
 * in a language the site does not know: switch it off instead. The library
 * asks this inside the delete's transaction, with the language's row held
 * FOR UPDATE: a survey being saved in the language holds the row too
 * (surveyLanguagesLock()), so the delete waits for that save - and this count,
 * a statement of its own after the wait, sees the survey it waited for. Saves
 * that come after it wait for the delete and find the language gone. The
 * answers that were read in it keep their place, without the note
 * (responses.language: ON DELETE SET NULL).
 */
final class SurveyLanguageUsage implements LanguageUsage
{
    public function extras(PDO $pdo, array $codes): array
    {
        return [];
    }

    public function refuseDelete(PDO $pdo, string $code): ?Refusal
    {
        $count = $pdo->prepare('SELECT count(*) FROM surveys s WHERE ' . LANGUAGE_IN_SURVEYS_SQL);
        $count->execute([$code, $code]);
        $surveys = (int) $count->fetchColumn();
        if ($surveys === 0) {
            return null;
        }

        return new Refusal(
            409,
            'language_in_use',
            ($surveys === 1 ? '1 survey is' : "$surveys surveys are") .
                ' written in this language or translated into it. Switch it off instead, or remove it from the ' .
                ($surveys === 1 ? 'survey' : 'surveys') .
                ' first.',
            ['surveys' => $surveys],
        );
    }

    public function beforeDelete(PDO $pdo, string $code, array $strings): array
    {
        return [];
    }
}

/** A refusal of the library's routes in this site's error body: {error, code, ...what it is about}. */
function respondRefusal(Response $response, Refusal $refusal): Response
{
    return respondError($response, $refusal->status, $refusal->code, $refusal->message, [], $refusal->extra);
}

/** Who saved a string: the request's person - the token's, put there by the route's role check - and nothing a body says. */
function translationWriter(Request $request): ?int
{
    return currentUser($request)?->id;
}

/**
 * Every language as the surveys' rules read them (api/survey_rules.php):
 * [code => ['name' => its name in English, 'enabled' => offered or not]], in
 * the order a chooser shows them. A survey is written in one of these and may
 * be translated into others - a hidden one too: it is only not offered yet.
 *
 * @return array<string, array{name: string, enabled: bool}>
 */
function languagesForSurveys(): array
{
    $languages = [];
    foreach (dbAll('SELECT code, name, enabled FROM languages ORDER BY sort_order, name, code') as $row) {
        $languages[$row['code']] = ['name' => $row['name'], 'enabled' => (bool) $row['enabled']];
    }

    return $languages;
}

/**
 * The codes of the languages people are offered: the only ones a survey's
 * translations go out in to the people taking it.
 *
 * @return string[]
 */
function languagesOffered(): array
{
    return array_keys(array_filter(languagesForSurveys(), static fn(array $language): bool => $language['enabled']));
}
