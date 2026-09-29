// The survey site end to end in headless Chrome, signing in through the
// stand-in IAM (backend/tests/tools/fake-iam.php) - never the real one. It
// expects an empty site: run.mjs makes one and starts everything; on its own:
//
//   node flow.mjs <debugging port> <site origin> <fake IAM origin> <png file> <shots folder>
//
// The owner (ADMIN) writes a survey with a picture and opens it; somebody with
// no role takes it, once, and is kept out of the admin area; the owner reads
// the answer; an editor gets everything but the delete buttons; a phone-sized
// page has no sideways scroll. Prints ok/FAIL per check and every page error.

import { mkdirSync, writeFileSync } from 'node:fs';
import { openPage, sleep, waitFor } from './cdp.mjs';

const [port, origin, iam, pngFile, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const page = await openPage(Number(port));
await page.send('Page.enable');
await page.send('Runtime.enable');
await page.send('DOM.enable');
const problems = [];
page.on('Runtime.exceptionThrown', (e) => problems.push('exception: ' + (e.exceptionDetails?.exception?.description ?? e.exceptionDetails?.text)));
page.on('Runtime.consoleAPICalled', (e) => {
  if (e.type === 'error' || e.type === 'warning') problems.push(`console.${e.type}: ` + e.args.map((a) => a.value ?? a.description).join(' '));
});
await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false });

let shot = 0;
async function screenshot(name) {
  await sleep(300);
  const { data } = await page.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${out}/${String(++shot).padStart(2, '0')}-${name}.png`, Buffer.from(data, 'base64'));
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
function expect(what, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${detail !== '' ? ' - ' + detail : ''}`);
  if (!ok) problems.push(`expectation failed: ${what} ${detail}`);
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
const setIamUser = async (user) => (await fetch(`${iam}/_test/state`, { method: 'POST', body: JSON.stringify({ user }) })).ok;

/** Signed out of this site (the stand-in IAM's logout comes back to /), then in again as `user`. */
async function signInAs(user) {
  await setIamUser(user);
  await go('/');
  const menu = await js("!!document.querySelector('app-top-bar .user-button')");
  if (menu) {
    await js("document.querySelector('app-top-bar .user-button').click(); true");
    await sleep(300);
    await clickText('app-top-bar .menu-item', 'Sign out');
    await sleep(1500);
    await settle();
  }
  expect(`signed out before ${user.username}`, await js("!!document.querySelector('app-top-bar button.btn-primary')"));
  await clickText('app-top-bar button', 'Sign in');
  await sleep(1500);
  await settle();
  await waitFor(page, "!!document.querySelector('app-top-bar .user-name')", 15000);
  expect(`signed in as ${user.username}`, (await text('app-top-bar .user-name')) === user.username, await text('app-top-bar .user-name'));
}

const OWNER = { id: 1, username: 'owner', roles: ['ADMIN'] };
const PAT = { id: 101, username: 'pat', roles: [] };
const EDITH = { id: 2, username: 'edith', roles: ['EDITOR'] };

// ── Signed out: the top bar offers to sign in; the admin area sends to the IAM ──
await setIamUser(OWNER);
await go('/');
await js('localStorage.clear(); sessionStorage.clear(); true');
await go('/');
expect('signed out: a Sign in button in the top bar', (await text('app-top-bar button.btn-primary'))?.includes('Sign in'));
expect('no survey is open yet', (await text('app-survey-home'))?.includes('No survey is open right now'));
await screenshot('home-signed-out');

await go('/admin');
await sleep(1500);
await settle();
expect('/admin while signed out: signed in through the IAM and back at /admin', (await js('location.pathname')) === '/admin', await js('location.pathname'));
expect('the owner is signed in', (await text('app-top-bar .user-name')) === 'owner');
expect('the admin area shows the surveys (no survey yet)', (await text('app-surveys-list'))?.includes('No surveys yet'), (await text('app-surveys-list'))?.slice(0, 120));
await screenshot('admin-empty');

// ── The user menu ───────────────────────────────────────────────────────────
await js("document.querySelector('app-top-bar .user-button').click(); true");
await sleep(300);
const menu = await text('app-top-bar .menu');
expect('the menu: name, address, role, account, the open surveys, sign out', ['owner', 'owner@example.test', 'Administrator', 'Your anotoki account', 'The open surveys', 'Sign out'].every((part) => menu?.includes(part)), menu);
expect('the account link goes to the IAM', (await js("document.querySelector('app-top-bar .menu a[target=_blank]')?.href")) === `${iam}/account`, await js("document.querySelector('app-top-bar .menu a[target=_blank]')?.href"));
await screenshot('user-menu');
await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
await sleep(200);
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
expect('no Admin link for somebody without a role', !(await js("!!document.querySelector('app-top-bar .area-link')")));
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

// ── The owner sees the answer, and may delete it ────────────────────────────
await signInAs(OWNER);
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

// ── A phone: the top bar fits ───────────────────────────────────────────────
await page.send('Emulation.setDeviceMetricsOverride', { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
await go('/');
expect('no sideways scroll at 360 px', await js('document.documentElement.scrollWidth <= window.innerWidth'), await js('document.documentElement.scrollWidth + " > " + window.innerWidth'));
await screenshot('phone-home');

console.log('\nPROBLEMS (' + problems.length + '):');
for (const problem of problems) console.log(' -', problem.slice(0, 300));
await page.close();
process.exitCode = problems.length ? 1 : 0;
