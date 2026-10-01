---
name: check-in-browser
description: Check the survey site in a real browser, signed in, end to end - the owner writes and opens a survey with a picture, somebody takes it once, the results and the roles; the pages people take surveys on in Slovak (the top bar on a phone, a survey step by step, no key where a word should be, the admin area English all the same); and the translating itself (the Translations and Languages pages, a survey translated in the editor, read in Slovak, in English where a text is missing, and which language each person read it in); and what goes wrong (a save the server fails on, a session that ends over unsaved strings, a save over a translator's save, the site not set up or out of reach) - with headless Chrome and the stand-in IAM, on a throwaway database. Use after any change to the frontend, the API, sign-in, the site's strings or a survey's translations, before saying a change works, when a page renders blank or looks broken, or when the user asks to see or screenshot the site.
---

# Check the survey site in a browser

Unit tests and the PHP tests do not show a page that renders blank, a top bar
that overflows a phone, a sign-in that never comes back, or a page that shows
`home.title` where a word should be. This does - in a real (headless) Chrome,
signed in as the kinds of people the site has:

| Who | IAM user | Roles | Account's language | Checked |
| --- | --- | --- | --- | --- |
| owner | 1 | `ADMIN` | en | writes a survey with a picture, opens it, reads the answer, may delete it; the admin area is English for them in a Slovak tab too; rewords a string of the site, hides Slovak and offers it again; writes a second survey and translates it into Slovak in the editor; reads which language each person read it in; is told where Save is when a save of the strings fails; loses the session over two unsaved boxes and finds them again; is asked before signing out over them; adds a language (hidden) and deletes it; saves the survey over a translator's save and keeps the translator's texts; previews the main tab from a Slovak tab; saves over a version that removed a question and keeps its Slovak; meets a conflict in which "Save mine over it" is not offered; moves a survey's address; sets a past last day |
| pat | 101 | none | en | takes the survey once; the admin area says it is not theirs; at the end, on a Slovak page, gets the second survey whole in English - one of its texts is not translated any more; later carries on in it, sends to the address it has just left, and sends again from the new one |
| edith | 2 | `EDITOR` | en | sees the surveys and the answers, no Delete anywhere |
| nina | 102 | none | en | follows a link with `?lang=sk`: takes the survey in Slovak; in the second survey changes to English in the middle of a step, and keeps her answer |
| zuzana-kovacova-2026 | 103 | none | sk | nothing stored here: gets Slovak from her account; a twenty-character name in the bar; then chooses English; later reads the survey that has no Slovak (in English, and told so) and the translated one (in Slovak, to the thank-you) |

## Run it

From the repository's root:

```bash
node .claude/skills/check-in-browser/scripts/run.mjs            # builds the frontend first
node .claude/skills/check-in-browser/scripts/run.mjs --no-build # the build as it is
node .claude/skills/check-in-browser/scripts/run.mjs --keep     # leave the screenshots and logs
```

Prints `ok` / `FAIL` per check, then how many checks it made (`CHECKS (n)`) and
every page error, console error and console warning it saw (`PROBLEMS (0)` is
the goal), and exits 1 on any. After the build it takes about six minutes. A
string the site has no words for warns `[i18n] no string for '...'` - so a
missing string fails the check twice: as that warning, and as a key found on
the page.

With `--keep` it names the work folder: `shots/` holds a screenshot per stage,
numbered in the order of the flow (three digits: there are more than a
hundred). Look at them - a check can pass on a page that looks wrong:

- `001`-`009`: the English pass on a desktop window (the home page, the admin
  area, the user menu, the editor, the welcome, the thanks, the no-access page,
  the results);
- `en-360-*`, `en-390-*`: English on a phone, each page `-light` and `-dark`;
- `sk-360-*`, `sk-390-*`: the same pages in Slovak - the home page signed out,
  the chooser's menu, a survey signed out, the person's menu, the welcome, a
  step with its errors, the last step, carrying on, sent, already taken,
  nothing here; `sk-520-bar-*` / `sk-521-bar-*` / `sk-561-bar-*`: the top bar
  where the words beside the mark go and come back; `sk-*-admin-*`: the admin
  area opened from a Slovak tab;
- `admin-translations-*`, `admin-languages-*`: the two pages of the site's own
  words, at `1280` and `390` px, `-light` and `-dark` - the top of the
  Translations page, a plural family (`-plural`), a refused save beside its key
  (`-refused`), Slovak switched off (`-slovak-hidden`, and what readers get
  then: `en-1280-home-one-language`), a language just added, hidden, above the
  form with its switch (`-new-hidden`, at `1280` and `390`);
- `admin-translations-*-save-failed-*`: a save that failed with no key to
  blame, said in the bar Save is in (the server's 500 at `1280`, no answer at
  all at `390`); `admin-session-ended`, `admin-session-ended-390-*`: what is
  left of the Translations page when the session ends - "You are signed out",
  the mark without its words at 390; `admin-translations-1280-drafts-back-*`: the two boxes
  holding what was typed, after signing in again; `admin-sign-out-unsaved-*`
  and `sk-360-sign-out-unsaved-*`: the question before signing out over them,
  in English in the admin area and in Slovak where people take surveys;
- `editor-translating-1280-*`, `editor-translating-390-*`: the editor on the
  Slovak tab with five of seven texts written, the whole page, light and dark;
  `editor-translated-1280`: every text written; `editor-open-untranslated-1280`:
  the open survey after an option was added in English only, and
  `editor-open-untranslated-390-*` its Slovak tab on a phone (the tab's tag
  "shown in English" whole, under the main language's tab);
- `editor-conflict-1280`, `editor-conflict-390-*`: the author's save refused
  because a translator saved meanwhile; `editor-conflict-asked-1280`: the
  question before saving over it; `editor-conflict-settled-1280`: the Slovak
  tab afterwards, with the translator's texts; `editor-conflict-refused-1280`,
  `editor-conflict-refused-390-*`: a conflict in which "Save mine over it" is
  not offered (the other version written in Slovak, both translated);
- `sk-390-preview-main-*`: the preview from the editor's main tab on a Slovak
  page - the survey as it is written, "Jazyk: English";
  `sk-390-write-other-*`: "Other" chosen and left empty, in Slovak;
  `sk-390-survey-gone-*`: answers sent to an address the survey has left - the
  toast and "Tu nie je žiadny prieskum"; `sk-390-survey-moved-carry-on-*`: the
  new address offering to carry on;
- `editor-past-last-day-1280`, `editor-past-last-day-390-*`: an open survey
  whose last day is over, a text untranslated - "Closed", nothing said of its
  readers, "1 to fix before it reopens";
- `en-390-not-set-up-*`, `en-390-load-error-*`: the two pages drawn instead of
  the site, in a browser with nothing stored;
- `sk-360-home-two-surveys-*`: the home page listing a translated survey and
  one with no Slovak; `sk-360-english-survey-*`: the survey with no Slovak on a
  Slovak page; `sk-360-translated-*`: the translated one (welcome, step, sent);
  `en-360-translated-step-switched-*`: the same step after changing to English;
  `admin-read-in-slovak`: the drawer of the results; `sk-360-untranslated-*`:
  the survey with a text missing in Slovak, whole in English.

What to look for in the Slovak ones: a word cut off or pressed against an
edge, a line that wraps where it should not, anything left in English that the
site itself says (the survey's own texts are the editor's: in Slovak only when
every one of them is translated, otherwise all in the language they were
written in, with "Jazyk: English" on the page), and the top bar. In the admin
ones: nothing but English, an original beside its field on a desktop and above
it on a phone, nothing wider than a phone.

What it needs: the site set up once on this computer (`backend/config/database.local.php`
- the tests borrow its PostgreSQL server and user), PHP 8.2 or later on the
PATH (or `PHP=` naming it), and Chrome or Edge (or `CHROME=`). Ports 8590 (the
site), 8597 (the stand-in IAM) and 9590 (Chrome) must be free.

## What it does, and never does

`scripts/run.mjs`:

1. `npm run build` in `frontend/` (the site as the hosting serves it: app and
   API on one origin - `backend/router.php` serves the build beside `/api`).
2. A throwaway database `survey_test_browser` from `survey_test_template`
   (`backend/tests/tools/testdb.php`, `testenv.php`), with settings in a temp
   folder (`SURVEY_TEST_CONFIG`) - never `anotoki_survey`, never your
   `config/*.local.php`. The site's strings are in it because the migrations
   put them there (`php tests/tools/testdb.php template --fresh` after editing
   a migration that the template has already applied).
3. The stand-in IAM, `backend/tests/tools/fake-iam.php`, with a key of its own:
   it signs in whoever `POST /_test/state {user}` says, at once, with PKCE and
   refresh tokens like the real one. The user's `locale` (default `en`) is the
   token's `locale` claim - the language the account is set to. **Never the
   real IAM**, and never your account.
4. Headless Chrome with a profile of its own in the temp folder - never your
   browser's - started with `--lang=en-GB`: the browser's language is one of
   the things the site reads, so it is said, not left to the computer.
5. `scripts/flow.mjs` (the checks, over `scripts/cdp.mjs`, a small DevTools
   Protocol client - Node 22's built-in WebSocket).
6. Stops everything (the whole process tree on Windows), drops the database,
   removes the temp folder - also when a check fails.

## The stages of the flow

`flow.mjs` expects an empty site and goes through it in one order; a check that
depends on an earlier one says so by its place.

In English - pinned through the site itself: storage cleared, then `/?lang=en`,
which holds for the tab and is taken out of the address:

1. Signed out: the Sign in button, the chooser saying `EN`, the tab's title;
   `/admin` signs in through the IAM and comes back; no chooser in the admin area.
2. The user menu; a new survey with a picture, saved, reloaded, opened.
3. Pat takes it once (no way into the admin area in their menu; the admin area
   is not theirs - on the Translations page too, whose "See the open surveys"
   still leaves it). The owner's menu has the way in; the owner reads the answer
   and may delete it. Edith sees everything but the deletes.
4. A phone, 360 and 390 px, signed in and signed out: the top bar fits, no
   sideways scroll, a step's error, no key on the page.

In Slovak:

- First, a browser set to Slovak (`browserLanguage('sk-SK')`), nothing stored,
  nobody signed in, no `?lang=`: the site is Slovak, and its strings took one
  request - `GET /api/translations/sk-sk`, which the server answers by the
  base language. The browser is put back to English afterwards.

5. Storage cleared, `/?lang=sk`, signed out, 360 px: `<html lang="sk">`,
   "Prihlásiť sa", the chooser `SK` (named "Jazyk: Slovenčina") and its menu,
   the home page and the tab's title, the bar at 360, 390, 520 and 521 px (the
   words beside the mark are hidden up to 520 px while the chooser is there;
   signed out with no chooser - the admin area after a session ended - up to
   420 px, stage 10),
   a survey signed out.
6. Nina signs in - her account is English, the tab stays Slovak through the
   IAM and back: her menu, the welcome, the step about her with its errors
   (360 and 390 px), the last step, the home page's "Začatý", carrying on,
   sending, "already taken", the two not-found pages. After each: no key of
   the bundle, and nothing shaped like one, in the page's text, its spoken
   attributes or the tab's title.
7. The admin area from a Slovak tab: the no-access page for Nina, then the
   owner - through the menu's "Administrácia" and by the address - English,
   `<html lang="en">`, no chooser, the shared top bar in English; back to `/`
   it is Slovak again.
8. Storage cleared, Zuzana (her token says `locale: sk`): English while signed
   out (the browser's), Slovak once signed in, and nothing stored; the bar at
   561 px with her twenty-character name.
9. The chooser: English chosen, at once, kept on the device, and still there
   after a reload - stronger than the account's language.

The translating itself - from a clean start again (signed out, storage
cleared, `/?lang=en`), the owner in the admin area:

10. The Translations page, from the link in the surveys list: a row for every
    key, a column for each language, both languages whole; a plural family as
    one block (one, few, other, the numbers each form is for, the family said
    for 1, 3 and 12). A Slovak string reworded with a placeholder its English
    string does not have is refused beside its key; reworded properly it is
    saved, and a Slovak reader has it after a reload. Then what goes wrong
    there, with a box far down the grid: a save the server fails on (the one
    `PUT` answered 500 by the check) and one that reaches nobody are said in
    the bar Save is in, in view, at 1280 and 390 px - nothing at the top of
    the page. Two boxes typed and not saved; the session ends (the IAM
    refuses to renew it) and the page is gone: the layout says "You are
    signed out" (not "no editor role"), the bar fits at 390 and 421 px, the
    brand link and Back still navigate (the guard is asked with no page);
    the browser does not ask "Leave site?" on the way to the sign-in; signed
    in again, both boxes
    hold what was typed, marked as changed. Signing out over them asks first
    ("Stay" keeps everything) - in Slovak too, from the home page at 360 px,
    where "sign out anyway" gives them up: signed in again, no box is marked.
11. The Languages page: English the fallback and not switchable, nothing to
    delete; Slovak hidden - the site answers in English, a tab that asked for
    Slovak reads English and the chooser is gone, through the menu with no
    page load and after one - and offered again, the same two ways. A new
    language (Czech) is added with the form as it stands: hidden, in the
    list, offered to nobody (the site answers `cs` in English); then deleted
    again, so the rest goes on with two languages. Both pages at 390 px.
12. A second survey in the editor ("Tea or coffee?", a titled step, one
    question, two options). Slovak is added: the structure locked, every text
    a pair (the original `lang="en"`, the field `lang="sk"`), all marked as
    missing. "Next missing" goes through them in the survey's order and each
    is written: the progress on the tab and in the bar, the outline and the
    list of problems ("1 to fix before it opens", on the list and on the
    Editor tab's count), the refusal to open with texts left, beside / above at
    1280 / 390 px; then 7 / 7, "Ready to open", the Preview link with
    `?language=sk` - and from that preview "Back to the editor" opens the
    editor on the Slovak tab (`?language=sk`) - the same after a reload, and
    the survey is opened.
13. Zuzana, her account Slovak, 360 px: the home page lists the translated
    survey in Slovak and the first one in English with `lang="en"` and "Jazyk:
    English"; the first survey's welcome and step say `lang="en"` on its own
    texts and on nothing else, the site's words Slovak; the translated survey
    is Slovak from its name to its thank-you, nothing marked, no note.
14. Nina (`?lang=sk`) answers the translated survey's question, changes to
    English with the chooser: the same step in English, her answer and the
    step before kept; she sends. The owner's results say "Read in Slovak" for
    Zuzana, "Read in English" for Nina - and for Nina's answers to the first
    survey, read on a Slovak page.
15. The owner adds a third option in English only: the tab says 7 / 8 and
    "shown in English", and the editor's notice says the open survey has a
    problem and what it means - readers of Slovak see the survey in English
    until every text is translated (and nothing about a question being
    skipped), and its list of problems says "1 to fix - the survey is open";
    the Slovak tab says the same in its banner and in the bar that
    stays in view, whole at 390 px. Pat, on a Slovak page, gets the survey
    whole in English - the list, the welcome, the step - with the note.
16. The owner has the editor open; meanwhile "a translator" saves the survey
    (through the API, with the page's token: the missing Slovak option and a
    new Slovak title). The owner's next change is a conflict; the notice says
    what each way out keeps (the texts changed here, and those of what they
    removed or reworded, stay mine); "Save mine over it" asks, saves - and the
    translator's Slovak texts are still there, in the API's answer, on the
    Slovak tab (8 / 8) and for a Slovak reader; the list of problems says
    "Nothing to fix". A second question, with an "Other", is added in both
    languages through the API.
17. The owner's tab reads Slovak: the Preview of the editor's main tab names
    no language, shows the survey as it is written ("Jazyk: English",
    `lang="en"`), and "Back to the editor" lands on the main tab.
18. Pat, Slovak, 390 px, carries on in the survey: "Other" chosen and left
    empty is asked for in Slovak; meanwhile the owner changes the survey's
    address (through the API, with a token of the owner's taken before Pat
    signed in); Pat's answers go to the old address - the toast says the
    survey is not there any more and the answers are kept, the page is "Tu
    nie je žiadny prieskum"; at the new address the draft is offered, every
    answer in it, and sent.
19. The owner has the editor open; meanwhile somebody saves the survey
    without its second question. The owner's next change is a conflict; "Save
    mine over it" brings the question back with the owner's Slovak texts of
    it (the API's answer), and Slovak is whole on the tab.
20. The first survey in the editor; meanwhile somebody says it is written in
    Slovak and translates it into English; Slovak is added here: the conflict
    notice offers no "Save mine over it", says why and what to do first, at
    1280 and 390 px; "Take the saved version", and the survey is put back
    through the API.
21. The tea survey's last day set to yesterday and an option added in English
    only (through the API): the header says Closed, no notice or tag says what
    its readers see, the list of problems says "1 to fix before it
    reopens", and the Slovak tab's banner says what holds for it now - at
    1280 and 390 px.

The pages drawn instead of the site - storage cleared, 390 px:

22. Every request to the API answered 503 `not_set_up` by the check: the "not
    set up yet" page in English, and the tab named by the site ("anotoki
    survey") - never by a key - for `/`, an unknown address and `/admin`.
    Then no answer at all, for `/admin/languages`: the "cannot be reached"
    page; the server comes back, "Try again" - and the page asked for is
    drawn, through the sign-in, not a blank one.

## Changing the checks

Helpers at the top of `flow.mjs`: `go(path)`, `clickText(selector, text)`,
`focus(selector, n)` + `typeText(text)` (real input events - TipTap and Angular
both see them), `setFiles(selector, n, files)` (a file input, through
`DOM.setFileInputFiles`), `signInAs(user, words)` (signs out through the top
bar's menu, then in again through the stand-in IAM - `words` is `EN` or `SK`,
the language the page is in), `signOut(words)`, `viewport(width)`,
`screenshot(name, whole)` and `screenshots(name)` (the same page light, then
dark), `expect(what, ok, detail)`, `expectBar(where)` (the top bar holds what
is in it, and nothing scrolls sideways), `expectNoSideways(where)`,
`expectNoKeys(where)`, `text(selector)` / `texts(selector)`, `fill(selector,
value)` (a field's or a box's content replaced), `saved()` (the editor's header
says Saved), `marked(root)` (everything under `root` that says a language of
its own, as `class: lang`), `listed()` (the home page's surveys by address:
title, its `lang`, the language note), `chooseLanguage(nativeName, code)` (the
chooser), `pick(value)` (an answer by its value: `female`, `25-34`, an option's
id), `chosenLabels()`, `same(a, b)`.

For the stages where something fails: `intercept(pattern, say)` /
`stopIntercepting()` (the requests matching `pattern` are answered by
`say(request)`: `null` lets one through, `'unreachable'` gives it no answer,
`{status, body}` answers it - JSON, or a bare page when `body` is a text),
`requested` (every request the page made, as `GET /api/translations/sk`: a
stage counts from `requested.length` as it begins), `setIam(changes)` (the
stand-in IAM's state: `{user}`, `{refuse: true}` - refreshing is refused),
`browserLanguage('sk-SK')` (what the browser itself says its language is),
`question()` (the site's own question: its heading, text and buttons),
`expected` (expressions for the console messages a stage that takes the
server away is meant to cause; they go to `heard`, not to the problems) and
`leaving` (while a list, the browser's own "Leave site?" goes there).

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
- The language of a tab is in `sessionStorage` (`?lang=`), the chooser's choice
  in `localStorage`: a stage that starts "with nothing stored" clears both.
- The words the flow clicks and reads are the strings of the migrations
  (`backend/migrations/survey/003_site_strings.sql`): a migration that rewords
  one changes its matcher here. The survey's own texts stay as they were typed.
- The theme follows the device while nobody has chosen one, and the check
  never chooses: `theme('light' | 'dark')` sets what the device prefers. It is
  set to light at the start - a computer set to dark makes everything dark.
- A whole-page screenshot is taken from the top of the page: the top bar is
  sticky, and on a scrolled page it would be drawn across the middle.
- A bar with too much in it does not scroll, it squeezes the sign-in button
  (its words pressed into its padding): `expectBar` measures that, not only
  the window's width.
- `signInAs(user, words)` reads the page it is on: after `/?lang=sk` the tab is
  Slovak whoever is signed in (`SK`), after the chooser it is what was chosen,
  and with nothing stored it is the account's language while signed in and
  English (the browser's) once signed out.
- The Translations page lists every key, so `expectNoKeys` is not for it - nor
  a whole-page screenshot (it is some 180 rows long: `screenshots(name,
  false)` takes what the window shows). A box is
  `[id="key-<name>"] textarea[lang="<code>"]`; a refusal stands in
  `[id="key-<name>"] .field-error`.
- What is typed on the Translations and Languages pages and not saved is kept
  outside the pages (`LocalizationDrafts`, and `sessionStorage` for the tab),
  and the browser asks before such a tab is left (`beforeunload`) - on every
  page, while somebody is signed in (or the tab's storage refused them); not
  while nobody is signed in and the tab holds them, so not on the way to the
  IAM's sign-in after a session ended (stage 10 checks that). The flow saves before it goes
  anywhere, answers the browser's question if it ever comes, and counts it as
  a problem - except between `leaving = []` and `leaving = null`, the stage
  that leaves with boxes unsaved on purpose. A stage that types and does not
  save must give the boxes up before it ends (Discard, or "sign out anyway"),
  or every later page load asks, and every later sign-out.
- A session ends for the page when its access token has run out and the IAM
  will not renew it: `setIam({ refuse: true })`, the stored token's
  `access_expires_at` set to 0 with a `storage` event (as another tab would
  write it - the SDK listens), then anything that needs a token. Set `refuse`
  back before signing in again.
- A save that failed says so where `.save-state` is; the boxes marked as
  changed are listed by `marks()` in the grid's order - by key - not in the
  order they were typed.
- A translation's option is `{label}` and a picture `{alt}`, not a bare text:
  a survey saved through the API (stage 16) must send them so, or it is 422.
- Toasts stay for seconds over the bottom corner: `dismissToasts()` before a
  screenshot, and before reading the next toast.
- In a translation every field carries `data-place` - a JSON array that starts
  with what it is (`title`, `intro`, `thanks`, `step`, `text`, `option`,
  `placeholder`, `image`) - and "Next missing" puts the cursor in the next
  empty one after the field it was last in; the flow types where the cursor is.
- The editor's settings - the address and "Use the title" among them - are not
  drawn on a translation's tab: set the address before adding a language.
- An open survey can lose a translation: a text added in the main language is
  a gap, the server keeps the save, and readers of that language get the whole
  survey in the main language until the gap is filled. Stage 15 is that.
- The hero shows a step's number only; its title is the heading under the
  hero (`.step-heading`).

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
# with an account set to Slovak: ... -d '{"user":{"id":103,"username":"zuzana","roles":[],"locale":"sk"}}' ...
# the site in a language, for this tab: http://127.0.0.1:8590/?lang=sk
# afterwards: stop both, php tests/tools/testdb.php drop survey_test_manual, delete storage/manual*
```

(`storage/` is gitignored - the folder holds a copy of the database password.)
