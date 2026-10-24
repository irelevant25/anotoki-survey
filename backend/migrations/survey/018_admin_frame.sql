-----------------------------------------------------------
-- THE ADMIN PANEL IN THE FAMILY'S FRAME
--
-- The owner, 2026-10-24: every anotoki admin panel looks like genshin's - its
-- pages in a column on the left, the page on the right, and no top bar
-- (anotoki-lib 0.10.0's <anotoki-admin-frame>, sites/admin/app.component.ts).
-- The column starts with the panel's name, a link to its home whose words are
-- its own name ("anotoki survey · admin panel": brand.area and
-- brand.adminPanel, the words the bar's wordmark said it with).
--
-- So the name the top bar gave that link in the admin area goes: nothing says
-- "anotoki survey admin panel: all surveys" any more. A key the code stops
-- using is deleted by a migration (017's pattern; its strings follow it, ON
-- DELETE CASCADE - a reworded one too, for nothing shows it).
-----------------------------------------------------------

DELETE FROM translation_keys WHERE name = 'topbar.homeAdmin';

-----------------------------------------------------------
-- PROVE IT
--
-- No key and no string of it is left.
-----------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM translation_keys WHERE name = 'topbar.homeAdmin')
       OR EXISTS (SELECT 1 FROM translations WHERE key_name = 'topbar.homeAdmin') THEN
        RAISE EXCEPTION '018: the name the top bar gave the admin panel''s home is still there';
    END IF;
END $$;
