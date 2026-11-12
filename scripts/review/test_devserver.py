"""Tests of the review server. Run: python3 -m unittest scripts/review/test_devserver.py"""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from functools import partial
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(__file__))
import devserver  # noqa: E402

def git(cwd, *args):
    return subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *args], cwd=cwd, check=True,
                          capture_output=True, text=True).stdout.strip()


PAGE = ('<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; '
        'script-src \'self\'; base-uri \'none\'"><title>T</title></head><body><p>Hi</p></body></html>')


class Inject(unittest.TestCase):
    def test_adds_assets_and_connect_src_only(self):
        out = devserver.inject(PAGE)
        self.assertIn('href="/__review/review.css"', out)
        self.assertIn('src="/__review/review.js" defer', out)
        self.assertLess(out.index('src="/__review/textdiff.js" defer'), out.index('src="/__review/review.js"'))
        self.assertIn("default-src 'none'; script-src 'self'; base-uri 'none'; connect-src 'self'", out)
        self.assertNotIn("unsafe-inline", out)

    def test_keeps_an_existing_connect_src(self):
        page = PAGE.replace("base-uri 'none'", "connect-src https://a.example")
        self.assertEqual(devserver.inject(page).count("connect-src"), 1)


class Widget(unittest.TestCase):
    PAGE2 = PAGE.replace("base-uri 'none'", "style-src 'self'; img-src 'self'; base-uri 'none'")

    def test_widget_tag_and_csp_only_with_the_env(self):
        self.assertNotIn("papercuts", devserver.inject(PAGE).lower())
        self.assertNotIn("papercuts", devserver.inject(PAGE, widget="").lower())
        out = devserver.inject(self.PAGE2, widget="https://p.example", branch="feat/x", commit="abc1234")
        self.assertEqual(out.count("<script src=\"https://p.example/papercuts.js\""), 1)
        self.assertIn('data-repo="Tim-Conrad/Tim-Conrad.github.io" data-branch="feat/x" data-commit="abc1234"', out)
        policy = re.search(r'content="([^"]*)"', out).group(1)
        for d in ("script-src", "connect-src", "img-src"):
            self.assertEqual(len(re.findall(d + r"[^;]*https://p\.example", policy)), 1, d)
        self.assertEqual(re.search(r"style-src[^;]*", policy).group(0), "style-src 'self'")
        self.assertEqual(re.search(r"img-src[^;]*", policy).group(0), "img-src 'self' https://p.example")
        self.assertEqual(re.search(r"script-src[^;]*", policy).group(0), "script-src 'self' https://p.example")


