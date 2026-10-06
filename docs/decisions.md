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

**No changelog.** The owner decided the survey site needs none (the other
anotoki sites have one); the version is in `frontend/package.json`.

**The admin panel and the survey share one top bar - the anotoki family's.**
The owner made every anotoki site (the IAM, the survey, Japanese, Piano, the
build analyzer; not genshin) look and work one way, and this site's bar is the
one the others copy: one row - the brand (the mark, "anotoki" and the site's
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
gained one with the "admin panel" round, and this one now has the same, the
IAM's page as the model: `/admin/migrations`, Pending (in the order they will
run) and Applied (with when), "Apply pending" behind a question, and after it
"Up to date", "There was nothing to apply" or "Stopped at <file>" with what was
applied first and **the database's whole error** in a box - PostgreSQL's own
words, to an ADMIN, on this computer and on a host alike (the owner's decision
for every site: on a host with only FTP that page is where the error can be
read; it is logged too). Applying the database's updates is an ADMIN's, not an
EDITOR's - the server refuses an EDITOR, and the frontend shows them neither
the link nor the page. One update at a time, whoever starts it: the Apply,
`setup.php`'s Save and `php migration.php` take one PostgreSQL advisory lock
(`api/database_update.php`), and the second is told another is running. A
pending migration still closes the site to everybody (503 `not_set_up`, now
with `update: true`), but not to the ADMIN who must apply it: signing in, the
site's strings and the two migrations routes keep answering, and the "not set
up yet" page links a signed-in ADMIN to the Migrations page (in English - it
is the admin panel's; somebody taking surveys and an EDITOR keep the page as it
was). After an Apply that applied something the strings are read again
(`TranslationService.reload()`), so a key it brought never shows as itself,
and once nothing is pending the site runs where it stands, without a reload.
The bar's Migrations link is English in the code rather than a key: the admin
panel is English, and a key would have needed a migration with a Slovak string
nobody ever reads. `setup.php` stays a way to apply them (and the only one for
a database with nothing in it yet).

**Every page is for somebody signed in - while the IAM says sign-in is
required.** The owner: the survey (like the IAM, Japanese and Piano) requires
a sign-in at minimum - nothing but the sign-in prompt for anybody else. So
every page goes to the IAM first and comes back to the address asked for, and
the API answers nothing of a survey without a token; a survey's welcome is no
longer shown to visitors before they sign in (it was, until the family's
change). Only the boot pages (not set up, cannot be reached) draw without it.
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
the verifier - no site writes its own fetch) and relays it in
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
changes and two visitors never share one), and "Not signed in" stands where a
person's address is - the one place a person and a visitor differ in the
lists. The plan also gave the row a "Visitor" badge; beside "Visitor 12" it
said the same thing twice, so it was left out. An IAM account that happens to
be called "Visitor 12" still shows its address, which tells the two apart.

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
  the account refuses goes back to the account's, with a toast
  (`theme.notSaved`); a language stays on the page for the visit - silently
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
empty (`textBlank()`): English refuses it, another language's row is deleted,
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
