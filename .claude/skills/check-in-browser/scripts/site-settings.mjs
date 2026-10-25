// The site settings, robots.txt and sitemap.xml and the admin menu (anotoki-lib 0.11.0) in headless Chrome - one page
// a changed frame, the pairings the owner asked for (light + English, dark + Slovak; 1280 and 390): run.mjs makes the
// site and starts everything, as for flow.mjs -
//
//   node .claude/skills/check-in-browser/scripts/run.mjs --flow=site-settings [--no-build] [--keep]
//
// - the admin panel's menu in the family's one shape (Surveys; Localization; System - Site settings, People, Feedback,
//   Error log, Audit log, Backups, Migrations, each its own link), the old System address going on to Site settings;
// - the Site settings page, its three cards; the announcement switched on through its dialog, in English and Slovak;
// - a public page with the announcement above the bar, for a member (no notice for them);
// - maintenance switched on: the family's closed sign for a visitor, in English and Slovak - Sign in at /staff alone -,
//   the API 503 maintenance, the ADMIN using the site as it is with the line above the page; switched off again;
// - /robots.txt and /sitemap.xml from the site's PHP, printed (the sitemap listing an open survey while visitors are
//   welcome).
//
// Prints ok / FAIL per check, the two files, and every page error and console error or warning; exits 1 on any.

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openPage, openPageInNewContext, sleep, waitFor } from './cdp.mjs';

