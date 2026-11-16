// Prints the narration script of a thought as JSON, read from the page itself by assets/narration.js in headless
// Chromium, so the text matches the characters that narration.js times (narration.json "timing").
//
//   node scripts/narration/script.mjs thoughts/encrypted-patches > script.json
//
// Output: {"segs": [{"text", "pause", "say", "id"}], "T": "<the whole script, segments joined by two newlines>"}.
// Needs node 22 (built-in WebSocket) and chromium on PATH. No dependencies.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const page = (process.argv[2] || "").replace(/^\/+|\/+$/g, "");
if (!page) { console.error("usage: node scripts/narration/script.mjs thoughts/<slug>"); process.exit(2); }

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".png": "image/png", ".jpg": "image/jpeg" };
const server = createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, path.normalize(p));
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" }).end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = `http://127.0.0.1:${server.address().port}/${page}/`;

const profile = await mkdtemp(path.join(tmpdir(), "narr-chrome-"));
const chrome = spawn(process.env.CHROMIUM || "chromium", ["--headless=new", "--no-sandbox", "--disable-gpu",
  "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((resolve, reject) => {
  let buf = "";
  chrome.stderr.on("data", (d) => { buf += d; const m = /ws:\/\/\S+/.exec(buf); if (m) resolve(m[0]); });
  chrome.on("exit", (c) => reject(new Error("chromium exited " + c + "\n" + buf)));
});

const done = async (code) => {
  const exited = new Promise((r) => chrome.once("exit", r));
  chrome.kill(); server.close(); await exited;
  await rm(profile, { recursive: true, force: true, maxRetries: 5 }); process.exit(code);
};
try {
  const browser = new WebSocket(wsUrl);
  await new Promise((r, j) => { browser.onopen = r; browser.onerror = j; });
  let id = 0; const wait = new Map();
  let loaded; const load = new Promise((r) => { loaded = r; });
  browser.onmessage = (e) => { const m = JSON.parse(e.data);
    if (m.method === "Page.loadEventFired") loaded();
    if (wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id); } };
  const send = (method, params = {}, sessionId) => new Promise((r) => { const i = ++id; wait.set(i, r);
    browser.send(JSON.stringify({ id: i, method, params, sessionId })); });

  const { result: { targetId } } = await send("Target.createTarget", { url: "about:blank" });
  const { result: { sessionId } } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Page.enable", {}, sessionId);
  await send("Page.navigate", { url }, sessionId);
  await load;
  // the same steps as init() and spokenText() in assets/narration.js, on the blocks that it marked .narr-seg
  const expr = `new Promise((resolve, reject) => {
    const t0 = Date.now();
    (function poll() {
      const art = document.querySelector("article.prose[data-narration]");
      const segs = art ? art.querySelectorAll(".narr-seg") : [];
      if (!segs.length) { if (Date.now() - t0 > 15000) reject(new Error(art ? "narration.js did not run" : "no article[data-narration]")); else setTimeout(poll, 100); return; }
      fetch(art.getAttribute("data-narration")).then((r) => r.json()).then((N) => {
        const spokenText = (el) => { const c = el.cloneNode(true);
          c.querySelectorAll('a[href^="#s"], .say-k').forEach((x) => x.remove());
          return c.textContent.replace(/\\s+/g, " "); };
        const out = Array.from(segs).map((el) => { const say = el.closest(".say");
          return { id: el.id || (say && say.id) || "", say: !!say, pause: say ? +(say.getAttribute("data-pause") || 0) : 0,
            text: ((N.spoken || {})[el.id] || spokenText(el)).trim() }; });
        resolve(JSON.stringify({ segs: out, T: out.map((s) => s.text).join("\\n\\n") }));
      }, reject);
    })();
  })`;
  const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.error) throw new Error(r.error.message);
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "evaluate failed");
  process.stdout.write(r.result.result.value + "\n");
  await done(0);
} catch (e) { console.error(String(e.stack || e)); await done(1); }
