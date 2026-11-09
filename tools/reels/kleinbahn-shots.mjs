// Renders the Kleinbahn reel shots frame by frame on the game's virtual clock.
// node tools/reels/kleinbahn-shots.mjs <path to tiny-train> [--test] [--only a-wide,b-train]
// Frames land in <work>/kb/frames/<shot>/ (or <work>/kb/test/ with --test: three frames per shot).
import fs from 'node:fs';
import path from 'node:path';
import { WORK } from './pw.mjs';

const argv = process.argv.slice(2);
const test = argv.includes('--test');
const repo = path.resolve(argv[0]);
const outDir = path.join(WORK, 'kb', test ? 'test' : 'frames');
const { openGame } = await import(path.join(repo, 'tools', 'page.mjs'));
const only = argv.includes('--only') ? argv[argv.indexOf('--only') + 1].split(',') : null;
const FPS = 24;

// Each shot: setup (runs once, in the game's scope via __G), frames, cam(u) -> camera or null (game drives it).
const SHOTS = [
  { id: 'a-wide', frames: 108, setup: `env.time=0.46; env.season=1; dirty.land=true; stopFollow();`,
    cam: `({x:1, z:1, dist:66-12*e, pitch:0.86-0.08*e, yaw:0.25+0.5*e})` },
  { id: 'b-train', frames: 108, setup: `env.time=0.4;`, track: 'train',
    cam: `({x:TP.x, z:TP.z, dist:7.2-1.2*e, pitch:0.62, yaw:1.0+0.55*u})` },
  { id: 'c-town', frames: 96, setup: `env.time=0.52;`,
    cam: `({x:TOWNC.x, z:TOWNC.z, dist:15-3*e, pitch:0.6, yaw:2.5+0.45*u})` },
  { id: 'd-air', frames: 84, setup: `env.time=0.6;`, track: 'zep',
    cam: `({x:ZP.x, z:ZP.z, y:ZP.y, dist:12-2*e, pitch:0.5, yaw:-0.6+0.4*u})` },
  { id: 'e-volcano', frames: 96, setup: `env.time=0.8; erupt(volcs[0]);`, until: `vstate.get(vkey(volcs[0])).phase==='erupt'`, pre: 30,
    cam: `({x:wx(volcs[0].x)-1, z:wz(volcs[0].z)-1, dist:17-2*e, pitch:0.5, yaw:0.9+0.35*u})` },
  { id: 'f-launch', frames: 132, setup: `env.time=0.5; launchNow(lsites[0]);`, until: `lstate.get(lkey(lsites[0])).phase==='flight'`,
    after: `follow.on=true; follow.gkey=null; follow.zkey=null; follow.bkey=null; follow.key=lkey(lsites[0]); follow.obj=null;`, cam: null },
  { id: 'g-autumn', frames: 54, setup: `stopFollow(); env.time=0.55; env.season=2; dirty.land=true; dirty.props=true;`, pre: 20,
    cam: `({x:TOWNC.x+2, z:TOWNC.z+1, dist:24, pitch:0.7, yaw:0.5+0.12*u})` },
  { id: 'h-winter', frames: 54, setup: `env.season=3; dirty.land=true; dirty.props=true;`, pre: 20,
    cam: `({x:TOWNC.x+2, z:TOWNC.z+1, dist:24, pitch:0.7, yaw:0.62+0.12*u})` },
  { id: 'i-dusk', frames: 120, setup: `env.season=1; dirty.land=true; dirty.props=true;`, pre: 20, time: [0.7, 0.93],
    cam: `({x:0, z:-2, dist:36-9*e, pitch:0.66, yaw:2.0+0.5*e})` },
];

const { browser, page: p, errs } = await openGame({ test: true, viewport: { width: 1280, height: 720 } });
await p.addStyleTag({ content: '.dock,.fab,.info-btn,.followbar{display:none!important}' });

