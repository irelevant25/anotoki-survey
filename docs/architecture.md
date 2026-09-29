# Architecture

```
 browser (Angular)                    backend (PHP, Slim 4)                    PostgreSQL (anotoki_survey)
 ─────────────────                    ─────────────────────                    ───────────────────────────
 AuthService ── sign-in ──▶ the anotoki IAM (OIDC code + PKCE; tokens in localStorage)
 ApiService ── /api/... + Bearer ──▶ index.php: security headers ▶ error handler ▶ setup gate ▶ route
                                        ├─ optionalUser / requireUser / requireRole: the token, checked here
                                        ├─ surveys.php, responses.php, images.php ─────────▶ surveys, responses,
                                        └─ survey_rules.php, rich_text.php: what may be kept   images, survey_images, users
```

One origin everywhere: on the hosting the web root holds the built app and
`api/` beside it (`.htaccess` routes `/api/*` to `api/index.php`); in
development `ng serve` on :4700 proxies `/api` and `/setup.php` to
`php -S localhost:8500 router.php`. There is no CORS, on purpose.

## Signing in, and the roles

The site has no login of its own. The frontend signs people in through the
anotoki IAM with its vendored browser SDK (`frontend/src/app/core/auth/anotoki-auth.mjs`,
v1.1.1, byte for byte the IAM's `sdk/js/`), as client `survey`:

- `AuthService.init()` runs before the first page (an app initializer): it reads
  `GET /api/auth/config` (`{issuer, clientId}` - or 503 `not_set_up`, and the
  site draws its "not set up yet" page), then lets the SDK finish a callback
  (`/auth/callback`; the SDK puts back the address the person came from before
  the router reads it) or restore the stored session.
- `authInterceptor` puts `Authorization: Bearer <access token>` on every `/api/`
  call while somebody is signed in (not on `/api/auth/config` or the pictures),
  and retries once with a fresh token after a 401.
- The backend checks the token with the vendored verifier
  (`backend/api/anotoki_iam.php`, v1.0.1, the IAM's `sdk/php/`): RS256, typ
  `at+jwt`, the IAM's published keys (cached in `storage/cache/`), iss, aud
  `survey`, exp. `sub` is the person; `roles` their roles in this site. A
  person is recorded in `users` (id = the IAM's user id, name and address from
  the token) as they come.

| Role | May |
| --- | --- |
| (none) | take surveys - once each, while open |
| `EDITOR` | the admin area: write surveys, open and close them, preview, read every answer, export |
| `ADMIN` | all of that, and delete surveys and answers |

The frontend hides what a role may not do (`AuthService.isStaff`, `isAdmin`);
the backend decides (`requireRole()` in `api/meddleware/auth.php`). The admin
routes need somebody signed in first (`signInGuard`: off to the IAM, and back);
a signed-in person without a role gets the admin layout's "this part is for the
people who write the surveys".

## The data

A survey is a document: steps, their questions, the questions' options and
pictures are edited, saved and read as one thing, so they are one JSONB value
(`surveys.content`: `{intro, thanks, askAboutYou, steps}`); what the database
must look things up by - the address (`slug`), the title, the status, the
closing day, the times - are columns beside it. The frontend's
`core/survey/survey.model.ts` is the shape the API sends and takes.

| Table | Holds |
| --- | --- |
| `users` | who has signed in: the IAM's user id, name, address |
| `surveys` | the surveys; `revision` counts the saves; a partial unique index keeps one live (not draft) survey per address |
| `responses` | one filled survey per person and survey (unique); gender and age as columns (checked lists), the answers as JSONB by question id |
| `images` | the pictures' bytes (bytea), type and size - never changed once kept |
| `survey_images` | which survey shows which picture, rewritten with every save |

Ids: the database makes the survey, response and picture ids (UUIDs); the
editor makes the ids inside a survey (steps, questions, options - random, and
free of the `:` and `,` the results' addresses use). An id is never reused, so
an answer keeps pointing at its option when the option is renamed or moved.

Migrations are the schema: `backend/migrations/survey/NNN_name.sql`, applied in
order by `api/migration_runner.php` (the family's engine) from `setup.php`,
`migration.php` and the tests. The setup gate answers 503 while one is pending.

## The rules, on both sides

What an answer must be and what keeps a survey from opening are written twice,
in the same words: in the frontend (`core/survey/answer-rules.ts`,
`survey-problems.ts`), so people are told at once, and in the backend
(`api/survey_rules.php`), because the browser is not the only thing that can
send a request. Change one, change the other - and the tests on both sides
(`frontend/.../answer-rules.spec.ts`, `backend/tests/unit/rules.test.php`).

- **An answer**: only options the question still has; one for a single choice,
  within the question's limits (and the options there are) for several;
  "Other" needs its words; text within the question's limit and never more than
  10 000 characters (1 000 for "Other"). Kept as `cleanAnswer` keeps it.
- **Opening**: a title, a valid address nobody else has, at least one question,
  no empty step, every question with text, choices with two options at least,
  labels, no two alike, sensible limits. Drafts may break every rule while
  they are written.
- **Taking answers**: open, and the closing day not over *anywhere on Earth*
  (it ends at noon UTC the day after): the page tells people by their own
  clock, so nobody it still lets in is turned away.
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
  "save mine over it"; nothing is overwritten silently.
- Out of reach (network, 5xx): it tries again by itself every 5 s. Refused for
  what it holds (422, 409 `slug_taken`): it says why above the survey and waits
  for the next change. The header says Saved / Saving… / Not saved; leaving the
  page with changes not saved asks first, and so does signing out.
- Opening or closing first waits for the pending save (the server checks the
  survey it has), then sends the status and, when reopening a survey whose
  last day has passed, drops the day. It is a new revision too (the closing day
  is part of what editors save): saves asked for meanwhile wait for it and are
  made to the revision it brings back; another editor still on the old one gets
  a conflict instead of putting an old day back.
- Signing out - here, in another tab, or the IAM ending the session - keeps
  everything, changes not saved included. Only somebody else signing in lets
  go of it; answers from requests made before are then ignored.
- A fresh load that comes back older than what is here (a save of this page's
  finished meanwhile) is ignored.

People taking a survey go around the store: `ApiService` directly. Their
answers stay a draft in the browser's localStorage
(`anotoki-survey:draft:{survey}:{person}`) until they press Send.

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
