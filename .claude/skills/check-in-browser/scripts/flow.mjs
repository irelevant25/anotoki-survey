// The survey site end to end in headless Chrome, signing in through the
// stand-in IAM (backend/tests/tools/fake-iam.php) - never the real one. It
// expects an empty site: run.mjs makes one and starts everything; on its own:
//
//   node flow.mjs <debugging port> <site origin> <fake IAM origin> <png file> <shots folder>
//
// In English (the language pinned through the site itself, /?lang=en): the
// owner (ADMIN) writes a survey with a picture and opens it; somebody with no
// role takes it, once, and is kept out of the admin area; the owner reads the
// answer; an editor gets everything but the delete buttons; a phone-sized page
// has no sideways scroll and a top bar that fits.
//
// Then in Slovak (/?lang=sk): the top bar on a phone, signed out and signed
// in; the home page and a survey, step by step; no key of the bundle on any of
// those pages; the admin area in English all the same; the language of the
// IAM account when nothing is stored here; and the chooser.
//
// Then the translating itself: the owner rewords a string of the site on the
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
// signed out", its links and Back work, the browser does not ask on the way to
// the sign-in), and signing out asks first; a new language starts hidden; the
// editor says what readers of a language get while an open survey lacks a
// text in it - and nothing of the kind once its last day is over - and its
// list of problems is worded for a draft, an open and a closed survey; the
// author saving over a translator's save keeps the translator's texts, and
// keeps their own translation of a question the other version removed; "Save
// mine over it" is not offered where the server would refuse it; a preview
// from the editor's main tab shows the survey as it is written, whatever the
// page's language; answers sent to an address the survey has left are said to
// be kept, and offered again at its new address; and the two pages drawn
// instead of the site - not set up, out of reach - name the tab by the site,
// never by a key, and "Try again" opens the page that was asked for.
//
// Prints ok/FAIL per check and every page error. A console warning is a
// problem too - "[i18n] no string for ..." is how a missing string shows.

import { mkdirSync, writeFileSync } from 'node:fs';
import { openPage, sleep, waitFor } from './cdp.mjs';

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
 * purpose: expressions for the messages, which are then kept here (`heard`) instead of counted as problems.
 */
let expected = [];
const heard = [];
page.on('Runtime.exceptionThrown', (e) => problems.push('exception: ' + (e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text)));
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
page.on('Network.requestWillBeSent', (e) => {
  try {
    requested.push(`${e.request.method} ${new URL(e.request.url).pathname}`);
  } catch {
    // an address that is not one (about:blank, data:)
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
      responseHeaders: [{ name: 'Content-Type', value: json ? 'application/json' : 'text/html; charset=utf-8' }, { name: 'Cache-Control', value: 'no-store' }],
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
  js(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.textContent.replace(/\\s+/g,' ').trim().includes(${JSON.stringify(text)})); if (!el) return 'missing: ' + ${JSON.stringify(text)}; el.scrollIntoView({block:'center'}); el.click(); return true; })()`);
async function focus(selector, index = 0) {
  const done = await js(`(() => { const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}]; if (!el) return false; el.scrollIntoView({block:'center'}); el.focus(); return document.activeElement === el || el.contains(document.activeElement); })()`);
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
  const done = await js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.scrollIntoView({block:'center'}); el.focus(); el.select(); return document.activeElement === el; })()`);
  if (!done) problems.push(`could not fill ${selector}`);
  await sleep(150);
  await typeText(value);
}
/** The editor has saved everything changed so far (the header says so only once the save after the last change is back). */
const saved = () => waitFor(page, "(document.querySelector('app-survey-header .save')?.textContent ?? '').includes('Saved')", 15000);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** The stand-in IAM told how to behave: who signs in next ({user}), whether it still renews a session ({refuse}). */
const setIam = async (changes) => (await fetch(`${iam}/_test/state`, { method: 'POST', body: JSON.stringify(changes) })).ok;
const setIamUser = (user) => setIam({ user });
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

// ── The language ────────────────────────────────────────────────────────────

/** The words the check clicks and reads in each language - the strings of migration 003. */
const EN = { code: 'en', signIn: 'Sign in', signOut: 'Sign out', home: 'Have your say' };
const SK = { code: 'sk', signIn: 'Prihlásiť sa', signOut: 'Odhlásiť sa', home: 'Povedzte nám svoj názor' };

const LANGUAGE_KEY = 'anotoki-survey:language';
const pageLanguage = () => js('document.documentElement.lang');
/** What is kept about the language: by the chooser on this device, and by ?lang= for this tab. */
const storedLanguage = () => js(`[localStorage.getItem(${JSON.stringify(LANGUAGE_KEY)}), sessionStorage.getItem(${JSON.stringify(LANGUAGE_KEY)})].join(' / ')`);

// Every key the site has a string for, and their namespaces: what must never be read on a page.
const bundle = await (await fetch(`${origin}/api/translations/sk`)).json();
const KEYS = [...new Set([...Object.keys(bundle.values ?? {}), ...Object.keys(bundle.english ?? {})])];
const NAMESPACES = [...new Set(KEYS.map((key) => key.split('.')[0]))];
expect('the site has its strings, in English and in Slovak', KEYS.length > 100 && bundle.language === 'sk' && bundle.languages?.length === 2, `${KEYS.length} keys, ${bundle.language}, ${bundle.languages?.map((l) => l.code)}`);

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
    const inner = document.querySelector('app-top-bar .topbar-inner');
    if (!inner) return { ok: false, detail: 'no top bar' };
    const names = ['app-brand', 'app-language-switcher', 'app-theme-toggle', '.user-button', 'button.btn-primary'];
    const parts = names.map((name) => [name, inner.querySelector(name)]).filter(([, el]) => el);
    const rects = parts.map(([, el]) => el.getBoundingClientRect());
    const width = window.innerWidth;
    const inside = rects.every((r) => r.left >= 0 && r.right <= width + 0.5);
    const apart = rects.every((r, i) => i === 0 || r.left >= rects[i - 1].right - 0.5);
    const padding = (el, side) => parseFloat(getComputedStyle(el)['padding' + side]);
    const button = inner.querySelector('button.btn-primary');
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
      detail: (roomy ? '' : 'the button is squeezed; ') + (held ? '' : 'more than the bar holds; ') + parts.map(([name], i) => name.replace('app-', '').replace('button.btn-primary', 'sign-in') + ' ' + Math.round(rects[i].left) + '-' + Math.round(rects[i].right)).join(', ') + ' of ' + width,
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
const expectNoSideways = async (where) => expect(`${where}: no sideways scroll`, await js('document.documentElement.scrollWidth <= window.innerWidth'), await js('document.documentElement.scrollWidth + " of " + window.innerWidth'));

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
  await js("document.querySelector('app-language-switcher .switcher').click(); true");
  await sleep(300);
  const chosen = await clickText('app-language-switcher [role=menuitemradio]', nativeName);
  if (chosen !== true) problems.push(`the chooser has no ${nativeName}: ${chosen}`);
  await waitFor(page, `document.documentElement.lang === ${JSON.stringify(code)}`, 15000);
  await sleep(400);
}

/** An answer of the step on the page, by the value the server knows it by (an option's id; "female", "25-34" for the step about the reader). */
async function pick(value) {
  const done = await js(`(() => { const el = document.querySelector(${JSON.stringify(`app-take-survey input[value="${value}"]`)}); if (!el) return false; el.scrollIntoView({block:'center'}); el.click(); return true; })()`);
  if (!done) problems.push(`no answer "${value}" on the page`);
  await sleep(200);
}
/** The labels of the options that are chosen on the page. */
const chosenLabels = () => js("[...document.querySelectorAll('app-question-block label.option')].filter((o) => o.querySelector('input').checked).map((o) => o.querySelector('.label').textContent.trim())");

// ── Signing in and out ──────────────────────────────────────────────────────

async function openUserMenu() {
  await js("document.querySelector('app-top-bar .user-button').click(); true");
  await sleep(300);
}

/** Out through the person's menu (the stand-in IAM's logout comes back to /); nothing to do when nobody is signed in. */
async function signOut(words) {
  await go('/');
  if (await js("!!document.querySelector('app-top-bar .user-button')")) {
    await openUserMenu();
    await clickText('app-top-bar .menu-item', words.signOut);
    await sleep(1500);
    await settle();
  }
}

/** Signed out of this site, then in again as `user` - by the words of the language the page is in. */
async function signInAs(user, words = EN) {
  await setIamUser(user);
  await signOut(words);
  expect(`signed out before ${user.username}`, await js("!!document.querySelector('app-top-bar button.btn-primary')"));
  await clickText('app-top-bar button', words.signIn);
  await sleep(1500);
  await settle();
  await waitFor(page, "!!document.querySelector('app-top-bar .user-button')", 15000);
  expect(`signed in as ${user.username}`, (await text('app-top-bar .user-name')) === user.username, await text('app-top-bar .user-name'));
}

const OWNER = { id: 1, username: 'owner', roles: ['ADMIN'] };
const PAT = { id: 101, username: 'pat', roles: [] };
const EDITH = { id: 2, username: 'edith', roles: ['EDITOR'] };
// For the Slovak pass. Nina's account is English: her Slovak comes from the link she followed.
const NINA = { id: 102, username: 'nina', roles: [], locale: 'en' };
// Zuzana's account is Slovak - and her name is twenty characters, the longest the bar was measured with.
const ZUZANA = { id: 103, username: 'zuzana-kovacova-2026', roles: [], locale: 'sk' };

// ── Signed out: the top bar offers to sign in; the admin area sends to the IAM ──
await setIamUser(OWNER);
await go('/');
await js('localStorage.clear(); sessionStorage.clear(); true');
// The language is said through the site itself, and holds for the tab from here on.
await go('/?lang=en');
expect('?lang=en: English, kept for this tab only and taken out of the address', (await pageLanguage()) === 'en' && (await storedLanguage()) === ' / en' && (await js('location.search')) === '', `${await pageLanguage()}, ${await storedLanguage()}, ${await js('location.search')}`);
expect('signed out: a Sign in button in the top bar', (await text('app-top-bar button.btn-primary'))?.includes('Sign in'));
expect('the language chooser in the top bar says EN', (await text('app-language-switcher .switcher')) === 'EN', await text('app-language-switcher .switcher'));
expect('no survey is open yet', (await text('app-survey-home'))?.includes('No survey is open right now'));
expect('the tab is named in English', (await js('document.title')) === 'Surveys · anotoki survey', await js('document.title'));
await screenshot('home-signed-out');

await go('/admin');
await sleep(1500);
await settle();
expect('/admin while signed out: signed in through the IAM and back at /admin', (await js('location.pathname')) === '/admin', await js('location.pathname'));
expect('the owner is signed in', (await text('app-top-bar .user-name')) === 'owner');
expect('the admin area shows the surveys (no survey yet)', (await text('app-surveys-list'))?.includes('No surveys yet'), (await text('app-surveys-list'))?.slice(0, 120));
expect('no language chooser in the admin area', !(await js("!!document.querySelector('app-language-switcher')")));
await screenshot('admin-empty');

// ── The user menu ───────────────────────────────────────────────────────────
await openUserMenu();
const menu = await text('app-top-bar .menu');
expect('the menu: name, address, role, account, the open surveys, sign out', ['owner', 'owner@example.test', 'Administrator', 'Your anotoki account', 'The open surveys', 'Sign out'].every((part) => menu?.includes(part)), menu);
expect('the account link goes to the IAM', (await js("document.querySelector('app-top-bar .menu a[target=_blank]')?.href")) === `${iam}/account`, await js("document.querySelector('app-top-bar .menu a[target=_blank]')?.href"));
await screenshot('user-menu');
await escape();
expect('Escape closes the menu', !(await js("!!document.querySelector('app-top-bar .menu')")));

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
expect('a picture under the question', await setFiles("app-question-editor app-image-list-editor input[type=file]", 0, [pngFile]));
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
expect('the picture is served by the server', await js("(() => { const img = document.querySelector('app-question-editor app-image-list-editor img'); return !!img && img.complete && img.naturalWidth > 0 && img.src.includes('/api/images/'); })()"));

