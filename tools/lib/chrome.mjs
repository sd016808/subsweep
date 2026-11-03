// Minimal headless-Chrome driver over the DevTools protocol (no dependencies; Node 22+).
// Normal mode talks over a WebSocket; with `extension` it uses a pipe so it can load an
// unpacked extension (Extensions.loadUnpacked needs --remote-debugging-pipe).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google/Chrome/Application/chrome.exe'),
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export function findChrome() {
  const found = CANDIDATES.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error('Chrome not found. Set the CHROME_PATH environment variable.');
  return found;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class Connection {
  constructor(transport) {
    this.transport = transport;
    this.seq = 0;
    this.pending = new Map();
    this.listeners = new Set();
    transport.onMessage((raw) => {
      const message = JSON.parse(raw);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(`${message.error.message} ${message.error.data || ''}`));
        else resolve(message.result);
      } else if (message.method) {
        for (const listener of this.listeners) listener(message);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.seq;
    this.transport.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  once(method, sessionId) {
    return new Promise((resolve) => {
      const listener = (message) => {
        if (message.method === method && (!sessionId || message.sessionId === sessionId)) {
          this.listeners.delete(listener);
          resolve(message.params);
        }
      };
      this.listeners.add(listener);
    });
  }
}

function pipeTransport(child) {
  const writer = child.stdio[3];
  const reader = child.stdio[4];
  let buffer = '';
  const handlers = [];
  reader.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let end;
    while ((end = buffer.indexOf('\0')) !== -1) {
      const message = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      for (const handler of handlers) handler(message);
    }
  });
  return { send: (text) => writer.write(`${text}\0`), onMessage: (handler) => handlers.push(handler) };
}

/**
 * @param {{ extension?: string, extensionDebugging?: boolean, flags?: string[] }} options
 *   extension: path of an unpacked extension to load right away;
 *   extensionDebugging: allow loadExtension() later; flags: extra Chrome switches.
 * Always talks to Chrome over a pipe (no TCP port to wait for or collide with).
 */
export async function launch(options = {}) {
  const executable = findChrome();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'subsweep-chrome-'));
  const flags = [
    '--headless=new',
    '--remote-debugging-pipe',
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
    '--force-color-profile=srgb',
    '--font-render-hinting=none',
    '--lang=en-US',
  ];
  if (options.extension || options.extensionDebugging) flags.push('--enable-unsafe-extension-debugging');
  if (options.flags) flags.push(...options.flags);
  const child = spawn(executable, [...flags, 'about:blank'], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

  const cdp = new Connection(pipeTransport(child));
  await cdp.send('Browser.getVersion'); // waits until Chrome is ready
  let extensionId = null;

  async function loadExtension(dir) {
    ({ id: extensionId } = await cdp.send('Extensions.loadUnpacked', { path: path.resolve(dir) }));
    return extensionId;
  }
  if (options.extension) await loadExtension(options.extension);

  async function pages() {
    const { targetInfos } = await cdp.send('Target.getTargets');
    return targetInfos.filter((t) => t.type === 'page');
  }

  /** Runs an expression in the extension's background service worker. */
  async function evaluateInServiceWorker(expression) {
    let worker = null;
    for (let i = 0; i < 50 && !worker; i++) {
      const { targetInfos } = await cdp.send('Target.getTargets');
      worker = targetInfos.find((t) => t.type === 'service_worker' && t.url.startsWith(`chrome-extension://${extensionId}/`));
      if (!worker) await sleep(100);
    }
    if (!worker) throw new Error('Extension service worker not found');
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: worker.targetId, flatten: true });
    // A worker that is (re)starting may be paused until a debugger lets it run.
    await cdp.send('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => {});
    const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId);
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }

  async function newPage(options) {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    return attach(targetId, options);
  }

  /** Controls an existing tab (e.g. one the extension opened). */
  async function attach(targetId, { width, height, scale = 1, transparent = false } = {}) {
    const activate = () => cdp.send('Target.activateTarget', { targetId });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    const call = (method, params) => cdp.send(method, params, sessionId);
    const errors = [];
    const contexts = new Map();
    cdp.listeners.add((message) => {
      if (message.sessionId !== sessionId) return;
      if (message.method === 'Runtime.executionContextCreated') contexts.set(message.params.context.id, message.params.context);
      if (message.method === 'Runtime.executionContextsCleared') contexts.clear();
      if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(message.params.args.map((a) => a.value ?? a.description).join(' '));
    });
    await call('Page.enable');
    await call('Runtime.enable');
    if (width && height) await call('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile: false });
    if (transparent) await call('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });

    async function evaluate(expression, contextId) {
      const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, ...(contextId ? { contextId } : {}) });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    }

    return {
      targetId,
      errors,
      /** Brings this tab to the front (other tabs become hidden). */
      activate,
      async goto(url) {
        const loaded = cdp.once('Page.loadEventFired', sessionId);
        await call('Page.navigate', { url });
        await loaded;
      },
      evaluate,
      /** Evaluates inside an extension's content-script (isolated) world. */
      async evaluateInExtension(expression, id = extensionId) {
        const context = [...contexts.values()].find((c) => c.auxData && c.auxData.type === 'isolated' && String(c.origin).includes(id));
        if (!context) throw new Error('Extension content script context not found');
        return evaluate(expression, context.id);
      },
      async screenshot(file, clip = { x: 0, y: 0, width, height }) {
        const { data } = await call('Page.captureScreenshot', { format: 'png', clip: { ...clip, scale: 1 }, captureBeyondViewport: false });
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, Buffer.from(data, 'base64'));
      },
      close: () => cdp.send('Target.closeTarget', { targetId }),
    };
  }

  async function close() {
    try {
      await cdp.send('Browser.close');
    } catch {
      child.kill();
    }
    await sleep(300);
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      // Chrome may still hold a lock on Windows; the OS temp cleaner will get it.
    }
  }

  return {
    newPage,
    attach,
    pages,
    loadExtension,
    evaluateInServiceWorker,
    close,
    get extensionId() {
      return extensionId;
    },
  };
}
