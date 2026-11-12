// Wortzauber page: Paul and the Schwebe-Bot live on the lines of the article (mock-up).
// Paul walks on the rules, the feature list, the pictures and the title. Pick him up and throw him;
// tap a dotted word and he makes the thing appear. When the reader scrolls on, he follows.
(() => {
  const main = document.getElementById('main');
  if (!main || !document.querySelector('.post-head')) return;
  const A = '/assets/play/';
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const G = 2200;                       // gravity, px/s²
  main.classList.add('has-play');
  const layer = document.createElement('div'); layer.className = 'play-layer'; main.appendChild(layer);

  // ---------- sprites ----------
  const SHEETS = {
    paul: { src: 'paul.png', w: 512, h: 1360, fw: 64, fh: 80, cols: 8, ax: 28, ay: 78, anims: {
      idle: [0, 4, 6], cast: [8, 8, 12], walk: [16, 8, 10], jump: [24, 8, 12], land: [29, 3, 14], air: [27, 1, 1], channel: [32, 4, 8],
      cheer: [40, 8, 10], run: [48, 8, 14], pickup: [96, 6, 14], drop: [104, 4, 12], fly: [112, 2, 6],
      oidle: [80, 4, 6], owalk: [88, 8, 10] } },
    bot: { src: 'bot.png', w: 640, h: 864, fw: 64, fh: 96, cols: 10, ax: 32, ay: 88, anims: {
      idle: [0, 4, 6], move: [10, 6, 12], wave: [20, 6, 10], carry: [40, 4, 8], point: [60, 6, 8], cheer: [70, 8, 10] } },
    cake: { src: 'cake.png', w: 44, h: 32, fw: 44, fh: 32, cols: 1, ax: 22, ay: 31, anims: { idle: [0, 1, 1] } },
    candle: { src: 'candle.png', w: 120, h: 44, fw: 40, fh: 44, cols: 3, ax: 20, ay: 43, anims: { idle: [0, 3, 5] } },
    apple: { src: 'apple.png', w: 32, h: 31, fw: 32, fh: 31, cols: 1, ax: 16, ay: 30, anims: { idle: [0, 1, 1] } },
    puff: { src: 'smoke_puff.png', w: 768, h: 128, fw: 128, fh: 128, cols: 6, ax: 64, ay: 64, scale: .5, anims: { idle: [0, 6, 14] } },
    sparkle: { src: 'summon_sparkle.png', w: 1024, h: 128, fw: 128, fh: 128, cols: 8, ax: 64, ay: 64, anims: { idle: [0, 8, 14] } },
  };
  let now = performance.now();
  const all = new Set();
  class Spr {
    constructor(key, cls = 'play-spr') {
      const s = this.s = SHEETS[key], k = s.scale || 1, el = this.el = document.createElement('div');
      el.className = cls;
      el.style.width = s.fw * k + 'px'; el.style.height = s.fh * k + 'px';
      el.style.backgroundImage = `url(${A}${s.src})`; el.style.backgroundSize = `${s.w * k}px ${s.h * k}px`;
      layer.appendChild(el);
      this.x = 0; this.y = 0; this.face = 1; this.rot = 0; this.z = 1; this.play('idle'); all.add(this);
    }
    play(name, once = false) { if (this.anim === name && !once && !this.once) return; this.anim = name; this.t0 = now; this.once = once; this.ended = false; }
    draw() {
      const s = this.s, k = s.scale || 1, [f0, n, fps] = s.anims[this.anim];
      let i = Math.floor((now - this.t0) / 1000 * fps);
      if (this.once) { if (i >= n) { i = n - 1; this.ended = true; } } else i %= n;
      const f = f0 + i, el = this.el;
      el.style.backgroundPosition = `${-(f % s.cols) * s.fw * k}px ${-Math.floor(f / s.cols) * s.fh * k}px`;
      const r = this.rot ? ` rotate(${this.rot.toFixed(1)}deg)` : '';
      el.style.transformOrigin = this.rot ? `${s.ax * k}px ${8 * k}px` : `${s.ax * k}px ${s.ay * k}px`;
      el.style.transform = `translate(${Math.round(this.x - s.ax * k)}px, ${Math.round(this.y - s.ay * k)}px)${r} scaleX(${this.face})`;
      el.style.zIndex = this.z;
    }
    remove() { this.el.remove(); all.delete(this); }
  }
  const fx = (key, x, y) => { const f = new Spr(key, 'play-fx'); f.x = x; f.y = y; f.z = 4; f.play('idle', true); f.fx = true; return f; };

  // ---------- the lines of the page that things can stand on ----------
  let surfs = [], W = 0, H = 0;
  const mrect = () => main.getBoundingClientRect();
  const cv = document.createElement('canvas').getContext('2d');
  const textTop = el => {     // a heading: the top of each letter, so Paul steps up onto the tall ones
    const m = mrect(), cs = getComputedStyle(el), node = [...el.childNodes].find(n => n.nodeType === 3 && n.nodeValue.trim());
    const r = document.createRange(); r.selectNodeContents(el); const t = r.getBoundingClientRect();
    cv.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    const fm = cv.measureText('Hxg'), base = t.top - m.top + (t.height - (fm.fontBoundingBoxAscent + fm.fontBoundingBoxDescent)) / 2 + fm.fontBoundingBoxAscent;
    const prof = [];
    if (node) for (let i = 0; i < node.nodeValue.length; i++) {
      const ch = node.nodeValue[i]; if (!ch.trim()) continue;
      const cr = document.createRange(); cr.setStart(node, i); cr.setEnd(node, i + 1); const b = cr.getBoundingClientRect();
      const gm = cv.measureText(ch); prof.push([b.left - m.left, b.right - m.left, base - gm.actualBoundingBoxAscent]);
    }
    const ys = prof.map(p => p[2]);
    return { x1: t.left - m.left + 4, x2: t.right - m.left - 4, y: ys.length ? Math.min(...ys) : base - 20, prof, el };
  };
  const measure = () => {
    const m = mrect(); W = main.clientWidth; H = main.scrollHeight;
    const S = [], add = (x1, x2, y, el, kind) => { if (x2 - x1 > 40) S.push({ x1, x2, y: Math.round(y), el, kind }); };
    const box = el => { const r = el.getBoundingClientRect(); return { l: r.left - m.left, r: r.right - m.left, t: r.top - m.top, b: r.bottom - m.top }; };
    const h1 = document.querySelector('.post-head h1'); if (h1) { const t = textTop(h1); add(t.x1, t.x2, t.y, h1, 'title'); S[S.length - 1].prof = t.prof; }
    for (const el of document.querySelectorAll('.product > *')) { const b = box(el); add(b.l, b.r, b.t, el, 'rule'); }
    for (const el of document.querySelectorAll('.product h2')) { const t = textTop(el); add(t.x1, t.x2, t.y, el, 'title'); if (S.length && S[S.length - 1].el === el) S[S.length - 1].prof = t.prof; }
    const feats = document.querySelector('.feats');
    if (feats) { const b = box(feats); add(b.l, b.r, b.t, feats, 'line'); for (const li of feats.children) { const c = box(li); add(c.l, c.r, c.b - 1, li, 'line'); } }
    for (const el of document.querySelectorAll('.shots img, .tl .player, .product .btn')) { const b = box(el); if (b.b > b.t) add(b.l, b.r, b.t, el, 'top'); }
    add(0, W, H - 2, main, 'floor');
    surfs = S;
  };
  const yAt = (s, x) => {               // the height of a surface at x (a heading follows its letters)
    if (!s.prof || !s.prof.length) return s.y;
    let y = null; for (const [a, b, t] of s.prof) if (x >= a - 2 && x <= b + 2) y = y == null ? t : Math.min(y, t);
    if (y != null) return Math.round(y);
    let best = s.prof[0], d = 1e9; for (const p of s.prof) { const dd = Math.min(Math.abs(x - p[0]), Math.abs(x - p[1])); if (dd < d) { d = dd; best = p; } } return Math.round(best[2]);
  };
  const surfAt = (x, yFrom, yTo) => {  // the first surface crossed going down from yFrom to yTo at x
    let best = null, by = 0;
    for (const s of surfs) { if (x < s.x1 || x > s.x2) continue; const y = yAt(s, x); if (y >= yFrom && y <= yTo && (!best || y < by)) { best = s; by = y; } }
    return best;
  };
  const surfBelow = (x, y) => surfAt(x, y, 1e9);
  const view = () => { const m = mrect(); return { t: -m.top + 56, b: -m.top + innerHeight }; };

  // ---------- Paul, the bot and the things ----------
  const P = { spr: new Spr('paul'), x: 0, y: 0, vx: 0, vy: 0, state: 'ground', surf: null, mode: 'idle', timer: 1.5, tx: 0, after: null, carry: null, goal: null, quiet: 0 };
  const B = { spr: new Spr('bot'), x: 0, y: 0, state: 'follow', vx: 0, vy: 0, tx: 0, ty: 0 };
  P.spr.z = 3; B.spr.z = 2;
  const things = [];
  const bubble = document.createElement('div'); bubble.className = 'play-bubble'; bubble.setAttribute('aria-live', 'polite'); layer.appendChild(bubble);
  let bubbleT = 0;
  const say = (text, ms = 3200) => { bubble.textContent = text; bubble.classList.add('is-on'); bubbleT = now + ms; };

  const paulAnim = () => {
    if (P.state === 'held') return 'fly';
    if (P.state === 'air' || P.state === 'hop') return P.jumping ? 'jump' : 'air';
    if (P.state === 'lift') return 'fly';
    if (P.mode === 'walk') return P.carry ? 'owalk' : (P.fast ? 'run' : 'walk');
    if (P.mode === 'anim') return P.animName;
    return P.carry ? 'oidle' : 'idle';
  };
  const doAnim = (name, then) => { P.mode = 'anim'; P.animName = name; P.spr.play(name, true); P.after = then || null; };
  const walkTo = (x, then, fast = false) => { const s = P.surf; P.tx = Math.max(s.x1 + 12, Math.min(s.x2 - 12, x)); P.mode = 'walk'; P.after = then || null; P.fast = fast; };
  const idle = (t = 1 + Math.random() * 2.5) => { P.mode = 'idle'; P.timer = t; P.after = null; };

  // go to a point on another surface: hop down onto it, or let the bot lift him up
  const travel = (s, x, then) => {
    x = Math.max(s.x1 + 14, Math.min(s.x2 - 14, x));
    if (s === P.surf) { walkTo(x, then, true); return; }
    if (P.carry) dropCarry();
    if (s.y > P.y) {                      // down: a hop that only lands on s
      const v = view(); if (P.y < v.t - 200) P.y = v.t - 120;
      const vy0 = -420, dy = s.y - P.y, t = (-vy0 + Math.sqrt(vy0 * vy0 + 2 * G * dy)) / G;
      P.state = 'hop'; P.hopTo = s; P.vy = vy0; P.vx = (x - P.x) / t; P.jumping = false; P.next = then; P.face = P.vx >= 0 ? 1 : -1;
    } else {                              // up: the bot carries him
      const v = view(); if (P.y > v.b + 200) { P.y = v.b + 120; B.y = P.y - 70; }
      P.state = 'lift'; P.liftTo = s; P.liftX = x; P.next = then; B.state = 'lift'; say('I can lift you!', 1800);
    }
  };

  const land = (s, vy) => {
    P.state = 'ground'; P.surf = s; P.y = yAt(s, P.x); P.vx = 0; P.vy = 0; P.spr.rot = 0; P.jumping = false;
    if (vy > 700) { fx('puff', P.x, P.y - 10); }
    if (P.next) { const n = P.next; P.next = null; idle(.15); P.after = n; P.timer = .15; return; }
    if (vy > 1300) { doAnim('land', () => { say(['Wheee!', 'Again!', 'That was high.'][Math.floor(Math.random() * 3)]); doAnim('cheer', () => idle()); }); }
    else doAnim('land', () => idle(.8));
  };

  // ---------- things that words make ----------
  const mkThing = (key, x, y) => {
    if (things.length >= 6) { const old = things.shift(); if (P.carry === old) P.carry = null; fx('puff', old.x, old.y - 10); old.spr.remove(); }
    const t = { key, spr: new Spr(key), x, y, vx: (Math.random() - .5) * 60, vy: -260, state: 'air', surf: null };
    t.spr.z = 2; things.push(t); grabbable(t.spr.el, t, 'thing'); return t;
  };
  const dropCarry = () => { const t = P.carry; if (!t) return; P.carry = null; t.state = 'air'; t.vx = P.face * 80; t.vy = -150; t.spr.z = 2; };

  // ---------- the brain ----------
  const decide = () => {
    if (P.after) { const a = P.after; P.after = null; a(); return; }
    if (reduced()) { idle(5); return; }
    const s = P.surf;
    const near = things.find(t => t.state === 'ground' && t.surf === s && !P.carry && Math.abs(t.x - P.x) < 260);
    const r = Math.random();
    if (near && r < .7) { walkTo(near.x - Math.sign(near.x - P.x || 1) * 12, () => pickUp(near)); return; }
    if (P.carry && r < .25) { doAnim('drop', () => { const t = P.carry; P.carry = null; t.state = 'ground'; t.surf = s; t.x = P.x + P.face * 22; t.y = s.y; t.spr.z = 2; idle(1.5); }); return; }
    if (r < .62) { walkTo(s.x1 + 20 + Math.random() * (s.x2 - s.x1 - 40)); return; }
    if (r < .72 && !P.carry) { doAnim('cast', () => { fx('sparkle', P.x + P.face * 30, P.y - 40); idle(1.2); }); return; }
    if (r < .8 && !P.carry) { doAnim('channel', () => idle(.6)); return; }
    idle(1.5 + Math.random() * 3);
  };
  const pickUp = t => {
    if (t.state !== 'ground' || P.carry) { idle(); return; }
    P.face = t.x >= P.x ? 1 : -1;
    doAnim('pickup', () => { if (t.state === 'ground') { P.carry = t; t.state = 'carried'; t.spr.z = 4; } doAnim('cheer', () => idle(1)); });
  };

  // ---------- pointer: pick up Paul, the bot and the things ----------
  let held = null;
  function grabbable(el, obj, kind) {
    el.addEventListener('pointerdown', e => {
      if (held) return; e.preventDefault(); el.setPointerCapture(e.pointerId);
      const m = mrect(), px = e.clientX - m.left, py = e.clientY - m.top;
      held = { obj, kind, el, dx: obj.x - px, dy: obj.y - py, x0: px, y0: py, t0: now, moved: false, hist: [[now, px, py]] };
    });
    el.addEventListener('pointermove', e => {
      if (!held || held.el !== el) return;
      const m = mrect(), px = e.clientX - m.left, py = e.clientY - m.top;
      held.hist.push([now, px, py]); if (held.hist.length > 6) held.hist.shift();
      if (!held.moved && Math.hypot(px - held.x0, py - held.y0) > 5) { held.moved = true; startHold(held); }
      if (held.moved) { held.tx = px + held.dx; held.ty = py + held.dy; }
    });
    const up = () => {
      if (!held || held.el !== el) return;
      const h = held; held = null; el.classList.remove('is-held');
      if (!h.moved) { tap(h); return; }
      const a = h.hist[0], b = h.hist[h.hist.length - 1], dt = Math.max(16, b[0] - a[0]) / 1000;
      let vx = (b[1] - a[1]) / dt, vy = (b[2] - a[2]) / dt; const sp = Math.hypot(vx, vy); if (sp > 1800) { vx *= 1800 / sp; vy *= 1800 / sp; }
      release(h, vx, vy);
    };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  const startHold = h => {
    h.el.classList.add('is-held'); h.tx = h.obj.x; h.ty = h.obj.y;
    if (h.kind === 'paul') { if (P.carry) dropCarry(); P.goal = null; P.next = null; P.after = null; P.state = 'held'; P.quiet = 0;
      if (!P.wasHeld) { P.wasHeld = true; setTimeout(() => say('Careful with Paul!', 2200), 300); } }
    if (h.kind === 'bot') { B.state = 'held'; say('Hey!', 1200); }
    if (h.kind === 'thing') { if (P.carry === h.obj) P.carry = null; h.obj.state = 'held'; h.obj.spr.z = 4; }
  };
  const release = (h, vx, vy) => {
    if (h.kind === 'paul') { P.state = 'air'; P.vx = vx; P.vy = vy; P.jumping = false; }
    if (h.kind === 'bot') { B.state = 'follow'; B.vx = vx; B.vy = vy; setTimeout(() => say('Back to Paul.', 1600), 400); }
    if (h.kind === 'thing') { h.obj.state = 'air'; h.obj.vx = vx; h.obj.vy = vy; h.obj.spr.z = 2; }
  };
  const tap = h => {
    if (h.kind === 'paul' && P.state === 'ground') { P.goal = null; P.after = null; P.state = 'air'; P.vy = -560; P.vx = 0; P.jumping = true; P.spr.play('jump', true); }
    if (h.kind === 'bot') { B.spr.play('wave', true); say(['Hello!', 'I am the Schwebe-Bot.', 'Tap a dotted word.'][Math.floor(Math.random() * 3)]); }
    if (h.kind === 'thing' && h.obj.state === 'ground') { h.obj.state = 'air'; h.obj.vy = -380; h.obj.vx = (Math.random() - .5) * 120; }
  };
  grabbable(P.spr.el, P, 'paul'); grabbable(B.spr.el, B, 'bot');
  P.spr.el.setAttribute('role', 'img'); P.spr.el.setAttribute('aria-label', 'Paul, the hero of Wortzauber. Drag to pick him up.');
  B.spr.el.setAttribute('role', 'img'); B.spr.el.setAttribute('aria-label', 'The Schwebe-Bot');

  // ---------- dotted words: write, trace, appear ----------
  const WORDS = { cake: ['cake', 'Kuchen'], candle: ['candle', 'Kerze'], candles: ['candle', 'Kerze'], apples: ['apple', 'Apfel'], apple: ['apple', 'Apfel'] };
  const re = /\b(cake|candles?|apples?)\b/g;
  for (const root of document.querySelectorAll('.product__about .prose p, .feats span')) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (const n of nodes) {
      const txt = n.nodeValue; if (!re.test(txt)) continue; re.lastIndex = 0;
      const frag = document.createDocumentFragment(); let last = 0, m;
      while ((m = re.exec(txt))) {
        frag.append(txt.slice(last, m.index));
        const w = document.createElement('span'); w.className = 'mw'; w.textContent = m[1]; w.tabIndex = 0; w.setAttribute('role', 'button');
        w.dataset.k = m[1]; w.setAttribute('aria-label', `${m[1]}: Paul makes it appear`); frag.append(w); last = m.index + m[1].length;
      }
      frag.append(txt.slice(last)); n.replaceWith(frag);
    }
  }
  const magic = w => {
    if (w.classList.contains('is-tracing')) return;
    const [key, de] = WORDS[w.dataset.k];
    w.classList.remove('is-traced'); void w.offsetWidth; w.classList.add('is-tracing');
    setTimeout(() => { w.classList.add('is-traced'); }, 900);
    setTimeout(() => w.classList.remove('is-tracing', 'is-traced'), 2600);
    measure();
    const m = mrect(), r = w.getBoundingClientRect(), wx = (r.left + r.right) / 2 - m.left, wy = r.top - m.top;
    const s = surfBelow(wx, r.bottom - m.top + 2);
    say(`${de} · ${key}`, 2600);
    let done = false;
    const appear = () => { if (done) return; done = true; fx('sparkle', wx, wy + 8); setTimeout(() => mkThing(key, wx, wy + 14), 180); };
    if (P.state === 'ground' && s && !reduced()) {
      const side = P.x < wx ? -1 : 1;
      P.goal = 'word';
      travel(s, wx + side * 46, () => {
        P.goal = null; P.face = wx >= P.x ? 1 : -1;
        doAnim('cast', () => { appear(); doAnim('cheer', () => idle(.8)); });
        setTimeout(appear, 2600);
      });
      setTimeout(appear, 5200);      // he could not get there: the thing appears anyway
    } else setTimeout(appear, 700);
  };
  document.querySelectorAll('.mw').forEach(w => {
    w.addEventListener('click', () => magic(w));
    w.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); magic(w); } });
  });

  // ---------- the loop ----------
  const fall = (o, dt, only) => {     // gravity and landing; returns the surface it landed on
    const y0 = o.y; o.vy += G * dt; o.y += o.vy * dt; o.x += o.vx * dt; o.vx *= Math.pow(.6, dt);
    if (o.x < 8) { o.x = 8; o.vx = Math.abs(o.vx) * .5; } if (o.x > W - 8) { o.x = W - 8; o.vx = -Math.abs(o.vx) * .5; }
    if (o.vy > 0) {
      const oy = only ? yAt(only, o.x) : 0, s = only ? (oy >= y0 && oy <= o.y && o.x >= only.x1 - 30 && o.x <= only.x2 + 30 ? only : null) : surfAt(o.x, y0, o.y);
      if (s) { o.x = Math.max(s.x1 + 4, Math.min(s.x2 - 4, o.x)); o.y = yAt(s, o.x); return s; }
    }
    if (o.y > H) { o.y = H - 2; return surfs[surfs.length - 1]; }
    return null;
  };
  let pointer = null;
  addEventListener('pointermove', e => { const m = mrect(); pointer = { x: e.clientX - m.left, y: e.clientY - m.top, t: now }; }, { passive: true });
  let offT = 0;

  let last = performance.now();
  const tick = t => {
    now = t; const dt = Math.min(.05, (t - last) / 1000); last = t;
    // Paul
    if (P.state === 'held' && held) {
      const px = P.x; P.x += (held.tx - P.x) * Math.min(1, dt * 18); P.y += (held.ty - P.y) * Math.min(1, dt * 18);
      const vx = (P.x - px) / dt; P.spr.rot += (Math.max(-28, Math.min(28, -vx * .05)) - P.spr.rot) * Math.min(1, dt * 8);
      if (Math.abs(vx) > 30) P.face = vx > 0 ? 1 : -1;
    } else if (P.state === 'air') {
      P.spr.rot *= .9; const vy = P.vy; const s = fall(P, dt); if (s) land(s, vy);
    } else if (P.state === 'hop') {
      const vy = P.vy; const s = fall(P, dt, P.hopTo); if (s) land(s, Math.min(vy, 600));
    } else if (P.state === 'lift') {
      const tx = P.liftX, ty = yAt(P.liftTo, P.liftX);
      if (Math.hypot(B.x - P.x, B.y - (P.y - 66)) > 12 && !P.lifting) { /* the bot comes first */ }
      else { P.lifting = true; P.x += (tx - P.x) * Math.min(1, dt * 1.6); P.y += (ty - 12 - P.y) * Math.min(1, dt * 1.6);
        if (Math.abs(P.x - tx) < 3 && Math.abs(P.y - (yAt(P.liftTo, tx) - 12)) < 3) { P.lifting = false; P.state = 'air'; P.vx = 0; P.vy = 0; B.state = 'follow'; P.next = P.next || null; } }
    } else if (P.state === 'ground') {
      if (P.mode === 'walk') {
        const sp = P.fast ? 110 : 46, d = P.tx - P.x; P.face = d >= 0 ? 1 : -1;
        if (Math.abs(d) <= sp * dt) { P.x = P.tx; P.mode = 'idle'; P.timer = .1; } else P.x += Math.sign(d) * sp * dt;
      } else if (P.mode === 'anim') { if (P.spr.ended) { P.mode = 'idle'; P.timer = 0; if (!P.after) P.timer = .4; } }
      else { P.timer -= dt; if (pointer && now - pointer.t < 1500 && Math.abs(pointer.x - P.x) < 220 && Math.abs(pointer.y - P.y) < 160) P.face = pointer.x >= P.x ? 1 : -1;
        if (P.timer <= 0) decide(); }
      // a line that moved (resize, a picture that loaded)
      if (P.surf) { const gy = yAt(P.surf, P.x), d = gy - P.y;   // step up onto tall letters with a little hop, down with a drop
        if (Math.abs(d) > 1) P.y += d * Math.min(1, dt * (d < 0 ? 16 : 22)); else P.y = gy; }
    }
    const pa = paulAnim(); if (P.mode !== 'anim' || P.state !== 'ground') P.spr.play(pa); P.spr.x = P.x; P.spr.y = P.y; P.spr.face = P.face;
    if (P.carry) { const c = P.carry; c.x = P.x + P.face * 2; c.y = P.y - 70; }

    // the bot
    const bob = 4 * Math.sin(now / 430);
    if (B.state === 'held' && held) { B.x += (held.tx - B.x) * Math.min(1, dt * 18); B.y += (held.ty - B.y) * Math.min(1, dt * 18); B.spr.play('wave'); }
    else {
      let tx, ty, k = 3;
      if (B.state === 'lift') { tx = P.x; ty = P.y - 66; k = P.lifting ? 30 : 5; }
      else if (P.state === 'held') { tx = P.x - 60 * P.face; ty = P.y - 40; k = 4; }
      else { tx = P.x - 48 * P.face; ty = P.y - 74 + bob; }
      if (B.vx || B.vy) { B.x += B.vx * dt; B.y += B.vy * dt; B.vx *= Math.pow(.02, dt); B.vy *= Math.pow(.02, dt); if (Math.hypot(B.vx, B.vy) < 20) B.vx = B.vy = 0; }
      const dx = tx - B.x, dy = ty - B.y; B.x += dx * Math.min(1, dt * k); B.y += dy * Math.min(1, dt * k);
      if (!B.spr.once || B.spr.ended) B.spr.play(B.state === 'lift' ? 'carry' : (Math.hypot(dx, dy) > 14 ? 'move' : 'idle'));
      if (Math.abs(dx) > 6) B.spr.face = dx > 0 ? 1 : -1; else if (B.state !== 'lift') B.spr.face = P.face;
    }
    B.spr.x = B.x; B.spr.y = B.y;
    { const bw = bubble.offsetWidth, bh = bubble.offsetHeight, vt = view().t; let by = B.y - 52 - bh, bx = B.x - bw / 2;
      if (by < Math.max(4, vt + 4)) { by = B.y - 40; bx = B.spr.face > 0 ? B.x + 26 : B.x - 26 - bw; bubble.classList.add('is-side'); } else bubble.classList.remove('is-side');
      bubble.style.transform = `translate(${Math.round(Math.max(8, Math.min(W - bw - 8, bx)))}px, ${Math.round(by)}px)`; }
    if (bubbleT && now > bubbleT) { bubble.classList.remove('is-on'); bubbleT = 0; }

    // things
    for (const o of things) {
      if (o.state === 'held' && held && held.obj === o) { o.x += (held.tx - o.x) * Math.min(1, dt * 18); o.y += (held.ty - o.y) * Math.min(1, dt * 18); }
      else if (o.state === 'air') {
        const vy = o.vy, s = fall(o, dt);
        // Paul catches a thing that flies at him
        if (!P.carry && P.state === 'ground' && Math.abs(o.x - P.x) < 26 && o.y > P.y - 90 && o.y < P.y - 40 && vy > -200) {
          P.carry = o; o.state = 'carried'; o.spr.z = 4; P.after = null; doAnim('cheer', () => idle(1)); say('Got it!', 1400);
        } else if (s) { if (vy > 500) { o.vy = -vy * .3; o.vx *= .6; } else { o.state = 'ground'; o.surf = s; o.y = s.y; o.vx = 0; o.vy = 0; } }
      } else if (o.state === 'ground' && o.surf) o.y = yAt(o.surf, o.x);
      o.spr.x = o.x; o.spr.y = o.y;
    }

    // follow the reader: off screen for a while, he comes along
    if (!held && P.state === 'ground' && !P.goal && !reduced()) {
      const v = view(), off = P.y < v.t - 10 ? 'up' : P.y > v.b + 30 ? 'down' : null;
      if (off) { offT += dt; if (offT > 1.4) { offT = 0;
        const cands = surfs.filter(s => s.y > v.t + 130 && s.y < v.b - 50 && s.kind !== 'floor');
        if (cands.length) { const s = off === 'up' ? cands.reduce((a, b) => (a.y < b.y ? a : b)) : cands.reduce((a, b) => (a.y > b.y ? a : b));
          P.goal = 'follow'; travel(s, Math.max(s.x1 + 40, Math.min(s.x2 - 40, P.x)), () => { P.goal = null; idle(.6); }); } } }
      else offT = 0;
    }

    for (const s of all) { s.draw(); if (s.fx && s.ended) s.remove(); }
    requestAnimationFrame(tick);
  };

  // ---------- start ----------
  const start = () => {
    measure();
    const t = surfs.find(s => s.kind === 'title') || surfs[0];
    P.surf = t; P.x = t.x2 - 30; P.y = t.y; P.face = -1;
    B.x = P.x + 60; B.y = P.y - 80;
    const head = document.querySelector('.post-head');
    const hint = document.createElement('p'); hint.className = 'label play-hint';
    hint.textContent = 'Paul lives on this page. Pick him up, or tap a dotted word.'; head.appendChild(hint);
    measure(); P.surf = (W < 700 ? surfs.find(s => s.kind === 'rule') : surfs.find(s => s.kind === 'title')) || surfs[0]; P.x = W < 700 ? W * .7 : P.surf.x2 - 30; P.y = yAt(P.surf, P.x);
    B.x = P.x + 50; B.y = P.y - 80;
    setTimeout(() => say('Hello! You can pick Paul up.', 3400), 1400);
    setTimeout(() => { if (!P.wasHeld) say('Or tap a dotted word.', 3000); }, 9000);
    requestAnimationFrame(tick);
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { const old = P.surf; measure(); P.surf = surfs.find(s => s.el === old.el && s.kind === old.kind) || surfBelow(P.x, P.y - 200) || surfs[0];
      P.x = Math.max(P.surf.x1 + 10, Math.min(P.surf.x2 - 10, P.x)); P.y = yAt(P.surf, P.x);
      for (const o of things) if (o.surf) { o.state = 'air'; o.y -= 20; } }, 200); });
    setInterval(() => { const old = P.surf; measure(); if (old) { const n = surfs.find(s => s.el === old.el && s.kind === old.kind); if (n) P.surf = n; }
      for (const o of things) if (o.surf) { const n = surfs.find(s => s.el === o.surf.el && s.kind === o.surf.kind); if (n) o.surf = n; } }, 1500);
  };
  const go = () => (document.fonts ? document.fonts.ready : Promise.resolve()).then(start);
  if (document.readyState === 'complete') go(); else addEventListener('load', go);
})();