expect('open', (await clickText('app-survey-header button', 'Open the survey')) === true);
await sleep(400);
expect('confirm', (await clickText('dialog button', 'Open')) === true);
await waitFor(page, "(document.querySelector('app-survey-header app-badge')?.textContent ?? '').includes('Open')", 15000);
expect('the survey is open', (await text('app-survey-header app-badge')) === 'Open');
const slug = await js("document.querySelector('app-survey-header .address-link').textContent.split('/').pop()");
expect('its address came from the title', slug === 'genshin-6-1-what-next', slug);
await screenshot('opened');

// ── Somebody without a role: takes the survey, once ─────────────────────────
await signInAs(PAT);
// The way into the admin area is an item of the person's menu, for the people who write surveys only.
await openUserMenu();
expect('no way into the admin area in the menu of somebody without a role', (await js("!!document.querySelector('app-top-bar .menu')")) && !(await js("!!document.querySelector('app-top-bar .menu a[href=\"/admin\"]')")), await text('app-top-bar .menu'));
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
expect('the question and its picture', (await text('app-question-block'))?.includes('Which element do you play most?') && (await js("!!document.querySelector('app-question-block app-survey-image img')")));
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
expect('the admin area is not for Pat', (await text('app-admin-layout app-empty-state'))?.includes('for the people who write the surveys'), await text('app-admin-layout app-empty-state'));
await screenshot('no-access');
// The same card on a page that asks before it is left (the Translations page): the page was never drawn, so the
// router asks the guard with no page at all - and the card's link must still go somewhere.
await go('/admin/translations');
expect('the no-access card on the Translations page too', (await text('app-admin-layout app-empty-state'))?.includes('no editor role here'), await text('app-admin-layout app-empty-state'));
await clickText('app-admin-layout app-empty-state a', 'See the open surveys');
await waitFor(page, "location.pathname === '/' && !!document.querySelector('app-survey-home h1')", 15000).catch(() => null);
expect('... and its "See the open surveys" leaves it: the home page', (await js('location.pathname')) === '/' && (await text('app-survey-home h1')) === EN.home, `${await js('location.pathname')} / ${await text('app-survey-home h1')}`);

// ── The owner sees the answer, and may delete it ────────────────────────────
await signInAs(OWNER);
await openUserMenu();
expect('the owner\'s menu, where people take surveys, has the way into the admin area', (await text('app-top-bar .menu a[href="/admin"]')) === 'Admin', await text('app-top-bar .menu'));
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
expect('the drawer opens on Pat\'s answers', !!responseId && (await js("!!document.querySelector('app-drawer app-response-view')")), String(responseId));
expect('with a Delete for an administrator', await js("!!document.querySelector('app-drawer .delete')"));
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
await signOut(EN);
await viewport(360);
await go('/');
expect('English, signed out: Sign in', (await text('app-top-bar button.btn-primary')) === 'Sign in', await text('app-top-bar button.btn-primary'));
await expectBar('English, 360 px, signed out');
await expectNoKeys('English, the home page');
await screenshots('en-360-home-signed-out');

// ═══ In Slovak ═════════════════════════════════════════════════════════════
// A browser set to Slovak, on its first visit: nobody signed in, nothing stored, no ?lang= - the language is the
// browser's, which says "sk-SK". The server answers a code with a region by its base language, so the strings
// take one request, not one answered in English and then another.
await js('localStorage.clear(); sessionStorage.clear(); true');
const browsersOwn = await js("navigator.languages.join(',')");
await browserLanguage('sk-SK');
const firstVisit = requested.length;
await go('/');
await sleep(1200);
const asked = requested.slice(firstVisit).filter((request) => request.includes('/api/translations/'));
expect(
  'a browser set to Slovak, first visit: the site is Slovak, from the browser alone - nothing chosen, nothing in the address',
  (await js("navigator.languages.join(',')")) === 'sk-SK' && (await pageLanguage()) === 'sk' && (await text('app-survey-home h1')) === SK.home && (await storedLanguage()) === ' / ',
  `${await js("navigator.languages.join(',')")}: ${await pageLanguage()}, ${await text('app-survey-home h1')}, ${await storedLanguage()}`,
);
expect('... and its strings took one request', same(asked, ['GET /api/translations/sk-sk']), asked.join(', '));
await expectNoKeys('Slovak by the browser, the home page');
await browserLanguage(browsersOwn);

// Nobody signed in, nothing stored: a link with ?lang=sk, on the narrowest phone.
await js('localStorage.clear(); sessionStorage.clear(); true');
await go('/?lang=sk');
expect('?lang=sk: <html lang="sk">, kept for this tab only and taken out of the address', (await pageLanguage()) === 'sk' && (await storedLanguage()) === ' / sk' && (await js('location.search')) === '', `${await pageLanguage()}, ${await storedLanguage()}, ${await js('location.search')}`);
expect('Slovak: the button says Prihlásiť sa', (await text('app-top-bar button.btn-primary')) === 'Prihlásiť sa', await text('app-top-bar button.btn-primary'));
expect('Slovak: the chooser says SK and is named in Slovak', (await text('app-language-switcher .switcher')) === 'SK' && (await js("document.querySelector('app-language-switcher .switcher').getAttribute('aria-label')")) === 'Jazyk: Slovenčina', await js("document.querySelector('app-language-switcher .switcher')?.getAttribute('aria-label')"));
expect('Slovak: the home page', (await text('app-survey-home h1')) === SK.home, await text('app-survey-home h1'));
expect('Slovak: the tab', (await js('document.title')) === 'Prieskumy · anotoki prieskum', await js('document.title'));
expect('Slovak: the open survey with its size in Slovak', /^\d+ otáz(ka|ky|ok) · približne \d+ minút/.test((await text('app-survey-home .survey-meta')) ?? ''), await text('app-survey-home .survey-meta'));
await expectBar('Slovak, 360 px, signed out');
await expectNoKeys('Slovak, the home page');
// The detector itself: a key put on the page is found (so "none" above means none).
await js("document.querySelector('app-survey-home h1').append(document.createTextNode(' home.title')); true");
expect('a key on the page would have been seen', (await keysShown()).includes('home.title'));
await go('/');
await screenshots('sk-360-home-signed-out');

// The chooser: a menu of the languages under their own names.
await js("document.querySelector('app-language-switcher .switcher').click(); true");
await sleep(300);
const offered = await js("[...document.querySelectorAll('app-language-switcher [role=menuitemradio]')].map(e => e.textContent.trim() + ' ' + e.getAttribute('lang') + ' ' + e.getAttribute('aria-checked')).join(', ')");
expect('the chooser offers English and Slovenčina, Slovak checked', offered === 'English en false, Slovenčina sk true', offered);
expect('the chooser\'s menu is inside the window', await menuInside('app-language-switcher .menu'));
await screenshot('sk-360-chooser');
await escape();
expect('Escape closes the chooser', !(await js("!!document.querySelector('app-language-switcher .menu')")));

// The bar between the narrowest phone and the width where the words beside the mark come back: with the
// chooser in it they are hidden up to 520 px (in Slovak, signed out, the bar with them needs 500).
for (const width of [390, 520, 521]) {
  await viewport(width);
  await go('/');
  await expectBar(`Slovak, ${width} px, signed out`);
  const words = await js("!!document.querySelector('app-top-bar app-brand .wordmark')");
  expect(`Slovak, ${width} px: the words beside the mark are ${width > 520 ? 'shown' : 'hidden'}`, words === width > 520);
  if (width === 390) {
    await screenshots('sk-390-home-signed-out');
  } else {
    await screenshot(`sk-${width}-bar-signed-out`);
  }
}

// A survey, signed out.
await viewport(360);
await go(`/${slug}`);
await waitFor(page, "!!document.querySelector('.start button')", 15000);
expect('Slovak, signed out: the survey asks to sign in', (await text('.start button')) === 'Prihlásiť sa cez anotoki' && (await text('.sign-in-heading')) === 'Ak chcete tento prieskum vyplniť, prihláste sa', `${await text('.start button')} / ${await text('.sign-in-heading')}`);
await expectNoKeys('Slovak, a survey signed out');
await screenshots('sk-360-survey-signed-out');

// Signed in - the account is English, the link followed was Slovak: the tab stays Slovak through the IAM and back.
await signInAs(NINA, SK);
expect('Slovak still, back from the IAM', (await pageLanguage()) === 'sk' && (await text('app-survey-home h1')) === SK.home, `${await pageLanguage()}, ${await text('app-survey-home h1')}`);
expect('the survey is new to Nina', (await text('app-survey-home app-badge')) === 'Nový', await text('app-survey-home app-badge'));
await expectBar('Slovak, 360 px, signed in');
await openUserMenu();
const menuSk = await text('app-top-bar .menu');
expect('the person\'s menu in Slovak', ['nina', 'Váš anotoki účet', 'Odhlásiť sa'].every((part) => menuSk?.includes(part)) && !menuSk?.includes('Administrácia'), menuSk);
expect('the person\'s menu is inside the window', await menuInside('app-top-bar .menu'));
await expectNoKeys('Slovak, the person\'s menu');
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
expect('Slovak: the step about the reader, <html lang="sk">', (await pageLanguage()) === 'sk' && ['Krok 1 / 2', 'O Vás', 'Aké je Vaše pohlavie?', 'Koľko máte rokov?', 'Nechcem uviesť', 'Späť', 'Ďalej'].every((part) => stepSk?.includes(part)), stepSk?.slice(0, 400));
expect('Slovak: the progress is read out in Slovak', (await js("document.querySelector('app-survey-hero [role=progressbar]').getAttribute('aria-valuetext')")) === 'Krok 1, spolu krokov: 2', await js("document.querySelector('app-survey-hero [role=progressbar]')?.getAttribute('aria-valuetext')"));
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
expect('Slovak: the last step sends', (await text('button[type=submit]'))?.includes('Odoslať odpovede') && (await text('app-survey-hero .where'))?.includes('Krok 2 / 2'), `${await text('button[type=submit]')} / ${await text('app-survey-hero .where')}`);
expect('Slovak: enlarging the picture is named in Slovak', (await js("document.querySelector('app-question-block .gallery-item')?.getAttribute('aria-label')"))?.startsWith('Zväčšiť obrázok'), await js("document.querySelector('app-question-block .gallery-item')?.getAttribute('aria-label')"));
await expectNoKeys('Slovak, the last step');
await screenshots('sk-360-last-step');

// Left in the middle: the home page says so, and the survey offers to carry on.
await go('/');
expect('Slovak: a survey left in the middle is marked', (await text('app-survey-home app-badge')) === 'Začatý', await text('app-survey-home app-badge'));
await screenshot('sk-360-home-started', true);
await go(`/${slug}`);
await waitFor(page, "!!document.querySelector('app-take-survey app-alert')", 15000);
const carryOn = await text('app-take-survey app-alert');
expect('Slovak: carry on where you stopped', ['Pokračovať tam, kde ste prestali?', 'a dostali ste sa po krok 2 / 2', 'Pokračovať', 'Začať odznova'].every((part) => carryOn?.includes(part)), carryOn);
await expectNoKeys('Slovak, carrying on');
await screenshots('sk-360-carry-on');
await clickText('app-take-survey app-alert button', 'Pokračovať');
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
expect('Slovak: already taken, and when', taken?.includes('Tento prieskum ste už vyplnili') && /Odpovede ste odoslali (práve teraz|pred \d+ (minútou|minútami))\. Každý môže prieskum vyplniť iba raz\./.test(taken), taken);
expect('Slovak: the tab is the survey\'s own name', (await js('document.title')).startsWith('Genshin 6.1 - what next?'), await js('document.title'));
await expectNoKeys('Slovak, already taken');
await screenshots('sk-360-taken');

// Nothing there: a survey that is not, and an address that is not.
await go('/no-such-survey');
await waitFor(page, "!!document.querySelector('.message-heading')", 15000);
expect('Slovak: no survey at this address', (await text('.message-heading')) === 'Tu nie je žiadny prieskum' && (await js('document.title')) === 'Prieskum sa nenašiel · anotoki prieskum', `${await text('.message-heading')} / ${await js('document.title')}`);
await expectNoKeys('Slovak, no survey here');
await screenshot('sk-360-no-survey', true);
await go('/nothing/here');
expect('Slovak: nothing at this address', (await text('app-not-found'))?.includes('Na tejto adrese nič nie je') && (await js('document.title')) === 'Stránka sa nenašla · anotoki prieskum', `${await text('app-not-found')} / ${await js('document.title')}`);
await expectNoKeys('Slovak, not found');
await screenshot('sk-360-not-found', true);

