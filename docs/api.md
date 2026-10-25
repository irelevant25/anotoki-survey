# The API

Every route is under `/api/`, answers JSON, and refuses in one shape:
`{"error": "a sentence", "code": "a_code", ...}` with more fields where the code
needs them. Bodies are JSON (`Content-Type: application/json`, anything else is
415) except a picture's bytes. Signed-in routes take the IAM's access token as
`Authorization: Bearer ...` - never from the address. Only the Bearer scheme
claims to be somebody: a Bearer header whose token does not check out - an
empty one too - is 401 `invalid_token`, whatever else the request carries;
another scheme (`Basic ...`, which a host behind a password file sends with
every request) is not looked at, and the request is nobody's (401
`sign_in_required` where a person is needed). The one other identity is a
**visitor's key** (`X-Visitor-Key`, below): it makes somebody a visitor only
on the surveys' own routes and only while the IAM says sign-in is not
required; the one other route that reads it, `POST /api/visitor/move`, needs a
person's token as well and only hands the key in. The frontend's
side is `frontend/src/app/api/api.service.ts`.

### While the site cannot run

The anotoki family's site gate (the library anotoki-lib, `Anotoki\Lib\Migrations\Http\SiteGate`;
`api/migrations.php`) stands in front of every route and decides, for each
request, where the site stands - the same answers on every anotoki site, in
the library's shape (`{code, message, ...}`, not this API's `error`):