class Server(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.root, "a"))
        for rel, body in (("index.html", PAGE), ("404.html", PAGE.replace("Hi", "Gone")), ("a/index.html", PAGE),
                          ("x.css", "p{}"), ):
            os.makedirs(os.path.dirname(os.path.join(self.root, rel)), exist_ok=True)
            with open(os.path.join(self.root, rel), "w") as f:
                f.write(body)
        git(self.root, "init", "-b", "feat/x")
        git(self.root, "add", "-A")
        git(self.root, "commit", "-m", "start")
        self.commit = git(self.root, "rev-parse", "--short=7", "HEAD")
        h = partial(type("H", (devserver.Handler,), {"root": self.root}), directory=self.root)
        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), h)
        self.srv.daemon_threads = True
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.base = "http://127.0.0.1:%d" % self.srv.server_port

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()

    def get(self, path, cookie=None):
        try:
            r = urllib.request.urlopen(urllib.request.Request(self.base + path, headers={"Cookie": cookie} if cookie else {}))
            return r.status, r.headers, r.read().decode()
        except urllib.error.HTTPError as e:
            return e.code, e.headers, e.read().decode()

    def post(self, path, body=b"{}"):
        req = urllib.request.Request(self.base + path, data=body, headers={"Content-Type": "application/json", "X-T7d-Review": "1"}, method="POST")
        try:
            return urllib.request.urlopen(req).status
        except urllib.error.HTTPError as e:
            return e.code

    def test_pages_get_the_tab_and_no_cache(self):
        code, headers, body = self.get("/a/")
        self.assertEqual(code, 200)
        self.assertEqual(headers["Cache-Control"], "no-cache")
        self.assertIn("/__review/review.js", body)
        self.assertEqual(self.get("/x.css")[2], "p{}")
        code, headers, body = self.get("/__review/textdiff.js")
        self.assertEqual((code, headers["Content-Type"]), (200, "text/javascript; charset=utf-8"))
        self.assertIn("window.reviewDiff", body)

    def test_missing_page_is_the_404_page(self):
        code, _, body = self.get("/nope/")
        self.assertEqual(code, 404)
        self.assertIn("Gone", body)

    def test_feed_and_llms_are_made_on_request(self):
        post = '<html><head><title>Post · Tim Conrad</title><meta name="description" content="About it."><link rel="canonical" href="https://t7d.dev/thoughts/p/"><meta property="article:published_time" content="2026-11-10"></head><body></body></html>'
        os.makedirs(os.path.join(self.root, "thoughts", "p"))
        with open(os.path.join(self.root, "thoughts", "p", "index.html"), "w") as f:
            f.write(post)
        for feed in ("/thoughts/feed.xml", "/blog/feed.xml"):
            code, headers, body = self.get(feed)
            self.assertEqual(code, 200, feed)
            self.assertIn("rss+xml", headers["Content-Type"])
            self.assertIn("<title>Post</title>", body)
        code, headers, body = self.get("/llms.txt")
        self.assertEqual(code, 200)
        self.assertIn("[Post](https://t7d.dev/thoughts/p/): About it.", body)

    def test_hidden_folders_are_not_served(self):
        for p in ("/.git/HEAD", "/.review/approve/", "/a/../.git/HEAD"):
            self.assertEqual(self.get(p)[0], 404, p)

    def test_state_has_the_branch(self):
        s = json.loads(self.get("/__review/api/state")[2])
        self.assertEqual((s["branch"], s["commit"]), ("feat/x", self.commit))
        self.assertNotIn("open", s)

    def test_notes_api_is_gone(self):
        self.assertEqual(self.post("/__review/api/notes", json.dumps({"note": "x"}).encode()), 404)
        self.assertEqual(self.get("/__review/api/notes")[0], 404)

    def test_the_widget_comes_from_the_server_for_the_chosen_branch(self):
        self.assertNotIn("papercuts", self.get("/")[2])
        srv, base = self.serve_with("https://p.example")
        try:
            body = urllib.request.urlopen(base + "/").read().decode()
        finally:
            srv.shutdown()
            srv.server_close()
        self.assertIn('src="https://p.example/papercuts.js" data-repo="Tim-Conrad/Tim-Conrad.github.io" data-branch="feat/x" data-commit="%s"' % self.commit, body)

    def serve_with(self, widget):
        h = partial(type("H", (devserver.Handler,), {"root": self.root, "widget": widget}), directory=self.root)
        srv = ThreadingHTTPServer(("127.0.0.1", 0), h)
        srv.daemon_threads = True
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        return srv, "http://127.0.0.1:%d" % srv.server_port


