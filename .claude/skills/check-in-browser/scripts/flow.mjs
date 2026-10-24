// The survey site end to end in headless Chrome (or Edge), signing in through
// the anotoki library's stand-in IAM
// (backend/vendor/anotoki/lib/backend/testing/stand-in-iam.php) - never the real
// one. It expects an empty site: run.mjs makes one and starts everything; on its own:
//
//   node flow.mjs <debugging port> <site origin> <fake IAM origin> <png file> <shots folder>
//
// In English (the language pinned through the site itself, /?lang=en): the
// owner (ADMIN) writes a survey with a picture and opens it; somebody with no
// role takes it, once, and is kept out of the admin area; the owner reads the
// answer; an editor gets everything but the delete buttons; a phone-sized page
// has no sideways scroll and a top bar that fits.
//
// Every page is for somebody signed in while the IAM says sign-in is required
// (the stand-in's default; the visitors' stage near the end switches it off):
// somebody not signed in goes to the IAM first and comes back to the page asked for - nothing of a survey is drawn or asked
// for before; and the API answers nothing of a survey without a token (its
// pictures aside: an <img> sends none, and their addresses are UUIDs). The
// family's top bar - brand, links, language, theme, the person's menu - at
// 360, 390 and 1280 px, light and dark; on a phone the links and the person's
// menu are inside one menu button (focus in, arrow keys, Escape back, a click
// outside, Tab and Shift+Tab back to the button from any item). A sign-in the
// IAM turns down (the stand-in's `deny`) ends on the anotoki family's screen of
// a failed sign-in (anotoki-lib 0.4.1, on /auth/callback: why, in the site's
// words - formal Slovak too -, Try again and Back); "signed out" is a session
// that ended with the page open: the page then draws a card with Sign in
// instead of itself.
//
// Then in Slovak (/?lang=sk): the top bar on a phone, signed out and signed
// in; the home page and a survey, step by step; no key of the bundle on any of
// those pages; the admin area in English all the same; the language of the
// IAM account when nothing is stored here; and the chooser.
//
// Then the translating itself, on the anotoki family's pages
// (@anotoki/lib/translations/admin): the owner finds the library's words among
// the site's, in the site's formal Slovak; rewords a string of the site on the
// Translations page (and is refused a placeholder the English string does not
// have), hides Slovak on the Languages page and offers it again; writes a
// second survey, adds Slovak to it in the editor, translates every text and
// opens it. One reader takes it in Slovak; another changes to English in the
// middle of a step and keeps the answer; the admin area says which language
// each read it in. The first survey, which has no Slovak, is shown in English
// on a Slovak page and says so; and so is the second, whole, once one of its
// texts is left untranslated.
//
// And what only a browser shows of the things that go wrong: a Slovak
// browser's first visit is one request for its strings; a save of the site's
// strings that fails with no key to blame is said where Save is; what is
// typed and not saved on the Translations page is there again after the
// session ended and the person signed in again (the admin area says "You are
// signed out", its links and Back work; the browser asks "Leave site?" on the
// way to the sign-in - the family's drafts ask whenever boxes wait - and they
// are kept all the same), and signing out asks first; a new language starts
// hidden; the
// editor says what readers of a language get while an open survey lacks a
// text in it - and nothing of the kind once its last day is over - and its
// list of problems is worded for a draft, an open and a closed survey; the
// author saving over a translator's save keeps the translator's texts, and
// keeps their own translation of a question the other version removed; "Save
// mine over it" is not offered where the server would refuse it; a preview
// from the editor's main tab shows the survey as it is written, whatever the
// page's language; answers sent to an address the survey has left are said to
// be kept, and offered again at its new address; a database behind the code
// (six files' rows taken out of its record - the site's 004, 011 and 012, the
// library's three of this release - and a sign-in word put back as it was
// before 012, reworded by its owner: the one stage that changes the database
// itself, through sql()):
// the anotoki family's page - "being
// updated", with no error and nothing to press but a quiet Sign in, for
// somebody taking surveys and an EDITOR; no page made behind it, for a
// visitor, somebody signed in or the ADMIN (the site's API asked nothing but
// its status, the sign-in and the strings, no toast); for the site's ADMIN
// the way to the
// Migrations page, which a Sign in at its address comes back to, an Apply that
// stops at a failing file with the database's error, and one that brings the
// site back where it stands, its strings read again - the owner's word kept;
// visitors -
// the IAM's "Sign-in required" switched off: nobody signed in takes surveys
// (a second browser too), the admin panel lists them as "Visitor N", "Not
// signed in", the admin panel and the preview still sign in, a sign-in moves
// the visitor's answers and draft into the account (the person's own answers
// win), and switched on again a visitor is sent to sign in and keeps the key;
// the ADMIN's System pages (People - the scrub of an account the IAM deleted,
// a person's answers deleted after its question -, Feedback, the error log,
// the audit log, the backups - made after a new sign-in, downloaded by their
// link, deleted) and an EDITOR kept out of them; Terms, Privacy and Contact
// (the family's legal pages, anybody's) and the footer's links to them -
// Contact's feedback form sent by nobody signed in, and in formal Slovak on a
// phone -, then that message on the admin panel: counted beside System and on
// its card, opened, marked resolved, deleted after its question, audited;
// and the pages drawn instead of the site - not set up (the setup page offered
// only to a site never installed), out of reach (the family's page, and the
// site's own card when only the sign-in cannot be had) - bare, as the family's
// page is while an update waits (no top bar, no footer), name the tab by the
// site, never by a key, and "Try again" opens the page that was asked for.
//
// Prints ok/FAIL per check and every page error. A console warning is a
// problem too - "[i18n] no string for ..." is how a missing string shows.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openPage, openPageInNewContext, sleep, waitFor } from './cdp.mjs';

const [port, origin, iam, pngFile, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const page = await openPage(Number(port));
await page.send('Page.enable');
await page.send('Runtime.enable');
await page.send('DOM.enable');
await page.send('Network.enable');
const problems = [];
/**
 * What the console is expected to say in the stage that is running - a stage that takes the server away on
 * purpose, or throws a page's error for the error log: expressions for the messages (an exception's too), which are
 * then kept here (`heard`) instead of counted as problems.
 */
let expected = [];
const heard = [];
page.on('Runtime.exceptionThrown', (e) => {
  const message = 'exception: ' + (e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text);
  if (expected.some((pattern) => pattern.test(message))) heard.push(message);
  else problems.push(message);
});
page.on('Runtime.consoleAPICalled', (e) => {
  if (e.type !== 'error' && e.type !== 'warning') return;
  const message = `console.${e.type}: ` + e.args.map((a) => a.value ?? a.description).join(' ');
  if (expected.some((pattern) => pattern.test(message))) heard.push(message);
  else problems.push(message);
});
// What is typed on the Translations and Languages pages and not saved makes the browser ask before the tab is left
// (beforeunload). The flow saves before it goes anywhere, so the browser's question is a problem here - except in
// the stage that leaves with boxes unsaved on purpose (`leaving` is then a list, and the questions go there). It is
// answered either way, or the check would hang.
let leaving = null;
page.on('Page.javascriptDialogOpening', (e) => {
  if (leaving && e.type === 'beforeunload') leaving.push(e.message);
  else problems.push(`the browser asked (${e.type}): ${e.message}`);
  void page.send('Page.handleJavaScriptDialog', { accept: true });
});
/** Every request the page made, as "GET /api/translations/sk": a stage counts the ones made since it began. */
const requested = [];
/** Where each of them went, by the same index: the site's origin, the stand-in IAM's, or another host's (Umami's). */
const requestedOrigins = [];
page.on('Network.requestWillBeSent', (e) => {
  try {
    const url = new URL(e.request.url);
    requested.push(`${e.request.method} ${url.pathname}`);
    requestedOrigins.push(url.origin);
  } catch {
    // an address that is not one (about:blank, data:)
  }
});
/** The pages' error reports (POST /api/client-errors) as they left: whether each carried a token, a visitor's key. */
const errorReports = [];
page.on('Network.requestWillBeSent', (e) => {
  if (e.request.method === 'POST' && e.request.url.split('?')[0] === `${origin}/api/client-errors`) {
    const headers = Object.fromEntries(Object.entries(e.request.headers ?? {}).map(([name, value]) => [name.toLowerCase(), String(value)]));
    errorReports.push({ token: /^Bearer \S+$/.test(headers.authorization ?? ''), visitorKey: 'x-visitor-key' in headers, body: e.request.postData ?? '' });
  }
});
/**
 * Requests answered from here instead of by the server, for the stages where the server fails: `answer(request)`
 * says what becomes of one - null (let it through), 'unreachable' (no answer at all), or {status, body}: a JSON
 * answer, or a bare page like a proxy's when the body is a text.
 */
let answer = null;
page.on('Fetch.requestPaused', (e) => {
  const reply = answer ? answer(e.request) : null;
  if (reply === null) {
    void page.send('Fetch.continueRequest', { requestId: e.requestId });
  } else if (reply === 'unreachable') {
    void page.send('Fetch.failRequest', { requestId: e.requestId, errorReason: 'ConnectionRefused' });
  } else {
    const json = typeof reply.body !== 'string';
    void page.send('Fetch.fulfillRequest', {
      requestId: e.requestId,
      responseCode: reply.status,
      responseHeaders: [
        { name: 'Content-Type', value: json ? 'application/json' : 'text/html; charset=utf-8' },
        { name: 'Cache-Control', value: 'no-store' },
      ],
      body: Buffer.from(json ? JSON.stringify(reply.body) : reply.body).toString('base64'),
    });
  }
});
/** From now on the requests whose address matches `pattern` (a * is anything) are answered by `say`. */
async function intercept(pattern, say) {
  answer = say;
  await page.send('Fetch.enable', { patterns: [{ urlPattern: pattern }] });
}
/** The server answers for itself again. */
async function stopIntercepting() {
  await page.send('Fetch.disable');
  answer = null;
}

/** A desktop window, or a phone `width` wide. */
async function viewport(width) {
  const phone = width < 1000;
  await page.send('Emulation.setDeviceMetricsOverride', { width, height: phone ? 740 : 860, deviceScaleFactor: phone ? 2 : 1, mobile: phone });
  await sleep(250);
}
await viewport(1280);

/** What the device says it prefers; the site follows it while no theme is chosen (and the check never chooses one). */
async function theme(value) {
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] });
  await sleep(250);
}
// Said here, like the language: a computer set to dark would otherwise make every screenshot dark.
await theme('light');

let shot = 0;
/** `whole`: the page to its end, not only what the window shows. */
async function screenshot(name, whole = false) {
  await sleep(300);
  const options = { format: 'png' };
  let scrolled = 0;
  if (whole) {
    // From the top: the bar is sticky, and would be drawn across the middle of a page that is scrolled.
    scrolled = await js('window.scrollY');
    await js("window.scrollTo({ top: 0, behavior: 'instant' }); true");
    await sleep(150);
    const { cssContentSize } = await page.send('Page.getLayoutMetrics');
    options.captureBeyondViewport = true;
    // As wide as the window: for the capture the page is laid out without its scrollbar, and would lose its right edge.
    options.clip = { x: 0, y: 0, width: Math.max(cssContentSize.width, await js('window.innerWidth')), height: cssContentSize.height, scale: 1 };
  }
  const { data } = await page.send('Page.captureScreenshot', options);
  if (scrolled) {
    await js(`window.scrollTo({ top: ${scrolled}, behavior: 'instant' }); true`);
  }
  writeFileSync(`${out}/${String(++shot).padStart(3, '0')}-${name}.png`, Buffer.from(data, 'base64'));
}
/** The same page twice: light, then dark. */
async function screenshots(name, whole = true) {
  await screenshot(`${name}-light`, whole);
  await theme('dark');
  await screenshot(`${name}-dark`, whole);
  await theme('light');
}
const js = (expression) => page.evaluate(expression);
async function settle() {
  await waitFor(page, "document.readyState === 'complete' && !!document.querySelector('app-root')?.children.length", 20000);
  await sleep(700);
}
async function go(path) {
  await page.send('Page.navigate', { url: origin + path });
  await settle();
}
let checks = 0;
function expect(what, ok, detail = '') {
  checks++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail !== '' && detail !== null && detail !== undefined ? ' - ' + detail : ''}`);
  if (!ok) problems.push(`expectation failed: ${what} ${detail ?? ''}`);
}
const clickText = (selector, text) =>
  js(
    `(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.textContent.replace(/\\s+/g,' ').trim().includes(${JSON.stringify(text)})); if (!el) return 'missing: ' + ${JSON.stringify(text)}; el.scrollIntoView({block:'center'}); el.click(); return true; })()`,
  );
async function focus(selector, index = 0) {
  const done = await js(
    `(() => { const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if (!el) return false; el.scrollIntoView({block:'center'}); el.focus(); return document.activeElement === el || el.contains(document.activeElement); })()`,
  );
  if (!done) problems.push(`could not focus ${selector}[${index}]`);
  await sleep(150);
}
async function typeText(text) {
  await page.send('Input.insertText', { text });
  await sleep(150);
}
async function setFiles(selector, index, files) {
  const { result } = await page.send('Runtime.evaluate', { expression: `document.querySelectorAll(${JSON.stringify(selector)})[${index}]` });
  if (!result.objectId) return false;
  await page.send('DOM.setFileInputFiles', { files, objectId: result.objectId });
  return true;
}
const text = (selector) => js(`document.querySelector(${JSON.stringify(selector)})?.textContent.replace(/\\s+/g, ' ').trim() ?? null`);
const texts = (selector) => js(`[...document.querySelectorAll(${JSON.stringify(selector)})].map((e) => e.textContent.replace(/\\s+/g, ' ').trim())`);
/** What is in a field or a box is replaced by `value`, through real input events. */
async function fill(selector, value) {
  const done = await js(
    `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.scrollIntoView({block:'center'}); el.focus(); el.select(); return document.activeElement === el; })()`,
  );
  if (!done) problems.push(`could not fill ${selector}`);
  await sleep(150);
  await typeText(value);
}
/** The editor has saved everything changed so far (the header says so only once the save after the last change is back). */
const saved = () => waitFor(page, "(document.querySelector('app-survey-header .save')?.textContent ?? '').includes('Saved')", 15000);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** The site's version: the newest entry of the changelog.json it serves - what the family's footer shows (one source). */
const VERSION = (await (await fetch(`${origin}/changelog.json`)).json())[0].version;
/** The family's footer's first row (<anotoki-site-footer>, anotoki-lib 0.6.3), as it reads in each language: the version, What's new, Feedback. */
const FOOTER_ROW = {
  en: [`v${VERSION}Version ${VERSION}`, '·', "What's new", '·', 'Feedback'],
  sk: [`v${VERSION}Verzia ${VERSION}`, '·', 'Čo je nové', '·', 'Spätná väzba'],
};
/** The stand-in IAM told how to behave: who signs in next ({user}), whether it still renews a session ({refuse}). */
const setIam = async (changes) => (await fetch(`${iam}/_test/state`, { method: 'POST', body: JSON.stringify(changes) })).ok;
const setIamUser = (user) => setIam({ user });
// What the browser asked the stand-in IAM, in order - without the site's own question about its
// "Sign-in required" switch (GET /api/public/applications/...), which the backend asks at any page load.
const iamTrips = async () => ((await (await fetch(`${iam}/_test/state`)).json()).log ?? []).filter((line) => !line.startsWith('GET /api/public/'));
/**
 * The language the browser itself is set to - what `navigator.languages` says and `Accept-Language` sends ("sk-SK",
 * or a list: "en-GB,en"). Chrome was started in English (run.mjs); a stage that wants another says so, and puts it back.
 */
async function browserLanguage(languages) {
  await page.send('Emulation.setUserAgentOverride', { userAgent: await js('navigator.userAgent'), acceptLanguage: languages });
}
const escape = async () => {
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(200);
};
/**
 * A statement run on the check's own database - survey_test_browser, through the settings run.mjs wrote
 * (SURVEY_CHECK_CONFIG; the app honours them only for a survey_test_ database) - for the one stage that needs the
 * database itself changed, as a release changes it: a database behind the code.
 */
function sql(statement) {
  const { SURVEY_CHECK_PHP: php = 'php', SURVEY_CHECK_BACKEND: backend, SURVEY_CHECK_CONFIG: config } = process.env;
  if (!backend || !config) throw new Error('SURVEY_CHECK_BACKEND and SURVEY_CHECK_CONFIG are not set: run the check through run.mjs.');
  execFileSync(php, ['-r', 'require "api/bootstrap.php"; dbExec($argv[1]);', '--', statement], {
    cwd: backend,
    env: { ...process.env, SURVEY_TEST_CONFIG: config },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

// ── The language ────────────────────────────────────────────────────────────

/**
 * The words the check clicks and reads in each language - the strings of migration 003; and the screen of a failed
 * sign-in's (the anotoki library's `anotoki.signIn.*`: its heading and buttons the library's own, why it failed the
 * site's sentences, which migration 012 moved under the library's keys).
 */
const EN = {
  code: 'en',
  signIn: 'Sign in',
  signOut: 'Sign out',
  home: 'Have your say',
  failedTitle: 'Signing in did not work',
  retry: 'Try again',
  back: 'Back',
  notCompleted: 'Signing in was not completed. If you did not go back yourself, this account may not be allowed to use the surveys.',
  storageUnavailable: 'This browser would not let the site remember the sign-in in progress. Allow this site to store data (cookies and site data), then sign in again.',
};
const SK = {
  code: 'sk',
  signIn: 'Prihlásiť sa',
  signOut: 'Odhlásiť sa',
  home: 'Povedzte nám svoj názor',
  failedTitle: 'Prihlásenie sa nepodarilo',
  retry: 'Skúsiť znova',
  back: 'Späť',
  notCompleted: 'Prihlásenie sa nedokončilo. Ak ste ho nezrušili Vy, tento účet možno nemá k prieskumom prístup.',
};

const LANGUAGE_KEY = 'anotoki-survey:language';
const pageLanguage = () => js('document.documentElement.lang');
/** What is kept about the language: by the chooser on this device, and by ?lang= for this tab. */
const storedLanguage = () => js(`[localStorage.getItem(${JSON.stringify(LANGUAGE_KEY)}), sessionStorage.getItem(${JSON.stringify(LANGUAGE_KEY)})].join(' / ')`);

// Every key the site has a string for, and their namespaces: what must never be read on a page.
const bundle = await (await fetch(`${origin}/api/translations/sk`)).json();
const KEYS = [...new Set([...Object.keys(bundle.values ?? {}), ...Object.keys(bundle.english ?? {})])];
const NAMESPACES = [...new Set(KEYS.map((key) => key.split('.')[0]))];
expect(
  'the site has its strings, in English and in Slovak',
  KEYS.length > 100 && bundle.language === 'sk' && bundle.languages?.length === 2,
  `${KEYS.length} keys, ${bundle.language}, ${bundle.languages?.map((l) => l.code)}`,
);

/**
 * The keys a reader could see or hear on the page as it is now: in its text,
 * in the attributes that are read out, in the tab's title. A key of the
 * bundle, or anything shaped like a key in one of its namespaces.
 */
const keysShown = () =>
  js(`(() => {
    const texts = [document.title];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.parentElement?.closest('script, style, noscript')) texts.push(node.textContent);
    }
    for (const el of document.querySelectorAll('*')) {
      for (const name of ['aria-label', 'aria-valuetext', 'aria-description', 'title', 'placeholder', 'alt']) {
        const value = el.getAttribute(name);
        if (value) texts.push(value);
      }
    }
    const keys = ${JSON.stringify(KEYS)};
    const namespaces = new Set(${JSON.stringify(NAMESPACES)});
    const shaped = /(?<![A-Za-z0-9_.@\\/-])([a-z][A-Za-z0-9]*)(?:\\.[A-Za-z0-9][A-Za-z0-9_-]*)+/g;
    const found = new Set();
    for (const text of texts) {
      for (const key of keys) if (text.includes(key)) found.add(key);
      for (const match of text.matchAll(shaped)) if (namespaces.has(match[1])) found.add(match[0]);
    }
    return [...found];
  })()`);
async function expectNoKeys(where) {
  const found = await keysShown();
  expect(`${where}: no key where a word should be`, found.length === 0, found.join(', '));
}

/**
 * Whether the top bar holds what is in it: the mark, the language, the theme
 * and the person (or the sign-in button) side by side, each inside the window
 * and inside the bar's own padding, none over another, the button's words on
 * one line and not pressed into its padding (a bar with too much in it
 * squeezes the button before anything scrolls).
 */
const barFits = () =>
  js(`(() => {
    const inner = document.querySelector('app-top-bar .anotoki-top-bar__row');
    if (!inner) return { ok: false, detail: 'no top bar' };
    const names = ['anotoki-brand', '.anotoki-top-bar__nav', 'anotoki-language-switcher', 'anotoki-theme-toggle', '.anotoki-top-bar__person-button', '.anotoki-top-bar__menu-button', 'button.anotoki-top-bar__sign-in'];
    const parts = names.map((name) => [name, inner.querySelector(name)]).filter(([, el]) => el);
    const rects = parts.map(([, el]) => el.getBoundingClientRect());
    const width = window.innerWidth;
    const inside = rects.every((r) => r.left >= 0 && r.right <= width + 0.5);
    const apart = rects.every((r, i) => i === 0 || r.left >= rects[i - 1].right - 0.5);
    const padding = (el, side) => parseFloat(getComputedStyle(el)['padding' + side]);
    const button = inner.querySelector('button.anotoki-top-bar__sign-in');
    let oneLine = true;
    let roomy = true;
    if (button) {
      const box = button.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(button);
      const words = range.getBoundingClientRect();
      oneLine = button.scrollWidth <= button.clientWidth + 1 && box.height <= 44;
      roomy = words.left >= box.left + padding(button, 'Left') - 1 && words.right <= box.right - padding(button, 'Right') + 1;
    }
    const bar = inner.getBoundingClientRect();
    const held = inner.scrollWidth <= inner.clientWidth + 1 && rects.every((r) => r.left >= bar.left + padding(inner, 'Left') - 1 && r.right <= bar.right - padding(inner, 'Right') + 1);
    return {
      ok: inside && apart && oneLine && roomy && held,
      detail: (roomy ? '' : 'the button is squeezed; ') + (held ? '' : 'more than the bar holds; ') + parts.map(([name], i) => name.replace(/^.*anotoki-(top-bar__)?/, '') + ' ' + Math.round(rects[i].left) + '-' + Math.round(rects[i].right)).join(', ') + ' of ' + width,
    };
  })()`);
async function expectBar(where) {
  const bar = await barFits();
  expect(`${where}: the top bar fits`, bar.ok, bar.detail);
  expect(`${where}: no sideways scroll`, await js('document.documentElement.scrollWidth <= window.innerWidth'), await js('document.documentElement.scrollWidth + " of " + window.innerWidth'));
}
/** A menu that is open (the person's, the chooser's) is inside the window. */
const menuInside = (selector) =>
  js(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return !!r && r.left >= 0 && r.right <= window.innerWidth + 0.5; })()`);
const expectNoSideways = async (where) =>
  expect(`${where}: no sideways scroll`, await js('document.documentElement.scrollWidth <= window.innerWidth'), await js('document.documentElement.scrollWidth + " of " + window.innerWidth'));

/**
 * Everything inside `root` that says it is in a language of its own, as
 * "class: lang" (the tag where there is no class). A survey's own texts say
 * so when their language is not the page's; the site's words never do.
 */
const marked = (root) => js(`[...document.querySelectorAll(${JSON.stringify(root + ' [lang]')})].map((e) => (e.className || e.tagName.toLowerCase()) + ': ' + e.getAttribute('lang'))`);

/** The open surveys as the home page lists them, by address: the title, the language the title says it is in, the note under its facts. */
const listed = async () =>
  Object.fromEntries(
    await js(
      `[...document.querySelectorAll('app-survey-home a.survey')].map((a) => [a.getAttribute('href').slice(1), [a.querySelector('.survey-title').textContent.trim(), a.querySelector('.survey-title').getAttribute('lang'), a.querySelector('.survey-language')?.textContent.replace(/\\s+/g, ' ').trim() ?? null]])`,
    ),
  );

/** The chooser in the top bar: a language by the name its speakers give it. */
async function chooseLanguage(nativeName, code) {
  await js("document.querySelector('anotoki-language-switcher .anotoki-language-switcher__switcher').click(); true");
  await sleep(300);
  const chosen = await clickText('anotoki-language-switcher [role=menuitemradio]', nativeName);
  if (chosen !== true) problems.push(`the chooser has no ${nativeName}: ${chosen}`);
  await waitFor(page, `document.documentElement.lang === ${JSON.stringify(code)}`, 15000);
  await sleep(400);
}

/** An answer of the step on the page, by the value the server knows it by (an option's id; "female", "25-34" for the step about the reader). */
async function pick(value) {
  const done = await js(
    `(() => { const el = document.querySelector(${JSON.stringify(`app-take-survey input[value="${value}"]`)}); if (!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true; })()`,
  );
  if (!done) problems.push(`no answer "${value}" on the page`);
  await sleep(200);
}
/** The labels of the options that are chosen on the page. */
const chosenLabels = () =>
  js("[...document.querySelectorAll('app-question-block label.option')].filter((o) => o.querySelector('input').checked).map((o) => o.querySelector('.label').textContent.trim())");

// ── Signing in and out ──────────────────────────────────────────────────────

/**
 * The person's menu: on a desktop its own button (the name), on a phone the menu button, which holds the site's
 * links and then the person's menu (or Sign in).
 */
async function openUserMenu() {
  await js("(document.querySelector('app-top-bar .anotoki-top-bar__person-button') ?? document.querySelector('app-top-bar .anotoki-top-bar__menu-button')).click(); true");
  await sleep(300);
}
/** The site holds a session (the SDK's stored tokens) and the bar is drawn. */
const SIGNED_IN =
  "Object.keys(localStorage).some((name) => name.startsWith('anotoki-auth:') && !!JSON.parse(localStorage.getItem(name) || 'null')?.access_token) && !!document.querySelector('app-top-bar .anotoki-top-bar__person-button, app-top-bar .anotoki-top-bar__menu-button')";
/** Who the bar says is signed in: the name on its button, or - on a phone - at the head of the menu; null for nobody. */
async function whoIsIn() {
  if (await js("!!document.querySelector('app-top-bar .anotoki-top-bar__person-button')")) {
    return text('app-top-bar .anotoki-top-bar__person-name');
  }
  if (!(await js("!!document.querySelector('app-top-bar .anotoki-top-bar__menu-button')"))) {
    return null;
  }
  const open = await js("!!document.querySelector('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu]')");
  if (!open) await openUserMenu();
  const name = await text('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu] .anotoki-top-bar__menu-name');
  if (!open) await escape();
  return name;
}
/** The session the site holds is forgotten (as if the browser had never signed in here); the IAM's is the stand-in's. */
const forgetSession = () => js("Object.keys(localStorage).filter((name) => name.startsWith('anotoki-auth:')).forEach((name) => localStorage.removeItem(name)); true");

/**
 * Out through the person's menu. The stand-in IAM's logout comes back to /, which is for somebody signed in: the
 * sign-in follows at once - whoever the stand-in signs in now (`setIam({ user })`), or, with `deny`, nobody (the
 * screen of a failed sign-in then). Nothing to do when nobody is signed in.
 */
async function signOut(words) {
  await go('/');
  if (await js(SIGNED_IN)) {
    await openUserMenu();
    await clickText('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menuitem]', words.signOut);
    await sleep(1500);
    await settle();
    await sleep(800);
    await settle();
  }
}

/** Signed in as `user`: out through the menu (by the words of the language the page is in), and in again at once. */
async function signInAs(user, words = EN) {
  await setIam({ user, deny: false });
  await signOut(words);
  if (!(await js(SIGNED_IN))) {
    // A page drawn without a sign-in: the screen of a sign-in the IAM turned down (its Try again), or a layout's card.
    if (await js(FAILURE_SCREEN)) {
      await js("document.querySelector('anotoki-sign-in-failure button[data-retry]').click(); true");
    } else {
      await clickText('anotoki-empty-state button', words.signIn);
    }
    await sleep(1500);
    await settle();
  }
  await waitFor(page, SIGNED_IN, 15000);
  const who = await whoIsIn();
  expect(`signed in as ${user.username}`, who === user.username, who);
}

/** The anotoki family's screen of a sign-in that came back without one, or could not start (<anotoki-sign-in-failure>, on /auth/callback). */
const FAILURE_SCREEN = "!!document.querySelector('anotoki-sign-in-failure section')";
/** What that screen says: its heading, why, its buttons, the language it says it is in. */
const failureScreen = async () => ({
  heading: await text('anotoki-sign-in-failure h1'),
  message: await text('anotoki-sign-in-failure [role=alert]'),
  buttons: await texts('anotoki-sign-in-failure button'),
  lang: await js("document.querySelector('anotoki-sign-in-failure section')?.getAttribute('lang') ?? null"),
});
/** Its Try again: the sign-in once more, back to where it started. */
async function tryAgain() {
  await js("document.querySelector('anotoki-sign-in-failure button[data-retry]').click(); true");
  await sleep(1500);
  await settle();
}

/**
 * A sign-in the IAM turns down, on `path`: the session forgotten and the stand-in told to `deny`, so the page comes
 * back from the IAM without one - and instead of the page the anotoki family's screen says why (on /auth/callback),
 * with Try again and Back. `setIam({ deny: false })` and its Try again sign in again.
 */
async function refusedOn(path) {
  await setIam({ deny: true });
  await forgetSession();
  await go(path);
  await waitFor(page, FAILURE_SCREEN, 15000);
  await sleep(500);
}

/**
 * Nobody signed in any more, on `path`: signed in there first (whoever the stand-in signs in now), then the session
 * ends the way another tab ends it - the stored tokens gone, with the storage event the library listens for - so the
 * page is taken away where it is, with no navigation, and the layout's card stands in its place; the bar offers Sign
 * in. A page load from here goes to the IAM again (and back at once, unless the stand-in is told to deny).
 */
async function sessionEndsOn(path) {
  await setIam({ deny: false });
  await go(path);
  await waitFor(page, SIGNED_IN, 15000);
  await js(
    "(() => { for (const key of Object.keys(localStorage).filter((name) => name.startsWith('anotoki-auth:') && !name.includes(':login:'))) { localStorage.removeItem(key); window.dispatchEvent(new StorageEvent('storage', { key })); } return true; })()",
  );
  await waitFor(page, "!!document.querySelector('app-participant-layout anotoki-empty-state, app-admin-layout anotoki-empty-state')", 15000);
  await sleep(500);
}

// Every account holds MEMBER (the IAM gives it to everyone): an ordinary person is ['MEMBER'].
const OWNER = { id: 1, username: 'owner', roles: ['MEMBER', 'ADMIN'] };
const PAT = { id: 101, username: 'pat', roles: ['MEMBER'] };
const EDITH = { id: 2, username: 'edith', roles: ['MEMBER', 'EDITOR'] };
// For the Slovak pass. Nina's account is English: her Slovak comes from the link she followed.
const NINA = { id: 102, username: 'nina', roles: ['MEMBER'], locale: 'en' };
// Zuzana's account is Slovak - and her name is twenty characters, the longest the bar was measured with.
const ZUZANA = { id: 103, username: 'zuzana-kovacova-2026', roles: ['MEMBER'], locale: 'sk' };

// ── Signed in first: every page goes to the IAM before anything of it is drawn ──
await setIam({ user: OWNER, deny: false });
await go('/');
await js('localStorage.clear(); sessionStorage.clear(); true');
// The language is said through the site itself, and holds for the tab from here on - through the IAM and back.
let since = requested.length;
await go('/?lang=en');
await waitFor(page, SIGNED_IN + " && !!document.querySelector('app-survey-home h1')", 15000);
let trip = requested.slice(since);
expect(
  '?lang=en: English, kept for this tab only and taken out of the address',
  (await pageLanguage()) === 'en' && (await storedLanguage()) === ' / en' && (await js('location.search')) === '',
  `${await pageLanguage()}, ${await storedLanguage()}, ${await js('location.search')}`,
);
expect(
  'nobody signed in, /: to the IAM first, back at / signed in - no survey asked for before the sign-in',
  (await js('location.pathname')) === '/' && trip.includes('GET /api/oidc/authorize') && trip.indexOf('GET /api/surveys') > trip.indexOf('GET /api/oidc/authorize'),
  trip.join(', '),
);
expect('the owner is signed in', (await whoIsIn()) === 'owner', await whoIsIn());
expect(
  'the language chooser in the top bar says EN, and its name says it too',
  (await text('anotoki-language-switcher .anotoki-language-switcher__switcher')) === 'EN' &&
    (await js("document.querySelector('anotoki-language-switcher .anotoki-language-switcher__switcher').getAttribute('aria-label')")) === 'Language: English (EN)',
  await js("document.querySelector('anotoki-language-switcher .anotoki-language-switcher__switcher')?.getAttribute('aria-label')"),
);
// The heading is there before the list: the list's answer may come a moment after it.
await waitFor(page, "(document.querySelector('app-survey-home')?.textContent ?? '').includes('No survey is open right now')", 10000).catch(() => null);
expect('no survey is open yet', (await text('app-survey-home'))?.includes('No survey is open right now'), (await text('app-survey-home'))?.slice(0, 160));
expect('the tab is named in English', (await js('document.title')) === 'Surveys · anotoki survey', await js('document.title'));
// Nor does the API answer anything of a survey without a token.
const tokenless = await Promise.all(['/api/surveys', '/api/surveys/anything', '/api/admin/surveys'].map(async (path) => `${path} ${(await fetch(origin + path)).status}`));
expect(
  'without a token the API answers 401 for the surveys, a survey and the admin area',
  same(tokenless, ['/api/surveys 401', '/api/surveys/anything 401', '/api/admin/surveys 401']),
  tokenless.join(', '),
);

