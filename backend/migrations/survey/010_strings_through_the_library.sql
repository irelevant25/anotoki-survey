-----------------------------------------------------------
-- THE SITE'S WORDS THROUGH THE ANOTOKI LIBRARY
--
-- The site's words - the languages, the keys, the strings and the admin
-- panel's Translations and Languages pages - are the anotoki family's
-- library's now (anotoki-lib 0.3.0, Anotoki\Lib\Translations and
-- @anotoki/lib/translations): the same three tables, kept by one
-- implementation on every anotoki site. The library has words of its own,
-- under its namespace `anotoki.` - its UI kit's (the top bar, the language and
-- theme switches, a dialog's X, a notification's) and its status page's. Its
-- migration set (anotoki_translations) adds them after this site's own
-- migrations, and writes strings only for a library key that has none.
--
-- Until now the kit read its words from this site's own keys (core/kit.ts).
-- From now it reads the library's, so this file moves the site's strings
-- under them first - every language, reworded in the admin panel or not, with
-- who saved it and when: what the bar, the switches and the dialogs said here
-- they go on saying, and the library leaves them be. A language left without
-- a string of its own stays without one (it reads the English). Twenty-two
-- keys only the kit asked for go, their strings with them. Three keys the
-- site's own pages ask for too stay where they are and are copied: from now
-- on the kit's word and the page's are reworded each on its own.
--
-- The library's Slovak speaks to the reader informally (ty); this site speaks
-- formally (Vy, with its capital). Six of its words that speak to the reader
-- move here in this site's formal words; the other two - the copy button's
-- "copying did not work" and the status page's "try again in a few minutes"
-- - have no key here, and are written now: the library's English, and the
-- formal Slovak the pages kept for them until now (core/kit.ts,
-- core/migrations.ts).
--
-- The engine runs this site's files before the library's, so this file finds
-- no library word yet. Where the library's files ran first all the same (an
-- upload applied before this file arrived), its keys hold the library's own
-- words: those still exactly the library's give way to this site's - a
-- language this site left without a string goes without one there too - and
-- one reworded since on the library's key is the owner's, and stays.
--
-- 003's rules hold: one string on a line, an apostrophe written twice and
-- nothing else escaped. The descriptions are the library's (its 002 writes
-- them); the temporary tables go at the end of the file's transaction.
-----------------------------------------------------------

