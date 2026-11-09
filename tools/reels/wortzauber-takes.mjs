// Films the Wortzauber takes in real time. The dev server of the game must run (python3 devserver.py).
// node tools/reels/wortzauber-takes.mjs <path to wortzauber> [--rec] [--only meadow,quest]
// Without --rec it only saves a still at each take's hold point, in <work>/wz/dry/.
// With --rec the videos land in <work>/wz/rec/v-<take>/ and the cut points in <work>/wz/rec/marks.json.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, WORK } from './pw.mjs';
const repo = path.resolve(process.argv[2]), rec = process.argv.includes('--rec');
const out = path.join(WORK, 'wz', rec ? 'rec' : 'dry'); fs.mkdirSync(out, { recursive: true });

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const SCENES = path.join(repo, '.claude/skills/checking-device-layouts/scenes') + '/';


const URL0 = `http://localhost:${process.env.WZ_PORT || 8931}/?dev=1&fresh=1`;
const HIDE = '#devfeedback, #bSkip, .devpill { display: none !important; }';
// a soft dot that follows the pointer, so the viewer sees the finger
const FINGER = `(() => { const d = document.createElement('div'); d.id = '__finger';
  d.style.cssText = 'position:fixed;z-index:99999;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(255,255,255,.55);border:3px solid rgba(30,30,60,.55);pointer-events:none;left:-100px;top:-100px;transition:transform .12s;';
  const add = () => document.body ? document.body.appendChild(d) : setTimeout(add, 50); add();
  addEventListener('pointermove', e => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; }, true);
  addEventListener('pointerdown', e => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; d.style.transform = 'scale(.75)'; }, true);
  addEventListener('pointerup', () => { d.style.transform = 'scale(1)'; }, true); })();`;

async function open({ video, finger = true, url = URL0 } = {}) {
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1, locale: 'de-DE',
    ...(video ? { recordVideo: { dir: video, size: { width: 1280, height: 720 } } } : {}) });
  const t0 = Date.now();
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  if (finger) await page.addInitScript(FINGER);
  await page.goto(url, { waitUntil: 'load' });
  await page.addStyleTag({ content: HIDE });
  await page.waitForFunction(() => window.WZ && window.Sprites && window.DevState, null, { timeout: 30000 });
  await page.evaluate(() => Sprites.ready);
  const mark = label => console.log('MARK', label, ((Date.now() - t0) / 1000).toFixed(2));
  return { browser, ctx, page, errs, mark, t0 };
}

// Trace every stroke of the word on the trace page with the real pointer.
async function traceWord(page, { stepMs = 8 } = {}) {
  for (let guard = 0; guard < 900; guard++) {
    const d = await page.evaluate(() => WZ.st.view === 'viewTrace' ? WZ.tracer.debug() : null);
    if (!d || d.phase === 'done') break;
    if (d.phase !== 'trace' || !d.pts || !d.pts.length) { await page.waitForTimeout(120); continue; }
    const pts = d.pts;
    await page.mouse.move(pts[0][0], pts[0][1], { steps: 8 });
    await page.mouse.down();
    for (const q of pts.slice(1)) { await page.mouse.move(q[0], q[1]); await page.waitForTimeout(stepMs); }
    await page.mouse.up();
    await page.waitForTimeout(160);
  }
}

const sleep = (page, ms) => page.waitForTimeout(ms);

const marks = {};

async function tap(page, x, y) {
  await page.mouse.move(x, y, { steps: 10 }); await sleep(page, 140);
  await page.mouse.down(); await sleep(page, 80); await page.mouse.up();
}
async function tapEl(page, sel) { const b = await page.locator(sel).first().boundingBox(); await tap(page, b.x + b.width / 2, b.y + b.height / 2); }
async function typeWord(page, word) {
  for (const ch of word) {
    const pos = await page.evaluate(ch => { const k = [...document.querySelectorAll('#keys button')].find(b => b.textContent.trim().toLowerCase() === ch && b.getBoundingClientRect().width > 0); if (!k) return null; const r = k.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, ch);
    if (pos) await tap(page, pos[0], pos[1]); else await page.keyboard.press(ch);
    await sleep(page, 110);
  }
}
async function tapGo(page) {
  const pos = await page.evaluate(() => { const c = [...document.querySelectorAll('#panel button')].filter(b => b.getBoundingClientRect().width > 0 && !b.closest('#keys') && !['bMic', 'bKbd', 'bPen', 'pClose'].includes(b.id)); const g = c.find(b => /go|wand|magic|ok/i.test(b.id + ' ' + b.className)) || c[c.length - 1]; if (!g) return null; const r = g.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, g.id, g.className]; });
  console.log('go button', JSON.stringify(pos));
  if (pos) await tap(page, pos[0], pos[1]); else await page.keyboard.press('Enter');
}

