// Minimal headless-Firefox driver over WebDriver BiDi (no dependencies; Node 22+).
// Offers the same page API as ./chrome.mjs (newPage, goto, evaluate, screenshot, …), so the
// browser tests run unchanged in both browsers, plus loadExtension() for temporary add-ons.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CANDIDATES = [
  process.env.FIREFOX_PATH,
  'C:/Program Files/Mozilla Firefox/firefox.exe',
  'C:/Program Files (x86)/Mozilla Firefox/firefox.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Mozilla Firefox/firefox.exe'),
  '/Applications/Firefox.app/Contents/MacOS/firefox',
  '/usr/bin/firefox',
].filter(Boolean);

export function findFirefox() {
  const found = CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error('Firefox not found. Set the FIREFOX_PATH environment variable.');
  return found;
}

export const hasFirefox = () => CANDIDATES.some((candidate) => fs.existsSync(candidate));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const SPECIAL_NUMBERS = { NaN: NaN, '-0': -0, Infinity: Infinity, '-Infinity': -Infinity };

/** BiDi RemoteValue → plain data (like Chrome's returnByValue). */
function fromRemote(remote) {
  switch (remote.type) {
    case 'undefined':
      return undefined;
    case 'null':
      return null;
    case 'number':
      return typeof remote.value === 'number' ? remote.value : SPECIAL_NUMBERS[remote.value];
    case 'bigint':
      return BigInt(remote.value);
    case 'array':
    case 'set':
      return (remote.value || []).map(fromRemote);
    case 'object':
    case 'map':
      return Object.fromEntries((remote.value || []).map(([key, value]) => [typeof key === 'string' ? key : fromRemote(key), fromRemote(value)]));
    default:
      // string, boolean, date (ISO string), regexp…; nodes and functions have no plain value
      return remote.value !== undefined ? remote.value : {};
  }
}

// Quiet, predictable profile: no first-run pages, English UI, no update checks.
const PREFS = {
  'browser.shell.checkDefaultBrowser': false,
  'browser.startup.homepage_override.mstone': 'ignore',
  'startup.homepage_welcome_url': 'about:blank',
  'browser.aboutwelcome.enabled': false,
  'datareporting.policy.dataSubmissionEnabled': false,
  'toolkit.telemetry.reportingpolicy.firstRun': false,
  'browser.tabs.warnOnClose': false,
  'intl.accept_languages': 'en-US',
  'intl.locale.requested': 'en-US',
  'app.update.disabledForTesting': true,
  'layout.css.devPixelsPerPx': '1.0',
};

function waitForEndpoint(child) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Firefox did not start:\n${output}`)), 30000);
    const onData = (chunk) => {
      output += chunk.toString('utf8');
      const match = output.match(/WebDriver BiDi listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1].replace(/\/$/, ''));
      }
    };
    child.stderr.on('data', onData);
    child.stdout.on('data', onData);
    child.on('exit', (code) => reject(new Error(`Firefox exited (${code}):\n${output}`)));
  });
}

/** @param {{ headless?: boolean }} options  (Chrome-only options such as `flags` are ignored) */
export async function launch(options = {}) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'subsweep-firefox-'));
  fs.writeFileSync(path.join(profile, 'user.js'), Object.entries(PREFS).map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`).join('\n'));
  const args = ['--remote-debugging-port', '0', '--profile', profile, '--no-remote', 'about:blank'];
  if (options.headless !== false) args.unshift('--headless');
  const child = spawn(findFirefox(), args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const endpoint = await waitForEndpoint(child);

  const socket = new WebSocket(`${endpoint}/session`);
  await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', () => reject(new Error('Could not connect to Firefox')), { once: true });
  });
  let seq = 0;
  const pending = new Map();
  const listeners = new Set();
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id != null && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.type === 'error') reject(new Error(`${message.error}: ${message.message}`));
      else resolve(message.result);
    } else if (message.type === 'event') {
      for (const listener of listeners) listener(message);
    }
  });
  const send = (method, params = {}) => {
    const id = ++seq;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };

  await send('session.new', { capabilities: {} });
  await send('session.subscribe', { events: ['log.entryAdded'] });
  let extensionId = null;

  /** Installs an unpacked extension as a temporary add-on (like about:debugging). */
  async function loadExtension(dir) {
    ({ extension: extensionId } = await send('webExtension.install', { extensionData: { type: 'path', path: path.resolve(dir) } }));
    return extensionId;
  }

  async function pages() {
    const { contexts } = await send('browsingContext.getTree', { maxDepth: 0 });
    return contexts.map((c) => ({ targetId: c.context, url: c.url }));
  }

  async function newPage(pageOptions) {
    const { context } = await send('browsingContext.create', { type: 'tab' });
    return attach(context, pageOptions);
  }

  async function attach(context, { width, height } = {}) {
    const errors = [];
    listeners.add((message) => {
      const entry = message.params;
      if (message.method === 'log.entryAdded' && entry.level === 'error' && entry.source && entry.source.context === context) errors.push(entry.text);
    });
    if (width && height) await send('browsingContext.setViewport', { context, viewport: { width, height } });

    /** Runs a script (expression or statements) in the page; returns its value as plain data. */
    async function evaluate(expression) {
      const response = await send('script.evaluate', {
        expression,
        target: { context },
        awaitPromise: true,
        resultOwnership: 'none',
        serializationOptions: { maxObjectDepth: null },
      });
      if (response.type === 'exception') {
        const details = response.exceptionDetails;
        throw new Error(details.text || JSON.stringify(details.exception));
      }
      return fromRemote(response.result);
    }

    return {
      targetId: context,
      errors,
      /** Brings this tab to the front (other tabs become hidden). */
      activate: () => send('browsingContext.activate', { context }),
      async goto(url) {
        await send('browsingContext.navigate', { context, url, wait: 'complete' });
      },
      evaluate,
      async screenshot(file) {
        const { data } = await send('browsingContext.captureScreenshot', { context, origin: 'viewport' });
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from(data, 'base64'));
      },
      close: () => send('browsingContext.close', { context }),
    };
  }

  async function close() {
    try {
      await Promise.race([send('browser.close'), sleep(3000)]);
    } catch {
      // already closing
    }
    socket.close();
    await Promise.race([new Promise((resolve) => child.once('exit', resolve)), sleep(3000)]);
    if (child.exitCode == null) child.kill();
    await sleep(300);
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      // Firefox may still hold a lock on Windows; the OS temp cleaner will get it.
    }
  }

  return {
    name: 'firefox',
    newPage,
    attach,
    pages,
    loadExtension,
    close,
    get extensionId() {
      return extensionId;
    },
  };
}
