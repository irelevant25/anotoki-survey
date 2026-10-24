import { EnvironmentProviders, Provider } from '@angular/core';
import { type TranslationBundle, provideAnotokiTranslations } from '@anotoki/lib/translations';
import { provideTestTranslations as provideLibraryTestTranslations } from '@anotoki/lib/translations/testing';
import { provideSiteUi } from '../kit';
import { SURVEY_LIBRARY_WORDS } from '../translations';

export { TEST_LANGUAGES } from '@anotoki/lib/translations/testing';

/**
 * For a spec that runs the translation service, a pipe or a component with
 * given strings: the anotoki library's stand-in (the real service with a
 * bundle already in memory, and no HTTP) - `provideTestTranslations({
 * 'common.close': 'Close' })` is an English bundle of them; for another
 * language, say which, and give English beside it (what the admin panel reads) -
 * `provideTestTranslations({ 'common.close': 'Zavrieť' }, { language: 'sk', english: { 'common.close': 'Close' } })`.
 *
 * A key that is not given comes back as itself and warns, as on the site; a
 * library key (`anotoki.*`) reads the library's words - in Slovak this site's
 * formal ones where the library's would speak informally (shared/translations.ts).
 *
 * The family's kit reads its words from the same service, as the site wires it
 * (shared/kit.ts): a kit component in a spec says what it says on the site.
 */
export function provideTestTranslations(values: Record<string, string> = {}, bundle: Partial<Omit<TranslationBundle, 'values'>> = {}): (Provider | EnvironmentProviders)[] {
  return [...provideLibraryTestTranslations(values, bundle), provideAnotokiTranslations(() => ({ storagePrefix: 'anotoki-survey', libraryWords: SURVEY_LIBRARY_WORDS })), provideSiteUi()];
}
