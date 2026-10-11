# Architecture

```
 browser (Angular)                    backend (PHP, Slim 4)                    PostgreSQL (anotoki_survey)
 ─────────────────                    ─────────────────────                    ───────────────────────────
 AuthService ── sign-in ──▶ the anotoki IAM (OIDC code + PKCE; tokens in localStorage)
 VisitorKey (the key, the move)
 SiteStatus ── /api/site-status ──▶ index.php: security headers ▶ error handler ▶ site gate (anotoki/lib) ▶ route
 ApiService ── /api/... + Bearer, or X-Visitor-Key ──▶ the same way in
                                        ├─ requireUser / requireRole: the token, checked here;
                                        │  requireTaker (the surveys' routes): the token, or a visitor's key
                                        ├─ visitors.php, client_address.php: visitors, their limits, the move
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
anotoki IAM with its vendored browser SDK (`frontend/src/app/core/auth/anotoki-auth.mjs`
and `.d.ts`, v1.2.0, byte for byte the IAM's `sdk/js/`), as client `survey`:

- `AuthService.init()` runs before the first page (the app initializer,
  `boot()` in `core/boot.ts`), right after the start has asked where the site
  stands (`SiteStatus.check()`, *A database behind the code*, below): it reads
  `GET /api/auth/config` (`{issuer, clientId, loginRequired, visitorDays}` - or
  503 `not_set_up`, and the family's page says so; answered while a migration
  is pending too), then lets the SDK finish a callback
  (`/auth/callback`; the SDK puts back the address the person came from before
  the router reads it) or restore the stored session. `loginRequired` (the
  IAM's switch, below) becomes `AuthService.loginRequired` - true unless the
  backend says false - and, with `visitorDays` (a backend that does not say
  it is one from before visitors), `visitorsWelcome`: the pages people take
  surveys on are open to visitors (*Visitors in the browser*, below). `boot()`
  makes `VisitorKey` before it awaits anything, and, back from a sign-in,
  makes this browser's visitor drafts the person's before the first page is
  drawn. The language and its strings come next (*The site's own words*,
  below), and the site is drawn only once both are there.
- `authInterceptor` puts `Authorization: Bearer <access token>` on every `/api/`
  call issued for a person (not on `/api/site-status`, `/api/auth/config`, the
  pictures or `/api/translations/`), and retries once with a fresh token after a 401. A
  person's call whose token comes back null is never sent (401
  `sign_in_required`, at once); a visitor's call carries the visitor key
  instead (below).
- `AuthService.signIn(returnTo, uiLocales)` sends the person to the IAM with the
  language they read this site in, so the IAM's pages open in the same one.
- The backend checks the token with the vendored SDK
  (`backend/api/anotoki_iam.php`, v1.1.0, byte for byte the IAM's `sdk/php/`):
  RS256, typ `at+jwt`, the IAM's published keys (cached in `storage/cache/`),
  iss, aud `survey`, exp. `sub` is the person; `roles` their roles in this
  site. A person is recorded in `users` (id = the IAM's user id, name and
  address from the token) as they come. Only an `Authorization: Bearer` header
  claims to be somebody (`authSentCredentials()`): one whose token does not
  check out - an empty one too - is 401 `invalid_token`, never "nobody"; any
  other scheme (`Basic`, from a host behind a password file) is not looked at.
- **Sign-in required** is the IAM's to say, per site (its admin panel:
  Applications -> survey -> "Sign-in required"). `authLoginRequired()` asks it
  through the SDK (`anotoki_iam_login_required()`:
  `GET {issuer}/api/public/applications/survey`), keeps the answer a minute in
  `storage/cache/` (one request asks when the minute is up, the others use the
  kept answer; an IAM that does not answer is asked again a minute later), and
  `/api/auth/config` relays it. It **fails closed**: true unless the IAM said
  false - an unknown application (404), an IAM never reached, an answer about
  another site all mean "required"; an IAM out of reach after it answered
  keeps its last answer.
- **Visitors** - the switch off: surveys taken without signing in, on the
  pages people take surveys on (below, *Visitors* and *Visitors in the
  browser*). The admin panel and the editor's preview sign in first whatever
  the switch says.

| Role | May |
| --- | --- |
| `MEMBER` | every account holds it (the IAM gives it to everyone): an ordinary person - take surveys, once each, while open. No check here asks for it; a token without it (an older one) is the same |
| `EDITOR` | the admin panel: write and translate surveys, open and close them, preview, read every answer, export; reword the site's strings, add and hide languages |
| `ADMIN` | all of that, and delete surveys, answers and languages; see and apply the database's migrations (the Migrations page) |

The frontend hides what a role may not do (`AuthService.isStaff`, `isAdmin`);
the backend decides (`requireRole()` in `api/meddleware/auth.php`). Every page
needs somebody signed in first (`signInGuard`: off to the IAM before anything
of the page is drawn, and back to the address asked for) - the admin panel
(`canActivate`, once as it is entered), the editor's preview (its own
`canActivate`), and, while sign-in is required, every page people take
surveys on (`takeSurveysGuard`, `canActivateChild` of their layout, so each
page asks again; with visitors welcome it lets anybody through); while sign-in
is required the API answers nothing of a survey without a token - its
pictures aside, which an `<img>` loads with no token, at addresses that are
random UUIDs ([API](api.md#the-people-taking-surveys)). Only the pages drawn
while the site cannot run (the family's page, the card for a server out of
reach) draw without it: while the site cannot run and the server said why
(`SiteStatus.blocked()`) the guard lets every page through and sends nobody to
the IAM - the family's page stands instead of each, with its own quiet Sign in
(*A database behind the code*, below); while it could not even ask (out of
reach as it started) it lets nothing through. A signed-in person without EDITOR or ADMIN
(MEMBER alone) gets the admin layout's "this part is for the people who write
the surveys".

**Blocking somebody** is the IAM's: taking a person's MEMBER away in the
survey application (Users -> the person -> Roles) makes the IAM refuse their
next sign-in and every refresh; the access token they hold still verifies
until it runs out (minutes). A person blocked so can still take surveys as a
visitor while sign-in is not required - blocking stops signing in, not
visiting; to keep somebody out entirely, keep "Sign-in required" on.

### Visitors

While the IAM says sign-in is not required, somebody who is not signed in may
take the open surveys too, once each, as a **visitor** (`api/visitors.php`,
migration 006). Who a request is, on the surveys' own routes only
(`requireTaker()` in `api/meddleware/auth.php`): a Bearer header - that person
or 401, the key not even read; else, while sign-in is required, 401
`sign_in_required` for a key and for nobody alike; else the visitor of the
`X-Visitor-Key` header (401 `visitor_unknown` for a key that is nobody's);
else nobody. `requireUser()` / `requireRole()` refuse a visitor as they
refuse nobody - the admin panel, the Migrations page and the move are a
verified token's alone.

- **A visitor is a row of `users` with a negative id** (the sequence
  `visitor_ids` counts down from -1; an IAM id is always positive), no name,
  no address, and `visitor_key_hash` - the SHA-256 of a key the server made
  (32 random bytes, base64url) and sent once, in the `X-Visitor-Key` header of
  the 201 whose answers made it. So "once each", `answeredAt` and the results
  work for a visitor with no code of their own; the results call it "Visitor
  N" (`responsesOf()`, `person.visitor`).
- **Made with its first answers that are kept**, inside their transaction
  (`visitorMake()` in `responseSubmit()`), after three limits: new visitors an
  hour from one address and in all - counters that are rows of
  `visitor_counters`, held to the end of the transaction - and visitors with a
  key at once, counted after everybody's counter is held. A refusal rolls the
  counts back with everything else. The address is `REMOTE_ADDR` unless the
  connection is a trusted proxy's (`api/client_address.php`, the IAM's and
  the analyzer's rule; IPv6 by its /64).
- **The clean-up** runs after the answer (`afterAnswerRun()` in
  `api/index.php`, `visitorSweepSoon()`): after every new visitor, else at most
  once an hour (a marker file in `storage/`). It ends the visitors unseen for
  `keep_days` - the hash cleared, the answers kept as "Visitor N" - or deletes
  them when they have no answers; a visitor still coming back is never
  touched. A batch at a time, rows another request holds skipped, each
  statement bounded; a failure is logged and never reaches the answer. An
  ended visitor left with no answers - an ADMIN deleted its last ones, or the
  survey - goes with that delete (`visitorsForgetEmpty()`).
- **The move at sign-in** (`POST /api/visitor/move`, token and key, whatever
  the switch): the visitor's answers into the person's account in one
  transaction (`visitorMoveInto()`); the person's answers win where both
  answered.
- Settings: `config/visitors.local.php`, optional
  ([operations](operations.md#visitors)).

### Visitors in the browser

`AuthService.visitorsWelcome` (the site runs, `loginRequired` is false, the
backend said `visitorDays`) opens the pages people take surveys on to anybody
(`takeSurveysGuard`); `AuthService.taker` says who takes them - the person
signed in, else this browser's visitor (`{id: 'visitor', visitor: true}`),
else nobody - and `visiting` that it is the visitor.

- **Who a request is, decided when it is issued** (`ISSUED_AS` in
  `core/api/api.service.ts`): `ApiService` marks the three survey routes the
  person's while somebody is signed in and the visitor's otherwise, the move
  always the person's; anything unmarked is decided as it is handed over.
  `authInterceptor` sends a person's call with the token or not at all - a
  token that comes back null (a refresh refused, signed out in another tab)
  fails the call at once as 401 `sign_in_required`, so a person's answers
  never go out as nobody's and never make a visitor. A visitor's call goes
  without a token, and to `/api/surveys` - only there, only while
  `loginRequired` is false - with the key held now; the answer that made a
  visitor brings its key (`X-Visitor-Key`), which is kept; a key on a
  person's answer is ignored. A 401 `visitor_unknown` forgets the key (only
  while it is the one held) and sends once more without it; a 401
  `sign_in_required` to `/api/surveys` means the switch went on since the page
  loaded (`AuthService.noteLoginRequired()`: the pages stop welcoming visitors
  until the next load) - and keeps the key.
- **`VisitorKey`** (`core/auth/visitor-key.ts`, the analyzer's pattern): the
  key in `localStorage` (`anotoki-survey:visitor`), read as each call leaves
  and kept in step across tabs by the `storage` event; the first key a browser
  got stays (two tabs that each sent first answers: the second key is
  dropped, its answer stays a visitor of its own); in memory for the tab when
  storage refuses. **Kept while sign-in is required** - the server refuses it
  then, and the next sign-in still moves what it answered; switching the
  requirement off again within `visitorDays` brings it back. After every
  sign-in with a key held (an effect - `AuthService` never reads
  `VisitorKey`) it asks for the move, one at a time; a 200 forgets the key,
  counts `moves` (home and the survey page ask again) and leaves `moved` for
  the participant layout's toast (`visitor.moved` / `visitor.kept`); no
  answer or a 5xx asks again after 2 s, 10 s, 30 s (`Retry-After` wins); a
  422 forgets the key; a 401 waits for the next sign-in. A key the server no
  longer knew sets `lost`, which the layout says once (`visitor.lost`).
- **Drafts** stay in the browser, as a person's do: a visitor's under the slot
  `visitor` (`anotoki-survey:draft:{surveyId}:visitor`) - a draft never makes
  a visitor. At a sign-in they become the person's (`adoptVisitorDrafts()`):
  in `boot()` before the first page, in `VisitorKey`'s effect for a sign-in
  in another tab, and by the survey page itself before it reads a person's
  draft (`adoptVisitorDraft()`); where the person has a draft of their own,
  theirs stays and the visitor's goes - the rule the move keeps for answers.
- **A sign-in waits for the sends on their way** (`SavesInFlight`, counted
  by the interceptor; `AuthService.signIn()` waits at most 30 s): a visitor's
  first answers bring the key the move needs, and a page left before their
  answer arrived would leave them out of the browser's reach.
- **The pages**: the participant layout draws its page for a visitor (never
  the editor's preview: the card stands there for anybody not signed in);
  home and the survey page show the visitor notice (`visitor.notice`, its
  days from `visitorDays`, with a Sign in button) - home above the list, the
  survey on its welcome, "answered" and "sent", never on the steps - and the
  welcome says `take.asVisitor` where a person reads whom they are signed in
  as. Their answers refused because the switch went on say
  `take.refused.signInRequired`; past the limits on new visitors,
  `take.refused.tooManyVisitors`. A sign-in that came back refused while
  visiting (`access_denied`: a person whose MEMBER was taken away) is said
  in its toast as ever, and the page goes on as the visitor's.
- **The admin panel** shows a visitor's answers like anybody's, under the
  name the server gives them ("Visitor 12"), and says "Not signed in" where a
  person's address would be (`Person.visitor`: the results' table of people,
  the lists a number opens, the drawer of their answers, the page of their
  answers). The CSV has the name and an empty address. The delete question is
  the same as for a person - "Visitor 12 can take the survey again": their
  browser can, while its key lives, and an ended visitor's browser can anyway.

What is left of "signed out" is drawn by the layouts where the page would be,
with a Sign in button of their own (on a phone the top bar's is inside its
menu): a session that ended with the page open (the admin panel's "You are
signed out", with what is kept; the participant layout's "You are not signed
in", `signedOut.*`), or a sign-in that came back without one (refused,
cancelled; the admin panel's card is then "You are not signed in" - nobody had
a session to end) - the guard lets every page of that page load through
(`signInFailure` is never cleared) rather than send the browser round between
the site and the IAM for ever, and the toast says what went wrong. A sign-in
that cannot even start is the same: the SDK keeps the sign-in in progress in
`sessionStorage`, and when the browser refuses it (`storage_unavailable`)
`AuthService.signIn()` answers false and sets `signInFailure`; the guard lets
the page through to its card, and it - or the Sign in button pressed
(`signInOrSayWhy()`) - says why in a toast (`signIn.storageUnavailable`),
where it was a blank page. Nothing of a survey is drawn then: the layout holds
back its `<router-outlet>`.

## The top bar

The bar is the anotoki family's, the library's `<anotoki-top-bar>`
(`@anotoki/lib/shell`, anotoki-lib 0.3.0 - built from this site's own bar,
which the IAM, Japanese, Piano and the build analyzer had copied), and
`layouts/top-bar` is this site's thin wrapper around it: it tells the bar what
is this site's, worded - its brand, its sections, the person and their role,
the menu's items, how to sign in and out - and the bar does the rest (its
row, its widths, its menus and their keys). One row, in this order: the
brand (`<anotoki-brand>`: the mark, "anotoki" and the site's name, linking home -
`/`; in the admin panel "anotoki survey · admin panel", linking to `/admin`); the site's sections as links (where
people take surveys: Surveys; in the admin panel: Surveys, Translations,
Languages, and Migrations for an ADMIN - only Migrations while a database
update waits (`SiteStatus.state()`) - `SURVEY_LINKS`, `ADMIN_LINKS`; the one the page is in is marked,
and `aria-current="page"` on its own address); then the language chooser
(where people take surveys, when more than one language is offered), the
theme, and the person's menu - name, address and role, "Your anotoki account"
(the IAM's account page, in a new tab), "Admin panel" ("Administrátorský
panel") for EDITOR / ADMIN or "Back to the surveys" in the admin panel, Sign out - or, signed out, Sign in.

Up to 760 px (`PHONE_BAR_MAX`, the bar's `phoneMax`) it is a phone's bar: the brand is the mark and
the site's name alone, then the language, the theme and a menu
button; the links and the person's menu (or Sign in) are inside that button's
menu. From 761 px the links are in the row; up to 960 px (`NARROW_BAR_MAX`)
the person's button is the initial alone, from 961 px with the name - and
the admin panel's longer wordmark leaves out "anotoki" up to 960 px too
("survey" with "admin panel" small under it, as on a phone - `shortBrandMax`),
or the bar overflows at 761 (and at 360 on one line). Both menus are the
kit's (`@anotoki/lib/ui/menu`), the family's way: the focus goes to the first item when one opens, arrow keys, Home and
End move between items, Escape closes it and gives the focus back to its
button, and so do Tab and Shift+Tab from any item (the browser's own move is
stopped: it would land on the next item of a menu about to go, and then on
`<body>`) - the next Tab moves on from the button; a click outside closes it,
and so does a
change between the phone's bar and the desktop's, another person, other
links. No key pressed in the bar reaches the page (`isolateKeys`). Signing
out saves first (`AdminStore.flushAll()`) and asks when something would be
lost - a survey's change that cannot be saved, strings or languages typed and
not saved - while its item waits ("Saving…", the kit's); Sign in waits the
same way for a visitor's answers on their way. Every word of it is a key -
the site's own (`topbar.surveys`, `topbar.backToSurveys`, `brand.area`,
`brand.adminPanel`, ...) and the library's (`anotoki.topbar.*`: the role,
"Your anotoki account", "Admin panel", the menus' names, Sign in, Sign out;
`anotoki.theme.*`, `anotoki.language.*`); the admin panel reads them in
English (`effectiveLanguage`) - but the Migrations link, which only an ADMIN
in the admin panel ever sees: its English word is written in the code
(`label`), as the admin panel's pages are. The kit's own words in the bar come
from the site's database too, through `core/kit.ts` (*The UI kit*, below).

## The UI kit

The pieces every page is drawn with are the anotoki family's (anotoki-lib
0.3.0, the owner's decisions of 2026-10-07 - [decisions](decisions.md)):
buttons, icons, spinners, badges, alerts, cards, empty states, page headers,
fields, switches, selects, tabs, the drawer, the dialog and "Are you sure?",
the toasts (each from its own entry point - `@anotoki/lib/ui/button`,
`/ui/icon`, `/ui/config`, ... - never the `@anotoki/lib/ui` barrel, which
would bring every piece into the first load), the top bar, the brand,
the theme switch and the language switcher (`@anotoki/lib/shell`). Their
class names are the library's own (`.anotoki-<piece>__<part>`,
`anotoki-<piece>--<state>`): a spec or the browser check that reads the kit's
markup reads those. The
survey keeps only its own: the rich text editor, the lightbox, a survey's
picture and the strip of pictures (`src/app/ui/`), the layouts' states, and
the look of the raw fields a page draws itself (`src/styles/_fields.scss`,
inside each such component's styles).

- **The styles** are the family's (`@anotoki/lib/styles` in
  `src/styles.scss`): the `--anotoki-*` tokens - one palette, the IAM's, which
  this site never had colours of its own against, so it overrides none -
  Manrope, the base, the utilities and the tables. The survey adds its own
  few tokens (the highlighter, the results' bars, the night sky, a decorative
  rule) and `.rich`, `mark` and the drag and drop - nothing a kit component
  could meet.
- **The words**: the kit has its own (Sign in, the menus' names, a toast's X,
  "Saving…"), built in for English and informal Slovak - and each is a key of
  the library's in the site's database too, `anotoki.<word>` (the library's
  migration set writes them; *The site's own words*, below). `core/kit.ts`
  gives the kit `TranslationService.forKit()`: the language on the page
  (English in the admin panel) and a `lookup` that reads the database's
  string of `anotoki.<word>` - so an administrator's rewording on the
  Translations page shows, and every word the site said before the library
  still does (migration 010 moved the site's strings under those keys) - and,
  while the database cannot be read, this site's formal Slovak
  (`FORMAL_SLOVAK`, `core/translations.ts`) - never the kit's ty.
- **The icons** the site's templates name beyond the kit's own are
  registered in `core/kit.ts` (`SURVEY_ICONS`, from `@anotoki/lib/ui/icons`):
  an icon nobody registered draws nothing.
- **The theme** is the kit's `ThemeService` (*The account's preferences*,
  below), told the site's storage key and the account.

## The account's preferences

The theme, how dates are written, the clock and the language are the
person's anotoki account's (the IAM's migration 015, the owner's decision of
2026-10-06 - [decisions](decisions.md)): one choice that every anotoki site
follows, every part of each - the admin panel here too. The IAM sends them in
the tokens beside `locale` (`preferences`: `theme` `auto` / `light` / `dark`;
`date_format` `dmy_dot` 6.10.2026, `dmy_slash` 06/10/2026, `mdy_slash`
10/06/2026, `ymd_dash` 2026-10-06, or null; `time_format` `24` / `12`, or
null - null being the page language's own way), and the SDK reads them into
`user().preferences`. `AuthService.preferences` is them while somebody is
signed in, and null otherwise - also for an IAM that sends none (before its
migration 015, or a sign-in without the `profile` scope): then the site keeps
its own settings exactly as before, and saves nothing to the account.
`AuthService.savePreferences()` saves a choice through the SDK
(`POST {issuer}/api/oidc/preferences` with the person's token); the SDK puts
the answer into `user()` at once, in every tab, and the next token carries it.

- **The theme** (the family's `ThemeService`, `@anotoki/lib/shell`, told the
  account's theme and how to save it in `core/kit.ts`; the switch in the top bar):
  the account's while it has one - adopted at sign-in and whenever it changes
  (a refresh after a change on another site, a save in another tab), but not
  while a choice made here is still being saved, whose earlier answer would
  turn the page back. A choice is shown at once and saved; one save at a time,
  the last choice last; a refusal puts the account's theme back and says so
  under the switch (`theme.notSaved`). Signed out, the device's, as ever.
  Either way the theme shown last is kept in localStorage
  (`anotoki-survey:theme`), where the family's `theme-boot.js` (`angular.json`
  copies it from `@anotoki/lib/assets`; `index.html` names the key) paints it
  before the app has loaded.
- **Dates and times**: the pages people take surveys on write dates through
  `localDate`, the admin panel through `AdminDates`
  (`core/admin/admin-dates.service.ts`, the English `core/util/dates.ts` with
  the account's choices) - both in the account's order when it has chosen one
  (`core/util/date-patterns.ts`), the admin panel's times on its clock too
  ("2026-09-29 2:30 pm"; a date and a time side by side when either is
  chosen). Nothing chosen - or nobody signed in - is each language's own way.
  The pages people take surveys on write no time of day. The answers' CSV
  stays ISO: it is data.
- **The language** (*The site's own words*, below): the account's outranks
  what this device remembered, and the chooser saves a choice to the account.

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
| `users` | who has signed in: the IAM's user id, name, address - and the visitors: a negative id, no name, `visitor_key_hash` (the SHA-256 of their key; cleared when the visitor ends, the row and its answers kept) |
| `visitor_counters` | the limits on new visitors: a count per name (`visitors:new`, `visitors:new:<address>`) and when it starts again |
| `surveys` | the surveys; `revision` counts the saves; a partial unique index keeps one live (not draft) survey per address |
| `responses` | one filled survey per person and survey (unique); gender and age as columns (checked lists), the answers as JSONB by question id; `language`: the language the survey was read in, or null |
| `images` | the pictures' bytes (bytea), type and size - never changed once kept |
| `survey_images` | which survey shows which picture, rewritten with every save |
| `languages` | the languages the site has: code, name in English, name as its speakers write it, offered or not, order |
| `translation_keys` | the keys of the site's own words, each with a description for whoever translates it - written by migrations only; the library's own (`anotoki.*`) by its migration set |
| `translations` | one string: a key in a language, who last reworded it and when (nobody: as a migration wrote it). No row: that language reads the key in English |

Ids: the database makes the survey, response and picture ids (UUIDs); the
editor makes the ids inside a survey (steps, questions, options - random, and
free of the `:` and `,` the results' addresses use). An id is never reused, so
an answer keeps pointing at its option when the option is renamed or moved.

Migrations are the schema: `backend/migrations/survey/NNN_name.sql`, applied in
order by the anotoki family's engine - the library anotoki-lib
(`Anotoki\Lib\Migrations\Migrator`, in `vendor/anotoki/lib`), through
`api/migrations.php` (`surveyMigrator()`: the site's set `survey`, then the
library's `anotoki_translations` - `surveyMigrationSets()`; the library's
files are recorded as `anotoki_translations/NNN_….sql`) - from
`setup.php`, `migration.php`, the admin panel's Migrations page and the tests'
template. Each file runs in a transaction of its own with its row in
`migrations` (`id, filename, applied_at` - the table as it always was; the
library reads it as it is), and the run stops at the first file that fails. All
four take one PostgreSQL advisory lock (`DATABASE_UPDATE_LOCK`, the site's own
key), on a connection of their own: one update at a time, and the second is
told another is running (409 `busy`). See *A database behind the code*, below.
The site's strings are part of it: `002` makes the three tables and the two
languages, `003` writes every key with its English and Slovak string, `004`
adds `responses.language`, `005` the top bar's and the sign-in's strings,
`006` the visitors (their sequence, `users.visitor_key_hash` and its rules,
`visitor_counters`, and `responses_by_user` - answers by person), `007` what
the pages say to a visitor (`visitor.*`, `take.asVisitor`, two refusals, three
`error.*`), `008` the two toasts of a choice the anotoki account did not take
(`theme.notSaved`, `language.notSaved`), `009` takes away the four strings of
the "not set up yet" page the family's page replaced (`boot.notSetUp.*`),
`010` moves the site's strings for the kit under the library's keys
(*The site's own words*, below). After them the library's own set:
`anotoki_translations/001` proves the three tables are of the shape the
library relies on (and makes them on a site born without them), `002` writes
the library's words (`anotoki.*`), only for a key that has no string yet.

## A database behind the code

One behaviour for every anotoki site, the shared library's (the owner's
decision of 2026-10-07, [decisions](decisions.md)). On the server
(`api/index.php`, `api/migrations.php`) the family's `SiteGate` stands in front
of every route and asks, for each request, where the site stands
(`surveySiteState()`): **not set up** (the settings missing - every address but
`/api/site-status` is 503 `not_set_up`, offering `/setup.php` only while the
site was never installed: `storage/installed.lock`), **an update waiting** (a
migration file not applied - every address is 503 `update_pending` with
`Retry-After: 60`, nothing is read from or written into tables that may not be
there, except what signing in and applying it need: `siteOpenWhileUpdating()`
- the sign-in's settings, a language's strings (read-only: the library's
`TranslationsRoutes::openPath()`, one segment after `/api/translations/`), `/api/health` and
the Migrations page's three routes - `/api/admin/migrations`, `/file` and
`/apply`, those addresses exactly and nothing else under them - ADMIN from the
token alone),
**unavailable** (the database out of reach - the routes' own answers) or
**ready**. `GET /api/site-status` says it, in every state.

In the browser (`@anotoki/lib/migrations`, wired in `core/migrations.ts`) the
start asks first (`SiteStatus.check()` in `boot()`), and `siteStatusInterceptor`
hears any later answer that says the site cannot run. Nothing in the start stops
on it: the sign-in's settings and the strings answer while an update waits.
While the site cannot run the sign-in guard sends nobody to the IAM and lets
every page through; `<anotoki-site-gate>` around the router outlet draws the
family's page instead (`app.component.html` gives it the outlet as the
template marked `<ng-template anotokiSitePages>`, which the gate makes only
while it shows the pages - anotoki-lib 0.2.0; an outlet given as it is would
be made anyway and put the page in place out of sight, where it would run, and
an unmarked template is not the pages at all): to somebody taking surveys,
or an EDITOR, "The site is being
updated" in their language - no error, no code, nothing to press but a quiet
Sign in while nobody is signed in - which asks again by itself and reloads once
the site runs (no page is made in the moment before the reload: the family's
page asks with `SiteStatus.checkForReload()`, anotoki-lib 0.2.0, whose answer
the gate is never told, so it stays shut until the reload - the site's own
hold for that moment, `PAGES_CLOSED` and `AppComponent.held`, went with 0.3.0,
`app.component.spec.ts` proving the gate shut); to
the site's ADMIN, in English, "A database update is waiting" and "Open
Migrations", which asks again by itself too (another ADMIN may apply the
update meanwhile). Signed out at the Migrations page's address, the quiet
Sign in comes back there, to the page. The Migrations page
(`<anotoki-migrations-page>`, in the admin layout, with only Migrations in the
bar) lists Pending (by set: the site's own, `survey`, then the library's,
`anotoki_translations`), Applied (with each file's SQL) and Missing; its "Apply
pending" (`POST /api/admin/migrations/apply`, behind a question) runs the
pending files in order, each in its own transaction, and stops at the first
that fails - rolled back whole, named, with the database's whole error in a
box. Once nothing is pending the strings are read again
(`TranslationService.reload()`: the ones read while behind lack the keys the
migration brought) and `SiteStatus.markReady()` lets the site run where it
stands - the page and what it said stay, every link comes back, no reload.
Not set up: "This site is not set up yet" and the setup page while the site
was never installed; afterwards, or with the database out of reach, "The site
is not available right now", asking again by itself.

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
`choiceRuleText()` and `answerProblemText()` beside them: the admin panel quotes
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
  languages' names ask more - something in them to see (the library's
  `Text::blank()`): that is the server's rule, for what would otherwise be
  kept and drawn as an empty place. Its one twin in the browser is the
  library's `blankText()` on its Translations page, used only to tell whether a box is a change: a
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
admin panel's surveys, summaries and answers while pages come and go:

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
Slovak. **The admin panel is English**, written in its templates; a survey's own
texts are the survey's (next section).

**Where the words are.** In the database, because they are edited in the admin
panel (a file in the build would be overwritten by the next upload, and the host
has no shell): `translation_keys` names each string, `translations` holds its
value per language, `languages` the languages. Which keys there are is the
code's business: **migrations write them** with their first English and Slovak
string (`003_site_strings.sql`), and the admin panel only ever rewords a value.
English is what every other language falls back to, string by string, so it
cannot be switched off, deleted or left empty. A string is text and is drawn
as text - there is no HTML in one.

**Whose code.** The anotoki family's (anotoki-lib 0.3.0; the owner's decision
of 2026-10-11, [decisions](decisions.md)): every anotoki site keeps its words
in the same three tables, and one implementation reads and writes them. On
the server `Anotoki\Lib\Translations` - the bundle, the admin routes, every
check of a string, the command line (`TranslationsRoutes`,
`TranslationsCommand`) - which `api/translations.php` configures for this
site: the languages it is released in (`en`, `sk`), what deleting a language
would leave behind (`SurveyLanguageUsage`: a survey written in it), who saved a
string (`translationWriter()`), its error body (`respondRefusal()`). In the
browser `@anotoki/lib/translations` - the `TranslationService`, the pipes, the
kit's words, the language switcher's - configured in `core/translations.ts`,
and the admin pages, `@anotoki/lib/translations/admin`. One wire format, the
IAM's (snake_case). Who may do what is this site's: the library checks
nobody (*Editing them*, below). The library has words of its own, under
`anotoki.` - its kit's and its status page's - in the same tables: its
migration set (`anotoki_translations`, after the site's own) writes them only
where a key has no string, and they are reworded on the Translations page like
any other. Migration 010 moved this site's strings for the kit under those
keys before the library's set first ran - every language, an owner's rewording
with who saved it and when - and wrote the library's two sentences that speak
to the reader and had no key here in this site's formal Slovak.

**How a page gets them.** One request, `GET /api/translations/{code}`
(the library's `Translations::bundle()`, its route in `routes/public.php`):
the language's strings with English merged underneath,
the languages on offer, and English itself beside them for the admin panel. No
token goes with it. It is answered with an `ETag`, so asking again is a 304. A
code with a region that is not offered itself is answered by its language
(`sk-sk` by `sk`), so a Slovak browser's first visit is one request.

**The start** (`boot()` in `core/boot.ts`, the app initializer): the theme
(the one shown last, until the sign-in brings the account's),
`await status.check()` (where the site stands, `SiteStatus`), `await auth.init()`,
`await i18n.init()`, then a failed sign-in's toast - worded now that there are
words - and last `BOOTED`. `app.component` draws the site only when `BOOTED`
is true and the sign-in is ready - or, while the site cannot run, the
family's page in its gate; otherwise the first page would show keys for a
moment. The load error page's "Try again" runs the same
function - and, when it worked, opens the page itself: the address the page
was opened with when the router never got anywhere (its first navigation was
refused by the sign-in guard while the server was out of reach, which would
leave a blank page), the address in the bar otherwise.

The library's `TranslationService.init()` (as `core/translations.ts` configures
it - the site's storage names, the account, `canAsk`):

- takes `?lang=` out of the address (before the router reads it) and keeps it
  for this tab in sessionStorage - it survives the round trip to the IAM;
- settles the language from, in this order: `?lang=` / this tab, the chooser's
  remembered choice (localStorage `anotoki-survey:language` - only the chooser
  writes it), the IAM token's `locale`, the browser's languages (each tag, then
  its first part; here alone `cs` counts as `sk` while no Czech is on offer),
  English. Only a code of the right shape is ever stored or sent. The first
  two are held in memory as well for as long as the page lives, so a browser
  whose storage refuses to be written still follows a `?lang=` link and a
  choice until it reloads. For somebody signed in whose account sends its
  preferences (*The account's preferences*, above), the token's `locale` comes
  before what the device remembered: `?lang=`, a choice made on this page,
  the account's language, the device's choice, the browser's, English;
- starts from the cached bundle (localStorage `anotoki-survey:language-cache`)
  when it is a bundle and is in the language settled on (a cache that is not
  is removed - a bundle cached before 0.3.0, with `nativeName`, is not one),
  and still asks the server, waiting up to a second for the answer (the
  library's `waits.cache`) - a release adds strings, and a returning reader
  would otherwise see their keys. Without a cache it waits for the request,
  and asks once more half a second later (`waits.retry`) when the first did not
  come; after that the page is drawn as it is - in keys;
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
  those are the reader's own words from the last visit. The load error card
  takes the cached string when there is one and the English written in the page
  otherwise (`boot/kept-word.ts`); the family's page reads the library's keys
  (`anotoki.siteStatus.*`) from that cached bundle, else this site's formal
  Slovak (`FORMAL_SLOVAK`), else the library's own words.

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
  the console - the owner wants to see which key is missing. A library key
  (`anotoki.*`) never does: the database's string, else this site's
  (`FORMAL_SLOVAK`), else the library's built-in words.
- A number in a plural family is written the way the language on the page
  writes numbers (`Intl.NumberFormat`: "1 000" in Slovak, with a no-break
  space).
- Keys put together at run time (`error.*`, `answer.rule.*`, `answer.problem.*`,
  `aboutYou.gender.*`, `aboutYou.age.*`) come from closed sets declared in
  `core/i18n/dynamic-keys.ts`, through a table with a fallback key - never from
  an address, the IAM's answer or what a person typed. A failed request is
  worded from its code (`error-text.ts`), never with the server's sentence.
- Dates and "5 minutes ago" go through `Intl` in the language on the page
  (`localDate`); `core/util/dates.ts` keeps the English ones for the admin panel
  (through `AdminDates`). Both take the order - and the admin panel the clock -
  the person's anotoki account has chosen, when it has (*The account's
  preferences*, above).

**The admin panel is English whatever the person reads.** `effectiveLanguage`
is `en` while the address is `/admin` or under it (the library's
`englishOnly`, the site's prefix), and everything that words a
string goes through it - so the pieces both areas share (the top bar, the UI
kit, toasts) are English there, and `<html lang>` says `en`. The service cannot
ask the Router where the page is (the Router builds the title strategy, which
needs the service - NG0200): `SurveyTitleStrategy` tells it after every
navigation (`noteAddress()`), and `init()` reads the address for the first page.
The same strategy writes the tab's title in the language on the page: a
route's `title` is a key on the pages people take surveys on, plain English in
the admin panel. With no strings at all (a site that cannot run, in a browser
that has kept none) a participant route's title is the site's name alone - never
the key - and an admin route keeps its English title, with the part of the
site after it: "Results · Admin panel · anotoki survey". Every anotoki site
calls its admin area the admin panel.

**The chooser** (the family's language switcher, in the top bar where people take
surveys, when more than one language is on offer - `core/kit.ts` gives it the
service's `forShell()`: the site's languages and `setLanguage()`): a button with the code
("SK") and a menu of the languages under the names their speakers give them.
Its accessible name holds the code it shows ("Jazyk: Slovenčina (SK)", `language.button`
with `{name}` and `{code}`): somebody who speaks to the computer says "click SK"
(WCAG 2.5.3, Label in Name).
Choosing one loads its bundle, then switches and remembers. The button stays
usable while a language is on its way, and the last choice wins - going back
to the language on the page included, which drops the one still loading; an
overtaken choice is not called a failure.

For somebody signed in whose account sends its preferences, a choice that won
is saved to the account as well (`setLanguage()` -> `savePreferences({
language })`), so every anotoki site follows it: one save at a time, the
latest choice last, and the answer to an earlier save never turns the page
back. The page stays in the chosen language for the visit whatever the
account answers - silently when the IAM does not offer that language
(`invalid_request`: it is this site's own, then), with a note under the
switcher (`anotoki.language.notSaved`) when the IAM could not be reached. A change of the
account's language made elsewhere (its page, another site, another tab) is
followed when it comes, over the device's choice and an earlier choice on the
page - not over this tab's `?lang=`, and not while a choice made here is on
its way to the account.

**Editing them** (the family's pages - `TranslationsPageComponent` and
`LanguagesPageComponent` from `@anotoki/lib/translations/admin`, a lazy entry
point, routed in `pages/admin/admin.routes.ts`; for EDITOR and ADMIN,
`admin.allows` in `core/translations.ts`): *Translations*
is a grid - a key a row, a language a column, the library's own keys among the
site's - that saves only the cells that
changed; the server checks all of them before it writes any
(the library's `StringCheck`: the key exists, the language exists, the length, no
brace that is not a placeholder, the placeholders) and answers the grid as it
is now; the bar says "The string is saved." *Languages* adds a language - **hidden, unless its switch "Offer it to
readers right away" is on**: it has no strings yet - renames, reorders, offers
or hides it, each thing it did said in a line of its own on the page; only an
ADMIN deletes one (the server: `requireRoleFor('DELETE', ROLE_ADMIN)` - the
page offers Delete to an EDITOR too, and shows the server's refusal), and never
English, a language the migrations write strings for, or one a survey uses. A
language can be exported and imported as a flat JSON file, from the page and
from the command line (`backend/translations.php`). After every save, import
or change of a language both pages call `TranslationService.reload()`.

- **What is typed and not saved lives outside the pages**, in the library's
  `LocalizationDrafts`: the changed cells (`strings`) and the changed rows
  (`languages`). The admin
  layout draws its pages only for staff, so a session that ends - the IAM's
  idle limit, a sign-out in another tab or on another anotoki site - takes the
  page away with no navigation, and no guard runs then. The router still asks
  the pages' `anotokiUnsavedChangesGuard` at the next navigation away - with no page,
  which it lets through (there is nobody to ask, and the drafts are not in the
  page); so the layout's links and Back work in that state. The drafts stay,
  and are mirrored to the tab's sessionStorage
  (`anotoki-survey:localization-drafts`, `{owner, strings, languages}` - the
  name and the shape the site always had), because signing in again is a page
  load. Whose they are is the account's id (`account.userKey`): only another
  person signing in lets go of them. The top bar's "Sign out"
  asks first (one question, with a survey's unsaved changes when there are
  both; the drafts' entry point is loaded for it, for staff only) and gives
  them up when the answer is to go (`LocalizationDrafts.clear()`); "Leave" at
  the pages' own question gives up that page's. The one `beforeunload`
  question for both pages is the library's - asked whenever boxes wait,
  signed in or not: so also on the way to the IAM's sign-in after a session
  ended, where the drafts survive the answer "Leave" (the site's own asked
  nothing there; [decisions](decisions.md)).
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

**Held together by a test.** `backend/tools/translation_keys.php` sets up the
library's `KeyScanner` on the frontend's sources (the library's own keys,
`anotoki.*`, are never looked for: its Angular half asks for them);
`tests/unit/translations.test.php`
fails when the frontend uses a key the migrations did not write, when the
migrations wrote one nothing uses, when a key lacks its English or Slovak
string, or when a Slovak string uses a placeholder its English does not have;
and when the library's words that speak to the reader are not this site's
formal Slovak, in the database and in `FORMAL_SLOVAK` alike.
The scan also fails what would show a key although "it exists" - a plural
family asked for as one string (`'L' | translate`, `.t()`, `.around()`,
`.has()`) or one string asked for as a family (`translatePlural`,
`.plural()`) - a key put together from a prefix `dynamic-keys.ts` does not
declare (a literal ending in a dot, a template literal going on with `${`),
and `innerHTML` given a translated string, on one line or several. The same
test file asks the library what a save would refuse of every string the
migrations wrote (`storedRefusals()`) and compares each string migration's
closing gate with the keys it writes.
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
  `surveyCreate()`); the library's `deleteLanguage()` holds the language's row
  (`FOR UPDATE`), then asks this site's `SurveyLanguageUsage::refuseDelete()`,
  which counts the surveys that use it, then deletes - statements of their
  own, so the count sees a save it waited for. Whichever comes second
  finds what the first did: the delete answers 409 `language_in_use`, the save
  422 "A language of this survey has just been deleted from the site…". No
  survey is left in a language the site does not have.
- **Two people adding a language.** The library's `createLanguage()` takes the
  table (`LOCK TABLE languages IN SHARE ROW EXCLUSIVE MODE`) before it counts, so
  creators wait for each other and the most the site keeps (20) holds. Reading
  the rows, and locking them as the two saves do, is not held up.
- **Two saves of the same strings.** The library's check hands its changes
  back by key and then by language, so every save takes its rows in one order
  and waits instead of deadlocking; its `save()` holds the languages
  `FOR SHARE` between the check and the writing.

Everybody takes what they hold in one order, so they wait for each other and
do not deadlock: a save holds the survey's row and then its languages; a
delete holds a language and only reads the surveys; a new language takes its
table lock before anything else.

And the visitors (`api/visitors.php`):

- **Two new visitors at once.** The limits are rows (`visitor_counters`),
  bumped by one upsert each and held to the end of the transaction - the
  address's, then everybody's - so the second waits and counts the first;
  the count of visitors with a key comes after everybody's row is held.
- **Answers and the row they belong to.** Every send holds its taker's row
  `FOR SHARE` before the insert (`visitorHold()`): a visitor's row that a move
  or the clean-up took meanwhile is found gone - 401 `visitor_unknown`, not a
  broken reference (which would be a 503).
- **The move and the person's own answers.** The move holds the visitor's row,
  then the person's (`FOR UPDATE`, `lock_timeout` from the settings), then
  three statements - the kept ones out, the rest moved, the visitor deleted. A
  send of the person's that is being written holds the person's row (its
  foreign key's lock), so the move waits and then keeps that answer; a lock
  not had in time is 503 `visitor_move_retry`. The clean-up skips rows anybody
  holds (`SKIP LOCKED`).