-- The library's own words for every key this file writes, as its
-- anotoki_translations/002 writes them: what a library key still says when
-- that file ran before this one.
CREATE TEMPORARY TABLE library_words ON COMMIT DROP AS
SELECT w.key_name, w.language_code, w.value FROM (VALUES
    ('anotoki.ui.close', 'en', 'Close'),
    ('anotoki.ui.close', 'sk', 'Zavrieť'),
    ('anotoki.ui.dismiss', 'en', 'Dismiss'),
    ('anotoki.ui.dismiss', 'sk', 'Zavrieť'),
    ('anotoki.ui.notifications', 'en', 'Notifications'),
    ('anotoki.ui.notifications', 'sk', 'Oznámenia'),
    ('anotoki.ui.cancel', 'en', 'Cancel'),
    ('anotoki.ui.cancel', 'sk', 'Zrušiť'),
    ('anotoki.ui.confirm', 'en', 'Confirm'),
    ('anotoki.ui.confirm', 'sk', 'Potvrdiť'),
    ('anotoki.ui.retry', 'en', 'Try again'),
    ('anotoki.ui.retry', 'sk', 'Skúsiť znova'),
    ('anotoki.ui.copyFailed', 'en', 'Copying did not work. Select the text and copy it yourself.'),
    ('anotoki.ui.copyFailed', 'sk', 'Kopírovanie nefungovalo. Označ text a skopíruj ho ručne.'),
    ('anotoki.topbar.sections', 'en', 'Main navigation'),
    ('anotoki.topbar.sections', 'sk', 'Hlavná navigácia'),
    ('anotoki.topbar.phoneMenu', 'en', 'Menu'),
    ('anotoki.topbar.phoneMenu', 'sk', 'Ponuka'),
    ('anotoki.topbar.menuButton', 'en', 'Your menu: {name}'),
    ('anotoki.topbar.menuButton', 'sk', 'Tvoja ponuka: {name}'),
    ('anotoki.topbar.menu', 'en', 'Your menu'),
    ('anotoki.topbar.menu', 'sk', 'Tvoja ponuka'),
    ('anotoki.topbar.roleAdmin', 'en', 'Administrator'),
    ('anotoki.topbar.roleAdmin', 'sk', 'Administrátor'),
    ('anotoki.topbar.roleEditor', 'en', 'Editor'),
    ('anotoki.topbar.roleEditor', 'sk', 'Editor'),
    ('anotoki.topbar.account', 'en', 'Your anotoki account'),
    ('anotoki.topbar.account', 'sk', 'Tvoj anotoki účet'),
    ('anotoki.topbar.admin', 'en', 'Admin panel'),
    ('anotoki.topbar.admin', 'sk', 'Administrátorský panel'),
    ('anotoki.topbar.signIn', 'en', 'Sign in'),
    ('anotoki.topbar.signIn', 'sk', 'Prihlásiť sa'),
    ('anotoki.topbar.signOut', 'en', 'Sign out'),
    ('anotoki.topbar.signOut', 'sk', 'Odhlásiť sa'),
    ('anotoki.language.button', 'en', 'Language: {name} ({code})'),
    ('anotoki.language.button', 'sk', 'Jazyk: {name} ({code})'),
    ('anotoki.language.notLoaded', 'en', 'The language could not be loaded. Try again.'),
    ('anotoki.language.notLoaded', 'sk', 'Jazyk sa nepodarilo načítať. Skús to znova.'),
    ('anotoki.language.notSaved', 'en', 'The language could not be saved to your anotoki account - it holds for this visit only.'),
    ('anotoki.language.notSaved', 'sk', 'Jazyk sa nepodarilo uložiť do tvojho anotoki účtu - platí len počas tejto návštevy.'),
    ('anotoki.theme.label', 'en', 'Theme'),
    ('anotoki.theme.label', 'sk', 'Vzhľad'),
    ('anotoki.theme.light', 'en', 'Light'),
    ('anotoki.theme.light', 'sk', 'Svetlý'),
    ('anotoki.theme.dark', 'en', 'Dark'),
    ('anotoki.theme.dark', 'sk', 'Tmavý'),
    ('anotoki.theme.auto', 'en', 'Automatic'),
    ('anotoki.theme.auto', 'sk', 'Automaticky'),
    ('anotoki.theme.autoHint', 'en', 'As your device is set'),
    ('anotoki.theme.autoHint', 'sk', 'Podľa nastavenia zariadenia'),
    ('anotoki.theme.notSaved', 'en', 'The theme could not be saved to your anotoki account.'),
    ('anotoki.theme.notSaved', 'sk', 'Vzhľad sa nepodarilo uložiť do tvojho anotoki účtu.'),
    ('anotoki.siteStatus.unavailableText', 'en', 'Please try again in a few minutes. This page reloads by itself.'),
    ('anotoki.siteStatus.unavailableText', 'sk', 'Skús to znova o pár minút. Táto stránka sa obnoví sama.')
) AS w(key_name, language_code, value);

