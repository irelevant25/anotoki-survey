# The API

Every route is under `/api/`, answers JSON, and refuses in one shape:
`{"error": "a sentence", "code": "a_code", ...}` with more fields where the code
needs them. Bodies are JSON (`Content-Type: application/json`, anything else is
415) except a picture's bytes. Signed-in routes take the IAM's access token as
`Authorization: Bearer ...` - never from the address. The frontend's side is
`frontend/src/app/core/api/api.service.ts`.

Everything answers 503 `not_set_up` (with `setup: "/setup.php"`) while the
settings are missing or a migration is pending - `/api/health` aside.

## Anybody

| Route | Answers |
| --- | --- |
| `GET /api/health` | `{ok}` - and, asked from this computer, `problem`, `database`, `pending` (migrations); 503 when not set up |
| `GET /api/auth/config` | `{issuer, clientId}`: how the browser signs in |
| `GET /api/images/{id}.{ext}` | a picture: its bytes, cached for a year; `If-None-Match` → 304; 404 when there is none |

## The people taking surveys

Signed in or not (`optionalUser`): anybody may read a survey that is not a
draft; whoever is signed in also learns whether they have answered it.

| Route | Answers |
| --- | --- |
| `GET /api/surveys` | `{surveys: [{survey, answeredAt}]}` - the surveys taking answers now, newest opened first |
| `GET /api/surveys/{slug}` | `{survey, answeredAt}` - open or closed; 404 for a draft or nothing |
| `POST /api/surveys/{slug}/responses` | signed in: `{aboutYou: {gender, age} \| null, answers: {questionId: {optionIds, other, text}}, startedAt}` → 201 `{id, submittedAt}` |

Sending answers is refused with:

| Status, code | When |
| --- | --- |
| 401 `sign_in_required` | no token |
| 404 `not_found` | no such survey, or a draft - or an address that is not one (not even UTF-8) |
| 409 `not_open` | closed, or its last day is over everywhere |
| 409 `already_answered` | this person answered it before (also two sends at once) |
| 422 `invalid_answer` + `questionId` | an answer not good enough, in the page's words: "Question 2: Please choose an answer." (`about-gender`, `about-age` for those) - or not an answer at all (a list for a choice, a number for text) |

`startedAt` is the browser's (toISOString); a time in the future is taken as
now, one before the survey opened as its opening. Control characters in the
words (a soft line break pasted from a word processor) are dropped, tabs and
line breaks aside - on the page and here alike - never a reason to refuse.

## The admin area

EDITOR or ADMIN for all of it (`requireRole`): 401 without a token, 403
`forbidden` without the role. ADMIN alone for the two deletes.

| Route | Answers |
| --- | --- |
| `GET /api/admin/surveys` | `{surveys: [summary]}` - id, slug, title, status, closesOn, the times, revision, and counts: steps, questions, responses |
| `POST /api/admin/surveys` | `{survey}` → 201 `{survey}`: a new draft from what the editor made (`newSurvey()`, or `copySurvey()` for a copy - the status and ids of the survey itself are the server's) |
| `GET /api/admin/surveys/{id}` | `{survey}` |
| `PUT /api/admin/surveys/{id}` | `{revision, survey}` → `{survey}` with the next revision |
| `POST /api/admin/surveys/{id}/status` | `{status: "open" \| "closed", closesOn?}` → `{survey}` with the next revision (the closing day is part of what editors save) |
| `DELETE /api/admin/surveys/{id}` | ADMIN → 204; its answers go with it |
| `GET /api/admin/surveys/{id}/responses` | `{responses: [SurveyResponse]}` - newest first, each with `person: {id, name, email}` |
| `DELETE /api/admin/responses/{id}` | ADMIN → 204: that person may take the survey again |
| `POST /api/admin/images` | the picture's bytes, `Content-Type: image/*` → 201 `{image: {id, alt, width, height, src}}` |

A survey is refused with:

| Status, code | When |
| --- | --- |
| 409 `conflict` + `survey` | saved to a revision older than the server's: `survey` is the version there now |
| 409 `slug_taken` | a live survey already has the address (on save or on opening) |
| 422 `invalid_survey` | not a survey: a field missing or of the wrong kind, too long, too many, an id twice; a live survey given an address people could not reach |
| 422 `unknown_image` | a picture the server does not have (any more) |
| 422 `survey_problems` + `problems` | opening one that has something to fix - the editor's sentences, from `surveyProblems()` |
| 409 `not_open` | closing a draft |

A picture is refused with 415 `not_an_image` (not PNG, JPEG, WebP, GIF or AVIF
by its own bytes - SVG never), 413 `too_large` (over 10 MB), 422 `image_size`
(over 10 000 px a side).

## Limits

| | |
| --- | --- |
| A JSON body | 256 kB; a survey's save 2 MB |
| A survey | 50 steps, 300 questions, 100 options a question, 10 pictures a question, 4 an option |
| Texts | title 200 characters, label 300, rich text 50 000 bytes of HTML |
| An answer | 10 000 characters of text, 1 000 for "Other" |
| A picture | 10 MB, 10 000 px a side |
