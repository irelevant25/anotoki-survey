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
  would publish.
- **While the site cannot run, the anotoki family's library decides what
  happens** (anotoki-lib - `anotoki/lib` 0.1.0 in `backend/vendor/`,
  `@anotoki/lib/migrations` 0.1.1 in the frontend: 0.1.1 changed only the
  Angular half; the owner's decision of
  2026-10-07, `docs/decisions.md`; DEV.md says how it is updated - from
  GitHub, never a local path). Its `SiteGate` stands in front of every route:
  without the settings every address but `/api/site-status` is `503
  {code: "not_set_up"}` (with the setup page only while the site was never
  installed - `storage/installed.lock`); with a migration pending `503
  {code: "update_pending"}`, but signing in (`/api/auth/config`), the strings,
  `/api/health` and the Migrations page's three routes (`/api/admin/migrations`,
  `/file`, `/apply` - each exactly, never what is under them; ADMIN judged
  from the token alone) keep working (`SITE_OPEN_WHILE_UPDATING`,
  `api/migrations.php`). In the browser the family's page stands instead of
  every page (`<anotoki-site-gate>`, the router outlet given to it as an
  `<ng-template>` so that no page is made behind it; the guards send nobody to
  the IAM then):
  "being updated" for everybody - a quiet Sign in while nobody is signed in -
  and the way to the Migrations page for the site's ADMIN. Applying takes one
  lock (`DATABASE_UPDATE_LOCK`) shared with `setup.php`, `migration.php` and
  the tests' template.
  A third file is optional and nobody's but the owner's:
  `config/visitors.local.php` (the visitors' limits and trusted proxies; put
  there by hand, never written by `setup.php`; defaults without it).
- **Every page is for somebody signed in - unless the IAM says otherwise**:
  the IAM's "Sign-in required" switch is read (`authLoginRequired()`, the
  SDK's `anotoki_iam_login_required()`: kept a minute, **true unless the IAM
  said false**) and relayed as `loginRequired` (and `visitorDays`) in
  `/api/auth/config`. Required: somebody not signed in goes to the IAM first
  (`signInGuard` on the admin panel, `takeSurveysGuard` on the pages people
  take surveys on) and comes back to the page asked for. Switched off, those
  pages take **visitors** (below): the browser keeps the key the server made
  (`core/auth/visitor-key.ts`), and its next sign-in moves the visitor's
  answers and drafts into the account. The admin panel and the editor's
  preview sign in first whatever the switch. Only the pages drawn while the
  site cannot run (the family's page, the "cannot be reached" card) draw
  without either.
- **Who a request is is decided when it is issued** (frontend): `ApiService`
  marks each request `ISSUED_AS` person or visitor from the state at that
  moment; the interceptor sends a person's with the token or not at all (a
  null token fails locally as 401 `sign_in_required` - never as nobody's,
  which would make a visitor), a visitor's with the key - only to
  `/api/surveys`, only while sign-in is not required. The key is kept while
  sign-in is required (never forgotten on `sign_in_required`), forgotten on
  `visitor_unknown`. A sign-in waits for the sends on their way
  (`SavesInFlight`).
- **Who a request is comes only from a verified IAM token** (`api/auth.php`,
  the vendored `api/anotoki_iam.php`): never from a body, an address or a
  header of the site's own. Only `Authorization: Bearer` claims to be somebody
  (`authSentCredentials()`): a bad or empty one is 401 `invalid_token`, another
  scheme (`Basic`) is ignored. Roles: `requireRole(...ROLES_STAFF)` for the admin
  panel, `requireRole(ROLE_ADMIN)` for deleting; MEMBER is an ordinary person,
  asked for nowhere. The frontend's `isStaff` /
  `isAdmin` only hide what the server refuses anyway. **The one exception is a
  visitor** (`api/visitors.php`, migration 006): on the surveys' own routes
  only (`requireTaker()`: a key makes somebody a visitor nowhere else; the one
  other reader of `X-Visitor-Key` is `POST /api/visitor/move`, which needs a
  verified token as well and only hands the key in), while the IAM
  says sign-in is not required and no Bearer header was sent, the key the
  server made for that browser (only its hash stored) is a `users` row with a
  negative id, no name, no roles - made by its first answers that are kept, in
  their transaction, within the limits. `requireUser()` / `requireRole()`
  refuse a visitor; every other survey route is one of them, and nothing of a
  survey reaches anybody without a token while sign-in is required, but its
  pictures (an `<img>` sends no token; their addresses are random UUIDs). A
  visitor unseen for 30 days ends and its answers stay as "Visitor N"; at
  sign-in `POST /api/visitor/move` (token and key) moves its answers into the
  account. The key is never logged, never in a body or an address.
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
  `translations`; `api/translations.php`), English and Slovak. Only what
  somebody taking a survey sees is translated: those pages name a key
  (`'home.title' | translate`, `core/i18n/`) and the admin panel stays English,
  written in its templates. Migrations write the keys and their first strings;
  the admin panel (`/admin/translations`, `/admin/languages`) only rewords them.
  A key with no string shows as itself, on purpose. A string is text, never
  HTML. Slovak here addresses the reader formally (Vy, capital V) - unlike the
  other anotoki sites.
