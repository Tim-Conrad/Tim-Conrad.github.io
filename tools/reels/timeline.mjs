// Films the development timeline of a game: one short clip per merged pull request, each at its own git state.
// node tools/reels/timeline.mjs <path to tiny-train> [--test] [--only pr13,pr11]
// For each stage of tools/reels/timeline-kleinbahn.mjs it checks out the stage's commit as a git worktree
// (node_modules linked from the repo), opens that version of the game on its virtual clock, renders the frames
// and removes the worktree again. Frames land in <work>/tl/kb/<id>/ (<work>/tl/kb-test/ with --test: three frames).
// Then `python3 tools/reels/build.py timeline` cuts the clips into assets/projects/timeline/.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { WORK } from './pw.mjs';
import { STAGES, FPS, VIEW } from './timeline-kleinbahn.mjs';

const argv = process.argv.slice(2);
const test = argv.includes('--test');
const repo = path.resolve(argv[0]);
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const outRoot = path.join(WORK, 'tl', test ? 'kb-test' : 'kb');
const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' }).trim();

// In the page: a scripted second player with its own sync engine and no network (the same set-up as the
// game's tools/netcheck.mjs). 'host': the game hosts and the peer joins. 'guest': the game joins the peer's island,
// which is the game's own island without its trees, so the switch is easy to see.
const NET = async mode => {
  const { createSync } = await import('/src/net/sync.js');
  const { plainWorld: pw } = await import('/tools/net/plain-world.js');
  const G = window.__G, S = G('S'), NS = G('NET_SYNC'), LAYERS = G('LAYERS');
  const plainWorld = save => pw({ layers: LAYERS, schema: G('NET_SCHEMA'), save });
  const q = [], pump = () => { let n = 0; while (q.length && n++ < 5000) { const { to, m } = q.shift(); to.receive(m, 'peer'); } };
  const link = (id, recv) => ({ id, send: m => q.push({ to: { receive: recv }, m: JSON.parse(JSON.stringify(m)) }), close() {} });
  const own = JSON.parse(JSON.stringify(G('serialize()')));
  const world = plainWorld(own);
  if (mode === 'guest') {
    for (let i = 0; i < world.N; i++) if (world.layers.prop[i] === G('P_TREE')) world.layers.prop[i] = 0;
    world.trains = G('trains').map((t, k) => ({ ...G('netTrainState')(t, () => 'h.' + (k + 1)) }));
  }
  const peer = createSync(world, { now: () => performance.now() });
  if (mode === 'host') {
    NS.host(); NS.addPeer(link('peer', m => peer.receive(m, 'peer'))); peer.join(link('peer', m => NS.receive(m, 'peer')));
  } else {
    peer.host(); peer.addPeer(link('game', m => NS.receive(m))); NS.join(link('game', m => peer.receive(m, 'game')));
  }
  pump();
  window.__peer = { world, sync: peer, pump, tick() { peer.tick(); peer.absorb && peer.absorb(); pump(); } };
};

const PAGE = fps => {
  const G = window.__G;
  const tick = () => window.__peer && window.__peer.tick();
  window.__tl = {
    // free land tiles near a point, nearest first
    free(x, z, n) { return G(`(()=>{ const r=[]; for(let i=0;i<W*H;i++){ if(S.land[i]&&!S.prop[i]&&!S.track[i]&&!S.hp[i]&&!(S.road&&S.road[i])) r.push(i); } return r; })()`)
      .map(i => [i, Math.hypot(G('wx')(i % G('W')) - x, G('wz')((i / G('W')) | 0) - z)]).sort((a, b) => a[1] - b[1]).slice(0, n).map(a => a[0]); },
    step(n, dt) { for (let i = 0; i < n; i++) { __KB.step(1, dt); tick(); } },
    snap(c) {
      const cam = G('cam'), cg = G('camGoal'), tg = G('target');
      Object.assign(cg, { x: c.x, z: c.z, y: c.y || 0, dist: c.dist, pitch: c.pitch, yaw: c.yaw });
      Object.assign(cam, { dist: c.dist, pitch: c.pitch, yaw: c.yaw }); tg.x = c.x; tg.z = c.z; tg.y = c.y || 0;
    },
    // one frame: the stage's per-frame code, the camera, one step of the clock, then the canvas (ui: the caller screenshots)
    frame(s, f, u, ui) {
      const e = u * u * (3 - 2 * u);
      if (s.each) new Function('f', 'u', 'e', 'G', 'T', s.each)(f, u, e, G, window.__tl);
      if (s.cam) this.snap(new Function('u', 'e', 'G', 'T', `const wx=G('wx'), wz=G('wz'); return ${s.cam};`)(u, e, G, window.__tl));
      __KB.noRender = false; __KB.step(1, 1 / fps); tick(); __KB.noRender = true;
      return ui ? null : document.querySelector('canvas').toDataURL('image/jpeg', 0.92);
    },
  };
};

