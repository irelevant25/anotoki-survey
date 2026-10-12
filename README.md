# anotoki · survey

Surveys for the anotoki sites - **survey.anotoki.eu** - in the manner of the
ones games run at the end of a patch: a few steps of questions, answered once
per person, and results that can be taken apart question by question and
person by person.

- **Taking a survey**: a welcome, then the questions in steps - the step you
  are on and how many there are always in view - and a thank-you. Gender and age
  first, when the survey asks. Everyone signed in with an anotoki account can
  answer each survey once; an unfinished survey waits in the browser to be
  carried on.
- **Questions**: one choice (radio buttons), several choices (checkboxes, with
  the least and the most a person may pick), or the person's own words. Any
  choice question can have an "Other" that opens a field for the person's own
  answer. Question texts are rich: bold, italic, highlighting, links, lists.
- **Pictures**: several under a question, and on each answer - an answer with
  pictures becomes a card. Every picture opens large, with arrows to the next.
  In the editor they come from a file, dropped on the question, or pasted into
  its text or an answer's field; they are made smaller in the browser and kept
  by the server.
- **The editor**: steps and questions laid out as people will meet them;
  questions dragged within a step or into another; options typed out quickly
  (Enter for the next, a pasted list for many); a preview; and a list of what
  must be fixed before a survey can open. Every change is saved as it is made -
  and a change somebody else saved meanwhile is never silently overwritten: the
  editor says what each way out keeps and loses, and an author and a translator
  working on the same survey keep each other's texts.
- **The results**: for each question how many chose what; press an answer to
  see who chose it, press a person to read their whole survey. Any answer can
  narrow the whole page to the people who gave it, and the filters add up. A
  list of everybody, one person per page, and a CSV download.
- **Languages**: the pages people take surveys on are in **English and
  Slovak** - chosen in the top bar, or taken from the person's account or
  browser. A survey is written in one language and can hold its texts in the
  others; people read it in theirs when every text is translated, and in the
  language it was written in otherwise. The editor translates a survey side by
  side with the original; the site's own words are reworded, and languages
  added, in the admin panel - which itself is English. A new language starts
  hidden, to be offered when its strings are written.
