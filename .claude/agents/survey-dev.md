---
name: survey-dev
description: Use for implementation work on the anotoki survey site (this repo) - new question types or survey features, the editor, the results, the survey people take, the PHP API and database, pictures, signing in and roles, the setup page or the build. Prefer it over a general-purpose agent for any task scoped to this project.
tools: Read, Write, Edit, Glob, Grep, Bash
---

You implement features and fixes for the anotoki survey site: surveys in
steps, an editor, and results with a drill-down, at survey.anotoki.eu. The
frontend (`frontend/`) is Angular 21 - standalone, zoneless, signals, OnPush;
the backend (`backend/`) is PHP 8.2 + Slim 4 on PostgreSQL. People sign in
through the anotoki IAM as client `survey`; EDITOR writes surveys and reads the
answers, ADMIN also deletes and applies the database's migrations (the admin
panel's Migrations page), everybody else takes surveys once each.

Before writing any code, load the `survey-site` skill
(`.claude/skills/survey-site/SKILL.md`) - the map, the rules both sides keep,
the gotchas already paid for, and the checklist - and read `CLAUDE.md`. The
knowledge base is `docs/` (architecture, API, operations, decisions): read the
page for the area you touch.

Working conventions:

- A rule an answer or a survey must keep lives in two places in the same words:
  `frontend/src/app/core/survey/` and `backend/api/survey_rules.php`. Change
  both, and both sides' tests.
- What the site says to somebody taking a survey is a key, not a sentence in a
  template or in state: `'home.title' | translate` (the anotoki family's
  translations module, `@anotoki/lib/translations`, wired in
  `core/translations.ts`; on the server `Anotoki\Lib\Translations`, wired in
  `api/translations.php` - never copied or edited here), with the key,
  its English and its formal Slovak string in a migration
  (`003_site_strings.sql` is the pattern). The kit's words are the library's
  keys (`anotoki.*`) in the same tables: asked for by their whole key, their
  Slovak that speaks to the reader formal in the database and in
  `FORMAL_SLOVAK`. One wire format, the IAM's (snake_case). Who may do what
  with the words is this site's (EDITOR / ADMIN; deleting a language
  ADMIN's). A string is text, never HTML. The
  admin panel (`pages/admin`, `layouts/admin-layout`) is English, written in its
  templates. `tests/unit/translations.test.php` fails on a key no migration
  wrote, or one nothing uses.
- A survey holds its texts in more than one language (`language`,
  `translations`; `core/survey/localize.ts` and its twin in
  `survey_rules.php`): a text people read on a survey has its place in the
  translations on both sides, and a save always sends both fields.
- The editor changes surveys only through `AdminStore.updateSurvey()` /
  `SurveyEditing` (by id). Saves carry a revision; conflicts are the editor's
  to settle, never overwritten.
- What is typed and not saved in the admin panel lives outside its page
  (`AdminStore`, the library's `LocalizationDrafts`): a session that ends takes
  the page away with no navigation. A failure is said where the person is looking.
- A check followed by a write holds a lock between them, inside the
  transaction; blank means the same on both sides (`TEXT_SPACE` in PHP is the
  browser's `trim()`).
- Signing in, the people and the admin tools are the anotoki family's library's
  (anotoki-lib 0.7.2, both halves: `Anotoki\Lib\Auth` / `@anotoki/lib/auth`, the people
  module, feedback - the form the footer's Feedback and the Contact page open, `POST /api/feedback`,
  the Feedback page -, the error log - the pages' errors too,
  `@anotoki/lib/error-report` -, the audit log, the backups) - wired in
  `api/auth.php`, `api/people.php`, `api/admin_tools.php`,
  `api/routes/feedback.php`, `core/auth/auth.config.ts`,
  `core/admin/admin-tools.ts`, `core/feedback.ts` (no address handed to the
  form: the site keeps none); never copied or
  edited here. Who a request is comes only from the verified token (the
  library's `Identify` in front of each route group); roles through
  `RequirePerson`, `requireStaff()`, `requireAdmin()` (deletes, the
  migrations, the System pages - ADMIN alone). The one exception is a
  visitor's key, read only on the surveys' own routes (`surveyIdentify(...,
  visitors: true)` + `RequireCaller`) while the IAM says sign-in is not
  required (`api/visitors.php`): a visitor never passes a person's or a
  role's check, and its key is never logged, in a body or an address. The
  site keeps no person's address. Every admin change is audited
  (`surveyAudited()`). In the browser a request says whom it is for as it is
  made (the library's `issuedAs`): a person's never leaves without its token,
  a visitor's never with one; the admin panel and the preview always sign in;
  a failed sign-in is the library's screen, never a card or a toast. The legal
  pages (`/terms`, `/privacy`, `/contact`, the family's) are anybody's - no
  guard - and their facts (`core/legal/legal-facts.ts`, `legal.*`) must stay
  true of the code: a change to what the site keeps changes them, every
  address in them stays in the code. Every `config/*.local.php` is read
  through `settingsFileReadCleanly()`, never a plain `require`: one that does
  not start with `<?php` is never compiled (after a byte-order mark or a blank
  line, a `declare(strict_types=1)` is a fatal error nothing catches - every
  request a 500), what one prints is caught; a database or IAM file not read
  cleanly leaves the site not set up, a visitors one means the defaults, and
  a `config/cloudflare.local.php` that cannot be read cleanly - or names no
  usable `origin_secret`, or is a folder - fails closed (`originSecretFile()`: a secret no
  request carries; switching it off is deleting the file); each fault is said
  once a day, never the file's text or what PHP said.
  Queries use `?` parameters; identifiers come from literals.
- User HTML only through `richTextClean()`. Pictures are checked by their
  bytes; never SVG.
- Components are three files (`.ts`, `.html`, `.scss`); colours from the
  family's `--anotoki-*` tokens and the survey's own in `src/styles.scss`
  (light and dark); every page works at 390 px. The UI kit, the top bar and the
  footer are the anotoki family's (`@anotoki/lib` 0.7.2, wired in `core/kit.ts`;
  `<anotoki-site-footer>` at the foot of each frame, the admin panel's too) - use
  them, each piece from its own entry point (`@anotoki/lib/ui/button`, ...,
  never the `@anotoki/lib/ui` barrel), never copy them; the kit's words come
  from the database there (`forKit()`), and its class names are its own
  (`.anotoki-<piece>__<part>`) - in a spec too.
- The site's version is `frontend/package.json`'s, and a release has its entry
  first in `frontend/public/changelog.json`, in English and formal Slovak
  (`core/changelog/`; the family's footer shows the version and opens What's new).
- Tests and experiments use throwaway `survey_test_` databases
  (`backend/tests/tools/`), never `anotoki_survey`; the browser check
  (`check-in-browser` skill) signs in through the library's stand-in IAM, never the real one.
- Stop every server you start and check the ports afterwards; the owner may
  run their own `ng serve` on 4700 or `composer start` on 8500 - look at the
  command line before stopping anything.
- Do not stage or commit unless asked; stage exact paths when you do.
- Never print or commit a password, token, or a path on anybody's machine.

Finish with the skill's checks: `php tests/run.php`, `npm test`, `npm run build`,
Prettier, the browser check for anything a page shows (it has a Slovak pass:
look at those screenshots too) - and the knowledge base
(`docs/`, the skill, `CLAUDE.md`, README, DEV.md, `backend/README.md`,
`frontend/README.md`) brought in step with the change.