// The admin area is English, whoever reads it: the no-access page for Nina...
await go('/admin');
expect('the admin area is English for somebody reading Slovak: <html lang="en">, the no-access page', (await pageLanguage()) === 'en' && (await text('app-admin-layout app-empty-state'))?.includes('for the people who write the surveys'), `${await pageLanguage()}, ${await text('app-admin-layout app-empty-state')}`);
await screenshot('sk-360-no-access', true);

// ... and the surveys for the owner, whose tab is Slovak too.
await signInAs(OWNER, SK);
await openUserMenu();
expect('Slovak: the owner\'s way into the admin area', (await text('app-top-bar .menu a[href="/admin"]')) === 'Administrácia' && (await text('app-top-bar .menu-role')) === 'Rola: administrátor', await text('app-top-bar .menu'));
expect('Slovak: the owner\'s menu is inside the window', await menuInside('app-top-bar .menu'));
await screenshot('sk-360-owner-menu');
// Through the menu, without a page load: the router says where the page is.
await clickText('app-top-bar .menu a', 'Administrácia');
await waitFor(page, "location.pathname === '/admin' && !!document.querySelector('app-surveys-list .survey')", 15000);
await sleep(400);
expect('/admin as the owner: <html lang="en">', (await pageLanguage()) === 'en', await pageLanguage());
expect('/admin as the owner: no language chooser', !(await js("!!document.querySelector('app-language-switcher')")));
expect('/admin as the owner: the page and the tab in English', (await text('app-surveys-list'))?.includes('New survey') && (await js('document.title')) === 'Surveys · anotoki survey', `${(await text('app-surveys-list'))?.slice(0, 80)} / ${await js('document.title')}`);
await openUserMenu();
const menuAdmin = await text('app-top-bar .menu');
expect('/admin as the owner: the shared top bar in English', ['Administrator', 'Your anotoki account', 'The open surveys', 'Sign out'].every((part) => menuAdmin?.includes(part)) && (await js("document.querySelector('app-top-bar app-theme-toggle [role=radiogroup]').getAttribute('aria-label')")) === 'Theme', menuAdmin);
await expectBar('/admin, 360 px');
await expectNoKeys('/admin');
await screenshot('sk-360-admin-menu');
await clickText('app-top-bar .menu a', 'The open surveys');
await waitFor(page, "location.pathname === '/' && !!document.querySelector('app-survey-home h1')", 15000);
await sleep(400);
expect('back where people take surveys: Slovak again, with the chooser', (await pageLanguage()) === 'sk' && (await text('app-survey-home h1')) === SK.home && (await text('app-language-switcher .switcher')) === 'SK', `${await pageLanguage()}, ${await text('app-survey-home h1')}`);
// Opened by its address (a page load), and at the width the pages are made for.
await viewport(390);
await go('/admin');
await waitFor(page, "!!document.querySelector('app-surveys-list .survey')", 15000);
expect('/admin opened by its address: English, <html lang="en">, no chooser', (await pageLanguage()) === 'en' && !(await js("!!document.querySelector('app-language-switcher')")) && (await text('app-surveys-list'))?.includes('New survey'), await pageLanguage());
await expectBar('/admin, 390 px');
await screenshots('sk-390-admin');

// ── The language of the account, when nothing is stored here ────────────────
await viewport(360);
await signOut(SK);
await js('localStorage.clear(); sessionStorage.clear(); true');
await setIamUser(ZUZANA);
await go('/');
expect('nothing stored, nobody signed in: the browser\'s language, English', (await pageLanguage()) === 'en' && (await text('app-top-bar button.btn-primary')) === 'Sign in', `${await pageLanguage()}, ${await text('app-top-bar button.btn-primary')}, ${await js('navigator.languages.join()')}`);
await clickText('app-top-bar button', 'Sign in');
await sleep(1500);
await settle();
await waitFor(page, "!!document.querySelector('app-top-bar .user-button')", 15000);
expect('a token that says locale sk: Slovak', (await pageLanguage()) === 'sk' && (await text('app-survey-home h1')) === SK.home, `${await pageLanguage()}, ${await text('app-survey-home h1')}`);
expect('used, not stored', (await storedLanguage()) === ' / ', await storedLanguage());
await expectBar('Slovak, 360 px, a twenty-character name');
await screenshot('sk-360-home-token', true);
await viewport(561);
await go('/');
expect('561 px: the name is in the bar', (await js("getComputedStyle(document.querySelector('app-top-bar .user-name')).display")) !== 'none' && (await text('app-top-bar .user-name')) === ZUZANA.username, await text('app-top-bar .user-name'));
await expectBar('Slovak, 561 px, a twenty-character name');
await screenshot('sk-561-bar-signed-in');

// ── The chooser: a choice made here is kept, and is stronger than the account ──
await viewport(360);
await go('/');
await js("document.querySelector('app-language-switcher .switcher').click(); true");
await sleep(300);
await clickText('app-language-switcher [role=menuitemradio]', 'English');
await waitFor(page, "document.documentElement.lang === 'en'", 15000);
await sleep(300);
expect('the chooser: English at once, kept on this device', (await text('app-survey-home h1')) === EN.home && (await text('app-language-switcher .switcher')) === 'EN' && (await storedLanguage()) === 'en / ' && (await js('document.title')) === 'Surveys · anotoki survey', `${await text('app-survey-home h1')}, ${await storedLanguage()}, ${await js('document.title')}`);
await go('/');
expect('and after a reload: the choice, not the account\'s language', (await pageLanguage()) === 'en' && (await text('app-survey-home h1')) === EN.home, `${await pageLanguage()}, ${await text('app-survey-home h1')}`);
await screenshot('en-360-home-chosen', true);

// ═══ The translating itself ════════════════════════════════════════════════
// From a clean start, as at the top: nobody signed in, nothing chosen or cached, English for the tab.
await signOut(EN);
await js('localStorage.clear(); sessionStorage.clear(); true');
await go('/?lang=en');
await viewport(1280);
await signInAs(OWNER, EN);

// ── The site's own words: the Translations page ─────────────────────────────
await go('/admin');
await waitFor(page, "!!document.querySelector('app-surveys-list .survey')", 15000);
expect('the surveys list has the way to the translations', (await clickText('app-surveys-list app-page-header a', 'Translations')) === true);
await waitFor(page, "location.pathname === '/admin/translations' && document.querySelectorAll('app-translations .block').length > 50", 15000);
/** The box of one key in one language, and the block of a plural family (as an expression for the page). */
const box = (key, code) => `[id="key-${key}"] textarea[lang="${code}"]`;
const family = (name) => `[...document.querySelectorAll('app-translations .block.is-plural')].find((b) => b.querySelector('.family code').textContent.trim() === ${JSON.stringify(name)})`;
const saveState = () => text('app-translations .save-state');
const toasts = () => texts('.toast-message');
/** Toasts stay for seconds, over the corner of the page: gone before a screenshot, or before the next one is read. */
const dismissToasts = async () => {
  await js("document.querySelectorAll('.toast-close').forEach((b) => b.click()); true");
  await sleep(300);
};

expect('Translations: named in the tab, English, no chooser', (await js('document.title')).startsWith('Translations · ') && (await pageLanguage()) === 'en' && !(await js("!!document.querySelector('app-language-switcher')")), `${await js('document.title')}, ${await pageLanguage()}`);
const keyRows = await js("document.querySelectorAll('app-translations .row:not(.samples)').length");
expect('Translations: a row for every key, a column for each language', keyRows === KEYS.length && (await texts('app-translations .grid-head span')).join(' | ') === 'Key | English | Slovak', `${keyRows} rows for ${KEYS.length} keys; ${(await texts('app-translations .grid-head span')).join(' | ')}`);
expect('Translations: both languages are written whole', (await texts('app-translations .coverage-count')).join(' | ') === `${KEYS.length} / ${KEYS.length} | ${KEYS.length} / ${KEYS.length}`, (await texts('app-translations .coverage-count')).join(' | '));
const plural = await js(
  `(() => { const b = ${family('home.questions')}; if (!b) return null; const all = (selector) => [...b.querySelectorAll(selector)].map((e) => e.textContent.replace(/\\s+/g, ' ').trim()); return { keys: all('.key-name'), numbers: all('.numbers'), en: all('.sample[lang=en] li'), sk: all('.sample[lang=sk] li') }; })()`,
);
expect('Translations: a plural family is one block - one, few, other', plural?.keys.join(' ') === 'home.questions.one home.questions.few home.questions.other', plural?.keys.join(' '));
expect(
  '... each form says which numbers it is for, in English and in Slovak',
  plural?.numbers.join(' | ') === 'For the numbers: 1 | For the numbers: 1 | For the numbers: not used in English - the fallback for other languages | For the numbers: 2-4 | For the numbers: everything else | For the numbers: 0, 5 and more',
  plural?.numbers.join(' | '),
);
expect('... and the block shows the family as the site says it for 1, 3 and 12', plural?.en.join(' | ') === '1 question | 3 questions | 12 questions' && plural?.sk.join(' | ') === '1 otázka | 3 otázky | 12 otázok', `${plural?.en.join(' | ')} // ${plural?.sk.join(' | ')}`);
expect('Translations: nothing changed, nothing to save', (await saveState()) === 'Everything is saved' && (await js("[...document.querySelectorAll('app-translations .save-bar button')].find((b) => b.textContent.trim() === 'Save')?.disabled")) === true, await saveState());
await expectNoSideways('Translations, desktop');
await screenshots('admin-translations-1280', false);
await js(`${family('home.questions')}.scrollIntoView({ block: 'center' }); true`);
await screenshots('admin-translations-1280-plural', false);

// A Slovak string reworded - first with a placeholder its English string does not have.
await fill(box('home.title', 'sk'), 'Povedzte nám {nope} svoj názor');
expect('Translations: a changed box is marked, and the bar counts it', (await text('[id="key-home.title"] .mark')) === 'Changed' && (await saveState()) === '1 string changed, not saved yet', `${await text('[id="key-home.title"] .mark')} / ${await saveState()}`);
await clickText('app-translations .save-bar button', 'Save');
await waitFor(page, `!!document.querySelector('[id="key-home.title"] .field-error')`, 15000);
const refusal = await text('[id="key-home.title"] .field-error');
expect('Translations: a placeholder the English string does not have is refused, beside its key', refusal === 'Nothing was saved. The Slovak string of "home.title" uses {nope}, which its English string does not have.', refusal);
expect('... its box is marked wrong, and the bar says where to look', (await js(`document.querySelector(${JSON.stringify(box('home.title', 'sk'))}).getAttribute('aria-invalid')`)) === 'true' && (await saveState()) === 'Nothing was saved: see home.title', await saveState());
await sleep(400);
await screenshots('admin-translations-1280-refused', false);
const HOME_SK = 'Povedzte nám, čo si myslíte';
await fill(box('home.title', 'sk'), HOME_SK);
expect('Translations: changing the box takes the refusal away', !(await js(`!!document.querySelector('[id="key-home.title"] .field-error')`)) && (await saveState()) === '1 string changed, not saved yet', await saveState());
await clickText('app-translations .save-bar button', 'Save');
await waitFor(page, "document.querySelector('app-translations .save-state')?.textContent.trim() === 'Everything is saved'", 15000);
expect('Translations: saved - it says so, and no box is marked any more', (await toasts()).includes('The string is saved.') && !(await js("!!document.querySelector('app-translations app-translation-cell .mark')")), (await toasts()).join(' | '));
await dismissToasts();

