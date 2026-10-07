---
name: check-in-browser
description: Check the survey site in a real browser, signed in, end to end - every page signed in first (to the IAM and back, nothing of a survey before), the family's top bar at 360, 390 and 1280 px with its phone menu; the owner writes and opens a survey with a picture, somebody takes it once, the results and the roles; the pages people take surveys on in Slovak (the top bar on a phone, a survey step by step, no key where a word should be, the admin panel English all the same); and the translating itself (the Translations and Languages pages, a survey translated in the editor, read in Slovak, in English where a text is missing, and which language each person read it in); and what goes wrong (a save the server fails on, a session that ends over unsaved strings, a save over a translator's save, the site not set up - never installed, or installed once - or out of reach, a database behind the code: the anotoki family's page for everybody and the admin panel's Migrations page that applies it, reached by a Sign in from that page); and visitors - the IAM's "Sign-in required" switched off: surveys taken without signing in, in two browsers, "Visitor N" / "Not signed in" in the admin panel, the answers and the draft moved into the account at a sign-in, and a visitor sent to sign in once the switch is on again - with headless Chrome and the stand-in IAM, on a throwaway database. Use after any change to the frontend, the API, sign-in, the site's strings or a survey's translations, before saying a change works, when a page renders blank or looks broken, or when the user asks to see or screenshot the site.
---

# Check the survey site in a browser

Unit tests and the PHP tests do not show a page that renders blank, a top bar
that overflows a phone, a sign-in that never comes back, or a page that shows
`home.title` where a word should be. This does - in a real (headless) Chrome,
signed in as the kinds of people the site has:

| Who | IAM user | Roles | Account's language | Checked |
| --- | --- | --- | --- | --- |
| owner | 1 | `MEMBER`, `ADMIN` | en | writes a survey with a picture, opens it, reads the answer, may delete it; the admin panel is English for them in a Slovak tab too; rewords a string of the site, hides Slovak and offers it again; writes a second survey and translates it into Slovak in the editor; reads which language each person read it in; is told where Save is when a save of the strings fails; loses the session over two unsaved boxes and finds them again; is asked before signing out over them; adds a language (hidden) and deletes it; saves the survey over a translator's save and keeps the translator's texts; previews the main tab from a Slovak tab; saves over a version that removed a question and keeps its Slovak; meets a conflict in which "Save mine over it" is not offered; moves a survey's address; sets a past last day; with the database behind, signs in from the family's page at the Migrations page's address and lands on it, reads "A database update is waiting" anywhere else, applies - stopped by a file that fails, with its error - and applies again |
| pat | 101 | `MEMBER` | en | takes the survey once; the admin panel says it is not theirs; at the end, on a Slovak page, gets the second survey whole in English - one of its texts is not translated any more; later carries on in it, sends to the address it has just left, and sends again from the new one; with the database behind, signs in from the family's page and reads "being updated", nothing to press |
| edith | 2 | `MEMBER`, `EDITOR` | en | sees the surveys and the answers, no Delete anywhere, no Migrations; with the database behind, at the Migrations page's address, the family's "being updated" and no link |
| nina | 102 | `MEMBER` | en | follows a link with `?lang=sk`: takes the survey in Slovak; in the second survey changes to English in the middle of a step, and keeps her answer |
| a visitor (nobody signed in) | - | - | the browser's, then `?lang=sk` | with "Sign-in required" off: takes two surveys and leaves a draft in a third, without signing in; is kept out of the admin panel and the preview; signs in from the notice - as the owner - and their answers and draft are the owner's; a second browser is a visitor of its own, listed as "Visitor N", and is sent to sign in once the switch is on again |
| zuzana-kovacova-2026 | 103 | `MEMBER` | sk | nothing stored here: gets Slovak from her account; a twenty-character name in the bar; then chooses English; later reads the survey that has no Slovak (in English, and told so) and the translated one (in Slovak, to the thank-you) |

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

- `en-1280-bar-*`: the top bar on a desktop, signed in (brand, Surveys, EN, the
  theme, the person); `en-1280-signed-out-*`: a sign-in the IAM turned down -
  the card "You are not signed in", Sign in in the bar;
