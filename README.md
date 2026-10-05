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
  a phone one menu button holds the sections and the person's menu.
  **EDITOR**s write and translate surveys, open and close them, read the
  answers and reword the site's strings; **ADMIN**s also delete surveys,
  answers and languages. The roles are given in the IAM's
  admin panel; everybody else takes surveys.

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
fails; it works while the site is closed for a pending migration, and the
"not set up yet" page links an ADMIN there) - and a README in `backend/` and
`frontend/`. The backend already reads the IAM's new "Sign-in required"
switch for the site and passes it to the browser (required unless the IAM
says otherwise), and its API takes **visitors** when the switch is off -
people answering without signing in, once each from their browser, kept in
the results as "Visitor N", moved into their account when they sign in, within
limits per address and in all ([docs/api.md](docs/api.md#visitors)) - and so
do the pages: a visitor reads a notice of how long this browser remembers
what they answered, takes surveys, and signing in moves their answers and
unfinished drafts into the account; the admin panel lists a visitor as
"Visitor N", "Not signed in". On the hosting this version brings new migrations (up to
`007_visitor_strings.sql`): after the upload an ADMIN applies them on the
Migrations page (or the setup page does) - [docs/operations.md](docs/operations.md).

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