// The family's top bar on a desktop: the brand, the links, then the language, the theme and the person.
const barRow = () =>
  js(
    "[...document.querySelector('app-top-bar .anotoki-top-bar__row').querySelectorAll(':scope > anotoki-brand, :scope > .anotoki-top-bar__nav, .anotoki-top-bar__actions > *')].filter((e) => e.tagName.toLowerCase() !== 'anotoki-menu').map((e) => e.matches('.anotoki-top-bar__nav') ? 'links: ' + [...e.querySelectorAll('a')].map((a) => a.textContent.trim() + (a.getAttribute('aria-current') === 'page' ? ' (page)' : '')).join(' ') : e.matches('.anotoki-top-bar__person-button') ? 'person' : e.matches('.anotoki-top-bar__menu-button') ? 'phone-menu' : e.matches('.anotoki-top-bar__sign-in') ? 'sign-in' : e.tagName.toLowerCase())",
  );
expect(
  '1280 px: one row - brand, links (Surveys, the page), language, theme, the person',
  same(await barRow(), ['anotoki-brand', 'links: Surveys (page)', 'anotoki-language-switcher', 'anotoki-theme-toggle', 'person']),
  JSON.stringify(await barRow()),
);
expect(
  '1280 px: the brand is the mark, "anotoki" and "survey", linking home',
  same(await texts('app-top-bar anotoki-brand .anotoki-brand__wordmark > span'), ['anotoki', 'survey']) &&
    (await js("document.querySelector('app-top-bar anotoki-brand a').getAttribute('href')")) === '/',
  await text('app-top-bar anotoki-brand'),
);
await expectBar('English, 1280 px, signed in');
await screenshots('en-1280-bar', false);

// A survey's address, nobody signed in: to the IAM and back to that address (here: no survey there).
await forgetSession();
since = requested.length;
await go('/no-such-survey');
await waitFor(page, SIGNED_IN + " && !!document.querySelector('.message-heading')", 15000);
trip = requested.slice(since);
expect(
  "nobody signed in, a survey's address: to the IAM, back to that address - asked for only after",
  (await js('location.pathname')) === '/no-such-survey' && trip.indexOf('GET /api/surveys/no-such-survey') > trip.indexOf('GET /api/oidc/authorize') && trip.indexOf('GET /api/oidc/authorize') >= 0,
  `${await js('location.pathname')}: ${trip.join(', ')}`,
);

// The admin area, the sign-in turned down: the anotoki family's screen of a failed sign-in (anotoki-lib 0.4.1), on
// the callback's address - why, in the site's words for the code (never the IAM's sentence), Try again and Back -
// and nothing of the admin area.
await refusedOn('/admin');
let screenSays = await failureScreen();
expect(
  'the admin area, the sign-in turned down: the screen of a failed sign-in - "Signing in did not work", why, Try again and Back - nothing of the admin area',
  screenSays.heading === EN.failedTitle &&
    screenSays.message === EN.notCompleted &&
    same(screenSays.buttons, [EN.retry, EN.back]) &&
    screenSays.lang === 'en' &&
    (await js('location.pathname')) === '/auth/callback' &&
    !(await js("!!document.querySelector('app-admin-layout, app-surveys-list')")),
  `${JSON.stringify(screenSays)} at ${await js('location.pathname')}`,
);
expect(
  '... named in the tab, and kept from search engines while it shows',
  (await js('document.title')) === 'Signing in · anotoki survey' && (await js("document.querySelector('meta[name=robots]')?.content ?? null")) === 'noindex',
  `${await js('document.title')} / ${await js("document.querySelector('meta[name=robots]')?.content ?? null")}`,
);
await expectNoKeys('the screen of a failed sign-in, English');
await expectNoSideways('the screen of a failed sign-in, 1280 px');
await screenshots('en-1280-sign-in-failed', false);
// Back: to where the sign-in started, without signing in - which, for the admin area, is to the IAM again (turned down
// again here: the same screen); Try again: the sign-in once more - let through now - and back at /admin.
await js("document.querySelector('anotoki-sign-in-failure button[data-back]').click(); true");
await sleep(1500);
await settle();
await waitFor(page, FAILURE_SCREEN, 15000).catch(() => null);
expect(
  'its Back: back to /admin, which asks the IAM again - turned down again, the same screen',
  (await js(FAILURE_SCREEN)) && (await js('location.pathname')) === '/auth/callback',
  await js('location.pathname'),
);
await setIam({ deny: false });
await tryAgain();
await waitFor(page, SIGNED_IN + " && location.pathname === '/admin' && !!document.querySelector('app-surveys-list')", 15000).catch(() => null);
expect(
  'its Try again: the sign-in once more, and back at /admin, signed in',
  (await js('location.pathname')) === '/admin' && (await whoIsIn()) === 'owner',
  `${await js('location.pathname')} / ${await whoIsIn()}`,
);

// Signed out with the page open - the session ended in another tab: the page draws a card with Sign in, and the bar
// offers it too.
await sessionEndsOn('/');
expect(
  'signed out: the card instead of the page - no list of surveys',
  (await text('app-participant-layout anotoki-empty-state .anotoki-empty-state__heading')) === 'You are not signed in' && !(await js("!!document.querySelector('app-survey-home')")),
  await text('app-participant-layout anotoki-empty-state'),
);
expect('signed out: a Sign in button in the top bar', (await text('app-top-bar button.anotoki-top-bar__sign-in'))?.includes('Sign in'));
await expectBar('English, 1280 px, signed out');
await screenshots('en-1280-signed-out', false);
await clickText('app-top-bar button.anotoki-top-bar__sign-in', 'Sign in');
await sleep(1500);
await settle();
await waitFor(page, SIGNED_IN + " && !!document.querySelector('app-survey-home h1')", 15000);
expect('Sign in from the bar: back on the page, signed in', (await whoIsIn()) === 'owner' && (await js('location.pathname')) === '/', await whoIsIn());

// The browser refuses the site its storage, where the sign-in in progress is kept: the sign-in cannot start. The
// screen of a failed sign-in says why - it was a blank page, nothing said.
await forgetSession();
// The library says so in the console (with the browser's English); that is expected here, and nothing else.
expected = [/\[anotoki auth\] the sign-in could not start/];
const { identifier: refuseStorage } = await page.send('Page.addScriptToEvaluateOnNewDocument', {
  source:
    "(() => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function (key, value) { if (String(key).startsWith('anotoki-auth:') && String(key).includes(':login:')) throw new DOMException('Refused', 'SecurityError'); return set.call(this, key, value); }; })()",
});
await go('/');
await waitFor(page, FAILURE_SCREEN, 15000).catch(() => null);
screenSays = await failureScreen();
expect(
  "storage refused: the screen of a failed sign-in, saying why in the site's words - not a blank page",
  screenSays.heading === EN.failedTitle && screenSays.message === EN.storageUnavailable && same(screenSays.buttons, [EN.retry, EN.back]),
  JSON.stringify(screenSays),
);
await screenshot('en-1280-storage-refused', false);
await page.send('Page.removeScriptToEvaluateOnNewDocument', { identifier: refuseStorage });
expect(
  'storage refused: the console said only that the sign-in could not start',
  heard.length > 0 && heard.every((message) => message.includes('the sign-in could not start')),
  heard.join(' | ').slice(0, 300),
);
expected = [];
heard.length = 0;

// /admin, nobody signed in: through the IAM and back at /admin.
await forgetSession();
await go('/admin');
await sleep(1500);
await settle();
expect('/admin while signed out: signed in through the IAM and back at /admin', (await js('location.pathname')) === '/admin', await js('location.pathname'));
expect('the owner is signed in', (await whoIsIn()) === 'owner');
expect('the admin area shows the surveys (no survey yet)', (await text('app-surveys-list'))?.includes('No surveys yet'), (await text('app-surveys-list'))?.slice(0, 120));
expect('no language chooser in the admin area', !(await js("!!document.querySelector('anotoki-language-switcher')")));
expect(
  "the admin area's bar: its sections as links - System too, for an ADMIN - Surveys the page",
  same(await barRow(), ['anotoki-brand', 'links: Surveys (page) Translations Languages System', 'anotoki-theme-toggle', 'person']),
  JSON.stringify(await barRow()),
);
expect(
  'the admin panel\'s brand: "anotoki survey · admin panel", linking to /admin and named after what it shows',
  same(await texts('app-top-bar anotoki-brand .anotoki-brand__wordmark > span'), ['anotoki', 'survey', '·', 'admin panel']) &&
    (await js("document.querySelector('app-top-bar anotoki-brand a').getAttribute('href')")) === '/admin' &&
    (await js("document.querySelector('app-top-bar anotoki-brand a').getAttribute('aria-label')")) === 'anotoki survey admin panel: all surveys',
  `${JSON.stringify(await texts('app-top-bar anotoki-brand .anotoki-brand__wordmark > span'))} / ${await js("document.querySelector('app-top-bar anotoki-brand a')?.getAttribute('aria-label')")}`,
);
expect("the admin panel's tab: the page, the admin panel, the site", (await js('document.title')) === 'Surveys · Admin panel · anotoki survey', await js('document.title'));
await screenshot('admin-empty');
// The narrowest desktop bar (761 px) holds an ADMIN's four links, the theme and the person beside "survey" with "admin
// panel" small under it; "anotoki" and the row "anotoki survey · admin panel" come back with the person's name, from 961 px.
for (const [width, words] of [
  [761, ['survey', '·', 'admin panel']],
  [960, ['survey', '·', 'admin panel']],
  [961, ['anotoki', 'survey', '·', 'admin panel']],
]) {
  await viewport(width);
  await sleep(400);
  await expectBar(`the admin panel, ${width} px`);
  expect(
    `the admin panel, ${width} px: the wordmark is ${words.join(' ')}`,
    same(await texts('app-top-bar anotoki-brand .anotoki-brand__wordmark > span'), words),
    JSON.stringify(await texts('app-top-bar anotoki-brand .anotoki-brand__wordmark > span')),
  );
  await screenshot(`admin-${width}-bar`);
}
await viewport(1280);
await sleep(300);

// ── The user menu ───────────────────────────────────────────────────────────
/** The element that has the focus, as "tag.class text". */
const focused = () =>
  js("(() => { const e = document.activeElement; return e ? e.tagName.toLowerCase() + '.' + [...e.classList].join('.') + ' ' + e.textContent.replace(/\\s+/g, ' ').trim() : null; })()");
/** A real key press; `shift` holds Shift down with it (Shift+Tab). */
const press = async (key, shift = false) => {
  const modifiers = shift ? 8 : 0;
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, modifiers, windowsVirtualKeyCode: { ArrowDown: 40, ArrowUp: 38, Home: 36, End: 35, Tab: 9 }[key] });
  await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, modifiers });
  await sleep(150);
};
await openUserMenu();
const menu = await text('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu]');
expect(
  'the menu: name, address, role, account, back to the surveys, sign out',
  ['owner', 'owner@example.test', 'Administrator', 'Your anotoki account', 'Back to the surveys', 'Sign out'].every((part) => menu?.includes(part)),
  menu,
);
expect(
  'the account link goes to the IAM',
  (await js("document.querySelector('app-top-bar .anotoki-top-bar__actions > anotoki-menu a[target=_blank]')?.href")) === `${iam}/account`,
  await js("document.querySelector('app-top-bar .anotoki-top-bar__actions > anotoki-menu a[target=_blank]')?.href"),
);
expect(
  'the menu: the focus on its first item, the button says it is open',
  (await focused())?.includes('Your anotoki account') && (await js("document.querySelector('app-top-bar .anotoki-top-bar__person-button').getAttribute('aria-expanded')")) === 'true',
  await focused(),
);
await press('ArrowDown');
expect('ArrowDown: the next item', (await focused())?.includes('Back to the surveys'), await focused());
await press('End');
expect('End: the last item', (await focused())?.includes('Sign out'), await focused());
await press('ArrowDown');
expect('ArrowDown on the last: round to the first', (await focused())?.includes('Your anotoki account'), await focused());
await screenshot('user-menu');
await escape();
expect(
  'Escape closes the menu, and the focus is back on its button',
  !(await js("!!document.querySelector('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu]')")) && (await focused())?.startsWith('button.anotoki-top-bar__person-button'),
  await focused(),
);
// Tab and Shift+Tab from any item: closed, the focus on the button (left to the browser it went to the next item, then <body>).
for (const [move, shift, where] of [
  [null, false, 'the first'],
  ['ArrowDown', false, 'a middle'],
  ['End', false, 'the last'],
  ['ArrowDown', true, 'a middle (Shift+Tab)'],
]) {
  await openUserMenu();
  if (move) await press(move);
  await press('Tab', shift);
  expect(
    `Tab from ${where} item closes the menu, the focus on its button`,
    !(await js("!!document.querySelector('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu]')")) && (await focused())?.startsWith('button.anotoki-top-bar__person-button'),
    await focused(),
  );
}
await press('Tab');
expect(
  'the next Tab moves on from the menu button - not to <body>',
  !(await focused())?.startsWith('body') && !(await focused())?.startsWith('button.anotoki-top-bar__person-button'),
  await focused(),
);
await openUserMenu();
await js("document.querySelector('app-surveys-list').click(); true");
await sleep(200);
expect('a click outside closes it', !(await js("!!document.querySelector('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu]')")));

// ── A new survey, written and saved ─────────────────────────────────────────
expect('new survey', (await clickText('button', 'New survey')) === true);
await waitFor(page, "location.pathname.endsWith('/edit') && !!document.querySelector('#survey-title')", 15000);
const surveyId = (await js('location.pathname')).split('/')[3];
expect('the editor opens on the new survey', /^[0-9a-f-]{36}$/.test(surveyId), surveyId);
await sleep(500);

await js("document.querySelector('#survey-title').select(); true");
await typeText('Genshin 6.1 - what next?');
await focus('app-question-editor .rte-body [contenteditable]', 0);
await typeText('Which element do you play most?');
await focus('app-options-editor .option-input', 0);
await typeText('Anemo');
await focus('app-options-editor .option-input', 1);
await typeText('Geo');
expect('a picture under the question', await setFiles('app-question-editor app-image-list-editor input[type=file]', 0, [pngFile]));
await waitFor(page, "document.querySelectorAll('app-question-editor app-image-list-editor .thumb-view').length === 1", 15000);
await waitFor(page, "(document.querySelector('app-survey-header .save')?.textContent ?? '').includes('Saved')", 15000);
expect('the header says Saved', (await text('app-survey-header .save')) === 'Saved', await text('app-survey-header .save'));
await screenshot('editor-saved');

// The address from the title; then the survey opens.
await clickText('.suggest', 'Use the title');
await sleep(1500);
await waitFor(page, "(document.querySelector('app-survey-header .save')?.textContent ?? '').includes('Saved')", 15000);

await go(`/admin/surveys/${surveyId}/edit`);
await waitFor(page, "!!document.querySelector('#survey-title')", 15000);
expect('after a reload the title is what was typed', (await js("document.querySelector('#survey-title').value")) === 'Genshin 6.1 - what next?');
await clickText('app-question-editor .summary', 'Which element');
await sleep(1200);
expect(
  'the picture is served by the server',
  await js(
    "(() => { const img = document.querySelector('app-question-editor app-image-list-editor img'); return !!img && img.complete && img.naturalWidth > 0 && img.src.includes('/api/images/'); })()",
  ),
);

expect('open', (await clickText('app-survey-header button', 'Open the survey')) === true);
await sleep(400);
expect('confirm', (await clickText('dialog button', 'Open')) === true);
await waitFor(page, "(document.querySelector('app-survey-header anotoki-badge')?.textContent ?? '').includes('Open')", 15000);
expect('the survey is open', (await text('app-survey-header anotoki-badge')) === 'Open');
const slug = await js("document.querySelector('app-survey-header .address-link').textContent.split('/').pop()");
expect('its address came from the title', slug === 'genshin-6-1-what-next', slug);
await screenshot('opened');

// ── Somebody without a role: takes the survey, once ─────────────────────────
await signInAs(PAT);
// The way into the admin area is an item of the person's menu, for the people who write surveys only.
await openUserMenu();
expect(
  'no way into the admin area in the menu of somebody without a role',
  (await js("!!document.querySelector('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu]')")) &&
    !(await js('!!document.querySelector(\'app-top-bar .anotoki-top-bar__actions > anotoki-menu a[href="/admin"]\')')),
  await text('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu]'),
);
await escape();
await go('/');
expect('the open survey is listed', (await text('app-survey-home .survey-title')) === 'Genshin 6.1 - what next?');
await clickText('app-survey-home a.survey', 'Genshin 6.1');
await settle();
await waitFor(page, "!!document.querySelector('.start button')", 15000);
await screenshot('welcome');
await clickText('.start button', 'Start the survey');
await sleep(500);
await clickText('app-question-block label', 'Prefer not to say');
await sleep(200);
await js("[...document.querySelectorAll('app-question-block')][1].querySelectorAll('label')[2].click(); true");
await sleep(200);
await clickText('button[type=submit]', 'Next');
await sleep(600);
expect(
  'the question and its picture',
  (await text('app-question-block'))?.includes('Which element do you play most?') && (await js("!!document.querySelector('app-question-block app-survey-image img')")),
);
await clickText('app-question-block label', 'Anemo');
await sleep(200);
await clickText('button[type=submit]', 'Send my answers');
await waitFor(page, "!!document.querySelector('.done-heading')", 15000);
expect('sent: thank you', (await text('.done-heading')) === 'Thank you!');
await screenshot('sent');
await go(`/${slug}`);
await waitFor(page, "!!document.querySelector('.message-heading')", 15000);
expect('again: already taken', (await text('.message-heading')) === 'You have taken this survey');

await go('/admin');
expect('the admin area is not for Pat', (await text('app-admin-layout anotoki-empty-state'))?.includes('for the people who write the surveys'), await text('app-admin-layout anotoki-empty-state'));
await screenshot('no-access');
// The same card on a page that asks before it is left (the Translations page): the page was never drawn, so the
// router asks the guard with no page at all - and the card's link must still go somewhere.
await go('/admin/translations');
expect('the no-access card on the Translations page too', (await text('app-admin-layout anotoki-empty-state'))?.includes('no editor role here'), await text('app-admin-layout anotoki-empty-state'));
await clickText('app-admin-layout anotoki-empty-state a', 'See the open surveys');
await waitFor(page, "location.pathname === '/' && !!document.querySelector('app-survey-home h1')", 15000).catch(() => null);
expect(
  '... and its "See the open surveys" leaves it: the home page',
  (await js('location.pathname')) === '/' && (await text('app-survey-home h1')) === EN.home,
  `${await js('location.pathname')} / ${await text('app-survey-home h1')}`,
);

// ── The owner sees the answer, and may delete it ────────────────────────────
await signInAs(OWNER);
await openUserMenu();
expect(
  "the owner's menu, where people take surveys, has the way into the admin area",
  (await text('app-top-bar .anotoki-top-bar__actions > anotoki-menu a[href="/admin"]')) === 'Admin panel',
  await text('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu]'),
);
await escape();
await go('/admin');
await waitFor(page, "!!document.querySelector('app-surveys-list .stat strong')", 15000);
expect('one answer in the list', (await text('app-surveys-list .stat strong')) === '1');
await go(`/admin/surveys/${surveyId}/results`);
await waitFor(page, "!!document.querySelector('app-choice-result')", 15000);
expect('the results count Anemo', (await text('app-choice-result'))?.includes('Anemo'));
await go(`/admin/surveys/${surveyId}/results?tab=people`);
await waitFor(page, "!!document.querySelector('#results-panel-people')", 15000);
expect('Pat among the people', (await text('#results-panel-people'))?.includes('pat'));
await screenshot('results-people');
await js("document.querySelector('#results-panel-people button.person')?.click(); true");
await sleep(800);
const responseId = await js("new URLSearchParams(location.search).get('response')");
expect("the drawer opens on Pat's answers", !!responseId && (await js("!!document.querySelector('anotoki-drawer app-response-view')")), String(responseId));
expect('with a Delete for an administrator', await js("!!document.querySelector('anotoki-drawer .delete')"));
if (responseId) {
  await go(`/admin/surveys/${surveyId}/responses/${responseId}`);
  await waitFor(page, "!!document.querySelector('app-response-view')", 15000);
  expect('an administrator may delete the answers', await js("!!document.querySelector('.sheet-actions .delete')"));
}

// ── An editor: everything but deleting ──────────────────────────────────────
await signInAs(EDITH);
await go('/admin');
await waitFor(page, "!!document.querySelector('app-surveys-list .survey')", 15000);
expect('an editor sees the surveys', (await text('app-surveys-list .title')) === 'Genshin 6.1 - what next?');
expect('but no Delete button', !(await js("!![...document.querySelectorAll('app-surveys-list button')].find(b => b.getAttribute('aria-label') === 'Delete')")));
expect(
  "nor System in the bar: the people, the logs, the backups and the database's updates are an ADMIN's",
  (await texts('app-top-bar .anotoki-top-bar__nav a')).join(' ') === 'Surveys Translations Languages',
  (await texts('app-top-bar .anotoki-top-bar__nav a')).join(' '),
);
await go('/admin/migrations');
await waitFor(page, "!!document.querySelector('anotoki-migrations-page')", 15000);
await sleep(500);
expect(
  "... and at its address the family's Migrations page says whose it is, asking the server nothing",
  (await text('anotoki-migrations-page .anotoki-migrations-page__notice')) === 'Migrations are for administrators.' &&
    !(await js("!!document.querySelector('anotoki-migrations-page [data-apply]')")) &&
    !requested.slice(-10).some((request) => request.includes('/api/admin/migrations')),
  await text('anotoki-migrations-page'),
);
/** The access token the site holds for whoever is signed in. */
const heldToken = () =>
  js(
    "Object.keys(localStorage).filter((name) => name.startsWith('anotoki-auth:')).map((name) => { try { return JSON.parse(localStorage.getItem(name))?.access_token; } catch { return null; } }).find(Boolean) ?? ''",
  );
const editorRefused = await (await fetch(`${origin}/api/admin/migrations`, { headers: { Authorization: `Bearer ${await heldToken()}` } })).json();
expect('... and the server refuses an EDITOR the migrations all the same', editorRefused.code === 'forbidden', JSON.stringify(editorRefused).slice(0, 160));
await screenshot('admin-migrations-editor');
if (responseId) {
  await go(`/admin/surveys/${surveyId}/responses/${responseId}`);
  await waitFor(page, "!!document.querySelector('app-response-view')", 15000);
  expect('nor a Delete for the answers', !(await js("!!document.querySelector('.sheet-actions .delete')")));
}
await go(`/admin/surveys/${surveyId}/edit`);
await waitFor(page, "!!document.querySelector('app-editor-settings')", 15000);
expect('nor in the settings', !(await js("!!document.querySelector('app-editor-settings .delete')")));

// ── A phone, in English: the top bar fits, signed in and signed out ─────────
await viewport(360);
await go('/');
await expectBar('English, 360 px, signed in');
await screenshots('en-360-home');
await go(`/${slug}`);
await waitFor(page, "!!document.querySelector('.start button')", 15000);
await screenshots('en-360-welcome');
await viewport(390);
await go(`/${slug}`);
await waitFor(page, "!!document.querySelector('.start button')", 15000);
await clickText('.start button', 'Start the survey');
await sleep(500);
await clickText('button[type=submit]', 'Next');
await sleep(500);
expect('English: a step sent with nothing chosen says what is missing', (await text('app-question-block .error'))?.includes('Please choose an answer.'), await text('app-question-block .error'));
await expectBar('English, 390 px, a step');
await expectNoKeys('English, a step');
await screenshots('en-390-step');

// The phone's bar: the brand (the mark and the site's name), the language, the theme and the menu button - the
// links and the person's menu inside it.
await go('/');
expect(
  '390 px: brand, language, theme, menu button - nothing else in the row',
  same(await barRow(), ['anotoki-brand', 'anotoki-language-switcher', 'anotoki-theme-toggle', 'phone-menu']),
  JSON.stringify(await barRow()),
);
expect('390 px: the brand is the mark and "survey"', (await text('app-top-bar anotoki-brand .anotoki-brand__wordmark')) === 'survey', await text('app-top-bar anotoki-brand .anotoki-brand__wordmark'));
await expectBar('English, 390 px, the home page');
await screenshots('en-390-home', false);
await openUserMenu();
const phoneMenu = await texts('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menuitem]');
expect(
  "the phone menu: the links, then the person's menu (an editor's: Admin panel too)",
  same(phoneMenu, ['Surveys', 'Your anotoki account', 'Admin panel', 'Sign out']) &&
    (await text('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu] .anotoki-top-bar__menu-name')) === 'edith',
  JSON.stringify(phoneMenu) + ' ' + (await text('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu] .anotoki-top-bar__menu-name')),
);
expect(
  'the phone menu: Surveys says it is the page',
  (await js("document.querySelector('app-top-bar .anotoki-top-bar__actions > anotoki-menu a[role=menuitem]').getAttribute('aria-current')")) === 'page',
);
expect(
  'the phone menu: the focus on its first item, the button says it is open',
  (await focused())?.includes('Surveys') && (await js("document.querySelector('app-top-bar .anotoki-top-bar__menu-button').getAttribute('aria-expanded')")) === 'true',
  await focused(),
);
expect('the phone menu is inside the window', await menuInside('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu]'));
await press('ArrowDown');
expect('the phone menu: ArrowDown, the next item', (await focused())?.includes('Your anotoki account'), await focused());
await press('ArrowUp');
await press('ArrowUp');
expect('the phone menu: ArrowUp from the first, round to the last', (await focused())?.includes('Sign out'), await focused());
await press('Home');
expect('the phone menu: Home, the first', (await focused())?.includes('Surveys'), await focused());
await screenshots('en-390-phone-menu', false);
await escape();
expect(
  'Escape closes the phone menu, the focus back on its button',
  !(await js("!!document.querySelector('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu]')")) &&
    (await focused())?.startsWith('button.anotoki-top-bar__round.anotoki-top-bar__menu-button'),
  await focused(),
);
await openUserMenu();
await js("document.querySelector('main').click(); true");
await sleep(200);
expect('a click outside closes the phone menu', !(await js("!!document.querySelector('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu]')")));
for (const [move, shift, where] of [
  [null, false, 'the first'],
  ['ArrowDown', false, 'a middle'],
  ['End', false, 'the last'],
  ['End', true, 'the last (Shift+Tab)'],
]) {
  await openUserMenu();
  if (move) await press(move);
  await press('Tab', shift);
  expect(
    `Tab from ${where} item of the phone menu closes it, the focus on its button`,
    !(await js("!!document.querySelector('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu]')")) &&
      (await focused())?.startsWith('button.anotoki-top-bar__round.anotoki-top-bar__menu-button'),
    await focused(),
  );
}
await go(`/${slug}`);
await openUserMenu();
await clickText('app-top-bar .anotoki-top-bar__actions > anotoki-menu a', 'Surveys');
await waitFor(page, "location.pathname === '/' && !!document.querySelector('app-survey-home h1')", 10000).catch(() => null);
expect(
  'a link of the phone menu goes there and closes the menu',
  (await js('location.pathname')) === '/' && !(await js("!!document.querySelector('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu]')")),
  await js('location.pathname'),
);

// Signed out on a phone: the card, and Sign in inside the menu.
await viewport(360);
await sessionEndsOn('/');
expect(
  'English, 360 px, signed out: the card with its Sign in',
  (await text('app-participant-layout anotoki-empty-state .anotoki-empty-state__heading')) === 'You are not signed in' &&
    (await text('app-participant-layout anotoki-empty-state button')) === 'Sign in',
  await text('app-participant-layout anotoki-empty-state'),
);
await expectBar('English, 360 px, signed out');
await expectNoKeys('English, signed out');
await screenshots('en-360-home-signed-out');
await openUserMenu();
expect(
  '360 px, signed out: the phone menu holds the links and Sign in',
  same(await texts('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menuitem]'), ['Surveys', 'Sign in']),
  JSON.stringify(await texts('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menuitem]')),
);
await screenshots('en-360-phone-menu-signed-out', false);
await escape();

// A sign-in turned down, on a phone: the same screen, in the window's width.
await viewport(390);
await refusedOn('/');
screenSays = await failureScreen();
expect(
  'English, 390 px, a sign-in turned down: the screen of a failed sign-in, whole in the window',
  screenSays.heading === EN.failedTitle && same(screenSays.buttons, [EN.retry, EN.back]),
  JSON.stringify(screenSays),
);
await expectNoSideways('the screen of a failed sign-in, 390 px');
await screenshots('en-390-sign-in-failed', false);
await setIam({ deny: false });
await tryAgain();
await waitFor(page, SIGNED_IN, 15000);
await viewport(360);

// ═══ In Slovak ═════════════════════════════════════════════════════════════
// A browser set to Slovak, on its first visit: nobody signed in (the IAM turns the sign-in down), nothing stored,
// no ?lang= - the language is the browser's, which says "sk-SK". The server answers a code with a region by its
// base language, so each page load (the one before the IAM, the one after) asks once, for that - never English
// first and then Slovak.
await setIam({ deny: true });
await forgetSession();
await js('localStorage.clear(); sessionStorage.clear(); true');
const browsersOwn = await js("navigator.languages.join(',')");
await browserLanguage('sk-SK');
const firstVisit = requested.length;
await go('/');
await waitFor(page, FAILURE_SCREEN, 15000);
await sleep(1200);
const asked = requested.slice(firstVisit).filter((request) => request.includes('/api/translations/'));
screenSays = await failureScreen();
expect(
  "a browser set to Slovak, first visit, the sign-in turned down: the screen of a failed sign-in in Slovak, from the browser alone - nothing chosen, nothing in the address - in this site's formal words",
  (await js("navigator.languages.join(',')")) === 'sk-SK' &&
    (await pageLanguage()) === 'sk' &&
    screenSays.lang === 'sk' &&
    screenSays.heading === SK.failedTitle &&
    screenSays.message === SK.notCompleted &&
    same(screenSays.buttons, [SK.retry, SK.back]) &&
    (await storedLanguage()) === ' / ',
  `${await js("navigator.languages.join(',')")}: ${await pageLanguage()}, ${JSON.stringify(screenSays)}, ${await storedLanguage()}`,
);
expect(
  '... and its strings were asked for in Slovak alone, once a page load (after the IAM, the cached Slovak again)',
  asked[0] === 'GET /api/translations/sk-sk' && asked.length <= 2 && asked.every((request) => ['GET /api/translations/sk-sk', 'GET /api/translations/sk'].includes(request)),
  asked.join(', '),
);
expect('... and the tab is named in Slovak', (await js('document.title')) === 'Prihlasovanie · anotoki prieskum', await js('document.title'));
await expectNoKeys('Slovak by the browser, the sign-in turned down');
await screenshots('sk-360-sign-in-failed', false);
await browserLanguage(browsersOwn);

// Nobody signed in, nothing stored: a link with ?lang=sk, on the narrowest phone - turned down again.
await js('localStorage.clear(); sessionStorage.clear(); true');
await go('/?lang=sk');
await waitFor(page, FAILURE_SCREEN, 15000);
await sleep(300);
screenSays = await failureScreen();
expect(
  '?lang=sk: <html lang="sk">, kept for this tab only - through the IAM and back - and taken out of the address',
  (await pageLanguage()) === 'sk' && (await storedLanguage()) === ' / sk' && (await js('location.search')) === '',
  `${await pageLanguage()}, ${await storedLanguage()}, ${await js('location.search')}`,
);
expect(
  'Slovak, turned down: the screen of a failed sign-in, its buttons Skúsiť znova and Späť',
  screenSays.heading === SK.failedTitle && same(screenSays.buttons, [SK.retry, SK.back]),
  JSON.stringify(screenSays),
);
// Signed in, and the session ended over the page: the card, and the bar with Sign in - in Slovak, for the tab.
await sessionEndsOn('/');
expect(
  'Slovak, signed out: the card, its button says Prihlásiť sa',
  (await text('app-participant-layout anotoki-empty-state .anotoki-empty-state__heading')) === 'Nie ste prihlásení' && (await text('app-participant-layout anotoki-empty-state button')) === SK.signIn,
  await text('app-participant-layout anotoki-empty-state'),
);
expect(
  'Slovak: the chooser says SK and is named in Slovak with the code it shows',
  (await text('anotoki-language-switcher .anotoki-language-switcher__switcher')) === 'SK' &&
    (await js("document.querySelector('anotoki-language-switcher .anotoki-language-switcher__switcher').getAttribute('aria-label')")) === 'Jazyk: Slovenčina (SK)',
  await js("document.querySelector('anotoki-language-switcher .anotoki-language-switcher__switcher')?.getAttribute('aria-label')"),
);
expect('Slovak: the tab', (await js('document.title')) === 'Prieskumy · anotoki prieskum', await js('document.title'));
expect(
  'Slovak, 360 px: the brand is the mark and "prieskum", the menu button named in Slovak',
  (await text('app-top-bar anotoki-brand .anotoki-brand__wordmark')) === 'prieskum' &&
    (await js("document.querySelector('app-top-bar .anotoki-top-bar__menu-button').getAttribute('aria-label')")) === 'Ponuka',
  `${await text('app-top-bar anotoki-brand .anotoki-brand__wordmark')} / ${await js("document.querySelector('app-top-bar .anotoki-top-bar__menu-button')?.getAttribute('aria-label')")}`,
);
await expectBar('Slovak, 360 px, signed out');
await expectNoKeys('Slovak, signed out');
// The detector itself: a key put on the page is found (so "none" above means none).
await js("document.querySelector('app-participant-layout anotoki-empty-state .anotoki-empty-state__heading').append(document.createTextNode(' home.title')); true");
expect('a key on the page would have been seen', (await keysShown()).includes('home.title'));
await sessionEndsOn('/');
await screenshots('sk-360-home-signed-out');
await openUserMenu();
expect(
  'Slovak, 360 px, signed out: the phone menu - Prieskumy, Prihlásiť sa',
  same(await texts('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menuitem]'), ['Prieskumy', SK.signIn]),
  JSON.stringify(await texts('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menuitem]')),
);
expect('... inside the window', await menuInside('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu]'));
await screenshots('sk-360-phone-menu-signed-out', false);
await escape();