| State | When | Every address answers |
| --- | --- | --- |
| `not_set_up` | `config/database.local.php` or `iam.local.php` missing, incomplete or not read cleanly (nothing of it is ever printed) | 503 `{code: "not_set_up", installed, message}` - with `setup: "/setup.php"` only while the site was never installed (`storage/installed.lock`, which `setup.php` writes when it finishes on a real host) |
| `update_pending` | a migration file waits to be applied | 503 `{code: "update_pending", message: "The site is being updated. Try again in a few minutes."}` and `Retry-After: 60` - but `GET /api/auth/config`, `GET /api/translations/{code}` (one segment after it: the library's `TranslationsRoutes::openPath()`), `GET /api/health` and the Migrations page's three routes (`/api/admin/migrations`, `/file` and `/apply`, ADMIN, below) answer as ever, and so do the error log's and the backups' (`/api/admin/errors`, `/errors/{12 hex}`; `/api/admin/backups`, `/proof`, `/{id}`, `/{id}/ticket`, `/file`, `/preview` - the library's `openPaths()`; ADMIN, below; a restore stays closed) (`siteOpenWhileUpdating()`). Those addresses exactly, read as the routes read them (unescaped, dot segments as written): any other under them is closed too |
| `maintenance` | the site's ADMIN closed it (the site settings' Getting in, below) - a ready site underneath | 503 `{code: "maintenance", message: "The site is closed for maintenance. Try again later.", maintenance_message: {en?, sk?, ...}}` (the administrators' own words, a language each; `{}` when they wrote none) and `Retry-After: 300` - to everybody but the site's ADMIN, known by a verified token alone (`surveyTokenPerson()`: a forged, expired or another site's token is nobody's), who uses the site as it is. The addresses open while an update waits (above) answer as ever, and so do the site settings' reserved paths, each with everything under it: the status, the bundles, `/api/site-settings`, `/api/admin/site-settings`, `/api/auth/config` - an administrator signs in with it - and `/api/images` (an `<img>` carries no token). The surveys' own routes are not among them: an answer being written stays in the browser's draft and goes once the site takes it |
| `unavailable` | the settings are there, the database cannot be reached | the route's own answer (503 `database_unavailable` where it needs the database) |
| `ready` | otherwise | the route's own answer |

`GET /api/site-status` answers in every state. Every 503 of the gate carries
`Cache-Control: no-store`. The frontend's side is the library's too
(`@anotoki/lib/migrations`: `SiteStatus`, `siteStatusInterceptor`,
`<anotoki-site-gate>`; `frontend/src/app/shared/migrations.ts`).

### Page access

A row of the site settings' Page access (the admin panel's Site settings
page, below) may switch the list of open surveys (`/`) or a survey (`/{slug}`)
off, or keep it for people signed in, for editors or for administrators;
where the row names API paths, those answer 423 `page_locked` ("That part of
the site is not available.", in this API's error body) to everybody the page
is not shown to - the anotoki library's `PageAccessGate`, right inside the
`Identify` of each group whose data a page holds (`routes/surveys.php`,
`visitor.php`, `feedback.php`, and the editors' groups of `admin.php` after
their roles' check) - but never to the site's ADMIN, and never on a reserved
path (the maintenance row above). A visitor is nobody here: a row for people
signed in refuses them.

## Anybody

| Route | Answers |
| --- | --- |
| `GET /api/health` | `{ok}` - and, asked from this computer, `problem`, `database`, `pending` (the migration files not applied). While the settings are missing the gate answers it (503 `not_set_up`, above), so `ok` is true and `problem` null whenever this route itself answers |
| `GET /api/site-status` | `{state, installed}`: where the site stands - `ready`, `not_set_up`, `update_pending`, `unavailable` or `maintenance` (a ready site its ADMIN closed, with `maintenance_message`: the administrators' words, a language each) - and whether its installer finished on a real host. Answered in every state and to anybody - nothing it carries is read (a token, good or not, a visitor's key), whatever the IAM says of signing in: the pages ask it before anybody can sign in. It says nothing else |
| `GET /api/auth/config` | `{issuer, client_id, login_required, sign_in_available, visitor_days}` - the anotoki library's `AuthRoutes` (its wire format, snake_case; the camelCase this site answered before, `clientId`, `loginRequired`, `visitorDays`, the library's browser half reads too): how the browser signs in, and whether it must - `login_required` is the IAM's "Sign-in required" switch for this site (below); `sign_in_available`, whether the IAM knows the site; `visitor_days`, this site's own: how many days a visitor's browser is remembered after its last visit (`keep_days`, `config/visitors.local.php`). No token is read. Answered while a migration is pending too: the site's ADMIN signs in to apply it |
| `GET /api/images/{id}.{ext}` | a picture: its bytes, cached for a year; `If-None-Match` → 304; 404 when there is none |
| `GET /api/site-settings` | what every page is told of the site settings - the anotoki library's `SiteSettingsRoutes::public` (`api/site_settings.php`): `{maintenance, announcement, pages}` - `maintenance` whether the site is closed (for the line its ADMIN reads above each page; the gate reads the status, never this), `announcement` `{level: "info" \| "warning" \| "danger", message: {en?, sk?, ...}}` or null, `pages` `[{path, visibility: "PUBLIC" \| "USER" \| "EDITOR" \| "ADMIN", blocked}]`: every page a row governs, never its API paths. Nothing a request carries is read; answered while the site is closed too |
| `GET /robots.txt`, `GET /sitemap.xml` | not under `/api/`, but the site's PHP all the same (the anotoki library's `RobotsRoutes`, `routes/public.php`; `router.php` and the release's `.htaccess` send them to the front controller): `robots.txt` (`text/plain`) - `User-agent: *`, `Disallow:` `/admin`, `/api`, `/auth`, `/preview`, `/staff`, and `Sitemap:` the sitemap's address; `sitemap.xml` (`application/xml`) - Terms, Privacy, Contact, About and Support always, and while the IAM says sign-in is not required the list of open surveys (`/`) and each survey taking answers (`/{slug}`, its `lastmod` the survey's last save) - never a draft, a closed survey or one past its last day, nor a page Page access keeps from somebody signed out. Both by the site's configured address (`siteAddress()`: `config/site.local.php`, else `https://survey.anotoki.eu` in a release and `http://localhost:4700` here), never a request's `Host`; `Cache-Control: public, max-age=3600`; made afresh each time |
| `GET /api/translations/{code}` | the site's own words in a language: `{language, languages, values, english?}`; `If-None-Match` → 304; 404 `not_found` for a code that is not one; 503 `translations_unavailable` (`Retry-After: 60`) while the tables are not there or the database cannot be asked - the pages then read what they have |
| `POST /api/client-errors` | a page's own error into the site's error log - the anotoki library's `ErrorLogRoutes::client`, sent by its browser reporter (`@anotoki/lib/error-report`, at most five a page load): `{type?, message, page?, stack?, status?}` → 204, nothing in the body. JSON only (415), 8 KB at most (413), a message (422 `message_required`); 20 an hour from one sender - a person signed in by their account (a `Bearer` token, checked as everywhere; one that does not check out makes the report nobody's, never a refusal), anybody else by an HMAC of their address bucket - and 500 a day from the visitors, as many apart from the people signed in (429 `too_many`, `retry_after` and `Retry-After`). Every text redacted again on the server (no token, address, `password=`-like secret, query string); written `source: client`, with the page's path alone. A visitor's key is never read here. 503 `update_pending` while a migration waits, as every route `siteOpenWhileUpdating()` does not name |
| `POST /api/feedback` | a message through the feedback form - the anotoki library's `FeedbackRoutes::public` (`routes/feedback.php`), sent by its form (`@anotoki/lib/feedback/form`): `{kind: "bug" \| "idea" \| "other", subject?, message, email?, page?, language?, anonymous?, website}` → 201 `{ok: true}`, no id. Anybody's - a person, a visitor, nobody - whether the IAM requires signing in here or not. Who sent it is the token's alone: the library's `Identify` in front (a `Bearer` token that does not check out is 401 `invalid_token`; another scheme, or none, is nobody; a visitor's key is never read), the person's id kept (their row too: `RecordPerson`) unless `anonymous` (then no id and no address); the reply address only the `email` the form sent. Kept with it: the page as a path (never its query or fragment), the language, the browser's name - nothing of where it came from. 422 `kind_unknown`, `message_required`, `too_long` (+ `field`, `max`: 10 000 characters), `subject_too_long` (200), `email_invalid` (an address a mail link would read as more: `? & = % #`, a space); 415 not JSON, 413 over 64 KB, 400 `invalid_json`; 429 `too_many` (`retry_after`) past 5 an hour or 20 a day from one sender - a person by their account, anybody else (and a message "without my name") by an HMAC of their address bucket - or past 300 a day from the visitors together, and as many from the people signed in. The robots' field `website` filled: the same 201, nothing kept. No mail is sent. 503 `update_pending` while a migration waits |

### Sign-in required: the IAM's switch, relayed

The IAM says, per site, whether signing in is required (its admin panel:
Applications -> survey -> "Sign-in required"). The backend asks it -
`GET {issuer}/api/public/applications/survey`, through the anotoki library's
`SignInRule` (`surveySignInRule()`, `authLoginRequired()` in `api/auth.php`) - and
`/api/auth/config` relays the answer as `login_required`, so the browser never
asks the IAM. The answer is kept a minute in `cache_dir`; it **fails closed**:
`login_required` is `true` unless the IAM said `false` - an application the IAM
does not know (404), an IAM never reached, or an answer that is not about this
site all read as `true`; an IAM out of reach after it has answered keeps its
last answer (asked again a minute later).

While it says `false`, the API takes **visitors** - people taking surveys
without signing in (*The people taking surveys*, below), and so do the pages
they take surveys on (the browser's half: [architecture](architecture.md#visitors-in-the-browser)).
The admin panel and the editor's preview sign in first whatever it says.

### The site's words: the bundle

What every page starts with (the library's `TranslationService`), the same for
everybody - no token is looked at, not even a bad one. The route, and every
route of the site's words below, is the anotoki family's (since anotoki-lib 0.3.0,
`Anotoki\Lib\Translations\Http\TranslationsRoutes`, wired in
`routes/public.php` and `routes/admin.php`): one wire format for every anotoki
site, the IAM's - snake_case, the bundle the IAM's byte for byte - in this
site's error body (`{error, code, ...}`, `respondRefusal()`):

- `values`: the flat `{key: text}` map of the language asked for, **with
  English merged underneath** - a key that has no string in it comes in
  English. The library's own words are among them, under `anotoki.` (the
  kit's, the status page's);
- `languages`: the ones on offer, `[{code, name, native_name}]`, in their order
  (`sort_order`, then name). There is no other public list of languages;
- `english`: English's own map, **left out when `language` is `en`** - the
  admin panel reads English whatever the person reads, without a second request;
- `language`: the language that answered. A code shaped like one (`sk`,
  `pt-br`: two small letters, or two and two) is answered by itself when it is
  on offer. **A code with a region that is not offered itself is answered by
  its language when that one is**: `/api/translations/sk-sk` - a Slovak
  browser's first wish - is the Slovak bundle, `"language": "sk"`, byte for
  byte what `/api/translations/sk` answers (the same `ETag`), so a first visit
  is one request. An offered `pt-br` is itself. Everything else the site does
  not have, or has switched off, is answered in English, and this says `en`.
  What is not shaped like a code (`sk-SK`, `slovak`) is 404 before any query.

`values` and `english` are objects even when empty. The answer goes out with
`ETag` (of the body) and `Cache-Control: no-cache`, and so does the 304.
`If-None-Match` is compared the weak way (a list of tags, `W/`, `*`) - and as
a server that compresses the answer sends the tag back: `-gzip`, `-br` or
`-zstd` inside the closing quote (`"<tag>-gzip"`, which Apache's mod_deflate
and mod_brotli make of it) is the tag itself. Without that the 304 would never
be answered behind such a server.

## The people taking surveys

Who is asking is the anotoki library's to say - its `Identify` with this
site's visitors (`surveyIdentify(..., visitors: true)`, `api/auth.php`), then
its `RequireCaller` - in this order:

1. **a Bearer header**: that person, or 401 `invalid_token` - a bad token
   never falls back to a visitor key, which is not even read;
2. else, **while the IAM says sign-in is required** (`login_required`, above):
   401 `sign_in_required` - for nobody and for a visitor key alike; the key is
   never looked up, and its visitor is not "seen";
3. else **`X-Visitor-Key`**: that visitor (a key that is nobody's, or not a
   key: 401 `visitor_unknown`);
4. else **nobody**: may read the open surveys (`answeredAt` always null) and
   send answers - which makes a visitor.

So with sign-in required - the default, and what the IAM is taken to say when
it cannot be asked - nothing of a survey, not even the list, reaches anybody
who is not signed in. The one exception is a survey's pictures
(`GET /api/images/{id}.{ext}`, above): an `<img>` cannot send the Bearer
token, so they are served to anybody who has the address, and the addresses
are random UUIDs, which nobody can guess or list. Each answer says whether
this person - or visitor - has answered the survey; a survey that is not a
draft may be read by anybody who may take surveys.

| Route | Answers |
| --- | --- |
| `GET /api/surveys` | `{surveys: [{survey, answeredAt}]}` - the surveys taking answers now, newest opened first |
| `GET /api/surveys/{slug}` | `{survey, answeredAt}` - open or closed; 404 for a draft or nothing |
| `POST /api/surveys/{slug}/responses` | `{aboutYou: {gender, age} \| null, answers: {questionId: {optionIds, other, text}}, language, startedAt}` → 201 `{id, submittedAt}`; from nobody, answers that are kept make a visitor, and the 201 carries its key in the **`X-Visitor-Key` response header** (with `Cache-Control: no-store`) - never in the body |
| `POST /api/visitor/move` | a person's token **and** `X-Visitor-Key` → `{found, moved, kept}` - at sign-in, the visitor's answers into the account (below) |

### Visitors

A **visitor** is somebody taking surveys without signing in while the IAM says
sign-in is not required (`api/visitors.php`, migration 006): a row of `users`
with a **negative id** (an IAM id is always positive), no name, no address -
so its answers are kept and counted like a person's, once each survey. It has
no role and never passes a check that needs a token: the admin panel, the
Migrations page and the move answer it 401 `sign_in_required`.

- **Made lazily**: only by answers from nobody that pass every check, inside
  the transaction that keeps them - never by reading a page. A refused send
  (`invalid_answer`, `not_open`, `not_found`, a limit) makes no visitor and
  counts nothing.
- **The key**: 32 random bytes the server makes, base64url without padding
  (43 characters `[A-Za-z0-9_-]`). It leaves the server once, in the
  `X-Visitor-Key` header of the 201 that made the visitor; the browser keeps it
  and sends it back in the `X-Visitor-Key` request header. Only its SHA-256 is
  stored. A visitor's last visit is written at most once an hour.
- **Limits on new visitors** (`config/visitors.local.php`,
  [operations](operations.md#visitors)): per address an hour, in all an hour,
  and visitors with a key at once - past any, 429 `too_many_visitors` with
  `Retry-After: 3600`, nothing kept. Visitors there already carry on. The
  address is `REMOTE_ADDR`, or `CF-Connecting-IP` from Cloudflare's own
  addresses alone (the anotoki family's rule; the header pinned, no other ever
  read; an IPv6 address by its /64) - with the origin secret
  (`config/cloudflare.local.php`), only on a request that carries it in
  `X-Anotoki-Origin`, any other from Cloudflare counting as its edge -, and what is kept of it is a keyed HMAC -
  a stable pseudonym of the address while the installation's key lasts, never
  the address in the clear.
- **Unseen for `keep_days`** (30 by default) **a visitor ends**: its key opens
  nothing (401 `visitor_unknown`), and its answers **stay** in the results as
  "Visitor N". A visitor with no answers left is deleted then - or, once ended,
  when an ADMIN deletes its last answers (one, or with a whole survey). A
  browser whose visit ended may answer the same survey again, as a new
  visitor.
- **The move at sign-in** - `POST /api/visitor/move` with the person's token and
  the key, **allowed whatever the switch says**: one transaction, the
  visitor's row then the person's held; a survey both answered keeps the
  person's answers as they are and the visitor's go (`kept`); every other
  answer becomes the person's, with its language and times (`moved`); the
  visitor and its key are gone. A key nobody has (moved by another tab, ended,
  never there) is 200 `{found: false, moved: 0, kept: 0}` - ask as often as you
  like. No key, or one that is not a key: 422 `invalid_visitor_key`. A lock not
  had in time, or the person's own answers being written at that moment: 503
  `visitor_move_retry` with `Retry-After: 2`, nothing moved.
- **What the browser does** ([architecture](architecture.md#visitors-in-the-browser)):
  it keeps the key in `localStorage` (`anotoki-survey:visitor`; the first key
  a browser got stays) and the library's interceptor sends it only on
  `/api/surveys`, only while sign-in is not required - never with a token. A 401 `visitor_unknown`
  forgets it and the request goes once more without it (nothing was kept for
  it, so answers are never sent twice); a 401 `sign_in_required` keeps it (the
  switch went on: the page stops welcoming visitors until the next load) - so
  a sign-in later still moves what it answered. After every sign-in with a
  key held it asks for the move, again after no answer or a 5xx (2 s, 10 s,
  30 s; `Retry-After` wins), and forgets the key on a 200 or a 422.

A `survey` here is the survey document the admin routes send (below: *The
survey document* - each step with its own text and pictures, and its
questions), with its `language` and, of its `translations`, only those into
languages people are offered (below: *A survey's languages*).

Sending answers is refused with:

| Status, code | When |
| --- | --- |
| 401 `sign_in_required` | no token, while sign-in is required |
| 401 `visitor_unknown` | a visitor key that is nobody's (any more), or not a key - or whose visitor went while the answers were on their way (moved at sign-in in another tab, ended): nothing kept |
| 404 `not_found` | no such survey, or a draft - or an address that is not one (not even UTF-8). Also answers sent to the address a survey had before an editor changed it (or an ADMIN deleted it) while the person was in it: the page says so (`take.refused.gone`) and becomes "There is no survey here"; the draft is kept by the survey's id, so the new address offers to carry on |
| 409 `not_open` | closed, or its last day is over everywhere |
| 409 `already_answered` | this person (or visitor) answered it before (also two sends at once) |
| 422 `invalid_answer` + `questionId` | an answer not good enough, in the page's words: "Question 2: Please choose an answer." (`about-gender`, `about-age` for those) - or not an answer at all (a list for a choice, a number for text) |
| 429 `too_many_visitors` | nobody's answers, past a limit on new visitors (`Retry-After: 3600`): sign in, or try later |

`aboutYou` is required while the survey asks about the person
(`askAboutYou`), and ignored otherwise: `gender` is `male`, `female` or
`undisclosed` ("Prefer not to say"), `age` is `under-18`, `18-24`, `25-34`,
`35-44`, `45-plus` or `undisclosed`. Anything else is 422 `invalid_answer` on
`about-gender` or `about-age` - `non-binary` too: the gender question offered
it until 2026-10-20 (the owner's decision), and answers sent before keep it,
unchanged, so `aboutYou.gender` in the results
(`GET /api/admin/surveys/{id}/responses`) may still say `non-binary`.

`startedAt` is the browser's (toISOString); a time in the future is taken as
now, one before the survey opened as its opening. Control characters in the
words (a soft line break pasted from a word processor) are dropped, tabs and
line breaks aside - on the page and here alike - never a reason to refuse.

`language` is the language the survey's texts were shown in when the answers
were sent. It is kept (`responses.language`) when it is a language code and is
the survey's `language` or one of its `translations`; anything else - missing,
a list, 300 characters, `xx`, a language the survey is not in - is kept as
null. **It never refuses the answers.**

The sentences of these refusals are English. The page people answer on never
shows them: it words every refusal itself, in the reader's language, from the
code (and `questionId`).

## The admin panel

EDITOR or ADMIN for all of it (`requireStaff()`: the library's `RequireRole`,
judged from the token): 401 without a token, 403 `forbidden` without the role.
ADMIN alone (`requireAdmin()`) for the three deletes (a survey, somebody's
answers, a language), the migrations, and the System's routes - the people,
the error log, the audit log, the backups (below). Every change is written to
the audit log (`survey.created`, `survey.opened`, `survey.closed`,
`survey.deleted`, `response.deleted`, `translations.saved`,
`translations.imported`, `language.created` / `updated` / `deleted`,
`migrations.applied` - and the library's own for its routes), by the token's
person.

| Route | Answers |
| --- | --- |
| `GET /api/admin/surveys` | `{surveys: [summary]}` - id, slug, title, status, closesOn, the times, revision, and counts: steps, questions, responses |
| `POST /api/admin/surveys` | `{survey}` → 201 `{survey}`: a new draft from what the editor made (`newSurvey()`, or `copySurvey()` for a copy - the status and ids of the survey itself are the server's) |
| `GET /api/admin/surveys/{id}` | `{survey}` |
| `PUT /api/admin/surveys/{id}` | `{revision, survey}` → `{survey}` with the next revision |
| `POST /api/admin/surveys/{id}/status` | `{status: "open" \| "closed", closesOn?}` → `{survey}` with the next revision (the closing day is part of what editors save) |
| `DELETE /api/admin/surveys/{id}` | ADMIN → 204; its answers go with it |
| `GET /api/admin/surveys/{id}/responses` | `{responses: [SurveyResponse]}` - newest first, each with `person: {id, name, visitor}` and `language` (the code the survey was read in, or null). No address: the site keeps none (migration 011; the IAM is the only holder). A person's name is the IAM's - its placeholder `deleted-{id}` once the IAM deleted the account. A visitor's `person` is `{id: "-12", name: "Visitor 12", visitor: true}` - from its own id; a person's says `visitor: false` |
| `DELETE /api/admin/responses/{id}` | ADMIN → 204: that person may take the survey again (a visitor too, while its key lives; an ended visitor left with no answers is deleted) |
| `POST /api/admin/images` | the picture's bytes, `Content-Type: image/*` → 201 `{image: {id, alt, width, height, src}}` |

### The survey document

What `POST /api/admin/surveys` takes as `survey` and `PUT
/api/admin/surveys/{id}` as `survey` (beside `revision`), and what every route
that answers a survey sends - the admin routes, and the people's
(`GET /api/surveys`, `GET /api/surveys/{slug}`, with only the translations into
offered languages). The frontend's `shared/survey/survey.model.ts` is the same
shape. The server keeps what is listed here, checked and cleaned
(`surveyFromBody()`), and drops every other field; the survey's `id`,
`status`, `revision` and times are its own (a new survey is a draft, whatever
is sent).

```
{
  "title": "Genshin 1.0",                 // required, a line of at most 200 characters
  "slug": "genshin-1-0",                  // required, 100 characters at most; to open: small letters, digits, single dashes, 60 at most
  "closesOn": null,                       // "YYYY-MM-DD" or null
  "intro": "<p>…</p>",                    // rich text (below); "" for none
  "thanks": "<p>…</p>",                   // rich text
  "askAboutYou": true,                    // required: gender and age, on a step of their own before the first
  "language": "en",                       // required: a language the site has
  "translations": {},                     // required, {} for none (A survey's languages, below)
  "steps": [                              // required, a list of at most 50
    {
      "id": "step-task",                  // required: 1-64 of A-Z a-z 0-9 _ -, unique among the steps
      "title": "The task",                // a line of at most 200 characters; "" for none (the default)
      "text": "<p>Go to …, then come back.</p>",   // the step's own rich text, above its questions; "" (the default) for none
      "images": [                         // the pictures under the step's text: at most 10; [] (the default) for none
        { "id": "<an uploaded picture's id>", "alt": "What it shows" }   // alt: at most 300 characters, "" for none
      ],
      "questions": []                     // required: a list - empty for a step of text and pictures alone
    },
    {
      "id": "step-ask",
      "title": "How it went",
      "text": "",
      "images": [],
      "questions": [
        {
          "id": "q-easy",                 // required: as a step's id, unique among all the questions - never about-gender or about-age
          "type": "single",               // required: "single", "multiple" or "text"
          "text": "<p>Was it easy?</p>",  // rich text
          "images": [],                   // under the question's text: at most 10 {id, alt}
          "required": true,               // required: true or false
          "options": [                    // at most 100; read for "single" and "multiple"
            { "id": "yes", "label": "Yes", "other": false, "images": [] },   // label: 300 characters; images: at most 4 {id, alt}
            { "id": "no", "label": "No", "other": false, "images": [] }
          ],
          "layout": "list",               // "list" (the default), "columns" or "scale"
          "minChoices": null,             // "multiple": the fewest and the most to choose, numbers or null
          "maxChoices": null,
          "multiline": true,              // "text": a box (true, the default) or one line
          "maxLength": null,              // "text": the longest answer, a number or null
          "placeholder": ""               // "text": the hint in the empty field, 300 characters
        }
      ]
    }
  ]
}
```

- **Rich text** - `intro`, `thanks`, a question's `text` and a step's `text` -
  is cleaned on the way in, the same way for all four (`richTextClean()`,
  `api/rich_text.php`: the anotoki library's `RichHtml::clean()`, the same
  rules as the pages' `<anotoki-rich-html>`, anotoki-lib 0.11.0): the editor
  writes `p br strong em u s mark a ul ol li h2 h3`, and the library keeps
  those and `div b i strike span font h4` - the family's editors' - and
  nothing else; a link's address only a web address with its host or a mail
  address (and always a new tab, no way back to the page), a list's `start`,
  `<font>`'s size, face and colour, and inline styles of five properties
  alone (`color`, `background-color`, `font-size`, `font-family`,
  `margin-left`), each bounded; a `<script>`, a `<style>`, a picture, a frame
  or a form go with what is inside them, any other element is unwrapped to its
  words, every other attribute (`onclick`, `onerror`) goes, a `javascript:`
  link becomes its words, and control characters (but tab and line feed) and
  those that turn the text's direction are dropped. At most 50 000 bytes of
  UTF-8 (422 `invalid_survey`, as a text that is not text); no words at all (an emptied editor's
  `<p></p>`) is `""`.
- **A picture** is one uploaded first (`POST /api/admin/images`, above:
  checked by its own bytes - PNG, JPEG, WebP, GIF or AVIF, never SVG - at most
  10 MB and 10 000 px a side): a survey sends its `id` (a UUID) and what it
  shows (`alt`); the server fills in `width`, `height` and `src` from the file,
  and refuses a picture it does not have (422 `unknown_image`). Every save
  records the pictures the survey shows - a step's, a question's, an
  option's - and a picture nothing shows any more goes a day after it came
  (`survey_images`, `imagesCleanup()`): a step or a question removed takes its
  pictures with it, unless something else still shows them. The same picture
  may stand in more than one place - and in a copy of the survey, which shows
  the original's pictures.
- **A step** says something of its own (`text`, `images`) above its
  questions - or only that: a step with text or pictures needs no question; it
  is read, and left with Next (a usability test's task, say, before the step
  that asks about it). Neither field has to be sent: a step without them has
  no text and no pictures - and one kept without them (saved by a release
  from before them) goes out with both, `""` and `[]`. A step with neither,
  and no question, keeps the survey from opening ("Step 3 is empty - add a
  question, text or a picture, or remove the step."), and so does a survey
  with no question at all ("Add at least one question.").
- The answers are by question id (`POST /api/surveys/{slug}/responses`): a
  step of text alone has none; anything sent for an id that is no question's
  is not kept.

A survey is refused with:

| Status, code | When |
| --- | --- |
| 409 `conflict` + `survey` | saved to a revision older than the server's: `survey` is the version there now |
| 409 `slug_taken` | a live survey already has the address (on save or on opening) |
| 422 `invalid_survey` | not a survey: a field missing or of the wrong kind, too long, too many, an id twice; a live survey given an address people could not reach; no `language` or no `translations`; a language the site does not have - or one deleted while the save was on its way; a translation into the language the survey is written in; a level of a translation that is not an object; another `language` than the stored one while both the stored and the sent survey hold translations |
| 422 `unknown_image` | a picture the server does not have (any more) - a step's, a question's or an option's |
| 422 `survey_problems` + `problems` | opening one that has something to fix - the editor's sentences, from `surveyProblems()` ("Step 3 is empty - add a question, text or a picture, or remove the step."); what a translation into an offered language still lacks is among them |
| 409 `not_open` | closing a draft |
| 413 `too_large` | a survey with all its translations is one save of at most 2 MB |

### A survey's languages

`survey.language` is the code of the language the survey is written in: the
texts of the document itself. `survey.translations` holds the same texts in
other languages, by code, each text found by the id of what it belongs to:

```
"translations": {
  "sk": {
    "title": "", "intro": "<rich text>", "thanks": "<rich text>",
    "steps":     { "<step id>": {
      "title": "", "text": "<rich text>",
      "images":  { "<picture id>": { "alt": "" } }
    } },
    "questions": { "<question id>": {
      "text": "<rich text>", "placeholder": "",
      "options": { "<option id>": { "label": "" } },
      "images":  { "<picture id>": { "alt": "" } }
    } }
  }
}
```

- Only texts: ids, structure, pictures and limits are the survey's own. A
  step's entry holds its title, its own text and what the pictures under its
  text show (`images`: by picture id, only the step's own pictures); a
  question's its text, hint, option labels and what the pictures under its
  text show (an option's pictures have no description). The same picture
  twice shares one entry. Every field of an entry may be left out when it is
  sent: it is then `""` (or `{}`), a text not translated yet.
- **Both fields are required in every `POST` and `PUT`** (`translations` may
  be `{}`): a default there would let a page from before surveys had languages
  wipe the translations without a word. A survey stored before them is read as
  `language: "en"`, `translations: {}` - no survey was migrated. The only
  browser that sends such a body is an editor page left open across the
  release, so the refusal says what its person can do: "Say which language the
  survey is written in (language). A page that was open before the site was
  updated can no longer save: copy what you changed since the last save, then
  reload the page." - and "Send the translations, or an empty object
  (translations). A page that was open …" with the same second sentence.
- `language` and every key of `translations` must be a language the site has,
  offered or hidden; a translation cannot be into `language` itself. Refused,
  never dropped.
- **`language` does not change while a translation is kept across the
  change**: a `PUT` is refused ("The language a survey is written in can be
  changed only while it has no translations. Remove them first.") when its
  `language` is not the stored one and both the stored survey and the sent one
  hold translations. Removing the translations and changing the language in
  one save is taken - the revision says the sender saw what they removed - and
  so is a first translation that arrives together with a new language. (The
  editor asks for more: it locks "Written in" while the survey has any
  translation.)
- A save holds the rows of the survey's languages until it is done
  (`surveyLanguagesLock()`), and deleting a language holds its row too: the two
  wait for each other. A save that comes second is refused - "A language of
  this survey has just been deleted from the site. Add the language again, or
  take it out of the survey." - and a delete that comes second answers 409
  `language_in_use`.
- The server builds each translation by walking the survey's own steps,
  questions, options and pictures: a text for an id the survey does not have is
  dropped (a description of a picture the step or question does not show
  too), and every text is cleaned and measured like the one it translates
  (`richTextClean()`, the same limits).
- **Every map goes out as a JSON object, at all six levels** (`translations`,
  `steps`, `questions`, a step's `images`, a question's `options` and
  `images`), empty or not, whatever the ids look like (`"0"`, `"1"`) - and
  every entry whole: a step's kept from before steps had their own text goes
  out as `{"title": "…", "text": "", "images": {}}`.
- The admin routes send every translation; the routes for people only those
  into languages that are offered.
- A translation is *whole* when every text the survey has is there
  (`surveyTranslationGaps()` / `translationGaps()`). Opening is refused while a
  translation into an offered language is not (`survey_problems`: "Slovak: the
  title is missing.", "Slovak: the title of step 2 is missing.", "Slovak: step
  2 has 2 texts to translate." - its own text and its pictures' descriptions -,
  "Slovak: question 2 has 3 texts to translate.", "Slovak: question 2 has two
  options called "Áno"."); one into a hidden language may be as unfinished as
  it likes.

### The languages and the site's strings

The anotoki family's routes (above), behind this site's roles: EDITOR or
ADMIN for all of them, deleting a language ADMIN alone (`requireRoleFor()`).
They answer in this order, after the roles (401, 403): a `{code}` that is not
a language code 404 `not_found`, before any query; a body that is too large
413 `too_large`, not JSON 415 `unsupported_media_type`, empty 422
`empty_body`, broken 400 `invalid_json` - read from the request itself; the
tables not there yet 503 `translations_unavailable` (`Retry-After: 60`); then
the work. A `{code}` the site does not have is 404 `not_found`.

| Route | Answers |
| --- | --- |
| `GET /api/admin/languages` | `{languages: [{code, name, native_name, enabled, sort_order, seeded, strings}]}` - every language, the hidden ones too; `seeded`: the migrations write strings for it; `strings`: how many it has of its own |
| `POST /api/admin/languages` | `{code, name, native_name, enabled?}` → 201 `{language}`: after the ones there are; offered at once unless `enabled` is `false` (the Languages page always sends it, and adds a language hidden unless told otherwise) |
| `PUT /api/admin/languages/{code}` | `{name?, native_name?, enabled?, sort_order?}` → `{language}`; what is not sent stays |
| `DELETE /api/admin/languages/{code}` | ADMIN → 200 `{strings}`: its strings go with it, and this says how many. It waits for a survey's save that is on its way in that language, and then counts it |
| `GET /api/admin/translations` | `{languages: [all], keys: [{name, description, values: {code: text}}]}` - the keys by name, the library's (`anotoki.*`) among them |
| `PUT /api/admin/translations` | `{values: {key: {code: text}}}`, **only the cells that changed** → the grid as it is now |
| `GET /api/admin/translations/{code}/export` | that language's own strings as a flat `{key: text}` file (`Content-Disposition: attachment; filename="translations-{code}.json"`) - not merged with English, `{}` when it has none |
| `PUT /api/admin/translations/{code}/import` | a flat `{key: text}` → the grid as it is now; an empty string - nothing in it to see - is passed over (an import deletes nothing) |

A save of strings is checked whole before anything is written (the library's
`StringCheck` - the import and the command line go through it too), and
written in one transaction, by key and then by language whatever order the
cells were sent in - so two saves of the same strings wait for each other
rather than deadlock. An empty string for another language than English
deletes that string (the language then reads the key in English). **Empty is a
string with nothing in it to see**: no character but white space, separators
and format characters - spaces, or a zero-width space, a word joiner or a soft
hyphen alone (the library's `Text::blank()`; a language's name of that kind is
no name). A string sent as it is stays as it was, with who wrote it and when;
otherwise `updated_by` is the request's person (`translationWriter()`: the
token's, never a body's). Two people changing the same string: the last save
is kept. The keys themselves are the code's - migrations write them, no route
does.

The first thing wrong is what is refused. A key is looked at first (the
shape of its cells, then whether the site has it); then, string by string: the
language, that it is text, empty or not, its length, its braces, its
placeholders.

| Status, code | When |
| --- | --- |
| 422 `invalid_language` | a code that is not two small letters (or two and two with a dash); a name that is not 1 to 50 characters, or has nothing in it to see; `enabled` not `true` or `false` (adding or changing: a text, a number, `null`); `sort_order` not a whole number 0-1000 |
| 409 `language_exists` | adding a code the site has |
| 422 `too_many_languages` | adding a twenty-first - two people adding the twentieth at the same moment wait for each other, and the second is refused |
| 409 `fallback_language` | switching English off, or deleting it |
| 409 `seeded_language` | deleting a language the migrations write strings for (`en`, `sk`): it can be switched off |
| 409 `language_in_use` + `surveys` | deleting a language a survey is written in or translated into; `surveys` is how many |
| 422 `invalid_value` | not `{key: {code: text}}` (an import: not a flat object); a value that is not text, or longer than 2000 characters |
| 422 `unknown_key` + `key`, `keys` | a key the site does not have; `keys` lists every such key sent |
| 422 `unknown_language` | a language the site does not have |
| 422 `fallback_required` | an empty English string (nothing in it to see): every other language falls back to it |
| 422 `invalid_placeholder` | a `{` or `}` that is not part of a `{placeholder}`, in any language: `{ count }`, `{počet}`, `{count`, `{{count}}`. The page fills in only what is written exactly as `{name}` (a letter, then letters, digits, `_`) and would show the rest as it stands; the sentence names one of the key's own placeholders as the example - `{count}` for a key that has none (the library's words) |
| 422 `placeholder_changed` + `placeholder` | an English string whose `{placeholders}` are not exactly the stored English string's |
| 422 `unknown_placeholder` + `placeholder` | another language's string with a `{placeholder}` the English one does not have (leaving one out is fine) |

The refusals about one string carry `key` and `language`, so the page can show
the sentence beside its cell.

A picture is refused with 415 `not_an_image` (not PNG, JPEG, WebP, GIF or AVIF
by its own bytes - SVG never), 413 `too_large` (over 10 MB), 422 `image_size`
(over 10 000 px a side).

### The database: migrations

ADMIN alone (an EDITOR and somebody taking surveys: 403 `forbidden`; nobody:
401 `sign_in_required`; a token that does not check out: 401
`invalid_token`) - the admin panel's Migrations page: the anotoki family's
routes (`Anotoki\Lib\Migrations\Http\MigrationsRoutes::admin`,
`routes/admin.php`), their ADMIN judged from the token alone, so they work on a
database a pending migration has yet to build - from nothing at all. They
answer while a migration is pending, when the rest of the site is 503; not
while the settings are missing (there is no database to update then:
`setup.php`). The sets, in the order they run: the library's `anotoki_admin`
(the audit log's table), the site's own `survey`, then the library's
`anotoki_translations` and `anotoki_people` (the library's files recorded as
`<set>/NNN_….sql` in the `migrations` table). Bodies in the library's shape.

| Route | Answers |
| --- | --- |
| `GET /api/admin/migrations` | `{sets: ["anotoki_admin", "survey", "anotoki_translations", "anotoki_people"], applied: [{set, name, applied_at}], pending: [{set, name, ready, blocked, duplicates}], missing: [{set, name, applied_at}]}` - applied in the order they ran (`applied_at` ISO 8601, UTC), pending in the order they will run (`duplicates`: the other files of its set with its number - it and every file after it wait, and an Apply stops before it; anotoki-lib 0.11.0), missing: recorded as applied with no file here. Writes nothing |
| `GET /api/admin/migrations/file?set=survey&name=NNN_x.sql` | `{set, name, sql}`: the file's text, for the page's View (`set=anotoki_translations` and the others for the library's); 404 `{code: "not_found", message}` for anything that is not a file of a set (a path, another folder) |
| `POST /api/admin/migrations/apply` | `{applied: [{set, name}], failed: {set, name} \| null, error: string \| null, note: string \| null}` - first a backup of the database as it is (the library's backups, `before-migration`; `note` names it - one that cannot be made stops the Apply, nothing run), then every pending file in order, each in its own transaction, stopping at the first that fails: that one is rolled back whole and named, and `error` is the database's whole error (`statement n of m: SQLSTATE[...]: ...` and the statement's first lines) - it is logged too (`[db] the migration ... failed`). A failure is a 200 with `failed` set; `{applied: [], failed: null, ...}`: nothing was pending. Audited (`migrations.applied`); the audit entries kept in a file while the audit log's table waited go in after it |

| Status, code | When |
| --- | --- |
| 409 `busy` | `{code: "busy", message}`: another update is running - another Apply, `setup.php`'s Save, `php migration.php` or a backup: all take one PostgreSQL advisory lock, and the second applies nothing |

### The System: the site settings, the people, feedback, the error log, the audit log, the backups

The anotoki family's routes (anotoki-lib 0.11.1: `SiteSettingsRoutes`, `PeopleRoutes`,
`FeedbackRoutes`, `ErrorLogRoutes`, `AuditRoutes`, `BackupsRoutes` - wired in
`routes/admin.php`, `api/site_settings.php`, `api/people.php` and `api/admin_tools.php`), behind this site's
`requireAdmin()` and guarding themselves as well (the library asks the token's
ADMIN itself): ADMIN alone - nobody 401 `sign_in_required`, a token that does
not check out 401 `invalid_token`, a MEMBER and an EDITOR 403 `forbidden` (in
this site's error body). Who acts is the token's person, never a body. Their
pages are the library's (admin panel: System).

| Route | Answers |
| --- | --- |
| `GET /api/admin/site-settings` | `{parts, settings, pages, levels, visibilities, reserved: {pages, api_paths}, limits}` - the Site settings page's whole (every write below answers it again): the three parts this site offers (`getting_in`, `announcement`, `page_access`), each switch with its value and who changed it last and when, every page's row with its API paths, the API paths and pages no row may claim (the library's, and this site's: `/api/auth/config`, `/api/images`, the preview `/preview`), the messages' limits; 503 `feature_unavailable` while the library's `anotoki_admin/003` waits |
| `PUT /api/admin/site-settings` | `{settings: {name: value}}` (the switches that changed) → the whole: `maintenance_mode`, `maintenance_message` (`{en?, sk?, ...}`), `announcement_enabled`, `announcement_level` (`info`, `warning`, `danger`), `announcement_message`; audited `site_settings.changed` (each name, from and to); 422 `invalid_setting` (+ `setting`), `unknown_setting`, `invalid_body` |
| `POST /api/admin/site-settings/pages` | `{path, visibility, blocked, api_paths}` → 201 the whole: a page's row - the list of open surveys (`/`) or a survey (`/{slug}`); audited `page_access.added`; 409 `page_exists`; 422 `invalid_page` (a reserved page - `/auth`, `/staff`, `/admin`, the legal pages, About, Support, the preview - or a row that would cover one, as `/:x` covers `/staff`), `invalid_visibility`, `invalid_api_path` / `invalid_api_paths` (one touching a reserved path, either way round), `too_many_pages` |
| `PUT /api/admin/site-settings/pages` | `{pages: [{id, visibility, blocked, api_paths}]}` (the rows that changed) → the whole; audited `page_access.changed`; 422 `unknown_page` and the rest as above |
| `DELETE /api/admin/site-settings/pages/{id}` | the row gone → the whole; audited `page_access.removed`; 404 `not_found` |
| `GET /api/admin/people?q=&page=` | `{people: [{sub, name, first_seen_at, last_seen_at, anonymized_at, iam_url, answered, written}], columns, total, page, page_size, visitors: {count, active}, sync, ready, problems}` - everybody who signed in, 50 a page, the most recently seen first; `q` a name (any case, anywhere in it) or an IAM id (422 `invalid_query` for one that cannot be a name); `answered` / `written`: how many surveys each answered and wrote here; `visitors`: those listed as "Visitor N", and how many of them still have their key; `sync`: where the scrub of the IAM's deleted accounts stands; 503 while the tables wait for an update |
| `DELETE /api/admin/people/{sub}` | `{deleted: {"Answers": n}}` - every answer of the person's (their row and the surveys they wrote stay; asked first on the page, no proof of a recent sign-in - the owner's decision); 404 `not_found` for nobody there; audited `person.data_deleted` inside the delete's own transaction (its details name it, `_txid`): no delete without its entry - one that cannot be written undoes the delete, and while the audit log's table waits for an update, 503 `feature_unavailable` (`Retry-After: 60`) and nothing deleted. A restore does the delete again by that entry |
| `POST /api/admin/people/sync` | `{run: {state, handled, scrubbed, error, problems}, sync}` - the scrub now: the IAM's deleted accounts since the last one, each named by the IAM's placeholder `deleted-{id}` here, `anonymized_at` set, the feedback they sent left without its reply address and browser, everything else kept; audited `people.synced` |
| `GET /api/admin/feedback?kind=&status=&section=&search=&page=` | `{total, page, pageSize: 25, items: [{id, created_at, updated_at, kind, status, section, subject, message, details, contact_email, user_id, user_name, page, language, user_agent, handled_by, handled_by_name, handled_at}]}` - newest first; each sender and handler named from `users`; `search` in the subject, the message, the address and the extra fields; 503 `feature_unavailable` while its table waits. Spam older than 30 days and resolved messages older than 365 go at a clean-up run at most once a day, after this answer or a message's |
| `GET /api/admin/feedback/facets` | `{kinds, statuses, sections, fields, byStatus, byKind}` - for the page's filters |
| `GET /api/admin/feedback/unread` | `{unread}` - how many nobody opened yet: the count beside Feedback in the admin panel's column |
| `GET /api/admin/feedback/{id}` | `{message}` - reading changes nothing (anotoki-lib 0.8.1); 404 `not_found` |
| `PUT /api/admin/feedback/{id}/read` | no body (or `{}`) → `{message}`: a `new` one becomes `read`, any other status stays as it is (nobody named for it, nothing audited) - the page sends it as it opens a new message; 404 `not_found` |
| `PUT /api/admin/feedback/{id}/status` | `{status: "new" \| "read" \| "resolved" \| "spam"}` → `{message}` with `handled_by` the token's person; 422 `status_unknown`; audited `feedback.status_changed` (`{from, to}`) |
| `DELETE /api/admin/feedback/{id}` | `{deleted: true}`; audited `feedback.deleted` (its kind, status and when it was sent) inside the delete's own transaction - no delete without its entry (503 `feature_unavailable` while the audit log's table waits); a restore deletes it again by that entry |
| `GET /api/admin/errors?days=&level=&status=&search=` | `{total, errors, warnings, notices, distinct, truncated, days, daily, statuses, groups, dropped}` - the error log's report: the newest lines (`storage/logs`, 30 UTC days), grouped by fingerprint. Open while a migration waits |
| `GET /api/admin/errors/{fingerprint}` | every occurrence of one group |
| `DELETE /api/admin/errors[?before=YYYY-MM-DD]` | `{deleted}` - everything, or the UTC days before that one; audited `errors.cleared` |
| `GET /api/admin/audit?actor=&action=&target_type=&target_id=&from=&to=&page=` | `{total, page, pageSize: 50, items}` - the IAM's shape: each entry when, who (the token's `sub`, named from `users`), the action, what it is about, the details - newest first; `actor` an id or a name (the people of that name here); `action` one, or a family (`backup.*`); 503 while its table waits for an update |
| `GET /api/admin/audit/facets` | the actions, the people and the kinds of target there are, for the page's choices |
| `GET /api/admin/backups` | `{backups: [{id, kind, created_at, created_by, created_by_name, description, size, table_count, rows, restorable, sealed, stale, encrypted}], status: {count, total_bytes, last_daily, free_bytes, database_bytes, encrypted, restore_enabled, restorable, directory_writable, copy_available, problems}}` - `created_by_name` the maker's name as the site has it (`users`); `sealed`: made here (below), and only then `restorable`. Open while a migration waits |
| `GET /api/admin/backups/proof` | `{kind: "recent_sign_in"}` - what making, downloading, deleting and restoring ask: a sign-in of the last ten minutes (the token's `auth_time`) |
| `POST /api/admin/backups` | `{description?}` → 201 `{backup}`: every table by COPY in one snapshot (the pictures too), `kind: manual`; 403 `reauth_required` after an older sign-in (the page offers "Sign in again"); 409 `busy` during an update or another backup; audited `backup.created` |
| `GET` / `DELETE /api/admin/backups/{id}` | one backup's facts and its tables / deletes it (the proof; audited `backup.deleted`) |
| `POST /api/admin/backups/{id}/ticket` | `{url, expires_in: 60}` - a single-use link for the download (the proof; audited `backup.downloaded`) |
| `GET /api/admin/backups/{id}/file?ticket=` | the file, an attachment (`no-store`, `nosniff`, `no-referrer`) - **deliberately outside every check**: a browser's navigation sends no token, the ticket is the check - good once, for one backup, for its minute |
| `GET /api/admin/backups/{id}/preview` | the rows a restore would take away, table by table; `restorable` and, when not, `reasons` (a backup not made here: "It carries no seal of this site's …") |
| `POST /api/admin/backups/{id}/restore` | `{confirm: the id's last 6}` → the restore in place, all or nothing, after a `before-restore` backup - only a backup made here (422 `archive_invalid` for one without this installation's seal: made before anotoki-lib 0.5.0, put into the folder, or changed since - restored offline alone; the answer the library's fixed sentence, which it was in the error log) and only where the database's migrations and columns equal the backup's (409 `schema_differs`). Inside its transaction, before anybody sees the rows, every person's answers deleted on the People page since the backup are deleted again (the audit log's `person.data_deleted`, which is never restored), and every feedback message deleted since (`feedback.deleted`) - one that cannot be done again rolls the restore back whole (500 `restore_failed`); a check of the IAM's deleted accounts running at that moment refuses it ("restore again in a minute"). After it the scrub of the IAM's deleted accounts runs again - `{restored, before_restore, tables, rows, duration_ms, after_restore_error}`, `after_restore_error` null, or - that scrub not finished (the IAM out of reach…: the restore stands, and the next request runs the scrub again) - the library's fixed sentence "What this site does after a restore did not all go through. The error log says what." (anotoki-lib 0.6.0: no answer carries a failure's own words; why is in the error log); closed while a migration waits; audited `backup.restored` |

The backups are files under `storage/backups/` (`<id>.anotoki-backup`, a
gzip'd tar after a two-line header - not encrypted, the owner's decision of
2026-10-11: only the IAM's are - but sealed: the sidecar `<id>.anotoki-backup.json`
carries an HMAC of the id and the file's SHA-256 under a key derived from the
installation's `storage/anotoki-lib.key`, and a restore hashes the very bytes
it reads); kept: daily 14, before an update 5, before a restore 5, by hand until
deleted - no maximum age (the owner's decision of 2026-10-11: nothing deletes a
backup for being old). The daily one is made after the answer of the first
request of a UTC day. Every file the backups write is the site's own user's
alone (`0600`, folders `0700`). The pages' own errors come to the error log
through `POST /api/client-errors` ("Anybody", above).

## Limits

| | |
| --- | --- |
| A JSON body | 256 kB; a survey's save - with all its translations - 2 MB; a save or an import of strings 1 MB |
| A survey | 50 steps, 300 questions, 100 options a question, 10 pictures under a question's text, 10 under a step's, 4 on an option; translations into no more languages than the site has |
| Texts | title 200 characters (a step's too), label 300 (a picture's description too), rich text 50 000 bytes of HTML (a question's, a step's, the welcome, the thanks) - a translated text the same as the one it translates |
| The site's words | 20 languages; a language's name 50 characters; a string 2000 characters |
| An answer | 10 000 characters of text, 1 000 for "Other" |
| A picture | 10 MB, 10 000 px a side |
| New visitors | by default 30 an hour from one address (an IPv6 address by its /64), 600 an hour in all, 20 000 with a key at once - `config/visitors.local.php` ([operations](operations.md#visitors)) |
| Feedback | a body of 64 KB, a message of 10 000 characters, a subject of 200; 5 an hour and 20 a day from one sender, 300 a day from the visitors together and as many from the people signed in (the library's numbers) |
