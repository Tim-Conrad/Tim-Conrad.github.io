"""Tests of the review server. Run: python3 -m unittest scripts/review/test_devserver.py"""
import json
import os
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
        self.assertIn("default-src 'none'; script-src 'self'; base-uri 'none'; connect-src 'self'", out)
        self.assertNotIn("unsafe-inline", out)

    def test_keeps_an_existing_connect_src(self):
        page = PAGE.replace("base-uri 'none'", "connect-src https://a.example")
        self.assertEqual(devserver.inject(page).count("connect-src"), 1)


class CleanNote(unittest.TestCase):
    def test_keeps_known_fields_with_limits(self):
        n = devserver.clean_note({"note": " Fix it ", "path": "/x/", "theme": "dark", "evil": "x",
                                  "viewport": {"w": 390, "h": 844, "dpr": 3, "q": 1},
                                  "target": {"selector": "#a", "text": "t" * 999, "rect": {"x": 1, "y": 2, "w": 3, "h": True}}})
        self.assertEqual(n["note"], "Fix it")
        self.assertNotIn("evil", n)
        self.assertEqual(n["viewport"], {"w": 390.0, "h": 844.0, "dpr": 3.0})
        self.assertEqual(len(n["target"]["text"]), 300)
        self.assertIsNone(n["target"]["rect"]["h"])

    def test_rejects_an_empty_or_long_note(self):
        for bad in ({"note": "  "}, {"note": "x" * 4001}, {"note": 5}, ["note"]):
            with self.assertRaises(ValueError):
                devserver.clean_note(bad)


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
        self.notes = os.path.join(self.root, ".review", "notes")
        h = partial(type("H", (devserver.Handler,), {"root": self.root, "notes": self.notes}), directory=self.root)
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

    def post(self, body, headers=None):
        h = {"Content-Type": "application/json", "X-T7d-Review": "1"} if headers is None else headers
        req = urllib.request.Request(self.base + "/__review/api/notes", data=json.dumps(body).encode(), headers=h, method="POST")
        try:
            r = urllib.request.urlopen(req)
            return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

    def test_pages_get_the_tab_and_no_cache(self):
        code, headers, body = self.get("/a/")
        self.assertEqual(code, 200)
        self.assertEqual(headers["Cache-Control"], "no-cache")
        self.assertIn("/__review/review.js", body)
        self.assertEqual(self.get("/x.css")[2], "p{}")

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
        for p in ("/.git/HEAD", "/.review/notes/", "/a/../.git/HEAD"):
            self.assertEqual(self.get(p)[0], 404, p)

    def test_state_has_the_branch(self):
        s = json.loads(self.get("/__review/api/state")[2])
        self.assertEqual((s["branch"], s["commit"], s["open"]), ("feat/x", self.commit, 0))

    def test_a_note_is_a_file_and_in_the_list(self):
        code, d = self.post({"note": "The title is too big", "path": "/a/"})
        self.assertEqual(code, 201)
        saved = json.loads(devserver.read(os.path.join(self.notes, d["id"] + ".json")))
        self.assertEqual((saved["note"], saved["branch"], saved["path"]), ("The title is too big", "feat/x", "/a/"))
        os.makedirs(os.path.join(self.notes, "done"))
        done = dict(saved, id="20260101-000000-abcdef", answer="Smaller now.")
        with open(os.path.join(self.notes, "done", done["id"] + ".json"), "w") as f:
            json.dump(done, f)
        notes = json.loads(self.get("/__review/api/notes")[2])["notes"]
        self.assertEqual([(n["status"], n["answer"]) for n in notes], [("open", None), ("done", "Smaller now.")])

    def test_a_post_without_the_header_or_json_is_refused(self):
        self.assertEqual(self.post({"note": "x"}, {"Content-Type": "application/json"})[0], 403)
        self.assertEqual(self.post({"note": "x"}, {"X-T7d-Review": "1", "Content-Type": "text/plain"})[0], 403)
        self.assertEqual(self.post({"note": ""})[0], 400)
        self.assertFalse(os.path.exists(self.notes) and os.listdir(self.notes))


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
        git(cls.wt, "add", "-A")
        git(cls.wt, "commit", "-m", "round two")
        cls.shas = git(cls.main, "log", "--reverse", "--format=%H", "master..t/a").split()
        h = partial(type("H", (devserver.Handler,), {"root": cls.main, "notes": os.path.join(cls.main, ".review", "notes")}),
                    directory=cls.main)
        cls.srv = ThreadingHTTPServer(("127.0.0.1", 0), h)
        cls.srv.daemon_threads = True
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = "http://127.0.0.1:%d" % cls.srv.server_port

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()
        cls.tmp.cleanup()

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


if __name__ == "__main__":
    unittest.main()