- **Saves carry a revision.** The editor saves through `AdminStore.updateSurvey()`
  (in the editor, through `SurveyEditing`, by id); a save made to an old
  revision is a conflict the editor settles - never overwrite it silently, and
  never replace the content being edited with a save's answer.
- **Pictures** are made small in the browser (`core/images/prepare-image.ts`),
  kept as bytes in `images`, served at `/api/images/{id}.{ext}` for a year,
  never changed, and deleted a day after no survey shows them.
- **Migrations are the schema**: `backend/migrations/survey/NNN_name.sql`, the
  family's engine (anotoki-lib's `Migrator`, through `surveyMigrator()` in
  `api/migrations.php`; the `migrations` table as it always was). Never edit an applied one.
  Data-changing ones end with a `DO $$` gate that fails loudly. A string the
  site gains, rewords or stops using is a migration too (`003_site_strings.sql`
  is the pattern: a key, its English and its Slovak string, inserts that never
  write over what was reworded in the admin panel);
  `tests/unit/translations.test.php` fails when the frontend uses a key no
  migration wrote, or a migration wrote one nothing uses.
- **PHP**: `declare(strict_types=1)`, functions by area (`survey*`, `response*`,
  `image*`, `richText*`, `answer*`, `language*`, `translation*`, `database*`), `?`
  parameters in every query, identifiers only from literals. `setup.php` stays
  parseable by PHP 7.4.
- **The top bar is the anotoki family's** (`layouts/top-bar`, the one the other
  sites copy): one row - brand, links, language, theme, the person's menu; up
  to 760 px one menu button holds the links and the person's menu.
- **The theme, the date order, the clock and the language are the anotoki
  account's** for somebody signed in (the IAM's migration 015, the owner's
  decision of 2026-10-06; the vendored SDK 1.2.0 - `AuthService.preferences`,
  `savePreferences()`): one theme for every site and every part of each, the
  admin panel too (`ThemeService`); dates in the account's order on both sides
  (`localDate`; the admin panel's through `AdminDates`, with its clock); its
  language over the device's choice (`TranslationService`). The bar's theme
  and the chooser save a choice to the account - shown at once, one save at a
  time, the last choice last, never turned back by an earlier save's answer.
  Signed out, the device's, as before; and while `preferences` is null (an IAM
  before 015) the site keeps its own settings exactly as before and saves
  nothing to the account.
- **Angular components are three files** (`.ts`, `.html`, `.scss`) - never an
  inline template or styles. Standalone, OnPush, signals, zoneless; route and
  query parameters arrive as inputs. The UI kit is the IAM's (`src/app/ui/`);
  colours only from the tokens in `src/styles.scss`, light and dark; every page
  works at 390 px (360 px for the top bar). Words: what the site itself says
  to somebody taking a survey (their pages, the top bar, the UI kit pieces
  they meet) is a key, never a sentence in a template or in state - state holds
  keys, kinds and `ApiError`s, and the wording happens in the template (the
  pipes) or in a `computed()` / `effect()`. English in the templates: everything
  under `pages/admin` and `layouts/admin-layout`, the preview's own chrome, and
  the load error card's fallback beside its keys (`boot/kept-word.ts`). The
  family's page and Migrations page bring their own words (the library's
  English and Slovak; this site's formal Slovak for the one sentence that
  addresses the reader, `core/migrations.ts`), and take the colours through
  the `--anotoki-*` properties `styles.scss` maps onto the tokens.
- **No changelog** on this site (the owner's decision); the version is
  `frontend/package.json`'s.

## Commands

```
# Backend (from backend/)
composer start                          # php -S localhost:8500 router.php: the API and setup.php
php tests/run.php                       # every PHP test, throwaway survey_test_* databases
php tests/tools/testdb.php template --fresh   # after editing a migration the tests' template has applied
php migration.php [--status|--dry-run]  # migrations for the configured database
php translations.php --status           # the keys the frontend uses against the database's strings
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
