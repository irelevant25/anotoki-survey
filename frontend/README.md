# anotoki survey - the frontend

The survey site's pages: Angular 21 - standalone components, zoneless,
signals, OnPush. The surveys people take (in English and Slovak), the editor
and the results (the admin panel, in English). How it works and why is in
[`../docs/`](../docs/README.md); setting it up and running it in
[`../DEV.md`](../DEV.md).

## Layout

```
src/
  main.ts, index.html, styles.scss   the start, the page, the colour tokens (light and dark - and mapped
                                     onto the family's library's --anotoki-* properties)
  app/
    app.config.ts, app.routes.ts     providers, the boot (core/boot.ts) and the routes
    app.component.*                  the pages behind the anotoki family's gate (<anotoki-site-gate>): while
                                     the site cannot run - not set up, a database update waiting, out of
                                     reach - the family's page stands instead, and the Migrations page for
                                     the site's ADMIN while an update waits; the router outlet is the gate's
                                     <ng-template>, made only while the gate shows the pages
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
                                     status, its gate, the Migrations page) wired to this site's sign-in,
                                     words and dates: provideSiteMigrations(), MIGRATIONS_PATH
      i18n/                          the site's words: TranslationService (the account's language, the
                                     chooser's save to it), the translate and localDate pipes
      theme/                         ThemeService: the account's theme signed in, the device's signed out
      survey/                        the model and every rule (the twin of backend/api/survey_rules.php)
      admin/                         AdminStore (the editor's saving), LocalizationDrafts, AdminDates (the
                                     admin panel's dates in the account's order and clock)
      util/                          dates.ts (the admin panel's English dates), date-patterns.ts (the
                                     account's four date orders and two clocks), storage
      images/                        pictures made small in the browser
    layouts/                         top-bar (the anotoki family's bar), participant, admin
    pages/participant/               the open surveys, a survey to take, the visitor notice
    pages/admin/                     the surveys, the editor, the results (a visitor: "Visitor N",
                                     "Not signed in"), Translations, Languages; Migrations (ADMIN) is the
                                     family's page (<anotoki-migrations-page>, admin.routes.ts)
    ui/                              the IAM's UI kit, the rich text editor, the language chooser
public/                              the mark, the favicon, theme-boot.js (the theme shown last, before first paint)
proxy.conf.json                      /api and /setup.php to the backend on :8500
.nvmrc                               the Node version
```

Components are three files (`.ts`, `.html`, `.scss`); colours come from the
tokens in `src/styles.scss`; every page works at 390 px. What the site says to
somebody taking a survey is a key (`'home.title' | translate`) whose strings
are in the database; the admin panel is English, written in its templates.

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
`ng test`). `src/app/core/testing/` holds what they share: example surveys,
`provideTestTranslations()` and `answersOf()` (a person's answers or a visitor's). The pages in a real browser, signed in through a
stand-in IAM, are the `check-in-browser` skill's
(`node .claude/skills/check-in-browser/scripts/run.mjs` from the repository's
root).
