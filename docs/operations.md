# Operations

## Where it runs

survey.anotoki.eu, on the same FTP-only hosting as the other anotoki sites:
PHP 8.5 FPM under Apache with `.htaccess`, PostgreSQL 14, no shell, no cron,
no long-running process, Cloudflare in front. The subdomain's document root is
the SFTP folder `anotoki.eu/sub/survey/`; the database is `anotoki_survey`.

Things the hosting does that matter here:

- `display_errors` is on: `api/bootstrap.php` switches it off in code, so a PHP
  message never lands in an answer.
- Apache passes `Authorization` to PHP; the `.htaccess` has `SetEnvIf` for a
  setup where it would not.
- Apache knows no MIME type for `.avif`: the pictures are served by PHP with
  their own type, so it does not matter.
- A URL naming a real folder without its slash gets a 301 from mod_dir even
  after a rewrite: no route may be named like a folder under the web root's
  `api/` (`routes`, `meddleware`).
- Cloudflare caches static files by extension for hours: `index.html` and
  `theme-boot.js` go out with `no-cache`; a picture's address ends in its
  extension and never changes, so caching it is right.

## A first install

1. `cd backend && php tools/build.php` → `dist/` at the top of the repository.
2. Upload everything in `dist/` into `anotoki.eu/sub/survey/`.
3. Open `https://survey.anotoki.eu/setup.php`. It writes a token into
   `storage/setup-token.php` - read it over FTP/SFTP - and asks for it with the
   database (`localhost`, 5432, `anotoki_survey`, the hosting's user and
   password) and the IAM (`https://iam.anotoki.eu`, `survey`). **Test the
   database** and **Test the IAM** say what they find; **Install** writes
   `config/database.local.php` and `config/iam.local.php`, makes the tables,
   writes `storage/installed.lock`, and deletes the token and itself.
4. The IAM must know the site (below).

## Later versions

Upload the new build over the old one: FTP never deletes, and the settings and
the lock stay. A version with a new migration makes the whole site answer 503
("The database needs an update") until it is applied: delete
`storage/installed.lock` over FTP, open `/setup.php` (the upload carries it),
give the token it writes and the same details - it applies what is missing,
keeps every survey and answer, and locks and deletes itself again.

## The IAM

The site signs in as the IAM's client `survey`. The IAM's migration
`005_survey_application.sql` registers it with the roles ADMIN and EDITOR,
open to every account, and gives ADMIN to the IAM's administrators of the
moment. On a development IAM it also gets `http://localhost:4700` (callback
`/auth/callback`, landing `/`, origin) and a card on the IAM's landing page; on
an IAM already installed on a real host it gets neither - there a localhost
callback would hand a code to whatever listens on the visitor's machine, and a
card would lead nowhere. So on the live IAM, after the migration:

- in the admin console → Applications → Surveys: the redirect URI
  `https://survey.anotoki.eu/auth/callback`, the post-logout URI
  `https://survey.anotoki.eu/`, the web origin `https://survey.anotoki.eu`, the
  home address `https://survey.anotoki.eu`, and "show on the landing page";
- roles: EDITOR for the people who write surveys (Users → the account).

(All of that was done for the live IAM when the site first went up, on
2026-09-29.)

A fresh IAM install asks for the site's address with the others (`SETUP_SITES`
in its `setup.php`).

## Backups

Everything is in the database, pictures included: a `pg_dump` of
`anotoki_survey` is the whole site's data. The config files are only the
connection and the IAM's address; setup.php writes them again.

## When something goes wrong

| Symptom | Likely cause |
| --- | --- |
| The whole site says it is not set up | A `config/*.local.php` is missing or incomplete, or a migration is pending (the site says "needs an update"). |
| 500 on every page after an upload | The host refused a line of the root `.htaccess` (`Options -Indexes`, `CGIPassAuth`): remove it. |
| Signing in ends at the IAM with an error about the redirect URI | The IAM does not have `https://survey.anotoki.eu/auth/callback` for `survey`. |
| Signed in, but every request says the sign-in ran out | `config/iam.local.php`'s issuer is not exactly `https://iam.anotoki.eu`, or the server cannot fetch the IAM's keys (`storage/cache/` not writable). |
| Pictures do not upload | Bigger than PHP's `post_max_size` on the host (the answer is then empty), or than 10 MB. |
| A picture shows crossed out | It was deleted: no survey showed it for a day. |