// The chooser: a menu of the languages under their own names.
await js("document.querySelector('anotoki-language-switcher .anotoki-language-switcher__switcher').click(); true");
await sleep(300);
const offered = await js(
  "[...document.querySelectorAll('anotoki-language-switcher [role=menuitemradio]')].map(e => e.textContent.trim() + ' ' + e.getAttribute('lang') + ' ' + e.getAttribute('aria-checked')).join(', ')",
);
expect('the chooser offers English and Slovenčina, Slovak checked', offered === 'English en false, Slovenčina sk true', offered);
expect("the chooser's menu is inside the window", await menuInside('anotoki-language-switcher [role=menu]'));
await screenshot('sk-360-chooser');
await escape();
expect('Escape closes the chooser', !(await js("!!document.querySelector('anotoki-language-switcher [role=menu]')")));

// The bar on a phone up to 760 px, a desktop's from 761: the links and Sign in in the row again.
for (const width of [390, 760, 761]) {
  await viewport(width);
  await sessionEndsOn('/');
  await expectBar(`Slovak, ${width} px, signed out`);
  const row = await barRow();
  const phone = width <= 760;
  expect(
    `Slovak, ${width} px, signed out: ${phone ? 'the menu button' : 'the links and Sign in'} in the row`,
    phone
      ? same(row, ['anotoki-brand', 'anotoki-language-switcher', 'anotoki-theme-toggle', 'phone-menu'])
      : same(row, ['anotoki-brand', 'links: Prieskumy (page)', 'anotoki-language-switcher', 'anotoki-theme-toggle', 'sign-in']),
    JSON.stringify(row),
  );
  if (width === 390) {
    await screenshots('sk-390-home-signed-out', false);
  } else {
    await screenshot(`sk-${width}-bar-signed-out`);
  }
}

// A survey, nobody signed in, the sign-in turned down: the screen of a failed sign-in - nothing of the survey drawn,
// nor asked for.
await viewport(360);
since = requested.length;
await refusedOn(`/${slug}`);
expect(
  'Slovak, a survey, the sign-in turned down: the screen of a failed sign-in, nothing of the survey on the page or asked of the API',
  (await text('anotoki-sign-in-failure h1')) === SK.failedTitle &&
    !(await js("!!document.querySelector('app-take-survey')")) &&
    !(await js('document.body.textContent')).includes('Genshin') &&
    !requested.slice(since).some((request) => request.startsWith('GET /api/surveys')),
  requested.slice(since).join(', '),
);
await expectNoKeys('Slovak, a survey, the sign-in turned down');
await screenshots('sk-360-survey-sign-in-failed', false);

// Signed in - the account is English, the link followed was Slovak: the tab stays Slovak through the IAM and back,
// and the screen's Try again comes back to the survey.
await setIam({ user: NINA, deny: false });
await tryAgain();
await waitFor(page, SIGNED_IN + " && !!document.querySelector('.start button')", 15000);
expect(
  "signed in from its Try again: back on the survey's page, its welcome drawn",
  (await js('location.pathname')) === `/${slug}` && (await whoIsIn()) === NINA.username,
  `${await js('location.pathname')} / ${await whoIsIn()}`,
);
await go('/');
expect('Slovak still, back from the IAM', (await pageLanguage()) === 'sk' && (await text('app-survey-home h1')) === SK.home, `${await pageLanguage()}, ${await text('app-survey-home h1')}`);
expect(
  'Slovak: the open survey with its size in Slovak',
  /^\d+ otáz(ka|ky|ok) · približne \d+ minút/.test((await text('app-survey-home .survey-meta')) ?? ''),
  await text('app-survey-home .survey-meta'),
);
expect('the survey is new to Nina', (await text('app-survey-home anotoki-badge')) === 'Nový', await text('app-survey-home anotoki-badge'));
await expectBar('Slovak, 360 px, signed in');
await openUserMenu();
const menuSk = await text('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu]');
expect("the person's menu in Slovak", ['nina', 'Váš anotoki účet', 'Odhlásiť sa'].every((part) => menuSk?.includes(part)) && !menuSk?.includes('Administrátorský panel'), menuSk);
expect("the person's menu is inside the window", await menuInside('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu]'));
await expectNoKeys("Slovak, the person's menu");
await screenshot('sk-360-user-menu');
await escape();

// The welcome, then a step.
await go(`/${slug}`);
await waitFor(page, "!!document.querySelector('.start button')", 15000);
const facts = await text('.facts');
expect('Slovak: the welcome says how long the survey is', /\d+ otáz(ka|ky|ok) · \d+ krok(y|ov)?/.test(facts ?? '') && /Približne \d+ minút/.test(facts ?? ''), facts);
expect('Slovak: and who is signed in', (await text('.who'))?.replace(/\s+/g, ' ').includes('Prihlásili ste sa ako nina · prieskum môže každý vyplniť iba raz.'), await text('.who'));
await expectNoKeys('Slovak, the welcome');
await screenshots('sk-360-welcome');
await clickText('.start button', 'Začať prieskum');
await sleep(500);
const stepSk = await text('app-take-survey');
expect(
  'Slovak: the step about the reader, <html lang="sk">',
  (await pageLanguage()) === 'sk' && ['Krok 1 / 2', 'O Vás', 'Aké je Vaše pohlavie?', 'Koľko máte rokov?', 'Nechcem uviesť', 'Späť', 'Ďalej'].every((part) => stepSk?.includes(part)),
  stepSk?.slice(0, 400),
);
expect(
  'Slovak: the progress is read out in Slovak',
  (await js("document.querySelector('app-survey-hero [role=progressbar]').getAttribute('aria-valuetext')")) === 'Krok 1, spolu krokov: 2',
  await js("document.querySelector('app-survey-hero [role=progressbar]')?.getAttribute('aria-valuetext')"),
);
await clickText('button[type=submit]', 'Ďalej');
await sleep(500);
expect('Slovak: what is missing is said in Slovak', (await text('app-question-block .error'))?.includes('Vyberte, prosím, odpoveď.'), await text('app-question-block .error'));
await expectBar('Slovak, 360 px, a step');
await expectNoKeys('Slovak, a step');
await screenshots('sk-360-step');
await viewport(390);
await sleep(300);
await expectBar('Slovak, 390 px, a step');
await screenshots('sk-390-step');
await viewport(360);

await clickText('app-question-block label', 'Žena');
await sleep(200);
await clickText('app-question-block label', '25–34');
await sleep(200);
await clickText('button[type=submit]', 'Ďalej');
await sleep(600);
expect(
  'Slovak: the last step sends',
  (await text('button[type=submit]'))?.includes('Odoslať odpovede') && (await text('app-survey-hero .where'))?.includes('Krok 2 / 2'),
  `${await text('button[type=submit]')} / ${await text('app-survey-hero .where')}`,
);
expect(
  'Slovak: enlarging the picture is named in Slovak',
  (await js("document.querySelector('app-question-block .gallery-item')?.getAttribute('aria-label')"))?.startsWith('Zväčšiť obrázok'),
  await js("document.querySelector('app-question-block .gallery-item')?.getAttribute('aria-label')"),
);
await expectNoKeys('Slovak, the last step');
await screenshots('sk-360-last-step');

// Left in the middle: the home page says so, and the survey offers to carry on.
await go('/');
expect('Slovak: a survey left in the middle is marked', (await text('app-survey-home anotoki-badge')) === 'Začatý', await text('app-survey-home anotoki-badge'));
await screenshot('sk-360-home-started', true);
await go(`/${slug}`);
await waitFor(page, "!!document.querySelector('app-take-survey anotoki-alert')", 15000);
const carryOn = await text('app-take-survey anotoki-alert');
expect(
  'Slovak: carry on where you stopped',
  ['Pokračovať tam, kde ste prestali?', 'a dostali ste sa po krok 2 / 2', 'Pokračovať', 'Začať odznova'].every((part) => carryOn?.includes(part)),
  carryOn,
);
await expectNoKeys('Slovak, carrying on');
await screenshots('sk-360-carry-on');
await clickText('app-take-survey anotoki-alert button', 'Pokračovať');
await sleep(500);
await clickText('app-question-block label', 'Geo');
await sleep(200);
await clickText('button[type=submit]', 'Odoslať odpovede');
await waitFor(page, "!!document.querySelector('.done-heading')", 15000);
expect('Slovak: sent', (await text('.done-heading')) === 'Ďakujeme!', await text('.done-heading'));
await expectNoKeys('Slovak, sent');
await screenshots('sk-360-sent');
await go(`/${slug}`);
await waitFor(page, "!!document.querySelector('.message-heading')", 15000);
const taken = await text('app-take-survey .message');
expect(
  'Slovak: already taken, and when',
  taken?.includes('Tento prieskum ste už vyplnili') && /Odpovede ste odoslali (práve teraz|pred \d+ (minútou|minútami))\. Každý môže prieskum vyplniť iba raz\./.test(taken),
  taken,
);
expect("Slovak: the tab is the survey's own name", (await js('document.title')).startsWith('Genshin 6.1 - what next?'), await js('document.title'));
await expectNoKeys('Slovak, already taken');
await screenshots('sk-360-taken');

// Nothing there: a survey that is not, and an address that is not.
await go('/no-such-survey');
await waitFor(page, "!!document.querySelector('.message-heading')", 15000);
expect(
  'Slovak: no survey at this address',
  (await text('.message-heading')) === 'Tu nie je žiadny prieskum' && (await js('document.title')) === 'Prieskum sa nenašiel · anotoki prieskum',
  `${await text('.message-heading')} / ${await js('document.title')}`,
);
await expectNoKeys('Slovak, no survey here');
await screenshot('sk-360-no-survey', true);
await go('/nothing/here');
expect(
  'Slovak: nothing at this address',
  (await text('app-not-found'))?.includes('Na tejto adrese nič nie je') && (await js('document.title')) === 'Stránka sa nenašla · anotoki prieskum',
  `${await text('app-not-found')} / ${await js('document.title')}`,
);
await expectNoKeys('Slovak, not found');
await screenshot('sk-360-not-found', true);

// The admin area is English, whoever reads it: the no-access page for Nina...
await go('/admin');
expect(
  'the admin area is English for somebody reading Slovak: <html lang="en">, the no-access page',
  (await pageLanguage()) === 'en' && (await text('app-admin-layout anotoki-empty-state'))?.includes('for the people who write the surveys'),
  `${await pageLanguage()}, ${await text('app-admin-layout anotoki-empty-state')}`,
);
await screenshot('sk-360-no-access', true);

// ... and the surveys for the owner, whose tab is Slovak too.
await signInAs(OWNER, SK);
await openUserMenu();
expect(
  "Slovak: the owner's way into the admin area",
  (await text('app-top-bar .anotoki-top-bar__actions > anotoki-menu a[href="/admin"]')) === 'Administrátorský panel' &&
    (await text('app-top-bar .anotoki-top-bar__actions > anotoki-menu .anotoki-top-bar__menu-role')) === 'Rola: administrátor',
  await text('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu]'),
);
expect("Slovak: the owner's menu is inside the window", await menuInside('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu]'));
await screenshot('sk-360-owner-menu');
// Through the menu, without a page load: the router says where the page is.
await clickText('app-top-bar .anotoki-top-bar__actions > anotoki-menu a', 'Administrátorský panel');
await waitFor(page, "location.pathname === '/admin' && !!document.querySelector('app-surveys-list .survey')", 15000);
await sleep(400);
expect('/admin as the owner: <html lang="en">', (await pageLanguage()) === 'en', await pageLanguage());
expect('/admin as the owner: no language chooser', !(await js("!!document.querySelector('anotoki-language-switcher')")));
expect(
  '/admin as the owner: the page and the tab in English',
  (await text('app-surveys-list'))?.includes('New survey') && (await js('document.title')) === 'Surveys · Admin panel · anotoki survey',
  `${(await text('app-surveys-list'))?.slice(0, 80)} / ${await js('document.title')}`,
);
await openUserMenu();
const menuAdmin = await text('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu]');
expect(
  '/admin as the owner: the shared top bar in English',
  ['Administrator', 'Your anotoki account', 'Surveys', 'Translations', 'Languages', 'Back to the surveys', 'Sign out'].every((part) => menuAdmin?.includes(part)) &&
    (await js("document.querySelector('app-top-bar anotoki-theme-toggle [role=radiogroup]').getAttribute('aria-label')")) === 'Theme',
  menuAdmin,
);
await expectBar('/admin, 360 px');
await expectNoKeys('/admin');
await screenshot('sk-360-admin-menu');
await clickText('app-top-bar .anotoki-top-bar__actions > anotoki-menu a', 'Back to the surveys');
await waitFor(page, "location.pathname === '/' && !!document.querySelector('app-survey-home h1')", 15000);
await sleep(400);
expect(
  'back where people take surveys: Slovak again, with the chooser',
  (await pageLanguage()) === 'sk' && (await text('app-survey-home h1')) === SK.home && (await text('anotoki-language-switcher .anotoki-language-switcher__switcher')) === 'SK',
  `${await pageLanguage()}, ${await text('app-survey-home h1')}`,
);
// Opened by its address (a page load), and at the width the pages are made for.
await viewport(390);
await go('/admin');
await waitFor(page, "!!document.querySelector('app-surveys-list .survey')", 15000);
expect(
  '/admin opened by its address: English, <html lang="en">, no chooser',
  (await pageLanguage()) === 'en' && !(await js("!!document.querySelector('anotoki-language-switcher')")) && (await text('app-surveys-list'))?.includes('New survey'),
  await pageLanguage(),
);
await expectBar('/admin, 390 px');
expect(
  '/admin, 390 px: the brand is the mark and "survey", "admin panel" under it',
  same(await texts('app-top-bar anotoki-brand .anotoki-brand__wordmark > span'), ['survey', '·', 'admin panel']),
  JSON.stringify(await texts('app-top-bar anotoki-brand .anotoki-brand__wordmark > span')),
);
await screenshots('sk-390-admin');

// ── The language of the account, when nothing is stored here ────────────────
await viewport(360);
await setIam({ user: ZUZANA, deny: true });
await forgetSession();
await js('localStorage.clear(); sessionStorage.clear(); true');
await go('/');
await waitFor(page, FAILURE_SCREEN, 15000);
screenSays = await failureScreen();
expect(
  "nothing stored, nobody signed in (turned down): the browser's language, English",
  (await pageLanguage()) === 'en' && screenSays.lang === 'en' && same(screenSays.buttons, [EN.retry, EN.back]),
  `${await pageLanguage()}, ${JSON.stringify(screenSays)}, ${await js('navigator.languages.join()')}`,
);
await setIam({ deny: false });
await tryAgain();
await waitFor(page, SIGNED_IN + " && !!document.querySelector('app-survey-home h1')", 15000);
expect('a token that says locale sk: Slovak', (await pageLanguage()) === 'sk' && (await text('app-survey-home h1')) === SK.home, `${await pageLanguage()}, ${await text('app-survey-home h1')}`);
expect('used, not stored', (await storedLanguage()) === ' / ', await storedLanguage());
await expectBar('Slovak, 360 px, a twenty-character name');
await screenshot('sk-360-home-token', true);
await openUserMenu();
expect(
  '360 px: the twenty-character name whole at the head of the phone menu, the menu inside the window',
  (await text('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu] .anotoki-top-bar__menu-name')) === ZUZANA.username &&
    (await menuInside('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu]')),
  await text('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menu] .anotoki-top-bar__menu-name'),
);
await screenshots('sk-360-phone-menu', false);
await escape();
// The name is beside the round button from 961 px; up to 960 the button is the initial alone.
for (const width of [960, 961]) {
  await viewport(width);
  await go('/');
  const shown = (await js("getComputedStyle(document.querySelector('app-top-bar .anotoki-top-bar__person-name')).display")) !== 'none';
  expect(
    `${width} px: the name is ${width > 960 ? '' : 'not '}in the bar`,
    shown === width > 960 && (await text('app-top-bar .anotoki-top-bar__person-name')) === ZUZANA.username,
    await text('app-top-bar .anotoki-top-bar__person-name'),
  );
  await expectBar(`Slovak, ${width} px, a twenty-character name`);
  await screenshot(`sk-${width}-bar-signed-in`);
}

// ── The chooser: a choice made here is kept, and is stronger than the account ──
await viewport(360);
await go('/');
await js("document.querySelector('anotoki-language-switcher .anotoki-language-switcher__switcher').click(); true");
await sleep(300);
await clickText('anotoki-language-switcher [role=menuitemradio]', 'English');
await waitFor(page, "document.documentElement.lang === 'en'", 15000);
await sleep(300);
expect(
  'the chooser: English at once, kept on this device',
  (await text('app-survey-home h1')) === EN.home &&
    (await text('anotoki-language-switcher .anotoki-language-switcher__switcher')) === 'EN' &&
    (await storedLanguage()) === 'en / ' &&
    (await js('document.title')) === 'Surveys · anotoki survey',
  `${await text('app-survey-home h1')}, ${await storedLanguage()}, ${await js('document.title')}`,
);
await go('/');
expect(
  "and after a reload: the choice, not the account's language",
  (await pageLanguage()) === 'en' && (await text('app-survey-home h1')) === EN.home,
  `${await pageLanguage()}, ${await text('app-survey-home h1')}`,
);
await screenshot('en-360-home-chosen', true);

// ═══ The translating itself ════════════════════════════════════════════════
// From a clean start, as at the top: nobody signed in, nothing chosen or cached, English for the tab.
await signOut(EN);
await js('localStorage.clear(); sessionStorage.clear(); true');
await go('/?lang=en');
await viewport(1280);
await signInAs(OWNER, EN);

// ── The site's own words: the Translations page ─────────────────────────────
// The anotoki family's page (<anotoki-translations-page>, @anotoki/lib/translations/admin): English, a key a row, a
// language a column - the site's keys and the library's own (`anotoki.*`: the kit's words, the status page's).
await go('/admin');
await waitFor(page, "!!document.querySelector('app-surveys-list .survey')", 15000);
expect('the surveys list has the way to the translations', (await clickText('app-surveys-list anotoki-page-header a', 'Translations')) === true);
/** The grid is drawn: more than 50 blocks of keys. */
const GRID_DRAWN = "document.querySelectorAll('anotoki-translations-page .anotoki-translations-page__block').length > 50";
await waitFor(page, `location.pathname === '/admin/translations' && ${GRID_DRAWN}`, 15000);
/** A key's row (its id ends with the key), the box of one key in one language, and the block of a plural family (as an expression for the page). */
const row = (key) => `anotoki-translations-page [id$="-key-${key}"]`;
const box = (key, code) => `${row(key)} textarea[lang="${code}"]`;
const family = (name) => `document.querySelector('anotoki-translations-page .anotoki-translations-page__block--plural[data-block="${name}"]')`;
const boxValue = (key, code) => js(`document.querySelector(${JSON.stringify(box(key, code))})?.value ?? null`);
const saveState = () => text('anotoki-translations-page [data-save-state]');
/** Whether the page's Save is pressable now. */
const saveReady = () => js("document.querySelector('anotoki-translations-page [data-save]')?.disabled === false");
const toasts = () => texts('.anotoki-toast-host__message');
/** Toasts stay for seconds, over the corner of the page: gone before a screenshot, or before the next one is read. */
const dismissToasts = async () => {
  await js("document.querySelectorAll('.anotoki-toast-host__dismiss').forEach((b) => b.click()); true");
  await sleep(300);
};

expect(
  'Translations: named in the tab, English, no chooser',
  (await js('document.title')).startsWith('Translations · ') && (await pageLanguage()) === 'en' && !(await js("!!document.querySelector('anotoki-language-switcher')")),
  `${await js('document.title')}, ${await pageLanguage()}`,
);
const keyRows = await js("document.querySelectorAll('anotoki-translations-page .anotoki-translations-page__row:not(.anotoki-translations-page__samples)').length");
const gridHead = async () => (await texts('anotoki-translations-page .anotoki-translations-page__grid-head span')).join(' | ');
expect(
  'Translations: a row for every key, a column for each language',
  keyRows === KEYS.length && (await gridHead()) === 'Key | English | Slovak',
  `${keyRows} rows for ${KEYS.length} keys; ${await gridHead()}`,
);
const coverageCounts = async () => (await texts('anotoki-translations-page .anotoki-translations-page__coverage-count')).join(' | ');
expect('Translations: both languages are written whole', (await coverageCounts()) === `${KEYS.length} / ${KEYS.length} | ${KEYS.length} / ${KEYS.length}`, await coverageCounts());
expect(
  "Translations: the anotoki library's words are keys of the grid like the site's own - in this site's formal Slovak, and the site's words where it had its own (migration 010)",
  (await boxValue('anotoki.topbar.menu', 'sk')) === 'Vaša ponuka' &&
    (await boxValue('anotoki.ui.copyFailed', 'sk')) === 'Kopírovanie nefungovalo. Označte text a skopírujte ho ručne.' &&
    (await boxValue('anotoki.siteStatus.unavailableText', 'sk')) === 'Skúste to, prosím, znova o pár minút. Táto stránka sa obnoví sama.' &&
    (await boxValue('anotoki.topbar.roleAdmin', 'sk')) === 'Rola: administrátor' &&
    (await boxValue('anotoki.topbar.signOut', 'en')) === EN.signOut,
  `${await boxValue('anotoki.topbar.menu', 'sk')} / ${await boxValue('anotoki.ui.copyFailed', 'sk')} / ${await boxValue('anotoki.topbar.roleAdmin', 'sk')}`,
);
const plural = await js(
  `(() => { const b = ${family('home.questions')}; if (!b) return null; const all = (selector) => [...b.querySelectorAll(selector)].map((e) => e.textContent.replace(/\\s+/g, ' ').trim()); return { keys: all('.anotoki-translations-page__key-name'), numbers: all('.anotoki-translations-page__numbers'), en: all('.anotoki-translations-page__sample[lang=en] li'), sk: all('.anotoki-translations-page__sample[lang=sk] li') }; })()`,
);
expect('Translations: a plural family is one block - one, few, other', plural?.keys.join(' ') === 'home.questions.one home.questions.few home.questions.other', plural?.keys.join(' '));
expect(
  '... each form says which numbers it is for, in English and in Slovak',
  plural?.numbers.join(' | ') ===
    'For the numbers: 1 | For the numbers: 1 | For the numbers: not used in English - the fallback for other languages | For the numbers: 2-4 | For the numbers: everything else | For the numbers: 0, 5 and more',
  plural?.numbers.join(' | '),
);
expect(
  '... and the block shows the family as the site says it for 1, 3 and 12',
  plural?.en.join(' | ') === '1 question | 3 questions | 12 questions' && plural?.sk.join(' | ') === '1 otázka | 3 otázky | 12 otázok',
  `${plural?.en.join(' | ')} // ${plural?.sk.join(' | ')}`,
);
expect('Translations: nothing changed, nothing to save', (await saveState()) === 'Everything is saved' && (await saveReady()) === false, await saveState());
await expectNoSideways('Translations, desktop');
await screenshots('admin-translations-1280', false);
await js(`${family('home.questions')}.scrollIntoView({ block: 'center' }); true`);
await screenshots('admin-translations-1280-plural', false);

// A Slovak string reworded - first with a placeholder its English string does not have.
const refusalBeside = (key) => text(`${row(key)} .anotoki-translations-admin__field-error`);
const changedMark = (key) => text(`${row(key)} .anotoki-translation-cell__mark`);
await fill(box('home.title', 'sk'), 'Povedzte nám {nope} svoj názor');
expect(
  'Translations: a changed box is marked, and the bar counts it',
  (await changedMark('home.title')) === 'Changed' && (await saveState()) === '1 string changed, not saved yet',
  `${await changedMark('home.title')} / ${await saveState()}`,
);
await clickText('anotoki-translations-page [data-save]', 'Save');
await waitFor(page, `!!document.querySelector(${JSON.stringify(`${row('home.title')} .anotoki-translations-admin__field-error`)})`, 15000);
const refusal = await refusalBeside('home.title');
expect(
  'Translations: a placeholder the English string does not have is refused, beside its key',
  refusal === 'Nothing was saved. The Slovak string of "home.title" uses {nope}, which its English string does not have.',
  refusal,
);
expect(
  '... its box is marked wrong, and the bar says where to look',
  (await js(`document.querySelector(${JSON.stringify(box('home.title', 'sk'))}).getAttribute('aria-invalid')`)) === 'true' && (await saveState()) === 'Nothing was saved: see home.title',
  await saveState(),
);
await sleep(400);
await screenshots('admin-translations-1280-refused', false);
const HOME_SK = 'Povedzte nám, čo si myslíte';
await fill(box('home.title', 'sk'), HOME_SK);
expect('Translations: changing the box takes the refusal away', (await refusalBeside('home.title')) === null && (await saveState()) === '1 string changed, not saved yet', await saveState());
await clickText('anotoki-translations-page [data-save]', 'Save');
await waitFor(page, "document.querySelector('anotoki-translations-page [data-save-state]')?.textContent.trim() === 'The string is saved.'", 15000);
expect(
  'Translations: saved - the bar says so, and no box is marked any more',
  !(await js("!!document.querySelector('anotoki-translations-page .anotoki-translation-cell__mark')")) && (await saveReady()) === false,
  await saveState(),
);

// ── A save that fails with no key to blame: said where Save is ──────────────
// A box far down the grid, so the top of the page is out of sight - what is said there is not seen.
const DRAFT_SK = ['notFound.text', 'sk', 'Možno je v adrese preklep, alebo sa to, čo tu bolo, presunulo.'];
const DRAFT_EN = ['notFound.action', 'en', 'Back to the open surveys'];
/** The rows with a box marked changed, as "key language+language", as the grid lists them. */
const marks = () =>
  js(
    "[...document.querySelectorAll('anotoki-translations-page .anotoki-translations-page__row')].filter((row) => row.querySelector('.anotoki-translation-cell__mark')).map((row) => row.querySelector('.anotoki-translations-page__key-name').textContent.trim() + ' ' + [...row.querySelectorAll('anotoki-translation-cell')].filter((cell) => cell.querySelector('.anotoki-translation-cell__mark')).map((cell) => cell.querySelector('textarea').getAttribute('lang')).join('+'))",
  );
const storedSk = await boxValue(DRAFT_SK[0], 'sk');
const storedEn = await boxValue(DRAFT_EN[0], 'en');
/** The bar Save is in, and what it says became of the save, are inside the window - on a page scrolled away from its top. */
const saidInView = () =>
  js(`(() => {
    const bar = document.querySelector('anotoki-translations-page .anotoki-translations-page__save-bar')?.getBoundingClientRect();
    const said = document.querySelector('anotoki-translations-page .anotoki-translations-page__save-refused')?.getBoundingClientRect();
    const inside = (r) => !!r && r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth + 0.5;
    return { ok: inside(bar) && inside(said) && window.scrollY > 400, detail: 'scrolled ' + Math.round(window.scrollY) + ', the bar ' + (bar ? Math.round(bar.top) + '-' + Math.round(bar.bottom) : 'missing') + ' of ' + window.innerHeight };
  })()`);
const saidOfTheSave = async (words) => {
  await clickText('anotoki-translations-page [data-save]', 'Save');
  await waitFor(
    page,
    `(document.querySelector('anotoki-translations-page [data-save-state]')?.textContent ?? '').includes(${JSON.stringify(words)}) && !document.querySelector('anotoki-translations-page [data-save][aria-busy=true]')`,
    15000,
  );
  await sleep(300);
  return saveState();
};
await fill(box(...DRAFT_SK.slice(0, 2)), DRAFT_SK[2]);
// The server itself fails - a page that is not the API's, as a proxy in front of it answers.
await intercept('*/api/admin/translations', (request) => (request.method === 'PUT' ? { status: 500, body: '<h1>Internal Server Error</h1>' } : null));
const failed = await saidOfTheSave('Something went wrong on the server');
let view = await saidInView();
expect(
  'Translations: a save the server fails on is said in the bar Save is in',
  failed === 'Nothing was saved. Something went wrong on the server. Try again; the server’s error log says more.',
  failed,
);
expect(
  '... which is in view, far from the top of the page - and nothing is said up there, out of sight',
  view.ok && !(await js("!!document.querySelector('anotoki-translations-page anotoki-alert')")),
  view.detail,
);
expect(
  '... and what was typed is still in its box, still to be saved',
  (await boxValue(DRAFT_SK[0], 'sk')) === DRAFT_SK[2] && same(await marks(), [`${DRAFT_SK[0]} sk`]) && (await saveReady()) === true,
  JSON.stringify(await marks()),
);
await screenshots('admin-translations-1280-save-failed', false);
// No answer at all: the connection is gone for that one request.
await intercept('*/api/admin/translations', (request) => (request.method === 'PUT' ? 'unreachable' : null));
const unreachable = await saidOfTheSave('could not be reached');
expect(
  'Translations: a save that reaches nobody is said in the same place',
  unreachable === 'Nothing was saved. The server could not be reached. Check the connection and try again.' && (await saidInView()).ok,
  unreachable,
);
await stopIntercepting();
await viewport(390);
await sleep(400);
await js(`document.querySelector(${JSON.stringify(box(...DRAFT_SK.slice(0, 2)))}).scrollIntoView({ block: 'center' }); true`);
await sleep(300);
view = await saidInView();
expect(
  'Translations, 390 px: the bar says it whole, inside the window',
  view.ok && (await js("(() => { const said = document.querySelector('anotoki-translations-page .anotoki-translations-page__save-refused'); return said.scrollWidth <= said.clientWidth + 1; })()")),
  view.detail,
);
await expectNoSideways('Translations, 390 px, a save that failed');
await screenshots('admin-translations-390-save-failed', false);
await viewport(1280);
await sleep(400);

// ── What is typed and not saved outlives the session ────────────────────────
// Two boxes typed, in two languages. Then the session ends the way it does by itself: the access token has run
// out and the IAM will not renew it (its own session is over - signed out elsewhere, the idle limit). The admin
// area takes its page away at that moment, with no navigation and no question. The boxes are the family's drafts
// (LocalizationDrafts), kept for the tab under the name the site always had.
await fill(box(...DRAFT_EN.slice(0, 2)), DRAFT_EN[2]);
// As the grid lists them: by key.
const BOTH = [`${DRAFT_EN[0]} en`, `${DRAFT_SK[0]} sk`];
expect('Translations: two boxes typed, neither saved', same(await marks(), BOTH), JSON.stringify(await marks()));
const DRAFTS_KEY = 'anotoki-survey:localization-drafts';
const draftsKept = () =>
  js(
    `(() => { try { const kept = JSON.parse(sessionStorage.getItem(${JSON.stringify(DRAFTS_KEY)})); return kept ? kept.owner + ': ' + Object.entries(kept.strings).map(([key, cells]) => key + ' ' + Object.keys(cells).join('+')).join(', ') : null; } catch { return 'unreadable'; } })()`,
  );
leaving = [];
await setIam({ refuse: true });
// The token the page holds is run out: written as another tab of the site would write it, which the SDK listens for.
await js(`(() => {
  const key = Object.keys(localStorage).find((name) => name.startsWith('anotoki-auth:'));
  const session = JSON.parse(localStorage.getItem(key));
  session.access_expires_at = 0;
  localStorage.setItem(key, JSON.stringify(session));
  window.dispatchEvent(new StorageEvent('storage', { key }));
  return true;
})()`);
// The next thing the person does needs a token: they press Save.
await clickText('anotoki-translations-page [data-save]', 'Save');
await waitFor(page, "!document.querySelector('anotoki-translations-page') && !!document.querySelector('app-top-bar button.anotoki-top-bar__sign-in')", 15000);
await sleep(400);
const iamLog = await iamTrips();
expect(
  'the session ended - the IAM refused to renew it: the page is gone, where it was, and the bar offers to sign in',
  (await js('location.pathname')) === '/admin/translations' &&
    !(await js("!!document.querySelector('app-top-bar .anotoki-top-bar__person-button')")) &&
    iamLog.slice(-3).includes('POST /api/oidc/token'),
  `${await js('location.pathname')}; the IAM was asked: ${iamLog.slice(-3).join(', ')}`,
);
expect('... and what was typed is kept for the tab, for the person it was typed by', (await draftsKept()) === `${OWNER.id}: ${DRAFT_SK[0]} sk, ${DRAFT_EN[0]} en`, await draftsKept());
const signedOutCard = async () => text('app-admin-layout anotoki-empty-state');
expect(
  'the admin area says so: "You are signed out", and that the boxes are kept - not that the account has no editor role',
  (await signedOutCard())?.includes('You are signed out') &&
    (await signedOutCard())?.includes('what you typed on the Translations and Languages pages is kept in this tab') &&
    !(await signedOutCard())?.includes('no editor role'),
  await signedOutCard(),
);
await screenshot('admin-session-ended');
await viewport(390);
await sleep(400);
await expectBar('signed out in the admin area, 390 px');
expect(
  "signed out in the admin area, 390 px: the brand, the theme, the menu button - and the card's own Sign in",
  same(await barRow(), ['anotoki-brand', 'anotoki-theme-toggle', 'phone-menu']) && (await text('app-admin-layout anotoki-empty-state button')) === 'Sign in',
  JSON.stringify(await barRow()),
);
await screenshots('admin-session-ended-390');
await openUserMenu();
expect(
  "... its menu: the admin area's sections, then Sign in",
  same(await texts('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menuitem]'), ['Surveys', 'Translations', 'Languages', 'Sign in']),
  JSON.stringify(await texts('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menuitem]')),
);
await escape();
await viewport(1280);
await sleep(400);
// The site's links and Back still work from here: the page is gone, so the router asks the Translations page's guard
// with no page - which lets the navigation through (it threw, and every link of this state was dead). The admin
// area's own sign-in guard does not run again for a page inside it: the card stays, and nobody is sent to the IAM.
await js("document.querySelector('app-top-bar anotoki-brand a').click(); true");
await waitFor(page, "location.pathname === '/admin'", 10000).catch(() => null);
await sleep(400);
expect(
  'signed out: the brand link goes to /admin - the card stays, still signed out',
  (await js('location.pathname')) === '/admin' && (await signedOutCard())?.includes('You are signed out') && !(await js("!!document.querySelector('app-top-bar .anotoki-top-bar__person-button')")),
  `${await js('location.pathname')} / ${await signedOutCard()}`,
);
await js('history.back(); true');
await waitFor(page, "location.pathname === '/admin/translations'", 10000).catch(() => null);
await sleep(400);
expect(
  '... and Back comes back to the Translations page, the card still there',
  (await js('location.pathname')) === '/admin/translations' && (await signedOutCard())?.includes('You are signed out'),
  `${await js('location.pathname')} / ${await signedOutCard()}`,
);
await setIam({ refuse: false });
// Signed in again: to the IAM and back is a page load, to the address the page was on. The browser asks nothing
// on the way: nobody is signed in, and the family's drafts wait in the tab for the same person (anotoki-lib 0.4.0 -
// 0.3.0 asked "Leave site?" here, whenever boxes waited).
const askedBeforeSignIn = leaving.length;
await clickText('app-top-bar button', 'Sign in');
await sleep(1500);
await settle();
await waitFor(page, `location.pathname === '/admin/translations' && ${GRID_DRAWN}`, 15000);
await sleep(400);
expect(
  'on the way to the sign-in the browser asked nothing - nobody is signed in, the drafts wait in the tab for the same person',
  leaving.length === askedBeforeSignIn,
  `asked ${leaving.length - askedBeforeSignIn} time(s)`,
);
expect(
  'signed in again: both boxes hold what was typed, and are marked as changed',
  (await text('app-top-bar .anotoki-top-bar__person-name')) === OWNER.username &&
    (await boxValue(DRAFT_SK[0], 'sk')) === DRAFT_SK[2] &&
    (await boxValue(DRAFT_EN[0], 'en')) === DRAFT_EN[2] &&
    same(await marks(), BOTH),
  `${await boxValue(DRAFT_SK[0], 'sk')} / ${await boxValue(DRAFT_EN[0], 'en')} / ${JSON.stringify(await marks())}`,
);
expect('... and the bar counts them, with Save ready', (await saveState()) === '2 strings changed, not saved yet' && (await saveReady()) === true, await saveState());
await js(`document.querySelector(${JSON.stringify(box(...DRAFT_SK.slice(0, 2)))}).scrollIntoView({ block: 'center' }); true`);
await screenshots('admin-translations-1280-drafts-back', false);

