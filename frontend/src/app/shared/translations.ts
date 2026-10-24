import { EnvironmentProviders, inject } from '@angular/core';
import { type AnotokiTranslationsConfig, provideAnotokiTranslations } from '@anotoki/lib/translations';
import { AuthService } from './auth/auth.service';
import { MIGRATIONS_PATH } from './migrations';

/**
 * The library's words whose Slovak speaks to the reader - informally (ty), as
 * the other anotoki sites do - said this site's way: formally (Vy, with its
 * capital; docs/decisions.md). The database has the same words (migrations
 * 010, 012 - the sign-in's callback page and failure screen - and 014 - the
 * feedback form's -, and an administrator may reword them on the Translations
 * page); these are for the moments it cannot be read - the family's page while
 * the site cannot run, a first visit whose strings did not come - when the
 * library would otherwise say its own built-in Slovak. Held to the database's
 * by backend/tests/unit/translations.test.php.
 */
export const FORMAL_SLOVAK: Readonly<Record<string, string>> = {
  'anotoki.ui.copyFailed': 'Kopírovanie nefungovalo. Označte text a skopírujte ho ručne.',
  'anotoki.topbar.menuButton': 'Vaša ponuka: {name}',
  'anotoki.topbar.menu': 'Vaša ponuka',
  'anotoki.topbar.account': 'Váš anotoki účet',
  'anotoki.language.notLoaded': 'Jazyk sa nepodarilo načítať. Skúste to, prosím, znova.',
  'anotoki.language.notSaved': 'Jazyk sa nepodarilo uložiť do Vášho anotoki účtu – platí len počas tejto návštevy.',
  'anotoki.theme.notSaved': 'Vzhľad sa nepodarilo uložiť do Vášho anotoki účtu. Skúste to, prosím, znova.',
  'anotoki.siteStatus.unavailableText': 'Skúste to, prosím, znova o pár minút. Táto stránka sa obnoví sama.',
  'anotoki.signIn.signingIn': 'Prihlasujeme Vás…',
  'anotoki.signIn.expired': 'Prihlásenie trvalo príliš dlho alebo sa nezačalo na tejto stránke. Skúste to, prosím, znova.',
  'anotoki.signIn.storageUnavailable':
    'Tento prehliadač nedovolil stránke zapamätať si prebiehajúce prihlásenie. Povoľte tejto stránke ukladať údaje (súbory cookie a údaje stránok) a potom sa prihláste znova.',
  'anotoki.signIn.unavailable': 'Prihlásenie teraz nie je dostupné. Skúste to, prosím, znova o pár minút.',
  'anotoki.feedback.title': 'Pošlite nám spätnú väzbu',
  'anotoki.feedback.lead': 'Niečo nefunguje, máte nápad alebo otázku? Napíšte nám – čítame každú správu.',
  'anotoki.feedback.message': 'Vaša správa',
  'anotoki.feedback.email': 'Vaša e-mailová adresa',
  'anotoki.feedback.emailHint': 'Len ak chcete odpoveď. Na nič iné ju nepoužijeme.',
  'anotoki.feedback.anonymousHint': 'Nepôjde s ňou ani Váš účet, ani Vaša adresa.',
  'anotoki.feedback.thanksText': 'Vaša správa je na ceste k nám.',
  'anotoki.feedback.messageRequired': 'Najprv napíšte správu.',
  'anotoki.feedback.subjectRequired': 'Doplňte, prosím, predmet.',
  'anotoki.feedback.tooManyHour': 'Ďakujeme – no to je veľa správ za krátky čas. Skúste to, prosím, znova o hodinu.',
  'anotoki.feedback.tooManyDay': 'Ďakujeme – no dnes prišlo veľa správ. Skúste to, prosím, znova zajtra.',
  'anotoki.feedback.unavailable': 'Správy teraz nemôžete poslať. Skúste to, prosím, znova o pár minút.',
  'anotoki.feedback.signInRequired': 'Na poslanie správy sa, prosím, prihláste.',
  'anotoki.feedback.failed': 'Správu sa nepodarilo poslať. Skúste to, prosím, znova – Váš text tu stále je.',
  'anotoki.feedback.network': 'Stránka nie je dostupná. Skontrolujte pripojenie a skúste to znova.',
  'anotoki.feedback.honeypot': 'Toto pole nechajte prázdne',
};

