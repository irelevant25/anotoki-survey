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
  api/index.php            the front controller: buildSurveyApp(), middleware (security headers ->
                           error handler -> setupGate -> routing); run unless SURVEY_NO_RUN
  api/bootstrap.php        what every entry point loads: settings, error handling (warnings throw,
                           display_errors off), the site's functions
  api/routes/              public.php (health, auth config, pictures, the strings of a language),
                           surveys.php (people - requireTaker), visitor.php (POST /api/visitor/move:
                           token and key), admin.php (/api/admin/..., EDITOR/ADMIN: surveys,
                           answers, pictures, languages, strings; ADMIN: the migrations)
  api/meddleware/          security.php, setup.php (503 not_set_up: settings, or a pending migration -
                           then update: true, and SETUP_GATE_OPEN_WHILE_BEHIND still answered: the
                           auth config, the strings, /api/admin/migrations[/apply]),
                           auth.php (requireUser, requireRole, requireTaker, currentUser): every
                           route but the public ones takes one - a visitor's key makes somebody
                           a visitor only in requireTaker (the three survey routes); the one
                           other reader is POST /api/visitor/move, which needs a token as well
                           and only hands the key in; nothing of a survey
                           without a token while sign-in is required, but its pictures (an
                           <img> sends none; UUID addresses)
  api/auth.php             the token -> SiteUser {id, name, email, roles, visitor}; users row upkeep;
                           authSentCredentials() (only Bearer claims to be somebody);
                           authLoginRequired() (the IAM's "Sign-in required", relayed by
                           /api/auth/config with visitorDays); isThisComputer() (setup.php and
                           the health details)
  api/visitors.php         visitors (the switch off): visitorFind / visitorMake (in the answers'
                           transaction, after the limits - counters that are rows) / visitorHold /
                           visitorSweep (+ visitorSweepSoon: after the answer, hourly) /
                           visitorsForgetEmpty / visitorMoveInto
  api/client_address.php   the address the limits count: REMOTE_ADDR unless a trusted proxy's
                           header says otherwise; IPv6 by its /64
  api/helpers.php          JSON in and out, and the text helpers: TEXT_SPACE (what the browser's trim()
                           takes for a space), textTrim(), textBlank() (nothing in it to see), textClean();
                           afterAnswerAdd() / afterAnswerRun() (work after the answer: the clean-up)
  api/surveys.php          survey rows <-> the frontend's Survey; summaries; create/save (revision)/
                           status/delete; surveyLanguagesLock() (a save holds its languages);
                           SURVEY_TAKING_ANSWERS_SQL
  api/responses.php        submit (once, while open, every answer checked; the language it was read in),
                           list, delete
  api/images.php           store (checked by its bytes), find, meta, clean-up
  api/survey_rules.php     surveyFromBody() (shape + cleaning, the translations too), surveyProblems(),
                           surveyTranslationGaps(), surveyTranslationsJson(), answer rules
  api/translations.php     the site's own words: the languages (languageCreate / languageDelete take
                           their locks), the bundle a page starts with (translationBundle), the admin
                           grid, translationsCheck() - every save, import and the command line go
                           through it
  api/rich_text.php        richTextClean(): the editor's HTML and nothing else
  api/migration_runner.php the family's engine (never changed here); api/database_update.php: one
                           update at a time (databaseUpdateLocked() - the advisory lock setup.php,
                           migration.php and the Apply take), databaseStatus(), databaseApplyUpdate()
  api/anotoki_iam.php      the IAM's PHP SDK, vendored byte for byte (sdk/php, v1.1.0): the
                           verifier and anotoki_iam_login_required() - never a fetch of our own
  config/config.php        database.local.php + iam.local.php; visitors.local.php (optional, by hand:
                           VISITOR_DEFAULTS, visitorSettings(); visitorSettingsFile() - a file that
                           does not parse is logged, the defaults hold); SURVEY_TEST_CONFIG for the tests
  migrations/survey/       the schema - and the site's strings (002 the tables and the two languages,
                           003 every key with its English and Slovak string: the pattern for the next;
                           006 the visitors: visitor_ids, users.visitor_key_hash, visitor_counters;
                           008 the toasts of a choice the anotoki account did not take)
  setup.php                the installer (this computer: nonce, re-runnable; a host: token, lock, self-delete)
  router.php               php -S behaving like the hosting's Apache (+ the built app)
  translations.php         command line only, never uploaded: --status (the frontend's keys against the
                           database), --export / --import a language as flat JSON
  tools/build.php          the upload -> ../dist/ (an allow-list: a new file beside setup.php is left out)
  tools/translation_keys.php   the scan that finds the keys the frontend uses - and fails a key asked for
                           the wrong way, one put together from an undeclared prefix, innerHTML given a
                           string - and a language as a file; for translations.php and the tests
  tests/                   run.php, lib.php, unit/, api/, tools/ (testdb, testenv, fake-iam)