// ── A save that fails with no key to blame: said where Save is ──────────────
// A box far down the grid, so the top of the page is out of sight - what is said there is not seen.
const DRAFT_SK = ['notFound.text', 'sk', 'Možno je v adrese preklep, alebo sa to, čo tu bolo, presunulo.'];
const DRAFT_EN = ['notFound.action', 'en', 'Back to the open surveys'];
const boxValue = (key, code) => js(`document.querySelector(${JSON.stringify(box(key, code))})?.value ?? null`);
const marks = () => js("[...document.querySelectorAll('app-translations .row')].filter((row) => row.querySelector('app-translation-cell .mark')).map((row) => row.id.slice(4) + ' ' + [...row.querySelectorAll('.cell')].filter((cell) => cell.querySelector('.mark')).map((cell) => cell.querySelector('textarea').getAttribute('lang')).join('+'))");
const storedSk = await boxValue(DRAFT_SK[0], 'sk');
const storedEn = await boxValue(DRAFT_EN[0], 'en');
/** The bar Save is in, and what it says became of the save, are inside the window - on a page scrolled away from its top. */
const saidInView = () =>
  js(`(() => {
    const bar = document.querySelector('app-translations .save-bar')?.getBoundingClientRect();
    const said = document.querySelector('app-translations .save-refused')?.getBoundingClientRect();
    const inside = (r) => !!r && r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth + 0.5;
    return { ok: inside(bar) && inside(said) && window.scrollY > 400, detail: 'scrolled ' + Math.round(window.scrollY) + ', the bar ' + (bar ? Math.round(bar.top) + '-' + Math.round(bar.bottom) : 'missing') + ' of ' + window.innerHeight };
  })()`);
const saidOfTheSave = async (words) => {
  await clickText('app-translations .save-bar button', 'Save');
  await waitFor(page, `(document.querySelector('app-translations .save-state')?.textContent ?? '').includes(${JSON.stringify(words)}) && !document.querySelector('app-translations .save-bar button[aria-busy=true]')`, 15000);
  await sleep(300);
  return saveState();
};
await fill(box(...DRAFT_SK.slice(0, 2)), DRAFT_SK[2]);
// The server itself fails - a page that is not the API's, as a proxy in front of it answers.
await intercept('*/api/admin/translations', (request) => (request.method === 'PUT' ? { status: 500, body: '<h1>Internal Server Error</h1>' } : null));
const failed = await saidOfTheSave('The server answered');
let view = await saidInView();
expect('Translations: a save the server fails on is said in the bar Save is in', failed === 'Nothing was saved. The server answered 500.', failed);
expect('... which is in view, far from the top of the page - and nothing is said up there, out of sight', view.ok && !(await js("!!document.querySelector('app-translations app-alert')")), view.detail);
expect('... and what was typed is still in its box, still to be saved', (await boxValue(DRAFT_SK[0], 'sk')) === DRAFT_SK[2] && same(await marks(), [`${DRAFT_SK[0]} sk`]) && (await js("[...document.querySelectorAll('app-translations .save-bar button')].find((b) => b.textContent.trim() === 'Save')?.disabled")) === false, JSON.stringify(await marks()));
await screenshots('admin-translations-1280-save-failed', false);
// No answer at all: the connection is gone for that one request.
await intercept('*/api/admin/translations', (request) => (request.method === 'PUT' ? 'unreachable' : null));
const unreachable = await saidOfTheSave('could not be reached');
expect('Translations: a save that reaches nobody is said in the same place', unreachable === 'Nothing was saved. The site could not be reached. Check the connection and try again.' && (await saidInView()).ok, unreachable);
await stopIntercepting();
await viewport(390);
await sleep(400);
await js(`document.querySelector(${JSON.stringify(box(...DRAFT_SK.slice(0, 2)))}).scrollIntoView({ block: 'center' }); true`);
await sleep(300);
view = await saidInView();
expect('Translations, 390 px: the bar says it whole, inside the window', view.ok && (await js("(() => { const said = document.querySelector('app-translations .save-refused'); return said.scrollWidth <= said.clientWidth + 1; })()")), view.detail);
await expectNoSideways('Translations, 390 px, a save that failed');
await screenshots('admin-translations-390-save-failed', false);
await viewport(1280);
await sleep(400);

// ── What is typed and not saved outlives the session ────────────────────────
// Two boxes typed, in two languages. Then the session ends the way it does by itself: the access token has run
// out and the IAM will not renew it (its own session is over - signed out elsewhere, the idle limit). The admin
// area takes its page away at that moment, with no navigation and no question.
await fill(box(...DRAFT_EN.slice(0, 2)), DRAFT_EN[2]);
// As the grid lists them: by key.
const BOTH = [`${DRAFT_EN[0]} en`, `${DRAFT_SK[0]} sk`];
expect('Translations: two boxes typed, neither saved', same(await marks(), BOTH), JSON.stringify(await marks()));
const DRAFTS_KEY = 'anotoki-survey:localization-drafts';
const draftsKept = () => js(`(() => { try { const kept = JSON.parse(sessionStorage.getItem(${JSON.stringify(DRAFTS_KEY)})); return kept ? kept.owner + ': ' + Object.entries(kept.strings).map(([key, cells]) => key + ' ' + Object.keys(cells).join('+')).join(', ') : null; } catch { return 'unreadable'; } })()`);
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
await clickText('app-translations .save-bar button', 'Save');
await waitFor(page, "!document.querySelector('app-translations') && !!document.querySelector('app-top-bar button.btn-primary')", 15000);
await sleep(400);
const iamLog = (await (await fetch(`${iam}/_test/state`)).json()).log ?? [];
expect('the session ended - the IAM refused to renew it: the page is gone, where it was, and the bar offers to sign in', (await js('location.pathname')) === '/admin/translations' && !(await js("!!document.querySelector('app-top-bar .user-button')")) && iamLog.slice(-3).includes('POST /api/oidc/token'), `${await js('location.pathname')}; the IAM was asked: ${iamLog.slice(-3).join(', ')}`);
expect('... and what was typed is kept for the tab, for the person it was typed by', (await draftsKept()) === `${OWNER.id}: ${DRAFT_SK[0]} sk, ${DRAFT_EN[0]} en`, await draftsKept());
const signedOutCard = async () => text('app-admin-layout app-empty-state');
expect(
  'the admin area says so: "You are signed out", and that the boxes are kept - not that the account has no editor role',
  (await signedOutCard())?.includes('You are signed out') && (await signedOutCard())?.includes('what you typed on the Translations and Languages pages is kept in this tab') && !(await signedOutCard())?.includes('no editor role'),
  await signedOutCard(),
);
await screenshot('admin-session-ended');
await viewport(390);
await sleep(400);
await expectBar('signed out in the admin area, 390 px');
expect('signed out in the admin area, 390 px: the mark without its words - the bar has no chooser to make room', !(await js("!!document.querySelector('app-top-bar app-brand .wordmark')")));
await screenshots('admin-session-ended-390');
// Where the words come back (421 px), the bar still holds them beside the sign-in button.
await viewport(421);
await expectBar('signed out in the admin area, 421 px');
expect('signed out in the admin area, 421 px: the words beside the mark are back', await js("!!document.querySelector('app-top-bar app-brand .wordmark')"));
await viewport(1280);
await sleep(400);
// The site's links and Back still work from here: the page is gone, so the router asks the Translations page's guard
// with no page - which lets the navigation through (it threw, and every link of this state was dead). The admin
// area's own sign-in guard does not run again for a page inside it: the card stays, and nobody is sent to the IAM.
await js("document.querySelector('app-top-bar app-brand a').click(); true");
await waitFor(page, "location.pathname === '/admin'", 10000).catch(() => null);
await sleep(400);
expect('signed out: the brand link goes to /admin - the card stays, still signed out', (await js('location.pathname')) === '/admin' && (await signedOutCard())?.includes('You are signed out') && !(await js("!!document.querySelector('app-top-bar .user-button')")), `${await js('location.pathname')} / ${await signedOutCard()}`);
await js('history.back(); true');
await waitFor(page, "location.pathname === '/admin/translations'", 10000).catch(() => null);
await sleep(400);
expect('... and Back comes back to the Translations page, the card still there', (await js('location.pathname')) === '/admin/translations' && (await signedOutCard())?.includes('You are signed out'), `${await js('location.pathname')} / ${await signedOutCard()}`);
await setIam({ refuse: false });
// Signed in again: to the IAM and back is a page load, to the address the page was on. The browser does not ask
// "Leave site?" on the way: signed out, the drafts are kept in the tab, and the sign-in is the only way on.
const askedBeforeSignIn = leaving.length;
await clickText('app-top-bar button', 'Sign in');
await sleep(1500);
await settle();
await waitFor(page, "location.pathname === '/admin/translations' && document.querySelectorAll('app-translations .block').length > 50", 15000);
await sleep(400);
expect('on the way to the sign-in the browser did not ask "Leave site?"', leaving.length === askedBeforeSignIn, JSON.stringify(leaving.slice(askedBeforeSignIn)));
expect(
  'signed in again: both boxes hold what was typed, and are marked as changed',
  (await text('app-top-bar .user-name')) === OWNER.username && (await boxValue(DRAFT_SK[0], 'sk')) === DRAFT_SK[2] && (await boxValue(DRAFT_EN[0], 'en')) === DRAFT_EN[2] && same(await marks(), BOTH),
  `${await boxValue(DRAFT_SK[0], 'sk')} / ${await boxValue(DRAFT_EN[0], 'en')} / ${JSON.stringify(await marks())}`,
);
expect('... and the bar counts them, with Save ready', (await saveState()) === '2 strings changed, not saved yet' && (await js("[...document.querySelectorAll('app-translations .save-bar button')].find((b) => b.textContent.trim() === 'Save')?.disabled")) === false, await saveState());
await js(`document.querySelector(${JSON.stringify(box(...DRAFT_SK.slice(0, 2)))}).scrollIntoView({ block: 'center' }); true`);
await screenshots('admin-translations-1280-drafts-back', false);

// Signing out is asked about first: signed out, what is typed would be lost.
/** The site's own question (a dialog of the page, not the browser's): its heading, its text, its buttons. */
const question = () => js("(() => { const d = document.querySelector('dialog[open]'); return d ? { title: d.querySelector('.title').textContent.trim(), message: d.querySelector('.message')?.textContent.trim() ?? '', buttons: [...d.querySelectorAll('.footer button')].map((b) => b.textContent.trim()).join(' | ') } : null; })()");
await openUserMenu();
await clickText('app-top-bar .menu-item', EN.signOut);
await waitFor(page, "!!document.querySelector('dialog[open]')", 15000);
await sleep(300);
let asking = await question();
expect(
  'signing out with boxes not saved asks first, and says where they are',
  asking?.title === 'Sign out without your latest changes?' && asking?.message === "Some changes to the site's strings or languages are not saved - the Translations and Languages pages show them. Signed out, they are lost." && asking?.buttons === 'Stay | Sign out anyway',
  JSON.stringify(asking),
);
await screenshot('admin-sign-out-unsaved-1280');
await viewport(390);
await sleep(400);
expect('390 px: the question is inside the window', await menuInside('dialog[open] .panel'));
await expectNoSideways('the sign-out question, 390 px');
await screenshots('admin-sign-out-unsaved-390', false);
await viewport(1280);
await sleep(400);
await clickText('dialog[open] button', 'Stay');
await sleep(500);
expect(
  '"Stay": still signed in, still on the page, the boxes as they were',
  !(await js("!!document.querySelector('dialog[open]')")) && (await text('app-top-bar .user-name')) === OWNER.username && (await boxValue(DRAFT_SK[0], 'sk')) === DRAFT_SK[2] && same(await marks(), BOTH),
  JSON.stringify(await marks()),
);

// Where people take surveys: the new words, after a reload. (The boxes typed above go along, unsaved: a page load
// keeps them for the tab.)
await go('/?lang=sk');
expect('the reworded string is what a Slovak reader sees after a reload', (await pageLanguage()) === 'sk' && (await text('app-survey-home h1')) === HOME_SK, `${await pageLanguage()}, ${await text('app-survey-home h1')}`);
await expectNoKeys('Slovak, the home page reworded');

