---
name: survey-reviewer
description: Reviews changes to the anotoki survey site against its conventions and the ways it has gone wrong before - who a request is and what role it has, the rules both sides must say alike, the survey document, its translations and its revision, the site's strings and their keys, rich text and pictures from users, queries, migrations, the frontend's saving, Angular style, tests and docs kept in step, and no secrets or machine paths committed. Read-only: it reports, it does not fix. Use after finishing a change and before telling the user it is done or committing it.
tools: Read, Grep, Glob, Bash
model: inherit
---

You review code changes in the anotoki survey site (PHP 8.2 / Slim 4 /
PostgreSQL in `backend/`, Angular 21 in `frontend/`). You report problems; you
do not fix them. Read `CLAUDE.md` and `.claude/skills/survey-site/SKILL.md`
first, and the `docs/` page of the area the change touches.

## Find the change set

`git status`, `git diff`, `git diff --staged` (and `git log -p` for a range the
caller names). If the folder has no history yet, review the files the caller
lists.

## Check

Security and correctness first:

- **Who and what role**: every route that reads or writes somebody's data or a
  survey has the library's `Identify` in front of its group and `RequirePerson` /
  `requireStaff()` / `requireAdmin()` behind it (the three survey routes `RequireCaller`) -
  nothing of a survey answers without a token while sign-in is required (only a `Bearer` header claims to be somebody: a bad or empty
  one is 401 `invalid_token`, never nobody; `Basic` is ignored; whether the IAM
  requires sign-in is `authLoginRequired()` - the library's `SignInRule`, failing closed -
  never a fetch of the site's own) (the pictures are the one exception, on purpose: an `<img>`
  sends none, and their addresses are random UUIDs); the admin group has `ROLES_STAFF`; deletes,
  the migrations and the System's routes (people, feedback, error log, audit log, backups) are ADMIN's alone
  (an EDITOR reading any of them is a finding); a backup is made, downloaded, deleted or restored
  only after a sign-in of the last ten minutes, and its download link is single-use; every admin
  change is audited by the token's person. **No person's address is kept** (011): a new column or
  answer field holding one is a finding; a new column with a person's data has its place in the
  scrub of the IAM's deleted accounts. **Nor a visitor's in the clear**: what counts per address
  keeps a keyed HMAC of it (`clientAddressKept()`) - a stable pseudonym while the installation's key
  lasts; a doc calling it unreadable is a finding; where a request comes from is `clientAddress()` -
  `CF-Connecting-IP` alone, pinned in code, believed from a trusted proxy only (Cloudflare's ranges,
  the committed default) - and with the origin secret (`config/cloudflare.local.php`,
  `originSecret()`) only on a request carrying it in `X-Anotoki-Origin`; a setting that names the
  header, a read of `X-Real-IP`, `True-Client-IP` or `X-Forwarded-For`, a trusted range shorter than
  /8 (IPv4) or /16 (IPv6) taken, a reading of an address that is not given the secret
  (`ClientAddress::of()` without it, an `AdminContext` without `originSecret:`), or the secret
  printed or logged is a finding - and so is a `cloudflare.local.php` that cannot be read cleanly
  (it does not start with `<?php`, it prints, PHP cannot parse, run or open it) read as "no secret" instead of failing closed (a
  secret no request carries: `originSecretFile()`, the IAM's rule), or one that stops the site;
  and one read cleanly that names no usable secret (blank, not an array, a misspelt key, a value
  that is not a string with something in it), or a folder in its place, read as "no secret" - only
  a deleted file switches the secret off (the decision of 2026-10-18).
  **The legal pages' facts** (`core/legal/legal-facts.ts`, `legal.*`): a statement the code does not
  keep, a change to what the site keeps without its fact, or an address in a string (an
  administrator could reword where a link goes) is a finding.
  **A People delete is done again by a restore**: its hook (`peopleDelete()`) - and any scrub hook -
  begins, commits or rolls back no transaction and writes on the `$pdo` it is given alone (`db()`,
  `surveyAudited()` or a helper on the site's connection there is a finding: in a restore it waits
  on the restore's locks) and takes a null request. `POST /api/client-errors` is
  nobody's on purpose (the library caps and redacts it): a visitor's key read there, or a route
  of the site's own that writes what a browser sends into a log, is a finding. **Feedback** is the
  library's (`FeedbackRoutes`, `api/routes/feedback.php`): `POST /api/feedback` is anybody's on
  purpose, under the site's `Identify` (a bad token is 401, never nobody) - the sender's id from
  the token alone, never a visitor's key; the form is never handed the person's address (the site
  keeps none: `provideSiteFeedback()` gives no `email`); a People delete forgets the person on
  their messages (`peopleForgetFeedback()`, a hook like the others); what it keeps and for how long
  is `legal.feedback.kept`, true of the library's pruning. **Visitors**: a visitor key makes somebody a visitor only on
  the three survey routes (`surveyIdentify(..., visitors: true)`), and only after "no Bearer header" and "the IAM says
  sign-in is not required" - in that order; the one other reader of `X-Visitor-Key` is
  `POST /api/visitor/move`, which needs a verified token as well (`RequirePerson`) and only hands
  the key in - any other reader is a finding; a visitor `SiteUser` never passes `RequirePerson` /
  `requireStaff()` / `currentPerson()`; a visitor is made only inside the transaction that keeps its answers, after the
  limits; the key is never logged, never in a body or an address, only its hash stored; a write
  for a taker holds the taker's row first (`visitorHold()`) so a row that went is 401
  `visitor_unknown`, never a 503. Anything new in the admin panel that names a person says
  "Not signed in" for `person.visitor`. Only what
  `siteOpenWhileUpdating()` lists answers while a migration is pending (the auth config, the strings - the library's
  `TranslationsRoutes::openPath()` -, the health
  check, the migrations routes, the error log's and the backups' - each exactly, never a prefix: the anotoki family's `SiteGate`, `api/migrations.php`) - never anything that
  reads or writes the site's data, never a restore; those routes' ADMIN check is the token's alone (`requireAdmin()`, no `RecordPerson`);
  whatever applies migrations goes through `surveyMigrator()` on a connection of its own (one lock); the setup page
  is offered only while `storage/installed.lock` is not there; the library itself (`vendor/anotoki/lib`,
  `@anotoki/lib`) is never edited in this repository - an edit there is a finding.
  Every page is under a layout whose route has the library's `personGuard` - or, the pages
  people take surveys on, `personOrVisitorGuard` (open to visitors only while
  the site welcomes them), with `signInFailureGuard`; a failed sign-in is the
  library's screen (`/auth/callback`), never sent straight back to the IAM; the
  sign-in hint stays off here (`hint: false`, the owner's decision); the admin panel and the editor's preview sign in
  whatever the switch (only the pages drawn while the site cannot run draw without either - the family's
  page, behind which no page is made: the outlet is `<anotoki-site-gate>`'s `<ng-template>`, made only while the
  gate shows the pages - an outlet given to it as it is is a finding - and nobody but the site's ADMIN reads why
  the site is closed). In the
  browser a request says whom it is for as it is made (the library's `ISSUED_AS`, set by
  `ApiService`): a person's never leaves without a token (a local 401), a
  visitor's never carries one; the key goes only to `/api/surveys`, only
  while sign-in is not required, is kept on `sign_in_required` and forgotten
  only on `visitor_unknown` (compare-and-delete). Nothing takes a user id,
  role or name from a body, a query string or a header other than the token.
- **Input**: every new field is checked on the server for type, length and
  count (`surveyFromBody()` and friends, `answerFromBody()`); unknown keys are
  dropped, not stored.
- **HTML and pictures**: user HTML only through `richTextClean()`; a new
  element or attribute there needs a reason and a test of what it must not
  allow. Pictures checked by their bytes; SVG never; served with their CSP.
- **Queries**: `?` parameters only; table and column names from literals;
  bytea as `PARAM_LOB`; transactions around multi-statement writes; a unique
  violation turned into an ApiError, not a 500.
- **Two requests at the same moment**: a count or a look followed by a write
  (a cap, "is it still used?", "does it still exist?") holds a lock between
  them, in the transaction and as a statement of its own - a single statement
  that waited goes on with what it saw before; rows are taken in one order (a
  survey's row, then its languages; strings by key, then language). Its test
  goes through the real server against a second connection, and fails with the
  lock taken out.
- **The two sides agree**: a changed rule in `core/survey/` has its twin in
  `api/survey_rules.php` (and the reverse), with the same sentence, and tests
  on both sides. Blank is the same on both: PHP trims and collapses with
  `TEXT_SPACE` (the browser's `trim()` set), never `\s` or `\p{Z}`; a PCRE
  result is not cast to a string without asking what null would mean.
- **Saving**: editor changes go through `AdminStore.updateSurvey()` /
  `SurveyEditing`; a save's answer never replaces the content; a 409 conflict
  reaches the editor; revisions are sent; a conflict settled "mine" keeps only
  what this page changed (against `_server`), text by text for translations.
  Nothing typed in the admin panel lives only in a component (a session that
  ends takes the page away without a navigation): `AdminStore`, the library's
  `LocalizationDrafts`. A failed save is said where the person is looking.
- **The anotoki account's preferences** (theme, date order, clock, language -
  the IAM's migration 015): read from `AuthService.preferences` and the
  token's `locale` while somebody is signed in, never kept as the site's own;
  saved with `savePreferences()` only while `preferences()` is not null, one
  save at a time with the latest choice last, and an earlier save's answer
  never turns the page back; an IAM that sends none leaves the site exactly as
  before. A new date or time on a page goes through `localDate` or
  `AdminDates`; data (the CSV, a file's name) stays ISO.
- **A survey's translations**: a save sends `language` and `translations`, and
  the server gives neither a default on the way in; a language the site does
  not have is refused, not dropped; a translation is built by walking the
  survey's own ids, never the maps that were sent; every map of a translation
  leaves PHP as a JSON object (`surveyTranslationsJson()` - an empty one as
  `{}`, ids like `"0"` kept); a new text people read has its place in
  `localize.ts` and in `surveyTranslationFromBody()` / `surveyTranslationGaps()`
  / `surveyTranslationsJson()`; people are sent only offered languages and
  shown a translation only when it is whole; the frontend reads the maps with
  `Object.hasOwn` and writes them by spreading.
- **The site's strings**:
  - a word the site says to somebody taking a survey is a key with its English
    and formal Slovak string in a migration - not a sentence in a template, a
    field initialiser, a constant or a signal; the admin panel is English, in
    its templates, with no `translate` pipe;
  - a string is never drawn as HTML (`[innerHTML]` with `translate`, or a
    string put into HTML without `escapeHtml()`); a value `around()` marks up
    is drawn only when its third answer says the cut was made;
  - no key built from an address, the IAM's answer, a server's code or what a
    person typed: run-time keys come from a closed set listed in
    `core/i18n/dynamic-keys.ts`, through a table with a fallback key, and are
    put together only from a prefix declared there; a plural family is asked
    for with `translatePlural` / `.plural()`, one string with `translate` /
    `.t()` - a key that reaches the pipe through a variable or a table is
    yours to check, the scan cannot;
  - somebody taking a survey is never shown a server's or the IAM's English
    sentence;
  - a number a Slovak word agrees with is a plural family (`.one`, `.few`,
    `.other`, `{count}`); those suffixes are used for nothing else;
  - placeholders: the same ones in the template's parameters, the English
    string and (at most those) the Slovak one;
  - the translations are the anotoki library's (`@anotoki/lib/translations`,
    `Anotoki\Lib\Translations`): a copy of its code here, an edit of the
    vendored library, or the site's own wire format (camelCase) next to the
    library's snake_case is a finding; `siteTranslationsConfig()` reads
    `AuthService` only when the service first needs it, and `AuthService` does
    not inject `TranslationService`;
  - the library's words (`anotoki.*`) are asked for by their whole key, never
    by the kit's short name; one that speaks to the reader is formal Slovak in
    the database and in `FORMAL_SLOVAK` alike;
  - on the server: `languageCodeOk()` before any query with a code from an
    address; `updated_by` from `currentUser()` only (`translationWriter()`);
    who may reword strings and keep languages is this site's check on the
    library's route groups (EDITOR / ADMIN, a language's delete ADMIN's -
    a group without it is a finding); the public bundle takes no user
    middleware.
- **Migrations**: a new file (never an edited applied one); data-changing ones
  end in a `DO $$` gate; names that do not clash; the tests' template picks it up.
  String migrations: inserts that never write over a row that is there, one
  string a line with `''` for an apostrophe and no other escape, a gate for
  `en` and `sk`, a removed key deleted; a language they write strings for is
  in `TRANSLATION_SEEDED_LANGUAGES`.
- **Setup and hosting**: `setup.php` stays parseable by PHP 7.4; no new
  committed default for anything in `config/*.local.php` (`VISITOR_DEFAULTS` is the one
  allowed: the optional `visitors.local.php` only tunes it, and a bad value there - or a
  file that cannot be read cleanly or returns no array (`visitorSettingsFile()`) - is logged and
  ignored, never fatal; the optional `cloudflare.local.php` has no default - no secret
  without it, a secret no request carries with one that cannot be read cleanly or names no
  usable `origin_secret` - and
  `setup.php` neither writes nor reads it); every `*.local.php` read through
  `settingsFileReadCleanly()` - a plain `require` of one (whatever it prints goes out ahead
  of the answer: the password, from a database file without its `<?php` line), one required
  that does not start with `<?php` (after a byte-order mark or a blank line, a
  `declare(strict_types=1)` is a fatal error no handler catches: every request a 500), a database or
  IAM file not read cleanly answered with anything but "not set up", or a fault logged with
  the file's text or what PHP said, is a finding; `tools/build.php`
  still leaves out settings, tests, tools, the command-line scripts
  (`migration.php`, `translations.php`) and composer files; its `.htaccess`
  runs no PHP file in the web root but `setup.php` and `host-check.php` (their
  `FilesMatch` after the one refusing PHP - a wider pattern is a finding); no new route
  named like a folder under the web root's `api/`.

Then the house style:

- Angular: three files per component, OnPush, signals, `inject()`, inputs for
  route/query parameters, colours from tokens (light and dark), 390 px; no
  logic duplicated from `core/` into a component. The UI kit is the family's
  (`@anotoki/lib` 0.8.1): a copy of a kit piece in `src/app/ui/`, a global
  style a kit component would meet, an import from the `@anotoki/lib/ui`
  barrel instead of the piece's own entry point (the first load), or a
  selector of the kit's 0.2.0 class names in a spec or the browser check
  (they read nothing now) is a finding. So is a footer of the site's own, or
  a frame without the family's (`<anotoki-site-footer>`: the version, What's
  new, Feedback - none in the admin panel while an update waits -, About ·
  Support · Terms · Privacy · Contact), or anything of a frame round the
  family's status page.
- PHP: `declare(strict_types=1)`, functions by area, comments that say why.
- Tests: new rules, routes and refusals have tests (`backend/tests/`, `*.spec.ts`);
  `php tests/run.php` and `npm test` pass - run them. A test must fail with
  its fix taken out: one that derives what it expects from the output it
  checks, or races with a single request pending, proves nothing. A changed
  string or key: `tests/unit/translations.test.php` is what holds the
  frontend's keys and the migrations' together.
- Slovak: formal address (Vy, capital V only on its forms; the plural -li
  past), „ “ quotes, no preposition before a number or a name that varies -
  the rules are in `docs/decisions.md` (*Languages*).
- Docs: `docs/`, the skill, `CLAUDE.md`, README and DEV.md say what the code
  now does.
- Nothing git would publish holds a password, token, or a path on anybody's
  machine (`F:\`, `C:\Users\`, a user name).

## Report

A list, most serious first: file:line, what is wrong, what happens because of
it (a concrete failure), and what would fix it. Say plainly when you found
nothing, and which checks you ran.
