-----------------------------------------------------------
-- THE LANGUAGE A SURVEY WAS READ IN
--
-- A survey now holds its texts in more than one language, and the people
-- taking it read it in theirs. What they answer means the same whichever
-- language it was (an answer is the id of an option, not its words) - but
-- whoever reads the results may want to know which words a person had in
-- front of them. So a filled survey says which language its texts were
-- shown in when it was sent.
--
-- It is a note and nothing depends on it: NULL for every answer from before
-- this, and for one sent with no language or with one the survey is not in
-- (api/responses.php keeps only the survey language or one of its
-- translations, and never refuses answers over it). A language that is
-- deleted takes the note with it and leaves the answers.
-----------------------------------------------------------

ALTER TABLE responses
    ADD COLUMN language VARCHAR(10) REFERENCES languages (code) ON DELETE SET NULL;
