# anotoki · survey

Surveys for the anotoki sites (survey.anotoki.eu): the survey people take, in
steps; an editor; and results that open from a number to the people behind it
and from a person to their whole survey. People sign in through the anotoki
IAM (client `survey`): EDITOR writes surveys and reads the answers, ADMIN also
deletes; everybody else (MEMBER, which every account holds) takes surveys, once each.

| Part | Folder | Stack |
| --- | --- | --- |
| Backend | `backend/` | PHP 8.2+, Slim 4, PostgreSQL (`anotoki_survey`) |
| Frontend | `frontend/` | Angular 21, standalone + zoneless, signals |
| Knowledge base | `docs/`, `.claude/` | architecture, API, operations, decisions; agents and skills |

Dev addresses: the site `http://localhost:4700` (`ng serve`, proxying `/api`
and `/setup.php`), the backend `:8500` (`composer start` in `backend/`), the
IAM `http://localhost:4300` (repo `../anotoki-iam`: `backend/` on 8100,
`frontend/` on 4300). The other anotoki sites use 4200-4600 and 8000-8400.

## Always, before any work here

1. Load the **`survey-site` skill** (`.claude/skills/survey-site/SKILL.md`):
   the map, the rules, the gotchas and the review checklist. For delegated
   work use the **`survey-dev`** agent, which loads it too; before a commit,
   the **`survey-reviewer`** agent.
2. `README.md` is what the site is; `DEV.md` how to set it up, run, test,
   build and deploy it; `docs/` how it works and why (`docs/README.md`).

## Always, after a change

