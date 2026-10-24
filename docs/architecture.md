# Architecture

```
 browser (Angular)                    backend (PHP, Slim 4)                    PostgreSQL (anotoki_survey)
 ─────────────────                    ─────────────────────                    ───────────────────────────
 AnotokiAuth (@anotoki/lib/auth) ── sign-in ──▶ the anotoki IAM (OIDC code + PKCE; tokens in localStorage)
   AuthService (the survey's face of it), VisitorKey (the key, the move)
 SiteStatus ── /api/site-status ──▶ index.php: error log ▶ security headers ▶ error handler ▶ site gate
                                     ▶ people's upkeep, daily backup (after the answer) ▶ route (anotoki/lib)
 ApiService ── /api/... + Bearer, or X-Visitor-Key ──▶ the same way in
                                        ├─ Identify (anotoki/lib): the token, checked here - or, on the
                                        │  surveys' routes, a visitor's key; RecordPerson keeps users
                                        ├─ requireStaff / requireAdmin / RequireCaller: who may ask
                                        ├─ visitors.php, client_address.php: visitors, their limits, the move
                                        ├─ surveys.php, responses.php, images.php ─────────▶ surveys, responses,
                                        ├─ survey_rules.php, rich_text.php: what may be kept   images, survey_images, users
                                        ├─ people.php, admin_tools.php (anotoki/lib) ──────▶ users, anotoki_people_*,
                                        │  error log and backups: files under storage/          anotoki_audit_log
 TranslationService ── /api/translations/{code} ──▶ translations.php ─────────────────────▶ languages, translation_keys,
   (no token: the same for everybody)                                                        translations
```

One origin everywhere: on the hosting the web root holds the built app and
`api/` beside it (`.htaccess` routes `/api/*` to `api/index.php`); in
development `ng serve` on :4700 proxies `/api` and `/setup.php` to
`php -S localhost:8500 router.php`. There is no CORS, on purpose.

## Signing in, and the roles

The site has no login of its own. People sign in through the anotoki IAM, as
client `survey`, with the anotoki family's library (anotoki-lib 0.10.0, its
`Auth` module on both halves - the IAM's SDKs, which the site vendored until
then, are gone; the library holds what they did, under the same storage keys,
so nobody was signed out by the move):