- then the English pass on a desktop window (the admin panel, the user menu,
  the editor, the welcome, the thanks, the no-access page, the results);
  `admin-761-bar`, `admin-960-bar`, `admin-961-bar`: the admin panel's bar on
  a narrow desktop - "survey" with "admin panel" small under it up to 960 px,
  "anotoki survey · admin panel" from 961 - with the three links, the theme, the person;
- `en-360-*`, `en-390-*`: English on a phone, each page `-light` and `-dark`;
  `en-390-home-*` and `en-390-phone-menu-*` the phone's bar and its menu (the
  links, then the person's menu), `en-360-home-signed-out-*` and
  `en-360-phone-menu-signed-out-*` the card and the menu with Sign in;
- `sk-360-*`, `sk-390-*`: the same pages in Slovak - signed out (the card, and
  the phone menu with "Prihlásiť sa"), the chooser's menu, a survey signed
  out (the card, nothing of the survey), the person's menu, the welcome, a
  step with its errors, the last step, carrying on, sent, already taken,
  nothing here; `sk-760-bar-*` / `sk-761-bar-*`: the top bar where it folds
  into the menu button and where the links come back; `sk-360-phone-menu-*`
  a twenty-character name in the phone menu, `sk-960-bar-*` / `sk-961-bar-*`
  where the name goes beside the initial; `sk-*-admin-*`: the admin panel
  opened from a Slovak tab;
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
  with its own Sign in, the menu button at 390; `admin-translations-1280-drafts-back-*`: the two boxes
  holding what was typed, after signing in again; `admin-sign-out-unsaved-*`
  and `sk-360-sign-out-unsaved-*`: the question before signing out over them,
  in English in the admin panel and in Slovak where people take surveys;
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
- `admin-migrations-editor`: the Migrations page's address opened by an EDITOR
  - the family's page says "Migrations are for administrators.";