Run the tests (below) - and the browser check (skill `check-in-browser`) for
anything a page shows. Then keep the knowledge base in step, as part of
finishing the task: `docs/` pages the change makes wrong, the skills, this
file, the agents, `README.md` ("Current state"), `DEV.md`, and
`backend/README.md` / `frontend/README.md` (each folder's layout and commands).

## Essentials

- **Settings are required and never committed**: `backend/config/database.local.php`
  and `iam.local.php` (gitignored), written by `backend/setup.php` - on this
  computer (no token, a nonce, re-runnable) and on the host (token, lock,
  self-delete). Never print the database password; never copy it anywhere git
  would publish. The web root's `.htaccess` (`tools/build.php`) lets a visitor
  run two PHP files alone, each while it is there: `setup.php` and the host
  check (`tools/host-check.php`: never in a build, uploaded by hand with a
  token in it, deleted again). **Every `*.local.php` is read cleanly or not at all**
  (`settingsFileReadCleanly()`, `config/config.php`; `docs/decisions.md`,
  2026-10-18 - never a plain `require` of one): a file that does not start
  with `<?php` - a byte-order mark, a blank line or a space before it, or no
  `<?php` line (all of it would print, the password too) - is passed over
  before PHP ever compiles it, its first five bytes read alone (with
  `declare(strict_types=1)` after such a start PHP could not even compile it:
  a fatal error nothing catches, every request a 500); whatever one that does
  start so prints as PHP reads it - text after a closing tag, an echo - is
  caught and never sent, and the file is passed over, as is one PHP cannot
  parse, run or open. A database or IAM file so leaves the site not set up
  (never a 500, never its text; the setup page on this computer names the
  file and its fault), the visitors' file means the defaults, Cloudflare's
  fails closed (below). Each fault is said in PHP's error log at most once a
  day (`settingsSaid()`) by its kind and line, its start or its byte count -
  never its text, nor what PHP said of it.
- **While the site cannot run, the anotoki family's library decides what
  happens** (anotoki-lib 0.6.3, both halves - `anotoki/lib` in `backend/vendor/`,
  `@anotoki/lib` in the frontend -, one release line: a patch
  that changes one half alone leaves the other where it is; the owner's decision of
  2026-10-07, `docs/decisions.md`; DEV.md says how it is updated - from
  GitHub, never a local path). Its `SiteGate` stands in front of every route:
  without the settings every address but `/api/site-status` is `503
  {code: "not_set_up"}` (with the setup page only while the site was never
  installed - `storage/installed.lock`); with a migration pending `503
  {code: "update_pending"}`, but signing in (`/api/auth/config`, the library's
  `AuthRoutes::openPath()`), the strings
  (`GET /api/translations/{code}`, the library's `TranslationsRoutes::openPath()`),
  `/api/health`, the Migrations page's three routes (`/api/admin/migrations`,
  `/file`, `/apply` - each exactly, never what is under them) and the error
  log's and the backups' (the library's `openPaths()`; a restore stays
  closed) keep working - ADMIN judged from the token alone
  (`siteOpenWhileUpdating()`, `api/migrations.php`). In the browser the
  family's page stands instead of
  every page (`<anotoki-site-gate>`, the router outlet given to it as the
  `<ng-template anotokiSitePages>` so that no page is made behind it; the
  guards send nobody to the IAM then):
  "being updated" for everybody - a quiet Sign in while nobody is signed in -
  and the way to the Migrations page for the site's ADMIN. **It stands alone:
  no top bar, no footer** (the owner, 2026-10-18 - they live in the routed
  frames, the admin panel's too, which the gate does not make;
  `app.component.spec.ts` holds it in every state; the ADMIN on the Migrations
  page while an update waits has the site's pages, so the admin panel's frame
  round them - its footer with no Feedback then). Applying takes one
  lock (`DATABASE_UPDATE_LOCK`) shared with `setup.php`, `migration.php`, the
  tests' template and the backups; the Apply and `migration.php` make a backup
  of the database first (none can be made: nothing is applied).
  A third file is optional and nobody's but the owner's:
  `config/visitors.local.php` (the visitors' limits and trusted proxies; put
  there by hand, never written by `setup.php`; defaults without it) - and a
  fourth, the same in every anotoki site: `config/cloudflare.local.php` (the
  origin secret, below; by hand too, never written or read by `setup.php`).
- **Where a request comes from is the family's one rule** (anotoki-lib
  0.5.0's `ClientAddress`, the owner's rule of 2026-10-11; `api/client_address.php`):
  `REMOTE_ADDR`, or `CF-Connecting-IP` only on a connection from Cloudflare's
  published ranges - the committed default (`VISITOR_DEFAULTS`, the library's
  `ClientAddress::CLOUDFLARE`), which `visitors.local.php` may replace (`[]`:
  `REMOTE_ADDR` alone; a catch-all range - shorter than /8 for IPv4, /16 for
  IPv6 - is refused, the default holding). The header is pinned in code, never
  a setting: `X-Real-IP`, `True-Client-IP`, `X-Forwarded-For` come through
  Cloudflare as the visitor sent them, and none is ever read. **With the
  origin secret, only through the owner's zone** (anotoki-lib PHP 0.5.2, the
  owner's decision of 2026-10-13): Cloudflare's ranges are every Cloudflare
  customer's - anybody's Worker can connect from them and write the
  `CF-Connecting-IP` it likes - so a Transform Rule of the owner's zone adds
  `X-Anotoki-Origin` with a secret to every request, the site keeps it in
  `config/cloudflare.local.php` (`['origin_secret' => ...]`, `originSecret()`;
  never printed or logged) and believes `CF-Connecting-IP` only on a request
  that carries it; any other request from Cloudflare counts as its edge -
  coarser, never looser. Without the file, Cloudflare's ranges alone, as
  before - **deleting the file is the one way to switch the secret off**.
  **A file that is there without a usable secret fails closed**
  (`originSecretFile()`, `settingsFileReadCleanly()`; `docs/decisions.md`,
  2026-10-14 and 2026-10-18 - the owner's "do as you think is the best",
  tighter than the IAM's rule, the family's next): read cleanly but naming
  none - blank, not an array, a misspelt key, a value that is not a string -,
  a folder in its place, or not read cleanly at all - it does not start with `<?php` (no `<?php`
  line, a byte-order mark or a line before it: never compiled), it prints
  (text after its closing tag), PHP cannot parse or run it, or may not open
  it: a secret no request carries (`originSecretNobodyCarries()`), so every
  request from Cloudflare's ranges counts as its edge until the file is
  mended - never "no secret", which would believe anybody's Worker there. The
  site keeps running (the file is optional); the fault is logged at most once
  a day (`settingsSaid()`), by its kind, its start, its byte count, that it
  names no usable `origin_secret` or that it is no file, never its text. An IPv6 address
  counts by its /64. The visitors' limits and the library's error log read by
  the same proxies and the same secret (`surveyAdminContext()`). **No address is kept in the
  clear**: a visitors' counter goes by a keyed HMAC of it
  (`clientAddressKept()`, under a key derived from the installation's
  `storage/anotoki-lib.key`), the error log's `client` likewise - a stable
  pseudonym of the address while that key lasts (whoever holds the key can
  try every IPv4 address against it), never a secret.
