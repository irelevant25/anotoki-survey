-----------------------------------------------------------
-- THE SURVEY SITE
--
-- Who has signed in, the surveys, the answers people gave them, and the
-- pictures the surveys show. Accounts are the anotoki IAM's: a user here is
-- the IAM's user id and a copy of the name and address its token carries, so
-- the results can say who answered.
--
-- A survey is a document: its steps, their questions and the questions'
-- options are made and moved about as one thing in the editor, saved as one
-- thing, and always read whole - so they are one JSONB value (`content`),
-- checked by the API on the way in (api/survey_rules.php). What the database
-- itself must look things up by - the address, the status, the closing day -
-- are columns beside it.
-----------------------------------------------------------

CREATE TABLE users (
    id                  BIGINT        PRIMARY KEY,           -- the IAM user id (the token's sub)
    preferred_username  VARCHAR(200),
    email               VARCHAR(320),
    first_seen_at       TIMESTAMPTZ   NOT NULL DEFAULT now(),
    last_seen_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- content: {intro, thanks, askAboutYou, steps: [{id, title, questions: [...]}]}
-- (the frontend's core/survey/survey.model.ts has every field). revision
-- counts the saves, so an editor saving over a version they never saw is
-- told instead of silently undoing somebody else's work.
CREATE TABLE surveys (
    id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    slug         VARCHAR(100)  NOT NULL,
    title        VARCHAR(200)  NOT NULL,
    status       VARCHAR(10)   NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'closed')),
    closes_on    DATE,
    content      JSONB         NOT NULL,
    revision     INTEGER       NOT NULL DEFAULT 1,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ   NOT NULL DEFAULT now(),
    opened_at    TIMESTAMPTZ,
    closed_at    TIMESTAMPTZ,
    created_by   BIGINT        REFERENCES users (id) ON DELETE SET NULL,
    updated_by   BIGINT        REFERENCES users (id) ON DELETE SET NULL
);

-- A survey people can reach lives at /{slug}, so no two of them may share
-- one. Drafts may, while they are being written: the editor lists it as
-- something to fix before opening.
CREATE UNIQUE INDEX surveys_live_slug ON surveys (slug) WHERE status <> 'draft';

-- One filled survey per person and survey. answers: {questionId: {optionIds,
-- other, text}}; gender and age only when the survey asks (about-you.ts).
CREATE TABLE responses (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id     UUID          NOT NULL REFERENCES surveys (id) ON DELETE CASCADE,
    user_id       BIGINT        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    gender        VARCHAR(20)   CHECK (gender IN ('male', 'female', 'non-binary', 'undisclosed')),
    age           VARCHAR(20)   CHECK (age IN ('under-18', '18-24', '25-34', '35-44', '45-plus', 'undisclosed')),
    answers       JSONB         NOT NULL DEFAULT '{}'::jsonb,
    started_at    TIMESTAMPTZ   NOT NULL,
    submitted_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    UNIQUE (survey_id, user_id)
);

CREATE INDEX responses_by_survey ON responses (survey_id, submitted_at DESC);

-- The pictures' files. A picture never changes once it is here - a copied
-- question shows the same one - so it is served at an address that never
-- changes either, and cached for good.
CREATE TABLE images (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type  VARCHAR(20)   NOT NULL CHECK (content_type IN ('image/webp', 'image/png', 'image/jpeg', 'image/gif', 'image/avif')),
    width         INTEGER       NOT NULL CHECK (width > 0),
    height        INTEGER       NOT NULL CHECK (height > 0),
    size          INTEGER       NOT NULL CHECK (size > 0),
    bytes         BYTEA         NOT NULL,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT now(),
    created_by    BIGINT        REFERENCES users (id) ON DELETE SET NULL
);

-- Which survey shows which picture, kept with every save of the survey. A
-- picture no survey shows any more, and that is more than a day old (an
-- upload may be on its way into a survey), is deleted.
CREATE TABLE survey_images (
    survey_id  UUID  NOT NULL REFERENCES surveys (id) ON DELETE CASCADE,
    image_id   UUID  NOT NULL REFERENCES images (id) ON DELETE RESTRICT,
    PRIMARY KEY (survey_id, image_id)
);

CREATE INDEX survey_images_by_image ON survey_images (image_id);
