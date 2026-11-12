/* Narration for a thought: the page follows a voice that reads it.
   The page opts in with <article class="prose" data-narration="/thoughts/<slug>/narration.json">.
   The script is the page itself: every h2, p and li of the article up to #sources, plus the spoken parts
   (.say, text that only the voice says). narration.json holds the chapters, the figure cues and, once it exists,
   the audio with its character timings from ElevenLabs. Without audio the timing is simulated, so the page can be
   read along before any audio is generated. Styles: "Narration" in site.css. */
(function () {
  'use strict';
  var art = document.querySelector('article.prose[data-narration]');
  if (!art || !window.fetch) return;
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var KEY = 'narr:' + location.pathname;
  var store = {
    get: function () { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } },
    set: function (v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} }
  };

  fetch(art.getAttribute('data-narration')).then(function (r) { return r.json(); }).then(init).catch(function () {});

  function init(N) {
    /* ---- the script: blocks of the page in reading order ---- */
    var stop = $('#sources', art), segs = [];
    var walker = document.createTreeWalker(art, NodeFilter.SHOW_ELEMENT, { acceptNode: function (n) {
      if (stop && (n === stop || (stop.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING))) return NodeFilter.FILTER_REJECT;
      if (n.matches('svg, figcaption, .code, .refs')) return NodeFilter.FILTER_REJECT;
      return n.matches('h2, p, li') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    } });
    while (walker.nextNode()) {
      var el = walker.currentNode, say = el.closest('.say');
      var text = ((N.spoken || {})[el.id] || spokenText(el)).trim();
      if (text) segs.push({ el: el, say: say, text: text, pause: say ? +(say.getAttribute('data-pause') || 0) : 0 });
    }
    var T = '', i;
    segs.forEach(function (s, k) { if (k) T += '\n\n'; s.s = T.length; T += s.text; s.e = T.length; s.el.classList.add('narr-seg'); });

    var A = N.timing || simulate(T, segs);   // {start: [...], end: [...]} per character of T
    var dur = A.end[A.end.length - 1];
    var sim = !N.timing;

    /* ---- words: wrap the printed words and give each the time of its spoken twin ---- */
    var words = [], m, spoken = [], wr = /\S+/g;
    while ((m = wr.exec(T))) spoken.push({ n: norm(m[0]), s: A.start[m.index], c: m.index });
    segs.forEach(function (s, k) {
      var printed = wrapWords(s.el), mine = spoken.filter(function (w) { return w.c >= s.s && w.c < s.e; });
      align(mine, printed);
      var last = A.start[s.s];
      printed.forEach(function (w) { if (w.s === Infinity) w.s = last; else last = w.s; w.k = k; });
      // phrases: cut at punctuation, at a pause in the voice, or after 7 words
      var ph = null;
      printed.forEach(function (w, j) {
        if (!ph) ph = { words: [] };
        ph.words.push(w); w.ph = ph;
        var nx = printed[j + 1], t = w.el.textContent;
        if (!nx || (/[,.;:?!]$/.test(t) && ph.words.length >= 2) || ph.words.length >= 7 || (nx.s - w.s > 0.5 && ph.words.length >= 2)) ph = null;
      });
      s.words = printed;
      words.push.apply(words, printed);
    });
    var marks = $$('.mk', art).map(function (mk) {
      var ws = words.filter(function (w) { return mk.contains(w.el); });
      return { el: mk, s: ws.length ? ws[0].s : Infinity };
    });

    /* ---- sentences, chapters, cues ---- */
    var sents = [], re = /[^.!?\n]+(?:[.!?]+|$)/g;
    while ((m = re.exec(T))) { var lead = m[0].length - m[0].replace(/^\s+/, '').length; if (m[0].trim()) sents.push(m.index + lead); }
    var chapters = (N.chapters || []).map(function (c) {
      var k = segs.findIndex(function (s) { return s.el.id === c[0] || !!s.el.closest('#' + c[0]) || (s.say && s.say.id === c[0]); });
      return { k: k, title: c[1] };
    }).filter(function (c) { return c.k >= 0; });
    if (!chapters.length || chapters[0].k !== 0) chapters.unshift({ k: 0, title: N.title || 'Start' });
    var cues = (N.cues || []).map(function (q) {
      var host = document.getElementById(q['in']); if (!host) return null;
      var s = segs.find(function (x) { return x.el === host || host.contains(x.el); }); if (!s) return null;
      var scope = host.closest('figure') || art, at = T.indexOf(q.p, s.s), to = q.until ? T.indexOf(q.until, at) : -1;
      return { els: $$(q.sel, scope), cls: q.cls || 'on', at: at, to: q.until ? (to < 0 ? T.length : to) : Infinity };
    }).filter(function (q) { return q && q.at >= 0; });

    /* ---- the player ---- */
    var head = $('.post-head'), main = $('#main');
    var listen = node('div', 'narr-listen');
    var go = node('button', 'btn narr-go'); go.type = 'button';
    go.innerHTML = icon() + '<span></span>';
    var note = node('p', 'narr-note', sim ? 'Simulated timing: the audio is not made yet. The page moves the way the voice will.' : 'Narrated by ' + (N.voice || 'a voice') + '. The voice also describes every figure, so it works without the screen.');
    var again = node('button', 'btn btn--ghost btn--s narr-again', 'Start over'); again.type = 'button'; again.hidden = true;
    listen.appendChild(go); listen.appendChild(note); listen.appendChild(again);
    head.appendChild(listen);

    var bar = node('div', 'narr-bar');
    bar.innerHTML =
      '<div class="narr-scrub"><i class="narr-rail"></i><i class="narr-fill"></i><i class="narr-knob"></i></div>' +
      '<div class="narr-row">' +
      '<button type="button" class="narr-play" aria-label="Play or pause">' + icon() + '</button>' +
      '<button type="button" class="narr-skip" data-act="back" aria-label="Back to the previous sentence">' + arrow(true) + '</button>' +
      '<button type="button" class="narr-skip" data-act="fwd" aria-label="Forward 15 seconds">' + arrow(false) + '<span>15</span></button>' +
      '<button type="button" class="narr-chap" aria-label="Chapters"><span></span><small></small></button>' +
      '<button type="button" class="narr-speed" aria-label="Speed">1×</button></div>';
    document.body.appendChild(bar);
    var scrub = $('.narr-scrub', bar), fill = $('.narr-fill', bar), knob = $('.narr-knob', bar);
    chapters.slice(1).forEach(function (c) { var t = node('i', 'narr-tick'); t.style.left = (A.start[segs[c.k].s] / dur * 100) + '%'; scrub.appendChild(t); });
    var sheet = node('div', 'narr-sheet');
    sheet.innerHTML = '<p class="label">Chapters</p><ol></ol><label class="narr-opt"><input type="checkbox" id="narr-all"> Show all spoken parts</label>';
    document.body.appendChild(sheet);
    chapters.forEach(function (c) {
      var li = node('li'), b = node('button'); b.type = 'button';
      b.innerHTML = '<span></span><span class="narr-t"></span>';
      b.firstChild.textContent = c.title; b.lastChild.textContent = fmt(A.start[segs[c.k].s]);
      b.addEventListener('click', function () { seekChar(segs[c.k].s); refollow(); if (!playing()) play(); sheet.classList.remove('open'); });
      li.appendChild(b); $('ol', sheet).appendChild(li); c.li = li;
    });
    var back = node('button', 'narr-follow', 'Back to the voice'); back.type = 'button';
    document.body.appendChild(back);
    var boxes = [0, 1, 2].map(function () { var h = node('div', 'narr-hl'); h.setAttribute('aria-hidden', 'true'); main.appendChild(h); return h; });

    /* ---- the clock: real audio, or simulated time ---- */
    var SPEEDS = [1, 1.15, 1.3, 0.9], speedI = 0, audio = null;
    var clock = { on: false, base: 0, t0: 0, rate: 1,
      now: function () { return this.on ? Math.min(dur, this.base + (performance.now() - this.t0) / 1000 * this.rate) : this.base; },
      play: function () { if (!this.on) { this.t0 = performance.now(); this.on = true; } },
      pause: function () { if (this.on) { this.base = this.now(); this.on = false; } },
      seek: function (t) { this.base = t; this.t0 = performance.now(); },
      speed: function (r) { this.base = this.now(); this.t0 = performance.now(); this.rate = r; } };
    if (N.audio) {
      audio = new Audio();
      fetch(N.audio).then(function (r) { return r.blob(); }).then(function (b) { audio.src = URL.createObjectURL(b); });   // a blob seeks on any host
      clock = { now: function () { return audio.currentTime; }, play: function () { var p = audio.play(); if (p && p.catch) p.catch(function () {}); },
        pause: function () { audio.pause(); }, seek: function (t) { audio.currentTime = t; }, speed: function (r) { audio.playbackRate = r; }, get on() { return !audio.paused; } };
    }
    function playing() { return clock.on; }

    var started = false, follow = true, lastC = -2, curK = -1, shownKey = null, boxY = [], autoAt = 0, pausedAt = 0, raf = 0;
    function play() {
      if (!started) { started = true; document.body.classList.add('narr-on'); again.hidden = false; var r = store.get(); if (r && r.c > 0 && r.c < T.length - 30) seekChar(r.c); }
      else if (pausedAt && Date.now() - pausedAt > 30000) seekChar(sentenceStart(charAt(clock.now())));   // back in after a break: start of the sentence
      clock.play(); document.body.classList.add('narr-playing'); refollow(); loop();
    }
    function pause() { clock.pause(); pausedAt = Date.now(); document.body.classList.remove('narr-playing'); store.set({ c: Math.max(0, lastC) }); render(true); }
    function toggle() { if (playing()) pause(); else play(); }
    function seek(t) { clock.seek(Math.max(0, Math.min(dur - 0.05, t))); render(true); }
    function seekChar(c) { seek(A.start[Math.max(0, c)] + 0.001); }
    function refollow() { follow = true; document.body.classList.remove('narr-lost'); curK = -1; }
    function loop() { if (raf) return; (function f() { render(false); if (clock.now() >= dur - 0.01 && !audio) { pause(); store.set({ c: 0 }); } raf = playing() ? requestAnimationFrame(f) : 0; })(); }

    /* ---- one frame ---- */
    function render(force) {
      var t = clock.now(), c = charAt(t);
      times(t);
      if (c === lastC && !force) { marker(false); return; }
      lastC = c;
      var k = c < 0 ? 0 : segOf(c), s = segs[k];
      // the block that the voice reads, its figure, the spoken parts that it has reached
      segs.forEach(function (x, j) { x.el.classList.toggle('cur', started && j === k); });
      $$('figure', art).forEach(function (f) { f.classList.toggle('cur', started && f.contains(s.el)); });
      var all = $('#narr-all').checked;
      document.body.classList.toggle('narr-all', all);
      $$('.say', art).forEach(function (box) {
        var first = segs.findIndex(function (x) { return x.say === box; });
        box.classList.toggle('open', all || (started && k >= first));
      });
      // a figure with voice steps: its intro shows the whole drawing, each list item brings in the parts of its step
      $$('figure[data-voice-steps]', art).forEach(function (f) {
        var k = 0;
        if (started && f.contains(s.el) && s.el.matches('.fig-steps li')) k = $$('.fig-steps li', f).indexOf(s.el) + 1;
        $$('[data-step]', f).forEach(function (part) {
          var n = +part.getAttribute('data-step');
          part.classList.toggle('is-later', k > 0 && n > k);
          part.classList.toggle('is-past', k > 0 && n < k);
        });
      });
      // read words, colour blocks, figure cues: all derived from the position, so seeking back undoes them
      words.forEach(function (w) { w.el.classList.toggle('rd', started && w.k === k && w.s <= t + 0.03); });
      marks.forEach(function (x) { x.el.classList.toggle('on', started && t >= x.s); });
      cues.forEach(function (q) { var on = started && c >= q.at && c < q.to; q.els.forEach(function (e) { e.classList.toggle(q.cls, on); }); });
      var ch = chapterOf(k);
      $('.narr-chap span', bar).textContent = chapters[ch].title;
      chapters.forEach(function (x, j) { x.li.classList.toggle('is-now', started && j === ch); });
      if (started && playing() && follow && k !== curK) requestAnimationFrame(function () { frame(s.el); });
      curK = k;
      marker(force);
      if (audio && 'mediaSession' in navigator && render.ch !== ch) { render.ch = ch;
        navigator.mediaSession.metadata = new MediaMetadata({ title: chapters[ch].title, artist: 'Tim Conrad', album: N.title || document.title }); }
    }
    function times(t) {
      $('.narr-chap small', bar).textContent = fmt(t) + ' / ' + fmt(dur);
      var f = (t / dur * 100) + '%'; fill.style.width = f; knob.style.left = f;
      var r = store.get(), rc = r && r.c > 0 && r.c < T.length - 30 ? r.c : 0;
      $('span', go).textContent = !started ? (rc ? 'Resume · ' + fmt(A.start[rc]) : 'Listen · ' + fmt(dur)) : (playing() ? 'Pause · ' : 'Resume · ') + fmt(t);
    }

    /* ---- the phrase marker: a grey tint over the phrase that the voice reads ---- */
    function marker(force) {
      var t = clock.now(), w = null;
      if (started) for (var j = 0; j < words.length; j++) { var x = words[j]; if (x.k === curK && x.s <= t + 0.03) w = x; }
      if (!w) { if (shownKey) { draw(null); shownKey = null; } return; }
      if (w.ph === shownKey && !force) return;
      draw(w.ph.words); shownKey = w.ph;
    }
    function draw(ws) {
      var list = ws ? lines(ws) : [];
      boxes.forEach(function (h, j) {
        var b = list[j];
        if (!b) { h.classList.remove('show'); boxY[j] = null; return; }
        var jump = !h.classList.contains('show') || (boxY[j] != null && Math.abs(b.y - boxY[j]) > 4);   // a new line: appear there, do not slide across the text
        h.classList.toggle('jump', jump);
        h.style.transform = 'translate(' + b.x + 'px,' + b.y + 'px)'; h.style.width = b.w + 'px'; h.style.height = b.h + 'px';
        h.classList.add('show'); boxY[j] = b.y;
        if (jump) requestAnimationFrame(function () { requestAnimationFrame(function () { h.classList.remove('jump'); }); });
      });
    }
    function lines(ws) {
      var pr = main.getBoundingClientRect(), r = document.createRange(), out = [];
      r.setStartBefore(ws[0].el); r.setEndAfter(ws[ws.length - 1].el);
      Array.prototype.forEach.call(r.getClientRects(), function (q) {
        if (q.width < 1) return;
        var L = out.find(function (l) { return Math.abs(l.top - q.top) < 8; });
        if (!L) out.push({ top: q.top, left: q.left, right: q.right, bottom: q.bottom });
        else { L.left = Math.min(L.left, q.left); L.right = Math.max(L.right, q.right); L.bottom = Math.max(L.bottom, q.bottom); L.top = Math.min(L.top, q.top); }
      });
      return out.slice(0, 3).map(function (l) { return { x: l.left - pr.left - 4, y: l.top - pr.top - 1, w: l.right - l.left + 8, h: l.bottom - l.top + 2 }; });
    }

    /* ---- scrolling: keep the block in view; in a figure, keep the whole figure and its current paragraph ---- */
    function frame(el) {
      var nav = $('.nav'), top = nav ? nav.getBoundingClientRect().height : 0;   // the sticky site header covers the top
      var fig = el.closest('figure'), vh = innerHeight - bar.offsetHeight - top, target;
      if (fig) target = scrollY + fig.getBoundingClientRect().top - top - Math.max(8, (vh - fig.offsetHeight) / 2);
      else { var r = el.getBoundingClientRect(); target = scrollY + r.top - top - Math.max(24, (vh - Math.min(r.height, vh * 0.8)) / 2.4); }
      autoAt = Date.now();
      scrollTo({ top: target, behavior: reduced ? 'auto' : 'smooth' });
    }
    function lose() { if (started && playing() && Date.now() - autoAt > 900) { follow = false; document.body.classList.add('narr-lost'); } }
    addEventListener('wheel', lose, { passive: true });
    addEventListener('touchmove', lose, { passive: true });
    addEventListener('resize', function () { boxY = []; shownKey = null; marker(true); });
    $$('.say', art).forEach(function (b) { b.addEventListener('transitionend', function (e) {
      if (e.propertyName !== 'grid-template-rows') return;
      boxY = []; shownKey = null; marker(true);
      if (follow && playing() && segs[curK]) frame(segs[curK].el);   // a part above opened and pushed the block down
    }); });

    /* ---- controls ---- */
    go.addEventListener('click', toggle);
    $('.narr-play', bar).addEventListener('click', toggle);
    again.addEventListener('click', function () { seekChar(0); refollow(); if (!playing()) play(); });
    back.addEventListener('click', function () { refollow(); render(true); });
    $('.narr-chap', bar).addEventListener('click', function (e) { e.stopPropagation(); sheet.classList.toggle('open'); });
    $('.narr-speed', bar).addEventListener('click', function () {
      speedI = (speedI + 1) % SPEEDS.length; clock.speed(SPEEDS[speedI]);
      this.textContent = String(SPEEDS[speedI]).replace(/^0/, '') + '×';
    });
    $$('.narr-skip', bar).forEach(function (b) { b.addEventListener('click', function () {
      if (b.getAttribute('data-act') === 'fwd') { seek(clock.now() + 15); return; }
      // back: to the start of this sentence, or of the one before when the voice has only just begun it
      var c = Math.max(0, charAt(clock.now())), st = sentenceStart(c);
      if (clock.now() - A.start[st] < 1.2) st = sentenceStart(Math.max(0, st - 2));
      seekChar(st);
    }); });
    $('#narr-all').addEventListener('change', function () { render(true); });
    scrub.addEventListener('pointerdown', function (ev) {
      if (!started) play();
      scrub.setPointerCapture(ev.pointerId); scrub.classList.add('drag');
      var at = function (e) { var r = scrub.getBoundingClientRect(); return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * dur; };
      seek(at(ev));
      var mv = function (e) { seek(at(e)); };
      scrub.addEventListener('pointermove', mv);
      scrub.addEventListener('pointerup', function () { scrub.removeEventListener('pointermove', mv); scrub.classList.remove('drag'); refollow(); render(true); }, { once: true });
    });
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.narr-sheet')) sheet.classList.remove('open');
      // tap a block to play from there
      var el = e.target.closest('.narr-seg');
      if (!started || !el || e.target.closest('a, button') || String(getSelection())) return;
      var k = segs.findIndex(function (s) { return s.el === el; });
      if (k >= 0 && k !== curK) { seekChar(segs[k].s); refollow(); if (!playing()) play(); }
    });
    addEventListener('keydown', function (e) {
      if (!started || e.target.closest('input, textarea, button, a')) return;
      if (e.key === ' ') { e.preventDefault(); toggle(); }
      if (e.key === 'ArrowLeft') seek(clock.now() - 10);
      if (e.key === 'ArrowRight') seek(clock.now() + 10);
      if (e.key === 'Escape') sheet.classList.remove('open');
    });
    if (audio) {
      audio.addEventListener('pause', function () { document.body.classList.remove('narr-playing'); });
      audio.addEventListener('ended', function () { store.set({ c: 0 }); render(true); });
      if ('mediaSession' in navigator) try {
        navigator.mediaSession.setActionHandler('play', play);
        navigator.mediaSession.setActionHandler('pause', pause);
        navigator.mediaSession.setActionHandler('seekbackward', function () { seek(clock.now() - 15); });
        navigator.mediaSession.setActionHandler('seekforward', function () { seek(clock.now() + 15); });
      } catch (e) {}
    }
    setInterval(function () { if (playing()) store.set({ c: Math.max(0, lastC) }); }, 4000);
    render(true);

    /* ---- helpers that need the script ---- */
    function charAt(t) { var s = A.start, lo = 0, hi = s.length - 1; if (t < s[0]) return -1; while (lo < hi) { var md = (lo + hi + 1) >> 1; if (s[md] <= t) lo = md; else hi = md - 1; } return lo; }
    function segOf(c) { for (var j = 0; j < segs.length; j++) if (c < segs[j].e + 2) return j; return segs.length - 1; }
    function chapterOf(k) { var r = 0; chapters.forEach(function (c, j) { if (c.k <= k) r = j; }); return r; }
    function sentenceStart(c) { var r = 0; sents.forEach(function (x) { if (x <= c) r = x; }); return r; }
  }

  /* text that the voice says for a block: without source marks and labels */
  function spokenText(el) {
    var c = el.cloneNode(true);
    Array.prototype.forEach.call(c.querySelectorAll('a[href^="#s"], .say-k'), function (x) { x.remove(); });
    return c.textContent.replace(/\s+/g, ' ');
  }
  /* simulated timing, about 160 words a minute, with pauses at punctuation and between blocks */
  function simulate(T, segs) {
    var start = new Float64Array(T.length), end = new Float64Array(T.length), t = 0.4, extra = {};
    segs.forEach(function (s) { if (s.pause) extra[s.e - 1] = s.pause; });
    for (var i = 0; i < T.length; i++) {
      var ch = T[i], nx = T[i + 1], d = 0.062;
      if (ch === ',') d += 0.18;
      else if (ch === ':' || ch === ';') d += 0.22;
      else if ('.!?'.indexOf(ch) >= 0 && (nx === ' ' || nx === '\n' || nx === undefined)) d += 0.38;
      else if (ch === '\n') d = 0.45;
      start[i] = t; t += d; end[i] = t;
      if (extra[i]) t += extra[i];
    }
    return { start: start, end: end };
  }
  function norm(s) { return s.toLowerCase().replace(/\.md\b/, '').replace(/[^a-z0-9'$%]/g, '').replace(/'s$/, ''); }
  /* wrap every word of a block in a span; words in a marked term keep its colour */
  function wrapWords(root) {
    var out = [], nodes = [], w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) { var p = w.currentNode.parentElement; if (!p.closest('a[href^="#s"], .say-k')) nodes.push(w.currentNode); }
    nodes.forEach(function (n) {
      var frag = document.createDocumentFragment();
      n.textContent.split(/(\s+)/).forEach(function (part) {
        if (!part) return;
        if (/^\s+$/.test(part) || !norm(part)) { frag.appendChild(document.createTextNode(part)); return; }
        var sp = document.createElement('span'); sp.className = 'w'; sp.textContent = part;
        frag.appendChild(sp); out.push({ el: sp, n: norm(part), s: Infinity });
      });
      n.parentNode.replaceChild(frag, n);
    });
    return out;
  }
  /* match spoken words to printed words: longest common subsequence */
  function align(sp, pr) {
    var m = sp.length, n = pr.length, L = [], i, j;
    for (i = 0; i <= m; i++) L.push(new Uint16Array(n + 1));
    for (i = m - 1; i >= 0; i--) for (j = n - 1; j >= 0; j--)
      L[i][j] = sp[i].n && sp[i].n === pr[j].n ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    i = 0; j = 0;
    while (i < m && j < n) {
      if (sp[i].n && sp[i].n === pr[j].n) { pr[j].s = sp[i].s; i++; j++; }
      else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
    }
  }
  function node(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; }
  function fmt(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  function icon() { return '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="i-play" d="M7 4.5v15l12.5-7.5z"/><path class="i-pause" d="M6.5 4.5h4v15h-4zm7 0h4v15h-4z"/></svg>'; }
  function arrow(left) { return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6">' + (left ? '<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>' : '<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/>') + '</svg>'; }
})();
