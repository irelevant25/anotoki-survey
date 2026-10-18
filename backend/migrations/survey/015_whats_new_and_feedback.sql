-----------------------------------------------------------
-- WHAT'S NEW, AND HOW LONG A FEEDBACK MESSAGE IS KEPT
--
-- The owner, 2026-10-18: the survey gets what the family's footer shows on
-- every site - its version, What's new and the feedback form.
--
-- What's new: the dialog that lists the survey's versions, newest first,
-- and what each changed for the people who use it (frontend
-- public/changelog.json - the entries themselves are written there, in
-- English and formal Slovak; these are the dialog's own words around them).
--
-- Feedback: the form is the anotoki library's, and so are the Privacy
-- page's words of what it keeps and what for (anotoki.legal.feedback*). How
-- long is this site's to say: a message marked as spam or resolved goes
-- 30 or 365 days later, but only at the library's clean-up, which runs at
-- most once a day after a message comes in or the Feedback page is opened -
-- the library's own words say neither. No address is in it: where a link
-- goes is the code's, never a string an administrator can reword.
--
-- 003's pattern: every insert steps aside for a row that is already there
-- (a string reworded in the admin area is the owner's); one string on a
-- line, an apostrophe written twice and nothing else escaped. Slovak speaks
-- to the reader formally (Vy, with its capital).
-----------------------------------------------------------

INSERT INTO translation_keys (name, description) VALUES
    -- legal: the survey's own facts on the anotoki library's legal pages
    ('legal.feedback.kept', 'Privacy policy (/privacy), the part "Feedback" (its heading, what it keeps and what for are the anotoki library''s): how long a message sent with the feedback form stays - also its line under "How long it is kept". True of the code (the anotoki library''s Feedback): until an administrator deals with it; marked as spam, it goes 30 days later, resolved, 365 days later - each at the next clean-up, which runs at most once a day, after a message comes in or an administrator opens the Feedback page; when the sender''s anotoki account is deleted, their messages lose the reply address and the browser''s name, and keep their words. No placeholders.'),
    -- whatsNew: the What's new dialog - the survey's versions and what each changed (public/changelog.json)
    ('whatsNew.added', 'What''s new: the heading of a version''s list of what it added - something people can do now that they could not before. No placeholders.'),
    ('whatsNew.fixed', 'What''s new: the heading of a version''s list of what it put right. No placeholders.'),
    ('whatsNew.latest', 'What''s new: the mark beside the newest version - the one the site runs now. Short. No placeholders.'),
    ('whatsNew.title', 'What''s new: the heading of the dialog that lists the survey''s versions, newest first, and what each changed for the people who use it (opened from the foot of the pages). No placeholders.'),
    ('whatsNew.updated', 'What''s new: the heading of a version''s list of what works or looks otherwise now. No placeholders.'),
    ('whatsNew.version', 'What''s new: a version''s name, above what it changed. {version}: its number, such as 0.4.0 - keep it as it is. Placeholders: {version}.')
ON CONFLICT (name) DO NOTHING;

-- English: what every other language falls back to, string by string.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'en', v.value FROM (VALUES
    -- legal
    ('legal.feedback.kept', 'Until it is dealt with. A message marked as spam goes 30 days after that, a resolved one 365 days after - at the next clean-up, which the site runs at most once a day, when a message comes in or an administrator opens the list of messages. When the sender''s anotoki account is deleted, the reply address and the browser go from their messages; the words stay.'),
    -- whatsNew
    ('whatsNew.added', 'Added'),
    ('whatsNew.fixed', 'Fixed'),
    ('whatsNew.latest', 'Latest'),
    ('whatsNew.title', 'What''s new'),
    ('whatsNew.updated', 'Changed'),
    ('whatsNew.version', 'Version {version}')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- Slovak: formal (Vy, with its capital).
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'sk', v.value FROM (VALUES
    -- legal
    ('legal.feedback.kept', 'Kým sa nevybaví. Správa označená za spam sa zmaže 30 dní potom, vyriešená 365 dní potom – pri najbližšom upratovaní, ktoré stránka robí najviac raz za deň, keď príde nová správa alebo keď správca otvorí zoznam správ. Po zmazaní účtu anotoki odosielateľa sa z jeho správ odstráni adresa na odpoveď aj údaj o prehliadači; text správ zostáva.'),
    -- whatsNew
    ('whatsNew.added', 'Pridané'),
    ('whatsNew.fixed', 'Opravené'),
    ('whatsNew.latest', 'Najnovšia'),
    ('whatsNew.title', 'Čo je nové'),
    ('whatsNew.updated', 'Zmenené'),
    ('whatsNew.version', 'Verzia {version}')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-----------------------------------------------------------
-- PROVE IT
--
-- Every key of this file has its English and its Slovak string.
-----------------------------------------------------------

DO $$
DECLARE
    missing TEXT;
BEGIN
    SELECT string_agg(k.name, ', ' ORDER BY k.name) INTO missing
      FROM (VALUES
          ('legal.feedback.kept'),
          ('whatsNew.added'), ('whatsNew.fixed'), ('whatsNew.latest'), ('whatsNew.title'), ('whatsNew.updated'), ('whatsNew.version')
      ) AS k(name)
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.name)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'en')
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'sk');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'keys without an English and a Slovak string: %', missing;
    END IF;
END $$;
