#!/usr/bin/env node
/*
 * Records the SubSweep promo video:
 *   1. narration: one clip per line of tools/video/script.<locale>.mjs, spoken by a voice
 *      built into Windows (tools/video/tts.ps1);
 *   2. picture: tools/video/stage.js in headless Chrome, in real time: title cards plus
 *      the real panel scanning, unsubscribing and resubscribing against a fake YouTube
 *      (mock channels, no real account), with subtitles;
 *   3. ffmpeg puts the frames and the voice clips together.
 *
 * Usage:  node tools/video/make-video.mjs [--voice=Yating|Hanhan|Zhiwei] [--rate=1.05] [--keep-frames]
 * Output: dist/video/subsweep-promo-<locale>.mp4, .srt (subtitles) and -thumbnail.jpg
 * Needs Windows (for the voices), Chrome and ffmpeg on PATH.
 */
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { launch } from '../lib/chrome.mjs';
import { contentScriptTags, escapeHtml, fakeSite, logoSvg, previewGlobals } from '../lib/preview-page.mjs';
import { startServer } from '../lib/serve.mjs';
import { ROOT } from '../lib/targets.mjs';

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
    return [key, value];
  }),
);
const VOICE = args.voice || 'Yating';
const RATE = Number(args.rate || 1.15);
const LOCALE = args.locale || 'zh_TW';
const SCRIPT = (await import(`./script.${LOCALE}.mjs`)).default;

const OUT = path.join(ROOT, 'dist', 'video');
const TTS_DIR = path.join(OUT, 'tts');
const FRAMES = path.join(OUT, 'frames');
const BASE = path.join(OUT, `subsweep-promo-${LOCALE}`);
fs.mkdirSync(TTS_DIR, { recursive: true });

const run = (command, commandArgs, options = {}) => {
  const result = spawnSync(command, commandArgs, { stdio: 'inherit', ...options });
  if (result.status !== 0) throw new Error(`${command} failed (exit ${result.status})`);
};

// ---------------------------------------------------------------- 1. narration

const escapeXml = (s) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
const ssml = (text) =>
  `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${SCRIPT.locale.replace('_', '-')}"><prosody rate="${RATE}">${escapeXml(text)}</prosody></speak>`;

const lines = SCRIPT.scenes.flatMap((scene) =>
  scene.lines.map((line, i) => {
    const hash = crypto.createHash('sha1').update(`${VOICE}|${RATE}|${line.say}`).digest('hex').slice(0, 16);
    return {
      key: `${scene.id}.${i}`,
      say: line.say,
      show: line.show ?? line.say.replace(/[，。；、,;]+$/u, ''),
      file: path.join(TTS_DIR, `${hash}.wav`),
    };
  }),
);

const missing = lines.filter((line) => !fs.existsSync(line.file));
if (missing.length) {
  console.log(`Voice: ${missing.length} line(s) with Microsoft ${VOICE}…`);
  const jobs = path.join(TTS_DIR, 'jobs.json');
  fs.writeFileSync(jobs, JSON.stringify(missing.map((line) => ({ ssml: ssml(line.say), out: line.file }))));
  run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'tools', 'video', 'tts.ps1'), '-Jobs', jobs, '-Voice', VOICE]);
}

function readWav(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`Not a WAV file: ${file}`);
  let format = null;
  for (let at = 12; at + 8 <= buf.length; ) {
    const id = buf.toString('ascii', at, at + 4);
    const size = buf.readUInt32LE(at + 4);
    const body = at + 8;
    if (id === 'fmt ') format = { sampleRate: buf.readUInt32LE(body + 4), channels: buf.readUInt16LE(body + 2), bits: buf.readUInt16LE(body + 14) };
    if (id === 'data') {
      if (!format || format.bits !== 16 || format.channels !== 1) throw new Error(`Expected 16-bit mono PCM: ${file}`);
      const samples = new Int16Array(buf.buffer.slice(buf.byteOffset + body, buf.byteOffset + body + size));
      return { ...format, samples, ms: (samples.length / format.sampleRate) * 1000 };
    }
    at = body + size + (size % 2);
  }
  throw new Error(`No audio data in ${file}`);
}

