---
name: survey-site
description: Use for any development work on the anotoki survey site (this repo) - new question types or survey features, the editor, the results, the survey people take, the site's strings and languages, a survey's translations, the PHP API, the database, pictures, signing in and roles, the setup page or hosting. Load it before changing anything, so the map, the rules both sides keep and the gotchas already paid for are not rediscovered.
---

# The survey site - project skill

survey.anotoki.eu: surveys in steps, an editor, results with a drill-down.
Angular 21 in `frontend/`, PHP 8.2 + Slim 4 + PostgreSQL in `backend/`, sign-in
through the anotoki IAM (client `survey`; roles EDITOR and ADMIN). What people
taking a survey read is in English and Slovak - the site's own words from the
database, a survey's texts from the survey; the admin panel is English. `docs/` is the
full knowledge base - [architecture](../../../docs/architecture.md),
[API](../../../docs/api.md), [operations](../../../docs/operations.md),
[decisions](../../../docs/decisions.md); this file is the implementer's map and
checklist.

**Keep it current.** A change that makes this file, `docs/`, `CLAUDE.md` or an
agent wrong changes them in the same piece of work.

## The map

```
backend/
  api/index.php            the front controller: buildSurveyApp(), middleware (the family's error log,
                           outermost -> security headers -> error handler -> the family's SiteGate ->
                           PeopleUpkeep and the daily backup (after the answer) -> routing; each route
                           group with the library's Identify in front of it - $identify, $identifyTaker
                           - and RecordPerson where it touches the site's data); run unless SURVEY_NO_RUN
  api/bootstrap.php        what every entry point loads: settings, error handling (warnings throw,
                           display_errors off), the site's functions
  api/routes/              public.php (health, the site's status - the family's MigrationsRoutes::status -,
                           auth config - the family's AuthRoutes -, pictures, the strings of a language,
                           POST /api/client-errors - a page's error into the error log, the family's
                           ErrorLogRoutes::client: nobody's, capped by the library),
                           surveys.php (people - the library's RequireCaller), visitor.php (POST
                           /api/visitor/move: token and key), admin.php (/api/admin/..., EDITOR/ADMIN:
                           surveys, answers, pictures, languages, strings; ADMIN: the migrations, the
                           people, the error log, the audit log, the backups - the family's routes,
                           behind requireAdmin(), judged from the token)
  api/meddleware/          security.php, auth.php (requireStaff / requireAdmin - the library's
                           RequireRole in this site's words, the token's roles alone, nothing asked
                           of the database -, requireFor - one method of a group -,
                           sweepVisitorsSoon): every route but the public ones takes one - a
                           visitor's key makes somebody a visitor only on the three survey routes
                           (surveyIdentify(..., visitors: true) + RequireCaller); the one
                           other reader is POST /api/visitor/move, which needs a token as well
                           and only hands the key in; nothing of a survey
                           without a token while sign-in is required, but its pictures (an
                           <img> sends none; UUID addresses)
  api/auth.php             signing in through the family's library (anotoki-lib 0.6.1, Anotoki\Lib\Auth -
                           the IAM's SDK is gone): surveyIam() (IamClient), surveySignInRule() /
                           authLoginRequired() (the IAM's "Sign-in required", relayed by
                           /api/auth/config with visitor_days), surveyIdentify() (only Bearer claims to
                           be somebody; a visitor's key on the surveys' routes), currentUser() ->
                           SiteUser {id, name, roles, visitor} - no address; isThisComputer()
                           (setup.php and the health details)
  api/people.php           the people module over users (Anotoki\Lib\People): surveyPeople(), the People
                           page's columns (answered, written), the visitors' line, peopleDelete()
                           (every answer of a person's - the library's hook, the page's and a
                           restore's: inside the library's transaction, on the $pdo it is given
                           alone, a null request in a restore), peopleNames() (the audit log's and
                           the backups' names)
  api/admin_tools.php      the error log, the audit log, the backups (Anotoki\Lib\ErrorLog, Audit,
                           Backups): surveyAdminContext() (the token's person, the proof - a sign-in
                           of the last ten minutes -, whose address a request is - the visitors'
                           trusted proxies and header, Cloudflare's by default, and the origin
                           secret -, the people's
                           names, this site's error body), surveyAudit() / surveyAudited(),
                           surveyErrorLog(), surveyBackups() (storage/backups, sealed; the
                           migrations' lock; a restore's hooks - People::restoreHooks(): the People
                           deletes since the backup done again inside it, the scrub after it)
  api/visitors.php         visitors (the switch off): visitorFind / visitorMake (in the answers'
                           transaction, after the limits - counters that are rows) / visitorHold /
                           visitorSweep (+ visitorSweepSoon: after the answer, hourly) /
                           visitorsForgetEmpty / visitorMoveInto
  api/client_address.php   the address the limits count - the family's one rule (the library's
                           ClientAddress): REMOTE_ADDR unless a trusted proxy's (Cloudflare's ranges
                           by default) CF-Connecting-IP names one - that header pinned, no other ever
                           read; with the origin secret (originSecret()) only on a request carrying it
                           in X-Anotoki-Origin, else the edge; IPv6 by its /64 - and
                           clientAddressKept(), what is kept of it: a
                           keyed HMAC, a pseudonym while the key lasts, never the address in the clear
  api/helpers.php          JSON in and out, and the text helpers: TEXT_SPACE (what the browser's trim()
                           takes for a space), textTrim(), textClean(); afterAnswerAdd() /
                           afterAnswerRun() (work after the answer: the clean-up). (A site's string
                           with nothing in it to see is the library's Text::blank() now.)
  api/surveys.php          survey rows <-> the frontend's Survey; summaries; create/save (revision)/
                           status/delete; surveyLanguagesLock() (a save holds its languages);
                           SURVEY_TAKING_ANSWERS_SQL
  api/responses.php        submit (once, while open, every answer checked; the language it was read in),
                           list, delete
  api/images.php           store (checked by its bytes), find, meta, clean-up
  api/survey_rules.php     surveyFromBody() (shape + cleaning, the translations too), surveyProblems(),
                           surveyTranslationGaps(), surveyTranslationsJson(), answer rules;
                           SURVEY_RESERVED_SLUGS (the legal pages' terms, privacy, contact among them)
  api/translations.php     the site's own words through the family's library (anotoki/lib's
                           Anotoki\Lib\Translations - the bundle, the admin grid and languages, every
                           check of a string, the command line; never edited here): surveyTranslations()
                           (TRANSLATION_SEEDED_LANGUAGES, SurveyLanguageUsage - a language a survey
                           uses is not deleted, under the language row's lock), respondRefusal() (this
                           site's error body), translationWriter() (the token's person),
                           languagesForSurveys() / languagesOffered() (what survey_rules.php reads)
  api/rich_text.php        richTextClean(): the editor's HTML and nothing else
  api/migrations.php       the database's migrations through the family's library (vendor/anotoki/lib,
                           anotoki-lib 0.6.1's PHP half - never edited here; DEV.md: how it is updated):
                           surveyMigrationSet(), surveyMigrationSets() (the library's `anotoki_admin`,
                           the site's `survey`, then the library's `anotoki_translations` and
                           `anotoki_people` - recorded as <set>/NNN.sql), surveyMigrator($pdo,
                           $backupFirst) (the site's own lock DATABASE_UPDATE_LOCK - setup.php,
                           migration.php, the Apply, the backups and the tests' template all go
                           through it; a backup first for the Apply and migration.php),
                           surveySiteState() (not_set_up / update_pending / unavailable / ready, and
                           installed.lock), siteOpenWhileUpdating() (what answers while an update
                           waits - the sign-in's settings, the strings, the Migrations page's routes,
                           the error log's and the backups': the library's openPath(s)())
  config/config.php        database.local.php + iam.local.php; visitors.local.php (optional, by hand:
                           VISITOR_DEFAULTS - the trusted proxies Cloudflare's published ranges, the
                           library's ClientAddress::CLOUDFLARE -, visitorSettings(); visitorSettingsFile()
                           - a file not read cleanly is logged, the defaults hold); every *.local.php
                           through settingsFileReadCleanly(), never a plain require - a database or
                           IAM file not read cleanly leaves the site not set up; cloudflare.local.php
                           (optional, by hand, the same in every anotoki site: originSecret() /
                           originSecretFile() - a string with something in it, else none; a file that
                           cannot be read cleanly - it prints, PHP cannot parse, run or open it -
                           FAILS CLOSED, the IAM's rule: a secret no request carries,
                           originSecretNobodyCarries(), the site running all the same;
                           settingsFileReadCleanly() catches what it prints, settingsSaid() logs the
                           fault once a day by its kind or bytes, never its contents);
                           SURVEY_TEST_CONFIG for the tests
  migrations/survey/       the schema - and the site's strings (002 the tables and the two languages,
                           003 every key with its English and Slovak string: the pattern for the next;
                           006 the visitors: visitor_ids, users.visitor_key_hash, visitor_counters;
                           008 the toasts of a choice the anotoki account did not take; 009 the
                           "not set up yet" page's four strings deleted - the pattern for a key the
                           code stops using; 010 the site's strings for the kit moved under the
                           library's keys, anotoki.*, the library's words that speak to the reader in
                           formal Slovak - before the library's own set runs; 011 users.anonymized_at
                           and users.email dropped - the site keeps no address -, every other column
                           of every row proven unchanged; 012 the site's sign-in strings moved under
                           anotoki.signIn.*, formal Slovak for the two the library says informally;
                           013 the legal pages' facts - legal.*, English and formal Slovak, no address
                           in any - and the three tabs' titles)
  setup.php                the installer (this computer: nonce, re-runnable; a host: token, lock, self-delete)
  router.php               php -S behaving like the hosting's Apache (+ the built app)
  translations.php         command line only, never uploaded - the library's TranslationsCommand:
                           --status (the frontend's keys against the database), --export / --import a
                           language as flat JSON
  tools/build.php          the upload -> ../dist/ (an allow-list: a new file beside setup.php is left out)
  tools/translation_keys.php   surveyKeyScanner(): the library's KeyScanner set up for this site - the
                           keys the frontend uses, and a fail for a key asked for the wrong way, one put
                           together from an undeclared prefix, innerHTML given a string; the library's
                           own keys (anotoki.*) are never looked for; for translations.php and the tests
  tests/                   run.php, lib.php, unit/, api/, tools/ (testdb, testenv); the IAM is the
                           library's TestIam (and its stand-in, vendor/anotoki/lib/php/testing)
frontend/src/app/
  app.config.ts            the providers; SITE_INTERCEPTORS (the site's status, then who a request is);
                           provideAnotokiErrorReport() - the family's reporter, the app's ErrorHandler:
                           the pages' errors, scrubbed, to POST /api/client-errors through that
                           HttpClient (a person's with the token, a visitor's without the key -
                           app.config.spec.ts)
  app.component.*          the pages behind the family's gate: <anotoki-site-gate> around the router
                           outlet, given as its <ng-template anotokiSitePages> - made only while the
                           gate shows the pages (anotoki-lib 0.2.0; content given as it is is made
                           shown or not, an unmarked template is not the pages); the reload once the
                           site runs again is the library's (SiteStatus.checkForReload() never opens
                           the gate first); the load error card; the kit's toasts and confirm, the
                           lightbox over everything
  core/migrations.ts       the family's library (@anotoki/lib/migrations) wired to this site:
                           provideSiteMigrations() (isAdmin / isSignedIn / signIn - signInOrShowWhy -
                           / language - effectiveLanguage, English in the admin panel / the words -
                           siteStatusWords(i18n): the library's anotoki.siteStatus.* from the
                           database / AdminDates' dates / reload the strings when up to date),
                           MIGRATIONS_PATH; siteStatusInterceptor in app.config.ts; SiteStatus
                           (state, blocked, check, checkForReload, markReady) is the library's
  core/auth/               signing in through the family's library (anotoki-lib 0.6.1, @anotoki/lib/auth -
                           the vendored SDK is gone): auth.config.ts (provideSiteAuth() - the boot
                           configuration AuthService read, the site's API (/api/, its status, auth
                           config, strings and pictures skipped), the visitors (VisitorKey, the key
                           only to /api/surveys), the language and the words (libraryWord, formal
                           Slovak), hint: false, /auth/callback; signInOrShowWhy() for a Sign in
                           button; signInFailureGuard), auth.service.ts (AuthService, the survey's
                           face of AnotokiAuth: status loading/ready/not-set-up/error - it reads
                           /api/auth/config itself and hands it over (bootConfig()) -, loginRequired
                           - true unless false -, visitorDays, visitorsWelcome (both needed),
                           visiting, taker {id, visitor}, person {id, name} - no address -,
                           noteLoginRequired(), signIn(returnTo, prompt) - false and signInFailure
                           when it cannot start -, preferences and savePreferences() - the account's
                           theme, date order and clock, for every anotoki site), visitor-key.ts
                           (VisitorKey, the library's VisitorKeyStore: the key in localStorage, the
                           move after a sign-in, moves / moved / lost). The interceptor
                           (anotokiAuthInterceptor: a person's with the token or never sent, a
                           visitor's with the key), the guards (personGuard on /admin and the
                           preview, personOrVisitorGuard on the participant layout's children - each
                           lets everything through while SiteStatus.blocked()), SavesInFlight, the
                           callback page and the screen of a failed sign-in are the library's
  core/admin/admin-tools.ts   provideSiteAdmin(): the family's admin tools (provideAnotokiAdmin: ADMIN from
                           the token, signInAgain - prompt=login - for a backup's proof, the
                           Migrations page, the account's dates) and People page
                           (provideAnotokiPeople: me, the lead, Delete their answers with its
                           question - deleteQuestion() -, visitorsLine())
  core/api/api.service.ts  one method a route; the surveys' marked issuedAs('caller') as they are made,
                           the move issuedAs('person') + CARRIES_VISITOR_KEY (the library's);
                           ApiError {status, code, message, body, retryAfter} - toApiError() reads
                           {error, code} and the library's {code, message}
  core/boot.ts             boot(): the theme, where the site stands (SiteStatus.check() - never stops
                           the start), the sign-in (VisitorKey made before the first await;
                           a visitor's drafts adopted right after a sign-in), then the language and
                           its strings, then BOOTED - the app initializer, and the load error
                           page's "Try again"
  core/translations.ts     the family's translations module (@anotoki/lib/translations) wired to
                           this site: provideSiteTranslations() / siteTranslationsConfig() - the
                           storage names the site always had (anotoki-survey:language, -cache,
                           :localization-drafts), the account (its language, whether it decides, the
                           save, the person's id for the drafts), canAsk (nothing asked while the
                           site cannot start), the admin pages for EDITOR / ADMIN and their routes;
                           FORMAL_SLOVAK / SURVEY_LIBRARY_WORDS (the library's words that speak to the
                           reader, formally, while the database cannot be read). The service itself
                           (language, effectiveLanguage, t / plural / around / has, setLanguage,
                           init, reload, noteAddress, forKit, forShell) and the translate /
                           translatePlural pipes are the library's
  core/i18n/               the site's own beside it: the localDate pipe (the account's date order),
                           error-text.ts (a failed request's key), answer-words.ts (a rule or a
                           problem in the reader's language), dynamic-keys.ts (keys put together at
                           run time - the backend's scan reads it)
  core/legal/              the family's legal pages wired to this site (anotoki-lib 0.6.0's @anotoki/lib/legal):
                           legal.config.ts (surveyLegalConfig() for provideAnotokiLegal() in
                           app.config.ts - the language on the page, libraryWord() for the library's
                           keys, no facts), legal-facts.ts (surveyLegalFacts() - the site's name,
                           what it is, its three parts, the visitors - their days from visitor_days -,
                           the audit log and backups in its words, every cookie and stored item by
                           the code's own names, the hosting company and Cloudflare; the anotoki
                           account's pages from AnotokiAuth.issuer() / accountUrl() - never a string;
                           SURVEY_LEGAL_UPDATED; surveyLegalPagesConfig(), the frame's provider)
  core/kit.ts              the family's UI kit (anotoki-lib 0.6.1, each piece from its own entry point)
                           wired to this site: provideSiteKit() = provideSiteUi() (TranslationService.forKit():
                           the language on the page and the kit's words from the database - the
                           library's keys, anotoki.* - and SURVEY_ICONS) + provideSiteShell() (the
                           library's ThemeService: the account's theme signed in, saved from the
                           bar's switch, the device's signed out, THEME_KEY for the kit's
                           theme-boot.js; the chooser: forShell(), a choice of the language already
                           on the page changing nothing)
  core/util/               dates.ts (the admin panel's English dates, with the account's choices when
                           passed), date-patterns.ts (the four date orders, the two clocks), storage.ts
  core/title.strategy.ts   the tab's title in the language on the page (the site's name alone while
                           there are no strings); tells the service where the page is - which is also
                           when a page without its strings asks for them again
  core/admin/admin-store.service.ts   the admin panel's cache and the editor's saving (revision, conflict
                           - keepMine / keepMyTranslations bring translations together against
                           _server, the survey as the server last had it from this page;
                           unsavedChanges() says what kind of change is unsaved, from the documents;
                           mineWouldBeRefused(), removedHereLanguages() / removedThereLanguages() for
                           what the notice says); the site's languages (languages, loadLanguages -
                           again with each fresh load, and for a code a conflict brings)
  core/admin/admin-dates.service.ts   AdminDates: core/util/dates.ts bound to the account's date order
                           and clock - what every admin page writes its dates with
                           (`formatDateTime = inject(AdminDates).formatDateTime`)
  core/survey/             the model and every rule (pure TS, unit-tested); localize.ts: a survey's
                           translations (translationGaps, localizedSurvey, pruneTranslations, the
                           writers, mergeTranslations for a conflict); drafts.ts (by survey and
                           taker - VISITOR_SLOT for a visitor; adoptVisitorDraft(s) at a sign-in)
  core/images/             prepareImage (browser-side), ImageUploader
  core/testing/            for the unit tests only: example data, provideTestTranslations() (the
                           library's test translations - @anotoki/lib/translations/testing - with the
                           site's kit wiring and formal Slovak), answersOf() (a person's answers, or a
                           visitor's)
  layouts/                 top-bar (the site's wrapper over the family's <anotoki-top-bar>: the brand,
                           the links - SURVEY_LINKS / ADMIN_LINKS (System for an ADMIN, lit on each
                           System page), UPDATE_LINKS (Migrations alone while an update waits) -, the
                           person (name; the token's address, shown, never kept) and their role, the
                           menu's items, signIn / signOut -
                           saved first, asked when something would be lost - the drafts of the
                           Translations and Languages pages through the library's
                           LocalizationDrafts, its entry point loaded only then and only for staff;
                           docs/architecture.md "The top bar"),
                           participant ("You are not signed in" where the page would be - a session
                           that ended in place; for a visitor only on the preview; the toasts of
                           the move and of a lost visit), admin
                           (English; "You are signed out" for a session that ended in place, the
                           no-access card for somebody signed in without a role). A sign-in that
                           came back without one, or could not start, is the library's screen on
                           /auth/callback (AuthCallbackComponent, app.routes.ts), never a card.
                           legal-layout: the frame of /terms, /privacy and /contact (anybody's, no
                           guard; each its own path with this frame as parent - an empty-path
                           parent took "/" itself, app.routes.spec.ts), the facts' provider;
                           site-footer: Terms · Privacy · Contact (<anotoki-legal-links>) under the
                           participant and legal frames - one stylesheet for both frames,
                           src/styles/_participant-frame.scss
  boot/                    load-error (its "Try again" also opens the page that was asked for): drawn
                           instead of the site when the status answered and the sign-in's settings
                           did not (app.component.ts decides; everything else that keeps the site
                           from running is the family's page); kept-word.ts (the cached string, or
                           the English written in the page)
  pages/participant/       survey-home, take-survey (+ question-block, survey-hero, send-failure.ts,
                           shown-language.ts), visitor-notice (what a visitor is told, with Sign in)
  pages/admin/             surveys-list, survey-editor (+ parts, SurveyEditing, the translation mode:
                           editor-languages, translated-text, translating.ts; ?language= opens a tab),
                           survey-results, response-view, response-page (a visitor everywhere
                           there: "Visitor N", "Not signed in" under the name - Person.visitor; a
                           person's name alone, no address), survey-header; /admin/translations and
                           /admin/languages are the family's pages (@anotoki/lib/translations/admin,
                           a lazy entry point, canDeactivate anotokiUnsavedChangesGuard -
                           admin.routes.ts); system/ (ADMIN: the way to the System pages,
                           SYSTEM_PAGES in system-pages.ts) and the family's pages it leads to, each a
                           lazy entry point: /admin/people (@anotoki/lib/people/page), /admin/errors,
                           /admin/audit, /admin/backups (@anotoki/lib/admin/*), /admin/migrations
                           (<anotoki-migrations-page>: Pending in the order the files run, Applied
                           with each file's SQL, Missing, Apply pending)
  ui/                      the survey's own pieces: rich-text-editor (TipTap), lightbox, survey-image,
                           image-strip - the rest is the family's kit (@anotoki/lib/ui/<piece>, /shell)
frontend/src/              styles.scss: the family's styles (@anotoki/lib/styles: root, fonts, base,
                           utilities, tables) and the survey's own tokens; styles/_fields.scss: the
                           look of the fields a page draws itself, @use'd into that page's styles;
                           styles/_participant-frame.scss: the participant and legal frames' look
```

