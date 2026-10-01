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
`setup.php`, `api/`, `config/config.php`, `migrations/`, `vendor/`, `storage/`.
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

For a version with a new migration, delete `storage/installed.lock` on the
host BEFORE uploading (step 3 says why). Then everything in `dist/` into the
web root `anotoki.eu/sub/survey/` (over the old files: FTP never deletes, and
`config/*.local.php` on the host stays - and the lock, for a version with no
new migration). Files that were removed from a version stay on the host until
deleted by hand - delete them if they matter.

## 3. The database

- **First install**: open `https://survey.anotoki.eu/setup.php`; it writes
  `storage/setup-token.php` (read it over SFTP) and asks for the token, the
  database (`localhost`, 5432, `anotoki_survey`, the hosting's user) and the
  IAM (`https://iam.anotoki.eu`, client id `survey`). Test both, then Install.
  It locks (`storage/installed.lock`) and deletes itself.
- **A version with a new migration**: the site is closed (503, "not set up
  yet") until it is applied. With the lock deleted before the upload, open
  `/setup.php` (the upload carries it), give the new token and the same
  details. It applies what is pending and locks and deletes itself again. If
  `setup.php` was opened while the lock was still there (anybody may: the
  closed site's own button leads to it) it has deleted itself: delete the
  lock, upload `setup.php` again. The version that brings the
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
roles but gives a live IAM no address and no card. The admin console's
Applications page is the place. Roles are given in Users: EDITOR to the people
who write surveys, and ADMIN too on an IAM installed from scratch - 005 gives
ADMIN only to the administrators the IAM had when it ran.

## 5. Check

- `https://survey.anotoki.eu/api/health` → `{"ok":true}`;
  `/api/auth/config` → the live IAM and `survey`.
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
