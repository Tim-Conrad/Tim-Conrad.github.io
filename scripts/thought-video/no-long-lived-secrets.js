/* The film of the thought "Agents without long-lived secrets": a pure function of time.
   window.DURATION is its length in seconds, window.render(t) draws second t. render.mjs films it. */
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.getElementById('v');
  const anim = [];
  let S = 0;            // start of the scene that is being built
  let K = 1;            // its stretch: a scene is as long as its voice line needs
  const WPS = 2.5;      // words per second of the voice, for the first cut
  const KQ = (new URLSearchParams(location.search).get('k') || '').split(',');   // ?k=1.2,1,...: a stretch per scene, from the real audio
  const script = [];
  let G = svg;          // its group

  function el(tag, attrs, text, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    (parent || G).appendChild(e);
    return e;
  }
  const g = (cls, parent) => el('g', cls ? { class: cls } : {}, null, parent);
  const txt = (x, y, cls, s, parent) => el('text', { x, y, class: cls }, s, parent);
  const rect = (x, y, w, h, cls, parent) => el('rect', { x, y, width: w, height: h, class: cls }, null, parent);
  const path = (d, cls, parent) => el('path', { d, class: cls, pathLength: 1 }, null, parent);

  function key(e, prop, t, v) {
    if (!e._k) { e._k = {}; anim.push(e); }
    (e._k[prop] = e._k[prop] || []).push([S + t * K, v]);
    return e;
  }
  const show = (e, t, d = 0.4) => { key(e, 'o', t, 0); return key(e, 'o', t + d, 1); };
  const hide = (e, t, d = 0.4, to = 0) => { key(e, 'o', t, 1); return key(e, 'o', t + d, to); };
  function draw(e, t, d = 0.6) {
    e.setAttribute('stroke-dasharray', 1);
    key(e, 'dash', t, 1); return key(e, 'dash', t + d, 0);
  }
  function move(e, pts) { for (const [t, x, y] of pts) { key(e, 'x', t, x); key(e, 'y', t, y); } return e; }

  function box(x, y, w, h, title, sub) {
    const b = g();
    rect(x, y, w, h, 'bx', b);
    txt(x + w / 2, y + h / 2 + (sub ? -4 : 14), 't', title, b);
    if (sub) txt(x + w / 2, y + h / 2 + 34, 's', sub, b);
    return b;
  }
  function chip(label, cls) {
    const c = g('chip ' + (cls || ''));
    const w = label.length * 13.3 + 32;
    rect(-w / 2, -24, w, 48, '', c);
    txt(0, 8, '', label, c);
    c._w = w;
    return c;
  }
  function mark(x, y, ok, cls) {
    return path(ok ? `M${x - 14},${y} l10,11 l19,-23` : `M${x - 13},${y - 13} l26,26 m0,-26 l-26,26`, 'ln ' + (cls || ''));
  }
  function verdict(x, y, ok, s, cls, t) {
    const v = g();
    const m = mark(x, y, ok, cls); v.appendChild(m);
    txt(x + 30, y + 10, 'k ' + (cls || ''), s, v);
    show(v, t, 0.3);
    return v;
  }
  function cap(t0, t1, s) {
    const lines = s.split('\n');
    const c = g();
    lines.forEach((l, i) => txt(960, (lines.length === 1 ? 978 : 950) + i * 54, 'cap', l, c));
    show(c, t0, 0.3); hide(c, t1 - 0.3, 0.3);
  }
  const scenes = [];
  function scene(dur, n, title, say, build) {
    const i = scenes.length;
    K = +KQ[i] || Math.max(1, (say.split(/\s+/).length / WPS + 1) / dur);
    G = g(); G._t = [S, S + dur * K]; scenes.push(G);
    script.push({ scene: i, label: title || n || 'Title', start: +S.toFixed(2), seconds: +(dur * K).toFixed(2), base: dur, say });
    if (title) { txt(80, 104, 'lab', n.toUpperCase()); txt(80, 172, 'h', title); }
    build();
    show(G, i ? 0 : -1, 0.35); hide(G, dur - 0.35, 0.35);   // the first frame is the title, so it can be the poster
    S += dur * K; G = svg;
  }

  rect(36, 36, 1848, 1008, 'frame');

  /* 0 · title */
  scene(4.5, '', '', 
    'Agents without long-lived secrets, approved from my phone. A thought by Tim Conrad.',
    () => {
    show(txt(120, 330, 'lab', 'A THOUGHT BY TIM CONRAD · DRAFT · T7D.DEV'), -1);
    show(txt(116, 500, 'big', 'Agents without long-lived secrets,'), -1);
    show(txt(116, 640, 'big', 'approved from my phone'), -1);
    show(txt(120, 760, 'k', 'The concepts of the thought, in pictures.'), -1);
  });

  /* 1 · keys that live for years */
  scene(8, '1 · the problem', 'Keys that live for years', 
    'My agents run as me. They can read keys that never expire. An agent does not need to be evil to leak one: it prints a variable while it debugs.',
    () => {
    show(box(140, 450, 360, 170, 'Agent', 'runs as me'), 0.3);
    const rows = [['API keys: models, voice', 'until I rotate it'], ['Deploy keys', 'until I rotate it'],
      ['GitHub and cloud tokens', 'until it expires or I rotate it'], ['Lab passwords', 'until I change it']];
    rows.forEach(([name, life], i) => {
      const y = 300 + i * 120, r = g(), t = 0.8 + i * 0.35;
      rect(680, y, 800, 84, 'bx', r); txt(706, y + 52, 'k', name, r); txt(1456, y + 49, 'm end', life, r);
      draw(path(`M500,535 C590,535 590,${y + 42} 680,${y + 42}`, 'ln'), t, 0.4);
      show(r, t + 0.2);
    });
    const leak = g();
    rect(680, 540, 800, 84, 'hl hlr', leak);
    rect(1560, 470, 280, 220, 'bx', leak);
    txt(1580, 510, 'm', 'debug.log', leak); txt(1580, 570, 'm', '$ env', leak);
    txt(1580, 606, 'm red', 'GITHUB_TOKEN=', leak); txt(1580, 640, 'm red', 'ghp_…', leak);
    show(leak, 4.2);
    draw(path('M1480,582 H1560', 'ln red'), 4.4, 0.4);
    cap(0.3, 4, 'My agents run as me. They can read keys that never expire.');
    cap(4.2, 7.8, 'An agent does not need to be evil to leak one.\nIt prints a variable while it debugs.');
  });

  /* the two rows of figure 1 */
  function rowsFig(agentSub, otherSub, tOther) {
    show(box(140, 270, 400, 170, 'Agent', agentSub), 0.3);
    show(box(140, 630, 400, 170, 'Another machine', otherSub), tOther);
    const api = g(); rect(1400, 270, 400, 530, 'bx', api); txt(1600, 550, 't', 'API', api); show(api, 0.3);
    draw(path('M540,355 H1400', 'ln'), 0.5); draw(path('M540,715 H1400', 'ln'), tOther + 0.2);
  }

  /* 2 · bearer */
  scene(10.5, '2 · a bearer token', 'A secret is something you can copy', 
    'A bearer token is like a cinema ticket. Whoever shows it gets in. So when another machine has a copy from a log, the API accepts the copy too. It cannot tell the two apart.',
    () => {
    rowsFig('my laptop · holds the token', 'a copy from a log', 3.4);
    const a = chip('Bearer <token>'); show(a, 1.1, 0.3); move(a, [[1.4, 700, 355], [3, 1240, 355]]); hide(a, 3, 0.3);
    verdict(1450, 345, true, 'accepts', '', 3.2);
    const c = chip('Bearer <token>', 'red'); show(c, 4, 0.3);
    move(c, [[4.2, 340, 470], [5, 340, 600], [5.6, 340, 600], [6.2, 700, 715], [6.4, 700, 715], [7.8, 1240, 715]]); hide(c, 7.8, 0.3);
    const l = txt(480, 545, 'm red', 'copied from a log'); show(l, 4.2); hide(l, 6, 0.4);
    verdict(1450, 705, true, 'accepts the copy', 'red', 8);
    cap(0.3, 5, 'A bearer token is like a cinema ticket: whoever shows it gets in.');
    cap(5.2, 10.3, 'The API cannot tell the owner from someone with a copy.');
  });

  /* 3 · DPoP */
  scene(15, '3 · DPoP, RFC 9449', 'A token bound to a key', 
    'DPoP binds the token to a key pair. The private key never leaves the agent\u2019s process. With each request, the agent signs a fresh proof: one method, one URL, a short time, once. Another machine with a copy has no key, so it has no proof. The API rejects it.',
    () => {
    rowsFig('my laptop · token and key', 'the token, but no key', 0.3);
    const k = g();   // a key: bow, shaft, two teeth
    el('circle', { cx: 196, cy: 318, r: 16, class: 'ln blue' }, null, k).setAttribute('stroke', '#2554d0');
    path('M212,318 H262 M246,318 v14 M258,318 v10', 'ln', k).setAttribute('stroke', '#2554d0');
    show(k, 1);
    const tok = chip('DPoP <token>'); show(tok, 1.6, 0.3);
    const pr = chip('proof: POST /git/refs · now · once', 'blue'); show(pr, 5, 0.3);
    move(tok, [[1.6, 820, 322], [7, 820, 322], [8.6, 1140, 322]]); hide(tok, 8.6, 0.3);
    move(pr, [[5, 820, 388], [7, 820, 388], [8.6, 1140, 388]]); hide(pr, 8.6, 0.3);
    verdict(1450, 345, true, 'accepts', '', 8.8);
    const c = chip('DPoP <token>', 'red'); show(c, 10, 0.3);
    move(c, [[10.6, 820, 715], [12.2, 1240, 715]]); hide(c, 12.2, 0.3);
    const l = txt(820, 780, 'm red mid', 'no key, so no proof'); show(l, 10.2); hide(l, 12.2, 0.3);
    verdict(1450, 705, false, 'rejects: no proof', 'red', 12.4);
    cap(0.3, 4.6, 'DPoP binds the token to a key pair.\nThe private key never leaves the agent’s process.');
    cap(4.8, 9.6, 'With each request the agent signs a fresh proof:\none method, one URL, a short time, once.');
    cap(9.8, 14.8, 'A copied token is worth nothing without the key.');
  });

  /* 4 · the parts */
  scene(15, '4 · the design', 'Five parts, and the APIs they protect', 
    'The design has five parts. On my machine, a broker finds out which program is asking. A relay passes the sealed request to my phone. I approve, and the phone signs a grant. A gateway checks each request and adds the real key. The agent never sees it.',
    () => {
    const fr = g(); rect(100, 232, 800, 236, 'bx-s', fr); txt(124, 220, 'm', 'my Linux machine, or a server', fr); show(fr, 0.3);
    show(box(150, 275, 300, 150, 'Agent', 'its own key, a grant'), 0.5);
    show(box(550, 275, 300, 150, 'Broker', 'knows who is asking'), 1.4);
    draw(path('M450,350 H550', 'ln'), 1.6, 0.3);
    show(box(1040, 275, 300, 150, 'Relay', 'ciphertext only'), 4.6);
    draw(path('M850,350 H1040', 'ln'), 4.4, 0.4);
    show(box(1480, 275, 300, 150, 'Phone', 'signs a grant'), 5.6);
    draw(path('M1340,350 H1480', 'ln'), 5.4, 0.3);
    show(box(1040, 640, 300, 150, 'Gateway', 'keeps the last keys'), 9.4);
    draw(path('M300,425 V715 H1040', 'ln'), 9.6, 0.8);
    show(txt(670, 700, 'm mid', 'request + proof + grant'), 10.2);
    show(box(1480, 640, 300, 150, 'APIs', 'GitHub, models, lab'), 10.8);
    draw(path('M1340,715 H1480', 'ln'), 10.8, 0.3);
    const d = path('M1630,425 V540 H1190 V640', 'ln dash'); d.removeAttribute('pathLength'); show(d, 12);
    show(txt(1410, 526, 'm mid', 'public key only'), 12.2);
    cap(0.3, 4.2, 'On my machine, a broker finds out which program is asking.');
    cap(4.4, 9, 'A relay passes the sealed request to my phone.\nI approve, and the phone signs a grant.');
    cap(9.2, 14.8, 'A gateway checks each request and adds the real key.\nThe agent never sees it.');
  });

  /* 5 · the approval screen */
  scene(15, '5 · the approval screen', 'Show the intent, not a button', 
    'The phone shows what the agent wants to do. Who asks, as the broker checked it. What exactly it wants. Why, in the agent\u2019s own words, which is a claim and not a fact. How far the grant goes. A code that also shows in my terminal. Then my fingerprint, and the phone signs exactly what it shows.',
    () => {
    const p = g();
    el('rect', { x: 180, y: 222, width: 480, height: 650, rx: 40, class: 'phone' }, null, p);
    rect(198, 252, 444, 590, 'screen', p);
    txt(218, 284, 'm', 'Countersign · lab-1 asks', p).setAttribute('font-size', 17);
    const R = [[298, 100], [406, 124], [538, 84], [630, 68], [706, 46], [760, 68]];
    R.forEach(([y, h]) => rect(212, y, 416, h, 'row', p));
    const s = (x, y, cls, str, size) => { const e = txt(x, y, cls, str, p); if (size) e.setAttribute('font-size', size); return e; };
    s(226, 332, 'b', 'claude · node', 24); s(226, 360, 'm', 'verified: package hash', 16); s(226, 384, 'm', 'lab-1 · session 7f3a', 16);
    s(226, 440, 'b', 'git push', 24); s(226, 468, 'm', 'repo Tim-Conrad.github.io', 16); s(226, 492, 'm', 'branch claude/thought-grants', 16); s(226, 516, 'm', '3 commits · not main', 16);
    s(226, 566, 'm', 'why · the agent’s words', 15); s(226, 590, 'k', 'Push the new thought', 19); s(226, 613, 'k', 'for review.', 19);
    s(226, 672, 'm', 'allow', 15); rect(296, 642, 140, 44, 'fill', p); s(366, 671, 'm mid onf', 'this push', 16);
    rect(450, 642, 164, 44, 'row', p).setAttribute('stroke', '#111'); s(532, 671, 'm mid', 'session, 2 h', 16).setAttribute('fill', '#111');
    s(226, 735, 'm', 'code 47 · also in the terminal', 16);
    rect(226, 772, 180, 44, 'row', p).setAttribute('stroke', '#111'); s(316, 801, 'b mid', 'Deny', 20);
    rect(420, 772, 194, 44, 'fill', p); s(517, 801, 'b mid onf', 'Approve', 20);
    show(p, 0.3);
    const says = [['Who', 'The program, as the broker checked it.'], ['What', 'The exact request, as structured data.'],
      ['Why', 'The agent’s own reason. A claim, not a fact.'], ['Grant', 'How far the approval goes, and how long.'],
      ['Code', 'The same two digits show in my terminal.'], ['Approve', 'My fingerprint. The phone signs what it shows.']];
    says.forEach(([w, say], i) => {
      const [y, h] = R[i], t = 1 + i * 1.9, yc = 290 + i * 100, e = g();
      const hl = rect(212, y, 416, h, 'hl'); show(hl, t, 0.25); hide(hl, t + 1.8, 0.25);
      path(`M660,${y + h / 2} H720 L770,${yc}`, 'ln green', e);
      txt(790, yc + 16, 'line', w, e).setAttribute('font-size', 52);
      txt(1030, yc + 13, 'k', say, e).setAttribute('font-size', 34);
      show(e, t, 0.25); hide(e, t + 1.8, 0.3, 0.55);
    });
    const gr = chip('grant · signed in the secure chip', 'green'); show(gr, 12.6, 0.3); move(gr, [[12.6, 1026, 884], [13, 1026, 884]]);
    cap(0.3, 6.4, 'The phone shows what the agent wants to do.');
    cap(6.6, 14.8, 'What it signs is exactly what it shows.');
  });

  /* 6 · one request */
  scene(20, '6 · one push', 'One request, from the agent to GitHub', 
    'One push, step by step. The agent asks the broker, and the broker checks which program it is. The request reaches my phone, sealed. I read it and approve. The phone signs a grant: this agent, this push, two hours at most. The gateway checks the grant, the proof and the request. Then it adds a short token of its own, which the agent never sees. A push to main is outside the grant, so the gateway refuses it.',
    () => {
    show(box(120, 440, 300, 150, 'Agent'), 0.3);
    show(box(640, 250, 300, 150, 'Broker'), 0.3); show(box(1400, 250, 300, 150, 'Phone'), 0.3);
    show(box(640, 640, 300, 150, 'Gateway'), 0.3); show(box(1400, 640, 300, 150, 'GitHub'), 0.3);
    draw(path('M420,480 L640,325', 'ln'), 0.5); draw(path('M420,550 L640,715', 'ln'), 0.5);
    draw(path('M940,325 H1400', 'ln'), 0.5); draw(path('M940,715 H1400', 'ln'), 0.5);
    show(txt(1170, 300, 'm mid', 'relay · ciphertext'), 0.6);
    const rq = chip('git push + my key'); show(rq, 0.9, 0.3); move(rq, [[1.1, 440, 470], [2, 610, 345]]); hide(rq, 2, 0.3);
    verdict(668, 432, true, 'checks the caller', '', 2.3).querySelector('text').setAttribute('font-size', 26);
    const se = chip('sealed request'); show(se, 3.2, 0.3); move(se, [[3.3, 1060, 350], [4.3, 1280, 350]]); hide(se, 4.3, 0.3);
    verdict(1428, 432, true, 'I read, I approve', 'green', 4.8).querySelector('text').setAttribute('font-size', 26);
    const gr = chip('grant · 2 h at most', 'green'); show(gr, 6.2, 0.3);
    move(gr, [[6.4, 1260, 350], [7.4, 1080, 350], [7.5, 1080, 350], [8.8, 270, 404]]);
    const trio = g(); [['push', '', -150], ['proof', 'blue', -44], ['grant', 'green', 66]].forEach(([s, c, x]) => {
      const ch = chip(s, c); trio.appendChild(ch); ch.setAttribute('transform', `translate(${x + 44},0)`);
    });
    show(trio, 9.8, 0.3); move(trio, [[10, 270, 626], [11.2, 470, 720]]); hide(trio, 11.3, 0.3);
    ['grant: signed by my phone', 'proof: signed by the agent’s key', 'request: inside the grant'].forEach((s, i) =>
      verdict(668, 490 + i * 48, true, s, i === 1 ? 'blue' : 'green', 11.6 + i * 0.5).querySelector('text').setAttribute('font-size', 26));
    const up = chip('installation token · 1 h'); show(up, 13.6, 0.3); move(up, [[13.7, 1130, 740], [14.6, 1210, 740]]); hide(up, 15.4, 0.3);
    const ul = txt(1170, 690, 'm mid', 'added by the gateway'); show(ul, 13.6); hide(ul, 15.4, 0.3);
    verdict(1428, 822, true, 'pushed', '', 14.8).querySelector('text').setAttribute('font-size', 26);
    const bad = chip('push to main', 'red'); show(bad, 16.4, 0.3); move(bad, [[16.5, 270, 626], [17.6, 520, 740]]);
    verdict(668, 822, false, 'refused: outside the grant', 'red', 17.8).querySelector('text').setAttribute('font-size', 26);
    cap(0.3, 2.9, 'The agent asks the broker. The broker checks which program it is.');
    cap(3.1, 5.9, 'The request reaches my phone, sealed. I read it and approve.');
    cap(6.1, 9.5, 'The phone signs a grant: this agent, this push, two hours at most.');
    cap(9.7, 13.3, 'The gateway checks the grant, the proof and the request.');
    cap(13.5, 16.1, 'Then it adds a short token of its own. The agent never sees it.');
    cap(16.3, 19.8, 'A push to main is outside a grant for a branch.');
  });

  /* 7 · lifetimes: the proportions of figure 5 */
  scene(13, '7 · lifetimes, on a log scale', 'How long each credential lives', 
    'Today, an agent can read four kinds of keys, and they are valid until I rotate them. With grants, the lifetimes are minutes and hours. Only the upstream keys stay long-lived, and they stay in the gateway, where no agent can read them.',
    () => {
    const X = 560, W = 1200, f = W / 444;
    const ax = g(); path(`M${X},800 H${X + W}`, 'ln', ax);
    [[30, '1 min'], [130, '1 h'], [230, '1 day'], [330, '1 month'], [410, '1 year']].forEach(([x, s]) => {
      path(`M${X + x * f},790 v20`, 'ln', ax); txt(X + x * f, 846, 'm mid', s, ax);
    });
    txt(X + W, 770, 'm end', 'never →', ax); show(ax, 0.3);
    const A = [['API key', 444, 'until I rotate it'], ['Deploy key', 444, 'until I rotate it'],
      ['GitHub, cloud token', 410, 'until it expires or I rotate it'], ['Lab password', 444, 'until I change it']];
    const B = [['Access token', 69, 'about 5 min, bound to a key'], ['Grant', 152, '2 h at most'],
      ['Agent key', 195, 'until the session ends'], ['Upstream key', 444, 'no expiry, but only in the gateway']];
    const sw = 6.2;
    A.forEach(([name, w, life], i) => {
      const y = 290 + i * 120, t = 0.6 + i * 0.25, [nb, wb, lb] = B[i];
      const la = txt(X - 30, y + 46, 'k end', name); show(la, t); hide(la, sw, 0.4);
      const lB = txt(X - 30, y + 46, 'k end', nb); show(lB, sw + 0.4);
      const r = rect(X, y, 0, 70, 'red'); key(r, 'w', t, 0); key(r, 'w', t + 0.8, w * f); key(r, 'w', sw, w * f); key(r, 'w', sw + 1.2, wb * f);
      hide(r, sw, 0.8);
      const rb = rect(X, y, 0, 70, i === 3 ? 'hatch' : 'green'); key(rb, 'w', sw, w * f); key(rb, 'w', sw + 1.2, wb * f); show(rb, sw, 0.8);
      const ta = txt(X + 20, y + 43, 'm onf', life); ta.setAttribute('font-size', 22); show(ta, t + 0.8); hide(ta, sw, 0.3);
      const tb = txt(i === 3 ? X + 20 : X + wb * f + 20, y + 43, 'm', lb); tb.setAttribute('font-size', 22); tb.setAttribute('fill', '#111'); show(tb, sw + 1.4);
    });
    const td = txt(X, 262, 'm', 'TODAY'); show(td, 0.4); hide(td, sw, 0.3);
    show(txt(X, 262, 'm', 'WITH GRANTS'), sw + 0.4);
    cap(0.3, 6, 'Today: four kinds of keys that an agent can read.');
    cap(6.4, 12.8, 'With grants: minutes and hours. The upstream keys stay long-lived,\nbut only in the gateway, where no agent can read them.');
  });

  /* 8 · in short */
  scene(8, 'in short', '', 
    'In short: a key that cannot be copied replaces the secret. The phone signs a narrow, short grant for what the agent means to do. And the last static keys move into one gateway that no agent can read.',
    () => {
    ['A key that cannot be copied replaces the secret.', 'The phone signs a narrow, short grant for what the agent means to do.',
      'The last static keys move into one gateway that no agent can read.'].forEach((s, i) => {
      show(txt(120, 390 + i * 130, 'lab', String(i + 1)), 0.5 + i * 1.3);
      show(txt(170, 396 + i * 130, 'line', s), 0.5 + i * 1.3);
    });
    show(txt(120, 860, 'm', 'A draft. The open questions are in the thought: t7d.dev/thoughts/no-long-lived-secrets/'), 4.6);
  });

  window.DURATION = S;
  window.SCRIPT = script;
  const ease = u => u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  function val(ks, t) {
    if (t <= ks[0][0]) return ks[0][1];
    for (let i = 1; i < ks.length; i++) {
      if (t <= ks[i][0]) {
        const [ta, va] = ks[i - 1], [tb, vb] = ks[i];
        return tb === ta ? vb : va + (vb - va) * ease((t - ta) / (tb - ta));
      }
    }
    return ks[ks.length - 1][1];
  }
  window.render = t => {
    for (const s of scenes) s.style.display = t >= s._t[0] && t <= s._t[1] ? '' : 'none';
    for (const e of anim) {
      const k = e._k;
      if (k.o) e.setAttribute('opacity', val(k.o, t).toFixed(3));
      if (k.x) e.setAttribute('transform', `translate(${val(k.x, t).toFixed(1)},${val(k.y, t).toFixed(1)})`);
      if (k.w) e.setAttribute('width', Math.max(0, val(k.w, t)).toFixed(1));
      if (k.dash) e.setAttribute('stroke-dashoffset', val(k.dash, t).toFixed(3));
    }
  };
  const q = new URLSearchParams(location.search).get('t');
  if (q != null) window.render(+q);
  else { const t0 = performance.now(); (function tick() { window.render(((performance.now() - t0) / 1000) % window.DURATION); requestAnimationFrame(tick); })(); }
})();
