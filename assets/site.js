(function () {
  'use strict';
  var root = document.documentElement;
  var DEFAULT_ACCENT = '#ffb000';
  var INK = '#0d2126';
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

  /* ---- the calculator ---- */
  var calc = $('#calc');
  function openCalc() {
    if (!calc) return;
    calc.hidden = false;
    $('#calc-close').focus();
  }
  if (calc) {
    var screen = $('#calc-screen');
    var cur = '46166', prev = null, op = null, fresh = true;
    var show = function () {
      var s = cur;
      if (s.length > 11) s = Number(s).toPrecision(6);
      screen.textContent = s;
    };
    var compute = function () {
      var a = Number(prev), b = Number(cur), r = b;
      if (op === '+') r = a + b;
      if (op === '-') r = a - b;
      if (op === '*') r = a * b;
      if (op === '/') r = b === 0 ? NaN : a / b;
      cur = isFinite(r) ? String(Math.round(r * 1e9) / 1e9) : 'Error';
      prev = null; op = null; fresh = true;
    };
    var press = function (k) {
      if (cur === 'Error' && k !== 'C') return;
      if (/^[0-9]$/.test(k)) { cur = fresh || cur === '0' ? k : cur + k; fresh = false; }
      else if (k === '.') { if (fresh) { cur = '0.'; fresh = false; } else if (cur.indexOf('.') < 0) cur += '.'; }
      else if (k === 'C') { cur = '0'; prev = null; op = null; fresh = true; }
      else if (k === '=') { if (op) compute(); }
      else { if (op && !fresh) compute(); prev = cur; op = k; fresh = true; }
      show();
    };
    var closeCalc = function () { calc.hidden = true; var i = $('#theme-color'); if (i) i.focus(); };
    $$('[data-k]', calc).forEach(function (b) {
      b.addEventListener('click', function () { press(b.getAttribute('data-k')); });
    });
    $('#calc-close').addEventListener('click', closeCalc);
    calc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeCalc(); return; }
      if (/^[0-9.+\-*/=]$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === 'c' || e.key === 'C') press('C');
    });
  }

  /* ---- site.theme_color: a setting that only parses colours ---- */
  var form = $('#env-form');
  if (form) {
    var input = $('#theme-color');
    var out = $('#env-out');
    var probe = document.createElement('canvas').getContext('2d');

    var parseColour = function (raw) {
      var v = raw.trim();
      if (/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) v = '#' + v;
      if (!v || !probe) return null;
      probe.fillStyle = '#000001'; probe.fillStyle = v; var a = probe.fillStyle;
      probe.fillStyle = '#000002'; probe.fillStyle = v; var b = probe.fillStyle;
      if (a !== b || !/^#[0-9a-f]{6}$/.test(a)) return null; /* invalid or translucent */
      return a;
    };
    var onAccent = function (hex) {
      var c = [1, 3, 5].map(function (i) {
        var x = parseInt(hex.substr(i, 2), 16) / 255;
        return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      });
      var lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      return lum > 0.3 ? INK : '#ffffff';
    };
    var say = function (text, state) { out.textContent = text; out.setAttribute('data-state', state); };
    var apply = function (hex) {
      var on = onAccent(hex);
      root.style.setProperty('--accent', hex);
      root.style.setProperty('--on-accent', on);
      store('accent', hex === DEFAULT_ACCENT ? null : hex);
      store('onAccent', hex === DEFAULT_ACCENT ? null : on);
    };
    var submit = function () {
      var raw = input.value;
      if (/[#$]\{[\s\S]*\}/.test(raw)) {
        say('Expression not evaluated. This field parses colours and nothing else. In Spring Boot Admin 2.7.7, the same input started a calculator on the server.', 'error');
        openCalc();
        return;
      }
      var hex = parseColour(raw);
      if (!hex) {
        say('"' + raw.trim().slice(0, 40) + '" is not a solid colour. Try a hex value like #6db33f or a name like tomato.', 'error');
        return;
      }
      apply(hex);
      say('Context refreshed. site.theme_color = ' + hex, 'ok');
    };
    form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    $$('[data-fill]', form).forEach(function (chip) {
      chip.addEventListener('click', function () {
        input.value = chip.getAttribute('data-fill');
        if (chip.hasAttribute('data-hold')) { input.focus(); say('Payload loaded. Press Update to send it.', 'ok'); }
        else submit();
      });
    });
    try {
      var saved = localStorage.getItem('accent');
      if (saved) input.value = saved;
    } catch (e) { /* storage unavailable */ }
  }

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

  /* ---- 404: show the path that missed ---- */
  var lost = $('#lost-path');
  if (lost) lost.textContent = location.pathname;
})();
