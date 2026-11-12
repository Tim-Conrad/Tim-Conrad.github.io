/* The review site (scripts/review/devserver.py): live reload, the branch picker and the changes of a round.
   Never on t7d.dev. Needs window.reviewDiff from /__review/textdiff.js. */
(function () {
  'use strict';
  var API = '/__review/api/';
  var diff = window.reviewDiff;
  /* the branch of this page: ?branch= of the address, else the server uses the cookie */
  var asked = new URLSearchParams(location.search).get('branch');
  function q(branch) { return branch ? 'branch=' + encodeURIComponent(branch) : ''; }

  /* live reload: the first stamp is the page's own; a new stamp loads the page again */
  var first = null, es = new EventSource('/__review/reload?' + q(asked));
  es.onmessage = function (e) { if (first === null) first = e.data; else if (e.data !== first) location.reload(); };

  /* an element of the bar: blocks() of textdiff.js skips everything with data-review-ui */
  function ui(tag, cls, text) {
    var n = document.createElement(tag);
    n.setAttribute('data-review-ui', '');
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  function field(label, cls) {
    var l = ui('label', 'rv-field ' + (cls || '')), s = ui('select', cls ? 'rv-' + cls : '');
    l.append(ui('span', 'rv-label', label), s);
    return { label: l, select: s };
  }

  var bar = ui('div', 'rv-bar');
  bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Review');
  var branchField = field('Branch', 'branch-pick'), fromField = field('From', 'from'), toField = field('To', 'to');
  var sw = ui('label', 'rv-switch'), swBox = ui('input');
  swBox.type = 'checkbox'; sw.append(swBox, ui('span', '', 'Show changes'));
  var approve = ui('button', 'rv-approve', 'Approve');
  approve.type = 'button'; approve.hidden = true;   /* Task 6 of the review rounds connects it */
  var status = ui('span', 'rv-status'); status.setAttribute('role', 'status');
  bar.append(branchField.label, fromField.label, toField.label, sw, approve, status);
  var versionParts = [fromField.label, toField.label, sw];

  /* the choice per branch in localStorage; "last" is the newest version when it was saved */
  function load(branch) {
    try { return JSON.parse(localStorage.getItem('review-bar:' + branch)) || {}; } catch (e) { return {}; }
  }
  function save(branch, s) {
    try { localStorage.setItem('review-bar:' + branch, JSON.stringify(s)); } catch (e) { /* no storage: the choice is not kept */ }
  }

  var texts = {};   /* rev -> promise of the HTML of this page at rev, or null */
  function text(branch, rev) {
    if (!(rev in texts)) {
      texts[rev] = fetch(API + 'text?' + q(branch) + '&rev=' + encodeURIComponent(rev) + '&path=' + encodeURIComponent(location.pathname))
        .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .then(function (d) { return d.html; });
    }
    return texts[rev];
  }
  function parse(html) { return new DOMParser().parseFromString(html, 'text/html'); }

  /* ---- the version on screen: the page on disk, or the body of an older version ---- */
  var own = null;      /* the nodes of the page on disk while an older version is on screen */
  var shown = null;    /* the rev of the older version on screen, or null */
  function pageNodes() {
    return Array.prototype.filter.call(document.body.childNodes, function (n) { return n !== bar; });
  }
  function showOwn() {
    if (!own) return;
    pageNodes().forEach(function (n) { n.remove(); });
    own.forEach(function (n) { document.body.insertBefore(n, bar); });
    own = null; shown = null;
  }
  function showOther(rev, html) {
    if (shown === rev) return;
    if (!own) own = pageNodes();
    pageNodes().forEach(function (n) { n.remove(); });
    var nodes;
    if (html === null) {
      nodes = [ui('p', 'rv-missing wrap', 'This page is not in this version.')];
    } else {
      var body = parse(html).body;
      /* the scripts of the page ran once already */
      Array.prototype.forEach.call(body.querySelectorAll('script'), function (s) { s.remove(); });
      nodes = Array.prototype.map.call(body.childNodes, function (n) { return document.adoptNode(n); });
    }
    nodes.forEach(function (n) { document.body.insertBefore(n, bar); });
    shown = rev;
  }

  /* ---- the marks ---- */
  var fallbacks = [];   /* {el, nodes}: blocks with inline markup that got plain marked text */
  function unmark() {
    var parents = [];
    Array.prototype.forEach.call(document.querySelectorAll('ins.rv-add'), function (n) {
      if (parents.indexOf(n.parentNode) < 0) parents.push(n.parentNode);
      n.replaceWith.apply(n, Array.prototype.slice.call(n.childNodes));
    });
    Array.prototype.forEach.call(document.querySelectorAll('del.rv-del, .rv-gone, .rv-newpage'), function (n) {
      if (n.parentNode && parents.indexOf(n.parentNode) < 0) parents.push(n.parentNode);
      n.remove();
    });
    fallbacks.forEach(function (f) { f.el.replaceChildren.apply(f.el, f.nodes); });
    fallbacks = [];
    parents.forEach(function (p) { p.normalize(); });
  }

  /* Every text node of el, and for each character of the block text (blank runs as one space, trimmed) its node and
     offset. The block text is the text that blocks() of textdiff.js gives. */
  function textMap(el) {
    var nodes = [], at = [], text = '', blank = false;
    var walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (var t = walk.nextNode(); t; t = walk.nextNode()) {
      nodes.push(t);
      for (var i = 0; i < t.data.length; i++) {
        if (/\s/.test(t.data[i])) { if (!blank && text) { text += ' '; at.push({ node: t, off: i }); } blank = true; }
        else { text += t.data[i]; at.push({ node: t, off: i }); blank = false; }
      }
    }
    if (text.slice(-1) === ' ') { text = text.slice(0, -1); at.pop(); }
    return { nodes: nodes, at: at, text: text };
  }
  function del(textOf) { var d = document.createElement('del'); d.className = 'rv-del'; d.textContent = textOf; return d; }
  function ins() { var n = document.createElement('ins'); n.className = 'rv-add'; return n; }

  /* Put the word marks into the text nodes of el, so links and inline markup stay. */
  function markWords(el, words) {
    var map = textMap(el);
    var live = words.filter(function (w) { return w.op !== 'del'; }).map(function (w) { return w.text; }).join('');
    if (live !== map.text || !map.at.length) return markPlain(el, words);
    var edits = [], pos = 0;
    words.forEach(function (w) {
      if (w.op === 'eq') pos += w.text.length;
      else if (w.op === 'add') { edits.push({ from: pos, to: pos + w.text.length }); pos += w.text.length; }
      else edits.push({ from: pos, removed: w.text });
    });
    /* from the end to the start: a split keeps the head of a text node in that node, so earlier offsets stay true */
    for (var k = edits.length - 1; k >= 0; k--) {
      var e = edits[k];
      if (e.removed !== undefined) {
        var p = e.from < map.at.length ? map.at[e.from] : { node: map.at[map.at.length - 1].node, off: map.at[map.at.length - 1].off + 1 };
        var rest = p.node.splitText(p.off);
        rest.parentNode.insertBefore(del(e.removed), rest);
      } else {
        var s = map.at[e.from], last = map.at[e.to - 1];
        var i0 = map.nodes.indexOf(s.node), i1 = map.nodes.indexOf(last.node);
        for (var i = i1; i >= i0; i--) {
          var node = map.nodes[i];
          var a = i === i0 ? s.off : 0, b = i === i1 ? last.off + 1 : node.data.length;
          if (a >= b) continue;
          var mid = node.splitText(a);
          if (b - a < mid.data.length) mid.splitText(b - a);
          var wrap = ins();
          mid.parentNode.insertBefore(wrap, mid);
          wrap.appendChild(mid);
        }
      }
    }
  }
  /* The text of el does not match the block text: replace it with the marked text, and keep the old nodes for unmark. */
  function markPlain(el, words) {
    fallbacks.push({ el: el, nodes: Array.prototype.slice.call(el.childNodes) });
    el.replaceChildren();
    words.forEach(function (w) {
      if (w.op === 'eq') el.append(w.text);
      else if (w.op === 'del') el.append(del(w.text));
      else { var n = ins(); n.textContent = w.text; el.append(n); }
    });
  }

  function root() { return document.querySelector('main') || document.body; }
  function mark(fromHtml) {
    if (fromHtml === null) {
      var line = ui('p', 'rv-newpage', 'New page in this round');
      root().insertBefore(line, root().firstChild);
      return;
    }
    var live = diff.blockNodes(document), byKey = {};
    live.forEach(function (b) { byKey[b.key] = b.el; });
    var ops = diff.diffBlocks(diff.blocks(parse(fromHtml)), live.map(function (b) { return { key: b.key, text: b.text }; }));
    var gone = [], lastEl = null;
    function gonesBefore(el) {
      gone.forEach(function (t) { var g = ui('div', 'rv-gone', t); el.parentNode.insertBefore(g, el); });
      gone = [];
    }
    ops.forEach(function (o) {
      if (o.op === 'del') { gone.push(o.a.text); return; }
      var el = byKey[o.b.key];
      gonesBefore(el);
      if (o.op === 'chg') markWords(el, o.words);
      else if (o.op === 'add') markWords(el, [{ op: 'add', text: o.b.text }]);
      lastEl = el;
    });
    gone.forEach(function (t) {
      var g = ui('div', 'rv-gone', t);
      if (lastEl) { lastEl.after(g); lastEl = g; } else root().appendChild(g);
    });
  }

  /* ---- the bar ---- */
  var v = null, versions = [], choice = {}, run = 0;
  function onDisk() { return versions[versions.length - 1].value; }
  function render() {
    var mine = ++run;
    unmark();
    status.textContent = '';
    var to = choice.to, from = choice.from;
    var shownReady = to === onDisk() ? Promise.resolve(showOwn()) : text(v.branch, to).then(function (html) {
      if (mine === run) showOther(to, html);
    });
    return shownReady.then(function () {
      if (mine !== run || !choice.show || from === to) return;
      return text(v.branch, from).then(function (html) { if (mine === run) mark(html); });
    }).catch(function () { if (mine === run) status.textContent = 'The changes cannot load.'; });
  }
  function remember() { save(v.branch, { show: choice.show, from: choice.from, to: choice.to, last: onDisk() }); }
  function fill(select, list, value) {
    select.replaceChildren();
    list.forEach(function (o) { var n = ui('option', '', o.label); n.value = o.value; select.appendChild(n); });
    select.value = value;
  }

  function start(data) {
    v = data;
    fill(branchField.select, v.branches.map(function (b) { return { value: b, label: b }; }), v.branch);
    versions = [{ value: v.base, label: v.base }].concat(v.rounds.map(function (r) {
      return { value: r.sha, label: 'Round ' + r.n + ': ' + r.subject };
    }));
    if (v.working) versions.push({ value: 'working', label: 'Working' });
    if (versions.length < 2) {
      versionParts.forEach(function (n) { n.hidden = true; });
      return Promise.resolve();
    }
    var values = versions.map(function (o) { return o.value; });
    var saved = load(v.branch), same = saved.last === onDisk();
    choice.show = saved.show !== false;
    choice.to = same && values.indexOf(saved.to) >= 0 ? saved.to : onDisk();
    choice.from = same && values.indexOf(saved.from) >= 0 ? saved.from : values[Math.max(0, values.indexOf(choice.to) - 1)];
    fill(fromField.select, versions, choice.from);
    fill(toField.select, versions, choice.to);
    swBox.checked = choice.show;
    return render();
  }

  branchField.select.addEventListener('change', function () {
    location.href = location.pathname + '?branch=' + encodeURIComponent(branchField.select.value) + location.hash;
  });
  fromField.select.addEventListener('change', function () { choice.from = fromField.select.value; remember(); render(); });
  toField.select.addEventListener('change', function () { choice.to = toField.select.value; remember(); render(); });
  swBox.addEventListener('change', function () { choice.show = swBox.checked; remember(); render(); });

  function mount() {
    document.body.appendChild(bar);
    versionParts.forEach(function (n) { n.hidden = true; });
    fetch(API + 'versions?' + q(asked))
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (data) { versionParts.forEach(function (n) { n.hidden = false; }); return start(data); })
      .catch(function () { status.textContent = 'The review server does not answer.'; })
      .then(function () { bar.setAttribute('data-ready', ''); });
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
