#!/usr/bin/env python3
"""Review server for the site: live reload and the rounds of a branch. Only the review site uses it. GitHub Pages serves t7d.dev.

    python3 scripts/review/devserver.py [--root .] [--host 127.0.0.1] [--port 8000]

- Serves the repository root with Cache-Control: no-cache. A missing page gets /404.html with status 404.
- Every HTML page gets /__review/review.css, /__review/textdiff.js and /__review/review.js. The page CSP gets connect-src 'self', so the
  script can reach this server. Nothing else in the CSP changes, so the review site keeps the rules of the real site.
- /__review/reload: server-sent events. The stamp changes when a file of the site changes, is added or is deleted.
  The page then loads again.
- The branch comes from ?branch=<name>, else the cookie review_branch, else the branch of the main clone. A page with a
  valid ?branch= sets the cookie. An unknown branch gives the main clone. Pages come from the worktree of that branch.
- /__review/api/state: the branch and the commit of the chosen worktree,.
- /__review/api/versions?branch=<b>: the branches, the rounds of the branch since master, and if the worktree has changes.
- /__review/api/text?branch=<b>&rev=<working|master|sha>&path=<site path>: the HTML of a page at that revision, or null.
- POST /__review/api/approve with the header X-T7d-Review and JSON {branch, sha}: writes the approve request of the newest
  round (approve.py) to --approve. GET /__review/api/approve: the status that the host writes to --approve-status.
  This request is the only file that the server writes.
- Env PAPERCUTS_URL (the relay of the papercuts widget): each page gets its script tag, and the origin of the URL goes into
  script-src, connect-src and img-src of the CSP. Without it, the page has no widget.
- /llms.txt, /thoughts/feed.xml and /blog/feed.xml are made on each request by scripts/gen-feeds.py, as the deploy makes them for gh-pages.
- /.git, /.review, /.reels and /node_modules are not served.
"""
import argparse
import importlib.util
import json
import os
import re
import sys
import time
import urllib.parse
from html import escape as html_escape
from functools import partial
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import approve  # noqa: E402
import gitread  # noqa: E402
from gitread import HIDDEN  # noqa: E402
PREFIX = "/__review/"
COOKIE = "review_branch"
BASE = "master"
ASSETS = {"review.js": "text/javascript; charset=utf-8", "textdiff.js": "text/javascript; charset=utf-8",
          "review.css": "text/css; charset=utf-8"}
GENERATED = {"/llms.txt": "text/plain; charset=utf-8", "/thoughts/feed.xml": "application/rss+xml; charset=utf-8",
             "/blog/feed.xml": "application/rss+xml; charset=utf-8"}


def gen_feeds():
    """scripts/gen-feeds.py as a module (its file name has a hyphen)."""
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


def git_state(path):
    """{branch, commit} of the checkout at path."""
    return gitread.head(path)


def add_source(policy, directive, origin):
    """The policy with origin in the directive: appended if the directive exists, else a new one that keeps 'self'."""
    m = re.search(r"(^|;\s*)%s\s+([^;]*)" % directive, policy)
    if m:
        return policy[:m.end()] + " " + origin + policy[m.end():]
    return policy.rstrip("; ") + "; %s 'self' %s" % (directive, origin)


def inject(html, widget=None, branch="", commit=""):
    """The page with the review assets, and connect-src 'self' in its CSP.
    With widget (the URL of the papercuts relay), the page also gets the widget tag and the relay in the CSP."""
    origin = None
    if widget:
        u = urllib.parse.urlsplit(widget)
        origin = "%s://%s" % (u.scheme, u.netloc)

    def csp(m):
        policy = m.group(2)
        if "connect-src" not in policy:
            policy = policy.rstrip("; ") + "; connect-src 'self'"
        if origin:
            for d in ("script-src", "connect-src", "img-src"):
                policy = add_source(policy, d, origin)
        return m.group(1) + policy + m.group(3)
    html = CSP.sub(csp, html, count=1)
    link = '<link rel="stylesheet" href="%sreview.css">' % PREFIX
    # textdiff.js first: deferred scripts run in order, and review.js uses window.reviewDiff.
    script = '<script src="%stextdiff.js" defer></script>\n<script src="%sreview.js" defer></script>' % (PREFIX, PREFIX)
    if widget:
        script += '\n<script src="%s/papercuts.js" data-repo="Tim-Conrad/Tim-Conrad.github.io" data-branch="%s" data-commit="%s"></script>' % (
            html_escape(widget.rstrip("/")), html_escape(branch), html_escape(commit))
    html = html.replace("</head>", link + "\n" + script + "\n</head>", 1) if "</head>" in html else link + script + html
    return html


