---
name: check-in-browser
description: Check the survey site in a real browser, signed in, end to end - the owner writes and opens a survey with a picture, somebody takes it once, the results and the roles - with headless Chrome and the stand-in IAM, on a throwaway database. Use after any change to the frontend, the API or sign-in, before saying a change works, when a page renders blank or looks broken, or when the user asks to see or screenshot the site.
---

# Check the survey site in a browser

Unit tests and the PHP tests do not show a page that renders blank, a top bar
that overflows a phone, or a sign-in that never comes back. This does - in a
real (headless) Chrome, signed in as the three kinds of people the site has:

| Who | IAM user | Roles | Checked |
| --- | --- | --- | --- |
| owner | 1 | `ADMIN` | writes a survey with a picture, opens it, reads the answer, may delete it |
| pat | 101 | none | takes the survey once; the admin area says it is not theirs |
| edith | 2 | `EDITOR` | sees the surveys and the answers, no Delete anywhere |

## Run it

From the repository's root:

```bash
node .claude/skills/check-in-browser/scripts/run.mjs            # builds the frontend first
node .claude/skills/check-in-browser/scripts/run.mjs --no-build # the build as it is
node .claude/skills/check-in-browser/scripts/run.mjs --keep     # leave the screenshots and logs
```

Prints `ok` / `FAIL` per check, then every page error or console error it saw
(`PROBLEMS (0)` is the goal), and exits 1 on any. With `--keep` it names the
work folder: `shots/` holds a screenshot per stage (the user menu, the editor,
the welcome, the thanks, the no-access page, the results, a phone). Look at
them - a check can pass on a page that looks wrong.

What it needs: the site set up once on this computer (`backend/config/database.local.php`
- the tests borrow its PostgreSQL server and user), PHP on the PATH (or `PHP=`),
and Chrome or Edge (or `CHROME=`). Ports 8590 (the site), 8597 (the stand-in
IAM) and 9590 (Chrome) must be free.

## What it does, and never does

`scripts/run.mjs`:

1. `npm run build` in `frontend/` (the site as the hosting serves it: app and
   API on one origin - `backend/router.php` serves the build beside `/api`).
2. A throwaway database `survey_test_browser` from `survey_test_template`
   (`backend/tests/tools/testdb.php`, `testenv.php`), with settings in a temp
   folder (`SURVEY_TEST_CONFIG`) - never `anotoki_survey`, never your
   `config/*.local.php`.
3. The stand-in IAM, `backend/tests/tools/fake-iam.php`, with a key of its own:
   it signs in whoever `POST /_test/state {user}` says, at once, with PKCE and
   refresh tokens like the real one. **Never the real IAM**, and never your
   account.
4. Headless Chrome with a profile of its own in the temp folder - never your
   browser's.
5. `scripts/flow.mjs` (the checks, over `scripts/cdp.mjs`, a small DevTools
   Protocol client - Node 22's built-in WebSocket).
6. Stops everything (the whole process tree on Windows), drops the database,
   removes the temp folder - also when a check fails.

## Changing the checks

`flow.mjs` expects an empty site and goes through it in one order; a check that
depends on an earlier one says so by its place. Helpers at its top: `go(path)`,
`clickText(selector, text)`, `focus(selector, n)` + `typeText(text)` (real
input events - TipTap and Angular both see them), `setFiles(selector, n, files)`
(a file input, through `DOM.setFileInputFiles`), `signInAs(user)` (signs out
through the top bar's menu, then in again through the stand-in IAM),
`screenshot(name)`, `expect(what, ok, detail)`.

Things that cost time to find out:

- The editor folds a question that has text when the survey is opened again:
  unfold it (`.summary`) before looking for its pictures or options.
- The results' people are a table in `#results-panel-people` (`?tab=people`);
  a person's button opens the drawer and puts `?response=` in the address.
- A new survey's address comes from its title only through "Use the title"
  (`.suggest`); typing a title does not change the address.
- The save indicator (`app-survey-header .save`) says `Saved` only once the
  save after the last change has come back - wait for it before reloading.
- The stand-in IAM's `/account` is its account page; the real one is at the
  IAM's own address.

## By hand

The same pieces, to click through yourself (ports as above):

```bash
cd backend
php tests/tools/testdb.php template
php -r 'require "api/anotoki_iam.php"; @mkdir("storage/manual-iam", 0777, true); file_put_contents("storage/manual-iam/key.json", json_encode(anotoki_iam_test_keypair("manual")));'
php tests/tools/testenv.php storage/manual --db=survey_test_manual --issuer=http://127.0.0.1:8597
FAKE_IAM_DIR=storage/manual-iam FAKE_IAM_ISSUER=http://127.0.0.1:8597 php -S 127.0.0.1:8597 tests/tools/fake-iam.php
SURVEY_TEST_CONFIG=storage/manual php -S 127.0.0.1:8590 router.php     # in another terminal
# who signs in: curl -X POST -d '{"user":{"id":1,"username":"owner","roles":["ADMIN"]}}' http://127.0.0.1:8597/_test/state
# afterwards: stop both, php tests/tools/testdb.php drop survey_test_manual, delete storage/manual*
```

(`storage/` is gitignored - the folder holds a copy of the database password.)