// The same question where people take surveys, in Slovak - and this time the answer is to go.
await viewport(360);
await sleep(300);
await openUserMenu();
await clickText('app-top-bar .menu-item', SK.signOut);
await waitFor(page, "!!document.querySelector('dialog[open]')", 15000);
await sleep(300);
asking = await question();
expect(
  'Slovak: signing out from another page asks the same, in Slovak',
  asking?.title === 'Odhlásiť sa bez uloženia posledných zmien?' && asking?.message === 'Niektoré zmeny v textoch alebo jazykoch stránky nie sú uložené – nájdete ich na stránkach „Translations“ a „Languages“. Po odhlásení sa stratia.' && asking?.buttons === 'Zostať | Aj tak sa odhlásiť',
  JSON.stringify(asking),
);
expect('Slovak, 360 px: the question is inside the window', await menuInside('dialog[open] .panel'));
await expectNoSideways('Slovak, 360 px, the sign-out question');
await expectNoKeys('Slovak, the sign-out question');
await screenshots('sk-360-sign-out-unsaved', false);
await clickText('dialog[open] button', 'Aj tak sa odhlásiť');
await sleep(1500);
await settle();
expect('"Sign out anyway": signed out, and what was typed is given up - nothing of it is kept for the tab', (await text('app-top-bar button.btn-primary')) === SK.signIn && (await draftsKept()) === null, `${await text('app-top-bar button.btn-primary')} / ${await draftsKept()}`);
// Nothing is unsaved from here on: the browser's own question is a problem again.
const browserAsked = leaving.length;
leaving = null;
await viewport(1280);
await clickText('app-top-bar button', SK.signIn);
await sleep(1500);
await settle();
await waitFor(page, "!!document.querySelector('app-top-bar .user-button')", 15000);
await go('/admin/translations');
await waitFor(page, "document.querySelectorAll('app-translations .block').length > 50", 15000);
expect(
  'back on the Translations page: every box says what the site has, none is marked',
  (await boxValue(DRAFT_SK[0], 'sk')) === storedSk && (await boxValue(DRAFT_EN[0], 'en')) === storedEn && same(await marks(), []) && (await saveState()) === 'Everything is saved',
  `${JSON.stringify(await marks())} / ${await saveState()}; the browser itself asked ${browserAsked} time(s) on the way`,
);

// ── The languages on offer: the Languages page ──────────────────────────────
await go('/admin/languages');
await waitFor(page, "document.querySelectorAll('app-languages .language').length === 2", 15000);
const languageHeads = async () => (await js("[...document.querySelectorAll('app-languages .head')].map((h) => [...h.children].map((c) => c.textContent.trim()).join(' '))")).join(' | ');
const slovakSwitch = "document.querySelector('app-languages .language:nth-child(2) input[role=switch]')";
const slovakOffered = async (label) => {
  await js(`${slovakSwitch}.click(); true`);
  // The row says the new state at once; the switch is free again once the server has answered.
  await waitFor(page, `document.querySelector('app-languages .language:nth-child(2) .switch .label')?.textContent.trim() === ${JSON.stringify(label)} && !${slovakSwitch}.disabled`, 15000);
};
expect('Languages: named in the tab; English the fallback, Slovak released with the site', (await js('document.title')).startsWith('Languages · ') && (await languageHeads()) === 'en English English Fallback | sk Slovak Slovenčina Released with the site', `${await js('document.title')} / ${await languageHeads()}`);
expect(
  'Languages: English cannot be switched off, and neither language can be deleted',
  (await js("(() => { const s = document.querySelector('app-languages .language input[role=switch]'); return s.checked && s.disabled; })()")) && !(await js("[...document.querySelectorAll('app-languages .language button')].some((b) => b.textContent.trim() === 'Delete')")),
);
await expectNoSideways('Languages, desktop');
await screenshots('admin-languages-1280');

await slovakOffered('Hidden');
expect('Languages: Slovak is hidden with its switch', (await toasts()).includes('Slovak is hidden: nobody is offered it.') && (await js("document.querySelector('app-languages .language:nth-child(2)').classList.contains('is-hidden')")), (await toasts()).join(' | '));
const hiddenBundle = await (await fetch(`${origin}/api/translations/sk`)).json();
expect('hidden: asked for Slovak, the site answers in English and offers English alone', hiddenBundle.language === 'en' && hiddenBundle.languages.map((l) => l.code).join(' ') === 'en', `${hiddenBundle.language}: ${hiddenBundle.languages?.map((l) => l.code).join(' ')}`);
await dismissToasts();
await screenshot('admin-languages-1280-slovak-hidden');
// The page that hid it has the site's languages again at once: through the menu, with no page load, the pages
// people take surveys on are English already.
const toTheSurveys = async () => {
  await openUserMenu();
  await clickText('app-top-bar .menu a', 'The open surveys');
  await waitFor(page, "location.pathname === '/' && !!document.querySelector('app-survey-home h1')", 15000);
  await sleep(400);
};
await toTheSurveys();
expect('hidden: without a page load, the tab that reads Slovak is English already', (await pageLanguage()) === 'en' && (await text('app-survey-home h1')) === EN.home && !(await js("!!document.querySelector('app-top-bar app-language-switcher')")), `${await pageLanguage()}, ${await text('app-survey-home h1')}`);
await go('/');
expect(
  'hidden: a reader whose tab asked for Slovak reads English, and the chooser is gone',
  (await pageLanguage()) === 'en' && (await text('app-survey-home h1')) === EN.home && !(await js("!!document.querySelector('app-top-bar app-language-switcher')")) && (await storedLanguage()) === ' / sk',
  `${await pageLanguage()}, ${await text('app-survey-home h1')}, chooser: ${await js("!!document.querySelector('app-top-bar app-language-switcher')")}, ${await storedLanguage()}`,
);
await expectBar('English alone, desktop');
await screenshot('en-1280-home-one-language');
await go('/admin/languages');
await waitFor(page, "document.querySelectorAll('app-languages .language').length === 2", 15000);
await slovakOffered('Offered');
expect('Languages: and offered again', (await toasts()).includes('Slovak is offered to everybody now.'), (await toasts()).join(' | '));
await dismissToasts();
await toTheSurveys();
expect('offered again: without a page load, the same tab is Slovak again', (await pageLanguage()) === 'sk' && (await text('app-survey-home h1')) === HOME_SK && (await text('app-top-bar app-language-switcher .switcher')) === 'SK', `${await pageLanguage()}, ${await text('app-survey-home h1')}`);
await go('/');
expect('offered again: the same tab is Slovak, and the chooser is back', (await pageLanguage()) === 'sk' && (await text('app-survey-home h1')) === HOME_SK && (await text('app-top-bar app-language-switcher .switcher')) === 'SK', `${await pageLanguage()}, ${await text('app-survey-home h1')}, ${await text('app-top-bar app-language-switcher .switcher')}`);

// A new language starts hidden: nobody is offered a language that has no strings yet, unless the form is told so.
await go('/admin/languages');
await waitFor(page, "document.querySelectorAll('app-languages .language').length === 2", 15000);
const offerAtOnce = "document.querySelector('app-languages form.add .add-offered input[role=switch]')";
expect('Languages: the form for a new one has a switch to offer it right away, and it is off', (await js(`(() => { const s = ${offerAtOnce}; return !!s && !s.checked && !s.disabled; })()`)) && (await text('app-languages form.add .add-offered .label')) === 'Offer it to readers right away', await text('app-languages form.add .add-offered'));
for (const [index, words] of ['cs', 'Czech', 'Čeština'].entries()) {
  await focus('app-languages form.add .field-input', index);
  await typeText(words);
}
expect('add Czech', (await clickText('app-languages form.add button', 'Add the language')) === true);
await waitFor(page, "document.querySelectorAll('app-languages .language').length === 3", 15000);
await sleep(300);
expect(
  'Languages: the new language is in the list, hidden - and the page says so',
  (await languageHeads()) === 'en English English Fallback | sk Slovak Slovenčina Released with the site | cs Czech Čeština' &&
    (await js("document.querySelector('app-languages .language:nth-child(3)').classList.contains('is-hidden')")) &&
    (await text('app-languages .language:nth-child(3) .switch .label')) === 'Hidden' &&
    (await toasts()).includes('Czech is added, hidden. Write its strings, then offer it.'),
  `${await languageHeads()} / ${await text('app-languages .language:nth-child(3) .switch .label')} / ${(await toasts()).join(' | ')}`,
);
expect('... the form is empty again, its switch off for the next one', (await js("[...document.querySelectorAll('app-languages form.add .field-input')].every((field) => field.value === '')")) && (await js(`${offerAtOnce}.checked`)) === false);
const newBundle = await (await fetch(`${origin}/api/translations/cs`)).json();
expect('a new language is offered to nobody: asked for it, the site answers in English, and offers the two it had', newBundle.language === 'en' && newBundle.languages.map((l) => l.code).join(' ') === 'en sk', `${newBundle.language}: ${newBundle.languages?.map((l) => l.code).join(' ')}`);
await dismissToasts();
await expectNoSideways('Languages, a new language, desktop');
await screenshot('admin-languages-1280-new-hidden', true);
await viewport(390);
await sleep(400);
await expectBar('Languages, a new language, 390 px');
await screenshots('admin-languages-390-new-hidden');
await viewport(1280);
await sleep(400);
// An administrator deletes it again (no survey uses it, no migration wrote strings for it): the rest of the
// check goes on with the two languages the site is released in.
expect('delete Czech', (await clickText('app-languages .language:nth-child(3) button', 'Delete')) === true);
await waitFor(page, "!!document.querySelector('dialog[open]')", 15000);
expect('... asked first, by its name and code', (await text('dialog[open] .title')) === 'Delete Czech (cs)?', await text('dialog[open] .title'));
await clickText('dialog[open] button', 'Delete');
await waitFor(page, "document.querySelectorAll('app-languages .language').length === 2", 15000);
expect('Languages: the new language is deleted again', (await toasts()).includes('Czech is deleted.') && (await languageHeads()) === 'en English English Fallback | sk Slovak Slovenčina Released with the site', `${(await toasts()).join(' | ')} / ${await languageHeads()}`);
await dismissToasts();

