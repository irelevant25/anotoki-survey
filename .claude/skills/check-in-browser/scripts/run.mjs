// The whole browser check in one go, from the repository's root:
//
//   node .claude/skills/check-in-browser/scripts/run.mjs [--no-build] [--keep]
//
// It builds the frontend (unless --no-build), makes a throwaway database
// (survey_test_browser, from survey_test_template - `php tests/run.php` keeps
// that current), starts the stand-in IAM on 8597 and the site on 8590 (the
// built app and the API on one origin, as on the hosting), starts headless
// Chrome with a profile of its own on 8591 - in English (--lang=en-GB), so the
// language the site starts in is never the computer's - runs flow.mjs, and then stops all
// of it and drops the database - also when the check fails. --keep leaves the
// work folder (settings, logs, screenshots) behind to look at; the screenshots
// are always there while it runs.
//
// Chrome: $CHROME, or where Windows, macOS or Linux usually put it. Nothing
// here touches your database, your settings, your browser or the real IAM.

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../../..');
const backend = join(repo, 'backend');
const frontend = join(repo, 'frontend');
const args = new Set(process.argv.slice(2));
const windows = process.platform === 'win32';

const SITE = 8590;
const IAM = 8597;
const CHROME_PORT = 8591;
const DATABASE = 'survey_test_browser';

const work = mkdtempSync(join(tmpdir(), 'survey-browser-'));
const children = [];

function run(command, commandArgs, options = {}) {
  // npm is npm.cmd on Windows: a batch file, which only a shell runs.
  return execFileSync(command, commandArgs, { stdio: 'inherit', shell: windows && command === 'npm', ...options });
}

function start(command, commandArgs, options = {}) {
  const child = spawn(command, commandArgs, { stdio: 'ignore', ...options });
  children.push(child);
  return child;
}

function findChrome() {
  const candidates = [
    process.env.CHROME,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);
  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    throw new Error('No Chrome or Edge found: set CHROME to the browser\'s executable.');
  }
  return found;
}

async function waitForUrl(url, what) {
  for (let i = 0; i < 100; i++) {
    try {
      const response = await fetch(url);
      if (response.status < 500) {
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise((done) => setTimeout(done, 150));
  }
  throw new Error(`${what} did not start (${url}).`);
}

function stopAll() {
  for (const child of children) {
    if (child.exitCode === null) {
      // On Windows a process's children (Chrome's helpers) go only with /T.
      if (windows) {
        try {
          execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
        } catch {
          // already gone
        }
      } else {
        child.kill('SIGTERM');
      }
    }
  }
}

let code = 1;
try {
  if (!args.has('--no-build')) {
    run('npm', ['run', 'build'], { cwd: frontend });
  }
  const php = process.env.PHP ?? 'php';
  run(php, ['tests/tools/testdb.php', 'template'], { cwd: backend });
  run(php, ['tests/tools/testdb.php', 'drop', DATABASE], { cwd: backend });

  // The stand-in IAM's own key, and the site's settings pointing at it.
  const iamDir = join(work, 'fake-iam');
  run(php, ['-r', 'require "api/anotoki_iam.php"; @mkdir($argv[1], 0777, true); file_put_contents($argv[1] . "/key.json", json_encode(anotoki_iam_test_keypair("browser-check")));', iamDir], { cwd: backend });
  run(php, ['tests/tools/testenv.php', join(work, 'config'), `--db=${DATABASE}`, `--issuer=http://127.0.0.1:${IAM}`], { cwd: backend });

  start(php, ['-S', `127.0.0.1:${IAM}`, 'tests/tools/fake-iam.php'], { cwd: backend, env: { ...process.env, FAKE_IAM_DIR: iamDir, FAKE_IAM_ISSUER: `http://127.0.0.1:${IAM}` } });
  start(php, ['-S', `127.0.0.1:${SITE}`, 'router.php'], { cwd: backend, env: { ...process.env, SURVEY_TEST_CONFIG: join(work, 'config') } });
  // --lang: the browser's own language decides which language the site starts in, so it is said here and
  // never left to the computer the check runs on. English; the flow asks for Slovak where it wants it.
  start(findChrome(), ['--headless=new', '--lang=en-GB', `--remote-debugging-port=${CHROME_PORT}`, `--user-data-dir=${join(work, 'chrome')}`, '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1280,860', 'about:blank']);

  await waitForUrl(`http://127.0.0.1:${IAM}/.well-known/openid-configuration`, 'The stand-in IAM');
  await waitForUrl(`http://127.0.0.1:${SITE}/api/health`, 'The site');
  await waitForUrl(`http://127.0.0.1:${CHROME_PORT}/json/version`, 'Chrome');

  // A picture to upload: the site's own logo.
  const picture = join(frontend, 'public', 'anotoki.png');
  const shots = join(work, 'shots');
  console.log(`Screenshots: ${shots}\n`);
  // The flow changes the check's own database once (a database behind the code): it is told how to reach it.
  const flow = spawn(process.execPath, [join(here, 'flow.mjs'), String(CHROME_PORT), `http://127.0.0.1:${SITE}`, `http://127.0.0.1:${IAM}`, picture, shots], {
    stdio: 'inherit',
    env: { ...process.env, SURVEY_CHECK_PHP: php, SURVEY_CHECK_BACKEND: backend, SURVEY_CHECK_CONFIG: join(work, 'config') },
  });
  code = await new Promise((done) => flow.on('exit', (exitCode) => done(exitCode ?? 1)));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
} finally {
  stopAll();
  try {
    execFileSync(process.env.PHP ?? 'php', ['tests/tools/testdb.php', 'drop', DATABASE], { cwd: backend, stdio: 'ignore' });
  } catch {
    console.error(`Could not drop ${DATABASE}: php tests/tools/testdb.php drop ${DATABASE}`);
  }
  if (args.has('--keep')) {
    writeFileSync(join(work, 'README.txt'), 'Left by the browser check (--keep). Delete this folder when done.\n');
    console.log(`\nKept: ${work}`);
  } else {
    // Chrome may hold its profile a moment after it is told to go.
    await new Promise((done) => setTimeout(done, 800));
    rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 });
  }
}
process.exit(code);
