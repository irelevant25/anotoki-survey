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
`vendor/anotoki/lib`, the family's library - its migration sets
`php/migrations/` too: `admin/` before the site's own, `translations/` and
`people/` after them), `storage/`.
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

**The version whose words are the family's library's** (anotoki-lib 0.3.0:
migration `010_strings_through_the_library.sql`, then the library's
`anotoki_translations/001` and `/002` - four files under two headings on the
Migrations page): export each language first, as above; save whatever is
typed and not saved on the admin Translations and Languages pages (a tab's
drafts holding a Languages row typed before the upload are not read again);
after the upload reload every admin
page that was open (an old page no longer reads or saves a language's
`native_name` and `sort_order`). 010 moves the site's strings for the kit
under the library's keys, an owner's rewording with them, and stops - rolled
back whole - if anything would be lost.

**The version on anotoki-lib 0.4.1** (signing in, the people and the admin
tools are the library's): seven files on the Migrations page, in the order they
run - `anotoki_admin/001_audit_log.sql`, `/002_feedback.sql`,
`011_people.sql` (**drops `users.email`**: the site keeps no address - the
owner's decision; its gate proves every other column of every row
unchanged), `012_sign_in_words.sql` (the site's sign-in strings under the
library's keys, an owner's rewording with them), then
`anotoki_translations/003_…`, `/004_…` and `anotoki_people/001_people.sql`.
Export each language first, as above. The Apply makes a backup of the
database first (the library's, `storage/backups/`): PHP must be able to write
`storage/` (it makes `logs/` and `backups/`). After the upload delete
`api/anotoki_iam.php` from the host (read by nothing now), and check that
`https://survey.anotoki.eu/storage/anotoki-lib.key` answers 403 (the
library's key: never served). That first backup, `before-migration`, is made
before 011 runs and still holds `users.email`: once the site runs again and
works, **the owner deletes it** on System → Backups. The IAM must have
its `GET /api/public/anonymized-accounts` (its 016) for the scrub of deleted
accounts; until it answers, the People page says the check stopped, and
nothing else is affected.

**The same version on anotoki-lib PHP 0.5.1, Angular 0.5.0** (no migration of
its own; 0.5.1 - the PHP half alone - restores a database that ever had a
visitor, which 0.5.0 could not): the
host needs PHP's `mbstring` (the library requires it; the setup page checks
it) and `zlib` (the backups compress with it: without it every backup fails,
and the error log says so). A plain backup is sealed under the installation's key
(`storage/anotoki-lib.key`, which the upload never carries and FTP never
deletes), and only a sealed one is restored on the Backups page: every backup
made before 0.5.0 has no seal and is restored offline alone - **make one by
hand on System → Backups once the update is in** (it is the first that the
page restores at today's migrations). The visitors' trusted proxies are
Cloudflare's published ranges without a word in `config/visitors.local.php`:
a `trusted_proxies` there replaces them - one written before (a list of
Cloudflare's ranges, as operations.md used to show) still works, the same
list; delete it to follow the library's. A catch-all range there is refused
(logged, the default holding), and `client_ip_header` is no setting any more
(logged, left out): the header is `CF-Connecting-IP`, pinned.

**The same version on anotoki-lib PHP 0.5.2, Angular still 0.5.0** (no
migration of its own): the origin secret. First the Cloudflare zone's
Transform Rule (Rules → Transform Rules → Modify Request Header → "Set static"
`X-Anotoki-Origin` to the secret, every request of the zone - a site without
the secret pays it no heed), then `config/cloudflare.local.php` on the host by
hand (`<?php return ['origin_secret' => '<the same value>'];` - a long random
value, 32+ characters, the same file in every anotoki site): from then on
`CF-Connecting-IP` is believed only on a request carrying the secret. Never
print it; without the file the site works as before
([docs/operations.md](../../../docs/operations.md#visitors)).

**The version on anotoki-lib 0.6.1, both halves**: the legal pages (`/terms`,
`/privacy`, `/contact`, for anybody) and their links at the foot of the
survey's pages, the kit's link cards and removable chips, and a
`config/cloudflare.local.php` that cannot be read cleanly failing closed -
after the upload, if visitors are suddenly refused "too many" from
everywhere, PHP's error log says why once a day (`[cloudflare] ...`): mend the
file (save it as UTF-8 without a byte-order mark, its first line `<?php`).
Every other `config/*.local.php` is read the same careful way: one saved so
never prints what it holds - a database or IAM file leaves the site "not set
up" (`[config] ...` in the log, and the setup page on the owner's computer
says which), a visitors file means the defaults (`[visitors] ...`).
It brings `013_legal_pages.sql`, then the library's
`anotoki_translations/005_…` to `010_…`: Apply on the Migrations page. Before
the upload move any survey opened at the address `terms`, `privacy` or
`contact` (the legal page answers there from now on, and the editor refuses
those addresses). After it, open `/privacy` signed out: the anotoki account's
Privacy page and account page are the IAM's.

## 2. Upload

For a version with a new migration that will be applied with the setup page
(not the Migrations page), delete `storage/installed.lock` on the host BEFORE
uploading (step 3 says why). Then everything in `dist/` into the
web root `anotoki.eu/sub/survey/` (over the old files: FTP never deletes, and
`config/*.local.php` on the host stays - and the lock, for a version with no
new migration). Files that were removed from a version stay on the host until
deleted by hand - delete them if they matter.

`config/visitors.local.php` (the visitors' limits and trusted proxies) and
`config/cloudflare.local.php` (the origin secret) are never in the upload and
nothing writes them: they are put into the web root's `config/` by hand over
SFTP, and they stay across uploads. Before the
IAM's "Sign-in required" is switched off for the survey, nothing in it is
needed for Cloudflare: its ranges are the default (anotoki-lib 0.5.0) -
[docs/operations.md](../../../docs/operations.md#visitors). Once it is
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
  family's "The site is being updated" (no error, no setup page). The Apply
  backs the database up first (the library's backups - a backup that cannot
  be made stops it before anything runs; System → Backups lists it, kept until
  the owner deletes it). The usual way: the owner signs in as an ADMIN from that
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
  `/api/auth/config` → the live IAM and `survey` (`issuer`, `client_id`),
  and `login_required` - `true` until the IAM's 010 is applied there and its
  "Sign-in required" is switched off for the survey (the site asks the IAM
  through the library's `SignInRule`; `storage/cache/` must be writable);
  `sign_in_available` - `true`; `visitor_days` - 30, or the `keep_days` of
  `config/visitors.local.php`.
- As the owner (ADMIN): System in the admin panel's bar - People lists the
  people who signed in; the error log, the audit log and the backups open
  (the Apply's backup listed); `/storage/logs/`, `/storage/backups/` and
  `/storage/anotoki-lib.key` are refused (403), not served.
- `https://survey.anotoki.eu/setup.php` does not show the installer.
- `/config/database.local.php`, `/storage/`, `/vendor/composer/installed.json`,
  `/api/auth.php` are refused (403), not served.
- Sign in; open `/admin` as the owner; a survey's picture loads.
- `https://survey.anotoki.eu/api/translations/sk` → `"language":"sk"` and the
  strings (the library's `anotoki.*` among them; the languages with
  `native_name`); the home page in Slovak (the chooser, or `/?lang=sk`) shows
  words, never a key like `home.title`, and the person's menu says "Váš anotoki
  účet" - formal, never "Tvoj"; `/admin` is English all the same, and
  `/admin/translations` lists the library's keys among the site's.
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
