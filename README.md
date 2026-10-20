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
  IAM) - every page asks for that first (but Terms, Privacy and Contact, About
  and Support, which anybody may read), and nothing of a survey shows before;
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
  signed in (and deleting a person's answers), what people sent through the
  feedback form, the error log, the audit log of what was done in the admin
  panel, the backups of the database, and its updates. The roles are given in
  the IAM's admin panel; everybody else takes surveys. The site keeps a
  person's name and anotoki id - never their address (the IAM keeps it), but
  a reply address somebody writes into a feedback message - and when the IAM
  deletes an account, its name here becomes the IAM's placeholder.
- **Feedback**: anybody - signed in or not - tells the people who look after
  the site about something that does not work, an idea or anything else,
  through the anotoki family's form (Feedback at the foot of every page opens
  it, and so does the Contact page), with their name or without it; no mail is
  sent - the admin panel counts what is new.
- **What's new**: the site's version and what each version changed for people,
  in English and Slovak - at the foot of every page, in the anotoki family's
  footer: "v{version} · What's new · Feedback" (a screen reader hears "Version
  {version}"), then About · Support · Terms · Privacy · Contact.

| Part | Folder | Stack |
| --- | --- | --- |
| Frontend | [`frontend/`](frontend/) ([its README](frontend/README.md)) | Angular 21, standalone + zoneless, signals |
| Backend | [`backend/`](backend/) ([its README](backend/README.md)) | PHP 8.2+, Slim 4, PostgreSQL (`anotoki_survey`) |
| Knowledge base | [`docs/`](docs/), [`.claude/`](.claude/) | how it works and why; the agents and skills that work on it |

## Hosting checklist

What the host and Cloudflare need for this site - check it before the first upload and after any change of
hosting:

- **PHP 8.2 or newer** with `pdo_pgsql`, `openssl`, `dom`, `mbstring`, `json` and `zlib` (the backups); `curl` or `allow_url_fopen` to ask the IAM. `tools/host-check.php` checks all of it on the host: write a long
  random value (32+ characters) into its `HOST_CHECK_TOKEN`, upload it into the web root beside `index.html`,
  open `https://<the site>/host-check.php?token=<that value>` (`&format=json` for
  the same as JSON), and delete it afterwards (the page has a button for it; check over SFTP that it is
  gone). It is never part of a build. The web root's `.htaccess` lets a visitor run it and `setup.php` alone,
  each only while it is there - before 0.4 it refused the host check too (403), so on a host still running
  an older upload, upload this version first.
- **Cloudflare** (the zone's settings, the same for every anotoki site):
  - SSL/TLS **Full (strict)**: the connection from Cloudflare to the host is https - the site's secure cookies
    need it end to end (the host check says which it is).
  - Network -> **Pseudo IPv4 not "Overwrite headers"**: that setting would put a made-up IPv4 address into
    `CF-Connecting-IP` for IPv6 visitors.
  - The site believes the visitor's address in `CF-Connecting-IP` only on a connection from Cloudflare's
    published ranges (the anotoki library's list), and counts every limit by it.
  - Rules -> Transform Rules -> **Modify Request Header**: "Set static" `X-Anotoki-Origin` to the origin
    secret, for every request of the zone - and the same value in `config/cloudflare.local.php`
    (`return ['origin_secret' => '...'];`, put there by hand; a long random value, 32+ characters). With it the
    site believes `CF-Connecting-IP` only on a request that carries the secret - anybody's Cloudflare Worker
    can connect from Cloudflare's ranges; without the file it believes `CF-Connecting-IP` from Cloudflare's
    ranges alone. Set the rule first, then the file; to switch the secret off, **delete the file** (an empty
    value switches nothing off). A file without a usable secret - an empty value, a misspelt key, a value
    that is not a string, saved with a byte-order mark, without its `<?php` line, or with a typo PHP cannot
    read; a folder in its place too - fails closed: the site keeps running, believes no `CF-Connecting-IP` (every visitor counts as the
    Cloudflare edge they came through, sharing its limits) and says so once a day in PHP's error log until
    the file is mended.
- **After an upload**: the private folders (`storage/`, `config/`) answer 403 in a browser; the host check's
  "Who connects" says Cloudflare, not a proxy of the host's (behind one, every visitor would share one
  address); pending database updates are applied on the admin panel's Migrations page.

## Current state - 1.0

**Since 1.0, not released yet** (the owner's request of 2026-10-20): **a step
of text and pictures alone** - a step's own rich text and pictures above its
questions, or with none: a task people read and do, and leave with Next (for
usability tests); written and translated in the editor ("Add a text step",
"Text and pictures"), counted as a step, left out of the per-question results
and kept as a line in a person's survey ([docs/architecture.md](docs/architecture.md#a-steps-own-text-and-a-step-of-text-alone)).
On the hosting it brings `016_step_text_and_pictures.sql`, applied on the
Migrations page ([docs/operations.md](docs/operations.md)).

**1.0** (2026-10-19, on anotoki-lib 0.8.0; its notes for people are
`frontend/public/changelog.json`'s newest entry): the family's **About** and
**Support** pages (`/about`, `/support`), anybody's, in the legal pages'
frame, and the footer's About · Support · Terms · Privacy · Contact; the
footer's feedback form keeps what was typed until it is sent, with Clear,
its buttons always in view; the version shown as v1.0.0. On the hosting it
brings the library's `anotoki_translations/013_about_and_support_words.sql`,
applied on the Migrations page.

**0.4** (2026-10-18, on anotoki-lib 0.7.2; its notes for people are
`frontend/public/changelog.json`'s 0.4.0 entry): **the family's footer**
(`<anotoki-site-footer>`, the build analyzer's - the owner's choice) under
every page - the survey's, the legal pages, the admin panel's too (in its
English) -: a top border, "v0.4.0 · What's new · Feedback" (a screen reader
hears "Version 0.4.0"), then
Terms · Privacy · Contact; **feedback** - the anotoki family's form, which the
footer's Feedback and the Contact page open for anybody, signed in or not
(the person's account from their sign-in alone, never an address unless they
write one), and the admin panel's Feedback page on System for the ADMIN, with
the count of new messages beside the bar's System link - the owner asked for
it after all; **What's new and the version** - the site's versions and what
each changed, in English and formal Slovak, the newest the version the footer
shows, its What's new opening the list; the family's page shown while the
site cannot run stands alone, with no top bar and no footer (it always did
here; a test holds it now, the admin panel's frame too); a
`config/cloudflare.local.php` read cleanly but naming no usable secret fails
closed too, and switching the secret off is deleting the file; and the host
check may run on the host (Hosting checklist above). On the hosting it brings
`014_feedback_words.sql` and `015_whats_new_and_feedback.sql`, then the
library's `anotoki_translations/012_footer_words.sql` (the footer's four
words), applied on the Migrations page ([docs/operations.md](docs/operations.md)).

**0.3** - the first real version: the surveys, answers and pictures live in PostgreSQL
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
migrations are the shared library's, **anotoki-lib** (now 0.8.1, both halves:
`anotoki/lib` from Composer, `@anotoki/lib` from its release - which makes the pages only
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
site's ADMIN alone, on the admin panel's System page. No feedback form (until
0.4) and no file explorer here (the owner's decision).

And with anotoki-lib 0.5.0: a restore no longer brings back the answers a
person had deleted on the People page since the backup - they are deleted
again inside the restore; only a backup made here is restored here (each is
sealed; one made before 0.5.0 has no seal and is restored offline alone), and
the Backups page names each one's maker; the pages' own errors are written in
the error log too; and where a request comes from is what Cloudflare's
`CF-Connecting-IP` says - believed only from Cloudflare's own addresses, no
other header ever - and is not kept in the clear: the visitors' limits count
a keyed hash of it, a pseudonym of the address. With its PHP half's 0.5.2,
given the owner's zone's secret (`config/cloudflare.local.php`, the Hosting
checklist above), only on a request that carries it: anybody's Cloudflare
Worker can connect from Cloudflare's ranges, and any other request counts as
the edge it came from.

And with anotoki-lib 0.6.2: **Terms, Privacy and Contact** - the family's
pages, with this site's facts (what it keeps of the people who sign in, of
their answers and of visitors, what it keeps in the browser, and for how
long), open to anybody, signed in or not, in English and formal Slovak - and
Terms · Privacy · Contact at the foot of the pages people take surveys on;
the anotoki account's own Privacy page and account page are the IAM's, linked
from there. No feedback form then: Contact gave the family's address. The kit's
new pieces where the site drew its own: the home page's and the System page's
cards that are one link, the results' filters as removable chips. And every
`config/*.local.php` is read cleanly or not at all: one saved with a
byte-order mark or without its `<?php` line is never compiled - it never
prints what it holds (the database password with it), nor stops every page
with a 500 - so a database or IAM file leaves the site not set up, a visitors
file means the defaults, and a `config/cloudflare.local.php` that cannot be
read cleanly fails closed (Hosting checklist above).

On the hosting that version brought new migrations (up to
`013_legal_pages.sql`, and the library's own sets around them -
`anotoki_admin` first, `anotoki_translations` and `anotoki_people` after; 012
moves the site's sign-in words under the library's keys first, an owner's
rewording with them; 013 writes the legal pages' facts; anotoki-lib 0.6.2
brings its translations `005`-`011`: the legal pages', the kit's new pieces',
the backups' and the Privacy page's wording): after the upload an ADMIN signs
in from the family's page and applies them on the Migrations page (or the
setup page does), then makes a backup by hand - the first one sealed -
[docs/operations.md](docs/operations.md).
No survey may have the addresses `terms`, `privacy` or `contact` any more:
one opened at such an address before that version is reached no more there
(the legal page answers) - move it in the editor.

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
