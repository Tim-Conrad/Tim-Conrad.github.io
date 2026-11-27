// The development timeline of Wortzauber: one stage per merged pull request that changed play, filmed in real time by
// scripts/reels/timeline-wz.mjs at `ref` (the merge commit).
//   scene: the name of a layout-check scene of the game (.claude/skills/checking-device-layouts/scenes/<name>.js),
//          read from the worktree at `ref`, so it is that version's own scene
//   setup: an async function (source) run in the page instead of a scene
//   act:   an async function run after the setup, inside the clip (the throw, the answer, the other child)
//          In the page, `await __trace()` traces the word on the trace page and `await __tap(x, y)` taps, both with the real
//          pointer and a finger dot (scripts/reels/wz-helpers.mjs).
//   hold:  ms to keep filming after the setup (and act)
//   from:  'start' (default: the clip begins 2 s before the end of the setup) or 'setup' (from the start of the setup)
//   max:   the longest clip in seconds; a longer span is sped up to fit
//   soft:  go on when the scene's last check times out (the picture is right, the check waits for more)
// The text of each stage lives in projects/wortzauber/index.html.
const wait = ms => `await new Promise(r => setTimeout(r, ${ms}));`;
const quest = `document.getElementById('dialBtn').click(); await WZ.until(() => document.getElementById('dQuest').offsetParent, 2000, 'dial');
  document.getElementById('dQuest').click(); await WZ.until(() => Quest.active, 20000, 'quest start');`;
// in the mouse hole wall with a candle in the hands, past the beetle (as the wall scene of the game does it)
const wallCandle = `async () => { ${quest} WZ.enterWall(); await WZ.until(() => Wall.active && Wall.state() && !Wall.busy, 20000, 'wall');
  WZ.useWord('Kerze'); await WZ.until(() => Wall.state().light === 'small', 5000, 'light'); Wall.teleport(0, 420); ${wait(1200)} }`;
const throwCandle = `async () => { Wall.throwTo(Wall.state().x + 200); ${wait(2500)} }`;
// the writing box of the word panel (free writing, from PR #54)
const handBox = `async () => { await Sprites.ready; const $ = id => document.getElementById(id);
  $('bWrite').click(); await WZ.until(() => WZ.st.view === 'viewFree', 3000, 'word panel');
  $('bPen').click(); await WZ.until(() => WZ.st.view === 'viewHand' && $('handPad').getBoundingClientRect().width > 0, 3000, 'writing box'); ${wait(800)} }`;
// writes a word with the pen, stroke by stroke at a hand's pace (the pointer events of the game's free-writing scene).
// whole: the letters one after the other without a pause (PR #58); else each letter waits until the game read it.
const write = (word, whole) => `async () => { const pad = document.getElementById('handPad'), sl = ms => new Promise(r => setTimeout(r, ms));
  const pen = async (ch, x0) => { const rect = pad.getBoundingClientRect(), k = pad.width / rect.width, U = pad.height * .84 / 3, oy = pad.height * .08;
    const c = ([x, y]) => ({ clientX: rect.left + (x + x0) * U / k, clientY: rect.top + (y * U + oy) / k, pointerId: 1, pointerType: 'touch', bubbles: true });
    for (const st of GLYPHS[ch].strokes) { const e = (t, q) => pad.dispatchEvent(new PointerEvent(t, c(q)));
      e('pointerdown', st[0]); for (const q of st.slice(1)) { e('pointermove', q); await sl(16); } e('pointerup', st[st.length - 1]); await sl(140); } };
  ${whole ? `let x = 0.6; for (const ch of '${word}') { await pen(ch, x); x += GLYPHS[ch].w + 0.35; }`
    : `for (const ch of '${word}') { const n = WZ.hand.state().boxes; await pen(ch, 1.5); await WZ.until(() => WZ.hand.state().boxes === n + 1, 5000, 'letter ' + ch); }`}
  await sl(1600); WZ.hand.done(); await sl(2500); }`;
