// Renders the transparent 1280x720 title, caption and end-card overlays of both reels into <work>/ov/kb and <work>/ov/wz.
// node tools/reels/overlays.mjs <path to wortzauber>   (the Andika font comes from the game)
// The caption texts live here: edit KB.items and WZ.items.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, WORK } from './pw.mjs';
const here = path.dirname(new URL(import.meta.url).pathname);
const wzFonts = path.join(path.resolve(process.argv[2]), 'assets', 'fonts');
const b64 = f => fs.readFileSync(f.startsWith('andika') ? path.join(wzFonts, f) : path.join(here, 'fonts', f)).toString('base64');
const face = (fam, w, f) => `@font-face{font-family:"${fam}";font-weight:${w};src:url(data:font/woff2;base64,${b64(f)}) format("woff2");}`;

const KB = {
  css: face('Fredoka', 500, 'fredoka-500.woff2') + face('Fredoka', 600, 'fredoka-600.woff2') + face('Nunito', 700, 'nunito-700.woff2') + `
    body{font-family:Fredoka,sans-serif;color:#1f3140}
    .cap{position:absolute;left:56px;bottom:52px;background:#ffffffee;border-radius:22px;padding:14px 26px 15px;font-weight:600;font-size:34px;letter-spacing:.2px;box-shadow:0 6px 0 #0000001f, 0 14px 30px #00000033}
    .title{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;text-align:center;color:#fff;text-shadow:0 4px 0 #00000030,0 10px 40px #00000070}
    .title h1{margin:0;font-weight:600;font-size:150px;letter-spacing:1px;line-height:1}
    .title p{margin:14px 0 0;font-family:Fredoka,sans-serif;font-weight:600;font-size:34px;background:#ffffffee;color:#1f3140;text-shadow:none;border-radius:22px;padding:12px 28px 13px;box-shadow:0 6px 0 #0000001f,0 14px 30px #00000033}
    .end{position:absolute;inset:0;background:#0b1830b8;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;color:#fff}
    .end h1{margin:0;font-weight:600;font-size:124px;line-height:1}
    .end p{margin:0;font-family:Nunito,sans-serif;font-weight:700;font-size:32px;color:#ffffffde}
    .end .row{display:flex;gap:14px;margin-top:18px}
    .end .row span{background:#fff;color:#1f3140;border-radius:999px;padding:10px 22px;font-weight:600;font-size:25px}`,
  items: {
    title: `<div class="title"><h1>Kleinbahn</h1><p>An island-railway sandbox</p></div>`,
    'c-train': `<div class="cap">Trains</div>`,
    'c-town': `<div class="cap">Town</div>`,
    'c-air': `<div class="cap">Airship hangar</div>`,
    'c-volcano': `<div class="cap">Volcano</div>`,
    'c-launch': `<div class="cap">Shuttle launch</div>`,
    'c-autumn': `<div class="cap">Autumn</div>`,
    'c-winter': `<div class="cap">Winter</div>`,
    'c-dusk': `<div class="cap">Dusk to night</div>`,
    end: `<div class="end"><h1>Kleinbahn</h1><p>An island-railway sandbox in three.js</p><div class="row"><span>Runs in the browser</span><span>One HTML file</span><span>Built phone first</span></div></div>`,
  },
};

const WZ = {
  css: face('Andika', 400, 'andika-400.woff2') + face('Andika', 700, 'andika-700.woff2') + `
    body{font-family:Andika,sans-serif;color:#3d2b2e}
    .cap{position:absolute;left:50%;top:40px;transform:translateX(-50%);white-space:nowrap;background:#fff8ea;border:4px solid #3d2b2e;border-radius:26px;padding:8px 30px 12px;font-weight:700;font-size:36px;box-shadow:0 7px 0 #3d2b2e40}
    .cap.low{top:auto;bottom:40px}
    .cap.side{left:30px;top:236px;transform:none;white-space:normal;width:350px;text-align:center;font-size:32px;line-height:1.25}
    .card{position:absolute;inset:0;background:#b9a3e3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center}
    .card.veil{background:#3d2b2ecc}
    .card h1{margin:0;font-weight:700;font-size:150px;line-height:1.05;color:#fff8ea;-webkit-text-stroke:5px #3d2b2e;paint-order:stroke fill;text-shadow:0 9px 0 #3d2b2e}
    .card p{margin:0;font-weight:700;font-size:40px;background:#fff8ea;border:4px solid #3d2b2e;border-radius:26px;padding:8px 32px 13px;box-shadow:0 7px 0 #3d2b2e40}
    .card .row{display:flex;gap:16px;margin-top:8px}
    .card .row span{background:#ffd977;border:4px solid #3d2b2e;border-radius:999px;padding:6px 24px 10px;font-weight:700;font-size:28px}
    .star{position:absolute;font-size:64px;color:#ffd977;-webkit-text-stroke:3px #3d2b2e}`,
  items: {
    title: `<div class="card"><span class="star" style="left:250px;top:150px">★</span><span class="star" style="right:240px;top:210px;font-size:44px">★</span><span class="star" style="right:330px;bottom:150px;font-size:52px">★</span><h1>Wortzauber</h1><p>A letter-tracing word game for children</p></div>`,
    'c-type': `<div class="cap side">Spell a word</div>`,
    'c-trace': `<div class="cap side">Trace each letter</div>`,
    'c-apple': `<div class="cap">The apple appears</div>`,
    'c-quest': `<div class="cap low">Bakery: bake a cake with Berta</div>`,
    'c-wall': `<div class="cap">Mouse hole: light a candle</div>`,
    'c-castle': `<div class="cap low">Castle: collect letters</div>`,
    'c-math': `<div class="cap side">Sums</div>`,
    'c-free': `<div class="cap side">Free handwriting</div>`,
    'c-map': `<div class="cap low">The map</div>`,
    end: `<div class="card veil"><h1>Wortzauber</h1><p>A letter-tracing word game for children</p><div class="row"><span>Deutsch</span><span>English</span><span>Runs in the browser</span></div></div>`,
  },
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
for (const [name, set] of [['kb', KB], ['wz', WZ]]) {
  fs.mkdirSync(path.join(WORK, 'ov', name), { recursive: true });
  for (const [id, html] of Object.entries(set.items)) {
    await page.setContent(`<style>html,body{margin:0;width:1280px;height:720px;background:transparent;overflow:hidden}${set.css}</style>${html}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(WORK, 'ov', name, id + '.png'), omitBackground: true });
  }
}
await browser.close();
console.log('ok');
