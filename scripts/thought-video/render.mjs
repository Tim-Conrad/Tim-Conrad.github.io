// Films a thought's film page into an MP4.
// node scripts/thought-video/render.mjs <name> <out.mp4> [--stills t1,t2,... <dir>]
// It also writes the voice script with the start and length of each scene to <name>.script.md.
// A scene is as long as its line takes at 2.5 words per second. With real audio, pass the stretch of each scene: K=1.3,1.1,...
// Serve the repository root first: python3 -m http.server 8000
import { chromium } from '../reels/pw.mjs';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const [name, out, flag, list, dir] = process.argv.slice(2);
const FPS = 30;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
p.on('pageerror', e => { console.error('page error:', e.message); process.exitCode = 1; });
await p.goto(`http://localhost:8000/scripts/thought-video/${name}.html?t=0${process.env.K ? '&k=' + process.env.K : ''}`);
await p.evaluate(() => document.fonts.ready);
const dur = await p.evaluate(() => window.DURATION);
const mmss = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
writeFileSync(new URL(`${name}.script.md`, import.meta.url), `# Voice script: ${name}\n\nOne line per scene. Made by render.mjs from the \`say\` lines in \`${name}.js\`: change them there.\nThe film is ${mmss(dur)} long. No audio exists yet.\n\n` +
  (await p.evaluate(() => window.SCRIPT)).map(c => `## ${c.scene} · ${c.label} (${mmss(c.start)}, ${c.seconds} s)\n\n${c.say}\n`).join('\n'));
if (flag === '--stills') {
  for (const t of list.split(',')) { await p.evaluate(t => window.render(t), +t); await p.screenshot({ path: `${dir}/${t}.png` }); }
} else {
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', FPS, '-c:v', 'png', '-i', '-',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const n = Math.round(dur * FPS);
  for (let i = 0; i < n; i++) {
    await p.evaluate(t => window.render(t), i / FPS);
    if (!ff.stdin.write(await p.screenshot({ type: 'png' }))) await new Promise(r => ff.stdin.once('drain', r));
  }
  ff.stdin.end(); await new Promise(r => ff.on('close', r));
  console.log(`${out}: ${n} frames, ${dur} s`);
}
await b.close();
