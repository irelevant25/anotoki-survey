-----------------------------------------------------------
-- SIGNING IN THROUGH THE ANOTOKI LIBRARY: ITS WORDS
--
-- Signing in is the anotoki family's library's now (anotoki-lib 0.4.1's
-- auth module, @anotoki/lib/auth): the page the IAM sends the browser back
-- to - "Signing you in…" - and the screen of a sign-in that came back
-- without one, or could not start: "Signing in did not work", why, Try again
-- and Back. Its words are the library's, under anotoki.signIn., which its
-- migration set (anotoki_translations/003) adds after this site's files, and
-- for a library key that has no string at all.
--
-- Until now this site said four of them itself - the callback page's line
-- and three toasts: signIn.inProgress, signIn.notCompleted, signIn.failed and
-- signIn.storageUnavailable. Their strings move under the library's keys
-- here - every language, reworded in the admin panel or not, with who saved
-- it and when - so the screen says what this site said, and the library
-- leaves them be; the four keys go (nothing asks for them any more). A
-- language left without a string of its own stays without one (it reads the
-- English).
--
-- The library's Slovak speaks to the reader informally (ty); this site
-- speaks formally (Vy). Two more of its sign-in words speak to the reader -
-- "the sign-in took too long ... try again" and "signing in is not available
-- right now ... try again in a few minutes" - and have no key here: they are
-- written now, the library's English and this site's formal Slovak (the
-- pages keep the same for the time they have no strings: FORMAL_SLOVAK,
-- core/translations.ts). The rest - the screen's heading, Try again, Back -
-- speak to nobody, and the library's own words stand.
--
-- The engine runs this site's files before the library's, so this file finds
-- no library word of signing in yet. Where the library's files ran first all
-- the same (its 003 applied before this file arrived), its keys hold the
-- library's own words: those still exactly the library's give way to this
-- site's, and one reworded since on the library's key is the owner's, and
-- stays - 010's rule.
--
-- 003's rules hold: one string on a line, an apostrophe written twice and
-- nothing else escaped. The descriptions are the library's (its 003 writes
-- them); the temporary tables go at the end of the file's transaction.
-----------------------------------------------------------

-- The library's own words for every key this file writes, as its
-- anotoki_translations/003 writes them: what a library key still says when
-- that file ran before this one.
CREATE TEMPORARY TABLE library_words ON COMMIT DROP AS
SELECT w.key_name, w.language_code, w.value FROM (VALUES
    ('anotoki.signIn.signingIn', 'en', 'Signing you in…'),
    ('anotoki.signIn.signingIn', 'sk', 'Prihlasujeme ťa…'),
    ('anotoki.signIn.notCompleted', 'en', 'The sign-in was not completed.'),
    ('anotoki.signIn.notCompleted', 'sk', 'Prihlásenie sa nedokončilo.'),
    ('anotoki.signIn.expired', 'en', 'The sign-in took too long or did not start on this page. Try again.'),
    ('anotoki.signIn.expired', 'sk', 'Prihlásenie trvalo príliš dlho alebo sa nezačalo na tejto stránke. Skús to znova.'),
    ('anotoki.signIn.storageUnavailable', 'en', 'This browser does not let the site remember a sign-in. Allow the site''s storage, then try again.'),
    ('anotoki.signIn.storageUnavailable', 'sk', 'Tento prehliadač nedovolí stránke zapamätať si prihlásenie. Povoľ jej ukladanie údajov a skús to znova.'),
    ('anotoki.signIn.unavailable', 'en', 'Signing in is not available right now. Try again in a few minutes.'),
    ('anotoki.signIn.unavailable', 'sk', 'Prihlásenie teraz nie je dostupné. Skús to znova o pár minút.'),
    ('anotoki.signIn.failed', 'en', 'The sign-in failed ({code}).'),
    ('anotoki.signIn.failed', 'sk', 'Prihlásenie zlyhalo ({code}).')
) AS w(key_name, language_code, value);

-- The site's keys of signing in, each with the library's key that says that
-- word now.
CREATE TEMPORARY TABLE taken_over ON COMMIT DROP AS
SELECT m.own_key, m.library_key FROM (VALUES
    ('signIn.inProgress', 'anotoki.signIn.signingIn'),
    ('signIn.notCompleted', 'anotoki.signIn.notCompleted'),
    ('signIn.failed', 'anotoki.signIn.failed'),
    ('signIn.storageUnavailable', 'anotoki.signIn.storageUnavailable')
) AS m(own_key, library_key);

