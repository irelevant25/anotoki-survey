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
No `*.local.php`, no tests or tools, no composer files - check it, it is what
the world will be able to read.

## 2. Upload

Everything in `dist/` into the web root `anotoki.eu/sub/survey/` (over the old
files: FTP never deletes, and `config/*.local.php` and `storage/installed.lock`
on the host stay). Files that were removed from a version stay on the host
until deleted by hand - delete them if they matter.

## 3. The database

- **First install**: open `https://survey.anotoki.eu/setup.php`; it writes
  `storage/setup-token.php` (read it over SFTP) and asks for the token, the
  database (`localhost`, 5432, `anotoki_survey`, the hosting's user) and the
  IAM (`https://iam.anotoki.eu`, client id `survey`). Test both, then Install.
  It locks (`storage/installed.lock`) and deletes itself.
- **A version with a new migration**: the site answers 503 "needs an update"
  until it is applied. Delete `storage/installed.lock`, open `/setup.php` (the
  upload carries it), give the new token and the same details. It applies what
  is pending and locks and deletes itself again.
- **No new migration**: nothing to do; `setup.php` from the upload deletes
  itself when opened (the lock is there).

## 4. The IAM

The site signs in as `survey`. On the live IAM the application needs
`https://survey.anotoki.eu/auth/callback` (login), `https://survey.anotoki.eu/`
(logout), the origin and home `https://survey.anotoki.eu` - the IAM's migration
005 registers the site and its roles but gives a live IAM no address. The admin
console's Applications page is the place; EDITOR roles in Users.

## 5. Check

- `https://survey.anotoki.eu/api/health` → `{"ok":true}`;
  `/api/auth/config` → the live IAM and `survey`.
- `https://survey.anotoki.eu/setup.php` does not show the installer.
- `/config/database.local.php`, `/storage/`, `/vendor/composer/installed.json`,
  `/api/auth.php` are refused (403), not served.
- Sign in; open `/admin` as the owner; a survey's picture loads.
- Cloudflare may serve an old `index.html` for a while after an upload: it goes
  out with `no-cache`, so a reload gets the new one.
