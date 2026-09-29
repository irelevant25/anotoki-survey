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
in the admin console anyway, and the site is theirs.

**No "no sign-in" mode.** The study apps run on the owner's own computer
without a login; this site is a public one (like genshin) - who answered is
the point of it. Locally it signs in through a local IAM, and the tests and
the browser check through a stand-in.

**No changelog.** The owner decided the survey site needs none (the other
anotoki sites have one); the version is in `frontend/package.json`.

**The admin area and the survey share one top bar.** People see the survey
and who they are signed in as; the way into the admin area shows only to
editors and admins.