const [port, origin, iam, , out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const page = await openPage(Number(port));
for (const domain of ['Page', 'Runtime', 'Network']) await page.send(`${domain}.enable`);
const problems = [];
const watch = (target, who) => {
  target.on('Runtime.exceptionThrown', (e) => problems.push(`${who}: exception: ${e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text}`));
  target.on('Runtime.consoleAPICalled', (e) => {
    if (e.type === 'error' || e.type === 'warning') problems.push(`${who}: console.${e.type}: ${e.args.map((a) => a.value ?? a.description).join(' ')}`);
  });
};
watch(page, 'page');

let checks = 0;
function expect(what, ok, detail = '') {
  checks++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail !== '' && detail !== null && detail !== undefined ? ' - ' + detail : ''}`);
  if (!ok) problems.push(`expectation failed: ${what} ${detail ?? ''}`);
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** A window of `width`: a phone's under 1000 px. */
async function viewport(target, width) {
  const phone = width < 1000;
  await target.send('Emulation.setDeviceMetricsOverride', { width, height: phone ? 740 : 860, deviceScaleFactor: phone ? 2 : 1, mobile: phone });
  await sleep(250);
}
async function theme(target, value) {
  await target.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value }] });
  await sleep(250);
}
let shot = 0;
async function screenshot(target, name) {
  await sleep(400);
  const { data } = await target.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${String(++shot).padStart(2, '0')}-${name}.png`, Buffer.from(data, 'base64'));
}
const js = (expression, target = page) => target.evaluate(expression);
async function go(path, target = page) {
  await target.send('Page.navigate', { url: origin + path });
  await waitFor(target, "document.readyState === 'complete' && !!document.querySelector('app-root')?.children.length", 20000);
  await sleep(800);
}
const text = (selector, target = page) => js(`document.querySelector(${JSON.stringify(selector)})?.textContent.replace(/\\s+/g, ' ').trim() ?? null`, target);
const texts = (selector, target = page) => js(`[...document.querySelectorAll(${JSON.stringify(selector)})].map((e) => e.textContent.replace(/\\s+/g, ' ').trim())`, target);
const click = (selector, target = page) =>
  js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.click(); return true; })()`, target);
/** A field's words replaced, through real input events (Angular sees them). */
async function fill(selector, value, target = page) {
  const focused = await js(`(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) return false; el.focus(); el.select?.(); return true; })()`, target);
  if (!focused) problems.push(`could not fill ${selector}`);
  await target.send('Input.insertText', { text: value });
  await sleep(150);
}
const setIam = async (changes) => (await fetch(`${iam}/_test/state`, { method: 'POST', body: JSON.stringify(changes) })).ok;
const forgetSession = (target = page) => js("Object.keys(localStorage).filter((name) => name.startsWith('anotoki-auth:')).forEach((name) => localStorage.removeItem(name)); true", target);
const asOwner = async (method, path, body) => {
  const token = await js("JSON.parse(localStorage.getItem(Object.keys(localStorage).find((name) => name.startsWith('anotoki-auth:') && !name.includes(':login:')))).access_token");
  return fetch(origin + path, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
};
/** The IAM's "Sign-in required" for this site - the kept answer in the work folder's cache deleted, so the site asks again at once. */
function signInRequired(required) {
  const cache = join(process.env.SURVEY_CHECK_CONFIG ?? '', 'cache');
  for (const file of existsSync(cache) ? readdirSync(cache) : []) {
    if (file.startsWith('anotoki-iam-application-')) rmSync(join(cache, file), { force: true });
  }
  return setIam({ login_required: required });
}
/** The admin frame's column: its group headings, and its links as "words href" (" [page]" for the one it marks). */
const menu = (root = 'app-admin-root anotoki-admin-frame header nav') =>
  js(`(() => ({
    headings: [...document.querySelectorAll(${JSON.stringify(root + ' .anotoki-side-nav__heading')})].map((h) => h.textContent.trim()),
    links: [...document.querySelectorAll(${JSON.stringify(root + ' a.anotoki-side-nav__link')})].map((a) => a.querySelector('.anotoki-side-nav__label').textContent.trim() + ' ' + a.getAttribute('href') + (a.getAttribute('aria-current') === 'page' ? ' [page]' : '')),
  }))()`);

const OWNER = { id: 1, username: 'owner', roles: ['MEMBER', 'ADMIN'] };
const PAT = { id: 101, username: 'pat', roles: ['MEMBER'] };
const EDITH = { id: 2, username: 'edith', roles: ['MEMBER', 'EDITOR'] };

await viewport(page, 1280);
await theme(page, 'light');

// ── The admin panel's menu, and the Site settings page ─────────────────────────────────────────────────────────
await setIam({ user: OWNER, deny: false });
await go('/admin/system?lang=en');
await waitFor(page, "location.pathname === '/admin/site-settings' && !!document.querySelector('anotoki-site-settings-page [data-cards]')", 20000);
expect('the old System address goes on to Site settings, signed in through the IAM', (await js('location.pathname')) === '/admin/site-settings');
const ALL = [
  'Surveys /admin',
  'Translations /admin/translations',
  'Languages /admin/languages',
  'Site settings /admin/site-settings [page]',
  'People /admin/people',
  'Feedback /admin/feedback',
  'Error log /admin/errors',
  'Audit log /admin/audit',
  'Backups /admin/backups',
  'Migrations /admin/migrations',
];
const ownerMenu = await menu();
expect(
  "the ADMIN's menu: Surveys with no heading, then Localization, then System - each System page its own link",
  same(ownerMenu, { headings: ['Localization', 'System'], links: ALL }),
  JSON.stringify(ownerMenu),
);
expect(
  'the Site settings page: its three cards',
  same(await js("[...document.querySelectorAll('[data-card]')].map((c) => c.getAttribute('data-card'))"), ['getting_in', 'announcement', 'page_access']),
);
await screenshot(page, 'admin-site-settings-1280-light');

// The announcement, through its dialog: shown, a warning, in English and Slovak.
await click('[data-card="announcement"]');
await waitFor(page, '!!document.querySelector(\'[data-switches="announcement"] [data-save]\')', 10000);
await click('[data-switches="announcement"] anotoki-switch[data-enabled] input[role="switch"]');
await js(
  `(() => { const select = document.querySelector('[data-switches="announcement"] anotoki-select[data-level] select'); if (!select) return false; select.value = [...select.options].find((o) => o.textContent.includes('Warning'))?.value ?? select.value; select.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`,
);
await fill('[data-switches="announcement"] anotoki-textarea[data-language="en"] textarea', 'The surveys move to a new server on Sunday evening - your answers stay.');
await fill('[data-switches="announcement"] anotoki-textarea[data-language="sk"] textarea', 'V nedeľu večer sa prieskumy sťahujú na nový server – Vaše odpovede zostanú.');
await click('[data-switches="announcement"] [data-save]');
await waitFor(page, "!document.querySelector('[data-switches]')", 10000).catch(() => null);
const told = await (await fetch(`${origin}/api/site-settings`)).json();
expect('saved through the page: every page is told the announcement', told.announcement?.level === 'warning' && told.announcement?.message?.sk?.startsWith('V nedeľu'), JSON.stringify(told));

await viewport(page, 390);
await theme(page, 'dark');
await sleep(400);
await screenshot(page, 'admin-site-settings-390-dark');
await click('app-admin-root anotoki-admin-frame button.anotoki-admin-frame__menu');
await waitFor(page, "!!document.querySelector('app-admin-root anotoki-admin-frame dialog[open] nav')", 10000);
const drawerMenu = await menu('app-admin-root anotoki-admin-frame dialog[open] nav');
expect('on a phone the same menu in the drawer', same(drawerMenu.links, ALL), JSON.stringify(drawerMenu));
await screenshot(page, 'admin-menu-390-dark');
await js("document.querySelector('app-admin-root anotoki-admin-frame dialog[open]')?.close(); true");
await viewport(page, 1280);
await theme(page, 'light');

// An EDITOR: Surveys and Localization, no System.
await setIam({ user: EDITH });
await forgetSession();
await go('/admin?lang=en');
await waitFor(page, "!!document.querySelector('app-admin-root anotoki-admin-frame header nav')", 20000);
const editorMenu = await menu();
expect(
  "an EDITOR's menu: Surveys and Localization",
  same(editorMenu, { headings: ['Localization'], links: ['Surveys /admin [page]', 'Translations /admin/translations', 'Languages /admin/languages'] }),
  JSON.stringify(editorMenu),
);

// ── A public page with the announcement, for a member ──────────────────────────────────────────────────────────
await setIam({ user: PAT });
await forgetSession();
await go('/?lang=en');
await waitFor(page, "!!document.querySelector('anotoki-announcement [data-announcement]') && !!document.querySelector('app-survey-home')", 20000);
expect(
  'the announcement above the bar, in English, a warning',
  (await text('anotoki-announcement .anotoki-announcement__message'))?.startsWith('The surveys move') &&
    (await js("document.querySelector('[data-announcement]').getAttribute('data-level')")) === 'warning',
);
expect(
  'above the bar, after the skip link',
  same(await js("[...document.querySelectorAll('.skip-link, anotoki-announcement, app-top-bar')].map((e) => e.localName)"), ['a', 'anotoki-announcement', 'app-top-bar']),
);
expect('a member reads no notice of the administrators', (await js("document.querySelectorAll('anotoki-page-notice [data-notice]').length")) === 0);
await screenshot(page, 'public-announcement-1280-light-en');
await go('/?lang=sk');
await viewport(page, 390);
await theme(page, 'dark');
await waitFor(page, "!!document.querySelector('anotoki-announcement [data-announcement]')", 20000);
expect('in Slovak on a Slovak page', (await text('anotoki-announcement .anotoki-announcement__message'))?.startsWith('V nedeľu') && (await text('anotoki-announcement [data-hide]')) === 'Skryť');
expect('no sideways scroll at 390 px', await js('document.documentElement.scrollWidth <= window.innerWidth'));
await screenshot(page, 'public-announcement-390-dark-sk');
await viewport(page, 1280);
await theme(page, 'light');

// ── Maintenance: the closed sign for everybody but the ADMIN ───────────────────────────────────────────────────
await setIam({ user: OWNER });
await forgetSession();
await go('/admin/site-settings?lang=en');
await waitFor(page, '!!document.querySelector(\'[data-card="getting_in"]\')', 20000);
await click('[data-card="getting_in"]');
await waitFor(page, '!!document.querySelector(\'[data-switches="getting_in"] [data-save]\')', 10000);
await click('[data-switches="getting_in"] anotoki-switch[data-enabled] input[role="switch"]');
await fill('[data-switches="getting_in"] anotoki-textarea[data-language="en"] textarea', 'We are moving the surveys to a new server. Back on Sunday at nine.');
await fill('[data-switches="getting_in"] anotoki-textarea[data-language="sk"] textarea', 'Prieskumy sťahujeme na nový server. Späť v nedeľu o deviatej.');
await click('[data-switches="getting_in"] [data-save]');
await sleep(1500);
const status = await (await fetch(`${origin}/api/site-status`)).json();
expect('closed: the status says maintenance, with the message', status.state === 'maintenance' && status.maintenance_message?.en?.startsWith('We are moving'), JSON.stringify(status));
const closedApi = await fetch(`${origin}/api/surveys`);
expect('the API answers nobody 503 maintenance', closedApi.status === 503 && (await closedApi.json()).code === 'maintenance');
expect('the ADMIN uses the API as it is', (await asOwner('GET', '/api/admin/surveys')).status === 200);
await go('/?lang=en');
await waitFor(page, "!!document.querySelector('app-survey-home')", 20000);
expect(
  'the ADMIN sees the site as it is, the line above the page saying it is closed',
  same(await js("[...document.querySelectorAll('anotoki-page-notice [data-notice]')].map((n) => n.getAttribute('data-notice'))"), ['maintenance']),
);

// A visitor: another browser, nothing stored.
const visitor = await openPageInNewContext(Number(port));
for (const domain of ['Page', 'Runtime']) await visitor.send(`${domain}.enable`);
watch(visitor, 'visitor');
await viewport(visitor, 1280);
await theme(visitor, 'light');
await go('/?lang=en', visitor);
await waitFor(visitor, "!!document.querySelector('anotoki-maintenance-page')", 20000);
expect(
  "a visitor: the closed sign - the administrators' words, no Sign in on the page the public lands on",
  (await text('anotoki-maintenance-page', visitor))?.includes('We are moving the surveys') && !(await js("!!document.querySelector('anotoki-maintenance-page button')", visitor)),
  await text('anotoki-maintenance-page', visitor),
);
expect('bare: no top bar, no footer', await js("!document.querySelector('app-top-bar, anotoki-site-footer')", visitor));
await screenshot(visitor, 'maintenance-1280-light-en');
await viewport(visitor, 390);
await theme(visitor, 'dark');
await go('/staff?lang=sk', visitor);
await waitFor(visitor, "!!document.querySelector('anotoki-maintenance-page button')", 20000);
expect(
  "at /staff, in Slovak: the administrators' Slovak words and Sign in",
  (await text('anotoki-maintenance-page', visitor))?.includes('Prieskumy sťahujeme') && (await text('anotoki-maintenance-page button', visitor)) === 'Prihlásiť sa',
  await text('anotoki-maintenance-page', visitor),
);
expect('the address stays /staff', (await js('location.pathname', visitor)) === '/staff');
expect('no sideways scroll at 390 px', await js('document.documentElement.scrollWidth <= window.innerWidth', visitor));
await screenshot(visitor, 'maintenance-staff-390-dark-sk');
await go('/privacy?lang=en', visitor);
await waitFor(visitor, "!!document.querySelector('anotoki-privacy-page, [data-kept]')", 20000).catch(() => null);
expect("the legal pages stay anybody's while closed", !(await js("!!document.querySelector('anotoki-maintenance-page')", visitor)));
await visitor.close();

// Open again, through the page.
await go('/admin/site-settings?lang=en');
await waitFor(page, '!!document.querySelector(\'[data-card="getting_in"]\')', 20000);
await click('[data-card="getting_in"]');
await waitFor(page, '!!document.querySelector(\'[data-switches="getting_in"] [data-save]\')', 10000);
await click('[data-switches="getting_in"] anotoki-switch[data-enabled] input[role="switch"]');
await click('[data-switches="getting_in"] [data-save]');
await sleep(1500);
expect('open again: the status says ready', (await (await fetch(`${origin}/api/site-status`)).json()).state === 'ready');
expect(
  "/staff while the site runs: the admin panel's door",
  await (async () => {
    await go('/staff?lang=en');
    return (await js('location.pathname')).startsWith('/admin');
  })(),
);

// ── robots.txt and sitemap.xml, from the site's PHP ────────────────────────────────────────────────────────────
// An open survey, and visitors welcome: its page is anybody's, so the sitemap lists it.
const made = await (
  await asOwner('POST', '/api/admin/surveys', {
    survey: {
      slug: 'tea-or-coffee',
      title: 'Tea or coffee?',
      status: 'draft',
      intro: '<p>One question.</p>',
      thanks: '<p>Thank you!</p>',
      askAboutYou: false,
      closesOn: null,
      language: 'en',
      translations: {},
      steps: [
        {
          id: 's1',
          title: 'Question',
          questions: [
            {
              id: 'q1',
              type: 'single',
              text: '<p>Which?</p>',
              images: [],
              required: true,
              options: [
                { id: 'a', label: 'Tea', other: false, images: [] },
                { id: 'b', label: 'Coffee', other: false, images: [] },
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
    },
  })
).json();
expect('an open survey', (await asOwner('POST', `/api/admin/surveys/${made.survey?.id}/status`, { status: 'open' })).ok, JSON.stringify(made).slice(0, 200));
const robots = await fetch(`${origin}/robots.txt`);
const robotsText = await robots.text();
expect(
  'robots.txt from the PHP: text, kept an hour',
  robots.status === 200 && robots.headers.get('content-type')?.startsWith('text/plain') && robots.headers.get('cache-control') === 'public, max-age=3600',
);
expect('robots.txt names the sitemap by the configured address', robotsText.includes(`Sitemap: ${origin}/sitemap.xml`));
const requiredMap = await (await fetch(`${origin}/sitemap.xml`)).text();
expect('a sign-in required: the sitemap lists the legal pages, About and Support alone', !requiredMap.includes('tea-or-coffee') && requiredMap.includes(`${origin}/privacy`));
await signInRequired(false);
const sitemap = await fetch(`${origin}/sitemap.xml`);
const sitemapText = await sitemap.text();
expect(
  'visitors welcome: the list and the open survey too',
  sitemap.status === 200 && sitemapText.includes(`<loc>${origin}/tea-or-coffee</loc>`) && sitemapText.includes(`<loc>${origin}/</loc>`),
  sitemapText,
);
await signInRequired(true);
console.log(`\n--- GET /robots.txt\n${robotsText}--- GET /sitemap.xml (visitors welcome)\n${sitemapText}---`);

// The announcement off again: nothing left switched on.
await asOwner('PUT', '/api/admin/site-settings', { settings: { announcement_enabled: false } });

console.log(`\nCHECKS (${checks})`);
console.log(`PROBLEMS (${problems.length})`);
for (const problem of problems) console.log(`  ${problem}`);
await page.close();
process.exit(problems.length ? 1 : 0);