- **Signing in is the anotoki family's library's** (anotoki-lib 0.6.3, the
  `Auth` module on both halves - the IAM's SDKs are gone from this site):
  `Anotoki\Lib\Auth` on the server (`api/auth.php`, `meddleware/auth.php`),
  `@anotoki/lib/auth` in the browser (`AnotokiAuth`, its interceptor, guards,
  callback page and the screen of a failed sign-in; wired in
  `core/auth/auth.config.ts`, with `core/auth/auth.service.ts` the survey's
  face of it). No automatic sign-in by the IAM's hint here (`hint: false`:
  the owner's decision - genshin's and the build analyzer's).
- **Every page is for somebody signed in - unless the IAM says otherwise**:
  the IAM's "Sign-in required" switch is read (`authLoginRequired()`, the
  library's `SignInRule`: kept a minute, **true unless the IAM said false**)
  and relayed as `login_required` (and `visitor_days`) in `/api/auth/config`.
  Required: somebody not signed in goes to the IAM first (the library's
  `personGuard` on the admin panel and the preview, `personOrVisitorGuard` on
  the pages people take surveys on) and comes back to the page asked for; a
  sign-in that came back without one, or could not start, is said by the
  library's screen on `/auth/callback` (in the site's words, from the code -
  migration 012; `signInFailureGuard` sends a visitor and somebody still
  signed in there too). Switched off, those pages take **visitors** (below):
  the browser keeps the key the server made (`core/auth/visitor-key.ts`, the
  library's `VisitorKeyStore`), and its next sign-in moves the visitor's
  answers and drafts into the account. The admin panel and the editor's
  preview sign in first whatever the switch. Only the pages drawn while the
  site cannot run (the family's page, the "cannot be reached" card) and the
  legal pages (below) draw without either.
- **Terms, Privacy and Contact are anybody's** (anotoki-lib 0.6.0's legal
  pages, the owner's decisions of 2026-10-13; `docs/decisions.md`): `/terms`,
  `/privacy`, `/contact` - the family's pages (`@anotoki/lib/legal/pages`,
  lazy) in the frame of the survey's own (`layouts/legal-layout`), with no
  guard: what the site keeps is said before anybody signs in to it, and
  nothing of a survey is on them or asked of the API. Their facts are the
  survey's (`core/legal/legal-facts.ts`, given by their frame and out of the
  first load; the words `legal.*`, migrations 013 and 015) and must stay true
  of the code: a change to what the site keeps, or for how long, its cookies
  or browser storage, changes those strings (by a migration) and
  `SURVEY_LEGAL_UPDATED`. Every address they link to is the code's - the
  anotoki account's Privacy page and account page from the IAM's address the
  site signs in with (`AnotokiAuth.issuer()`, `accountUrl()`) -, never a
  string an administrator could reword. Contact opens the feedback form
  first (below), then gives the family's address. Their links are in the
  family's footer (below); the three paths are among the addresses no survey
  may have (`RESERVED_SLUGS` ↔ `SURVEY_RESERVED_SLUGS`).
