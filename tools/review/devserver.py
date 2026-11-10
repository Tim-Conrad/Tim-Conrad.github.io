#!/usr/bin/env python3
"""Review server for the site: live reload and notes. Only the review site uses it. GitHub Pages serves t7d.dev.

    python3 tools/review/devserver.py [--root .] [--notes .review/notes] [--host 127.0.0.1] [--port 8000]

- Serves the repository root with Cache-Control: no-cache. A missing page gets /404.html with status 404.
- Every HTML page gets /__review/review.css and /__review/review.js. The page CSP gets connect-src 'self', so the
  script can reach this server. Nothing else in the CSP changes, so the review site keeps the rules of the real site.
- /__review/reload: server-sent events. The stamp changes when a file of the site changes, is added or is deleted.
  The page then loads again.
- /__review/api/state: the branch and the commit of the clone, and the number of open notes.
- /__review/api/notes: GET lists the notes, open and done. POST writes one note as <notes>/<id>.json. The POST needs
  the header X-T7d-Review and a JSON body: a plain form from another site cannot send either. A handled note goes to
  <notes>/done/ with an "answer" field. The page shows the answer under "My notes".
- /llms.txt and /blog/feed.xml are made on each request by tools/gen-feeds.py, as the deploy makes them for gh-pages.
- /.git, /.review, /.reels and /node_modules are not served.
"""
import argparse
import importlib.util
import json
import os
import re
import secrets
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
PREFIX = "/__review/"
ASSETS = {"review.js": "text/javascript; charset=utf-8", "review.css": "text/css; charset=utf-8"}
HIDDEN = (".git", ".review", ".reels", "node_modules", "__pycache__")
MAX_BODY = 32 * 1024
MAX_NOTE = 4000
NOTE_ID = re.compile(r"^\d{8}-\d{6}-[0-9a-f]{6}$")
GENERATED = {"/llms.txt": "text/plain; charset=utf-8", "/blog/feed.xml": "application/rss+xml; charset=utf-8"}


def gen_feeds():
    """tools/gen-feeds.py as a module (its file name has a hyphen)."""
    spec = importlib.util.spec_from_file_location("gen_feeds", os.path.join(HERE, "..", "gen-feeds.py"))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


CSP = re.compile(r'(<meta\s+http-equiv="Content-Security-Policy"\s+content=")([^"]*)(")', re.I)


def read(path):
    with open(path, encoding="utf-8") as f:
        return f.read()


def stamp(root):
    """The newest change below root, as a string: the mtime of each file and the number of files."""
    newest, count = 0.0, 0
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x not in HIDDEN]
        for f in files:
            try:
                newest = max(newest, os.stat(os.path.join(d, f)).st_mtime)
                count += 1
            except OSError:
                pass   # removed during the walk
    return "%.3f-%d" % (newest, count)


def git_state(root):
    """{branch, commit} of the clone from .git, without the git binary (the container has none)."""
    g = os.path.join(root, ".git")
    try:
        head = read(os.path.join(g, "HEAD")).strip()
    except OSError:
        return {"branch": None, "commit": None}
    if not head.startswith("ref: "):
        return {"branch": None, "commit": head[:7]}
    ref = head[5:]
    commit = None
    try:
        commit = read(os.path.join(g, ref)).strip()
    except OSError:
        try:
            for line in read(os.path.join(g, "packed-refs")).splitlines():
                if line.rstrip().endswith(" " + ref):
                    commit = line.split()[0]
        except OSError:
            pass
    return {"branch": ref.rsplit("refs/heads/", 1)[-1], "commit": commit[:7] if commit else None}


def inject(html):
    """The page with the review assets, and connect-src 'self' in its CSP."""
    def csp(m):
        policy = m.group(2)
        if "connect-src" not in policy:
            policy = policy.rstrip("; ") + "; connect-src 'self'"
        return m.group(1) + policy + m.group(3)
    html = CSP.sub(csp, html, count=1)
    link = '<link rel="stylesheet" href="%sreview.css">' % PREFIX
    script = '<script src="%sreview.js" defer></script>' % PREFIX
    html = html.replace("</head>", link + "\n" + script + "\n</head>", 1) if "</head>" in html else link + script + html
    return html


def clean_note(d):
    """The stored note from a POST body, or a ValueError. Only known fields, with limits."""
    if not isinstance(d, dict):
        raise ValueError("the body is not a JSON object")
    note = d.get("note")
    if not isinstance(note, str) or not note.strip() or len(note) > MAX_NOTE:
        raise ValueError("note: 1 to %d characters" % MAX_NOTE)

    def text(k, n):
        v = d.get(k)
        return v[:n] if isinstance(v, str) else None

    def num(v):
        return round(float(v), 1) if isinstance(v, (int, float)) and not isinstance(v, bool) else None

    out = {"note": note.strip(), "path": text("path", 500), "title": text("title", 200), "theme": text("theme", 10),
           "selection": text("selection", 1000), "agent": text("agent", 300)}
    for k in ("viewport", "scroll"):
        v = d.get(k)
        out[k] = {a: num(v.get(a)) for a in ("w", "h", "x", "y", "dpr") if a in v} if isinstance(v, dict) else None
    t = d.get("target")
    if isinstance(t, dict):
        r = t.get("rect") if isinstance(t.get("rect"), dict) else {}
        out["target"] = {"selector": t["selector"][:500] if isinstance(t.get("selector"), str) else None,
                         "text": t["text"][:300] if isinstance(t.get("text"), str) else None,
                         "rect": {a: num(r.get(a)) for a in ("x", "y", "w", "h")}}
    else:
        out["target"] = None
    return out