for (const line of lines) line.audio = readWav(line.file);
const SAMPLE_RATE = lines[0].audio.sampleRate;
if (lines.some((line) => line.audio.sampleRate !== SAMPLE_RATE)) throw new Error('Voice clips have different sample rates');
const voiceMs = lines.reduce((sum, line) => sum + line.audio.ms, 0);
console.log(`Narration: ${lines.length} lines, ${(voiceMs / 1000).toFixed(1)} s of speech`);

// ---------------------------------------------------------------- 2. picture

const server = await startServer(ROOT);
const demoUrl = server.page(
  '/__video/demo.html',
  `<!doctype html><html lang="${SCRIPT.locale.replace('_', '-')}"><head><meta charset="utf-8"><title>Demo</title></head><body>
${fakeSite(false)}
${previewGlobals(LOCALE)}
<script src="/tools/video/open-shadow.js"></script>
<script src="/tools/preview/stub.js"></script>
<script src="/tools/preview/mock.js"></script>
${contentScriptTags()}
<script src="/tools/video/demo-backend.js"></script>
</body></html>`,
);
const video = {
  scenes: SCRIPT.scenes.map((scene) => ({
    id: scene.id,
    lines: lines.filter((line) => line.key.startsWith(`${scene.id}.`)).map((line) => ({ key: line.key, show: line.show, ms: Math.round(line.audio.ms) })),
  })),
  cards: SCRIPT.cards,
  logo: logoSvg(24),
  logoInverse: logoSvg(132, 'inverse'),
};
const stageUrl = server.page(
  '/__video/stage.html',
  `<!doctype html><html lang="${SCRIPT.locale.replace('_', '-')}"><head><meta charset="utf-8"><title>${escapeHtml(SCRIPT.title)}</title>
<link rel="stylesheet" href="/tools/video/stage.css"></head><body>
<div id="stage">
  <div id="backdrop"></div>
  <div id="browser" class="hidden"><div class="bar"></div><iframe id="site" src="${demoUrl}"></iframe></div>
  <div id="caption"><span></span></div>
  <div id="cursor" class="off"></div>
  <div id="fade"></div>
</div>
${previewGlobals(LOCALE, { __VIDEO: video })}
<script src="/tools/preview/mock.js"></script>
<script src="/tools/video/stage.js"></script>
</body></html>`,
);

fs.rmSync(FRAMES, { recursive: true, force: true });
fs.mkdirSync(FRAMES, { recursive: true });
const chrome = await launch();
let result;
const frames = [];
try {
  const page = await chrome.newPage({ width: 1920, height: 1080 });
  await page.goto(stageUrl);
  await page.activate();
  await page.evaluate('window.__ready()');
  page.on('Page.screencastFrame', (params) => {
    const name = `f${String(frames.length + 1).padStart(5, '0')}.jpg`;
    fs.writeFileSync(path.join(FRAMES, name), Buffer.from(params.data, 'base64'));
    const ts = params.metadata && params.metadata.timestamp ? params.metadata.timestamp * 1000 : Date.now();
    frames.push({ name, ts });
    page.send('Page.screencastFrameAck', { sessionId: params.sessionId }).catch(() => {});
  });
  await page.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
  console.log('Recording (real time)…');
  result = await page.evaluate('window.__play()');
  await new Promise((resolve) => setTimeout(resolve, 300));
  await page.send('Page.stopScreencast');

  // A thumbnail for YouTube (1280×720): a headline next to the suggestions list.
  await page.evaluate('window.__thumbnail()');
  const shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 2 / 3 } });
  fs.writeFileSync(`${BASE}-thumbnail.jpg`, Buffer.from(shot.data, 'base64'));
  if (page.errors.length) console.warn(`Page errors:\n  ${page.errors.join('\n  ')}`);
} finally {
  await chrome.close();
  await server.close();
}

const totalMs = result.end - result.t0;
const spoken = result.events.filter((e) => e.type === 'line');
console.log(`Recorded ${(totalMs / 1000).toFixed(1)} s, ${frames.length} frames (${((frames.length / totalMs) * 1000).toFixed(1)} fps captured)`);
if (spoken.length !== lines.length) throw new Error(`Expected ${lines.length} narration cues, got ${spoken.length}`);

// ---------------------------------------------------------------- 3. assemble

