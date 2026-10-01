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
- Cloudflare caches static files by extension for hours: `index.html` and
  `theme-boot.js` go out with `no-cache`; a picture's address ends in its
  extension and never changes, so caching it is right.
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
stay. A version with a new migration closes the whole site (503; people see
"The survey site is not set up yet") until it is applied, and needs the setup
page once more, in this order: **delete `storage/installed.lock` over FTP
first**, then upload (the upload carries `setup.php`), then open `/setup.php`,
give the token it writes and the same details - it applies what is missing,
keeps every survey and answer, and locks and deletes itself again. The order
matters: opened while the lock is still there - by anybody; the closed site's
own button leads to it - `setup.php` deletes itself and says "Already set up";
then delete the lock and upload `setup.php` again. A version with no new
migration leaves the lock where it is.

The version that brings the languages is such a version: migrations `002`
(the tables for the site's words, English and Slovak), `003` (every string)
and `004` (the language an answer was read in). Until `/setup.php` has run
again the site is closed ("not set up yet"). The surveys there need nothing: one
stored before is read as written in English, with no translations. An editor
page left open across that upload cannot save any more: the server asks every
save for the survey's language, the old page does not send it, and "Try again"
gets the same answer. The refusal it shows says what to do - "… A page that
was open before the site was updated can no longer save: copy what you changed
since the last save, then reload the page." - so tell the editors before the
upload, and expect that sentence from whoever had the editor open.

## The site's words and languages

The words the site says to people taking surveys are in the database and are
reworded on the live site, in the admin area: **Translations**
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
While there is any, the browser asks before the tab is left - on the way to
the sign-in too, where nothing is lost - and "Sign out" in the top bar asks
first and then gives it up.

## The IAM

The site signs in as the IAM's client `survey`. The IAM's migration
`005_survey_application.sql` registers it with the roles ADMIN and EDITOR,
open to every account, and gives ADMIN to the IAM's administrators of the
moment. On a development IAM it also gets `http://localhost:4700` (callback
`/auth/callback`, landing `/`, origin) and a card on the IAM's landing page; on
an IAM already installed on a real host it gets neither - there a localhost
callback would hand a code to whatever listens on the visitor's machine, and a
card would lead nowhere. An IAM that has `survey` already - made by hand in the
admin console - keeps what it has: 005 only adds what is missing. So on the
live IAM, after the migration:

- in the admin console → Applications → Surveys: the redirect URI
  `https://survey.anotoki.eu/auth/callback`, the post-logout URI
  `https://survey.anotoki.eu/`, the web origin `https://survey.anotoki.eu`, the
  home address `https://survey.anotoki.eu`, and "show on the landing page";
- roles: EDITOR for the people who write surveys (Users → the account).

(All of that was done for the live IAM when the site first went up, on
2026-09-29.)

A fresh IAM install on a real host asks for the site's address with the others
(`SETUP_SITES` in its `setup.php`) and puts it in place of the development one;
left blank, the admin console gives it later. Its migrations run before any
account exists, so there nobody holds the survey's ADMIN - the first
administrator included - until the admin console gives it (Users → the
account).

## Backups

Everything is in the database, pictures and the site's reworded strings
included: a `pg_dump` of `anotoki_survey` is the whole site's data. The config files are only the
connection and the IAM's address; setup.php writes them again.

## When something goes wrong

| Symptom | Likely cause |
| --- | --- |
| The whole site says it is not set up | A `config/*.local.php` is missing or incomplete, or a migration is pending (`/api/health` asked from the server's own computer says which; a visitor only reads "not set up yet"). |
| `/setup.php` shows the site's "not set up yet" page instead of the installer | `setup.php` is not on the host: it deleted itself when somebody opened it while `storage/installed.lock` was there. Delete the lock, upload `setup.php` again, open it. |
| 500 on every page after an upload | The host refused a line of the root `.htaccess` (`Options -Indexes`, `CGIPassAuth`): remove it. |
| Signing in ends at the IAM with an error about the redirect URI | The IAM does not have `https://survey.anotoki.eu/auth/callback` for `survey`. |
| Signed in, but every request says the sign-in ran out | `config/iam.local.php`'s issuer is not exactly `https://iam.anotoki.eu`, or the server cannot fetch the IAM's keys (`storage/cache/` not writable). |
| Pictures do not upload | Bigger than PHP's `post_max_size` on the host (the answer is then empty), or than 10 MB. |
| A picture shows crossed out | It was deleted: no survey showed it for a day. |
| A page shows a key (`home.title`) where a word should be | The key has no string. Right after a release, for a moment: the browser started from the strings it kept and the server has not answered yet - they are replaced when it does. Lasting: the frontend uses a key no migration wrote, which `tests/unit/translations.test.php` and `php translations.php --status` exist to catch. |
| Somebody expecting Slovak gets English | Slovak is hidden (Languages); or they chose English in the chooser on that device; or came by a link with `?lang=en` in that tab; or they are signed in and their anotoki account is set to English - the account's language outranks the browser's, so the page can turn English at sign-in. The chooser here settles it for that device; the IAM's account page for every device, from the next token. |
| A survey shows in English on a Slovak page, with "Jazyk: English" | Its Slovak translation is missing a text (one added since it was translated), or it has none: the editor's Slovak tab counts what is left. |
| An editor's save is refused: "Say which language the survey is written in (language). A page that was open before the site was updated can no longer save: …" | The page was opened before the release that brought the languages. As the sentence says: copy what was changed since the last save, then reload the page. |
| An editor's save is refused: "A language of this survey has just been deleted from the site." | An ADMIN deleted the language in the moment the survey was being saved in it. Add the language again (Languages), or remove that translation from the survey. |
| An admin page turns into "You are signed out" in the middle of work | The session ended (idle at the IAM, or signed out on another anotoki site): sign in again with the button at the top. What was typed on the Translations and Languages pages is kept in the tab for the same person, and is in its boxes again. Unsaved changes to a survey are kept only while that page stays open (signing in is a page load): sign in again in another tab, and the open page saves them. |
| An admin page says "This part is for the people who write the surveys" | Signed in, but the account has no EDITOR or ADMIN role for `survey`: the IAM's admin console gives it. |
| The browser asks "Leave site?" | Strings or languages are typed and not saved, and somebody is signed in - or the tab's storage would not keep them. Signed out, with the drafts kept in the tab, it does not ask (the way on is the sign-in, and they are there after it); so closing such a tab while signed out is not asked about, and loses them. Unsaved changes to a survey always ask. |
| The Translations page says "Nothing was saved." in the bar beside Save | The reason follows it: the server's sentence, or that the site could not be reached. A language or key deleted meanwhile: the page has read the grid again, and Save sends the rest. |
| Adding a language answers 503, everything else works | The site's database user cannot lock the `languages` table (`LOCK TABLE` needs UPDATE, DELETE or TRUNCATE on it). The user that ran `/setup.php` owns the tables; one that does not must be granted them. |
