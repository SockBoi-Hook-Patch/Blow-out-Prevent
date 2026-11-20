#!/usr/bin/env node
// Renders the 60 s looping BOP explainer to MP4 (1080x1920, 30 fps, H.264 + AAC).
// Usage: node render/render.js [out.mp4] [--fps 30] [--seconds 60] [--preview t1,t2,...]
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const outFile = path.resolve(args.find(a => a.endsWith('.mp4')) || 'BOP_8bit_loop.mp4');
const FPS = +opt('--fps', 30);
const SECONDS = +opt('--seconds', 60);
const preview = opt('--preview', null);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('console', m => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', e => console.error('[pageerror]', e.message));
  await page.goto('file://' + path.join(__dirname, 'frame.html'));
  await page.evaluate(() => window.ready);
  await page.waitForTimeout(300);

  if (preview) {
    const dir = path.dirname(outFile);
    for (const t of preview.split(',').map(Number)) {
      const b64 = await page.evaluate(t => renderFrame(t), t);
      const f = path.join(dir, `frame_${String(t).padStart(5, '0')}.png`);
      fs.writeFileSync(f, Buffer.from(b64, 'base64'));
      console.log('wrote', f);
    }
    await browser.close();
    return;
  }

  const tmp = fs.mkdtempSync(path.join(path.dirname(outFile), '.render-'));
  const wav = path.join(tmp, 'audio.wav');
  console.log('rendering audio…');
  const a64 = await page.evaluate(() => renderAudio());
  fs.writeFileSync(wav, Buffer.from(a64, 'base64'));

  const total = Math.round(FPS * SECONDS);
  const ff = spawn('ffmpeg', [
    '-y', '-loglevel', 'error',
    '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-',
    '-i', wav,
    '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p', '-tune', 'animation',
    '-c:a', 'aac', '-b:a', '192k',
    '-t', String(SECONDS), '-movflags', '+faststart',
    outFile,
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const t0 = Date.now();
  for (let i = 0; i < total; i++) {
    const b64 = await page.evaluate(t => renderFrame(t), i / FPS);
    const buf = Buffer.from(b64, 'base64');
    if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    if (i % 150 === 0) console.log(`frame ${i}/${total}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  ff.stdin.end();
  await new Promise((res, rej) => ff.on('close', c => c === 0 ? res() : rej(new Error('ffmpeg ' + c))));
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('done:', outFile);
  console.log(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,width,height,r_frame_rate', '-of', 'compact', outFile]).toString());
})().catch(e => { console.error(e); process.exit(1); });