-- The site's keys the kit read its words from, each with the library's key that
-- says that word now. Kept: the site's own pages ask for it too - its strings
-- are copied, and the key stays.
CREATE TEMPORARY TABLE taken_over ON COMMIT DROP AS
SELECT m.own_key, m.library_key, m.kept FROM (VALUES
    ('common.close', 'anotoki.ui.close', TRUE),
    ('toast.dismiss', 'anotoki.ui.dismiss', FALSE),
    ('toast.region', 'anotoki.ui.notifications', FALSE),
    ('common.cancel', 'anotoki.ui.cancel', FALSE),
    ('common.confirm', 'anotoki.ui.confirm', FALSE),
    ('common.tryAgain', 'anotoki.ui.retry', TRUE),
    ('topbar.sections', 'anotoki.topbar.sections', FALSE),
    ('topbar.phoneMenu', 'anotoki.topbar.phoneMenu', FALSE),
    ('topbar.menuButton', 'anotoki.topbar.menuButton', FALSE),
    ('topbar.menu', 'anotoki.topbar.menu', FALSE),
    ('topbar.roleAdmin', 'anotoki.topbar.roleAdmin', FALSE),
    ('topbar.roleEditor', 'anotoki.topbar.roleEditor', FALSE),
    ('topbar.account', 'anotoki.topbar.account', FALSE),
    ('topbar.admin', 'anotoki.topbar.admin', FALSE),
    ('common.signIn', 'anotoki.topbar.signIn', TRUE),
    ('common.signOut', 'anotoki.topbar.signOut', FALSE),
    ('language.button', 'anotoki.language.button', FALSE),
    ('language.notLoaded', 'anotoki.language.notLoaded', FALSE),
    ('language.notSaved', 'anotoki.language.notSaved', FALSE),
    ('theme.label', 'anotoki.theme.label', FALSE),
    ('theme.light', 'anotoki.theme.light', FALSE),
    ('theme.dark', 'anotoki.theme.dark', FALSE),
    ('theme.auto', 'anotoki.theme.auto', FALSE),
    ('theme.autoHint', 'anotoki.theme.autoHint', FALSE),
    ('theme.notSaved', 'anotoki.theme.notSaved', FALSE)
) AS m(own_key, library_key, kept);

-- The ones still here: what this file moves (every one of them, the first
-- time it runs).
CREATE TEMPORARY TABLE moving ON COMMIT DROP AS
SELECT m.own_key, m.library_key, m.kept
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
-- they ran before this one). Newer than this site's string, and the owner's:
-- it stays.
CREATE TEMPORARY TABLE held_before ON COMMIT DROP AS
SELECT t.key_name, t.language_code, t.value
  FROM translations t
 WHERE t.key_name IN (SELECT key_name FROM library_words)
   AND NOT EXISTS (SELECT 1 FROM library_words w
                    WHERE w.key_name = t.key_name AND w.language_code = t.language_code AND w.value = t.value);

