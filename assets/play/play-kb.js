// Kleinbahn page: the rule under the header is a railway (mock-up).
// The scenery is drawn in ink like the rest of the sheet: two hills with tunnels, a station building, a signal.
// The train is the game's own models (the near versions), rendered in 16 wheel positions, by day and by night.
// The two tunnels are one loop: what goes into the right hill comes out of the left one at once.
// The train stops at the station where people get on and off. The smoke is soft puffs, one burst per beat of the engine.
// Tap a car to stop or start the train, grab it and push it, set the signal. Sheep graze on the hill.
(() => {
  const main = document.getElementById('main'), head = document.querySelector('.post-head'), reel = document.querySelector('.product > .reel');
  if (!main || !head || !reel) return;
  const A = '/assets/play/';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dark = () => { const t = document.documentElement.dataset.theme; return t ? t === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; };
  main.classList.add('has-play', 'has-rail');
  const hint = document.createElement('p'); hint.className = 'label play-hint';
  hint.textContent = 'The train runs on the line below. Tap it to stop or start it, push it along, or set the signal.';
  head.appendChild(hint);
  const layer = document.createElement('div'); layer.className = 'play-layer'; main.appendChild(layer);
  const mk = (tag, cls, parent = layer) => { const e = document.createElement(tag); if (cls) e.className = cls; parent.appendChild(e); return e; };
  const svgEl = (w, h, cls, inner, below = 0) => { const d = mk('div', cls); d.innerHTML = `<svg viewBox="0 0 ${w} ${h + below}" width="${w}" height="${h + below}" aria-hidden="true">${inner}</svg>`; return d; };
  const put = (el, x, y, extra = '') => { el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)${extra}`; };
  let now = performance.now();

  // ---------- the cars: frames rendered from src/models/train.js (detail:'high'), 250 px per model unit ----------
  // l, r: the picture's edges from the car's centre; dia: the wheel, so a wheel frame moves with the distance
  const CAR = {
    loco: { w: 241, h: 150, dia: .17, label: 'The steam engine' }, coach: { w: 200, h: 125, dia: .12, label: 'A coach' },
    rcoach: { w: 216, h: 125, dia: .12, label: 'A coach' }, box: { w: 206, h: 120, dia: .17, label: 'A box van' },
    logs: { w: 206, h: 124, dia: .17, label: 'A wagon with logs' }, tank: { w: 206, h: 128, dia: .17, label: 'A tank wagon' } };
  const FRAMES = 16;

  // ---------- layout ----------
  let W, railY, u, wide;
  const measure = () => { const m = main.getBoundingClientRect(), r = reel.getBoundingClientRect();
    W = main.clientWidth; railY = r.top - m.top; wide = W >= 700; u = wide ? 125 : 92; };
  measure();

  // ---------- the drawn scenery ----------
  const sleepers = mk('div', 'kb-sleepers');
  const BELOW = 12;
  const hill = side => {      // a hill with a tunnel portal on its inner side; the train passes behind it
    const w = wide ? 160 : 78, ph = Math.round(CAR.loco.h * u / 250) + 16, h = ph + (wide ? 36 : 26), id = 'kbh' + side + w;
    const pw = 13, px = w - pw, top = `M0 ${h * .36} C${w * .2} 0 ${w * .48} 0 ${w * .68} ${h * .1} C${w * .84} ${h * .17} ${px - 5} ${h - ph - 15} ${px} ${h - ph - 8}`;
    const inner = `<defs><pattern id="${id}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="kb-hatch" x1="0" y1="0" x2="0" y2="7"/></pattern></defs>
      <path class="kb-hill__fill" d="${top} L${px} ${h} L0 ${h} Z"/><path d="${top} L${px} ${h} L0 ${h} Z" fill="url(#${id})"/>
      <path class="kb-ink" d="${top}"/>
      <rect class="kb-hill__fill kb-ink" x="${px}" y="${h - ph}" width="${pw}" height="${ph}"/>
      <rect class="kb-hill__fill kb-ink" x="${px - 3}" y="${h - ph - 8}" width="${pw + 5}" height="8"/>
      ${Array.from({ length: Math.floor(ph / 10) }, (_, k) => `<line class="kb-ink kb-thin" x1="${px}" y1="${h - ph + k * 10 + 10}" x2="${w}" y2="${h - ph + k * 10 + 10}"/>`).join('')}
      ${Array.from({ length: Math.floor(ph / 10) }, (_, k) => `<line class="kb-ink kb-thin" x1="${px + (k % 2 ? 4 : 8)}" y1="${h - ph + k * 10}" x2="${px + (k % 2 ? 4 : 8)}" y2="${h - ph + k * 10 + 10}"/>`).join('')}
      <rect class="kb-hill__fill" x="-1" y="${h - 2}" width="${w + 2}" height="${BELOW + 2}"/><line class="kb-ink kb-ground" x1="-1" y1="${h + .75}" x2="${w + 1}" y2="${h + .75}"/>`;
    // the hill reaches over the track: its paper covers the wheels and the sleepers, and it draws the rail line again
    const el = svgEl(w, h, 'kb-hill', inner, BELOW); if (side < 0) el.firstChild.style.transform = 'scaleX(-1)';
    // the outline as a table of heights, so sheep can stand on the slope
    const path = el.querySelector('path.kb-ink'), n = path.getTotalLength(), ys = new Array(Math.ceil(w) + 1).fill(h);
    for (let k = 0; k <= 200; k++) { const pt = path.getPointAtLength(n * k / 200), i = Math.round(pt.x); if (i >= 0 && i < ys.length) ys[i] = Math.min(ys[i], pt.y); }
    for (let i = 1; i < ys.length; i++) if (ys[i] === h) ys[i] = ys[i - 1];
    return { el, w, h, ph, side, plateau: w * .6, yAt: x => ys[Math.max(0, Math.min(ys.length - 1, Math.round(x)))] }; };
  let HL, HR;
  const building = svgEl(130, 74, 'kb-building', `
    <path class="kb-ink kb-paper" d="M14 30 L65 6 L116 30 Z"/><rect class="kb-ink kb-paper" x="20" y="30" width="90" height="44"/>
    <rect class="kb-ink kb-paper" x="88" y="4" width="8" height="16"/>
    <rect class="kb-ink" x="57" y="46" width="16" height="28"/><rect class="kb-ink" x="31" y="44" width="14" height="16"/><rect class="kb-ink" x="85" y="44" width="14" height="16"/>
    <line class="kb-ink kb-thin" x1="38" y1="44" x2="38" y2="60"/><line class="kb-ink kb-thin" x1="92" y1="44" x2="92" y2="60"/>
    <circle class="kb-ink kb-paper" cx="65" cy="22" r="5"/><line class="kb-ink kb-thin" x1="65" y1="22" x2="65" y2="18.5"/><line class="kb-ink kb-thin" x1="65" y1="22" x2="67.5" y2="22"/>
    <text class="kb-name" x="65" y="40" text-anchor="middle">KLEINBAHN</text>`);
  const platform = mk('div', 'kb-platform');
  const lamp = svgEl(14, 64, 'kb-lamp', '<line class="kb-ink" x1="7" y1="10" x2="7" y2="64"/><path class="kb-ink kb-paper" d="M2 10 L12 10 L10 2 L4 2 Z"/>');
  const signal = mk('button', 'kb-signal'); signal.type = 'button';
  signal.innerHTML = '<svg viewBox="0 0 34 62" aria-hidden="true"><line class="ink" x1="17" y1="6" x2="17" y2="62"/><line class="ink" x1="10" y1="61" x2="24" y2="61"/>' +
    '<g class="arm"><rect class="fill" x="17" y="9" width="17" height="6"/><circle class="hole" cx="29" cy="12" r="1.6"/></g><circle class="ink" cx="17" cy="12" r="2.4"/></svg>';
  let clear = true;
  const setSignal = c => { clear = c; signal.setAttribute('aria-pressed', String(c)); signal.setAttribute('aria-label', `Signal: ${c ? 'clear' : 'stop'}. Press to set it to ${c ? 'stop' : 'clear'}.`); };
  setSignal(true);
  signal.addEventListener('click', () => { setSignal(!clear); if (clear && T.v < 5 && T.mode === 'run') whistle(); });

  // ---------- the train ----------
  const T = { s: 0, v: 0, mode: 'run', cars: [], served: false, dwell: 0, inside: 3, held: null, lastPuff: 0, tunnel: 0 };
  const strip = k => `url(${A}car-${k}-${dark() ? 'n' : 'd'}.webp)`;
  const build = () => {
    for (const c of T.cars) c.el.remove();
    T.cars = [];
    const kinds = wide ? ['loco', 'coach', 'rcoach', 'coach', 'box', 'logs', 'tank'] : ['loco', 'coach', 'box'];
    for (const k of kinds) {
      const d = CAR[k], w = d.w * u / 250, h = d.h * u / 250, el = mk('div', 'kb-car');
      el.style.width = w + 'px'; el.style.height = h + 'px'; el.style.backgroundImage = strip(k); el.style.backgroundSize = `${w * FRAMES}px ${h}px`;
      el.setAttribute('role', 'img'); el.setAttribute('aria-label', `${d.label}. Tap to stop or start the train, drag to push it.`);
      T.cars.push({ kind: k, el, w, h, x: 0, v: 0, step: Math.PI * d.dia * u / FRAMES, passengers: k === 'coach' || k === 'rcoach' }); grab(el);
    }
    T.len = T.cars.reduce((a, c) => a + c.w, 0);
  };
  new MutationObserver(() => { night = dark(); for (const c of T.cars) c.el.style.backgroundImage = strip(c.kind); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { night = dark(); for (const c of T.cars) c.el.style.backgroundImage = strip(c.kind); });

  const lay = () => {               // the station, the signal and the hills for this width
    if (!HL || HL.wide !== wide) { if (HL) { HL.el.remove(); HR.el.remove(); } HL = hill(1); HR = hill(-1); HL.wide = HR.wide = wide; }
    const lw = T.cars[0].w, pass = T.cars.filter(c => c.passengers).reduce((a, c) => a + c.w, 0);
    T.xs = Math.round(W - HR.w - (wide ? 36 : 10));                 // where the engine's front stops
    T.pl1 = Math.round(T.xs - lw - pass - 6); T.pl2 = Math.round(T.xs - lw * .3);
    T.xsig = Math.round(Math.max(HL.w + 30, T.pl1 - (wide ? 70 : 30)));
    // the loop: a car's right edge runs from just inside the left portal to where the right hill hides the whole car
    const maxW = Math.max(...T.cars.map(c => c.w)); T.x0 = HL.w - 6; T.L = (W - HR.w + maxW + 6) - T.x0;
    put(sleepers, 0, railY + 1.5); sleepers.style.width = W + 'px';
    put(HL.el, 0, railY - HL.h); put(HR.el, W - HR.w, railY - HR.h);
    platform.style.width = (T.pl2 - T.pl1) + 'px'; put(platform, T.pl1, railY - 10);
    const bs = wide ? 1 : .62; building.firstChild.style.width = 130 * bs + 'px'; building.firstChild.style.height = 74 * bs + 'px';
    put(building, (T.pl1 + T.pl2) / 2 - 65 * bs, railY - 10 - 74 * bs);
    put(lamp, T.pl1 + 8, railY - 10 - 64 * (wide ? 1 : .8)); lamp.firstChild.style.height = 64 * (wide ? 1 : .8) + 'px';
    put(signal, T.xsig + 4, railY - 62);
    signal.style.display = !wide && T.xsig + 40 > T.pl1 ? 'none' : '';
  };
  const place = s => { T.s = s; let right = s; for (const c of T.cars) { c.x = right; right -= c.w - 1; } for (const c of T.cars) c.d = disp(c.x); T.lap = lapOf(s); };
  // positions run on without end; on screen they wrap round the loop
  const disp = X => T.x0 + (((X - T.x0) % T.L) + T.L) % T.L;
  const lapOf = X => Math.floor((X - T.x0) / T.L);
  const LD = () => disp(T.s);

  // ---------- people on the platform ----------
  const people = [];
  const PH = () => .18 * u;
  const person = (kind, x, state = 'wait') => {
    const img = mk('img', 'play-img'); img.alt = ''; img.draggable = false;
    const p = { kind, img, x, face: Math.random() < .5 ? 1 : -1, state, tx: x, t: Math.random() * 30 };
    img.src = A + (kind === 'child' ? 'p-child.png' : 'p-stand.png'); img.style.transition = 'opacity .5s';
    img.addEventListener('click', () => { if (p.state === 'wait') { p.face *= -1; say(['Hello!', 'Is it on time?', 'Morning!'][Math.floor(Math.random() * 3)], p.x, railY - 10 - PH()); } });
    people.push(p); return p; };
  const drawPerson = p => {
    const h = p.kind === 'child' ? PH() * .66 : PH(), walking = p.state === 'walk' || p.state === 'board' || p.state === 'leave';
    const step = walking && Math.floor(now / 170) % 2, file = p.kind === 'child' ? 'p-child.png' : step ? 'p-walk.png' : 'p-stand.png';
    if (!p.img.src.endsWith(file)) p.img.src = A + file;
    const w = h * (p.kind === 'child' ? 31 / 84 : step ? 54 / 128 : 47 / 129);
    p.img.style.height = h + 'px'; p.img.style.width = w + 'px';
    const bob = walking && p.kind === 'child' ? Math.floor(now / 150) % 2 : 0;
    put(p.img, p.x - w / 2, railY - 10 - h - bob, ` scaleX(${p.face})`); };

  // ---------- sheep on the left hill ----------
  const sheep = [0, 1].map(i => { const img = mk('img', 'play-img'); img.src = A + 'sheep2.png'; img.alt = ''; img.draggable = false; img.style.zIndex = 7;
    const sh = { img, x: 0, face: i ? -1 : 1, hop: 0, next: 2 + Math.random() * 5, walk: 0 };
    img.addEventListener('click', () => { hop(sh); say('Mäh', sh.x, railY - HL.h - 30); }); return sh; });
  const hop = sh => { if (!sh.hop) sh.hop = now; };

  // ---------- speech, smoke ----------
  const bubble = mk('div', 'play-bubble'); let bubbleT = 0;
  const say = (text, x, y, ms = 1600) => { bubble.textContent = text; bubble.classList.add('is-on'); put(bubble, Math.max(8, Math.min(W - 90, x - 20)), y - 34); bubbleT = now + ms; };
  // ---------- smoke and steam, low poly ----------
  // Each puff is a faceted blob like the game's models: a fan of flat triangles, lit from the upper left.
  // The physics: the exhaust leaves the chimney fast with the train's speed, air drag slows it to the breeze,
  // warm smoke keeps rising while it cools, a shared turbulent flow folds neighbouring puffs together,
  // puffs grow as they take in air, turn lighter and fade. At speed the plume lies long and low; standing, it climbs.
  const NS = 'http://www.w3.org/2000/svg';
  const smoke = mk('div', 'kb-smoke'); smoke.innerHTML = `<svg width="100%" height="100%" aria-hidden="true"></svg>`;
  const sv = smoke.firstChild, parts = [], pool = [];
  let night = dark();
  const facet = () => {               // a unit puff: 6 to 8 corners, a little irregular, its centre nudged towards the light
    const n = 6 + Math.floor(Math.random() * 3), pts = [], cx = -.12, cy = -.14;
    for (let k = 0; k < n; k++) { const a = (k + Math.random() * .5) / n * Math.PI * 2, r = .82 + Math.random() * .3; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
    const g = document.createElementNS(NS, 'g'), base = document.createElementNS(NS, 'polygon');
    base.setAttribute('points', pts.map(p => p.join(',')).join(' ')); base.setAttribute('fill', 'currentColor'); g.appendChild(base);
    for (let k = 0; k < n; k++) {
      const p1 = pts[k], p2 = pts[(k + 1) % n], mx = (p1[0] + p2[0]) / 2 - cx, my = (p1[1] + p2[1]) / 2 - cy;
      const lit = (-mx - my) / Math.hypot(mx, my) / Math.SQRT2;         // facing the upper left: lit; facing down right: shade
      if (Math.abs(lit) < .25) continue;
      const t = document.createElementNS(NS, 'polygon');
      t.setAttribute('points', `${cx},${cy} ${p1.join(',')} ${p2.join(',')}`);
      t.setAttribute('fill', lit > 0 ? '#fff' : '#000'); t.setAttribute('fill-opacity', (lit > 0 ? .26 : .16) * Math.abs(lit));
      g.appendChild(t); }
    return g; };
  const puff = (x, y, o) => {
    if (parts.length > 170) return;
    const g = pool.pop() || facet(); sv.appendChild(g);
    parts.push({ g, x, y, vx: o.vx || 0, vy: o.vy || 0, r0: o.r0 || 4, gr: o.gr || 14, life: o.life || 3, a: o.a ?? .6, age: 0, steam: !!o.steam,
      drag: o.drag ?? 2.2, buoy: o.buoy ?? 26, rot: Math.random() * 360, spin: (Math.random() - .5) * 50, cc: -1 }); };
  const flow = (x, y, t) => [                                     // a slow turbulent field: neighbours move alike
    9 * Math.sin(.031 * y + .8 * t) + 6 * Math.sin(.047 * x - .55 * t + 1.3),
    5 * Math.cos(.037 * x + .6 * t) + 4 * Math.sin(.052 * y - .9 * t) ];
  const smokeStep = dt => {
    const t = now / 1000, wind = -10 * sc(), ceil = railY - (wide ? 150 : 104) * sc() * (wide ? 1 : 1.3);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.age += dt * (p.y < ceil ? 2.5 : 1); const k = p.age / p.life;
      if (k >= 1) { p.g.remove(); pool.push(p.g); parts.splice(i, 1); continue; }
      const dr = Math.exp(-p.drag * dt), [fx, fy] = flow(p.x, p.y, t), heat = Math.exp(-p.age / 1.4);
      p.vx = wind + (p.vx - wind) * dr; p.vy = p.vy * dr - p.buoy * heat * dt;
      p.x += (p.vx + fx * Math.min(1, p.age * 1.5)) * dt; p.y += (p.vy + fy * Math.min(1, p.age * 1.5)) * dt;
      if (p.y > railY - 4) { p.y = railY - 4; p.vy = Math.min(p.vy, 0); }        // smoke does not sink into the ground
      p.rot += p.spin * dt;
      const r = p.r0 + p.gr * Math.sqrt(p.age), fade = Math.min(1, p.age / .08) * Math.pow(1 - k, 1.6);
      const m = Math.min(1, k * 1.4), [c0, c1] = p.steam ? (night ? [238, 238] : [214, 236]) : night ? [196, 118] : [62, 176];
      const gC = Math.round(c0 + (c1 - c0) * m);
      if (gC !== p.cc) { p.cc = gC; p.g.style.color = `rgb(${gC},${gC},${gC})`; }
      p.g.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.rot.toFixed(0)}) scale(${r.toFixed(2)})`);
      p.g.setAttribute('opacity', (p.a * fade).toFixed(3)); } };
  const sc = () => u / 125;
  const loco = () => T.cars[0];
  const chimney = () => { const l = loco(); return [l.d - l.w * .21, railY - l.h + 3]; };
  const visible = x => x > HL.w - 4 && x < W - HR.w + 4;
  // one beat of the engine: a burst from the chimney, or out of a portal while the engine is in a tunnel
  const chuff = (strong) => {
    const [x, y] = chimney(), s = sc(), v = T.v;
    if (!visible(x)) { const left = x <= HL.w, px = left ? HL.w + 2 : W - HR.w - 2, hh = left ? HL : HR;
      puff(px, railY - hh.ph * .8, { vx: (left ? 40 : -40) * s, vy: -10, r0: 7 * s, gr: 14 * s, life: 3.2, a: .4, drag: 2.5, buoy: 18 }); return; }
    for (let i = 0; i < 2; i++) puff(x + (Math.random() - .5) * 3, y - i * 3, { vx: v + (Math.random() - .5) * 14, vy: -(95 + Math.abs(v) * .3 + Math.random() * 30) * s,
      r0: (3 + Math.random() * 2) * s, gr: (strong ? 15 : 12) * s * (.85 + Math.random() * .3), life: 3 + Math.random() * 1.2, a: strong ? .78 : .62, drag: 2.4, buoy: 30 * s }); };
  const cocks = () => { const l = loco(), s = sc();                // the cylinder cocks blow steam when the engine starts
    for (const dir of [1, -1]) puff(l.d - l.w * .12, railY - 10 * s, { steam: true, vx: dir * (110 + Math.random() * 60) * s + T.v, vy: -10, r0: 3 * s, gr: 13 * s, life: .9, a: .75, drag: 3.5, buoy: 10 }); };
  const whistle = () => { const l = loco(), s = sc(), x = l.d - l.w * .45, y = railY - l.h * .82;
    for (let i = 0; i < 6; i++) setTimeout(() => puff(x, y, { steam: true, vx: T.v, vy: -130 * s, r0: 2 * s, gr: 9 * s, life: 1.1, a: .85, drag: 3, buoy: 8 }), i * 55);
    T.cocks = 1.6; for (let i = 0; i < 3; i++) setTimeout(() => chuff(true), i * 220); };
  const brakeHiss = () => { const l = loco(), s = sc();
    for (let i = 0; i < 5; i++) setTimeout(() => puff(l.d - l.w * (.15 + .4 * Math.random()), railY - 5 * s, { steam: true, vx: (Math.random() - .5) * 90 * s, vy: -12, r0: 2 * s, gr: 10 * s, life: .8, a: .6, drag: 3.5, buoy: 8 }), i * 80); };
  // ---------- pointer ----------
  function grab(el) {
    el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); T.held = { el, x0: e.clientX, s0: T.s, moved: false, hist: [[now, e.clientX]] }; el.classList.add('is-held'); });
    el.addEventListener('pointermove', e => { const h = T.held; if (!h || h.el !== el) return; if (Math.abs(e.clientX - h.x0) > 5) h.moved = true;
      h.hist.push([now, e.clientX]); if (h.hist.length > 6) h.hist.shift(); if (h.moved) h.target = h.s0 + (e.clientX - h.x0); });
    const up = () => { const h = T.held; if (!h || h.el !== el) return; T.held = null; el.classList.remove('is-held');
      if (!h.moved) { toggle(); return; }
      const a = h.hist[0], b = h.hist[h.hist.length - 1]; T.v = Math.max(-420, Math.min(420, (b[1] - a[1]) / Math.max(.016, (b[0] - a[0]) / 1000)));
      if (Math.abs(T.v) > 160) say(T.v > 0 ? 'Whoosh!' : 'Backwards?', Math.min(W - HR.w - 60, LD() - 40), railY - T.cars[0].h); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); }
  const toggle = () => { const x = Math.min(W - HR.w - 60, LD() - 30);
    if (T.mode === 'run') { T.mode = 'halt'; say('Stop!', x, railY - T.cars[0].h); } else { T.mode = 'run'; T.served = T.served || T.v === 0 && Math.abs(LD() - T.xs) < 2; whistle(); } };

  // ---------- one step ----------
  const CRUISE = () => 78 * u / 125, ACC = 30, BRK = 55;
  const drive = dt => {
    if (T.held) { if (T.held.target != null) { const ns = T.held.target; T.v = (ns - T.s) / Math.max(dt, .001) * .3 + T.v * .7; T.s = ns; } return; }
    const vt = T.mode === 'run' && T.dwell <= 0 ? CRUISE() : 0, dl = LD(); let stopAt = null;
    if (T.v >= 0) {
      if (!clear && dl < T.xsig - 6) stopAt = T.xsig - 8;
      if (!T.served && dl < T.xs + 1 && T.mode === 'run') stopAt = stopAt == null ? T.xs : Math.min(stopAt, T.xs);
    }
    if (stopAt != null && T.v > 0) {
      const d = stopAt - dl;
      if (d <= T.v * T.v / (2 * BRK) + 1) { if (d < .6) { T.s += d; T.v = 0; brakeHiss(); } else T.v = Math.max(4, T.v - T.v * T.v / (2 * d) * dt); }
      else T.v = Math.min(vt, T.v + ACC * dt);
    } else if (T.v < vt) T.v = Math.min(vt, T.v + ACC * dt * (T.v < 0 ? 3 : 1));
    else { const was = T.v; T.v = Math.max(vt, T.v - (T.v > CRUISE() ? 80 : BRK) * dt); if (was > 0 && T.v === 0) brakeHiss(); }
    T.s += T.v * dt;
    const lap = lapOf(T.s); if (lap > T.lap) T.served = false; T.lap = lap;      // a new round: the station waits again
    if (!T.served && T.v === 0 && Math.abs(LD() - T.xs) < 1 && T.dwell <= 0 && T.mode === 'run') arrive();
    if (T.dwell > 0) { T.dwell -= dt; if (T.dwell <= 0) { T.served = true; whistle(); } } };
  const doors = () => T.cars.filter(c => c.passengers).map(c => c.d - c.w / 2);
  const arrive = () => {
    T.dwell = 6; const ds = doors(); if (!ds.length) return;
    const out = Math.min(T.inside, 1 + Math.floor(Math.random() * 3));
    for (let i = 0; i < out; i++) setTimeout(() => {           // get off, wait a moment, walk away
      const p = person(Math.random() < .3 ? 'child' : 'adult', ds[i % ds.length], 'walk'); T.inside--;
      p.img.style.opacity = 0; requestAnimationFrame(() => { p.img.style.opacity = 1; });
      p.tx = T.pl1 + 14 + Math.random() * (T.pl2 - T.pl1 - 28) * .5; p.then = 'leave'; }, 400 + i * 650);
    for (const p of people.filter(p => p.state === 'wait')) { p.state = 'board'; p.tx = ds[Math.floor(Math.random() * ds.length)] + (Math.random() - .5) * 12; } };
  const peopleStep = dt => {
    for (const p of [...people]) {
      if (p.state === 'walk' || p.state === 'board' || p.state === 'leave') {
        const d = p.tx - p.x, sp = (p.kind === 'child' ? 20 : 15) * u / 125; p.face = d >= 0 ? 1 : -1;
        if (Math.abs(d) < sp * dt) {
          p.x = p.tx;
          if (p.state === 'board' || p.state === 'leave') { if (p.state === 'board') T.inside++; p.img.style.opacity = 0; p.state = 'gone';
            setTimeout(() => { p.img.remove(); people.splice(people.indexOf(p), 1); }, 600); }
          else if (p.then === 'leave') { p.state = 'wait'; p.then = null; setTimeout(() => { if (p.state === 'wait') { p.state = 'leave'; p.tx = T.pl1 - 4; } }, 2500 + Math.random() * 2500); }
          else p.state = 'wait';
        } else p.x += Math.sign(d) * sp * dt;
      } else if (p.state === 'wait' && !reduced()) { p.t -= dt; if (p.t < 0) { p.t = 5 + Math.random() * 25; p.face *= -1; } }
      drawPerson(p); }
    const waiting = people.filter(p => p.state === 'wait' || (p.state === 'walk' && !p.then)).length;
    const away = T.cars.every(c => c.d < T.pl1 + 4 || c.d - c.w > T.pl2 - 4);
    if (!reduced() && T.dwell <= 0 && waiting < 3 && away && Math.random() < dt * .3) {
      const p = person(Math.random() < .25 ? 'child' : 'adult', T.pl1 - 2, 'walk'); p.img.style.opacity = 0; requestAnimationFrame(() => { p.img.style.opacity = 1; });
      p.tx = T.pl1 + 18 + Math.random() * (T.pl2 - T.pl1 - 36); } };

  let last = performance.now();
  const tick = t => {
    now = t; const dt = Math.min(.05, (t - last) / 1000); last = t;
    const s0 = T.s; drive(dt);
    // couplings: the cars follow on a spring, so the train bunches up when it brakes and stretches when it pulls
    T.cars[0].x = T.s; T.cars[0].v = T.v;
    for (let i = 1; i < T.cars.length; i++) {
      const c = T.cars[i], p = T.cars[i - 1], target = p.x - p.w + 1;
      c.v += (160 * (target - c.x) - 15 * (c.v - p.v)) * dt; c.x += c.v * dt;
      c.x = Math.max(target - 6, Math.min(target + 1.5, c.x)); }
    const sp = Math.abs(T.v);
    for (const c of T.cars) c.d = disp(c.x);
    for (const [i, c] of T.cars.entries()) {
      const f = ((FRAMES - (Math.floor(c.x / c.step) % FRAMES)) % FRAMES + FRAMES) % FRAMES;
      c.el.style.backgroundPosition = `${-f * c.w}px 0`;
      const bob = sp > 5 ? Math.round(Math.sin(c.x * .3 + i * 2) * .6) : 0;
      put(c.el, c.d - c.w, railY - c.h + 1 + bob); }
    // smoke: four beats to a turn of the driving wheels; standing, the engine simmers
    T.beat = (T.beat || 0) + Math.abs(T.s - s0);
    const beatLen = Math.PI * .17 * u / 4;
    if (T.beat >= beatLen) { T.beat %= beatLen; chuff(T.v > 2 && T.v < CRUISE() * .7 && T.mode === 'run'); }
    if (!reduced() && sp < 3 && now - T.lastPuff > 380) { T.lastPuff = now; const [x, y] = chimney();
      if (visible(x)) puff(x, y, { vx: 0, vy: -30 * sc(), r0: 2.5 * sc(), gr: 8 * sc(), life: 3, a: .34, drag: 1.5, buoy: 16 * sc() });
      if (Math.random() < .08) { const l = loco(); puff(l.d - l.w * .62, railY - l.h * .74, { steam: true, vy: -70 * sc(), r0: 2 * sc(), gr: 7 * sc(), life: 1.1, a: .7, drag: 2.5, buoy: 8 }); } }
    if (T.cocks > 0) { T.cocks -= dt; if (Math.random() < dt * 14) cocks(); }
    smokeStep(dt);
    // sheep graze on the hill, step about, and look up when the engine comes out of the tunnel
    for (const [i, sh] of sheep.entries()) {
      const h = .14 * u * 1.4, w = h * 98 / 72; sh.img.style.width = w + 'px'; sh.img.style.height = h + 'px';
      sh.img.style.display = i && !wide ? 'none' : '';
      if (!sh.x) sh.x = HL.plateau * (i ? .72 : .3);
      if (!reduced()) { sh.next -= dt; if (sh.next < 0) { sh.next = 4 + Math.random() * 7; if (Math.random() < .45) sh.face *= -1; else sh.walk = 1 + Math.random(); } }
      if (sh.walk > 0) { sh.walk -= dt; sh.x += sh.face * 7 * dt; if (sh.x < w / 2 + 2 || sh.x > HL.plateau - w / 2) { sh.face *= -1; sh.x = Math.max(w / 2 + 2, Math.min(HL.plateau - w / 2, sh.x)); } }
      const nose = loco().d; if (T.v > 30 && nose > HL.w && nose < HL.w + 30) { hop(sh); sh.face = 1; }
      let hy = 0; if (sh.hop) { const k = (now - sh.hop) / 420; if (k >= 1) sh.hop = 0; else hy = Math.sin(Math.PI * k) * 9; }
      put(sh.img, sh.x - w / 2, railY - HL.h + HL.yAt(sh.x) - h + 2 - hy, ` scaleX(${sh.face})`); }
    peopleStep(dt);
    if (bubbleT && now > bubbleT) { bubble.classList.remove('is-on'); bubbleT = 0; }
    requestAnimationFrame(tick); };

  const start = () => {
    measure(); build(); lay();
    if (reduced()) { place(T.xs); T.served = true; T.mode = 'halt'; }
    else { place(HL.w + T.cars[0].w + 20); T.v = CRUISE() * .8; }
    for (const k of [.2, .45, .7]) person(k === .45 ? 'child' : 'adult', T.pl1 + (T.pl2 - T.pl1) * k);
    requestAnimationFrame(tick);
    let rt, lastW = W;
    const relayout = () => { const k = LD() / lastW; measure(); if (Math.abs(W - lastW) > 40) { build(); lay(); place(k * W); lastW = W; for (const p of people) p.x = Math.max(T.pl1 + 10, Math.min(T.pl2 - 10, p.x)); } else lay(); };
    addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(relayout, 150); });
    setInterval(() => { measure(); lay(); }, 1500); };
  const go = () => (document.fonts ? document.fonts.ready : Promise.resolve()).then(start);
  if (document.readyState === 'complete') go(); else addEventListener('load', go);
})();
