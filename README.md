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
  and a change somebody else saved meanwhile is never silently overwritten.
- **The results**: for each question how many chose what; press an answer to
  see who chose it, press a person to read their whole survey. Any answer can
  narrow the whole page to the people who gave it, and the filters add up. A
  list of everybody, one person per page, and a CSV download.
- **Who does what**: people sign in with their **anotoki account** (the anotoki
  IAM). The top bar shows who is signed in, with their account and signing out.
  **EDITOR**s write surveys, open and close them and read the answers;
  **ADMIN**s also delete surveys and answers. The roles are given in the IAM's
  admin console; everybody else takes surveys.

| Part | Folder | Stack |
| --- | --- | --- |
| Frontend | [`frontend/`](frontend/) | Angular 21, standalone + zoneless, signals |
| Backend | [`backend/`](backend/) | PHP 8.2+, Slim 4, PostgreSQL (`anotoki_survey`) |
| Knowledge base | [`docs/`](docs/), [`.claude/`](.claude/) | how it works and why; the agents and skills that work on it |

## Current state - 0.3

The first real version: the surveys, answers and pictures live in PostgreSQL
behind a PHP API, people sign in through the anotoki IAM (client `survey`),
and the site is deployable to the FTP-only hosting like every anotoki site.
Before it, 0.1 and 0.2 were a prototype in the browser, to settle how taking a
survey, the editor and the results look and work.

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
