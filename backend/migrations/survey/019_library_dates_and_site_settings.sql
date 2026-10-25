-----------------------------------------------------------
-- ANOTOKI-LIB 0.11.0: THE LIBRARY'S DATES, AND THE SITE SETTINGS IN THE
-- AUDIT LOG'S FACT
--
-- The pages write their dates with the anotoki family's pipes now (anotoki-lib
-- 0.11.0's @anotoki/lib/ui/dates: anotokiDate, anotokiAgo), in place of this
-- site's own localDate pipe. Two of its words were this site's: what "how long
-- ago" says of a moment under a minute old, and of one two weeks or more away -
-- time.justNow and time.onDate. The library says them itself now, under
-- anotoki.dates.justNow and anotoki.dates.onDate, which its migration set
-- (anotoki_translations/014) adds after this site's files, writing a key's
-- strings only where it has none. Their strings move under the library's keys
-- here - every language, reworded in the admin panel or not, with who saved it
-- and when - so the pages say what this site said, and the library leaves them
-- be; the two keys go (nothing asks for them any more). A language left
-- without a string of its own stays without one (it reads the English). Neither
-- word speaks to the reader, so neither needs this site's formal Slovak: the
-- library's own Slovak is this site's word for word ("práve teraz", "{date}").
--
-- The engine runs this site's files before the library's, so this file finds no
-- library word of the dates yet. Where the library's 014 ran first all the same
-- (applied before this file arrived), its keys hold the library's own words:
-- those still exactly the library's give way to this site's, and one reworded
-- since on the library's key is the owner's, and stays - 010's and 012's rule.
--
-- And the site settings (the library's, anotoki_admin/003: maintenance, the
-- announcement, Page access) are an administrator's change like the others,
-- which the audit log keeps: the Privacy page's fact of the audit log
-- (legal.auditLog.what, 013) names them, in English and in this site's formal
-- Slovak - only where it is still 013's own words: an owner's rewording stays.
--
-- 003's rules hold: one string on a line, an apostrophe written twice and
-- nothing else escaped. The descriptions are the library's (its 014 writes
-- them); the temporary tables go at the end of the file's transaction.
-----------------------------------------------------------

-- The library's own words for every key this file writes, as its
-- anotoki_translations/014 writes them: what a library key still says when
-- that file ran before this one.
CREATE TEMPORARY TABLE library_words ON COMMIT DROP AS
SELECT w.key_name, w.language_code, w.value FROM (VALUES
    ('anotoki.dates.justNow', 'en', 'just now'),
    ('anotoki.dates.justNow', 'sk', 'práve teraz'),
    ('anotoki.dates.onDate', 'en', 'on {date}'),
    ('anotoki.dates.onDate', 'sk', '{date}')
) AS w(key_name, language_code, value);

-- The site's keys of the dates, each with the library's key that says that
-- word now.
CREATE TEMPORARY TABLE taken_over ON COMMIT DROP AS
SELECT m.own_key, m.library_key FROM (VALUES
    ('time.justNow', 'anotoki.dates.justNow'),
    ('time.onDate', 'anotoki.dates.onDate')
) AS m(own_key, library_key);

-- The ones still here: what this file moves (both of them, the first time it
-- runs).
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

-- The library's keys, ahead of the library's own file (its 014 writes their
-- descriptions, and leaves the strings this file gives them).
INSERT INTO translation_keys (name, description) VALUES
    ('anotoki.dates.justNow', 'The anotoki library''s words: anotoki_translations/014 describes them.'),
    ('anotoki.dates.onDate', 'The anotoki library''s words: anotoki_translations/014 describes them.')
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

-- The site's keys go; their strings with them (ON DELETE CASCADE) - they are
-- under the library's keys now.
DELETE FROM translation_keys WHERE name IN (SELECT own_key FROM moving);

-- The audit log's fact names the site settings - where its words are still
-- 013's own.
UPDATE translations
   SET value = 'What the site''s editors and administrators do in its admin panel - surveys made, opened, closed and deleted, answers deleted, the site''s words, languages and settings changed, backups and the database''s updates - and what the site does there by itself, such as the daily backup: who did what, and when. Never an IP address.',
       updated_at = CURRENT_TIMESTAMP,
       updated_by = NULL
 WHERE key_name = 'legal.auditLog.what' AND language_code = 'en'
   AND value = 'What the site''s editors and administrators do in its admin panel - surveys made, opened, closed and deleted, answers deleted, the site''s words and languages changed, backups and the database''s updates - and what the site does there by itself, such as the daily backup: who did what, and when. Never an IP address.';