- `AuthService.init()` runs before the first page (the app initializer,
  `boot()` in `shared/boot/boot.ts`), right after the start has asked where the site
  stands (`SiteStatus.check()`, *A database behind the code*, below): it reads
  `GET /api/auth/config` (the library's `AuthRoutes`: `{issuer, client_id,
  login_required, sign_in_available}` and the site's `visitor_days` - or 503
  `not_set_up`, and the family's page says so; answered while a migration is
  pending too), hands it to the library's `AnotokiAuth` (`bootConfig()`, the
  `config` of `provideSiteAuth()` in `shared/auth/auth.config.ts`) and starts
  it: a callback finished (`/auth/callback`; the address the person came from
  put back before the router reads it) or the stored session restored.
  `login_required` (the IAM's switch, below) becomes
  `AuthService.loginRequired` - true unless the backend says false - and, with
  `visitor_days` (a backend that does not say it is one from before visitors;
  the library is then told sign-in is required too), `visitorsWelcome`: the
  pages people take surveys on are open to visitors (*Visitors in the
  browser*, below). `boot()` makes `VisitorKey` before it awaits anything,
  and, back from a sign-in, makes this browser's visitor drafts the person's
  before the first page is drawn. The language and its strings come next
  (*The site's own words*, below), and the site is drawn only once both are
  there. No sign-in by the IAM's hint cookie (`hint: false` - the owner's
  decision: the automatic sign-in is genshin's and the build analyzer's): a
  visitor with an account stays a visitor until they press Sign in.
- The library's `anotokiAuthInterceptor` puts `Authorization: Bearer <access
  token>` on every `/api/` call issued for a person (not on `/api/site-status`,
  `/api/auth/config`, the pictures or `/api/translations/`), and retries once
  with a fresh token after a 401. A person's call with no token to send is
  never sent (401 `sign_in_required`, at once); a visitor's call carries the
  visitor key instead (below).
- `AuthService.signIn(returnTo, prompt)` sends the person to the IAM - the
  library says the language they read this site in (`language` of the
  configuration), so the IAM's pages open in the same one; `prompt: 'login'`
  asks for the password again (the backups' proof, *The admin tools*).
- The backend checks the token with the library (`Anotoki\Lib\Auth`: its
  `Identify` in front of each group of routes, `surveyIdentify()` in
  `api/auth.php`, and `AccessTokens`): RS256, typ `at+jwt`, the IAM's
  published keys (cached in `storage/cache/`), iss, aud `survey`, exp. `sub` is
  the person; `roles` their roles in this site; `auth_time` when they last
  signed in at the IAM. A person is recorded in `users` (id = the IAM's user
  id, the name from the token; never an address) by the library's
  `RecordPerson` (*People*, below). Only an `Authorization: Bearer` header
  claims to be somebody: one whose token does not check out - an empty one
  too - is 401 `invalid_token`, never "nobody"; any other scheme (`Basic`,
  from a host behind a password file) is not looked at.
- **Sign-in required** is the IAM's to say, per site (its admin panel:
  Applications -> survey -> "Sign-in required"). `authLoginRequired()` asks it
  through the library's `SignInRule` (`surveySignInRule()`:
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
| `ADMIN` | all of that, and delete surveys, answers and languages; see and apply the database's migrations (the Migrations page); the System pages - the people, feedback, the error log, the audit log, the backups |

The frontend hides what a role may not do (`AuthService.isStaff`, `isAdmin`);
the backend decides (`requireStaff()`, `requireAdmin()` in
`api/meddleware/auth.php` - the library's `RequireRole` in this site's
words). Every page needs somebody signed in first (the library's
`personGuard`: off to the IAM before anything of the page is drawn, and back
to the address asked for) - the admin panel (`canActivate`, once as it is
entered), the editor's preview (its own `canActivate`), and, while sign-in is
required, every page people take surveys on (`personOrVisitorGuard`,
`canActivateChild` of their layout, so each page asks again; with visitors
welcome it lets anybody through); while sign-in
is required the API answers nothing of a survey without a token - its
pictures aside, which an `<img>` loads with no token, at addresses that are
random UUIDs ([API](api.md#the-people-taking-surveys)). Only the legal pages
(*Terms, Privacy and Contact*, below: anybody's, nothing of a survey on them;
About and Support with them) and the pages drawn while the site cannot run (the family's page, the card for
a server out of reach) draw without it: while the site cannot run and the server said why
(`SiteStatus.blocked()`) the guard lets every page through and sends nobody to
the IAM - the family's page stands instead of each, with its own quiet Sign in
(*A database behind the code*, below); while it could not even ask (out of
reach as it started) it lets nothing through. A signed-in person without EDITOR or ADMIN
(MEMBER alone) gets the admin panel's own card, without its frame: "this part
is for the people who write the surveys".

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
(`surveyIdentify(..., visitors: true)` and the library's `RequireCaller`): a
Bearer header - that person or 401, the key not even read; else, while
sign-in is required, 401 `sign_in_required` for a key and for nobody alike;
else the visitor of the `X-Visitor-Key` header (401 `visitor_unknown` for a
key that is nobody's); else nobody. `RequirePerson`, `requireStaff()` and
`requireAdmin()` refuse a visitor as they refuse nobody - the admin panel, the
Migrations page, the System pages and the move are a verified token's alone.

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
  connection is a trusted proxy's - Cloudflare's published ranges unless
  `visitors.local.php` names others, never a catch-all (shorter than /8 for
  IPv4, /16 for IPv6: refused, the default holding) - and then its
  `CF-Connecting-IP` (`api/client_address.php`: the anotoki family's one rule,
  anotoki-lib 0.5.0's `ClientAddress`, the one the library's error log reads
  by too; the header pinned in code, never a setting - `X-Real-IP`,
  `True-Client-IP`, `X-Forwarded-For` pass through Cloudflare as the visitor
  sent them; IPv6 by its /64) - with the origin secret
  (`config/cloudflare.local.php`, `originSecret()`; anotoki-lib PHP 0.5.2, the
  owner's decision of 2026-10-13), only on a request that carries it in
  `X-Anotoki-Origin`, which the owner's zone adds to every request through it:
  anybody's Cloudflare Worker can connect from Cloudflare's ranges, and any
  other request from them counts as its edge. A `cloudflare.local.php` that is
  there without a usable secret fails closed - one that cannot be read
  cleanly (it does not start with `<?php`, it prints, PHP cannot parse or run
  it, or may not open it), and since 2026-10-18 one read cleanly that names
  none (blank, not an array, a misspelt key, a value that is not a string) and
  a folder in its place: a
  secret no request carries, every request from Cloudflare's ranges its edge,
  the site running all the same and the fault said once a day
  (`originSecretFile()`, `config/config.php`). Deleting the file is the one
  way to switch the secret off. An address's counter goes by a keyed HMAC of
  it (`clientAddressKept()`, under a key derived from the installation's
  `storage/anotoki-lib.key`) - a stable pseudonym of the address while that
  key lasts, not a secret (whoever holds the key can try every IPv4 address
  against it); the address in the clear is kept in no row, and so in no
  backup made since anotoki-lib 0.5.0 (one made before may hold an hour's
  counters by address, until the owner deletes it).
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
- Settings: `config/visitors.local.php`, optional, and the origin secret's
  `config/cloudflare.local.php`, optional too
  ([operations](operations.md#visitors)).

### Visitors in the browser

`AuthService.visitorsWelcome` (the site runs, `login_required` is false, the
backend said `visitor_days`) opens the pages people take surveys on to anybody
(the library's `personOrVisitorGuard`); `AuthService.taker` says who takes
them - the person signed in, else this browser's visitor (`{id: 'visitor',
visitor: true}`), else nobody - and `visiting` that it is the visitor.

- **Who a request is, decided when it is issued** (the library's `ISSUED_AS`):
  `ApiService` marks the three survey routes `issuedAs('caller')` - whoever
  the page is shown to as they are issued - and the move always the
  person's; anything unmarked is decided as it is handed over. The library's
  interceptor sends a person's call with the token or not at all - none to
  send (a refresh refused, signed out in another tab) fails the call at once
  as 401 `sign_in_required`, so a person's answers never go out as nobody's
  and never make a visitor. A visitor's call goes without a token, and to
  `/api/surveys` - only there (`visitorPrefixes`), only while sign-in is not
  required - with the key held now; the answer that made a
  visitor brings its key (`X-Visitor-Key`), which is kept; a key on a
  person's answer is ignored. A 401 `visitor_unknown` forgets the key (only
  while it is the one held) and sends once more without it; a 401
  `sign_in_required` to `/api/surveys` means the switch went on since the page
  loaded (`AuthService.noteLoginRequired()`: the pages stop welcoming visitors
  until the next load) - and keeps the key.
- **`VisitorKey`** (`shared/auth/visitor-key.ts`, the analyzer's pattern): the
  key in `localStorage` (`anotoki-survey:visitor`), read as each call leaves
  and kept in step across tabs by the `storage` event; the first key a browser
  got stays (two tabs that each sent first answers: the second key is
  dropped, its answer stays a visitor of its own); in memory for the tab when
  storage refuses. **Kept while sign-in is required** - the server refuses it
  then, and the next sign-in still moves what it answered; switching the
  requirement off again within `visitor_days` brings it back. It is the
  library's `VisitorKeyStore` (`visitors` of the configuration): the
  interceptor reads `current()`, keeps a key a first answer brings
  (`remember()`) and forgets one the server no longer knows (`forget()`). After every
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
- **A sign-in waits for the sends on their way** (the library's
  `SavesInFlight`, counted by its interceptor): a visitor's
  first answers bring the key the move needs, and a page left before their
  answer arrived would leave them out of the browser's reach.
- **The pages**: the participant layout draws its page for a visitor (never
  the editor's preview: the card stands there for anybody not signed in);
  home and the survey page show the visitor notice (`visitor.notice`, its
  days from `visitor_days`, with a Sign in button) - home above the list, the
  survey on its welcome, "answered" and "sent", never on the steps - and the
  welcome says `take.asVisitor` where a person reads whom they are signed in
  as. Their answers refused because the switch went on say
  `take.refused.signInRequired`; past the limits on new visitors,
  `take.refused.tooManyVisitors`. A sign-in that came back refused while
  visiting (`access_denied`: a person whose MEMBER was taken away) is said on
  the screen of a failed sign-in (below; `signInFailureGuard`), whose Back
  goes on as the visitor's.
- **The admin panel** shows a visitor's answers like anybody's, under the
  name the server gives them ("Visitor 12"), and says "Not signed in" under
  it (`Person.visitor`: the results' table of people, the lists a number
  opens, the drawer of their answers, the page of their answers) - a person
  has nothing under their name: the site keeps no address. The CSV has the
  name. The delete question is the same as for a person - "Visitor 12 can
  take the survey again": their browser can, while its key lives, and an
  ended visitor's browser can anyway.

**A sign-in that came back without one** (refused, cancelled, a state that
does not match), **or could not start** (the browser refuses the site the
`sessionStorage` where the sign-in in progress is kept: `storage_unavailable`),
is said by the library's screen (`<anotoki-sign-in-failure>`, on the callback
route `/auth/callback`, in the family's status page's frame): "Signing in did
not work", why - from the code alone, never the IAM's sentence, in the site's
words (`anotoki.signIn.*`: migration 012 moved the site's own sentences there,
formal Slovak and an owner's rewording with them; `FORMAL_SLOVAK` while the
database cannot be read) - Try again (the sign-in once more, back where it
started) and Back (there, without signing in; it puts the failure away). The
library's guards send the browser there instead of to the IAM - straight back,
it would go round for ever - and `signInFailureGuard`
(`shared/auth/auth.config.ts`) sends the pages its guards let through all the
same: a visitor's, and those of somebody still signed in from before (the
backups' "Sign in again" that came back without one). A Sign in button whose
sign-in could not start opens it too (`signInOrShowWhy()`). The search engines
are asked not to index it.

What is left of "signed out" is drawn by the layouts where the page would be,
with a Sign in button of their own (on a phone the top bar's is inside its
menu): a session that ended with the page open (the admin panel's "You are
signed out", with what is kept; the participant layout's "You are not signed
in", `signedOut.*`). Nothing of a survey is drawn then: the layout holds back
its `<router-outlet>`.

## People

The people who signed in are the site's `users` table, kept and read by the
anotoki family's people module (anotoki-lib 0.10.0, `Anotoki\Lib\People` over a
mapping of the table - `api/people.php`; never a table of the library's: every
answer, every survey's author and every visitor lives in `users`):

- **Recorded from the token** (the library's `RecordPerson`, on the routes that
  read or write the site's data - never the Migrations routes, the error
  log's or the backups', which work while `users` waits for an update): the
  row made on a first request, the name kept to the token's
  `preferred_username` (a token without one keeps the stored name),
  `last_seen_at` at most every five minutes. A visitor (a negative id) is
  never recorded by it: it is `api/visitors.php`'s. **No address**: the IAM
  is the only holder (the owner's decision; migration 011 dropped
  `users.email`, and nothing here reads one - the menu's address is the ID
  token's, shown, never kept).
- **Scrubbed when the IAM deletes an account** (thirty days after its owner
  asked): the library's `Scrubber` reads `GET {issuer}/api/public/anonymized-accounts`
  from where it stopped (`anotoki_people_sync`, its set `anotoki_people`) -
  after an answer at most once an hour (`PeopleUpkeep`, `api/index.php`) or
  on the People page's "Check now" - and writes the IAM's placeholder,
  `deleted-{id}`, as the name and the IAM's time as `anonymized_at` (011
  added it); everything else stays, nobody's now - their answers too. No copy
  of a name lives anywhere else here, so the scrub needs no hook. After a
  restore of a backup it runs again at once (the restored cursor would leave
  out whoever the IAM deleted since) - the library's `People::afterRestore()`
  (`People::restoreHooks()`, `surveyBackups()`): a run that does not finish
  (the IAM out of reach, its time up, another run going) is the restore's
  `after_restore_error` and an error-log line, and the hourly stamp goes after
  the answer, so the next request runs it again.
- **The People page** (`/admin/people`, the family's page, ADMIN): everybody
  who signed in, the most recently seen first, with how many surveys each
  answered and wrote (the site's columns, `peopleColumns()`), the visitors in
  one line, where the scrub stands - and Delete: every answer of a person's,
  after the page's question alone (the owner's decision: no proof of a recent
  sign-in), audited (`person.data_deleted`); their row and the surveys they
  wrote stay. The delete is one hook, `peopleDelete()`, the page's and a
  restore's: it runs inside the library's transaction (`People::delete()`,
  which writes the entry inside it too - no delete without its entry, `503
  feature_unavailable` while the audit log's table waits), begins none of its
  own and works on the connection it is given alone - in a restore that is
  the restore's, which holds every table, and the site's own (`db()`) would
  wait on it for ever (PostgreSQL ends such a restore after a minute).

## The admin tools

The error log, the audit log, feedback and the backups are the anotoki
family's (anotoki-lib 0.10.0, both halves: `Anotoki\Lib\ErrorLog`, `Audit`,
`Feedback`, `Backups` - wired in `api/admin_tools.php`, their routes in
`routes/admin.php` (feedback's form in `routes/feedback.php`); the pages
`@anotoki/lib/admin/errors`, `/audit`, `/feedback`, `/backups`, configured in
`shared/admin/admin-tools.ts`), for the site's ADMIN alone (the owner's
decision): ADMIN from the token, both sides; an EDITOR is told whose the pages
are, and the API refuses. The admin panel's System page (`/admin/system`, the
top bar's System link - each way a card that is one link, the kit's
`a[anotokiLinkCard]`) leads to them, the People page and the Migrations page.
Since anotoki-lib 0.6.0 no refusal or answer of theirs carries a failure's own
words: a backup's, a restore's or its after-work's failure is a fixed sentence
of the library's ("... The error log says why."), the failure itself in the
error log (`onError`).
No file explorer (the owner's decision: the pictures live in the database,
and are in every backup).

- **Feedback** (the owner's wish of 2026-10-18; before it, none) - the
  library's form (`@anotoki/lib/feedback/form`, its code loaded with the first
  press; set up in `shared/feedback.ts`) opened from the family's footer's
  Feedback under every page (its dialog the library's `<anotoki-feedback-dialog>`
  in the same entry point since anotoki-lib 0.8.0, loaded with the press) and
  from the Contact page, sending `POST /api/feedback` for anybody - a person, a visitor,
  nobody, whether sign-in is required or not; the admin panel's footer
  offers it only while the site runs (round the Migrations page while an
  update waits the server would refuse it, 503 `update_pending`). Who sent it is the token's alone (`Identify` in front, `RecordPerson`
  after it), the person's id and nothing else - none at all for a message
  sent "without my name"; a visitor's key is never read there. In the browser
  the form says itself whom its message is for as it is issued (anybody's, the
  library's `issuedAs('anybody')` since anotoki-lib 0.7.2): the person's while
  somebody is signed in, nobody's otherwise - a visitor's key goes to the
  surveys' routes alone -, never a person's with no token, which the family's
  interceptor never sends.
  No address is
  written into the form: a reply address is kept only when the sender types
  one (the IAM is the only holder of anybody's address). The table is the
  library's (`anotoki_feedback`, its admin set): the message, its kind and
  subject, the page as a path, the language, the browser's name, the
  account, the reply address - never where it came from; the limits are
  counted apart, a day of keyed hashes in `storage/cache/anotoki-feedback-limits.json`
  (5 an hour and 20 a day a sender, 300 a day from the visitors and as many
  from the people signed in). Spam goes 30 days after it was marked, a
  resolved message 365 days after - at a clean-up run at most once a day
  after a message comes in or the Feedback page is opened (the stamp
  `storage/cache/anotoki-feedback-prune.stamp`). The scrub of the IAM's
  deleted accounts takes the reply address and the browser out of their
  messages (`peopleForgetFeedback()`, the People's hook), as the People page's
  Delete does; a status change and a delete are audited, a delete inside its
  own transaction, so a restore deletes the message again. The Feedback page
  (`/admin/feedback`) is an ADMIN's; how many messages nobody opened yet
  stands beside the bar's System link and on the System page's card (the
  library's `FeedbackUnread`, asked as the admin panel opens and as the System
  page does - never while the site cannot run): no mail is sent for one. The
  form's words are the library's (`anotoki.feedback.*`), in this site's
  formal Slovak where they speak to the reader (migration 014,
  `FORMAL_SLOVAK`).

- **The error log** - files, `storage/logs/errors-YYYY-MM-DD.jsonl` (UTC days,
  30 kept, 64 MB in all): an exception answered 5xx, an answer of 404, 405,
  413, 415, 429 or 5xx, PHP's own warnings and fatal errors - with the route,
  who (the token's person) and an HMAC of the address bucket, never a body, a
  header, a cookie, a query string or a token; the database's words redacted.
  Outermost in the stack, so what the gate answers is seen too: a failure is
  written (the database out of reach), a state the site is in on purpose is
  not (`update_pending`, `not_set_up`, a tool's `feature_unavailable`: the
  library's `expected`, its default since anotoki-lib 0.5.0 - the family's
  rule, which the site keeps whole); an exception thrown for another comes
  with the chain of what caused it. Files: it works while the database is out of reach
  or an update waits. **The pages' own errors** come too (the owner's decision
  of 2026-10-11 for every site): the library's reporter in the browser
  (`provideAnotokiErrorReport()`, `app.config.ts` - the app's `ErrorHandler`,
  every error still to the console) posts each, scrubbed in the page (no
  stored value, token, address or query), at most five a page load, to
  `POST /api/client-errors` (`ErrorLogRoutes::client`, `routes/public.php`)
  through the app's `HttpClient`: the site's interceptors decide what it
  carries - a person's with the token, so the server counts it by account; a
  visitor's and nobody's with neither, the visitor's key going to the surveys'
  routes alone. Redacted again on the server, `source: client`; 20 an hour
  from one sender, 500 a day from the visitors and as many from the people
  signed in, each its own budget. Where a request comes from is read by the
  same settings as the visitors' limits (`surveyAdminContext()`:
  Cloudflare's ranges, `CF-Connecting-IP` - with the origin secret, only on a
  request that carries it).
- **The audit log** - the library's table `anotoki_audit_log` (its set
  `anotoki_admin`, the first to run): who did what in the admin panel - a
  survey made, opened, closed, deleted; answers deleted; the site's words
  saved, imported; a language added, changed, deleted; a person's answers
  deleted, the scrub run; backups made, downloaded, deleted, restored; the
  error log cleared; migrations applied. By the token's `sub`, named by
  `users` on the page. Written on the request's own connection, so an entry
  inside a change's transaction commits (or not) with it; while its table
  waits for an update the entries wait in `storage/logs/audit-pending.jsonl`
  and go in after the Apply.
- **The backups** - `storage/backups/<id>.anotoki-backup`: every table by
  COPY through PDO in one snapshot (the pictures' bytes too), with the
  migrations it was made at; daily after an answer (14 kept), before every
  update (5 - the Apply and `migration.php` stop when one cannot be made),
  before a restore (5), by hand (until deleted) - no maximum age: nothing
  deletes a backup for being old (the owner's decision of 2026-10-11), so a
  person the IAM deleted stays in the backups made before until they are
  deleted. Made, downloaded, deleted and
  restored only after a sign-in of the last ten minutes (the token's
  `auth_time`; refused `reauth_required`, and the page offers "Sign in again"
  - the IAM asks for the password, `prompt=login`); downloaded by a
  single-use link of a minute; listed with its maker's name (the context's
  `names`, `peopleNames()`). **Not encrypted** (the owner's decision of
  2026-10-11: only the IAM's backups are) - the files stay under `storage/`,
  which the web never reaches, each the site's own user's alone - but
  **sealed** (anotoki-lib 0.5.0): the sidecar carries an HMAC of the backup's
  id and SHA-256 under the installation's key, and only a backup made here is
  restored here - a restore hashes the very bytes it reads. One made before
  0.5.0, put into the folder or changed since is refused (`422
  archive_invalid`) and restored offline alone. One backup or update at a time
  (the migrations' lock). A backup that fails is written in the error log as
  well as PHP's (`onError`). **A restore does not bring back what a person
  had deleted on the People page**: inside its transaction, before anybody
  sees the rows, every People Delete since the backup's snapshot is done again
  (`People::replay()`, by the audit log's `person.data_deleted` - the audit
  log is never restored) with the page's own hook on the restore's
  connection; one that cannot be done again rolls the restore back whole. One
  gap stays: answers a visitor's browser moved into the account after the
  backup are the visitor's in it (`visitorMoveInto()` leaves no record a
  restore keeps), so the Delete done again does not name them and they come
  back as "Visitor N" - `docs/decisions.md`.

## The top bar

The bar is the anotoki family's, the library's `<anotoki-top-bar>`
(`@anotoki/lib/shell`, since anotoki-lib 0.3.0 - built from this site's own bar,
which the IAM, Japanese, Piano and the build analyzer had copied), on the public
site's pages alone - the surveys people take and the legal pages; the admin
panel has its frame instead (*The admin panel's frame*, below) - and
`sites/main/common/top-bar` is this site's thin wrapper around it: it tells the
bar what is this site's, worded - its brand, its sections, the person and their
role, the menu's items, how to sign in and out - and the bar does the rest (its
row, its widths, its menus and their keys). One row, in this order: the brand
(`<anotoki-brand>`: the mark, "anotoki" and the site's name, linking home -
`/`); the site's sections as links (Surveys - `SURVEY_LINKS` - marked while the
page is its own, `aria-current="page"` on its own address); then the language
chooser (when more than one language is offered), the theme, and the person's
menu - name, address and role, "Your anotoki account" (the IAM's account page,
in a new tab), "Admin panel" ("Administrátorský panel") for EDITOR / ADMIN,
Sign out - or, signed out, Sign in.

Up to 760 px (`PHONE_BAR_MAX`, the bar's `phoneMax`) it is a phone's bar: the brand is the mark and
the site's name alone, then the language, the theme and a menu
button; the links and the person's menu (or Sign in) are inside that button's
menu. From 761 px the links are in the row; up to 960 px the person's button
is the initial alone, from 961 px with the name. Both menus are the
kit's (`@anotoki/lib/ui/menu`), the family's way: the focus goes to the first item when one opens, arrow keys, Home and
End move between items, Escape closes it and gives the focus back to its
button, and so do Tab and Shift+Tab from any item (the browser's own move is
stopped: it would land on the next item of a menu about to go, and then on
`<body>`) - the next Tab moves on from the button; a click outside closes it,
and so does a
change between the phone's bar and the desktop's, another person, other
links. No key pressed in the bar reaches the page (`isolateKeys`). Signing out
is the site's one Sign out (`SignOut`, `shared/auth/sign-out.service.ts` - the
admin panel's frame takes it too): it saves first (`AdminStore.flushAll()`)
and asks when something would be lost - a survey's change that cannot be saved,
strings or languages typed and not saved - while its item waits ("Saving…", the
kit's); Sign in waits the same way for a visitor's answers on their way. Every
word of it is a key - the site's own (`topbar.surveys`, `brand.area`, ...) and
the library's (`anotoki.topbar.*`: the role, "Your anotoki account", "Admin
panel", the menus' names, Sign in, Sign out; `anotoki.theme.*`,
`anotoki.language.*`), in the reader's language. The kit's own words in the bar
come from the site's database too, through `shared/kit.ts` (*The UI kit*,
below).

## The admin panel's frame

The admin panel stands in the anotoki family's frame, `<anotoki-admin-frame>`
(`@anotoki/lib/admin/frame`, anotoki-lib 0.10.0: genshin's admin frame, for
every site - the owner's request of 2026-10-24, so that the panel is never
mistaken for the site), wired in `sites/admin/app.component.*` (`app-admin-root`,
the admin routes' frame, in the admin area's own chunk - never the first load).
No top bar. On a computer a column on the left, top to bottom: the panel's
name, "anotoki survey · admin panel" (`brand.area` and `brand.adminPanel`, the
words the bar's wordmark said it with), linking to `/admin`; who is signed in -
the name, and the token's address under it (shown, never kept); "Back to the
surveys" (`topbar.backToSurveys`), to `/`; Sign out - the site's one
(`SignOut`), so the same question over what is not saved; the theme, the
family's switch (`<anotoki-theme-toggle adminFrameTheme />` over the shell's
`ThemeService`: the account's theme, as on every page); then the panel's
pages, the kit's side navigation in one group - Surveys, Translations,
Languages (`topbar.*`, the words the bar linked them with) and System for an
ADMIN (its English word), with how many feedback messages nobody opened yet
beside it (the family's `FeedbackUnread`, asked as the panel opens and when an
ADMIN signs in here - never while the site cannot run; heard "System, 2 new
feedback messages"). A page is marked as the bar marked it (the frame's
`current`): a survey's editor in Surveys, each System page in System
(`SYSTEM_PATHS`), nothing on an address none of them is. While a database
update waits an ADMIN's column holds Migrations alone - the one page that works
then (`SiteStatus`) - and every page again once it is applied. On the right the
page, in the measure the panel's pages always had (84rem), and the family's
footer under it, in the frame's footer (no Feedback while an update waits: the
server would refuse it). Nothing stands above the page: while an update waits
the family's page stands instead, but for the ADMIN on the Migrations page.

Up to 860 px (the frame's own measure) it is a phone's frame: a row with the
panel's name and Menu, the page in the window under it; Menu opens the side
navigation's drawer, which holds the person, Back, Sign out, the theme and the
pages. Its words are the kit's - "Skip to content", "Menu", "Sign out",
"Saving…", "Theme", "Admin panel" - read through `forKit()` in the admin
panel's English, whatever the reader chose on the site. The two cards - signed
out, and no role here - stand alone, without the frame (as genshin's page that
tells somebody the panel is not theirs), with their own Sign in or the way to
the surveys, and the footer under them. The name the bar gave the admin
panel's home link (`topbar.homeAdmin`) went with the bar's admin area:
migration 018.

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
picture and the strip of pictures (`src/app/shared/ui/`, and each half's
own: `sites/main/common/`, `sites/admin/shared/`), the layouts' states, and
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
  migration set writes them; *The site's own words*, below). `shared/kit.ts`
  gives the kit `TranslationService.forKit()`: the language on the page
  (English in the admin panel) and a `lookup` that reads the database's
  string of `anotoki.<word>` - so an administrator's rewording on the
  Translations page shows, and every word the site said before the library
  still does (migration 010 moved the site's strings under those keys) - and,
  while the database cannot be read, this site's formal Slovak
  (`FORMAL_SLOVAK`, `shared/translations.ts`) - never the kit's ty.
- **The icons** the site's templates name beyond the kit's own are
  registered in `shared/kit.ts` (`SURVEY_ICONS`, from `@anotoki/lib/ui/icons`):
  an icon nobody registered draws nothing.
- **The theme** is the kit's `ThemeService` (*The account's preferences*,
  below), told the site's storage key and the account.
- **0.6.0's pieces** where the site drew its own: the home page's surveys and
  the System page's ways are the kit's link cards (`a[anotokiLinkCard]`, the
  layout inside each card the page's), the results' filters its removable
  chips (`<anotoki-chip-list>`: each remove button named with the question,
  cut short, and the answer; the focus to the next chip, and to the results'
  tab when the last goes). The survey's segmented progress on its night sky,
  the editor's toolbar (TipTap) and language tabs, the pagers, the picture row
  and the closing day's date field stay its own ([decisions](decisions.md)
  says why).

## Terms, Privacy and Contact

The anotoki family's legal pages (anotoki-lib 0.6.0, `@anotoki/lib/legal/pages`;
the owner's decisions of 2026-10-13): their structure and the family's words
(`anotoki.legal.*`, written by the library's `anotoki_translations/005`, its
Slovak addressing nobody - so it reads well beside this site's formal Slovak)
are the library's, the facts this site's.

- **Anybody's.** `/terms`, `/privacy` and `/contact` (sites/main/main.routes.ts) have no
  guard: what the site keeps is said before anybody signs in. Each is a path
  of its own whose parent is the frame (`sites/main/legal-layout`: the skip link,
  the bar - Sign in for nobody -, the column of the survey's pages, one
  stylesheet with them, `styles/_participant-frame.scss`); one parent with an
  empty path took `/` for itself (`app.routes.spec.ts`). Nothing of a survey
  is on them or asked of the API; while the site cannot run, the family's page
  stands instead, as of every page. The three are reserved addresses
  (`RESERVED_SLUGS` ↔ `SURVEY_RESERVED_SLUGS`).
- **About and Support** (anotoki-lib 0.8.0, `@anotoki/lib/legal/about`,
  `/support`): `/about` and `/support`, the same on every anotoki site, are
  anybody's in the same frame and the same way - reserved addresses too; the
  tab's title is the page's heading, the library's `anotoki.about.title` /
  `anotoki.support.title`. Their words are the library's (`anotoki.about.*`,
  `anotoki.support.*`, its translations `013`), none of the site's facts.
- **The facts** (`shared/legal/legal-facts.ts`, given by the frame - out of the
  first load): the site's name; what it is; three parts of its own - the
  record of a person (the account's id and name, first and last seen), their
  answers (seen with their name by the editors and administrators, deleted
  only by an administrator), who wrote which survey, picture and string -;
  the visitors (the key's days from `/api/auth/config`'s `visitor_days`, a
  plural); the library's error log (30 days) and audit log in this site's
  words (editors' and administrators' changes, never an address); plain
  backups kept by count (14 daily, 5 before an update, 5 before a restore);
  every cookie and stored item by its name, from the code's own constants;
  the family's Umami (`index.html`); the hosting company (WebSupport s.r.o.,
  named by the owner on 2026-10-18) and Cloudflare. Their words are `legal.*` (migration 013, English and formal
  Slovak); `SURVEY_LEGAL_UPDATED` is the day they last changed. A change to
  what the site keeps changes them.
- **Every address is the code's**: the anotoki account's Privacy page and
  account page from the IAM's address the site signs in with
  (`AnotokiAuth.issuer()` + `/privacy`, `accountUrl()`), the operator,
  the authority and Cloudflare from the library - never a string, which an
  administrator may reword (`shared/legal/legal-facts.spec.ts` holds it, and
  the backend's test that no `legal.*` string holds an address).
- **Words and language**: the root configuration (`shared/legal/legal.config.ts`,
  `provideAnotokiLegal()` in `app.config.ts`) gives the language on the page
  and the database's string of each library key (`libraryWord()`): an owner's
  rewording on the Translations page shows. Contact opens the feedback form
  first (*The admin tools*, above), then gives the family's address for
  everything else, and the IAM's account page to delete the account; Privacy
  lists the feedback - what it keeps and what for in the library's words, how
  long in the site's (`legal.feedback.kept`, migration 015).
- **Their links** are in the family's footer under every page (*The footer*,
  below): About · Support · Terms · Privacy · Contact (`<anotoki-legal-links>`,
  the paths and words of `provideAnotokiLegal()`), the open page marked.

## The footer

The anotoki family's footer (`<anotoki-site-footer>`, anotoki-lib 0.6.3's
`@anotoki/lib/footer`; the owner's choice of 2026-10-18 - the build analyzer's
footer, its order, its words and its top border, on every site and in every
admin panel), at the foot of each of the site's frames: the survey's pages
(`sites/main/participant-layout` - under the card of a session that ended too),
the legal pages (`sites/main/legal-layout`) and the admin panel
(`sites/admin/app.component`: in the frame's footer, and under its cards too). The site's own footer
(`layouts/site-footer`, the legal links alone) went for it; it had no words of
its own, so no key went with it. A top border; then one row:

- **v1.0.0** (a screen reader hears "Version 1.0.0", the library's
  `anotoki.footer.version`) - `Changelog.current()`, the newest entry of
  `public/changelog.json` (*What's new and the version*, below), asked for as
  the site starts (`boot()`, never waited for): there when the first page is
  drawn;
- **What's new** - the survey's own dialog: the footer says it was pressed
  (`(whatsNew)`), the frame opens `Changelog.open()`. Neither it nor the
  version while the list cannot be had;
- **Feedback** - the family's form in the kit's dialog, opened by the footer
  itself (its code with the press, `<anotoki-feedback-dialog>` of
  `@anotoki/lib/feedback/form` since anotoki-lib 0.8.0), set up by
  the site's `provideAnotokiFeedback()` (`shared/feedback.ts`): anybody's here,
  so under every frame for anybody, the message marked whom it is for by
  the form itself (anotoki-lib 0.7.2); in the admin panel only while the site runs
  (round the Migrations page while an update waits the server would refuse it);

then About · Support · Terms · Privacy · Contact; no fan clause (the survey is no fan site). Its
words are the library's (`anotoki.footer.*`, the library's translations `012`;
`anotoki.legalLinks.*`), read by the footer itself through the kit's lookup -
the database's string first, an owner's rewording - in the language on the
page, English in the admin panel; their Slovak addresses nobody, so it fits
the survey's formal Slovak with nothing taken over. Never round the family's
page shown while the site cannot run: the frames are routed, inside the gate's
pages (*A database behind the code*, below). About 16 kB raw (4.5 kB sent) of the first
load, with the changelog's service.

## What's new and the version

The owner's wish of 2026-10-18 (before it, no changelog): `frontend/public/changelog.json`
lists the survey's versions, newest first, in the other anotoki sites' shape -
`{version, date, changes: {added?, fixed?, updated?}}`, each sentence about
something people notice - with each version's formal-Slovak translation
beside it (`translations.sk`). `Changelog` (`shared/changelog/changelog.service.ts`)
asks for it once a page load, as the site starts (`boot()`, beside everything
else and never waited for; never the API: the file is shipped beside
`index.html`); the newest entry is the site's version (`current()`), which the
family's footer shows - one source, `frontend/package.json`'s held to it by a
spec. What's new (`Changelog.open()`) is the kit's dialog
(`shared/ui/changelog-dialog`, loaded with the first press): every version, newest
first, its day in the account's date order, its lists under the site's words
(`whatsNew.*`, migration 015) - in the reader's language where the version's
translation is whole (`changesIn()`), in English otherwise, marked
`lang="en"`. It opens only when asked - the family's footer's What's new, in
each frame - and never by itself, so the browser keeps nothing of it. A list
that cannot be had (a broken upload) leaves no version and no What's new.

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
  account's theme and how to save it in `shared/kit.ts`; the switch in the top bar):
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
  (`shared/admin/admin-dates.service.ts`, the English `shared/util/dates.ts` with
  the account's choices) - both in the account's order when it has chosen one
  (`shared/util/date-patterns.ts`), the admin panel's times on its clock too
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
translations}`, each step `{id, title, text, images, questions}` - its own
text and the pictures under it, above its questions or alone: migration `016`
gave every step kept before it none of either, and `surveyContent()` reads a
step kept without them since as having neither); what the database
must look things up by - the address (`slug`), the title, the status, the
closing day, the times - are columns beside it. The frontend's
`shared/survey/survey.model.ts` is the shape the API sends and takes
([api](api.md#the-survey-document)).

| Table | Holds |
| --- | --- |
| `users` | who has signed in: the IAM's user id and name - no address (011) - and the visitors: a negative id, no name, `visitor_key_hash` (the SHA-256 of their key; cleared when the visitor ends, the row and its answers kept) |
| `visitor_counters` | the limits on new visitors: a count per name (`visitors:new`, `visitors:new:<keyed HMAC of the address>` - a pseudonym, never the address in the clear) and when it starts again |
| `surveys` | the surveys; `revision` counts the saves; a partial unique index keeps one live (not draft) survey per address |
| `responses` | one filled survey per person and survey (unique); gender and age as columns (checked lists - the gender's holds `non-binary` too, which answers sent before 2026-10-20 may say: a new one cannot), the answers as JSONB by question id; `language`: the language the survey was read in, or null |
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
(`surveySiteState()`): **not set up** (the settings missing, not saying what
they must, or not read cleanly - every address but
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

Every `config/*.local.php` - the database's and the IAM's, which `setup.php`
writes, and the visitors' and Cloudflare's, written by hand - is read the one
careful way (`settingsFileReadCleanly()` in `config/config.php`, the IAM's
rule; [decisions](decisions.md), 2026-10-18). One that does not start with
`<?php` - a byte-order mark, a blank line or a space before it, or no `<?php`
line at all, which would print the whole file, the password with it - is
passed over before PHP ever compiles it: its first five bytes are read alone.
(Compiled, one with `declare(strict_types=1)` after such a start is a fatal
error no handler catches - every request, the site's status included, a 500
instead of "not set up", and Cloudflare's file never failing closed: Japanese
Academy's review of 2026-10-18.) One that does start so is required in a
closure of its own under an output buffer, so whatever it prints all the same
- text after a closing tag, an echo, a buffer of its own left open - is caught
and never sent, and the file is passed over, as is one PHP cannot parse, run
or open. What passing over means is the caller's: the database's or the IAM's
file leaves the site not set up (the setup page on this computer naming the
file and its fault - never a 500, never its text), the visitors' file the
defaults, Cloudflare's a secret no request carries (*Visitors*, above). Each
fault is said in PHP's error log at most once a day (`settingsSaid()`, a
stamp in `storage/cache`) by its kind and line, that it does not start with
`<?php`, or the bytes the file printed - never its text, nor what PHP said of
it.

In the browser (`@anotoki/lib/migrations`, wired in `shared/migrations.ts`) the
start asks first (`SiteStatus.check()` in `boot()`), and `siteStatusInterceptor`
hears any later answer that says the site cannot run. Nothing in the start stops
on it: the sign-in's settings and the strings answer while an update waits.
While the site cannot run the sign-in guard sends nobody to the IAM and lets
every page through; `<anotoki-site-gate>` around the router outlet draws the
family's page instead (`app.component.html` gives it the outlet as the
template marked `<ng-template anotokiSitePages>`, which the gate makes only
while it shows the pages - anotoki-lib 0.2.0; an outlet given as it is would
be made anyway and put the page in place out of sight, where it would run, and
an unmarked template is not the pages at all) - standing alone, with no top bar
and no footer, which live in the routed frames the gate does not make - the
admin panel's too (the owner's wish of 2026-10-18; `app.component.spec.ts`
draws the three real frames and counts them; the ADMIN on the Migrations page
while an update waits has the site's pages, so the admin panel's frame round
them, its footer offering no Feedback then): to somebody taking surveys,
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
(`<anotoki-migrations-page>`, in the admin panel's frame, with only Migrations in
its column) lists Pending (by set: the site's own, `survey`, then the library's,
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
in the same words: in the frontend (`shared/survey/answer-rules.ts`,
`survey-problems.ts`, `localize.ts`), so people are told at once, and in the
backend (`api/survey_rules.php`), because the browser is not the only thing
that can send a request. Change one, change the other - and the tests on both
sides (`frontend/.../answer-rules.spec.ts`, `survey-problems.spec.ts`,
`localize.spec.ts`, `backend/tests/unit/rules.test.php`).

In the frontend a rule ("choose up to 3") and a problem ("please choose an
answer") are a kind and its numbers (`{kind: 'upTo', params: {max: 3}}`), not a
sentence, because the page a person answers on says them in that person's
language (`shared/i18n/answer-words.ts`). The English sentences are
`choiceRuleText()` and `answerProblemText()` beside them: the admin panel quotes
those, and they are what keeps the pair - `answerProblemText(answerProblem(...))`
says what PHP's `answerProblem()` says for the same case. The server's
sentences stay English and are never shown to somebody taking a survey.

- **An answer**: only options the question still has; one for a single choice,
  within the question's limits (and the options there are) for several;
  "Other" needs its words; text within the question's limit and never more than
  10 000 characters (1 000 for "Other"). Kept as `cleanAnswer` keeps it.
- **Opening**: a title, a valid address nobody else has, at least one question,
  no empty step (a step needs a question, a text or a picture - one of text
  and pictures alone is a step people read and leave with Next), every
  question with text, choices with two options at least,
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
- **Rich text** (question texts, a step's own text, welcome, thanks): the
  server keeps only what
  the editor makes - `p br strong b em i u s mark a ul ol li h2 h3`, a link's
  address (http, https, mailto; always a new tab), a list's start - and drops
  or unwraps the rest (`api/rich_text.php`), the same for all four. The
  editor's own HTML comes back byte for byte. The frontend shows it with
  `[innerHTML]` (Angular sanitizes once more; nothing bypasses it) - a step's
  text exactly as a question's.

## Saving in the editor

`AdminStore` (`frontend/src/app/shared/admin/admin-store.service.ts`) holds the
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
  (`mergeTranslations(base, mine, theirs, saved)` in `shared/survey/localize.ts`,
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

- The editor prepares a file in the browser (`sites/admin/shared/images/prepare-image.ts`):
  PNG, JPEG, WebP, GIF or AVIF up to 15 MB in; no side longer than 1600 px,
  saved as WebP (PNG or JPEG where the browser cannot); a GIF as it is (up to
  10 MB), an AVIF always re-encoded. `ImageUploader` sends the bytes to
  `POST /api/admin/images`.
- The server checks what the file *is* (`getimagesizefromstring`), never what
  the request calls it - no SVG, ever - keeps the bytes in `images`, and answers
  with the picture's id, size and address, `/api/images/{id}.{ext}`.
- A survey holds `{id, alt, width, height, src}` per picture - under a step's
  own text, under a question's, on an option; on every save the
  server fills in the size and address from the file itself and refuses a
  picture it does not have, and records every picture the survey shows
  (`survey_images`) - a step's as a question's.
- People see the pictures under a question's or a step's text in one gallery
  (`sites/main/common/image-gallery`: one whole, two or three side by side, each opening
  large with arrows through the others); the editor adds them with the same
  row (`image-list-editor`: a file, a drop, a paste into the text).
- Served with `Cache-Control: public, max-age=31536000, immutable` (the address
  never changes: a picture never changes), `nosniff`, and a CSP with `sandbox`.
- A picture no survey shows any more is deleted after its next survey save or
  delete - once it is a day old (an upload may be on its way into a save). A
  step or a question removed takes its pictures that way, unless something
  else still shows them.

## A step's own text, and a step of text alone

A step may say something of its own above its questions - rich text, as a
question's, and pictures under it, as under a question's text - or be only
that: a step with text or pictures needs no question (the owner's request of
2026-10-20, for usability tests: a step says the task, the person does it and
presses Next, the step after it asks about it; [decisions](decisions.md)).

- **The editor**: "Add a text step" beside "Add a step" makes a step with no
  question, its text ready to be written; "Text and pictures" in a step's row
  of things to add gives a step of questions its own text above them. Its
  text and pictures stand above its questions as a card of their own - the
  editor's rich text field (`app-rich-text-editor`, no headings, as a
  question's) and the row of pictures (`app-image-list-editor` for a step:
  a file, a drop, a paste into the text); a step with neither shows none until
  asked. A step with nothing at all is a problem ("Step 3 is empty - …"); the
  outline says "Text only - no questions" under a step of text alone. Removing
  a step asks first when it has a question, a text or a picture, and says
  which go with it. On a translation's tab the step's text and its pictures'
  descriptions are pairs like a question's (`stepText`, `stepImage` places),
  counted on the tab, the outline's step and "Next missing".
- **People** (`take-survey`): the step's title, its text (`[innerHTML]` with
  the class `rich`, as a question's text) and its pictures (`sites/main/common/image-gallery`,
  the question's own), then its questions if it has any; Next and Back as
  ever - a step of text alone has nothing to check. It counts as a step in the
  welcome's "N questions in M steps", the hero's progress and a draft (which
  keeps the step it got to, so carrying on lands there and goes on).
- **The results**: a step of text alone has no answers - the summary leaves it
  out (the others keep the numbers people saw them under) and the CSV, being
  by question, has nothing of it; a person's whole survey shows it as a line,
  its number and title and "Text only - nothing to answer", between the steps
  they answered.

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
kit's words, the language switcher's - configured in `shared/translations.ts`,
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

**The start** (`boot()` in `shared/boot/boot.ts`, the app initializer): the theme
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

The library's `TranslationService.init()` (as `shared/translations.ts` configures
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
  otherwise (`shared/boot/kept-word.ts`); the family's page reads the library's keys
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
  `shared/i18n/dynamic-keys.ts`, through a table with a fallback key - never from
  an address, the IAM's answer or what a person typed. A failed request is
  worded from its code (`error-text.ts`), never with the server's sentence.
- Dates and "5 minutes ago" go through `Intl` in the language on the page
  (`localDate`); `shared/util/dates.ts` keeps the English ones for the admin panel
  (through `AdminDates`). Both take the order - and the admin panel the clock -
  the person's anotoki account has chosen, when it has (*The account's
  preferences*, above).

**The admin panel is English whatever the person reads.** `effectiveLanguage`
is `en` while the address is `/admin` or under it (the library's
`englishOnly`, the site's prefix), and everything that words a
string goes through it - so the pieces both areas share (the UI kit - the
admin panel's frame's words among it -, toasts) are English there, and `<html lang>` says `en`. The service cannot
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
surveys, when more than one language is on offer - `shared/kit.ts` gives it the
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
point, routed in `sites/admin/admin.routes.ts`; for EDITOR and ADMIN,
`admin.allows` in `shared/translations.ts`): *Translations*
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
  page); so a navigation away and Back work in that state. The drafts stay,
  and are mirrored to the tab's sessionStorage
  (`anotoki-survey:localization-drafts`, `{owner, strings, languages}` - the
  name and the shape the site always had), because signing in again is a page
  load. Whose they are is the account's id (`account.userKey`): only another
  person signing in lets go of them. "Sign out" - the site's one (`SignOut`), the
  top bar's and the admin panel's frame's - asks first (one question, with a survey's unsaved changes when there are
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
  welcome, the thanks, each step's title, its own text and the descriptions of
  the pictures under it, each question's text, hint, option
  labels and the descriptions of the pictures under its text. Nothing else is
  translated: ids, structure, pictures and limits are the survey's own, and an
  answer is the id of an option, not its words.
- **The functions** are pure, in `shared/survey/localize.ts`, and written again
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
  re-worded in place (its ids and option keys do not change). Its gender
  question offers Male, Female and Prefer not to say (the owner's decision of
  2026-10-20; "Non-binary" before): only those have strings
  (`aboutYou.gender.*`, migration 017 deleted the fourth), a draft that chose
  "Non-binary" asks again, and the admin panel shows an answer kept with it
  under its English label (`ALL_GENDERS`, `shared/survey/about-you.ts`).
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
  which, and `duplicateQuestion()` / `copySurvey()` re-key the translated texts
  - a step's own text and its pictures' descriptions with the step.
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
