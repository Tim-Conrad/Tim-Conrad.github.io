// The development timeline of Kleinbahn: one stage per merged pull request that changed the game.
// Each stage is filmed at `ref` (the merge commit) by scripts/reels/timeline.mjs.
//   setup, after: game code run once (G = the game's scope through __G, T = the timeline helpers)
//   until: an expression of G and T; the clock runs without drawing until it is true
//   each: code run before every frame (f = frame number, u = 0..1, e = eased u)
//   cam: an expression of u, e, G, T, wx, wz giving the camera, or null to leave it to the game (follow)
//   net: 'host' (the game hosts a scripted guest, window.__peer) or 'guest' (the game joins a scripted host)
//   ui: true films the page with its controls and toasts (a screenshot per frame), else only the canvas
//   scale: the page at 1/scale of VIEW in CSS px with scale device pixels: the controls are larger in the clip (ui stages)
// The text of each stage (title, what the clip shows, the rest of the PR) lives in projects/kleinbahn/index.html.
export const FPS = 24;
export const VIEW = { width: 960, height: 540 };

const volc = `G('volcs')[0]`;

export const STAGES = [
  { id: 'start', ref: 'd3ff177',
    setup: `G('env').time=0.78; G('erupt')(${volc});`, until: `G('vs')(${volc}).phase==='erupt'`, pre: 20, frames: 120,
    cam: `({x:wx(${volc}.x), z:wz(${volc}.z), y:2, dist:11.5-1.5*e, pitch:0.3, yaw:0.9+0.3*u})` },

  // #1: the game hosts; the scripted guest plants trees one after the other, and they appear on the host's island
  { id: 'pr1', ref: '9ae75bf', net: 'host', frames: 96,
    setup: `G('env').time=0.45; T.spots=T.free(0,0,16); const W=G('W');
      T.c={x:T.spots.reduce((a,i)=>a+G('wx')(i%W),0)/T.spots.length, z:T.spots.reduce((a,i)=>a+G('wz')((i/W)|0),0)/T.spots.length};`,
    each: `const i=T.spots[(f-8)/5]; if(f>=8 && f%5===3 && i!==undefined){ __peer.world.layers.prop[i]=G('P_TREE'); __peer.world.layers.pv[i]=(i*37)%90; }`,
    cam: `({x:T.c.x, z:T.c.z, dist:9-1*e, pitch:0.7, yaw:0.6+0.3*u})` },

  // #2: the game is a guest; the host starts an eruption and sends the random numbers of its peak
  { id: 'pr2', ref: 'a3e426b', net: 'guest', frames: 120,
    setup: `__peer.world.env.time=0.8; G('env').time=0.8; const v=${volc}, k=G('vkey')(v), tape=Array.from({length:600},(_,i)=>(i*0.6180339)%1);
      __peer.sync.event('volc',k,'start'); __peer.sync.event('volc',k,'peak',{tape}); __peer.pump();`, pre: 20,
    cam: `({x:wx(${volc}.x), z:wz(${volc}.z), y:2, dist:11.5-1.5*e, pitch:0.3, yaw:2.2+0.3*u})` },

  // #3: the game hosts; a pin in the guest's colour stands where the guest looks, and glides as the guest looks around
  { id: 'pr3', ref: 'd8f5d41', net: 'host', frames: 120,
    setup: `G('env').time=0.5;`,
    each: `__peer.sync.presence({x:-3.5+4*e, z:-1.5+2.5*e, d:14, yaw:0.5, pitch:0.7});`,
    cam: `({x:-1.5+0.4*e, z:-0.25+0.6*e, dist:7, pitch:0.75, yaw:0.5+0.08*u})` },

  // #7: the game hosts and follows the guest, who has a name: the follow bar shows it
  { id: 'pr7', ref: '38ce447', net: 'host', ui: true, scale: 1.5, frames: 120,
    setup: `G('env').time=0.5; __peer.sync.presence({x:-5, z:-2.5, d:8, yaw:0.4, pitch:0.65, n:'Mia'}); T.step(10,0.05);`,
    after: `G('netFollowStart')(G('NET_PRES')[0].g);`, pre: 30,
    each: `__peer.sync.presence({x:-5+5*e, z:-2.5+2.5*e, d:8, yaw:0.4+0.5*e, pitch:0.65, n:'Mia'});`,
    cam: null },

  // #8: the game is a guest; the host stops the room, and the guest goes home to its own island (with its trees)
  { id: 'pr8', ref: '9e097da', net: 'guest', ui: true, scale: 1.5, frames: 96,
    setup: `__peer.world.env.time=0.5; const S=G('S'), W=G('W'), H=G('H'), own=G('netOwn') || G('serialize()'), tree=G('P_TREE');
      const pr=Uint8Array.from(atob(own.prop), c => c.charCodeAt(0)); let best=0, bi=0;
      for(let z=4;z<H-4;z++) for(let x=4;x<W-4;x++){ let n=0; for(let dz=-3;dz<=3;dz++) for(let dx=-3;dx<=3;dx++) if(pr[(z+dz)*W+x+dx]===tree) n++; if(n>best){ best=n; bi=z*W+x; } }
      T.c={x:G('wx')(bi%W), z:G('wz')((bi/W)|0)};`,
    each: `if(f===30){ __peer.sync.leave(); __peer.pump(); }`,
    cam: `({x:T.c.x, z:T.c.z, dist:12, pitch:0.7, yaw:0.5+0.15*u})` },

  // #9: the new HUD icons: the build dial opens over the island
  { id: 'pr9', ref: '1176369', ui: true, scale: 1.5, frames: 96,
    setup: `G('env').time=0.5;`,
    each: `if(f===24) document.getElementById('fabBuild').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));`,
    cam: `({x:0, z:0, dist:24, pitch:0.8, yaw:0.5+0.08*u})` },

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
    cam: `({x:T.L.x, z:T.L.z, y:T.L.y, dist:T.L.r*6+1*e, pitch:0.16, yaw:T.L.yaw+Math.PI/2+0.3*u})` },

  // #14: the game hosts; the scripted guest Mia claims a plane, the host's crew bring it up, and Mia steers it:
  // the host's game draws the plane from her pose. The host follows her, and her chip says what she does.
  { id: 'pr14', ref: '52eb17f', net: 'host', ui: true, scale: 1.5, frames: 120,
    setup: `G('env').time=0.5; T.st=[...G('astate').values()][0]; T.p=T.st.planes[0]; T.id=G('akey')(T.st.v)+':'+T.p.k;
      T.pres=c => __peer.sync.presence({x:c.x, z:c.z, d:3.5, yaw:0.5, pitch:0.35, n:'Mia', c});
      T.pres({k:'plane', id:T.id, sh:true, x:T.p.px, y:T.p.py, z:T.p.pz, yaw:T.p.yaw, p:0, r:0, s:0, f:0});`,
    until: `T.p.phase==='pilot'`,
    after: `T.c={x:T.p.px, y:T.p.py, z:T.p.pz, yaw:T.p.yaw}; G('netFollowStart')(G('NET_PRES')[0].g);`, pre: 1,
    each: `const c=T.c, s=1.6, dt=1/24; c.yaw+=0.35*dt; c.x+=Math.sin(c.yaw)*s*dt; c.z+=Math.cos(c.yaw)*s*dt; c.y=Math.min(c.y+0.3*dt, G('TOP')+4);
      T.pres({k:'plane', id:T.id, sh:true, x:c.x, y:c.y, z:c.z, yaw:c.yaw, p:0.12, r:-0.3, s, f:4});`,
    cam: null },

  // #15: the loading screen, put back over the game from the game's own index.html: the logo train runs off the rail
  // and comes back, then the screen fades. Its CSS animations follow the frame clock (1.5 times their speed).
  { id: 'pr15', ref: '12400eb', ui: true, frames: 160,
    setup: `G('env').time=0.6; const x=new XMLHttpRequest(); x.open('GET','/index.html',false); x.send();
      const L=new DOMParser().parseFromString(x.responseText,'text/html').getElementById('loader'); document.body.appendChild(document.adoptNode(L));`,
    each: `const L=document.getElementById('loader'); if(f===144) L.classList.add('done');
      for(const a of document.getAnimations()){ a.pause(); a.currentTime = a instanceof CSSTransition ? (f-144)*1000/24 : f*1500/24; }`,
    cam: `({x:0, z:0, dist:30, pitch:0.75, yaw:0.5+0.05*u})` },

  // #16: a chase camera rides behind a car through town, close enough for the fine models of cars, bicycles and people.
  // The camera sits behind the car (its heading from the last frames, smoothed), where the road is open.
  { id: 'pr16', ref: '894f337', frames: 144,
    setup: `G('env').time=0.45; T.step(200,0.05); const P=G('people').filter(p => p.vis), V=G('vehicles');
      const near=v => P.filter(p => Math.hypot(p.x-v.px, p.z-v.pz)<1.8).length + V.filter(w => w!==v && Math.hypot(w.px-v.px, w.pz-v.pz)<1.8).length;
      T.v=V.filter(v => v.type==='car' && !v.parked && v.model!=='truck').sort((a,b) => near(b)-near(a))[0];
      T.p={x:T.v.px, z:T.v.pz}; T.step(4,1/24); const dx=T.v.px-T.p.x, dz=T.v.pz-T.p.z; T.yaw=Math.atan2(-dx,-dz); T.p={x:T.v.px, z:T.v.pz};`, pre: 1,
    each: `const dx=T.v.px-T.p.x, dz=T.v.pz-T.p.z; if(Math.hypot(dx,dz)>0.004){ const y=Math.atan2(-dx,-dz), d=Math.atan2(Math.sin(y-T.yaw), Math.cos(y-T.yaw)); T.yaw+=d*0.08; } T.p={x:T.v.px, z:T.v.pz};`,
    cam: `({x:T.v.px, z:T.v.pz, y:G('TOP')+0.08, dist:1.5, pitch:0.42, yaw:T.yaw})` },

  // #25: one volcano shows the five kinds in turn (strato, shield, cinder cone, lava dome, caldera), then erupts as a cinder cone
  { id: 'pr25', ref: '7d4a2bc', frames: 168,
    setup: `G('env').time=0.74; T.v=${volc}; G('setVolcType')(T.v,0);`,
    each: `if(f<90 && f%18===0) G('setVolcType')(T.v,f/18); if(f===90) G('setVolcType')(T.v,2); if(f===96) G('erupt')(T.v);`,
    cam: `({x:wx(${volc}.x), z:wz(${volc}.z), y:1.2, dist:9-1.5*e, pitch:0.32, yaw:0.9+0.5*u})` },

  // #27: the player flies a plane: boost, a barrel roll and a loop in red smoke, then a turn-back in rainbow smoke.
  // The game's own pilot camera follows (it swings to the side for the loop); the controls show the new move buttons.
  { id: 'pr27', ref: '002762e', ui: true, scale: 1.5, frames: 216,
    setup: `G('env').time=0.5; T.st=[...G('astate').values()][0]; T.p=T.st.planes[0]; G('pilotStart')('plane', G('akey')(T.st.v)+':'+T.p.k);`,
    until: `T.p.phase==='pilot'`,
    after: `const p=T.p; p.px=-6; p.pz=-5; p.py=G('TOP')+2.6; p.yaw=0.7; p.pitch=0; p.roll=0; p.spd=p.spec.vc; G('flyInit')(p);
      document.getElementById('pilotColor').click();`, pre: 12,
    each: `const S=G('flyS'); S.boost = f>=4 && f<40; const col=c => { S.col=c; G('flySyncColor')(); };
      if(f===46) G('flyAct')('roll',1); if(f===78) col(5); if(f===80) G('flyAct')('loop'); if(f===150) col(8); if(f===152) G('flyAct')('turn');`,
    cam: null },

  // #32: the player drives a car across open ground and drifts (skid marks, tyre smoke, the horn), then takes the motor
  // boat out to sea and paints its wake red and blue. The game's own pilot camera; the controls show the move buttons.
  { id: 'pr32', ref: '81311c1', ui: true, scale: 1.5, frames: 216,
    setup: `G('env').time=0.5; const W=G('W'), H=G('H'), I=G('I'), ok=i => G('carOk')(i), sea=i => G('boatWater')(i);
      let best=-1, bn=0; for(let i=0;i<G('S').land.length;i++){ if(!ok(i)) continue; const x=i%W, z=(i/W)|0; let n=0; for(let dz=-2;dz<=2;dz++) for(let dx=-2;dx<=2;dx++) if(ok(I(x+dx,z+dz))) n++; if(n>bn){ bn=n; best=i; } }
      T.sea=null; for(let z=6;z<H-6 && !T.sea;z++) for(let x=6;x<W-6 && !T.sea;x++){ let g=true; for(let dz=-4;dz<=4 && g;dz++) for(let dx=-4;dx<=4 && g;dx++) if(!sea(I(x+dx,z+dz))) g=false; if(g) T.sea=[G('wx')(x), G('wz')(z)]; }
      T.v=G('vehicles').find(v => v.type==='car' && v.model==='car' && !v.remote); T.mb=G('boats').find(b => b.type==='motor' && !b.remote);
      G('pilotStart')('car', G('craftId')(T.v)); T.step(1, 1/24);
      const [cx,cz]=G('cellCenter')(best); T.v.px=cx-0.6; T.v.pz=cz-0.6; T.v.yaw=T.v.vh=0.8; T.v.speed=0; G('camGoal').yaw=G('cam').yaw=0.8+Math.PI;`, pre: 1,
    each: `const k=G('keys'), K=(n,on) => on ? k.add(n) : k.delete(n);
      if(f<96){ K('arrowup', true); K('arrowleft', f>=30 && f<80); G('gmS').drift = f>=30 && f<80; if(f===18) G('gmHorn')(); }
      if(f===96){ K('arrowleft', false); G('gmS').drift=false; G('pilotStop')(); const b=T.mb; G('pilotStart')('boat', G('craftId')(b));
        b.x=T.sea[0]; b.z=T.sea[1]; b.yaw=0.3; b.speed=0.6;
        const g=G('camGoal'), c=G('cam'), t=G('target'); g.x=t.x=b.x; g.z=t.z=b.z; g.yaw=c.yaw=0.3+Math.PI; }
      // the colour button after the boat has made its first step (its first step sets up its fields)
      if(f===98){ G('flyS').col=0; document.getElementById('pilotColor').click(); }
      if(f>96){ K('arrowup', true); K('arrowleft', (f-96)%80<40); K('arrowright', (f-96)%80>=40); G('flyS').boost = f>150 && f<190; if(f===150){ G('flyS').col=5; G('flySyncColor')(); } }
      if(f===215){ for(const n of ['arrowup','arrowleft','arrowright']) K(n, false); G('flyS').boost=false; }`,
    cam: null },

  // #33 and #34: the player drives a steam train: opens the regulator, blows the whistle, and before the next junction
  // sets it to the branch with the track buttons; the arrow on the track shows the way. (At these commits the first frame
  // of a driven train left the camera NaN, fixed in #36: the setup gives the camera its heading.)
  { id: 'pr33', ref: 'ddc70c2', ui: true, scale: 1.5, frames: 192,
    setup: `G('env').time=0.5; T.t=G('trains').find(t => t.cars[0].type==='loco') || G('trains')[0]; G('craftLook')('train', T.t.id); T.step(2, 1/24);
      document.getElementById('followSteer').click(); T.step(1, 1/24); G('camGoal').yaw=G('cam').yaw=G('trainCamYaw')(T.t); T.done=false;`, pre: 6,
    each: `const k=G('keys'); if(f<50) k.add('arrowup'); else k.delete('arrowup'); if(f===24) G('gmHorn')();
      const j=T.t.jn; if(j && !T.done){ const [cx,cz]=G('cellCenter')(j.i), c=T.t.cars[0].mesh.position;
        if(Math.hypot(cx-c.x, cz-c.z)<2.2){ const now=G('trainSide')(j, G('trainExit')(j)), s=j.ex.map(d => G('trainSide')(j, d)).find(v => v!==0 && v!==now);
          if(s!==undefined){ document.getElementById(s>0 ? 'pilotSwL' : 'pilotSwR').click(); T.done=true; } } }`,
    cam: null },

  // #35: the finer track, close up: a slow turn low over a junction (one gravel bed, turnout timbers, rails with a head)
  { id: 'pr35', ref: '89fddd8', frames: 144,
    setup: `G('env').time=0.45; const S=G('S'), W=G('W'), ROAD=G('ROAD'); let i=-1; for(let k=0;k<S.track.length && i<0;k++) if(S.track[k] && S.land[k] && !ROAD[k] && G('dirsOf')(S.track[k]).length===3) i=k;
      T.c={ x:G('wx')(i%W), z:G('wz')((i/W)|0) };`,
    cam: `({x:T.c.x, z:T.c.z, y:0, dist:2.8-0.7*e, pitch:0.5-0.14*e, yaw:0.3+1.3*u})` },
];
