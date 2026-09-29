# anotoki · survey

Surveys for the anotoki sites (survey.anotoki.eu): the survey people take, in
steps; an editor; and results that open from a number to the people behind it
and from a person to their whole survey. People sign in through the anotoki
IAM (client `survey`): EDITOR writes surveys and reads the answers, ADMIN also
deletes; everybody else takes surveys, once each.

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
file, the agents, `README.md` ("Current state"), `DEV.md`.

## Essentials

- **Settings are required and never committed**: `backend/config/database.local.php`
  and `iam.local.php` (gitignored), written by `backend/setup.php` - on this
  computer (no token, a nonce, re-runnable) and on the host (token, lock,
  self-delete). Without them, or with a migration pending, the API answers
  `503 {code: "not_set_up"}` and the site shows its "not set up yet" page.
  Never print the database password; never copy it anywhere git would publish.
- **Who a request is comes only from a verified IAM token** (`api/auth.php`,
  the vendored `api/anotoki_iam.php`): never from a body, an address or a
  header of the site's own. Roles: `requireRole(...ROLES_STAFF)` for the admin
  area, `requireRole(ROLE_ADMIN)` for deleting. The frontend's `isStaff` /
  `isAdmin` only hide what the server refuses anyway.
- **The rules are written twice, in the same words**: `frontend/src/app/core/survey/`
  (`answer-rules.ts`, `survey-problems.ts`) and `backend/api/survey_rules.php`.
  Change one, change the other, and their tests.
- **A survey is one JSONB document** (`surveys.content`) checked on the way in
  (`surveyFromBody()`); texts are cleaned HTML (`api/rich_text.php`: the editor's
  elements only); pictures are ones the server has, sized and addressed by it.
- **Saves carry a revision.** The editor saves through `AdminStore.updateSurvey()`
  (in the editor, through `SurveyEditing`, by id); a save made to an old
  revision is a conflict the editor settles - never overwrite it silently, and
  never replace the content being edited with a save's answer.
- **Pictures** are made small in the browser (`core/images/prepare-image.ts`),
  kept as bytes in `images`, served at `/api/images/{id}.{ext}` for a year,
  never changed, and deleted a day after no survey shows them.
- **Migrations are the schema**: `backend/migrations/survey/NNN_name.sql`, the
  family's engine (`api/migration_runner.php`). Never edit an applied one.
  Data-changing ones end with a `DO $$` gate that fails loudly.
- **PHP**: `declare(strict_types=1)`, functions by area (`survey*`, `response*`,
  `image*`, `richText*`, `answer*`), `?` parameters in every query, identifiers
  only from literals. `setup.php` stays parseable by PHP 7.4.
- **Angular components are three files** (`.ts`, `.html`, `.scss`) - never an
  inline template or styles. Standalone, OnPush, signals, zoneless; route and
  query parameters arrive as inputs. The UI kit is the IAM's (`src/app/ui/`);
  colours only from the tokens in `src/styles.scss`, light and dark; every page
  works at 390 px (360 px for the top bar). English only; words are written in
  the templates.
- **No changelog** on this site (the owner's decision); the version is
  `frontend/package.json`'s.

## Commands

```
# Backend (from backend/)
composer start                          # php -S localhost:8500 router.php: the API and setup.php
php tests/run.php                       # every PHP test, throwaway survey_test_* databases
php migration.php [--status|--dry-run]  # migrations for the configured database
php tools/build.php                     # the upload -> ../dist/ (builds the frontend too)

# Frontend (from frontend/)
npm install && npm start                # ng serve on :4700
npm test                                # Vitest
npm run build                           # production -> dist/survey/browser/
npx prettier --check "src/**/*.{ts,html,scss}"

# The site in a browser, signed in through the stand-in IAM (from the root)
node .claude/skills/check-in-browser/scripts/run.mjs [--no-build] [--keep]
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