// Both pages on a phone.
await viewport(390);
await go('/admin/languages');
await waitFor(page, "document.querySelectorAll('app-languages .language').length === 2", 15000);
await expectBar('Languages, 390 px');
await screenshots('admin-languages-390');
await go('/admin/translations');
await waitFor(page, "document.querySelectorAll('app-translations .block').length > 50", 15000);
await expectBar('Translations, 390 px');
expect(
  'Translations, 390 px: the languages stand under one another, each box saying its language, none wider than the page',
  (await js("getComputedStyle(document.querySelector('app-translations .grid-head')).display")) === 'none' &&
    (await js("getComputedStyle(document.querySelector('app-translations .cell-language')).display")) !== 'none' &&
    (await js("[...document.querySelectorAll('app-translation-cell, app-translations .key, app-translations .language, app-translations .save-bar, app-translations .tools > *')].every((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 0.5; })")),
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
expect('the editor: the survey is written in English, and Slovak can be added', (await editorTabs()) === 'English main' && (await texts('app-editor-languages .add-select option')).join(' | ') === 'Add a language… | Slovak', `${await editorTabs()} / ${(await texts('app-editor-languages .add-select option')).join(' | ')}`);

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
expect('Slovak is added: a tab of its own with nothing translated yet, and the page is on it', (await editorTabs()) === 'English main | Slovak 0 / 7' && (await js("document.querySelector('app-editor-languages .tab.is-active')?.textContent.includes('Slovak')")) === true, await editorTabs());
const banner = (await texts('app-survey-editor app-alert')).find((words) => words.includes('You are translating this survey into Slovak'));
expect('a banner says which language, and where the questions themselves are changed', !!banner && banner.includes('are changed in English'), banner);
const unlocked = await js("['#survey-title', '#add-step', '.add-question', '.step-actions', '.head-actions', '.grip', '.kinds', '.foot', '.adds', '.option-actions', '.handle', '.thumb-actions', '.number-input', 'app-editor-settings'].filter((s) => document.querySelector('app-survey-editor ' + s)).join(' ')");
expect('in a translation the structure is locked: nothing to add, move, remove or set', unlocked === '', unlocked);
expect(
  'the step about the reader is not the survey\'s to translate: its note sends to the Translations page',
  (await js("document.querySelector('app-survey-editor .fixed-note a')?.getAttribute('href')")) === '/admin/translations' && !/\s[.,]/.test((await text('app-survey-editor .fixed-note')) ?? ' .'),
  await text('app-survey-editor .fixed-note'),
);
await clickText('app-survey-editor .toolbar button', 'Unfold all');
await sleep(600);
const originals = await js("[...document.querySelectorAll('app-translated-text .original')].map((e) => e.getAttribute('lang') + ': ' + e.textContent.replace(/\\s+/g, ' ').trim())");
const fields = await js("[...document.querySelectorAll('app-translated-text [data-place]')].map((e) => e.getAttribute('lang') + ': ' + JSON.parse(e.getAttribute('data-place'))[0])");
expect(
  'every text is a pair: the original, said to be English, and a field said to be Slovak',
  same(originals, ['en: Tea or coffee?', 'en: Thank you for taking a few minutes to tell us what you think.', 'en: Your cup', 'en: Which do you drink in the morning?', 'en: Tea', 'en: Coffee', 'en: Thank you! Your answers are on their way to us, and we read every one of them.']) &&
    same(fields, ['sk: title', 'sk: intro', 'sk: step', 'sk: text', 'sk: option', 'sk: option', 'sk: thanks']),
  `${JSON.stringify(originals)} ${JSON.stringify(fields)}`,
);
expect('... and each is marked as not translated yet', (await js("document.querySelectorAll('app-translated-text .pair.is-missing').length")) === 7, await js("document.querySelectorAll('app-translated-text .pair.is-missing').length"));

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
  expect('the progress is on the tab and in the bar that stays in view', (await editorTabs()) === 'English main | Slovak 5 / 7' && (await text('app-survey-editor .translating-count')) === '5 / 7', `${await editorTabs()} / ${await text('app-survey-editor .translating-count')}`);
  expect('the outline marks the question that has texts left, and the list of problems says how many', same(await texts('app-editor-outline .question .todo'), ['2 texts to translate']) && same(await texts('app-editor-outline .problem'), ['Slovak: question 1 has 2 texts to translate.']), `${JSON.stringify(await texts('app-editor-outline .question .todo'))} ${JSON.stringify(await texts('app-editor-outline .problem'))}`);
  expect('a draft: the list of problems, and the Editor tab\'s count, say what to fix before it opens', (await text('app-editor-outline #problems-title')) === '1 to fix before it opens' && (await problemsCount()) === '1 to fix before it opens', `${await text('app-editor-outline #problems-title')} / ${await problemsCount()}`);
  const beside = "(() => { const [a, b] = document.querySelector('#welcome app-translated-text .pair').children; const [x, y] = [a.getBoundingClientRect(), b.getBoundingClientRect()]; return Math.abs(x.top - y.top) < 2 && x.right <= y.left; })()";
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
  expect('with texts left to translate the survey does not open', (await toasts()).includes('Fix the problem first - the editor lists it.') && (await text('app-survey-header app-badge')) !== 'Open' && !(await js("!!document.querySelector('dialog[open]')")), `${(await toasts()).join(' | ')} / ${await text('app-survey-header app-badge')}`);
  await dismissToasts();
}
await saved();
expect('"Next missing" went through the texts in the order of the survey', went.join(' ') === 'title intro thanks step text option option', went.join(' '));
expect(
  'every text is translated: 7 / 7, nothing marked, nothing left for "Next missing"',
  (await editorTabs()) === 'English main | Slovak 7 / 7' && (await text('app-survey-editor .translating-done')) === 'Nothing is missing' && (await js("document.querySelectorAll('app-translated-text .pair.is-missing').length")) === 0,
  `${await editorTabs()} / ${await text('app-survey-editor .translating-done')}`,
);
expect('and the survey is ready to open', (await text('app-editor-outline #problems-title')) === 'Ready to open' && (await js("document.querySelectorAll('app-editor-outline .todo').length")) === 0, await text('app-editor-outline #problems-title'));
expect('the Preview from a translation opens the survey in that language', (await js("document.querySelector('app-survey-header a[href*=preview]')?.getAttribute('href')")) === `/preview/${teaId}?language=sk`, await js("document.querySelector('app-survey-header a[href*=preview]')?.getAttribute('href')"));
await screenshot('editor-translated-1280', true);

// The preview of a translation, and back: the editor opens on the translation that was being previewed.
await go(`/preview/${teaId}?language=sk`);
await waitFor(page, "!!document.querySelector('app-take-survey app-survey-hero h1')", 15000);
const backLinks = await js("[...document.querySelectorAll('app-take-survey a')].filter((a) => a.textContent.includes('Back to the editor')).map((a) => a.getAttribute('href'))");
expect('the preview shows the translation, and its way back names it', (await text('app-survey-hero h1')) === SLOVAK[0][1] && backLinks.length > 0 && backLinks.every((href) => href === `/admin/surveys/${teaId}/edit?language=sk`), `${await text('app-survey-hero h1')} / ${JSON.stringify(backLinks)}`);
await clickText('app-take-survey a', 'Back to the editor');
await waitFor(page, "location.pathname.endsWith('/edit') && !!document.querySelector('app-editor-languages .tab.is-active')", 15000);
await sleep(500);
expect('back in the editor: on the Slovak tab, not on the main language', (await text('app-editor-languages .tab.is-active'))?.startsWith('Slovak') && (await js('location.search')) === '?language=sk', `${await text('app-editor-languages .tab.is-active')} / ${await js('location.search')}`);

await go(`/admin/surveys/${teaId}/edit`);
await waitFor(page, "!!document.querySelector('app-editor-languages .tab') && !!document.querySelector('#survey-title')", 15000);
expect(
  'after a reload the server has every Slovak text, and the language the survey is written in is fixed',
  (await editorTabs()) === 'English main | Slovak 7 / 7' && (await js("document.querySelector('#survey-language').disabled")) === true && (await text('app-editor-settings'))?.includes('Translated into Slovak'),
  await editorTabs(),
);
expect('open the translated survey', (await clickText('app-survey-header button', 'Open the survey')) === true);
await sleep(400);
expect('confirm', (await clickText('dialog button', 'Open')) === true);
await waitFor(page, "(document.querySelector('app-survey-header app-badge')?.textContent ?? '').includes('Open')", 15000);
const teaSlug = await js("document.querySelector('app-survey-header .address-link').textContent.split('/').pop()");
expect('the translated survey is open, at the address from its title', (await text('app-survey-header app-badge')) === 'Open' && teaSlug === 'tea-or-coffee', `${await text('app-survey-header app-badge')}, ${teaSlug}`);
await dismissToasts();

// ── A reader whose account is Slovak: one survey has no Slovak, one has all of it ──
await viewport(360);
await signOut(SK);
await js('localStorage.clear(); sessionStorage.clear(); true');
await setIamUser(ZUZANA);
await go('/');
await clickText('app-top-bar button', 'Sign in');
await sleep(1500);
await settle();
await waitFor(page, "!!document.querySelector('app-top-bar .user-button')", 15000);
expect('Zuzana reads Slovak, from her account', (await pageLanguage()) === 'sk' && (await text('app-survey-home h1')) === HOME_SK && (await storedLanguage()) === ' / ', `${await pageLanguage()}, ${await text('app-survey-home h1')}, ${await storedLanguage()}`);
const list = await listed();
expect('home, Slovak: the translated survey is listed in Slovak, with nothing said about its language', same(list[teaSlug], ['Čaj alebo káva?', null, null]), JSON.stringify(list[teaSlug]));
expect('home, Slovak: the survey with no Slovak keeps its English title, says lang="en", and notes its language', same(list[slug], ['Genshin 6.1 - what next?', 'en', 'Jazyk: English']), JSON.stringify(list[slug]));
expect('home, Slovak: the language is named as its speakers write it, in an element that says which language that is', same(await js("[...document.querySelectorAll('app-survey-home .survey-language [lang]')].map((e) => [e.textContent.trim(), e.getAttribute('lang')])"), [['English', 'en']]), JSON.stringify(await marked('app-survey-home')));
await expectBar('Slovak, 360 px, two surveys');
await expectNoKeys('Slovak, the home page with two surveys');
await screenshots('sk-360-home-two-surveys');

// The survey with no Slovak, on a Slovak page: its own texts in English and said to be, the site's words Slovak.
await go(`/${slug}`);
await waitFor(page, "!!document.querySelector('.start button')", 15000);
expect('no Slovak: the welcome is the survey\'s own, in English, and one more fact says so', (await text('app-survey-hero h1')) === 'Genshin 6.1 - what next?' && (await text('app-take-survey .fact-language')) === 'Jazyk: English', `${await text('app-survey-hero h1')} / ${JSON.stringify(await texts('app-take-survey .facts li'))}`);
expect('no Slovak: lang="en" on the title, the welcome and the language\'s name - and on nothing else', same(await marked('app-take-survey'), ['title: en', 'intro rich: en', 'span: en']), JSON.stringify(await marked('app-take-survey')));
expect('no Slovak: the site\'s own words are Slovak all the same', (await pageLanguage()) === 'sk' && (await text('app-survey-hero .eyebrow')) === 'Prieskum' && (await text('.start button')) === 'Začať prieskum', `${await pageLanguage()}, ${await text('app-survey-hero .eyebrow')}, ${await text('.start button')}`);
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
  (await text('app-question-block .text')) === 'Which element do you play most?' && same(await texts('app-question-block .label'), ['Anemo', 'Geo']) && same(await marked('app-take-survey'), ['title: en', 'text rich: en', 'label: en', 'label: en']),
  `${await text('app-question-block .text')} ${JSON.stringify(await marked('app-take-survey'))}`,
);
expect('... between the site\'s Slovak: the step line and the button', (await text('app-survey-hero .where'))?.includes('Krok 2 / 2') && (await text('button[type=submit]'))?.includes('Odoslať odpovede'), `${await text('app-survey-hero .where')} / ${await text('button[type=submit]')}`);
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
expect('translated: nothing says another language, and there is no note', same(await marked('app-take-survey'), []) && !(await js("!!document.querySelector('app-take-survey .fact-language')")), JSON.stringify(await marked('app-take-survey')));
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
  (await text('app-take-survey .step-heading')) === 'Váš nápoj' && (await text('app-question-block .text')) === 'Čo pijete ráno?' && same(await texts('app-question-block .label'), ['Čaj', 'Káva']) && same(await marked('app-take-survey'), []),
  `${await text('app-take-survey .step-heading')} / ${await text('app-question-block .text')} / ${JSON.stringify(await texts('app-question-block .label'))} ${JSON.stringify(await marked('app-take-survey'))}`,
);
await expectBar('Slovak, 360 px, a step of the translated survey');
await expectNoKeys('Slovak, a step of the translated survey');
await screenshots('sk-360-translated-step');
await clickText('app-question-block label', 'Čaj');
await sleep(200);
await clickText('button[type=submit]', 'Odoslať odpovede');
await waitFor(page, "!!document.querySelector('.done-heading')", 15000);
expect('translated: the thank-you in Slovak', (await text('.done-heading')) === 'Ďakujeme!' && (await text('app-take-survey .thanks')) === SLOVAK[2][1] && same(await marked('app-take-survey'), []), `${await text('.done-heading')} / ${await text('app-take-survey .thanks')}`);
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
expect('Nina, in Slovak: the question, and her answer given', (await text('app-question-block .text')) === 'Čo pijete ráno?' && same(await chosenLabels(), ['Káva']), `${await text('app-question-block .text')} ${JSON.stringify(await chosenLabels())}`);
await chooseLanguage('English', 'en');
expect(
  'changed to English in the middle of the step: the same step, every text of the survey in English',
  (await text('app-survey-hero .where'))?.includes('Step 2 of 2') && (await text('app-take-survey .step-heading')) === 'Your cup' && (await text('app-question-block .text')) === 'Which do you drink in the morning?' && same(await texts('app-question-block .label'), ['Tea', 'Coffee']) && same(await marked('app-take-survey'), []) && (await js('document.title')).startsWith('Tea or coffee?'),
  `${await text('app-survey-hero .where')} / ${await text('app-question-block .text')} / ${JSON.stringify(await texts('app-question-block .label'))} / ${await js('document.title')}`,
);
expect('... and the answer given is kept', same(await chosenLabels(), ['Coffee']), JSON.stringify(await chosenLabels()));
await clickText('app-take-survey .step-actions button', 'Back');
await sleep(400);
expect('... and so are the answers of the step before', (await text('app-take-survey .step-heading')) === 'About you' && same(await chosenLabels(), ['Female', '25–34']), `${await text('app-take-survey .step-heading')} ${JSON.stringify(await chosenLabels())}`);
await clickText('button[type=submit]', 'Next');
await sleep(500);
await expectBar('English, 360 px, the translated survey');
await screenshots('en-360-translated-step-switched');
await clickText('button[type=submit]', 'Send my answers');
await waitFor(page, "!!document.querySelector('.done-heading')", 15000);
expect('sent in English: the thank-you in English', (await text('.done-heading')) === 'Thank you!' && (await text('app-take-survey .thanks'))?.startsWith('Thank you! Your answers are on their way'), `${await text('.done-heading')} / ${await text('app-take-survey .thanks')}`);

