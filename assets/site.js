(function () {
  'use strict';
  var root = document.documentElement;
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function store(k, v) {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch (e) { /* storage unavailable */ }
  }

  /* ---- light / dark ---- */
  var toggle = $('#theme-toggle');
  function isDark() {
    if (root.dataset.theme) return root.dataset.theme === 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function paintToggle() {
    if (!toggle) return;
    toggle.textContent = isDark() ? 'light' : 'dark';
    toggle.setAttribute('aria-label', 'Switch to ' + toggle.textContent + ' theme');
  }
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      root.dataset.theme = next;
      store('theme', next);
      paintToggle();
    });
    paintToggle();
  }

  /* ---- copy buttons ---- */
  function copyText(text, btn) {
    function done() {
      var old = btn.textContent;
      btn.textContent = 'copied';
      btn.setAttribute('data-done', '');
      setTimeout(function () { btn.textContent = old; btn.removeAttribute('data-done'); }, 1400);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { btn.textContent = 'select + copy'; });
    } else { btn.textContent = 'select + copy'; }
  }
  $$('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = document.getElementById(btn.getAttribute('data-copy'));
      if (!target) return;
      var lines = $$('.l', target).map(function (l) { return l.textContent; }).join('\n');
      var text = target.getAttribute('data-text') || lines || target.textContent;
      copyText(text.replace(/\s+$/, ''), btn);
    });
  });

  /* ---- table of contents: mark the section being read ---- */
  var tocLinks = $$('.toc a');
  if (tocLinks.length && 'IntersectionObserver' in window) {
    var byId = {};
    tocLinks.forEach(function (a) { byId[a.getAttribute('href').slice(1)] = a; });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        tocLinks.forEach(function (a) { a.removeAttribute('aria-current'); });
        byId[en.target.id].setAttribute('aria-current', 'true');
      });
    }, { rootMargin: '-15% 0px -75% 0px' });
    Object.keys(byId).forEach(function (id) { var h = document.getElementById(id); if (h) io.observe(h); });
  }

  /* ---- live demo: the game loads from its own host only after a tap ---- */
  $$('[data-demo]').forEach(function (screen) {
    var link = $('.phone__play', screen);
    if (!link) return;
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var f = document.createElement('iframe');
      f.src = screen.getAttribute('data-demo');
      f.title = screen.getAttribute('data-title') || 'Live demo';
      f.setAttribute('allow', screen.getAttribute('data-allow') || 'fullscreen');
      f.setAttribute('allowfullscreen', '');
      screen.textContent = '';
      screen.appendChild(f);
      f.focus();
    });
  });

  /* ---- videos: silent loops with one play/pause button and a progress line ---- */
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  $$('.player').forEach(function (box) {
    var v = $('video', box);
    if (!v) return;
    v.removeAttribute('controls');
    v.muted = true; v.loop = true;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'player__btn';
    var bar = document.createElement('span'), fill = document.createElement('i');
    bar.className = 'player__bar'; bar.appendChild(fill);
    box.appendChild(bar); box.appendChild(btn);
    var wanted = !still;               /* the visitor's choice; starts as "play" unless they asked for less motion */
    function paint() { box.setAttribute('data-state', v.paused ? 'paused' : 'playing'); btn.setAttribute('aria-label', (v.paused ? 'Play' : 'Pause') + ' the video'); }
    function play() { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
    function toggle() { wanted = v.paused; if (wanted) play(); else v.pause(); }
    btn.addEventListener('click', toggle);
    v.addEventListener('click', toggle);
    v.addEventListener('play', paint); v.addEventListener('pause', paint);
    v.addEventListener('timeupdate', function () { if (v.duration) fill.style.width = (100 * v.currentTime / v.duration).toFixed(2) + '%'; });
    paint();
    /* play only while the video is on screen, so nothing downloads before it is seen */
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting && wanted) play(); else if (!e.isIntersecting) v.pause(); });
      }, { threshold: 0.35 }).observe(box);
    } else if (wanted) play();
  });

  /* ---- diagrams with steps: Back, Next and Play walk through the parts of an SVG (data-step="n").
     Without the script the whole diagram and the numbered list show. Nothing moves until the reader asks. ---- */
  $$('figure[data-steps]').forEach(function (fig) {
    var svg = $('svg', fig), items = $$('.steps__list li', fig), n = items.length;
    if (!svg || !n) return;
    var parts = $$('[data-step]', fig), at = 0, timer = null;   // the wide and the narrow drawing
    var bar = document.createElement('div'); bar.className = 'steps__bar';
    function button(label, text) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn--ghost btn--s';
      b.textContent = text; b.setAttribute('aria-label', label); bar.appendChild(b); return b;
    }
    var back = button('Previous step', '← Back'), next = button('Next step', 'Next →'), play = button('Play all steps', 'Play');
    var panel = $('.steps__panel', fig) || fig, list = $('.steps__list', fig);
    var status = document.createElement('p'); status.className = 'steps__at label'; status.setAttribute('aria-live', 'polite');
    var hint = document.createElement('p'); hint.className = 'steps__hint';
    hint.textContent = 'The whole picture. Press Next to go through it step by step, or Play.';
    panel.insertBefore(status, list); panel.insertBefore(hint, list); panel.appendChild(bar);
    fig.classList.add('steps--on');
    function show(k) {
      at = k;
      parts.forEach(function (p) {
        var s = +p.getAttribute('data-step');
        p.classList.toggle('is-later', k > 0 && s > k);
        p.classList.toggle('is-past', k > 0 && s < k && s > 0);
      });
      items.forEach(function (li, i) { li.classList.toggle('is-now', i === k - 1); });
      status.textContent = k ? 'Step ' + k + ' of ' + n : 'All ' + n + ' steps';
      hint.hidden = k !== 0;
      back.disabled = k === 0; next.disabled = k === n;
    }
    function stop() {
      if (!timer) return;
      clearInterval(timer); timer = null; play.textContent = 'Play'; play.setAttribute('aria-label', 'Play all steps');
    }
    back.addEventListener('click', function () { stop(); show(at - 1); });
    next.addEventListener('click', function () { stop(); show(at + 1); });
    play.addEventListener('click', function () {
      if (timer) { stop(); return; }
      show(1); play.textContent = 'Pause'; play.setAttribute('aria-label', 'Pause');
      timer = setInterval(function () { if (at >= n) stop(); else show(at + 1); }, 2800);
    });
    show(0);
  });

  /* ---- animated diagrams: figure.anim (styles in site.css)
     - on screen: the figure gets .is-in once, so its lines draw and its bars grow; [data-count] numbers count up.
     - data-switch="Label A|Label B": two buttons set data-state="a" / "b". With data-switch-free the state starts empty
       and a second press on the pressed button clears it.
     - [data-pick="k"] parts of the SVG become buttons that show the item li[data-k="k"] of .pick__list.
     - SVG animations (<animateMotion>) run only while the figure is on screen, with a Pause button. A visitor who asked
       for less motion gets the end state, and the moving parts stand still until Play. Without the script the figure
       shows its end state and the whole list. ---- */
  $$('figure.anim').forEach(function (fig) {
    fig.classList.add('anim--ready');
    /* a figure can hold a wide and a narrow drawing; both follow the same state */
    var svgs = $$('svg', fig).filter(function (s) { return typeof s.pauseAnimations === 'function' && $('animateMotion, animate, animateTransform', s); });
    var counts = $$('[data-count]', fig);
    var looping = svgs.length > 0;
    var bar = null;
    function getBar() {
      if (bar) return bar;
      bar = document.createElement('div'); bar.className = 'anim__bar';
      var panel = $('.pick__panel', fig), cap = $('figcaption', fig);
      if (panel) panel.appendChild(bar); else fig.insertBefore(bar, cap || null);
      return bar;
    }
    function button(text) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn--ghost btn--s';
      b.textContent = text; getBar().appendChild(b); return b;
    }

    /* counting numbers: they start at zero only when the script runs, so the page without it shows the real values */
    function fmt(el, v) { el.textContent = (el.getAttribute('data-fmt') || '{}').replace('{}', String(v)); }
    function count() {
      counts.forEach(function (el) {
        var to = +el.getAttribute('data-count'), t0 = null, dur = 1100;
        if (still) { fmt(el, to); return; }
        function tick(t) {
          if (t0 === null) t0 = t;
          var k = Math.min(1, (t - t0) / dur);
          fmt(el, Math.round(to * (1 - Math.pow(1 - k, 3))));
          if (k < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      });
    }

    /* switch between two states */
    var sw = fig.getAttribute('data-switch');
    if (sw) {
      var free = fig.hasAttribute('data-switch-free'), btns = [];
      var setState = function (k) {
        if (k) fig.setAttribute('data-state', k); else fig.removeAttribute('data-state');
        btns.forEach(function (b, i) { b.setAttribute('aria-pressed', String(['a', 'b'][i] === k)); });
      };
      sw.split('|').slice(0, 2).forEach(function (name, i) {
        var k = ['a', 'b'][i], b = button(name);
        b.addEventListener('click', function () { setState(free && fig.getAttribute('data-state') === k ? null : k); });
        btns.push(b);
      });
      setState(free ? null : 'a');
    }

    /* pick a part of the diagram to read about it */
    var picks = $$('[data-pick]', fig), items = $$('.pick__list li', fig);
    if (picks.length && items.length) {
      fig.classList.add('pick--on');
      var hint = $('.pick__hint', fig);
      var choose = function (k) {
        picks.forEach(function (p) { p.classList.toggle('is-on', p.getAttribute('data-pick') === k); });
        items.forEach(function (li) { li.classList.toggle('is-now', li.getAttribute('data-k') === k); });
        if (hint) hint.hidden = true;
      };
      picks.forEach(function (p) {
        var k = p.getAttribute('data-pick');
        var li = items.filter(function (x) { return x.getAttribute('data-k') === k; })[0], name = li && $('b', li);
        p.setAttribute('tabindex', '0'); p.setAttribute('role', 'button');
        p.setAttribute('aria-label', 'Show: ' + (name ? name.textContent : k));
        p.addEventListener('click', function () { choose(k); });
        p.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(k); } });
      });
    }

    /* SVG animations run only while the figure is on screen */
    var wanted = !still, seen = false, loopBtn = null;
    function run() { svgs.forEach(function (s) { if (wanted && seen) s.unpauseAnimations(); else s.pauseAnimations(); }); }
    function paintLoop() {
      loopBtn.textContent = wanted ? 'Pause' : 'Play';
      loopBtn.setAttribute('aria-label', (wanted ? 'Pause' : 'Play') + ' the animation');
    }
    if (looping) {
      run();
      loopBtn = button('Pause');
      loopBtn.addEventListener('click', function () { wanted = !wanted; paintLoop(); run(); });
      paintLoop();
    }

    function enter() { if (!fig.classList.contains('is-in')) { fig.classList.add('is-in'); count(); } }
    if (still || !('IntersectionObserver' in window)) { enter(); seen = true; run(); return; }
    counts.forEach(function (el) { fmt(el, 0); });
    new IntersectionObserver(function (es) {
      es.forEach(function (e) { seen = e.isIntersecting; if (seen) enter(); run(); });
    }, { threshold: 0.3 }).observe(fig);
  });

  /* ---- 404: show the path that missed ---- */
  var lost = $('#lost-path');
  if (lost) lost.textContent = location.pathname;
  /* an address below an encrypted site before the login: point to the login page of that site */
  var sealed = /^\/sealed\/([a-z0-9][a-z0-9._-]*)\//.exec(location.pathname);
  var lock = $('#lost-sealed');
  if (lost && sealed && lock) {
    $('#lost-sealed-link').setAttribute('href', '/sealed/' + sealed[1] + '/');
    lock.hidden = false;
  }
})();