class Handler(SimpleHTTPRequestHandler):
    root = "."
    notes = ".review/notes"

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass   # quiet: the reload stream would fill the log

    def hidden(self):
        parts = self.path.split("?", 1)[0].split("/")
        return any(p in HIDDEN for p in parts)

    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_page(self, path, code=200):
        body = inject(read(path)).encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = self.path.split("?", 1)[0]
        if url.startswith(PREFIX):
            return self.review_get(url[len(PREFIX):])
        if self.hidden():
            return self.not_found()
        if url in GENERATED:
            return self.send_generated(url)
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            if not url.endswith("/"):
                self.send_response(301)
                self.send_header("Location", url + "/")
                self.end_headers()
                return
            path = os.path.join(path, "index.html")
        if path.endswith(".html"):
            return self.send_page(path) if os.path.isfile(path) else self.not_found()
        if not os.path.isfile(path):
            return self.not_found()
        return super().do_GET()

    def send_generated(self, url):
        body = gen_feeds().build(self.root)[url.lstrip("/")].encode()
        self.send_response(200)
        self.send_header("Content-Type", GENERATED[url])
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def not_found(self):
        page = os.path.join(self.root, "404.html")
        if os.path.isfile(page):
            return self.send_page(page, 404)
        self.send_error(404)

    def review_get(self, name):
        if name in ASSETS:
            with open(os.path.join(HERE, name), "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", ASSETS[name])
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return self.wfile.write(body)
        if name == "reload":
            return self.reload()
        if name == "api/state":
            return self.send_json(200, {**git_state(self.root), "open": len(self.list_notes("open"))})
        if name == "api/notes":
            return self.send_json(200, {"notes": self.list_notes("open") + self.list_notes("done")})
        self.send_error(404)

    def reload(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        last, beat = None, 0.0
        try:
            while True:
                now = stamp(self.root)
                if now != last or time.time() - beat > 15:
                    self.wfile.write(("data: %s\n\n" % now).encode())
                    self.wfile.flush()
                    last, beat = now, time.time()
                time.sleep(0.5)
        except (BrokenPipeError, ConnectionResetError):
            pass   # the page closed

    def list_notes(self, status):
        d = self.notes if status == "open" else os.path.join(self.notes, "done")
        out = []
        try:
            names = sorted(os.listdir(d), reverse=True)
        except OSError:
            return out
        for f in names:
            if not (f.endswith(".json") and NOTE_ID.match(f[:-5])):
                continue
            try:
                n = json.loads(read(os.path.join(d, f)))
            except (OSError, ValueError):
                continue
            out.append({"id": f[:-5], "status": status, "time": n.get("time"), "path": n.get("path"),
                        "note": n.get("note", "")[:200], "answer": n.get("answer") if status == "done" else None})
        return out

    def do_POST(self):
        if self.path.split("?", 1)[0] != PREFIX + "api/notes":
            return self.send_error(404)
        if not self.headers.get("X-T7d-Review") or "application/json" not in (self.headers.get("Content-Type") or ""):
            return self.send_json(403, {"error": "the review page sends notes"})
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BODY:
            return self.send_json(413, {"error": "the note is too large"})
        try:
            note = clean_note(json.loads(self.rfile.read(n)))
        except ValueError as e:
            return self.send_json(400, {"error": str(e)})
        note.update(git_state(self.root))
        note["time"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        nid = time.strftime("%Y%m%d-%H%M%S-") + secrets.token_hex(3)
        os.makedirs(self.notes, exist_ok=True)
        tmp = os.path.join(self.notes, "." + nid + ".tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump({"id": nid, **note}, f, ensure_ascii=False, indent=1)
        os.replace(tmp, os.path.join(self.notes, nid + ".json"))
        self.send_json(201, {"id": nid})


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=os.path.normpath(os.path.join(HERE, "..", "..")))
    ap.add_argument("--notes", default=None, help="the notes folder (default: <root>/.review/notes)")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    handler = partial(type("H", (Handler,), {"root": root, "notes": os.path.abspath(a.notes or os.path.join(root, ".review", "notes"))}),
                      directory=root)
    srv = ThreadingHTTPServer((a.host, a.port), handler)
    srv.daemon_threads = True
    print("review site: http://%s:%d (root %s)" % (a.host, a.port, root), flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