// ── The admin area: which language each of them read ────────────────────────
await viewport(1280);
await signInAs(OWNER, EN);
/** What a person's answers say about the language, in the drawer of the results. */
async function readIn(id, person) {
  await go(`/admin/surveys/${id}/results?tab=people`);
  await waitFor(page, "!!document.querySelector('#results-panel-people button.person')", 15000);
  await clickText('#results-panel-people button.person', person);
  await waitFor(page, "!!document.querySelector('app-drawer app-response-view')", 15000);
  await sleep(500);
  return text('app-drawer app-response-view .read-in');
}
expect('the admin area: Zuzana read the survey in Slovak', (await readIn(teaId, ZUZANA.username)) === 'Read in Slovak', await text('app-drawer app-response-view .read-in'));
expect('... and her answer is shown in the language the survey is written in', (await texts('app-drawer app-response-view .option.is-chosen .option-label')).some((label) => label.startsWith('Tea')), JSON.stringify(await texts('app-drawer app-response-view .option.is-chosen .option-label')));
await screenshot('admin-read-in-slovak');
expect('the admin area: Nina, who changed to English before she sent, read it in English', (await readIn(teaId, NINA.username)) === 'Read in English', await text('app-drawer app-response-view .read-in'));
expect('the admin area: the survey with no Slovak was read in English, on her Slovak page too', (await readIn(surveyId, NINA.username)) === 'Read in English', await text('app-drawer app-response-view .read-in'));

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
  (await editorTabs()) === 'English main | Slovak 7 / 8 shown in English' && (await js("[...document.querySelectorAll('app-editor-languages .tab')].find((tab) => tab.textContent.includes('Slovak'))?.getAttribute('title')")) === MEANWHILE,
  `${await editorTabs()} / ${await js("[...document.querySelectorAll('app-editor-languages .tab')].find((tab) => tab.textContent.includes('Slovak'))?.getAttribute('title')")}`,
);
const openAlert = (await texts('app-survey-editor app-alert')).find((words) => words.includes('This survey is open, and has problems'));
expect(
  'the editor says the open survey has a problem, which, and what it means: by name, the readers of Slovak see it in English',
  !!openAlert && openAlert.includes('People are taking it as it is now.') && openAlert.includes('Until every text is translated, readers of Slovak see this survey in English.') && same(await texts('app-editor-outline .problem'), ['Slovak: question 1 has 1 text to translate.']),
  `${openAlert} ${JSON.stringify(await texts('app-editor-outline .problem'))}`,
);
expect('... and nothing about a question being skipped: every question can be answered, a text is missing', !openAlert?.includes('skipped'), openAlert);
expect('an open survey: the list of problems, and the Editor tab\'s count, say it is open - not "before it opens"', (await text('app-editor-outline #problems-title')) === '1 to fix - the survey is open' && (await problemsCount()) === '1 to fix - the survey is open', `${await text('app-editor-outline #problems-title')} / ${await problemsCount()}`);
await screenshot('editor-open-untranslated-1280', true);
// On the translation's own tab: the banner, and the bar that stays in view, say the same.
await clickText('app-editor-languages .tab', 'Slovak');
await waitFor(page, "!!document.querySelector('app-survey-editor .translating-meanwhile')", 15000);
const translatingBanner = (await texts('app-survey-editor app-alert')).find((words) => words.includes('You are translating this survey into Slovak'));
expect('the Slovak tab: the banner and the bar in view say what readers get until the text is written', translatingBanner?.includes(MEANWHILE) && (await text('app-survey-editor .translating-meanwhile')) === 'Readers see English until all are', `${translatingBanner} / ${await text('app-survey-editor .translating-meanwhile')}`);
await viewport(390);
await sleep(500);
await expectBar('the editor, an open survey with a text untranslated, 390 px');
expect(
  '390 px: the tabs and the bar hold what they say - nothing is cut off',
  await js("[...document.querySelectorAll('app-editor-languages .tab, app-editor-languages .tag, app-survey-editor .translating, app-survey-editor .translating-meanwhile')].every((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth + 0.5; })"),
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
  (await text('app-survey-hero h1')) === 'Tea or coffee?' && (await text('app-take-survey .intro'))?.startsWith('Thank you for taking a few minutes') && (await text('app-take-survey .fact-language')) === 'Jazyk: English' && same(await marked('app-take-survey'), ['title: en', 'intro rich: en', 'span: en']),
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
  (await text('app-take-survey .step-heading')) === 'Your cup' && (await text('app-question-block .text')) === 'Which do you drink in the morning?' && same(await texts('app-question-block .label'), ['Tea', 'Coffee', 'Neither']) && same(await marked('app-take-survey'), ['title: en', 'step-heading: en', 'text rich: en', 'label: en', 'label: en', 'label: en']),
  `${await text('app-take-survey .step-heading')} / ${JSON.stringify(await texts('app-question-block .label'))} / ${JSON.stringify(await marked('app-take-survey'))}`,
);
expect('... with the site\'s own words in Slovak around them', (await pageLanguage()) === 'sk' && (await text('app-survey-hero .where'))?.includes('Krok 2 / 2') && (await text('button[type=submit]'))?.includes('Odoslať odpovede'), `${await pageLanguage()}, ${await text('app-survey-hero .where')} / ${await text('button[type=submit]')}`);
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
const theirSlovak = { ...before.translations.sk, title: THEIR_TITLE, questions: { ...before.translations.sk.questions, [cup.id]: { ...before.translations.sk.questions[cup.id], options: { ...before.translations.sk.questions[cup.id].options, [neither.id]: { label: THEIR_OPTION } } } } };
const theirSave = await asOwner('PUT', `/api/admin/surveys/${teaId}`, { revision: before.revision, survey: { ...before, translations: { ...before.translations, sk: theirSlovak } } });
expect('meanwhile a translator saves the survey: the missing Slovak text, and a new Slovak title', theirSave.status === 200 && neither.label === 'Neither', `${theirSave.status}${theirSave.status === 200 ? '' : ' ' + (await theirSave.text()).slice(0, 300)}, the third option: ${neither.label}`);
// The author, whose page knows nothing of it, rewords the third option in English.
await js("(() => { const el = document.querySelectorAll('app-options-editor .option-input')[2]; el.scrollIntoView({ block: 'center' }); el.focus(); el.select(); return true; })()");
await sleep(150);
await typeText('Neither of them');
await waitFor(page, "[...document.querySelectorAll('app-survey-editor app-alert')].some((alert) => alert.textContent.includes('Somebody else has saved this survey meanwhile'))", 15000);
await sleep(300);
const conflict = (await texts('app-survey-editor app-alert')).find((words) => words.includes('Somebody else has saved this survey meanwhile'));
// What "Save mine over it" keeps of theirs: the notice, and the question before it is done.
const MERGED_NOTICE =
  'That loses their changes to the questions and the settings; their translations stay as they saved them, except the texts you changed here and the texts of what they removed or reworded, which stay as you have them.';
const MERGED_QUESTION =
  'Their changes to the questions and the settings are lost. Their translations stay as they saved them, except the texts you changed here and the texts of what they removed or reworded, which stay as you have them.';
