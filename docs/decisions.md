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
in the admin console anyway, and the site is theirs. It reaches the
administrators there are when it runs: a fresh IAM's migrations run before any
account exists, so there the role is given in the admin console like any other.

**No "no sign-in" mode.** The study apps run on the owner's own computer
without a login; this site is a public one (like genshin) - who answered is
the point of it. Locally it signs in through a local IAM, and the tests and
the browser check through a stand-in.

**No changelog.** The owner decided the survey site needs none (the other
anotoki sites have one); the version is in `frontend/package.json`.

**The admin area and the survey share one top bar.** People see the survey
and who they are signed in as; the way into the admin area shows only to
editors and admins.

## Languages

The first five are the owner's, made before any of it was built.

**The site's own words live in the database, like the genshin site's.** Tables
(`languages`, `translation_keys`, `translations`), a `translate` pipe with
keys, a language chooser, and the strings editable in the admin area. They are
rows rather than files in the build because they are reworded on the live
site: a file in the Angular build is overwritten by the next upload, and the
host has no shell to edit one with. There is no `site` scope and no HTML flag
on a string (genshin has both): one database, and no HTML ever goes through a
string.

**Only what somebody taking a survey sees is translated; the admin area stays
English.** Its words are written in its templates, as before, and the server's
sentences - which only the admin area shows - stay English too. So the pages
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

**Keys are the code's; the admin area only rewords.** Migrations write every
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
Czech readers read Slovak far more easily than English.

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