frontend/src/app/
  core/auth/               AuthService (IAM SDK in signals; status: loading/ready/not-set-up/error;
                           needsUpdate - the auth config's update: true - and onlyMigrations for an
                           ADMIN, databaseUpdated(); loginRequired - its loginRequired, true
                           unless false - visitorDays, visitorsWelcome (both needed), visiting,
                           taker {id, visitor}, noteLoginRequired(); MIGRATIONS_PATH; signIn()
                           waits for SavesInFlight, answers false and sets signInFailure when it
                           cannot start), authInterceptor (who a request is: ISSUED_AS - a
                           person's with the token or never sent, a visitor's with the key to
                           /api/surveys), visitor-key.ts (VisitorKey: the key in localStorage,
                           the move after a sign-in, moves / moved / lost), saves-in-flight.ts,
                           signInGuard (canActivate on /admin and the preview) and
                           takeSurveysGuard (canActivateChild on the participant layout: anybody
                           while visitors are welcome), sign-in-failure.ts (the toast that says
                           why; signInOrSayWhy() for a Sign in button), the vendored SDK
                           (anotoki-auth.mjs + .d.ts v1.2.0); preferences (the anotoki account's
                           theme, date order and clock - null while nobody is signed in or the IAM
                           sends none) and savePreferences() (the SDK's, for every anotoki site)
  core/api/api.service.ts  one method a route, each marked ISSUED_AS person / visitor as it is made;
                           ApiError {status, code, message, body, retryAfter}
  core/boot.ts             boot(): the theme, the sign-in (VisitorKey made before the first await;
                           a visitor's drafts adopted right after a sign-in), then the language and
                           its strings, then BOOTED - the app initializer, and the load error
                           page's "Try again"
  core/i18n/               TranslationService (language, effectiveLanguage, t / plural / around / has,
                           setLanguage - the chooser's, saved to the account too -, init, reload,
                           noteAddress; the account's language over the device's choice), the
                           translate / translatePlural / localDate (the account's date order) pipes,
                           error-text.ts (a failed request's key), answer-words.ts (a
                           rule or a problem in the reader's language), dynamic-keys.ts (keys put
                           together at run time - the backend's scan reads it)
  core/theme/              ThemeService: the account's theme signed in (adopted, and saved from the
                           bar's toggle), the device's signed out; the theme shown last in
                           localStorage for public/theme-boot.js
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
  core/admin/localization-drafts.service.ts   LocalizationDrafts: what is typed on the Translations and
                           Languages pages and not saved - outside the pages, mirrored to the tab's
                           sessionStorage, let go only when another person signs in
  core/admin/admin-dates.service.ts   AdminDates: core/util/dates.ts bound to the account's date order
                           and clock - what every admin page writes its dates with
                           (`formatDateTime = inject(AdminDates).formatDateTime`)
  core/survey/             the model and every rule (pure TS, unit-tested); localize.ts: a survey's
                           translations (translationGaps, localizedSurvey, pruneTranslations, the
                           writers, mergeTranslations for a conflict); drafts.ts (by survey and
                           taker - VISITOR_SLOT for a visitor; adoptVisitorDraft(s) at a sign-in)
  core/images/             prepareImage (browser-side), ImageUploader
  core/testing/            for the unit tests only: example data, provideTestTranslations(),
                           answersOf() (a person's answers, or a visitor's)
  layouts/                 top-bar (the anotoki family's bar: brand, links, language, theme, the person's
                           menu - on a phone one menu button; docs/architecture.md "The top bar"),
                           participant ("You are not signed in" where the page would be - for a
                           visitor only on the preview; the toasts of the move and of a lost
                           visit), admin
                           (English; "You are signed out" for a session that ended in place, "You
                           are not signed in" for a sign-in that came back without one or could
                           not start, the no-access card for somebody signed in without a role)
  boot/                    not-set-up (+ for a signed-in ADMIN while only a migration waits, an
                           English block linking the Migrations page), load-error (its "Try again"
                           also opens the page that was asked for): drawn instead of the site
                           (app.component.ts decides - while behind, the Migrations page alone for
                           an ADMIN); kept-word.ts (the cached string, or the English written in
                           the page)
  pages/participant/       survey-home, take-survey (+ question-block, survey-hero, send-failure.ts,
                           shown-language.ts), visitor-notice (what a visitor is told, with Sign in)
  pages/admin/             surveys-list, survey-editor (+ parts, SurveyEditing, the translation mode:
                           editor-languages, translated-text, translating.ts; ?language= opens a tab),
                           survey-results, response-view, response-page (a visitor everywhere
                           there: "Visitor N", "Not signed in" where a person's address is -
                           Person.visitor), survey-header, localization/
                           (translations: the strings' grid, translation-grid.ts its pure half -
                           blankText(), textBlank()'s twin; languages; unsaved-changes.guard.ts),
                           migrations (ADMIN: the IAM's page - Pending, Applied, Apply pending)
  ui/                      the IAM's UI kit + rich-text-editor (TipTap), drawer, lightbox, survey-image,
                           language-switcher (the chooser in the top bar)
```

## Rules

- **Signed in, every page - or a visitor while the IAM says so**: somebody
  not signed in goes to the IAM before anything of a page is drawn
  (`signInGuard`; on the pages people take surveys on `takeSurveysGuard`,
  which lets them through while `visitorsWelcome`) and comes back to it. The
  admin panel and the editor's preview sign in whatever the switch (the
  preview has `signInGuard` of its own, and the layout draws its card there
  for anybody not signed in). Every route of the site is `requireUser()` or `requireRole()` but the
  public ones and the three survey routes, which are `requireTaker()`: the
  person of a token; else, while the IAM says sign-in is required, 401; else
  the visitor of `X-Visitor-Key`; else nobody (who reads the open surveys, and
  whose kept answers make a visitor). No route of a survey answers without a
  token while sign-in is required, but the pictures' (`/api/images/...`: an
  `<img>` sends no token, and their addresses are random UUIDs -
  `docs/decisions.md`). Only the boot pages draw without a sign-in. A new page
  goes under one of the two layouts (their guard), a new route under
  `requireUser()` - `requireTaker()` only for what a visitor must reach, and
  then it reads and writes `currentUser()`'s own rows and nobody else's.
- **A visitor** (`api/visitors.php`): a `users` row with a negative id, no
  name, no roles; the key the server made, sent once in a response header,
  only its hash stored, never logged, in a body or an address. Made only in
  the transaction that keeps its first answers, after the limits; a write for
  any taker holds the taker's row first (`visitorHold()`); ended (key cleared)
  after `keep_days` unseen, answers kept as "Visitor N"; deleted only with no
  answers left. `signedInUser()` treats a visitor as nobody.
- **Who**: only a verified IAM token says who a request is (a visitor's key
  aside, above: `requireTaker()` only), and only an
  `Authorization: Bearer` header claims to be somebody: a bad or empty one is
  401 `invalid_token` (never "nobody", never a visitor), another scheme is ignored. Roles from the token
  (`anotoki_iam_roles`): MEMBER - every account's - is an ordinary person and
  nothing asks for it; `ROLES_STAFF` = ADMIN, EDITOR for `/api/admin`;
  ADMIN alone for the three deletes (a survey, somebody's answers, a
  language) and the migrations (the family's split: applying database
  updates is ADMIN's). The frontend hides; the server refuses.
- **A database behind the code closes the site, but not to the ADMIN who
  applies it**: the setup gate's "migration pending" check skips exactly
  `SETUP_GATE_OPEN_WHILE_BEHIND` (never the "settings missing" one); a new
  route that must work then goes there, and nothing that writes the site's
  data does. The Apply runs on a connection of its own under
  `databaseUpdateLocked()`; anything else that applies migrations takes the
  same lock.
- **Both sides say the same**: `answer-rules.ts` ↔ `answerProblem()` /
  `answerClean()`; `survey-problems.ts` ↔ `surveyProblems()` (same sentences,
  same order, the translations' too); `localize.ts` ↔ `surveyTranslationGaps()`
  / `surveyTranslationFromBody()`; `RESERVED_SLUGS` ↔ `SURVEY_RESERVED_SLUGS`;
  `about-you.ts` ↔ `SURVEY_GENDERS` / `SURVEY_AGES`, the CHECKs in migration 001
  and the tails of `aboutYou.gender.*` / `aboutYou.age.*`; `MAX_UPLOAD_BYTES` ↔
  `IMAGE_MAX_BYTES`; a language code (`languageCode()` ↔ `languageCodeOk()`), a
  `{placeholder}` (`PLACEHOLDER` ↔ `TRANSLATION_PLACEHOLDER`) and **what a
  space is**: the browser's `trim()` / `\s` ↔ `TEXT_SPACE` in `api/helpers.php`
  (`textTrim()`, `richTextPlain()`), character for character - never `\s` or
  `\p{Z}` in PHP for a survey's text or an answer, they take U+0085 and U+180E
  as well; and, for the site's strings only, **nothing to see**: `textBlank()`
  ↔ `blankText()` in `translation-grid.ts` (the page uses it only to tell
  whether a box is a change). Same sentences, too: in the frontend a rule or a problem of an
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
  (exit 1 when not clean).
- **Never a worded sentence in state.** A signal, a field initialiser or a
  module constant holds a key, a kind or an `ApiError`; the wording happens in
  a template (the pipes are impure on purpose) or in a `computed()` /
  `effect()` that calls the service - they run again when the language
  changes. Toasts and confirm dialogs are finished sentences when raised.
- **A site string is only ever text**: never into `[innerHTML]` (the scan fails
  an `innerHTML` whose value - on one line or several - has `translate` in it
  or calls `.t(` / `.plural(` / `.around(`); on its way into something drawn
  as HTML it goes through `escapeHtml()` (`aboutYouQuestions()`). Markup
  inside a sentence: `around()` and spans - and `around()` answers
  `[before, after, found]`: the marked-up value is drawn only inside
  `@if (x()[2])`, for a translation may leave the placeholder out. On the server a string has no
  brace that is not a `{placeholder}` (422 `invalid_placeholder`), and one
  with nothing in it to see is an empty one (`textBlank()`).
- **The admin panel is English**: literal words in the templates under
  `pages/admin` and `layouts/admin-layout`, no `translate` pipe there. The
  pieces both areas share (top bar, UI kit, toasts) read through
  `effectiveLanguage`, which is `en` under `/admin`.
- **The account's preferences** (the IAM's migration 015, SDK 1.2.0): signed
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
  any query; **who saved a string** is `currentUser($request)->id`, nothing else.
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
  `AdminStore`, the strings' cells and the languages' rows in
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
  `translationsCheck()` as it is.
- **Angular**: three files per component, OnPush, signals, `inject()`,
  inputs for route and query parameters, tokens from `styles.scss`, 390 px.

## Gotchas already paid for

- **JSONB reorders keys**: tests compare documents with `assert_json_same`.
- **PHP decodes `{}` to `[]`** (arrays mode): an answers map or content object
  that may be empty is written as `new stdClass()`.
- **bytea goes as `PDO::PARAM_LOB`** (as text it would have to be UTF-8) and
  comes back as a stream (`stream_get_contents`).
- **A unique violation inside a transaction aborts it**: turn it into an
  ApiError and let `dbTx()` roll back; do not query after it.
- **`requireRole` inside the admin group** reuses the group's person
  (`signedInUser()`): the token is checked once per request.
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
  a fresh load older than what is here is ignored. `LocalizationDrafts` copies
  the rule - and, because signing in again is a page load, mirrors the drafts
  to sessionStorage. Its `clear()` writes the storage at once: an `effect()`
  runs too late for a sign-out, which leaves the page in the same turn, and
  what was given up would be there for whoever comes back. Its `beforeunload`
  question is not asked while nobody is signed in and the tab's storage holds
  the drafts: the way on is the sign-in, which they survive - asked there, the
  browser's "Leave site?" met the person on the one trip the drafts are kept
  for. (The cost: closing that tab while signed out loses them unasked.)
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
- **The SDK finishes the callback in the app initializer**, before the router's
  first navigation; `/auth/callback` itself is only ever seen when opened by hand.
- **`ng serve`'s proxy keeps the Host header** (`changeOrigin: false`), so
  setup.php through :4700 is still "this computer".
- **The hosting**: `display_errors` on (switched off in bootstrap), no `.avif`
  MIME type (pictures go through PHP), mod_dir's 301 for a URL naming a folder
  (no route named like a folder under `api/` - so never a folder `translations`
  or `languages` there), Cloudflare caching by extension.
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
- **Every load of strings takes a turn, and the last turn wins** (`_turn`):
  the start, a choice, `reload()`, asking again. A choice takes its turn even
  when it needs no request (back to the language on the page), or the slower
  choice it was meant to cancel lands after it. The chooser counts its own
  choices for the same reason - an overtaken one answers false, which is no
  failure to toast. A spec of a race needs two loads really in flight; with
  one pending request the guards can be deleted and everything stays green.
- **The languages on offer come with every bundle, so every answer is settled
  against the list that came** (`_load()`), not only one in another language
  than was asked for: a cached bundle carries a stale list, and a language
  offered again reached a returning reader one visit late.
- **While the site cannot run, the cache is used as it is**: nobody is signed
  in then, so the token's wish is unknown, and comparing the cache's language
  with what the wishes settle on threw away a Slovak reader's strings exactly
  when they were all there was. The compare-and-remove is for a start that
  can ask the server.
- **Storage can refuse to be written**: `?lang=` is taken out of the address
  either way, and a choice must hold for the page - both are kept in memory
  first (`_tab`, `_chosen`) and read from there before storage.
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
  the key's own placeholders as the example - and, for a key with none, says
  its strings can hold no brace: an example it does not have ("like
  {count}") only led to the next refusal.
- **A translation may leave a placeholder out, so `around()` may find no place
  to cut**: the page then drew the marked-up value after a sentence that does
  not name it (or after a key). Its third answer says whether the cut was
  made; all three callers (the hero's step line, the language note, "signed in
  as") draw the value only then.
- **Languages the migrations write strings for cannot be deleted**
  (`TRANSLATION_SEEDED_LANGUAGES`, 409 `seeded_language`): the next migration
  with strings would fail on the missing language, and a failed migration
  closes the whole site on a host with no shell. They can be switched off.
- **`tests/api/translations.test.php` deletes the seeded keys first** and works
  on keys of its own (`test.hello`...), so it does not change with every string
  the site gains; what the migrations leave is `tests/unit/translations.test.php`'s.
- **The bundle's 304 carries `ETag` and `Cache-Control: no-cache`** - both are
  set before the 304 branch, or it would go out as the default `no-store`. The
  tag comes back as whatever compressed the answer made of it: `W/"…"` (a
  proxy, Cloudflare) or `"…-gzip"` / `-br` / `-zstd` (Apache's mod_deflate and
  mod_brotli, which an `.htaccess` cannot tell otherwise).
  `translationsNotModified()` takes both off before it compares, or the 304 is
  never answered behind such a server.
- **A check and a write with nothing held between them** is passed by two
  requests at once (READ COMMITTED): the twenty-language cap was a count and
  an insert; a language's delete was one `DELETE … WHERE NOT EXISTS (a survey
  uses it)` while a survey's save read the languages before its transaction.
  Now `languageCreate()` takes `LOCK TABLE languages IN SHARE ROW EXCLUSIVE
  MODE` first, a save holds its languages' rows `FOR SHARE`
  (`surveyLanguagesLock()`), and `languageDelete()` is three statements -
  `FOR UPDATE` on the row, the count, the delete. **Three, on purpose**: a
  single statement that had to wait goes on with what it saw before the wait.
- **Writes in the order they were sent deadlock**: two saves of the same two
  strings, typed in opposite order, each held a row the other needed, and the
  loser was told the database is unreachable (every `PDOException` is a 503).
  `translationsCheck()` sorts its changes by key, then language (`strcmp` -
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
- **A sign-in leaves only after the sends on their way** (`SavesInFlight`):
  a visitor's first answers bring the key in their answer; left before it,
  the browser never kept it and the move found nothing.
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
  state was dead - `page?.canLeave() ?? true`.
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
- **On the Translations page**:
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
    is no change (`blankText()`, the twin of `textBlank()`) - it was "1 string
    changed" and "The string is saved." for a save with nothing to write. Over
    a string it is a change: the server deletes the row, or refuses it in
    English, and the fresh grid says so;
  - a failed save's "Nothing was saved." goes at the next keystroke (the next
    try has begun), or it stood in the bar over everything typed after it.
- **Prettier here re-inserts whitespace in templates**
  (`htmlWhitespaceSensitivity: 'ignore'`), so "no space before this dot"
  cannot be written in the markup: the separator of the plural label is the
  numbers' own `::before`, tied to their first word by a no-break space.
- **The top bar folds at 760 px** (`PHONE_BAR_MAX`, and the same number in
  its styles): up to it the brand is the mark and the site's name, then the
  language, the theme and the menu button that holds the links and the
  person's menu; from 961 px the person's name is beside the initial. Before
  the fold the words beside the mark went at three different widths and
  "Sign in" was squeezed at 390. A new state of the bar is measured at its
  phone widths (`expectBar`), not assumed - and at 360 px, the narrowest.
  In the admin panel the wordmark is longer: "anotoki survey · admin panel"
  from 961 px; up to 960 (`NARROW_BAR_MAX`) and on a phone "survey" with
  "admin panel" small under it (`.is-short.has-panel`) - in one row the bar
  overflowed at 761 and at 360. Measured at 360, 390, 761, 960 and 961.
- **Every anotoki site calls its admin area the admin panel**: "Admin panel"
  ("Administrátorský panel") in the person's menu (`topbar.admin`),
  `brand.adminPanel` after the wordmark, "<page> · Admin panel · anotoki
  survey" in the tab (`core/title.strategy.ts`). The wordmark's spans are
  separated by CSS `gap`, not spaces: a test reads them one by one.
- **A sign-in that came back without one is let through** for the rest of
  that page load (`signInFailure` is never cleared): every page draws its
  signed-out card. The IAM refused (`access_denied`) or the person went back,
  and the guard sending the browser to the IAM again would go round for ever.
  `signInGuard` lets every navigation through while `signInFailure()` is set,
  and the layouts draw their signed-out card instead of the outlet - so
  nothing of the page (a survey) is made or asked for. A sign-in that cannot
  even start - the browser refuses the site's storage, where the SDK keeps
  the sign-in in progress (`storage_unavailable`) - is a `signInFailure` too:
  `AuthService.signIn()` answers false and sets it, and the guard (and the
  Sign in buttons) say why in a toast (`signIn.storageUnavailable`) - it was a
  blank page, the first navigation cancelled with nothing said. While the
  site cannot run (`status` not `ready`) the guard lets nothing through and
  sends nobody anywhere: the boot pages are drawn.
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
- **The answer to an earlier save turned the page back**: the SDK puts each
  answer of `savePreferences()` in `user()` - and tells the listeners - before
  the promise resolves, and the theme's effect and the language's watcher
  adopt a change of the account's value. Two quick choices showed the first
  one again when its answer came. While a save made here is out (`_saving`,
  `_savingLanguage`) neither adopts; the next choice waits for it, and only the
  latest is saved.
- **A spec's stand-in for AuthService must answer `preferences()`**: the
  theme (the top bar, `boot()`), the `localDate` pipe and every admin page's
  dates (`AdminDates`) read it while drawing, and a fake without it throws in
  an effect or a template. `preferences: () => null` is the site as before.
- **A pending migration closed the whole site, the sign-in with it**:
  `/api/auth/config` was 503 too, so the SDK was never made and nobody -
  the ADMIN who had to apply it included - could sign in. While only a
  migration waits the auth config answers (with `update: true`), the
  status is `ready` (the guard sends a visitor to the IAM as ever), and
  `AuthService.needsUpdate` makes `app.component.ts` draw "not set up yet"
  everywhere but the Migrations page of an ADMIN. The strings answer too:
  without them the Migrations page's bar was keys.
- **The strings read while behind lack what the pending migration brings**:
  after an Apply that applied anything the page calls
  `TranslationService.reload()`, or the new keys show as themselves until
  the next page load.
- **The Apply's lock is never on `db()`**: under `php -S` that connection is
  pooled, and an advisory lock left by a request that died would outlive it.
  `databaseApplyUpdate()` connects for itself; the lock goes with its
  connection.
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
   - [ ] no route trusts anything but the token for who and what role;
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
   - [ ] every new test fails with its fix taken out;
   - [ ] `docs/`, this skill, `CLAUDE.md`, `README.md`, `DEV.md` in step.