// Signing out is asked about first: signed out, what is typed would be lost.
/** A question of the site's or the family's pages (a dialog of the page, not the browser's): its heading, its text, its buttons. */
const question = () =>
  js(
    "(() => { const d = document.querySelector('dialog[open]'); return d ? { title: d.querySelector('.anotoki-dialog__title').textContent.trim(), message: d.querySelector('.anotoki-confirm-host__message, .anotoki-dialog__description')?.textContent.trim() ?? '', buttons: [...d.querySelectorAll('.anotoki-dialog__footer button')].map((b) => b.textContent.trim()).join(' | ') } : null; })()",
  );
await openUserMenu();
await clickText('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menuitem]', EN.signOut);
await waitFor(page, "!!document.querySelector('dialog[open]')", 15000);
await sleep(300);
let asking = await question();
expect(
  'signing out with boxes not saved asks first, and says where they are',
  asking?.title === 'Sign out without your latest changes?' &&
    asking?.message === "Some changes to the site's strings or languages are not saved - the Translations and Languages pages show them. Signed out, they are lost." &&
    asking?.buttons === 'Stay | Sign out anyway',
  JSON.stringify(asking),
);
await screenshot('admin-sign-out-unsaved-1280');
await viewport(390);
await sleep(400);
expect('390 px: the question is inside the window', await menuInside('dialog[open] .anotoki-dialog__panel'));
await expectNoSideways('the sign-out question, 390 px');
await screenshots('admin-sign-out-unsaved-390', false);
await viewport(1280);
await sleep(400);
await clickText('dialog[open] button', 'Stay');
await sleep(500);
expect(
  '"Stay": still signed in, still on the page, the boxes as they were',
  !(await js("!!document.querySelector('dialog[open]')")) &&
    (await text('app-top-bar .anotoki-top-bar__person-name')) === OWNER.username &&
    (await boxValue(DRAFT_SK[0], 'sk')) === DRAFT_SK[2] &&
    same(await marks(), BOTH),
  JSON.stringify(await marks()),
);

// Where people take surveys: the new words, after a reload. (The boxes typed above go along, unsaved: a page load
// keeps them for the tab.)
await go('/?lang=sk');
expect(
  'the reworded string is what a Slovak reader sees after a reload',
  (await pageLanguage()) === 'sk' && (await text('app-survey-home h1')) === HOME_SK,
  `${await pageLanguage()}, ${await text('app-survey-home h1')}`,
);
await expectNoKeys('Slovak, the home page reworded');

// The same question where people take surveys, in Slovak - and this time the answer is to go.
await viewport(360);
await sleep(300);
await openUserMenu();
await clickText('app-top-bar .anotoki-top-bar__actions > anotoki-menu [role=menuitem]', SK.signOut);
await waitFor(page, "!!document.querySelector('dialog[open]')", 15000);
await sleep(300);
asking = await question();
expect(
  'Slovak: signing out from another page asks the same, in Slovak',
  asking?.title === 'Odhlásiť sa bez uloženia posledných zmien?' &&
    asking?.message === 'Niektoré zmeny v textoch alebo jazykoch stránky nie sú uložené – nájdete ich na stránkach „Translations“ a „Languages“. Po odhlásení sa stratia.' &&
    asking?.buttons === 'Zostať | Aj tak sa odhlásiť',
  JSON.stringify(asking),
);
expect('Slovak, 360 px: the question is inside the window', await menuInside('dialog[open] .anotoki-dialog__panel'));
await expectNoSideways('Slovak, 360 px, the sign-out question');
await expectNoKeys('Slovak, the sign-out question');
await screenshots('sk-360-sign-out-unsaved', false);
await clickText('dialog[open] button', 'Aj tak sa odhlásiť');
await sleep(1500);
await settle();
// Signed out at the IAM, back at / - which is for somebody signed in, so the sign-in follows at once.
await waitFor(page, SIGNED_IN, 15000);
const signOutTrip = (await iamTrips()).slice(-10);
expect(
  '"Sign out anyway": signed out at the IAM, and what was typed is given up - nothing of it is kept for the tab',
  signOutTrip.includes('GET /api/oidc/logout') && (await draftsKept()) === null,
  `${signOutTrip.join(', ')} / ${await draftsKept()}`,
);
// Nothing is unsaved from here on: the browser's own question is a problem again.
const browserAsked = leaving.length;
leaving = null;
await viewport(1280);
await go('/admin/translations');
await waitFor(page, GRID_DRAWN, 15000);
expect(
  'back on the Translations page: every box says what the site has, none is marked',
  (await boxValue(DRAFT_SK[0], 'sk')) === storedSk && (await boxValue(DRAFT_EN[0], 'en')) === storedEn && same(await marks(), []) && (await saveState()) === 'Everything is saved',
  `${JSON.stringify(await marks())} / ${await saveState()}; the browser itself asked ${browserAsked} time(s) on the way`,
);

// ── The languages on offer: the Languages page ──────────────────────────────
// The family's page too (<anotoki-languages-page>): a row a language, each saying what happened in a line of its own.
/** The rows are drawn: `count` languages. */
const languageRows = (count) => `document.querySelectorAll('anotoki-languages-page .anotoki-languages-page__language').length === ${count}`;
/** A language's row, as an expression for the page. */
const languageRow = (code) => `document.querySelector('anotoki-languages-page .anotoki-languages-page__language[data-language="${code}"]')`;
await go('/admin/languages');
await waitFor(page, languageRows(2), 15000);
/** Each row's head - its code, names and badges - without the count of its strings. */
const languageHeads = async () =>
  (
    await js(
      "[...document.querySelectorAll('anotoki-languages-page .anotoki-languages-page__head')].map((h) => [...h.children].filter((c) => !c.matches('.anotoki-languages-page__note')).map((c) => c.textContent.trim()).join(' '))",
    )
  ).join(' | ');
/** What the page says the last thing it did was. */
const happened = () => text('anotoki-languages-page [data-happened]');
const offeredSwitch = (code) => `${languageRow(code)}.querySelector('anotoki-switch[data-offered] input[role=switch]')`;
const offeredWords = (code) => js(`${languageRow(code)}?.querySelector('anotoki-switch[data-offered] .anotoki-switch__words')?.textContent.trim() ?? null`);
const slovakOffered = async (label) => {
  await js(`${offeredSwitch('sk')}.click(); true`);
  // The row says the new state at once; the switch is free again once the server has answered.
  await waitFor(
    page,
    `${languageRow('sk')}.querySelector('anotoki-switch[data-offered] .anotoki-switch__words')?.textContent.trim() === ${JSON.stringify(label)} && !${offeredSwitch('sk')}.disabled`,
    15000,
  );
};
expect(
  'Languages: named in the tab; English the fallback, Slovak released with the site',
  (await js('document.title')).startsWith('Languages · ') && (await languageHeads()) === 'en English English Fallback | sk Slovak Slovenčina Released with the site',
  `${await js('document.title')} / ${await languageHeads()}`,
);
expect(
  'Languages: English cannot be switched off, and neither language can be deleted',
  (await js(`(() => { const s = ${offeredSwitch('en')}; return s.checked && s.disabled; })()`)) && !(await js("!!document.querySelector('anotoki-languages-page [data-delete]')")),
);
await expectNoSideways('Languages, desktop');
await screenshots('admin-languages-1280');

await slovakOffered('Hidden');
expect(
  'Languages: Slovak is hidden with its switch - the page says so',
  (await happened()) === 'Slovak is hidden: readers are not offered it.' && (await js(`${languageRow('sk')}.classList.contains('anotoki-languages-page__language--hidden')`)),
  await happened(),
);
const hiddenBundle = await (await fetch(`${origin}/api/translations/sk`)).json();
expect(
  'hidden: asked for Slovak, the site answers in English and offers English alone',
  hiddenBundle.language === 'en' && hiddenBundle.languages.map((l) => l.code).join(' ') === 'en',
  `${hiddenBundle.language}: ${hiddenBundle.languages?.map((l) => l.code).join(' ')}`,
);
await screenshot('admin-languages-1280-slovak-hidden');
// The page that hid it has the site's languages again at once: through the menu, with no page load, the pages
// people take surveys on are English already.
const toTheSurveys = async () => {
  await openUserMenu();
  await clickText('app-top-bar .anotoki-top-bar__actions > anotoki-menu a', 'Back to the surveys');
  await waitFor(page, "location.pathname === '/' && !!document.querySelector('app-survey-home h1')", 15000);
  await sleep(400);
};
await toTheSurveys();
expect(
  'hidden: without a page load, the tab that reads Slovak is English already',
  (await pageLanguage()) === 'en' && (await text('app-survey-home h1')) === EN.home && !(await js("!!document.querySelector('app-top-bar anotoki-language-switcher')")),
  `${await pageLanguage()}, ${await text('app-survey-home h1')}`,
);
await go('/');
expect(
  'hidden: a reader whose tab asked for Slovak reads English, and the chooser is gone',
  (await pageLanguage()) === 'en' &&
    (await text('app-survey-home h1')) === EN.home &&
    !(await js("!!document.querySelector('app-top-bar anotoki-language-switcher')")) &&
    (await storedLanguage()) === ' / sk',
  `${await pageLanguage()}, ${await text('app-survey-home h1')}, chooser: ${await js("!!document.querySelector('app-top-bar anotoki-language-switcher')")}, ${await storedLanguage()}`,
);
await expectBar('English alone, desktop');
await screenshot('en-1280-home-one-language');
await go('/admin/languages');
await waitFor(page, languageRows(2), 15000);
await slovakOffered('Offered');
expect('Languages: and offered again', (await happened()) === 'Slovak is offered to readers now.', await happened());
await toTheSurveys();
expect(
  'offered again: without a page load, the same tab is Slovak again',
  (await pageLanguage()) === 'sk' && (await text('app-survey-home h1')) === HOME_SK && (await text('app-top-bar anotoki-language-switcher .anotoki-language-switcher__switcher')) === 'SK',
  `${await pageLanguage()}, ${await text('app-survey-home h1')}`,
);
await go('/');
expect(
  'offered again: the same tab is Slovak, and the chooser is back',
  (await pageLanguage()) === 'sk' && (await text('app-survey-home h1')) === HOME_SK && (await text('app-top-bar anotoki-language-switcher .anotoki-language-switcher__switcher')) === 'SK',
  `${await pageLanguage()}, ${await text('app-survey-home h1')}, ${await text('app-top-bar anotoki-language-switcher .anotoki-language-switcher__switcher')}`,
);

// A new language starts hidden: nobody is offered a language that has no strings yet, unless the form is told so.
await go('/admin/languages');
await waitFor(page, languageRows(2), 15000);
const ADD_FORM = 'anotoki-languages-page form.anotoki-languages-page__add';
const offerAtOnce = `document.querySelector('${ADD_FORM} .anotoki-languages-page__add-offered input[role=switch]')`;
expect(
  'Languages: the form for a new one has a switch to offer it right away, and it is off',
  (await js(`(() => { const s = ${offerAtOnce}; return !!s && !s.checked && !s.disabled; })()`)) &&
    (await text(`${ADD_FORM} .anotoki-languages-page__add-offered .anotoki-switch__words`)) === 'Offer it to readers right away',
  await text(`${ADD_FORM} .anotoki-languages-page__add-offered`),
);
for (const [index, words] of ['cs', 'Czech', 'Čeština'].entries()) {
  await focus(`${ADD_FORM} anotoki-text-field input`, index);
  await typeText(words);
}
expect('add Czech', (await clickText(`${ADD_FORM} button[data-add]`, 'Add the language')) === true);
await waitFor(page, languageRows(3), 15000);
await sleep(300);
expect(
  'Languages: the new language is in the list, hidden - and the page says so',
  (await languageHeads()) === 'en English English Fallback | sk Slovak Slovenčina Released with the site | cs Czech Čeština' &&
    (await js(`${languageRow('cs')}.classList.contains('anotoki-languages-page__language--hidden')`)) &&
    (await offeredWords('cs')) === 'Hidden' &&
    (await happened()) === 'Czech is added, hidden. Write its strings, then offer it.',
  `${await languageHeads()} / ${await offeredWords('cs')} / ${await happened()}`,
);
expect(
  '... the form is empty again, its switch off for the next one',
  (await js(`[...document.querySelectorAll('${ADD_FORM} anotoki-text-field input')].every((field) => field.value === '')`)) && (await js(`${offerAtOnce}.checked`)) === false,
);
const newBundle = await (await fetch(`${origin}/api/translations/cs`)).json();
expect(
  'a new language is offered to nobody: asked for it, the site answers in English, and offers the two it had',
  newBundle.language === 'en' && newBundle.languages.map((l) => l.code).join(' ') === 'en sk',
  `${newBundle.language}: ${newBundle.languages?.map((l) => l.code).join(' ')}`,
);
await expectNoSideways('Languages, a new language, desktop');
await screenshot('admin-languages-1280-new-hidden', true);
await viewport(390);
await sleep(400);
await expectBar('Languages, a new language, 390 px');
await screenshots('admin-languages-390-new-hidden');
await viewport(1280);
await sleep(400);
// An administrator deletes it again (no survey uses it, no migration wrote strings for it): the rest of the
// check goes on with the two languages the site is released in. It has no strings, so the page offers no export first.
expect('delete Czech', (await clickText(`anotoki-languages-page .anotoki-languages-page__language[data-language="cs"] button[data-delete]`, 'Delete')) === true);
await waitFor(page, "!!document.querySelector('dialog[open]')", 15000);
await sleep(300);
const deleteAsked = await question();
expect(
  '... asked first, by its name and code, and what goes with it',
  deleteAsked?.title === 'Delete Czech (cs)?' && deleteAsked?.message === 'It has no strings of its own, so nothing else goes with it.' && deleteAsked?.buttons === 'Cancel | Delete',
  JSON.stringify(deleteAsked),
);
await clickText('dialog[open] button[data-question-yes]', 'Delete');
await waitFor(page, languageRows(2), 15000);
await sleep(300);
expect(
  'Languages: the new language is deleted again',
  (await happened()) === 'Czech is deleted.' && (await languageHeads()) === 'en English English Fallback | sk Slovak Slovenčina Released with the site',
  `${await happened()} / ${await languageHeads()}`,
);

// Both pages on a phone.
await viewport(390);
await go('/admin/languages');
await waitFor(page, languageRows(2), 15000);
await expectBar('Languages, 390 px');
await screenshots('admin-languages-390');
await go('/admin/translations');
await waitFor(page, GRID_DRAWN, 15000);
await expectBar('Translations, 390 px');
expect(
  'Translations, 390 px: the languages stand under one another, each box saying its language, none wider than the page',
  (await js("getComputedStyle(document.querySelector('anotoki-translations-page .anotoki-translations-page__grid-head')).display")) === 'none' &&
    (await js("getComputedStyle(document.querySelector('anotoki-translations-page .anotoki-translations-page__cell-language')).display")) !== 'none' &&
    (await js(
      "[...document.querySelectorAll('anotoki-translation-cell, anotoki-translations-page .anotoki-translations-page__key, anotoki-translations-page .anotoki-translations-page__language, anotoki-translations-page .anotoki-translations-page__save-bar, anotoki-translations-page .anotoki-translations-page__tools > *')].every((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 0.5; })",
    )),
);
await screenshots('admin-translations-390', false);
await js(`${family('home.questions')}.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); true`);
await screenshots('admin-translations-390-plural', false);
await viewport(1280);

// ── A survey in two languages: written in English, translated in the editor ──
await go('/admin');
await waitFor(page, "!!document.querySelector('app-surveys-list .survey')", 15000);
expect('a second survey', (await clickText('button', 'New survey')) === true);
await waitFor(page, "location.pathname.endsWith('/edit') && !!document.querySelector('#survey-title')", 15000);
const teaId = (await js('location.pathname')).split('/')[3];
await sleep(500);
const editorTabs = async () => (await texts('app-editor-languages .tab')).join(' | ');
/** What the header's Editor tab says of its count of problems (its title); null when there is no count. */
const problemsCount = () => js("document.querySelector('app-survey-header .tab .count-warn')?.getAttribute('title') ?? null");
expect(
  'the editor: the survey is written in English, and Slovak can be added',
  (await editorTabs()) === 'English main' && (await texts('app-editor-languages .add-select option')).join(' | ') === 'Add a language… | Slovak',
  `${await editorTabs()} / ${(await texts('app-editor-languages .add-select option')).join(' | ')}`,
);

await js("document.querySelector('#survey-title').select(); true");
await typeText('Tea or coffee?');
await focus('input.step-title', 0);
await typeText('Your cup');
await focus('app-question-editor .rte-body [contenteditable]', 0);
await typeText('Which do you drink in the morning?');
await focus('app-options-editor .option-input', 0);
await typeText('Tea');
await focus('app-options-editor .option-input', 1);
await typeText('Coffee');
await saved();
await clickText('.suggest', 'Use the title');
await sleep(1500);
await saved();

// Slovak is added: the same form, every text with its original, nothing else to change.
await js("(() => { const s = document.querySelector('app-editor-languages .add-select'); s.value = 'sk'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()");
await sleep(800);
expect(
  'Slovak is added: a tab of its own with nothing translated yet, and the page is on it',
  (await editorTabs()) === 'English main | Slovak 0 / 7' && (await js("document.querySelector('app-editor-languages .tab.is-active')?.textContent.includes('Slovak')")) === true,
  await editorTabs(),
);
const banner = (await texts('app-survey-editor anotoki-alert')).find((words) => words.includes('You are translating this survey into Slovak'));
expect('a banner says which language, and where the questions themselves are changed', !!banner && banner.includes('are changed in English'), banner);
const unlocked = await js(
  "['#survey-title', '#add-step', '.add-question', '.step-actions', '.head-actions', '.grip', '.kinds', '.foot', '.adds', '.option-actions', '.handle', '.thumb-actions', '.number-input', 'app-editor-settings'].filter((s) => document.querySelector('app-survey-editor ' + s)).join(' ')",
);
expect('in a translation the structure is locked: nothing to add, move, remove or set', unlocked === '', unlocked);
expect(
  "the step about the reader is not the survey's to translate: its note sends to the Translations page",
  (await js("document.querySelector('app-survey-editor .fixed-note a')?.getAttribute('href')")) === '/admin/translations' && !/\s[.,]/.test((await text('app-survey-editor .fixed-note')) ?? ' .'),
  await text('app-survey-editor .fixed-note'),
);
await clickText('app-survey-editor .toolbar button', 'Unfold all');
await sleep(600);
const originals = await js("[...document.querySelectorAll('app-translated-text .original')].map((e) => e.getAttribute('lang') + ': ' + e.textContent.replace(/\\s+/g, ' ').trim())");
const fields = await js("[...document.querySelectorAll('app-translated-text [data-place]')].map((e) => e.getAttribute('lang') + ': ' + JSON.parse(e.getAttribute('data-place'))[0])");
expect(
  'every text is a pair: the original, said to be English, and a field said to be Slovak',
  same(originals, [
    'en: Tea or coffee?',
    'en: Thank you for taking a few minutes to tell us what you think.',
    'en: Your cup',
    'en: Which do you drink in the morning?',
    'en: Tea',
    'en: Coffee',
    'en: Thank you! Your answers are on their way to us, and we read every one of them.',
  ]) && same(fields, ['sk: title', 'sk: intro', 'sk: step', 'sk: text', 'sk: option', 'sk: option', 'sk: thanks']),
  `${JSON.stringify(originals)} ${JSON.stringify(fields)}`,
);
expect(
  '... and each is marked as not translated yet',
  (await js("document.querySelectorAll('app-translated-text .pair.is-missing').length")) === 7,
  await js("document.querySelectorAll('app-translated-text .pair.is-missing').length"),
);

// "Next missing" goes through the texts in the order of the survey; each is written as it comes.
const SLOVAK = [
  ['title', 'Čaj alebo káva?'],
  ['intro', 'Ďakujeme, že ste si našli pár minút a poviete nám svoj názor.'],
  ['thanks', 'Ďakujeme! Vaše odpovede sú na ceste k nám a každú si prečítame.'],
  ['step', 'Váš nápoj'],
  ['text', 'Čo pijete ráno?'],
  ['option', 'Čaj'],
  ['option', 'Káva'],
];
const went = [];
for (const [index, [, words]] of SLOVAK.entries()) {
  if ((await clickText('app-survey-editor .translating button', 'Next missing')) !== true) {
    went.push('(no "Next missing")');
    break;
  }
  await sleep(900);
  went.push(await js("(() => { const holder = document.activeElement?.closest('[data-place]'); return holder ? JSON.parse(holder.getAttribute('data-place'))[0] : '(nowhere)'; })()"));
  await typeText(words);
  if (index !== 4) continue;

  // Five of seven done - the question's text is written, its options are not: the page as a translator has it.
  await saved();
  expect(
    'the progress is on the tab and in the bar that stays in view',
    (await editorTabs()) === 'English main | Slovak 5 / 7' && (await text('app-survey-editor .translating-count')) === '5 / 7',
    `${await editorTabs()} / ${await text('app-survey-editor .translating-count')}`,
  );
  expect(
    'the outline marks the question that has texts left, and the list of problems says how many',
    same(await texts('app-editor-outline .question .todo'), ['2 texts to translate']) && same(await texts('app-editor-outline .problem'), ['Slovak: question 1 has 2 texts to translate.']),
    `${JSON.stringify(await texts('app-editor-outline .question .todo'))} ${JSON.stringify(await texts('app-editor-outline .problem'))}`,
  );
  expect(
    "a draft: the list of problems, and the Editor tab's count, say what to fix before it opens",
    (await text('app-editor-outline #problems-title')) === '1 to fix before it opens' && (await problemsCount()) === '1 to fix before it opens',
    `${await text('app-editor-outline #problems-title')} / ${await problemsCount()}`,
  );
  const beside =
    "(() => { const [a, b] = document.querySelector('#welcome app-translated-text .pair').children; const [x, y] = [a.getBoundingClientRect(), b.getBoundingClientRect()]; return Math.abs(x.top - y.top) < 2 && x.right <= y.left; })()";
  const above = "(() => { const [a, b] = document.querySelector('#welcome app-translated-text .pair').children; return a.getBoundingClientRect().bottom <= b.getBoundingClientRect().top + 1; })()";
  expect('desktop: an original stands beside its field', await js(beside));
  await expectNoSideways('the editor translating, desktop');
  await screenshots('editor-translating-1280');
  await viewport(390);
  await sleep(500);
  await expectBar('the editor translating, 390 px');
  expect('390 px: an original stands above its field', await js(above));
  await screenshots('editor-translating-390');
  await viewport(360);
  await sleep(300);
  await expectNoSideways('the editor translating, 360 px');
  await viewport(1280);
  await sleep(400);
  // Not to be opened like this: a reader of Slovak would get half a survey.
  await clickText('app-survey-header button', 'Open the survey');
  await sleep(600);
  expect(
    'with texts left to translate the survey does not open',
    (await toasts()).includes('Fix the problem first - the editor lists it.') && (await text('app-survey-header anotoki-badge')) !== 'Open' && !(await js("!!document.querySelector('dialog[open]')")),
    `${(await toasts()).join(' | ')} / ${await text('app-survey-header anotoki-badge')}`,
  );
  await dismissToasts();
}
await saved();
expect('"Next missing" went through the texts in the order of the survey', went.join(' ') === 'title intro thanks step text option option', went.join(' '));
expect(
  'every text is translated: 7 / 7, nothing marked, nothing left for "Next missing"',
  (await editorTabs()) === 'English main | Slovak 7 / 7' &&
    (await text('app-survey-editor .translating-done')) === 'Nothing is missing' &&
    (await js("document.querySelectorAll('app-translated-text .pair.is-missing').length")) === 0,
  `${await editorTabs()} / ${await text('app-survey-editor .translating-done')}`,
);
expect(
  'and the survey is ready to open',
  (await text('app-editor-outline #problems-title')) === 'Ready to open' && (await js("document.querySelectorAll('app-editor-outline .todo').length")) === 0,
  await text('app-editor-outline #problems-title'),
);
expect(
  'the Preview from a translation opens the survey in that language',
  (await js("document.querySelector('app-survey-header a[href*=preview]')?.getAttribute('href')")) === `/preview/${teaId}?language=sk`,
  await js("document.querySelector('app-survey-header a[href*=preview]')?.getAttribute('href')"),
);
await screenshot('editor-translated-1280', true);

// The preview of a translation, and back: the editor opens on the translation that was being previewed.
await go(`/preview/${teaId}?language=sk`);
await waitFor(page, "!!document.querySelector('app-take-survey app-survey-hero h1')", 15000);
const backLinks = await js("[...document.querySelectorAll('app-take-survey a')].filter((a) => a.textContent.includes('Back to the editor')).map((a) => a.getAttribute('href'))");
expect(
  'the preview shows the translation, and its way back names it',
  (await text('app-survey-hero h1')) === SLOVAK[0][1] && backLinks.length > 0 && backLinks.every((href) => href === `/admin/surveys/${teaId}/edit?language=sk`),
  `${await text('app-survey-hero h1')} / ${JSON.stringify(backLinks)}`,
);
await clickText('app-take-survey a', 'Back to the editor');
await waitFor(page, "location.pathname.endsWith('/edit') && !!document.querySelector('app-editor-languages .tab.is-active')", 15000);
await sleep(500);
expect(
  'back in the editor: on the Slovak tab, not on the main language',
  (await text('app-editor-languages .tab.is-active'))?.startsWith('Slovak') && (await js('location.search')) === '?language=sk',
  `${await text('app-editor-languages .tab.is-active')} / ${await js('location.search')}`,
);

await go(`/admin/surveys/${teaId}/edit`);
await waitFor(page, "!!document.querySelector('app-editor-languages .tab') && !!document.querySelector('#survey-title')", 15000);
expect(
  'after a reload the server has every Slovak text, and the language the survey is written in is fixed',
  (await editorTabs()) === 'English main | Slovak 7 / 7' &&
    (await js("document.querySelector('#survey-language').disabled")) === true &&
    (await text('app-editor-settings'))?.includes('Translated into Slovak'),
  await editorTabs(),
);
expect('open the translated survey', (await clickText('app-survey-header button', 'Open the survey')) === true);
await sleep(400);
expect('confirm', (await clickText('dialog button', 'Open')) === true);
await waitFor(page, "(document.querySelector('app-survey-header anotoki-badge')?.textContent ?? '').includes('Open')", 15000);
const teaSlug = await js("document.querySelector('app-survey-header .address-link').textContent.split('/').pop()");
expect(
  'the translated survey is open, at the address from its title',
  (await text('app-survey-header anotoki-badge')) === 'Open' && teaSlug === 'tea-or-coffee',
  `${await text('app-survey-header anotoki-badge')}, ${teaSlug}`,
);
await dismissToasts();

// ── A reader whose account is Slovak: one survey has no Slovak, one has all of it ──
await viewport(360);
await setIam({ user: ZUZANA, deny: false });
// Out, and in again at once as Zuzana; then nothing stored - the page load signs her in again.
await signOut(SK);
await js('localStorage.clear(); sessionStorage.clear(); true');
await go('/');
await waitFor(page, SIGNED_IN + " && !!document.querySelector('app-survey-home h1')", 15000);
expect(
  'Zuzana reads Slovak, from her account',
  (await pageLanguage()) === 'sk' && (await text('app-survey-home h1')) === HOME_SK && (await storedLanguage()) === ' / ',
  `${await pageLanguage()}, ${await text('app-survey-home h1')}, ${await storedLanguage()}`,
);
const list = await listed();
expect('home, Slovak: the translated survey is listed in Slovak, with nothing said about its language', same(list[teaSlug], ['Čaj alebo káva?', null, null]), JSON.stringify(list[teaSlug]));
expect(
  'home, Slovak: the survey with no Slovak keeps its English title, says lang="en", and notes its language',
  same(list[slug], ['Genshin 6.1 - what next?', 'en', 'Jazyk: English']),
  JSON.stringify(list[slug]),
);
expect(
  'home, Slovak: the language is named as its speakers write it, in an element that says which language that is',
  same(await js("[...document.querySelectorAll('app-survey-home .survey-language [lang]')].map((e) => [e.textContent.trim(), e.getAttribute('lang')])"), [['English', 'en']]),
  JSON.stringify(await marked('app-survey-home')),
);
await expectBar('Slovak, 360 px, two surveys');
await expectNoKeys('Slovak, the home page with two surveys');
await screenshots('sk-360-home-two-surveys');

// The survey with no Slovak, on a Slovak page: its own texts in English and said to be, the site's words Slovak.
await go(`/${slug}`);
await waitFor(page, "!!document.querySelector('.start button')", 15000);
expect(
  "no Slovak: the welcome is the survey's own, in English, and one more fact says so",
  (await text('app-survey-hero h1')) === 'Genshin 6.1 - what next?' && (await text('app-take-survey .fact-language')) === 'Jazyk: English',
  `${await text('app-survey-hero h1')} / ${JSON.stringify(await texts('app-take-survey .facts li'))}`,
);
expect(
  'no Slovak: lang="en" on the title, the welcome and the language\'s name - and on nothing else',
  same(await marked('app-take-survey'), ['title: en', 'intro rich: en', 'span: en']),
  JSON.stringify(await marked('app-take-survey')),
);
expect(
  "no Slovak: the site's own words are Slovak all the same",
  (await pageLanguage()) === 'sk' && (await text('app-survey-hero .eyebrow')) === 'Prieskum' && (await text('.start button')) === 'Začať prieskum',
  `${await pageLanguage()}, ${await text('app-survey-hero .eyebrow')}, ${await text('.start button')}`,
);
await expectNoKeys('Slovak, the welcome of a survey in English');
await screenshots('sk-360-english-survey-welcome');
await clickText('.start button', 'Začať prieskum');
await sleep(500);
await pick('female');
await pick('25-34');
await clickText('button[type=submit]', 'Ďalej');
await sleep(600);
expect(
  'no Slovak, a step: the question and its options are English and say lang="en"',
  (await text('app-question-block .text')) === 'Which element do you play most?' &&
    same(await texts('app-question-block .label'), ['Anemo', 'Geo']) &&
    same(await marked('app-take-survey'), ['title: en', 'text rich: en', 'label: en', 'label: en']),
  `${await text('app-question-block .text')} ${JSON.stringify(await marked('app-take-survey'))}`,
);
expect(
  "... between the site's Slovak: the step line and the button",
  (await text('app-survey-hero .where'))?.includes('Krok 2 / 2') && (await text('button[type=submit]'))?.includes('Odoslať odpovede'),
  `${await text('app-survey-hero .where')} / ${await text('button[type=submit]')}`,
);
await expectBar('Slovak, 360 px, a step of a survey in English');
await expectNoKeys('Slovak, a step of a survey in English');
await screenshots('sk-360-english-survey-step');