// the other child in play together (a loopback link), as the together-* scenes of the game set it up
const together = `Together.openCard(); document.querySelector('#togetherCard [data-hero="pfannen_pia"]').click(); Together.closeCard();
  window.__rm = Together.testLink(); Together.closeCard(); __rm.send('hello', { name: 'Tom', hero: 'pfannen_paul' });`;
const castleIn = `WZ.levels.cake = true; WZ.levels.wall = true; WZ.enterCastle();
  await WZ.until(() => Castle.active && Castle.state().x > 60 && !Castle.busy, 90000, 'castle'); Castle.teleport(0, 200, 1); ${wait(2400)}`;   // the clip starts 2 s before the act: after the teleport
// Tom walks from x0 to x1 in ms (pos messages, as the network sends them)
const tomWalk = (place, x0, x1, ms, extra = '') => `{ const n = Math.round(${ms} / 100); for (let i = 0; i <= n; i++) {
    __rm.send('pos', { place: '${place}', x: ${x0} + (${x1} - ${x0}) * i / n, floor: 0, face: ${x1} > ${x0} ? 1 : -1, walk: i < n${extra} }); await new Promise(r => setTimeout(r, 100)); } }`;
// in the page: tap an element with the real pointer
const tapEl = `const tapEl = async el => { const b = el.getBoundingClientRect(); await __tap(b.x + b.width / 2, b.y + b.height / 2); };`;
// a riddle near the hero: open the digit pad, tap the answer, trace it (PR #50 on)
const answer = `async () => { ${tapEl} const sl = ms => new Promise(r => setTimeout(r, ms));
  await tapEl(document.getElementById('bWrite')); await WZ.until(() => WZ.st.view === 'viewMath' && WZ.power() && WZ.power().ex, 8000, 'pad'); await sl(1200);
  for (const ch of String(WZ.power().ex.result)) { WZ.mathPress(ch); await sl(500); } WZ.mathPress('ok');
  await WZ.until(() => WZ.st.view === 'viewTrace', 8000, 'trace'); await __trace(); await sl(3500); }`;
// in the castle, past the first riddle of the floor, the hero at x
const castleAt = x => `async () => { WZ.levels.cake = true; WZ.levels.wall = true; WZ.enterCastle();
  await WZ.until(() => window.Castle && Castle.active && Castle.state() && Castle.state().x > 60 && !Castle.busy, 60000, 'castle');
  Castle.cheat('floor', 1); await WZ.until(() => !Castle.busy, 10000, 'cheat'); Castle.teleport(0, ${x}, 1); ${wait(2400)} }`;   // the clip starts 2 s before the act: after the teleport
const jump = (name, ms = 2500) => `async () => { WZ.jump('${name}'); ${wait(ms)} }`;

