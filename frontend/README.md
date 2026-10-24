# anotoki survey - the frontend

The survey site's pages: Angular 21 - standalone components, zoneless,
signals, OnPush. The surveys people take (in English and Slovak), the editor
and the results (the admin panel, in English). How it works and why is in
[`../docs/`](../docs/README.md); setting it up and running it in
[`../DEV.md`](../DEV.md).

## Layout

```
src/
  main.ts, index.html                the start, the page (and the family's theme-boot.js, which angular.json copies
                                     from @anotoki/lib/assets: the theme shown last, before the first paint)
  styles.scss                        the family's styles (@anotoki/lib/styles: the --anotoki-* tokens, light and
                                     dark, Manrope, the base, the utilities and the tables) and the survey's own
                                     few: the highlighter, the results' bars, the night sky, a decorative rule,
                                     .rich, mark, the drag and drop
  styles/                            partials the components @use: fields (the fields the site draws itself),
                                     boot, result-card, sky, participant-frame (the participant and legal
                                     layouts' frame: the light behind, the skip link, the column, the
                                     family's footer at the foot)
  test-setup.ts                      the unit tests' shims for jsdom (dialog, popover, matchMedia), as the
                                     library's own tests have them
  app/
    app.config.ts, app.routes.ts     providers, the boot (shared/boot/boot.ts - where the site stands, the
                                     theme, the sign-in, the language; the changelog asked at once, never
                                     waited for) and the routes - the admin panel's (sites/admin/admin.routes.ts,
                                     loaded with the first /admin address), then the public site's
                                     (sites/main/main.routes.ts, spread in as they stand); the app's HttpClient
                                     and its interceptors (SITE_INTERCEPTORS), and the family's error
                                     reporter (@anotoki/lib/error-report: the pages' errors, scrubbed, to
                                     the backend's error log through that HttpClient - app.config.spec.ts)
    app.component.*                  the pages behind the anotoki family's gate (<anotoki-site-gate>): while
                                     the site cannot run - not set up, a database update waiting, out of
                                     reach - the family's page stands instead, and the Migrations page for
                                     the site's ADMIN while an update waits; the router outlet is the gate's
                                     <ng-template anotokiSitePages>, made only while the gate shows the pages
                                     (so the family's page is bare: the top bar and the footer are the routed
                                     layouts' - the admin panel's too -, none made then); the kit's toasts and confirm dialog (<anotoki-toast-host>,
                                     <anotoki-confirm-host>), the survey's lightbox
    api/                             ApiService: one method a route of ../backend (whom each request is
                                     for: the library's issuedAs)
    shared/                          what both halves use, and what the root wires in:
      boot/                          boot.ts (the start, above) and the card drawn when the server could not
                                     be reached as the site started (load-error: its status answered, the
                                     sign-in's settings not)
      auth/                          signing in through the family's library (@anotoki/lib/auth):
                                     auth.config.ts (provideSiteAuth() - the boot configuration, the
                                     site's API and visitors, the words, no sign-in hint; signInOrShowWhy(),
                                     signInFailureGuard), AuthService (the survey's face of the library's
                                     AnotokiAuth: who is signed in, the visitors, the account's
                                     preferences - theme, date order, clock - and saving them), VisitorKey
                                     (the key - the library's VisitorKeyStore - and the move at sign-in).
                                     The guards (personGuard, personOrVisitorGuard), the interceptor, the
                                     callback page and the screen of a failed sign-in are the library's
                                     (the two screens loaded as they are shown: @anotoki/lib/auth/screens)
      migrations.ts                  the anotoki family's library (@anotoki/lib/migrations - the site's
                                     status, its gate; the Migrations page is @anotoki/lib/migrations/page)
                                     wired to this site's sign-in, words and dates: provideSiteMigrations(),
                                     MIGRATIONS_PATH
      translations.ts                the family's translations module (@anotoki/lib/translations)
                                     wired to this site: provideSiteTranslations() - the language and the
                                     strings (the library's TranslationService and its translate /
                                     translatePlural pipes; the account's language, the chooser's save to
                                     it), the names the site always kept them under (anotoki-survey:...),
                                     the admin pages for EDITOR and ADMIN, FORMAL_SLOVAK (the library's
                                     words in this site's formal Slovak while the database cannot be read)
      kit.ts                         the family's UI kit (@anotoki/lib/ui/<piece>, /shell) wired to this
                                     site: provideSiteKit() - the kit's words from the site's database (the
                                     library's keys, anotoki.*: TranslationService.forKit()), the icons the
                                     site draws (SURVEY_ICONS), the account's theme (the library's
                                     ThemeService), the languages of the bar's chooser (forShell())
      i18n/                          the site's own words beside the library's: answer-words (an answer's
                                     rule in the reader's language), error-text, the localDate pipe, and
                                     dynamic-keys.ts (the keys put together at run time, for the key scan)
      survey/                        the model and every rule (the twin of backend/api/survey_rules.php)
      admin/                         AdminStore (the editor's saving - the top bar's Sign out and the
                                     editor's preview ask it too), AdminDates (the admin panel's dates
                                     in the account's order and clock), admin-tools.ts (provideSiteAdmin():
                                     the family's admin tools - feedback, error log, audit log, backups -
                                     and People page, wired to this site: ADMIN from the token, "Sign in
                                     again" for a backup's proof, the People page's words and its Delete)
      feedback.ts                    the family's feedback form (@anotoki/lib/feedback - the footer's Feedback
                                     and the Contact page open it, its code loaded with the press): provideSiteFeedback() - the
                                     language, the library's words in this site's formal Slovak, whether
                                     somebody is signed in; no address handed to it (the site keeps none);
                                     the form says itself that its message is anybody's (anotoki-lib 0.7.2)
      changelog/                     Changelog: public/changelog.json read once, as the site starts - the site's
                                     version (the newest entry's, package.json's too: the version in the footer)
                                     and What's new (open(): the dialog, shared/ui/changelog-dialog, loaded with the
                                     press - the footer's What's new opens it)
      util/                          dates.ts (the admin panel's English dates), date-patterns.ts (the
                                     account's four date orders and two clocks), storage
      legal/                         the family's legal pages (@anotoki/lib/legal) wired to this site:
                                     legal.config.ts (provideAnotokiLegal() in app.config.ts - the
                                     language, the database's words of the library's keys) and
                                     legal-facts.ts (what the site keeps - feedback, and for how long,
                                     among it -, its cookies and storage, who else
                                     handles data, the anotoki account's pages from the IAM's address -
                                     every address in code; given by the legal pages' frame)
      top-bar/                       the site's wrapper over the family's bar, <anotoki-top-bar>: its brand,
                                     sections - System with the count of feedback nobody opened yet -,
                                     person and menu items, signing in and out; in every frame - the admin
                                     panel's too, as its area "admin"
      not-found/                     any address the site does not know - under /admin too
      ui/                            the survey's own pieces both halves use: the lightbox, the picture,
                                     What's new (changelog-dialog) - the rest is the family's kit
    sites/                           the two halves, each in its frames; each frame ends with the family's
                                     footer (<anotoki-site-footer>, @anotoki/lib/footer: "v{version} ·
                                     What's new · Feedback" - a screen reader hears "Version {version}" -,
                                     then About · Support · Terms · Privacy · Contact - the version and
                                     What's new the changelog's, Feedback the family's form; in the admin
                                     panel English, and no Feedback while an update waits)
      main/                          the public site: main.routes.ts; participant-layout (the frame of the
                                     survey's pages) and legal-layout (the frame of /terms, /privacy,
                                     /contact, /about and /support - anybody's, no guard - and the facts'
                                     provider); the open surveys (survey-home), a survey to take
                                     (take-survey, with question-block and survey-hero), the visitor
                                     notice; common/ - its own pieces: the gallery of pictures under a
                                     question's or a step's text (image-gallery)
      admin/                         the admin panel: admin.routes.ts; admin-layout (its frame); the
                                     surveys, the editor, the results (a visitor: "Visitor N",
                                     "Not signed in"; nobody's address - the site keeps none);
                                     Translations and Languages are the family's pages
                                     (@anotoki/lib/translations/admin, a lazy entry point); the System page
                                     (system/, ADMIN) and the family's pages it leads to, each a lazy entry
                                     point - People (@anotoki/lib/people/page), Feedback, the error log, the
                                     audit log, the backups (@anotoki/lib/admin/feedback, /errors, /audit,
                                     /backups) and Migrations (<anotoki-migrations-page>); shared/ - its
                                     own pieces: the rich text editor, the strip of pictures, and the
                                     pictures made small in the browser (images/)
public/                              the mark, the favicon, changelog.json (the versions, newest first, in
                                     English and formal Slovak - the newest is package.json's version)
proxy.conf.json                      /api and /setup.php to the backend on :8500
.nvmrc                               the Node version
```

