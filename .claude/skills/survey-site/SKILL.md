---
name: survey-site
description: Use for any development work on the anotoki survey site (this repo) - new question types or survey features, the editor, the results, the survey people take, the PHP API, the database, pictures, signing in and roles, the setup page or hosting. Load it before changing anything, so the map, the rules both sides keep and the gotchas already paid for are not rediscovered.
---

# The survey site - project skill

survey.anotoki.eu: surveys in steps, an editor, results with a drill-down.
Angular 21 in `frontend/`, PHP 8.2 + Slim 4 + PostgreSQL in `backend/`, sign-in
through the anotoki IAM (client `survey`; roles EDITOR and ADMIN). `docs/` is the
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
  api/routes/              public.php (health, auth config, pictures), surveys.php (people),
                           admin.php (/api/admin/..., EDITOR/ADMIN)
  api/meddleware/          security.php, setup.php (503 not_set_up: settings or a pending migration),
                           auth.php (optionalUser, requireUser, requireRole, currentUser)
  api/auth.php             the token -> SiteUser {id, name, email, roles}; users row upkeep;
                           isThisComputer() (setup.php and the health details)
  api/surveys.php          survey rows <-> the frontend's Survey; summaries; create/save (revision)/
                           status/delete; SURVEY_TAKING_ANSWERS_SQL
  api/responses.php        submit (once, while open, every answer checked), list, delete
  api/images.php           store (checked by its bytes), find, meta, clean-up
  api/survey_rules.php     surveyFromBody() (shape + cleaning), surveyProblems(), answer rules
  api/rich_text.php        richTextClean(): the editor's HTML and nothing else
  api/anotoki_iam.php      the IAM's verifier, vendored byte for byte (sdk/php, v1.0.1)
  config/config.php        database.local.php + iam.local.php; SURVEY_TEST_CONFIG for the tests
  migrations/survey/       the schema
  setup.php                the installer (this computer: nonce, re-runnable; a host: token, lock, self-delete)
  router.php               php -S behaving like the hosting's Apache (+ the built app)
  tools/build.php          the upload -> ../dist/
  tests/                   run.php, lib.php, unit/, api/, tools/ (testdb, testenv, fake-iam)
frontend/src/app/
  core/auth/               AuthService (IAM SDK in signals; status: loading/ready/not-set-up/error),
                           authInterceptor, signInGuard, the vendored SDK (anotoki-auth.mjs v1.1.1)
  core/api/api.service.ts  one method a route; ApiError {status, code, message, body}
  core/admin/admin-store.service.ts   the admin area's cache and the editor's saving (revision, conflict)
  core/survey/             the model and every rule (pure TS, unit-tested)
  core/images/             prepareImage (browser-side), ImageUploader
  core/testing/            example data for the unit tests only
  layouts/                 top-bar (brand, Admin link, theme, user menu), participant, admin (no-access)
  boot/                    not-set-up, load-error: drawn instead of the site
  pages/participant/       survey-home, take-survey (+ question-block, survey-hero)
  pages/admin/             surveys-list, survey-editor (+ parts, SurveyEditing), survey-results,
                           response-view, response-page, survey-header
  ui/                      the IAM's UI kit + rich-text-editor (TipTap), drawer, lightbox, survey-image
```

## Rules

- **Who**: only a verified IAM token says who a request is. Roles from the token
  (`anotoki_iam_roles`): `ROLES_STAFF` = ADMIN, EDITOR for `/api/admin`;
  ADMIN alone for the two deletes. The frontend hides; the server refuses.
- **Both sides say the same**: `answer-rules.ts` ↔ `answerProblem()` /
  `answerClean()`; `survey-problems.ts` ↔ `surveyProblems()`; `RESERVED_SLUGS` ↔
  `SURVEY_RESERVED_SLUGS`; `about-you.ts` ↔ `SURVEY_GENDERS` / `SURVEY_AGES` and
  the CHECKs in migration 001; `MAX_UPLOAD_BYTES` ↔ `IMAGE_MAX_BYTES`. Same
  sentences, too - the page shows the server's.
- **A new field on a survey or question**: the model (`survey.model.ts`), the
  factory (`newQuestion`, `copyQuestion`...), the editor, `surveyFromBody()` /
  `surveyQuestionFromBody()` (else the server drops it - it keeps only what it
  knows), the rules if it constrains answers, `docs/api.md`. Old surveys in the
  database do not have it: read it with a default, or migrate `content`.
- **Saving**: every editor change through `AdminStore.updateSurvey()` (or
  `SurveyEditing` by id); never keep a copy of a survey in a component to write
  back later. Never apply a save's answer to the content.
- **Pictures**: `SurveyImage.src` is the server's; the editor sends id and alt,
  the server fills width, height, src from the file.
- **Queries**: `?` parameters always; identifiers from literals; JSONB built by
  `jsonText()` from checked arrays (an empty map goes as `new stdClass()`, or it
  becomes `[]`).
- **Migrations**: new file, next number; data-changing ones end with a `DO $$`
  gate; the replayed schema is what `survey_test_template` is.
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
  a fresh load older than what is here is ignored.
- **Control characters are dropped on both sides** (`withoutControls()` /
  `textClean()`), never refused: a pasted soft line break must not make an
  answer or a survey impossible to save.
- **The sign-in guard is `canActivate`, not `canMatch`**: refused while
  matching, the next route (`:slug`) would match `admin` and flash "no survey".
- **The SDK finishes the callback in the app initializer**, before the router's
  first navigation; `/auth/callback` itself is only ever seen when opened by hand.
- **`ng serve`'s proxy keeps the Host header** (`changeOrigin: false`), so
  setup.php through :4700 is still "this computer".
- **The hosting**: `display_errors` on (switched off in bootstrap), no `.avif`
  MIME type (pictures go through PHP), mod_dir's 301 for a URL naming a folder
  (no route named like a folder under `api/`), Cloudflare caching by extension.

## Checks before saying it is done

1. `cd backend && php tests/run.php` - all pass; add tests for new rules,
   routes and refusals (`tests/api/surveys.test.php` is the pattern).
2. `cd frontend && npm test && npm run build`, and
   `npx prettier --check "src/**/*.{ts,html,scss}"`.
3. Anything a page shows: the `check-in-browser` skill (and look at the
   screenshots, light and dark, 390 px).
4. Review: the `survey-reviewer` agent, or this list -
   - [ ] no route trusts anything but the token for who and what role;
   - [ ] the two sides of every rule still agree, sentences included;
   - [ ] new input is checked for type, length and count on the server;
   - [ ] HTML from users only through `richTextClean()`;
   - [ ] queries parameterised; no identifier from input;
   - [ ] no secret, token or machine path in anything git publishes;
   - [ ] components in three files; colours from tokens; works at 390 px;
   - [ ] `docs/`, this skill, `CLAUDE.md`, `README.md`, `DEV.md` in step.