export const STAGES = [
  { id: 'start', ref: 'f870755^1', setup: `async () => { ${wait(1200)} }`, max: 12,
    act: `async () => { ${tapEl} const $ = id => document.getElementById(id), sl = ms => new Promise(r => setTimeout(r, ms));
      await tapEl($('bWrite')); await sl(900); if (!$('keys').offsetParent) { await tapEl($('bKbd')); await sl(600); }
      for (const ch of 'apfel') { await tapEl(document.querySelector('#keys [data-key="' + ch + '"]')); await sl(250); }
      await tapEl(document.querySelector('#goSlot [data-key="go"]'));
      for (let i = 0; i < 80 && WZ.st.view !== 'viewTrace'; i++) await sl(100); await __trace(); await sl(3000); }`, hold: 600 },
  // #8: thrown things land on targets; a light thrown in the wall
  { id: 'pr8', ref: '0a0426c', setup: wallCandle, act: throwCandle, hold: 1500 },
  // #10: the jump with the double tap: the bot shows it at the first gap of the wall
  { id: 'pr10', ref: 'daf1d68', scene: 'wall', act: `async () => { Wall.jump(); ${wait(1400)} Wall.walkTo(Wall.state().x + 260); ${wait(2200)} Wall.jump(); ${wait(1200)} }`, hold: 800 },
  // #11: the Schwebe-Bot follows the hero on the street
  { id: 'pr11', ref: 'f33d2e9', scene: 'street', act: `async () => { Scene.walkTo(innerWidth * 0.78); ${wait(3200)} Scene.walkTo(innerWidth * 0.35); ${wait(3000)} }`, hold: 600 },
  // #18: the same throw with the new throw and hold-light animations of Paul and Pia
  { id: 'pr18', ref: 'cbd6369', setup: wallCandle, act: throwCandle, hold: 1500 },
  // #31: the simple list menu
  { id: 'pr31', ref: 'a5244b5', setup: `async () => { ${wait(1500)} }`,
    act: `async () => { const b = document.getElementById('dialBtn').getBoundingClientRect(); await __tap(b.x + b.width / 2, b.y + b.height / 2); ${wait(1500)}
      const e = document.getElementById('dLangEn').getBoundingClientRect(); await __tap(e.x + e.width / 2, e.y + e.height / 2); ${wait(900)}
      await __tap(b.x + b.width / 2, b.y + b.height / 2); ${wait(2200)} }`, hold: 600 },   // the choice closes the menu: open it again in English
  // #32: the castle level
  { id: 'pr32', ref: 'ad915dc', setup: castleAt(640), act: `async () => { Castle.walkTo(830); ${wait(2600)} WZ.useWord('Korb'); ${wait(3200)} }`, hold: 600 },
  // #38: the gate of the Thronsaal
  { id: 'pr38', ref: '7fbae22', setup: `async () => { WZ.jump('castleDoor'); ${wait(2500)} Castle.teleport(0, 2600, 1); ${wait(2400)} }`,
    act: `async () => { Castle.walkTo(3020); ${wait(4000)} }`, hold: 800 },
  // #39: the castle finale brings the verb ziehen: it pulls the nearest loose thing (a summoned apple) to the hero.
  // The castle page teaches the verb, so the stage marks it as learned (WZ.levels.pull).
  { id: 'pr39', ref: '641e1ff', setup: `async () => { WZ.levels.pull = true; WZ.useWord('Apfel'); ${wait(2500)} Scene.walkTo(innerWidth * 0.38); ${wait(3000)} }`,   // near enough to the apple (30-320 art px) for ziehen
    act: `async () => { WZ.useWord('ziehen'); ${wait(2500)} }`, hold: 800 },
  // #41: the map
  { id: 'pr41', ref: 'fd951d0', setup: jump('map', 1500), act: `async () => { const b = WorldMap.where().bakery; await __tap(b[0], b[1]); ${wait(4500)} }`, hold: 600 },
  // #43: math for mana: a big spell asks for a sum first, the answer on the digit pad, then traced
  { id: 'pr43', ref: '23e7fbf', setup: `async () => { WZ.math.set({ on: true, ops: ['+'], max: 10 }); ${wait(800)} WZ.useWord('Elefant');
      await WZ.until(() => WZ.st.view === 'viewMath' && WZ.power(), 8000, 'math'); ${wait(1200)} }`,
    act: `async () => { const ex = WZ.power().ex; for (const ch of String(ex.result)) { WZ.mathPress(ch); ${wait(500)} } WZ.mathPress('ok'); ${wait(1500)} }`, hold: 2500 },
  // #44: play together: the card with link and QR code, then the other child (Tom) on the meadow and its apple
  { id: 'pr44', ref: '33abac6', from: 'setup', max: 10,
    setup: `async () => { WZ.math.set({ on: false }); const $ = id => document.getElementById(id);
      $('dialBtn').click(); await WZ.until(() => $('dTogether').getClientRects().length, 2000, 'menu'); $('dTogether').click();
      await WZ.until(() => $('togetherCard').getClientRects().length, 2000, 'card');
      $('tName').value = 'Lena'; $('tName').dispatchEvent(new Event('input')); document.querySelector('#togetherCard [data-hero="pfannen_pia"]').click();
      window.__rm = Together.testLink(); ${wait(2500)} }`,
    act: `async () => { document.getElementById('tClose').click(); Scene.goPlace('meadow'); await WZ.until(() => Scene.place === 'meadow', 3000, 'meadow');
      __rm.send('hello', { name: 'Tom', hero: 'pfannen_paul' }); __rm.send('pos', { place: 'meadow', x: 300, face: -1, walk: false }); ${wait(1500)}
      __rm.send('summon', { id: 'wz-loopback:1', type: 'apple', word: 'Apfel', place: 'meadow', x: 380 }); ${wait(1500)} }`, hold: 1500 },
  { id: 'pr47', ref: '9838540', setup: `async () => { await Sprites.ready; ${together} ${castleIn} }`,
    act: `async () => { const x = Castle.state().x; ${tomWalk('castle', 'x + 460', 'x + 80', 3500)} ${wait(1200)} }`, hold: 600 },
  { id: 'pr48', ref: '510ce65', setup: `async () => { await Sprites.ready; ${together} WZ.jump('bakery');
      await WZ.until(() => Quest.active && DevState().quest && !Quest.busy, 60000, 'bakery'); ${wait(800)} }`,
    act: `async () => { const x = Hero.state().x; ${tomWalk('bakery', 'x + 420', 'x + 70', 3000)} __rm.send('quest', { warm: true, mouseGone: true }); ${wait(1500)}
      __rm.send('quest', { warm: true, mouseGone: true, inBowl: ['egg'] }); ${wait(2000)} }`, hold: 600 },
  { id: 'pr49', ref: '8d992cc', setup: `async () => { await Sprites.ready; ${together} ${castleIn} }`,
    act: `async () => { const x = Castle.state().x + 90; for (let k = 0; k < 2; k++) for (let i = 0; i <= 14; i++) {
        const u = i / 14; __rm.send('pos', { place: 'castle', x: x + 60 * (k + u), floor: 0, face: 1, walk: false, up: Math.round(150 * 4 * u * (1 - u)), anim: i < 14 ? 'jump' : '', light: 'small' });
        await new Promise(r => setTimeout(r, 70)); } ${wait(1500)} }`, hold: 600 },
  { id: 'pr50', ref: '08c7a71', max: 12, setup: `async () => { await Sprites.ready; WZ.math.set({ on: true, ops: ['+'], max: 5 });
      await (${castleAt(860)})(); WZ.useWord('Korb'); await WZ.until(() => Castle.state().poi.stall[0] && !Castle.busy, 15000, 'apples');
      await WZ.until(() => WZ.riddle(), 15000, 'riddle'); ${wait(1500)} }`, act: answer, hold: 600 },
  { id: 'pr51', ref: '882074b', max: 12, setup: `async () => { await Sprites.ready; WZ.math.set({ on: true, ops: ['+'], max: 5 });
      const q = () => Quest.state, st = (label, pred) => WZ.until(() => q() && pred() && !Quest.busy, 30000, label);
      WZ.jump('bake'); await st('dough ready', () => Quest.active && q().dough === 1);
      Quest.teleport('bowl'); Quest.goSpot('bowl'); await st('dough carried', () => q().bowlAt === 'hero');
      Quest.teleport('oven'); Quest.goSpot('oven'); await st('baked', () => q().baked === 1 && !!Quest.item('bowl'));
      Quest.hands.tapThing(Quest.item('bowl')); await st('cake carried', () => q().bowlAt === 'hero');
      Quest.teleport('bowl'); Quest.goSpot('bowl'); await st('cake on the table', () => q().bowlAt === 'table');
      await WZ.until(() => WZ.riddle(), 15000, 'riddle'); ${wait(1200)} }`, act: answer, hold: 600 },
  { id: 'pr53', ref: '3709193', setup: `async () => { await Sprites.ready; ${together} WZ.jump('meadow'); await WZ.until(() => Scene.place === 'meadow', 5000, 'meadow');
      window.__hx = Scene.artOf(Scene.hero()); ${tomWalk('meadow', '__hx + 300', '__hx + 90', 1500)} ${wait(800)} }`,
    act: `async () => { __rm.send('throw', { place: 'meadow', x0: __hx + 80, x1: __hx + 360, type: 'apple', dur: 1.6, face: 1 }); ${wait(2600)}
      __rm.send('throw', { place: 'meadow', x0: __hx + 80, x1: __hx - 160, type: 'apple', dur: 1.6, face: -1 }); ${wait(2400)} }`, hold: 600 },
  { id: 'pr54', ref: '8bda1a6', setup: handBox, act: write('ei', false), hold: 600, max: 10 },
  { id: 'pr58', ref: '224e07f', setup: handBox, act: write('apfel', true), hold: 600, max: 10 },
  { id: 'pr59', ref: '82d1790', scene: 'map', act: `async () => { ${wait(1500)} const b = WorldMap.where().bakery; await __tap(b[0], b[1]); ${wait(4500)} }`, hold: 600 },
  { id: 'pr60', ref: 'c3216e0', setup: castleAt(700), act: `async () => { Castle.walkTo(1260); ${wait(5000)} }`, hold: 600 },
  { id: 'pr61', ref: '553f5fc', setup: castleAt(680), act: `async () => { Castle.walkTo(1650); ${wait(7000)} }`, hold: 600, max: 9 },   // behind the gate (x 600)
  { id: 'pr62', ref: '1cb6cb6', setup: castleAt(1180), act: `async () => { WZ.useWord('Hammer'); ${wait(2600)} Castle.walkTo(1350); ${wait(2800)} }`, hold: 600 },
  { id: 'pr63', ref: '2e2d52f', setup: castleAt(2560), act: `async () => { Castle.walkTo(2950); ${wait(3800)} }`, hold: 800 },
  { id: 'pr65', ref: 'ad5eaca', setup: handBox, act: write('ei', false), hold: 600, max: 10 },
  // #72: the castle people call for help in their own voices: the merchant at his stall, the bubble points at him
  { id: 'pr72', ref: '579d3c8', setup: `async () => { WZ.enterCastle(); await WZ.until(() => Castle.active && Castle.state() && Castle.state().x > 60 && !Castle.busy, 30000, 'castle');
      Castle.cheat('floor', 1); WZ.lines.length = 0; Castle.teleport(0, 650, 1); ${wait(2400)} }`,   // behind the gate (x 600)
    act: `async () => { Castle.walkTo(780); await WZ.until(() => WZ.lines.some(l => l.by === 'merchant'), 15000, 'merchant'); ${wait(2500)} }`, hold: 600 },
  // #99: a thing that does not help gets an answer: "Hund" at the lookout (the case of the papercuts), as tests/riddle-nohelp.js
  { id: 'pr99', ref: 'ca0d211', setup: `async () => { WZ.math.set({ on: false }); WZ.jump('castle');
      await WZ.until(() => Castle.active && !Castle.busy && Castle.state().x > 60, 30000, 'castle');
      ${wait(1500)} Castle.cheat('floor', 1); Castle.teleport(1, 1790, 1); await WZ.until(() => !Castle.busy && Castle.state().floor === 1 && Math.abs(Castle.state().x - 1790) < 40, 8000, 'at the lookout ' + JSON.stringify([Castle.state().floor, Castle.state().x])); ${wait(2400)} }`,
    act: `async () => { const seen = new Set(WZ.lines); WZ.useWord('Hund');
      await WZ.until(() => WZ.lines.some(l => !seen.has(l) && l.by === 'lookout'), 8000, 'lookout'); ${wait(3000)} }`, hold: 600 },
];