- the database behind - the anotoki family's page: `sk-390-behind-visitor-*`
  ("Stránku práve aktualizujeme", nothing but a quiet "Prihlásiť sa"),
  `sk-390-behind-participant-*` and `en-1280-behind-participant` (the same
  for somebody signed in - nothing to press), `en-1280-behind-editor` (the
  same at `/admin/migrations`), `sk-390-behind-admin-*` and
  `en-1280-behind-admin` ("A database update is waiting" and "Open
  Migrations", in English on a Slovak page too);
  `admin-migrations-behind-1280` (the family's Migrations page in the admin
  layout: two files pending, only Migrations in the bar, `brand.adminPanel`
  shown as a key - expected there),
  `admin-migrations-failed-1280` / `-390-*` ("Stopped at
  004_response_language.sql" and the database's error in its box - look at the
  box on a phone: the error wraps, nothing wider than the window),
  `admin-migrations-up-to-date-1280` / `-390-*` ("Up to date", the four links,
  "admin panel" in the brand);
- visitors ("Sign-in required" off): `admin-results-visitor-1280` (the
  results' people: "Visitor N", "Not signed in"), `-drawer-1280` (the drawer
  of their answers), `admin-response-visitor-390-*` (the page of their
  answers); `en-390-visitor-home-*` (the list with no sign-in and the notice
  above it), `en-390-visitor-welcome-*` ("You are not signed in · your
  answers go without your name." and the notice), `en-390-visitor-sent-*`;
  `sk-390-visitor-home-*`, `sk-360-visitor-home` and
  `sk-390-visitor-welcome-draft-*` (the notice, the line, "Pokračovať" for
  the visitor's draft - in Slovak, the longer words); `sk-390-visitor-signed-in-moved`
  (the toast after the sign-in: one survey moved, one kept the owner's
  answers); `admin-results-visitor-390-*` (the owner and the other browser's
  visitor side by side);
- `en-390-not-set-up-*` (never installed: "This site is not set up yet", the
  setup page), `en-390-not-available-*` (installed once: "not available right
  now", no setup page), `en-390-unavailable-*` (nothing answers) - the
  family's page - and `en-390-load-error-*` (the site's own card: the status
  answered, the sign-in did not), in a browser with nothing stored;
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
PATH (or `PHP=` naming it - `PHP=php8` where `php` is an older one), and
Chrome or Edge (or `CHROME=`). Ports 8590 (the site), 8597 (the stand-in IAM)
and 8591 (Chrome) must be free - or name others: the anotoki sites' checks
share 8590-8599, so beside another one running give
`SURVEY_CHECK_SITE_PORT`, `SURVEY_CHECK_IAM_PORT` and
`SURVEY_CHECK_CHROME_PORT`. `run.mjs` refuses a port something already
listens on (it would drive the other check's site or browser), and at the end
asks its browser to close itself before stopping what it started (Edge's
launcher exits at once, and the browser it hands over to would outlive it).

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
   token's `locale` claim - the language the account is set to. A user given
   `preferences` (`{theme, date_format, time_format}`) has them in the tokens,
   as an IAM with its migration 015 sends them, and `POST
   /api/oidc/preferences` changes them; without them - the default, and every
   tour here today - it is an IAM from before 015, answers that address 503,
   and the site keeps its own theme, dates and language order, as before (the
   account's preferences are the unit tests'; the build analyzer's verify-ui
   has a tour of them). **Never the real IAM**, and never your account.
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

1. Signed in first: `/` with nothing stored goes to the IAM and comes back to
   `/` signed in - no `GET /api/surveys` before the IAM's `authorize`; a
   survey's address comes back to that address; the API answers 401 without a
   token for the surveys, a survey and the admin panel. The chooser says `EN` (named "Language: English (EN)"),
   the tab's title. The bar at 1280 px: one row - brand ("anotoki survey",
   linking `/`), Surveys (the page), the chooser, the theme, the person. A
   sign-in the IAM turns down (`deny`): on `/admin` the card says "You are
   not signed in" (never "Your session has ended"); on `/` the card and the
   bar's Sign in, which signs in. The browser refusing the site the storage
   the sign-in needs (a script makes the SDK's `setItem` throw): the card,
   and a toast that says why - not a blank page. `/admin` signs in through the IAM and comes back; no chooser
   there, its links Surveys, Translations, Languages and - the owner is an
   ADMIN - Migrations (the bar measured at 761, 960 and 961 px with all four).
2. The user menu: focus on its first item, ArrowDown, End, round to the
   first, Escape gives the focus back to the button; Tab from the first, a
   middle and the last item (and Shift+Tab) closes it with the focus on the
   button, and the next Tab moves on (never to `<body>`); a click outside
   closes it; a new survey with a picture, saved, reloaded, opened.
3. Pat takes it once (no way into the admin panel in their menu; the admin panel
   is not theirs - on the Translations page too, whose "See the open surveys"
   still leaves it). The owner's menu has the way in; the owner reads the answer
   and may delete it. Edith sees everything but the deletes - and no
   Migrations: not in her bar, at its address the page says it is for
   administrators (and asks the server nothing), and the API refuses her.
4. A phone, 360 and 390 px, signed in and signed out: the top bar fits (brand
   with "survey" alone, chooser, theme, menu button), no sideways scroll, a
   step's error, no key on the page; the phone menu - the links, then the
   person's menu; focus in, arrows, Home, Escape back to its button, a click
   outside, Tab and Shift+Tab from the first, a middle and the last item back
   to its button, a link chosen; signed out the card, and Sign in in the
   menu.

In Slovak:

- First, a browser set to Slovak (`browserLanguage('sk-SK')`), nothing stored,
  nobody signed in (the IAM turns the sign-in down), no `?lang=`: the card is
  Slovak, and its strings were asked for in Slovak alone -
  `GET /api/translations/sk-sk` (which the server answers by the base
  language), and after the IAM the cached `sk` again; never English first.
  The browser is put back to English afterwards.

5. Storage cleared, `/?lang=sk`, signed out (turned down), 360 px:
   `<html lang="sk">` through the IAM and back, the card "Nie ste
   prihlásení" with "Prihlásiť sa", the chooser `SK` (named "Jazyk:
   Slovenčina (SK)") and its menu, the tab's title, the brand "prieskum", the menu
   button "Ponuka" and its menu; the bar at 390, 760 and 761 px (the menu
   button up to 760, the links and Sign in in the row from 761); a survey
   signed out - the card, nothing of the survey drawn or asked of the API.
6. Nina signs in from that card - her account is English, the tab stays
   Slovak through the IAM and back, and she is back on the survey's page:
   her menu, the welcome, the step about her with its errors
   (360 and 390 px), the last step, the home page's "Začatý", carrying on,
   sending, "already taken", the two not-found pages. After each: no key of
   the bundle, and nothing shaped like one, in the page's text, its spoken
   attributes or the tab's title.
7. The admin panel from a Slovak tab: the no-access page for Nina, then the
   owner - through the menu's "Administrátorský panel" and by the address - English,
   `<html lang="en">`, no chooser, the shared top bar in English; back to `/`
   it is Slovak again.
8. Storage cleared, Zuzana (her token says `locale: sk`): English while signed
   out (the browser's), Slovak once signed in, and nothing stored; her
   twenty-character name whole in the phone menu at 360 px, and in the bar at
   960 / 961 px (the initial alone, then the name).
9. The chooser: English chosen, at once, kept on the device, and still there
   after a reload - stronger than the account's language.

The translating itself - from a clean start again (signed out, storage
cleared, `/?lang=en`), the owner in the admin panel:

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
    signed out" (not "no editor role") with its own Sign in, the bar fits at
    390 px (brand, theme, the menu button - its menu the sections and Sign in), the
    brand link and Back still navigate (the guard is asked with no page);
    the browser does not ask "Leave site?" on the way to the sign-in; signed
    in again, both boxes
    hold what was typed, marked as changed. Signing out over them asks first
    ("Stay" keeps everything) - in Slovak too, from the home page at 360 px,
    where "sign out anyway" gives them up: out at the IAM and - every page
    asks for a sign-in first - in again at once, no box is marked.
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

A database behind the code - the one stage that changes the database itself
(`sql()`, on `survey_test_browser` through the settings run.mjs wrote:
`SURVEY_CHECK_PHP`, `SURVEY_CHECK_BACKEND`, `SURVEY_CHECK_CONFIG`):

22. The rows of `004_response_language.sql` and `005_top_bar_and_sign_in.sql`
    taken out of `migrations`, and the key `brand.adminPanel` (which 005
    writes) deleted. The API is 503 `update_pending` with `Retry-After: 60`,
    the sign-in's settings answer (no `update` field), `/api/site-status` says
    `update_pending`. Nobody signed in, `?lang=sk`, 390 px: the anotoki
    family's page, "Stránku práve aktualizujeme", in Slovak - no trip to the
    IAM (the page's own requests), no error, no setup or Migrations link,
    nothing to press but a quiet "Prihlásiť sa"; pressed, as Pat: through the
    IAM and back to `/`, the same page with nothing to press; in English at
    1280. Edith, signed out at `/admin/migrations`, signs in from it: back
    there, "The site is being updated", no Migrations page. Behind the
    family's page no page is made: for a visitor with "Sign-in required"
    switched off for a moment (whom the list of surveys would take), for Pat
    signed in, and for the owner's "A database update is waiting" below, the
    site's API was asked nothing but the status, the sign-in's settings and
    the strings (the owner, the Migrations page's list too: `askedBehind()`),
    and no toast came. The owner, signed
    out at `/admin/migrations`, signs in from it: back there, on the family's
    Migrations page - 004 and 005 pending, only "Migrations" in the bar, the
    tab "Migrations · …", and the brand showing `brand.adminPanel` (the strings
    read while behind lack it; the warning is expected). On a Slovak page the
    owner reads "A database update is waiting" (English, `lang="en"`) with
    "Open Migrations", which opens the page at 1280. "Apply pending", asked
    "Apply 2 pending migrations?": "Stopped at 004_response_language.sql",
    nothing applied, rolled back, and PostgreSQL's error ("column "language"
    of relation "responses" already exists", with the statement) in its box -
    at 1280 and 390. 004's row put back; Apply again: "Up to date - Applied:
    005_top_bar_and_sign_in.sql.", nothing pending, the bar's four links back
    and "admin panel" in the brand (the strings read again), no key on the
    page; at 1280 and 390; Surveys opens the list, no reload.

Visitors - the IAM's "Sign-in required" switched off (the stand-in's
`login_required`, and the kept answer in the work folder's `config/cache`
deleted, so the site asks again at once):

23. The owner makes three open surveys through the API ("Visit one", "two",
    "three" - one question, Slovak whole) and answers "Visit two" as
    themselves. `/api/auth/config` says `loginRequired: false`,
    `visitorDays: 30`. A **second browser** (a context of its own, nothing
    stored) opens `/`: no trip to the IAM, the three surveys "New", the
    notice; it answers "Visit one" - a key in its `localStorage`. The owner's
    results of "Visit one" list it as "Visitor N" (N from its negative id),
    "Not signed in" where the address is - in the table, the drawer, and on
    the page of its answers at 390 px. Then the first browser forgets its
    session: `/?lang=en` at 390 px is the list with no trip to the IAM, the
    notice ("for 30 days after your last visit", Sign in), the welcome's
    visitor line; no key before the first answers, one after; "already
    taken" again; "Visit two" sent, "Visit three" started and left; after a
    page load "Taken, Taken, Started". `/admin` and `/preview/{id}` still go
    to the IAM (turned down here): their cards, the refusal's toast. In
    Slovak: the notice ("ešte 30 dní"), "Vyplnený, Vyplnený, Začatý", the
    line, "Pokračovať" for the draft, at 390 and 360 px, no key on the page.
    Sign in from the notice, as the owner: the toast says one survey moved
    and one kept the owner's earlier answers (in Slovak); the key is gone;
    the home page is the owner's, the draft with it; "Visit one" is the
    owner's beside the other browser's visitor, "Visit two" kept the owner's
    own answer only. Switched on again: the second browser, holding its key,
    goes to the IAM before anything of a survey is asked for (turned down
    here: the card), and keeps its key.

The pages drawn instead of the site - storage cleared, 390 px:

24. Every request to the API answered as the backend's gate answers a site
    not set up and never installed (`/api/site-status`: `not_set_up`,
    `installed: false`): the family's "This site is not set up yet" in
    English, with "Open the setup page" (`/setup.php`), and the tab named by
    the site - never by a key ("anotoki survey"; the admin area's English
    title, "Surveys · Admin panel · anotoki survey") - for `/`, an unknown
    address and `/admin`. Installed once (`installed: true`): "The site is not
    available right now" and "Try again" - never the setup page. Then no
    answer at all, for `/admin/languages`: the family's "not available right
    now" at that address; the server comes back, "Try again" - the page loads
    again and the page asked for is drawn, through the sign-in. And the status
    answering while the sign-in's settings do not: the site's own card, "The
    survey site cannot be reached"; "Try again" - the page asked for, through
    the sign-in, not a blank one.

## Changing the checks

Helpers at the top of `flow.mjs`: `go(path)`, `clickText(selector, text)`,
`focus(selector, n)` + `typeText(text)` (real input events - TipTap and Angular
both see them), `setFiles(selector, n, files)` (a file input, through
`DOM.setFileInputFiles`), `signInAs(user, words)` (the stand-in told to sign
in `user`, then out through the top bar's menu - and in again at once, for `/`
asks first; `words` is `EN` or `SK`, the language the page is in),
`signOut(words)` (out, and in again as whoever the stand-in signs in now),
`signedOutOn(path)` (nobody signed in on `path`: the session forgotten and the
stand-in told to `deny`, so the page comes back without a sign-in and draws
its card; `setIam({ deny: false })` and a Sign in end it), `forgetSession()`,
`SIGNED_IN` (an expression: the site holds tokens and the bar is drawn),
`whoIsIn()` (the name the bar says - on a phone read from its menu),
`openUserMenu()` (the person's button, or the phone's menu button),
`barRow()` (the bar's row in order: brand, links, controls), `focused()`,
`press(key)` (ArrowDown, ArrowUp, Home, End, Tab), `viewport(width)`,
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
- Nobody is ever signed out for long (but in the visitors' stage, with the
  switch off): every page sends somebody not signed in to the IAM, and the
  stand-in signs in at once. A signed-out page is one the IAM turned
  down (`setIam({ deny: true })` - the stand-in answers `access_denied`): the
  guard lets that page load through, the layout draws its card, and a toast
  says the sign-in did not go through (`signedOutOn()` dismisses it). Forget
  `deny: false` and every later sign-in is turned down.
- While the site cannot run (a database behind, stage 22) nobody is sent to
  the IAM: the family's page stands with its own quiet Sign in, which
  `signInThere(user, words)` presses (`signedOutBehind(path)` gets there with
  nobody signed in). Count trips to the IAM from the page's own `requested`
  (`GET /api/oidc/authorize`), never from the stand-in's log: that holds the
  check's own questions too (`GET /_test/state` - `iamTrips()` itself asks one).
- The family's pages are the library's markup: `anotoki-site-status` (`h1`,
  `p`, its buttons and links) and `anotoki-migrations-page` (`[data-apply]`,
  `dialog[data-confirm]` with `[data-confirm-apply]`, `[data-result]` with its
  `h2`, `p` and `pre`, `[data-pending] li`, `[data-applied]`). A new release of
  the library may move them: read its templates
  (`frontend/node_modules/@anotoki/lib`) before blaming the site.
- A page made behind the family's page is not in the document: what a
  component projects and does not show is made but never attached, so
  `document.querySelector('app-survey-home')` finds nothing either way. What
  gives it away is what it asks - count the page's own requests
  (`askedBehind(from)`).
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
- Every account holds MEMBER (the IAM gives it to everyone): an ordinary
  person's roles are `['MEMBER']`, never `[]`.
- The stand-in also answers the IAM's public question about the site
  (`GET /api/public/applications/survey`: `login_required`, default true;
  `application_missing` makes it 404). The site's backend asks it when a page
  loads (`/api/auth/config` relays it) and keeps the answer a minute in the
  work folder's `config/cache`, so that line turns up in the stand-in's `log`:
  read the browser's trips with `iamTrips()`, which leaves it out (the log
  keeps only its last 200 lines: a stage that asks "no trip to the IAM" counts
  the page's own `requested` instead). Only the visitors' stage switches it,
  through `signInRequired(false | true)`, which deletes the kept
  `anotoki-iam-application-*.json` there - or the site would go by its old
  answer for up to a minute - and puts it back on before the next stage.
- The visitor's key is `localStorage['anotoki-survey:visitor']`; clearing
  `localStorage` makes a browser a new visitor, and a second browser is
  `openPageInNewContext(port)` (`cdp.mjs`: a browser context of its own,
  disposed with `close()`), whose requests and console the stage watches
  itself.
- A visitor answered by the flow and the same survey answered by the person
  who then signs in is the "kept" half of the move's toast; a survey only the
  visitor answered is the "moved" half - the stage has one of each.
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
# who signs in: curl -X POST -d '{"user":{"id":1,"username":"owner","roles":["MEMBER","ADMIN"]}}' http://127.0.0.1:8597/_test/state
# with an account set to Slovak: ... -d '{"user":{"id":103,"username":"zuzana","roles":["MEMBER"],"locale":"sk"}}' ...
# the site in a language, for this tab: http://127.0.0.1:8590/?lang=sk
# visitors welcome ("Sign-in required" off): curl -X POST -d '{"login_required":false}' http://127.0.0.1:8597/_test/state
#   then delete storage/manual/cache/anotoki-iam-application-*.json (or wait a minute) - and the same with true to switch back
# afterwards: stop both, php tests/tools/testdb.php drop survey_test_manual, delete storage/manual*
```

(`storage/` is gitignored - the folder holds a copy of the database password.)