-- The ones still here: what this file moves (every one of them, the first
-- time it runs).
CREATE TEMPORARY TABLE moving ON COMMIT DROP AS
SELECT m.own_key, m.library_key
  FROM taken_over m
 WHERE EXISTS (SELECT 1 FROM translation_keys k WHERE k.name = m.own_key);

-- Every string of those keys as it stands - every language, reworded or not,
-- with who saved it and when: what the library's keys are to say.
CREATE TEMPORARY TABLE moved_words ON COMMIT DROP AS
SELECT m.library_key, t.language_code, t.value, t.updated_at, t.updated_by
  FROM moving m
  JOIN translations t ON t.key_name = m.own_key;

-- What the library's keys say already that is not the library's own words: a
-- rewording made on the library's key after its files ran (only ever where
-- they ran before this one). The owner's: it stays.
CREATE TEMPORARY TABLE held_before ON COMMIT DROP AS
SELECT t.key_name, t.language_code, t.value
  FROM translations t
 WHERE t.key_name IN (SELECT key_name FROM library_words)
   AND NOT EXISTS (SELECT 1 FROM library_words w
                    WHERE w.key_name = t.key_name AND w.language_code = t.language_code AND w.value = t.value);

-- The library's keys, ahead of the library's own file (its 003 writes their
-- descriptions, and leaves the strings this file gives them).
INSERT INTO translation_keys (name, description) VALUES
    ('anotoki.signIn.signingIn', 'The anotoki library''s words: anotoki_translations/003 describes them.'),
    ('anotoki.signIn.notCompleted', 'The anotoki library''s words: anotoki_translations/003 describes them.'),
    ('anotoki.signIn.expired', 'The anotoki library''s words: anotoki_translations/003 describes them.'),
    ('anotoki.signIn.storageUnavailable', 'The anotoki library''s words: anotoki_translations/003 describes them.'),
    ('anotoki.signIn.unavailable', 'The anotoki library''s words: anotoki_translations/003 describes them.'),
    ('anotoki.signIn.failed', 'The anotoki library''s words: anotoki_translations/003 describes them.')
ON CONFLICT (name) DO NOTHING;

-- Where the library's files ran first: its own words give way on the keys
-- this site's strings move to. A language this site has no string of its own
-- in then reads the English, as it did here.
DELETE FROM translations t
 USING library_words w
 WHERE t.key_name = w.key_name AND t.language_code = w.language_code AND t.value = w.value
   AND t.key_name IN (SELECT library_key FROM moving);

-- Every string of the site's keys under the library's key - with who saved it
-- and when.
INSERT INTO translations (key_name, language_code, value, updated_at, updated_by)
SELECT library_key, language_code, value, updated_at, updated_by FROM moved_words
ON CONFLICT (key_name, language_code) DO NOTHING;

-- The two library words that speak to the reader and had no key here: the
-- library's English, and this site's formal Slovak.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, v.language_code, v.value FROM (VALUES
    ('anotoki.signIn.expired', 'en', 'The sign-in took too long or did not start on this page. Try again.'),
    ('anotoki.signIn.expired', 'sk', 'Prihlásenie trvalo príliš dlho alebo sa nezačalo na tejto stránke. Skúste to, prosím, znova.'),
    ('anotoki.signIn.unavailable', 'en', 'Signing in is not available right now. Try again in a few minutes.'),
    ('anotoki.signIn.unavailable', 'sk', 'Prihlásenie teraz nie je dostupné. Skúste to, prosím, znova o pár minút.')
) AS v(key_name, language_code, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- Where the library's files ran first: its informal Slovak of those two, and
-- only while it is still the library's own words.
UPDATE translations t
   SET value = v.value, updated_at = CURRENT_TIMESTAMP, updated_by = NULL
  FROM (VALUES
    ('anotoki.signIn.expired', 'sk', 'Prihlásenie trvalo príliš dlho alebo sa nezačalo na tejto stránke. Skúste to, prosím, znova.'),
    ('anotoki.signIn.unavailable', 'sk', 'Prihlásenie teraz nie je dostupné. Skúste to, prosím, znova o pár minút.')
  ) AS v(key_name, language_code, value)
  JOIN library_words w ON w.key_name = v.key_name AND w.language_code = v.language_code
 WHERE t.key_name = v.key_name AND t.language_code = v.language_code AND t.value = w.value;

-- The site's keys go; their strings with them (ON DELETE CASCADE) - they are
-- under the library's keys now.
DELETE FROM translation_keys WHERE name IN (SELECT own_key FROM moving);

-- The card that stands where a page would be no longer says anything of a
-- sign-in that came back without one - the library's screen does: its
-- description says when it is drawn now (what a translator reads beside it).
UPDATE translation_keys
   SET description = 'Heading of the card drawn instead of a page people take surveys on while nobody is signed in there: the session ended with the page open (signed out in another tab, the IAM''s idle limit). A sign-in that came back without one is the anotoki library''s screen (anotoki.signIn.*). Under it signedOut.text and the Sign in button (common.signIn).'
 WHERE name = 'signedOut.heading';

-----------------------------------------------------------
-- PROVE IT
--
-- Every library key this file writes has its English string; every string of
-- the site's keys is under the library's key, word for word - or a rewording
-- made on the library's key since is - and nothing else is there (a library
-- word left over where this site had its own); the site's keys are gone; and
-- the library's informal Slovak of the words that speak to the reader is
-- nowhere.
-----------------------------------------------------------

