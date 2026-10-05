-----------------------------------------------------------
-- WHAT A VISITOR IS TOLD
--
-- While the IAM says this site does not require a sign-in (006 made the
-- visitors), somebody who is not signed in takes surveys as this browser's
-- visitor. The words they meet: the notice on the home page and on a
-- survey's welcome, "answered" and "sent" (this browser remembers which
-- surveys were answered for as many days after the last visit as the site
-- keeps a visitor - the server says how many - and signing in moves the
-- answers into the account), the line on the welcome where a person reads
-- whom they are signed in as, the toasts after a sign-in moved the answers
-- (and kept the person's own where both answered), the toast when a visit
-- has ended, and the refusals a visitor alone can meet.
--
-- 003's pattern: every insert steps aside for a row that is already there
-- (a string reworded in the admin area is the owner's); one string on a line,
-- an apostrophe written twice and nothing else escaped. Keys ending in .one,
-- .few and .other are the forms of one plural, with the number as {count}.
-- Slovak speaks to the reader formally (Vy, with its capital).
-----------------------------------------------------------

INSERT INTO translation_keys (name, description) VALUES
    -- visitor: somebody taking surveys without signing in
    ('visitor.notice.one', 'Home page above the list, and a survey''s welcome, "answered" and "sent", for somebody taking surveys without signing in (a visitor): this browser remembers which surveys they answered for {count} days after their last visit, and signing in moves the answers into their account. A Sign in button (common.signIn) follows it. Plural family; {count} is the number of days the site keeps a visitor unseen (30 unless the host says otherwise).'),
    ('visitor.notice.few', 'The visitor notice (visitor.notice.one). Plural family (Slovak 2-4; in English the same text as .other); {count} is the number of days.'),
    ('visitor.notice.other', 'The visitor notice (visitor.notice.one). Plural family (5 or more in Slovak; everything but 1 in English); {count} is the number of days.'),
    ('visitor.moved.one', 'Toast after a sign-in from a browser that had taken surveys without signing in: their answers to {count} surveys are the person''s now. Plural family; {count} is the number of surveys. Followed in the same toast by visitor.kept when that is said too.'),
    ('visitor.moved.few', 'The toast after a sign-in (visitor.moved.one). Plural family (Slovak 2-4; in English the same text as .other); {count} is the number of surveys.'),
    ('visitor.moved.other', 'The toast after a sign-in (visitor.moved.one). Plural family (5 or more in Slovak; everything but 1 in English); {count} is the number of surveys.'),
    ('visitor.kept.one', 'Toast after a sign-in from a browser that had taken surveys without signing in: {count} of those surveys the person had already answered in their account, and those earlier answers are the ones kept (the ones sent without signing in are dropped). Plural family; {count} is the number of surveys. After visitor.moved in the same toast, when that is said too.'),
    ('visitor.kept.few', 'The toast after a sign-in (visitor.kept.one). Plural family (Slovak 2-4; in English the same text as .other); {count} is the number of surveys.'),
    ('visitor.kept.other', 'The toast after a sign-in (visitor.kept.one). Plural family (5 or more in Slovak; everything but 1 in English); {count} is the number of surveys.'),
    ('visitor.lost', 'Toast when this browser''s visit without signing in has ended (unseen for too long, or moved into an account in another tab): the surveys it had answered can be taken again. No placeholders.'),
    -- take: the survey page
    ('take.asVisitor', 'Survey page, welcome, for somebody taking it without signing in: where a person reads take.signedInAs. Their answers carry no name. No placeholders.'),
    ('take.refused.signInRequired', 'Survey page, toast when answers sent without signing in were refused because the site has required a sign-in since the page was opened. The page then shows its "You are not signed in" card. No placeholders.'),
    ('take.refused.tooManyVisitors', 'Survey page, toast when answers sent without signing in were refused because too many people have lately sent answers without signing in (from this address, or everybody). No placeholders.'),
    -- error: a whole request failed
    ('error.visitor_unknown', 'Shared, through errorKey(): the API answered 401 visitor_unknown - this browser''s visit without signing in has ended. A whole sentence ending in its full stop: the text of the home page''s "could not be loaded" alert, and the first sentence of the survey page''s toast when sending failed, before take.answersKept.'),
    ('error.too_many_visitors', 'Shared, through errorKey(): the API answered 429 too_many_visitors - too many people lately took surveys without signing in. Whole sentences ending in a full stop. The survey page says take.refused.tooManyVisitors instead when sending.'),
    ('error.visitor_move_retry', 'Shared, through errorKey(): the API answered 503 visitor_move_retry - the answers given without signing in could not be moved into the account this time (the site asks again by itself). Whole sentences ending in a full stop.')
ON CONFLICT (name) DO NOTHING;

-- English: what every other language falls back to, string by string.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'en', v.value FROM (VALUES
    -- visitor: somebody taking surveys without signing in
    ('visitor.notice.one', 'You are taking surveys without signing in. This browser remembers which ones you have answered for {count} day after your last visit - sign in, and your answers move into your anotoki account.'),
    ('visitor.notice.few', 'You are taking surveys without signing in. This browser remembers which ones you have answered for {count} days after your last visit - sign in, and your answers move into your anotoki account.'),
    ('visitor.notice.other', 'You are taking surveys without signing in. This browser remembers which ones you have answered for {count} days after your last visit - sign in, and your answers move into your anotoki account.'),
    ('visitor.moved.one', '{count} survey you answered without signing in is now in your account.'),
    ('visitor.moved.few', '{count} surveys you answered without signing in are now in your account.'),
    ('visitor.moved.other', '{count} surveys you answered without signing in are now in your account.'),
    ('visitor.kept.one', '{count} survey you took without signing in had already been answered in your account - your earlier answers are the ones kept.'),
    ('visitor.kept.few', '{count} surveys you took without signing in had already been answered in your account - your earlier answers are the ones kept.'),
    ('visitor.kept.other', '{count} surveys you took without signing in had already been answered in your account - your earlier answers are the ones kept.'),
    ('visitor.lost', 'This browser''s earlier visit without signing in has ended, so you can take the surveys again.'),
    -- take: the survey page
    ('take.asVisitor', 'You are not signed in · your answers go without your name.'),
    ('take.refused.signInRequired', 'Sign in to send your answers - they are kept in this browser, and are still here when you come back.'),
    ('take.refused.tooManyVisitors', 'Too many people have sent answers without signing in lately. Sign in to send yours, or try again later - they are kept in this browser.'),
    -- error: a whole request failed
    ('error.visitor_unknown', 'This browser''s visit without signing in has ended. Please try again.'),
    ('error.too_many_visitors', 'Too many people have taken surveys without signing in lately. Please sign in, or try again later.'),
    ('error.visitor_move_retry', 'What you answered without signing in could not be moved into your account just now. The site tries again in a moment.')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- Slovak.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'sk', v.value FROM (VALUES
    -- visitor: somebody taking surveys without signing in
    ('visitor.notice.one', 'Prieskumy vypĺňate bez prihlásenia. Tento prehliadač si pamätá, ktoré ste vyplnili, ešte 1 deň po Vašej poslednej návšteve – keď sa prihlásite, Vaše odpovede sa presunú do Vášho anotoki účtu.'),
    ('visitor.notice.few', 'Prieskumy vypĺňate bez prihlásenia. Tento prehliadač si pamätá, ktoré ste vyplnili, ešte {count} dni po Vašej poslednej návšteve – keď sa prihlásite, Vaše odpovede sa presunú do Vášho anotoki účtu.'),
    ('visitor.notice.other', 'Prieskumy vypĺňate bez prihlásenia. Tento prehliadač si pamätá, ktoré ste vyplnili, ešte {count} dní po Vašej poslednej návšteve – keď sa prihlásite, Vaše odpovede sa presunú do Vášho anotoki účtu.'),
    ('visitor.moved.one', '1 prieskum, ktorý ste vyplnili bez prihlásenia, je teraz vo Vašom účte.'),
    ('visitor.moved.few', '{count} prieskumy, ktoré ste vyplnili bez prihlásenia, sú teraz vo Vašom účte.'),
    ('visitor.moved.other', '{count} prieskumov, ktoré ste vyplnili bez prihlásenia, je teraz vo Vašom účte.'),
    ('visitor.kept.one', '1 prieskum, ktorý ste vyplnili bez prihlásenia, ste už predtým vyplnili aj vo svojom účte – zostávajú Vaše skoršie odpovede.'),
    ('visitor.kept.few', '{count} prieskumy, ktoré ste vyplnili bez prihlásenia, ste už predtým vyplnili aj vo svojom účte – zostávajú Vaše skoršie odpovede.'),
    ('visitor.kept.other', '{count} prieskumov, ktoré ste vyplnili bez prihlásenia, ste už predtým vyplnili aj vo svojom účte – zostávajú Vaše skoršie odpovede.'),
    ('visitor.lost', 'Predchádzajúca návšteva bez prihlásenia sa v tomto prehliadači skončila, takže prieskumy môžete vyplniť znova.'),
    -- take: the survey page
    ('take.asVisitor', 'Nie ste prihlásení · odpovede odošlete bez svojho mena.'),
    ('take.refused.signInRequired', 'Ak chcete odpovede odoslať, prihláste sa – zostávajú uložené v tomto prehliadači a po návrate ich tu nájdete.'),
    ('take.refused.tooManyVisitors', 'V poslednom čase poslalo odpovede bez prihlásenia priveľa ľudí. Prihláste sa a odošlite tie svoje, alebo to skúste neskôr – zostávajú uložené v tomto prehliadači.'),
    -- error: a whole request failed
    ('error.visitor_unknown', 'Návšteva bez prihlásenia sa v tomto prehliadači skončila. Skúste to, prosím, znova.'),
    ('error.too_many_visitors', 'V poslednom čase vypĺňalo prieskumy bez prihlásenia priveľa ľudí. Prihláste sa, prosím, alebo to skúste neskôr.'),
    ('error.visitor_move_retry', 'Odpovede, ktoré ste poslali bez prihlásenia, sa teraz nepodarilo presunúť do Vášho účtu. Stránka to o chvíľu skúsi znova.')
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
          ('visitor.notice.one'), ('visitor.notice.few'), ('visitor.notice.other'),
          ('visitor.moved.one'), ('visitor.moved.few'), ('visitor.moved.other'),
          ('visitor.kept.one'), ('visitor.kept.few'), ('visitor.kept.other'),
          ('visitor.lost'),
          ('take.asVisitor'), ('take.refused.signInRequired'), ('take.refused.tooManyVisitors'),
          ('error.visitor_unknown'), ('error.too_many_visitors'), ('error.visitor_move_retry')
      ) AS k(name)
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.name)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'en')
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'sk');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'keys without an English and a Slovak string: %', missing;
    END IF;
END $$;
