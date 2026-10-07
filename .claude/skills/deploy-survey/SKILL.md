---
name: deploy-survey
description: Build the survey site for the FTP-only hosting and ship it to survey.anotoki.eu - the upload, the installer on a first install, re-running it for a version with a new migration, and the IAM's registration of the site. Use when the user asks to deploy, release, upload or publish the survey site, or asks what a new version needs on the hosting.
---

# Deploy the survey site

The hosting is FTP/SFTP only - PHP, PostgreSQL, Apache with `.htaccess`, no
shell. Everything a release needs goes up as files; the database is changed by
the site's own installer. [docs/operations.md](../../../docs/operations.md) has
the hosting's quirks and the troubleshooting table.

Ask for (and never print, store in the repository, or put in a commit) the
SFTP login and the database password; they are the owner's to give per session.
Confirm with the owner before uploading - it changes the live site.

## 1. Build

```bash
cd backend
php tests/run.php                  # green first
cd ../frontend && npm test         # and these
cd ../backend && php tools/build.php
```

`dist/` at the top of the repository holds the upload: the app, `.htaccess`,
`setup.php`, `api/`, `config/config.php`, `migrations/`, `vendor/` (with
`vendor/anotoki/lib`, the family's library), `storage/`.
No `*.local.php`, no tests or tools, no `migration.php` or `translations.php`
(the command line's), no composer files - check it, it is what the world will
be able to read.

**A version whose migrations change the site's strings** (a reworded default,
a deleted key): before uploading, export each language on the live site -
`/admin/translations` → Export - and keep the files. Migrations never write
over a string somebody reworded there, but a deleted key takes its strings
with it, and the files are the only copy of the live wording outside a
database backup. [docs/operations.md](../../../docs/operations.md) (*The site's
words and languages*) has the rest, and how a language is added.

## 2. Upload

For a version with a new migration that will be applied with the setup page
(not the Migrations page), delete `storage/installed.lock` on the host BEFORE
uploading (step 3 says why). Then everything in `dist/` into the
web root `anotoki.eu/sub/survey/` (over the old files: FTP never deletes, and
`config/*.local.php` on the host stays - and the lock, for a version with no
new migration). Files that were removed from a version stay on the host until
deleted by hand - delete them if they matter.

`config/visitors.local.php` (the visitors' limits and trusted proxies) is
never in the upload and nothing writes it: the owner puts it into the web
root's `config/` by hand over SFTP, and it stays across uploads. Before the
IAM's "Sign-in required" is switched off for the survey it should hold
Cloudflare's ranges in `trusted_proxies` (the site is behind Cloudflare's
proxy) - [docs/operations.md](../../../docs/operations.md#visitors). Once it is
off, one check on the host: a POST of answers without a token answers 201
with an `X-Visitor-Key` header, and the same key sent back makes
`GET /api/surveys/<slug>` say `answeredAt` (Apache passes `X-*` headers to
PHP; this proves it). And in a private window: the home page opens without
signing in, under the visitor notice ("... for 30 days ..."), a survey sent
shows "Taken" after a reload, and `/admin` still goes to the IAM; the
results list that answer as "Visitor N", "Not signed in".

## 3. The database

- **First install**: open `https://survey.anotoki.eu/setup.php`; it writes
  `storage/setup-token.php` (read it over SFTP) and asks for the token, the
  database (`localhost`, 5432, `anotoki_survey`, the hosting's user) and the
  IAM (`https://iam.anotoki.eu`, client id `survey`). Test both, then Install.
  It locks (`storage/installed.lock`) and deletes itself.
- **A version with a new migration**: the site is closed until it is applied
  - the API answers 503 `update_pending`, and everybody reads the anotoki
  family's "The site is being updated" (no error, no setup page). Back the
  database up first. The usual way: the owner signs in as an ADMIN from that
  page's quiet "Sign in" (or straight at `/admin/migrations`, where the
  sign-in comes back to the page) - "A database update is waiting" links to
  the admin panel's **Migrations** page (nobody else gets the link) - and
  presses **Apply pending**: the files run in order, each in its own
  transaction; a failure is rolled back whole and shown with the database's
  whole error ("Stopped at <file>"), and the next Apply goes on from there.
  Once nothing is pending the site runs again. The lock stays where it is.
  The other way, the setup page: with the lock deleted before the upload, open
  `/setup.php` (the upload carries it), give the new token and the same
  details. It applies what is pending and locks and deletes itself again. (The
  two never run at once: one lock, and the second says another update is
  running.) If
  `setup.php` was opened while the lock was still there (anybody may) it has
  deleted itself: delete the lock, upload `setup.php` again. The version that
  brings the family's library (anotoki-lib 0.1.0) is one: `009` (the "not set
  up yet" page's strings deleted) - and it leaves `api/migration_runner.php`,
  `api/database_update.php` and `api/meddleware/setup.php` of the version
  before on the host, read by nothing: delete them. The version that brings the
  languages is one: `002` (the tables of the site's words, English and
  Slovak), `003` (the strings), `004` (the language an answer was read in).
  The surveys need nothing. Tell the editors beforehand: an editor page left
  open across the upload cannot save any more - the refusal it shows says so,
  and what to do ("copy what you changed since the last save, then reload the
  page") - so nothing should be left typed and unsaved in one.
- **No new migration**: nothing to do; `setup.php` from the upload deletes
  itself when opened (the lock is there).

## 4. The IAM

The site signs in as `survey`. On the live IAM the application needs
`https://survey.anotoki.eu/auth/callback` (login), `https://survey.anotoki.eu/`
(logout), the origin and home `https://survey.anotoki.eu`, and "show on the
landing page" for its card - the IAM's migration 005 registers the site and its
roles but gives a live IAM no address and no card. The admin panel's
Applications page is the place. Roles are given in Users: EDITOR to the people
who write surveys, and ADMIN too on an IAM installed from scratch - 005 gives
ADMIN only to the administrators the IAM had when it ran.

## 5. Check

- `https://survey.anotoki.eu/api/health` → `{"ok":true}`;
  `/api/auth/config` → the live IAM and `survey`, and `loginRequired` - `true`
  until the IAM's 010 is applied there and its "Sign-in required" is switched
  off for the survey (the site asks the IAM through the SDK; `storage/cache/`
  must be writable); `visitorDays` - 30, or the `keep_days` of
  `config/visitors.local.php`.
- `https://survey.anotoki.eu/setup.php` does not show the installer.
- `/config/database.local.php`, `/storage/`, `/vendor/composer/installed.json`,
  `/api/auth.php` are refused (403), not served.
- Sign in; open `/admin` as the owner; a survey's picture loads.
- `https://survey.anotoki.eu/api/translations/sk` → `"language":"sk"` and the
  strings; the home page in Slovak (the chooser, or `/?lang=sk`) shows words,
  never a key like `home.title`; `/admin` is English all the same.
- `/api/translations/sk-sk` answers the same (`"language":"sk"`): a Slovak
  browser's first visit is one request. And asking again is a 304:
  `curl -sI -H 'Accept-Encoding: gzip' https://survey.anotoki.eu/api/translations/sk`,
  then the same with `-H 'If-None-Match: <the ETag it showed>'` - whether the
  host marks the tag `-gzip` or Cloudflare weakens it (`W/`).
- Not something to try on the live site for its own sake, but to know when
  the owner adds a language (`/admin/languages`): it starts Hidden unless the
  form's switch "Offer it to readers right away" is on; and if adding one
  answers 503 while everything else works, the database user may not lock the
  `languages` table ([docs/operations.md](../../../docs/operations.md), the
  troubleshooting table).
- Cloudflare may serve an old `index.html` for a while after an upload: it goes
  out with `no-cache`, so a reload gets the new one.