UPDATE translations
   SET value = 'Čo robia redaktori a správcovia stránky v jej administrátorskom paneli – vytvorené, otvorené, zatvorené a zmazané prieskumy, zmazané odpovede, zmeny textov, jazykov a nastavení stránky, zálohy a aktualizácie databázy – a čo tam stránka robí sama, napríklad dennú zálohu: kto čo urobil a kedy. IP adresu nikdy.',
       updated_at = CURRENT_TIMESTAMP,
       updated_by = NULL
 WHERE key_name = 'legal.auditLog.what' AND language_code = 'sk'
   AND value = 'Čo robia redaktori a správcovia stránky v jej administrátorskom paneli – vytvorené, otvorené, zatvorené a zmazané prieskumy, zmazané odpovede, zmeny textov a jazykov stránky, zálohy a aktualizácie databázy – a čo tam stránka robí sama, napríklad dennú zálohu: kto čo urobil a kedy. IP adresu nikdy.';

-----------------------------------------------------------
-- PROVE IT
--
-- Every library key this file writes has its English string; every string of
-- the site's keys is under the library's key, word for word - or a rewording
-- made on the library's key since is - and nothing else is there (a library
-- word left over where this site had its own); the site's keys are gone; and
-- the audit log's fact says 013's words in no language any more.
-----------------------------------------------------------

DO $$
DECLARE
    missing TEXT;
    lost TEXT;
    stray TEXT;
    left_over TEXT;
    unsaid TEXT;
BEGIN
    SELECT string_agg(k.name, ', ' ORDER BY k.name) INTO missing
      FROM (VALUES
          ('anotoki.dates.justNow'), ('anotoki.dates.onDate')
      ) AS k(name)
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.name)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'en');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION '019: library keys without an English string: %', missing;
    END IF;

    SELECT string_agg(m.library_key || ' (' || m.language_code || ')', ', ' ORDER BY m.library_key, m.language_code) INTO lost
      FROM moved_words m
     WHERE NOT EXISTS (SELECT 1 FROM translations t
                        WHERE t.key_name = m.library_key AND t.language_code = m.language_code AND t.value = m.value)
       AND NOT EXISTS (SELECT 1 FROM held_before h
                        JOIN translations t ON t.key_name = h.key_name AND t.language_code = h.language_code AND t.value = h.value
                        WHERE h.key_name = m.library_key AND h.language_code = m.language_code);
    IF lost IS NOT NULL THEN
        RAISE EXCEPTION '019: strings that did not move under the library''s keys: %', lost;
    END IF;

    SELECT string_agg(t.key_name || ' (' || t.language_code || ')', ', ' ORDER BY t.key_name, t.language_code) INTO stray
      FROM translations t
     WHERE t.key_name IN (SELECT library_key FROM moving)
       AND NOT EXISTS (SELECT 1 FROM moved_words m WHERE m.library_key = t.key_name AND m.language_code = t.language_code AND m.value = t.value)
       AND NOT EXISTS (SELECT 1 FROM held_before h WHERE h.key_name = t.key_name AND h.language_code = t.language_code AND h.value = t.value);
    IF stray IS NOT NULL THEN
        RAISE EXCEPTION '019: library keys saying what this site did not: %', stray;
    END IF;

    SELECT string_agg(m.own_key, ', ' ORDER BY m.own_key) INTO left_over
      FROM taken_over m
     WHERE EXISTS (SELECT 1 FROM translation_keys k WHERE k.name = m.own_key);
    IF left_over IS NOT NULL THEN
        RAISE EXCEPTION '019: keys of the site still there, which nothing asks for any more: %', left_over;
    END IF;

    SELECT string_agg(t.language_code, ', ' ORDER BY t.language_code) INTO unsaid
      FROM translations t
     WHERE t.key_name = 'legal.auditLog.what'
       AND t.value IN (
           'What the site''s editors and administrators do in its admin panel - surveys made, opened, closed and deleted, answers deleted, the site''s words and languages changed, backups and the database''s updates - and what the site does there by itself, such as the daily backup: who did what, and when. Never an IP address.',
           'Čo robia redaktori a správcovia stránky v jej administrátorskom paneli – vytvorené, otvorené, zatvorené a zmazané prieskumy, zmazané odpovede, zmeny textov a jazykov stránky, zálohy a aktualizácie databázy – a čo tam stránka robí sama, napríklad dennú zálohu: kto čo urobil a kedy. IP adresu nikdy.'
       );
    IF unsaid IS NOT NULL THEN
        RAISE EXCEPTION '019: the audit log''s fact does not name the site settings in: %', unsaid;
    END IF;
END $$;