// The translated survey: Slovak from its name to its thank-you.
await go(`/${teaSlug}`);
await waitFor(page, "!!document.querySelector('.start button')", 15000);
expect(
  'translated: the welcome in Slovak - the name, the text, the tab',
  (await text('app-survey-hero h1')) === 'Čaj alebo káva?' && (await text('app-take-survey .intro')) === SLOVAK[1][1] && (await js('document.title')).startsWith('Čaj alebo káva?'),
  `${await text('app-survey-hero h1')} / ${await text('app-take-survey .intro')} / ${await js('document.title')}`,
);
expect(
  'translated: nothing says another language, and there is no note',
  same(await marked('app-take-survey'), []) && !(await js("!!document.querySelector('app-take-survey .fact-language')")),
  JSON.stringify(await marked('app-take-survey')),
);
expect('translated: its size in Slovak', (await text('.facts'))?.includes('1 otázka · 2 kroky'), await text('.facts'));
await expectBar('Slovak, 360 px, the translated survey');
await expectNoKeys('Slovak, the welcome of the translated survey');
await screenshots('sk-360-translated-welcome');
await clickText('.start button', 'Začať prieskum');
await sleep(500);
await pick('female');
await pick('25-34');
await clickText('button[type=submit]', 'Ďalej');
await sleep(600);
expect(
  'translated: the step, the question and its options in Slovak',
  (await text('app-take-survey .step-heading')) === 'Váš nápoj' &&
    (await text('app-question-block .text')) === 'Čo pijete ráno?' &&
    same(await texts('app-question-block .label'), ['Čaj', 'Káva']) &&
    same(await marked('app-take-survey'), []),
  `${await text('app-take-survey .step-heading')} / ${await text('app-question-block .text')} / ${JSON.stringify(await texts('app-question-block .label'))} ${JSON.stringify(await marked('app-take-survey'))}`,
);
await expectBar('Slovak, 360 px, a step of the translated survey');
await expectNoKeys('Slovak, a step of the translated survey');
await screenshots('sk-360-translated-step');
await clickText('app-question-block label', 'Čaj');
await sleep(200);
await clickText('button[type=submit]', 'Odoslať odpovede');
await waitFor(page, "!!document.querySelector('.done-heading')", 15000);
expect(
  'translated: the thank-you in Slovak',
  (await text('.done-heading')) === 'Ďakujeme!' && (await text('app-take-survey .thanks')) === SLOVAK[2][1] && same(await marked('app-take-survey'), []),
  `${await text('.done-heading')} / ${await text('app-take-survey .thanks')}`,
);
await expectNoKeys('Slovak, the translated survey sent');
await screenshots('sk-360-translated-sent');

// ── Another reader changes the language in the middle of a step ─────────────
await go('/?lang=sk');
await signInAs(NINA, SK);
await go(`/${teaSlug}`);
await waitFor(page, "!!document.querySelector('.start button')", 15000);
await clickText('.start button', 'Začať prieskum');
await sleep(500);
await pick('female');
await pick('25-34');
await clickText('button[type=submit]', 'Ďalej');
await sleep(600);
await clickText('app-question-block label', 'Káva');
await sleep(200);
expect(
  'Nina, in Slovak: the question, and her answer given',
  (await text('app-question-block .text')) === 'Čo pijete ráno?' && same(await chosenLabels(), ['Káva']),
  `${await text('app-question-block .text')} ${JSON.stringify(await chosenLabels())}`,
);
await chooseLanguage('English', 'en');
expect(
  'changed to English in the middle of the step: the same step, every text of the survey in English',
  (await text('app-survey-hero .where'))?.includes('Step 2 of 2') &&
    (await text('app-take-survey .step-heading')) === 'Your cup' &&
    (await text('app-question-block .text')) === 'Which do you drink in the morning?' &&
    same(await texts('app-question-block .label'), ['Tea', 'Coffee']) &&
    same(await marked('app-take-survey'), []) &&
    (await js('document.title')).startsWith('Tea or coffee?'),
  `${await text('app-survey-hero .where')} / ${await text('app-question-block .text')} / ${JSON.stringify(await texts('app-question-block .label'))} / ${await js('document.title')}`,
);
expect('... and the answer given is kept', same(await chosenLabels(), ['Coffee']), JSON.stringify(await chosenLabels()));
await clickText('app-take-survey .step-actions button', 'Back');
await sleep(400);
expect(
  '... and so are the answers of the step before',
  (await text('app-take-survey .step-heading')) === 'About you' && same(await chosenLabels(), ['Female', '25–34']),
  `${await text('app-take-survey .step-heading')} ${JSON.stringify(await chosenLabels())}`,
);
await clickText('button[type=submit]', 'Next');
await sleep(500);
await expectBar('English, 360 px, the translated survey');
await screenshots('en-360-translated-step-switched');
await clickText('button[type=submit]', 'Send my answers');
await waitFor(page, "!!document.querySelector('.done-heading')", 15000);
expect(
  'sent in English: the thank-you in English',
  (await text('.done-heading')) === 'Thank you!' && (await text('app-take-survey .thanks'))?.startsWith('Thank you! Your answers are on their way'),
  `${await text('.done-heading')} / ${await text('app-take-survey .thanks')}`,
);

// ── The admin area: which language each of them read ────────────────────────
await viewport(1280);
await signInAs(OWNER, EN);
/** What a person's answers say about the language, in the drawer of the results. */
async function readIn(id, person) {
  await go(`/admin/surveys/${id}/results?tab=people`);
  await waitFor(page, "!!document.querySelector('#results-panel-people button.person')", 15000);
  await clickText('#results-panel-people button.person', person);
  await waitFor(page, "!!document.querySelector('anotoki-drawer app-response-view')", 15000);
  await sleep(500);
  return text('anotoki-drawer app-response-view .read-in');
}
expect('the admin area: Zuzana read the survey in Slovak', (await readIn(teaId, ZUZANA.username)) === 'Read in Slovak', await text('anotoki-drawer app-response-view .read-in'));
expect(
  '... and her answer is shown in the language the survey is written in',
  (await texts('anotoki-drawer app-response-view .option.is-chosen .option-label')).some((label) => label.startsWith('Tea')),
  JSON.stringify(await texts('anotoki-drawer app-response-view .option.is-chosen .option-label')),
);
await screenshot('admin-read-in-slovak');
expect(
  'the admin area: Nina, who changed to English before she sent, read it in English',
  (await readIn(teaId, NINA.username)) === 'Read in English',
  await text('anotoki-drawer app-response-view .read-in'),
);
expect(
  'the admin area: the survey with no Slovak was read in English, on her Slovak page too',
  (await readIn(surveyId, NINA.username)) === 'Read in English',
  await text('anotoki-drawer app-response-view .read-in'),
);

// ── A text left untranslated: Slovak readers get the survey whole in English ──
await go(`/admin/surveys/${teaId}/edit`);
await waitFor(page, "!!document.querySelector('app-editor-languages .tab') && !!document.querySelector('#survey-title')", 15000);
// A question with text is folded when the survey is opened again.
await js("(() => { const summary = document.querySelector('app-question-editor .summary'); if (summary.getAttribute('aria-expanded') !== 'true') summary.click(); return true; })()");
await sleep(1000);
expect('a third option, written in English only', (await clickText('app-options-editor .adds button', 'Add an option')) === true);
await sleep(400);
await focus('app-options-editor .option-input', 2);
await typeText('Neither');
await saved();
const MEANWHILE = 'This survey is open: until every text is translated, readers of Slovak see it in English.';
expect(
  'the tab counts the new text, and says what readers of Slovak get meanwhile: 7 / 8, shown in English',
  (await editorTabs()) === 'English main | Slovak 7 / 8 shown in English' &&
    (await js("[...document.querySelectorAll('app-editor-languages .tab')].find((tab) => tab.textContent.includes('Slovak'))?.getAttribute('title')")) === MEANWHILE,
  `${await editorTabs()} / ${await js("[...document.querySelectorAll('app-editor-languages .tab')].find((tab) => tab.textContent.includes('Slovak'))?.getAttribute('title')")}`,
);
const openAlert = (await texts('app-survey-editor anotoki-alert')).find((words) => words.includes('This survey is open, and has problems'));
expect(
  'the editor says the open survey has a problem, which, and what it means: by name, the readers of Slovak see it in English',
  !!openAlert &&
    openAlert.includes('People are taking it as it is now.') &&
    openAlert.includes('Until every text is translated, readers of Slovak see this survey in English.') &&
    same(await texts('app-editor-outline .problem'), ['Slovak: question 1 has 1 text to translate.']),
  `${openAlert} ${JSON.stringify(await texts('app-editor-outline .problem'))}`,
);
expect('... and nothing about a question being skipped: every question can be answered, a text is missing', !openAlert?.includes('skipped'), openAlert);
expect(
  'an open survey: the list of problems, and the Editor tab\'s count, say it is open - not "before it opens"',
  (await text('app-editor-outline #problems-title')) === '1 to fix - the survey is open' && (await problemsCount()) === '1 to fix - the survey is open',
  `${await text('app-editor-outline #problems-title')} / ${await problemsCount()}`,
);
await screenshot('editor-open-untranslated-1280', true);
// On the translation's own tab: the banner, and the bar that stays in view, say the same.
await clickText('app-editor-languages .tab', 'Slovak');
await waitFor(page, "!!document.querySelector('app-survey-editor .translating-meanwhile')", 15000);
const translatingBanner = (await texts('app-survey-editor anotoki-alert')).find((words) => words.includes('You are translating this survey into Slovak'));
expect(
  'the Slovak tab: the banner and the bar in view say what readers get until the text is written',
  translatingBanner?.includes(MEANWHILE) && (await text('app-survey-editor .translating-meanwhile')) === 'Readers see English until all are',
  `${translatingBanner} / ${await text('app-survey-editor .translating-meanwhile')}`,
);
await viewport(390);
await sleep(500);
await expectBar('the editor, an open survey with a text untranslated, 390 px');
expect(
  '390 px: the tabs and the bar hold what they say - nothing is cut off',
  await js(
    "[...document.querySelectorAll('app-editor-languages .tab, app-editor-languages .tag, app-survey-editor .translating, app-survey-editor .translating-meanwhile')].every((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 0.5; })",
  ),
);
await screenshots('editor-open-untranslated-390');
await viewport(1280);
await sleep(400);

await viewport(360);
await go('/?lang=sk');
await signInAs(PAT, SK);
const later = await listed();
expect('home, Slovak: the survey with one text untranslated is listed in English, and says so', same(later[teaSlug], ['Tea or coffee?', 'en', 'Jazyk: English']), JSON.stringify(later[teaSlug]));
await go(`/${teaSlug}`);
await waitFor(page, "!!document.querySelector('.start button')", 15000);
expect(
  'one text untranslated: the welcome is whole in English, with the note',
  (await text('app-survey-hero h1')) === 'Tea or coffee?' &&
    (await text('app-take-survey .intro'))?.startsWith('Thank you for taking a few minutes') &&
    (await text('app-take-survey .fact-language')) === 'Jazyk: English' &&
    same(await marked('app-take-survey'), ['title: en', 'intro rich: en', 'span: en']),
  `${await text('app-survey-hero h1')} / ${await text('app-take-survey .fact-language')} / ${JSON.stringify(await marked('app-take-survey'))}`,
);
await screenshots('sk-360-untranslated-welcome');
await clickText('.start button', 'Začať prieskum');
await sleep(500);
await pick('male');
await pick('18-24');
await clickText('button[type=submit]', 'Ďalej');
await sleep(600);
expect(
  'one text untranslated: the step is whole in English too - no Slovak text beside the English ones',
  (await text('app-take-survey .step-heading')) === 'Your cup' &&
    (await text('app-question-block .text')) === 'Which do you drink in the morning?' &&
    same(await texts('app-question-block .label'), ['Tea', 'Coffee', 'Neither']) &&
    same(await marked('app-take-survey'), ['title: en', 'step-heading: en', 'text rich: en', 'label: en', 'label: en', 'label: en']),
  `${await text('app-take-survey .step-heading')} / ${JSON.stringify(await texts('app-question-block .label'))} / ${JSON.stringify(await marked('app-take-survey'))}`,
);
expect(
  "... with the site's own words in Slovak around them",
  (await pageLanguage()) === 'sk' && (await text('app-survey-hero .where'))?.includes('Krok 2 / 2') && (await text('button[type=submit]'))?.includes('Odoslať odpovede'),
  `${await pageLanguage()}, ${await text('app-survey-hero .where')} / ${await text('button[type=submit]')}`,
);
await expectBar('Slovak, 360 px, a survey with a text untranslated');
await expectNoKeys('Slovak, a survey with a text untranslated');
await screenshots('sk-360-untranslated-step');

