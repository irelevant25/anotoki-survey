-----------------------------------------------------------
-- VISITORS: SURVEYS TAKEN WITHOUT SIGNING IN
--
-- The IAM now says, site by site, whether signing in is required (its
-- "Sign-in required" switch, which this site reads - api/auth.php). While it
-- is off, somebody who is not signed in may take the open surveys too, once
-- each, as a visitor: a row of users like a person's, made by the server
-- with the first answers of theirs that are kept - never for a page view -
-- and known by a key only their browser holds.
--
-- A visitor's id is negative, from a sequence of its own: an IAM id is
-- always positive, so the two never meet, and everything that reads answers
-- by user id - "once each", the results - works for a visitor as it is. A
-- visitor has no name and no address. Its key is 32 random bytes the server
-- made; only the key's SHA-256 is kept (visitor_key_hash), so nothing in the
-- database opens anything.
--
-- A visitor unseen for a while (30 days unless the site's visitor settings
-- say otherwise) ends: the hash is cleared, and the key opens nothing any
-- more - but the answers stay in the results, as "Visitor N": they are the
-- survey's results as much as the visitor's. A visitor with no answers left
-- goes. At sign-in, what the browser answered as a visitor moves into the
-- person's account (api/visitors.php).
--
-- visitor_counters: how many visitors were made within the hour, from one
-- address and in all - the limits that keep one address, or everybody at
-- once, from filling the table. A count is a row, so two new visitors at the
-- same moment wait for each other rather than both passing it.
--
-- responses_by_user: answers by user id alone - the move at sign-in, the
-- clean-up and the delete of a visitor's row look them up so, and the unique
-- key of responses leads with the survey.
--
-- Schema only, and additive: every row there is a person's - a positive id,
-- no key - which every new rule allows.
-----------------------------------------------------------

CREATE SEQUENCE visitor_ids AS BIGINT INCREMENT BY -1 MINVALUE -9223372036854775807 MAXVALUE -1 START WITH -1;

ALTER TABLE users ADD COLUMN visitor_key_hash CHAR(64);

-- One row a key; a key only ever a visitor's, written as the hash's 64
-- lower-case hex digits; a visitor without a name or an address; no id 0.
ALTER TABLE users ADD CONSTRAINT users_visitor_key_hash_unique UNIQUE (visitor_key_hash);
ALTER TABLE users ADD CONSTRAINT users_visitor_check CHECK (
    id <> 0
    AND (visitor_key_hash IS NULL OR (id < 0 AND visitor_key_hash ~ '^[0-9a-f]{64}$'))
    AND (id > 0 OR (preferred_username IS NULL AND email IS NULL))
);

-- The visitors that still have a key, by when they were last seen: the
-- clean-up takes the longest unseen, and the limit counts them.
CREATE INDEX users_visitors_with_key ON users (last_seen_at) WHERE visitor_key_hash IS NOT NULL;

CREATE INDEX responses_by_user ON responses (user_id);

CREATE TABLE visitor_counters (
    name         VARCHAR(120)  PRIMARY KEY,         -- visitors:new, or visitors:new:<address>
    count        INTEGER       NOT NULL CHECK (count >= 0),
    window_ends  TIMESTAMPTZ   NOT NULL             -- the count starts again from here
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = current_schema() AND sequencename = 'visitor_ids' AND increment_by = -1 AND max_value = -1) THEN
        RAISE EXCEPTION 'the sequence visitor_ids is missing, or does not count down from -1';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = current_schema() AND table_name = 'users' AND column_name = 'visitor_key_hash') THEN
        RAISE EXCEPTION 'users.visitor_key_hash is missing';
    END IF;
    IF (SELECT count(*) FROM pg_constraint
         WHERE conrelid = 'users'::regclass AND conname IN ('users_visitor_key_hash_unique', 'users_visitor_check')) <> 2 THEN
        RAISE EXCEPTION 'the rules of users for visitors are missing';
    END IF;
    IF to_regclass('users_visitors_with_key') IS NULL OR to_regclass('responses_by_user') IS NULL THEN
        RAISE EXCEPTION 'an index for visitors is missing';
    END IF;
    IF to_regclass('visitor_counters') IS NULL THEN
        RAISE EXCEPTION 'the table visitor_counters is missing';
    END IF;
    IF EXISTS (SELECT 1 FROM users WHERE id <= 0 OR visitor_key_hash IS NOT NULL) THEN
        RAISE EXCEPTION 'users has a row that is not a person of the IAM';
    END IF;
END $$;
