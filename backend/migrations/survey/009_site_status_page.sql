-----------------------------------------------------------
-- THE "NOT SET UP YET" PAGE GOES
--
-- While the site cannot run - not set up, a database update waiting, the
-- database out of reach - every anotoki site now draws the family's one page
-- for it (the library @anotoki/lib, the owner's decision of 2026-10-07): in
-- its own words, English and Slovak; to visitors and signed-in people a calm
-- "the site is being updated", to the site's ADMIN the way to the Migrations
-- page, and the setup page only while the site was never installed. The
-- site's own "not set up yet" page is gone, and the four strings it said go
-- with it: a key the code stops using is deleted by a migration (its strings
-- follow it, ON DELETE CASCADE - a reworded one too, for nothing shows it).
-----------------------------------------------------------

DELETE FROM translation_keys
 WHERE name IN ('boot.notSetUp.title', 'boot.notSetUp.text', 'boot.notSetUp.open', 'boot.notSetUp.after');

-----------------------------------------------------------
-- PROVE IT
--
-- Nothing of the page is left: no key, no string.
-----------------------------------------------------------

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM translation_keys WHERE name LIKE 'boot.notSetUp.%')
       OR EXISTS (SELECT 1 FROM translations WHERE key_name LIKE 'boot.notSetUp.%') THEN
        RAISE EXCEPTION 'the strings of the "not set up yet" page are still there';
    END IF;
END $$;
