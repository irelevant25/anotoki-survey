-----------------------------------------------------------
-- WHAT THE TOP BAR SAYS WHEN THE ACCOUNT DOES NOT TAKE A CHOICE
--
-- The theme, the date order, the clock and the language are the person's
-- anotoki account's now (the IAM's migration 015, the owner's decision of
-- 2026-10-06): every anotoki site follows them, and the top bar's theme and
-- language, used by somebody signed in, save the choice to the account. Two
-- toasts for a save that does not go through: the theme goes back to the
-- account's; the language stays on the page for the visit. A language the
-- IAM does not offer is not one of these - it is this site's own choice, and
-- nothing is said.
--
-- 003's pattern: every insert steps aside for a row that is already there
-- (a string reworded in the admin area is the owner's); one string on a line,
-- an apostrophe written twice and nothing else escaped. Slovak speaks to the
-- reader formally (Vy, with its capital).
-----------------------------------------------------------

INSERT INTO translation_keys (name, description) VALUES
    -- theme: the light / dark / automatic control in the top bar
    ('theme.notSaved', 'Toast when a theme chosen in the top bar by somebody signed in could not be saved to their anotoki account (which every anotoki site follows): the page goes back to the account''s theme. In the admin panel too, in English. No placeholders.'),
    -- language: the chooser in the top bar
    ('language.notSaved', 'Toast when a language chosen in the top bar by somebody signed in could not be saved to their anotoki account (the IAM out of reach, the sign-in ended): the page stays in it until it is loaded again, and the other anotoki sites keep the account''s. Not said for a language the IAM does not offer - that one is this site''s own choice. No placeholders.')
ON CONFLICT (name) DO NOTHING;

-- English: what every other language falls back to, string by string.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'en', v.value FROM (VALUES
    -- theme: the light / dark / automatic control in the top bar
    ('theme.notSaved', 'The theme could not be saved to your anotoki account. Please try again.'),
    -- language: the chooser in the top bar
    ('language.notSaved', 'The language could not be saved to your anotoki account - it holds for this visit only.')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- Slovak.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'sk', v.value FROM (VALUES
    -- theme: the light / dark / automatic control in the top bar
    ('theme.notSaved', 'Vzhľad sa nepodarilo uložiť do Vášho anotoki účtu. Skúste to, prosím, znova.'),
    -- language: the chooser in the top bar
    ('language.notSaved', 'Jazyk sa nepodarilo uložiť do Vášho anotoki účtu – platí len počas tejto návštevy.')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-----------------------------------------------------------
-- PROVE IT
--
-- Every key this file writes reads in both languages.
-----------------------------------------------------------

DO $$
DECLARE
    missing TEXT;
BEGIN
    SELECT string_agg(k.name, ', ' ORDER BY k.name) INTO missing
      FROM (VALUES
          ('theme.notSaved'),
          ('language.notSaved')
      ) AS k(name)
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.name)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'en')
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'sk');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'keys without an English and a Slovak string: %', missing;
    END IF;
END $$;