await p.evaluate(fps => {
  const G = window.__G;
  G('env.running=false');
  __KB.step(60, 0.05);
  window.__reel = {
    fps,
    // centre of the busiest town: mean of building cells on the main island
    init() {
      const r = G(`(()=>{ let sx=0,sz=0,n=0; for(let i=0;i<W*H;i++){ if(S.prop[i]===2){ const x=i%W,z=(i/W)|0; if(Math.abs(wx(x))<14&&Math.abs(wz(z))<14){ sx+=wx(x); sz+=wz(z); n++; } } } return {x:sx/n,z:sz/n,n}; })()`);
      window.TOWNC = r; return r;
    },
    snap(c) {
      const cam = G('cam'), cg = G('camGoal'), tg = G('target');
      Object.assign(cg, { x: c.x, z: c.z, y: c.y || 0, dist: c.dist, pitch: c.pitch, yaw: c.yaw });
      Object.assign(cam, { dist: c.dist, pitch: c.pitch, yaw: c.yaw }); tg.x = c.x; tg.z = c.z; tg.y = c.y || 0;
    },
    track(kind) {
      if (kind === 'train') { window.TP = G(`(()=>{ const t=trains.reduce((a,b)=> (b.cars.length>a.cars.length?b:a)); const o={}; evalPath(t, Math.max(0,t.headS-1.2), o); return {x:o.x, z:o.z}; })()`); }
      if (kind === 'zep') { window.ZP = G(`(()=>{ const st=zstate.values().next().value; const q=new THREE.Vector3(); if(st&&st.ship&&st.ship.g){ st.ship.g.getWorldPosition(q); return {x:q.x,z:q.z,y:Math.max(0,q.y-TOP),phase:st.phase}; } return {x:wx(S.zep[0].x),z:wz(S.zep[0].z),y:0,phase:'none'}; })()`); }
    },
    frame(camExpr, u, timeRange) {
      const e = u * u * (3 - 2 * u);
      if (timeRange) G('env').time = timeRange[0] + (timeRange[1] - timeRange[0]) * e;
      if (camExpr) this.snap(new Function('u', 'e', 'G', `const wx=G('wx'), wz=G('wz'), volcs=G('volcs'); return ${camExpr};`)(u, e, G));
      __KB.noRender = false; __KB.step(1, 1 / fps); __KB.noRender = true;
      return document.querySelector('canvas').toDataURL('image/jpeg', 0.93);
    },
  };
}, FPS);
console.log('town centre', JSON.stringify(await p.evaluate(() => __reel.init())));

for (const s of SHOTS) {
  if (only && !only.includes(s.id)) { continue; }
  const dir = path.join(outDir, s.id); fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now();
  const st = await p.evaluate(async s => {
    const G = window.__G;
    G(s.setup);
    if (s.until) { let n = 0; while (!G(s.until) && n < 4000) { __KB.step(1, 0.05); n++; } if (n >= 4000) return 'UNTIL TIMEOUT'; }
    if (s.after) G(s.after);
    __KB.step(s.pre || 6, 0.05);
    return 'ok';
  }, s);
  const list = test ? [0, Math.floor(s.frames / 2), s.frames - 1] : [...Array(s.frames).keys()];
  let prev = 0;
  for (const f of list) {
    // in test mode, advance the simulation through the skipped frames without rendering
    const skip = f - prev - 1; if (skip > 0) await p.evaluate(([n, fps, tr]) => { for (let i = 0; i < n; i++) { if (tr) __reel.track(tr); __KB.step(1, 1 / fps); } }, [skip, FPS, s.track]);
    prev = f;
    const url = await p.evaluate(([s, u]) => { if (s.track) __reel.track(s.track); return __reel.frame(s.cam, u, s.time); }, [s, s.frames > 1 ? f / (s.frames - 1) : 0]);
    fs.writeFileSync(path.join(dir, String(f).padStart(4, '0') + '.jpg'), Buffer.from(url.split(',')[1], 'base64'));
  }
  const extra = s.track === 'zep' ? JSON.stringify(await p.evaluate(() => window.ZP)) : '';
  console.log(s.id, st, list.length, 'frames', Date.now() - t0, 'ms', extra);
}
console.log('ERR', JSON.stringify(errs));
await browser.close();
