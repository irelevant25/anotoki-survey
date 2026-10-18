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
  `api/` (`routes`, `meddleware`) - and no folder there is ever named
  `translations` or `languages`, which are routes.
- Cloudflare caches static files by extension for hours: `index.html`,
  `theme-boot.js` and `changelog.json` (the list of versions - its newest is
  the version the pages show) go out with `no-cache`; a picture's address ends
  in its extension and never changes, so caching it is right.
- The web root's `.htaccess` lets a visitor run two PHP files alone, each only
  while it is there: `setup.php` (it deletes itself once a real host is
  installed) and the family's host check, `host-check.php` (`tools/` in the
  repository, never in a build: upload it with a long token written into it,
  open `/host-check.php?token=…`, delete it again - the README's Hosting
  checklist). Every other PHP file there answers 403; `api/` has its own.
- Whatever compresses an answer marks its `ETag`: Cloudflare weakens it
  (`W/"…"`), and an Apache that compresses JSON itself appends to it
  (`"…-gzip"`, mod_deflate - not something an `.htaccess` can switch off). The
  route of the site's strings takes both for its own tag, so a browser asking
  again gets its 304 either way. Which of the two this host does has not been
  looked at yet: `curl -sI -H 'Accept-Encoding: gzip'
  https://survey.anotoki.eu/api/translations/sk` shows the `ETag`, and the
  same request with `-H 'If-None-Match: <that ETag>'` must answer 304.

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

Upload the new build over the old one: FTP never deletes, and the settings
stay. (The old version's `api/migration_runner.php`, `api/database_update.php`
and `api/meddleware/setup.php` stay on the host after the version that brought
the anotoki family's library, read by nothing: delete them over FTP when
convenient.) A version with a new migration closes the site until it is
applied: people - visitors and signed-in alike - see the anotoki family's page,
"The site is being updated", in their language, which asks again by itself and
comes back on its own once the update is in; no error, no setup page. **An
administrator applies it on the admin panel's Migrations page** (the Apply
makes a backup of the database first - the library's, *Backups* below; one
that cannot be made stops the Apply before anything runs): open the site - the
page there has a quiet "Sign in":
sign in with an account that has `ADMIN` (straight at
`https://survey.anotoki.eu/admin/migrations`, the sign-in comes back to the
Migrations page) - "A database update is waiting" then has "Open Migrations"
(nobody else sees it) - and press **Apply pending**. The pending files run in
order, each in its own transaction; one that fails is rolled back whole and the
page says "Stopped at <file>" with what was applied before it and the
database's whole error (the server's log has it too); fix what is in the way
and Apply again. Once nothing is pending the site runs again, at once, for
everybody (an open page reloads by itself within half a minute).

The setup page is still a way to do the same, in this order: **delete
`storage/installed.lock` over FTP first**, then upload (the upload carries
`setup.php`), then open `/setup.php`, give the token it writes and the same
details - it applies what is missing, keeps every survey and answer, and locks
and deletes itself again. The order matters: opened while the lock is still
there - by anybody - `setup.php` deletes itself and says "Already set up"; then
delete the lock and upload `setup.php` again. A version with no new migration
leaves the lock where it is. The Apply, the setup page and `php migration.php`
never run at the same time: they take one lock, and the second says another
update is running and applies nothing. Once installed (the lock there), a site
whose settings files go missing never offers the setup page to anybody: it is
"not available right now" until the files are back.

The version that brings the languages is such a version: migrations `002`
(the tables for the site's words, English and Slovak), `003` (every string)
and `004` (the language an answer was read in). Until they are applied (the
Migrations page, or `/setup.php`) the site is closed. The surveys there need nothing: one
stored before is read as written in English, with no translations. An editor
page left open across that upload cannot save any more: the server asks every
save for the survey's language, the old page does not send it, and "Try again"
gets the same answer. The refusal it shows says what to do - "… A page that
was open before the site was updated can no longer save: copy what you changed
since the last save, then reload the page." - so tell the editors before the
upload, and expect that sentence from whoever had the editor open.

The version that brings visitors has migrations `006` (the visitors' sequence,
`users.visitor_key_hash`, `visitor_counters`, an index of answers by person)
and `007` (what the pages say to a visitor, in English and Slovak - new keys
only, nothing reworded): nothing of the surveys or answers changes. Applied, nothing
visible changes either while the IAM says "Sign-in required" - which it says
for the survey, and which the site assumes until the IAM answers. Put
`config/visitors.local.php` in place (*Visitors*, below - Cloudflare's ranges)
before switching it off.

The version that follows the anotoki account's preferences (the theme, the
date order, the clock and the language - the IAM's migration 015) vendors the
IAM's browser SDK 1.2.0 and has migration `008` (two toasts, in English and
Slovak - new keys only). Like every migration it closes the site until it is
applied. It may go up before the IAM's 015 or after it: while the IAM sends no
preferences the site keeps its own settings as before and saves nothing to
the account; once it does, somebody signed in gets the account's theme, dates
and language here, and the top bar's theme and language save to the account.
Nothing else on the server changes.

The version that brings the anotoki family's library (anotoki-lib 0.1.0: the
migrations engine, the gate, the page drawn while the site cannot run, the
Migrations page - `vendor/anotoki/lib` in the upload) has migration `009`
(it deletes the four strings of the "not set up yet" page it replaced -
nothing else). It is the first update applied the new way: upload, then sign in
as ADMIN on the family's page and apply 009 on the Migrations page. Delete the
three old `api/` files named above.

