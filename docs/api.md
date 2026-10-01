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
| `GET /api/translations/{code}` | the site's own words in a language: `{language, languages, values, english?}`; `If-None-Match` → 304; 404 `not_found` for a code that is not one |

### The site's words: the bundle

What every page starts with (`TranslationService`), the same for everybody - no
token is looked at, not even a bad one:

- `values`: the flat `{key: text}` map of the language asked for, **with
  English merged underneath** - a key that has no string in it comes in English;
- `languages`: the ones on offer, `[{code, name, nativeName}]`, in their order
  (`sort_order`, then name). There is no other public list of languages;
- `english`: English's own map, **left out when `language` is `en`** - the
  admin area reads English whatever the person reads, without a second request;
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

Signed in or not (`optionalUser`): anybody may read a survey that is not a
draft; whoever is signed in also learns whether they have answered it.

| Route | Answers |
| --- | --- |
| `GET /api/surveys` | `{surveys: [{survey, answeredAt}]}` - the surveys taking answers now, newest opened first |
| `GET /api/surveys/{slug}` | `{survey, answeredAt}` - open or closed; 404 for a draft or nothing |
| `POST /api/surveys/{slug}/responses` | signed in: `{aboutYou: {gender, age} \| null, answers: {questionId: {optionIds, other, text}}, language, startedAt}` → 201 `{id, submittedAt}` |

