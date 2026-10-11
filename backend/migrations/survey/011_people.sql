-----------------------------------------------------------
-- PEOPLE: THE ACCOUNTS THE IAM DELETED, AND NO ADDRESS KEPT HERE
--
-- The anotoki family's library keeps each site's record of the people who
-- use it (anotoki-lib 0.4.1's people module, through this site's own users
-- table - api/people.php) and blanks its copy of a person's name when the IAM
-- deletes their account, thirty days after they asked: the site learns the
-- ids from the IAM (GET /api/public/anonymized-accounts) and keeps the rest -
-- the answers stay, nobody's now. The library's own two tables come with its
-- set, anotoki_people, which runs after the site's files; the one column it
-- needs on users is the site's to add: anonymized_at, when the IAM deleted
-- the account (NULL: it has not). A visitor - a negative id - is never one.
--
-- And no anotoki site keeps a copy of anybody's address (the owner's
-- decision of 2026-10-07, taken here on 2026-10-11): users.email goes. The
-- results, a person's answers and the CSV name people by their IAM name; the
-- IAM is the one place an address is kept, and the person's own address in
-- the top bar comes from their ID token. The rule that keeps a visitor
-- nameless is written again without it - first taken off, for dropping a
-- column drops every rule that names it, the rest of the rule with it.
--
-- Every row stays - every person and every visitor, with its id, name, key
-- and times: the gate counts them before and after, and compares what they
-- hold.
-----------------------------------------------------------

-- What users holds that stays, as it is before this file: how many rows, and
-- everything but the address of each.
CREATE TEMPORARY TABLE users_before_011 ON COMMIT DROP AS
SELECT count(*) AS rows_before,
       md5(COALESCE(string_agg(concat_ws('|', id, preferred_username, first_seen_at, last_seen_at, visitor_key_hash), ';' ORDER BY id), '')) AS kept_before
  FROM users;

ALTER TABLE users ADD COLUMN IF NOT EXISTS anonymized_at TIMESTAMPTZ;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_visitor_check;
ALTER TABLE users DROP COLUMN IF EXISTS email;

-- No id 0; a key only ever a visitor's, as the hash's 64 lower-case hex
-- digits; a visitor without a name - and never deleted at the IAM, which
-- knows no visitor.
ALTER TABLE users ADD CONSTRAINT users_visitor_check CHECK (
    id <> 0
    AND (visitor_key_hash IS NULL OR (id < 0 AND visitor_key_hash ~ '^[0-9a-f]{64}$'))
    AND (id > 0 OR (preferred_username IS NULL AND anonymized_at IS NULL))
);

-----------------------------------------------------------
-- PROVE IT
--
-- The address is gone and anonymized_at is there; the rows are the rows that
-- were there, holding what they held; nobody is marked deleted by this file;
-- and the rule still refuses a visitor with a name, as it did - tried, and
-- taken back.
-----------------------------------------------------------

DO $$
DECLARE
    before RECORD;
    kept_now TEXT;
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'email') THEN
        RAISE EXCEPTION '011: users.email is still there';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'anonymized_at'
                      AND data_type = 'timestamp with time zone' AND is_nullable = 'YES') THEN
        RAISE EXCEPTION '011: users.anonymized_at is missing, or not a TIMESTAMPTZ that may be empty';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'users'::regclass AND conname = 'users_visitor_check' AND contype = 'c') THEN
        RAISE EXCEPTION '011: the rule users_visitor_check is missing';
    END IF;

    SELECT * INTO before FROM users_before_011;
    SELECT md5(COALESCE(string_agg(concat_ws('|', id, preferred_username, first_seen_at, last_seen_at, visitor_key_hash), ';' ORDER BY id), ''))
      INTO kept_now
      FROM users;
    IF (SELECT count(*) FROM users) <> before.rows_before THEN
        RAISE EXCEPTION '011: users had % rows, and has % now', before.rows_before, (SELECT count(*) FROM users);
    END IF;
    IF kept_now <> before.kept_before THEN
        RAISE EXCEPTION '011: a row of users holds something else than before (an id, a name, a key or a time)';
    END IF;
    IF EXISTS (SELECT 1 FROM users WHERE anonymized_at IS NOT NULL) THEN
        RAISE EXCEPTION '011: a person is marked deleted at the IAM, which only the scrub does';
    END IF;

    BEGIN
        INSERT INTO users (id, preferred_username) VALUES (-9223372036854775807, 'a visitor with a name');
        RAISE EXCEPTION '011: users takes a visitor with a name';
    EXCEPTION WHEN check_violation THEN
        NULL; -- refused, as it must be; nothing of the try is kept
    END;
END $$;
