import { inject } from '@angular/core';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { ANOTOKI_LEGAL_CONFIG, AnotokiLegalConfig, LegalFacts } from '@anotoki/lib/legal';
import { TranslationService, translationSettings } from '@anotoki/lib/translations';
import { AuthService } from '../auth/auth.service';
import { VISITOR_STORAGE_KEY } from '../auth/visitor-key';
import { THEME_KEY } from '../kit';
import { DRAFT_PREFIX } from '../survey/drafts';
import { SURVEY_STORAGE_PREFIX } from '../translations';

/**
 * The day the survey's facts last changed: the pages show the later of it and
 * the day the library's own words last did. Move it with any change to what
 * the site keeps or for how long - and the strings that say so (`legal.*`,
 * migration 013).
 */
export const SURVEY_LEGAL_UPDATED = '2026-10-18';

/**
 * How many days a visitor unseen is kept when the server does not say: the
 * backend's default (VISITOR_DEFAULTS' keep_days, backend/config/config.php).
 * The server says the host's own number in GET /api/auth/config
 * (`visitor_days`), which the pages use.
 */
export const VISITOR_DAYS_DEFAULT = 30;

/**
 * The anotoki account's cookie for every anotoki site (the IAM's committed
 * hint_cookie_name). The browser sends it here too, but this site never reads
 * it: no sign-in by the hint (`hint: false`, core/auth/auth.config.ts).
 */
export const SIGN_IN_HINT_COOKIE = 'anotoki_signed_in';

/**
 * The legal pages' configuration: the survey's (core/legal/legal.config.ts -
 * the page's language, the database's words) with the facts the pages read.
 * Their frame provides it (layouts/legal-layout), so the facts - this code and
 * its strings' keys - load with the pages, never with a survey.
 */
export function surveyLegalPagesConfig(): AnotokiLegalConfig {
  const root = inject(ANOTOKI_LEGAL_CONFIG, { skipSelf: true });
  const i18n = inject(TranslationService);
  const anotoki = inject(AnotokiAuth);
  const auth = inject(AuthService);
  return { ...root, facts: () => surveyLegalFacts(i18n, anotoki, auth.visitorDays()) };
}

/**
 * The survey's facts, in the page's language - read as a page is drawn, so a
 * change of language redraws them. Each must stay true of the code:
 *
 * - its record of a person: users (migrations 001, 011) - the anotoki account's
 *   id and name from the sign-in, first and last seen (the library's
 *   RecordPerson, api/people.php), no address; the name scrubbed to the IAM's
 *   placeholder when the account is deleted (the library's Scrubber);
 * - the answers: responses (001, 004) - the options, the words, gender and age
 *   where asked, started and sent, the language read in; deleted only by an
 *   ADMIN (one, a person's on the People page, a survey's), never by age; the
 *   results show each with its person's name to EDITOR and ADMIN, and the CSV
 *   carries it;
 * - writing surveys: surveys.created_by / updated_by, images.created_by,
 *   translations.updated_by; a picture no survey shows goes a day old at the
 *   earliest, after a survey's save or delete (imagesCleanup());
 * - visitors: users with a negative id, the key's hash, first and last seen
 *   (006); ended after `visitor_days` unseen, deleted with no answers left;
 *   the counters of new visitors an hour by a keyed HMAC of the address
 *   (clientAddressKept()), deleted by the clean-up after their hour
 *   (visitorSweep());
 * - the error log: the library's words and its 30 days (surveyErrorLog() sets
 *   no `days`);
 * - the audit log: editors' and administrators' changes, by the token's
 *   person, never an address (surveyAudit(): no recordAddress), never pruned;
 * - backups: plain (not encrypted), the library's keeping by count - 14 daily
 *   (made on the first request of a UTC day), 5 before an update, 5 before a
 *   restore, by hand until deleted (surveyBackups() sets none of its own) -,
 *   downloadable by an ADMIN;
 * - this browser's storage: the sign-in's (the library's auth module, under
 *   `anotoki-auth:{client id}`), the theme (THEME_KEY), the language and its
 *   cached strings (SURVEY_STORAGE_PREFIX), the visitor's key
 *   (VISITOR_STORAGE_KEY), the drafts of a survey begun (DRAFT_PREFIX), the
 *   admin pages' unsaved words; the IAM's hint cookie, which reaches this site
 *   and is never read here;
 * - counting visits: the family's Umami (src/index.html: umami.anotoki.eu, the
 *   query and the fragment left out) - the library's words;
 * - who else handles data: the hosting company (WebSupport s.r.o., named by
 *   the owner on 2026-10-18: the servers, the database and the mail) and
 *   Cloudflare.
 *
 * No feedback (the owner's decision for this site): the Contact page gives the
 * address alone. Every address the pages link to is the code's - the anotoki
 * account's pages from the IAM's address the site signs in with (GET
 * /api/auth/config), the operator and Cloudflare in the library -, never a
 * string's: a rewording on the Translations page can never change where a link
 * goes (the 0.6.0 review). So are the cookies' and stored items' names.
 */
