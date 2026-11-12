/* The review site (scripts/review/devserver.py): live reload and the note tab. Never on t7d.dev. */
(function () {
  'use strict';
  var API = '/__review/api/';

  /* live reload: the first stamp is the page's own; a new stamp loads the page again */
  var first = null, es = new EventSource('/__review/reload');
  es.onmessage = function (e) { if (first === null) first = e.data; else if (e.data !== first) location.reload(); };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }
  function theme() {
    var t = document.documentElement.dataset.theme;
    if (t === 'light' || t === 'dark') return t;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  /* a CSS selector for a part of the page: its id, else the tag path with :nth-of-type */
  function selectorOf(node) {
    var parts = [];
    for (var n = node; n && n.nodeType === 1 && n !== document.body && parts.length < 8; n = n.parentElement) {
      if (n.id) { parts.unshift('#' + CSS.escape(n.id)); return parts.join(' > '); }
      var tag = n.tagName.toLowerCase(), i = 1;
      for (var s = n.previousElementSibling; s; s = s.previousElementSibling) if (s.tagName === n.tagName) i++;
      parts.unshift(tag + ':nth-of-type(' + i + ')');
    }
    return 'body > ' + parts.join(' > ');
  }

  var tab = el('button', 'rv-tab', 'Note'), badge = el('span', 'rv-badge');
  tab.type = 'button'; tab.setAttribute('aria-haspopup', 'dialog'); tab.appendChild(badge);
  var panel = el('div', 'rv-panel'); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Note on this page'); panel.hidden = true;
  var head = el('div', 'rv-head'), title = el('strong', '', 'Note on this page'), branch = el('span', 'rv-branch'), close = el('button', 'rv-x', 'Close');
  close.type = 'button'; head.append(title, branch, close);
  var text = el('textarea', 'rv-text'); text.rows = 5; text.maxLength = 4000; text.placeholder = 'What must change? The note keeps the page, the width and the theme.';
  var partRow = el('div', 'rv-row'), pick = el('button', 'rv-btn', 'Point at a part'), part = el('span', 'rv-part'), unpick = el('button', 'rv-link', 'Remove');
  pick.type = unpick.type = 'button'; unpick.hidden = true; partRow.append(pick, part, unpick);
  var sendRow = el('div', 'rv-row'), send = el('button', 'rv-btn rv-send', 'Save note'), status = el('span', 'rv-status');
  send.type = 'button'; status.setAttribute('role', 'status'); sendRow.append(send, status);
  var listHead = el('div', 'rv-list-head', 'My notes'), list = el('ol', 'rv-list');
  panel.append(head, text, partRow, sendRow, listHead, list);
  var box = el('div', 'rv-box'); box.hidden = true;

  var target = null, selection = '';

  function state() {
    fetch(API + 'state').then(function (r) { return r.json(); }).then(function (s) {
      branch.textContent = (s.branch || 'detached') + (s.commit ? ' · ' + s.commit : '');
      badge.textContent = s.open ? String(s.open) : '';
    }).catch(function () { branch.textContent = 'no server'; });
  }
  function showList() {
    fetch(API + 'notes').then(function (r) { return r.json(); }).then(function (d) {
      list.textContent = '';
      if (!d.notes.length) { list.appendChild(el('li', 'rv-empty', 'No notes yet.')); return; }
      d.notes.slice(0, 20).forEach(function (n) {
        var li = el('li', 'rv-item rv-' + n.status);
        li.append(el('span', 'rv-meta', (n.status === 'done' ? 'Done' : 'Open') + ' · ' + (n.path || '') + ' · ' + (n.time || '').slice(0, 16).replace('T', ' ')),
          el('span', 'rv-note', n.note));
        if (n.answer) li.appendChild(el('span', 'rv-answer', n.answer));
        list.appendChild(li);
      });
    }).catch(function () { list.textContent = ''; list.appendChild(el('li', 'rv-empty', 'The notes cannot load.')); });
  }
  function open() {
    panel.hidden = false; tab.setAttribute('aria-expanded', 'true'); state(); showList();
    setTimeout(function () { text.focus(); }, 0);
  }
  function shut() { panel.hidden = true; tab.setAttribute('aria-expanded', 'false'); stopPick(); tab.focus(); }

  /* the text that is selected on the page, read before the tap on the tab can clear it */
  tab.addEventListener('pointerdown', function () { selection = String(getSelection() || '').trim().slice(0, 1000); });
  tab.addEventListener('click', function () { if (panel.hidden) open(); else shut(); });
  close.addEventListener('click', shut);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) { if (picking) stopPick(); else shut(); } });

  /* point at a part: the outline follows the pointer, a click takes that part */
  var picking = false;
  function ours(n) { return n === tab || tab.contains(n) || panel.contains(n) || n === box; }
  function frame(n) {
    var r = n.getBoundingClientRect();
    box.style.left = r.left + 'px'; box.style.top = r.top + 'px'; box.style.width = r.width + 'px'; box.style.height = r.height + 'px';
    box.hidden = false;
  }
  function onMove(e) { var n = document.elementFromPoint(e.clientX, e.clientY); if (n && !ours(n)) frame(n); }
  function onPick(e) {
    var n = document.elementFromPoint(e.clientX, e.clientY);
    if (!n || ours(n)) return;
    e.preventDefault(); e.stopPropagation();
    var r = n.getBoundingClientRect();
    target = { selector: selectorOf(n), text: (n.innerText || n.alt || '').trim().replace(/\s+/g, ' ').slice(0, 300),
      rect: { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), w: Math.round(r.width), h: Math.round(r.height) } };
    part.textContent = target.text ? '“' + target.text.slice(0, 60) + '”' : target.selector;
    unpick.hidden = false; stopPick(); frame(n); panel.hidden = false; text.focus();
  }
  function stopPick() {
    if (!picking) return;
    picking = false; document.documentElement.classList.remove('rv-picking'); pick.textContent = 'Point at a part';
    document.removeEventListener('pointermove', onMove, true); document.removeEventListener('click', onPick, true);
    if (!target) box.hidden = true;
  }
  pick.addEventListener('click', function () {
    if (picking) return stopPick();
    picking = true; document.documentElement.classList.add('rv-picking'); pick.textContent = 'Click a part (Esc stops)';
    panel.hidden = true;
    document.addEventListener('pointermove', onMove, true); document.addEventListener('click', onPick, true);
  });
  unpick.addEventListener('click', function () { target = null; part.textContent = ''; unpick.hidden = true; box.hidden = true; });

  send.addEventListener('click', function () {
    var note = text.value.trim();
    if (!note) { status.textContent = 'Write the note first.'; text.focus(); return; }
    send.disabled = true; status.textContent = 'Saving …';
    var body = { note: note, path: location.pathname + location.hash, title: document.title, theme: theme(), selection: selection,
      viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio }, scroll: { x: Math.round(scrollX), y: Math.round(scrollY) },
      target: target, agent: navigator.userAgent };
    fetch(API + 'notes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-T7d-Review': '1' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || r.status); return d; }); })
      .then(function (d) {
        status.textContent = 'Saved (' + d.id + ').';
        text.value = ''; selection = ''; target = null; part.textContent = ''; unpick.hidden = true; box.hidden = true;
        state(); showList();
      })
      .catch(function (err) { status.textContent = 'Not saved: ' + err.message + '. The text stays here.'; })
      .then(function () { send.disabled = false; });
  });

  function mount() { document.body.append(tab, panel, box); state(); }
  if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
})();
