#!/usr/bin/env node
/*
 * Records the SubSweep promo video:
 *   1. narration: one clip per line of tools/video/script.<locale>.mjs, spoken by
 *      - BreezyVoice (open source, Taiwanese Mandarin, runs on this PC; --tts=breezy), which
 *        speaks in the voice of a short reference recording (see below), or
 *      - an Azure AI Speech neural voice (natural; needs a key, see below), or
 *      - a voice built into Windows (tools/video/tts.ps1), when there is no key;
 *   2. picture: tools/video/stage.js in headless Chrome, in real time: title cards plus
 *      the real panel scanning, unsubscribing and resubscribing against a fake YouTube
 *      (mock channels, no real account), with subtitles;
 *   3. ffmpeg puts the frames and the voice clips together.
 *
 * Usage:  node tools/video/make-video.mjs [--tts=breezy|azure|windows] [--voice=…] [--rate=…] [--keep-frames]
 *   BreezyVoice: installed in ../BreezyVoice (or BREEZYVOICE_DIR). The voice comes from
 *     tools/video/voice/reference.wav (or .m4a/.mp3, 5–15 s of clear speech) and its exact
 *     text in tools/video/voice/reference.txt; or --ref=<file> --ref-text=<text>.
 *     --ref=example uses BreezyVoice's sample voice, for a quick listen only (its usage
 *     rights aren't stated: don't publish a video made with it).
 *   Azure voices (zh-TW): HsiaoChen (default), HsiaoYu, YunJhe — or any full voice name.
 *   Windows voices:       Yating (default), Hanhan, Zhiwei.
 *   --rate: speaking speed, 1 = the voice's normal speed.
 *
 * Azure key: put these two lines in a file named .env in the project folder (git ignores it):
 *   AZURE_SPEECH_KEY=<key 1 of your Speech resource>
 *   AZURE_SPEECH_REGION=<its location, e.g. eastasia>
 *
 * Output: dist/video/subsweep-promo-<locale>.mp4, .srt (subtitles) and -thumbnail.jpg
 * Needs Chrome and ffmpeg on PATH (and Windows for the built-in voices).
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
if (fs.existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));

const LOCALE = args.locale || 'zh_TW';
const SCRIPT = (await import(`./script.${LOCALE}.mjs`)).default;
const LANG = SCRIPT.locale.replace('_', '-');
const TTS = args.tts || (process.env.AZURE_SPEECH_KEY ? 'azure' : 'windows');
if (!['breezy', 'azure', 'windows'].includes(TTS)) throw new Error(`Unknown --tts=${TTS} (breezy, azure or windows)`);
const BREEZY_DIR = process.env.BREEZYVOICE_DIR || path.join(ROOT, '..', 'BreezyVoice');
const REF = TTS === 'breezy' ? breezyReference() : null;
const VOICE =
  TTS === 'breezy'
    ? `breezy-${crypto.createHash('sha1').update(fs.readFileSync(REF.audio)).update(REF.text).digest('hex').slice(0, 12)}`
    : TTS === 'azure'
      ? (args.voice || 'HsiaoChen').includes('-')
        ? args.voice
        : `${LANG}-${args.voice || 'HsiaoChen'}Neural`
      : args.voice || 'Yating';
// Neural voices already speak at a natural pace; the built-in ones are slow.
const RATE = Number(args.rate || { breezy: 1, azure: 1.05, windows: 1.15 }[TTS]);

/** The recording BreezyVoice imitates, and what is said in it. */
function breezyReference() {
  if (args.ref === 'example') {
    // First row of BreezyVoice's sample batch: audio file name, speaker, transcription, …
    const row = fs.readFileSync(path.join(BREEZY_DIR, 'data', 'batch_files.csv'), 'utf8').split(/\r?\n/)[1].split(',');
    console.warn("Using BreezyVoice's sample voice: for listening only, don't publish this video.");
    return { audio: path.join(BREEZY_DIR, 'data', `${row[0]}.wav`), text: row[2] };
  }
  const dir = path.join(ROOT, 'tools', 'video', 'voice');
  const audio = args.ref || ['wav', 'm4a', 'mp3', 'flac', 'ogg', 'webm'].map((ext) => path.join(dir, `reference.${ext}`)).find((file) => fs.existsSync(file));
  const textFile = path.join(dir, 'reference.txt');
  const text = (args['ref-text'] || (fs.existsSync(textFile) ? fs.readFileSync(textFile, 'utf8') : '')).trim();
  if (!audio || !fs.existsSync(audio)) throw new Error('BreezyVoice needs a reference recording: tools/video/voice/reference.wav (or .m4a / .mp3), or --ref=<file>.');
  if (!text) throw new Error('Write what is said in the reference recording into tools/video/voice/reference.txt (or pass --ref-text=…).');
  return { audio, text };
}

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
  `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${LANG}">` +
  (TTS === 'azure' ? `<voice name="${VOICE}">` : '') +
  `<prosody rate="${RATE}">${escapeXml(text)}</prosody>` +
  (TTS === 'azure' ? '</voice>' : '') +
  '</speak>';

