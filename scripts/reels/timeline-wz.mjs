// Films the development timeline of Wortzauber: one short screen recording per merged pull request, each at its own git state.
// node scripts/reels/timeline-wz.mjs <path to wortzauber> [--dry] [--only pr65,pr63]
// For each stage of scripts/reels/timeline-wortzauber.mjs it checks out the stage's commit as a git worktree, serves it on its
// own port (a fresh browser each time, so no stale cache), opens /?dev=1&fresh=1 at 1280x720 in German, runs the stage's
// setup and holds. The video and the cut points land in <work>/tl/wz/<id>/ (video.webm, marks.json).
// --dry saves one still per stage instead (<work>/tl/wz-dry/<id>.png). Then `python3 scripts/reels/build.py timeline`.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { chromium, WORK } from './pw.mjs';
import { STAGES } from './timeline-wortzauber.mjs';

const argv = process.argv.slice(2);
const dry = argv.includes('--dry');
const repo = path.resolve(argv[0]);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const outRoot = path.join(WORK, 'tl', dry ? 'wz-dry' : 'wz');
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' }).trim();
const SCENES = '.claude/skills/checking-device-layouts/scenes/';
const HIDE = '#devfeedback, #bSkip, .devpill { display: none !important; }';
const wtRoot = path.join(WORK, 'tl', 'wt-wz');
fs.mkdirSync(wtRoot, { recursive: true }); fs.mkdirSync(outRoot, { recursive: true });

let failed = 0, port = 8960;
for (const s of STAGES) {
  if (only && !only.includes(s.id)) continue;
  const wt = path.join(wtRoot, s.id), t0 = Date.now(), P = port++;
  if (fs.existsSync(wt)) git('worktree', 'remove', '--force', wt);
  git('worktree', 'add', '--detach', wt, s.ref);
  const srv = spawn('python3', ['-m', 'http.server', String(P), '--bind', '127.0.0.1'], { cwd: wt, stdio: 'ignore' });
  const dir = path.join(outRoot, s.id);
  if (!dry) { fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true }); }
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'de-DE',
    ...(dry ? {} : { recordVideo: { dir, size: { width: 1280, height: 720 } } }) });
  // the marks count from the start of the video: the page opens, not the worktree or the browser start
  const marks = {}; let rec = 0; const mark = l => { marks[l] = (Date.now() - rec) / 1000; };
  const errs = [];
  try {
    await new Promise(r => setTimeout(r, 600));
    rec = Date.now();
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(`http://127.0.0.1:${P}/?dev=1&fresh=1`, { waitUntil: 'load' });
    await page.addStyleTag({ content: HIDE });
    await page.waitForFunction(() => window.WZ && window.Sprites, null, { timeout: 30000 });
    await page.evaluate(() => Sprites.ready);
    await page.waitForTimeout(800);
    const src = s.scene ? fs.readFileSync(path.join(wt, SCENES, s.scene + '.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '') : s.setup;
    mark('setup');
    // soft: a stage whose scene ends on a check that times out, while the picture is already right
    const r = await Promise.race([page.evaluate(`(${src})()`), new Promise((_, no) => setTimeout(() => no(new Error('setup timeout')), 90000))])
      .catch(e => { if (s.soft) return 'soft: ' + e.message.split('\n')[0]; throw e; });
    mark('start');
    if (s.act) await Promise.race([page.evaluate(`(${s.act})()`), new Promise(ok => setTimeout(ok, 30000))]);
    await page.waitForTimeout(s.hold || 4000);
    mark('end');
    if (dry) await page.screenshot({ path: path.join(outRoot, s.id + '.png') });
    console.log(s.id, s.ref, 'ok', JSON.stringify(marks), JSON.stringify(r || '').slice(0, 120), errs.length ? 'ERR ' + JSON.stringify(errs).slice(0, 200) : '');
  } catch (e) {
    console.log(s.id, s.ref, 'FAILED', String(e.message).split('\n')[0].slice(0, 200), JSON.stringify(errs).slice(0, 200)); failed++;
    if (dry) { try { await ctx.pages()[0].screenshot({ path: path.join(outRoot, s.id + '-fail.png') }); } catch (_) {} }
  } finally {
    await ctx.close(); await browser.close(); srv.kill();
    if (!dry) {
      const v = fs.readdirSync(dir).find(f => f.endsWith('.webm'));
      if (v) fs.renameSync(path.join(dir, v), path.join(dir, 'video.webm'));
      fs.writeFileSync(path.join(dir, 'marks.json'), JSON.stringify({ ...marks, from: s.from || 'start', max: s.max || 9 }));
    }
    git('worktree', 'remove', '--force', wt);
  }
  console.log('  ', Math.round((Date.now() - t0) / 1000), 's');
}
process.exit(failed ? 1 : 0);
