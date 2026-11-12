// Word diff for the review site. Sets window.reviewDiff in a browser and module.exports in node.
(function () {
  "use strict";

  var BLOCK_SELECTOR = "h1, h2, h3, h4, h5, h6, p, li, dt, dd, blockquote, figcaption, td, th, pre";
  var SKIP_SELECTOR = "[data-review-ui], papercuts-widget";
  // Myers stops after this many edited tokens. The block pair then becomes "del all + add all".
  var MAX_EDITS = 1000;
  // Two blocks pair as a change when more than this share of their words is equal.
  var PAIR_RATIO = 0.4;

  function tokens(s) {
    return s.split(/(\s+)/).filter(function (t) { return t !== ""; });
  }

  function push(out, op, text) {
    var last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op: op, text: text });
  }

  // Myers shortest edit script. Returns a list of {op, text} per token, or null if more than MAX_EDITS.
  function myers(a, b) {
    var n = a.length, m = b.length, max = Math.min(n + m, MAX_EDITS);
    var off = max + 1;
    var v = new Int32Array(2 * max + 3);
    var trace = [];
    var found = -1;
    for (var d = 0; d <= max && found < 0; d++) {
      trace.push(v.slice());
      for (var k = -d; k <= d; k += 2) {
        var x;
        if (k === -d || (k !== d && v[off + k - 1] < v[off + k + 1])) x = v[off + k + 1];
        else x = v[off + k - 1] + 1;
        var y = x - k;
        while (x < n && y < m && a[x] === b[y]) { x++; y++; }
        v[off + k] = x;
        if (x >= n && y >= m) { found = d; break; }
      }
    }
    if (found < 0) return null;
    var ops = [];
    var px = n, py = m;
    for (var dd = found; dd > 0; dd--) {
      var vv = trace[dd];
      var kk = px - py;
      var prevK = (kk === -dd || (kk !== dd && vv[off + kk - 1] < vv[off + kk + 1])) ? kk + 1 : kk - 1;
      var prevX = vv[off + prevK], prevY = prevX - prevK;
      while (px > prevX && py > prevY) { px--; py--; ops.push({ op: "eq", text: a[px] }); }
      if (px === prevX) { py--; ops.push({ op: "add", text: b[py] }); }
      else { px--; ops.push({ op: "del", text: a[px] }); }
    }
    while (px > 0 && py > 0) { px--; py--; ops.push({ op: "eq", text: a[px] }); }
    return ops.reverse();
  }

  function diffWords(a, b) {
    var ta = tokens(a), tb = tokens(b);
    var lo = 0;
    while (lo < ta.length && lo < tb.length && ta[lo] === tb[lo]) lo++;
    var ha = ta.length, hb = tb.length;
    while (ha > lo && hb > lo && ta[ha - 1] === tb[hb - 1]) { ha--; hb--; }
    var mid = myers(ta.slice(lo, ha), tb.slice(lo, hb));
    if (!mid) {
      mid = ta.slice(lo, ha).map(function (t) { return { op: "del", text: t }; })
        .concat(tb.slice(lo, hb).map(function (t) { return { op: "add", text: t }; }));
    }
    var out = [];
    ta.slice(0, lo).forEach(function (t) { push(out, "eq", t); });
    mid.forEach(function (o) { push(out, o.op, o.text); });
    ta.slice(ha).forEach(function (t) { push(out, "eq", t); });
    return out;
  }

  // LCS over block texts. Returns a list of {op, a?, b?}.
  function lcsBlocks(a, b) {
    var lo = 0;
    while (lo < a.length && lo < b.length && a[lo].text === b[lo].text) lo++;
    var ha = a.length, hb = b.length;
    while (ha > lo && hb > lo && a[ha - 1].text === b[hb - 1].text) { ha--; hb--; }
    var n = ha - lo, m = hb - lo, w = m + 1;
    var t = new Uint32Array((n + 1) * w);
    for (var i = n - 1; i >= 0; i--) {
      for (var j = m - 1; j >= 0; j--) {
        t[i * w + j] = a[lo + i].text === b[lo + j].text
          ? t[(i + 1) * w + j + 1] + 1
          : Math.max(t[(i + 1) * w + j], t[i * w + j + 1]);
      }
    }
    var out = [];
    for (var p = 0; p < lo; p++) out.push({ op: "eq", a: a[p], b: b[p] });
    var x = 0, y = 0;
    while (x < n || y < m) {
      if (x < n && y < m && a[lo + x].text === b[lo + y].text) {
        out.push({ op: "eq", a: a[lo + x], b: b[lo + y] }); x++; y++;
      } else if (y >= m || (x < n && t[(x + 1) * w + y] >= t[x * w + y + 1])) {
        out.push({ op: "del", a: a[lo + x] }); x++;
      } else {
        out.push({ op: "add", b: b[lo + y] }); y++;
      }
    }
    for (var q = ha; q < a.length; q++) out.push({ op: "eq", a: a[q], b: b[hb + q - ha] });
    return out;
  }

  function wordCount(s) {
    var m = s.match(/\S+/g);
    return m ? m.length : 0;
  }

  // Share of equal words, relative to the longer of the two blocks. Returns {ratio, words}.
  function similarity(x, y) {
    var words = diffWords(x.text, y.text);
    var shared = 0;
    words.forEach(function (o) { if (o.op === "eq") shared += wordCount(o.text); });
    var longest = Math.max(wordCount(x.text), wordCount(y.text));
    return { ratio: longest ? shared / longest : 0, words: words };
  }

  function diffBlocks(a, b) {
    var raw = lcsBlocks(a, b);
    var out = [];
    var i = 0;
    while (i < raw.length) {
      if (raw[i].op === "eq") { out.push(raw[i++]); continue; }
      var dels = [], adds = [];
      while (i < raw.length && raw[i].op !== "eq") {
        if (raw[i].op === "del") dels.push(raw[i].a); else adds.push(raw[i].b);
        i++;
      }
      var next = 0;
      dels.forEach(function (d) {
        for (var k = next; k < adds.length; k++) {
          var s = similarity(d, adds[k]);
          if (s.ratio > PAIR_RATIO) {
            for (var r = next; r < k; r++) out.push({ op: "add", b: adds[r] });
            out.push({ op: "chg", a: d, b: adds[k], words: s.words });
            next = k + 1;
            return;
          }
        }
        out.push({ op: "del", a: d });
      });
      for (var r2 = next; r2 < adds.length; r2++) out.push({ op: "add", b: adds[r2] });
    }
    return out;
  }

  // Visible text of main (else body) as blocks with their elements. Uses only querySelector(All), closest and textContent.
  function blockNodes(doc) {
    var root = (doc.querySelector && (doc.querySelector("main") || doc.querySelector("body"))) || doc;
    var counts = {};
    var out = [];
    Array.prototype.forEach.call(root.querySelectorAll(BLOCK_SELECTOR), function (el) {
      if (el.closest(SKIP_SELECTOR)) return;
      // The inner blocks carry the text of a container such as blockquote > p.
      if (el.querySelector(BLOCK_SELECTOR)) return;
      var text = (el.textContent || "").replace(/\s+/g, " ").trim();
      if (!text) return;
      var tag = el.tagName.toLowerCase();
      var idx = counts[tag] || 0;
      counts[tag] = idx + 1;
      out.push({ key: tag + idx, text: text, el: el });
    });
    return out;
  }

  // The same blocks as {key, text}, for a diff.
  function blocks(doc) {
    return blockNodes(doc).map(function (b) { return { key: b.key, text: b.text }; });
  }

  var api = { blocks: blocks, blockNodes: blockNodes, diffWords: diffWords, diffBlocks: diffBlocks };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.reviewDiff = api;
})();
