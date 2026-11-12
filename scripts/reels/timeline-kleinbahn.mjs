// The development timeline of Kleinbahn: one stage per merged pull request that changed the game.
// Each stage is filmed at `ref` (the merge commit) by scripts/reels/timeline.mjs.
//   setup, after: game code run once (G = the game's scope through __G, T = the timeline helpers)
//   until: an expression of G and T; the clock runs without drawing until it is true
//   each: code run before every frame (f = frame number, u = 0..1, e = eased u)
//   cam: an expression of u, e, G, T, wx, wz giving the camera, or null to leave it to the game (follow)
//   net: 'host' (the game hosts a scripted guest, window.__peer) or 'guest' (the game joins a scripted host)
//   ui: true films the page with its controls and toasts (a screenshot per frame), else only the canvas
// The text of each stage (title, what the clip shows, the rest of the PR) lives in projects/kleinbahn/index.html.
export const FPS = 24;
export const VIEW = { width: 960, height: 540 };

const volc = `G('volcs')[0]`;

export const STAGES = [
  { id: 'start', ref: 'd3ff177', frames: 96,
    setup: `G('env').time=0.78; G('erupt')(${volc});`, until: `G('vs')(${volc}).phase==='erupt'`, pre: 30,
    cam: `({x:wx(${volc}.x)-1, z:wz(${volc}.z)-1, dist:17-2*e, pitch:0.5, yaw:0.9+0.35*u})` },

  // #1: the game hosts; the scripted guest plants trees one after the other, and they appear on the host's island
  { id: 'pr1', ref: '9ae75bf', net: 'host', frames: 96,
    setup: `G('env').time=0.45; T.spots=T.free(0,0,16); const W=G('W');
      T.c={x:T.spots.reduce((a,i)=>a+G('wx')(i%W),0)/T.spots.length, z:T.spots.reduce((a,i)=>a+G('wz')((i/W)|0),0)/T.spots.length};`,
    each: `const i=T.spots[(f-8)/5]; if(f>=8 && f%5===3 && i!==undefined){ __peer.world.layers.prop[i]=G('P_TREE'); __peer.world.layers.pv[i]=(i*37)%90; }`,
    cam: `({x:T.c.x, z:T.c.z, dist:9-1*e, pitch:0.7, yaw:0.6+0.3*u})` },

  // #2: the game is a guest; the host starts an eruption and sends the random numbers of its peak
  { id: 'pr2', ref: 'a3e426b', net: 'guest', frames: 96,
    setup: `__peer.world.env.time=0.8; G('env').time=0.8; const v=${volc}, k=G('vkey')(v), tape=Array.from({length:600},(_,i)=>(i*0.6180339)%1);
      __peer.sync.event('volc',k,'start'); __peer.sync.event('volc',k,'peak',{tape}); __peer.pump();`, pre: 30,
    cam: `({x:wx(${volc}.x)-1, z:wz(${volc}.z)-1, dist:16-2*e, pitch:0.45, yaw:2.2+0.35*u})` },

  // #3: the game hosts; a pin in the guest's colour stands where the guest looks, and glides as the guest looks around
  { id: 'pr3', ref: 'd8f5d41', net: 'host', frames: 96,
    setup: `G('env').time=0.5;`,
    each: `__peer.sync.presence({x:-4+6*e, z:-2+4*e, d:14, yaw:0.5, pitch:0.7});`,
    cam: `({x:-4.2+5.6*e, z:-2.1+3.7*e, dist:6, pitch:0.7, yaw:0.5+0.1*u})` },

  // #7: the game hosts and follows the guest, who has a name: the follow bar shows it
  { id: 'pr7', ref: '38ce447', net: 'host', ui: true, frames: 72,
    setup: `G('env').time=0.5; __peer.sync.presence({x:-6, z:-3, d:12, yaw:0.4, pitch:0.65, n:'Mia'}); T.step(10,0.05);`,
    after: `G('netFollowStart')(G('NET_PRES')[0].g);`,
    each: `__peer.sync.presence({x:-6+10*e, z:-3+5*e, d:12, yaw:0.4+0.8*e, pitch:0.65, n:'Mia'});`,
    cam: null },

  // #8: the game is a guest; the host stops the room, and the guest goes home to its own island (with its trees)
  { id: 'pr8', ref: '9e097da', net: 'guest', ui: true, frames: 72,
    setup: `__peer.world.env.time=0.5;`,
    each: `if(f===24){ __peer.sync.leave(); __peer.pump(); }`,
    cam: `({x:2, z:2, dist:22, pitch:0.75, yaw:0.5+0.15*u})` },

  // #9: the new HUD icons: the build dial opens over the island
  { id: 'pr9', ref: '1176369', ui: true, frames: 48,
    setup: `G('env').time=0.5;`,
    each: `if(f===12) document.getElementById('fabBuild').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));`,
    cam: `({x:0, z:0, dist:28, pitch:0.8, yaw:0.5+0.1*u})` },

  // #11: the game is a guest; the host's fire breaks out at the same house, and the fire brigade comes
  { id: 'pr11', ref: '48be439', net: 'guest', frames: 120,
    setup: `__peer.world.env.time=0.7; G('fires').clear(); G('nextFire=0'); T.step(3,0.05);
      const S=G('S'), W=G('W'), open=i => { let n=0; for(let dz=-2;dz<=2;dz++) for(let dx=-2;dx<=2;dx++){ const j=i+dz*W+dx; if(j>=0 && j<S.prop.length && !S.prop[j]) n++; } return n; };
      const ok=[...S.prop.keys()].filter(i => G('burnable')(i) && G('houseAccess')(i)>=0 && [...G('fireSt').values()].some(st => st.ai>=0 && G('roadPath')(st.ai, G('houseAccess')(i))));
      const fc=ok.sort((a,b) => open(b)-open(a))[0];
      T.h={x:G('wx')(fc%W), z:G('wz')((fc/W)|0)}; __peer.sync.event('fire', String(fc), 'start'); __peer.pump();`,
    until: `[...G('fireSt').values()].some(st => st.trucks.some(t => t.state==='scene' && t.work>1.5))`, pre: 1,
    cam: `({x:T.h.x, z:T.h.z, dist:6+2*e, pitch:0.75, yaw:0.8+0.5*u})` },

  // #13: the airfield: a plane flies its loop, seen from the side (the loop starts and ends at lx0, lz0)
  { id: 'pr13', ref: 'dac9bb5', frames: 108,
    setup: `G('env').time=0.5; const st=[...G('astate').values()][0], p=st.planes.find(p => p.spec.loops>0); T.ap=[st,p]; G('aStartFlight')(st,p);`,
    until: `T.ap[1].lu>=0`, after: `const p=T.ap[1]; T.L={x:p.lx0+Math.sin(p.yaw)*p.lR*0.6, z:p.lz0+Math.cos(p.yaw)*p.lR*0.6, y:p.ly0-G('TOP')+p.lR, r:p.lR, yaw:p.yaw};`, pre: 1,
    cam: `({x:T.L.x, z:T.L.z, y:T.L.y, dist:T.L.r*4.2+1*e, pitch:0.16, yaw:T.L.yaw+Math.PI/2+0.3*u})` },

  // #14: the game hosts; the scripted guest Mia claims a plane, the host's crew bring it up, and Mia steers it:
  // the host's game draws the plane from her pose. The host follows her, and her chip says what she does.
  { id: 'pr14', ref: '52eb17f', net: 'host', ui: true, frames: 120,
    setup: `G('env').time=0.5; T.st=[...G('astate').values()][0]; T.p=T.st.planes[0]; T.id=G('akey')(T.st.v)+':'+T.p.k;
      T.pres=c => __peer.sync.presence({x:c.x, z:c.z, d:10, yaw:0.5, pitch:0.6, n:'Mia', c});
      T.pres({k:'plane', id:T.id, sh:true, x:T.p.px, y:T.p.py, z:T.p.pz, yaw:T.p.yaw, p:0, r:0, s:0, f:0});`,
    until: `T.p.phase==='pilot'`,
    after: `T.c={x:T.p.px, y:T.p.py, z:T.p.pz, yaw:T.p.yaw}; G('netFollowStart')(G('NET_PRES')[0].g);`, pre: 1,
    each: `const c=T.c, s=1.6, dt=1/24; c.yaw+=0.35*dt; c.x+=Math.sin(c.yaw)*s*dt; c.z+=Math.cos(c.yaw)*s*dt; c.y=Math.min(c.y+0.3*dt, G('TOP')+4);
      T.pres({k:'plane', id:T.id, sh:true, x:c.x, y:c.y, z:c.z, yaw:c.yaw, p:0.12, r:-0.3, s, f:4});`,
    cam: null },
];