- **Who does what**: people sign in with their **anotoki account** (the anotoki
  IAM) - every page asks for that first, and nothing of a survey shows before;
  unless the IAM's "Sign-in required" is switched off for the survey, when
  anybody may take the open surveys without signing in, once from their
  browser, and signing in later moves those answers into their account (the
  admin panel always asks).
  The top bar is the anotoki family's: the site's sections, the language, the
  theme and the person's menu (their account, the admin panel, signing out); on
  a phone one menu button holds the sections and the person's menu. Signed in,
  the theme, how dates are written, the clock and the language are the
  person's anotoki account's - the same on every anotoki site, the admin panel
  included - and the bar's theme and language save a choice to the account.
  **EDITOR**s write and translate surveys, open and close them, read the
  answers and reword the site's strings; **ADMIN**s also delete surveys,
  answers and languages, and have the site's System pages: the people who
  signed in (and deleting a person's answers), the error log, the audit log of
  what was done in the admin panel, the backups of the database, and its
  updates. The roles are given in the IAM's admin panel; everybody else takes
  surveys. The site keeps a person's name and anotoki id - never their address
  (the IAM keeps it) - and when the IAM deletes an account, its name here
  becomes the IAM's placeholder.

| Part | Folder | Stack |
| --- | --- | --- |
| Frontend | [`frontend/`](frontend/) ([its README](frontend/README.md)) | Angular 21, standalone + zoneless, signals |
| Backend | [`backend/`](backend/) ([its README](backend/README.md)) | PHP 8.2+, Slim 4, PostgreSQL (`anotoki_survey`) |
| Knowledge base | [`docs/`](docs/), [`.claude/`](.claude/) | how it works and why; the agents and skills that work on it |

## Current state - 0.3

The first real version: the surveys, answers and pictures live in PostgreSQL
behind a PHP API, people sign in through the anotoki IAM (client `survey`),
and the site is deployable to the FTP-only hosting like every anotoki site.
Before it, 0.1 and 0.2 were a prototype in the browser, to settle how taking a
survey, the editor and the results look and work.

Since then, in two languages: everything the site says to somebody taking a
survey comes from the database in English and Slovak (formal Slovak, unlike
the other anotoki sites), with a chooser in the top bar and pages in the admin
panel to reword the strings and keep the languages; and one survey holds its
texts in both languages, translated in the editor, read by each person in
theirs, and its answers say which language they were read in. The admin panel
stays English.

And made one way with the other anotoki sites: the family's top bar (one row;
on a phone the sections and the person's menu inside one menu button), every
page signed in first - a visitor goes to the IAM and comes back to the page
asked for, and the API answers nothing of a survey without a token (but its
pictures, which an `<img>` loads by their unguessable address), the admin
area called the admin panel as on every anotoki site (the person's menu, the
wordmark "anotoki survey · admin panel", the tab's title), the family's
Migrations page in the admin panel (an ADMIN's: what the database has and
lacks, and "Apply pending", which shows the database's own error when a file
fails) - and a README in `backend/` and `frontend/`. The database's
migrations are the shared library's, **anotoki-lib** (now PHP 0.5.1, Angular
0.5.0: `anotoki/lib` from Composer, `@anotoki/lib` from its release - which makes the pages only
while the site is open, and brings the family's UI kit and its translations,
below): one engine, one gate and
one behaviour for every anotoki site while the site cannot run - visitors and
signed-in people read a calm "The site is being updated" in their language
(and a quiet Sign in), the site's ADMIN "A database update is waiting" and
the way to the Migrations page, which works then; the setup page is offered
only to a site never installed ([docs/decisions.md](docs/decisions.md)). The backend already reads the IAM's new "Sign-in required"
switch for the site and passes it to the browser (required unless the IAM
says otherwise), and its API takes **visitors** when the switch is off -
people answering without signing in, once each from their browser, kept in
the results as "Visitor N", moved into their account when they sign in, within
limits per address and in all ([docs/api.md](docs/api.md#visitors)) - and so
do the pages: a visitor reads a notice of how long this browser remembers
what they answered, takes surveys, and signing in moves their answers and
unfinished drafts into the account; the admin panel lists a visitor as
"Visitor N", "Not signed in". And the anotoki account's preferences (the IAM's
SDK 1.2.0 then, the library's sign-in now): signed in, the site shows the account's theme, writes dates in its
order (and the admin panel's times on its clock) and reads in its language;
the top bar's theme and language save a choice to the account, for every
anotoki site - while an IAM that does not send them yet leaves everything as
it was. The pages are drawn with the anotoki family's UI kit - the library's
styles and palette, its components, the top bar and the segmented theme
switch, one look for every anotoki site - in this site's own words: the
kit's words are read from the site's strings, and its Slovak is formal. And
the site's words are kept the family's way (anotoki-lib 0.3.0's translations):
the same tables, read and written by the library on both sides - the strings
a page reads, the admin panel's Translations and Languages pages (the
family's, as on every anotoki site), the command line - in one wire format
for every site; the kit's words are keys of their own (`anotoki.*`) among
the site's, reworded on the Translations page like the rest, in formal
Slovak; who may do what stays this site's (EDITOR and ADMIN; deleting a
language an ADMIN's).

And with anotoki-lib 0.4.1, the rest of what every anotoki site shares:
**signing in** is the library's on both sides (the IAM's SDKs are gone from the
site; a sign-in that came back without one, or could not start, is said on
the family's screen - in the site's words, formal Slovak included - with Try
again and Back); **people** are the library's people module over the site's
`users` table (the site keeps no address any more - 011 drops the column, the
IAM is the only holder - and an account the IAM deletes is scrubbed here: its
name the IAM's placeholder, its answers kept), with the family's People page
for the ADMIN (how many surveys each answered and wrote, the visitors, and
deleting a person's answers); and the **admin tools** - the family's error
log, audit log and backups (the whole database by COPY, the pictures too:
daily, before every update, and by hand after a recent sign-in) - for the
site's ADMIN alone, on the admin panel's System page. No feedback form and no
file explorer here (the owner's decision).

And with anotoki-lib 0.5.0: a restore no longer brings back the answers a
person had deleted on the People page since the backup - they are deleted
again inside the restore; only a backup made here is restored here (each is
sealed; one made before 0.5.0 has no seal and is restored offline alone), and
the Backups page names each one's maker; the pages' own errors are written in
the error log too; and where a request comes from is what Cloudflare's
`CF-Connecting-IP` says - believed only from Cloudflare's own addresses, no
other header ever - and is not kept in the clear: the visitors' limits count
a keyed hash of it, a pseudonym of the address.

On the hosting this version brings new migrations (up to
`012_sign_in_words.sql`, and the library's own sets around them -
`anotoki_admin` first, `anotoki_translations` and `anotoki_people` after; 012
moves the site's sign-in words under the library's keys first, an owner's
rewording with them; anotoki-lib 0.5.0 adds none): after the upload an ADMIN
signs in from the family's page and applies them on the Migrations page (or
the setup page does), then makes a backup by hand - the first one sealed -
[docs/operations.md](docs/operations.md).

## Trying it out

You need PHP 8.2+ with `pdo_pgsql`, `openssl` and `dom`, PostgreSQL, and
Node.js 22.12+. In short:

```bash
cd backend && composer start               # the API on :8500 - then open http://localhost:8500/setup.php once
cd frontend && npm install && npm start    # the site on http://localhost:4700
```

Signing in needs the anotoki IAM running on this computer (`../anotoki-iam`,
its DEV.md). Every step: **[DEV.md](DEV.md)**.

## More

- Setting up, running, testing, building and deploying: [DEV.md](DEV.md).
- How it works and why: [docs/](docs/README.md).
- The rules for changing the code: [CLAUDE.md](CLAUDE.md).
