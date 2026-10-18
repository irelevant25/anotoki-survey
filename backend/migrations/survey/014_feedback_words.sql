-----------------------------------------------------------
-- THE FEEDBACK FORM'S WORDS, IN THIS SITE'S FORMAL SLOVAK
--
-- The survey takes feedback now (the owner, 2026-10-18): the anotoki
-- family's form (@anotoki/lib/feedback/form), which the Contact page opens
-- and the family's footer will. Its words are the library's, under
-- anotoki.feedback., which its migration set writes (anotoki_translations/
-- 004) - on every database of this site installed before this file, that
-- file ran already; on a new one this site's files run first, and this file
-- finds no key of the form's yet.
--
-- The library's Slovak speaks to the reader informally (ty); this site
-- speaks formally (Vy, with its capital). Sixteen of the form's words speak
-- to the reader - its title and lead, the message and the address with their
-- hints, the thanks, what it says of a message it could not send, the field
-- for robots - and are written here in this site's formal Slovak (the pages
-- keep the same for the time they have no strings: FORMAL_SLOVAK,
-- core/translations.ts). The rest - the kinds of message, Subject, Send, a
-- field too long - speak to nobody, and the library's own words stand.
--
-- Where the library's file ran first, a key's Slovak still exactly the
-- library's gives way to this site's; one reworded since is the owner's, and
-- stays - 010's and 012's rule. Where this file runs first, it writes the
-- keys ahead of the library's file (which writes their descriptions then,
-- and leaves the strings it finds) with the library's English and this
-- site's Slovak.
--
-- 003's rules hold: one string on a line, an apostrophe written twice and
-- nothing else escaped. The temporary tables go at the end of the file's
-- transaction.
-----------------------------------------------------------

-- The library's own Slovak of every key this file writes, as its
-- anotoki_translations/004 writes it: what a library key still says when that
-- file ran before this one.
CREATE TEMPORARY TABLE library_words ON COMMIT DROP AS
SELECT w.key_name, w.language_code, w.value FROM (VALUES
    ('anotoki.feedback.title', 'sk', 'Pošli nám spätnú väzbu'),
    ('anotoki.feedback.lead', 'sk', 'Niečo nefunguje, máš nápad alebo otázku? Napíš nám - čítame každú správu.'),
    ('anotoki.feedback.message', 'sk', 'Tvoja správa'),
    ('anotoki.feedback.email', 'sk', 'Tvoja e-mailová adresa'),
    ('anotoki.feedback.emailHint', 'sk', 'Len ak chceš odpoveď. Na nič iné ju nepoužijeme.'),
    ('anotoki.feedback.anonymousHint', 'sk', 'Nepôjde s ňou ani tvoj účet, ani tvoja adresa.'),
    ('anotoki.feedback.thanksText', 'sk', 'Tvoja správa je na ceste k nám.'),
    ('anotoki.feedback.messageRequired', 'sk', 'Najprv napíš správu.'),
    ('anotoki.feedback.subjectRequired', 'sk', 'Doplň predmet.'),
    ('anotoki.feedback.tooManyHour', 'sk', 'Ďakujeme - no to je veľa správ za krátky čas. Skús to znova o hodinu.'),
    ('anotoki.feedback.tooManyDay', 'sk', 'Ďakujeme - no dnes prišlo veľa správ. Skús to znova zajtra.'),
    ('anotoki.feedback.unavailable', 'sk', 'Správy teraz nemôžeš poslať. Skús to znova o pár minút.'),
    ('anotoki.feedback.signInRequired', 'sk', 'Na poslanie správy sa prihlás.'),
    ('anotoki.feedback.failed', 'sk', 'Správu sa nepodarilo poslať. Skús to znova - tvoj text tu stále je.'),
    ('anotoki.feedback.network', 'sk', 'Stránka nie je dostupná. Skontroluj pripojenie a skús to znova.'),
    ('anotoki.feedback.honeypot', 'sk', 'Toto pole nechaj prázdne')
) AS w(key_name, language_code, value);

