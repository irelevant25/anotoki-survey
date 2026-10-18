# Decisions

Why things are the way they are. Read the reason before undoing one.

**A survey is one JSONB document, not tables of steps, questions and
options.** It is written, saved and read as one thing - the editor changes it
as a whole, a save is the whole of it, the survey page and the results read
all of it. Tables would add joins and ordering columns and nothing the site
uses; the checks live in `api/survey_rules.php` instead of foreign keys. What
the database must find surveys by is in columns beside it.

**Answers point at ids made by the editor.** An option renamed, reordered or
moved with its question to another step keeps its answers. The ids are free of
`:` and `,`, which the results' addresses use between them.

**Every save names its revision.** Two editors (or two tabs) can have the same
survey open; the second save made to an old revision is refused with the
current version, and the editor decides - rather than the last save silently
undoing the other. A save's answer carries the revision, never the content, so
the text being typed is never replaced under the cursor. Opening or closing a
survey is a revision too: it can change the closing day, which editors save.

**Signing out keeps unsaved changes.** The session can end under an editor -
signed out in another tab, or the IAM ending it - and throwing their work away
then would be the worst moment to. The changes stay (the browser asks before
leaving them); only somebody else signing in lets go of them.

**Pasted control characters are dropped, not refused.** A soft line break from
a word processor would otherwise make an answer that can never be sent, or a
survey that can never be saved.

**The editor saves by itself, 0.7 s after the last change.** There is no Save
button to forget. Saves go one at a time per survey; a failure says so above
the survey, and a network failure retries.

**The rules are written twice, in the same words.** The frontend tells people
at once; the server keeps what the browser was told only because the browser
is not the only thing that can send a request. `answer-rules.ts` /
`survey-problems.ts` and `survey_rules.php` must say the same.

**The closing day ends when it has ended everywhere.** The page compares the
day with the reader's own clock; the server would otherwise turn away somebody
in a later time zone whom the page still lets in. The server's day ends at
midnight UTC-12 (noon UTC the day after).

**Drafts may break every rule; opening may not.** A survey is half-finished for
most of its life in the editor. Opening checks the whole list, on the server's
copy after the last save. A live survey must keep an address people can reach.

**Pictures live in the database.** One backup (`pg_dump`) holds everything, a
save and its pictures agree, and there are no file permissions or folder
listings to get wrong on the hosting. They are small (1600 px WebP), served
with a year's cache at an address that never changes, and Cloudflare keeps them.

**The browser makes pictures small; the server only checks them.** The browser
has the decoders and the canvas; PHP on the hosting may have neither for WebP
or AVIF. The server checks what a file is by its bytes and never takes SVG.

**A picture goes a day after nothing shows it.** An upload lands before the
save that uses it; deleting unused pictures at once would race that save.
There is no scheduler, so the clean-up runs after saves and deletes.

**EDITOR does everything but delete; ADMIN deletes.** The owner asked for
editors who write surveys and an admin who can do everything. Reading the
answers - names included - is what editors write surveys for; deleting a survey
or somebody's answers cannot be undone, so it is the admin's.

**The IAM's administrators administer the site from the start.** Migration 005
in the IAM gives them the survey ADMIN role: they could give it to themselves
in the admin panel anyway, and the site is theirs. It reaches the
administrators there are when it runs: a fresh IAM's migrations run before any
account exists, so there the role is given in the admin panel like any other.

**No "no sign-in" mode.** The study apps run on the owner's own computer
without a login; this site is for people signed in - who answered is the
point of it. Locally it signs in through a local IAM, and the tests and the
browser check through a stand-in.

**What's new and the version - after all (the owner, 2026-10-18).** The
owner first decided the survey site needs no changelog (the other anotoki
sites have one); after the deploy of 2026-10-18, wanting one footer on every
site - "Version X · What's new · Send feedback", then Terms · Privacy ·
Contact - they said: "The survey has no feedback, whats new and version (I
know that it was what I said but maybe it could be nice to have it there)".
So the survey has them, ready for the family's footer (`<anotoki-site-footer>`,
anotoki-lib 0.6.3, which the site takes next):
- **`frontend/public/changelog.json`**, newest first, in the other sites'
  shape - a version (MAJOR.MINOR.PATCH), its day, what it added, fixed and
  changed, each a sentence about something people notice - and beside each
  version **its whole formal-Slovak translation** (`translations.sk`): the
  other sites write their changelog in English alone and mark it so on a
  Slovak page; the survey's Slovak readers are addressed formally everywhere
  else, so its versions say what changed in their language too. A
  translation short of a sentence is no translation: the English, marked
  English (`changesIn()`, the same rule as a survey's own translations).
- **One source for the version**: the newest entry's - what the footer will
  show (`Changelog.current()`); `frontend/package.json`'s own version is held
  to it by a spec, as Japanese Academy's is.
- **What's new** is the kit's dialog (`ui/changelog-dialog`, loaded with the
  first press) - opened only when asked, never by itself after a new version
  as the build analyzer's is: so nothing about what a browser has seen is kept
  in it, and the Privacy page's list of what the site keeps in a browser
  stays as it is. Until the footer comes nothing opens it.

**The admin panel and the survey share one top bar - the anotoki family's.**
The owner made every anotoki site (the IAM, the survey, Japanese, Piano, the
build analyzer; not genshin) look and work one way, and this site's bar was the
one the others copied - since anotoki-lib 0.2.0 it is the library's
(`<anotoki-top-bar>`), this site keeping a thin wrapper of its own: one row - the brand (the mark, "anotoki" and the site's
name, linking home), the site's sections as links, then the language, the
theme and the person's menu (name, address, role; their anotoki account; the
way into the admin panel for editors and admins, or back to the surveys from
it; Sign out) - or Sign in. On a phone (up to 760 px) the links and the
person's menu fold into one menu button. Its words are keys like everything
else a reader meets; in the admin panel they read in English
(`effectiveLanguage`).

**The admin area is called the admin panel, on every anotoki site.** The
owner (2026-10-04): not "Admin" - the person's menu says "Admin panel"
("Administrátorský panel" in Slovak), the wordmark there reads "anotoki
survey · admin panel" and the tab "Surveys · Admin panel · anotoki survey".
The IAM, Japanese, Piano and the build analyzer say the same.

**The admin panel has the family's Migrations page.** The owner (2026-10-05):
"The survey admin panel does not contain migrations page" - the other sites
gained one with the "admin panel" round, and this one now has the same: since
2026-10-07 the page itself is the family's, from the shared library
(`<anotoki-migrations-page>`, below): `/admin/migrations`, Pending (in the
order they will run) and Applied (with when, in the anotoki account's date
order, each file's SQL behind "View"), "Apply pending" behind a question, and
after it "Up to date", "There was nothing to apply" or "Stopped at <file>" with
what was applied first and **the database's whole error** in a box -
PostgreSQL's own words, to an ADMIN, on this computer and on a host alike (the
owner's decision for every site: on a host with only FTP that page is where
the error can be read; it is logged too). Applying the database's updates is
an ADMIN's, not an EDITOR's - the server refuses an EDITOR, and the frontend
shows them neither the link nor the page. One update at a time, whoever starts
it: the Apply, `setup.php`'s Save, `php migration.php` and the tests' template
take one PostgreSQL advisory lock - the site's own key, kept from before the
library (`DATABASE_UPDATE_LOCK`, `api/migrations.php`), so a version from
before it and one from after it still take turns during an upload - and the
second is told another is running. Once nothing is pending the site runs
where it stands, without a reload, its strings read again (a key the update
brought never shows as itself). The bar's Migrations link is English in the
code rather than a key: the admin panel is English, and a key would have
needed a migration with a Slovak string nobody ever reads. `setup.php` stays a
way to apply them.

