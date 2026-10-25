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
                       backups' still answer; 503 maintenance while its ADMIN has closed the site -
                       to all but that ADMIN, known by the token alone: surveyTokenPerson()), the
                       people's upkeep (the scrub, at most hourly, after
                       the answer), the daily backup, the routes - each group with the library's
                       Identify in front of it (who the request is, once)
  bootstrap.php        what every entry point loads: settings, error handling, the site's functions
  routes/              public.php (health, the site's status, sign-in settings - the library's
                       AuthRoutes - pictures, a language's strings - the library's bundle route -,
                       a page's error into the error log - the library's ErrorLogRoutes::client -,
                       what every page is told of the site settings - GET /api/site-settings, the
                       library's SiteSettingsRoutes -, and /robots.txt and /sitemap.xml - its
                       RobotsRoutes),
                       surveys.php (the people taking surveys - signed in, or a visitor while the
                       IAM says sign-in is not required: the library's RequireCaller), visitor.php
                       (POST /api/visitor/move: at sign-in, a visitor's answers into the account),
                       feedback.php (POST /api/feedback - the family's form, anybody's: the
                       library's FeedbackRoutes, the sender the token's id alone),
                       admin.php (/api/admin/..., EDITOR / ADMIN; the strings and the languages -
                       the family's routes, EDITOR / ADMIN, deleting a language ADMIN's; the
                       migrations, the people, feedback, the error log, the audit log, the
                       backups, the site settings - the family's routes - ADMIN alone, judged from
                       the token; Page access - the library's PageAccessGate - after the editors'
                       check)
  meddleware/          security.php, auth.php (requireStaff, requireAdmin - the library's RequireRole
                       in this site's words - requireFor, one method of a group: the languages'
                       DELETE; sweepVisitorsSoon)
  auth.php             signing in through the family's library (Anotoki\Lib\Auth): the IAM
                       (surveyIam()), its "Sign-in required" switch (surveySignInRule(),
                       authLoginRequired()), who a request is (surveyIdentify() - with this site's
                       visitors on the surveys' own routes - and currentUser(): a SiteUser)
  people.php           the people who signed in, through the family's people module
                       (Anotoki\Lib\People over users): the People page's columns, the visitors'
                       line, deleting a person's answers (peopleDelete(): the page's and a
                       restore's, on the connection it is given) and forgetting them on their
                       feedback (peopleForgetFeedback()); the scrub of the accounts the IAM
                       deleted
  admin_tools.php      the error log, the audit log, the backups and feedback - the family's
                       (Anotoki\Lib\ErrorLog, Audit, Backups, Feedback): who acts (the token's
                       person), the proof a backup asks (a sign-in of the last ten minutes), whose
                       address a request is (Cloudflare's rule), the people's names, the files in
                       storage/; a restore's hooks (People::restoreHooks(): the People deletes
                       since the backup done again inside it, the scrub after it); surveyFeedback()
                       and its sender (surveyFeedbackSender(): the token's id, nothing else)
  site_settings.php    the site settings - the library's SiteSettings (surveySiteSettings()):
                       maintenance, the announcement, Page access over the participant's pages, and
                       what no row may claim (the sign-in's configuration, the pictures, the
                       preview) - and robots.txt and sitemap.xml (surveyRobots(): the library's
                       Robots, by siteAddress(); sitemapSurveys(): the list and each open survey
                       while visitors are welcome)
  surveys.php, responses.php, images.php   the data, by area
  translations.php     the site's words through the family's library (anotoki/lib's
                       Anotoki\Lib\Translations): surveyTranslations() - the languages the site is
                       released in, what deleting a language would leave behind (a survey written
                       in it: SurveyLanguageUsage) - and the site's error body for a refusal
  visitors.php         visitors: find, make (within the limits), hold, the clean-up, the move
  client_address.php   the address a request comes from, for the limits - the library's ClientAddress
                       over the visitors' settings (Cloudflare's ranges by default) - and what is
                       kept of it: a keyed HMAC (a pseudonym), never the address in the clear;
                       the header pinned - CF-Connecting-IP alone, never a setting - and, with the
                       origin secret, believed only on a request carrying it (X-Anotoki-Origin)
  survey_rules.php     what a survey and an answer must be - the twin of
                       ../frontend/src/app/shared/survey/
  rich_text.php        richTextClean(): the editor's HTML through the library's RichHtml::clean() -
                       its tags, links and styles and nothing else - within the site's limit
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
  config.php           reads every *.local.php through settingsFileReadCleanly() - one that does
                       not start with <?php is passed over uncompiled, what a file prints as PHP
                       reads it is caught, never sent; settingsSaid() says its fault once a day,
                       never its text: database.local.php and iam.local.php - both
                       written by setup.php, gitignored, never committed; one not read cleanly
                       leaves the site not set up - and visitors.local.php when it is there
                       (optional, put there by hand; VISITOR_DEFAULTS without it or for one not
                       read cleanly - the trusted proxies Cloudflare's published ranges), and
                       cloudflare.local.php (optional, by hand too: the origin secret,
                       originSecret() - none without it, and a secret no request carries for one
                       that cannot be read cleanly, names no usable origin_secret or is a
                       folder: fails closed; deleting the file switches it off), and site.local.php
                       (optional, by hand too: the site's own address, siteAddress(), which
                       robots.txt and sitemap.xml name - without it, or for one not read cleanly,
                       https://survey.anotoki.eu in a release and http://localhost:4700 here)
migrations/survey/     the schema and the site's strings, NNN_name.sql (never edit an applied one)
storage/               cache (the IAM's keys, its "Sign-in required" answer, the daily backup's
                       stamp, feedback's limits and its daily clean-up's stamp), logs (the error
                       log, audit entries waiting for their table), backups,
                       anotoki-lib.key (the installation's own key, made once by the library: the
                       error log's and the visitors' address hashes, the backups' seal),
                       visitors-swept (when the visitors' clean-up last ran), cache/said-*.logged
                       (a settings file's fault said today); gitignored, and never
                       served (each folder guarded)
tests/                 run.php, lib.php; unit/, api/; tools/ (testdb.php, testenv.php)
tools/                 translation_keys.php (the frontend's keys: the library's KeyScanner, set up for
                       this site). The release is anotoki-deploy's (anotoki-lib's deploy tool, set up
                       in composer.json's extra["anotoki-deploy"]; ../DEV.md, Building and deploying)
vendor/                Slim and its pieces, and anotoki/lib 0.11.1 (the family's library, from GitHub -
                       ../DEV.md says how it is updated; its migration sets in backend/migrations/,
                       its stand-in IAM for the tests in backend/testing/) - committed: the hosting
                       cannot run Composer
```

## Entry points

| File | What |
| --- | --- |
| `router.php` | `php -S` behaving like the hosting's Apache: `/api/*`, `/robots.txt` and `/sitemap.xml` to `api/index.php`, `/setup.php`, and the built frontend |
| `setup.php` | the setup page: the database (host, port 5432, name `anotoki_survey`, user, password) and the IAM (address, client id); on this computer re-runnable, on a host with a token, locked after |
| `migration.php` | `php migration.php [--status \| --dry-run]`: the migrations for the configured database |
| `translations.php` | command line only - anotoki-lib's `TranslationsCommand` on this site's words: `--status` (the frontend's keys against the database), `--export sk [file]`, `--import sk file` |

## Commands

```bash
composer start                                # http://localhost:8500 - the API and setup.php
php migration.php --status                    # what is applied, what is pending
php translations.php --status                 # every key the frontend uses has its strings
# the release: anotoki-deploy, from ../frontend/ (../DEV.md, Building and deploying)
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
person's row kept, the address gone), migration 014 on a fresh and an
installed site (`feedback_words`: the library's feedback words in formal
Slovak, an owner's rewording kept), the switch's reader and
a request's address (`client_address`: Cloudflare's rule, the library's
error log's too: X-Real-IP / True-Client-IP / X-Forwarded-For never
believed, a catch-all range refused, only a keyed HMAC kept; a
`cloudflare.local.php` broken or naming no usable secret failing closed); `api/` the routes
end to end through a real `php -S` (`surveys`, `translations`, `auth`, `visitors`
(who a request is, the limits, the clean-up, the move - and what happens when
two requests meet: `somebody_else()` holds a row, `begin_call()` sends and
sees it wait),
`migrations`: the site gate in each state (not set up - installed or not -, an
update waiting, the database out of reach, ready), the status, and the
Migrations page's routes, `people`: the People page's routes, a delete never
made without its audit entry, and the scrub, `site_settings`: the site
settings' routes for the ADMIN alone, each change audited, maintenance closing
the API to all but the ADMIN (a forged, expired or another site's token
nobody's), Page access (423 on a row's API paths, never to the ADMIN, never
a reserved path), robots.txt and sitemap.xml by the configured address, never
a request's Host, `feedback`: the form's route for
anybody (a bad token refused, a visitor's key never read, the limits, the
robots' field, nothing of an address kept), the Feedback page's for an ADMIN
alone (read, marked, deleted, each audited), a People delete forgetting the
sender,
`admin_tools`: the error log, the audit log and the backups - each for
nobody, a MEMBER, an EDITOR and an ADMIN; what is written down - the pages'
own errors too, redacted, and their caps; a backup made, named by its maker,
downloaded once, restored and deleted; only a sealed one restored here; a
person's answers deleted since a backup deleted again inside its restore; the
scrub after a restore, the IAM answering or out of reach; a failed backup in
the error log - and
`hosting`: the setup page and the upload as a host runs them - its `.htaccess`
running `setup.php` and `host-check.php` alone). A test never
writes a file into `migrations/survey/` (a running site reads that folder): it
makes its database "behind" by taking rows out of its `migrations` table.