-- What this site says for them: the library's English, word for word, and
-- this site's formal Slovak.
CREATE TEMPORARY TABLE site_words ON COMMIT DROP AS
SELECT s.key_name, s.language_code, s.value FROM (VALUES
    ('anotoki.feedback.title', 'en', 'Send feedback'),
    ('anotoki.feedback.title', 'sk', 'Pošlite nám spätnú väzbu'),
    ('anotoki.feedback.lead', 'en', 'Something broken, an idea, a question? Tell us - every message is read.'),
    ('anotoki.feedback.lead', 'sk', 'Niečo nefunguje, máte nápad alebo otázku? Napíšte nám – čítame každú správu.'),
    ('anotoki.feedback.message', 'en', 'Your message'),
    ('anotoki.feedback.message', 'sk', 'Vaša správa'),
    ('anotoki.feedback.email', 'en', 'Your e-mail address'),
    ('anotoki.feedback.email', 'sk', 'Vaša e-mailová adresa'),
    ('anotoki.feedback.emailHint', 'en', 'Only if you would like an answer. It is used for nothing else.'),
    ('anotoki.feedback.emailHint', 'sk', 'Len ak chcete odpoveď. Na nič iné ju nepoužijeme.'),
    ('anotoki.feedback.anonymousHint', 'en', 'Neither your account nor your address goes with it.'),
    ('anotoki.feedback.anonymousHint', 'sk', 'Nepôjde s ňou ani Váš účet, ani Vaša adresa.'),
    ('anotoki.feedback.thanksText', 'en', 'Your message is on its way to us.'),
    ('anotoki.feedback.thanksText', 'sk', 'Vaša správa je na ceste k nám.'),
    ('anotoki.feedback.messageRequired', 'en', 'Write a message first.'),
    ('anotoki.feedback.messageRequired', 'sk', 'Najprv napíšte správu.'),
    ('anotoki.feedback.subjectRequired', 'en', 'Give it a subject.'),
    ('anotoki.feedback.subjectRequired', 'sk', 'Doplňte, prosím, predmet.'),
    ('anotoki.feedback.tooManyHour', 'en', 'Thank you - but that is a lot of messages in a short while. Try again in an hour.'),
    ('anotoki.feedback.tooManyHour', 'sk', 'Ďakujeme – no to je veľa správ za krátky čas. Skúste to, prosím, znova o hodinu.'),
    ('anotoki.feedback.tooManyDay', 'en', 'Thank you - but there have been a lot of messages today. Try again tomorrow.'),
    ('anotoki.feedback.tooManyDay', 'sk', 'Ďakujeme – no dnes prišlo veľa správ. Skúste to, prosím, znova zajtra.'),
    ('anotoki.feedback.unavailable', 'en', 'Messages cannot be sent right now. Try again in a few minutes.'),
    ('anotoki.feedback.unavailable', 'sk', 'Správy teraz nemôžete poslať. Skúste to, prosím, znova o pár minút.'),
    ('anotoki.feedback.signInRequired', 'en', 'Sign in to send a message.'),
    ('anotoki.feedback.signInRequired', 'sk', 'Na poslanie správy sa, prosím, prihláste.'),
    ('anotoki.feedback.failed', 'en', 'The message could not be sent. Try again - what you wrote is still here.'),
    ('anotoki.feedback.failed', 'sk', 'Správu sa nepodarilo poslať. Skúste to, prosím, znova – Váš text tu stále je.'),
    ('anotoki.feedback.network', 'en', 'The site could not be reached. Check the connection, then try again.'),
    ('anotoki.feedback.network', 'sk', 'Stránka nie je dostupná. Skontrolujte pripojenie a skúste to znova.'),
    ('anotoki.feedback.honeypot', 'en', 'Leave this field empty'),
    ('anotoki.feedback.honeypot', 'sk', 'Toto pole nechajte prázdne')
) AS s(key_name, language_code, value);

