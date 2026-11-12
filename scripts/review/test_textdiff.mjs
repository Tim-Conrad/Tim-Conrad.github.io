import test from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";

const { blocks, diffWords, diffBlocks } = createRequire(import.meta.url)("./textdiff.js");

test("diffWords marks a changed word", () => {
  assert.deepStrictEqual(diffWords("a b c", "a x c"), [
    { op: "eq", text: "a " },
    { op: "del", text: "b" },
    { op: "add", text: "x" },
    { op: "eq", text: " c" },
  ]);
});

test("diffWords gives one eq for equal input", () => {
  assert.deepStrictEqual(diffWords("a b c", "a b c"), [{ op: "eq", text: "a b c" }]);
});

test("diffWords gives one add from empty text", () => {
  assert.deepStrictEqual(diffWords("", "a b"), [{ op: "add", text: "a b" }]);
});

test("diffWords gives one del to empty text", () => {
  assert.deepStrictEqual(diffWords("a b", ""), [{ op: "del", text: "a b" }]);
});

const words = (n, tag) => Array.from({ length: n }, (_, i) => `${tag}${i}`).join(" ");

test("diffWords: 10k words with a few edits finishes in under 500 ms", () => {
  const a = words(10000, "w");
  const b = a.replace("w100 ", "x ").replace("w5000 ", "").replace("w9000", "w9000 y z");
  const t0 = performance.now();
  const ops = diffWords(a, b);
  assert.ok(performance.now() - t0 < 500);
  assert.ok(ops.some((o) => o.op === "add") && ops.some((o) => o.op === "del"));
  const rebuilt = ops.filter((o) => o.op !== "del").map((o) => o.text).join("");
  assert.strictEqual(rebuilt, b);
});

test("diffWords: two fully different 10k texts finish in under 500 ms", () => {
  const a = words(10000, "a");
  const b = words(10000, "b");
  const t0 = performance.now();
  const ops = diffWords(a, b);
  assert.ok(performance.now() - t0 < 500);
  assert.deepStrictEqual(ops, [{ op: "del", text: a }, { op: "add", text: b }]);
});

const blk = (key, text) => ({ key, text });

test("diffBlocks pairs a changed paragraph as chg and keeps a new one as add", () => {
  const a = [blk("p0", "one two three four five"), blk("p1", "stay the same")];
  const b = [
    blk("p0", "one two three four six"),
    blk("p1", "stay the same"),
    blk("p2", "completely new text here"),
  ];
  const ops = diffBlocks(a, b);
  assert.deepStrictEqual(ops.map((o) => o.op), ["chg", "eq", "add"]);
  assert.strictEqual(ops[0].a.key, "p0");
  assert.strictEqual(ops[0].b.text, "one two three four six");
  assert.ok(ops[0].words.some((w) => w.op === "del" && w.text === "five"));
  assert.strictEqual(ops[2].b.key, "p2");
});

test("diffBlocks keeps del and add apart when less than 40 % is shared", () => {
  const ops = diffBlocks([blk("p0", "alpha beta gamma delta")], [blk("p0", "alpha one two three")]);
  assert.deepStrictEqual(ops.map((o) => o.op), ["del", "add"]);
});

// A minimal fake element tree. It supports only what blocks() uses.
function el(tagName, children = [], parent = null) {
  const node = {
    tagName: tagName.toUpperCase(), children, parent, attrs: {},
    get textContent() {
      return this.children.map((c) => (typeof c === "string" ? c : c.textContent)).join("");
    },
    closest(sel) {
      const parts = sel.split(",").map((s) => s.trim());
      for (let n = this; n; n = n.parent) {
        if (parts.some((p) => (p.startsWith("[") ? p.slice(1, -1) in n.attrs : p === n.tagName.toLowerCase()))) return n;
      }
      return null;
    },
    all(sel) {
      const tags = sel.split(",").map((s) => s.trim().toUpperCase());
      const out = [];
      const walk = (n) => n.children.forEach((c) => {
        if (typeof c === "string") return;
        if (tags.includes(c.tagName)) out.push(c);
        walk(c);
      });
      walk(this);
      return out;
    },
    querySelectorAll(sel) { return this.all(sel); },
    querySelector(sel) { return this.all(sel)[0] || null; },
  };
  children.forEach((c) => { if (typeof c !== "string") c.parent = node; });
  return node;
}

test("blocks reads main, numbers tags, and skips review UI and papercuts", () => {
  const bar = el("p", ["review bar text"]);
  bar.attrs["data-review-ui"] = "";
  const inWidget = el("p", ["widget text"]);
  const widget = el("papercuts-widget", [inWidget]);
  const quote = el("blockquote", [el("p", ["quoted"])]);
  const main = el("main", [
    el("h1", ["Title"]),
    el("p", ["First  line\n here"]),
    el("p", ["  "]),
    el("p", ["Second"]),
    quote,
    bar,
    widget,
  ]);
  const outside = el("p", ["outside main"]);
  const body = el("body", [outside, main]);
  assert.deepStrictEqual(blocks(body), [
    { key: "h10", text: "Title" },
    { key: "p0", text: "First line here" },
    { key: "p1", text: "Second" },
    { key: "p2", text: "quoted" },
  ]);
});