const lines = SCRIPT.scenes.flatMap((scene) =>
  scene.lines.map((line, i) => {
    const hash = crypto.createHash('sha1').update(`${TTS}|${VOICE}|${RATE}|${line.say}`).digest('hex').slice(0, 16);
    return {
      key: `${scene.id}.${i}`,
      say: line.say,
      show: line.show ?? line.say.replace(/[，。；、,;]+$/u, ''),
      file: path.join(TTS_DIR, `${hash}.wav`),
    };
  }),
);

/** Azure AI Speech REST API: one request per line, 24 kHz 16-bit mono WAV. */
async function synthesizeAzure(todo) {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION;
  if (!key || !region) throw new Error('Azure voices need AZURE_SPEECH_KEY and AZURE_SPEECH_REGION (see the top of tools/video/make-video.mjs).');
  for (const line of todo) {
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'riff-24khz-16bit-mono-pcm',
          'User-Agent': 'subsweep-promo-video',
        },
        body: ssml(line.say),
      });
      if (response.ok) {
        fs.writeFileSync(line.file, Buffer.from(await response.arrayBuffer()));
        break;
      }
      // The free tier allows a limited number of requests per minute.
      if (response.status === 429 && attempt < 5) {
        await new Promise((resolve) => setTimeout(resolve, 5000 * (attempt + 1)));
        continue;
      }
      const hint = response.status === 401 ? ' (wrong key, or the key belongs to another region)' : response.status === 400 ? ` (voice ${VOICE} may not exist)` : '';
      throw new Error(`Azure speech: HTTP ${response.status}${hint} for "${line.say}"`);
    }
  }
}

function synthesizeWindows(todo) {
  const jobs = path.join(TTS_DIR, 'jobs.json');
  fs.writeFileSync(jobs, JSON.stringify(todo.map((line) => ({ ssml: ssml(line.say), out: line.file }))));
  run('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(ROOT, 'tools', 'video', 'tts.ps1'), '-Jobs', jobs, '-Voice', VOICE]);
}

/**
 * BreezyVoice (MediaTek Research, Apache-2.0): one batch run for all lines, in the voice of
 * the reference recording. Its WAVs are converted to 16-bit mono (and sped up with --rate).
 */
function synthesizeBreezy(todo) {
  const python = path.join(BREEZY_DIR, '.venv', 'Scripts', 'python.exe');
  if (!fs.existsSync(path.join(BREEZY_DIR, 'batch_inference.py')) || !fs.existsSync(python)) {
    throw new Error(`BreezyVoice isn't installed in ${BREEZY_DIR} (set BREEZYVOICE_DIR if it is elsewhere).`);
  }
  const work = path.join(OUT, 'breezy');
  const prompts = path.join(work, 'prompt');
  const results = path.join(work, 'out');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(prompts, { recursive: true });
  fs.mkdirSync(results, { recursive: true });
  // The reference: 16 kHz mono, at most 20 s.
  run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', REF.audio, '-ac', '1', '-ar', '16000', '-t', '20', path.join(prompts, 'ref.wav')]);
  const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
  const csv = path.join(work, 'lines.csv');
  fs.writeFileSync(
    csv,
    'speaker_prompt_audio_filename,speaker,speaker_prompt_text_transcription,content_to_synthesize,output_audio_filename\n' +
      todo.map((line, i) => ['ref', '', REF.text, line.say, `line${i}`].map(quote).join(',')).join('\n') +
      '\n',
  );
  run(python, ['batch_inference.py', '--csv_file', csv, '--speaker_prompt_audio_folder', prompts, '--output_audio_folder', results], {
    cwd: BREEZY_DIR,
    env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' },
  });
  todo.forEach((line, i) => {
    const produced = path.join(results, `line${i}.wav`);
    if (!fs.existsSync(produced)) throw new Error(`BreezyVoice produced no audio for "${line.say}"`);
    const tempo = RATE !== 1 ? ['-af', `atempo=${RATE}`] : [];
    run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', produced, ...tempo, '-ac', '1', '-ar', '24000', '-c:a', 'pcm_s16le', line.file]);
  });
}

const missing = lines.filter((line) => !fs.existsSync(line.file));
const VOICE_NAME = { breezy: `BreezyVoice (${REF ? path.basename(REF.audio) : ''})`, azure: `Azure ${VOICE}`, windows: `Windows ${VOICE}` }[TTS];
console.log(`Voice: ${VOICE_NAME}, rate ${RATE}${missing.length ? ` (${missing.length} new line(s))` : ''}`);
if (missing.length) {
  if (TTS === 'breezy') synthesizeBreezy(missing);
  else if (TTS === 'azure') await synthesizeAzure(missing);
  else synthesizeWindows(missing);
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
