# anotoki survey - the backend

The survey site's API: PHP 8.2+ with Slim 4 on PostgreSQL (`anotoki_survey`),
signing people in through the anotoki IAM (client `survey`). How it works and
why is in [`../docs/`](../docs/README.md) - [the API](../docs/api.md) route by
route, [the architecture](../docs/architecture.md); setting it up and running
it in [`../DEV.md`](../DEV.md).

## Layout

```
api/
  index.php            the front controller: buildSurveyApp() - security headers, error handler,
                       the setup gate (503 not_set_up; with update: true while a migration
                       waits - signing in, the strings and the migrations routes still answer),
                       the routes
  bootstrap.php        what every entry point loads: settings, error handling, the site's functions
  routes/              public.php (health, sign-in settings, pictures, a language's strings),
                       surveys.php (the people taking surveys - signed in, or a visitor
                       while the IAM says sign-in is not required: requireTaker),
                       visitor.php (POST /api/visitor/move: at sign-in, a visitor's answers
                       into the account), admin.php (/api/admin/..., EDITOR / ADMIN; the
                       migrations, ADMIN)
  meddleware/          security.php, setup.php, auth.php (requireUser, requireRole,
                       requireTaker - where a visitor's key makes a visitor; the move
                       (routes/visitor.php) only hands one in, with a token - signedInUser,
                       currentUser)
  auth.php             the IAM token -> the person and their roles; the IAM's
                       "Sign-in required" switch (authLoginRequired())
  anotoki_iam.php      the IAM's PHP SDK (v1.1.0): the token verifier and the switch's
                       reader, vendored byte for byte (never edited here)
  surveys.php, responses.php, images.php, translations.php   the data, by area
  visitors.php         visitors: find, make (within the limits), hold, the clean-up, the move
  client_address.php   the address a request comes from, for the limits (trusted proxies only)
  survey_rules.php     what a survey and an answer must be - the twin of
                       ../frontend/src/app/core/survey/
  rich_text.php        richTextClean(): the editor's HTML and nothing else
  helpers.php          JSON in and out, text, and afterAnswer* (work done after the answer:
                       the visitors' clean-up)
  db.php, migration_runner.php (the family's engine)
  database_update.php  one update at a time (the lock setup.php, migration.php and the Migrations
                       page's Apply take), the Migrations page's status and Apply
config/
  config.php           reads database.local.php and iam.local.php - both written by setup.php,
                       gitignored, never committed - and visitors.local.php when it is there
                       (optional, put there by hand; VISITOR_DEFAULTS without it)
migrations/survey/     the schema and the site's strings, NNN_name.sql (never edit an applied one)
storage/               cache (the IAM's keys, its "Sign-in required" answer), visitors-swept (when
                       the visitors' clean-up last ran); gitignored
tests/                 run.php, lib.php; unit/, api/; tools/ (testdb.php, testenv.php, fake-iam.php)
tools/                 build.php (the upload -> ../dist/), translation_keys.php (the frontend's keys)
vendor/                Slim and its pieces - committed: the hosting cannot run Composer
```

## Entry points

| File | What |
| --- | --- |
| `router.php` | `php -S` behaving like the hosting's Apache: `/api/*` to `api/index.php`, `/setup.php`, and the built frontend |
| `setup.php` | the setup page: the database (host, port 5432, name `anotoki_survey`, user, password) and the IAM (address, client id); on this computer re-runnable, on a host with a token, locked after |
| `migration.php` | `php migration.php [--status \| --dry-run]`: the migrations for the configured database |
| `translations.php` | command line only: `--status` (the frontend's keys against the database), `--export sk [file]`, `--import sk file` |

## Commands

```bash
composer start                                # http://localhost:8500 - the API and setup.php
php migration.php --status                    # what is applied, what is pending
php translations.php --status                 # every key the frontend uses has its strings
php tools/build.php                           # the upload -> ../dist/ (builds the frontend too)
```

## Tests

```bash
php tests/run.php                             # every test
php tests/run.php tests/unit/translations.test.php   # one file
php tests/tools/testdb.php template --fresh   # after editing a migration the template has applied
```

Each run works on throwaway `survey_test_*` databases copied from
`survey_test_template` (on the server and with the user of
`config/database.local.php`) - never on `anotoki_survey`. Signing in is the
stand-in IAM's (`tests/tools/fake-iam.php`), never the real one. `unit/` holds
the rules, the rich text, the migrations, the key scan, the switch's reader and
a request's address (`client_address`); `api/` the routes
end to end through a real `php -S` (`surveys`, `translations`, `auth`, `visitors`
(who a request is, the limits, the clean-up, the move - and what happens when
two requests meet: `somebody_else()` holds a row, `begin_call()` sends and
sees it wait),
`migrations`: the Migrations page's routes and a database behind the code, and
`hosting`: the setup page and the upload as a host runs them). A test never
writes a file into `migrations/survey/` (a running site reads that folder): it
makes its database "behind" by taking rows out of its `migrations` table.