The version that takes the family's UI kit (anotoki-lib 0.2.0 - the Angular
half only) has no migration and changes nothing on the server: the upload's
`vendor/anotoki/lib` stays 0.1.0, `theme-boot.js` is the library's now (the
build copies it to the same place, still answered with `no-cache`), and
Manrope's files come with the build (`media/`).

The version whose words are the family's library's (anotoki-lib 0.3.0, both
halves: the strings' routes, the admin Translations and Languages pages and
the command line are the library's, in the IAM's wire format) brings
migration `010_strings_through_the_library.sql` and, after it, the library's
own set - `anotoki_translations/001_languages_and_strings.sql` (it proves the
tables' shape and changes nothing) and `002_library_words.sql` (the library's
words, `anotoki.*`, only where a key has none) - four files on the Migrations
page under two headings, `migrations/survey/` and
`migrations/anotoki_translations/`. 010 moves the site's strings for the kit
(the top bar's, the switches', a dialog's X) under the library's keys - an
owner's rewording with them - and deletes the old keys; its gate stops it,
rolled back whole, if anything would be lost. **Before the upload: export each
language** from the Translations page (*The site's words and languages*,
below), save whatever is typed and not saved on the two admin pages (a tab's
drafts holding a Languages row typed before the upload are not read again,
nor the strings typed with them), and after it reload every admin page that
was open. The upload carries `vendor/anotoki/lib/backend/migrations/`
(the library's set) - `tools/build.php` puts it there, under the deny-all
`.htaccess` of `vendor/`.

The version that took anotoki-lib 0.4.1 (both halves; 0.7.0 now, below) takes the rest of what every
anotoki site shares: **signing in** is the library's (the vendored IAM SDKs
are gone - `api/anotoki_iam.php` stays on the host after the upload, read by
nothing: delete it over FTP; the browser keeps its session, under the same
keys); a sign-in that came back without one is said on the library's screen,
in the site's words. **People** are the library's people module over
`users`: the site keeps no address any more, and an account the IAM deletes
is scrubbed here (the IAM's `GET /api/public/anonymized-accounts`, asked after
an answer at most once an hour - the IAM must be one that has it, its 016).
**The admin tools** - the error log, the audit log and the backups - are the
ADMIN's, on the admin panel's System page; PHP must be able to write
`storage/logs/` and `storage/backups/` (it makes them). It brings, in the
order they run: the library's `anotoki_admin/001_audit_log.sql` and
`002_feedback.sql` (the audit log's table; the feedback's, which this site
used from 0.4.0 on), the site's `011_people.sql` (`users.anonymized_at`, and
**`users.email` dropped** - the owner's decision; its gate proves every other
column of every row the same as before) and `012_sign_in_words.sql` (the
site's four sign-in strings moved under the library's keys,
`anotoki.signIn.*`, every language, who saved it and when - an owner's
rewording with them; formal Slovak for the two the library says informally),
then the library's `anotoki_translations/003_sign_in_words.sql`,
`004_feedback_words.sql` and `anotoki_people/001_people.sql`. **Before the
upload** export each language from the Translations page, as for 0.3.0.
**After the upload** check that `/storage/anotoki-lib.key` answers 403 (the
library's key for the error log's hashes - never served). The first Apply
makes the site's first backup (`before-migration`), made before 011 ran: it
still holds `users.email`, the only copy of the old addresses. Once the site
runs again and a look round says the update went well, **the owner deletes
that backup** on System → Backups.

The same version on anotoki-lib PHP 0.5.1, Angular 0.5.0 (no migration of its
own; 0.5.1, the PHP half alone, restores a database that ever had a visitor -
0.5.0 failed such a restore whole):
a restore does again, inside it, the People deletes made since its backup;
only a backup made here is restored here (sealed - see *Backups*: the plain
backups made before 0.5.0 have no seal and are restored offline alone, so
**make a backup by hand right after the update**); each backup names its
maker; the pages' own errors come to the error log (`POST /api/client-errors`);
and the visitors' addresses are Cloudflare's to say - `CF-Connecting-IP`
believed from Cloudflare's published ranges alone, the committed default -
and never kept: a visitor counter left from before, named by the address in
the clear, goes with the clean-up once its hour is over. The host needs PHP's
`mbstring` (the library requires it) and `zlib` (the backups).

The same version on anotoki-lib PHP 0.5.2, Angular still 0.5.0 (no migration
of its own): **the origin secret** - `CF-Connecting-IP` believed only on a
request that carries the owner's zone's `X-Anotoki-Origin` (*Visitors*,
below). Set the Cloudflare Transform Rule first, then put
`config/cloudflare.local.php` on the host by hand; without the file the site
works as before.