const TAKES = {
  // the core loop on the meadow: tap the wand, type a word, trace it, the thing appears, pick it up
  meadow: async (page, mark, still) => {
    await sleep(page, 2400); mark('start');
    await tapEl(page, '#bWrite');
    await page.waitForFunction(() => WZ.st.view === 'viewFree'); await sleep(page, 700);
    if (!(await page.evaluate(() => document.querySelectorAll('#keys button').length > 0 && document.querySelector('#keys button').getBoundingClientRect().width > 0))) { await tapEl(page, '#bKbd'); await sleep(page, 500); }
    mark('panel');
    await typeWord(page, 'apfel'); await sleep(page, 450); mark('typed'); await still('typed');
    await tapGo(page);
    await page.waitForFunction(() => WZ.st.view === 'viewTrace');
    await page.waitForFunction(() => WZ.tracer.debug().phase === 'trace', null, { timeout: 20000 }); mark('trace');
    await traceWord(page); mark('traced');
    await page.waitForFunction(() => document.getElementById('panel').classList.contains('hidden'), null, { timeout: 15000 }); mark('closed');
    await sleep(page, 2200); mark('apple');
    // tap the apple: the hero walks over and picks it up
    const obj = await page.evaluate(() => { try { const o = DevState().scene; return o; } catch (e) { return String(e); } });
    console.log('scene', JSON.stringify(obj).slice(0, 600));
    await tap(page, 585, 632); await sleep(page, 3600); mark('picked'); await still('picked');
    await sleep(page, 800); mark('end');
  },
};
// scene takes: run the layout-check setup, then hold
for (const [id, hold] of [['quest', 4500], ['wall', 4500], ['castle', 4500], ['castle-gate', 4000], ['math-riddle', 3500], ['map', 4000], ['free-writing', 3500], ['street', 3500]]) {
  TAKES[id] = async (page, mark, still) => {
    const src = fs.readFileSync(SCENES + id + '.js', 'utf8');
    const r = await page.evaluate(`(${src.replace(/^\s*\/\/.*$/gm, '')})()`);
    console.log(id, 'setup', JSON.stringify(r).slice(0, 200));
    mark('start'); await sleep(page, hold / 2); await still('hold'); await sleep(page, hold / 2); mark('end');
  };
}

for (const id of Object.keys(TAKES)) {
  if (only && !only.includes(id)) continue;
  if (rec) fs.rmSync(`${out}/v-${id}`, { recursive: true, force: true });
  const o = await open(rec ? { video: `${out}/v-${id}` } : {});
  marks[id] = {};
  const mark = l => { marks[id][l] = (Date.now() - o.t0) / 1000; };
  const still = n => rec ? null : o.page.screenshot({ path: `${out}/s-${id}-${n}.png` });
  try { await TAKES[id](o.page, mark, still); console.log(id, 'ok', JSON.stringify(marks[id]), 'errs', JSON.stringify(o.errs).slice(0, 200)); }
  catch (e) { console.log(id, 'FAILED', String(e.message).slice(0, 300)); if (!rec) await o.page.screenshot({ path: `${out}/s-${id}-fail.png` }); }
  await o.ctx.close(); await o.browser.close();
}
const mf = `${out}/marks.json`;
const all = { ...(fs.existsSync(mf) ? JSON.parse(fs.readFileSync(mf, 'utf8')) : {}), ...marks };
fs.writeFileSync(mf, JSON.stringify(all, null, 1));