- **One footer, the family's** (anotoki-lib 0.6.3's `<anotoki-site-footer>`,
  `@anotoki/lib/footer` - the build analyzer's, the owner's choice of
  2026-10-18; `docs/decisions.md`): at the foot of each frame - the survey's
  pages (under the card of a session that ended too), the legal pages and the
  admin panel (under its cards too) -, never round the family's page: a top
  border, "Version 0.4.0 · What's new · Feedback", then Terms · Privacy ·
  Contact; no fan clause. The version is `Changelog.current()` and What's new
  the survey's own dialog on `(whatsNew)` (`changelog.open()`) - neither while
  the list cannot be had; Feedback the family's form, which the footer opens
  itself - anybody's (below), so under every frame, but not in the admin
  panel's while an update waits (`[feedback]="!siteStatus.blocked()"`: the
  server would refuse it). Its words are the library's (`anotoki.footer.*`,
  its translations `012`; their Slovak impersonal), in the language on the
  page - English in the admin panel. No footer of the site's own: a part the
  family's lacks goes to the library.
- **Feedback is the family's library's** (anotoki-lib 0.6.2's Feedback; the
  owner's wish of 2026-10-18, `docs/decisions.md`): the form
  (`@anotoki/lib/feedback/form`, loaded with the first press - the family's
  footer's Feedback and the Contact page open it; `core/feedback.ts`), its route
  `POST /api/feedback` (`routes/feedback.php`) and the admin page
  (`/admin/feedback`, `@anotoki/lib/admin/feedback`, an ADMIN's System page;
  `/api/admin/feedback`), the library's table (`anotoki_feedback`, its admin
  set). **Anybody may send** - a person, a visitor (as nobody: their key is
  never read there), nobody - whether sign-in is required or not; who sent it
  is the token's alone (`Identify` in front: a bad token is 401
  `invalid_token`, never quietly nobody; `RecordPerson` keeps the row the
  page names them by), nothing of where it came from is kept, and **no
  address is written in** (the IAM is the only holder of anybody's address: a
  reply address only when the sender types one). The library's limits (5 an
  hour, 20 a day a sender - a person by account, anybody else by an HMAC of
  the address bucket -, 300 a day from the visitors and as many from the
  people) and keeping (spam 30 days, resolved 365, at a clean-up at most
  daily after a message or the page is opened - `legal.feedback.kept` says
  so). An account the IAM deletes leaves its messages' words without their
  reply address and browser (`peopleForgetFeedback()`, the scrub's hook; the
  People page's Delete does the same, the library's). Its words are the
  library's (`anotoki.feedback.*`), formal in Slovak where they speak to the
  reader (migration 014 and `FORMAL_SLOVAK`). The count nobody opened yet
  stands beside the bar's System link and on the System page's card (the
  family's `FeedbackUnread`, asked by the admin layout and the System page,
  never while the site cannot run): no mail is sent for a message.
