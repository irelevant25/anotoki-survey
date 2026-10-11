# anotoki survey - the backend

The survey site's API: PHP 8.2+ with Slim 4 on PostgreSQL (`anotoki_survey`),
signing people in through the anotoki IAM (client `survey`). How it works and
why is in [`../docs/`](../docs/README.md) - [the API](../docs/api.md) route by
route, [the architecture](../docs/architecture.md); setting it up and running
it in [`../DEV.md`](../DEV.md).

## Layout

```
api/
  index.php            the front controller: buildSurveyApp() - the family's error log (outermost),
                       security headers, error handler, the anotoki family's site gate (anotoki/lib's
                       SiteGate: 503 not_set_up - the setup page offered only to a site never
                       installed; 503 update_pending while a migration waits, but signing in, the
                       strings, the health check, the migrations routes and the error log's and
                       backups' still answer), the people's upkeep (the scrub, at most hourly, after
                       the answer), the daily backup, the routes - each group with the library's
                       Identify in front of it (who the request is, once)
  bootstrap.php        what every entry point loads: settings, error handling, the site's functions
  routes/              public.php (health, the site's status, sign-in settings - the library's
                       AuthRoutes - pictures, a language's strings - the library's bundle route),
                       surveys.php (the people taking surveys - signed in, or a visitor while the
                       IAM says sign-in is not required: the library's RequireCaller), visitor.php
                       (POST /api/visitor/move: at sign-in, a visitor's answers into the account),
                       admin.php (/api/admin/..., EDITOR / ADMIN; the strings and the languages -
                       the family's routes, EDITOR / ADMIN, deleting a language ADMIN's; the
                       migrations, the people, the error log, the audit log, the backups - the
                       family's routes - ADMIN alone, judged from the token)
  meddleware/          security.php, auth.php (requireStaff, requireAdmin - the library's RequireRole
                       in this site's words - requireFor, one method of a group: the languages'
                       DELETE; sweepVisitorsSoon)
  auth.php             signing in through the family's library (Anotoki\Lib\Auth): the IAM
                       (surveyIam()), its "Sign-in required" switch (surveySignInRule(),
                       authLoginRequired()), who a request is (surveyIdentify() - with this site's
                       visitors on the surveys' own routes - and currentUser(): a SiteUser)
  people.php           the people who signed in, through the family's people module
                       (Anotoki\Lib\People over users): the People page's columns, the visitors'
                       line, deleting a person's answers; the scrub of the accounts the IAM deleted
  admin_tools.php      the error log, the audit log and the backups - the family's
                       (Anotoki\Lib\ErrorLog, Audit, Backups): who acts (the token's person), the
                       proof a backup asks (a sign-in of the last ten minutes), the files in storage/
  surveys.php, responses.php, images.php   the data, by area
  translations.php     the site's words through the family's library (anotoki/lib's
                       Anotoki\Lib\Translations): surveyTranslations() - the languages the site is
                       released in, what deleting a language would leave behind (a survey written
                       in it: SurveyLanguageUsage) - and the site's error body for a refusal
  visitors.php         visitors: find, make (within the limits), hold, the clean-up, the move
  client_address.php   the address a request comes from, for the limits (trusted proxies only)
  survey_rules.php     what a survey and an answer must be - the twin of
                       ../frontend/src/app/core/survey/
  rich_text.php        richTextClean(): the editor's HTML and nothing else
  helpers.php          JSON in and out, text, and afterAnswer* (work done after the answer:
                       the visitors' clean-up)
  db.php               the connection (dbConnect(), db()), queries, ensureDatabase()
  migrations.php       the database's migrations through the family's library (vendor/anotoki/lib):
                       surveyMigrator() - the engine on the library's anotoki_admin, the site's set,
                       then the library's anotoki_translations and anotoki_people
                       (surveyMigrationSets()), under the one lock setup.php, migration.php, the
                       Migrations page's Apply, the backups and the tests' template take - a
                       backup first for the Apply and migration.php; surveySiteState() - where the
                       site stands, for the gate and /api/site-status; siteOpenWhileUpdating()
config/
  config.php           reads database.local.php and iam.local.php - both written by setup.php,
                       gitignored, never committed - and visitors.local.php when it is there
                       (optional, put there by hand; VISITOR_DEFAULTS without it)
migrations/survey/     the schema and the site's strings, NNN_name.sql (never edit an applied one)
storage/               cache (the IAM's keys, its "Sign-in required" answer, the daily backup's
                       stamp), logs (the error log, audit entries waiting for their table), backups,
                       visitors-swept (when the visitors' clean-up last ran); gitignored, and never
                       served (each folder guarded)
tests/                 run.php, lib.php; unit/, api/; tools/ (testdb.php, testenv.php)
tools/                 build.php (the upload -> ../dist/), translation_keys.php (the frontend's keys:
                       the library's KeyScanner, set up for this site)
vendor/                Slim and its pieces, and anotoki/lib 0.4.1 (the family's library, from GitHub -
                       ../DEV.md says how it is updated; its migration sets in php/migrations/, its
                       stand-in IAM for the tests in php/testing/) - committed: the hosting cannot
                       run Composer
```

## Entry points

| File | What |
| --- | --- |
| `router.php` | `php -S` behaving like the hosting's Apache: `/api/*` to `api/index.php`, `/setup.php`, and the built frontend |
| `setup.php` | the setup page: the database (host, port 5432, name `anotoki_survey`, user, password) and the IAM (address, client id); on this computer re-runnable, on a host with a token, locked after |
| `migration.php` | `php migration.php [--status \| --dry-run]`: the migrations for the configured database |
| `translations.php` | command line only - anotoki-lib's `TranslationsCommand` on this site's words: `--status` (the frontend's keys against the database), `--export sk [file]`, `--import sk file` |

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
anotoki library's test IAM's (its `TestIam`: a key of its own, tokens signed
with it; its stand-in IAM where a route asks the IAM itself), never the real
one. `unit/` holds
the rules, the rich text, the migrations (the engine and `php migration.php`,
each from nothing), the key scan and the site's words against it, migrations
010, 011 and 012 on a database shaped as an installed site's
(`strings_through_the_library`, `people_migration`, `sign_in_words`: an
owner's rewording moved under the library's key, the formal Slovak; every
person's row kept, the address gone), the switch's reader and
a request's address (`client_address`); `api/` the routes
end to end through a real `php -S` (`surveys`, `translations`, `auth`, `visitors`
(who a request is, the limits, the clean-up, the move - and what happens when
two requests meet: `somebody_else()` holds a row, `begin_call()` sends and
sees it wait),
`migrations`: the site gate in each state (not set up - installed or not -, an
update waiting, the database out of reach, ready), the status, and the
Migrations page's routes, `people`: the People page's routes and the scrub,
`admin_tools`: the error log, the audit log and the backups - each for
nobody, a MEMBER, an EDITOR and an ADMIN; what is written down; a backup
made, downloaded once, restored and deleted; the scrub after a restore, the
IAM answering or out of reach; a failed backup in the error log - and
`hosting`: the setup page and the upload as a host runs them). A test never
writes a file into `migrations/survey/` (a running site reads that folder): it
makes its database "behind" by taking rows out of its `migrations` table.