// ── The author saves over a translator's save: the translator's texts stay ──
// The author has the survey open in the editor. Meanwhile somebody else saves it - the translator, who writes the
// missing Slovak text and rewords the Slovak title. Here that save is made through the API, as another tab or
// another person's browser makes it: to the revision the server has, with the token of the page (never printed).
await viewport(1280);
await signInAs(OWNER, SK);
await go(`/admin/surveys/${teaId}/edit`);
await waitFor(page, "!!document.querySelector('app-editor-languages .tab') && !!document.querySelector('#survey-title')", 15000);
await js("(() => { const summary = document.querySelector('app-question-editor .summary'); if (summary.getAttribute('aria-expanded') !== 'true') summary.click(); return true; })()");
await sleep(1000);
const asOwner = async (method, path, body) => {
  const token = await js("JSON.parse(localStorage.getItem(Object.keys(localStorage).find((name) => name.startsWith('anotoki-auth:')))).access_token");
  return fetch(origin + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
};
const teaAsSaved = async () => (await (await asOwner('GET', `/api/admin/surveys/${teaId}`)).json()).survey;
const before = await teaAsSaved();
const cup = before.steps[0].questions[0];
const neither = cup.options[2];
const THEIR_TITLE = 'Čaj, alebo káva?';
const THEIR_OPTION = 'Ani jedno';
const theirSlovak = {
  ...before.translations.sk,
  title: THEIR_TITLE,
  questions: {
    ...before.translations.sk.questions,
    [cup.id]: { ...before.translations.sk.questions[cup.id], options: { ...before.translations.sk.questions[cup.id].options, [neither.id]: { label: THEIR_OPTION } } },
  },
};
const theirSave = await asOwner('PUT', `/api/admin/surveys/${teaId}`, { revision: before.revision, survey: { ...before, translations: { ...before.translations, sk: theirSlovak } } });
expect(
  'meanwhile a translator saves the survey: the missing Slovak text, and a new Slovak title',
  theirSave.status === 200 && neither.label === 'Neither',
  `${theirSave.status}${theirSave.status === 200 ? '' : ' ' + (await theirSave.text()).slice(0, 300)}, the third option: ${neither.label}`,
);
// The author, whose page knows nothing of it, rewords the third option in English.
await js("(() => { const el = document.querySelectorAll('app-options-editor .option-input')[2]; el.scrollIntoView({ block: 'center' }); el.focus(); el.select(); return true; })()");
await sleep(150);
await typeText('Neither of them');
await waitFor(page, "[...document.querySelectorAll('app-survey-editor anotoki-alert')].some((alert) => alert.textContent.includes('Somebody else has saved this survey meanwhile'))", 15000);
await sleep(300);
const conflict = (await texts('app-survey-editor anotoki-alert')).find((words) => words.includes('Somebody else has saved this survey meanwhile'));
// What "Save mine over it" keeps of theirs: the notice, and the question before it is done.
const MERGED_NOTICE =
  'That loses their changes to the questions and the settings; their translations stay as they saved them, except the texts you changed here and the texts of what they removed or reworded, which stay as you have them.';
const MERGED_QUESTION =
  'Their changes to the questions and the settings are lost. Their translations stay as they saved them, except the texts you changed here and the texts of what they removed or reworded, which stay as you have them.';
expect(
  "the author's save is a conflict, and the editor says what each way out keeps and loses",
  conflict?.includes('Your latest changes are not saved: they were made to an older version.') &&
    conflict?.includes(MERGED_NOTICE) &&
    !conflict?.includes('removed here') &&
    conflict?.includes('Take the saved version') &&
    conflict?.includes('Save mine over it'),
  conflict,
);
await js("window.scrollTo({ top: 0, behavior: 'instant' }); true");
await screenshot('editor-conflict-1280');
await viewport(390);
await sleep(500);
await expectBar('the editor in a conflict, 390 px');
await screenshots('editor-conflict-390', false);
await viewport(1280);
await sleep(400);
expect('save mine over it', (await clickText('app-survey-editor anotoki-alert button', 'Save mine over it')) === true);
await waitFor(page, "!!document.querySelector('dialog[open]')", 15000);
await sleep(300);
const overTheirs = await question();
expect('asked first, in the words of what that loses and what it keeps', overTheirs?.title === 'Save your version over theirs?' && overTheirs?.message === MERGED_QUESTION, JSON.stringify(overTheirs));
await screenshot('editor-conflict-asked-1280');
await clickText('dialog[open] button', 'Save mine');
await saved();
await sleep(400);
const after = await teaAsSaved();
expect(
  "saved over theirs: the author's English text is in, and the translator's Slovak texts are still there",
  after.steps[0].questions[0].options[2].label === 'Neither of them' &&
    after.translations.sk.title === THEIR_TITLE &&
    after.translations.sk.questions[cup.id].options[neither.id]?.label === THEIR_OPTION &&
    after.revision === before.revision + 2,
  `${after.steps[0].questions[0].options[2].label} / ${after.translations.sk.title} / ${after.translations.sk.questions[cup.id].options[neither.id]?.label} / revision ${before.revision} -> ${after.revision}`,
);
expect(
  'the editor has them too: the conflict is settled, Slovak is whole again, and nothing says "shown in English"',
  (await editorTabs()) === 'English main | Slovak 8 / 8' &&
    !(await texts('app-survey-editor anotoki-alert')).some((words) => words.includes('Somebody else has saved') || words.includes('This survey is open, and has problems')),
  `${await editorTabs()} / ${JSON.stringify((await texts('app-survey-editor anotoki-alert')).map((words) => words.slice(0, 50)))}`,
);
expect(
  'an open survey with nothing to fix: "Nothing to fix" - not "Ready to open" - and no count on the Editor tab',
  (await text('app-editor-outline #problems-title')) === 'Nothing to fix' && (await problemsCount()) === null,
  `${await text('app-editor-outline #problems-title')} / ${await problemsCount()}`,
);
await clickText('app-editor-languages .tab', 'Slovak');
await sleep(800);
const slovakTitle = await js("[...document.querySelectorAll('app-translated-text input[data-place]')].find((field) => JSON.parse(field.getAttribute('data-place'))[0] === 'title')?.value ?? null");
expect("the Slovak tab shows the translator's title", slovakTitle === THEIR_TITLE, slovakTitle);
await screenshot('editor-conflict-settled-1280', true);
// And a reader of Slovak gets the survey in Slovak again - under the translator's title.
await go(`/${teaSlug}`);
await waitFor(page, "!!document.querySelector('app-take-survey app-survey-hero h1')", 15000);
expect(
  "a Slovak reader gets the survey in Slovak again, with the translator's title",
  (await pageLanguage()) === 'sk' && (await text('app-survey-hero h1')) === THEIR_TITLE && same(await marked('app-take-survey'), []),
  `${await pageLanguage()}, ${await text('app-survey-hero h1')}, ${JSON.stringify(await marked('app-take-survey'))}`,
);

// A second question for the survey - with an "Other" of its own - and its Slovak, saved through the API like the
// translator's save above: the stages below need a question to remove, and an "Other" to leave empty.
const MILK = {
  ...cup,
  id: 'milk',
  text: '<p>What goes into it?</p>',
  images: [],
  required: true,
  placeholder: '',
  options: [
    { id: 'milk-milk', label: 'Milk', other: false, images: [] },
    { id: 'milk-sugar', label: 'Sugar', other: false, images: [] },
    { id: 'milk-other', label: 'Something else', other: true, images: [] },
  ],
};
const MILK_SK = {
  text: '<p>Čo si do neho dávate?</p>',
  placeholder: '',
  options: { 'milk-milk': { label: 'Mlieko' }, 'milk-sugar': { label: 'Cukor' }, 'milk-other': { label: 'Niečo iné' } },
  images: {},
};
const withoutMilk = await teaAsSaved();
const milkAdded = await asOwner('PUT', `/api/admin/surveys/${teaId}`, {
  revision: withoutMilk.revision,
  survey: {
    ...withoutMilk,
    steps: [{ ...withoutMilk.steps[0], questions: [...withoutMilk.steps[0].questions, MILK] }, ...withoutMilk.steps.slice(1)],
    translations: { ...withoutMilk.translations, sk: { ...withoutMilk.translations.sk, questions: { ...withoutMilk.translations.sk.questions, milk: MILK_SK } } },
  },
});
expect('a second question, with an "Other", in English and in Slovak', milkAdded.status === 200, `${milkAdded.status}${milkAdded.status === 200 ? '' : ' ' + (await milkAdded.text()).slice(0, 300)}`);

// ── A preview from the editor's main tab, by somebody who reads the site in Slovak ──
// The address names no language: the preview shows the survey as it is written - not in the page's language, text
// by text - and "Back to the editor" names no tab, so the editor opens on the main one.
await go(`/admin/surveys/${teaId}/edit`);
await waitFor(page, "!!document.querySelector('app-editor-languages .tab.is-active') && !!document.querySelector('#survey-title')", 15000);
await sleep(500);
expect(
  'the editor on its main tab: its Preview names no language',
  (await js("document.querySelector('app-survey-header a[href*=preview]')?.getAttribute('href')")) === `/preview/${teaId}` &&
    (await text('app-editor-languages .tab.is-active'))?.startsWith('English'),
  `${await js("document.querySelector('app-survey-header a[href*=preview]')?.getAttribute('href')")} / ${await text('app-editor-languages .tab.is-active')}`,
);
await clickText('app-survey-header a', 'Preview');
await waitFor(page, "location.pathname.startsWith('/preview/') && !!document.querySelector('app-take-survey app-survey-hero h1')", 15000);
await sleep(500);
const previewBack = await js("[...document.querySelectorAll('app-take-survey a')].filter((a) => a.textContent.includes('Back to the editor')).map((a) => a.getAttribute('href'))");
expect(
  "the preview from the main tab, on a Slovak page: the survey as it is written - in English, and said to be - the site's words Slovak",
  (await pageLanguage()) === 'sk' &&
    (await text('app-survey-hero h1')) === 'Tea or coffee?' &&
    (await text('app-take-survey .fact-language')) === 'Jazyk: English' &&
    (await marked('app-take-survey')).includes('title: en') &&
    (await text('.start button')) === 'Začať prieskum',
  `${await pageLanguage()}, ${await text('app-survey-hero h1')} / ${await text('app-take-survey .fact-language')} / ${JSON.stringify(await marked('app-take-survey'))}`,
);
expect('... and its way back names no tab', previewBack.length > 0 && previewBack.every((href) => href === `/admin/surveys/${teaId}/edit`), JSON.stringify(previewBack));
await viewport(390);
await sleep(400);
await expectBar('the preview from the main tab, Slovak, 390 px');
await expectNoKeys('Slovak, the preview from the main tab');
await screenshots('sk-390-preview-main');
await viewport(1280);
await sleep(400);
await clickText('app-take-survey a', 'Back to the editor');
await waitFor(page, "location.pathname.endsWith('/edit') && !!document.querySelector('app-editor-languages .tab.is-active')", 15000);
await sleep(500);
expect(
  'back in the editor: on the main tab',
  (await text('app-editor-languages .tab.is-active'))?.startsWith('English') && (await js('location.search')) === '',
  `${await text('app-editor-languages .tab.is-active')} / ${await js('location.search')}`,
);

// ── Answers sent to an address the survey has left ──────────────────────────
// Pat started this survey on a Slovak page (above) and comes back to it. While Pat is on its last step, the owner
// changes its address - through the API, with the owner's token taken before Pat signs in (it lasts ten minutes).
// Pat's answers go to the old address: the page says so, and becomes "There is no survey here"; at the new address
// the answers are offered again.
const ownerToken = await js("JSON.parse(localStorage.getItem(Object.keys(localStorage).find((name) => name.startsWith('anotoki-auth:')))).access_token");
const asTheOwner = (method, path, body) =>
  fetch(origin + path, { method, headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
await viewport(390);
await signInAs(PAT, SK);
await go(`/${teaSlug}`);
await waitFor(page, "!!document.querySelector('app-take-survey anotoki-alert')", 15000);
expect('Pat, on a Slovak page, is offered to carry on', (await text('app-take-survey anotoki-alert'))?.includes('Pokračovať tam, kde ste prestali?'), await text('app-take-survey anotoki-alert'));
await clickText('app-take-survey anotoki-alert button', 'Pokračovať');
await sleep(500);
await clickText('app-question-block label', 'Čaj');
await sleep(200);
await pick('milk-other');
await sleep(300);
await clickText('button[type=submit]', 'Odoslať odpovede');
await sleep(600);
const otherError = await texts('app-question-block .error');
expect(
  'Slovak: "Other" chosen and its field left empty - asked for the answer, by the option\'s label',
  same(otherError, ['Pri možnosti „Niečo iné“ napíšte, prosím, vlastnú odpoveď.']),
  JSON.stringify(otherError),
);
await expectBar('Slovak, 390 px, an "Other" left empty');
await expectNoKeys('Slovak, an "Other" left empty');
await screenshots('sk-390-write-other');
await focus('app-question-block .other input');
await typeText('Med');
const beforeMove = (await (await asTheOwner('GET', `/api/admin/surveys/${teaId}`)).json()).survey;
const MOVED = 'tea-or-coffee-today';
const moved = await asTheOwner('PUT', `/api/admin/surveys/${teaId}`, { revision: beforeMove.revision, survey: { ...beforeMove, slug: MOVED } });
expect("meanwhile the owner changes the survey's address", moved.status === 200, `${moved.status}${moved.status === 200 ? '' : ' ' + (await moved.text()).slice(0, 300)}`);
await clickText('button[type=submit]', 'Odoslať odpovede');
await waitFor(page, "!!document.querySelector('app-take-survey .message-heading')", 15000);
await sleep(400);
const GONE_SK =
  'Tento prieskum sa už na tejto adrese nenachádza, takže odpovede sa nepodarilo odoslať. Zostávajú uložené v tomto prehliadači – ak sa prieskum presunul, otvorte ho zo zoznamu prieskumov a pokračujte.';
expect('sent to the address it had: the toast says the survey is not there any more, and that the answers are kept', (await toasts()).includes(GONE_SK), JSON.stringify(await toasts()));
expect(
  '... and the page is "There is no survey here", with its way to the open surveys',
  (await text('app-take-survey .message-heading')) === 'Tu nie je žiadny prieskum' && (await text('app-take-survey'))?.includes('Zobraziť otvorené prieskumy'),
  await text('app-take-survey'),
);
await expectBar('Slovak, 390 px, the survey gone from its address');
await expectNoKeys('Slovak, the survey gone from its address');
await screenshots('sk-390-survey-gone', false);
await dismissToasts();
await go(`/${MOVED}`);
await waitFor(page, "!!document.querySelector('app-take-survey anotoki-alert')", 15000);
const offeredAgain = await text('app-take-survey anotoki-alert');
expect(
  'at the new address the answers are offered again',
  ['Pokračovať tam, kde ste prestali?', 'a dostali ste sa po krok 2 / 2'].every((part) => offeredAgain?.includes(part)),
  offeredAgain,
);
await screenshots('sk-390-survey-moved-carry-on');
await clickText('app-take-survey anotoki-alert button', 'Pokračovať');
await sleep(500);
expect(
  '... every answer as it was left, the words for "Other" too',
  same(await chosenLabels(), ['Čaj', 'Niečo iné']) && (await js("document.querySelector('app-question-block .other input')?.value")) === 'Med',
  `${JSON.stringify(await chosenLabels())} / ${await js("document.querySelector('app-question-block .other input')?.value")}`,
);
await clickText('button[type=submit]', 'Odoslať odpovede');
await waitFor(page, "!!document.querySelector('.done-heading')", 15000);
expect('... and sent from there', (await text('.done-heading')) === 'Ďakujeme!', await text('.done-heading'));

// ── Their version removed a question I had translated: "Save mine over it" keeps my translation of it ──
await viewport(1280);
await signInAs(OWNER, SK);
await go(`/admin/surveys/${teaId}/edit`);
await waitFor(page, "!!document.querySelector('app-editor-languages .tab') && !!document.querySelector('#survey-title')", 15000);
await js("(() => { const summary = document.querySelector('app-question-editor .summary'); if (summary.getAttribute('aria-expanded') !== 'true') summary.click(); return true; })()");
await sleep(1000);
const beforeRemoval = await teaAsSaved();
const removedThere = await asOwner('PUT', `/api/admin/surveys/${teaId}`, {
  revision: beforeRemoval.revision,
  survey: { ...beforeRemoval, steps: [{ ...beforeRemoval.steps[0], questions: beforeRemoval.steps[0].questions.filter((item) => item.id !== MILK.id) }, ...beforeRemoval.steps.slice(1)] },
});
const afterRemoval = await teaAsSaved();
expect(
  'meanwhile somebody else saves the survey without its second question - and so without its Slovak',
  removedThere.status === 200 && afterRemoval.steps[0].questions.length === 1 && !afterRemoval.translations.sk.questions[MILK.id],
  `${removedThere.status}, ${afterRemoval.steps[0].questions.length} question(s)`,
);
await js("(() => { const el = document.querySelectorAll('app-options-editor .option-input')[2]; el.scrollIntoView({ block: 'center' }); el.focus(); el.select(); return true; })()");
await sleep(150);
await typeText('Neither, thanks');
await waitFor(page, "[...document.querySelectorAll('app-survey-editor anotoki-alert')].some((alert) => alert.textContent.includes('Somebody else has saved this survey meanwhile'))", 15000);
await sleep(300);
const removedConflict = (await texts('app-survey-editor anotoki-alert')).find((words) => words.includes('Somebody else has saved this survey meanwhile'));
expect(
  'the next change here is a conflict, and the notice says the texts of what they removed stay as they are here',
  removedConflict?.includes(MERGED_NOTICE) && removedConflict?.includes('Save mine over it'),
  removedConflict,
);
await clickText('app-survey-editor anotoki-alert button', 'Save mine over it');
await waitFor(page, "!!document.querySelector('dialog[open]')", 15000);
await sleep(300);
expect('... asked first, in the same words', (await question())?.message === MERGED_QUESTION, JSON.stringify(await question()));
await clickText('dialog[open] button', 'Save mine');
await saved();
await sleep(400);
const keptMine = await teaAsSaved();
const keptLabels = Object.values(keptMine.translations.sk.questions[MILK.id]?.options ?? {})
  .map((option) => option.label)
  .sort();
expect(
  'saved mine over theirs: the question they removed is back - with my Slovak texts of it - and so is my English change',
  keptMine.steps[0].questions.some((item) => item.id === MILK.id) &&
    keptMine.translations.sk.questions[MILK.id]?.text === MILK_SK.text &&
    same(keptLabels, ['Cukor', 'Mlieko', 'Niečo iné']) &&
    keptMine.steps[0].questions[0].options[2].label === 'Neither, thanks',
  `${keptMine.steps[0].questions.map((item) => item.id).join(', ')} / ${JSON.stringify(keptMine.translations.sk.questions[MILK.id] ?? null)}`,
);
expect('... and the editor has Slovak whole', /^English main \| Slovak (\d+) \/ \1$/.test(await editorTabs()), await editorTabs());

// ── Mine cannot be saved over theirs: written in another language, both translated ──
// The first survey, open in the editor. Meanwhile somebody else says it is written in Slovak and translates it into
// English (it had no translation, so the server takes that); here Slovak is added. The server takes no survey that
// changes its language while both hold translations, so "Save mine over it" is not offered at all.
await go(`/admin/surveys/${surveyId}/edit`);
await waitFor(page, "!!document.querySelector('app-editor-languages .tab') && !!document.querySelector('#survey-title')", 15000);
await sleep(500);
const genshinAsSaved = async () => (await (await asOwner('GET', `/api/admin/surveys/${surveyId}`)).json()).survey;
const genshin = await genshinAsSaved();
const inSlovak = await asOwner('PUT', `/api/admin/surveys/${surveyId}`, {
  revision: genshin.revision,
  survey: { ...genshin, language: 'sk', translations: { en: { title: genshin.title, intro: '', thanks: '', steps: {}, questions: {} } } },
});
expect(
  'meanwhile somebody else says the first survey is written in Slovak, and translates it into English',
  inSlovak.status === 200,
  `${inSlovak.status}${inSlovak.status === 200 ? '' : ' ' + (await inSlovak.text()).slice(0, 300)}`,
);
await js("(() => { const s = document.querySelector('app-editor-languages .add-select'); s.value = 'sk'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()");
await waitFor(page, "[...document.querySelectorAll('app-survey-editor anotoki-alert')].some((alert) => alert.textContent.includes('Somebody else has saved this survey meanwhile'))", 15000);
await sleep(300);
const refusedNotice = (await texts('app-survey-editor anotoki-alert')).find((words) => words.includes('Somebody else has saved this survey meanwhile'));
expect(
  'Slovak added here: a conflict in which mine is not offered - the notice says why, and what to do first',
  refusedNotice?.includes('Yours cannot be saved over it as it is: the saved version is written in Slovak and yours in English, and both have translations') &&
    refusedNotice?.includes('Remove your translations first') &&
    refusedNotice?.includes('Take the saved version') &&
    !refusedNotice?.includes('Save mine over it'),
  refusedNotice,
);
await js("window.scrollTo({ top: 0, behavior: 'instant' }); true");
await screenshot('editor-conflict-refused-1280');
await viewport(390);
await sleep(500);
await expectBar('the editor, mine not offered, 390 px');
await screenshots('editor-conflict-refused-390', false);
await viewport(1280);
await sleep(400);
expect('take the saved version', (await clickText('app-survey-editor anotoki-alert button', 'Take the saved version')) === true);
await sleep(800);
await dismissToasts();
// Put back for the rest of the check: written in English, with no translation.
const genshinNow = await genshinAsSaved();
const putBack = await asOwner('PUT', `/api/admin/surveys/${surveyId}`, { revision: genshinNow.revision, survey: { ...genshinNow, language: 'en', translations: {} } });
expect('the first survey put back: in English, not translated', putBack.status === 200, `${putBack.status}`);

// ── An open survey whose last day is over: nobody reads it now, so nothing is said of its readers ──
// The last day set to yesterday (by this computer's clock, which is the browser's), and an option added in English
// only: the survey is still "open" in the database, closed for everybody - the header says Closed.
const yesterday = (() => {
  const day = new Date();
  day.setDate(day.getDate() - 1);
  return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
})();
const teaNow = await teaAsSaved();
const pastDay = await asOwner('PUT', `/api/admin/surveys/${teaId}`, {
  revision: teaNow.revision,
  survey: {
    ...teaNow,
    closesOn: yesterday,
    steps: [
      {
        ...teaNow.steps[0],
        questions: teaNow.steps[0].questions.map((item, index) => (index === 0 ? { ...item, options: [...item.options, { id: 'water', label: 'Water', other: false, images: [] }] } : item)),
      },
      ...teaNow.steps.slice(1),
    ],
  },
});
expect("the tea survey's last day set to yesterday, and an option added in English only", pastDay.status === 200 && teaNow.status === 'open', `${pastDay.status}, ${teaNow.status}`);
await go(`/admin/surveys/${teaId}/edit`);
await waitFor(page, "!!document.querySelector('app-editor-languages .tab') && !!document.querySelector('#survey-title')", 15000);
await sleep(500);
expect('its last day over: the header says Closed', (await text('app-survey-header anotoki-badge')) === 'Closed', await text('app-survey-header anotoki-badge'));
expect(
  '... and nothing says what its readers see: no "open, and has problems", no "shown in English" on the tab',
  !(await texts('app-survey-editor anotoki-alert')).some((words) => words.includes('This survey is open')) && /^English main \| Slovak \d+ \/ \d+$/.test(await editorTabs()),
  `${await editorTabs()} / ${JSON.stringify((await texts('app-survey-editor anotoki-alert')).map((words) => words.slice(0, 60)))}`,
);
expect(
  "a closed survey: the list of problems, and the Editor tab's count, say what to fix before it reopens",
  (await text('app-editor-outline #problems-title')) === '1 to fix before it reopens' && (await problemsCount()) === '1 to fix before it reopens',
  `${await text('app-editor-outline #problems-title')} / ${await problemsCount()}`,
);
await screenshot('editor-past-last-day-1280', true);
await clickText('app-editor-languages .tab', 'Slovak');
await waitFor(page, "[...document.querySelectorAll('app-survey-editor anotoki-alert')].some((alert) => alert.textContent.includes('You are translating this survey into Slovak'))", 15000);
await sleep(400);
const pastBanner = (await texts('app-survey-editor anotoki-alert')).find((words) => words.includes('You are translating this survey into Slovak'));
expect(
  'its Slovak tab: the banner says what holds for it now, and the bar says nothing of readers',
  pastBanner?.includes('Until every text is translated the survey cannot be opened, and one that is open already is shown in English.') &&
    !pastBanner?.includes('This survey is open') &&
    !(await js("!!document.querySelector('app-survey-editor .translating-meanwhile')")),
  pastBanner,
);
await viewport(390);
await sleep(500);
await expectBar('the editor, an open survey past its last day, 390 px');
await screenshots('editor-past-last-day-390');

// ═══ A database behind the code: the family's page, and the Migrations page ═══
// A release that brings migrations nobody has applied yet - this one's (anotoki-lib 0.4.1): the database's record
// says the site's 011 and 012 have not run, nor the anotoki library's files of it (anotoki_translations' 003 and 004,
// anotoki_people's 001, which run after the site's), and neither has the site's old 004 - their rows taken out of
// `migrations`. 004 cannot run again - its column is there - so the first Apply stops on it (each of the others can
// run again, as on an installed site where it never ran). And one of the sign-in's words is as it was before 012:
// under the site's own key (signIn.notCompleted), reworded by the site's owner - which 012 moves under the library's
// key (anotoki.signIn.notCompleted). The Apply brings it there, and the screen of a failed sign-in says it.
// The backend's gate (the anotoki family's, @anotoki/lib) answers 503 update_pending to everything but signing in,
// the strings, the health check, the Migrations page's routes and the error log's and backups' (an ADMIN's). What
// people see is the family's page: nobody signed in and signed-in people "The site is being updated" in their
// language - no error, no code, nothing to press but a quiet Sign in while nobody is signed in, and nobody sent to
// the IAM; that Sign in goes through the IAM and back to the same address; an EDITOR gets the same; the site's ADMIN
// "A database update is waiting" and the way to the Migrations page, which works - signed out at its address, Sign in
// comes back to it - an Apply that stops at a failing file with the database's whole error (a backup of the database
// made first), then one that brings the site back where it stands, its strings read again.
const FILE_004 = '004_response_language.sql';
const FILE_011 = '011_people.sql';
const FILE_012 = '012_sign_in_words.sql';
/** The library's files of this release, as the record names them (the set, then the file). */
const LIBRARY_FILES = ['anotoki_translations/003_sign_in_words.sql', 'anotoki_translations/004_feedback_words.sql', 'anotoki_people/001_people.sql'];
/** How the owner had reworded a sign-in that was not completed, before 012. */
const OWNERS_NOT_COMPLETED = 'Signing in did not finish. Try once more - or ask whoever sent you the survey.';
sql(`DELETE FROM migrations WHERE filename IN ('${[FILE_004, FILE_011, FILE_012, ...LIBRARY_FILES].join("', '")}')`);
sql("DELETE FROM translation_keys WHERE name = 'anotoki.signIn.notCompleted'");
sql("INSERT INTO translation_keys (name, description) VALUES ('signIn.notCompleted', 'Toast after a sign-in that came back as access_denied.')");
sql(`INSERT INTO translations (key_name, language_code, value) VALUES ('signIn.notCompleted', 'en', '${OWNERS_NOT_COMPLETED}'), ('signIn.notCompleted', 'sk', '${SK.notCompleted}')`);
const behindStrings = await (await fetch(`${origin}/api/translations/en`)).json();
expect(
  "an update waiting: the strings answer all the same - the sign-in's word under the site's old key, as its owner worded it, and not yet under the library's",
  behindStrings.values?.['signIn.notCompleted'] === OWNERS_NOT_COMPLETED && !('anotoki.signIn.notCompleted' in (behindStrings.values ?? {})),
  JSON.stringify(behindStrings.values?.['signIn.notCompleted'] ?? null),
);
const behindResponse = await fetch(`${origin}/api/surveys`);
const behindAnswer = await behindResponse.json();
const behindConfig = await (await fetch(`${origin}/api/auth/config`)).json();
const behindStatus = await (await fetch(`${origin}/api/site-status`)).json();
expect(
  "an update waiting: the API answers 503 update_pending, Retry-After 60 - but the sign-in's settings answer, and the status says so",
  behindResponse.status === 503 &&
    behindAnswer.code === 'update_pending' &&
    behindResponse.headers.get('retry-after') === '60' &&
    typeof behindConfig.issuer === 'string' &&
    !('update' in behindConfig) &&
    behindStatus.state === 'update_pending',
  `${behindResponse.status} ${JSON.stringify(behindAnswer)} / ${JSON.stringify(behindConfig)} / ${JSON.stringify(behindStatus)}`,
);
/** The site holds a session (the SDK's stored tokens) - with no top bar to ask, on the family's page. */
const HOLDS_SESSION = "Object.keys(localStorage).some((name) => name.startsWith('anotoki-auth:') && !!JSON.parse(localStorage.getItem(name) || 'null')?.access_token)";
const migrationsLink = () => js("[...document.querySelectorAll('a')].filter((a) => a.getAttribute('href') === '/admin/migrations').length");
const setupLink = () => js("[...document.querySelectorAll('a')].filter((a) => (a.getAttribute('href') ?? '').includes('setup')).length");
/** The family's page drawn instead of the site (<anotoki-site-status>): its heading, and what there is to press on it. */
const statusHeading = () => text('anotoki-site-status h1');
const statusActions = async () => (await texts('anotoki-site-status button, anotoki-site-status a')).join(' | ');
/**
 * The site's frames counted - the top bar, the family's footer (<anotoki-site-footer>, its legal links), the layouts
 * that hold them: a page drawn instead of the site is bare, none of them (the gate makes no routed frame while it
 * shows its page).
 */
const framesDrawn = () =>
  js(
    "document.querySelectorAll('app-top-bar, anotoki-top-bar, anotoki-shell, anotoki-site-footer, anotoki-legal-links, app-participant-layout, app-admin-layout, app-legal-layout, header, footer').length",
  );
/** The family's footer's first row as it is read - each part's words and the dots between them - under `frame`. */
const footerRow = (frame) => texts(`${frame} anotoki-site-footer .anotoki-site-footer__row > *`);
/** What nobody but the site's ADMIN may read there: the server's words, an error, a code, the setup page, the migrations - and no toast. */
const quiet = async () =>
  !/error|503|update_pending|not_set_up|setup|migration/i.test((await text('anotoki-site-status')) ?? '') &&
  (await js("document.querySelectorAll('anotoki-toast-host .anotoki-toast-host__toast').length")) === 0;
/**
 * What the site's API was asked since `from` (the page's own requests) beyond what the family's page and the sign-in
 * need while the site cannot run - where it stands, the sign-in's settings, the strings - and the routes in `open`
 * (the Migrations page's, for the site's ADMIN on it): anything else came from a page made behind the family's page,
 * which must never be made (the router outlet is the gate's template, made only while the gate shows the pages).
 * The site's own origin only: the stand-in IAM's `/api/oidc/...` and the visitor counter's `/api/send` (Umami, on
 * its own host) are other hosts' addresses.
 */
const askedBehind = (from, open = []) =>
  requested
    .slice(from)
    .filter((request, at) => requestedOrigins[from + at] === origin && /^[A-Z]+ \/api\//.test(request))
    .filter((request) => request !== 'GET /api/site-status' && request !== 'GET /api/auth/config' && !request.startsWith('GET /api/translations/') && !open.includes(request));
/**
 * Nobody signed in, opening `path` while the update waits: how many times the page went to the IAM's sign-in
 * meanwhile - none. Counted from the page's own requests (the stand-in's log also has the check's own questions).
 */
async function signedOutBehind(path) {
  await forgetSession();
  const from = requested.length;
  await go(path);
  await waitFor(page, "!!document.querySelector('anotoki-site-status h1')", 15000);
  await sleep(700);
  return requested.slice(from).filter((request) => request === 'GET /api/oidc/authorize').length;
}
/** The family's page's quiet Sign in, pressed as `user`: through the IAM - which works while the update waits - and back. */
async function signInThere(user, words) {
  await setIam({ user, deny: false });
  const pressed = await clickText('anotoki-site-status button', words);
  await waitFor(page, `${HOLDS_SESSION} && !!document.querySelector('anotoki-site-status h1, anotoki-migrations-page h1')`, 15000);
  await sleep(900);
  return pressed;
}

// Nobody signed in, in Slovak, on a phone.
await viewport(390);
const visitorTrips = await signedOutBehind('/?lang=sk');
expect(
  'an update waiting, nobody signed in, in Slovak: "being updated" in their language, bare - no top bar, no footer -, nobody sent to the IAM - no error, nothing to press but a quiet Sign in',
  visitorTrips === 0 &&
    (await statusHeading()) === 'Stránku práve aktualizujeme' &&
    (await text('anotoki-site-status p')) === 'O pár minút bude späť. Táto stránka sa obnoví sama.' &&
    (await statusActions()) === 'Prihlásiť sa' &&
    (await framesDrawn()) === 0 &&
    (await migrationsLink()) === 0 &&
    (await setupLink()) === 0 &&
    (await quiet()),
  `IAM trips ${visitorTrips} / ${await statusHeading()} / [${await statusActions()}] / frames ${await framesDrawn()}`,
);
await expectNoKeys('an update waiting, nobody signed in, in Slovak');
await expectNoSideways('an update waiting, 390 px');
await screenshots('sk-390-behind-visitor');

// A visitor of the site's own - the IAM's "Sign-in required" off, so the list of surveys would take them: the same
// page, and nothing of that list made behind it. (While sign-in is required the layout draws its signed-out card in
// place of any page, so only a visitor welcome shows what the gate makes.)
const welcomeOff = await signInRequired(false);
const welcomeFrom = requested.length;
await go('/?lang=sk');
await waitFor(page, "!!document.querySelector('anotoki-site-status h1')", 15000);
await sleep(900);
expect(
  "a visitor while the update waits, sign-in not required: the same page - and nothing of the open surveys behind it: the API asked only where the site stands, the sign-in's settings and the strings, and no toast",
  welcomeOff && (await statusHeading()) === 'Stránku práve aktualizujeme' && askedBehind(welcomeFrom).length === 0 && (await quiet()),
  `${await statusHeading()} / asked: ${askedBehind(welcomeFrom).join(', ')}`,
);
expect('"Sign-in required" on again', await signInRequired(true));

// Somebody taking surveys signs in from it: back at the same address, the same page - and nothing to press.
const patFrom = requested.length;
const patPressed = await signInThere(PAT, 'Prihlásiť sa');
expect(
  'its quiet Sign in: through the IAM and back to the same address - signed in now, the same page, bare, nothing to press',
  patPressed === true &&
    (await js('location.pathname')) === '/' &&
    (await statusHeading()) === 'Stránku práve aktualizujeme' &&
    (await statusActions()) === '' &&
    (await framesDrawn()) === 0 &&
    (await quiet()),
  `${patPressed} / ${await js('location.pathname')} / ${await statusHeading()} / [${await statusActions()}] / frames ${await framesDrawn()}`,
);
await screenshots('sk-390-behind-participant');
await viewport(1280);
await go('/?lang=en');
await waitFor(page, "!!document.querySelector('anotoki-site-status h1')", 15000);
await sleep(500);
expect('... and in English', (await statusHeading()) === 'The site is being updated' && (await statusActions()) === '' && (await quiet()), await statusHeading());
expect(
  "... and signed in, nothing of the page behind it either - the list of surveys is not made: the API asked only the status, the sign-in's settings and the strings",
  askedBehind(patFrom).length === 0,
  askedBehind(patFrom).join(', '),
);
await screenshot('en-1280-behind-participant');

// An EDITOR, at the Migrations page's address: the page everybody gets.
const edithTrips = await signedOutBehind('/admin/migrations');
const edithPressed = await signInThere(EDITH, 'Sign in');
expect(
  'an EDITOR, signed in at the Migrations page\'s address from the family\'s page: back there - "being updated", and no Migrations page',
  edithTrips === 0 &&
    edithPressed === true &&
    (await js('location.pathname')) === '/admin/migrations' &&
    (await statusHeading()) === 'The site is being updated' &&
    !(await js("!!document.querySelector('anotoki-migrations-page')")) &&
    (await migrationsLink()) === 0 &&
    (await framesDrawn()) === 0 &&
    (await quiet()),
  `${edithTrips} / ${await js('location.pathname')} / ${await statusHeading()} / [${await statusActions()}] / frames ${await framesDrawn()}`,
);
await screenshot('en-1280-behind-editor');

// The site's ADMIN, signed out at the Migrations page's address: Sign in there, and back to it - the Migrations page.
const ownerFrom = requested.length;
const ownerTrips = await signedOutBehind('/admin/migrations');
const ownerPressed = await signInThere(OWNER, 'Sign in');
/** How many files wait: the site's three, the library's three. */
const PENDING_COUNT = 3 + LIBRARY_FILES.length;
/** The Migrations page lists the files pending. */
const ALL_PENDING = `location.pathname === '/admin/migrations' && document.querySelectorAll('anotoki-migrations-page [data-pending] li').length === ${PENDING_COUNT}`;
await waitFor(page, ALL_PENDING, 15000);
await sleep(600);
/** The Pending card's rows, each as its children's words with a space between ("004_….sql pending"). */
const pendingRows = async () =>
  (await js("[...document.querySelectorAll('anotoki-migrations-page [data-pending] li')].map((row) => [...row.children].map((child) => child.textContent.trim()).join(' '))")).join(' | ');
// One list in the order the files run (anotoki-lib 0.4.0): the site's own by their names alone, the library's with their set.
const PENDING = [FILE_004, FILE_011, FILE_012, ...LIBRARY_FILES].map((file) => `${file} pending`).join(' | ');
const barLinks = async () => (await texts('app-top-bar .anotoki-top-bar__nav a')).join(' ');
expect(
  "a signed-out ADMIN: Sign in on the family's page, and back at the address - the Migrations page, the files pending in the order they will run, the site's before the library's, and in the bar the one page that works",
  ownerTrips === 0 && ownerPressed === true && (await pendingRows()) === PENDING && (await barLinks()) === 'Migrations' && (await js('document.title')).startsWith('Migrations · '),
  `${ownerTrips} / ${await pendingRows()} / bar: ${await barLinks()} / ${await js('document.title')}`,
);
// The site's pages for the ADMIN there, so the admin panel's frame round them: the bar, and the family's footer - the
// version and What's new, but no Feedback while the update waits (the server would refuse the message: 503).
expect(
  "... in the admin panel's frame: its bar and the family's footer under it, English - the version and What's new, no Feedback while the update waits",
  (await js("!!document.querySelector('app-admin-layout > app-top-bar') && !!document.querySelector('app-admin-layout > anotoki-site-footer > footer')")) &&
    same(await footerRow('app-admin-layout'), FOOTER_ROW.en.slice(0, 3)) &&
    !(await js("!!document.querySelector('anotoki-site-footer [data-open-feedback]')")),
  JSON.stringify(await footerRow('app-admin-layout')),
);
await screenshot('admin-migrations-behind-1280', true);

// Anywhere else the ADMIN reads that an update waits, with the way to the Migrations page - in English, the admin
// panel's, on a Slovak page too - and nothing of the page.
await viewport(390);
await go('/?lang=sk');
await waitFor(page, "!!document.querySelector('anotoki-site-status h1')", 15000);
await sleep(500);
expect(
  'the ADMIN anywhere else, on a Slovak page: "A database update is waiting", in English, and "Open Migrations" - nothing of the page, no top bar, no footer',
  (await statusHeading()) === 'A database update is waiting' &&
    (await js("document.querySelector('anotoki-site-status section')?.getAttribute('lang')")) === 'en' &&
    (await text('anotoki-site-status p')) === 'This site is closed to everybody else until the update is applied. Back the database up first.' &&
    (await statusActions()) === 'Open Migrations' &&
    (await migrationsLink()) === 1 &&
    (await framesDrawn()) === 0 &&
    !(await js("!!document.querySelector('app-survey-home')")),
  `${await statusHeading()} / [${await statusActions()}] / frames ${await framesDrawn()}`,
);
await expectNoSideways('an update waiting, the ADMIN, 390 px');
await screenshots('sk-390-behind-admin');
await viewport(1280);
await go('/?lang=en');
await waitFor(page, "!!document.querySelector('anotoki-site-status a')", 15000);
await sleep(500);
await screenshot('en-1280-behind-admin');
expect(
  'the ADMIN: nothing of a page behind "A database update is waiting" - the API asked only the Migrations page\'s list, where the site stands, the sign-in\'s settings and the strings - and no toast',
  askedBehind(ownerFrom, ['GET /api/admin/migrations']).length === 0 && (await js("document.querySelectorAll('anotoki-toast-host .anotoki-toast-host__toast').length")) === 0,
  askedBehind(ownerFrom, ['GET /api/admin/migrations']).join(', '),
);
expect('"Open Migrations"', (await clickText('anotoki-site-status a', 'Open Migrations')) === true);
await waitFor(page, ALL_PENDING, 15000);
await sleep(600);

/** "Apply pending", and Apply in the question it asks: what the question said. Then the answer, `heading` in it. */
async function applyPending(heading) {
  await clickText('anotoki-migrations-page button[data-apply]', 'Apply pending');
  await waitFor(page, "!!document.querySelector('anotoki-migrations-page [data-confirm] dialog[open]')", 15000);
  await sleep(300);
  const asked = await text('anotoki-migrations-page [data-confirm] h2');
  await clickText('anotoki-migrations-page [data-confirm] button[data-confirm-apply]', 'Apply');
  await waitFor(page, `(document.querySelector('anotoki-migrations-page [data-result] .anotoki-alert__heading')?.textContent ?? '').includes(${JSON.stringify(heading)})`, 20000);
  await sleep(800);
  return asked;
}
const applyAsked = await applyPending('Stopped at');
const failedWords = await text('anotoki-migrations-page [data-result]');
const failedError = await js("document.querySelector('anotoki-migrations-page [data-result] pre')?.textContent ?? ''");
const backupNote = () => text('anotoki-migrations-page [data-result] .anotoki-migrations-page__result-note');
expect(
  "a failed Apply: where it stopped, nothing applied first, the file rolled back whole - and the database's whole error",
  applyAsked === `Apply ${PENDING_COUNT} pending migrations?` &&
    (await text('anotoki-migrations-page [data-result] .anotoki-alert__heading')) === `Stopped at ${FILE_004}` &&
    failedWords.includes('Nothing was applied. The failed file was rolled back as a whole.') &&
    /^statement 1 of 1: SQLSTATE\[42701\]: .*column "language" of relation "responses" already exists\n\n {2}ALTER TABLE responses/s.test(failedError),
  `${applyAsked} / ${failedWords.slice(0, 120)} / ${failedError.slice(0, 160)}`,
);
expect("... with a backup of the database made before anything ran (the library's backups, before every update)", /backup/i.test((await backupNote()) ?? ''), await backupNote());
expect(
  '... and the database is still behind: everything still pending, the bar the same',
  (await pendingRows()) === PENDING && (await barLinks()) === 'Migrations',
  `${await pendingRows()} / ${await barLinks()}`,
);
await screenshot('admin-migrations-failed-1280', true);
await viewport(390);
await sleep(400);
await expectBar('the Migrations page, a failed Apply, 390 px');
await screenshots('admin-migrations-failed-390');
await viewport(1280);

// What was in the way is dealt with (here: 004's work is there, so its row goes back): the next Apply goes through.
sql(`INSERT INTO migrations (filename) VALUES ('${FILE_004}') ON CONFLICT DO NOTHING`);
await applyPending('Up to date');
await waitFor(page, "document.querySelectorAll('app-top-bar .anotoki-top-bar__nav a').length === 4", 15000);
await sleep(500);
expect(
  'a good Apply: "Up to date", what was applied - the site\'s files, then the library\'s - nothing pending, and the site runs where it stands, every section in the bar',
  (await text('anotoki-migrations-page [data-result] .anotoki-alert__heading')) === 'Up to date' &&
    (await text('anotoki-migrations-page [data-result] .anotoki-migrations-page__result-text')) === `Applied: ${FILE_011}, ${FILE_012}, ${LIBRARY_FILES.join(', ')}.` &&
    (await text('anotoki-migrations-page [data-pending]')).includes('Nothing pending') &&
    (await barLinks()) === 'Surveys Translations Languages System',
  `${await text('anotoki-migrations-page [data-result]')} / ${await barLinks()}`,
);
expect('... and the footer offers Feedback again: the site runs', same(await footerRow('app-admin-layout'), FOOTER_ROW.en), JSON.stringify(await footerRow('app-admin-layout')));
const afterStrings = await (await fetch(`${origin}/api/translations/en`)).json();
expect(
  "... and the owner's rewording of the sign-in's word survived the release - under the library's key now, the site's key gone",
  afterStrings.values?.['anotoki.signIn.notCompleted'] === OWNERS_NOT_COMPLETED && !('signIn.notCompleted' in (afterStrings.values ?? {})),
  JSON.stringify(afterStrings.values?.['anotoki.signIn.notCompleted'] ?? null),
);
await expectNoKeys('the Migrations page, up to date');
await screenshot('admin-migrations-up-to-date-1280', true);
await viewport(390);
await sleep(400);
await expectBar('the Migrations page, up to date, 390 px');
await screenshots('admin-migrations-up-to-date-390');
await viewport(1280);
await clickText('app-top-bar .anotoki-top-bar__nav a', 'Surveys');
await waitFor(page, "location.pathname === '/admin' && !!document.querySelector('app-surveys-list')", 15000);
await sleep(500);
expect('the rest of the admin panel works again, with no reload', !(await js("!!document.querySelector('anotoki-site-status')")), await js('location.pathname'));
// And a sign-in turned down now says the owner's words: 012 moved them under the library's key, which the screen of a
// failed sign-in reads.
await refusedOn('/admin');
screenSays = await failureScreen();
expect(
  "a sign-in turned down, after the update: the screen says the owner's words, which 012 moved",
  screenSays.heading === EN.failedTitle && screenSays.message === OWNERS_NOT_COMPLETED,
  JSON.stringify(screenSays),
);
await setIam({ user: OWNER, deny: false });
await tryAgain();
await waitFor(page, SIGNED_IN + " && location.pathname === '/admin'", 15000);

// ═══ Visitors: the IAM's "Sign-in required" switched off ══════════════════
// The IAM says sign-in is not required for the site (the stand-in's `login_required`), and the site's backend is
// made to ask again (its kept answer - a minute in the work folder's config/cache - deleted). Then nobody signed in
// may take surveys: their first kept answers make a visitor, whose key this browser keeps; the admin panel lists the
// visitor as "Visitor N", "Not signed in"; signing in moves the visitor's answers into the account (the person's own
// answers win where both answered) and their draft with them. The admin panel and the preview still sign in. Then
// the switch goes on again: a browser holding a key is sent to sign in, and keeps the key. A second browser (a
// context of its own) is a visitor of its own.
const VISITOR_KEY = 'anotoki-survey:visitor';
const KEY_SHAPE = /^[A-Za-z0-9_-]{43}$/;
/** The IAM's switch, as the site will read it from the next request on. */
function signInRequired(required) {
  const cache = join(process.env.SURVEY_CHECK_CONFIG ?? '', 'cache');
  for (const file of existsSync(cache) ? readdirSync(cache) : []) {
    if (file.startsWith('anotoki-iam-application-')) rmSync(join(cache, file), { force: true });
  }
  return setIam({ login_required: required });
}
/** What the home page says of each survey, by its address: New, Started, Taken (in the page's language). */
const statesOn = (target) =>
  target.evaluate("Object.fromEntries([...document.querySelectorAll('app-survey-home a.survey')].map((a) => [a.getAttribute('href').slice(1), a.querySelector('.survey-state').textContent.trim()]))");
const visitStates = async (target = page) => {
  const states = await statesOn(target);
  return ['visit-one', 'visit-two', 'visit-three'].map((slug) => states[slug] ?? '-').join(', ');
};
/** A survey of one question, open, with all of it in Slovak too. */
const visitSurvey = (slug, title, slovak) => ({
  slug,
  title,
  status: 'draft',
  intro: '<p>One question about the sites.</p>',
  thanks: '<p>Thank you!</p>',
  askAboutYou: false,
  closesOn: null,
  language: 'en',
  translations: {
    sk: {
      title: slovak,
      intro: '<p>Jedna otázka o stránkach.</p>',
      thanks: '<p>Ďakujeme!</p>',
      steps: { v1: { title: 'Otázka' } },
      questions: { vq: { text: '<p>Obľúbený živel?</p>', placeholder: '', options: { a: { label: 'Anemo' }, g: { label: 'Geo' } }, images: {} } },
    },
  },
  steps: [
    {
      id: 'v1',
      title: 'Question',
      questions: [
        {
          id: 'vq',
          type: 'single',
          text: '<p>Your favourite element?</p>',
          images: [],
          required: true,
          options: [
            { id: 'a', label: 'Anemo', other: false, images: [] },
            { id: 'g', label: 'Geo', other: false, images: [] },
          ],
          layout: 'list',
          minChoices: null,
          maxChoices: null,
          multiline: true,
          maxLength: null,
          placeholder: '',
        },
      ],
    },
  ],
});
/** Through a survey on the page: Start, the first option, and - unless `send` is false - Send (by the words of the page). */
async function takeVisit(slug, words, send = true) {
  await go(`/${slug}`);
  await waitFor(page, "!!document.querySelector('.start button')", 15000);
  await js("document.querySelector('.start button').click(); true");
  await waitFor(page, '!!document.querySelector(\'app-take-survey input[value="a"]\')', 15000);
  await pick('a');
  await sleep(400);
  if (send) {
    await clickText('button[type=submit]', words.send);
    await waitFor(page, "!!document.querySelector('.done-heading')", 15000);
  }
}
EN.send = 'Send my answers';
SK.send = 'Odoslať odpovede';

// The owner (signed in, from the stage before) makes three open surveys, and answers the second one as themselves.
await setIam({ user: OWNER, deny: false });
const visitIds = {};
for (const [slug, title, slovak] of [
  ['visit-one', 'Visit one', 'Návšteva jedna'],
  ['visit-two', 'Visit two', 'Návšteva dva'],
  ['visit-three', 'Visit three', 'Návšteva tri'],
]) {
  const made = await (await asOwner('POST', '/api/admin/surveys', { survey: visitSurvey(slug, title, slovak) })).json();
  visitIds[slug] = made.survey?.id;
  const opened = await asOwner('POST', `/api/admin/surveys/${visitIds[slug]}/status`, { status: 'open' });
  if (!visitIds[slug] || !opened.ok) problems.push(`could not make and open ${slug}: ${JSON.stringify(made).slice(0, 200)} / ${opened.status}`);
}
const visitAnswer = { aboutYou: null, answers: { vq: { optionIds: ['g'], other: '', text: '' } }, language: 'en', startedAt: new Date().toISOString() };
expect('the owner answers "Visit two" as themselves', (await asOwner('POST', '/api/surveys/visit-two/responses', visitAnswer)).status === 201);
expect('switched off in the IAM', await signInRequired(false));
const relayed = await (await fetch(`${origin}/api/auth/config`)).json();
expect('the site relays it: sign-in not required, a visitor kept 30 days', relayed.login_required === false && relayed.visitor_days === 30, JSON.stringify(relayed));

// A second browser, nothing stored: no trip to the IAM, the open surveys, all new; its answers make a visitor.
const other = await openPageInNewContext(Number(port));
await other.send('Page.enable');
await other.send('Runtime.enable');
await other.send('Network.enable');
other.on('Runtime.exceptionThrown', (e) => problems.push('second browser, exception: ' + (e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text)));
other.on('Runtime.consoleAPICalled', (e) => {
  if (e.type === 'error' || e.type === 'warning') problems.push(`second browser, console.${e.type}: ` + e.args.map((a) => a.value ?? a.description).join(' '));
});
const otherRequested = [];
other.on('Network.requestWillBeSent', (e) => {
  try {
    otherRequested.push(`${e.request.method} ${new URL(e.request.url).pathname}`);
  } catch {
    // not an address
  }
});
await other.send('Page.navigate', { url: `${origin}/` });
await waitFor(other, '!!document.querySelector(\'app-survey-home a.survey[href="/visit-three"]\')', 20000);
expect(
  'switched off, a browser with nothing stored: the surveys, no trip to the IAM, nothing taken, the notice',
  (await other.evaluate('location.origin')) === origin &&
    !otherRequested.includes('GET /api/oidc/authorize') &&
    (await visitStates(other)) === 'New, New, New' &&
    !!(await other.evaluate("document.querySelector('app-visitor-notice')?.textContent")),
  `${await visitStates(other)} / ${otherRequested
    .filter((line) => line.includes('/api/'))
    .join(', ')
    .slice(0, 200)}`,
);
await other.send('Page.navigate', { url: `${origin}/visit-one` });
await waitFor(other, "!!document.querySelector('.start button')", 15000);
await other.evaluate("document.querySelector('.start button').click(); true");
await waitFor(other, '!!document.querySelector(\'app-take-survey input[value="g"]\')', 15000);
await other.evaluate('document.querySelector(\'app-take-survey input[value="g"]\').click(); true');
await sleep(400);
await other.evaluate("[...document.querySelectorAll('button[type=submit]')].find((b) => b.textContent.includes('Send my answers')).click(); true");
await waitFor(other, "!!document.querySelector('.done-heading')", 15000);
const otherKey = await other.evaluate(`localStorage.getItem(${JSON.stringify(VISITOR_KEY)})`);
expect("the second browser's answers are kept, and made it a visitor: its key in localStorage", KEY_SHAPE.test(otherKey ?? ''), String(otherKey).length);

// The admin panel (the owner, in the first browser): the visitor is "Visitor N", not signed in.
const visitOneAnswers = async () => (await (await asOwner('GET', `/api/admin/surveys/${visitIds['visit-one']}/responses`)).json()).responses ?? [];
const theVisitor = (await visitOneAnswers()).find((response) => response.person.visitor);
const visitorName = theVisitor ? `Visitor ${-Number(theVisitor.person.id)}` : '(none)';
expect(
  'the results: the visitor\'s person is a negative id, "Visitor N" - and nobody has an address here',
  !!theVisitor && Number(theVisitor.person.id) < 0 && theVisitor.person.name === visitorName && !('email' in theVisitor.person),
  JSON.stringify(theVisitor?.person),
);
await viewport(1280);
await go(`/admin/surveys/${visitIds['visit-one']}/results?tab=people`);
await waitFor(page, "!!document.querySelector('#results-panel-people tbody .who-name')", 15000);
/** The results' people: a name, and what is said under it (a visitor's "Not signed in"; nothing for a person). */
const peopleRows = () =>
  js(
    "[...document.querySelectorAll('#results-panel-people tbody tr')].map((row) => row.querySelector('.who-name')?.textContent.trim() + (row.querySelector('.who-email') ? ' / ' + row.querySelector('.who-email').textContent.trim() : ''))",
  );
expect('the results\' people: the visitor by name, "Not signed in" under it', same(await peopleRows(), [`${visitorName} / Not signed in`]), JSON.stringify(await peopleRows()));
await screenshot('admin-results-visitor-1280', true);
await clickText('#results-panel-people .person', visitorName);
await waitFor(page, "!!document.querySelector('anotoki-drawer .anotoki-drawer__subtitle')", 15000);
await sleep(400);
expect(
  '... and in the drawer of their answers',
  (await text('anotoki-drawer h2')) === visitorName && (await text('anotoki-drawer .anotoki-drawer__subtitle')) === 'Not signed in',
  `${await text('anotoki-drawer h2')} / ${await text('anotoki-drawer .anotoki-drawer__subtitle')}`,
);
await screenshot('admin-results-visitor-drawer-1280');
await viewport(390);
await go(`/admin/surveys/${visitIds['visit-one']}/responses/${theVisitor?.id}`);
await waitFor(page, "!!document.querySelector('app-response-page h1')", 15000);
expect(
  '... and on the page of their answers',
  (await text('app-response-page h1')) === visitorName && (await text('app-response-page .who .muted')) === 'Not signed in',
  `${await text('app-response-page h1')} / ${await text('app-response-page .who .muted')}`,
);
await expectBar('the answers of a visitor, 390 px');
await screenshots('admin-response-visitor-390');

// The first browser forgets its session: a visitor, English, a phone.
await forgetSession();
await js('localStorage.clear(); sessionStorage.clear(); true');
since = requested.length;
await go('/?lang=en');
await waitFor(page, "!!document.querySelector('app-survey-home a.survey[href=\"/visit-three\"]') && !!document.querySelector('app-visitor-notice')", 20000);
trip = requested.slice(since);
expect(
  'nobody signed in, /: no trip to the IAM - the open surveys, nothing taken',
  !trip.includes('GET /api/oidc/authorize') && !(await js(SIGNED_IN)) && (await visitStates()) === 'New, New, New',
  `${await visitStates()} / ${trip
    .filter((line) => line.includes('/api/'))
    .join(', ')
    .slice(0, 200)}`,
);
expect(
  'the notice: kept for this browser 30 days, and Sign in',
  /for 30 days after your last visit/.test(await text('app-visitor-notice')) && (await text('app-visitor-notice button')) === EN.signIn,
  await text('app-visitor-notice'),
);
await expectBar("a visitor's home page, 390 px");
await expectNoKeys("a visitor's home page");
await screenshots('en-390-visitor-home');
await go('/visit-one');
await waitFor(page, "!!document.querySelector('.start button')", 15000);
expect(
  "a survey's welcome: the visitor's line where a person's name would be, and the notice",
  (await text('app-take-survey .who')) === 'You are not signed in · your answers go without your name.' && !!(await text('app-take-survey app-visitor-notice')),
  await text('app-take-survey .who'),
);
expect('no key before the first answers are kept', (await js(`localStorage.getItem(${JSON.stringify(VISITOR_KEY)})`)) === null);
await screenshots('en-390-visitor-welcome');
await takeVisit('visit-one', EN);
const visitorKey = await js(`localStorage.getItem(${JSON.stringify(VISITOR_KEY)})`);
expect(
  'sent: thank you - and the answers made this browser a visitor (a key of its own)',
  (await text('.done-heading')) === 'Thank you!' && KEY_SHAPE.test(visitorKey ?? '') && visitorKey !== otherKey,
  `${await text('.done-heading')} / ${String(visitorKey).length}`,
);
await expectNoKeys("a visitor's answers sent");
await screenshots('en-390-visitor-sent');
await go('/visit-one');
await waitFor(page, "!!document.querySelector('.message-heading')", 15000);
expect('the same survey again: taken already', /You have taken this survey/.test(await text('.message-heading')), await text('.message-heading'));
await takeVisit('visit-two', EN);
await takeVisit('visit-three', EN, false);
await go('/');
await waitFor(page, '!!document.querySelector(\'app-survey-home a.survey[href="/visit-three"]\')', 15000);
expect("home, after a page load: taken, taken, started - the visitor's, kept in this browser", (await visitStates()) === 'Taken, Taken, Started', await visitStates());

// The admin panel and the preview still sign in: the IAM turns the sign-in down here, and the screen of a failed
// sign-in says so - nothing of either drawn. (The visitor's key stays where it is.)
await setIam({ deny: true });
await go('/admin');
await waitFor(page, 'location.origin === ' + JSON.stringify(origin) + ' && ' + FAILURE_SCREEN, 20000);
screenSays = await failureScreen();
expect(
  "switched off all the same, /admin goes to the IAM: turned down, the screen of a failed sign-in, why in the owner's words - nothing of the admin panel",
  screenSays.heading === EN.failedTitle && screenSays.message === OWNERS_NOT_COMPLETED && !(await js("!!document.querySelector('app-surveys-list, app-admin-layout')")),
  JSON.stringify(screenSays),
);
await go(`/preview/${visitIds['visit-one']}`);
await waitFor(page, 'location.origin === ' + JSON.stringify(origin) + ' && ' + FAILURE_SCREEN, 20000);
expect('... and so does the preview: the same screen, nothing of the survey', !(await js("!!document.querySelector('app-take-survey')")), JSON.stringify(await failureScreen()));
expect('... and the visitor keeps their key', (await js(`localStorage.getItem(${JSON.stringify(VISITOR_KEY)})`)) === visitorKey);
await setIam({ deny: false });

// In Slovak: the notice, the visitor's line, the draft offered - no key on the page.
await go('/?lang=sk');
await waitFor(page, "!!document.querySelector('app-survey-home a.survey[href=\"/visit-three\"]') && /Prieskumy vypĺňate/.test(document.querySelector('app-visitor-notice')?.textContent ?? '')", 15000);
expect(
  'Slovak: the notice, its days in Slovak',
  /ešte 30 dní po Vašej poslednej návšteve/.test(await text('app-visitor-notice')) && (await text('app-visitor-notice button')) === SK.signIn,
  await text('app-visitor-notice'),
);
expect("Slovak: the visitor's surveys taken, taken, started", (await visitStates()) === 'Vyplnený, Vyplnený, Začatý', await visitStates());
await expectNoKeys("a visitor's home page, Slovak");
await screenshots('sk-390-visitor-home');
await viewport(360);
await expectBar("a visitor's home page, Slovak, 360 px");
await screenshot('sk-360-visitor-home', true);
await viewport(390);
await go('/visit-three');
await waitFor(page, "!!document.querySelector('app-take-survey .who')", 15000);
expect(
  "Slovak: the visitor's line, and their draft offered",
  (await text('app-take-survey .who')) === 'Nie ste prihlásení · odpovede odošlete bez svojho mena.' &&
    (await texts('app-take-survey anotoki-alert')).some((alert) => alert.includes('Pokračovať tam, kde ste prestali?')),
  `${await text('app-take-survey .who')} / ${(await texts('app-take-survey anotoki-alert')).join(' | ')}`,
);
await expectNoKeys("a visitor's welcome with a draft, Slovak");
await screenshots('sk-390-visitor-welcome-draft');

// Signing in from the notice - as the owner, who answered "Visit two" too: one survey moves, one keeps the owner's.
await go('/');
await waitFor(page, "!!document.querySelector('app-visitor-notice button')", 15000);
await js("document.querySelector('app-visitor-notice button').click(); true");
await waitFor(page, SIGNED_IN + " && !document.querySelector('app-visitor-notice') && document.querySelectorAll('.anotoki-toast-host__message').length > 0", 20000);
const movedToast = (await toasts()).join(' | ');
expect(
  "signed in: the toast says what moved into the account and what kept the person's earlier answers - in Slovak",
  movedToast.includes('1 prieskum, ktorý ste vyplnili bez prihlásenia, je teraz vo Vašom účte.') &&
    movedToast.includes('1 prieskum, ktorý ste vyplnili bez prihlásenia, ste už predtým vyplnili aj vo svojom účte'),
  movedToast,
);
await screenshot('sk-390-visitor-signed-in-moved');
await dismissToasts();
expect('... the key is gone from this browser', (await js(`localStorage.getItem(${JSON.stringify(VISITOR_KEY)})`)) === null);
await waitFor(page, '!!document.querySelector(\'app-survey-home a.survey[href="/visit-three"]\')', 15000);
await sleep(500);
expect(
  "... and the home page is the owner's: taken, taken, and the visitor's draft is theirs now",
  (await visitStates()) === 'Vyplnený, Vyplnený, Začatý' && (await whoIsIn()) === OWNER.username,
  `${await visitStates()} / ${await whoIsIn()}`,
);
const visitTwoAnswers = (await (await asOwner('GET', `/api/admin/surveys/${visitIds['visit-two']}/responses`)).json()).responses ?? [];
const visitOneNow = (await visitOneAnswers()).map((response) => `${response.person.name}${response.person.visitor ? ' (visitor)' : ''}`).sort();
expect(
  'the answers: "Visit one" is the owner\'s now beside the other browser\'s visitor; "Visit two" kept the owner\'s own, the visitor\'s dropped',
  same(visitOneNow, [`${visitorName} (visitor)`, OWNER.username].sort()) &&
    same(
      visitTwoAnswers.map((response) => response.person.name),
      [OWNER.username],
    ) &&
    visitTwoAnswers[0]?.answers?.vq?.optionIds?.[0] === 'g',
  `${JSON.stringify(visitOneNow)} / ${JSON.stringify(visitTwoAnswers.map((response) => [response.person.name, response.answers?.vq?.optionIds]))}`,
);
await go(`/admin/surveys/${visitIds['visit-one']}/results?tab=people`);
await waitFor(page, "document.querySelectorAll('#results-panel-people tbody .who-name').length === 2", 15000);
const bothRows = await peopleRows();
expect(
  'the results: the owner by name alone (no address kept here), the visitor "Not signed in"',
  bothRows.includes(`${visitorName} / Not signed in`) && bothRows.includes(OWNER.username),
  JSON.stringify(bothRows),
);
await expectBar('the results with a person and a visitor, 390 px');
await screenshots('admin-results-visitor-390');

// Switched on again: the second browser, holding its key, is sent to sign in (turned down here) - and keeps the key.
expect('switched on in the IAM', await signInRequired(true));
await setIam({ deny: true });
otherRequested.splice(0);
await other.send('Page.navigate', { url: `${origin}/` });
await waitFor(other, 'location.origin === ' + JSON.stringify(origin) + ' && ' + FAILURE_SCREEN, 20000);
expect(
  "switched on: the visitor's page went to the IAM first - turned down here, the screen of a failed sign-in - nothing of the surveys asked for",
  otherRequested.includes('GET /api/oidc/authorize') && !otherRequested.includes('GET /api/surveys') && !(await other.evaluate("!!document.querySelector('app-survey-home a.survey')")),
  otherRequested
    .filter((line) => line.includes('/api/'))
    .join(', ')
    .slice(0, 300),
);
expect('... and the key is kept for when the switch goes off again, or they sign in', (await other.evaluate(`localStorage.getItem(${JSON.stringify(VISITOR_KEY)})`)) === otherKey);
await setIam({ deny: false });
await other.close();
await viewport(1280);

// ═══ The ADMIN's system pages: the people, the error log, the audit log, the backups ═══
// The anotoki family's pages (anotoki-lib 0.4.1: @anotoki/lib/people/page, @anotoki/lib/admin/errors, /audit,
// /backups), each on a lazy route of the admin panel; the top bar's System link the way to them (the System page,
// lit on each). The site's ADMIN's alone: an EDITOR is told whose they are, and the API refuses. The People page
// lists everybody who signed in here, with how many surveys each answered and wrote, the visitors in one line, and
// deletes a person's answers after its question; an account the IAM deleted (the stand-in's `anonymized`) is
// scrubbed here on "Check now" - its name the IAM's placeholder, the row marked. The error log has what failed (a 404
// asked for here) and a page's own error (thrown in the page: the family's reporter, anotoki-lib 0.5.0, sends it with
// the owner's token, scrubbed); the audit log what was done in the admin panel; the backups the two the Applies made
// before the update, and one made here - after a sign-in of the last ten minutes, asked for again ("Sign in again")
// when the sign-in is older - named by its maker, downloaded by its single-use link and deleted. Each at 1280 and
// 390 px, light and dark.
const DOWNLOADS = join(out, '..', 'downloads');
mkdirSync(DOWNLOADS, { recursive: true });
await page.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS }).catch((error) => problems.push('downloads cannot be kept: ' + error.message));
/** The System page's links, as "label href". */
const systemLinks = () => js("[...document.querySelectorAll('app-system a.item')].map((a) => a.querySelector('.label').textContent.trim() + ' ' + a.getAttribute('href'))");

// An EDITOR: no System in the bar (checked above), and at the pages' addresses only whose they are; the API refuses.
// The tab in English first (the visitors' stage left it Slovak): the menu is read by its English words.
await go('/?lang=en');
await signInAs(EDITH);
await go('/admin/system');
await waitFor(page, "!!document.querySelector('app-system')", 15000);
expect(
  'an EDITOR at /admin/system: whose the pages are, no link to any of them',
  (await text('app-system anotoki-empty-state .anotoki-empty-state__heading')) === "These pages are for the site's administrators" && (await systemLinks()).length === 0,
  await text('app-system'),
);
await go('/admin/people');
await waitFor(page, "!!document.querySelector('anotoki-people-page')", 15000);
await sleep(500);
expect(
  '... and at the People page\'s: "People are for administrators.", nothing asked of the server',
  (await text('anotoki-people-page')) === 'People are for administrators.' && !requested.slice(-8).some((request) => request.includes('/api/admin/people')),
  await text('anotoki-people-page'),
);
since = requested.length;
await go('/admin/feedback');
await waitFor(page, "!!document.querySelector('anotoki-feedback-page')", 15000);
await sleep(500);
expect(
  "... and at the Feedback page's: whose it is, nothing asked of the server - not even how many messages are new",
  (await text('anotoki-feedback-page')) === 'Feedback is for the administrators of the survey site.' && !requested.slice(since).some((request) => request.includes('/api/admin/feedback')),
  `${await text('anotoki-feedback-page')} / ${requested
    .slice(since)
    .filter((request) => request.includes('/api/admin/'))
    .join(', ')}`,
);
const editorToken = await heldToken();
const editorAnswers = await Promise.all(
  ['/api/admin/people', '/api/admin/feedback', '/api/admin/errors', '/api/admin/audit', '/api/admin/backups'].map(
    async (path) => `${path} ${(await fetch(origin + path, { headers: { Authorization: `Bearer ${editorToken}` } })).status}`,
  ),
);
expect(
  '... and the API refuses an EDITOR every one of them',
  same(editorAnswers, ['/api/admin/people 403', '/api/admin/feedback 403', '/api/admin/errors 403', '/api/admin/audit 403', '/api/admin/backups 403']),
  editorAnswers.join(', '),
);

// The owner: the System page, from the bar.
await signInAs(OWNER);
await go('/admin');
await waitFor(page, "!!document.querySelector('app-surveys-list')", 15000);
expect('the System link in the bar', (await clickText('app-top-bar .anotoki-top-bar__nav a', 'System')) === true);
await waitFor(page, "location.pathname === '/admin/system' && !!document.querySelector('app-system a.item')", 15000);
expect(
  'the System page: the way to the people, feedback, the error log, the audit log, the backups and the migrations - System lit in the bar (no feedback yet: no count beside it)',
  same(await systemLinks(), ['People /admin/people', 'Feedback /admin/feedback', 'Error log /admin/errors', 'Audit log /admin/audit', 'Backups /admin/backups', 'Migrations /admin/migrations']) &&
    same(await barRow(), ['anotoki-brand', 'links: Surveys Translations Languages System (page)', 'anotoki-theme-toggle', 'person']) &&
    (await js('document.title')) === 'System · Admin panel · anotoki survey',
  `${JSON.stringify(await systemLinks())} / ${JSON.stringify(await barRow())} / ${await js('document.title')}`,
);
await expectNoKeys('the System page');
await screenshots('admin-system-1280', false);
await viewport(390);
await expectBar('the System page, 390 px');
await screenshots('admin-system-390');
await viewport(1280);

// The People page: everybody who signed in, the most recently seen first, with the site's columns.
const ANONYMIZED_AT = new Date().toISOString();
await setIam({ anonymized: [{ sub: String(PAT.id), anonymized_at: ANONYMIZED_AT }] });
expect('the People link', (await clickText('app-system a.item', 'People')) === true);
await waitFor(page, "location.pathname === '/admin/people' && !!document.querySelector('anotoki-people-page [data-people] tbody tr')", 15000);
await sleep(500);
/** A person's row on the People page: the name, "you", the count of surveys answered and written, the IAM's mark. */
const personRow = (sub) =>
  js(
    `(() => { const row = document.querySelector('anotoki-people-page tr[data-person="${sub}"]'); if (!row) return null; const cell = (key) => row.querySelector('[data-column="' + key + '"]')?.textContent.replace(/\\s+/g, ' ').trim() ?? null; return { name: row.querySelector('.anotoki-people-page__name')?.textContent.trim(), you: !!row.querySelector('[data-you]'), answered: cell('answered'), written: cell('written'), deleted: !!row.querySelector('[data-deleted]'), deletable: !row.querySelector('[data-delete]')?.disabled }; })()`,
  );
const columnsShown = await texts('anotoki-people-page [data-people] thead th');
const patBefore = await personRow(String(PAT.id));
expect(
  'People: a row a person - the name, the IAM id, first and last seen, the surveys each answered and wrote',
  same(columnsShown, ['Name', 'IAM id', 'First seen', 'Last seen', 'Surveys answered', 'Surveys written']) &&
    (await personRow(String(OWNER.id)))?.you === true &&
    (await personRow(String(EDITH.id)))?.name === EDITH.username &&
    patBefore?.name === PAT.username &&
    Number(patBefore?.answered) >= 1 &&
    (await personRow(String(NINA.id))) !== null,
  `${JSON.stringify(columnsShown)} / owner ${JSON.stringify(await personRow(String(OWNER.id)))} / pat ${JSON.stringify(patBefore)}`,
);
expect('People: the owner wrote surveys here, and the count says so', Number((await personRow(String(OWNER.id)))?.written) >= 2, JSON.stringify(await personRow(String(OWNER.id))));
expect(
  "People: the visitors in one line, in the site's words",
  /^\d+ visitors? answered without signing in, \d+ of them still active: signing in from the same browser moves a visitor’s answers into their account\.$/.test(
    (await text('anotoki-people-page [data-visitors]')) ?? '',
  ),
  await text('anotoki-people-page [data-visitors]'),
);
expect(
  'People: an account with nothing to delete has no Delete to press (Edith answered nothing)',
  (await personRow(String(EDITH.id)))?.deletable === false,
  JSON.stringify(await personRow(String(EDITH.id))),
);
await expectNoKeys('the People page');
await screenshots('admin-people-1280', false);

// The IAM deleted Pat's account: "Check now" scrubs it here - the IAM's placeholder for the name, the rest kept.
await clickText('anotoki-people-page [data-sync-now]', 'Check now');
await waitFor(page, `!!document.querySelector('anotoki-people-page tr[data-person="${PAT.id}"] [data-deleted]')`, 20000).catch(() => null);
await sleep(400);
const scrubbed = await personRow(String(PAT.id));
expect(
  'People, Check now: the account the IAM deleted is scrubbed - its name the IAM\'s placeholder, marked "Deleted at the IAM", its answers kept',
  scrubbed?.name === `deleted-${PAT.id}` &&
    scrubbed?.deleted === true &&
    scrubbed?.answered === patBefore?.answered &&
    /scrubbed here so far/.test((await text('anotoki-people-page [data-sync]')) ?? ''),
  `${JSON.stringify(scrubbed)} / ${await text('anotoki-people-page [data-sync]')}`,
);
const surveyOneAnswers = (await (await asOwner('GET', `/api/admin/surveys/${surveyId}/responses`)).json()).responses ?? [];
expect(
  '... and the results name the placeholder where Pat was',
  surveyOneAnswers.some((response) => response.person.name === `deleted-${PAT.id}`) && !surveyOneAnswers.some((response) => response.person.name === PAT.username),
  JSON.stringify(surveyOneAnswers.map((response) => response.person.name)),
);
await screenshots('admin-people-scrubbed-1280', false);

// Delete a person's answers: asked first, in the site's words; done, said in the page - and audited.
const ninaBefore = await personRow(String(NINA.id));
await js(`document.querySelector('anotoki-people-page tr[data-person="${NINA.id}"] [data-delete]').click(); true`);
await waitFor(page, "!!document.querySelector('anotoki-people-page [data-confirm] dialog[open]')", 15000);
await sleep(300);
const personDeleteAsked = {
  title: await text('anotoki-people-page [data-confirm] .anotoki-dialog__title'),
  text: await text('anotoki-people-page [data-confirm] .anotoki-dialog__description'),
  yes: await text('anotoki-people-page [data-confirm] [data-confirm-delete]'),
};
expect(
  'People, Delete: the question names whose answers go, how many, and what stays - nothing else asked (no password, no new sign-in)',
  personDeleteAsked.title === `Delete ${NINA.username}’s answers?` &&
    personDeleteAsked.text?.startsWith(`Every answer they sent here goes - ${ninaBefore?.answered} surveys - and cannot be brought back`) &&
    personDeleteAsked.text?.includes('The surveys they wrote stay, and so does their anotoki account.') &&
    personDeleteAsked.yes === 'Delete their answers' &&
    !(await js("!!document.querySelector('anotoki-people-page [data-confirm] input[type=password]')")),
  JSON.stringify(personDeleteAsked),
);
await screenshot('admin-people-delete-asked-1280');
await js("document.querySelector('anotoki-people-page [data-confirm] [data-confirm-delete]').click(); true");
await waitFor(page, "!!document.querySelector('anotoki-people-page [data-outcome]')", 15000);
await sleep(500);
expect(
  '... done: said in the page, and the row says Nina has answered nothing here now',
  (await text('anotoki-people-page [data-outcome]'))?.startsWith(`Deleted what the site kept of ${NINA.username} - Answers: ${ninaBefore?.answered}`) &&
    !/[1-9]/.test((await personRow(String(NINA.id)))?.answered ?? '') &&
    (await personRow(String(NINA.id)))?.deletable === false,
  `${await text('anotoki-people-page [data-outcome]')} / ${JSON.stringify(await personRow(String(NINA.id)))}`,
);
await viewport(390);
await sleep(400);
await expectNoSideways('the People page, 390 px');
await screenshots('admin-people-390');
await viewport(1280);

// A page's own error - thrown where nothing catches it: Angular's global listener hands it to the app's ErrorHandler,
// the family's reporter (anotoki-lib 0.5.0), which leaves the console its say and sends it to the site's error log
// through the app's own HttpClient - so with the owner's token, never a visitor's key; scrubbed before it leaves.
expected = [/anotoki survey check: a page's own error/];
const reportsBefore = errorReports.length;
await js('setTimeout(() => { throw new Error("anotoki survey check: a page\'s own error - password=hunter2"); }, 0); true');
for (let i = 0; i < 40 && errorReports.length === reportsBefore; i++) await sleep(250);
await sleep(500);
const reportsSent = errorReports.slice(reportsBefore);
expect(
  "a page's own error: reported once, through the app's HttpClient - the owner's token on it, no visitor's key, the secret scrubbed in the page",
  reportsSent.length === 1 &&
    reportsSent[0].token &&
    !reportsSent[0].visitorKey &&
    reportsSent[0].body.includes("anotoki survey check: a page's own error") &&
    !reportsSent[0].body.includes('hunter2'),
  JSON.stringify(reportsSent).slice(0, 400),
);
expect(
  "... and the console still has it, as Angular's own handler writes it",
  heard.some((message) => message.startsWith('console.error')),
  heard.join(' | ').slice(0, 300),
);
expected = [];
heard.length = 0;

// The error log: a 404 asked for here, as anybody could - written down without its query string, and shown grouped;
// the page's own error beside it, its secret gone, by the owner's account.
const missing = await fetch(`${origin}/api/no-such-route-for-the-check?secret=dont-keep-me`);
expect('a route that is not there: 404', missing.status === 404, String(missing.status));
await go('/admin/errors');
await waitFor(page, "!!document.querySelector('anotoki-error-log-page [data-groups] tbody tr')", 15000);
await sleep(500);
const errorsShown = await text('anotoki-error-log-page [data-groups]');
expect(
  'the error log: the 404 among what failed, its path without the query string',
  errorsShown?.includes('/api/no-such-route-for-the-check') && !errorsShown.includes('dont-keep-me'),
  errorsShown?.slice(0, 300),
);
expect("... and the page's own error, without its secret", errorsShown?.includes("anotoki survey check: a page's own error") && !errorsShown.includes('hunter2'), errorsShown?.slice(0, 300));
const report = await (await asOwner('GET', '/api/admin/errors?days=1')).json();
const pageGroup = (report.groups ?? []).find((group) => String(group.message ?? '').includes("anotoki survey check: a page's own error"));
const pageLines = pageGroup ? await (await asOwner('GET', `/api/admin/errors/${pageGroup.fingerprint}?days=1`)).json() : [];
expect(
  "... written as the page's (source client), at the page's path, by the owner's account",
  pageGroup?.source === 'client' && pageLines.length === 1 && pageLines[0].user_id === OWNER.id && pageLines[0].path === '/admin/people',
  JSON.stringify({ group: pageGroup, lines: pageLines }).slice(0, 400),
);
await expectNoKeys('the error log');
await screenshots('admin-errors-1280', false);
await viewport(390);
await sleep(400);
await expectNoSideways('the error log, 390 px');
await screenshots('admin-errors-390');
await viewport(1280);

// The backups: the two the Applies made before the update; one made here needs a sign-in of the last ten minutes.
// An older one first (the stand-in's session began an hour ago): the page asks for a new sign-in - "Sign in again" -
// and comes back here.
await setIam({ auth_time: Math.floor(Date.now() / 1000) - 3600 });
await forgetSession();
await go('/admin/backups');
await waitFor(page, SIGNED_IN + " && !!document.querySelector('anotoki-backups-page [data-backups] tbody tr')", 20000);
await sleep(500);
const kinds = await js("[...document.querySelectorAll('anotoki-backups-page [data-backups] [data-kind]')].map((badge) => badge.getAttribute('data-kind'))");
expect(
  'the backups: the two made before the update (the failed Apply and the good one), not encrypted, nothing else said wrong',
  kinds.filter((kind) => kind === 'before-migration').length === 2 && !(await js("!!document.querySelector('anotoki-backups-page [data-not-writable], anotoki-backups-page [data-no-copy]')")),
  JSON.stringify(kinds),
);
await screenshots('admin-backups-1280', false);
await clickText('anotoki-backups-page [data-create]', 'Back up now');
await waitFor(page, "!!document.querySelector('anotoki-backups-page [data-guarded] dialog[open]')", 15000);
await sleep(400);
await js("document.querySelector('anotoki-backups-page [data-guarded] [data-guarded-confirm]').click(); true");
await waitFor(page, "!!document.querySelector('anotoki-backups-page [data-sign-in-needed]')", 20000).catch(() => null);
expect(
  'a sign-in an hour old: "Sign in again first" in the dialog, with its button - nothing made',
  !!(await text('anotoki-backups-page [data-sign-in-needed] [data-sign-in]')) &&
    (await js("document.querySelectorAll('anotoki-backups-page [data-backups] tbody tr[data-backup]').length")) === kinds.length,
  await text('anotoki-backups-page [data-guarded]'),
);
await screenshot('admin-backups-sign-in-again-1280');
await js("document.querySelector('anotoki-backups-page [data-sign-in-needed] [data-sign-in]').click(); true");
await sleep(1500);
await settle();
await waitFor(page, SIGNED_IN + " && location.pathname === '/admin/backups' && !!document.querySelector('anotoki-backups-page [data-create]')", 20000).catch(() => null);
expect(
  '"Sign in again": through the IAM, asked for the password there (prompt=login), and back on the Backups page',
  (await js('location.pathname')) === '/admin/backups' && (await iamTrips()).some((line) => line.startsWith('GET /api/oidc/authorize')),
  await js('location.pathname'),
);
await sleep(500);
await clickText('anotoki-backups-page [data-create]', 'Back up now');
await waitFor(page, "!!document.querySelector('anotoki-backups-page [data-guarded] dialog[open]')", 15000);
await sleep(400);
await fill('anotoki-backups-page [data-guarded] [data-description] input', 'Before the browser check deletes it');
await js("document.querySelector('anotoki-backups-page [data-guarded] [data-guarded-confirm]').click(); true");
await waitFor(page, "[...document.querySelectorAll('anotoki-backups-page [data-backups] [data-kind]')].some((badge) => badge.getAttribute('data-kind') === 'manual')", 30000).catch(() => null);
await sleep(600);
const manualId = await js("document.querySelector('anotoki-backups-page [data-backups] [data-kind=\"manual\"]')?.closest('tr')?.getAttribute('data-backup') ?? null");
expect(
  'signed in a moment ago: Back up now makes one - "manual", with its description',
  !!manualId && (await text(`anotoki-backups-page tr[data-backup="${manualId}"]`))?.includes('Before the browser check deletes it'),
  String(manualId),
);
expect(
  "... made by the owner, by name (anotoki-lib 0.5.0: the site gives the people's names)",
  (await text(`anotoki-backups-page tr[data-backup="${manualId}"] td[data-label="By"]`)) === OWNER.username,
  await text(`anotoki-backups-page tr[data-backup="${manualId}"] td[data-label="By"]`),
);
// Downloaded by its single-use link: the file arrives, an anotoki backup.
const downloadsBefore = new Set(readdirSync(DOWNLOADS));
await js(`document.querySelector('anotoki-backups-page tr[data-backup="${manualId}"] [data-download]').click(); true`);
let downloaded = null;
for (let i = 0; i < 60 && downloaded === null; i++) {
  await sleep(250);
  downloaded = readdirSync(DOWNLOADS).find((name) => !downloadsBefore.has(name) && name.endsWith('.anotoki-backup')) ?? null;
}
const head = downloaded ? readFileSync(join(DOWNLOADS, downloaded)).subarray(0, 16).toString('latin1') : '';
expect(
  'Download: the backup arrives through its single-use link - an anotoki backup, named by the site and its id',
  downloaded === `survey-${manualId}.anotoki-backup` && head.startsWith('ANOTOKI-BACKUP 1'),
  `${downloaded} / ${JSON.stringify(head)}`,
);
await screenshot('admin-backups-downloaded-1280');
// Deleted, after its question.
await js(`document.querySelector('anotoki-backups-page tr[data-backup="${manualId}"] [data-delete]').click(); true`);
await waitFor(page, '!!document.querySelector(\'anotoki-backups-page [data-guarded][data-action="delete"] dialog[open]\')', 15000);
await sleep(300);
await js("document.querySelector('anotoki-backups-page [data-guarded] [data-guarded-confirm]').click(); true");
await waitFor(page, `!document.querySelector('anotoki-backups-page tr[data-backup="${manualId}"]')`, 20000).catch(() => null);
expect('Delete: asked, then gone from the list', !(await js(`!!document.querySelector('anotoki-backups-page tr[data-backup="${manualId}"]')`)), String(manualId));
await viewport(390);
await sleep(400);
await expectNoSideways('the backups, 390 px');
await screenshots('admin-backups-390');
await viewport(1280);

// The audit log: what was done in the admin panel - by whom, named - the update, the backups, the people.
await go('/admin/audit');
await waitFor(page, "!!document.querySelector('anotoki-audit-log-page [data-entries] tbody tr')", 15000);
await sleep(500);
const actionsShown = new Set(await texts('anotoki-audit-log-page [data-entries] .anotoki-audit-log-page__action'));
const wanted = ['backup.deleted', 'backup.downloaded', 'backup.created', 'person.data_deleted', 'people.synced', 'migrations.applied'];
expect(
  'the audit log: the backups made, downloaded and deleted, the answers deleted, the scrub, the update - newest first',
  wanted.every((action) => actionsShown.has(action)),
  JSON.stringify([...actionsShown]),
);
expect(
  '... each by its person, named',
  (await texts('anotoki-audit-log-page [data-entries] tbody tr td[data-label="Who"]')).slice(0, 3).every((who) => who === OWNER.username),
  JSON.stringify((await texts('anotoki-audit-log-page [data-entries] tbody tr td[data-label="Who"]')).slice(0, 3)),
);
// (No expectNoKeys here: an entry's details name the keys of the strings saved - home.title - as they must.)
await screenshots('admin-audit-1280', false);
await viewport(390);
await sleep(400);
await expectNoSideways('the audit log, 390 px');
await screenshots('admin-audit-390');
await viewport(1280);
await setIam({ anonymized: [] });

// ═══ Terms, Privacy and Contact ════════════════════════════════════════════
// The anotoki family's legal pages (@anotoki/lib/legal/pages, anotoki-lib 0.6.0) around the survey's facts
// (shared/legal/legal-facts.ts), and its About and Support pages (anotoki-lib 0.8.0) in the same frame: anybody's -
// nobody signed in and the IAM requiring a sign-in here (and told to turn one down: a trip there would end on the
// screen of a failed sign-in), each opens with no trip to the IAM and asks nothing of a survey. The family's footer
// (<anotoki-site-footer>, anotoki-lib 0.6.3) under them, under the survey's own pages (the card of a session that
// ended too) and under the admin panel: "Version X · What's new · Feedback", then About · Support · Terms · Privacy ·
// Contact - What's new the survey's own dialog, Feedback the family's form, anybody's here; the anotoki account's
// Privacy page and account page at the IAM the site signs in with; at 1280 and 390 px, light and dark, in English and
// in Slovak - no key where a word should be.
const LEGAL = {
  en: {
    terms: 'Terms of use',
    privacy: 'Privacy policy',
    contact: 'Contact',
    about: 'About anotoki',
    support: 'Support anotoki',
    links: ['About', 'Support', 'Terms', 'Privacy', 'Contact'],
    site: 'anotoki survey',
  },
  sk: {
    terms: 'Podmienky používania',
    privacy: 'Ochrana osobných údajov',
    contact: 'Kontakt',
    about: 'O projekte anotoki',
    support: 'Podporiť anotoki',
    links: ['O projekte', 'Podporiť', 'Podmienky', 'Súkromie', 'Kontakt'],
    site: 'anotoki prieskum',
  },
};
const legalHeading = () => text('app-legal-layout main h1');
const footerLinks = (frame) => texts(`${frame} anotoki-site-footer .anotoki-legal-links__link`);
/** The footer in the window, at the foot of the page - for a look at it beside the build analyzer's. */
async function footerShot(name) {
  await js("document.querySelector('anotoki-site-footer')?.scrollIntoView({ block: 'end', behavior: 'instant' }); true");
  await sleep(250);
  await screenshot(name);
  await js("window.scrollTo({ top: 0, behavior: 'instant' }); true");
}
await setIam({ deny: true });
await forgetSession();
await js('sessionStorage.clear(); true');
for (const code of ['en', 'sk']) {
  const words = LEGAL[code];
  for (const width of [1280, 390]) {
    await viewport(width);
    for (const legal of ['terms', 'privacy', 'contact', 'about', 'support']) {
      since = requested.length;
      await go(`/${legal}?lang=${code}`);
      await waitFor(page, `(document.querySelector('app-legal-layout main h1')?.textContent ?? '').trim() === ${JSON.stringify(words[legal])}`, 15000).catch(() => null);
      await sleep(300);
      trip = requested.slice(since);
      expect(
        `${code}, ${width} px, /${legal}, nobody signed in, a sign-in required: the page - its heading, the tab - with no trip to the IAM and nothing of a survey asked`,
        (await legalHeading()) === words[legal] &&
          (await js('location.pathname')) === `/${legal}` &&
          (await js('document.title')) === `${words[legal]} · ${words.site}` &&
          !trip.some((line) => line.startsWith('GET /api/oidc/authorize') || line.startsWith('GET /api/surveys')) &&
          !(await js(FAILURE_SCREEN)),
        `${await legalHeading()} / ${await js('location.pathname')} / tab: ${await js('document.title')} / ${trip.filter((line) => line.includes('/api/')).join(', ')}`,
      );
      expect(
        `${code}, ${width} px, /${legal}: the family's footer - "${FOOTER_ROW[code].filter((part) => part !== '·').join(' · ')}", then About · Support · Terms · Privacy · Contact, this page's marked`,
        same(await footerRow('app-legal-layout'), FOOTER_ROW[code]) &&
          same(await footerLinks('app-legal-layout'), words.links) &&
          (await js("document.querySelector('app-legal-layout anotoki-site-footer [aria-current=page]')?.getAttribute('href')")) === `/${legal}`,
        `${JSON.stringify(await footerRow('app-legal-layout'))} / ${JSON.stringify(await footerLinks('app-legal-layout'))}`,
      );
      expect(
        `${code}, ${width} px, /${legal}: nobody signed in - the top bar offers Sign in`,
        (await js("!!document.querySelector('app-top-bar .anotoki-top-bar__sign-in, app-top-bar .anotoki-top-bar__menu-button')")) && !(await js(SIGNED_IN)),
      );
      await expectNoKeys(`${code}, ${width} px, /${legal}`);
      await expectBar(`${code}, ${width} px, /${legal}`);
      await screenshots(`${code}-${width}-legal-${legal}`);
      if (legal === 'terms') {
        // The footer up close, for a look beside the build analyzer's: light in English, dark in Slovak.
        await theme(code === 'sk' ? 'dark' : 'light');
        await footerShot(`${code}-${width}-footer-legal-${code === 'sk' ? 'dark' : 'light'}`);
        await theme('light');
      }
    }
  }
}

// The footer's What's new: the survey's own dialog (shared/ui/changelog-dialog, loaded with the press) - every version, the
// newest first and marked, in the reader's language (the 0.4.0 entry whole in formal Slovak). And its Feedback: the
// family's form in the kit's dialog, named by the button - for nobody signed in too, the IAM requiring a sign-in and
// told to turn one down: no "without my name", no address written in, no trip to the IAM; Cancel closes it.
for (const [code, width] of [
  ['en', 1280],
  ['sk', 390],
]) {
  await viewport(width);
  await go(`/terms?lang=${code}`);
  await waitFor(page, `(document.querySelector('app-legal-layout main h1')?.textContent ?? '').trim() === ${JSON.stringify(LEGAL[code].terms)}`, 15000);
  since = requested.length;
  await focus('anotoki-site-footer [data-whats-new]');
  await js("document.querySelector('anotoki-site-footer [data-whats-new]').click(); true");
  await waitFor(page, "!!document.querySelector('app-changelog-dialog .release')", 15000).catch(() => null);
  await sleep(400);
  const releases = await texts('app-changelog-dialog .release .version');
  expect(
    `${code}, ${width} px: What's new from the footer - the survey's own dialog, the newest version first and marked, in the reader's language`,
    (await text('dialog[open] .anotoki-dialog__title')) === (code === 'sk' ? 'Čo je nové' : "What's new") &&
      releases[0] === (code === 'sk' ? `Verzia ${VERSION}` : `Version ${VERSION}`) &&
      (await text('app-changelog-dialog .release.latest anotoki-badge')) === (code === 'sk' ? 'Najnovšia' : 'Latest') &&
      (await js("document.querySelector('app-changelog-dialog .release.latest .changes')?.hasAttribute('lang') ?? true")) === false &&
      !requested.slice(since).some((line) => line.startsWith('GET /api/oidc/authorize')),
    `${await text('dialog[open] .anotoki-dialog__title')} / ${JSON.stringify(releases)} / ${await text('app-changelog-dialog .release.latest anotoki-badge')}`,
  );
  await expectNoKeys(`${code}, ${width} px, What's new`);
  await expectNoSideways(`${code}, ${width} px, What's new`);
  await theme(code === 'sk' ? 'dark' : 'light');
  await screenshot(`${code}-${width}-whats-new-${code === 'sk' ? 'dark' : 'light'}`);
  await theme('light');
  await escape();
  await sleep(300);
  expect(
    `${code}, ${width} px: What's new closed, the focus back on the footer's What's new`,
    !(await js("!!document.querySelector('app-changelog-dialog')")) && (await js("document.activeElement?.hasAttribute('data-whats-new') ?? false")),
  );

  await focus('anotoki-site-footer [data-open-feedback]');
  await js("document.querySelector('anotoki-site-footer [data-open-feedback]').click(); true");
  await waitFor(page, "!!document.querySelector('anotoki-site-footer [data-feedback-dialog] anotoki-feedback-form [data-message] textarea')", 15000).catch(() => null);
  await sleep(400);
  expect(
    `${code}, ${width} px: Feedback from the footer - the family's form in the kit's dialog, named by the button, for nobody signed in: no "without my name", no address written in`,
    (await text('anotoki-site-footer [data-feedback-dialog] .anotoki-dialog__title')) === FOOTER_ROW[code][4] &&
      !(await js("!!document.querySelector('[data-feedback-dialog] [data-anonymous]')")) &&
      (await js("document.querySelector('[data-feedback-dialog] [data-email] input')?.value")) === '' &&
      (code === 'en' || (await text('[data-feedback-dialog] .anotoki-feedback-form__lead')) === 'Niečo nefunguje, máte nápad alebo otázku? Napíšte nám – čítame každú správu.') &&
      !requested.slice(since).some((line) => line.startsWith('GET /api/oidc/authorize')),
    `${await text('anotoki-site-footer [data-feedback-dialog] .anotoki-dialog__title')} / ${await text('[data-feedback-dialog] .anotoki-feedback-form__lead')}`,
  );
  await expectNoKeys(`${code}, ${width} px, the footer's feedback form`);
  await theme(code === 'sk' ? 'dark' : 'light');
  await screenshot(`${code}-${width}-footer-feedback-${code === 'sk' ? 'dark' : 'light'}`);
  await theme('light');
  await js("document.querySelector('[data-feedback-dialog] [data-cancel]').click(); true");
  await sleep(400);
  expect(
    `${code}, ${width} px: the footer's form closed by its Cancel, the focus back on Feedback`,
    !(await js("!!document.querySelector('[data-feedback-dialog]')")) &&
      (await js("document.activeElement?.closest('anotoki-site-footer') !== null && document.activeElement?.hasAttribute('data-open-feedback')")),
    await js('document.activeElement?.outerHTML?.slice(0, 80) ?? null'),
  );
}
await viewport(1280);
// What the pages link to: the anotoki account's - at the IAM the site signs in with -, the family's address.
await viewport(1280);
await go('/privacy?lang=en');
await waitFor(page, `(document.querySelector('app-legal-layout main h1')?.textContent ?? '').trim() === 'Privacy policy'`, 15000);
expect(
  "Privacy: the anotoki account's own Privacy page and account page are the IAM's, the site's parts in order - feedback among them -, its storage by name, the hosting company and Cloudflare",
  (await js("document.querySelector('[data-account-privacy]')?.getAttribute('href')")) === `${iam}/privacy` &&
    (await js("document.querySelector('[data-account-page]')?.getAttribute('href')")) === `${iam}/account` &&
    same(await js("[...document.querySelectorAll('[data-kept]')].map((part) => part.getAttribute('data-kept'))"), [
      'data-0',
      'data-1',
      'data-2',
      'visitors',
      'feedback',
      'error-log',
      'audit-log',
      'backups',
    ]) &&
    (await texts('[data-stored] code')).includes('anotoki-survey:visitor') &&
    same(await texts('[data-recipient] .anotoki-legal-page__item-name'), ['WebSupport s.r.o.', 'Cloudflare, Inc.']),
  `${await js("document.querySelector('[data-account-privacy]')?.getAttribute('href')")} / ${await js("document.querySelector('[data-account-page]')?.getAttribute('href')")} / ${JSON.stringify(await js("[...document.querySelectorAll('[data-kept]')].map((part) => part.getAttribute('data-kept'))"))} / ${JSON.stringify(await texts('[data-recipient] .anotoki-legal-page__item-name'))}`,
);
expect(
  "Privacy: what a feedback message keeps in the library's words - a reply address only if the sender leaves one - and how long in the site's: at the next clean-up after 30 or 365 days",
  ((await text('[data-kept="feedback"]')) ?? '').includes('a reply address only if the sender leaves one') &&
    ((await text('[data-duration="feedback"] dd')) ?? '').startsWith('Until it is dealt with. A message marked as spam goes 30 days after that, a resolved one 365 days after - at the next clean-up'),
  await text('[data-duration="feedback"] dd'),
);
const visitorDays = (await (await fetch(`${origin}/api/auth/config`)).json()).visitor_days;
expect(
  "Privacy: a visitor's key ends the days after the last visit the server says (GET /api/auth/config's visitor_days)",
  ((await text('[data-duration="visitors"] dd')) ?? '').startsWith(`${visitorDays} days after your last visit`),
  `${visitorDays}: ${await text('[data-duration="visitors"] dd')}`,
);
await go('/contact?lang=en');
await waitFor(page, `(document.querySelector('app-legal-layout main h1')?.textContent ?? '').trim() === 'Contact'`, 15000);
expect(
  'Contact: the feedback form first ("Found a bug or have an idea?"), then the address for everything else, and the anotoki account to delete the account',
  (await text('[data-section="feedback"] h2')) === 'Found a bug or have an idea?' &&
    (await text('[data-open-feedback]')) === 'Send feedback' &&
    (await text('[data-section="email"] h2')) === 'Everything else' &&
    (await js("document.querySelector('[data-section=\"email\"] a')?.getAttribute('href')")) === 'mailto:support@anotoki.eu' &&
    (await js("document.querySelector('[data-account-page]')?.getAttribute('href')")) === `${iam}/account`,
  `${await text('[data-section="feedback"] h2')} / ${await js("document.querySelector('[data-section=\"email\"] a')?.getAttribute('href')")} / ${await js("document.querySelector('[data-account-page]')?.getAttribute('href')")}`,
);
// Its button opens the family's form (@anotoki/lib/feedback/form, its code loaded with the press) in the kit's dialog -
// for nobody signed in too, the IAM requiring a sign-in and told to turn one down: no "without my name" (no name to
// leave out), no address written in. Sent: the thanks in place - POST /api/feedback, with no trip to the IAM.
const FEEDBACK_SENT = 'The browser check: the Next button could be bigger on a phone.';
since = requested.length;
expect('"Send feedback"', (await clickText('[data-open-feedback]', 'Send feedback')) === true);
await waitFor(page, "!!document.querySelector('[data-feedback-dialog] anotoki-feedback-form [data-message] textarea')", 15000);
await sleep(400);
expect(
  'the feedback form, in the kit\'s dialog: the kinds, the subject, the message, an address left empty - no "without my name" for nobody',
  (await text('[data-feedback-dialog] .anotoki-dialog__title')) === 'Send feedback' &&
    same(await texts('[data-feedback-dialog] [data-kind] label'), ['Something does not work', 'An idea', 'Something else']) &&
    !(await js("!!document.querySelector('[data-feedback-dialog] [data-anonymous]')")) &&
    (await js("document.querySelector('[data-feedback-dialog] [data-email] input')?.value")) === '',
  `${await text('[data-feedback-dialog] .anotoki-dialog__title')} / ${JSON.stringify(await texts('[data-feedback-dialog] [data-kind] label'))} / email "${await js("document.querySelector('[data-feedback-dialog] [data-email] input')?.value")}"`,
);
await expectNoKeys('the feedback form');
await screenshots('en-1280-contact-feedback-form', false);
await fill('[data-feedback-dialog] [data-message] textarea', FEEDBACK_SENT);
await js("document.querySelector('[data-feedback-dialog] [data-send]').click(); true");
await waitFor(page, "!!document.querySelector('[data-feedback-dialog] [data-thanks]')", 15000).catch(() => null);
await sleep(400);
trip = requested.slice(since);
expect(
  '... sent, by nobody: the thanks in place - POST /api/feedback, no trip to the IAM',
  (await text('[data-feedback-dialog] [data-thanks] .anotoki-feedback-form__thanks-title')) === 'Thank you!' &&
    trip.includes('POST /api/feedback') &&
    !trip.some((line) => line.startsWith('GET /api/oidc/authorize')),
  `${await text('[data-feedback-dialog] [data-thanks]')} / ${trip.filter((line) => line.includes('/api/')).join(', ')}`,
);
await screenshot('en-1280-contact-feedback-sent');
// The Contact page's dialog closes by its own X (the form there has no Cancel or Close of its own).
await js("document.querySelector('[data-feedback-dialog] .anotoki-dialog__close').click(); true");
await sleep(500);
expect(
  '... closed, the focus back on "Send feedback"',
  !(await js("!!document.querySelector('[data-feedback-dialog]')")) && (await js("document.activeElement?.hasAttribute('data-open-feedback') ?? false")),
  await js('document.activeElement?.outerHTML?.slice(0, 80) ?? null'),
);
// In Slovak, on a phone: the form in this site's formal Slovak - never the library's ty.
await viewport(390);
await go('/contact?lang=sk');
await waitFor(page, `(document.querySelector('app-legal-layout main h1')?.textContent ?? '').trim() === 'Kontakt'`, 15000);
await clickText('[data-open-feedback]', 'Poslať spätnú väzbu');
await waitFor(page, "!!document.querySelector('[data-feedback-dialog] anotoki-feedback-form [data-message] textarea')", 15000);
await sleep(400);
expect(
  'the feedback form in Slovak: formal - "Niečo nefunguje, máte nápad alebo otázku? Napíšte nám", "Vaša správa" - never the library\'s ty',
  (await text('[data-feedback-dialog] .anotoki-feedback-form__lead')) === 'Niečo nefunguje, máte nápad alebo otázku? Napíšte nám – čítame každú správu.' &&
    ((await text('[data-feedback-dialog] [data-message] label')) ?? '').startsWith('Vaša správa') &&
    ((await text('[data-feedback-dialog] [data-email] label')) ?? '').startsWith('Vaša e-mailová adresa') &&
    // A word's ends by letters, not by \b, which takes "š" for no letter and finds "napíš" in "Napíšte".
    !/(^|[^\p{L}])(máš|napíš|pošli|tvoj|tvoja|chceš|skús)(?![\p{L}])/iu.test((await text('[data-feedback-dialog]')) ?? ''),
  `${await text('[data-feedback-dialog] .anotoki-feedback-form__lead')} / ${await text('[data-feedback-dialog] [data-message] label')} / ${await text('[data-feedback-dialog] [data-email] label')}`,
);
await expectNoKeys('the feedback form, in Slovak');
await expectNoSideways('the feedback form, 390 px');
await screenshots('sk-390-contact-feedback-form', false);
await js("document.querySelector('[data-feedback-dialog] .anotoki-dialog__close').click(); true");
await sleep(300);
await viewport(1280);
// The footer under the survey's own pages: signed in - at 1280 and 390 px, light in English and dark in Slovak - and
// on the card of a session that ended there.
await setIam({ user: OWNER, deny: false });
for (const [code, scheme] of [
  ['en', 'light'],
  ['sk', 'dark'],
]) {
  for (const width of [1280, 390]) {
    await viewport(width);
    await go(`/?lang=${code}`);
    await waitFor(page, SIGNED_IN + " && !!document.querySelector('app-survey-home h1')", 15000);
    expect(
      `the survey's home page, signed in, ${code}, ${width} px: the family's footer - "${FOOTER_ROW[code].filter((part) => part !== '·').join(' · ')}", then About · Support · Terms · Privacy · Contact`,
      same(await footerRow('app-participant-layout'), FOOTER_ROW[code]) && same(await footerLinks('app-participant-layout'), LEGAL[code].links),
      `${JSON.stringify(await footerRow('app-participant-layout'))} / ${JSON.stringify(await footerLinks('app-participant-layout'))}`,
    );
    await expectNoSideways(`the home page's footer, ${code}, ${width} px`);
    await theme(scheme);
    await screenshot(`${code}-${width}-home-footer-${scheme}`, true);
    await footerShot(`${code}-${width}-footer-home-${scheme}`);
    await theme('light');
  }
}
await viewport(1280);
await go('/?lang=en');
await waitFor(page, SIGNED_IN + " && !!document.querySelector('app-survey-home h1')", 15000);
await sessionEndsOn('/');
expect(
  "the card of a session that ended: the footer still under it - Feedback too, anybody's here -, its Privacy reached with no sign-in",
  same(await footerRow('app-participant-layout'), FOOTER_ROW.en) && same(await footerLinks('app-participant-layout'), LEGAL.en.links),
  `${JSON.stringify(await footerRow('app-participant-layout'))} / ${JSON.stringify(await footerLinks('app-participant-layout'))}`,
);
await clickText('app-participant-layout anotoki-site-footer .anotoki-legal-links__link', 'Privacy');
await waitFor(page, `(document.querySelector('app-legal-layout main h1')?.textContent ?? '').trim() === 'Privacy policy'`, 15000).catch(() => null);
expect(
  '... and Privacy opens from it, nobody signed in',
  (await legalHeading()) === 'Privacy policy' && (await js('location.pathname')) === '/privacy',
  `${await legalHeading()} / ${await js('location.pathname')}`,
);
await signInAs(OWNER);

// The footer under the admin panel too (the owner, 2026-10-18: the family's footer in every admin panel) - in English
// like the rest of the panel, from a Slovak tab as well; at 1280 and 390 px, light and dark. Its What's new is the
// survey's own dialog, in English there.
for (const width of [1280, 390]) {
  await viewport(width);
  await go('/admin?lang=sk');
  await waitFor(page, "!!document.querySelector('app-surveys-list')", 15000);
  await sleep(400);
  expect(
    `the admin panel, ${width} px, from a Slovak tab: the family's footer under it, in English - "${FOOTER_ROW.en.filter((part) => part !== '·').join(' · ')}", then About · Support · Terms · Privacy · Contact`,
    same(await footerRow('app-admin-layout'), FOOTER_ROW.en) &&
      same(await footerLinks('app-admin-layout'), LEGAL.en.links) &&
      (await js("!!document.querySelector('app-admin-layout > main + anotoki-site-footer')")),
    `${JSON.stringify(await footerRow('app-admin-layout'))} / ${JSON.stringify(await footerLinks('app-admin-layout'))}`,
  );
  await expectNoKeys(`the admin panel's footer, ${width} px`);
  await expectNoSideways(`the admin panel's footer, ${width} px`);
  await screenshots(`admin-${width}-surveys-footer`);
  await footerShot(`admin-${width}-footer-light`);
  await theme('dark');
  await footerShot(`admin-${width}-footer-dark`);
  await theme('light');
}
await viewport(1280);
await focus('app-admin-layout anotoki-site-footer [data-whats-new]');
await js("document.querySelector('app-admin-layout anotoki-site-footer [data-whats-new]').click(); true");
await waitFor(page, "!!document.querySelector('app-changelog-dialog .release')", 15000).catch(() => null);
await sleep(400);
expect(
  "the admin panel's What's new: the survey's own dialog, in English from the Slovak tab too",
  (await text('dialog[open] .anotoki-dialog__title')) === "What's new" && (await text('app-changelog-dialog .release .version')) === `Version ${VERSION}`,
  `${await text('dialog[open] .anotoki-dialog__title')} / ${await text('app-changelog-dialog .release .version')}`,
);
await screenshot('admin-1280-whats-new-light');
await escape();
await sleep(300);
await go('/?lang=en');
await waitFor(page, SIGNED_IN + " && !!document.querySelector('app-survey-home h1')", 15000);

// ═══ Feedback, on the admin panel ══════════════════════════════════════════
// The message nobody sent from the Contact page: no mail goes out, so the admin panel says it - how many messages
// nobody opened yet beside the bar's System link (the family's FeedbackUnread, asked as the panel opens) and on the
// System page's card. The Feedback page (the family's, @anotoki/lib/admin/feedback) lists it - nobody's, from
// /contact; opened, it is read; marked resolved and deleted after its question, each in the audit log.
await go('/admin');
await waitFor(page, "!!document.querySelector('app-surveys-list')", 15000);
await waitFor(page, '!!document.querySelector(\'app-top-bar .anotoki-top-bar__nav a[href="/admin/system"] .anotoki-top-bar__badge\')', 15000).catch(() => null);
/** The count beside System in the bar, as seen and as heard. */
const systemCount = () =>
  js(
    "(() => { const link = document.querySelector('app-top-bar .anotoki-top-bar__nav a[href=\"/admin/system\"]'); return link ? [link.querySelector('.anotoki-top-bar__badge')?.textContent.trim() ?? null, link.querySelector('.anotoki-visually-hidden')?.textContent.trim() ?? null] : null; })()",
  );
expect(
  'the bar: beside System, how many feedback messages nobody opened yet - "1", heard as "1 new feedback message"',
  same(await systemCount(), ['1', ', 1 new feedback message']),
  JSON.stringify(await systemCount()),
);
for (const width of [761, 960, 961]) {
  await viewport(width);
  await sleep(400);
  await expectBar(`the admin panel with the count beside System, ${width} px`);
  await screenshot(`admin-${width}-bar-feedback-count`);
}
await viewport(390);
await sleep(400);
await expectBar('the admin panel with the count beside System, 390 px');
await screenshots('admin-390-bar-feedback-count', false);
await viewport(1280);
await clickText('app-top-bar .anotoki-top-bar__nav a', 'System');
await waitFor(page, "location.pathname === '/admin/system' && !!document.querySelector('app-system a.item')", 15000);
await waitFor(page, '!!document.querySelector(\'app-system a.item[href="/admin/feedback"] anotoki-badge\')', 15000).catch(() => null);
expect('the System page: Feedback\'s card says "1 new"', (await text('app-system a.item[href="/admin/feedback"] anotoki-badge')) === '1 new', await text('app-system a.item[href="/admin/feedback"]'));
await screenshots('admin-system-feedback-count-1280', false);
expect('the Feedback card', (await clickText('app-system a.item[href="/admin/feedback"]', 'Feedback')) === true);
await waitFor(page, "location.pathname === '/admin/feedback' && !!document.querySelector('anotoki-feedback-page [data-messages] [data-message]')", 15000);
await sleep(500);
const feedbackItems = await texts('anotoki-feedback-page [data-messages] [data-message]');
expect(
  'the Feedback page: the message nobody sent - new, its words, from nobody ("Anonymous"), on /contact - "1 new" above the list, and the tab says the page',
  feedbackItems.length === 1 &&
    feedbackItems[0].startsWith('New') &&
    feedbackItems[0].includes(FEEDBACK_SENT) &&
    feedbackItems[0].includes('From Anonymous · on /contact') &&
    (await text('anotoki-feedback-page [data-counts]')) === '1 new' &&
    (await js('document.title')) === 'Feedback · Admin panel · anotoki survey',
  `${JSON.stringify(feedbackItems)} / ${await text('anotoki-feedback-page [data-counts]')} / ${await js('document.title')}`,
);
await expectNoKeys('the Feedback page');
await screenshots('admin-feedback-1280', false);
await js("document.querySelector('anotoki-feedback-page [data-messages] [data-message]').click(); true");
await waitFor(page, "!!document.querySelector('anotoki-feedback-page [data-viewer] dialog[open] [data-words]')", 15000);
await sleep(600);
/** The opened message's facts, each "name: value" - its <dt> and <dd> (Angular leaves no space between them). */
const feedbackFacts = () =>
  js(
    "[...document.querySelectorAll('anotoki-feedback-page [data-viewer] [data-facts] > div')].map((fact) => (fact.querySelector('dt')?.textContent.trim() ?? '') + ': ' + (fact.querySelector('dd')?.textContent.replace(/\\s+/g, ' ').trim() ?? ''))",
  );
const openedFacts = await feedbackFacts();
expect(
  'opened: its words whole, from nobody ("Anonymous"), its page and language - no address, for none was written - and it is read now: nothing new beside System',
  (await text('anotoki-feedback-page [data-viewer] [data-words]')) === FEEDBACK_SENT &&
    openedFacts.includes('From: Anonymous') &&
    openedFacts.includes('Page: /contact') &&
    openedFacts.includes('Language: en') &&
    !openedFacts.some((fact) => fact.startsWith('Answer at')) &&
    (await systemCount())?.[0] === null,
  `${JSON.stringify(openedFacts)} / ${JSON.stringify(await systemCount())}`,
);
await screenshot('admin-feedback-open-1280');
await clickText('anotoki-feedback-page [data-viewer] [data-mark] button', 'Resolved');
await waitFor(page, "(document.querySelector('anotoki-feedback-page [data-happened]')?.textContent ?? '').trim() !== ''", 15000).catch(() => null);
await sleep(500);
const lastMarked = (await feedbackFacts()).find((fact) => fact.startsWith('Last marked: ')) ?? '';
expect(
  'marked resolved: said in the page, and by whom',
  (await text('anotoki-feedback-page [data-happened]')) === `"${FEEDBACK_SENT}" is resolved now.` && lastMarked.endsWith(`by ${OWNER.username}`),
  `${await text('anotoki-feedback-page [data-happened]')} / ${lastMarked}`,
);
await js("document.querySelector('anotoki-feedback-page [data-viewer] [data-delete]').click(); true");
await waitFor(page, "!!document.querySelector('anotoki-feedback-page [data-question] dialog[open]')", 15000);
await sleep(300);
await js("document.querySelector('anotoki-feedback-page [data-question] [data-question-yes]').click(); true");
await waitFor(page, "!!document.querySelector('anotoki-feedback-page [data-empty]')", 15000).catch(() => null);
await sleep(400);
expect('deleted after its question: no feedback left', (await text('anotoki-feedback-page [data-empty] .anotoki-empty-state__heading')) === 'No feedback yet', await text('anotoki-feedback-page'));
// The audit log's action filter is a prefix: "feedback." is every feedback entry.
const feedbackAudit = (await (await asOwner('GET', '/api/admin/audit?action=feedback.')).json()).items ?? [];
expect(
  '... and the audit log has the mark and the delete, by the owner',
  same(feedbackAudit.map((entry) => entry.action).sort(), ['feedback.deleted', 'feedback.status_changed']) && feedbackAudit.every((entry) => Number(entry.actor_id) === OWNER.id),
  JSON.stringify(feedbackAudit.map((entry) => [entry.action, entry.actor_id])),
);
await viewport(390);
await sleep(400);
await expectNoSideways('the Feedback page, 390 px');
await screenshots('admin-feedback-390');
await viewport(1280);

// ═══ The pages drawn instead of the site ═══════════════════════════════════
// A browser that has never been here - nothing stored, so no strings kept from an earlier visit - and a site that
// is not set up: every request answered as the backend's gate answers it (the family's, @anotoki/lib). Never
// installed: the family's page "This site is not set up yet", with the way to the setup page; set up once on a real
// host (storage/installed.lock) and its settings gone since: never the setup page again - "not available right
// now", asking again by itself. The tab is named by the site, never by a key, whichever page was asked for. Each such
// page is bare - no top bar, no footer - as the family's page is while an update waits.
await viewport(390);
await js('localStorage.clear(); sessionStorage.clear(); true');
/** The backend of a site that is not set up, as its gate answers: the status, and every other address. */
const notSetUp = (installed) => (request) =>
  new URL(request.url).pathname === '/api/site-status'
    ? { status: 200, body: { state: 'not_set_up', installed } }
    : {
        status: 503,
        body: installed
          ? { code: 'not_set_up', installed, message: 'The site is not available right now. Try again in a few minutes.' }
          : { code: 'not_set_up', installed, message: 'This site is not set up yet. Its setup page connects it to its database.', setup: '/setup.php' },
      };
/** A tab's title with nothing shaped like a key in it, that ends with the site's name. */
const titled = (title) => title.endsWith('anotoki survey') && !/[a-z][A-Za-z0-9]*\.[A-Za-z0-9]/.test(title);
await intercept('*/api/*', notSetUp(false));
for (const [path, what] of [
  ['/', 'the home page'],
  ['/nothing/here', 'an address the site does not know'],
  ['/admin', 'the admin area'],
]) {
  await go(path);
  await waitFor(page, "!!document.querySelector('anotoki-site-status h1')", 15000);
  await sleep(900);
  const title = await js('document.title');
  expect(
    `not set up and never installed, nothing stored, ${what}: the family's page says so in English, bare - no top bar, no footer -, with the way to the setup page - and the tab is named by the site, not a key`,
    (await text('anotoki-site-status h1')) === 'This site is not set up yet' &&
      (await js("document.querySelector('anotoki-site-status a')?.getAttribute('href')")) === '/setup.php' &&
      (await framesDrawn()) === 0 &&
      titled(title) &&
      (await pageLanguage()) === 'en',
    `${await text('anotoki-site-status h1')} / [${await statusActions()}] / frames ${await framesDrawn()} / tab: ${title} / ${await pageLanguage()}`,
  );
  await expectNoKeys(`not set up, ${what}`);
  if (path === '/') {
    await expectNoSideways('not set up, 390 px');
    await screenshots('en-390-not-set-up');
  }
}
await intercept('*/api/*', notSetUp(true));
await go('/');
await waitFor(page, "!!document.querySelector('anotoki-site-status h1')", 15000);
await sleep(900);
expect(
  'not set up, but installed once: "not available right now", bare, asking again by itself - and never the way to the setup page',
  (await text('anotoki-site-status h1')) === 'The site is not available right now' &&
    (await statusActions()) === 'Try again' &&
    (await setupLink()) === 0 &&
    (await framesDrawn()) === 0 &&
    titled(await js('document.title')),
  `${await text('anotoki-site-status h1')} / [${await statusActions()}] / frames ${await framesDrawn()} / tab: ${await js('document.title')}`,
);
await expectNoKeys('not set up, installed once');
await screenshots('en-390-not-available');

// A server that does not answer at all - its status neither: the family's page, "not available right now". The
// server back, "Try again": the page loads again, and the page that was asked for is drawn - through the sign-in.
expected = [/The sign-in settings could not be loaded/];
await intercept('*/api/*', () => 'unreachable');
await setIamUser(OWNER);
await go('/admin/languages');
await waitFor(page, "!!document.querySelector('anotoki-site-status h1')", 15000);
await sleep(900);
expect(
  'out of reach, nothing stored: "not available right now" in English, bare, at the address asked for - and the tab is not a key',
  (await text('anotoki-site-status h1')) === 'The site is not available right now' &&
    (await statusActions()) === 'Try again' &&
    (await js('location.pathname')) === '/admin/languages' &&
    (await framesDrawn()) === 0 &&
    titled(await js('document.title')),
  `${await text('anotoki-site-status h1')} / ${await js('location.pathname')} / frames ${await framesDrawn()} / tab: ${await js('document.title')}`,
);
await expectNoKeys('out of reach');
await expectNoSideways('out of reach, 390 px');
await screenshots('en-390-unavailable');
await stopIntercepting();
expect('try again', (await clickText('anotoki-site-status button', 'Try again')) === true);
await waitFor(page, `location.pathname === '/admin/languages' && ${languageRows(2)}`, 20000);
await sleep(400);
expect(
  '"Try again", the server back: the page asked for - through the sign-in - not a blank one',
  (await whoIsIn()) === OWNER.username && (await js('document.title')).startsWith('Languages · '),
  `${await whoIsIn()} / ${await js('document.title')}`,
);

// A server whose status answers while the sign-in's settings do not: the site's own card, "cannot be reached" - whose
// "Try again" opens the page that was asked for, though the router never reached it.
await js('localStorage.clear(); sessionStorage.clear(); true');
await intercept('*/api/*', (request) => (new URL(request.url).pathname === '/api/site-status' ? null : 'unreachable'));
await go('/admin/languages');
await waitFor(page, "!!document.querySelector('app-load-error h1')", 15000);
await sleep(900);
expect(
  "the status answering, the sign-in's settings not: the site's own card, in English, bare, and the tab is not a key",
  (await text('app-load-error h1')) === 'The survey site cannot be reached' &&
    !(await js("!!document.querySelector('anotoki-site-status')")) &&
    (await framesDrawn()) === 0 &&
    !/\w\.\w/.test(await js('document.title')),
  `${await text('app-load-error h1')} / frames ${await framesDrawn()} / tab: ${await js('document.title')}`,
);
await expectNoKeys('the sign-in out of reach');
await screenshots('en-390-load-error');
await stopIntercepting();
expect('try again', (await clickText('app-load-error button', 'Try again')) === true);
await waitFor(page, `location.pathname === '/admin/languages' && ${languageRows(2)}`, 20000);
await sleep(400);
expect(
  '"Try again", the server back: the page that was asked for - through the sign-in - not a blank one',
  (await whoIsIn()) === OWNER.username && (await js('document.title')).startsWith('Languages · '),
  `${await whoIsIn()} / ${await js('document.title')}`,
);
expect(
  'the console said only what a server out of reach makes it say',
  heard.length > 0 && heard.every((message) => message.includes('The sign-in settings could not be loaded')),
  heard.join(' | ').slice(0, 300),
);
expected = [];

const unworded = problems.filter((problem) => problem.includes('[i18n] no string for'));
expect('no string was missing ("[i18n] no string for ...")', unworded.length === 0, unworded.join('; ').slice(0, 300));

console.log('\nCHECKS (' + checks + ')');
console.log('PROBLEMS (' + problems.length + '):');
for (const problem of problems) console.log(' -', problem.slice(0, 300));
await page.close();
process.exitCode = problems.length ? 1 : 0;