-- The library's keys, ahead of the library's own file (its 002 writes their
-- descriptions, and leaves the strings this file gives them).
INSERT INTO translation_keys (name, description) VALUES
    ('anotoki.ui.close', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.ui.dismiss', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.ui.notifications', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.ui.cancel', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.ui.confirm', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.ui.retry', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.ui.copyFailed', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.topbar.sections', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.topbar.phoneMenu', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.topbar.menuButton', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.topbar.menu', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.topbar.roleAdmin', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.topbar.roleEditor', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.topbar.account', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.topbar.admin', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.topbar.signIn', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.topbar.signOut', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.language.button', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.language.notLoaded', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.language.notSaved', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.theme.label', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.theme.light', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.theme.dark', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.theme.auto', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.theme.autoHint', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.theme.notSaved', 'The anotoki library''s words: anotoki_translations/002 describes them.'),
    ('anotoki.siteStatus.unavailableText', 'The anotoki library''s words: anotoki_translations/002 describes them.')
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
-- library's English, and the formal Slovak the pages kept for them.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, v.language_code, v.value FROM (VALUES
    ('anotoki.ui.copyFailed', 'en', 'Copying did not work. Select the text and copy it yourself.'),
    ('anotoki.ui.copyFailed', 'sk', 'Kopírovanie nefungovalo. Označte text a skopírujte ho ručne.'),
    ('anotoki.siteStatus.unavailableText', 'en', 'Please try again in a few minutes. This page reloads by itself.'),
    ('anotoki.siteStatus.unavailableText', 'sk', 'Skúste to, prosím, znova o pár minút. Táto stránka sa obnoví sama.')
) AS v(key_name, language_code, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- Where the library's files ran first: its informal Slovak of those two, and
-- only while it is still the library's own words.
UPDATE translations t
   SET value = v.value, updated_at = CURRENT_TIMESTAMP, updated_by = NULL
  FROM (VALUES
    ('anotoki.ui.copyFailed', 'sk', 'Kopírovanie nefungovalo. Označte text a skopírujte ho ručne.'),
    ('anotoki.siteStatus.unavailableText', 'sk', 'Skúste to, prosím, znova o pár minút. Táto stránka sa obnoví sama.')
  ) AS v(key_name, language_code, value)
  JOIN library_words w ON w.key_name = v.key_name AND w.language_code = v.language_code
 WHERE t.key_name = v.key_name AND t.language_code = v.language_code AND t.value = w.value;

-- The keys only the kit asked for go; their strings with them (ON DELETE
-- CASCADE) - they are under the library's keys now.
DELETE FROM translation_keys WHERE name IN (SELECT own_key FROM moving WHERE NOT kept);

-- The three the site's own pages ask for too: said now for those pages alone.
UPDATE translation_keys
   SET description = 'The close button (an X) of a survey''s picture shown large (the lightbox): its accessible name. The dialogs'' X is the anotoki library''s word (anotoki.ui.close).'
 WHERE name = 'common.close';

UPDATE translation_keys
   SET description = 'Shared: the button that repeats what failed - the "cannot be reached" page (the whole start again), the home page''s "could not be loaded" alert, the survey page under "The survey could not be loaded". The Slovak is the IAM''s term (common.retry). A box of the anotoki library''s says its own (anotoki.ui.retry).'
 WHERE name = 'common.tryAgain';

UPDATE translation_keys
   SET description = 'The Sign in button where a page says somebody is not signed in (the "You are not signed in" card) and on the notice a visitor reads. The top bar''s Sign in is the anotoki library''s word (anotoki.topbar.signIn).'
 WHERE name = 'common.signIn';

-----------------------------------------------------------
-- PROVE IT
--
-- Every library key this file writes has its English string; every string of
-- the site's keys is under the library's key, word for word - or a rewording
-- made on the library's key since is - and nothing else is there (a library
-- word left over where this site had its own, or none); the kit's keys are
-- gone, the three pages' keys stay; and the library's informal Slovak of the
-- two words that speak to the reader is nowhere.
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
          ('anotoki.ui.close'), ('anotoki.ui.dismiss'), ('anotoki.ui.notifications'), ('anotoki.ui.cancel'), ('anotoki.ui.confirm'),
          ('anotoki.ui.retry'), ('anotoki.ui.copyFailed'),
          ('anotoki.topbar.sections'), ('anotoki.topbar.phoneMenu'), ('anotoki.topbar.menuButton'), ('anotoki.topbar.menu'),
          ('anotoki.topbar.roleAdmin'), ('anotoki.topbar.roleEditor'), ('anotoki.topbar.account'), ('anotoki.topbar.admin'),
          ('anotoki.topbar.signIn'), ('anotoki.topbar.signOut'),
          ('anotoki.language.button'), ('anotoki.language.notLoaded'), ('anotoki.language.notSaved'),
          ('anotoki.theme.label'), ('anotoki.theme.light'), ('anotoki.theme.dark'), ('anotoki.theme.auto'), ('anotoki.theme.autoHint'),
          ('anotoki.theme.notSaved'),
          ('anotoki.siteStatus.unavailableText')
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
     WHERE (NOT m.kept AND EXISTS (SELECT 1 FROM translation_keys k WHERE k.name = m.own_key))
        OR (m.kept AND NOT EXISTS (SELECT 1 FROM translation_keys k WHERE k.name = m.own_key));
    IF left_over IS NOT NULL THEN
        RAISE EXCEPTION 'keys of the site not as this file leaves them (gone where only the kit used them, there where a page does): %', left_over;
    END IF;

    SELECT string_agg(t.key_name, ', ' ORDER BY t.key_name) INTO informal
      FROM translations t
      JOIN library_words w ON w.key_name = t.key_name AND w.language_code = t.language_code AND w.value = t.value
     WHERE t.language_code = 'sk' AND t.key_name IN ('anotoki.ui.copyFailed', 'anotoki.siteStatus.unavailableText');
    IF informal IS NOT NULL THEN
        RAISE EXCEPTION 'the library''s informal Slovak is still there: %', informal;
    END IF;
END $$;
