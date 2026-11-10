"""Tests of the review server. Run: python3 -m unittest tools/review/test_devserver.py"""
import json
import os
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
                          ("x.css", "p{}"), (".git/HEAD", "ref: refs/heads/feat/x\n"), (".git/refs/heads/feat/x", "abcdef1234\n")):
            os.makedirs(os.path.dirname(os.path.join(self.root, rel)), exist_ok=True)
            with open(os.path.join(self.root, rel), "w") as f:
                f.write(body)
        self.notes = os.path.join(self.root, ".review", "notes")
        h = partial(type("H", (devserver.Handler,), {"root": self.root, "notes": self.notes}), directory=self.root)
        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), h)
        self.srv.daemon_threads = True
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.base = "http://127.0.0.1:%d" % self.srv.server_port

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()

    def get(self, path):
        try:
            r = urllib.request.urlopen(self.base + path)
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

    def test_hidden_folders_are_not_served(self):
        for p in ("/.git/HEAD", "/.review/notes/", "/a/../.git/HEAD"):
            self.assertEqual(self.get(p)[0], 404, p)

    def test_state_has_the_branch(self):
        s = json.loads(self.get("/__review/api/state")[2])
        self.assertEqual((s["branch"], s["commit"], s["open"]), ("feat/x", "abcdef1", 0))

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


if __name__ == "__main__":
    unittest.main()
