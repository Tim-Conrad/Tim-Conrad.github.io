// The development timeline of Wortzauber: one stage per merged pull request that changed play, filmed in real time by
// tools/reels/timeline-wz.mjs at `ref` (the merge commit).
//   scene: the name of a layout-check scene of the game (.claude/skills/checking-device-layouts/scenes/<name>.js),
//          read from the worktree at `ref`, so it is that version's own scene
//   setup: an async function (source) run in the page instead of a scene
//   act:   an async function run after the setup, inside the clip (the throw, the answer, the other child)
//   hold:  ms to keep filming after the setup (and act)
//   from:  'start' (default: the clip begins 2 s before the end of the setup) or 'setup' (from the start of the setup)
//   max:   the longest clip in seconds; a longer span is sped up to fit
// The text of each stage lives in projects/wortzauber/index.html.
const wait = ms => `await new Promise(r => setTimeout(r, ${ms}));`;
const quest = `document.getElementById('dialBtn').click(); await WZ.until(() => document.getElementById('dQuest').offsetParent, 2000, 'dial');
  document.getElementById('dQuest').click(); await WZ.until(() => Quest.active, 20000, 'quest start');`;
// in the mouse hole wall with a candle in the hands, past the beetle (as the wall scene of the game does it)
const wallCandle = `async () => { ${quest} WZ.enterWall(); await WZ.until(() => Wall.active && Wall.state() && !Wall.busy, 20000, 'wall');
  WZ.useWord('Kerze'); await WZ.until(() => Wall.state().light === 'small', 5000, 'light'); Wall.teleport(0, 420); ${wait(1200)} }`;
const throwCandle = `async () => { Wall.throwTo(Wall.state().x + 200); ${wait(2500)} }`;
const jump = (name, ms = 2500) => `async () => { WZ.jump('${name}'); ${wait(ms)} }`;

export const STAGES = [
  { id: 'start', ref: 'f870755^1', setup: `async () => { ${wait(500)} }`, hold: 5000 },
  // #8: thrown things land on targets; a light thrown in the wall
  { id: 'pr8', ref: '0a0426c', setup: wallCandle, act: throwCandle, hold: 1500 },
  // #10: the jump with the double tap: the bot shows it at the first gap of the wall
  { id: 'pr10', ref: 'daf1d68', scene: 'wall', hold: 4000 },
  // #11: the Schwebe-Bot follows the hero on the street
  { id: 'pr11', ref: 'f33d2e9', scene: 'street', from: 'setup', hold: 3000 },
  // #18: the same throw with the new throw and hold-light animations of Paul and Pia
  { id: 'pr18', ref: 'cbd6369', setup: wallCandle, act: throwCandle, hold: 1500 },
  // #31: the simple list menu
  { id: 'pr31', ref: 'a5244b5', setup: `async () => { ${wait(1500)} document.getElementById('dialBtn').click(); ${wait(500)} }`, hold: 3500 },
  // #32: the castle level
  { id: 'pr32', ref: 'ad915dc', scene: 'castle', hold: 4000 },
  // #38: the gate of the Thronsaal
  { id: 'pr38', ref: '7fbae22', setup: jump('castleDoor'), hold: 4000 },
  // #39: the castle finale brings the verb ziehen and its page
  { id: 'pr39', ref: '641e1ff', setup: jump('page'), hold: 4000 },
  // #41: the map
  { id: 'pr41', ref: 'fd951d0', setup: jump('map'), hold: 4000 },
  // #42: the verb page as a torn page of the queen's book
  { id: 'pr42', ref: 'b311367', setup: jump('page'), hold: 4000 },
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
  { id: 'pr47', ref: '9838540', scene: 'together-castle', hold: 4000 },
  { id: 'pr48', ref: '510ce65', scene: 'together-bakery', hold: 4000 },
  { id: 'pr49', ref: '8d992cc', scene: 'together-poses', hold: 3500 },
  { id: 'pr50', ref: '08c7a71', scene: 'math-riddle', hold: 3500 },
  { id: 'pr51', ref: '882074b', scene: 'bakery-candles', hold: 3500 },
  { id: 'pr53', ref: '3709193', scene: 'together-throw', hold: 3500 },
  { id: 'pr54', ref: '8bda1a6', scene: 'free-writing', hold: 3500 },
  { id: 'pr58', ref: '224e07f', scene: 'free-writing', hold: 3500 },
  { id: 'pr59', ref: '82d1790', scene: 'map', hold: 4000 },
  { id: 'pr60', ref: 'c3216e0', scene: 'castle', hold: 4000 },
  { id: 'pr61', ref: '553f5fc', scene: 'castle', hold: 4000 },
  { id: 'pr62', ref: '1cb6cb6', scene: 'castle', hold: 4500 },
  { id: 'pr63', ref: '2e2d52f', scene: 'castle-gate', hold: 4000 },
  { id: 'pr65', ref: 'ad5eaca', scene: 'free-writing', hold: 3500 },
];