const wtRoot = path.join(WORK, 'tl', 'wt');
fs.mkdirSync(wtRoot, { recursive: true });
let failed = 0;
for (const s of STAGES) {
  if (only && !only.includes(s.id)) continue;
  const wt = path.join(wtRoot, s.id), t0 = Date.now();
  if (fs.existsSync(wt)) git('worktree', 'remove', '--force', wt);
  git('worktree', 'add', '--detach', wt, s.ref);
  fs.symlinkSync(path.join(repo, 'node_modules'), path.join(wt, 'node_modules'));
  const { openGame } = await import(path.join(wt, 'tools', 'page.mjs'));
  const { browser, page: p, errs } = await openGame({ test: true, viewport: VIEW });
  try {
    if (!s.ui) await p.addStyleTag({ content: '.dock,.fab,.info-btn,.followbar,.toast,#toast{display:none!important}' });
    await p.evaluate(() => { window.__G('env.running=false'); __KB.step(60, 0.05); });
    if (s.net) await p.evaluate(NET, s.net);
    await p.evaluate(PAGE, FPS);
    const st = await p.evaluate(s => {
      const G = window.__G, T = window.__tl;
      if (s.setup) new Function('G', 'T', s.setup)(G, T);
      if (s.until) { let n = 0; while (!new Function('G', 'T', `return ${s.until}`)(G, T) && n < 4000) { T.step(1, 0.05); n++; } if (n >= 4000) return 'UNTIL TIMEOUT'; }
      if (s.after) new Function('G', 'T', s.after)(G, T);
      T.step(s.pre || 6, 0.05);
      return 'ok';
    }, s);
    if (st !== 'ok') throw new Error(st);
    const dir = path.join(outRoot, s.id); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const list = test ? [0, Math.floor(s.frames / 2), s.frames - 1] : [...Array(s.frames).keys()];
    let prev = -1;
    for (const f of list) {
      const u = f / (s.frames - 1);
      // test mode: the skipped frames still run, without drawing
      for (let k = prev + 1; k < f; k++) await p.evaluate(([s, k, u]) => { __tl.frame(s, k, u, true); }, [s, k, k / (s.frames - 1)]);
      prev = f;
      const url = await p.evaluate(([s, f, u, ui]) => __tl.frame(s, f, u, ui), [s, f, u, !!s.ui]);
      const file = path.join(dir, String(f).padStart(4, '0') + '.jpg');
      if (url) fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
      else { await p.evaluate(() => { __KB.render(); }); await p.screenshot({ path: file, type: 'jpeg', quality: 92 }); }
    }
    console.log(s.id, s.ref, list.length, 'frames', Math.round((Date.now() - t0) / 1000), 's', errs.length ? 'ERR ' + JSON.stringify(errs) : '');
    if (errs.length) failed++;
  } catch (e) {
    console.log(s.id, 'FAILED', e.message.split('\n')[0], JSON.stringify(errs)); failed++;
  } finally {
    await browser.close();
    git('worktree', 'remove', '--force', wt);
  }
}
process.exit(failed ? 1 : 0);
