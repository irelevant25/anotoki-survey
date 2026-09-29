# Developing anotoki survey

From a fresh clone to a running site, then the day to day, the tests, and the
build for the hosting.

## Prerequisites

| Tool | Version | Notes |
| --- | --- | --- |
| PHP | 8.2+ | with `pdo_pgsql`, `openssl` and `dom`; the tests also need `curl`. `php` on the PATH |
| PostgreSQL | 13+ | a local server, and a login that may create databases (the setup and the tests make theirs) |
| Node.js | 22.12+ | with npm, for the Angular app (`frontend/.nvmrc` says 22.15.0) |
| The anotoki IAM | - | to sign in: `../anotoki-iam`, its own DEV.md |

`backend/vendor/` is committed (the hosting cannot run Composer), so Composer
is only needed to change PHP dependencies - and for `composer start`.
`frontend/.npmrc` sets `legacy-peer-deps`.

## First setup

Everything that belongs to one installation - the database connection, the
IAM's address and this site's client id there - lives in
`backend/config/database.local.php` and `backend/config/iam.local.php`. They
are gitignored and **required**: without them the API answers every request
`503 {code: "not_set_up"}`, and the site shows "The survey site is not set up
yet" with a link to the setup page. Nothing falls back to a committed default.
The setup page writes them.

### 1. The setup page

```bash
cd backend
composer start          # php -S localhost:8500 router.php
```

Open **http://localhost:8500/setup.php**. Asked from this computer by a local
name (localhost, 127.0.0.1) under PHP's built-in server, it is the development
setup: no token (a nonce in a cookie keeps other pages from submitting it), and
it stays - open it again whenever a setting changes. It shows what is saved,
never a password; a password left empty keeps the saved one.

- **Database**: the server, port, database name (`anotoki_survey`), user and
  password. **Test the database** tries them without saving.
- **Sign-in**: the IAM's address, `http://localhost:4300` on a development
  machine, and the client id `survey`. **Test the IAM** fetches
  `{address}/.well-known/openid-configuration` and its keys.

**Save** creates the database if it is missing, applies the migrations and
writes the two files.

### 2. The frontend

```bash
cd frontend
npm install
npm start          # http://localhost:4700 - proxying /api and /setup.php to :8500
```

### 3. Signing in, while developing

Run the IAM (`../anotoki-iam`: its backend on `:8100`, its pages on
`http://localhost:4300` - see its DEV.md). Its migration
`005_survey_application.sql` registers this site as `survey` for
`http://localhost:4700` (the callback `/auth/callback`, and `/` after signing
out) with the roles **ADMIN** and **EDITOR**, and gives ADMIN to the IAM's own
administrators; `php migration.php` in its `backend/` applies it to an IAM set
up before. Anybody with an account may take surveys; the admin area needs
EDITOR or ADMIN, given in the IAM's admin console (Users → the account → roles).

Without the IAM, the site shows everything a signed-out visitor sees, and the
tests and the browser check (below) sign in through a stand-in instead.

## Day to day

| | Command | Address |
| --- | --- | --- |
| API and setup page | `cd backend && composer start` | `http://localhost:8500` |
| The site | `cd frontend && npm start` | `http://localhost:4700` |
| The IAM | see `../anotoki-iam/DEV.md` | `http://localhost:4300` |

| Address | What |
| --- | --- |
| `/` | the surveys open now, as people see them |
| `/{address}` | a survey to take |
| `/preview/{id}` | the editor's preview of any survey, open or not; nothing is kept |
| `/admin` | the surveys (EDITOR, ADMIN) |
| `/admin/surveys/{id}/edit` | the editor |
| `/admin/surveys/{id}/results` | the results - `?tab=people`, and the drill-down below |
| `/admin/surveys/{id}/responses/{id}` | one person's answers on a page of its own |
| `/auth/callback` | where the IAM sends the browser back after signing in |

The results keep their state in the address, so Back steps out of it and every
view can be linked: `?filter=question:option,…` narrows the page,
`?chose=question:option` opens the people who chose an answer, `?wrote=question`
the answers to a text question, `?response=id` one person's survey. Gender and
age use the question ids `about-gender` and `about-age`.

Command-line tools in `backend/`, all reading the same settings:

```bash
php migration.php [--status|--dry-run]    # apply pending migrations (setup.php does too)
php tools/build.php [--out=DIR]           # the upload (see Building and deploying)
```

The database is `migrations/survey/NNN_name.sql`, applied in order by the same
engine as the other anotoki sites' (`api/migration_runner.php`). Never edit an
applied migration; add the next number.

