-----------------------------------------------------------
-- THE SITE'S OWN WORDS, IN MORE THAN ONE LANGUAGE
--
-- What the site itself says to somebody taking a survey - its buttons, the
-- rule under a question, "you have already taken this survey" - becomes
-- translatable: English and Slovak to begin with. (A survey's own texts are
-- another matter: they stay in the survey's document.)
--
-- The words are rows rather than files in the build because they are edited
-- in the admin area: a file in the Angular build is overwritten by the next
-- upload, and the host has no shell to edit one with. So a string is a key
-- the code names, and a value per language that an editor may reword.
--
-- Which keys there are is the code's business: migrations write them (the
-- next one, and one for every string added later), the admin area only ever
-- changes values. That is why a key has no "created by", and why a value
-- written by a migration has nobody in updated_by.
--
-- English is what every other language falls back to, string by string, so
-- it is always here and always on. There is no flag for HTML on a string and
-- no such thing on the site: a string is text, and is drawn as text.
-----------------------------------------------------------

-- A code is what a browser and the IAM's token call the language ("sk",
-- "pt-br" - always small letters here); the names are for people: `name` in
-- English for the admin area, `native_name` for the chooser a visitor sees. A
-- language switched off is no longer offered, and keeps its strings.
CREATE TABLE IF NOT EXISTS languages (
    code         VARCHAR(10)   PRIMARY KEY CHECK (code ~ '^[a-z]{2}(-[a-z]{2})?$'),
    name         VARCHAR(50)   NOT NULL,                    -- in English: "Slovak"
    native_name  VARCHAR(50)   NOT NULL,                    -- as its speakers write it: "Slovenčina"
    enabled      BOOLEAN       NOT NULL DEFAULT TRUE,
    sort_order   INTEGER       NOT NULL DEFAULT 0
);

-- description: where the string is shown and what its {placeholders} stand
-- for - all a translator has to go by.
CREATE TABLE IF NOT EXISTS translation_keys (
    name         VARCHAR(200)  PRIMARY KEY,
    description  TEXT,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One string: a key in a language. There is no empty one - a language that
-- has no string for a key has no row, and reads the English. updated_by is
-- who last reworded it in the admin area; null: as a migration wrote it.
CREATE TABLE IF NOT EXISTS translations (
    key_name       VARCHAR(200)  NOT NULL REFERENCES translation_keys (name) ON UPDATE CASCADE ON DELETE CASCADE,
    language_code  VARCHAR(10)   NOT NULL REFERENCES languages (code) ON UPDATE CASCADE ON DELETE CASCADE,
    value          TEXT          NOT NULL CHECK (value <> ''),
    updated_at     TIMESTAMPTZ   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_by     BIGINT        REFERENCES users (id) ON DELETE SET NULL,
    PRIMARY KEY (key_name, language_code)
);

INSERT INTO languages (code, name, native_name, sort_order) VALUES
    ('en', 'English', 'English', 1),
    ('sk', 'Slovak', 'Slovenčina', 2)
ON CONFLICT (code) DO NOTHING;

-----------------------------------------------------------
-- PROVE IT
--
-- Both languages are here, and the one everything falls back to is on.
-----------------------------------------------------------

DO $$
DECLARE
    missing TEXT;
BEGIN
    SELECT string_agg(wanted.code, ', ' ORDER BY wanted.code) INTO missing
      FROM (VALUES ('en'), ('sk')) AS wanted(code)
     WHERE NOT EXISTS (SELECT 1 FROM languages l WHERE l.code = wanted.code);
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'languages that should be here and are not: %', missing;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM languages WHERE code = 'en' AND enabled) THEN
        RAISE EXCEPTION 'English is switched off, and every other language falls back to it';
    END IF;
END $$;