class Branches(unittest.TestCase):
    """A main clone on master with the worktree t/a: two rounds, a new page and an edit that is not committed."""

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.TemporaryDirectory()
        base = os.path.realpath(cls.tmp.name)
        cls.main, cls.wt = os.path.join(base, "main"), os.path.join(base, "wt")
        os.mkdir(cls.main)
        git(cls.main, "init", "-b", "master")
        cls.write(cls.main, "index.html", PAGE.replace("Hi", "Master home"))
        git(cls.main, "add", "-A")
        git(cls.main, "commit", "-m", "base")
        git(cls.main, "worktree", "add", "-b", "t/a", cls.wt)
        cls.write(cls.wt, "index.html", PAGE.replace("Hi", "Round one"))
        git(cls.wt, "commit", "-am", "round one")
        cls.write(cls.wt, "new/index.html", PAGE.replace("Hi", "New page"))
        os.symlink("/etc/hostname", os.path.join(cls.wt, "leak.txt"))
        os.symlink("/etc", os.path.join(cls.wt, "leakdir"))
        os.symlink(os.path.join(cls.main, ".git", "config"), os.path.join(cls.wt, "gitlink.html"))
        os.symlink(".git", os.path.join(cls.wt, "gitself.html"))
        git(cls.wt, "add", "-A")
        git(cls.wt, "commit", "-m", "round two")
        cls.shas = git(cls.main, "log", "--reverse", "--format=%H", "master..t/a").split()
        cls.srv, cls.base = cls.serve()

    @classmethod
    def serve(cls, worktrees=None):
        h = partial(type("H", (devserver.Handler,), {"root": cls.main, "worktrees": worktrees}),
                    directory=cls.main)
        srv = ThreadingHTTPServer(("127.0.0.1", 0), h)
        srv.daemon_threads = True
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        return srv, "http://127.0.0.1:%d" % srv.server_port

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()
        cls.tmp.cleanup()

    def get_from(self, base, path, cookie=None):
        try:
            r = urllib.request.urlopen(urllib.request.Request(base + path, headers={"Cookie": cookie} if cookie else {}))
            return r.status, r.headers, r.read().decode()
        except urllib.error.HTTPError as e:
            return e.code, e.headers, e.read().decode()

    @staticmethod
    def write(root, rel, body):
        os.makedirs(os.path.dirname(os.path.join(root, rel)), exist_ok=True)
        with open(os.path.join(root, rel), "w") as f:
            f.write(body)

    def get(self, path, cookie=None):
        try:
            r = urllib.request.urlopen(urllib.request.Request(self.base + path, headers={"Cookie": cookie} if cookie else {}))
            return r.status, r.headers, r.read().decode()
        except urllib.error.HTTPError as e:
            return e.code, e.headers, e.read().decode()

    def test_page_comes_from_the_chosen_worktree(self):
        self.assertIn("Master home", self.get("/")[2])
        self.assertIn("Round one", self.get("/?branch=t/a")[2])
        self.assertIn("Round one", self.get("/", cookie="review_branch=t/a")[2])
        self.assertIn("New page", self.get("/new/?branch=t/a")[2])
        self.assertEqual(self.get("/new/")[0], 404)

    def test_branch_query_sets_the_cookie(self):
        headers = self.get("/?branch=t/a")[1]
        self.assertEqual(headers["Set-Cookie"], "review_branch=t/a; Path=/; SameSite=Strict")
        self.assertIsNone(self.get("/")[1]["Set-Cookie"])

    def test_invalid_branch_falls_back_to_main(self):
        for bad in ("nope", "..%2Fx", "-x", "t/a%00"):
            code, headers, body = self.get("/?branch=" + bad)
            self.assertEqual(code, 200, bad)
            self.assertIn("Master home", body, bad)
            self.assertIsNone(headers["Set-Cookie"], bad)
        self.assertIn("Master home", self.get("/", cookie="review_branch=nope")[2])

    def test_versions_lists_rounds_and_working(self):
        v = json.loads(self.get("/__review/api/versions?branch=t/a")[2])
        self.assertEqual((v["branch"], v["branches"], v["base"], v["working"]), ("t/a", ["master", "t/a"], "master", False))
        self.assertEqual([(r["n"], r["sha"], r["subject"]) for r in v["rounds"]],
                         [(1, self.shas[0], "round one"), (2, self.shas[1], "round two")])
        v = json.loads(self.get("/__review/api/versions", cookie="review_branch=t/a")[2])
        self.assertEqual(v["branch"], "t/a")
        self.assertEqual(json.loads(self.get("/__review/api/versions")[2])["rounds"], [])
        self.write(self.wt, "index.html", PAGE.replace("Hi", "Edited"))
        try:
            self.assertTrue(json.loads(self.get("/__review/api/versions?branch=t/a")[2])["working"])
        finally:
            git(self.wt, "checkout", "index.html")
        self.assertEqual(self.get("/__review/api/versions?branch=nope")[0], 400)

    def test_text_returns_old_html_and_null_for_a_new_page(self):
        def text(rev, path, branch="t/a"):
            code, _, body = self.get("/__review/api/text?branch=%s&rev=%s&path=%s" % (branch, rev, path))
            self.assertEqual(code, 200)
            return json.loads(body)["html"]
        self.assertIn("Master home", text("master", "/"))
        self.assertIn("Round one", text(self.shas[0], "/"))
        self.assertIn("Round one", text("working", "/"))
        self.assertIsNone(text("master", "/new/"))
        self.assertIsNone(text(self.shas[0], "/new/"))
        self.assertIn("New page", text(self.shas[1], "/new/"))
        self.assertIn("New page", text("working", "/new/index.html"))
        self.assertIsNone(text("working", "/missing/"))

    def test_text_refuses_a_foreign_sha_and_a_bad_path(self):
        url = "/__review/api/text?branch=t/a&rev=%s&path=%s"
        for rev, path in (("deadbeef", "/"), ("-x", "/"), ("master", "/../x"), ("master", "/.git/config"),
                          ("working", "/.git/config"), ("master", "index.html"), ("master", ""), ("master", "/%00")):
            code, _, body = self.get(url % (rev, path))
            self.assertEqual(code, 400, (rev, path))
            self.assertIn("error", json.loads(body))
        self.assertEqual(self.get("/__review/api/text?branch=t/a&path=/")[0], 400)
        # a SHA of t/a is not valid for master
        self.assertEqual(self.get("/__review/api/text?branch=master&rev=%s&path=/" % self.shas[0])[0], 400)

    def test_encoded_hidden_folders_are_not_served(self):
        for p in ("/%2egit/HEAD", "/%2Egit/config", "/%2ereview/approve/n.json", "/%2egit?branch=t/a",
                  "/%2egit/HEAD?branch=t/a", "/a/%2e%2e/%2egit/HEAD"):
            self.assertEqual(self.get(p)[0], 404, p)

    def test_symlinks_do_not_leave_the_worktree(self):
        for p in ("/leak.txt?branch=t/a", "/leakdir/hostname?branch=t/a", "/gitlink.html?branch=t/a",
                  "/gitself.html?branch=t/a"):
            self.assertEqual(self.get(p)[0], 404, p)

    def test_text_working_does_not_follow_a_symlink_to_hidden_or_outside(self):
        for path in ("/gitlink.html", "/gitself.html", "/leak.txt", "/leakdir/hostname"):
            code, _, body = self.get("/__review/api/text?branch=t/a&rev=working&path=" + path)
            self.assertEqual((code, json.loads(body)["html"]), (200, None), path)

    def test_a_removed_worktree_is_not_offered(self):
        gone = os.path.join(os.path.dirname(self.wt), "gone")
        git(self.main, "worktree", "add", "-b", "t/gone", gone)
        shutil.rmtree(gone)
        try:
            v = json.loads(self.get("/__review/api/versions")[2])
            self.assertNotIn("t/gone", v["branches"])
            code, headers, body = self.get("/?branch=t/gone")
            self.assertIn("Master home", body)
            self.assertIsNone(headers["Set-Cookie"])
            self.assertIn("Master home", self.get("/", cookie="review_branch=t/gone")[2])
        finally:
            git(self.main, "worktree", "prune")
            git(self.main, "branch", "-D", "t/gone")

    def test_a_worktree_outside_the_configured_folder_is_not_offered(self):
        srv, base = self.serve(worktrees=os.path.join(os.path.dirname(self.wt), "only-here"))
        try:
            v = json.loads(self.get_from(base, "/__review/api/versions")[2])
            self.assertEqual(v["branches"], ["master"])
            self.assertIn("Master home", self.get_from(base, "/?branch=t/a")[2])
        finally:
            srv.shutdown()
            srv.server_close()
        srv, base = self.serve(worktrees=os.path.dirname(self.wt))
        try:
            self.assertIn("Round one", self.get_from(base, "/?branch=t/a")[2])
        finally:
            srv.shutdown()
            srv.server_close()

    def test_reload_stamps_the_chosen_worktree(self):
        def first_stamp(path):
            r = urllib.request.urlopen(self.base + path)
            line = r.readline().decode()
            r.close()
            return line
        before = first_stamp("/__review/reload?branch=t/a")
        self.write(self.main, "main-only.txt", "x")
        self.assertEqual(first_stamp("/__review/reload?branch=t/a"), before)
        self.write(self.wt, "wt-only.txt", "x")
        try:
            self.assertNotEqual(first_stamp("/__review/reload?branch=t/a"), before)
        finally:
            os.remove(os.path.join(self.wt, "wt-only.txt"))
            os.remove(os.path.join(self.main, "main-only.txt"))

    def test_state_reports_the_worktree(self):
        s = json.loads(self.get("/__review/api/state?branch=t/a")[2])
        self.assertEqual((s["branch"], s["commit"]), ("t/a", self.shas[1][:7]))
        s = json.loads(self.get("/__review/api/state")[2])
        self.assertEqual(s["branch"], "master")

    def test_feeds_and_404_come_from_the_chosen_worktree(self):
        post = '<html><head><title>Wt post · Tim Conrad</title><meta name="description" content="D."><link rel="canonical" href="https://t7d.dev/thoughts/w/"><meta property="article:published_time" content="2026-11-10"></head><body></body></html>'
        self.write(self.wt, "thoughts/w/index.html", post)
        self.write(self.wt, "404.html", PAGE.replace("Hi", "Wt gone"))
        try:
            self.assertIn("<title>Wt post</title>", self.get("/thoughts/feed.xml?branch=t/a")[2])
            self.assertNotIn("Wt post", self.get("/thoughts/feed.xml")[2])
            code, _, body = self.get("/nope/?branch=t/a")
            self.assertEqual(code, 404)
            self.assertIn("Wt gone", body)
        finally:
            shutil.rmtree(os.path.join(self.wt, "thoughts"))
            os.remove(os.path.join(self.wt, "404.html"))

    def test_query_wins_over_the_cookie(self):
        self.assertIn("Master home", self.get("/?branch=master", cookie="review_branch=t/a")[2])
        self.assertIn("Round one", self.get("/", cookie="review_branch=t/a")[2])


if __name__ == "__main__":
    unittest.main()
