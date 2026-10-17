-----------------------------------------------------------
-- TERMS, PRIVACY AND CONTACT: THE SURVEY'S FACTS
--
-- Every anotoki site shows three pages - Terms of use, the Privacy policy
-- and Contact - from the anotoki family's library (anotoki-lib 0.6.0, the
-- owner's decisions of 2026-10-13): their structure and the family's shared
-- words are the library's (anotoki.legal.*, its anotoki_translations/005,
-- which runs after this site's files), and each site gives its own facts.
-- These are the survey's, as the pages show them (frontend core/legal/
-- legal-facts.ts): what the site is, what it keeps of the people who sign in
-- and of visitors, what it keeps in their browser, and how long - each true
-- of the code as it is (docs/decisions.md says what each rests on). No
-- address is in any of them: where a link goes is the code's, never a string
-- an administrator can reword.
--
-- Beside them, the three pages' tab titles, and the skip link of their frame
-- ("Skip to the content": they hold no survey to skip to).
--
-- 003's pattern: every insert steps aside for a row that is already there
-- (a string reworded in the admin area is the owner's); one string on a
-- line, an apostrophe written twice and nothing else escaped. Slovak speaks
-- to the reader formally (Vy, with its capital) - the library's own words on
-- these pages address nobody, so they stand beside these as they are.
-----------------------------------------------------------

INSERT INTO translation_keys (name, description) VALUES
    -- legal: the survey's own facts on the anotoki library's legal pages (/terms, /privacy, /contact), and their frame
    ('legal.about', 'Terms of use (/terms), its first section: what the site is, in a sentence or two. The anotoki library''s page goes on with "{site} is one of the anotoki sites, run by ..., and costs nothing to use" (anotoki.legal.termsWhatText). No placeholders.'),
    ('legal.answers.kept', 'Privacy policy (/privacy): how long a person''s answers stay - under the part legal.answers.name and under "How long it is kept". True of the code: no answer is deleted by age; an ADMIN deletes one person''s answers to a survey, all of a person''s answers (the People page) or a survey with all its answers; the account''s deletion takes the name away, never the answers. No placeholders.'),
    ('legal.answers.name', 'Privacy policy (/privacy), "What the site keeps": the heading of the part about the answers a person sends, and its line under "How long it is kept". Short. No placeholders.'),
    ('legal.answers.what', 'Privacy policy, the part legal.answers.name: what a sent survey keeps. True of the code (the responses table): the options chosen and the words written, gender and age group where the survey asks, when it was begun and sent, the language it was read in. A survey begun and not sent is in the browser alone (legal.storage.draft.purpose, further down the same page). No placeholders.'),
    ('legal.answers.why', 'Privacy policy, the part legal.answers.name: what the answers are for - and who reads them: the site''s editors and administrators see every answer with the name of whoever gave it, and download them as a CSV file. No placeholders.'),
    ('legal.auditLog.what', 'Privacy policy, the part "The audit log" (its heading and its "What for" and "How long" are the anotoki library''s): what this site''s audit log keeps. True of the code: the changes the site''s editors and administrators make in the admin panel, and what the site does there by itself (the daily backup) - who, what and when, never an IP address. No placeholders.'),
    ('legal.backups.kept', 'Privacy policy, the part "Backups" (its heading and "What for" are the anotoki library''s): how long the copies of the database stay. True of the code: kept by count, never by age - the 14 newest daily copies, the 5 newest made before an update and the 5 newest before a restore, one made by hand until an administrator deletes it. No placeholders.'),
    ('legal.backups.what', 'Privacy policy, the part "Backups": what a copy of the database is and when one is made - on each day the site is used (the first request of a day makes it), before every update and every restore, and by hand. The anotoki library adds a sentence after it: where the copies are kept. No placeholders.'),
    ('legal.record.kept', 'Privacy policy: how long the site''s record of a person stays - under the part legal.record.name and under "How long it is kept". True of the code: never deleted; when the anotoki account is deleted, the name becomes the anotoki account''s placeholder (deleted- and the account''s number). No placeholders.'),
    ('legal.record.name', 'Privacy policy (/privacy), "What the site keeps": the heading of the part about the site''s record of somebody who signs in, and its line under "How long it is kept". Short. No placeholders.'),
    ('legal.record.what', 'Privacy policy, the part legal.record.name: what the site keeps of somebody who signs in. True of the code (the users table): the anotoki account''s id and the name it gives, when first and last seen - never the e-mail address. No placeholders.'),
    ('legal.record.why', 'Privacy policy, the part legal.record.name: what the record is for. No placeholders.'),
    ('legal.skipToContent', 'The skip link above the top bar on the legal pages (Terms, Privacy, Contact); seen only when it has keyboard focus. The pages people take surveys on say common.skipToSurvey instead.'),
    ('legal.storage.draft.kept', 'Privacy policy, "Cookies and storage in your browser": how long the draft of a survey begun stays in the browser (legal.storage.draft.purpose). No placeholders.'),
    ('legal.storage.draft.purpose', 'Privacy policy, "Cookies and storage in your browser": what the browser keeps of a survey begun and not sent - the answers so far and the step the person is on, saved with every change; nothing of it reaches the site until it is sent. No placeholders.'),
    ('legal.storage.hint.purpose', 'Privacy policy, "Cookies and storage in your browser": the anotoki account''s cookie for every anotoki site (anotoki_signed_in). The browser sends it here too, but this site never reads it: it signs a person in only when they press Sign in (common.signIn - name the button as the top bar does). No placeholders.'),
    ('legal.storage.signIn.purpose', 'Privacy policy, "Cookies and storage in your browser": the sign-in this browser keeps for the site (in local storage) - the keys the anotoki account gave, and what they say of the person: the account''s id, name, e-mail address, language, look (theme, how dates are written) and roles here. No placeholders.'),
    ('legal.storage.signInUnderWay.kept', 'Privacy policy, "Cookies and storage in your browser": how long the notes of a sign-in under way stay (legal.storage.signInUnderWay.purpose) - until it comes back from the anotoki account, the account''s public settings an hour, or until the tab is closed (session storage). No placeholders.'),
    ('legal.storage.signInUnderWay.purpose', 'Privacy policy, "Cookies and storage in your browser": what session storage keeps while a sign-in is under way - the one-time values that check it on the way back, where to bring the person then, and the anotoki account''s public settings for signing in. No placeholders.'),
    ('legal.storage.tabLanguage.purpose', 'Privacy policy, "Cookies and storage in your browser": the language a link chose for one tab (?lang= in the address - keep it as it is), kept in session storage. No placeholders.'),
    ('legal.storage.untilTabClosed', 'Privacy policy, "Cookies and storage in your browser": how long an item of session storage stays - a tab''s language, the admin pages'' unsaved words. No placeholders.'),
    ('legal.storage.visitorKey.kept', 'Privacy policy, "Cookies and storage in your browser": how long a visitor''s key stays in the browser (its purpose is the anotoki library''s words). True of the code: it goes when the person signs in (the answers move into the account), when the site no longer knows it (the visitor ended), or when the site''s data is cleared. No placeholders.'),
    ('legal.storage.wordDrafts.purpose', 'Privacy policy, "Cookies and storage in your browser": the words an editor or administrator typed on the admin panel''s Translations and Languages pages (the admin panel is English - keep the two names as they are) and has not saved yet, kept in session storage. No placeholders.'),
    ('legal.visitors.kept.few', 'Privacy policy, the visitors'' part (legal.visitors.kept.one). Plural family (Slovak 2-4; in English the same text as .other); {count} is the number of days.'),
    ('legal.visitors.kept.one', 'Privacy policy, the part "Using the site without an account": how long. Plural family; {count} is the number of days the site keeps a visitor unseen (30 unless the host''s visitor settings say otherwise - the number visitor.notice says too). The key ends then and the answers stay; the counts of new visitors go with the first clean-up after their hour.'),
    ('legal.visitors.kept.other', 'Privacy policy, the visitors'' part (legal.visitors.kept.one). Plural family (5 or more in Slovak; everything but 1 in English); {count} is the number of days.'),
    ('legal.visitors.what', 'Privacy policy, the part "Using the site without an account" (its heading is the anotoki library''s): what the site keeps of a visitor while the IAM lets surveys be taken here without signing in. True of the code: a number, the hash of a random key only the browser holds, first and last seen; the answers as anybody''s, under "Visitor" and the number (the admin panel''s English word - keep it); moved into the account at a sign-in; new visitors counted an hour by a keyed code of the IP address. No placeholders.'),
    ('legal.visitors.why', 'Privacy policy, the visitors'' part: what it is for. No placeholders.'),
    ('legal.writing.kept', 'Privacy policy: how long who wrote what stays - under the part legal.writing.name and under "How long it is kept". True of the code: as long as the survey, picture or string; a picture no survey shows is deleted after a later save or deletion of a survey, a day after it was added at the earliest. No placeholders.'),
    ('legal.writing.name', 'Privacy policy (/privacy), "What the site keeps": the heading of the part about what the site''s editors and administrators write, and its line under "How long it is kept". Short. No placeholders.'),
    ('legal.writing.what', 'Privacy policy, the part legal.writing.name: who made and last changed each survey, who added each picture, who last saved each of the site''s strings - by the anotoki account''s id. No placeholders.'),
    ('legal.writing.why', 'Privacy policy, the part legal.writing.name: what it is for. No placeholders.'),
    -- title: the browser tab's title, before " · " and brand.site
    ('title.contact', 'Tab title of the Contact page (/contact, the anotoki library''s page), before " · " and brand.site.'),
    ('title.privacy', 'Tab title of the Privacy policy (/privacy, the anotoki library''s page), before " · " and brand.site.'),
    ('title.terms', 'Tab title of the Terms of use (/terms, the anotoki library''s page), before " · " and brand.site.')
ON CONFLICT (name) DO NOTHING;

-- English: what every other language falls back to, string by string.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'en', v.value FROM (VALUES
    -- legal
    ('legal.about', 'Surveys for the anotoki sites: a few questions in steps, each survey answered once, so that the people who make the sites learn what you like and what to make better.'),
    ('legal.answers.kept', 'With no set time limit: until an administrator deletes them - your answers to one survey, all your answers, or a survey with every answer to it. When your anotoki account is deleted, they stay, without your name. A file of answers an editor or administrator downloaded stays with them until they delete it.'),
    ('legal.answers.name', 'Your answers'),
    ('legal.answers.what', 'For each survey you send: what you chose and what you wrote, your gender and age group where the survey asks for them, when you began and when you sent it, and the language you read it in. A survey you began and have not sent stays in your browser alone (see below).'),
    ('legal.answers.why', 'To make each survey''s results. The people who write the surveys - the site''s editors and administrators - read every answer with the name of whoever gave it, and may download the answers as a file.'),
    ('legal.auditLog.what', 'What the site''s editors and administrators do in its admin panel - surveys made, opened, closed and deleted, answers deleted, the site''s words and languages changed, backups and the database''s updates - and what the site does there by itself, such as the daily backup: who did what, and when. Never an IP address.'),
    ('legal.backups.kept', 'The 14 newest daily copies, the 5 newest made before an update and the 5 newest made before a restore; a copy made by hand until an administrator deletes it. What is deleted on the site stays in the copies made before, until they go.'),
    ('legal.backups.what', 'A copy of the site''s whole database - every answer and picture in it -, made on each day the site is used, before every update and every restore, and by hand when an administrator asks for one. Each copy holds what the site kept when it was made.'),
    ('legal.record.kept', 'With no set time limit. When your anotoki account is deleted, your name here is replaced by a placeholder.'),
    ('legal.record.name', 'Your record'),
    ('legal.record.what', 'When you sign in: your anotoki account''s id and the name it gives, and when you were first and last seen here. Never your e-mail address.'),
    ('legal.record.why', 'To know who answered - so that each survey is answered once by each person, and the people who write the surveys see whose answers they read.'),
    ('legal.skipToContent', 'Skip to the content'),
    ('legal.storage.draft.kept', 'Until you send that survey or start it again, or clear the site''s data in your browser.'),
    ('legal.storage.draft.purpose', 'A survey you began and have not sent: your answers so far and the step you are on, so that closing the page costs you nothing. Nothing of it leaves your browser until you send the survey.'),
    ('legal.storage.hint.purpose', 'Set by the anotoki account when you sign in there, for every anotoki site: it says only that somebody is signed in in this browser - a random value, never who. This site does not read it: it signs you in only when you press Sign in.'),
    ('legal.storage.signIn.purpose', 'Your sign-in to this site: the keys the anotoki account gave it, and what they say of you - your account''s id, name, e-mail address, language, look and roles here -, so that the page knows who is signed in.'),
    ('legal.storage.signInUnderWay.kept', 'Until the sign-in comes back, the settings for an hour - or until the tab is closed.'),
    ('legal.storage.signInUnderWay.purpose', 'While a sign-in is under way: the one-time values that check it when you come back from the anotoki account, where to bring you then, and the account''s public settings for signing in.'),
    ('legal.storage.tabLanguage.purpose', 'A language a link chose for this tab (?lang= in its address).'),
    ('legal.storage.untilTabClosed', 'Until the tab is closed.'),
    ('legal.storage.visitorKey.kept', 'Until you sign in - your answers then move into your account and the key goes -, the site no longer knows it, or you clear the site''s data in your browser.'),
    ('legal.storage.wordDrafts.purpose', 'Editors and administrators only: words typed on the admin panel''s Translations and Languages pages and not saved yet.'),
    ('legal.visitors.kept.few', '{count} days after your last visit the key ends and opens nothing any more; your answers stay, under "Visitor" and the number, until an administrator deletes them. A count of new visitors goes with the first clean-up after its hour.'),
    ('legal.visitors.kept.one', '{count} day after your last visit the key ends and opens nothing any more; your answers stay, under "Visitor" and the number, until an administrator deletes them. A count of new visitors goes with the first clean-up after its hour.'),
    ('legal.visitors.kept.other', '{count} days after your last visit the key ends and opens nothing any more; your answers stay, under "Visitor" and the number, until an administrator deletes them. A count of new visitors goes with the first clean-up after its hour.'),
    ('legal.visitors.what', 'While surveys may be taken here without signing in, the first answers you send without an account make you a visitor: a number, a random key only your browser holds - the site keeps only a fingerprint of it, which opens nothing -, and when you were first and last seen. Your answers are kept as anybody''s are (above), under "Visitor" and that number; sign in later, and they move into your account. So that one address cannot make visitors without end, new visitors are counted for an hour by a code made from the IP address with a secret key - never the address itself.'),
    ('legal.visitors.why', 'So that surveys can be taken without an account, each once from each browser.'),
    ('legal.writing.kept', 'As long as the survey, the picture or the words are kept. A picture no survey shows any more is deleted with a later change to the surveys, a day after it was added at the earliest.'),
    ('legal.writing.name', 'Writing surveys'),
    ('legal.writing.what', 'For the site''s editors and administrators: who made each survey and who last changed it, who added each picture, and who last saved each of the site''s words - by their anotoki account''s id.'),
    ('legal.writing.why', 'So that the people who write the surveys know who did what.'),
    -- title
    ('title.contact', 'Contact'),
    ('title.privacy', 'Privacy policy'),
    ('title.terms', 'Terms of use')
) AS v(key_name, value)
ON CONFLICT (key_name, language_code) DO NOTHING;

-- Slovak.
INSERT INTO translations (key_name, language_code, value)
SELECT v.key_name, 'sk', v.value FROM (VALUES
    -- legal
    ('legal.about', 'Prieskumy pre stránky anotoki: niekoľko otázok v krokoch, na každý prieskum odpovedáte raz, aby tí, ktorí stránky tvoria, vedeli, čo sa Vám páči a čo treba zlepšiť.'),
    ('legal.answers.kept', 'Bez pevne stanovenej lehoty: kým ich správca nezmaže – Vaše odpovede na jeden prieskum, všetky Vaše odpovede alebo prieskum so všetkými odpoveďami. Po zmazaní Vášho anotoki účtu zostanú, ale bez Vášho mena. Súbor s odpoveďami, ktorý si redaktor alebo správca stiahol, zostáva u neho, kým ho nezmaže.'),
    ('legal.answers.name', 'Vaše odpovede'),
    ('legal.answers.what', 'Pri každom prieskume, ktorý odošlete: čo ste zvolili a čo ste napísali, Vaše pohlavie a vekovú skupinu, ak sa na ne prieskum pýta, kedy ste ho začali a kedy odoslali a v akom jazyku ste ho čítali. Rozpracovaný prieskum, ktorý ste neodoslali, zostáva len vo Vašom prehliadači (pozri nižšie).'),
    ('legal.answers.why', 'Na vyhodnotenie každého prieskumu. Tí, ktorí prieskumy píšu – redaktori a správcovia stránky –, čítajú každú odpoveď s menom toho, kto ju dal, a odpovede si môžu stiahnuť ako súbor.'),
    ('legal.auditLog.what', 'Čo robia redaktori a správcovia stránky v jej administrátorskom paneli – vytvorené, otvorené, zatvorené a zmazané prieskumy, zmazané odpovede, zmeny textov a jazykov stránky, zálohy a aktualizácie databázy – a čo tam stránka robí sama, napríklad dennú zálohu: kto čo urobil a kedy. IP adresu nikdy.'),
    ('legal.backups.kept', '14 najnovších denných kópií, 5 najnovších kópií pred aktualizáciou a 5 najnovších pred obnovením; ručne vytvorená kópia, kým ju správca nezmaže. Čo sa na stránke zmaže, zostáva v skôr vytvorených kópiách, kým nezaniknú.'),
    ('legal.backups.what', 'Kópia celej databázy stránky – so všetkými odpoveďami a obrázkami –, ktorá vzniká v každý deň, keď sa stránka používa, pred každou aktualizáciou a obnovením a ručne, keď o ňu požiada správca. Každá kópia obsahuje to, čo stránka uchovávala v čase jej vzniku.'),
    ('legal.record.kept', 'Bez pevne stanovenej lehoty. Po zmazaní Vášho anotoki účtu sa Vaše meno tu nahradí zástupným označením.'),
    ('legal.record.name', 'Váš záznam'),
    ('legal.record.what', 'Keď sa prihlásite: identifikátor Vášho anotoki účtu a meno, ktoré účet poskytne, a kedy ste tu boli prvýkrát a naposledy. Nikdy nie Vašu e-mailovú adresu.'),
    ('legal.record.why', 'Aby bolo jasné, kto odpovedal – aby každý odpovedal na každý prieskum len raz a aby tí, ktorí prieskumy píšu, videli, čie odpovede čítajú.'),
    ('legal.skipToContent', 'Preskočiť na obsah'),
    ('legal.storage.draft.kept', 'Kým tento prieskum neodošlete alebo nezačnete odznova, alebo kým nevymažete údaje stránky v prehliadači.'),
    ('legal.storage.draft.purpose', 'Prieskum, ktorý ste začali a neodoslali: Vaše doterajšie odpovede a krok, na ktorom ste, aby Vás zatvorenie stránky nič nestálo. Nič z neho neopustí Váš prehliadač, kým prieskum neodošlete.'),
    ('legal.storage.hint.purpose', 'Nastavuje ho anotoki účet pri prihlásení, pre všetky stránky anotoki: hovorí len to, že v tomto prehliadači je niekto prihlásený – je to náhodná hodnota, nikdy nie údaj o tom, kto. Táto stránka ho nečíta: prihlási Vás, len keď stlačíte „Prihlásiť sa“.'),
    ('legal.storage.signIn.purpose', 'Vaše prihlásenie do tejto stránky: kľúče, ktoré jej vydal anotoki účet, a to, čo o Vás hovoria – identifikátor účtu, meno, e-mailovú adresu, jazyk, vzhľad a roly na tejto stránke –, aby stránka vedela, kto je prihlásený.'),
    ('legal.storage.signInUnderWay.kept', 'Kým sa prihlásenie nevráti, nastavenia hodinu – alebo kým sa karta nezatvorí.'),
    ('legal.storage.signInUnderWay.purpose', 'Počas prihlasovania: jednorazové hodnoty, ktorými sa overí po Vašom návrate z anotoki účtu, kam Vás potom vrátiť, a verejné nastavenia prihlasovania anotoki účtu.'),
    ('legal.storage.tabLanguage.purpose', 'Jazyk, ktorý pre túto kartu zvolil odkaz (?lang= v jeho adrese).'),
    ('legal.storage.untilTabClosed', 'Kým sa karta nezatvorí.'),
    ('legal.storage.visitorKey.kept', 'Kým sa neprihlásite – Vaše odpovede sa vtedy presunú do Vášho účtu a kľúč zanikne –, kým ho stránka prestane poznať alebo kým nevymažete údaje stránky v prehliadači.'),
    ('legal.storage.wordDrafts.purpose', 'Len pri redaktoroch a správcoch: texty napísané na stránkach Translations a Languages v administrátorskom paneli, ktoré ešte nie sú uložené.'),
    ('legal.visitors.kept.few', '{count} dni po Vašej poslednej návšteve kľúč zanikne a už nič neotvorí; Vaše odpovede zostanú pod označením „Visitor“ s číslom, kým ich správca nezmaže. Počet nových návštevníkov sa zmaže pri prvom upratovaní po uplynutí jeho hodiny.'),
    ('legal.visitors.kept.one', '{count} deň po Vašej poslednej návšteve kľúč zanikne a už nič neotvorí; Vaše odpovede zostanú pod označením „Visitor“ s číslom, kým ich správca nezmaže. Počet nových návštevníkov sa zmaže pri prvom upratovaní po uplynutí jeho hodiny.'),
    ('legal.visitors.kept.other', '{count} dní po Vašej poslednej návšteve kľúč zanikne a už nič neotvorí; Vaše odpovede zostanú pod označením „Visitor“ s číslom, kým ich správca nezmaže. Počet nových návštevníkov sa zmaže pri prvom upratovaní po uplynutí jeho hodiny.'),
    ('legal.visitors.what', 'Kým sa tu dajú prieskumy vypĺňať bez prihlásenia, prvé odpovede, ktoré odošlete bez účtu, z Vás urobia návštevníka: číslo, náhodný kľúč, ktorý má len Váš prehliadač – stránka si uchováva len jeho odtlačok, ktorý nič neotvorí –, a kedy ste tu boli prvýkrát a naposledy. Vaše odpovede sa uchovávajú ako odpovede ktoréhokoľvek iného (pozri vyššie), pod označením „Visitor“ a týmto číslom; keď sa neskôr prihlásite, presunú sa do Vášho účtu. Aby jedna adresa nemohla vytvárať návštevníkov bez konca, noví návštevníci sa počas hodiny počítajú podľa kódu, ktorý vznikne z IP adresy pomocou tajného kľúča – nikdy nie podľa samotnej adresy.'),
    ('legal.visitors.why', 'Aby sa dali prieskumy vypĺňať aj bez účtu, každý raz z jedného prehliadača.'),
    ('legal.writing.kept', 'Kým sa prieskum, obrázok alebo text uchováva. Obrázok, ktorý už žiadny prieskum nezobrazuje, sa zmaže pri niektorej ďalšej zmene prieskumov, najskôr deň po jeho pridaní.'),
    ('legal.writing.name', 'Písanie prieskumov'),
    ('legal.writing.what', 'Pri redaktoroch a správcoch stránky: kto ktorý prieskum vytvoril a kto ho naposledy zmenil, kto pridal ktorý obrázok a kto naposledy uložil ktorý text stránky – podľa identifikátora jeho anotoki účtu.'),
    ('legal.writing.why', 'Aby tí, ktorí prieskumy píšu, vedeli, kto čo urobil.'),
    -- title
    ('title.contact', 'Kontakt'),
    ('title.privacy', 'Ochrana osobných údajov'),
    ('title.terms', 'Podmienky používania')
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
          ('legal.about'),
          ('legal.answers.kept'), ('legal.answers.name'), ('legal.answers.what'), ('legal.answers.why'),
          ('legal.auditLog.what'),
          ('legal.backups.kept'), ('legal.backups.what'),
          ('legal.record.kept'), ('legal.record.name'), ('legal.record.what'), ('legal.record.why'),
          ('legal.skipToContent'),
          ('legal.storage.draft.kept'), ('legal.storage.draft.purpose'),
          ('legal.storage.hint.purpose'),
          ('legal.storage.signIn.purpose'),
          ('legal.storage.signInUnderWay.kept'), ('legal.storage.signInUnderWay.purpose'),
          ('legal.storage.tabLanguage.purpose'),
          ('legal.storage.untilTabClosed'),
          ('legal.storage.visitorKey.kept'),
          ('legal.storage.wordDrafts.purpose'),
          ('legal.visitors.kept.few'), ('legal.visitors.kept.one'), ('legal.visitors.kept.other'),
          ('legal.visitors.what'), ('legal.visitors.why'),
          ('legal.writing.kept'), ('legal.writing.name'), ('legal.writing.what'), ('legal.writing.why'),
          ('title.contact'), ('title.privacy'), ('title.terms')
      ) AS k(name)
     WHERE NOT EXISTS (SELECT 1 FROM translation_keys tk WHERE tk.name = k.name)
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'en')
        OR NOT EXISTS (SELECT 1 FROM translations t WHERE t.key_name = k.name AND t.language_code = 'sk');
    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'keys without an English and a Slovak string: %', missing;
    END IF;
END $$;