## Tests

```bash
cd backend
php tests/run.php                  # every tests/unit and tests/api file, four at a time

cd frontend
npm test                           # the unit tests (Vitest): the rules, the checks, the results, the CSV, pictures
npm run build                      # the production build
npx prettier --check "src/**/*.{ts,html,scss}"
```

The backend tests start the real router under PHP's built-in server (and the
upload, without a router, as a host would run it), each file against a
throwaway `survey_test_*` database copied from `survey_test_template`, with
settings of their own in a temp folder (`SURVEY_TEST_CONFIG`, honoured only for
`survey_test_` databases). They borrow only the PostgreSQL server and user from
this machine's `config/database.local.php`, so run the setup once first. They
sign their own tokens (the IAM verifier's test helpers) and never touch
`anotoki_survey`.

### In a browser

```bash
node .claude/skills/check-in-browser/scripts/run.mjs [--no-build] [--keep]
```

The whole site end to end in headless Chrome - the owner writes and opens a
survey with a picture, somebody takes it once, the results, the roles, a phone
width - signing in through the stand-in IAM (`backend/tests/tools/fake-iam.php`),
on a throwaway database, then everything stopped and dropped. The skill
(`.claude/skills/check-in-browser/SKILL.md`) has the details, and how to click
through the same throwaway copy by hand.

## Building and deploying

The hosting is FTP only: PHP and PostgreSQL, Apache with `.htaccess`, no shell.

```bash
cd backend
php tools/build.php                # -> dist/ at the top of the repository
```

It builds the frontend (`npm ci` if needed, then `npm run build`) and puts
together one folder whose contents go into the site's web root: the app, its
`.htaccess` (routing, closed folders, security headers), `setup.php`, `api/`,
`config/` (the loader only), `migrations/`, `vendor/` and an empty `storage/`.
No settings file, no tests or tools, no composer files.

1. In the hosting panel: a PostgreSQL database and its user, and HTTPS for the
   site.
2. Upload everything in `dist/` into the web root (the folder `survey.anotoki.eu`
   points at). PHP must be able to write into `config/` and `storage/`.
3. Open `https://survey.anotoki.eu/setup.php`. On a real host it asks for a
   token it wrote into `storage/setup-token.php` - read it with your FTP
   program. Enter the database and the IAM (`https://iam.anotoki.eu`, client id
   `survey`). **Install** writes the settings, makes the tables, writes
   `storage/installed.lock`, and deletes the token and itself.
4. In the IAM: the site must be registered with its production address - see
   [docs/operations.md](docs/operations.md) (*The IAM*).
5. Sign in on the site.

**Later versions**: build and upload again (the settings and the lock stay). A
version with a new migration needs the setup page once more: delete
`storage/installed.lock`, and open `/setup.php` (the upload carries it) with the
same details - it applies what is missing and keeps every survey and answer.
Until then the site says it needs an update.

If a whole site answers "500 Internal Server Error" after an upload, the host
may not allow a line of `.htaccess` (`Options -Indexes` or `CGIPassAuth`):
remove that line.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| "The survey site is not set up yet"; the API answers 503 `not_set_up` | The setup page has not run, a `config/*.local.php` is missing - or the database needs an update (`php migration.php`, or the setup page). |
| The setup page asks for a token on this computer | It was not asked as `localhost` / `127.0.0.1` straight from PHP's built-in server: a LAN address, another name, or a proxy that adds forwarding headers makes it a real host's install. |
| "The survey site cannot be reached" | The backend on :8500 is not running, or was started without `router.php`. |
| Signing in bounces back with an error | The IAM does not know this address: use `http://localhost:4700`, which its migration 005 registers for `survey` (on an older IAM database: `php migration.php` there, or `php clients.php --dev`). |
| "Your sign-in has run out" on every request | The issuer in `config/iam.local.php` is not exactly the IAM's address, or the backend cannot reach `{issuer}/.well-known/jwks.json`. |
| The admin area says it is for the people who write the surveys | Your account has no EDITOR or ADMIN role for `survey`: the IAM's admin console gives it. |
| "Not saved" beside a survey's name | The server refused the last change - the editor says why above the survey (often an address another live survey has). |
| `tests/run.php` stops before any test | No `config/database.local.php` to borrow the PostgreSQL server from: run the setup first. |
| Port 4700 is busy | Another `ng serve` is still running (on Windows the child of `npx` can outlive its window). Find it with `netstat -ano \| findstr :4700` and end that process. |
