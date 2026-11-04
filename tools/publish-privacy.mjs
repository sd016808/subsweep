// Publishes the privacy-policy page (built from PRIVACY.md) with GitHub Pages.
//
// The page lives in its own small public repository, so the extension's source code
// stays private. Needs the GitHub CLI (`gh`), signed in to the owner account.
// The first run creates the repository and turns on GitHub Pages; later runs update it.
//
// Run with: npm run privacy:publish [-- "commit message"]
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = 'sd016808/subsweep-privacy';
const [OWNER, NAME] = REPO.split('/');
const URL = `https://${OWNER}.github.io/${NAME}/`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'site');
const message = process.argv[2] || 'Update privacy policy';

const run = (cmd, args, options = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
const succeeds = (cmd, args) => {
  try {
    run(cmd, args);
    return true;
  } catch {
    return false;
  }
};

execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build-privacy-page.mjs')], { stdio: 'inherit' });

if (!succeeds('gh', ['repo', 'view', REPO])) {
  console.log(`Creating public repository ${REPO} …`);
  run('gh', ['repo', 'create', REPO, '--public', '--description', 'Privacy policy of SubSweep – Subscription Cleaner for YouTube', '--homepage', URL]);
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'subsweep-privacy-'));
try {
  run('git', ['clone', '--quiet', `https://github.com/${REPO}.git`, dir]);
  const git = (...args) => run('git', ['-C', dir, ...args]);
  git('checkout', '-q', '-B', 'main');
  for (const file of fs.readdirSync(SITE)) fs.copyFileSync(path.join(SITE, file), path.join(dir, file));
  git('add', '-A');
  if (git('status', '--porcelain')) {
    git('commit', '-q', '-m', message);
    git('push', '-q', '-u', 'origin', 'main');
    console.log('✓ pushed');
  } else {
    console.log('✓ already up to date');
  }
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}

if (!succeeds('gh', ['api', `repos/${REPO}/pages`])) {
  console.log('Turning on GitHub Pages …');
  run('gh', ['api', '-X', 'POST', `repos/${REPO}/pages`, '-f', 'source[branch]=main', '-f', 'source[path]=/']);
}

console.log(`\nPrivacy policy: ${URL}\n(GitHub Pages can take a minute or two to show changes.)`);