class Handler(SimpleHTTPRequestHandler):
    root = "."
    widget = None   # the URL of the papercuts relay, or None for no widget
    worktrees = None   # the folder that holds the site worktrees, or None for any
    approve_dir = None   # the folder of the approve request, default <root>/.review/approve
    status_dir = None    # the folder of the approve status, default <root>/.review/approve-status

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass   # quiet: the reload stream would fill the log

    def hidden(self):
        parts = urllib.parse.unquote(self.path.split("?", 1)[0]).split("/")
        return any(p in HIDDEN for p in parts)

    def servable(self, path):
        """True if path is a file or folder inside the chosen worktree, with no hidden folder in its real path.
        A symlink in the worktree cannot lead out of it or into .git."""
        base = os.path.realpath(self.wt)
        real = os.path.realpath(path)
        if not real.startswith(base + os.sep):
            return real == base
        return not any(p in HIDDEN for p in os.path.relpath(real, base).split(os.sep))

    def allowed(self, path):
        """A worktree is offered if it is a folder, and below self.worktrees when that is set."""
        if not os.path.isdir(path):
            return False
        if not self.worktrees:
            return True
        return os.path.realpath(path).startswith(os.path.realpath(self.worktrees) + os.sep)

    def pick(self):
        """Choose the branch of this request. Sets self.branch, self.wt (its worktree path), self.names,
        self.cookie_branch (a valid ?branch= to remember) and self.bad_branch (a ?branch= that is invalid or unknown)."""
        main = gitread.head(self.root)["branch"]
        found = {w["branch"]: w["path"] for w in gitread.worktrees(self.root) if self.allowed(w["path"])}
        if main:
            found[main] = self.root
        self.names = ([main] if main else []) + [b for b in found if b != main]
        queried = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get("branch")
        self.cookie_branch, self.bad_branch = None, False
        want = None
        if queried:
            if gitread.valid_branch(queried[0]) and queried[0] in found:
                want = self.cookie_branch = queried[0]
            else:
                self.bad_branch = True
        else:
            try:
                value = SimpleCookie(self.headers.get("Cookie") or "")[COOKIE].value
            except (KeyError, ValueError):
                value = None
            if value and gitread.valid_branch(value) and value in found:
                want = value
        self.branch = want or main
        self.wt = found.get(want) or self.root

    def query(self, name):
        return urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get(name, [None])[0]

    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_page(self, path, code=200):
        state = git_state(self.wt)
        body = inject(read(path), self.widget, state.get("branch") or "", state.get("commit") or "").encode()
        self.send_response(code)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        if self.cookie_branch:
            self.send_header("Set-Cookie", "%s=%s; Path=/; SameSite=Strict" % (COOKIE, self.cookie_branch))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = self.path.split("?", 1)[0]
        self.pick()
        self.directory = self.wt   # SimpleHTTPRequestHandler serves from this folder
        if url.startswith(PREFIX):
            return self.review_get(url[len(PREFIX):])
        if self.hidden():
            return self.not_found()
        if url in GENERATED:
            return self.send_generated(url)
        path = self.translate_path(self.path)
        if not self.servable(path):
            return self.not_found()
        if os.path.isdir(path):
            if not url.endswith("/"):
                self.send_response(301)
                self.send_header("Location", url + "/")
                self.end_headers()
                return
            path = os.path.join(path, "index.html")
            if not self.servable(path):
                return self.not_found()
        if path.endswith(".html"):
            return self.send_page(path) if os.path.isfile(path) else self.not_found()
        if not os.path.isfile(path):
            return self.not_found()
        return super().do_GET()

    def send_generated(self, url):
        body = gen_feeds().build(self.wt)[url.lstrip("/")].encode()
        self.send_response(200)
        self.send_header("Content-Type", GENERATED[url])
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def not_found(self):
        page = os.path.join(self.wt, "404.html")
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
            return self.send_json(200, git_state(self.wt))
        if name == "api/versions":
            return self.versions()
        if name == "api/text":
            return self.text()
        if name == "api/approve":
            return self.send_json(200, approve.read_status(self.status_dir or os.path.join(self.root, ".review", "approve-status")))
        self.send_error(404)

    def versions(self):
        if self.bad_branch:
            return self.send_json(400, {"error": "unknown branch"})
        return self.send_json(200, {"branch": self.branch, "branches": self.names, "base": BASE,
                                    "rounds": gitread.rounds(self.root, self.branch, BASE) if self.branch else [],
                                    "working": gitread.dirty(self.wt)})

    def text(self):
        if self.bad_branch:
            return self.send_json(400, {"error": "unknown branch"})
        rev, path = self.query("rev"), self.query("path")
        shas = [r["sha"] for r in gitread.rounds(self.root, self.branch, BASE)] if self.branch else []
        if rev not in ("working", BASE, *shas):
            return self.send_json(400, {"error": "unknown rev"})
        rel = (path or "").lstrip("/") if (path or "").startswith("/") else None
        if rel is not None and (rel == "" or rel.endswith("/")):
            rel += "index.html"
        if rel is None or not gitread.valid_path(rel):
            return self.send_json(400, {"error": "bad path"})
        try:
            if rev == "working":
                full = os.path.join(self.wt, rel)
                html = read(full) if self.servable(full) and os.path.isfile(full) else None
            else:
                html = gitread.show(self.root, rev, rel)
        except UnicodeDecodeError:
            html = None   # a binary file
        return self.send_json(200, {"html": html})

    def reload(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        last, beat = None, 0.0
        try:
            while True:
                now = stamp(self.wt)
                if now != last or time.time() - beat > 15:
                    self.wfile.write(("data: %s\n\n" % now).encode())
                    self.wfile.flush()
                    last, beat = now, time.time()
                time.sleep(0.5)
        except (BrokenPipeError, ConnectionResetError):
            pass   # the page closed

    def do_POST(self):
        if self.path.split("?", 1)[0] != PREFIX + "api/approve":
            return self.send_error(404)
        # A page of another site cannot send this header without a CORS preflight, which this server never allows.
        if not self.headers.get("X-T7d-Review"):
            return self.send_json(403, {"error": "the header X-T7d-Review is missing"})
        try:
            size = int(self.headers.get("Content-Length") or 0)
            if not 0 < size <= 4096:
                raise ValueError
            body = json.loads(self.rfile.read(size))
            branch, sha = body["branch"], body["sha"]
        except (ValueError, KeyError, TypeError):
            return self.send_json(400, {"error": "the body must be JSON with branch and sha"})
        offered = {w["branch"] for w in gitread.worktrees(self.root) if self.allowed(w["path"])}
        if not isinstance(branch, str) or branch not in offered:
            return self.send_json(400, {"error": "unknown branch"})
        try:
            req = approve.write_request(self.root, self.approve_dir or os.path.join(self.root, ".review", "approve"),
                                        branch, sha, "button")
        except approve.Refused as e:
            return self.send_json(e.code, {"error": e.message})
        return self.send_json(200, req)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--root", default=os.path.normpath(os.path.join(HERE, "..", "..")))
    ap.add_argument("--worktrees", default=os.environ.get("REVIEW_WORKTREES"),
                    help="offer only the worktrees below this folder (default: env REVIEW_WORKTREES, else any)")
    ap.add_argument("--approve", help="the folder of the approve request (default: <root>/.review/approve)")
    ap.add_argument("--approve-status", help="the folder of the approve status (default: <root>/.review/approve-status)")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8000)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    handler = partial(type("H", (Handler,), {"root": root, "worktrees": a.worktrees and os.path.abspath(a.worktrees),
                                       "widget": os.environ.get("PAPERCUTS_URL") or None,
                                       "approve_dir": a.approve and os.path.abspath(a.approve),
                                       "status_dir": a.approve_status and os.path.abspath(a.approve_status)}),
                      directory=root)
    srv = ThreadingHTTPServer((a.host, a.port), handler)
    srv.daemon_threads = True
    print("review site: http://%s:%d (root %s)" % (a.host, a.port, root), flush=True)
    srv.serve_forever()


if __name__ == "__main__":
    main()