Components are three files (`.ts`, `.html`, `.scss`); colours come from the
family's `--anotoki-*` tokens and the survey's own few in `src/styles.scss`;
every page works at 390 px. The UI kit, the top bar, the theme, the site's
words, signing in, the People page, the admin tools, the feedback form, the
error reporter, the legal pages, About and Support and the footer are the anotoki family's library
(`@anotoki/lib`, 0.9.2 - the backend's half the same), configured in
`app.config.ts`, `shared/kit.ts`,
`shared/translations.ts`, `shared/auth/auth.config.ts`,
`shared/admin/admin-tools.ts`, `shared/feedback.ts` and `shared/legal/` - never copied here; each kit piece
is imported from its own entry point (`@anotoki/lib/ui/button`, ...), never
from the `@anotoki/lib/ui` barrel. What the site says to somebody taking a
survey is a key (`'home.title' | translate`) whose strings are in the
database - the kit's own words too, the library's keys (`anotoki.*`); the
admin panel is English, written in its templates.

## Commands

```bash
npm install
npm start          # ng serve on http://localhost:4700, /api and /setup.php proxied to :8500
npm test           # Vitest, once
npm run build      # production -> dist/survey/browser/
cd .. && bun run format:check   # Prettier on every file of both halves, at the root (bun install there first)
```

## Tests

`npm test` runs every `*.spec.ts` beside its code (Vitest through
`ng test`, with `src/test-setup.ts`). `src/app/shared/testing/` holds what they share: example surveys,
`provideTestTranslations()` (the library's test translations - `@anotoki/lib/translations/testing` -
with the site's strings, the kit's words read from the same) and `answersOf()` (a person's answers or a visitor's); signing in is the library's in memory
(`@anotoki/lib/auth/testing`: `provideTestAnotokiAuth()`, its `FakeAuthClient`) or a stub of `AuthService`. The pages in a real browser, signed in through the
library's stand-in IAM, are the `check-in-browser` skill's
(`node .claude/skills/check-in-browser/scripts/run.mjs` from the repository's
root).