- **Who a request is is decided when it is issued** (frontend, the library's
  `anotokiAuthInterceptor`): `ApiService` marks the surveys' requests
  `issuedAs('caller')` - whoever the page is shown to then; the interceptor
  sends a person's with the token or not at all (a missing token fails
  locally as 401 `sign_in_required` - never as nobody's, which would make a
  visitor), a visitor's with the key - only to `/api/surveys`, only while
  sign-in is not required. The key is kept while sign-in is required (never
  forgotten on `sign_in_required`), forgotten on `visitor_unknown`. A sign-in
  waits for the sends on their way (the library's `SavesInFlight`).
- **Who a request is comes only from a verified IAM token** (the library's
  `Identify` in front of each route group - `surveyIdentify()`): never from a
  body, an address or a header of the site's own. Only `Authorization:
  Bearer` claims to be somebody: a bad or empty one is 401 `invalid_token`,
  another scheme (`Basic`) is ignored. Roles: `requireStaff()` for the admin
  panel, `requireAdmin()` for deleting, the migrations and the system pages;
  MEMBER is an ordinary person, asked for nowhere. The frontend's `isStaff` /
  `isAdmin` only hide what the server refuses anyway. **The one exception is a
  visitor** (`api/visitors.php`, migration 006): on the surveys' own routes
  only (`surveyIdentify(..., visitors: true)` and the library's
  `RequireCaller`: a key makes somebody a visitor nowhere else; the one
  other reader of `X-Visitor-Key` is `POST /api/visitor/move`, which needs a
  verified token as well and only hands the key in), while the IAM
  says sign-in is not required and no Bearer header was sent, the key the
  server made for that browser (only its hash stored) is a `users` row with a
  negative id, no name, no roles - made by its first answers that are kept, in
  their transaction, within the limits. `RequirePerson` / `requireStaff()`
  refuse a visitor; every other survey route is one of them, and nothing of a
  survey reaches anybody without a token while sign-in is required, but its
  pictures (an `<img>` sends no token; their addresses are random UUIDs). A
  visitor unseen for 30 days ends and its answers stay as "Visitor N"; at
  sign-in `POST /api/visitor/move` (token and key) moves its answers into the
  account. The key is never logged, never in a body or an address.
- **People are the library's people module over `users`** (`api/people.php`,
  migration 011; the owner's decisions): a person's row is recorded from the
  token (`RecordPerson`, on the routes that touch the site's data) - the
  IAM's id and name, **no address** (011 dropped `users.email`: the IAM is the
  only holder); an account the IAM deletes is scrubbed here (`PeopleUpkeep`,
  at most hourly after an answer, or the People page's Check now): its name
  becomes `deleted-{id}`, `anonymized_at` the IAM's time, the answers stay.
  The People page (ADMIN) lists them with how many surveys each answered and
  wrote, and deletes a person's answers after its question alone - audited
  inside the delete's own transaction (no delete without its entry: `503
  feature_unavailable` while the audit log's table waits). The delete is one
  hook, `peopleDelete()`, the page's and a restore's: it runs inside the
  library's transaction (`People::delete()`), begins none of its own, works
  on the `$pdo` it is given alone - never `db()`, which in a restore waits on
  the restore's locks - and takes a null request (a restore's).
- **The admin tools are the library's, for the site's ADMIN alone**
  (`api/admin_tools.php`, the System page `/admin/system`): the error log
  (files under `storage/logs`, redacted - the pages' own errors too, below),
  the audit log (`anotoki_audit_log`, its set `anotoki_admin`), feedback
  (above) and the
  backups (`storage/backups`, every table by COPY - the pictures too - daily
  after an answer, before every update, by hand; made, downloaded, deleted or
  restored only after a sign-in of the last ten minutes; each listed with its
  maker's name; **not encrypted** and **kept until the owner deletes them -
  no maximum age**, the owner's decisions of 2026-10-11; **sealed**: only a
  backup made here is restored here - one made before anotoki-lib 0.5.0 has
  no seal and is restored offline alone, `docs/operations.md`; a failed one
  in the error log). A restore does not bring back what a person had deleted
  on the People page: inside its transaction every People Delete made since
  the backup is done again (the library's `People::restoreHooks()`, by the
  audit log's `person.data_deleted`, which is never restored), and so is every
  feedback message deleted since (its `feedback.deleted`) - but for the
  answers a visitor's browser moved into the account after the backup, which
  that backup holds under the visitor's id (`docs/decisions.md`, an open
  question for the owner); once it committed the
  scrub runs again, and one it cannot finish is the restore's
  `after_restore_error` - the next request runs it again. No file explorer
  (the owner's decision). Who acts is the token's person.
- **The pages' own errors go to the error log** (anotoki-lib 0.5.0; the
  owner's decision of 2026-10-11 for every site): the browser's reporter
  (`provideAnotokiErrorReport()`, `app.config.ts`) posts each - scrubbed, at
  most five a page load - to `POST /api/client-errors` (`ErrorLogRoutes::client`,
  `routes/public.php`) through the app's `HttpClient`, so the site's
  interceptors decide what it carries: a person's report goes with the token
  (counted by account), a visitor's and nobody's with neither - the visitor's
  key goes to the surveys' routes alone. Nobody's route: 20 an hour from one
  sender, 500 a day from the visitors and as many from the people signed in;
  closed while an update waits, like every route `siteOpenWhileUpdating()`
  does not name.
- **The rules are written twice, in the same words**: `frontend/src/app/core/survey/`
  (`answer-rules.ts`, `survey-problems.ts`, `localize.ts`) and
  `backend/api/survey_rules.php`. Change one, change the other, and their tests.
  In the frontend an answer's rule and problem are a kind and its numbers:
  `answerProblemText()` / `choiceRuleText()` say them in English - the server's
  sentence, word for word, and what the admin panel quotes - and the page a
  person answers on words the kind in their language
  (`core/i18n/answer-words.ts`), never with the server's sentence.
- **A survey is one JSONB document** (`surveys.content`) checked on the way in
  (`surveyFromBody()`); texts are cleaned HTML (`api/rich_text.php`: the editor's
  elements only); pictures are ones the server has, sized and addressed by it.
  It is written in one language (`language`) and holds the same texts in others
  (`translations`, found by the ids of what they belong to): a save must send
  both, and every map of a translation leaves PHP as a JSON object
  (`surveyTranslationsJson()`). People read a translation only when it is whole
  (`localizedSurvey()`, `core/survey/localize.ts`).
- **The site's own words are in the database** (`languages`, `translation_keys`,
  `translations`), English and Slovak - kept by the anotoki family's
  translations module (anotoki-lib 0.3.0 and later, the owner's decision; `docs/decisions.md`):
  on the server `Anotoki\Lib\Translations` - the bundle, the admin routes,
  every check of a string, the command line - wired in `api/translations.php`;
  in the browser `@anotoki/lib/translations` - the `TranslationService`, the
  `translate` / `translatePlural` pipes, the admin Translations and Languages
  pages (`@anotoki/lib/translations/admin`, a lazy entry point) - wired in
  `core/translations.ts`. One wire format, the IAM's (snake_case:
  `native_name`, `sort_order`). Who may do what stays the site's: EDITOR and
  ADMIN reword strings and manage languages, deleting a language is ADMIN's
  (`routes/admin.php`). Only what somebody taking a survey sees is
  translated: those pages name a key (`'home.title' | translate`) and the
  admin panel stays English, written in its templates. Migrations write the
  keys and their first strings; the admin panel (`/admin/translations`,
  `/admin/languages`) only rewords them. The library's own words are keys
  too, under `anotoki.` (the kit's, the status page's, the sign-in's): its
  migration set `anotoki_translations` writes them after the site's
  migrations, only where a key has no string, and migrations 010 (the kit's)
  and 012 (the sign-in's) moved the site's own strings under them first. A
  key with no string shows as itself, on purpose. A string is text, never
  HTML. Slovak here addresses the reader formally (Vy, capital V) - unlike the
  other anotoki sites and the library's own Slovak: 010 and 012 write the
  library's words that speak to the reader formally, and `FORMAL_SLOVAK`
  (`core/translations.ts`) says them while the database cannot be read.
- **Saves carry a revision.** The editor saves through `AdminStore.updateSurvey()`
  (in the editor, through `SurveyEditing`, by id); a save made to an old
  revision is a conflict the editor settles - never overwrite it silently, and
  never replace the content being edited with a save's answer.
- **Pictures** are made small in the browser (`core/images/prepare-image.ts`),
  kept as bytes in `images`, served at `/api/images/{id}.{ext}` for a year,
  never changed, and deleted a day after no survey shows them.
- **Migrations are the schema**: `backend/migrations/survey/NNN_name.sql`, the
  family's engine (anotoki-lib's `Migrator`, through `surveyMigrator()` in
  `api/migrations.php`; the `migrations` table as it always was), and around
  them the library's own sets, recorded as `<set>/NNN_….sql`
  (`surveyMigrationSets()`, in the README's order): `anotoki_admin` first (the
  audit log's table), the site's, `anotoki_translations`, `anotoki_people`.
  Never edit an applied one.
  Data-changing ones end with a `DO $$` gate that fails loudly. A string the
  site gains, rewords or stops using is a migration too (`003_site_strings.sql`
  is the pattern: a key, its English and its Slovak string, inserts that never
  write over what was reworded in the admin panel);
  `tests/unit/translations.test.php` fails when the frontend uses a key no
  migration wrote, or a migration wrote one nothing uses (the library's
  `KeyScanner`, `tools/translation_keys.php`; the `anotoki.` keys are the
  library's to check).
- **PHP**: `declare(strict_types=1)`, functions by area (`survey*`, `response*`,
  `image*`, `richText*`, `answer*`, `language*`, `translation*`, `database*`), `?`
  parameters in every query, identifiers only from literals. `setup.php` stays
  parseable by PHP 7.4.
- **The top bar is the anotoki family's** - the library's `<anotoki-top-bar>`
  (`@anotoki/lib/shell`), told by the site's thin wrapper `layouts/top-bar`
  what is this site's: its brand, its sections (System - the people, the
  feedback, the logs, the backups, the migrations - for an ADMIN, with the
  count of new feedback beside it; Migrations alone while an update waits),
  the person and their role, "Your anotoki account" and the
  way into the admin panel or back, signing in and out (saved first, asked
  when something would be lost). One row - brand, links, language, theme, the
  person's menu; up to 760 px (`PHONE_BAR_MAX`, its `phoneMax`) one menu
  button holds the links and the person's menu.
- **The theme, the date order, the clock and the language are the anotoki
  account's** for somebody signed in (the IAM's migration 015, the owner's
  decision of 2026-10-06; the library's `AnotokiAuth` - `AuthService.preferences`,
  `savePreferences()`): one theme for every site and every part of each, the
  admin panel too (the library's `ThemeService`, configured in
  `core/kit.ts`); dates in the account's order on both sides
  (`localDate`; the admin panel's through `AdminDates`, with its clock); its
  language over the device's choice (the library's `TranslationService`,
  `account` in `core/translations.ts`). The bar's theme
  and the chooser save a choice to the account - shown at once, one save at a
  time, the last choice last, never turned back by an earlier save's answer.
  Signed out, the device's, as before; and while `preferences` is null (an IAM
  before 015) the site keeps its own settings exactly as before and saves
  nothing to the account.
- **Angular components are three files** (`.ts`, `.html`, `.scss`) - never an
  inline template or styles. Standalone, OnPush, signals, zoneless; route and
  query parameters arrive as inputs. **The UI kit is the anotoki family's**
  (anotoki-lib 0.6.3: each piece from its own entry point -
  `@anotoki/lib/ui/button`, `/ui/icon`, `/ui/config`, `/ui/link-card` (the
  survey home's and the System page's cards that are one link),
  `/ui/chips` (the results' filters, `<anotoki-chip-list>`), ... - never the
  `@anotoki/lib/ui` barrel, for the first load; `@anotoki/lib/shell`; its class
  names its own, `.anotoki-<piece>__<part>`; the owner's decisions of
  2026-10-07, `docs/decisions.md`), wired to the site
  in `core/kit.ts` and never copied here - `src/app/ui/` holds only the
  survey's own pieces (the rich text editor, the lightbox, its pictures).
  Colours only from the family's `--anotoki-*` tokens (`@anotoki/lib/styles`:
  `anotoki.root()` in `src/styles.scss`, light and dark) and the survey's own
  few there (`--mark-*`, `--bar-*`, `--night-*`, `--rule-strong`); no global
  rule a kit component could meet - a field the site draws itself takes
  `src/styles/_fields.scss` into its own styles. Every page
  works at 390 px (360 px for the top bar). Words: what the site itself says
  to somebody taking a survey (their pages, the top bar, the UI kit pieces
  they meet) is a key, never a sentence in a template or in state - state holds
  keys, kinds and `ApiError`s, and the wording happens in the template (the
  pipes) or in a `computed()` / `effect()`. English in the templates: everything
  under `pages/admin` and `layouts/admin-layout`, the preview's own chrome, and
  the load error card's fallback beside its keys (`boot/kept-word.ts`). The
  kit's words (Sign in, the menus' names, the theme's, a toast's X) and the
  family's page's (`anotoki.siteStatus.*`) are the library's keys in the
  site's database (`TranslationService.forKit()` in `core/kit.ts`,
  `siteStatusWords()` in `core/migrations.ts`), so an administrator's
  rewording shows too; while the database cannot be read, this site's
  formal Slovak (`FORMAL_SLOVAK`) - never the kit's built-in ty. The
  Migrations page is English, as the admin panel is.
- **What's new and the version** (the owner's wish of 2026-10-18 - before it,
  no changelog): `frontend/public/changelog.json`, newest first, the other
  sites' shape (version, day, what was added, fixed, changed - for people)
  with each version's whole formal-Slovak translation beside it
  (`translations.sk`); the newest entry is the site's version, one source
  (`Changelog.current()`, `core/changelog/`, asked for as the site starts -
  `boot()`, never waited for), the footer's "Version", and
  `frontend/package.json`'s (and `package-lock.json`'s) is held to it by a
  spec - a release adds its entry first and moves both. What's new is the
  kit's dialog (`ui/changelog-dialog`, lazy), opened only when asked - by the
  family's footer's What's new - never by itself, so nothing about it is kept
  in a browser.

## Commands

```
# Backend (from backend/)
composer start                          # php -S localhost:8500 router.php: the API and setup.php
php tests/run.php                       # every PHP test, throwaway survey_test_* databases
php tests/tools/testdb.php template --fresh   # after editing a migration the tests' template has applied
php migration.php [--status|--dry-run]  # migrations for the configured database
php translations.php --status           # the keys the frontend uses against the database's strings (the library's command)
php translations.php --export sk [file] | --import sk file   # a language's strings as flat JSON
php tools/build.php                     # the upload -> ../dist/ (builds the frontend too)
php composer.phar update anotoki/lib --prefer-dist   # a new anotoki-lib release (with the frontend's, below; DEV.md)

# Frontend (from frontend/)
npm install && npm start                # ng serve on :4700
npm test                                # Vitest
npm run build                           # production -> dist/survey/browser/
npx prettier --check "src/**/*.{ts,html,scss}"   # a checkout with CRLF line endings: add --end-of-line crlf
bun install && npm install              # after a new anotoki-lib tarball address in package.json: both lock files

# The site in a browser, signed in through the stand-in IAM (from the root)
node .claude/skills/check-in-browser/scripts/run.mjs [--no-build] [--keep]
#   beside another site's check: SURVEY_CHECK_SITE_PORT / _IAM_PORT / _CHROME_PORT (8590-8599)
```

## Working conventions

- **Stage only your own edits**, by path; never `git add -A` / `git add .`.
- **Commit only when asked.** End commit messages with the Co-Authored-By
  trailer.
- **Stop every server you start** (and its process tree); check the ports
  after. On Windows the child of `npx` can outlive its parent. The owner may
  have their own `ng serve` on 4700 or `composer start` on 8500 running: look
  at a process's command line before stopping it. Throwaway servers go on
  8590-8599.
- **Never run a test or an experiment against `anotoki_survey`**: throwaway
  `survey_test_` databases only (`SURVEY_TEST_CONFIG`, honoured only for them).
- **Other anotoki repositories are read, not changed** - the IAM included -
  unless the task is about them (registering this site there was one).
- **Nothing that git would publish** names a path on anybody's machine, a
  password, or a token: say `../anotoki-iam`, `backend/...`.