The version on anotoki-lib 0.6.2 (both halves): **Terms, Privacy and
Contact** (`/terms`, `/privacy`, `/contact`, for anybody) with this site's
facts, and their links at the foot of the pages people take surveys on; the
kit's link cards and removable chips; a `config/cloudflare.local.php`
that cannot be read cleanly failing closed (*Visitors*, below); and every
`config/*.local.php` that does not start with `<?php` passed over before PHP
compiles it - one saved with a byte-order mark before
`declare(strict_types=1)` made every request a 500. It brings, in
the order they run: the site's `013_legal_pages.sql` (the facts' words,
English and formal Slovak, the three tabs' titles, the legal pages' skip
link), then the library's `anotoki_translations/005_legal_words.sql` to
`011_privacy_words_made_true.sql` (the legal pages' words, the top bar's
count, the kit's new pieces', the tabs', the inputs', 0.6.1's two sentences on
where the backups are, and 0.6.2's three Privacy sentences made true - this
site words two of them itself, the backups and the sign-in's storage, and its
own words stay). **Before the upload**: a survey opened at the address
`terms`, `privacy` or `contact` is reached no more there once this version is
up - the legal page answers - and the editor now refuses those addresses;
move such a survey first. **After the upload**: apply on the Migrations page,
then open `/privacy` signed out - its "anotoki account" links go to the IAM's
own Privacy page and account page - and that it names the hosting company
(WebSupport s.r.o., the owner's word of 2026-10-18: `core/legal/legal-facts.ts`).

Version **0.4.0** (the owner's wishes of 2026-10-18), on anotoki-lib 0.7.0
(both halves): **the family's footer** (`<anotoki-site-footer>`) under every
page and the admin panel - "Version 0.4.0 · What's new · Feedback", then
Terms · Privacy · Contact; **feedback** - the family's form, opened from the
footer and the Contact page (`POST /api/feedback`, anybody's), and the admin
panel's Feedback page on System, with the count of new messages beside the
bar's System link; **What's new and the version**
(`frontend/public/changelog.json`, shown by the footer); a
`config/cloudflare.local.php` read cleanly but naming no usable secret
failing closed too (*Visitors*, below); and the web root's `.htaccess`
letting the host check run (*Where it runs*). It brings, in the order they
run: the site's `014_feedback_words.sql` (the feedback form's words that
speak to the reader, in this site's formal Slovak over the library's informal
ones - only where they are still the library's word for word) and
`015_whats_new_and_feedback.sql` (What's new's words and the Privacy page's
"how long" of a feedback message), then the library's
`anotoki_translations/012_footer_words.sql` (the footer's four words - until
it is applied the footer says the library's built-in ones). The table is
there already (the library's `anotoki_admin/002_feedback.sql`, applied with
0.3). PHP keeps feedback's limits and the daily clean-up's stamp in
`storage/cache/` (`anotoki-feedback-limits.json`: a day of keyed hashes, no
address; `anotoki-feedback-prune.stamp`). **After the upload**: apply on the
Migrations page (until it is applied the admin panel's footer round that page
offers no Feedback), then send a message signed out - from the footer's
Feedback or `/contact` - and find it on System → Feedback - then mark it, or
delete it; and open What's new from the footer.

A **release** adds its entry at the top of `frontend/public/changelog.json` -
what changed for people, in English and its whole formal-Slovak translation
(`translations.sk`) - and sets `frontend/package.json`'s version (and the two
in `package-lock.json`) to it: the newest entry is the version the footer
shows, and a spec holds the three together.

## The site's words and languages

The words the site says to people taking surveys are in the database and are
reworded on the live site, in the admin panel: **Translations**
(`/admin/translations`) and **Languages** (`/admin/languages`), for EDITOR and
ADMIN. There is no file to edit and nothing to upload for a rewording; the
command line (`php translations.php`) is for a computer with a shell and is
not in the upload.

**A release and the live strings.** A release's migrations add keys with their
English and Slovak strings and never write over a string that is there, so
what was reworded on the live site stays. A migration may still reword a
default that nobody changed (`UPDATE ... WHERE value = '<the old default>'`) or
delete a key the code stopped using - and its strings go with it. So **before
a release that changes strings, export each language** from the Translations
page (a flat JSON file, `translations-<code>.json`) and keep the files: they
are the only copy of the live wording outside the database's backup, and
Import puts them back (a key that no longer exists must be taken out of the
file first - an unknown key is refused).

**Adding a language** needs no release:

1. Languages → add it: the code (`cs`, `pt-br`), its name in English, its
   name as its speakers write it. It **starts hidden** - nobody is offered it,
   and the row says Hidden - unless "Offer it to readers right away" is
   switched on in the form; offered with no strings it would read in English
   throughout.
2. Translations → fill its column ("Missing in …" lists what is left), or
   export English, translate the file and import it into the new language. A
   string may use only the `{placeholders}` its English has, written exactly
   as English writes them - `{ count }` or a translated name is refused - and
   a plural form the language's numbers never take ("not used in German")
   needs nothing and does not count as missing.
3. Each survey that should be read in it: the editor → Add a language. People
   are shown a survey's translation only when every text is there; until then
   they get the survey in the language it was written in.
4. Languages → Offered.

Such a language is the live site's own: releases bring new strings in English
and Slovak only, so it reads each new key in English until somebody
translates it, and an ADMIN may delete it while no survey uses it. English
and Slovak cannot be deleted (Slovak can be hidden). Plural strings have three
forms - one, few, other - so a language with more reads "other" for the rest.

**Hiding a language, or offering it again**, reaches readers at their next
page load - and the person who flipped the switch at once, in the tab they did
it in. A reader whose chosen language was hidden reads English; once it is
offered again they are back in it at their next page load, not the one after.

**What is typed and not saved** on the two pages is kept for the tab and the
person: a session that ends under somebody (the IAM's idle limit, a sign-out
on another anotoki site) takes the page away, and signing in again as the same
person puts every box back as it was, marked as changed. Only Save saves it.
While there is any and somebody is signed in, the browser asks before the
tab is left (on the way to the sign-in after a session ended it asks nothing:
the boxes wait in the tab for the same person - anotoki-lib 0.4.0), and "Sign
out" in the top bar asks first and then gives it up.

## The IAM

The site signs in as the IAM's client `survey`. The IAM's migration
`005_survey_application.sql` registers it with the roles ADMIN and EDITOR,
open to every account, and gives ADMIN to the IAM's administrators of the
moment. On a development IAM it also gets `http://localhost:4700` (callback
`/auth/callback`, landing `/`, origin) and a card on the IAM's landing page; on
an IAM already installed on a real host it gets neither - there a localhost
callback would hand a code to whatever listens on the visitor's machine, and a
card would lead nowhere. An IAM that has `survey` already - made by hand in the
admin panel - keeps what it has: 005 only adds what is missing. So on the
live IAM, after the migration:

- in the admin panel → Applications → Surveys: the redirect URI
  `https://survey.anotoki.eu/auth/callback`, the post-logout URI
  `https://survey.anotoki.eu/`, the web origin `https://survey.anotoki.eu`, the
  home address `https://survey.anotoki.eu`, and "show on the landing page";
- roles: EDITOR for the people who write surveys (Users → the account).

(All of that was done for the live IAM when the site first went up, on
2026-09-29.)

A fresh IAM install on a real host asks for the site's address with the others
(`SETUP_SITES` in its `setup.php`) and puts it in place of the development one;
left blank, the admin panel gives it later. Its migrations run before any
account exists, so there nobody holds the survey's ADMIN - the first
administrator included - until the admin panel gives it (Users → the
account).

From the IAM's migration 010 on, every account holds **MEMBER** in the survey
too (an ordinary person; nothing here asks for it), and the survey's page in
the IAM's admin panel has **"Sign-in required"** (on for the survey) and the
roles that may sign in. The site reads the switch from
`{issuer}/api/public/applications/survey` and keeps the answer a minute in
`storage/cache/` (`anotoki-iam-application-*.json`; the folder must be
writable, or the IAM is asked on every request and the log says so). Until the
IAM answers that address - before its 010, or while it is out of reach and
never answered - the site takes sign-in as required. Switched off, the pages
people take surveys on welcome visitors within the minute (below); the admin
panel and the editor's preview still sign in first. Switched on again, a page
already open stops welcoming them at its next answer from the server, and a
visitor's browser keeps its key - its answers move into the account at its
next sign-in. **To block
somebody**, take their MEMBER away in the survey application (Users → the
person → Roles): the IAM refuses their next sign-in and every refresh; the
token they hold works until it runs out (minutes). With "Sign-in required"
off, a person blocked so can still take surveys as a visitor - blocking stops
signing in, not visiting: to keep somebody out entirely, keep it on.

## Visitors

With "Sign-in required" off in the IAM, somebody who is not signed in may take
the open surveys too, once each, as a **visitor**: the server makes one with
their first answers that are kept, and their browser holds its key
(`X-Visitor-Key`; only its hash is in the database). What the switch costs:

- **Ballot stuffing.** A fresh browser is a fresh visitor, and a visitor whose
  visit ended (below) may answer the same survey again - the results then hold
  both, by design. The limits bound it, nothing prevents it: **a survey that
  must count one answer per person needs "Sign-in required" on**.
- **Growth.** A visitor unseen for 30 days *ends* - its key opens nothing - but
  its answers stay in the results as "Visitor N" (they are the survey's
  results), and so does its row: ended visitors' rows are kept for good, with
  their answers. Only a visitor with no answers left is deleted. Spam answers
  are deleted one by one in the results (ADMIN), or with their survey. In the
  results a visitor is "Visitor N" with "Not signed in" where a person's
  address is (N is the visitor's number, counted from 1 - how many visitors
  came before it, which only staff see); the CSV has the name and no address.

Signing in moves a visitor's answers into the person's account (the person's
own answers win where both answered a survey); that happens even with the
switch on again, so nothing a visitor answered is stranded by switching.
Switching on while visitors exist: their keys stop working at once (401
`sign_in_required`), their browsers keep them, and switching off again within
`keep_days` brings them back.

**The settings** are an optional file, `config/visitors.local.php`, which
nothing writes - `setup.php` neither writes nor reads it, an upload never
carries it (`*.local.php` is left out of the build) and FTP never deletes it:
put it there by hand, over SFTP, into the web root's `config/` beside the
other two, and keep a copy (it is not in the database's backup). Without it the
defaults hold; a value that is not usable is left out and logged (`[visitors]`
in the PHP log), and a file that cannot be read cleanly - a typo that breaks
its syntax, no `return [...]`, saved with a byte-order mark or without its
`<?php` line (never compiled, nothing of it sent) - is logged as
`[visitors] config/visitors.local.php could not be read (ParseError on line
3): the defaults hold` (or `does not start with <?php (...)`; never what PHP
said) and left out whole - never fatal. Each such line comes at most once a
day, so after editing it, look at the log (or `visitor_days` in
`/api/auth/config`):

```php
<?php
return [
    'new_per_hour_per_address' => 60,
    // Only for a host NOT behind Cloudflare: believe no proxy, REMOTE_ADDR alone.
    // 'trusted_proxies' => [],
];
```

| Setting | Default | What it does |
| --- | --- | --- |
| `new_per_hour_per_address` | 30 | new visitors an hour from one address (an IPv6 address counts by its /64): a school class behind one address must fit |
| `new_per_hour` | 600 | new visitors an hour in all |
| `max_active` | 20000 | visitors with a key at once |
| `keep_days` | 30 | a visitor unseen this long ends; the page tells visitors this number (`/api/auth/config`'s `visitorDays`) |
| `sweep_batch` | 50 | visitors one clean-up ends or deletes |
| `sweep_timeout_ms` | 2000 | how long one statement of the clean-up may run or wait |
| `move_lock_timeout_ms` | 5000 | how long the move at sign-in waits for the rows it takes |
| `trusted_proxies` | Cloudflare's published ranges | proxies believed about a visitor's address (addresses or CIDR ranges) - the anotoki library's `ClientAddress::CLOUDFLARE` (www.cloudflare.com/ips-v4 and /ips-v6, as of 2026-10-11), which moves with the library; a list here replaces it whole, `[]` believes nobody |
| (the header) | `CF-Connecting-IP` | not a setting: pinned in code. `client_ip_header`, which an earlier version read, is left out and logged - `X-Real-IP`, `True-Client-IP` and `X-Forwarded-For` come through Cloudflare as the visitor sent them, and are never believed |

Past a limit a **new** visitor is refused (429 `too_many_visitors`: sign in, or
try later); visitors there already carry on. The limits are the only
protection against a script filling the tables: when they bite real people,
raise them; when the tables fill, lower them. **survey.anotoki.eu is behind
Cloudflare's proxy**, and Cloudflare's ranges are what the site believes
without a word here (the owner's rule of 2026-10-11): `CF-Connecting-IP` from
an edge of Cloudflare's names the visitor - with the origin secret, only on a
request that carries it (below) -, from anybody else it is ignored. A
host not behind Cloudflare sets `trusted_proxies` to `[]` - else nothing
breaks, but nobody's header is believed anyway. A catch-all range there -
shorter than /8 for IPv4 or /16 for IPv6, `0.0.0.0/0`, `::/0` - is refused:
the list is left out (logged) and Cloudflare's holds. The same proxies and
the same secret tell the error log where a request came from. **No address is kept in the
clear**: a counter goes by a keyed HMAC of the address (under a key derived
from `storage/anotoki-lib.key`) - a stable pseudonym of the address while
that key lasts, which whoever holds the key could match against every IPv4
address: keep the storage folder as private as the database. The database
holds no address, nor does any backup made since anotoki-lib 0.5.0 - one
made before may hold an hour's counters named by address
(`visitors:new:<address>`) until it is deleted here.

**The origin secret** (anotoki-lib PHP 0.5.2, the owner's decision of
2026-10-13): Cloudflare's ranges are every Cloudflare customer's, not the
owner's zone alone - anybody's Worker can open a connection to the host from
them and write the `CF-Connecting-IP` it likes, a new address every time, past
every limit here. So the owner's zone adds a secret header to every request
through it, and the site believes `CF-Connecting-IP` only on a request that
carries it; any other request from Cloudflare counts as the edge it came from
(coarser - a Worker's made-up visitors share one bucket - never looser). The
same value in two places, a long random value of 32 characters or more:

- **Cloudflare**: Rules → Transform Rules → Modify Request Header → "Set
  static" `X-Anotoki-Origin` to the secret, for every request of the zone (one
  rule serves every anotoki site).
- **The host**: `config/cloudflare.local.php` beside the other settings, put
  there by hand like `visitors.local.php` (`setup.php` neither writes nor
  reads it, an upload never carries it, FTP never deletes it) - the same file
  in every anotoki site:

  ```php
  <?php
  return ['origin_secret' => '<the same long random value>'];
  ```

Set the rule first - a site without the file pays the header no heed - then
the file: the other way round, every visitor counts as their edge until the
rule is there; changing the secret, likewise. Without the file the site
believes `CF-Connecting-IP` from Cloudflare's ranges alone, as before - **to
switch the secret off, delete the file** (then the rule, if you like). A file
that is there without a usable secret **fails closed**: one read cleanly
that names none - an empty value, a misspelt key, a value that is not a
string, a forgotten `return` (since 2026-10-18: before, that was "no
secret") -, a folder given the file's name, and one that cannot be read cleanly (since anotoki-lib 0.6.1's
pass): saved with a byte-order mark, without its `<?php` line or with a line
before it - never compiled, so not even a `declare(strict_types=1)` after
such a start stops the site -, with text after its closing tag - what it
prints is caught and goes nowhere -, or one PHP cannot parse, run or open.
The site keeps running, but believes no `CF-Connecting-IP`: every visitor
counts as the Cloudflare edge they came through (they share its limits - 30
new visitors an hour by default) until the file is mended; PHP's error log
says so at most once a day, by the fault alone (`[cloudflare]
config/cloudflare.local.php names no usable origin_secret ...`, `does not start
with <?php (...)` or `could not be read (ParseError on line 2)`, then `: no
request carries its secret ...`), never its contents. Visitors refused as "too
many" all at once, from everywhere, are that sign. The secret is never printed
or logged; keep a copy off the server, as of the other settings.

**The clean-up** needs no cron: after an answer, at most once an hour (and
after every new visitor), it ends a batch of visitors unseen for `keep_days`
(deleting those with no answers) and drops the limit counters whose hour is
over. It never fails a request: what goes wrong is logged (`[after the
answer]`), and the next one tries again. It writes `storage/visitors-swept`
to know when it last ran.

Counting them (psql, or the hosting's database page):

```sql
SELECT count(*) FILTER (WHERE visitor_key_hash IS NOT NULL) AS with_a_key,
       count(*) FILTER (WHERE visitor_key_hash IS NULL)     AS ended
  FROM users WHERE id < 0;
SELECT name, count, window_ends FROM visitor_counters ORDER BY count DESC LIMIT 20;
```

## Backups

Everything is in the database, pictures and the site's reworded strings
included. The site backs it up itself - the anotoki family's backups
(anotoki-lib 0.7.0), on the admin panel's System → **Backups** page, for its
ADMIN: every table by COPY through PDO in one snapshot (no `pg_dump` on the
host), each a file `storage/backups/<id>.anotoki-backup` (`ANOTOKI-BACKUP 1`,
a JSON header, then a gzip'd tar of the manifest, the applied migrations' SQL
and each table's rows - opened anywhere with `tail -n +3 <file> | tar -xz`).
Made after the answer of the first request of each UTC day (14 kept), before
every update (5), before a restore (5), and by hand (kept until deleted; marked
after 90 days). **A backup is kept until the owner deletes it - no maximum
age** (the owner's decision of 2026-10-11, for every site): nothing deletes
one for being old - the automatic ones go only as newer ones of their kind
replace them (the counts above), one made by hand only when it is deleted
here. So a person the IAM deleted (scrubbed here) stays in the backups made
before, until those are deleted - delete them on this page when that matters.
Making, downloading, deleting and restoring one ask for a
sign-in of the last ten minutes - "Sign in again" on the page, and the IAM asks
for the password; a download is a single-use link of a minute. A restore is
in place, all or nothing, after a backup of the database as it is, and only
from a backup made at the same migrations (the page says why not otherwise).
Inside it, before anybody sees the rows, every person's answers deleted on
the People page since the backup was made are deleted again (the audit log -
never restored - says which), and a restore that cannot do it again is
rolled back whole ("restore again in a minute" while a check of the IAM's
deleted accounts runs). One gap: answers a visitor's browser moved into the
person's account after the backup are the visitor's in it, and come back as
"Visitor N" - delete them in the results (`docs/decisions.md`).
Afterwards the scrub of the IAM's deleted accounts runs again. When it cannot
finish (the IAM out of reach), the restore stands and the page says so -
"The restore stands, but the site's own work after it failed: The accounts
the IAM deleted were not checked again …" - and the error log has it: press
Check now on the People page once the IAM answers (the next request also
runs it). A backup that fails - the daily one, the one before an update - is
in the error log too. **Not encrypted** (the owner's decision of 2026-10-11:
only the IAM's backups are): the files hold everybody's answers and names -
download them to a place as private as the database. **Sealed** (anotoki-lib
0.5.0): each backup's `.json` beside it carries an HMAC of its id and its
SHA-256 under the installation's key (`storage/anotoki-lib.key`), and the
page restores only a backup made here - one copied in from elsewhere, changed
since, or **made before 0.5.0** (no seal: every plain backup made before the
update) is listed as not made here and is restored **offline** alone: take
the file off the server (its Download), extract it - `tail -n +3 <file> | tar
-xz`, the schema files and each table's COPY rows - and load it into a
database with `psql` (nothing is public yet: none of those backups is needed).
The key is the site's own: a restore of the whole server keeps
`storage/anotoki-lib.key` with the backups, or they are restored offline too.
Every file of the backups is the site's own user's alone (`0600`, folders
`0700`): to fetch one over FTP where PHP runs as another user, download it
from the page. The web never reaches `storage/` (its `.htaccess`, and each
folder's own); what the folder holds besides the library's files stays as it
is. The config files
are only the connection and the IAM's address; setup.php writes them again -
all but `config/visitors.local.php` and `config/cloudflare.local.php`, which
are put there by hand: keep a copy of them (the origin secret is in the
Cloudflare zone's Transform Rule too).

## The error log and the audit log

On System → **Error log** (ADMIN): what failed on the server - an exception
answered 5xx, an answer of 404, 405, 413, 415, 429 or 5xx, PHP's own warnings
and fatal errors - from `storage/logs/errors-YYYY-MM-DD.jsonl` (UTC days, 30
kept, 64 MB in all; never a body, a header, a cookie, a query string, a token
or an address - an HMAC of its bucket instead). It works while the database
cannot be reached or an update waits; "Clear" asks what goes. A state the
site is in (an update waiting, a tool's table waiting) is not written; an
exception thrown for another shows what caused it. **The pages' own errors**
are there too (`source: client`, anotoki-lib 0.5.0): each a page met, sent by
the browser - scrubbed there and again on the server, at most five a page
load, 20 an hour from one person or address, 500 a day from the visitors and
as many from the people signed in; a person's by their account. The PHP error
log of the host still has what the site writes there itself (`[auth]`,
`[visitors]`, `[db]`, `[backups]` lines). On System → **Audit log** (ADMIN):
who did what in the admin panel - the surveys, the answers, the words, the
languages, the people, the backups, the error log, the updates - by the
person's anotoki id and name; kept in the database (`anotoki_audit_log`), in
every backup.

## When something goes wrong

| Symptom | Likely cause |
| --- | --- |
| The whole site says "The site is being updated" | A migration is pending (`GET /api/site-status` says `update_pending`). Sign in as an ADMIN from that page's quiet "Sign in" - the page then says "A database update is waiting" and links to the Migrations page, which applies it. |
| The whole site says it is not set up, or "not available right now" | `config/database.local.php` or `config/iam.local.php` is missing, incomplete or cannot be read cleanly - saved with a byte-order mark or without its `<?php` line, or with a typo PHP cannot parse; nothing of it is ever printed (one that does not start with `<?php` is never even compiled), and PHP's error log says which file and its fault once a day (`[config] config/database.local.php does not start with <?php ...`), as the setup page on this computer does (`/api/site-status` says `not_set_up`) - "not set up yet" with the way to the setup page only while the site was never installed; once `storage/installed.lock` is there, "not available right now": put the file back, or run the setup again (above). `unavailable`: the database cannot be reached. |
| The Migrations page says "Stopped at <file>" | That file failed and was rolled back whole; the box under it is PostgreSQL's own error (also in the server's log). The files before it stand. Fix the cause in the database (or the file, in a new version), then Apply again. |
| Apply says another database update is running | Another Apply, the setup page, `php migration.php` or a backup is running right now: wait a moment and look again. |
| Apply stops before anything runs, saying a backup could not be made | The backup each Apply makes first failed (`storage/backups/` not writable, the disk full, PHP without `pdo_pgsql`'s COPY): the Backups page says which. Nothing was applied. |
| The Backups page says "Sign in again first" | Making, downloading, deleting or restoring a backup needs a sign-in of the last ten minutes: its button goes through the IAM (which asks for the password) and back. |
| A sign-in ends on "Signing in did not work" | The IAM turned the account away (taking its MEMBER blocks it), the person went back from the IAM, or the browser refuses the site's storage (blocked cookies and site data, some private modes) - the screen says which, in the reader's language. Try again goes to the IAM once more; Back goes back without signing in. |
| `/setup.php` shows the site's page instead of the installer | `setup.php` is not on the host: it deleted itself when somebody opened it while `storage/installed.lock` was there. Delete the lock, upload `setup.php` again, open it. |
| 500 on every page after an upload | The host refused a line of the root `.htaccess` (`Options -Indexes`, `CGIPassAuth`): remove it. |
| Signing in ends at the IAM with an error about the redirect URI | The IAM does not have `https://survey.anotoki.eu/auth/callback` for `survey`. |
| Signed in, but every request says the sign-in ran out | `config/iam.local.php`'s issuer is not exactly `https://iam.anotoki.eu`, or the server cannot fetch the IAM's keys (`storage/cache/` not writable). |
| Pictures do not upload | Bigger than PHP's `post_max_size` on the host (the answer is then empty), or than 10 MB. |
| A picture shows crossed out | It was deleted: no survey showed it for a day. |
| A page shows a key (`home.title`) where a word should be | The key has no string. Right after a release, for a moment: the browser started from the strings it kept and the server has not answered yet - they are replaced when it does. Lasting: the frontend uses a key no migration wrote, which `tests/unit/translations.test.php` and `php translations.php --status` exist to catch. |
| Somebody expecting Slovak gets English | Slovak is hidden (Languages); or they chose English in the chooser on that device; or came by a link with `?lang=en` in that tab; or they are signed in and their anotoki account is set to English - the account's language outranks the browser's, so the page can turn English at sign-in (and, once the IAM sends the account's preferences - its migration 015 - it outranks the device's choice too). Signed in, the chooser here saves the choice to the account, for every anotoki site; signed out it settles it for that device. The IAM's account page settles it for every device, from the next token. |
| The theme (or the dates) changed by itself, or does not stay as chosen | Signed in, the theme, the date order and the clock are the anotoki account's: a choice made on another anotoki site or on the IAM's account page arrives here with the next token. A choice made here that the account would not take (the IAM out of reach) goes back, and a note under the theme switch says so. Signed out, it is the device's. |
| A survey shows in English on a Slovak page, with "Jazyk: English" | Its Slovak translation is missing a text (one added since it was translated), or it has none: the editor's Slovak tab counts what is left. |
| An editor's save is refused: "Say which language the survey is written in (language). A page that was open before the site was updated can no longer save: …" | The page was opened before the release that brought the languages. As the sentence says: copy what was changed since the last save, then reload the page. |
| An editor's save is refused: "A language of this survey has just been deleted from the site." | An ADMIN deleted the language in the moment the survey was being saved in it. Add the language again (Languages), or remove that translation from the survey. |
| An admin page turns into "You are signed out" in the middle of work | The session ended (idle at the IAM, or signed out on another anotoki site): sign in again with the card's Sign in (or the top bar's - on a phone, inside its menu). What was typed on the Translations and Languages pages is kept in the tab for the same person, and is in its boxes again. Unsaved changes to a survey are kept only while that page stays open (signing in is a page load): sign in again in another tab, and the open page saves them. |
| A page where people take surveys says "You are not signed in" | The session ended with the page open (signed out in another tab or on another anotoki site, the IAM's idle limit; in the admin panel that one is "You are signed out"). Its Sign in (and the top bar's) goes to the IAM and comes back to the same page. Every other page goes to the IAM by itself: nothing of a survey is shown to anybody not signed in. A sign-in that came back without one, or could not start, is the screen "Signing in did not work" (above). |
| An admin page says "This part is for the people who write the surveys" | Signed in, but the account has no EDITOR or ADMIN role for `survey`: the IAM's admin panel gives it. |
| The browser asks "Leave site?" | Strings or languages are typed and not saved, and somebody is signed in (the family's drafts; on the way to the sign-in after a session ended nothing is asked - they are kept in the tab and are there after the sign-in). Closing the tab loses them. Unsaved changes to a survey always ask. |
| The Translations page says "Nothing was saved." in the bar beside Save | The reason follows it: the server's sentence, or that the site could not be reached. A language or key deleted meanwhile: the page has read the grid again, and Save sends the rest. |
| "Sign-in required" is off in the IAM, and the site still asks everybody to sign in | The site keeps the IAM's answer a minute, and a page reads it once, when it loads: reload. The IAM out of reach and never read means "required" (the log says `[auth] the IAM did not say whether sign-in is required`); `storage/cache/` must be writable. `/api/auth/config` shows what the site took (`login_required`, and `visitor_days` - without it the pages welcome nobody: the backend is older than the frontend). The admin panel and the editor's preview always ask. |
| A visitor's page says "Sign in to send your answers" | "Sign-in required" was switched on while the page was open: the page now draws "You are not signed in", the answers stay in the browser, and signing in sends them (and moves what that browser answered before). |
| Answers without signing in are refused: 429 `too_many_visitors` | A limit on new visitors (*Visitors*): many people behind one address (a school), or a site behind a proxy whose ranges are not in `trusted_proxies`, so everybody counts as the proxy. Raise `new_per_hour_per_address`, or list the proxy. `visitor_counters` shows the counts. |
| A visitor's browser is told its visit has ended (401 `visitor_unknown`) | It was unseen for `keep_days`, or its answers were moved into an account at sign-in (another tab). Its answers are kept; the browser forgets the key and starts afresh. |
| Signing in after answering as a visitor answers 503 `visitor_move_retry` | Something held the rows a moment (the same person sending answers in another tab): the page asks again; nothing was moved meanwhile. |
| Adding a language answers 503, everything else works | The site's database user cannot lock the `languages` table (`LOCK TABLE` needs UPDATE, DELETE or TRUNCATE on it). The user that ran `/setup.php` owns the tables; one that does not must be granted them. |
