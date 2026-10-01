# Architecture

```
 browser (Angular)                    backend (PHP, Slim 4)                    PostgreSQL (anotoki_survey)
 ─────────────────                    ─────────────────────                    ───────────────────────────
 AuthService ── sign-in ──▶ the anotoki IAM (OIDC code + PKCE; tokens in localStorage)
 ApiService ── /api/... + Bearer ──▶ index.php: security headers ▶ error handler ▶ setup gate ▶ route
                                        ├─ optionalUser / requireUser / requireRole: the token, checked here
                                        ├─ surveys.php, responses.php, images.php ─────────▶ surveys, responses,
                                        ├─ survey_rules.php, rich_text.php: what may be kept   images, survey_images, users
 TranslationService ── /api/translations/{code} ──▶ translations.php ─────────────────────▶ languages, translation_keys,
   (no token: the same for everybody)                                                        translations
```

One origin everywhere: on the hosting the web root holds the built app and
`api/` beside it (`.htaccess` routes `/api/*` to `api/index.php`); in
development `ng serve` on :4700 proxies `/api` and `/setup.php` to
`php -S localhost:8500 router.php`. There is no CORS, on purpose.

## Signing in, and the roles

The site has no login of its own. The frontend signs people in through the
anotoki IAM with its vendored browser SDK (`frontend/src/app/core/auth/anotoki-auth.mjs`,
v1.1.1, byte for byte the IAM's `sdk/js/`), as client `survey`:

- `AuthService.init()` runs before the first page (the app initializer,
  `boot()` in `core/boot.ts`): it reads
  `GET /api/auth/config` (`{issuer, clientId}` - or 503 `not_set_up`, and the
  site draws its "not set up yet" page), then lets the SDK finish a callback
  (`/auth/callback`; the SDK puts back the address the person came from before
  the router reads it) or restore the stored session. The language and its
  strings come next (*The site's own words*, below), and the site is drawn
  only once both are there.
- `authInterceptor` puts `Authorization: Bearer <access token>` on every `/api/`
  call while somebody is signed in (not on `/api/auth/config`, the pictures or
  `/api/translations/`), and retries once with a fresh token after a 401.
- `AuthService.signIn(returnTo, uiLocales)` sends the person to the IAM with the
  language they read this site in, so the IAM's pages open in the same one.
- The backend checks the token with the vendored verifier
  (`backend/api/anotoki_iam.php`, v1.0.1, the IAM's `sdk/php/`): RS256, typ
  `at+jwt`, the IAM's published keys (cached in `storage/cache/`), iss, aud
  `survey`, exp. `sub` is the person; `roles` their roles in this site. A
  person is recorded in `users` (id = the IAM's user id, name and address from
  the token) as they come.

| Role | May |
| --- | --- |
| (none) | take surveys - once each, while open |
| `EDITOR` | the admin area: write and translate surveys, open and close them, preview, read every answer, export; reword the site's strings, add and hide languages |
| `ADMIN` | all of that, and delete surveys, answers and languages |

The frontend hides what a role may not do (`AuthService.isStaff`, `isAdmin`);
the backend decides (`requireRole()` in `api/meddleware/auth.php`). The admin
routes need somebody signed in first (`signInGuard`: off to the IAM, and back);
a signed-in person without a role gets the admin layout's "this part is for the
people who write the surveys". Somebody whose session ends on an admin page
gets "You are signed out" instead - with what is kept, and no button: the top
bar's Sign in is the way on. (A signed-out person cannot reach the admin area
by its address - the guard sends them to the IAM - so on this layout "signed
out" always means a session that ended in place.)

## The data

A survey is a document: steps, their questions, the questions' options and
pictures are edited, saved and read as one thing, so they are one JSONB value
(`surveys.content`: `{intro, thanks, askAboutYou, steps, language,
translations}`); what the database
must look things up by - the address (`slug`), the title, the status, the
closing day, the times - are columns beside it. The frontend's
`core/survey/survey.model.ts` is the shape the API sends and takes.

| Table | Holds |
| --- | --- |
| `users` | who has signed in: the IAM's user id, name, address |
| `surveys` | the surveys; `revision` counts the saves; a partial unique index keeps one live (not draft) survey per address |
| `responses` | one filled survey per person and survey (unique); gender and age as columns (checked lists), the answers as JSONB by question id; `language`: the language the survey was read in, or null |
| `images` | the pictures' bytes (bytea), type and size - never changed once kept |
| `survey_images` | which survey shows which picture, rewritten with every save |
| `languages` | the languages the site has: code, name in English, name as its speakers write it, offered or not, order |
| `translation_keys` | the keys of the site's own words, each with a description for whoever translates it - written by migrations only |
| `translations` | one string: a key in a language, who last reworded it and when (nobody: as a migration wrote it). No row: that language reads the key in English |

Ids: the database makes the survey, response and picture ids (UUIDs); the
editor makes the ids inside a survey (steps, questions, options - random, and
free of the `:` and `,` the results' addresses use). An id is never reused, so
an answer keeps pointing at its option when the option is renamed or moved.

Migrations are the schema: `backend/migrations/survey/NNN_name.sql`, applied in
order by `api/migration_runner.php` (the family's engine) from `setup.php`,
`migration.php` and the tests. The setup gate answers 503 while one is pending.
The site's strings are part of it: `002` makes the three tables and the two
languages, `003` writes every key with its English and Slovak string, `004`
adds `responses.language`.

## The rules, on both sides

What an answer must be and what keeps a survey from opening are written twice,
in the same words: in the frontend (`core/survey/answer-rules.ts`,
`survey-problems.ts`, `localize.ts`), so people are told at once, and in the
backend (`api/survey_rules.php`), because the browser is not the only thing
that can send a request. Change one, change the other - and the tests on both
sides (`frontend/.../answer-rules.spec.ts`, `survey-problems.spec.ts`,
`localize.spec.ts`, `backend/tests/unit/rules.test.php`).

In the frontend a rule ("choose up to 3") and a problem ("please choose an
answer") are a kind and its numbers (`{kind: 'upTo', params: {max: 3}}`), not a
sentence, because the page a person answers on says them in that person's
language (`core/i18n/answer-words.ts`). The English sentences are
`choiceRuleText()` and `answerProblemText()` beside them: the admin area quotes
those, and they are what keeps the pair - `answerProblemText(answerProblem(...))`
says what PHP's `answerProblem()` says for the same case. The server's
sentences stay English and are never shown to somebody taking a survey.

- **An answer**: only options the question still has; one for a single choice,
  within the question's limits (and the options there are) for several;
  "Other" needs its words; text within the question's limit and never more than
  10 000 characters (1 000 for "Other"). Kept as `cleanAnswer` keeps it.
- **Opening**: a title, a valid address nobody else has, at least one question,
  no empty step, every question with text, choices with two options at least,
  labels, no two alike, sensible limits - and every translation into a language
  people are offered whole, its option labels no two alike. Drafts may break
  every rule while they are written.
- **Taking answers**: open, and the closing day not over *anywhere on Earth*
  (it ends at noon UTC the day after): the page tells people by their own
  clock, so nobody it still lets in is turned away.
- **A blank text**: both sides take for a space exactly what the browser's
  `trim()` takes away - `TEXT_SPACE` in `api/helpers.php` writes that set out,
  character for character, and `textTrim()` and `richTextPlain()` use it
  (`\s` and `\p{Z}` in PHP also take U+0085 and U+180E, which the browser does
  not). So the two sides find the same labels empty, the same translations
  missing a text, the same answers given. The site's own strings and the
  languages' names ask more - something in them to see (`textBlank()`): that
  is the server's rule, for what would otherwise be kept and drawn as an
  empty place. Its one twin in the browser is `blankText()` in the Translations
  page's `translation-grid.ts`, used only to tell whether a box is a change: a
  box holding nothing to see over no string is none (no "1 string changed",
  no "The string is saved."). A blank box over a string is still a change - it
  means "delete the row".
- **Rich text** (question texts, welcome, thanks): the server keeps only what
  the editor makes - `p br strong b em i u s mark a ul ol li h2 h3`, a link's
  address (http, https, mailto; always a new tab), a list's start - and drops
  or unwraps the rest (`api/rich_text.php`). The editor's own HTML comes back
  byte for byte. The frontend shows it with `[innerHTML]` (Angular sanitizes
  once more).

## Saving in the editor

`AdminStore` (`frontend/src/app/core/admin/admin-store.service.ts`) holds the
admin area's surveys, summaries and answers while pages come and go:

- Every change goes through `updateSurvey(id, change)` (in the editor, through
  `SurveyEditing`, by id): shown at once, saved 0.7 s after the last change, one
  save at a time per survey, as the survey was at that moment.
- A save names the revision it was made to (`PUT {revision, survey}`). The
  answer brings only the new revision - never the content, so typing is never
  disturbed. A revision the server has moved past is a **conflict** (409, with
  the survey as it is there): the editor offers "take the saved version" or
  "save mine over it"; nothing is overwritten silently. When translated texts
  are all that is unsaved on the page, it is settled by language instead: "keep
  my Slovak texts" takes their version and puts this page's Slovak texts into
  it (`AdminStore.keepMyTranslations()`), saved to their revision - texts of a
  step, question, option or picture their version no longer has cannot go
  anywhere, and the toast says so. What is unsaved is worked out from the
  documents, not remembered by the page (`AdminStore.unsavedChanges()`: the
  survey here against `_server`), so a page left for the preview or the
  results and entered again settles a conflict exactly as the page that made
  the changes would have.
- Either way the **translations are brought together text by text**
  (`mergeTranslations(base, mine, theirs, saved)` in `core/survey/localize.ts`,
  `saved` naming whose document the result is saved with; the editor's alone -
  the server settles nothing). The store remembers each survey as the server
  last had it from this page (`_server`: as loaded, as the last save that went
  through sent it, or their version once a conflict is settled); what differs
  from that here is what this page changed. A text written, reworded or
  emptied here is mine - over theirs when both changed the same one - and
  every other text is theirs, so an author's page left open does not undo what
  a translator saved meanwhile, and "keep my Slovak texts" does not replace
  another translator's Slovak. Saved with mine ("Save mine over it", `'mine'`),
  the texts of what their version removed or reworded stay mine too - my
  structure goes back with my words for it, never their translation of a
  question I do not have - and a translation is never replaced by a gap. A
  language added here is mine, one added by them theirs; one removed here
  stays removed (with whatever they wrote in it since - the notice and the
  question name it); one removed by them stays removed unless a text of it was
  changed here (then "keep my texts" puts it back, and the notice names it).
  "Save mine over it" merges only when both versions are written in the same
  language (`keepsTheirTranslations()`); when they are not, mine is saved
  whole - and when mine holds translations too, the server would refuse it
  (the language changes only while one side has none), so it is not offered
  at all until my translations are removed (`mineWouldBeRefused()`). The
  notice and the question before it say which of the four it is: nothing to
  say of translations, theirs kept except the texts changed here and those of
  what they removed or reworded, everything of theirs lost, or not possible as
  it is.
- Whatever a change removes - a step, a question, an option, a picture - takes
  its translated texts with it: `updateSurvey()` applies `pruneTranslations()`
  after every change, and the server drops them again on the way in.
- Out of reach (network, 5xx): it tries again by itself every 5 s. Refused for
  what it holds (422, 409 `slug_taken`) or for its size (413: a survey with all
  its translations is one save of at most 2 MB): it says why above the survey
  and waits for the next change. The header says Saved / Saving… / Not saved;
  leaving the page with changes not saved asks first, and so does signing out.
- Opening or closing first waits for the pending save (the server checks the
  survey it has), then sends the status and, when reopening a survey whose
  last day has passed, drops the day. It is a new revision too (the closing day
  is part of what editors save): saves asked for meanwhile wait for it and are
  made to the revision it brings back; another editor still on the old one gets
  a conflict instead of putting an old day back.
- Signing out - here, in another tab, or the IAM ending the session - keeps
  everything, changes not saved included. Only somebody else signing in lets
  go of it; answers from requests made before are then ignored. (What is typed
  on the Translations and Languages pages keeps the same rule, in
  `LocalizationDrafts` - *The site's own words*, below.)
- A fresh load that comes back older than what is here (a save of this page's
  finished meanwhile) is ignored.

The store also holds the site's languages (`languages`, asked for with the
first survey loaded, again with each survey loaded afresh - the editor and the
results on entry - and when a conflict brings a code the list lacks): a survey
names its language and its translations by code, and the names - and whether
people are offered a language - are there. What is here stays shown while
they are asked for, and a failure leaves it.

People taking a survey go around the store: `ApiService` directly. Their
answers stay a draft in the browser's localStorage
(`anotoki-survey:draft:{survey}:{person}`) until they press Send. A draft is
answers by id, so it is the same draft in whichever language the survey is read
- and at whichever address: answers sent to an address the survey has left
(404 `not_found` - its address was changed, or it was deleted) are said to be
kept, the page becomes "There is no survey here", and the survey's new
address offers to carry on.

## Pictures

- The editor prepares a file in the browser (`core/images/prepare-image.ts`):
  PNG, JPEG, WebP, GIF or AVIF up to 15 MB in; no side longer than 1600 px,
  saved as WebP (PNG or JPEG where the browser cannot); a GIF as it is (up to
  10 MB), an AVIF always re-encoded. `ImageUploader` sends the bytes to
  `POST /api/admin/images`.
- The server checks what the file *is* (`getimagesizefromstring`), never what
  the request calls it - no SVG, ever - keeps the bytes in `images`, and answers
  with the picture's id, size and address, `/api/images/{id}.{ext}`.
- A survey holds `{id, alt, width, height, src}` per picture; on every save the
  server fills in the size and address from the file itself and refuses a
  picture it does not have.
- Served with `Cache-Control: public, max-age=31536000, immutable` (the address
  never changes: a picture never changes), `nosniff`, and a CSP with `sandbox`.
- A picture no survey shows any more is deleted after its next survey save or
  delete - once it is a day old (an upload may be on its way into a save).

## The site's own words

What the site itself says to somebody taking a survey - its buttons, the rule
under a question, "you have already taken this survey" - is in English and
Slovak. **The admin area is English**, written in its templates; a survey's own
texts are the survey's (next section).

**Where the words are.** In the database, because they are edited in the admin
area (a file in the build would be overwritten by the next upload, and the host
has no shell): `translation_keys` names each string, `translations` holds its
value per language, `languages` the languages. Which keys there are is the
code's business: **migrations write them** with their first English and Slovak
string (`003_site_strings.sql`), and the admin area only ever rewords a value.
English is what every other language falls back to, string by string, so it
cannot be switched off, deleted or left empty. A string is text and is drawn
as text - there is no HTML in one.

**How a page gets them.** One request, `GET /api/translations/{code}`
(`translationBundle()`): the language's strings with English merged underneath,
the languages on offer, and English itself beside them for the admin area. No
token goes with it. It is answered with an `ETag`, so asking again is a 304. A
code with a region that is not offered itself is answered by its language
(`sk-sk` by `sk`), so a Slovak browser's first visit is one request.

**The start** (`boot()` in `core/boot.ts`, the app initializer): the theme,
`await auth.init()`, `await i18n.init()`, then a failed sign-in's toast - worded
now that there are words - and last `BOOTED`. `app.component` draws the site
only when the sign-in is ready *and* `BOOTED` is true; otherwise the first page
would show keys for a moment. The load error page's "Try again" runs the same
function - and, when it worked, opens the page itself: the address the page
was opened with when the router never got anywhere (its first navigation was
refused by the sign-in guard while the server was out of reach, which would
leave a blank page), the address in the bar otherwise.

`TranslationService.init()`:

- takes `?lang=` out of the address (before the router reads it) and keeps it
  for this tab in sessionStorage - it survives the round trip to the IAM;
- settles the language from, in this order: `?lang=` / this tab, the chooser's
  remembered choice (localStorage `anotoki-survey:language` - only the chooser
  writes it), the IAM token's `locale`, the browser's languages (each tag, then
  its first part; here alone `cs` counts as `sk` while no Czech is on offer),
  English. Only a code of the right shape is ever stored or sent. The first
  two are held in memory as well for as long as the page lives, so a browser
  whose storage refuses to be written still follows a `?lang=` link and a
  choice until it reloads;
- starts from the cached bundle (localStorage `anotoki-survey:language-cache`)
  when it is a bundle and is in the language settled on (a cache that is not
  is removed), and still asks the server, waiting up to a second for the answer
  (`CACHE_WAIT_MS`) - a release adds strings, and a returning reader would
  otherwise see their keys. Without a cache it waits for the request, and asks
  once more half a second later (`RETRY_WAIT_MS`) when the first did not come;
  after that the page is drawn as it is - in keys;
- always settles against the list of offered languages that came with the
  answer, whatever answered, and fetches the settled language's bundle when it
  is another than the one in hand. That is one request in the usual case and
  two at most: on a first visit whose first wish is not on offer, or when the
  offered languages have changed since the cached bundle was made (a language
  hidden, offered again or added reaches a returning reader at once, not one
  visit late). When the second request fails the first answer is what there
  is: a page in English rather than in keys;
- asks nothing while the site cannot run (not set up, out of reach), and then
  takes the cached bundle **in whatever language it is in**, and leaves it
  where it is - nobody is signed in, so the token's wish is not known, and
  those are the reader's own words from the last visit. The two boot pages
  take the cached string when there is one and the English written in the page
  otherwise (`boot/kept-word.ts`).

**Asking again.** Every load - the start, a choice in the chooser, `reload()`,
asking again - takes the next turn, and an answer is used only while its turn
is still the last: the load begun last wins, however late an earlier answer
comes.

- `reload()` reads the strings again for whoever has just changed them or the
  languages: the admin's Translations and Languages pages call it after a
  save, an import or a change of a language, so a language hidden or offered a
  moment ago is followed without a page load. It never rejects. (Not `init()`:
  that one takes `?lang=` out of the address and starts from the cache.)
- A page that has nothing from the server - no bundle at all, the cached one
  whose refresh failed, or a `reload()` that failed - asks once more at each
  navigation (`noteAddress()`, which the title strategy calls), one load at a
  time and only while the site can run. So such a page heals at the next
  click, and a server that stays down is asked no more often than somebody
  clicks.

**On a page.** `{{ 'home.title' | translate }}`,
`{{ 'home.questions' | translatePlural: n }}`, `{{ iso | localDate: 'day' }}` -
impure pipes, so a switch of language re-words the page without a reload. In
code, `i18n.t(key, params)`, `plural(key, count)`, `around(key, placeholder)`
(a sentence cut at one placeholder, for markup inside it) - inside a
`computed()` or an `effect()`, never kept worded in state. `around()` answers
`[before, after, found]`: `found` is false when the key has no string and
when the string leaves the placeholder out - which a language other than
English may - and the page draws the marked-up value only when it is true
(`@if (x()[2])`), or a name would be glued onto a sentence that does not name
it.

- `{placeholders}` are filled in one pass; which ones a key has is fixed by its
  English string, on the server too.
- A plural is a family `key.one` / `key.few` / `key.other`, chosen by
  `Intl.PluralRules` for the language on the page (Slovak: 1, 2-4, 0 and 5+),
  the number always `{count}`.
- **A key with no string comes back as itself**, on the page, and warns once in
  the console - the owner wants to see which key is missing.
- Keys put together at run time (`error.*`, `answer.rule.*`, `answer.problem.*`,
  `aboutYou.gender.*`, `aboutYou.age.*`) come from closed sets declared in
  `core/i18n/dynamic-keys.ts`, through a table with a fallback key - never from
  an address, the IAM's answer or what a person typed. A failed request is
  worded from its code (`error-text.ts`), never with the server's sentence.
- Dates and "5 minutes ago" go through `Intl` in the language on the page
  (`localDate`); `core/util/dates.ts` keeps the English ones for the admin area.

**The admin area is English whatever the person reads.** `effectiveLanguage`
is `en` while the address is `/admin` or under it, and everything that words a
string goes through it - so the pieces both areas share (the top bar, the UI
kit, toasts) are English there, and `<html lang>` says `en`. The service cannot
ask the Router where the page is (the Router builds the title strategy, which
needs the service - NG0200): `SurveyTitleStrategy` tells it after every
navigation (`noteAddress()`), and `init()` reads the address for the first page.
The same strategy writes the tab's title in the language on the page: a
route's `title` is a key on the pages people take surveys on, plain English in
the admin area. With no strings at all (the two boot pages in a browser that
has kept none) a participant route's title is the site's name alone - never
the key - and an admin route keeps its English title.

**The chooser** (`ui/language-switcher`, in the top bar where people take
surveys, when more than one language is on offer): a button with the code
("SK") and a menu of the languages under the names their speakers give them.
Choosing one loads its bundle, then switches and remembers. The button stays
usable while a language is on its way, and the last choice wins - going back
to the language on the page included, which drops the one still loading; an
overtaken choice is not called a failure.

**Editing them** (`pages/admin/localization`, EDITOR and ADMIN): *Translations*
is a grid - a key a row, a language a column - that saves only the cells that
changed; the server checks all of them before it writes any
(`translationsCheck()`: the key exists, the language exists, the length, no
brace that is not a placeholder, the placeholders) and answers the grid as it
is now. *Languages* adds a language - **hidden, unless its switch "Offer it to
readers right away" is on**: it has no strings yet - renames, reorders, offers
or hides it; only an ADMIN deletes one, and never English, a language the
migrations write strings for, or one a survey uses. A language can be exported
and imported as a flat JSON file, from the page and from the command line
(`backend/translations.php`). After every save, import or change of a
language both pages call `TranslationService.reload()`.

- **What is typed and not saved lives outside the pages**, in
  `LocalizationDrafts` (`core/admin/localization-drafts.service.ts`): the
  changed cells (`strings`) and the changed rows (`languages`). The admin
  layout draws its pages only for staff, so a session that ends - the IAM's
  idle limit, a sign-out in another tab or on another anotoki site - takes the
  page away with no navigation, and no guard runs then. The router still asks
  the pages' `unsavedChangesGuard` at the next navigation away - with no page,
  which it lets through (there is nobody to ask, and the drafts are not in the
  page); so the layout's links and Back work in that state. The drafts stay,
  and are mirrored to the tab's sessionStorage
  (`anotoki-survey:localization-drafts`, `{owner, strings, languages}`),
  because signing in again is a page load. They keep the store's owner rule:
  only another person signing in lets go of them. The top bar's "Sign out"
  asks first (one question, with a survey's unsaved changes when there are
  both) and gives them up when the answer is to go; "Leave" at the pages' own
  question gives up that page's. The one `beforeunload` question for both
  pages is the service's - asked while somebody is signed in, or when the
  tab's storage would not keep the drafts; not while nobody is signed in and
  the tab holds them, for the way on from there is the sign-in, which they
  survive. The cost: closing such a tab while signed out is not asked about,
  and loses them.
- A save that fails is said **in the bar Save is in**, which stays in view:
  "Nothing was saved." with the reason - until the next keystroke, which is
  the start of the next try: the bar says the count again (or "Everything is
  saved"). A refusal that names a key is also put
  beside that key. One about a language or a key that is gone
  (`unknown_language`, `unknown_key`) cannot be answered in a box: the page
  reads the grid again, lets go of what was typed for the thing that is gone,
  keeps the rest, and says so.
- A cell typed while a save or an import is on its way is held whatever it
  says - "the same as stored" cannot be told until the answer comes - and
  measured against the fresh grid then. On the Languages page one row at a
  time goes to the server, and what is typed in it meanwhile is a change to
  what the answer saved.
- "Missing in …" and the count of how much of a language is written leave out
  the plural forms the language's numbers never take (`formUsed()`: German has
  no `few`); English's three always count - they are the fallback.
- Which rows a search finds is worked out when the search, the filter or the
  grid changes, not at a keystroke in a box: a row found only by its unsaved
  words does not leave under the cursor.

**Held together by a test.** `backend/tools/translation_keys.php` scans the
frontend's sources for the keys it uses; `tests/unit/translations.test.php`
fails when the frontend uses a key the migrations did not write, when the
migrations wrote one nothing uses, when a key lacks its English or Slovak
string, or when a Slovak string uses a placeholder its English does not have.
The scan also fails what would show a key although "it exists" - a plural
family asked for as one string (`'L' | translate`, `.t()`, `.around()`,
`.has()`) or one string asked for as a family (`translatePlural`,
`.plural()`) - a key put together from a prefix `dynamic-keys.ts` does not
declare (a literal ending in a dot, a template literal going on with `${`),
and `innerHTML` given a translated string, on one line or several. The same
test file feeds every string the migrations wrote through `translationsCheck()`
and compares each string migration's closing gate with the keys it writes.
`php translations.php --status` says the same about the configured database
(exit 1 when it is not clean).

## A survey in more than one language

One survey holds its texts in every language it is read in - not one survey per
language - so the answers, the results and the once-each rule are about one
survey, whichever language a person read.

- **The document**: `language` is the language the survey is written in - the
  texts of the document itself. `translations[code]` holds the same texts in
  another language, each found by the id of what it belongs to: the title, the
  welcome, the thanks, each step's title, each question's text, hint, option
  labels and the descriptions of the pictures under its text. Nothing else is
  translated: ids, structure, pictures and limits are the survey's own, and an
  answer is the id of an option, not its words.
- **The functions** are pure, in `core/survey/localize.ts`, and written again
  in PHP in the same order: `translationGaps()` (where the survey has a text
  and the translation has none - a question counts what its type shows: option
  labels for a choice, the hint for own words), `localizedSurvey()`,
  `pruneTranslations()`, and the writers the editor uses.
- **People** (`survey-home`, `take-survey`) are shown
  `localizedSurvey(survey, language, 'complete')`: the translation into their
  language **only when nothing is missing from it** - otherwise the survey
  whole in the language it is written in, never half and half. When that is not
  the page's language, the page says so ("Language: English") and everything
  that draws a text of the survey carries `lang`, so a screen reader reads it
  as what it is - except the hint inside an own-words field and the labels
  that quote a survey text inside a site sentence: an attribute has one
  language, and `lang` on the field would also name the language of what the
  person types (a Slovak reader of an English survey answers in Slovak). The
  site's own words around it carry none. The server sends
  people only the translations into languages that are offered.
- **Switching the language in the middle of a survey** keeps every answer, the
  step and the draft: the same survey, the same ids. The About-you step is
  re-worded in place (its ids and option keys do not change).
- **Sending** carries the language the texts were shown in; it is kept with the
  answers (`responses.language`) when it is one of the survey's, and the
  admin's response view says "Read in Slovak". It never refuses the answers.
- **The editor** has a language switch: the main language and a tab per
  translation with its progress ("Slovak 42 / 57"), a way to add a language the
  site has and to remove a translation. On a translation's tab the same form is
  shown with the structure locked - nothing to add, remove, reorder or retype -
  and every text is a pair: the original, read-only, above (beside, from
  900 px) the field that edits the translation. "Next missing" goes through
  the gaps in the survey's order. The editor lets the language a survey is
  written in be changed only while it has no translation ("Written in" is
  locked otherwise); the server refuses the change only while a translation is
  kept across it (`surveySave()`). `/admin/surveys/{id}/edit?language=sk`
  opens that translation's tab when the survey has it - any other value is the
  main language, and an address that names none leaves the tab alone. The tabs
  scroll sideways on a desktop and wrap from 560 px down.
- **Opening** is refused while a translation into an offered language has gaps
  (`surveyProblems()`, both sides, the same sentences); one into a hidden
  language may be unfinished.
- **An open survey that gains a gap** - a text added in the main language
  after it opened - is not closed: readers of that language get it in the
  language it is written in until the text is translated, and the editor says
  so where each person looks. The notice at the top names the languages
  ("Until every text is translated, readers of Slovak see this survey in
  English.") and keeps its sentence about a skipped question only for
  problems that are not gaps; the language's tab carries a tag ("shown in
  English"); the translation's banner and the bar that stays in view say it
  too. A hidden language and a draft say nothing, nor does a survey whose last
  day is over: "open" here is the status as people meet it
  (`currentStatus()`, the header's - it says Closed then), not the stored one.
  The list of problems is worded by that status too (`problemsHeading()`: "N
  to fix before it opens" / "Ready to open" for a draft, "N to fix - the
  survey is open" / "Nothing to fix" while open, "N to fix before it reopens"
  / "Ready to reopen" when closed), and so is the title of the Editor tab's
  count. The frontend marks those
  problems (`SurveyProblem.untranslated`, `TranslationTab.readersGetMain`);
  the server's list is sentences only, and the same ones.
- **The preview** (`/preview/{id}?language=code`) shows a translation text by
  text (`'partial'`), the original where it has none yet, so a translator sees
  how far they are. `?language=` is the preview's own parameter and changes
  only the survey's texts; the site-wide `?lang=` sets the language of the tab.
  Without `?language=` - the Preview of the editor's main tab, and of the
  surveys list - it shows the survey as it is written, whatever language the
  page is in (on a Slovak page: "Jazyk: English", `lang="en"` on its texts).
  Its two "Back to the editor" links carry the translation it shows
  (`?language=`), so the editor opens on that tab again - and name none when
  it shows the original, so the editor opens on the main tab. The texts are
  marked (`lang`) and named on the welcome as the translation's language as a
  whole, the originals standing in a gap included - the preview is a
  translator's tool, and the page people take never mixes languages.
- **On the server** `surveyFromBody()` requires both fields, refuses a language
  the site does not have, and builds each translation by walking the survey's
  own steps, questions, options and pictures - so texts for ids that are gone
  are dropped, and every text is cleaned and measured like the one it
  translates. Wherever a survey leaves PHP, every map of a translation is a
  JSON object (`surveyTranslationsJson()`).
- **Copies** keep their translations: `copyQuestion()` says which id became
  which, and `duplicateQuestion()` / `copySurvey()` re-key the translated texts.
  A copied survey's title is a new one ("Copy of …"), so `copySurvey()` empties
  the title of every translation: each shows one text still to translate, and
  the copy cannot open to readers of another language under the original's
  name.

## At the same moment

Three things the site's languages and strings keep true when two requests
meet, each by a lock taken inside the request's transaction:

- **A survey's save and a language's delete.** The save holds the rows of the
  languages it is written in and translated into (`surveyLanguagesLock()`,
  `FOR SHARE` - after the survey's own row in `surveySave()`, first thing in
  `surveyCreate()`); `languageDelete()` holds the language's row
  (`FOR UPDATE`), then counts the surveys that use it, then deletes - three
  statements, so the count sees a save it waited for. Whichever comes second
  finds what the first did: the delete answers 409 `language_in_use`, the save
  422 "A language of this survey has just been deleted from the site…". No
  survey is left in a language the site does not have.
- **Two people adding a language.** `languageCreate()` takes the table
  (`LOCK TABLE languages IN SHARE ROW EXCLUSIVE MODE`) before it counts, so
  creators wait for each other and the most the site keeps (20) holds. Reading
  the rows, and locking them as the two saves do, is not held up.
- **Two saves of the same strings.** `translationsCheck()` hands its changes
  back by key and then by language, so every save takes its rows in one order
  and waits instead of deadlocking; `translationsSave()` holds the languages
  `FOR SHARE` between the check and the writing.

Everybody takes what they hold in one order, so they wait for each other and
do not deadlock: a save holds the survey's row and then its languages; a
delete holds a language and only reads the surveys; a new language takes its
table lock before anything else.