export function surveyLegalFacts(i18n: TranslationService, anotoki: AnotokiAuth, visitorDays: number | null): LegalFacts {
  const iam = anotoki.issuer();
  const client = anotoki.clientId() || 'survey';
  const words = translationSettings({ storagePrefix: SURVEY_STORAGE_PREFIX }).keys;
  return {
    site: i18n.t('brand.site'),
    about: i18n.t('legal.about'),
    updated: SURVEY_LEGAL_UPDATED,
    account: { deleteUrl: anotoki.accountUrl(), privacyUrl: iam ? `${iam}/privacy` : null },
    data: [
      { name: i18n.t('legal.record.name'), what: i18n.t('legal.record.what'), why: i18n.t('legal.record.why'), kept: i18n.t('legal.record.kept') },
      { name: i18n.t('legal.answers.name'), what: i18n.t('legal.answers.what'), why: i18n.t('legal.answers.why'), kept: i18n.t('legal.answers.kept') },
      { name: i18n.t('legal.writing.name'), what: i18n.t('legal.writing.what'), why: i18n.t('legal.writing.why'), kept: i18n.t('legal.writing.kept') },
    ],
    visitors: {
      what: i18n.t('legal.visitors.what'),
      why: i18n.t('legal.visitors.why'),
      kept: i18n.plural('legal.visitors.kept', visitorDays ?? VISITOR_DAYS_DEFAULT),
    },
    // The editors' changes too, and what the site does there by itself (the daily backup) - never an address.
    auditLog: { what: i18n.t('legal.auditLog.what') },
    // Kept by count, not by age: a daily copy is made on a day the site is used, so the 14 newest may span more days.
    backups: { what: i18n.t('legal.backups.what'), kept: i18n.t('legal.backups.kept') },
    storage: [
      { preset: 'signIn', name: `anotoki-auth:${client}`, purpose: i18n.t('legal.storage.signIn.purpose') },
      {
        name: `anotoki-auth:${client}:login:…, anotoki-auth:discovery:…`,
        kind: 'session',
        purpose: i18n.t('legal.storage.signInUnderWay.purpose'),
        kept: i18n.t('legal.storage.signInUnderWay.kept'),
      },
      { preset: 'signInHint', name: SIGN_IN_HINT_COOKIE, purpose: i18n.t('legal.storage.hint.purpose') },
      { preset: 'theme', name: THEME_KEY },
      { preset: 'language', name: `${words.language}, ${words.cache}` },
      { name: words.language, kind: 'session', purpose: i18n.t('legal.storage.tabLanguage.purpose'), kept: i18n.t('legal.storage.untilTabClosed') },
      { preset: 'visitorKey', name: VISITOR_STORAGE_KEY, kept: i18n.t('legal.storage.visitorKey.kept') },
      { name: `${DRAFT_PREFIX}…`, kind: 'local', purpose: i18n.t('legal.storage.draft.purpose'), kept: i18n.t('legal.storage.draft.kept') },
      { name: words.drafts, kind: 'session', purpose: i18n.t('legal.storage.wordDrafts.purpose'), kept: i18n.t('legal.storage.untilTabClosed') },
    ],
    // The hosting company, named by the owner on 2026-10-18: the servers, the database and the mail.
    processors: [{ preset: 'hosting', name: 'WebSupport s.r.o.', url: 'https://www.websupport.sk' }, { preset: 'cloudflare' }],
  };
}
