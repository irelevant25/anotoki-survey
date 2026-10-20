-----------------------------------------------------------
-- A STEP'S OWN TEXT AND PICTURES - WITH QUESTIONS UNDER THEM, OR NONE
--
-- The owner, 2026-10-20: a step may hold only text - rich text, as a
-- question's, and pictures, as under a question's text - and no question.
-- For usability tests: a step says the task ("Go to the genshin site and do
-- X, then come back"), the person does it and presses Next, and the step
-- after it asks about it. A step may carry its text and pictures above its
-- questions too.
--
-- A survey is one JSONB document (surveys.content, checked on the way in by
-- api/survey_rules.php), so a step's text and pictures are two more fields
-- of each step in it: "text", the step's own HTML - cleaned exactly as a
-- question's text is (api/rich_text.php), '' for none - and "images", its
-- pictures as a question's are, [{id, alt, width, height, src}], [] for
-- none. They are the survey's pictures the way a question's are: every save
-- writes each picture the survey shows - a step's among them - into
-- survey_images, and the clean-up deletes a picture once no survey shows it
-- (a day after it came: api/images.php). So no table changes.
--
-- Every survey kept so far gets the two on each of its steps - no text, no
-- pictures - so the documents have the one shape the API reads and sends.
-- Nothing else of a survey changes: not a text, not the order of its steps,
-- not its revision, nor when it was last changed. A translation's entry for
-- a step (its title) gains its two - the step's text, its pictures'
-- descriptions - when the survey is next saved; it goes out whole either way
-- (surveyTranslationsJson()).
--
-- And the two strings that name the button opening such a picture large
-- (the same words as for a question's pictures) say so to whoever
-- translates them: their descriptions only, no string of anybody's changes.
-----------------------------------------------------------

-- Every survey as it is, but for those two fields of its steps: what the gate compares the surveys with.
CREATE TEMPORARY TABLE surveys_before_016 ON COMMIT DROP AS
SELECT s.id,
       s.revision,
       s.updated_at,
       CASE WHEN jsonb_typeof(s.content->'steps') = 'array' THEN
           jsonb_set(s.content, '{steps}', (
               SELECT COALESCE(jsonb_agg(CASE WHEN jsonb_typeof(step.value) = 'object' THEN step.value - 'text' - 'images' ELSE step.value END ORDER BY step.position), '[]'::jsonb)
                 FROM jsonb_array_elements(s.content->'steps') WITH ORDINALITY AS step(value, position)))
       ELSE s.content END AS without_016
  FROM surveys s;

-- Each step of each survey: its text ('' when it has none that is text) and its pictures ([] when it has no list
-- of them) - in the order the steps were, every other field of the step as it was.
UPDATE surveys s
   SET content = jsonb_set(s.content, '{steps}', COALESCE((
           SELECT jsonb_agg(
                      CASE WHEN jsonb_typeof(step.value) = 'object' THEN
                          step.value || jsonb_build_object(
                              'text', CASE WHEN jsonb_typeof(step.value->'text') = 'string' THEN step.value->'text' ELSE '""'::jsonb END,
                              'images', CASE WHEN jsonb_typeof(step.value->'images') = 'array' THEN step.value->'images' ELSE '[]'::jsonb END)
                      ELSE step.value END
                      ORDER BY step.position)
             FROM jsonb_array_elements(s.content->'steps') WITH ORDINALITY AS step(value, position)), '[]'::jsonb))
 WHERE jsonb_typeof(s.content->'steps') = 'array'
   AND EXISTS (SELECT 1
                 FROM jsonb_array_elements(s.content->'steps') AS step(value)
                WHERE jsonb_typeof(step.value) = 'object'
                  AND (jsonb_typeof(step.value->'text') IS DISTINCT FROM 'string' OR jsonb_typeof(step.value->'images') IS DISTINCT FROM 'array'));

-- A picture under a step's text opens large as one under a question's does, with the same two strings.
-- A description is only ever written by a migration (no page rewords one), so each is set whole, as 012 sets one.
UPDATE translation_keys
   SET description = 'A picture under a question''s text, or under a step''s own text: the accessible name of the button that opens it large. {label} is the picture''s description, from the survey.'
 WHERE name = 'question.showLarge';

UPDATE translation_keys
   SET description = 'A picture under a question''s text, or under a step''s own text, that has no description: the accessible name of the button that opens it large. {number} its place among the pictures there, from 1.'
 WHERE name = 'question.showLargeNumbered';

-----------------------------------------------------------
-- PROVE IT
--
-- Every step of every survey has its text and its list of pictures; the
-- surveys are the surveys that were there, each holding what it held but
-- for those two fields - its revision and when it was last changed too; and
-- the two strings' descriptions name a step's pictures.
-----------------------------------------------------------

DO $$
DECLARE
    surveys_before BIGINT;
    surveys_now BIGINT;
BEGIN
    IF EXISTS (SELECT 1
                 FROM surveys s,
                      jsonb_array_elements(CASE WHEN jsonb_typeof(s.content->'steps') = 'array' THEN s.content->'steps' ELSE '[]'::jsonb END) AS step(value)
                WHERE jsonb_typeof(step.value) = 'object'
                  AND (jsonb_typeof(step.value->'text') IS DISTINCT FROM 'string' OR jsonb_typeof(step.value->'images') IS DISTINCT FROM 'array')) THEN
        RAISE EXCEPTION '016: a step of a survey has no text, or no list of pictures';
    END IF;

    SELECT count(*) INTO surveys_before FROM surveys_before_016;
    SELECT count(*) INTO surveys_now FROM surveys;
    IF surveys_now <> surveys_before THEN
        RAISE EXCEPTION '016: there were % surveys, and there are % now', surveys_before, surveys_now;
    END IF;
    IF EXISTS (SELECT 1
                 FROM surveys s
                 LEFT JOIN surveys_before_016 b ON b.id = s.id
                WHERE b.id IS NULL
                   OR s.revision <> b.revision
                   OR s.updated_at IS DISTINCT FROM b.updated_at
                   OR (CASE WHEN jsonb_typeof(s.content->'steps') = 'array' THEN
                           jsonb_set(s.content, '{steps}', (
                               SELECT COALESCE(jsonb_agg(CASE WHEN jsonb_typeof(step.value) = 'object' THEN step.value - 'text' - 'images' ELSE step.value END ORDER BY step.position), '[]'::jsonb)
                                 FROM jsonb_array_elements(s.content->'steps') WITH ORDINALITY AS step(value, position)))
                       ELSE s.content END) IS DISTINCT FROM b.without_016) THEN
        RAISE EXCEPTION '016: a survey holds something else than before, besides its steps'' text and pictures (or its revision, or when it was changed, is not what it was)';
    END IF;

    IF EXISTS (SELECT 1
                 FROM translation_keys
                WHERE name IN ('question.showLarge', 'question.showLargeNumbered')
                  AND description NOT LIKE '%under a step''s own text%') THEN
        RAISE EXCEPTION '016: the descriptions of question.showLarge and question.showLargeNumbered do not name a step''s pictures';
    END IF;
END $$;
