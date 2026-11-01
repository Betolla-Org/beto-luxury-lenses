#!/usr/bin/env node
// Engine evaluation in a real browser: `npm run eval` (compare to the baseline), `npm run eval -- --update`
// (accept the current results as the new baseline).
//
// 1. Lens fit: runs dev/lens-fit.html on face photos and compares the live pipeline's lens (center and
//    ellipse) per eye with dev/eval-baseline.json. Catches changes that move or resize the lens.
// 2. Stability: turns the first photo with a face into fake-camera videos and runs the real try-on screen
//    on them with ?trace: a still video measures jitter (how much the lens shakes when nothing moves),
//    a panning one measures lag (how far the smoothed lens trails the raw measurement).
//
// Needs Chrome (CHROME_PATH, or the usual install locations) and, for part 2, ffmpeg on the PATH (or FFMPEG).
// Photos: EVAL_PHOTOS_DIR, else dev/eval-photos/ (commit photos you have the rights to), else dev/fixtures/.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, relative, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { createServer } from 'vite';

const ROOT = resolve(import.meta.dirname, '..');
const BASELINE = join(ROOT, 'dev/eval-baseline.json');
const REPORT = join(ROOT, 'dev/eval-report.json');
const UPDATE = process.argv.includes('--update');

// Regression limits (relative to the iris radius, or to the baseline)
const MAX_CENTER_SHIFT = 0.1; // lens center moved by more than 10% of the iris radius
const MAX_SIZE_CHANGE = 0.1; // an ellipse semi-axis changed by more than 10%
const STABILITY_FACTOR = 1.5; // jitter or lag grew by more than 50%...
const STABILITY_SLACK = { jitter: 0.01, lag: 0.02 }; // ...and by more than this (run-to-run noise)

const log = (...a) => console.log(...a);
const fail = [];
const notes = [];

// --- setup -------------------------------------------------------------------------------------

const photoDir = [process.env.EVAL_PHOTOS_DIR, 'dev/eval-photos', 'dev/fixtures']
  .filter(Boolean)
  .map(d => resolve(ROOT, d))
  .find(d => existsSync(d) && readdirSync(d).some(f => /\.(jpe?g|png|webp)$/i.test(f)));
if (!photoDir) {
  log('No photos found (EVAL_PHOTOS_DIR, dev/eval-photos/ or dev/fixtures/): engine eval skipped.');
  process.exit(0);
}
if (relative(ROOT, photoDir).startsWith('..')) {
  console.error(`EVAL_PHOTOS_DIR must be inside the repo (the dev server serves it): ${photoDir}`);
  process.exit(2);
}
const photos = readdirSync(photoDir).filter(f => /\.(jpe?g|png|webp)$/i.test(f)).sort();
const photoUrl = f => '/' + relative(ROOT, join(photoDir, f)).split(/[\\/]/).join('/');

const chrome = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(p => p && existsSync(p));
if (!chrome) {
  console.error('Chrome not found: set CHROME_PATH.');
  process.exit(2);
}
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const hasFfmpeg = spawnSync(ffmpeg, ['-version']).status === 0;