## Rules

- **Signed in, every page - or a visitor while the IAM says so**: somebody
  not signed in goes to the IAM before anything of a page is drawn (the
  library's `personGuard`; on the pages people take surveys on
  `personOrVisitorGuard`, which lets them through while the site welcomes
  visitors) and comes back to it; a sign-in that came back without one goes
  to the library's screen instead (and `signInFailureGuard` for the pages its
  guards let through). The admin panel and the editor's preview sign in
  whatever the switch (the preview has `personGuard` of its own, and the
  layout draws its card there for anybody not signed in). Every route of the
  site takes the library's `Identify` and then `RequirePerson`,
  `requireStaff()` or `requireAdmin()` - but the public ones and the three
  survey routes, which are `RequireCaller` behind `surveyIdentify(...,
  visitors: true)`: the person of a token; else, while the IAM says sign-in
  is required, 401; else the visitor of `X-Visitor-Key`; else nobody (who
  reads the open surveys, and whose kept answers make a visitor). No route of
  a survey answers without a token while sign-in is required, but the
  pictures' (`/api/images/...`: an `<img>` sends no token, and their addresses
  are random UUIDs - `docs/decisions.md`). Only the pages drawn while the site
  cannot run (the family's page, the load error card) and the legal pages
  (`/terms`, `/privacy`, `/contact`: anybody's, in `layouts/legal-layout`,
  nothing of a survey on them or asked of the API) draw without a sign-in.
  A new page goes under one of the two layouts (their guard), a new route
  behind `$identify` and `RequirePerson` (and `$recordPerson` where it touches
  the site's data) - a visitor's only for what a visitor must reach, and then
  it reads and writes `currentUser()`'s own rows and nobody else's.
- **A visitor** (`api/visitors.php`): a `users` row with a negative id, no
  name, no roles; the key the server made, sent once in a response header,
  only its hash stored, never logged, in a body or an address. Made only in
  the transaction that keeps its first answers, after the limits; a write for
  any taker holds the taker's row first (`visitorHold()`); ended (key cleared)
  after `keep_days` unseen, answers kept as "Visitor N"; deleted only with no
  answers left. `currentPerson()` and `RequirePerson` treat a visitor as nobody.
- **Who**: only a verified IAM token says who a request is (a visitor's key
  aside, above: the survey routes only), and only an
  `Authorization: Bearer` header claims to be somebody: a bad or empty one is
  401 `invalid_token` (never "nobody", never a visitor), another scheme is ignored. Roles from the token
  (the library's `Person`): MEMBER - every account's - is an ordinary person and
  nothing asks for it; `ROLES_STAFF` = ADMIN, EDITOR for `/api/admin`;
  ADMIN alone for the three deletes (a survey, somebody's answers, a
  language), the migrations and the System pages - the people, the error log,
  the audit log, the backups (the owner's decision: an EDITOR reads none of
  them). The frontend hides; the server refuses. **No address is kept**: a
  person is the IAM's id and name (`users`, recorded from the token by the
  library's `RecordPerson`); a new column with a person's data needs a place
  in the scrub of the IAM's deleted accounts (`api/people.php`). Nor a
  visitor's in the clear: what counts per address keeps a keyed HMAC of it
  (`clientAddressKept()` - a stable pseudonym while the installation's key
  lasts, never called unreadable), and where a request comes from is the
  family's one rule - `CF-Connecting-IP` from Cloudflare's ranges alone
  (`clientAddress()`; the library's error log reads by the same proxies). The
  header is pinned in code: never a setting a local file could point at
  `X-Real-IP`, `True-Client-IP` or `X-Forwarded-For`; and a trusted range
  shorter than /8 (IPv4) or /16 (IPv6) is refused (`visitorSettingRangeOk()`).
  With the origin secret (`config/cloudflare.local.php`, `originSecret()`;
  anotoki-lib 0.5.2, the owner's decision of 2026-10-13) the header is
  believed only on a request that carries it in `X-Anotoki-Origin` - anybody's
  Cloudflare Worker can connect from Cloudflare's ranges -, any other request
  from them counting as its edge: every reading of an address passes it
  (`clientAddress()`, `surveyAdminContext()`'s `originSecret:`), and the
  secret is never printed or logged. A file that is there but cannot be read
  cleanly **fails closed** - the IAM's rule, case for case: a secret no
  request carries, every request from Cloudflare's ranges its edge, never "no
  secret" (which would believe anybody's Worker); read cleanly with no secret
  in it, no secret. Its fault is logged once a day by its kind and line or its
  byte count, never its text; the site keeps running.
- **The legal pages' facts are the code's** (`core/legal/legal-facts.ts`,
  the words `legal.*`): a change to what the site keeps or for how long, to a
  cookie or a stored item's name, to who else handles data, changes them -
  the strings by a migration (English and formal Slovak, no address in any:
  `tests/unit/translations.test.php` holds it), `SURVEY_LEGAL_UPDATED` the
  day. Every address the pages link to stays in the code (the anotoki
  account's pages from the IAM's address the site signs in with), never in a
  string an administrator rewords.
- **A person's Delete is done again by a restore** (anotoki-lib 0.5.0): the
  hook (`peopleDelete()`) runs inside the library's transaction and begins
  none, writes on the `$pdo` it is given and nothing else - never `db()`, nor
  an audit entry or a helper of the site's on that connection (`surveyAudited()`,
  `dbExec()`): in a restore that waits on the restore's locks; the library
  writes the delete's entry on the same `$pdo` - takes a null request, and
  deletes nothing a replay could not delete again - what it deletes, a
  restore deletes again by the audit log's entry, which the library writes
  inside the same transaction.
- **Every admin change is audited** (`surveyAudited()`, `api/admin_tools.php`):
  a new admin route that changes something writes its entry, by the token's
  person, inside the change's transaction where there is one.
- **A database behind the code closes the site, but not to the ADMIN who
  applies it - the anotoki family's way, the library's** (anotoki-lib 0.6.1,
  both halves; the owner's decision of 2026-10-07): the
  `SiteGate` answers 503
  `update_pending` to everything but exactly `siteOpenWhileUpdating()` (and
  `/api/site-status`, always); a new route that must work then goes there, and
  nothing that writes the site's data does. Not set up, everything but the
  status is 503 `not_set_up`, the setup page offered only while
  `storage/installed.lock` is not there. `/api/site-status` answers anybody, in
  every state: nothing in front of it may ask who is asking (a sign-in rule
  there would make the pages read "not available" when they cannot even sign
  in yet - `tests/api/migrations.test.php` holds it, sign-in required or not).
  The Migrations routes, the error log's and the backups' judge ADMIN
  from the token alone (`requireAdmin()`, no `RecordPerson`): they must work on
  a database with nothing in it. Whatever applies migrations goes through
  `surveyMigrator()` on a connection of its own - one lock for all, the
  backups' too; the Apply and `migration.php` make a backup first. In the
  browser nobody but the site's ADMIN ever reads why the site is closed: the
  family's page ("being updated"; a quiet Sign in), the guards let pages
  through and send nobody to the IAM, and the outlet is the gate's
  `<ng-template anotokiSitePages>`, made only while the gate shows the pages - never an outlet
  given to it as it is. The library is never edited here: a change it
  needs is a new release (its repository, `irelevant25/anotoki-lib`), taken in
  by DEV.md's steps.
- **Both sides say the same**: `answer-rules.ts` ↔ `answerProblem()` /
  `answerClean()`; `survey-problems.ts` ↔ `surveyProblems()` (same sentences,
  same order, the translations' too); `localize.ts` ↔ `surveyTranslationGaps()`
  / `surveyTranslationFromBody()`; `RESERVED_SLUGS` ↔ `SURVEY_RESERVED_SLUGS`;
  `about-you.ts` ↔ `SURVEY_GENDERS` / `SURVEY_AGES`, the CHECKs in migration 001
  and the tails of `aboutYou.gender.*` / `aboutYou.age.*`; `MAX_UPLOAD_BYTES` ↔
  `IMAGE_MAX_BYTES`; and **what a space is**: the browser's `trim()` / `\s` ↔
  `TEXT_SPACE` in `api/helpers.php` (`textTrim()`, `richTextPlain()`),
  character for character - never `\s` or `\p{Z}` in PHP for a survey's text
  or an answer, they take U+0085 and U+180E as well. (A language code, a
  `{placeholder}` and a site string with nothing in it to see are the
  library's on both sides now - `languageCode()` ↔ `LanguageCode::ok()`, which
  `languageCodeOk()` wraps; `fillPlaceholders()` ↔ `Placeholders`;
  `blankText()` ↔ `Text::blank()` - kept the same by the library's tests.)
  Same sentences, too: in the frontend a rule or a problem of an
  answer is a kind and its
  numbers, and `answerProblemText()` / `choiceRuleText()` must say in English
  exactly what PHP says. The admin panel shows the server's sentences; somebody
  taking a survey never sees one - the page words its own
  (`core/i18n/answer-words.ts`, `take-survey/send-failure.ts`).
- **A new field on a survey or question**: the model (`survey.model.ts`), the
  factory (`newQuestion`, `copyQuestion`...), the editor, `surveyFromBody()` /
  `surveyQuestionFromBody()` (else the server drops it - it keeps only what it
  knows), the rules if it constrains answers, `docs/api.md`. Old surveys in the
  database do not have it: read it with a default, or migrate `content`. **If
  people read it** (a text), it is translated too: `SurveyTranslation`, a
  `TranslationPlace` in `localize.ts` (places, gaps, `localizedSurvey`, the
  writer), and in PHP `surveyTranslationFromBody()`, `surveyTranslationsJson()`
  (it writes out only the fields it names) and `surveyTranslationGaps()`; the
  copies (`copyQuestion`, `copySurvey`); the editor's pair (`translated-text`).
- **A survey's translations**: `language` and `translations` are required in
  every save - no default on the way in (a page from before would wipe them),
  defaults only when a stored row is read (`surveyContent()`). The maps are
  read through `own()` / `Object.hasOwn` and written by spreading into a new
  object. `AdminStore.updateSurvey()` prunes them after every change, so a
  removal needs no code of its own. People get a translation only when it has
  no gaps (`localizedSurvey(..., 'complete')`); the preview and the editor text
  by text (`'partial'`). The editor changes the language a survey is written
  in only while it has no translation; the server refuses the change only
  while the stored *and* the sent survey both hold translations (removing the
  last one and changing the language may come in one save). A copy of a survey
  starts with every translation's title empty (`copySurvey()`): the copy's
  title is new. An open survey with a gap in an offered translation stays
  open, and the editor says whose readers get the main language meanwhile
  (`SurveyProblem.untranslated`, `TranslationTab.readersGetMain` - the
  frontend's; the server's problems are sentences only) - "open" there is
  `currentStatus()`, the header's, never the stored status: a survey whose
  last day is over says nothing of its readers. In a conflict,
  translations are brought together text by text (`mergeTranslations(base,
  mine, theirs, saved)`, frontend only - no PHP twin).
- **A new string on a page people take surveys on**: a key
  (`namespace.thing[.detail]`, lowerCamelCase; a namespace the site has, or a new
  one - never `survey`, `option`, `step`, `item`), used as `'key' | translate`
  (or `i18n.t()` inside a `computed()`), and in a migration its row with a
  description (where it shows, what its `{placeholders}` are), its English and
  its **formal Slovak** string (Vy / Vás / Váš with a capital, the plural -li
  past, no pronoun where Slovak drops it, „ “ quotes; the rules are in
  `docs/decisions.md`). One string a line, apostrophes doubled, nothing else
  escaped. A number that a Slovak word agrees with is a plural family
  (`.one`, `.few`, `.other`, the number always `{count}`, asked for with
  `translatePlural` / `plural()`); those three suffixes are for nothing else.
  A key built at run time comes from a closed set listed in
  `core/i18n/dynamic-keys.ts`, through a table with a fallback key - never from
  an address, the IAM's answer or what a person typed. The scan holds the code
  to it: a literal that ends in a dot (`'take.refused.' + kind`) or a template
  literal that goes on with `${…}`, in a namespace the database has, must be a
  prefix declared there - in `.ts` and `.html` alike. And a key is asked for
  the way the database has it: a family with `translatePlural` / `.plural()`,
  one string with `translate` / `.t()` / `.around()` / `.has()` - the other way
  round the page shows the key, and the scan fails.
  `tests/unit/translations.test.php` holds the two sides together;
  `php translations.php --status` says the same for the configured database
  (exit 1 when not clean). A word of the library's (`anotoki.*`: the kit's,
  the status page's) is never a new key of the site's: the site asks for it by
  its whole key (`i18n.t('anotoki.topbar.roleAdmin')`), rewords it on the
  Translations page, and - when it speaks to the reader - keeps its Slovak
  formal in a migration and in `FORMAL_SLOVAK` alike.
- **Never a worded sentence in state.** A signal, a field initialiser or a
  module constant holds a key, a kind or an `ApiError`; the wording happens in
  a template (the pipes are impure on purpose) or in a `computed()` /
  `effect()` that calls the service - they run again when the language
  changes. Toasts and confirm dialogs are finished sentences when raised.
  Sentences are constants on purpose in one place: `FORMAL_SLOVAK` in
  `core/translations.ts`, the library's words that speak to the reader, said
  formally - given to the library (`libraryWords`) for the moments the
  database cannot be read (the family's page shows when the database holding
  the keys is what is not ready); the database has the same words (010), and a
  test holds the two together.
- **A site string is only ever text**: never into `[innerHTML]` (the scan fails
  an `innerHTML` whose value - on one line or several - has `translate` in it
  or calls `.t(` / `.plural(` / `.around(`); on its way into something drawn
  as HTML it goes through `escapeHtml()` (`aboutYouQuestions()`). Markup
  inside a sentence: `around()` and spans - and `around()` answers
  `[before, after, found]`: the marked-up value is drawn only inside
  `@if (x()[2])`, for a translation may leave the placeholder out. On the server a string has no
  brace that is not a `{placeholder}` (422 `invalid_placeholder`), and one
  with nothing in it to see is an empty one (the library's `Text::blank()`).
- **The admin panel is English**: literal words in the templates under
  `pages/admin` and `layouts/admin-layout`, no `translate` pipe there. The
  pieces both areas share (top bar, UI kit, toasts) read through
  `effectiveLanguage`, which is `en` under `/admin` - the kit's own words too
  (`core/kit.ts`), and the family's page at an admin address.
- **The UI kit is the family's** (anotoki-lib 0.6.1 - its 0.6.0 pieces taken
  where the site drew its own: the link cards of the home page and the System
  page, the results' removable filter chips; what stays the site's and why,
  `docs/decisions.md`): a new piece of a page
  is the kit's (`anotoki-*`, `anotokiButton`) unless the kit has none,
  imported from its own entry point (`@anotoki/lib/ui/button`, ...) - never
  from the `@anotoki/lib/ui` barrel, which puts every piece into the first
  load; never a copy of one in `src/app/ui/`, never a change to the library
  here. Its markup's classes are its own (`.anotoki-<piece>__<part>`): a spec
  or the browser check that reads them uses those. Its words are the
  library's keys in the database (`forKit()`): nothing to add for a new kit
  word but the library's own migration. An icon the kit does not have goes into
  `SURVEY_ICONS` (from `@anotoki/lib/ui/icons`). No global style may reach a
  kit component: a page's own look stays in its own styles.
- **The account's preferences** (the IAM's migration 015, the library's `AnotokiAuth`): signed
  in, the theme, the date order, the clock and the language are the anotoki
  account's - read from `AuthService.preferences` and the token's `locale`,
  never kept as this site's own (the device keeps only what it shows, for the
  next first paint and for a visitor). A control that changes one (the bar's
  theme, the chooser) saves it with `savePreferences()` only while
  `preferences()` is not null, shows the choice at once, saves one at a time
  with the latest choice last, and lets no earlier save's answer turn the page
  back. A new place that writes a date or a time for somebody signed in takes
  the account's order (and clock): `localDate` where people take surveys,
  `AdminDates` in the admin panel - never `core/util/dates.ts`'s functions bare
  in a page. Data stays ISO (the CSV, a file's name, an `<input type="date">`).
- **A language code from an address** is checked with `languageCodeOk()` before
  any query (the library's routes check their own); **who saved a string** is
  `currentUser($request)->id` (`translationWriter()`), nothing else. **Who may
  do what with the site's words is this site's**: the library's route groups
  get the site's checks (`routes/admin.php`: `requireStaff()`, and
  `requireFor('DELETE', requireAdmin())` on the languages) and the pages
  `admin.allows` (`core/translations.ts`) - never the library's to decide.
  The System's routes (people, error log, audit log, backups) are ADMIN's:
  the site's `requireAdmin()`, and the library's groups check the token's
  ADMIN again themselves.
- **Saving**: every editor change through `AdminStore.updateSurvey()` (or
  `SurveyEditing` by id); never keep a copy of a survey in a component to write
  back later. Never apply a save's answer to the content. What "mine" is in a
  conflict is what differs from `_server` - keep it what the server has
  (loaded, saved, settled, a change of status).
- **Anything typed and not saved in the admin panel lives outside its page**:
  the admin layout draws the outlet only for staff, so a session that ends
  takes the page away with no navigation - no guard runs, and a component's
  state and its `beforeunload` listener go with it (the layout then says "You
  are signed out"). Surveys are in
  `AdminStore`, the strings' cells and the languages' rows in the library's
  `LocalizationDrafts`; both keep them across a sign-out and let go only when
  somebody else signs in, and the top bar's "Sign out" asks about both.
- **A failure is said where the person is looking**: on a page longer than
  the window, in the bar that stays in view (the Translations page's save
  bar, the editor's translating bar) - not only in a notice at the top.
- **A count, or a look, followed by a write holds a lock between them**,
  inside the transaction, and as a statement of its own (`SELECT … FOR UPDATE`
  / `FOR SHARE`, `LOCK TABLE` first): under READ COMMITTED two requests
  otherwise both pass the check. Everybody takes rows in one order - a
  survey's row, then its languages; strings by key, then language.
- **Pictures**: `SurveyImage.src` is the server's; the editor sends id and alt,
  the server fills width, height, src from the file.
- **Queries**: `?` parameters always; identifiers from literals; JSONB built by
  `jsonText()` from checked arrays (an empty map goes as `new stdClass()`, or it
  becomes `[]`).
- **Migrations**: new file, next number; data-changing ones end with a `DO $$`
  gate; the replayed schema is what `survey_test_template` is. Strings after
  003: key rows `ON CONFLICT (name) DO NOTHING`, one insert a language
  `ON CONFLICT DO NOTHING` (never over what was reworded in the admin panel), a
  gate that raises when a key of the file lacks its `en` or `sk`; a changed
  English default is `UPDATE ... WHERE value = '<the old default>'`; a key the
  code stops using is deleted by a migration. A language a migration writes
  strings for goes into `TRANSLATION_SEEDED_LANGUAGES`. Keep 003's layout - a
  row a line beginning `('key',`, the gate's list as `(VALUES …) AS k(name)` -
  because a test reads the file's text: the gate must list exactly the keys
  the file writes, each in every language, and every string written must pass
  the library's checks as it is (`surveyTranslations()->storedRefusals()`).
  The library's keys (`anotoki.*`) are its own migration set's to write; a
  migration of this site touches one only to keep this site's words in it
  (as 010 does), and never writes over an owner's rewording.
- **Angular**: three files per component, OnPush, signals, `inject()`,
  inputs for route and query parameters, colours from the family's
  `--anotoki-*` tokens and the survey's own in `styles.scss`, 390 px.

## Gotchas already paid for

- **JSONB reorders keys**: tests compare documents with `assert_json_same`.
- **PHP decodes `{}` to `[]`** (arrays mode): an answers map or content object
  that may be empty is written as `new stdClass()`.
- **bytea goes as `PDO::PARAM_LOB`** (as text it would have to be UTF-8) and
  comes back as a stream (`stream_get_contents`).
- **A unique violation inside a transaction aborts it**: turn it into an
  ApiError and let `dbTx()` roll back; do not query after it.
- **The token is checked once per request**: the library's `Identify` sits in
  front of each route group (never globally - the status, the sign-in's
  settings, the strings and the pictures must answer whatever a request
  carries) and keeps its answer on the request; `RequireRole`, `currentUser()`
  and the admin tools read it from there. The error log, outermost, names who
  met a failure from the token itself (`surveyTokenPerson()`), since it sees
  the request before any group's `Identify` did.
- **DOMDocument reads Latin-1** unless told: `richTextClean()` prefixes
  `<?xml encoding="UTF-8">` and walks from its own wrapper; its serializer
  writes text the way `innerHTML` does, so the editor's own HTML round-trips.
- **The closing day**: the page by the reader's clock (`currentStatus()`), the
  server until noon UTC the day after (`SURVEY_TAKING_ANSWERS_SQL`,
  `surveyTakesAnswers()`) - keep both.
- **Anything that changes a saved field is a new revision** - opening and
  closing too (the closing day); the store waits for it before the next save
  and takes its revision, or the next save is a conflict with itself.
- **The store keeps changes across a sign-out**, and lets go only when
  somebody else signs in (bumping `_generation`, so late answers are dropped);
  a fresh load older than what is here is ignored. The library's
  `LocalizationDrafts` (it took this site's over) copies the rule - and,
  because signing in again is a page load, mirrors the drafts to
  sessionStorage, under the name and in the shape this site always had
  (`anotoki-survey:localization-drafts`, `{owner, strings, languages}`; the
  owner the account's id, a string). Its `clear()` writes the storage at once:
  an `effect()` runs too late for a sign-out, which leaves the page in the
  same turn, and what was given up would be there for whoever comes back. Its
  `beforeunload` question is asked whenever boxes wait and somebody is signed
  in - since anotoki-lib 0.4.0 not on the way to the sign-in after a session
  ended (0.3.0 asked there too): the drafts wait in the tab. The top
  bar reaches the drafts through a dynamic `import('@anotoki/lib/translations/admin')`,
  for staff only, so the first load never carries the admin pages.
- **Control characters are dropped on both sides** (`withoutControls()` /
  `textClean()`), never refused: a pasted soft line break must not make an
  answer or a survey impossible to save. They are the C0 controls only:
  U+0085 and U+180E pass, and neither side takes them for a space
  (`TEXT_SPACE`) - a text that is only one of them is a text.
- **`preg_replace()` answers null when it gives up**, and `(string) null` is
  `''`: a text with more than a million spaces inside it was "empty", and an
  empty translation means "delete the row". `textTrim()` hands such a text
  back as it is (`?? $text`), so the length check that comes next refuses it.
  Never cast a PCRE result of something a person sent without asking what
  null would mean.
- **The sign-in guard is `canActivate`, not `canMatch`**: refused while
  matching, the next route (`:slug`) would match `admin` and flash "no survey".
- **The library finishes the callback in the app initializer** (`AuthService.init()`
  -> `AnotokiAuth.init()`), before the router's first navigation;
  `/auth/callback` is seen when opened by hand, and as the screen of a failed
  sign-in. `AnotokiAuth.init()` runs once a page load: AuthService reads the
  boot configuration itself and starts the library only once it came, so the
  load error card's "Try again" can start it then.
- **`ng serve`'s proxy keeps the Host header** (`changeOrigin: false`), so
  setup.php through :4700 is still "this computer".
- **The hosting**: `display_errors` on (switched off in bootstrap), no `.avif`
  MIME type (pictures go through PHP), mod_dir's 301 for a URL naming a folder
  (no route named like a folder under `api/` - so never a folder `translations`
  or `languages` there), Cloudflare caching by extension.
- **The translation service is the library's now** (`@anotoki/lib/translations`):
  the next gotchas are what this site paid for and the library took over -
  read them as the reasons its code is the way it is, and change it in the
  library, never here. The factory of its configuration
  (`siteTranslationsConfig()`) runs the first time the service needs it, in
  an injection context - never while the service is being made: the
  `AuthService` it reads would close a circle.
- **The translation service never injects the Router** (NG0200 at start-up):
  the Router builds the title strategy, the strategy needs the service, and the
  service asking for the Router closes the circle. The strategy tells the
  service where the page is instead (`noteAddress()`), and `init()` reads
  `location.pathname` for the first page. For the same reason `AuthService`
  never injects `TranslationService`: callers pass `i18n.language()` to
  `signIn()`. `noteAddress()` is also the service's only news of a navigation,
  so it is where a page without strings from the server asks again - one load
  a navigation, none while another is out, none before `init()` has run or
  while the site cannot run.
- **The title strategy runs while a boot page is drawn**: the router
  navigates and calls `updateTitle()` with no `<router-outlet>` on the page.
  With no bundle `has()` is false for every key, so a participant route's
  title was its key ("title.surveys") on a site not set up yet. With no
  strings it writes the site's name alone; an admin route's title is English
  and stays.
- **Every load of strings takes a turn, and the last turn wins** (`turn`):
  the start, a choice, `reload()`, asking again. A choice takes its turn even
  when it needs no request (back to the language on the page), or the slower
  choice it was meant to cancel lands after it. The chooser counts its own
  choices for the same reason (`shellConfig()` in `core/kit.ts`: a choice of
  the language on the page with none on its way changes nothing) - an
  overtaken one answers false, which is no failure to say. A spec of a race
  needs two loads really in flight; with one pending request the guards can
  be deleted and everything stays green.
- **The languages on offer come with every bundle, so every answer is settled
  against the list that came** (`load()`), not only one in another language
  than was asked for: a cached bundle carries a stale list, and a language
  offered again reached a returning reader one visit late.
- **While the site cannot run, the cache is used as it is**: nobody is signed
  in then, so the token's wish is unknown, and comparing the cache's language
  with what the wishes settle on threw away a Slovak reader's strings exactly
  when they were all there was. The compare-and-remove is for a start that
  can ask the server.
- **Storage can refuse to be written**: `?lang=` is taken out of the address
  either way, and a choice must hold for the page - both are kept in memory
  first (`tab`, `chosen`) and read from there before storage.
- **"Try again" after an outage must open a page**: a first navigation the
  sign-in guard refused (nobody is signed in while the server is out of
  reach) leaves the router nowhere and the address bar on `/`. The load error
  card keeps the address it was opened with and sends the router there when
  `lastSuccessfulNavigation()` is null.
- **The sign-in is ready a moment before the strings are**: the site is drawn
  only when `auth.status() === 'ready'` and `BOOTED` is true, or the first
  pages (and a retry from the load error page) flash keys. `boot()` injects
  everything before its first `await` - `inject()` does not work after one.
- **`jsonb_exists(content->'translations', ?)`, not the JSONB `?` operator**:
  PDO takes every `?` for a parameter.
- **A translation's maps are JSON objects at all five levels** (`translations`,
  each language's `steps` and `questions`, each question's `options` and
  `images`), empty or not: PHP writes an empty one as `[]`, and the editor
  spreading its next text into `[]` loses it. One helper,
  `surveyTranslationsJson()`, wherever a survey leaves PHP - into the database,
  `surveyJson()`, the 409 conflict body, the participant routes. The tests
  assert on the raw text (`"options":{}`).
- **Ids that look like numbers**: PHP makes the array key `"12"` an integer and
  a map with the ids `"0"`, `"1"` a list. So a translation is built by walking
  the survey's own steps, questions, options and pictures and looking each id
  up - never by going through the maps that were sent (which also drops unknown
  ids and bounds the work) - `surveyMap(..., true)` takes a list where a map by
  id is expected, and a key read back from an array is cast to a string.
- **The placeholder rule**: which `{placeholders}` a key has is the code's,
  fixed by its stored English string. English reworded in the admin panel must
  keep exactly those (422 `placeholder_changed`); another language may leave one
  out but never add one (422 `unknown_placeholder`). `t()` fills them in one
  pass - a parameter's text is never scanned again - and `around()` cuts the
  stored string before filling. Both checks look only at what the placeholder
  expression matches, so brace text that is *not* one - `{ count }`, `{počet}`,
  `{count`, `{{count}}` - passed them and was shown to everybody: with every
  placeholder taken out no `{` or `}` may be left (422 `invalid_placeholder`,
  checked before the other two, in every language). Its sentence gives one of
  the key's own placeholders as the example. (This site's said, for a key with
  none, that its strings can hold no brace - an example it does not have,
  "like {count}", only led to the next refusal; the library's sentence says
  "like {count}" there again - an open point for the library.)
- **A translation may leave a placeholder out, so `around()` may find no place
  to cut**: the page then drew the marked-up value after a sentence that does
  not name it (or after a key). Its third answer says whether the cut was
  made; all three callers (the hero's step line, the language note, "signed in
  as") draw the value only then.
- **Languages the migrations write strings for cannot be deleted**
  (`TRANSLATION_SEEDED_LANGUAGES`, 409 `seeded_language`): the next migration
  with strings would fail on the missing language, and a failed migration
  closes the whole site on a host with no shell. They can be switched off.
- **`tests/api/translations.test.php` deletes every key first** - the site's
  and the library's - and works on keys of its own (`test.hello`...), so it
  does not change with every string the site gains; what the migrations leave
  is `tests/unit/translations.test.php`'s, and 010 on a database shaped as an
  installed site's is `tests/unit/strings_through_the_library.test.php`'s.
- **The bundle's 304 carries `ETag` and `Cache-Control: no-cache`** - both are
  set before the 304 branch, or it would go out as the default `no-store`. The
  tag comes back as whatever compressed the answer made of it: `W/"…"` (a
  proxy, Cloudflare) or `"…-gzip"` / `-br` / `-zstd` (Apache's mod_deflate and
  mod_brotli, which an `.htaccess` cannot tell otherwise). The library's
  `ETag::notModified()` takes both off before it compares, or the 304 is
  never answered behind such a server.
- **A check and a write with nothing held between them** is passed by two
  requests at once (READ COMMITTED): the twenty-language cap was a count and
  an insert; a language's delete was one `DELETE … WHERE NOT EXISTS (a survey
  uses it)` while a survey's save read the languages before its transaction.
  Now the library's `createLanguage()` takes `LOCK TABLE languages IN SHARE
  ROW EXCLUSIVE MODE` first, a survey's save holds its languages' rows
  `FOR SHARE` (`surveyLanguagesLock()`), and the library's `deleteLanguage()`
  is statements of their own - `FOR UPDATE` on the row, then this site's count
  (`SurveyLanguageUsage::refuseDelete()`), then the delete. **Separate, on
  purpose**: a single statement that had to wait goes on with what it saw
  before the wait.
- **Writes in the order they were sent deadlock**: two saves of the same two
  strings, typed in opposite order, each held a row the other needed, and the
  loser was told the database is unreachable (every `PDOException` is a 503).
  The library's save sorts its changes by key, then language (`strcmp` -
  `<=>` compares `"10"` and `"9"` as numbers).
- **A test of a lock must fail without the lock.** Holding a row from a second
  connection and expecting a lock timeout also passed with the old
  one-statement delete (it waits on the row just the same). The tests send the
  request to the real server without waiting for it (`begin_call()` in
  `tests/lib.php`, any headers - a token, a visitor key, none; the files'
  `begin_as()` wraps it), hold the other side from a second connection
  (`somebody_else()`), see it wait (`pg_stat_activity`), commit, and assert
  what is answered *after* - always ask for `answer` before the next request:
  the test server answers one at a time, so two HTTP requests never race;
  one side is always a transaction the test holds.
- **Every request of a person waits on a lock held on their `users` row**:
  `usersSeen()` is an `INSERT … ON CONFLICT DO UPDATE`, which locks the row it
  meets even when its `WHERE` then updates nothing. A test that held the
  person's row `FOR SHARE` saw the move at sign-in wait - in `usersSeen()`,
  not at the move's own `FOR UPDATE` - and stayed green with that lock taken
  out. Hold what the real other side holds: an answer being inserted holds
  the row `FOR KEY SHARE` (its foreign key), which the upsert passes and
  `FOR UPDATE` does not.
- **A visitor's row can go while its answers are on their way** - a move in
  another tab, the clean-up. The insert then failed on its foreign key, and
  every `PDOException` is answered 503 "database unavailable". Every send holds
  its taker's row first (`visitorHold()`, `FOR SHARE`, with the condition that
  it still has its key): a row that went is 401 `visitor_unknown`, which the
  browser knows what to do with.
- **A limit is a row, or it is no limit**: two new visitors counted with a
  `SELECT` and then written both pass at the edge. The counters are one
  upsert each (`visitorCounterHit()`), held to the end of the transaction,
  taken in one order (the address's, then everybody's); the count of visitors
  with a key comes after everybody's counter is held, so it sees one made
  meanwhile.
- **Who a request is was decided by whether a token was there as it left**
  (the analyzer's interceptor): a person whose refresh was refused sent their
  answers with no token - as nobody, which with visitors welcome made a
  visitor no browser held. A request says whom it is for as it is made
  (`ISSUED_AS`, set by `ApiService`); a person's with no token is never sent
  (a local 401 `sign_in_required`). A new participant route in `ApiService`
  takes `_asTaker()`; one only a person may call, `issuedAs('person')`.
- **The key is kept on `sign_in_required`**, forgotten only on
  `visitor_unknown` (compare-and-delete: only the key that was sent). Forgot
  it on the switch, and the visitor who signed in later had nothing moved.
  And `noteLoginRequired()` only for `/api/surveys`: the preview's admin calls
  answer nobody 401 `sign_in_required` whatever the switch.
- **The visitor's drafts must be the person's before a page reads them**:
  the take page reads its draft when `taker` changes, and a component's
  effect may run before or after a root service's. So `boot()` adopts them
  before the first page, `VisitorKey`'s effect for a sign-in in another tab,
  and the take page adopts the one it is about to read itself
  (`adoptVisitorDraft()`) - else "carry on" was missing and the next
  keystroke wrote an empty person's draft that then won over the visitor's.
- **After the move, the pages must ask again** (`VisitorKey.moves`, and the
  key itself): `answeredAt` was the visitor's a moment ago. Without it the
  survey page offered a survey the visitor had answered, and answering it
  again as the person made the move "keep" the person's and drop the
  visitor's.
- **A sign-in leaves only after the sends on their way** (the library's
  `SavesInFlight`, which it took over from this site): a visitor's first
  answers bring the key in their answer; left before it, the browser never
  kept it and the move found nothing.
- **A `before()` that throws** used to skip the test file's clean-up: its
  `php -S` kept running, and `tests/run.php` waited for it for ever. The lib
  now reports it as a failure and stops the servers; if a run still hangs,
  look for a `php -S … router.php` whose parent is gone, stop it by its
  command line, and drop its `survey_test_` database
  (`php tests/tools/testdb.php drop NAME`).
- **Focus on something a change is about to draw**:
  `afterNextRender(() => ...focus(), { injector })`. With no zone a microtask
  runs before the render, and the element is not there yet. A rich text field
  makes its editable a moment later still: the editor looks again a few times
  (`_focusWhenDrawn`).
- **The pipes are impure on purpose**: the key is a constant, so a pure pipe
  would keep its first answer when the language changes.
- **Strings are kept in `Map`s** (and survey maps read with `Object.hasOwn`):
  `has('constructor')` must be false, and an id may be any word.
- **`?lang=` is the site's, `?language=` the preview's**: `init()` takes
  `?lang=` at page load, makes it the tab's language (sessionStorage) and
  strips it from the address; the preview reads `?language=` as a route input
  for the survey's own texts only - it may name a hidden language. The editor
  reads `?language=` too, for the tab to open (the preview's "Back to the
  editor" sends it); an address without it leaves the tab alone - the header's
  link to `#problems` must not throw a translator off their tab.
- **"Save mine over it" sent whatever the page had loaded**: an author's tab
  left open, one typo fixed, and a translator's saved work was replaced by the
  translations of an old revision. "Mine" is what this page *changed* - what
  differs from `_server` - and nothing else: `mergeTranslations(base, mine,
  theirs, saved)`. It compares every place `mine` could hold words for, not only
  `translationPlaces()` (the editor draws a field where the original is blank
  too). `_server` becomes `theirs` when a conflict is settled, or a second
  conflict in a row would take their earlier texts for changes made here.
  One exception, for `saved: 'mine'` ("Save mine over it", which saves my
  structure): the texts of what their version removed or reworded are mine
  too - taken as theirs, my question came back with no Slovak, or my English
  with their Slovak of their rewording - but a translation is never replaced
  by a gap.
- **What kind of change is unsaved was remembered by the page**
  (`SurveyEditing`, per page): left for the preview and entered again, the
  editor had forgotten an unsaved change to the survey, offered "keep my
  Slovak texts" and dropped it. It is worked out from the documents now
  (`AdminStore.unsavedChanges()`, the survey against `_server`) - state that
  must outlive the page is in the store, or is derived.
- **"Save mine over it" was offered where the server refuses it**: the two
  versions written in different languages, both with translations. Sent, the
  422 replaced the conflict with "Try again now", which sends it again, and
  "Take the saved version" was gone. The editor asks the server's rule first
  (`mineWouldBeRefused()`) and offers only what the server takes.
- **Stored `status: 'open'` is not "open"**: a survey whose last day is over
  is closed for everybody, and the header says so (`currentStatus()`). The
  notices and tags that said what its readers see went by the stored status
  and spoke of readers there are none of; everything that says "open" to an
  editor goes by `currentStatus()` (`problemsHeading()` too).
- **A `canDeactivate` guard under the admin layout gets `null` for the page**:
  once the layout has taken its page away (session ended), or never drew it
  (no role), the route is still the active one and the next navigation runs
  the guard with no component. `page.canLeave()` threw, and every link of that
  state was dead - `page?.canLeave() ?? true` (the library's
  `anotokiUnsavedChangesGuard` keeps it).
- **The preview with no `?language=` followed the page's language**: an editor
  who reads the site in Slovak previewed the main tab and got the Slovak
  translation text by text - and "Back to the editor" opened the Slovak tab.
  With no `?language=` it shows the survey as it is written.
- **A copy of a survey carried the original's translated titles** under its
  own "Copy of …": nothing marked them as stale, the tab read n / n, and the
  copy would open to Slovak readers under the old name. `copySurvey()` empties
  them. (A text reworded after it was translated stays translated - the site
  does not track that; this is the one place the code itself changes a text.)
- **A rule the editor keeps is not a reason for the server to refuse more than
  it must**: "the language changes only while there are no translations" was
  refused when either side had one, so a save that removed the last
  translation *and* changed the language - what the editor sends after a
  failed save - could never get through, nor any save after it.
- **A refusal is written for whoever will read it**: a body with no `language`
  comes only from an editor page left open across the release, where "Try
  again" gets the same answer. The sentence ends with what that person can
  do (copy what you changed, reload).
- **On the Translations page** (the library's now - what this site paid for,
  and the library kept):
  - a cell typed *while a save or an import is out* is held whatever it says
    (`withEdit(..., keep)`): "typed back to what is stored" cannot be told
    until the answer brings what is stored, and the answer would wipe it;
  - `visible` reads the edits with `untracked()`: tracked, a row found only by
    its unsaved words left the list - with the cursor in it - at the keystroke
    that changed them;
  - a refusal about a language or key that is gone cannot be fixed in a box:
    the page reads the grid again and `remainingEdits()` drops what was typed
    for it;
  - a form a language never takes (`formUsed()`) is neither missing nor
    counted, or German could never be complete;
  - a box holding nothing to see (a zero-width space, spaces) over no string
    is no change (`blankText()`, the twin of `Text::blank()`) - it was "1 string
    changed" and "The string is saved." for a save with nothing to write. Over
    a string it is a change: the server deletes the row, or refuses it in
    English, and the fresh grid says so;
  - a failed save's "Nothing was saved." goes at the next keystroke (the next
    try has begun), or it stood in the bar over everything typed after it.
- **Prettier here re-inserts whitespace in templates**
  (`htmlWhitespaceSensitivity: 'ignore'`), so "no space before this dot"
  cannot be written in the markup: the separator of the plural label is the
  numbers' own `::before`, tied to their first word by a no-break space.
- **The top bar folds at 760 px** (`PHONE_BAR_MAX`, the family's bar's
  `phoneMax` - it makes its own media queries of it): up to it the brand is the mark and the site's name, then the
  language, the theme and the menu button that holds the links and the
  person's menu; from 961 px the person's name is beside the initial. Before
  the fold the words beside the mark went at three different widths and
  "Sign in" was squeezed at 390. A new state of the bar is measured at its
  phone widths (`expectBar`), not assumed - and at 360 px, the narrowest.
  In the admin panel the wordmark is longer: "anotoki survey · admin panel"
  from 961 px; up to 960 (`NARROW_BAR_MAX`, the bar's `shortBrandMax`) and on
  a phone "survey" with "admin panel" small under it - in one row the bar
  overflowed at 761 and at 360. Measured at 360, 390, 761, 960 and 961.
  The family's bar is sticky inside its host: `app-top-bar` is
  `display: contents`, or the bar would stick inside the wrapper and scroll
  away with it.
- **The kit's button reads none of the old kit's `--btn-*` properties**: a
  red ghost button (Delete this survey, an answer, a translation) set
  `--btn-fg` and lost its red without a word when the kit came. The kit's
  button has no danger ghost; its colours are on its host, so the page's own
  class sets `color` (and `:hover` its background) - never the kit's private
  `--_fg`. A style the page gives a kit piece is checked on the page, not
  assumed.
- **Every anotoki site calls its admin area the admin panel**: "Admin panel"
  ("Administrátorský panel") in the person's menu (`anotoki.topbar.admin`),
  `brand.adminPanel` after the wordmark, "<page> · Admin panel · anotoki
  survey" in the tab (`core/title.strategy.ts`). The wordmark's spans are
  laid out by CSS `gap` (the kit puts a space between them for a screen
  reader and copied text): a test reads them one by one.
- **A sign-in that came back without one goes to the screen that says why**,
  never to the IAM again (the IAM refused, `access_denied`, or the person
  went back: sent straight back, the browser would go round for ever). The
  library's guards send the browser to `/auth/callback`, where its screen
  shows (`<anotoki-sign-in-failure>`: Try again, Back) - nothing of the page (a
  survey) is made or asked for; `signInFailureGuard` does the same for the
  pages the library's guards let through (a visitor's, and those of somebody
  still signed in from before). A sign-in that cannot even start - the browser
  refuses the site's storage, where the sign-in in progress is kept
  (`storage_unavailable`) - is a `signInFailure` too: the library's
  `signIn()` answers false and sets it, the guard goes to the screen, and a
  Sign in button does through `signInOrShowWhy()` - it was a blank page, the
  first navigation cancelled with nothing said. Its words are the site's
  (`anotoki.signIn.*`, migration 012): an owner's rewording shows there. While
  the site cannot run and the server said why (`SiteStatus.blocked()`) the
  guards let every page through and send nobody anywhere: the family's page
  is drawn instead of each. While it could not even ask (`status` not
  `ready`, nothing blocked) nothing is let through: the load error card is
  drawn.
- **A long tag in a row that scrolls sideways is cut off on a phone**: the
  editor's language tabs wrap from 560 px down ("7 / 8 shown in English").
- **A guard that reads text reads less than it seems**: the key scan took a
  key for used whichever pipe asked for it, could not see a key put together
  from a prefix, skipped backtick literals, and looked for `innerHTML` and
  `translate` on one line. Each is closed now (the rules above); what it still
  cannot read - a key that reaches the pipe through a variable or a table - is
  said in its header, and the browser check's console warning is the net for
  that.
- **A test that passes with the fix taken out proves nothing.** Found that
  way in the review: a command's exit code derived from its own output, a
  migration's gate never compared with the keys its file writes, a race spec
  with only one request pending, an "inherited name" assertion
  that held with or without `Object.hasOwn`, the seeded strings never meeting
  the check a save makes. Take the fix out once and watch the named test go
  red - one fix at a time: two taken out together can hide each other (a
  choice on the page left uncleared did not show while the page's choice was
  out of the ranking as well).
- **The answer to an earlier save turned the page back**: the IAM's client (the
  SDK then, the library's now) puts each
  answer of `savePreferences()` in `user()` - and tells the listeners - before
  the promise resolves, and the theme's effect and the language's watcher
  adopt a change of the account's value. Two quick choices showed the first
  one again when its answer came. While a save made here is out (the
  library's ThemeService and TranslationService keep that rule now) neither
  adopts; the next choice waits for it, and only the latest is saved.
- **A kit word asked for by its short name is a key of the site's to the
  scan**: the kit's own words are `topbar.roleAdmin` to `AnotokiWords`, and a
  literal like that in the site's code reads to the key scan as a site key no
  migration writes. The site asks for a kit word by the library's whole key,
  `i18n.t('anotoki.topbar.roleAdmin')` - one string either way, the
  database's.
- **The library writes a plural's number the language's way**: `{count}` is
  `Intl.NumberFormat`'s - "1 000" in Slovak, with a no-break space (U+00A0) -
  so a spec that compares a worded number writes `'1 000'`.
- **The kit's class names are its own since 0.3.0** (`.anotoki-<piece>__<part>`,
  `anotoki-<piece>--<state>`): a spec or the browser check that read `.row`,
  `.heading`, `.toast .message` read nothing and passed or failed for the
  wrong reason - read the library's templates
  (`frontend/node_modules/@anotoki/lib/fesm2022`) before writing a selector.
- **A spec's stand-in for AuthService must answer `preferences()`**: the
  theme (the top bar, `boot()`), the `localDate` pipe and every admin page's
  dates (`AdminDates`) read it while drawing, and a fake without it throws in
  an effect or a template. `preferences: () => null` is the site as before.
  The real AuthService needs the library's sign-in configured (it injects
  `AnotokiAuth`): a spec that makes it gives `provideTestAnotokiAuth()`
  (`@anotoki/lib/auth/testing`, its `config` pointed at `AuthService.bootConfig()`)
  - else "No provider for ANOTOKI_AUTH_CONFIG"; a spec of a page that reaches
  `AdminDates` stubs AuthService. The library's guards read `AnotokiAuth`
  itself, and need `ANOTOKI_AUTH_CONFIG` too, when a spec stubs both.
- **A pending migration closed the whole site, the sign-in with it**:
  `/api/auth/config` was 503 too, so the sign-in was never made and nobody -
  the ADMIN who had to apply it included - could sign in. While an update
  waits the auth config and the strings answer (`siteOpenWhileUpdating()`):
  without them the Migrations page's bar was keys. And the start never stops
  on it (`boot()` asks the status, then signs in as ever).
- **A projected `<router-outlet>` runs out of sight**: the family's gate
  shows its content inside an `@if`, but what a component projects is made by
  the parent whether it is shown or not - a bare outlet in `<anotoki-site-gate>`
  put the routed page in place behind the family's page, asking the API (503)
  and raising toasts, which are drawn over everything. The outlet goes in as
  the gate's `<ng-template anotokiSitePages>` (anotoki-lib 0.1.1, marked since
  0.2.0: an unmarked template draws nothing), which the gate makes only
  while it shows the pages; with 0.1.0 the site took the gate's decision
  again itself (`AppComponent.pagesOpen`, gone). `app.component.spec.ts`
  counts the pages made while the site is closed - an outlet given without
  the template turns it red.
- **The site found ready again ran a page for nothing**: the family's page
  marked the site ready and reloaded the page in the next breath, and the pages
  opened in between - for a visitor, past a guard that let them through only
  because the site was closed - asked the API and flashed. The site held its
  outlet then (`AppComponent.held`, `PAGES_CLOSED`); since anotoki-lib 0.2.0
  the family's page asks with `SiteStatus.checkForReload()`, whose answer the
  gate is never told - it stays shut until the reload - so the hold went with
  0.3.0. `app.component.spec.ts` proves it: the page asking again, and its
  Try again, find the site ready, and no page is made, the gate shut.
- **Answers sent as an update closed the site raised a toast over the
  family's page**: the 503 `update_pending` (or `not_set_up`) of a send is
  `siteClosed` (`send-failure.ts`) and says nothing - the family's page stands
  instead, the answers stay in the draft.
- **An open path opened everything under it**: the open paths had
  `/api/admin/migrations(/.*)?`, so `/api/admin/migrations/../../surveys` (or
  its escaped form) passed the gate and only the routes' not matching it kept
  it shut. Each entry is now exactly a route there is - the strings' by the
  library's `TranslationsRoutes::openPath()`, one segment and nothing after
  it; a route a later release of the library adds goes in by name
  (`siteOpenWhileUpdating()`, `api/migrations.php`;
  `tests/api/migrations.test.php` sends such addresses as written, with
  `CURLOPT_PATH_AS_IS` - curl tidies dot segments away otherwise).
- **While the site cannot run, a guard that sends somebody to the IAM loses
  the address**: the visitor never sees the calm page, and a first navigation
  the guard refuses leaves the bar on `/`, where the page reloads once the site
  runs. So the guards let every page through while `SiteStatus.blocked()` -
  nothing of a page is made then (above) - and the family's page has its own
  quiet Sign in, which comes back to the address (`AuthService.signIn()`'s
  default) - the Migrations page, for an ADMIN who signed in at its address.
- **The status request is nobody's**: the interceptor sends
  `/api/site-status` without a token or a key, like the auth config. Sent as a
  person's, a token that is gone made it fail unsent (a local 401), and the
  page said the site was out of reach.
- **The strings read while behind lack what the pending migration brings**:
  once an Apply leaves nothing to apply the Migrations page calls
  `onUpToDate` - `TranslationService.reload()` - or the new keys show as
  themselves until the next page load (a library key, `anotoki.*`, shows the
  library's own word meanwhile, never itself). The library's set runs after
  the site's: a release that brings both lists them under two headings, and
  names each file `set/name` once there are two sets.
- **The Apply's lock is never on `db()`**: under `php -S` that connection is
  pooled, and an advisory lock left by a request that died would outlive it.
  Whatever applies gives `surveyMigrator()` a connection of its own
  (`dbConnect()`): the Migrations routes' Apply, `setup.php`, `migration.php`,
  the tests' template; the lock goes with its connection. The gate's state is
  read on `db()` - reading only.
- **A refused connection takes seconds on Windows**: PostgreSQL out of reach
  (a port nobody listens on) is refused after about two seconds, twice a
  request (the gate's look, then the route's) - longer than `test_status()`'s
  two. A server whose database is out of reach is waited for at a page that
  asks nothing of it (`/index.html`).
- **No test asks an IAM whether sign-in is required**: anything that reaches
  `authLoginRequired()` (`/api/auth/config`) asks
  `{issuer}/api/public/applications/survey` and keeps the answer in
  `cache_dir`. Run with the development settings (`http://localhost:4300`,
  `storage/cache`), an in-process test asked the developer's own IAM and wrote
  into the running site's cache. Every test's IAM settings carry
  `application_file` (`test_iam()`, the in-process config, `good_iam()`;
  `test_application_file(true|false|null)` - null: no file, the IAM out of
  reach, "required"); only `tests/api/auth.test.php` asks, and only the
  stand-in IAM.
- **A test never writes a file into `migrations/survey/`**: the owner's
  running site reads that folder, and a stray file closes it. Tests (and the
  browser check's `sql()`) make a database "behind" by taking rows out of its
  `migrations` table; a failure part way through a file is a trigger that
  raises (`tests/api/migrations.test.php`).
- **A migration edited while it is still being written** is not applied again
  by the tests' template, which has seen it:
  `php tests/tools/testdb.php template --fresh` (not while tests are running -
  they copy the template). Never for a released migration: that one is not edited.
- **A checkout with CRLF line endings** (Windows, `core.autocrlf`): Prettier
  needs `--end-of-line crlf` to pass; `sed -i` strips the CRs - edit another
  way. A string in a migration stays on one line (a line break inside it would
  be a CRLF there), with `''` for an apostrophe and no `E''` or backslash
  escapes: the statement splitter knows `''` and nothing else of a string.
- **The sign-in's two screens are routes since anotoki-lib 0.5.0**:
  `@anotoki/lib/auth`'s `AuthCallbackComponent` and `SignInFailureComponent`
  load their screen as it is shown (`@anotoki/lib/auth/screens`, out of the
  first load). The site's route stays as it is; a spec that renders a screen
  and reads its markup at once imports it from `@anotoki/lib/auth/screens`
  (`auth.config.spec.ts`) - the other one draws nothing yet.
- **A restore's delete waits on nothing but itself**: the restore holds every
  restored table on its own connection, and a People delete hook that turns
  to `db()` there waits on those locks while the restore waits on the hook -
  no deadlock is seen, and PostgreSQL ends the restore after a minute. So
  `responsesDeleteOf()` refuses to run outside a transaction: on the restore's
  path `db()` is in none, and the restore fails at once with the reason. A
  hook that opened a transaction of its own on `db()` (`dbTx()`) would pass
  that guard and wait the minute: the library's contract - no transaction of
  the hook's own - is what keeps it out, and the restore test's time check
  what catches it.
- **The pages' error reports are counted in a file beside the log**
  (`storage/logs/client-errors.json`, the library's: keyed hashes, the hour's
  and the day's counts) - a test of the caps starts from a fresh one, and
  writes the day's counts into it to reach a budget without 500 requests.

## Checks before saying it is done

1. `cd backend && php tests/run.php` - all pass; add tests for new rules,
   routes and refusals (`tests/api/surveys.test.php` is the pattern; two
   requests at the same moment: `begin_call()` / `somebody_else()` in
   `tests/lib.php`, used by `tests/api/translations.test.php` and
   `tests/api/visitors.test.php`). A new or removed string: its migration,
   then `tests/unit/translations.test.php` is green again
   (`php tests/tools/testdb.php template --fresh` first, when the migration
   was edited after the template applied it). The PHP runner takes files:
   `php tests/run.php tests/unit/translations.test.php`.
2. `cd frontend && npm test && npm run build`, and
   `npx prettier --check "src/**/*.{ts,html,scss}"` (`--end-of-line crlf` on a
   CRLF checkout).
3. Anything a page shows: the `check-in-browser` skill (and look at the
   screenshots, light and dark, 390 px - the Slovak ones too: a longer word
   that no longer fits, a key where a word should be - and the states a change
   is about, which a walk through the happy path never draws: a save that
   failed, a session that ended over unsaved boxes, a conflict, an open survey
   with a text not translated, the site not set up or out of reach).
4. Review: the `survey-reviewer` agent, or this list -
   - [ ] no address kept in the clear - a person's or a visitor's: a keyed
         HMAC at most (`clientAddressKept()`), described as a pseudonym, never
         as unreadable; `CF-Connecting-IP` alone, pinned, believed only from a
         trusted proxy (`clientAddress()`, Cloudflare's ranges), no catch-all
         range taken; the origin secret passed to every reading of an address
         (`originSecret()`), never printed or logged;
   - [ ] a People delete hook (or a scrub hook) writes on the `$pdo` it is
         given and nowhere else - no audit entry or helper on the site's own
         connection - in the library's transaction, a null request taken (a
         restore does it again);
   - [ ] no route trusts anything but the token for who and what role (the
         library's `Identify` in front of its group); the System's routes
         ADMIN's alone; every admin change audited; no person's address kept;
   - [ ] the two sides of every rule still agree, sentences included;
   - [ ] new input is checked for type, length and count on the server;
   - [ ] HTML from users only through `richTextClean()`;
   - [ ] queries parameterised; no identifier from input;
   - [ ] no secret, token or machine path in anything git publishes;
   - [ ] components in three files; colours from tokens; works at 390 px;
   - [ ] nothing the site says to somebody taking a survey is written in a
         template or kept worded in state: a key, with its English and formal
         Slovak string in a migration; the admin panel English, in its templates;
   - [ ] no site string into `[innerHTML]`; no key built from anything open,
         nor from a prefix `dynamic-keys.ts` does not declare; a family asked
         for as a family, one string as one; a value `around()` marks up drawn
         only when it says the cut was made;
   - [ ] a text people read on a survey has its place in the translations, on
         both sides; maps of a translation leave PHP as objects;
   - [ ] blank means the same on both sides: `TEXT_SPACE` and `trim()`, never
         `\s` / `\p{Z}` in PHP; no PCRE result cast to a string unasked;
   - [ ] a check followed by a write holds a lock between them, in the
         transaction; rows are taken in one order;
   - [ ] nothing typed in the admin panel lives only in a component: a session
         that ends takes the page away without asking;
   - [ ] a failure is said where the person who caused it is looking, and a
         refusal says what they can do;
   - [ ] the theme, a date or a time, the language: the anotoki account's while
         somebody is signed in (`preferences`, `AdminDates`, `localDate`), saved
         to it only while it sends preferences, one save at a time;
   - [ ] the family's library is used, never copied or edited: the kit a piece
         at a time from its own entry point, the site's words through
         `core/translations.ts` and the library's routes, who may do what
         this site's own checks; a library word that speaks to the reader is
         formal Slovak in the database and in `FORMAL_SLOVAK`;
   - [ ] every new test fails with its fix taken out;
   - [ ] `docs/`, this skill, `CLAUDE.md`, `README.md`, `DEV.md` in step.
