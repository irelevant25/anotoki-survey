-----------------------------------------------------------
-- THE FAMILY'S TOP BAR, AND SIGNING IN FIRST
--
-- The top bar is now the one every anotoki site has: the mark, the site's
-- sections as links (where people take surveys: Surveys; in the admin area:
-- Surveys, Translations, Languages), then the language, the theme and the
-- person's menu. On a phone the links and the person's menu fold into one
-- menu button. In the admin area the person's menu leads back to the
-- surveys.
--
-- And the site is for people signed in, every page of it: somebody who is
-- not is sent to the IAM before anything of a survey shows. What is left to
-- say to somebody signed out is said where the page would be - a session that
-- ended with the page open, or a sign-in that came back without one - so the
-- survey page's own sign-in card is gone, and its strings with it. A
-- sign-in that cannot even start - the browser refuses the site its storage,
-- where the sign-in in progress is kept - now says why, instead of leaving
-- a blank page.
--
-- The language button shows the current language's code ("SK"); its
-- accessible name now says that code too ("Language: Slovenčina (SK)"), so
-- somebody who speaks to the computer can say "click SK" (WCAG 2.5.3, Label
-- in Name). 003's strings are reworded only where they are still 003's.
--
-- Every anotoki site calls its admin area the same now: the admin panel. The
-- person's menu says "Admin panel" ("Administrátorský panel") where it said
-- "Admin" ("Administrácia"), the admin area's wordmark reads "anotoki survey
-- · admin panel" (on a phone "survey" with "admin panel" small under it), and
-- the mark's link there is named after it - again only
-- where 003's string is still as 003 wrote it.
--
-- 003's pattern: every insert steps aside for a row that is already there
-- (a string reworded in the admin area is the owner's); one string on a line,
-- an apostrophe written twice and nothing else escaped. Slovak speaks to the
-- reader formally (Vy, with its capital).
-----------------------------------------------------------

INSERT INTO translation_keys (name, description) VALUES
    -- topbar: the bar across the top of every page
    ('topbar.surveys', 'Link in the top bar (both areas): where people take surveys, the list of open surveys; in the admin area, the list of all surveys. On a phone it is an item of the menu (topbar.phoneMenu).'),
    ('topbar.translations', 'Link in the admin area''s top bar: the page of the site''s strings. The admin area always reads the English.'),
    ('topbar.languages', 'Link in the admin area''s top bar: the page of the site''s languages. The admin area always reads the English.'),
    ('topbar.sections', 'Accessible name of the top bar''s row of links (Surveys, and in the admin area Translations and Languages): what a screen reader calls that navigation.'),
    ('topbar.phoneMenu', 'On a phone: the accessible name of the menu button at the right of the top bar, and of the menu it opens - the links (topbar.surveys...) and the signed-in person''s menu. Short.'),
    ('topbar.backToSurveys', 'Item of the person''s menu for staff in the admin area: back to the pages people take surveys on.'),
    -- brand: the wordmark
    ('brand.adminPanel', 'In the admin area''s top bar, after the wordmark ("anotoki" + brand.area) and a dot: what part of the site this is - "anotoki survey · admin panel"; on a phone and a narrow bar it stands small under brand.area. Lower case, like brand.area. The admin area always reads the English.'),
    -- signedOut: what stands where a page would be while nobody is signed in
    ('signedOut.heading', 'Heading of the card drawn instead of a page people take surveys on while nobody is signed in: the session ended with the page open, or a sign-in came back without one. Under it signedOut.text and the Sign in button (common.signIn).'),
    ('signedOut.text', 'Text of that card (signedOut.heading): what signing in is for, and that the person comes back to this page with the answers they had begun.'),
    -- signIn: the way in
    ('signIn.storageUnavailable', 'Toast when a sign-in cannot even start: the browser refuses the site''s storage (blocked cookies and site data, some private modes), where the sign-in in progress is kept until the IAM sends the person back. The page shows its signed-out card under it. No placeholders.')
ON CONFLICT (name) DO NOTHING;

-- English: what every other language falls back to, string by string.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'en', v.value FROM (VALUES
    -- topbar: the bar across the top of every page
    ('topbar.surveys', 'Surveys'),
    ('topbar.translations', 'Translations'),
    ('topbar.languages', 'Languages'),
    ('topbar.sections', 'The site''s sections'),
    ('topbar.phoneMenu', 'Menu'),
    ('topbar.backToSurveys', 'Back to the surveys'),
    -- brand: the wordmark
    ('brand.adminPanel', 'admin panel'),
    -- signedOut: what stands where a page would be while nobody is signed in
    ('signedOut.heading', 'You are not signed in'),
    ('signedOut.text', 'The surveys are for people signed in with their anotoki account, which makes sure everyone answers once. Sign in, and you are back on this page - with any answers you had begun.'),
    -- signIn: the way in
    ('signIn.storageUnavailable', 'This browser would not let the site remember the sign-in in progress. Allow this site to store data (cookies and site data), then sign in again.')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- Slovak.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'sk', v.value FROM (VALUES
    -- topbar: the bar across the top of every page
    ('topbar.surveys', 'Prieskumy'),
    ('topbar.translations', 'Preklady'),
    ('topbar.languages', 'Jazyky'),
    ('topbar.sections', 'Časti stránky'),
    ('topbar.phoneMenu', 'Ponuka'),
    ('topbar.backToSurveys', 'Späť na prieskumy'),
    -- brand: the wordmark
    ('brand.adminPanel', 'administrátorský panel'),
    -- signedOut: what stands where a page would be while nobody is signed in
    ('signedOut.heading', 'Nie ste prihlásení'),
    ('signedOut.text', 'Prieskumy sú pre prihlásených s anotoki účtom, ktorý zaručuje, že každý odpovie iba raz. Po prihlásení sa vrátite na túto stránku aj s rozpracovanými odpoveďami.'),
    -- signIn: the way in
    ('signIn.storageUnavailable', 'Tento prehliadač nedovolil stránke zapamätať si prebiehajúce prihlásenie. Povoľte tejto stránke ukladať údaje (súbory cookie a údaje stránok) a potom sa prihláste znova.')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- No longer used: the survey page's sign-in card (nobody signed out reaches a
-- survey now), and the admin menu's "The open surveys" (now "Back to the
-- surveys"). Their strings go with them (ON DELETE CASCADE).
DELETE FROM translation_keys
 WHERE name IN ('take.signIn.heading', 'take.signIn.text', 'take.signIn.button', 'topbar.openSurveys');

-- The language button's accessible name holds the code the button shows
-- (WCAG 2.5.3, Label in Name). Only a string still as 003 wrote it is
-- reworded: one reworded in the admin area is the owner's. The Slovak takes
-- {code} only where the English now has it - a language may leave out a
-- placeholder of the English, never add one.
UPDATE translation_keys
   SET description = 'The accessible name of the language chooser''s button in the top bar, which shows the current language''s code. {name} is the current language as its speakers write it ("Slovenčina"); {code} is the code the button shows ("SK"). Keep {code} in it: somebody who speaks to the computer names the button by what it shows.'
 WHERE name = 'language.button';

UPDATE translations
   SET value = 'Language: {name} ({code})'
 WHERE key_name = 'language.button' AND language_code = 'en' AND value = 'Language: {name}';

UPDATE translations
   SET value = 'Jazyk: {name} ({code})'
 WHERE key_name = 'language.button' AND language_code = 'sk' AND value = 'Jazyk: {name}'
   AND EXISTS (SELECT 1 FROM translations e WHERE e.key_name = 'language.button' AND e.language_code = 'en' AND e.value = 'Language: {name} ({code})');

-- The admin panel, by that name: the person's menu and the mark's link in the
-- admin area. Only a string still as 003 wrote it.
UPDATE translation_keys
   SET description = 'Menu item for staff (EDITOR, ADMIN) where people take surveys: into the admin panel. Every anotoki site calls it the same: "Admin panel".'
 WHERE name = 'topbar.admin';

UPDATE translations SET value = 'Admin panel'
 WHERE key_name = 'topbar.admin' AND language_code = 'en' AND value = 'Admin';

UPDATE translations SET value = 'Administrátorský panel'
 WHERE key_name = 'topbar.admin' AND language_code = 'sk' AND value = 'Administrácia';

UPDATE translation_keys
   SET description = 'Accessible name of the mark in the admin area''s top bar: a link to the list of all surveys. It begins with what the wordmark there shows ("anotoki survey · admin panel", brand.adminPanel). The admin area always reads the English.'
 WHERE name = 'topbar.homeAdmin';

UPDATE translations SET value = 'anotoki survey admin panel: all surveys'
 WHERE key_name = 'topbar.homeAdmin' AND language_code = 'en' AND value = 'anotoki survey: all surveys';

UPDATE translations SET value = 'anotoki prieskum, administrátorský panel: všetky prieskumy'
 WHERE key_name = 'topbar.homeAdmin' AND language_code = 'sk' AND value = 'anotoki prieskum: všetky prieskumy';

-----------------------------------------------------------
-- PROVE IT
--
-- Every key this file writes reads in both languages, the keys it retires
-- are gone, and the language button's name and the admin panel's two are
-- reworded wherever they were still 003's.
-----------------------------------------------------------

DO $$
DECLARE
    missing TEXT;
    left_over TEXT;
BEGIN
    SELECT string_agg(k.name, ', ' ORDER BY k.name) INTO missing
      FROM (VALUES
          ('topbar.surveys'), ('topbar.translations'), ('topbar.languages'), ('topbar.sections'), ('topbar.phoneMenu'),
          ('topbar.backToSurveys'), ('brand.adminPanel'),
          ('signedOut.heading'), ('signedOut.text'),
          ('signIn.storageUnavailable')
      ) AS k(name)
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.name)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'en')
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'sk');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'keys without an English and a Slovak string: %', missing;
    END IF;

    SELECT string_agg(name, ', ' ORDER BY name) INTO left_over
      FROM translation_keys
     WHERE name IN ('take.signIn.heading', 'take.signIn.text', 'take.signIn.button', 'topbar.openSurveys');
    IF left_over IS NOT NULL THEN
        RAISE EXCEPTION 'keys this migration retires are still there: %', left_over;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM translation_keys WHERE name = 'language.button' AND description LIKE '%{code}%') THEN
        RAISE EXCEPTION 'language.button''s description does not name {code}';
    END IF;
    IF EXISTS (SELECT 1 FROM translations WHERE key_name = 'language.button' AND language_code = 'en' AND value = 'Language: {name}')
       OR EXISTS (SELECT 1 FROM translations WHERE key_name = 'language.button' AND language_code = 'sk' AND value = 'Jazyk: {name}')
          AND EXISTS (SELECT 1 FROM translations WHERE key_name = 'language.button' AND language_code = 'en' AND value = 'Language: {name} ({code})') THEN
        RAISE EXCEPTION 'language.button still reads as 003 wrote it, without the code the button shows';
    END IF;
    IF EXISTS (SELECT 1 FROM translations
                WHERE (key_name, language_code, value) IN (('topbar.admin', 'en', 'Admin'), ('topbar.admin', 'sk', 'Administrácia'),
                       ('topbar.homeAdmin', 'en', 'anotoki survey: all surveys'), ('topbar.homeAdmin', 'sk', 'anotoki prieskum: všetky prieskumy'))) THEN
        RAISE EXCEPTION 'the admin panel is still called as 003 wrote it';
    END IF;
END $$;