const launch = (video) =>
  puppeteer.launch({
    executablePath: chrome,
    headless: true,
    args: [
      ...(process.platform === 'linux' ? ['--no-sandbox'] : []),
      '--enable-unsafe-swiftshader',
      '--use-angle=swiftshader',
      ...(video
        ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--use-file-for-fake-video-capture=${video}`]
        : []),
    ],
  });

log(`Photos: ${photos.length} in ${relative(ROOT, photoDir)} · Chrome: ${chrome}`);
const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 4317, strictPort: false } });
await server.listen();
const base = server.resolvedUrls.local[0];
const tmp = mkdtempSync(join(tmpdir(), 'beto-eval-'));

const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf-8')) : null;
const report = { date: new Date().toISOString(), photos, fit: null, stability: null };

try {
  // --- 1. lens fit ------------------------------------------------------------------------------
  {
    const browser = await launch();
    const page = await browser.newPage();
    await page.goto(`${base}dev/lens-fit.html?photos=${photos.map(photoUrl).join(',')}`);
    await page.waitForFunction(() => window.__lensFit || /Error/.test(document.getElementById('status')?.textContent ?? ''), {
      timeout: 180_000,
    });
    const fit = await page.evaluate(() => window.__lensFit ?? null);
    await browser.close();
    if (!fit) throw new Error('lens-fit page failed');

    const eyes = fit.eyes.map(e => ({ ...e, photo: basename(e.photo) }));
    report.fit = { eyes, noFace: fit.noFace.map(p => basename(p)) };
    log(`\nLens fit: ${eyes.length} eyes in ${photos.length - fit.noFace.length} of ${photos.length} photos`);
    for (const p of report.fit.noFace) log(`  no face found: ${p}`);

    for (const old of baseline?.fit?.eyes ?? []) {
      const now = eyes.find(e => e.photo === old.photo && e.eye === old.eye);
      const id = `${old.photo} ${old.eye} eye`;
      if (!now) {
        if (photos.includes(old.photo)) fail.push(`${id}: no longer measured`);
        continue;
      }
      const r = old.landmark.r;
      const shift = Math.hypot(now.live.x - old.live.x, now.live.y - old.live.y) / r;
      const size = Math.max(Math.abs(now.live.rx / old.live.rx - 1), Math.abs(now.live.ry / old.live.ry - 1));
      const line = `  ${id}: center moved ${(shift * 100).toFixed(1)}% of r, size changed ${(size * 100).toFixed(1)}%`;
      log(line);
      if (shift > MAX_CENTER_SHIFT) fail.push(`${id}: lens center moved ${(shift * 100).toFixed(1)}% of the iris radius`);
      if (size > MAX_SIZE_CHANGE) fail.push(`${id}: lens size changed ${(size * 100).toFixed(1)}%`);
    }
    for (const e of eyes) {
      if (baseline && !baseline.fit?.eyes?.some(o => o.photo === e.photo && o.eye === e.eye)) {
        notes.push(`${e.photo} ${e.eye} eye: new (not in the baseline)`);
      }
    }
  }

  // --- 2. stability -------------------------------------------------------------------------------
  const facePhoto = report.fit.eyes[0]?.photo;
  if (!hasFfmpeg) {
    notes.push('ffmpeg not found: stability (jitter/lag) skipped');
  } else if (!facePhoto) {
    notes.push('no photo with a face: stability (jitter/lag) skipped');
  } else {
    const src = join(photoDir, facePhoto);
    const make = (name, filter) => {
      const out = join(tmp, name);
      // Temporal noise like a phone sensor's, so the landmarks jitter as they do on a real camera
      const r = spawnSync(ffmpeg, ['-v', 'error', '-y', '-loop', '1', '-i', src, '-t', '5', '-r', '15', '-vf', `${filter},noise=alls=14:allf=t,format=yuv420p`, out]);
      if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
      return out;
    };
    const still = make('still.y4m', 'scale=720:1080:force_original_aspect_ratio=increase,crop=720:1080');
    // A 2 s circular pan of 30 px: the face moves about 95 px/s across the frame
    const pan = make(
      'pan.y4m',
      "scale=780:1170:force_original_aspect_ratio=increase,crop=720:1080:x='(iw-720)/2+30*sin(2*PI*t/2)':y='(ih-1080)/2+30*cos(2*PI*t/2)'"
    );

    const traceRun = async (video) => {
      const browser = await launch(video);
      const page = await browser.newPage();
      await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
      await page.goto(`${base}?trace`);
      await page.waitForSelector('.snap-start', { timeout: 30_000 });
      await page.click('.snap-start');
      await page.waitForFunction(() => document.body.innerText.includes('LIVE TRACKING'), { timeout: 120_000 });
      await new Promise(r => setTimeout(r, 2000)); // let the filters settle
      await page.evaluate(() => (window.__betoTrace = []));
      await new Promise(r => setTimeout(r, 4000));
      const trace = await page.evaluate(() => window.__betoTrace);
      await browser.close();
      return trace;
    };

    const perEye = (trace, fn) => {
      const values = [0, 1].map(i => fn(trace.filter(f => f.raw[i] && f.lens[i]).map(f => ({ raw: f.raw[i], lens: f.lens[i] }))));
      const ok = values.filter(v => Number.isFinite(v));
      return ok.length ? ok.reduce((s, v) => s + v, 0) / ok.length : NaN;
    };
    // RMS distance of a point series from its own mean, relative to the iris radius
    const jitter = key => samples => {
      if (samples.length < 10) return NaN;
      const pts = samples.map(s => s[key]);
      const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
      const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const r = pts.reduce((s, p) => s + p.r, 0) / pts.length;
      return Math.sqrt(pts.reduce((s, p) => s + (p.x - mx) ** 2 + (p.y - my) ** 2, 0) / pts.length) / r;
    };
    const lag = pick => samples => {
      if (samples.length < 10) return NaN;
      const d = samples.map(s => Math.hypot(s.lens.x - s.raw.x, s.lens.y - s.raw.y) / s.raw.r).sort((a, b) => a - b);
      return pick(d);
    };
    const fps = trace => (trace.length > 1 ? ((trace.length - 1) * 1000) / (trace.at(-1).t - trace[0].t) : NaN);

    log(`\nStability (fake camera from ${facePhoto})`);
    const stillTrace = await traceRun(still);
    const panTrace = await traceRun(pan);
    const s = {
      photo: facePhoto,
      jitterLens: perEye(stillTrace, jitter('lens')),
      jitterRaw: perEye(stillTrace, jitter('raw')),
      lagMean: perEye(panTrace, lag(d => d.reduce((a, b) => a + b, 0) / d.length)),
      lagP95: perEye(panTrace, lag(d => d[Math.floor(d.length * 0.95)])),
      fps: fps(panTrace),
      frames: { still: stillTrace.length, pan: panTrace.length },
    };
    report.stability = s;
    const pct = v => `${(v * 100).toFixed(2)}% of r`;
    log(`  jitter at rest: lens ${pct(s.jitterLens)} (raw measurement ${pct(s.jitterRaw)})`);
    log(`  lag while moving: mean ${pct(s.lagMean)}, 95th percentile ${pct(s.lagP95)}`);
    log(`  tracked frames per second: ${s.fps.toFixed(1)} (headless, software GL: not a device number)`);
    if (!Number.isFinite(s.jitterLens) || !Number.isFinite(s.lagMean)) fail.push('stability: the face was not tracked on the fake camera');

    const old = baseline?.stability;
    if (old && old.photo !== facePhoto) {
      notes.push(`stability baseline is for ${old.photo}, this run used ${facePhoto}: not compared (run --update)`);
    } else if (old) {
      const worse = (now, was, slack) => now > Math.max(was * STABILITY_FACTOR, was + slack);
      if (worse(s.jitterLens, old.jitterLens, STABILITY_SLACK.jitter)) fail.push(`jitter grew: ${pct(old.jitterLens)} -> ${pct(s.jitterLens)}`);
      if (worse(s.lagMean, old.lagMean, STABILITY_SLACK.lag)) fail.push(`lag grew: ${pct(old.lagMean)} -> ${pct(s.lagMean)}`);
    }
  }
} finally {
  await server.close();
  rmSync(tmp, { recursive: true, force: true });
}

// --- verdict -------------------------------------------------------------------------------------
writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n');
for (const n of notes) log(`note: ${n}`);

if (UPDATE) {
  const next = { fit: { eyes: report.fit.eyes }, stability: report.stability ?? baseline?.stability ?? null };
  writeFileSync(BASELINE, JSON.stringify(next, null, 2) + '\n');
  log(`\nBaseline updated: ${relative(ROOT, BASELINE)}`);
} else if (!baseline) {
  log(`\nNo baseline yet: run \`npm run eval -- --update\` to record one (${relative(ROOT, BASELINE)}).`);
} else if (fail.length) {
  log('\nEngine regressions:');
  for (const f of fail) log(`  ✗ ${f}`);
  log('If the change is intended, accept it with `npm run eval -- --update`.');
  process.exit(1);
} else {
  log('\nNo regressions against the baseline.');
}