**While the site cannot run, every anotoki site behaves the same: the family's
library says so.** The owner (2026-10-07): "When there is a new migration, some
sites behave differently than others. Japanese won't let me go to the admin or
anywhere if I am not logged in, but I cannot log in because a migration is
waiting. Genshin gives me no warning. Piano and survey show me a setup error
with buttons to the setup page or the migrations page. This needs to be
consistent. I do not want logged-in users or visitors to see the error about
what is going on. The admin should see it. If the setup was already done it
should never offer that button again, especially as setup.php is no longer
there." So the database's migrations - the engine, the gate in front of every
route, the status the pages ask, the page drawn instead of the site and the
Migrations page - are the shared library's, anotoki-lib (`anotoki/lib` from
Composer, `@anotoki/lib` from its release tarball; README.md says how both are
updated), and this site adopted version 0.1.0 whole - and takes the releases
after it the same way (0.1.1, Angular only: the gate takes the pages as a
template, below; 0.2.0, Angular only: that template marked, the Migrations
page an entry point of its own, and the family's UI kit - *The UI kit is the
family's*, below; the PHP half stays 0.1.0):

- **The server decides where the site stands, for every request**:
  `not_set_up` (the settings missing), `update_pending` (a migration file
  waits), `unavailable` (the database out of reach), `ready`. Not set up, every
  address but `GET /api/site-status` answers 503 `not_set_up` - with the way to
  `/setup.php` only while the site was never installed (`storage/installed.lock`,
  which the setup writes on a real host and never on this computer); an update
  waiting, every address answers 503 `update_pending` (`Retry-After: 60`) but
  the sign-in's settings, a language's strings, the health check and the
  Migrations page's routes (`siteOpenWhileUpdating()`). The site's own "not
  set up" gate and its `update: true` went; so did `/api/health`'s "what is
  missing" while not set up - the gate answers that address too, and the setup
  page and `php migration.php` say what is missing on the computer that runs
  them.
- **What people see is the family's page**, around the router outlet
  (`<anotoki-site-gate>`): visitors and signed-in people "The site is being
  updated", in their language, with no error, no code and no button but a
  quiet "Sign in" while nobody is signed in; the site's ADMIN "A database
  update is waiting" and "Open Migrations", and the Migrations page works while
  nothing else does; never installed, "This site is not set up yet" and the
  setup page; installed, or the database out of reach, "The site is not
  available right now", asking again by itself. Its words are the library's
  (English, and Slovak written for the sites that say "ty"): the one sentence
  of it that addresses the reader is said this site's way, formally ("Skúste to,
  prosím, znova o pár minút.") - library words, not the site's strings,
  because they must read while the database that holds the strings is what is
  not ready. (Since 0.3.0 they are the library's keys in the database too,
  `anotoki.siteStatus.*`, that sentence formal there by migration 010, and
  `FORMAL_SLOVAK` in `core/translations.ts` while the database cannot be read.)
  The site's "not set up yet" card and its four strings went (migration 009).
- **Nobody is sent to the IAM while the site cannot run**: the guards let every
  page through, the family's page stands instead of each, and its quiet Sign in
  is the way in - for the ADMIN who applies an update above all. So the address
  stays the one asked for: the sign-in comes back to it (the Migrations page's
  address, for the ADMIN, opens the page), and the page reloads there once the
  site runs.
- **No page runs out of sight**: the library's gate shows what it wraps inside
  an `@if`, but a component's projected content is made whether it is shown or
  not - a bare `<router-outlet>` inside would put the page behind the family's
  one in place, asking the API and raising toasts over it. So the outlet is
  given to the gate as a template (`<anotoki-site-gate><ng-template anotokiSitePages>…`,
  marked since 0.2.0 - an unmarked one is not the pages), which
  it makes only while it shows the pages (0.1.1). With 0.1.0, which had no
  template, this site took the gate's decision again around a bare outlet
  (`AppComponent.pagesOpen`, gone with 0.1.1). And once the site could not run
  in a page load, its pages stay away until an update applied in that tab
  opens them: any other way back to ready, the family's page reloads the page
  at once, and a page made in that moment would only flash (the site's own
  hold for it, `PAGES_CLOSED` and `AppComponent.held`, went with 0.3.0: the
  library's `SiteStatus.checkForReload()` never opens the gate first). Answers
  to a survey sent just as an update closes the site raise no toast either
  (`siteClosed`, `send-failure.ts`): the family's page has taken the survey's
  place, and the answers wait in the draft.
- **Only what an update needs answers while it waits, each address exactly**:
  `siteOpenWhileUpdating()` names the Migrations page's three routes, not
  everything under `/api/admin/migrations` - an address dressed up as one of
  them (`/api/admin/migrations/../../surveys`, escaped or not) is closed by the
  gate itself, never left to the routes not matching it.
- **The Migrations page's routes judge ADMIN from the token alone**
  (`requireAdmin()`, the library's `RequireRole`; the error log's and the
  backups' too since anotoki-lib 0.4.1): the rest of the API records each visit
  in `users` (the library's `RecordPerson`), and these must work on a database
  a pending migration has yet to build - from nothing at all, where `users` is
  not there either.
- The card for a server that did not answer as the site started stays, for the
  one case the family's page does not cover: the status answered, the sign-in's
  settings did not.

**Every page is for somebody signed in - while the IAM says sign-in is
required.** The owner: the survey (like the IAM, Japanese and Piano) requires
a sign-in at minimum - nothing but the sign-in prompt for anybody else. So
every page goes to the IAM first and comes back to the address asked for, and
the API answers nothing of a survey without a token; a survey's welcome is no
longer shown to visitors before they sign in (it was, until the family's
change). Only the pages drawn while the site cannot run (the family's page,
the card for a server out of reach) draw without it.
Later (2026-10-05) the owner made that the IAM's switch, per site (below):
switched off, the pages people take surveys on welcome visitors; the admin
panel and the editor's preview never do. One exception, kept on purpose: a
survey's pictures (`/api/images/{id}.{ext}`) are served with no token, because
an `<img>` cannot send one, and their addresses are random UUIDs, so they
reach only somebody who was given the address. Putting them behind the token
too would mean fetching each one with it into a blob URL, and losing the
year-long cache shared across visitors; not worth it for pictures that only
illustrate a question.

**Whether sign-in is required is the IAM's to say, and it fails closed.** The
owner (2026-10-05): "I would like to be able to setup if log in is required
for a specific project and also what roles can log in to a specific project.
The default role for users should be member. Every user needs to have a role."
So the IAM has a "Sign-in required" switch per site (on for the survey), and
gives every account MEMBER in every site. The backend reads the switch through
the IAM's PHP SDK (`anotoki_iam_login_required()`, vendored byte for byte like
the verifier - no site writes its own fetch; since anotoki-lib 0.4.1 the
library's `SignInRule`, the same rule for every site) and relays it in
`/api/auth/config`; the browser never asks the IAM. The answer is kept a minute
on disk and is **true unless the IAM said false**: an IAM never reached, an
application it does not know (404) and an answer about another site all mean
"required" - a site that cannot tell must not open itself to people who are not
signed in. An IAM out of reach after it answered keeps its last answer: a
minute-long outage must not flip the site. Switched off, the site takes
visitors (below).

**Only `Authorization: Bearer` claims to be somebody.** A Bearer header whose
token does not check out - an empty one included - is 401 `invalid_token`,
never "nobody": a person whose token ran out must never be taken for a
visitor, nor have a visitor key read for them. Any other scheme is ignored: `Basic ...` is what a host
behind a password file sends with every request, and says nothing about who is
using the site.

**MEMBER is an ordinary person.** Every account holds it (the IAM gives it to
everyone, and to every account made later); no check here asks for it, and a
token without it is treated the same. Taking a person's MEMBER away in the
survey application is how the IAM blocks them: their next sign-in and every
refresh is refused, while the access token they hold verifies until it runs
out (minutes). A person blocked so can still take surveys as a visitor while
sign-in is not required - blocking stops signing in, not visiting; a survey
that must keep somebody out keeps "Sign-in required" on.

**With sign-in not required, people take surveys as visitors - the build
analyzer's visitor accounts.** The owner (2026-10-05), for every site: "The
visitors will have automatically created account with role visitors or
something like that with all data there. Its just they can lose their data
because they are not stored via credentials. But when they register the data
could transfer." So a visitor is a row of `users` like a person's - a negative
id from its own sequence, so it never meets an IAM id, and no name - and its
answers are ordinary answers: "once each", the results and the move need no
second kind of answer. The "role visitors" is that mark, never an IAM role: a
visitor has none, and nothing that needs a verified token lets one through.
The key is the server's (32 random bytes; only its hash stored), sent once in
a response header, never in a body, a URL or a log. A visitor is made only by
answers that are kept, in their own transaction - a page view, a draft or a
refused send makes none and counts nothing, so the table holds only people who
answered.

**A visitor that ends keeps its answers in the results.** The analyzer deletes
a visitor's data when it is unseen for 30 days; here the answers are the
survey's results as much as the visitor's, and a survey's numbers must not
shrink because its respondents did not come back. So the visit *ends* - the
key's hash is cleared, the browser no longer counts as their sender - and the
answers stay as "Visitor N" (a coordinator's answer to the owner question, the
owner may reverse it). The cost, said in operations: ended visitors' rows are
kept for good, and a browser whose visit ended may answer the same survey
again. A visitor with no answers left is deleted - when it would end, or, once
ended, when an ADMIN deletes its last answers (with the delete itself, not by
a clean-up that would have to look through every ended visitor each hour). A
visitor still coming back is never deleted, answers or not: what a visitor is
told is `keep_days` after the last visit (`visitorDays`), whatever happened to
its answers.

**In the admin panel a visitor is "Visitor N", "Not signed in" - no badge.**
The name comes from the server (from the visitor's own id, so it never
changes and two visitors never share one), and "Not signed in" stands under
it - the one place a person and a visitor differ in the lists (a person had
their address there until the site stopped keeping addresses, anotoki-lib
0.4.1; now nothing). The plan also gave the row a "Visitor" badge; beside
"Visitor 12" it said the same thing twice, so it was left out. An IAM account
that happens to be called "Visitor 12" has no "Not signed in" under it, which
tells the two apart.

**A survey that must count one answer per person keeps sign-in required.**
With visitors, a fresh browser is a fresh respondent. The limits on new
visitors (per address an hour, in all an hour, how many at once) bound it and
nothing more; they live in an optional settings file nobody writes, with
defaults that fit a school class behind one address. The address is
`REMOTE_ADDR` unless a proxy the settings trust says otherwise - a forwarding
header believed from anybody would let a script pick a new address for every
request.

**At sign-in the person's answers win.** The move needs the person's token and
the visitor's key, and works whatever the switch says - switching sign-in on
stops a key being somebody, not being handed in with a token, so nothing a
visitor answered is stranded. Where both answered a survey, the person's
answers stay as they are and the visitor's go: the person's were given knowing
who they are, and "once each" leaves room for one. Everything else becomes the
person's, with its language and times.

**A visitor's send that loses its row is "visitor unknown", never a database
error.** A move in another tab or the clean-up can take a visitor's row while
its answers are on their way; the insert would then fail on its reference and
be answered as "the database is not reachable". Every send holds its taker's
row first, and a row that went is the same 401 `visitor_unknown` a stale key
gets - which the browser knows what to do with.

**In the browser, who a request is is decided when it is issued.** The
analyzer first chose by whether a token happened to be there as a request
left: a person whose refresh was refused (an account blocked in the IAM, a
sign-out in another tab) sent their answers with no token - and, with
visitors welcome, as nobody, which made a visitor no browser held, and let
the person answer again as themselves. So `ApiService` marks each request the
person's or the visitor's from the state when it is made, and a person's
request with no token is never sent: it fails at once as 401
`sign_in_required`, and the signed-out handling takes over with the answers
still in the draft. The key goes only on a visitor's requests, only to the
three survey routes, only while sign-in is not required.

**The key is kept while sign-in is required.** The server refuses it then, and
the browser stops sending it - but keeps it: the visitor who signs in still
has their answers moved (the move works whatever the switch), and switching
the requirement off again within the days a visitor is kept brings the visit
back. Only the server saying it no longer knows the key (`visitor_unknown`)
forgets it - and only while it is still the key that was sent, since another
tab may hold a newer one. A 401 `sign_in_required` on a survey's route tells
the page the switch went on since it loaded; on any other route it says
nothing of the switch (the preview's admin calls refuse nobody-signed-in
whatever it says).

**A visitor's drafts stay in the browser and become the person's at
sign-in.** A draft on the server would make visitors out of typing, and the
survey never had server drafts. At a sign-in the visitor's draft of a survey
becomes the person's - where the person has one of their own, theirs stays,
the rule the move keeps for answers - before any page reads them: in the
start (`boot()`), and by the survey page itself for a sign-in in another tab,
whatever order the effects run in. A shared browser hands a visitor's drafts
and answers to whoever signs in next there; the notice says "this browser".

**A sign-in waits for the sends on their way.** A visitor's first answers
bring their key in the answer; a page that left for the IAM before it came
would leave the answers kept under a visitor nobody holds, and the move would
find nothing. So the site's writes are counted while they are out, and a
sign-in leaves when they have their answers (30 s at most).

**The editor's preview signs in whatever the switch.** It shows any survey,
open or not, to the people who write them; a visitor has no business there,
and its own guard and the layout keep it to somebody signed in.

**The days the notice promises are the server's.** "This browser remembers
... for 30 days" is the server's `keep_days`, relayed as `visitorDays` - not a
number of the frontend's that a host's settings could make a lie. A backend
that does not say it is one from before visitors, and the pages welcome none.

**The family's visitor counter counts the pages, without the query string.**
The owner (2026-10-06) asked for Umami - the family's own, at
`umami.anotoki.eu` - on every anotoki site. `frontend/src/index.html` loads its
script, and the upload's policy (`backend/tools/build.php`) allows it in
`script-src`; what it sends goes to its own origin, which `connect-src`'s
`https:` already allows. It sets no cookie and stores nothing in the browser.
It is told to leave the query string and the fragment out
(`data-exclude-search`, `data-exclude-hash`): the sign-in comes back to
`/auth/callback?code=...&state=...`, and the script may read the address
before the app has run - a counter that kept it would hold every sign-in's
code. It is `async`, not the snippet's `defer`: a deferred script and the
app's module run in order, so the site would wait for the counter - for as
long as a slow or unreachable `umami.anotoki.eu` takes to give up. The paths
still go: a survey's address is its slug. The price: the script runs in the
site's pages, beside the sign-in's tokens in localStorage, so the site trusts
whoever controls what `umami.anotoki.eu` serves that far.

**The theme, the dates, the clock and the language are the anotoki
account's.** The owner's decision of 2026-10-06 for the whole family
(`../anotoki-iam`, its `docs/decisions.md`): "it should be in the iam only and
apply for every project/application" - and, asked, that a site's own controls
save to the account for somebody signed in, and one theme everywhere: every
site, every part of each. The IAM's migration 015 keeps them on the account
and sends them in the tokens (`preferences`, beside `locale`); the vendored
SDK 1.2.0 reads them (`AuthService.preferences`) and saves them
(`savePreferences()`). Here:

- **Signed in, the account's - the admin panel too.** The theme in the top
  bar is the account's, and choosing one there saves it (`ThemeService`). Dates
  follow the account's order (`localDate` where people take surveys; the admin
  panel's English dates through `AdminDates`, with its clock as well - the
  pages people take surveys on write no time of day). The account's language
  outranks what this device remembered; only `?lang=` and a choice made on the
  page come before it, and the chooser saves a choice to the account.
- **A choice is shown at once, saved one at a time, the last one last** - the
  IAM's own pattern: two saves in flight could land in either order. A theme
  the account refuses goes back to the account's, and a note under the
  family's theme switch says so (`theme.notSaved`); a language stays on the page for the visit - silently
  when the IAM does not offer it (it is this site's own, then), with a toast
  (`language.notSaved`) when the IAM could not be reached. The answer to an
  earlier save never turns the page back while a later one is on its way.
- **Signed out, the device's, as before.** A visitor's theme and language stay
  in this browser's storage; the account's take over at sign-in. The theme
  shown last is kept on the device either way, so `theme-boot.js` paints it
  before the account is read.
- **An IAM that sends none - before its migration 015, or a sign-in without
  the `profile` scope - changes nothing**: the site keeps its own settings
  exactly as before, the device's language first, and saves nothing to the
  account. The browser check's stand-in IAM is such an IAM.
- **What is data stays data**: the answers' CSV keeps its ISO times, and the
  file's name its ISO day.

**The UI kit is the family's - anotoki-lib 0.2.0.** The owner (2026-10-07):
one UI kit for every anotoki site, in the library, built from the IAM's and
this site's (whose bar was the reference). His decisions for it: **one
library palette**, which a site overrides only where it wants colours of its
own - this site's were the IAM's, the family's, so it overrides none;
**Manrope on every site** (the library's styles bring it); **the family's
segmented theme switch**; the admin wordmark **"anotoki survey · admin
panel"**. And because the kit's built-in Slovak says "ty" and this site says
"Vy": **every word the site showed before still shows** - each kit word the
site has a string for is read from it (`lookup`, `core/kit.ts`: reworded in
the admin panel, it shows reworded), and the rest are said formally
(`words`). So the site's copies went - `src/app/ui/`'s kit pieces, the top
bar's insides, the theme service, `theme-boot.js`, the tokens, the base and
the utilities - and what is only the survey's stayed: the rich text editor,
the lightbox and its pictures, the layouts' states, its own tokens, `.rich`,
`mark`, the drag and drop, the look of the fields it draws itself. What looks
different is the library's on purpose: the edge of every control (fields,
buttons, the bar's round buttons, the switches) at 3:1 on its ground, the
badges' green and amber words at 4.5:1, the spinner's arc a third of the
ring, a waiting Sign in or Sign out saying "Saving…", a refused theme and a
language that cannot be had said under their control instead of in a toast,
and the 0.2.0 Migrations page. A decorative edge that was drawn with the old
strong border - a dashed frame, a quote's bar - keeps its colour
(`--rule-strong`). (Since 0.3.0 the kit reads its words from the library's own
keys in the site's database instead of a mapping onto the site's - *The site's
words are the family's library's*, under *Languages*.)

**Signing in, the people and the admin tools are the family's library's -
anotoki-lib 0.4.1 (2026-10-11).** The owner's round moved what every anotoki
site did on its own into the library, and each site onto it. The survey takes:

- **Signing in** (`Auth`, both halves): the IAM's SDKs it vendored are gone -
  the library's client keeps the same storage, so nobody was signed out - and
  with them the site's interceptor, guards, callback page and sign-in toasts.
  A sign-in that came back without one, or could not start, is the library's
  screen on `/auth/callback` (one for every site, the "what's new" a reader
  notices), worded by the site: migration 012 moved the site's four sentences
  under the library's keys - every language, an owner's rewording with them -
  and writes this site's formal Slovak for the two the library says
  informally. The cards that said it before ("You are not signed in" after a
  refused sign-in, with a toast) went; the layouts' cards stay for a session
  that ends with the page open. **No sign-in by the IAM's hint cookie** - the
  owner's decision: the automatic sign-in is genshin's and the build
  analyzer's, the sites that let visitors in and want them signed in; here a
  visitor with an account stays a visitor until they press Sign in (and the
  library's "follow the IAM" refresh, which reads the hint, has nothing to
  follow).
- **People** (the library's people module over `users`): **the site keeps no
  address** - the owner's decision: the IAM is the only holder of anybody's
  address, so 011 dropped `users.email` (its gate proves every other column of
  every row unchanged) and nothing here reads one; the CSV and the results name
  a person by name. An account the IAM deletes is scrubbed here - its name the
  IAM's placeholder, its answers kept (the owner's "keep everything", nobody's
  now). The People page's Delete takes a person's answers after its question
  alone - the owner's decision: no proof of a recent sign-in - and every
  delete is audited.
- **The admin tools** - the error log, the audit log, the backups - **for the
  site's ADMIN alone** (the owner's decision for every site: an EDITOR writes
  surveys, and reads none of them). **No feedback form** here (the owner's
  decision then - until 2026-10-18: *Feedback, after all*, below) and **no
  file explorer** (the pictures live in the database, and
  are in every backup). Reached from one link of the admin panel's bar,
  System, and its page - the bar holds four sections at its narrowest desktop
  width, and a link a tool would overflow it.
- **The backups are not encrypted** - the owner's decision of 2026-10-11,
  for every site: only the IAM's backups are (from its master key). This
  site has no secret of its own to derive a key from, and one kept beside
  the files in `storage/` would protect nothing; a downloaded backup is as
  private as the place it is kept.
- **A backup is kept until the owner deletes it - no maximum age** (the
  owner's decision of 2026-10-11, for every site): nothing deletes a backup
  for being old. One made by hand stays until it is deleted on the Backups
  page (the page marks it after 90 days, and deletes nothing); the automatic
  ones go only as the library's keeping by kind replaces them with newer ones
  (the daily 14, before an update 5, before a restore 5). So a person the IAM
  deleted - scrubbed here - stays in the backups made before, until those are
  deleted; a restore runs the scrub again at once, and one that cannot finish
  it (the IAM out of reach) says so - the restore stands, the Backups page
  shows why, the error log has it - and the next request runs it again, not
  an hour later.
- **A restore brought back the answers deleted for a person** (People →
  Delete their answers) since the backup was made - until the library's
  next release, which keeps such a delete across a restore: 0.5.0, below.
- **A backup that fails is written in the site's error log** (System → Error
  log), beside PHP's own log: the daily one after an answer, the one before
  an update, the work after a restore (the library's `onError`, as its README
  wires it).
- **Browser errors were not in the error log yet**: the library's route for
  them (`ErrorLogRoutes::client`) was not mounted - they came to every site's
  error log with the library's next release and its Angular reporter (the
  owner's plan of 2026-10-11): 0.5.0, below.
- **The error log is the outermost layer** (as the library's README wires
  it): what the site gate answers - its 503s while an update waits or the site
  is not set up - is written down too, so an outage is something the log can
  report. (Until 0.5.0, below: a state the site is in on purpose is no longer
  written; an outage still is.)

**A restore keeps a person's deletes, the backups are sealed, the pages'
errors are logged, and an address is Cloudflare's to say - anotoki-lib 0.5.0
(2026-10-11), its PHP half 0.5.1 (2026-10-12).** The library's next release,
taken by every site in one round; for the survey (no migration of its own):

- **The PHP half is 0.5.1, the Angular half 0.5.0.** 0.5.0's restore set every
  sequence one step up past the later of the backup's value and today's: the
  survey's `visitor_ids` counts down (INCREMENT BY -1, MAXVALUE -1), so a
  restore of a database that ever had a visitor failed whole (`setval(0)`,
  `500 restore_failed`) - or, with more visitors, would have handed out an id
  again. 0.5.1 moves each sequence in its own direction; it changed only PHP,
  and the frontend stays on the 0.5.0 tarball. The site's test of it restores
  a database with visitors (`tests/api/admin_tools.test.php`).

- **A restore does not bring back what a person had deleted on the People
  page.** The People page's Delete is one hook, the page's and a restore's (`peopleDelete()`):
  inside the restore's transaction, before anybody sees its rows, every
  Delete since the backup's snapshot is done again (the library's
  `People::restoreHooks()`, by the audit log's `person.data_deleted` - the
  audit log is never restored); one that cannot be done again rolls the
  restore back whole. So the hook keeps the library's contract: it runs inside
  the library's transaction and begins none of its own, works on the
  connection it is given alone (in a restore the site's own would wait on the
  restore's locks - PostgreSQL ends such a restore after a minute), and takes
  a null request; `responsesDeleteOf()` refuses to run outside a
  transaction, so a hook that hands it the site's connection in a restore
  (in no transaction there) fails at once instead of a minute later - one
  that opened a transaction of its own there would still wait the minute,
  which is why a hook never opens one. The delete's entry is written
  inside the delete's own transaction: no delete without it (`503
  feature_unavailable` while the audit log's table waits). The site's own
  scrub after a restore (`surveyScrubAfterRestore()`) went: the library's does
  the same, the next request scrubbing again when it could not finish.
  **One gap, open for the owner**: answers a visitor's browser moved into the
  account (`POST /api/visitor/move`, `visitorMoveInto()`) after the backup are
  the visitor's in that backup - a negative id the Delete done again does not
  name - so a restore brings them back as "Visitor N" (no name on them, the
  person's words in them). Closing it needs the move kept where a restore
  does not undo it - e.g. a `visitor.moved` entry in the audit log inside the
  move's transaction, and the Delete taking the answers of the visitors moved
  into the person too - which puts what people do, not only the admin panel,
  into the audit log: the owner's call, not this round's. Nothing is public
  yet, so no such answers exist.
- **What the error log leaves out is the family's rule** (anotoki-lib 0.5.0's
  `expected`, taken whole): a state the site is in on purpose - an update
  waiting (`update_pending`), not set up, a tool's table waiting - is not
  written; a real failure, a 503 of the database included, is. The survey
  never filtered its 503s itself, so nothing of its own went; the gate's
  answers while an update waits are simply no longer in the log.
- **Only a backup made here is restored here.** A plain backup is sealed under
  the installation's key (`storage/anotoki-lib.key`); one made before 0.5.0 has
  no seal and is restored offline alone - nothing is public yet, so none of
  those is needed (the owner's word for the round). The Backups page names
  each backup's maker (the context's `names`, the site's `users`).
- **The pages' errors go to the error log** - the owner's decision for every
  site: `POST /api/client-errors` (the library's route, nobody's: a visitor's
  page fails as anybody's does) and the library's reporter in the browser,
  through the app's own `HttpClient` - so the site's interceptors decide what a
  report carries: a person's token (the server counts it by account), never a
  visitor's key (it goes to the surveys' routes alone). Capped by the library
  (20 an hour a sender, 500 a day from the visitors and as many apart from
  the people signed in) and closed while an update waits, as every route is -
  not one of the paths that answer then: the Migrations page's errors are not
  worth an open write.
- **Where a request comes from is what Cloudflare says, and is not kept in
  the clear** - the owner's rule of 2026-10-11 for every site:
  `CF-Connecting-IP` alone, believed only on a connection from Cloudflare's
  published ranges, now the committed default (`VISITOR_DEFAULTS`: the
  library's `ClientAddress::CLOUDFLARE`; the list was empty, so every visitor
  behind Cloudflare shared the edges' few buckets), `visitors.local.php` able
  to replace it. **The header is pinned in code** - `client_ip_header`, the
  setting that named it, went (a file that still has it is logged, the key
  left out): `X-Real-IP`, `True-Client-IP` and `X-Forwarded-For` come through
  Cloudflare as the visitor sent them, so a site reading one would let anybody
  name their own address (a finding of the other sites' reviews, kept out
  here); the site's own reading of a list header from the right went with it.
  **A catch-all range is refused**: a `trusted_proxies` entry shorter than /8
  (IPv4) or /16 (IPv6) - `0.0.0.0/0`, `::/0` - would make a proxy of half the
  Internet; the list is left out, logged, and Cloudflare's holds. The library's
  error log reads by the same proxies and the same header. Only a keyed HMAC
  of an address is kept: the visitors' counters held `visitors:new:<address>`
  in the clear until now (in the database and so in every backup) - they go by
  an HMAC under a key derived from the installation's key now, and the old
  rows go with the clean-up once their hour is over (nothing migrates: a
  counter lives an hour). The HMAC is a stable pseudonym of the address while
  that key lasts, not a way to make it unreadable: whoever holds
  `storage/anotoki-lib.key` can try every IPv4 address against it.

**`CF-Connecting-IP` is believed only through the owner's zone - the origin
secret, anotoki-lib PHP 0.5.2 (the owner's decision of 2026-10-13; the
Angular half stays 0.5.0).** Cloudflare's published ranges are every
Cloudflare customer's, not the owner's zone alone: anybody's Worker can open a
connection to the host from them and write a `CF-Connecting-IP` of its
choosing - a new address for every request, past every limit counted per
address (the new visitors an hour, the pages' reports). So a Transform Rule of
the owner's zone adds a secret header, `X-Anotoki-Origin`, to every request
through it, and the site, given the same value, believes `CF-Connecting-IP`
only on a request that carries it (the library's `ClientAddress::of()`,
compared in constant time; `clientAddress()` and `surveyAdminContext()` both
pass it, so the visitors' limits and the error log read alike). Any other
request from Cloudflare counts as the edge it came from: coarser - a Worker's
made-up visitors share the edge's one bucket - never looser. The value lives
in `config/cloudflare.local.php` (`['origin_secret' => ...]`), optional and
the same file in every anotoki site: put there by hand like
`visitors.local.php` - `setup.php` neither writes nor reads it, the build
never carries it. Without it, or with a value that is not a string with
something in it, Cloudflare's ranges alone are believed, as before; a file
PHP cannot read is logged by its error's kind and line alone (a parse error's
message can quote the file) and passed over, never fatal. The secret is never
printed or logged.

**A `cloudflare.local.php` that is there but cannot be read cleanly fails
closed (2026-10-14, the IAM's rule case for case - its `iamOriginSecret()`,
the security review of 2026-10-13; this replaces "passed over" above).** Its
owner meant a secret: a file saved with a byte-order mark, without its
`<?php` line, with a line before it or text after its closing tag (it prints
when PHP requires it), one PHP cannot parse or run, or one it may not open,
is read as a secret no request carries - 256 random bits of the process,
never written anywhere (`originSecretNobodyCarries()`) - so every request from
Cloudflare's ranges counts as its edge until the file is mended. Reading it
as "no secret", as before, would believe the `CF-Connecting-IP` of anybody's
Worker on those ranges: a slip of the editor must never switch the check off.
A file read cleanly that names no secret - empty, spaces, not a string, no
array returned - stays "no secret", as the IAM reads it (until 2026-10-18: it
fails closed too - *A cloudflare.local.php without a usable secret*, below).
The site keeps
running either way (the file is optional, never a reason to be "not set
up"). What the file prints is caught and goes nowhere
(`settingsFileReadCleanly()`, every buffer it opened drained); its fault is
said in PHP's error log at most once a day (a stamp in `storage/cache`,
`settingsSaid()`) by its kind and line or its byte count, never its text.
`tests/unit/client_address.test.php` holds each case, and
`tests/api/visitors.test.php` the attack it stops: a file with a byte-order
mark, and a Worker writing a new `CF-Connecting-IP` - with the file's own
secret beside it - is one sender, the edge.

**Every settings file is read cleanly or not at all (2026-10-18; the IAM's
rule - its `readLocalConfigFile()` - and Piano's).** `database.local.php`,
`iam.local.php` and `visitors.local.php` were still read with a plain
`require` after `cloudflare.local.php` went through the guard: a
`database.local.php` saved with a byte-order mark, without its `<?php` line
or with text after a closing tag would print what it holds - the database
password, where the line is missing - ahead of every answer, the status the
pages read included. All four go through `settingsFileReadCleanly()` now:
whatever a file prints as PHP reads it is caught and never sent, and the
file is passed over. A database or IAM file that cannot be read cleanly
(that, or PHP cannot parse, run or open it) leaves the site not set up -
`503 not_set_up` everywhere but `/api/site-status`, which says so; never a
500, never its text - and the setup page on this computer names the file and
its fault (a real host's says only that the saved settings are not
complete); saving the form writes the file anew, its password typed again,
since none is kept from a file never read. A visitors file means the
defaults, never "not set up". Each fault is said in PHP's error log at most
once a day (`settingsSaid()`) by its kind and line, or the bytes the file
printed - never what PHP said, which the visitors file's log used to repeat
(a parse error's message can quote the file); a visitors value nobody can
use is said once a day too, by its key's name, never its value.
`tests/api/migrations.test.php` holds the attack - a byte-order-marked
`database.local.php` with a password in it and no `<?php` line: no answer
carries the password (the status, the API, the pages, the setup page), no
PHP warning is raised, and the site says it is not set up; with a plain
`require` back, the status answer carries the whole file - and
`tests/unit/config.test.php` and `client_address.test.php` each kind of file.

**A settings file is never compiled unless it starts with `<?php`
(2026-10-18; Japanese Academy's review found it, the family's rule since -
the IAM's `readLocalConfigFile()` and Piano's guard alike).** The output
buffer above catches what a file prints, but not a file PHP cannot compile: a
`*.local.php` saved with a byte-order mark or a blank line before
`<?php declare(strict_types=1);` is a compile-time fatal error ("strict_types
declaration must be the very first statement", exit 255) that no `try`, no
error handler and no output buffer catches - every request, `/api/site-status`
included, answered 500 instead of "not set up", and a `cloudflare.local.php`
saved so never failed closed. `settingsFileReadCleanly()` now reads a file's
first five bytes before anything else and, unless they are `<?php` (in any
case), passes the file over without requiring it: its problem is that it
"does not start with <?php", logged by that fault alone, never its text, and
what passing over means stays each caller's (not set up, the defaults, a
secret no request carries). Nothing a good file needs is lost: every file
`setup.php` writes starts with `<?php`, and one whose `<?php` comes after
anything else would print that ahead of every answer anyway - which is why a
byte-order mark, a line before it or no `<?php` line at all is now said this
way instead of by the bytes it printed. `tests/unit/config.test.php` and
`client_address.test.php` write both starts before `declare(strict_types=1)`
for each kind of file (with the check taken out, the test process ends at
the require), `tests/api/migrations.test.php` the database's through the real
server (not set up, never a 500, nothing of it in any answer or the log) and
`tests/api/visitors.test.php` Cloudflare's (with the check taken out, the
first answer is a 500; with it, a Worker's made-up `CF-Connecting-IP` through
the trusted proxy - the file's own secret beside it - is the edge).

**Terms, Privacy and Contact (anotoki-lib 0.6.0's legal pages, the owner's
decisions of 2026-10-13) are anybody's, and their facts are the code's.**
The pages are the family's (`@anotoki/lib/legal/pages`); the survey gives its
facts (`core/legal/legal-facts.ts`, the words `legal.*` of migration 013). The
choices made here:

- **No sign-in in front of them.** Every other page is for somebody signed in
  (unless the IAM lets visitors in), but what a site keeps must be readable
  before anybody signs in to it - so `/terms`, `/privacy` and `/contact` have
  no guard, in a frame of their own that draws the survey's (the skip link,
  the bar, the column; `layouts/legal-layout`). Nothing of a survey is on
  them or asked of the API; while the site cannot run, the family's page
  stands instead of them as of every page. Each is a path of its own with the
  frame as its parent: one parent with an empty path for the three took `/`
  for itself (the router takes an address it has read whole for such a parent
  when none of its children match) and drew the empty frame there with no
  guard (`app.routes.spec.ts`). The three are addresses no survey may have
  (`RESERVED_SLUGS` ↔ `SURVEY_RESERVED_SLUGS`, held together by
  `tests/unit/rules.test.php`); a survey opened at one before is reached no
  more there.
- **The facts say what the code does, conservatively.** A person's record (the
  account's id and name, first and last seen - never the address), their
  answers (seen by the site's editors and administrators with the person's
  name, downloadable as a file; deleted only by an administrator, never by
  age), who wrote which survey, picture and string; visitors (a number, the
  key's hash, its days from the server's `visitor_days`, the answers kept as
  "Visitor N", the hour's counts by a keyed code of the address); the audit
  log (editors' and administrators' changes, never an address); backups kept
  by count, not by age - the 14 newest daily ones, a daily one made on a day
  the site is used, so the library's "for 14 days" was not true of a quiet
  site; every item of the browser's storage by its name - the sign-in's (and
  what its tokens say: the account's e-mail address among them), a sign-in
  under way, the theme, the language, a tab's language, the visitor's key, a
  survey's drafts, the admin pages' unsaved words - and the anotoki account's
  sign-in hint cookie, which reaches this site and is never read here
  (`hint: false`); the family's Umami; the hosting company (WebSupport s.r.o. -
  "to be named" until the owner named it on 2026-10-18) and Cloudflare. What the code does not settle is listed for the owner.
- **Every address is the code's.** The anotoki account's Privacy page and
  account page come from the IAM's address the site signs in with
  (`AnotokiAuth.issuer()`, `accountUrl()`), the operator's and Cloudflare's
  from the library - never from a string an administrator rewords on the
  Translations page (the library's 0.6.0 review); the backend's test holds
  every `legal.*` string free of an address, and its Slovak formal.
- **No feedback form**: Contact gives the family's address alone (until
  2026-10-18: Contact opens the feedback form first - *Feedback, after all*,
  below).
- **The footer's Terms · Privacy · Contact** (the family's
  `<anotoki-legal-links>`, `layouts/site-footer`) are under the survey's pages
  - the card of a session that ended too - and under the legal pages; not in
  the admin panel, which is English and a frame of its own.

**The kit's new pieces where the site drew its own (anotoki-lib 0.6.0),
others kept.** Taken: the kit's link card (`a[anotokiLinkCard]`) for the home
page's surveys and the System page's ways to its pages - each a card that is
one link, its focus ring round the card -, the layout inside each card the
page's; the kit's removable chips (`<anotoki-chip-list>`) for the results'
filters - each remove button named with the question (cut short at a word) and
the answer, the focus going on to the next chip, and to the results' tab when
the last one or "Show everybody" takes the row away. Kept: the survey's
segmented progress on its night sky (the kit's step dots are drawn in the
page's colours, which a sky dark in both themes would not carry, and the
segments show how many steps there are at a glance); the editor's toolbar
(TipTap - its highlighter and two headings are not among the kit's buttons,
and its link has a form of its own: no simple swap); the editor's language
tabs (two marks on a tab - its progress and a state - where the kit's tab has
one badge, and they wrap on a phone); the "3 of 10" pagers (a pager, not a
list of steps); the picture row (pictures uploaded at once, ordered and
described - the kit's file picker holds files for a form and uploads none);
the common answers' chips (a list of answers, no control); the closing day's
`<input type="date">` (the browser's own, ISO by this site's rule).

**Feedback, after all - the anotoki library's (the owner, 2026-10-18).** "The
survey has no feedback, whats new and version (I know that it was what I said
but maybe it could be nice to have it there)" - so the survey takes the
family's feedback, as the other sites have it: the library's form
(`@anotoki/lib/feedback/form`), its table (`anotoki_feedback`, the library's
admin set, there on every database of the site already), its routes and its
admin page. The choices made here:
- **Anybody may send one**, a person signed in, a visitor, nobody - whether
  the IAM requires signing in here or not: the Contact page it is opened from
  is anybody's (the family's footer will open it too), and a form that
  refused somebody only after they had written their message would be a trap.
  The library's limits stand in front of it: 5 an hour and 20 a day from one
  sender, 300 a day from the visitors together and as many from the people
  signed in; the robots' field.
- **Who sent it is the token's alone** (the library's `Identify` in front of
  `POST /api/feedback`, as on every route that asks who: a token that does
  not check out is 401 `invalid_token`, never quietly nobody - the account
  would be lost from the message unasked), the person's row kept
  (`RecordPerson`) so the Feedback page names them; a visitor's key is never
  read there - a visitor sends as nobody.
- **No address written in.** The other sites write the account's address into
  the form as the reply address (the owner's choice of 2026-10-11: theirs to
  clear); this site keeps no address - the IAM is the only holder of
  anybody's (*People*, above) - so its form writes none in, and a reply
  address is kept only when the sender types one. Writing it in is one line
  (`email:` in `core/feedback.ts`), should the owner want the family's way
  here too.
- **Kept**, the library's numbers: spam 30 days, resolved 365, the rest until
  an ADMIN deletes it - each at the next clean-up, which runs at most once a
  day after a message comes in or the Feedback page is opened. The Privacy
  page says so in the site's words (`legal.feedback.kept`, migration 015):
  the library's own sentence says neither when, nor that it waits for one.
  When the IAM deletes an account, its messages keep their words and lose the
  reply address and the browser's name (the scrub's hook,
  `peopleForgetFeedback()`); so does the People page's Delete (the library's).
  A restore never brings back a message deleted since its backup (the
  library's replay of `feedback.deleted`).
- **The Feedback page is an ADMIN's**, like the other System pages, with the
  count of messages nobody opened beside the bar's System link and on the
  System page's card (no mail is sent for one). Its words are the library's,
  in formal Slovak where they speak to the reader (migration 014,
  `FORMAL_SLOVAK`), with the library's kinds and no places of the site to
  choose from.

**A `cloudflare.local.php` without a usable secret fails closed (2026-10-18,
the owner's "do as you think is the best").** The rule of 2026-10-14 failed
closed only on a file that cannot be read cleanly; one read cleanly that named
no secret - blank, not an array, a misspelt key, a value that is not a string -
was "no secret", as the IAM reads it, and believed `CF-Connecting-IP` from
Cloudflare's ranges alone: a typo in the key's name switched the check off,
said only in a log line. Asked, the owner left it to us. A file that is there
means its owner put it there by hand to have a secret, so every such file now
stands for a secret no request carries (`originSecretNobodyCarries()`) - every
request from Cloudflare's ranges its edge, coarser, never looser - and so does
a folder given the file's name (something is there; read as "no file" it
would have believed anybody's Worker again); the one way to switch the secret
off is deleting the file. The site keeps running; the fault is logged once a
day by what it is ("names no usable origin_secret", "is no file"), never a
value. The family's sites take the same rule (the build analyzer at the same
time, the others with the family's footer).
`tests/unit/client_address.test.php` holds each case and the off switch,
`tests/api/visitors.test.php` the attack it stops: a misspelt key, and a Worker
writing a new `CF-Connecting-IP` each time - the file's own secret in
`X-Anotoki-Origin` or not - is one sender, the edge.

**The family's page stands alone: no top bar, no footer (the owner,
2026-10-18).** "I prefer nor header nor footer to be there because they can be
under the update as well." It already was so here: the bar and the footer live
in the site's frames, which are routed, and the gate makes no route's page
while the site cannot run (`<anotoki-site-gate>`'s template). Now
`app.component.spec.ts` holds it, in each state - an update waiting, the
database out of reach, not set up - through the real frames, as does the card
saying the server could not be reached.

**The host check may run here (2026-10-18).** The web root's `.htaccess` let a
visitor run `setup.php` alone, so the family's host check
(`tools/host-check.php`) answered 403 on this site's host. It may run too now,
by its exact name - inert while the file is not there: it is never part of a
build, is uploaded by hand with a token written into it, answers 404 without
that token, and is deleted again. `tests/api/hosting.test.php` reads the
`.htaccess` as Apache reads it.

## Languages

The first five are the owner's, made before any of it was built.

**The site's own words live in the database, like the genshin site's.** Tables
(`languages`, `translation_keys`, `translations`), a `translate` pipe with
keys, a language chooser, and the strings editable in the admin panel. They are
rows rather than files in the build because they are reworded on the live
site: a file in the Angular build is overwritten by the next upload, and the
host has no shell to edit one with. There is no `site` scope and no HTML flag
on a string (genshin has both): one database, and no HTML ever goes through a
string.

**Only what somebody taking a survey sees is translated; the admin panel stays
English.** Its words are written in its templates, as before, and the server's
sentences - which only the admin panel shows - stay English too. So the pages
people take surveys on never show a server's sentence: they word every refusal
themselves. The no-access card under `/admin` is English on purpose, with the
whole frame; so is the preview's own chrome, an editor's tool.

**English and Slovak; English is the fallback; Slovak here is formal.** A key
with no Slovak string reads in English, so English can never be switched off,
deleted or left empty. Slovak on this site addresses the reader with Vy - the
other anotoki sites say "ty"; this one does not. The rules a Slovak string
keeps:

- the past tense about the reader is the plural -li form for anybody
  ("vyplnili ste"), never a singular participle or adjective ("prihlásený") -
  "Prihlásili ste sa ako {name}";
- a capital V only on Vy / Vás / Vám / Vami / Váš and its forms; no pronoun
  where Slovak drops it ("Vyberte"); "svoj" when the reader is the subject;
- no "z", "zo", "v", "vo" before a number that varies (they depend on the
  number): "Krok {n} / {m}", "{count} kroky";
- content, names and language names stand in „…“ or after a colon, never
  after a preposition ("Jazyk: {language}"); Slovak quotes „ “ and the dash –;
- a Slovak string may leave out a placeholder the English has, never add one;
- the IAM's terms for the words it already has (theme, close, cancel, sign in
  and out), in the formal form;
- survey = prieskum, step = krok, question = otázka, answer = odpoveď, option =
  možnosť, picture = obrázok, optional = nepovinné, Other = Iné.

**A missing string shows its key on the page.** As on genshin: the owner wants
to see which key is missing, not an English word that hides it. It also warns
in the console, which the browser check counts as a failure - and a test holds
the frontend's keys and the migrations' together, so it should never be seen.

**One survey holds its texts in both languages.** Not one survey per language:
the answers, the results, the once-each rule and the address are one survey's,
whichever language a person read it in. A translation is texts found by the
ids of what they belong to, so the structure, the pictures and the limits
cannot drift apart between languages, and an answer - the id of an option -
means the same in each.

The rest were made on the way.

**Keys are the code's; the admin panel only rewords.** Migrations write every
key with its English and Slovak string; no route makes or deletes one. A
string added or reworded by a release is a new migration whose inserts step
aside for a row that is there - what was reworded on the live site is the
owner's and is never written over. Which `{placeholders}` a key has is fixed by
its English string, because the code fills exactly those: English may be
reworded but never gain or lose one, a translation may leave one out but never
add one.

**Which language a reader gets**, strongest first: `?lang=` in the address
(for that tab only - a link somebody followed is not a choice they made), the
language they chose in the chooser on this device, the language their anotoki
account is set to, the browser's languages, English. The account's language is
used, never stored: a change on the account page arrives with the next token.
At the browser step alone Czech counts as Slovak while no Czech is on offer -
Czech readers read Slovak far more easily than English. Since the family's
decision of 2026-10-06 (above: the account's preferences), for somebody signed
in through an IAM that sends the account's preferences the account's language
comes before what this device remembered - only `?lang=` and a choice made on
the page come before it - and a change of it is followed when it comes; the
chooser saves their choice to the account.

**People get a translation of a survey only when it is whole.** Otherwise the
survey is shown whole in the language it was written in, and the page says
which - never half in one language and half in another. For the same reason a
survey does not open while a translation into a language people are offered
has gaps; one into a hidden language may be unfinished, which is how a
translation is prepared without holding the survey up. The preview and the
editor show a translation text by text, so a translator sees how far they are.

**A save of a survey must say its language and its translations.** Neither has
a default on the way in: a page opened before surveys had languages would
otherwise save a survey and delete every translation it has without a word.
An unknown language is refused, never dropped - a save does not throw a whole
language of work away. Defaults apply only when an old row is read, so no
survey was migrated.

**The language a survey is written in changes only while it has no
translation.** With one, the texts of the document and those of the translation
would swap meaning under whoever is translating. That is the editor's rule
("Written in" is locked). The server refuses less: only a change of language
across which a translation is kept - the stored survey and the sent one both
hold translations. A save that removes the last translation and changes the
language at once is what two saves would do, and its revision says the sender
saw what they removed; refusing it left an editor whose earlier save had
failed with a survey no later save could get through.

**A conflict met while translating is settled by language.** When translated
texts are all an editor has unsaved, "keep mine" takes the other person's
survey and puts this editor's texts of that language into it: a translator and
somebody changing the questions do not undo each other. When the survey's own
texts or structure are unsaved too, it is the ordinary choice between the two
versions.

**In a conflict, translations are brought together text by text.** Whichever
way it is settled, a translated text this page changed since the server last
had the survey from it is this page's, and every other is the other
person's. "Save mine over it" used to send the page's translations as they
were loaded - an author's tab left open, a typo fixed, and a translator's
finished work was replaced by what that tab had; "keep my Slovak texts"
replaced another translator's whole Slovak. The author still loses nothing of
their own, and the notice says what is kept and what is lost before anything
is saved. Saved as mine, what their version removed or reworded keeps my
texts too: my question goes back with my translation of it - not without one,
nor with their translation of their rewording - and a translation is never
replaced by a gap. A language removed on one side is named before anything is
saved: removed here, it stays removed with whatever they wrote in it since;
removed by them, keeping my texts of it puts it back. Only when the two
versions are written in different languages is there nothing to bring
together, and mine is saved whole - said in so many words; and when both of
them hold translations then, mine is not offered at all until its
translations are removed, because the server takes no survey that changes
its language while both hold translations (the editor offers nothing the
server would refuse, and the conflict stays open until it is settled). The
merge is the editor's; the server still knows only revisions.

**In the grid of strings the last save wins.** A survey's save names its
revision; a string's does not. A save there sends only the cells that changed
and gets the whole grid back, so two people rewording different strings never
meet and each sees the other's change after their own save. Two rewording the
same string: the later save is kept, and the row records who and when
(`updated_by`, `updated_at`).

**Editors reword strings and keep the languages; only an admin deletes a
language.** It is the same line as everywhere on the site: deleting cannot be
undone - a language takes its strings with it. English is never deleted or
switched off; a language the migrations write strings for (`en`, `sk`) is never
deleted, because the next migration with strings would fail without it and a
failed migration closes the whole site on a host with no shell; a language a
survey is written in or translated into is not deleted either. Switching a
language off is never refused: surveys keep their texts in it, people simply
stop being offered it.

**The language a survey was read in is a note.** It is kept with the answers
when it is one of the survey's languages and left out when it is anything
else; it never refuses somebody's answers.

**The preview has a parameter of its own, `?language=`.** The site-wide
`?lang=` becomes the whole tab's language and is taken out of the address, and
a hidden language can never be the site's language - but a translator must be
able to preview one. The editor reads the same name for the tab to open, so
the preview's way back lands on the translation it showed. Without it the
preview shows the survey as it is written, whatever the page's language: an
editor who reads the site in Slovak and previews from the main tab must see
the English they just edited, not a Slovak translation text by text.

These were made after a review of all of it, before it went live.

**A new language starts hidden.** It has no strings, so offered at once it is
a page in English under another name. The Languages page adds it hidden unless
the person switches "Offer it to readers right away" on, and always says which
it did. The route itself still offers a language when `enabled` is left out -
what it did before the field existed.

**An empty string is one with nothing in it to see.** For the site's own
strings and the languages' names: a zero-width space, a word joiner or a soft
hyphen alone is kept by `trim()` and drawn as an empty place - so it counts as
empty (`textBlank()` then, the library's `Text::blank()` since 0.3.0): English refuses it, another language's row is deleted,
an import passes it over. The Translations page asks the same of a box
(`blankText()`, its twin) only to tell whether the box is a change: nothing
to see over no string is no change - no "1 string changed", no "The string is
saved." for a save that had nothing to write.

**A space is what the browser's `trim()` takes for one, on both sides.** For a
survey's texts and the answers, where the frontend and the server must find
the same things blank. PHP's `\s` and `\p{Z}` also take U+0085 and U+180E; the
set is written out once instead (`TEXT_SPACE`) and both helpers use it. The
stricter rule above is not used here: the survey's rules have no twin of it on
both sides, and the two sides agreeing on every text and answer is worth more
than catching an invisible label.

**A text too long to trim is too long, never empty.** A run of more than a
million spaces inside a text makes the trimming expression give up; the text
then comes back as it is and the length check refuses it. Cast to a string it
was an empty one - and an empty string in another language than English means
"delete this row".

**A brace in a string is only ever part of a placeholder.** The page fills in
what is written exactly as `{name}` and shows everything else as it stands, so
`{ count }`, `{počet}` or `{{count}}` would be read by everybody in that
language as braces and a word. Refused in every language
(`invalid_placeholder`), with one of the key's own placeholders as the example
of how it is written - or, for a key that has none, "This key has no
placeholder, so its strings can hold no { or }." (an example it does not have
would only lead to the next refusal).

**A code with a region is answered by its language.** A Slovak browser asks
for `sk-sk` first; answered in English, every first visit took a second
request before the first page. The bundle for `sk-sk` is the Slovak one while
no `sk-sk` is offered itself.

**The reader follows the languages on offer at once.** Every bundle brings the
list of offered languages, and the page settles on it whatever answered - so a
language offered again, or added, reaches a returning reader on that visit and
not the one after. It costs a second request only when the list really
changed.

**A page without its strings asks again when somebody clicks.** One lost
answer on a first visit is asked for once more after half a second; after
that, and for a cached bundle whose refresh failed, each navigation asks once.
Not a timer: a server that stays down is asked no more often than the person
moves, and the load error page stays for when the site itself cannot start.

**The last choice of language wins.** The chooser stays usable while a
language loads; a change of mind - back to the language on the page too - is a
choice, and the slower, earlier one is dropped when it comes, without a word.

**What is typed on the Translations and Languages pages survives the session
ending.** As a survey's unsaved changes do, and for the same reason: the IAM
ends a session left idle, and a sign-out on any anotoki site ends it here.
The page goes with no navigation, so no guard can ask. The drafts are
kept for the tab (signing in again is a page load) and for the person - only
somebody else signing in lets go of them. Signing out here asks first, and
then gives them up: the next person at this browser starts clean.

**A save that failed is said where Save is.** The grid is some 180 rows long;
a notice at its top is out of sight of whoever saved a string near the bottom,
and the bar with Save in it is always in view.

**A plural form a language never takes is not missing.** German has no `few`,
Japanese neither `one` nor `few`: the site never reads what stands there, so
those boxes count neither as missing nor towards how much is written - or
such a language could never be complete. English keeps all three: it is what
the others fall back to.

**A copied survey's translated titles are emptied.** The copy's own title is
new ("Copy of …") and its translations would still carry the original's name,
with nothing to say so - the copy would open to Slovak readers as the survey
it was copied from. Every other translated text still says what its original
says, and stays.

**An open survey with an untranslated text stays open, and says what that
means.** Closing it over one new option would punish everybody for a
translator being a day behind. Readers of that language get the survey in the
language it is written in, and the editor says so by name - in the notice, on
the language's tab, and in the bar a translator has in view.

**The refusal an old editor page gets says what to do.** The only browser that
saves a survey without `language` is a page left open across the release that
brought languages. "Try again" cannot help it, so the sentence says: copy what
you changed, then reload.

**A language is not deleted under a survey being saved in it, nor a
twenty-first added beside a twentieth.** Both were a count followed by a write
with nothing held between them. Each side now holds a row (or, for adding, the
table) inside its transaction, and the second to come sees what the first did.
Row locks rather than a constraint: a survey's languages are inside its JSONB
document, where no foreign key reaches.

**The key scan fails what it cannot vouch for.** A key put together from a
prefix nobody declared, a plural family asked for as one string, `innerHTML`
given a translated string over several lines: each was a way to show a key -
or draw a string as HTML - with every test green. A guard that says "clean" is
believed, so it is held to what it promises; what it still cannot read - a
key that reaches the pipe through a variable or a table - its header says.

**The site's words are the family's library's - anotoki-lib 0.3.0
(2026-10-11).** Every anotoki site kept its words in the same three tables,
each with its own copy of the code around them; the owner had them made one
implementation, in the library, and every site moved onto it. His decisions
for it:

- **One wire format, the IAM's** (snake_case: `native_name`, `sort_order`; the
  bundle the IAM's byte for byte). The survey's camelCase went - the backend
  and the frontend in one change: an admin page left open across the upload
  no longer reads or saves a language's two renamed fields (the server passes
  over `nativeName` and `sortOrder`, and a new language without `native_name`
  is refused) - it is reloaded first; a bundle cached in the old shape is no
  bundle (read again from the server), and a tab's drafts that hold a
  Languages row typed in the old shape are no drafts - the strings typed
  beside it go with them (typed again: save before the upload).
- **Who may do what stays each site's**: the library checks nobody. Here, as
  before: EDITOR and ADMIN reword the strings and keep the languages, and
  deleting a language is an ADMIN's (`requireRoleFor('DELETE', ROLE_ADMIN)`).
  The library's Languages page has no separate permission for deleting, so it
  offers Delete to an EDITOR as well, and shows the server's refusal.
- **Every rewording an owner made survives the move.** The kit used to read
  its words from the site's own keys (`lookup`, `core/kit.ts`); now it reads
  the library's, `anotoki.<word>`, from the same tables
  (`TranslationService.forKit()`). Migration 010 moves the site's strings for
  them under the library's keys before the library's set first runs - every
  language, with who saved each and when - and its gate fails when a string
  did not arrive, when a library word stands where the site had its own, or
  when the library's informal Slovak is left. Twenty-two keys only the kit
  asked for go; three the site's own pages ask for too (`common.close`,
  `common.tryAgain`, `common.signIn`) are copied and stay, each reworded on its
  own from now on. Moved rather than kept as a mapping: one word is one key on
  every anotoki site, the Translations page shows it once, under the name the
  library's own pages (the status page) read it by - a mapping would have left
  two rows for one word, one of them saying nothing.
- **This site's Slovak stays formal.** The library's Slovak says "ty"; the
  eight of its words that speak to the reader are this site's formal ones: the
  six the site had move with 010, the two it had not ("copying did not work",
  "try again in a few minutes") 010 writes - and where the library's set ran
  first, it replaces the library's words only while they are still exactly
  the library's. While the database cannot be read, `FORMAL_SLOVAK`
  (`core/translations.ts`) says them; a test holds the two to each other.
- **The site's own hold before a reload went** (`PAGES_CLOSED`,
  `AppComponent.held`): since 0.2.0 the family's page asks with
  `SiteStatus.checkForReload()`, whose answer the gate is never told, so no
  page is made in the moment before the reload; `app.component.spec.ts` proves
  the gate stays shut.
- **What the library does differently, and the site follows**: a save that
  failed is said in the library's words; the Languages page says what it did
  on the page, not in a toast; a refusal to save a language to the account is
  a note under the switcher; a number in a plural is written the language's
  way ("1 000"); the bundle that cannot be read is 503
  `translations_unavailable`; the family's page at an admin address speaks
  English, as the admin panel does (`effectiveLanguage` - its words come from
  the strings of the language on the page now; it spoke the reader's
  language there before). And the library's drafts ask before the tab is
  left whenever boxes wait - also signed out, on the way to the IAM's sign-in
  after a session ended, where the site's own asked nothing; the drafts
  survive the answer all the same. The site still asks before a sign-out and
  then gives the drafts up (*What is typed on the Translations and Languages
  pages survives the session ending*, above), while the library's
  Translations page says "Signing out does not ask about it" - which of the
  two stays is the owner's to say.
