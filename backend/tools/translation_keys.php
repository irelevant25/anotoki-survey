<?php

declare(strict_types=1);

use Anotoki\Lib\Translations\Cli\KeyScanner;

/**
 * Which keys the frontend asks for: the anotoki library's scan
 * (Anotoki\Lib\Translations\Cli\KeyScanner), set up for this site - for
 * translations.php (the command line) and the tests. Functions only; tools/ is
 * for computers with a shell and is never uploaded.
 *
 * The strings live in the database so they can be edited in the admin panel,
 * which means nothing stops a template asking for a key no migration ever
 * wrote: the page shows the key itself, and the mistake is released. The scan
 * is what catches it - and the other way round, a key left in the database
 * that no page asks for any more. The library's README says how a key is
 * recognised; what is this site's:
 *
 *   - the sources are frontend/src/app, every .ts and .html but the specs and
 *     shared/testing/ (the specs' helpers) - signing in is the library's
 *     (@anotoki/lib/auth), no vendored SDK is left to leave out;
 *   - the keys put together at run time are declared in
 *     shared/i18n/dynamic-keys.ts, prefix -> every tail;
 *   - the pipes are the library's (translate one string, translatePlural a
 *     family), and so are the calls (.t(), .around(), .has() one string;
 *     .plural(), .aroundPlural() a family) and the forms of a family (.one,
 *     .few, .other);
 *   - innerHTML given a translated string fails the scan: a string is text
 *     and is never drawn as HTML;
 *   - the library's own keys (anotoki.*) are never looked for, never unused:
 *     its Angular half asks for them from node_modules.
 */

/** The forms of a plural family, as Intl.PluralRules names the ones English and Slovak have. */
const TRANSLATION_PLURAL_FORMS = ['one', 'few', 'other'];

/** Where the keys put together at run time are declared, under the frontend's src/app. */
const TRANSLATION_DYNAMIC_KEYS_FILE = 'shared/i18n/dynamic-keys.ts';

/** The frontend's sources, seen from backend/tools/. */
function translationKeysFrontendRoot(): string
{
    return str_replace('\\', '/', dirname(__DIR__, 2)) . '/frontend/src/app';
}

/** The scan of the frontend at $root (the site's own by default), as this site has it. */
function surveyKeyScanner(?string $root = null): KeyScanner
{
    return new KeyScanner(
        $root ?? translationKeysFrontendRoot(),
        exclude: ['shared/testing/**'],
        dynamicKeys: TRANSLATION_DYNAMIC_KEYS_FILE,
        pluralForms: TRANSLATION_PLURAL_FORMS,
        innerHtml: 'translated',
    );
}