/** The library's words this site says its own way, by language: what `libraryWords` is given. */
export const SURVEY_LIBRARY_WORDS: Readonly<Record<string, Readonly<Record<string, string>>>> = { sk: FORMAL_SLOVAK };

/**
 * Where this device's choice of language, the cached strings and the admin pages' drafts are kept: under the
 * names the site always had - `anotoki-survey:language`, `:language-cache`, `:localization-drafts` (the library's
 * translationSettings() makes them of it; the Privacy page lists them, shared/legal/legal-facts.ts).
 */
export const SURVEY_STORAGE_PREFIX = 'anotoki-survey';

/**
 * The site's words - the anotoki family's translations module
 * (@anotoki/lib/translations, anotoki-lib 0.3.0) wired to this site:
 *
 * - the language the pages are read in, and its strings, from GET
 *   /api/translations/{code} (the library's TranslationService, its
 *   `translate` and `translatePlural` pipes): this tab's `?lang=`, a choice
 *   made on the page, the anotoki account's language (the token's `locale`)
 *   while the account keeps the person's choices (`preferences`, the IAM's
 *   migration 015) - over what this device remembered - the browser's,
 *   English. A choice made in the bar is saved to the account then, one save
 *   at a time and the latest last; a refusal the IAM calls invalid_request (a
 *   language it does not offer) stays this site's own for the visit, any
 *   other is said under the switcher. The admin panel (/admin) is English;
 * - this device's choice, the cached bundle and the admin pages' drafts
 *   under the names the site always had (`anotoki-survey:...`), so a
 *   returning reader keeps both;
 * - nothing is asked while the site cannot start (the sign-in's settings did
 *   not come): the pages draw what they have, and ask again at the next
 *   navigation;
 * - the library's own words (`anotoki.*`: the kit's, the status page's) from
 *   the database, and this site's formal Slovak for them while it cannot be
 *   read (SURVEY_LIBRARY_WORDS);
 * - the admin panel's Translations page for EDITOR and ADMIN, its Languages
 *   page too - an editor adds, renames, orders and switches languages, as
 *   ever; deleting one is an administrator's, and the server says so to
 *   anybody else (403).
 *
 * The factory runs the first time the module needs it, in an injection
 * context: never while the TranslationService is being made, so the
 * AuthService it reads closes no circle.
 */
export function siteTranslationsConfig(auth: AuthService): AnotokiTranslationsConfig {
  return {
    storagePrefix: SURVEY_STORAGE_PREFIX,
    libraryWords: SURVEY_LIBRARY_WORDS,
    account: {
      language: () => (auth.signedIn() ? (auth.user()?.locale ?? null) : null),
      decides: () => auth.preferences() !== null,
      save: (code) => auth.savePreferences({ language: code }),
      userKey: () => auth.person()?.id ?? null,
    },
    canAsk: () => auth.status() === 'ready',
    admin: {
      allows: { strings: () => auth.isStaff(), languages: () => auth.isStaff() },
      routes: { translations: '/admin/translations', languages: '/admin/languages', migrations: MIGRATIONS_PATH },
      leads: {
        translations: 'What the site itself says where people take surveys, in every language. A survey’s own texts are written in its editor; this admin panel stays English.',
        languages: 'The languages people can read the site in, and surveys can be translated into. A new one reads in English until its strings are written, key by key.',
      },
    },
  };
}

export function provideSiteTranslations(): EnvironmentProviders {
  return provideAnotokiTranslations(() => siteTranslationsConfig(inject(AuthService)));
}
