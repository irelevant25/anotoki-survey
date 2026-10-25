# Developing anotoki survey

From a fresh clone to a running site, then the day to day, the tests, and the
build for the hosting.
Each folder says what is in it and its own commands:
[`backend/README.md`](backend/README.md) and
[`frontend/README.md`](frontend/README.md).

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

### The anotoki family's library

The database's migrations - the engine, the gate in front of the API, the page
drawn while the site cannot run and the admin panel's Migrations page - the
site's words - the tables' one implementation on the server (the bundle, the
admin routes, the command line), the language and the strings in the browser,
the admin panel's Translations and Languages pages (`backend/api/translations.php`
and the frontend's `shared/translations.ts` wire them in) - the UI kit - the
family's styles and tokens, its components, the top bar and the theme (the
frontend's `shared/kit.ts` wires it in) - signing in through the IAM (both
halves' `Auth`: `backend/api/auth.php`, the frontend's `shared/auth/`), the
people (`backend/api/people.php`, the People page) and the admin tools (the
error log, the audit log, the backups: `backend/api/admin_tools.php`, the
frontend's `shared/admin/admin-tools.ts`) - are
the shared library **anotoki-lib** (`https://github.com/irelevant25/anotoki-lib`,
its README), one version for both halves:

| Half | Where it is declared | Installed into |
| --- | --- | --- |
| PHP, `anotoki/lib` | `backend/composer.json`: the GitHub repository (`"type": "vcs"`) and `"anotoki/lib": "^0.11.0"` (on 0.x a `^0.10.0` would never take 0.11) | `backend/vendor/anotoki/lib` (committed, like the rest of `vendor/`): its code, its stand-in IAM for the tests (`backend/testing/stand-in-iam.php`), and its migration sets (`backend/migrations/`) - `anotoki_admin` (before the site's own), `anotoki_translations` and `anotoki_people` (after them) |
| Angular, `@anotoki/lib` | `frontend/package.json`: the release's tarball, `https://github.com/irelevant25/anotoki-lib/releases/download/v0.11.1/anotoki-lib-0.11.1.tgz` | `frontend/node_modules` (`bun.lock` and `package-lock.json` both name it) |

Both halves are at 0.11.1 (0.6.0 brought the legal pages, the kit's new pieces
and the admin pages' fixes; 0.6.1 a sentence of the Privacy page - its
translations `010`; 0.6.2 three more - `011`, which keeps a site's own
words - and the feedback form; 0.6.3 the family's footer, `@anotoki/lib/footer`,
and its four words - translations `012`; 0.7.0 nothing the site does - the
library's own folders renamed, its PHP half's files now in
`backend/vendor/anotoki/lib/backend/`; 0.7.1 the footer's version written
short, "v0.4.0"; 0.7.2 the feedback form saying itself whom its message is
for - the site's own interceptor gone - and the library's words in the
reader's language while no bundle is in memory; 0.8.0 the About and Support
pages and the footer's links to them - translations `013` - and the feedback
form's kept draft and Clear; 0.10.0 the admin panel's frame, `@anotoki/lib/admin/frame` -
the site's admin panel in it, its top bar the public site's alone; 0.11.0 the site
settings - `@anotoki/lib/site-settings`, `@anotoki/lib/admin/site-settings`,
`Anotoki\Lib\SiteSettings`, their tables `anotoki_admin/003` -, robots.txt and
sitemap.xml (`Anotoki\Lib\Robots`), the HTML editor and rich text
(`@anotoki/lib/ui/html-editor`, `/ui/rich-html`, `Anotoki\Lib\RichHtml`), the
dates (`@anotoki/lib/ui/dates`), the search's folding (`@anotoki/lib/ui/search`)
and their words - translations `014` and `015`; 0.11.1 the announcement bar and
the administrators' notice out of the first load - `@anotoki/lib/site-settings/bar`,
`/notice`, fetched only when there is something to draw -, and the error log
leaving `maintenance` out, a state like `update_pending`); a release that changes one half only says so in its CHANGELOG. The
kit is imported a piece at a time, each from its
own entry point (`@anotoki/lib/ui/button`, `@anotoki/lib/ui/icon`, ...: the
smaller first load), never from the `@anotoki/lib/ui` barrel; the admin pages
of the words, the People page and the admin tools' pages come with lazy entry
points of their own (`@anotoki/lib/translations/admin`,
`@anotoki/lib/people/page`, `@anotoki/lib/admin/errors`, `/audit`,
`/backups`), and so do the sign-in's callback page and its failure's screen
(`@anotoki/lib/auth/screens`, loaded as they are shown) and the legal pages
(`@anotoki/lib/legal/pages` - Terms, Privacy, Contact -, with their frame and
the site's facts: `sites/main/legal-layout`, `shared/legal/legal-facts.ts`) and
About and Support (`@anotoki/lib/legal/about`, `/support`, in the same frame); the
family's footer is `@anotoki/lib/footer` (`<anotoki-site-footer>`, in the first
load, with the links to them, `@anotoki/lib/legal`'s `<anotoki-legal-links>`;
its feedback dialog comes with the press, `@anotoki/lib/feedback/form`'s
`<anotoki-feedback-dialog>`); the pages' errors
go to the error log through `@anotoki/lib/error-report` (`app.config.ts`).
The admin panel's frame is `@anotoki/lib/admin/frame` (`<anotoki-admin-frame>`, in
the admin area's own chunk, `sites/admin/app.component.ts`).
The package brings Manrope
with it (`@fontsource-variable/manrope`, its dependency) and the theme's
`theme-boot.js` (`angular.json` copies it next to `index.html`).

To update to a new release, both halves together (0.x: a minor version may
break - read its CHANGELOG first; a release that changes one half only says
so there):

```bash
cd backend && php composer.phar update anotoki/lib --prefer-dist   # the constraint in composer.json first, if the version needs it
cd frontend && bun install && npm install                          # after the tarball's address in package.json
```

Then commit `backend/composer.json`, `composer.lock`, `vendor/` and
`frontend/package.json`, `bun.lock`, `package-lock.json`, and run every test.
Always from GitHub, never from a local copy of the library.

## First setup

Everything that belongs to one installation - the database connection, the
IAM's address and this site's client id there - lives in
`backend/config/database.local.php` and `backend/config/iam.local.php`. They
are gitignored and **required**: without them the API answers every request
`503 {code: "not_set_up"}`, and the site shows the family's page "This site is
not set up yet" with a link to the setup page (on this computer always: the
link goes only once the setup has finished on a real host). Nothing falls back
to a committed default. The setup page writes them.

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
out) with the roles **ADMIN** and **EDITOR**, and gives ADMIN to the IAM's
administrators of the moment; `php migration.php` in its `backend/` (or its
setup page, saved again) applies it to an IAM set up before. Anybody with an
account may take surveys (every account holds MEMBER, from the IAM's 010 on);
the admin panel needs EDITOR or ADMIN, given in the
IAM's admin panel (Users → the account → roles). An IAM installed from
scratch has no accounts yet when its migrations run, so there its own
administrators are given the site's ADMIN that way too.

Without the IAM nobody gets past the sign-in - every page of the site goes
there first (only the pages drawn while the site cannot run draw without it:
the family's page - not set up, an update waiting, out of reach - and the
"cannot be reached" card; with "Sign-in required" off, the pages people take
surveys on do too); the tests and the browser check (below) sign in through a
stand-in instead. The backend also asks the IAM whether the site requires
sign-in (its "Sign-in required" switch, kept a minute in `storage/cache/`):
an IAM that does not answer that yet means "required". The stand-in answers
it too (`login_required`, default true: `POST /_test/state`); the PHP tests
never ask an IAM for it - their settings carry `application_file`, a file that
stands in for the answer (`test_application_file()` in `tests/lib.php`).

With the switch off (in your IAM's admin panel: Applications → survey →
"Sign-in required"; within a minute here, then reload) the site takes
**visitors**: open `http://localhost:4700` in a private window and take a
survey without signing in - the browser keeps its key in localStorage
(`anotoki-survey:visitor`), the home page says "Taken", and signing in moves
the answers (and any unfinished draft) into the account, with a toast. The
admin panel and `/preview/...` still sign in first; the results list a visitor
as "Visitor N", "Not signed in" where a person's address is. To try the API by hand:
`curl -i -X POST -H 'Content-Type: application/json' -d '{"answers": {...}}'
http://localhost:8500/api/surveys/<slug>/responses` answers 201 with the key in
the `X-Visitor-Key` header; send it back in that header and the survey says
`answeredAt`. The limits and trusted proxies are an optional
`backend/config/visitors.local.php` (gitignored like the others; nothing
writes it - [docs/operations.md](docs/operations.md#visitors)); without one the
defaults hold - Cloudflare's published ranges the only proxies believed - and
on this computer every request comes from `127.0.0.1`, one address: 30 new
visitors an hour from it. `backend/config/cloudflare.local.php` (the origin
secret, the same in every anotoki site; gitignored, nothing writes it) is for
the host behind Cloudflare - a computer of yours needs none. Nor does
`backend/config/site.local.php` (`return ['address' => 'https://...'];`,
optional, gitignored, nothing writes it): the site's own public address, which
`/robots.txt` and `/sitemap.xml` name - without it `https://survey.anotoki.eu`
in a release and `http://localhost:4700` here.

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
| `/preview/{id}` | the editor's preview of any survey, open or not; nothing is kept. `?language=sk` shows a translation, text by text; without `?language=` the survey as it is written, whatever language the page is in |
| `/admin` | the surveys (EDITOR, ADMIN) |
| `/admin/surveys/{id}/edit` | the editor |
| `/admin/surveys/{id}/results` | the results - `?tab=people`, and the drill-down below |
| `/admin/surveys/{id}/responses/{id}` | one person's answers on a page of its own |
| `/admin/translations` | the site's own words: every key, a column a language |
| `/admin/languages` | the languages: add, rename, reorder, offer or hide, delete (ADMIN) |
| `/admin/site-settings` | an ADMIN's System pages, each its own link of the panel's column: `/admin/site-settings` (maintenance, the announcement, Page access), `/admin/people`, `/admin/feedback` (what people sent through the feedback form; the count of new ones beside its link), `/admin/errors`, `/admin/audit`, `/admin/backups`, `/admin/migrations`; `/admin/system`, the System page that led to them before, goes on to Site settings |
| `/staff` | where an administrator signs in while the site is closed for maintenance (the closed sign with Sign in); while the site runs, the way to the admin panel |
| `/auth/callback` | where the IAM sends the browser back after signing in |
| `/robots.txt`, `/sitemap.xml` | the site's PHP (`composer start` serves them; in development `npm start` proxies them to it): what robots leave alone, and the pages anybody may read, by the site's address |
| `/terms`, `/privacy`, `/contact` | the legal pages - the anotoki family's, with this site's facts - for anybody, signed in or not; Contact opens the feedback form; Terms · Privacy · Contact at the foot of every page people take surveys on |
| `/about`, `/support` | the anotoki family's About and Support pages, the same on every anotoki site - for anybody, in the legal pages' frame; About · Support first among the footer's links |

`?lang=sk` on any address of the site reads it in that language for the tab
(and is taken out of the address); the chooser in the top bar remembers a
choice on the device. The admin panel is English whichever it is.

Signed in through an IAM that sends the account's preferences (its migration
015 applied - `../anotoki-iam`), the theme, the date order, the clock and the
language are the account's: set them on the IAM's account page
(`http://localhost:4300/account`) or with the top bar here, which saves the
theme and the language to the account. An IAM before 015 sends none, and the
site keeps its own settings, as before.

The results keep their state in the address, so Back steps out of it and every
view can be linked: `?filter=question:option,…` narrows the page,
`?chose=question:option` opens the people who chose an answer, `?wrote=question`
the answers to a text question, `?response=id` one person's survey. Gender and
age use the question ids `about-gender` and `about-age`.

Command-line tools in `backend/`, all reading the same settings:

```bash
php migration.php [--status|--dry-run]    # apply pending migrations (setup.php and the admin panel's Migrations page do too - one at a time)
php translations.php --status             # the keys the frontend uses against the database's strings
php translations.php --export sk [file]   # a language's own strings as flat JSON (to the screen without a file)
php translations.php --import sk file     # and back in, checked as a save in the admin panel is
```

(`translations.php` is anotoki-lib's command - `TranslationsCommand` - on this
site's words and frontend: the same name and flags as before.)

The database is `migrations/survey/NNN_name.sql`, applied in order by the
anotoki family's engine (anotoki-lib's `Migrator`, through
`api/migrations.php`), and after them the library's own set
(`anotoki_translations`: its `001` proves the tables' shape, its `002` writes
the library's own words - `anotoki.*` - where a key has no string yet). Never
edit an applied migration; add the next number.
While one waits, the site is closed - every page shows the family's "The site
is being updated" - but for its ADMIN, who signs in there and applies it on the
Migrations page; `GET /api/site-status` says where the site stands.

### The site's words

What the site says to somebody taking a survey is not written in a template:
the page names a key (`{{ 'home.title' | translate }}` - the library's pipe,
from `@anotoki/lib/translations`) and the string comes from the database, in
English and Slovak ([docs/architecture.md](docs/architecture.md), *The site's
own words*). The admin panel is English, written in its templates. The kit's
own words (the top bar's, a dialog's X, a toast's) are the library's keys,
`anotoki.<word>`, in the same tables - reworded on the Translations page; the
site's own code asks for one by its whole key (`'anotoki.topbar.roleAdmin'`),
never by the kit's short name. So a new sentence on a page
people take surveys on is:

1. the key in the template (or `i18n.t()` inside a `computed()`);
2. a migration with the key, a description for whoever translates it, its
   English and its Slovak string - `003_site_strings.sql` is the pattern, and
   Slovak on this site addresses the reader formally
   ([docs/decisions.md](docs/decisions.md), *Languages*);
3. `php migration.php` for your own database - or, signed in as an ADMIN,
   "Apply pending" on the admin panel's Migrations page (until then the site
   says it is being updated, and shows an ADMIN the way there). Writing the file is
   the moment the running site closes: write it whole, last. A key no
   migration has written yet shows on the page as
   itself - which is how a missing string is meant to look.

`php tests/run.php` fails when the frontend uses a key no migration wrote, or
a migration wrote one nothing uses; `php translations.php --status` says the
same about your database. A string can also be reworded in the admin panel
(`/admin/translations`) - that changes your database only, not what a
migration gives the next one.

## Tests

```bash
cd backend
php tests/run.php                  # every tests/unit and tests/api file, four at a time

cd frontend
npm test                           # the unit tests (Vitest): the rules, the checks, the results, the CSV, pictures, the languages
npm run build                      # the production build
cd .. && bun run format:check      # Prettier on every file of both halves, at the root (bun install there first)
```

The backend tests start the real router under PHP's built-in server (and the
upload, without a router, as a host would run it), each file against a
throwaway `survey_test_*` database copied from `survey_test_template`, with
settings of their own in a temp folder (`SURVEY_TEST_CONFIG`, honoured only for
`survey_test_` databases). They borrow only the PostgreSQL server and user from
this machine's `config/database.local.php`, so run the setup once first. They
sign their own tokens (the IAM verifier's test helpers) and never touch
`anotoki_survey`.

The template gets only the migrations it has not seen. While a migration is
still being written - edited after the template applied it -
`php tests/tools/testdb.php template --fresh` drops the template and builds it
again from every migration (not while tests are running: they copy it).

`tests/unit/translations.test.php` reads the frontend's sources (anotoki-lib's
`KeyScanner`, set up in `tools/translation_keys.php`): every key a
page asks for must be in the database the migrations leave, with an English
and a Slovak string, and every key there must be asked for - but the
library's own (`anotoki.*`), which its Angular half asks for from
`node_modules`.

The same scan fails what would show a key although it "exists", each with its
file and line: a plural family asked for as one string (`'home.questions' |
translate`) or one string as a family (`translatePlural`, `.plural()`); a key
put together from a prefix that `shared/i18n/dynamic-keys.ts` does not declare
(`'take.refused.' + kind`, or a template literal going on with `${…}`); and
`innerHTML` given a translated string. `php translations.php --status` runs it
against your own database and ends with 1 when it is not clean.

Two requests at the same moment - a language deleted while a survey is saved
in it, two people adding the last language the site keeps, two new visitors
from one address, a visitor's answers on their way while its row goes - are
tested through the real server: `begin_call()` (in `tests/lib.php`; the files'
`begin_as()` wraps it with a token) sends a request without waiting for it and
`somebody_else()` is a second connection holding the other side
(`tests/api/translations.test.php`, `tests/api/visitors.test.php`). The server
answers one request at a time, so two HTTP requests never race there: one
side is always a transaction held open from the test.

### In a browser

```bash
node .claude/skills/check-in-browser/scripts/run.mjs [--no-build] [--keep]
```

The whole site end to end in headless Chrome - every page signed in first
(to the IAM and back to it; nothing of a survey before, and the API answers
401 without a token - but for a picture's address), the top bar at 360, 390
and 1280 px with its phone menu (the keyboard, Escape, Tab back to the menu
button, a click outside), the owner writes and opens a
survey with a picture, somebody takes it once, the results, the roles, a phone
width, and then the pages people take surveys on in Slovak (no key where a word
should be, the admin panel English all the same) - signing in through the
anotoki library's stand-in IAM (`backend/vendor/anotoki/lib/backend/testing/stand-in-iam.php`),
on a throwaway database, then everything stopped and dropped. The skill
(`.claude/skills/check-in-browser/SKILL.md`) has the details, and how to click
through the same throwaway copy by hand.

It also walks the states a happy path never draws: a sign-in the IAM turns
down, or one the browser cannot start (the family's screen that says why, in
English and in formal Slovak), a save of strings that
fails, a session ending over boxes typed and not saved (they are back after
signing in again), signing out over them, a language added hidden, an open
survey with a text not translated yet, an author saving over a translator's
save, a database behind the code (the family's page for everybody, bare - no
top bar, no footer -, the Migrations page for the ADMIN who signs in from
it, in the admin panel's frame - its footer offering no Feedback until the
update is applied), the site not set up or out of reach - bare too, with "Try again" - and
visitors:
the stand-in's "Sign-in required" switched off, surveys taken without signing
in (in a second browser too), "Visitor N" / "Not signed in" in the results,
a sign-in that moves the answers and the draft into the account, and the
switch on again sending a visitor to sign in; and the ADMIN's System pages -
the People page (an account the IAM deleted, scrubbed on "Check now"; a
person's answers deleted after its question), the error log (a 404, and an
error thrown in the page: reported with the owner's token, scrubbed), the
audit log, the backups (one made after a new sign-in, named by its maker,
downloaded by its link, deleted) - and an EDITOR kept out of them; and Terms,
Privacy and Contact, About and Support - opened with nobody signed in and no
trip to the IAM, at 1280 and 390 px, light and dark, in English and Slovak,
the anotoki account's Privacy page and account page the stand-in IAM's; the
family's footer - "v{version} · What's new · Feedback" (a screen reader hears
"Version {version}"), then About · Support · Terms · Privacy · Contact - under them,
under the survey's pages and the card of a session that ended, and under the
admin panel in its English (each looked at up close, light in English and dark
in Slovak), its What's new opening the survey's own list and its Feedback the
family's form; Contact's feedback form
sent by nobody signed in (and in the site's formal Slovak on a phone), then
that message on the admin panel - counted beside Feedback in the column,
opened, marked resolved, deleted after its question, audited. It takes about
eight minutes after the build.
`CHROME=` names the browser (Edge where Chrome is not installed) and `PHP=`
a PHP 8.2+ where `php` is an older one.

`--flow=site-settings` runs a short check of its own instead (a minute after
the build): the admin panel's menu in the family's one shape (an ADMIN's, an
EDITOR's, on a phone in the drawer) and `/admin/system` going on to Site
settings; the Site settings page, the announcement written and switched on
through its dialog and shown above a page's bar in English and Slovak; the site
closed for maintenance - the closed sign for a visitor, Sign in at `/staff`
alone, the API's 503 `maintenance`, the ADMIN using the site with the line
above each page -, opened again; and `/robots.txt` and `/sitemap.xml` from
the site's PHP, printed, an open survey listed while visitors are welcome.

## Building and deploying

The hosting is SFTP only: PHP and PostgreSQL, Apache with `.htaccess`, no shell.
A release is built and put up by **anotoki-deploy**, the anotoki library's
deploy tool (the same for every site; anotoki-lib's `deploy/README.md`). This
site's facts are in `backend/composer.json`, `extra["anotoki-deploy"]`.

The site's folder on the host, `anotoki.eu/sub/survey/`:

```
.htaccess   the switch: every request -> frontend/ (written once: anotoki-deploy switch)
frontend/   the built app, index.php (the front controller), .htaccess   } a release:
backend/    api/, config/config.php, migrations/, vendor/, setup.php,     } replaced whole
            release.json                                                  }
config/     *.local.php - the settings: setup.php writes them             never in a release
storage/    the lock, the token, logs, backups, the library's key         never in a release
```

```bash
cd frontend
bun run anotoki-deploy build                          # npm run build, then the release -> dist/
bun run anotoki-deploy deploy --backups <folder>      # what would go up (a dry run)
bun run anotoki-deploy deploy --backups <folder> --go # the live frontend/ and backend/ copied into <folder>,
                                                      # the release up beside them, checked, swapped in, the site checked
bun run anotoki-deploy rollback --go                  # the release before back in (kept as .old)
bun run anotoki-deploy status                         # what is on the host
```

`@anotoki/deploy` is a dev dependency of `frontend/`, from anotoki-lib's
release. `bun run` finds it whichever tool installed `node_modules/`; on
Windows, `npx` misses bun's links. The SFTP login is never in a repository:
`ANOTOKI_DEPLOY_SECRETS` names a `secrets.json`, with the host's pinned key in
`hostkey.txt` beside it.

A release is `frontend/` and `backend/` alone: no settings file, no tests or
tools, no command-line scripts (`migration.php`, `translations.php`), no
composer files - and `config/` and `storage/` are the host's, never written by
a release. Nothing stale stays on the host: each release replaces both folders
whole. The PHP finds its state with one rule (`stateRoot()`,
`config/config.php`): with `release.json` in `backend/`, `config/` and
`storage/` are the ones beside it; in a checkout, `backend/`'s own.

1. In the hosting panel: a PostgreSQL database and its user, and HTTPS for the
   site.
2. `bun run anotoki-deploy deploy --backups <folder> --go`, then
   `bun run anotoki-deploy switch --go` (the folder's `.htaccess` becomes the
   switch). PHP must be able to write into the site's folder: the setup page
   makes `config/` and `storage/` there.
3. Open `https://survey.anotoki.eu/setup.php`. On a real host it asks for a
   token it wrote into `storage/setup-token.php` - read it with your FTP
   program. Enter the database and the IAM (`https://iam.anotoki.eu`, client id
   `survey`). **Install** writes the settings, makes the tables, writes
   `storage/installed.lock`, and deletes the token and itself.
4. In the IAM: the site must be registered with its production address - see
   [docs/operations.md](docs/operations.md) (*The IAM*).
5. Sign in on the site.

**Later versions**: build and `deploy --go` again (the settings stay). A
version with a new migration closes the site until it is applied - everybody
reads "The site is being updated": sign in as an ADMIN from that page's quiet
"Sign in", follow "Open Migrations", and press "Apply pending" (back the
database up first) - it applies what is missing and keeps every survey and
answer. The setup page still does the same:
delete `storage/installed.lock` first, then build and deploy, then open
`/setup.php` (each release brings it) with the same details. Opened while the
lock is there, `setup.php` deletes itself - delete the lock and deploy
again. The site's strings on the host
are reworded in its admin panel and are never overwritten by a release; what a
release with string migrations needs first, and how a language is added, is in
[docs/operations.md](docs/operations.md) (*The site's words and languages*).

If a whole site answers "500 Internal Server Error" after a release, the host
refused a line of `frontend/.htaccess` (anotoki-deploy writes it - `CGIPassAuth`
is the one line a host has been known to refuse): `bun run anotoki-deploy
rollback --go`, then see anotoki-lib's `deploy/README.md`.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| "This site is not set up yet"; the API answers 503 `not_set_up` | The setup page has not run, or a `config/*.local.php` is missing or cannot be read cleanly - saved with a byte-order mark, without its `<?php` line, or with a typo (the setup page and `php migration.php` say which, and how; nothing of the file is printed). |
| "The site is being updated"; the API answers 503 `update_pending` | The database needs an update - a migration not applied (a new file, a pull): `php migration.php`, the setup page, or - signed in as an ADMIN, from that page's "Sign in" - the Migrations page it links to. |
| "Another database update is running" | An Apply, the setup page or `php migration.php` is applying at this moment (one lock for them all): wait and try again. |
| The setup page asks for a token on this computer | It was not asked as `localhost` / `127.0.0.1` straight from PHP's built-in server: a LAN address, another name, or a proxy that adds forwarding headers makes it a real host's install. |
| "The survey site cannot be reached" | The backend on :8500 is not running, or was started without `router.php`. |
| Signing in stops at the IAM ("This site is not registered", "We cannot send you back"), or comes back saying it did not work | The IAM does not know this site or this address: use `http://localhost:4700`, which its migration 005 registers for `survey`. On an IAM database from before 005, `php migration.php` there (or its setup page, saved again) adds the site; `php clients.php --dev` there only puts back the development addresses of a site the database already has. |
| "Your sign-in has run out" on every request | The issuer in `config/iam.local.php` is not exactly the IAM's address, or the backend cannot reach `{issuer}/.well-known/jwks.json`. |
| The admin panel says it is for the people who write the surveys | Your account has no EDITOR or ADMIN role for `survey`: the IAM's admin panel gives it. |
| "Not saved" beside a survey's name | The server refused the last change - the editor says why above the survey (often an address another live survey has). |
| `tests/run.php` stops before any test | No `config/database.local.php` to borrow the PostgreSQL server from: run the setup first. |
| A page shows `home.title` (a key) where a word should be | The database has no string for it: no migration writes that key yet. `php translations.php --status` lists what the frontend uses and the database lacks. |
| `translations.test.php` fails on a key | The frontend uses a key no migration writes, or a migration writes one nothing uses any more. If the migration was edited just now, the tests' template still has the old one: `php tests/tools/testdb.php template --fresh`. |
| `translations.test.php` fails with "is a plural family and is asked for as one string", "is asked for as a plural", or "a key is put together from '…', which shared/i18n/dynamic-keys.ts does not declare" | The key is in the database, and the page would still show it as a key: ask for a family with `translatePlural` / `.plural()` and for one string with `translate` / `.t()`; declare the prefix and its tails in `dynamic-keys.ts`. |
| The Languages page: a language just added is not in the chooser | It starts hidden: its row's switch offers it (or the form's "Offer it to readers right away", before adding). |
| Port 4700 is busy | Another `ng serve` is still running (on Windows the child of `npx` can outlive its window). Find it with `netstat -ano \| findstr :4700` and end that process. |