A `survey` here carries its `language` and, of its `translations`, only those
into languages people are offered (below: *A survey's languages*).

Sending answers is refused with:

| Status, code | When |
| --- | --- |
| 401 `sign_in_required` | no token |
| 404 `not_found` | no such survey, or a draft - or an address that is not one (not even UTF-8). Also answers sent to the address a survey had before an editor changed it (or an ADMIN deleted it) while the person was in it: the page says so (`take.refused.gone`) and becomes "There is no survey here"; the draft is kept by the survey's id, so the new address offers to carry on |
| 409 `not_open` | closed, or its last day is over everywhere |
| 409 `already_answered` | this person answered it before (also two sends at once) |
| 422 `invalid_answer` + `questionId` | an answer not good enough, in the page's words: "Question 2: Please choose an answer." (`about-gender`, `about-age` for those) - or not an answer at all (a list for a choice, a number for text) |

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

## The admin area

EDITOR or ADMIN for all of it (`requireRole`): 401 without a token, 403
`forbidden` without the role. ADMIN alone for the three deletes (a survey,
somebody's answers, a language).

| Route | Answers |
| --- | --- |
| `GET /api/admin/surveys` | `{surveys: [summary]}` - id, slug, title, status, closesOn, the times, revision, and counts: steps, questions, responses |
| `POST /api/admin/surveys` | `{survey}` → 201 `{survey}`: a new draft from what the editor made (`newSurvey()`, or `copySurvey()` for a copy - the status and ids of the survey itself are the server's) |
| `GET /api/admin/surveys/{id}` | `{survey}` |
| `PUT /api/admin/surveys/{id}` | `{revision, survey}` → `{survey}` with the next revision |
| `POST /api/admin/surveys/{id}/status` | `{status: "open" \| "closed", closesOn?}` → `{survey}` with the next revision (the closing day is part of what editors save) |
| `DELETE /api/admin/surveys/{id}` | ADMIN → 204; its answers go with it |
| `GET /api/admin/surveys/{id}/responses` | `{responses: [SurveyResponse]}` - newest first, each with `person: {id, name, email}` and `language` (the code the survey was read in, or null) |
| `DELETE /api/admin/responses/{id}` | ADMIN → 204: that person may take the survey again |
| `POST /api/admin/images` | the picture's bytes, `Content-Type: image/*` → 201 `{image: {id, alt, width, height, src}}` |

A survey is refused with:

| Status, code | When |
| --- | --- |
| 409 `conflict` + `survey` | saved to a revision older than the server's: `survey` is the version there now |
| 409 `slug_taken` | a live survey already has the address (on save or on opening) |
| 422 `invalid_survey` | not a survey: a field missing or of the wrong kind, too long, too many, an id twice; a live survey given an address people could not reach; no `language` or no `translations`; a language the site does not have - or one deleted while the save was on its way; a translation into the language the survey is written in; a level of a translation that is not an object; another `language` than the stored one while both the stored and the sent survey hold translations |
| 422 `unknown_image` | a picture the server does not have (any more) |
| 422 `survey_problems` + `problems` | opening one that has something to fix - the editor's sentences, from `surveyProblems()`; what a translation into an offered language still lacks is among them |
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
    "steps":     { "<step id>": { "title": "" } },
    "questions": { "<question id>": {
      "text": "<rich text>", "placeholder": "",
      "options": { "<option id>": { "label": "" } },
      "images":  { "<picture id>": { "alt": "" } }
    } }
  }
}
```

- Only texts: ids, structure, pictures and limits are the survey's own. The
  `images` are the pictures under the question's text (an option's pictures
  have no description); the same picture twice shares one entry.
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
  dropped, and every text is cleaned and measured like the one it translates
  (`richTextClean()`, the same limits).
- **Every map goes out as a JSON object, at all five levels** (`translations`,
  `steps`, `questions`, `options`, `images`), empty or not, whatever the ids
  look like (`"0"`, `"1"`).
- The admin routes send every translation; the routes for people only those
  into languages that are offered.
- A translation is *whole* when every text the survey has is there
  (`surveyTranslationGaps()` / `translationGaps()`). Opening is refused while a
  translation into an offered language is not (`survey_problems`: "Slovak: the
  title is missing.", "Slovak: question 2 has 3 texts to translate.", "Slovak:
  question 2 has two options called "Áno"."); one into a hidden language may be
  as unfinished as it likes.

### The languages and the site's strings

A `{code}` that is not a language's is 404 `not_found`.

| Route | Answers |
| --- | --- |
| `GET /api/admin/languages` | `{languages: [{code, name, nativeName, enabled, sortOrder, seeded}]}` - every language, the hidden ones too; `seeded`: the migrations write strings for it |
| `POST /api/admin/languages` | `{code, name, nativeName, enabled?}` → 201 `{language}`: after the ones there are; offered at once unless `enabled` is `false` (the Languages page always sends it, and adds a language hidden unless told otherwise) |
| `PUT /api/admin/languages/{code}` | `{name?, nativeName?, enabled?, sortOrder?}` → `{language}`; what is not sent stays |
| `DELETE /api/admin/languages/{code}` | ADMIN → 204; its strings go with it. It waits for a survey's save that is on its way in that language, and then counts it |
| `GET /api/admin/translations` | `{languages: [all], keys: [{name, description, values: {code: text}}]}` - the keys by name |
| `PUT /api/admin/translations` | `{values: {key: {code: text}}}`, **only the cells that changed** → the grid as it is now |
| `GET /api/admin/translations/{code}/export` | that language's own strings as a flat `{key: text}` - not merged with English, `{}` when it has none |
| `PUT /api/admin/translations/{code}/import` | a flat `{key: text}` → the grid as it is now; an empty string - nothing in it to see - is passed over (an import deletes nothing) |

A save of strings is checked whole before anything is written
(`translationsCheck()` - the import and the command line go through it too),
and written in one transaction, by key and then by language whatever order the
cells were sent in - so two saves of the same strings wait for each other
rather than deadlock. An empty string for another language than English
deletes that string (the language then reads the key in English). **Empty is a
string with nothing in it to see**: no character but white space, separators
and format characters - spaces, or a zero-width space, a word joiner or a soft
hyphen alone (`textBlank()`; a language's name of that kind is no name). A string
sent as it is stays as it was, with who wrote it and when; otherwise
`updated_by` is the request's person. Two people changing the same string: the
last save is kept. The keys themselves are the code's - migrations write them,
no route does.

The first thing wrong is what is refused. A key is looked at first (the
shape of its cells, then whether the site has it); then, string by string: the
language, that it is text, empty or not, its length, its braces, its
placeholders.

| Status, code | When |
| --- | --- |
| 422 `invalid_language` | a code that is not two small letters (or two and two with a dash); a name that is not 1 to 50 characters, or has nothing in it to see; `enabled` not `true` or `false` (adding or changing: a text, a number, `null`); `sortOrder` not a whole number 0-1000 |
| 409 `language_exists` | adding a code the site has |
| 422 `too_many_languages` | adding a twenty-first - two people adding the twentieth at the same moment wait for each other, and the second is refused |
| 409 `fallback_language` | switching English off, or deleting it |
| 409 `seeded_language` | deleting a language the migrations write strings for (`en`, `sk`): it can be switched off |
| 409 `language_in_use` + `surveys` | deleting a language a survey is written in or translated into; `surveys` is how many |
| 422 `invalid_value` | not `{key: {code: text}}` (an import: not a flat object); a value that is not text, or longer than 2000 characters |
| 422 `unknown_key` + `key`, `keys` | a key the site does not have; `keys` lists every such key sent |
| 422 `unknown_language` | a language the site does not have |
| 422 `fallback_required` | an empty English string (nothing in it to see): every other language falls back to it |
| 422 `invalid_placeholder` | a `{` or `}` that is not part of a `{placeholder}`, in any language: `{ count }`, `{počet}`, `{count`, `{{count}}`. The page fills in only what is written exactly as `{name}` (a letter, then letters, digits, `_`) and would show the rest as it stands; the sentence names one of the key's own placeholders as the example - or, for a key that has none, ends "This key has no placeholder, so its strings can hold no { or }." |
| 422 `placeholder_changed` + `placeholder` | an English string whose `{placeholders}` are not exactly the stored English string's |
| 422 `unknown_placeholder` + `placeholder` | another language's string with a `{placeholder}` the English one does not have (leaving one out is fine) |

The refusals about one string carry `key` and `language`, so the page can show
the sentence beside its cell.

A picture is refused with 415 `not_an_image` (not PNG, JPEG, WebP, GIF or AVIF
by its own bytes - SVG never), 413 `too_large` (over 10 MB), 422 `image_size`
(over 10 000 px a side).

## Limits

| | |
| --- | --- |
| A JSON body | 256 kB; a survey's save - with all its translations - 2 MB; a save or an import of strings 1 MB |
| A survey | 50 steps, 300 questions, 100 options a question, 10 pictures a question, 4 an option; translations into no more languages than the site has |
| Texts | title 200 characters, label 300, rich text 50 000 bytes of HTML - a translated text the same as the one it translates |
| The site's words | 20 languages; a language's name 50 characters; a string 2000 characters |
| An answer | 10 000 characters of text, 1 000 for "Other" |
| A picture | 10 MB, 10 000 px a side |
