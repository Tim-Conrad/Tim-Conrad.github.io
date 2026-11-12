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
  approve.type = 'button'; approve.hidden = true;   /* only on the newest round of a branch, see updateApprove */
  var status = ui('span', 'rv-status'); status.setAttribute('role', 'status');
  /* On a narrow screen the bar is one row: the comparison and the switch. A tap on the comparison opens the selects. */
  var more = ui('div', 'rv-more'), moreToggle = ui('button', 'rv-more-toggle');
  /* the approve button is in the part that opens: on a phone, a publish takes a tap more */
  more.id = 'rv-more'; more.append(branchField.label, fromField.label, toField.label, approve);
  moreToggle.type = 'button'; moreToggle.setAttribute('aria-controls', more.id); moreToggle.setAttribute('aria-expanded', 'false');
  bar.append(moreToggle, more, sw, status);
  var versionParts = [fromField.label, toField.label, sw];
  function setOpen(open) {
    bar.classList.toggle('rv-open', open);
    document.documentElement.classList.toggle('rv-bar-open', open);
    moreToggle.setAttribute('aria-expanded', String(open));
  }
  moreToggle.addEventListener('click', function () { setOpen(!bar.classList.contains('rv-open')); });
  bar.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && bar.classList.contains('rv-open')) { setOpen(false); moreToggle.focus(); }
  });

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
        .then(function (d) { return d.html; }, function (err) { delete texts[rev]; throw err; });   /* keep no failure */
    }
    return texts[rev];
  }
  function parse(html) { return new DOMParser().parseFromString(html, 'text/html'); }

  /* ---- the version on screen: the page on disk, or the content of main of an older version ----
     Only main changes, so the header, the nav and the footer keep the listeners of site.js. A page without main
     changes its whole body. */
  var own = null;      /* {el, nodes}: the content of the page on disk while an older version is on screen */
  var shown = null;    /* the rev of the older version on screen, or null */
  function contentOf(el) {
    return Array.prototype.filter.call(el.childNodes, function (n) { return n !== bar; });
  }
  function put(el, nodes) {
    nodes.forEach(function (n) { el.insertBefore(n, el === document.body ? bar : null); });
  }
  function showOwn() {
    if (!own) return;
    contentOf(own.el).forEach(function (n) { n.remove(); });
    put(own.el, own.nodes);
    own = null; shown = null;
  }
  function showOther(rev, html) {
    if (shown === rev) return;
    if (!own) { var el = document.querySelector('main') || document.body; own = { el: el, nodes: contentOf(el) }; }
    contentOf(own.el).forEach(function (n) { n.remove(); });
    var nodes;
    if (html === null) {
      nodes = [ui('p', 'rv-missing wrap', 'This page is not in this version.')];
    } else {
      var doc = parse(html), from = own.el === document.body ? doc.body : (doc.querySelector('main') || doc.body);
      /* the scripts of the page ran once already */
      Array.prototype.forEach.call(from.querySelectorAll('script'), function (s) { s.remove(); });
      /* a copy first: adoptNode takes each node out of the live childNodes list */
      nodes = Array.prototype.slice.call(from.childNodes).map(function (n) { return document.adoptNode(n); });
    }
    put(own.el, nodes);
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

  /* ---- approve: the host checks, merges and publishes the newest round (approve-host.sh) ---- */
  var job = { state: 'idle' };   /* the status of the host, from GET /api/approve */
  var since = null;              /* the time of the request that this page sent: an older end state does not count */
  var polling = false, diffNote = '', approveNote = '';
  function newest() { return v && v.rounds.length ? v.rounds[v.rounds.length - 1] : null; }
  function updateApprove() {
    var last = newest();
    approve.hidden = !(last && v.branch !== v.base && choice.to === last.sha);   /* only a commit can ship, not Working */
    if (last) approve.textContent = 'Approve round ' + last.n;
    approve.disabled = job.state === 'running';
  }
  function showStatus() {
    var parts = [], fresh = Date.now() - Date.parse(job.time || '') < 3600 * 1000;
    if (diffNote) parts.push(diffNote);
    if (approveNote) parts.push(approveNote);
    else if (job.state === 'running') parts.push('Publishing' + (job.branch ? ' ' + job.branch : '') + ': ' + job.step + '.');
    else if (job.state === 'failed' && (fresh || (v && job.branch === v.branch))) {
      parts.push('Publishing ' + job.branch + ' failed at "' + job.step + '": ' + job.line);
    } else if (job.state === 'done' && (fresh || (v && job.branch === v.branch))) {
      parts.push('Published ' + job.branch + '.');
      if (job.pr) { var a = ui('a', '', 'Open the PR'); a.href = job.pr; parts.push(a); }
    }
    status.replaceChildren();
    parts.forEach(function (p, i) { if (i) status.append(' '); status.append(p); });
  }
  /* GET /api/approve now, then every 2 s while the host runs */
  function poll() {
    if (polling) return;
    polling = true;
    (function tick() {
      fetch(API + 'approve')
        .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
        .then(function (s) { if (s.state === 'running' || !since || (s.time && s.time >= since)) job = s; })
        .catch(function () { /* the next tick asks again */ })
        .then(function () {
          updateApprove(); showStatus();
          if (job.state === 'running') setTimeout(tick, 2000); else polling = false;
        });
    })();
  }
  approve.addEventListener('click', function () {
    var last = newest();
    if (!last || !window.confirm('Publish ' + v.branch + ' at round ' + last.n + ' to t7d.dev?')) return;
    approveNote = '';
    approve.disabled = true;
    fetch(API + 'approve', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-T7d-Review': '1' },
      body: JSON.stringify({ branch: v.branch, sha: last.sha })
    }).then(function (r) {
      return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || String(r.status)); return d; });
    }).then(function (req) {
      since = req.time;
      job = { state: 'running', step: 'wait for the host', branch: v.branch, time: req.time };
      updateApprove(); showStatus(); poll();
    }).catch(function (err) {
      approveNote = 'The approve was refused: ' + err.message + '.';
      updateApprove(); showStatus();
    });
  });

  /* ---- the bar ---- */
  var v = null, versions = [], choice = {}, run = 0;
  function onDisk() { return versions[versions.length - 1].value; }
  function nameOf(value) {
    for (var i = 0; i < versions.length; i++) if (versions[i].value === value) return versions[i].short;
    return value;
  }
  function render() {
    var mine = ++run;
    moreToggle.textContent = nameOf(choice.to) + ' vs ' + nameOf(choice.from);
    unmark();
    diffNote = '';
    updateApprove(); showStatus();
    var to = choice.to, from = choice.from;
    var shownReady = to === onDisk() ? Promise.resolve(showOwn()) : text(v.branch, to).then(function (html) {
      if (mine === run) showOther(to, html);
    });
    return shownReady.then(function () {
      if (mine !== run || !choice.show || from === to) return;
      return text(v.branch, from).then(function (html) { if (mine === run) mark(html); });
    }).catch(function () { if (mine === run) { diffNote = 'The changes cannot load.'; showStatus(); } });
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
    versions = [{ value: v.base, label: v.base, short: v.base }].concat(v.rounds.map(function (r) {
      return { value: r.sha, label: 'Round ' + r.n + ': ' + r.subject, short: 'Round ' + r.n };
    }));
    if (v.working) versions.push({ value: 'working', label: 'Working', short: 'Working' });
    if (versions.length < 2) {
      moreToggle.textContent = v.branch;
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
    document.documentElement.classList.add('rv-has-bar');
    moreToggle.textContent = 'Review';
    versionParts.forEach(function (n) { n.hidden = true; });
    fetch(API + 'versions?' + q(asked))
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (data) { versionParts.forEach(function (n) { n.hidden = false; }); return start(data); })
      .catch(function () { diffNote = 'The review server does not answer.'; showStatus(); })
      .then(function () { bar.setAttribute('data-ready', ''); poll(); });
  }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
