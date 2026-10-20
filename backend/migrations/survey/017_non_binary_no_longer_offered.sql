-----------------------------------------------------------
-- "NON-BINARY" IS NO LONGER OFFERED
--
-- The owner, 2026-10-20: the "About you" gender question offers Male,
-- Female and Prefer not to say. A new answer cannot say "non-binary" any
-- more (SURVEY_GENDERS, api/survey_rules.php); every answer sent before
-- keeps what it said - not one is rewritten here, and the responses' CHECK
-- (001) still holds the value, so a kept one stays valid. The admin panel
-- shows a kept one under its label from the code (ALL_GENDERS,
-- core/survey/about-you.ts): it is English, written in the code, and the
-- only place a kept answer is ever shown.
--
-- So the string the question said it with goes: only the page a person
-- answers on reads the site's words, and it offers the answer no more. A key
-- the code stops using is deleted by a migration (009's pattern; its strings
-- follow it, ON DELETE CASCADE - a reworded one too, for nothing shows it).
-----------------------------------------------------------

DELETE FROM translation_keys WHERE name = 'aboutYou.gender.non-binary';

-----------------------------------------------------------
-- PROVE IT
--
-- No key and no string of it is left.
-----------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM translation_keys WHERE name = 'aboutYou.gender.non-binary')
       OR EXISTS (SELECT 1 FROM translations WHERE key_name = 'aboutYou.gender.non-binary') THEN
        RAISE EXCEPTION '017: the string of "Non-binary" is still there';
    END IF;
END $$;