DO $$
DECLARE
    missing TEXT;
    lost TEXT;
    stray TEXT;
    left_over TEXT;
    informal TEXT;
BEGIN
    SELECT string_agg(k.name, ', ' ORDER BY k.name) INTO missing
      FROM (VALUES
          ('anotoki.signIn.signingIn'), ('anotoki.signIn.notCompleted'), ('anotoki.signIn.expired'),
          ('anotoki.signIn.storageUnavailable'), ('anotoki.signIn.unavailable'), ('anotoki.signIn.failed')
      ) AS k(name)
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.name)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'en');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'library keys without an English string: %', missing;
    END IF;

    SELECT string_agg(m.library_key || ' (' || m.language_code || ')', ', ' ORDER BY m.library_key, m.language_code) INTO lost
      FROM moved_words m
     WHERE NOT EXISTS (SELECT 1 FROM translations t
                        WHERE t.key_name = m.library_key AND t.language_code = m.language_code AND t.value = m.value)
       AND NOT EXISTS (SELECT 1 FROM held_before h
                        JOIN translations t ON t.key_name = h.key_name AND t.language_code = h.language_code AND t.value = h.value
                        WHERE h.key_name = m.library_key AND h.language_code = m.language_code);
    IF lost IS NOT NULL THEN
        RAISE EXCEPTION 'strings that did not move under the library''s keys: %', lost;
    END IF;

    SELECT string_agg(t.key_name || ' (' || t.language_code || ')', ', ' ORDER BY t.key_name, t.language_code) INTO stray
      FROM translations t
     WHERE t.key_name IN (SELECT library_key FROM moving)
       AND NOT EXISTS (SELECT 1 FROM moved_words m WHERE m.library_key = t.key_name AND m.language_code = t.language_code AND m.value = t.value)
       AND NOT EXISTS (SELECT 1 FROM held_before h WHERE h.key_name = t.key_name AND h.language_code = t.language_code AND h.value = t.value);
    IF stray IS NOT NULL THEN
        RAISE EXCEPTION 'library keys saying what this site did not: %', stray;
    END IF;

    SELECT string_agg(m.own_key, ', ' ORDER BY m.own_key) INTO left_over
      FROM taken_over m
     WHERE EXISTS (SELECT 1 FROM translation_keys k WHERE k.name = m.own_key);
    IF left_over IS NOT NULL THEN
        RAISE EXCEPTION 'keys of the site still there, which nothing asks for any more: %', left_over;
    END IF;

    SELECT string_agg(t.key_name, ', ' ORDER BY t.key_name) INTO informal
      FROM translations t
      JOIN library_words w ON w.key_name = t.key_name AND w.language_code = t.language_code AND w.value = t.value
     WHERE t.language_code = 'sk'
       AND t.key_name IN ('anotoki.signIn.signingIn', 'anotoki.signIn.expired', 'anotoki.signIn.storageUnavailable', 'anotoki.signIn.unavailable');
    IF informal IS NOT NULL THEN
        RAISE EXCEPTION 'the library''s informal Slovak is still there: %', informal;
    END IF;
END $$;