// Frames → timed list (each frame shows until the next one arrives).
frames.sort((a, b) => a.ts - b.ts);
let first = 0;
for (let i = 0; i < frames.length; i++) if (frames[i].ts <= result.t0) first = i;
const used = frames.slice(first).filter((f) => f.ts <= result.end);
let list = 'ffconcat version 1.0\n';
used.forEach((frame, i) => {
  const start = Math.max(frame.ts, result.t0);
  const next = i + 1 < used.length ? used[i + 1].ts : result.end;
  list += `file '${frame.name}'\nduration ${(Math.max(1, next - start) / 1000).toFixed(4)}\n`;
});
list += `file '${used[used.length - 1].name}'\n`;
fs.writeFileSync(path.join(FRAMES, 'frames.ffconcat'), list);

// Voice clips → one track, each clip where its subtitle appeared.
const track = new Int16Array(Math.ceil((totalMs / 1000) * SAMPLE_RATE) + SAMPLE_RATE);
const byKey = new Map(lines.map((line) => [line.key, line]));
for (const cue of spoken) {
  const { samples } = byKey.get(cue.key).audio;
  const offset = Math.round(((cue.at - result.t0) / 1000) * SAMPLE_RATE);
  for (let i = 0; i < samples.length && offset + i < track.length; i++) {
    track[offset + i] = Math.max(-32768, Math.min(32767, track[offset + i] + samples[i]));
  }
}
const wavHeader = Buffer.alloc(44);
wavHeader.write('RIFF', 0, 'ascii');
wavHeader.writeUInt32LE(36 + track.byteLength, 4);
wavHeader.write('WAVEfmt ', 8, 'ascii');
wavHeader.writeUInt32LE(16, 16);
wavHeader.writeUInt16LE(1, 20);
wavHeader.writeUInt16LE(1, 22);
wavHeader.writeUInt32LE(SAMPLE_RATE, 24);
wavHeader.writeUInt32LE(SAMPLE_RATE * 2, 28);
wavHeader.writeUInt16LE(2, 32);
wavHeader.writeUInt16LE(16, 34);
wavHeader.write('data', 36, 'ascii');
wavHeader.writeUInt32LE(track.byteLength, 40);
const narration = path.join(OUT, 'narration.wav');
fs.writeFileSync(narration, Buffer.concat([wavHeader, Buffer.from(track.buffer)]));

// Subtitles, for YouTube's caption upload (the video has them burned in too).
const stamp = (ms) => {
  const t = Math.max(0, Math.round(ms));
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(t / 3600000))}:${pad(Math.floor(t / 60000) % 60)}:${pad(Math.floor(t / 1000) % 60)},${pad(t % 1000, 3)}`;
};
const srt = spoken
  .map((cue, i) => {
    const line = byKey.get(cue.key);
    const start = cue.at - result.t0;
    return `${i + 1}\n${stamp(start)} --> ${stamp(start + line.audio.ms + 150)}\n${line.show}\n`;
  })
  .join('\n');
fs.writeFileSync(`${BASE}.srt`, srt);

console.log('Encoding…');
run(
  'ffmpeg',
  [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'concat', '-safe', '0', '-i', 'frames.ffconcat',
    '-i', narration,
    '-vf', 'fps=30,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-r', '30',
    // Loudness close to YouTube's playback level, so the voice isn't turned down or sounds quiet.
    '-af', `loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st=${((totalMs - 600) / 1000).toFixed(2)}:d=0.6`,
    '-c:a', 'aac', '-b:a', '160k', '-ar', '48000',
    '-movflags', '+faststart',
    `${BASE}.mp4`,
  ],
  { cwd: FRAMES },
);
if (!args['keep-frames']) fs.rmSync(FRAMES, { recursive: true, force: true });
console.log(`\n✓ ${path.relative(ROOT, `${BASE}.mp4`)}  (${(fs.statSync(`${BASE}.mp4`).size / 1048576).toFixed(1)} MB, ${(totalMs / 1000).toFixed(1)} s)`);
console.log(`✓ ${path.relative(ROOT, `${BASE}.srt`)}`);
console.log(`✓ ${path.relative(ROOT, `${BASE}-thumbnail.jpg`)}`);
