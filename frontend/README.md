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
                                     boot, result-card, sky
  test-setup.ts                      the unit tests' shims for jsdom (dialog, popover, matchMedia), as the
                                     library's own tests have them
  app/
    app.config.ts, app.routes.ts     providers, the boot (core/boot.ts) and the routes
    app.component.*                  the pages behind the anotoki family's gate (<anotoki-site-gate>): while
                                     the site cannot run - not set up, a database update waiting, out of
                                     reach - the family's page stands instead, and the Migrations page for
                                     the site's ADMIN while an update waits; the router outlet is the gate's
                                     <ng-template anotokiSitePages>, made only while the gate shows the pages;
                                     the kit's toasts and confirm dialog (<anotoki-toast-host>,
                                     <anotoki-confirm-host>), the survey's lightbox
    boot/                            the card drawn when the server could not be reached as the site started
                                     (its status answered, the sign-in's settings not)
    core/
      auth/                          AuthService (the IAM's SDK 1.2.0, vendored: who is signed in, and the
                                     account's preferences - theme, date order, clock - and saving them);
                                     signInGuard (the admin panel, the preview) and takeSurveysGuard (the
                                     surveys: open to visitors while the IAM says sign-in is not required);
                                     authInterceptor (the token, or the visitor key); VisitorKey (the key,
                                     the move at sign-in); SavesInFlight; the toast when a sign-in fails
      api/                           ApiService: one method a route of ../backend
      migrations.ts                  the anotoki family's library (@anotoki/lib/migrations - the site's
                                     status, its gate; the Migrations page is @anotoki/lib/migrations/page)
                                     wired to this site's sign-in, words and dates: provideSiteMigrations(),
                                     MIGRATIONS_PATH
      kit.ts                         the family's UI kit (@anotoki/lib/ui, /shell) wired to this site:
                                     provideSiteKit() - the kit's words from the site's own strings
                                     (lookup) and in formal Slovak where it has none, the icons the site
                                     draws (SURVEY_ICONS), the account's theme (the library's ThemeService),
                                     the languages of the bar's chooser
      i18n/                          the site's words: TranslationService (the account's language, the
                                     chooser's save to it), the translate and localDate pipes
      survey/                        the model and every rule (the twin of backend/api/survey_rules.php)
      admin/                         AdminStore (the editor's saving), LocalizationDrafts, AdminDates (the
                                     admin panel's dates in the account's order and clock)
      util/                          dates.ts (the admin panel's English dates), date-patterns.ts (the
                                     account's four date orders and two clocks), storage
      images/                        pictures made small in the browser
    layouts/                         top-bar (the site's wrapper over the family's bar, <anotoki-top-bar>:
                                     its brand, sections, person and menu items, signing in and out),
                                     participant, admin
    pages/participant/               the open surveys, a survey to take, the visitor notice
    pages/admin/                     the surveys, the editor, the results (a visitor: "Visitor N",
                                     "Not signed in"), Translations, Languages; Migrations (ADMIN) is the
                                     family's page (<anotoki-migrations-page>, admin.routes.ts)
    ui/                              the survey's own pieces: the rich text editor, the lightbox, the
                                     picture and the strip of pictures (the rest is the family's kit)
public/                              the mark, the favicon
proxy.conf.json                      /api and /setup.php to the backend on :8500
.nvmrc                               the Node version
```

Components are three files (`.ts`, `.html`, `.scss`); colours come from the
family's `--anotoki-*` tokens and the survey's own few in `src/styles.scss`;
every page works at 390 px. The UI kit, the top bar and the theme are the
anotoki family's library (`@anotoki/lib`, 0.2.0), configured in
`core/kit.ts` - never copied here. What the site says to somebody taking a
survey is a key (`'home.title' | translate`) whose strings are in the
database - the kit's own words too, through `core/kit.ts`; the admin panel is
English, written in its templates.

## Commands

```bash
npm install
npm start          # ng serve on http://localhost:4700, /api and /setup.php proxied to :8500
npm test           # Vitest, once
npm run build      # production -> dist/survey/browser/
npx prettier --check "src/**/*.{ts,html,scss}"   # a checkout with CRLF line endings: add --end-of-line crlf
```

## Tests

`npm test` runs every `*.spec.ts` beside its code (Vitest through
`ng test`, with `src/test-setup.ts`). `src/app/core/testing/` holds what they share: example surveys,
`provideTestTranslations()` (the kit's words read from the same strings) and `answersOf()` (a person's answers or a visitor's). The pages in a real browser, signed in through a
stand-in IAM, are the `check-in-browser` skill's
(`node .claude/skills/check-in-browser/scripts/run.mjs` from the repository's
root).