-- The library's keys, ahead of the library's own file where this one runs
-- first (its 004 writes their descriptions, and leaves the strings this file
-- gives them).
INSERT INTO translation_keys (name, description) VALUES
    ('anotoki.feedback.title', 'The anotoki library''s words: anotoki_translations/004 describes them.'),
    ('anotoki.feedback.lead', 'The anotoki library''s words: anotoki_translations/004 describes them.'),
    ('anotoki.feedback.message', 'The anotoki library''s words: anotoki_translations/004 describes them.'),
    ('anotoki.feedback.email', 'The anotoki library''s words: anotoki_translations/004 describes them.'),
    ('anotoki.feedback.emailHint', 'The anotoki library''s words: anotoki_translations/004 describes them.'),
    ('anotoki.feedback.anonymousHint', 'The anotoki library''s words: anotoki_translations/004 describes them.'),
    ('anotoki.feedback.thanksText', 'The anotoki library''s words: anotoki_translations/004 describes them.'),
    ('anotoki.feedback.messageRequired', 'The anotoki library''s words: anotoki_translations/004 describes them.'),
    ('anotoki.feedback.subjectRequired', 'The anotoki library''s words: anotoki_translations/004 describes them.'),
    ('anotoki.feedback.tooManyHour', 'The anotoki library''s words: anotoki_translations/004 describes them.'),
    ('anotoki.feedback.tooManyDay', 'The anotoki library''s words: anotoki_translations/004 describes them.'),
    ('anotoki.feedback.unavailable', 'The anotoki library''s words: anotoki_translations/004 describes them.'),
    ('anotoki.feedback.signInRequired', 'The anotoki library''s words: anotoki_translations/004 describes them.'),
    ('anotoki.feedback.failed', 'The anotoki library''s words: anotoki_translations/004 describes them.'),
    ('anotoki.feedback.network', 'The anotoki library''s words: anotoki_translations/004 describes them.'),
    ('anotoki.feedback.honeypot', 'The anotoki library''s words: anotoki_translations/004 describes them.')
ON CONFLICT (name) DO NOTHING;

-- Where this file runs first: the library's English and this site's Slovak.
-- Where the library's ran first, its strings are there, and stay - but for
-- the next statement.
INSERT INTO translations (key_name, language_code, value)
SELECT key_name, language_code, value FROM site_words
ON CONFLICT (key_name, language_code) DO NOTHING;

-- Where the library's file ran first: its informal Slovak gives way to this
-- site's formal one - only while it is still the library's own words, word
-- for word.
UPDATE translations t
   SET value = s.value, updated_at = CURRENT_TIMESTAMP, updated_by = NULL
  FROM site_words s
  JOIN library_words w ON w.key_name = s.key_name AND w.language_code = s.language_code
 WHERE t.key_name = s.key_name AND t.language_code = s.language_code AND t.value = w.value;

-----------------------------------------------------------
-- PROVE IT
--
-- Every key this file writes has its English and its Slovak string, and the
-- library's informal Slovak of them is nowhere: each is this site's formal
-- one, or the owner's rewording.
-----------------------------------------------------------

DO $$
DECLARE
    missing TEXT;
    informal TEXT;
BEGIN
    SELECT string_agg(k.name, ', ' ORDER BY k.name) INTO missing
      FROM (VALUES
          ('anotoki.feedback.title'), ('anotoki.feedback.lead'), ('anotoki.feedback.message'), ('anotoki.feedback.email'),
          ('anotoki.feedback.emailHint'), ('anotoki.feedback.anonymousHint'), ('anotoki.feedback.thanksText'),
          ('anotoki.feedback.messageRequired'), ('anotoki.feedback.subjectRequired'), ('anotoki.feedback.tooManyHour'),
          ('anotoki.feedback.tooManyDay'), ('anotoki.feedback.unavailable'), ('anotoki.feedback.signInRequired'),
          ('anotoki.feedback.failed'), ('anotoki.feedback.network'), ('anotoki.feedback.honeypot')
      ) AS k(name)
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.name)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'en')
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'sk');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'library keys of the feedback form without an English or a Slovak string: %', missing;
    END IF;

    SELECT string_agg(t.key_name, ', ' ORDER BY t.key_name) INTO informal
      FROM translations t
      JOIN library_words w ON w.key_name = t.key_name AND w.language_code = t.language_code AND w.value = t.value;
    IF informal IS NOT NULL THEN
        RAISE EXCEPTION 'the library''s informal Slovak is still there: %', informal;
    END IF;
END $$;
