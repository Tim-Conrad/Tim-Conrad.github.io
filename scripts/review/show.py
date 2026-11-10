#!/usr/bin/env python3
"""Show where a review note points: open the page at the width and in the theme of the note, frame the part in red,
and save <notes>/<id>.png next to the note (it stays out of git).

    uv run --no-project --with playwright python3 scripts/review/show.py <id> [<id> ...] [--suffix after]

--suffix after writes <id>.after.png: run it after the fix and compare the two pictures. The script serves the
working tree itself (devserver.py on a free port), so it shows the files as they are now.
"""
import argparse
import json
import os
import sys
import threading
from functools import partial
from http.server import ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import devserver  # noqa: E402

FRAME = """([sel, rect, scroll]) => {
  let r = null; const n = sel && document.querySelector(sel);
  if (n) { n.scrollIntoView({ block: 'center', behavior: 'instant' }); r = n.getBoundingClientRect(); }
  else { scrollTo({ left: scroll.x || 0, top: scroll.y || 0, behavior: 'instant' });
         if (rect && rect.w) r = { left: rect.x - scrollX, top: rect.y - scrollY, width: rect.w, height: rect.h }; }
  for (const x of document.querySelectorAll('.rv-tab, .rv-panel, .rv-box')) x.remove();
  if (!r) return n ? 'found' : 'no part';
  const b = document.createElement('div'); document.body.appendChild(b);
  Object.assign(b.style, { position: 'fixed', zIndex: 2147483647, pointerEvents: 'none', border: '4px solid #e0201b',
    left: (r.left - 6) + 'px', top: (r.top - 6) + 'px', width: (r.width + 12) + 'px', height: (r.height + 12) + 'px' });
  return n ? 'found' : 'by position';
}"""


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ids", nargs="+")
    ap.add_argument("--suffix", default="")
    ap.add_argument("--notes", default=os.path.join(HERE, "..", "..", ".review", "notes"))
    a = ap.parse_args()
    from playwright.sync_api import sync_playwright

    root = os.path.normpath(os.path.join(HERE, "..", ".."))
    notes = os.path.abspath(a.notes)
    h = partial(type("H", (devserver.Handler,), {"root": root, "notes": notes}), directory=root)
    srv = ThreadingHTTPServer(("127.0.0.1", 0), h)
    srv.daemon_threads = True
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = "http://127.0.0.1:%d" % srv.server_port

    with sync_playwright() as pw:
        chrome = "/usr/bin/google-chrome"   # the system Chrome fits every Playwright version, a cached build only one
        browser = pw.chromium.launch(executable_path=chrome) if os.path.exists(chrome) else pw.chromium.launch()
        for nid in a.ids:
            path = next((p for p in (os.path.join(notes, nid + ".json"), os.path.join(notes, "done", nid + ".json")) if os.path.isfile(p)), None)
            if not path:
                print("%s: no such note" % nid)
                continue
            n = json.loads(devserver.read(path))
            vp, theme = n.get("viewport") or {}, n.get("theme") if n.get("theme") in ("light", "dark") else "light"
            ctx = browser.new_context(viewport={"width": int(vp.get("w") or 1440), "height": int(vp.get("h") or 900)},
                                      device_scale_factor=min(float(vp.get("dpr") or 1), 2), color_scheme=theme)
            ctx.add_init_script("try { localStorage.setItem('theme', %s) } catch (e) {}" % json.dumps(theme))
            page = ctx.new_page()
            page.goto(base + (n.get("path") or "/"), wait_until="networkidle")
            t = n.get("target") or {}
            how = page.evaluate(FRAME, [t.get("selector"), t.get("rect"), n.get("scroll") or {}])
            out = os.path.join(os.path.dirname(path), nid + ("." + a.suffix if a.suffix else "") + ".png")
            page.screenshot(path=out)
            ctx.close()
            print("%s: %s (%s, %s px, %s) -> %s" % (nid, n.get("note", "")[:60], n.get("path"), vp.get("w"), how, out))
        browser.close()
    srv.shutdown()


if __name__ == "__main__":
    main()