expect(
  'the author\'s save is a conflict, and the editor says what each way out keeps and loses',
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
expect('save mine over it', (await clickText('app-survey-editor app-alert button', 'Save mine over it')) === true);
await waitFor(page, "!!document.querySelector('dialog[open]')", 15000);
await sleep(300);
const overTheirs = await question();
expect(
  'asked first, in the words of what that loses and what it keeps',
  overTheirs?.title === 'Save your version over theirs?' && overTheirs?.message === MERGED_QUESTION,
  JSON.stringify(overTheirs),
);
await screenshot('editor-conflict-asked-1280');
await clickText('dialog[open] button', 'Save mine');
await saved();
await sleep(400);
const after = await teaAsSaved();
expect(
  'saved over theirs: the author\'s English text is in, and the translator\'s Slovak texts are still there',
  after.steps[0].questions[0].options[2].label === 'Neither of them' && after.translations.sk.title === THEIR_TITLE && after.translations.sk.questions[cup.id].options[neither.id]?.label === THEIR_OPTION && after.revision === before.revision + 2,
  `${after.steps[0].questions[0].options[2].label} / ${after.translations.sk.title} / ${after.translations.sk.questions[cup.id].options[neither.id]?.label} / revision ${before.revision} -> ${after.revision}`,
);
expect(
  'the editor has them too: the conflict is settled, Slovak is whole again, and nothing says "shown in English"',
  (await editorTabs()) === 'English main | Slovak 8 / 8' && !(await texts('app-survey-editor app-alert')).some((words) => words.includes('Somebody else has saved') || words.includes('This survey is open, and has problems')),
  `${await editorTabs()} / ${JSON.stringify((await texts('app-survey-editor app-alert')).map((words) => words.slice(0, 50)))}`,
);
expect('an open survey with nothing to fix: "Nothing to fix" - not "Ready to open" - and no count on the Editor tab', (await text('app-editor-outline #problems-title')) === 'Nothing to fix' && (await problemsCount()) === null, `${await text('app-editor-outline #problems-title')} / ${await problemsCount()}`);
await clickText('app-editor-languages .tab', 'Slovak');
await sleep(800);
const slovakTitle = await js("[...document.querySelectorAll('app-translated-text input[data-place]')].find((field) => JSON.parse(field.getAttribute('data-place'))[0] === 'title')?.value ?? null");
expect('the Slovak tab shows the translator\'s title', slovakTitle === THEIR_TITLE, slovakTitle);
await screenshot('editor-conflict-settled-1280', true);
// And a reader of Slovak gets the survey in Slovak again - under the translator's title.
await go(`/${teaSlug}`);
await waitFor(page, "!!document.querySelector('app-take-survey app-survey-hero h1')", 15000);
expect('a Slovak reader gets the survey in Slovak again, with the translator\'s title', (await pageLanguage()) === 'sk' && (await text('app-survey-hero h1')) === THEIR_TITLE && same(await marked('app-take-survey'), []), `${await pageLanguage()}, ${await text('app-survey-hero h1')}, ${JSON.stringify(await marked('app-take-survey'))}`);

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
const MILK_SK = { text: '<p>Čo si do neho dávate?</p>', placeholder: '', options: { 'milk-milk': { label: 'Mlieko' }, 'milk-sugar': { label: 'Cukor' }, 'milk-other': { label: 'Niečo iné' } }, images: {} };
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
  (await js("document.querySelector('app-survey-header a[href*=preview]')?.getAttribute('href')")) === `/preview/${teaId}` && (await text('app-editor-languages .tab.is-active'))?.startsWith('English'),
  `${await js("document.querySelector('app-survey-header a[href*=preview]')?.getAttribute('href')")} / ${await text('app-editor-languages .tab.is-active')}`,
);
await clickText('app-survey-header a', 'Preview');
await waitFor(page, "location.pathname.startsWith('/preview/') && !!document.querySelector('app-take-survey app-survey-hero h1')", 15000);
await sleep(500);
const previewBack = await js("[...document.querySelectorAll('app-take-survey a')].filter((a) => a.textContent.includes('Back to the editor')).map((a) => a.getAttribute('href'))");
expect(
  'the preview from the main tab, on a Slovak page: the survey as it is written - in English, and said to be - the site\'s words Slovak',
  (await pageLanguage()) === 'sk' && (await text('app-survey-hero h1')) === 'Tea or coffee?' && (await text('app-take-survey .fact-language')) === 'Jazyk: English' && (await marked('app-take-survey')).includes('title: en') && (await text('.start button')) === 'Začať prieskum',
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
expect('back in the editor: on the main tab', (await text('app-editor-languages .tab.is-active'))?.startsWith('English') && (await js('location.search')) === '', `${await text('app-editor-languages .tab.is-active')} / ${await js('location.search')}`);

// ── Answers sent to an address the survey has left ──────────────────────────
// Pat started this survey on a Slovak page (above) and comes back to it. While Pat is on its last step, the owner
// changes its address - through the API, with the owner's token taken before Pat signs in (it lasts ten minutes).
// Pat's answers go to the old address: the page says so, and becomes "There is no survey here"; at the new address
// the answers are offered again.
const ownerToken = await js("JSON.parse(localStorage.getItem(Object.keys(localStorage).find((name) => name.startsWith('anotoki-auth:')))).access_token");
const asTheOwner = (method, path, body) => fetch(origin + path, { method, headers: { Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
await viewport(390);
await signInAs(PAT, SK);
await go(`/${teaSlug}`);
await waitFor(page, "!!document.querySelector('app-take-survey app-alert')", 15000);
expect('Pat, on a Slovak page, is offered to carry on', (await text('app-take-survey app-alert'))?.includes('Pokračovať tam, kde ste prestali?'), await text('app-take-survey app-alert'));
await clickText('app-take-survey app-alert button', 'Pokračovať');
await sleep(500);
await clickText('app-question-block label', 'Čaj');
await sleep(200);
await pick('milk-other');
await sleep(300);
await clickText('button[type=submit]', 'Odoslať odpovede');
await sleep(600);
const otherError = await texts('app-question-block .error');
expect('Slovak: "Other" chosen and its field left empty - asked for the answer, by the option\'s label', same(otherError, ['Pri možnosti „Niečo iné“ napíšte, prosím, vlastnú odpoveď.']), JSON.stringify(otherError));
await expectBar('Slovak, 390 px, an "Other" left empty');
await expectNoKeys('Slovak, an "Other" left empty');
await screenshots('sk-390-write-other');
await focus('app-question-block .other input');
await typeText('Med');
const beforeMove = (await (await asTheOwner('GET', `/api/admin/surveys/${teaId}`)).json()).survey;
const MOVED = 'tea-or-coffee-today';
const moved = await asTheOwner('PUT', `/api/admin/surveys/${teaId}`, { revision: beforeMove.revision, survey: { ...beforeMove, slug: MOVED } });
expect('meanwhile the owner changes the survey\'s address', moved.status === 200, `${moved.status}${moved.status === 200 ? '' : ' ' + (await moved.text()).slice(0, 300)}`);
await clickText('button[type=submit]', 'Odoslať odpovede');
await waitFor(page, "!!document.querySelector('app-take-survey .message-heading')", 15000);
await sleep(400);
const GONE_SK = 'Tento prieskum sa už na tejto adrese nenachádza, takže odpovede sa nepodarilo odoslať. Zostávajú uložené v tomto prehliadači – ak sa prieskum presunul, otvorte ho zo zoznamu prieskumov a pokračujte.';
expect('sent to the address it had: the toast says the survey is not there any more, and that the answers are kept', (await toasts()).includes(GONE_SK), JSON.stringify(await toasts()));
expect('... and the page is "There is no survey here", with its way to the open surveys', (await text('app-take-survey .message-heading')) === 'Tu nie je žiadny prieskum' && (await text('app-take-survey'))?.includes('Zobraziť otvorené prieskumy'), await text('app-take-survey'));
await expectBar('Slovak, 390 px, the survey gone from its address');
await expectNoKeys('Slovak, the survey gone from its address');
await screenshots('sk-390-survey-gone', false);
await dismissToasts();
await go(`/${MOVED}`);
await waitFor(page, "!!document.querySelector('app-take-survey app-alert')", 15000);
const offeredAgain = await text('app-take-survey app-alert');
expect('at the new address the answers are offered again', ['Pokračovať tam, kde ste prestali?', 'a dostali ste sa po krok 2 / 2'].every((part) => offeredAgain?.includes(part)), offeredAgain);
await screenshots('sk-390-survey-moved-carry-on');
await clickText('app-take-survey app-alert button', 'Pokračovať');
await sleep(500);
expect('... every answer as it was left, the words for "Other" too', same(await chosenLabels(), ['Čaj', 'Niečo iné']) && (await js("document.querySelector('app-question-block .other input')?.value")) === 'Med', `${JSON.stringify(await chosenLabels())} / ${await js("document.querySelector('app-question-block .other input')?.value")}`);
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
expect('meanwhile somebody else saves the survey without its second question - and so without its Slovak', removedThere.status === 200 && afterRemoval.steps[0].questions.length === 1 && !afterRemoval.translations.sk.questions[MILK.id], `${removedThere.status}, ${afterRemoval.steps[0].questions.length} question(s)`);
await js("(() => { const el = document.querySelectorAll('app-options-editor .option-input')[2]; el.scrollIntoView({ block: 'center' }); el.focus(); el.select(); return true; })()");
await sleep(150);
await typeText('Neither, thanks');
await waitFor(page, "[...document.querySelectorAll('app-survey-editor app-alert')].some((alert) => alert.textContent.includes('Somebody else has saved this survey meanwhile'))", 15000);
await sleep(300);
const removedConflict = (await texts('app-survey-editor app-alert')).find((words) => words.includes('Somebody else has saved this survey meanwhile'));
expect('the next change here is a conflict, and the notice says the texts of what they removed stay as they are here', removedConflict?.includes(MERGED_NOTICE) && removedConflict?.includes('Save mine over it'), removedConflict);
await clickText('app-survey-editor app-alert button', 'Save mine over it');
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
  keptMine.steps[0].questions.some((item) => item.id === MILK.id) && keptMine.translations.sk.questions[MILK.id]?.text === MILK_SK.text && same(keptLabels, ['Cukor', 'Mlieko', 'Niečo iné']) && keptMine.steps[0].questions[0].options[2].label === 'Neither, thanks',
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
const inSlovak = await asOwner('PUT', `/api/admin/surveys/${surveyId}`, { revision: genshin.revision, survey: { ...genshin, language: 'sk', translations: { en: { title: genshin.title, intro: '', thanks: '', steps: {}, questions: {} } } } });
expect('meanwhile somebody else says the first survey is written in Slovak, and translates it into English', inSlovak.status === 200, `${inSlovak.status}${inSlovak.status === 200 ? '' : ' ' + (await inSlovak.text()).slice(0, 300)}`);
await js("(() => { const s = document.querySelector('app-editor-languages .add-select'); s.value = 'sk'; s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()");
await waitFor(page, "[...document.querySelectorAll('app-survey-editor app-alert')].some((alert) => alert.textContent.includes('Somebody else has saved this survey meanwhile'))", 15000);
await sleep(300);
const refusedNotice = (await texts('app-survey-editor app-alert')).find((words) => words.includes('Somebody else has saved this survey meanwhile'));
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
expect('take the saved version', (await clickText('app-survey-editor app-alert button', 'Take the saved version')) === true);
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
    steps: [{ ...teaNow.steps[0], questions: teaNow.steps[0].questions.map((item, index) => (index === 0 ? { ...item, options: [...item.options, { id: 'water', label: 'Water', other: false, images: [] }] } : item)) }, ...teaNow.steps.slice(1)],
  },
});
expect('the tea survey\'s last day set to yesterday, and an option added in English only', pastDay.status === 200 && teaNow.status === 'open', `${pastDay.status}, ${teaNow.status}`);
await go(`/admin/surveys/${teaId}/edit`);
await waitFor(page, "!!document.querySelector('app-editor-languages .tab') && !!document.querySelector('#survey-title')", 15000);
await sleep(500);
expect('its last day over: the header says Closed', (await text('app-survey-header app-badge')) === 'Closed', await text('app-survey-header app-badge'));
expect(
  '... and nothing says what its readers see: no "open, and has problems", no "shown in English" on the tab',
  !(await texts('app-survey-editor app-alert')).some((words) => words.includes('This survey is open')) && /^English main \| Slovak \d+ \/ \d+$/.test(await editorTabs()),
  `${await editorTabs()} / ${JSON.stringify((await texts('app-survey-editor app-alert')).map((words) => words.slice(0, 60)))}`,
);
expect('a closed survey: the list of problems, and the Editor tab\'s count, say what to fix before it reopens', (await text('app-editor-outline #problems-title')) === '1 to fix before it reopens' && (await problemsCount()) === '1 to fix before it reopens', `${await text('app-editor-outline #problems-title')} / ${await problemsCount()}`);
await screenshot('editor-past-last-day-1280', true);
await clickText('app-editor-languages .tab', 'Slovak');
await waitFor(page, "[...document.querySelectorAll('app-survey-editor app-alert')].some((alert) => alert.textContent.includes('You are translating this survey into Slovak'))", 15000);
await sleep(400);
const pastBanner = (await texts('app-survey-editor app-alert')).find((words) => words.includes('You are translating this survey into Slovak'));
expect(
  'its Slovak tab: the banner says what holds for it now, and the bar says nothing of readers',
  pastBanner?.includes('Until every text is translated the survey cannot be opened, and one that is open already is shown in English.') && !pastBanner?.includes('This survey is open') && !(await js("!!document.querySelector('app-survey-editor .translating-meanwhile')")),
  pastBanner,
);
await viewport(390);
await sleep(500);
await expectBar('the editor, an open survey past its last day, 390 px');
await screenshots('editor-past-last-day-390');

// ═══ The pages drawn instead of the site ═══════════════════════════════════
// A browser that has never been here - nothing stored, so no strings kept from an earlier visit - and a site that
// is not set up: every request is answered as the backend's setup gate answers it. The tab is named by the site,
// never by a key ("title.surveys"), whichever page was asked for.
await viewport(390);
await js('localStorage.clear(); sessionStorage.clear(); true');
await intercept('*/api/*', () => ({ status: 503, body: { error: 'The survey site is not set up yet. Open /setup.php to set it up.', code: 'not_set_up', setup: '/setup.php' } }));
for (const [path, what] of [
  ['/', 'the home page'],
  ['/nothing/here', 'an address the site does not know'],
  ['/admin', 'the admin area'],
]) {
  await go(path);
  await waitFor(page, "!!document.querySelector('app-not-set-up h1')", 15000);
  await sleep(900);
  const title = await js('document.title');
  expect(`not set up, nothing stored, ${what}: the page says so in English, and the tab is the site's name - not a key`, (await text('app-not-set-up h1')) === 'The survey site is not set up yet' && title === 'anotoki survey' && (await pageLanguage()) === 'en', `${await text('app-not-set-up h1')} / tab: ${title} / ${await pageLanguage()}`);
  await expectNoKeys(`not set up, ${what}`);
  if (path === '/') {
    await expectNoSideways('not set up, 390 px');
    await screenshots('en-390-not-set-up');
  }
}
// The same with a server that does not answer at all - and then one that does: "Try again" opens the page that
// was asked for. It is a page of the admin area, so the way there is through the sign-in; never a blank page.
expected = [/The sign-in settings could not be loaded/];
await intercept('*/api/*', () => 'unreachable');
await setIamUser(OWNER);
await go('/admin/languages');
await waitFor(page, "!!document.querySelector('app-load-error h1')", 15000);
await sleep(900);
expect('out of reach, nothing stored: the page says so in English, and the tab is not a key', (await text('app-load-error h1')) === 'The survey site cannot be reached' && !/\w\.\w/.test(await js('document.title')), `${await text('app-load-error h1')} / tab: ${await js('document.title')}`);
await expectNoKeys('out of reach');
await expectNoSideways('out of reach, 390 px');
await screenshots('en-390-load-error');
await stopIntercepting();
expect('try again', (await clickText('app-load-error button', 'Try again')) === true);
await waitFor(page, "location.pathname === '/admin/languages' && document.querySelectorAll('app-languages .language').length === 2", 20000);
await sleep(400);
expect('"Try again", the server back: the page that was asked for - through the sign-in - not a blank one', (await text('app-top-bar .user-name')) === OWNER.username && (await js('document.title')).startsWith('Languages · '), `${await text('app-top-bar .user-name')} / ${await js('document.title')}`);
expect('the console said only what a server out of reach makes it say', heard.length > 0 && heard.every((message) => message.includes('The sign-in settings could not be loaded')), heard.join(' | ').slice(0, 300));
expected = [];

const unworded = problems.filter((problem) => problem.includes('[i18n] no string for'));
expect('no string was missing ("[i18n] no string for ...")', unworded.length === 0, unworded.join('; ').slice(0, 300));

console.log('\nCHECKS (' + checks + ')');
console.log('PROBLEMS (' + problems.length + '):');
for (const problem of problems) console.log(' -', problem.slice(0, 300));
await page.close();
process.exitCode = problems.length ? 1 : 0;
