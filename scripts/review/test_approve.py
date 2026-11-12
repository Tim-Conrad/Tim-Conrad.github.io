"""Tests of the approve flow: approve.py, approve-host.sh, the approve API of devserver.py and ship.sh <pr> <sha>.
Run: python3 -m unittest scripts/review/test_approve.py

Each test makes a bare repo as origin, a main clone on master and the worktree of t/a with two rounds.
Fake gh and ship scripts log their arguments. Nothing goes to the network.
"""
import json
import os
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

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import approve  # noqa: E402
import devserver  # noqa: E402

HOST = os.path.join(HERE, "approve-host.sh")
SHIP = os.path.join(HERE, "..", "ship.sh")
PR_URL = "https://github.com/Tim-Conrad/Tim-Conrad.github.io/pull/7"

# gh: logs each call, one per line, as JSON. "pr list" finds no PR, "pr create" prints the URL of the new PR.
FAKE_GH = """#!/usr/bin/env bash
python3 -c 'import json, sys; print(json.dumps(sys.argv[1:]))' "$@" >>"$LOG_DIR/gh.log"
case "$1 $2" in
  "pr list") echo "${FAKE_PR_LIST:-}" ;;
  "pr create") echo "%s" ;;
esac
""" % PR_URL

# ship: logs its arguments, then merges the sha into master of this clone, as the real merge and pull would.
FAKE_SHIP = """#!/usr/bin/env bash
echo "$*" >>"$LOG_DIR/ship.log"
git -c user.name=t -c user.email=t@t merge -q --no-edit "$2"
"""


def git(cwd, *args):
    return subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *args], cwd=cwd, check=True,
                          capture_output=True, text=True).stdout.strip()


def write(path, text, mode=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text)
    if mode:
        os.chmod(path, mode)


class Fixture(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = os.path.realpath(self.tmp.name)
        self.origin, self.main = os.path.join(base, "origin.git"), os.path.join(base, "main")
        self.wt, self.logs = os.path.join(base, "wts", "t-a"), os.path.join(base, "logs")
        os.makedirs(self.logs)
        git(base, "init", "-q", "--bare", "-b", "master", self.origin)
        os.mkdir(self.main)
        git(self.main, "init", "-q", "-b", "master")
        write(os.path.join(self.main, "index.html"), "base\n")
        write(os.path.join(self.main, "scripts", "check.py"), "print('check ok')\n")
        git(self.main, "add", "-A")
        git(self.main, "commit", "-m", "base")
        git(self.main, "remote", "add", "origin", self.origin)
        git(self.main, "push", "-q", "origin", "master")
        git(self.main, "worktree", "add", "-b", "t/a", self.wt)
        for text in ("Round one", "Round two"):
            write(os.path.join(self.wt, "index.html"), text + "\n")
            git(self.wt, "commit", "-am", text)
        self.head = git(self.main, "rev-parse", "t/a")
        self.approve_dir = os.path.join(self.main, ".review", "approve")
        self.status_dir = os.path.join(self.main, ".review", "approve-status")
        os.makedirs(self.approve_dir)
        os.makedirs(self.status_dir)
        write(os.path.join(base, "bin", "gh"), FAKE_GH, 0o755)
        write(os.path.join(base, "bin", "ship"), FAKE_SHIP, 0o755)
        self.env = dict(os.environ, LOG_DIR=self.logs, REVIEW_MAIN=self.main,
                        REVIEW_GH=os.path.join(base, "bin", "gh"), REVIEW_SHIP=os.path.join(base, "bin", "ship"))

    def tearDown(self):
        self.tmp.cleanup()

    def request(self, sha=None):
        return approve.write_request(self.main, self.approve_dir, "t/a", sha or self.head, "agent")

    def host(self):
        return subprocess.run(["bash", HOST], env=self.env, capture_output=True, text=True, timeout=60)

    def status(self):
        with open(os.path.join(self.status_dir, "status.json")) as f:
            return json.load(f)

    def log(self, name):
        path = os.path.join(self.logs, name)
        if not os.path.exists(path):
            return []
        with open(path) as f:
            return f.read().splitlines()

    def remote_branch(self):
        return subprocess.run(["git", "rev-parse", "--verify", "-q", "refs/heads/t/a"], cwd=self.origin,
                              capture_output=True, text=True).stdout.strip()


class Host(Fixture):
    def test_ship_gets_the_approved_sha(self):
        round1 = git(self.main, "rev-parse", "t/a~1")
        self.request()
        res = self.host()
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        self.assertEqual(self.log("ship.log"), ["7 " + self.head])
        self.assertEqual(self.remote_branch(), self.head)
        st = self.status()
        self.assertEqual((st["state"], st["pr"], st["branch"], st["sha"]), ("done", PR_URL, "t/a", self.head))
        create = [json.loads(line) for line in self.log("gh.log") if '"create"' in line]
        self.assertEqual(len(create), 1)
        args = create[0]
        self.assertEqual(args[args.index("--title") + 1], "Round one")
        body = args[args.index("--body") + 1]
        self.assertIn("1. %s Round one" % round1[:7], body)
        self.assertIn("2. %s Round two" % self.head[:7], body)
        self.assertTrue(body.endswith("https://claude.ai/code/session_01KFxuEteUiyeGMzLJ2VGnGc\n")
                        or body.endswith("https://claude.ai/code/session_01KFxuEteUiyeGMzLJ2VGnGc"), body)
        self.assertIn("Generated with [Claude Code](https://claude.com/claude-code)", body)

    def test_an_open_pr_is_not_created_again(self):
        self.env["FAKE_PR_LIST"] = PR_URL
        self.request()
        self.assertEqual(self.host().returncode, 0)
        self.assertFalse([line for line in self.log("gh.log") if '"create"' in line])
        self.assertEqual(self.log("ship.log"), ["7 " + self.head])

    def test_moved_branch_stops_before_push(self):
        self.request()
        write(os.path.join(self.wt, "index.html"), "Round three\n")
        git(self.wt, "commit", "-am", "Round three")
        res = self.host()
        self.assertNotEqual(res.returncode, 0)
        st = self.status()
        self.assertEqual(st["state"], "failed")
        self.assertIn("head", st["step"])
        self.assertEqual(self.remote_branch(), "")
        self.assertEqual(self.log("ship.log"), [])
        self.assertTrue(os.path.isdir(self.wt))

    def test_dirty_worktree_stops(self):
        self.request()
        write(os.path.join(self.wt, "index.html"), "edit that is not committed\n")
        self.assertNotEqual(self.host().returncode, 0)
        st = self.status()
        self.assertEqual(st["state"], "failed")
        self.assertIn("clean", st["step"])
        self.assertEqual(self.remote_branch(), "")
        self.assertEqual(self.log("ship.log"), [])

    def test_failed_check_stops(self):
        write(os.path.join(self.wt, "scripts", "check.py"), "raise SystemExit('check: bad CSP')\n")
        git(self.wt, "commit", "-qam", "Round three")
        self.head = git(self.main, "rev-parse", "t/a")
        self.request()
        self.assertNotEqual(self.host().returncode, 0)
        st = self.status()
        self.assertEqual((st["state"], st["line"]), ("failed", "check: bad CSP"))
        self.assertEqual(self.remote_branch(), "")

    def test_rejected_push_stops(self):
        other = os.path.join(os.path.dirname(self.main), "other")
        git(os.path.dirname(self.main), "clone", "-q", self.origin, other)
        git(other, "checkout", "-q", "-b", "t/a")
        write(os.path.join(other, "x.txt"), "remote only\n")
        git(other, "add", "x.txt")
        git(other, "commit", "-m", "remote only")
        git(other, "push", "-q", "origin", "t/a")
        remote = self.remote_branch()
        self.request()
        self.assertNotEqual(self.host().returncode, 0)
        st = self.status()
        self.assertEqual(st["state"], "failed")
        self.assertIn("push", st["step"])
        self.assertEqual(self.remote_branch(), remote)
        self.assertEqual(self.log("ship.log"), [])
        self.assertFalse([line for line in self.log("gh.log") if '"create"' in line])

    def test_worktree_is_removed_after_done(self):
        self.request()
        self.assertEqual(self.host().returncode, 0)
        self.assertFalse(os.path.exists(self.wt))
        self.assertEqual(subprocess.run(["git", "rev-parse", "--verify", "-q", "refs/heads/t/a"], cwd=self.main,
                                        capture_output=True).returncode, 1)
        self.assertFalse(os.path.exists(os.path.join(self.approve_dir, "request.json")))

    def test_invalid_request_fails_and_is_removed(self):
        write(os.path.join(self.approve_dir, "request.json"), '{"branch": "--force", "sha": "x"}')
        self.assertNotEqual(self.host().returncode, 0)
        self.assertEqual(self.status()["state"], "failed")
        self.assertFalse(os.path.exists(os.path.join(self.approve_dir, "request.json")))
        self.assertEqual(self.log("gh.log"), [])


class Request(Fixture):
    def test_request_has_the_round_and_is_atomic(self):
        req = self.request()
        with open(os.path.join(self.approve_dir, "request.json")) as f:
            self.assertEqual(json.load(f), req)
        self.assertEqual((req["branch"], req["sha"], req["round"], req["by"]), ("t/a", self.head, 2, "agent"))
        self.assertEqual(os.listdir(self.approve_dir), ["request.json"])

    def test_second_request_is_refused(self):
        self.request()
        with self.assertRaises(approve.Refused) as e:
            self.request()
        self.assertEqual(e.exception.code, 409)
        cli = subprocess.run([sys.executable, os.path.join(HERE, "approve.py"), "t/a", "--root", self.main,
                              "--timeout", "1"], capture_output=True, text=True)
        self.assertEqual(cli.returncode, 1)
        self.assertIn("already", cli.stderr)

    def test_old_round_and_master_are_refused(self):
        with self.assertRaises(approve.Refused) as e:
            self.request(self.head_of_round_one())
        self.assertEqual(e.exception.code, 409)
        with self.assertRaises(approve.Refused):
            approve.write_request(self.main, self.approve_dir, "master", git(self.main, "rev-parse", "master"), "agent")
        self.assertEqual(os.listdir(self.approve_dir), [])

    def head_of_round_one(self):
        return git(self.main, "rev-parse", "t/a~1")

    def test_cli_follows_the_status_to_done(self):
        """approve.py writes the request, then prints each step that the host writes and exits 0 on done."""
        proc = subprocess.Popen([sys.executable, os.path.join(HERE, "approve.py"), "t/a", "--root", self.main,
                                 "--poll", "0.1", "--timeout", "60"], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True)
        req = os.path.join(self.approve_dir, "request.json")
        for _ in range(100):
            if os.path.exists(req):
                break
            threading.Event().wait(0.05)
        self.assertEqual(self.host().returncode, 0)
        out, err = proc.communicate(timeout=30)
        self.assertEqual(proc.returncode, 0, err)
        self.assertIn(PR_URL, out)


class Api(Fixture):
    def setUp(self):
        super().setUp()
        h = partial(type("H", (devserver.Handler,), {"root": self.main, "approve_dir": self.approve_dir,
                                                     "status_dir": self.status_dir}), directory=self.main)
        self.srv = ThreadingHTTPServer(("127.0.0.1", 0), h)
        self.srv.daemon_threads = True
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.base = "http://127.0.0.1:%d/__review/api/approve" % self.srv.server_port

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()
        super().tearDown()

    def call(self, body=None, header=True):
        headers = {"Content-Type": "application/json"}
        if header:
            headers["X-T7d-Review"] = "1"
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(self.base, data=data, headers=headers, method="GET" if body is None else "POST")
        try:
            r = urllib.request.urlopen(req)
            return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"{}")

    def test_api_approve_needs_header_and_head_sha(self):
        req = os.path.join(self.approve_dir, "request.json")
        self.assertEqual(self.call({"branch": "t/a", "sha": self.head}, header=False)[0], 403)
        self.assertEqual(self.call({"branch": "t/a", "sha": git(self.main, "rev-parse", "t/a~1")})[0], 409)
        self.assertEqual(self.call({"branch": "t/a", "sha": "nope"})[0], 400)
        self.assertEqual(self.call({"branch": "../x", "sha": self.head})[0], 400)
        self.assertFalse(os.path.exists(req))
        code, body = self.call({"branch": "t/a", "sha": self.head})
        self.assertEqual(code, 200)
        self.assertEqual((body["branch"], body["sha"], body["round"], body["by"]), ("t/a", self.head, 2, "button"))
        with open(req) as f:
            self.assertEqual(json.load(f)["sha"], self.head)
        self.assertEqual(self.call({"branch": "t/a", "sha": self.head})[0], 409)

    def test_api_status_is_idle_then_the_status_file(self):
        self.assertEqual(self.call(), (200, {"state": "idle"}))
        st = {"state": "running", "step": "push t/a", "line": "", "pr": None, "branch": "t/a", "sha": self.head,
              "time": approve.now()}
        write(os.path.join(self.status_dir, "status.json"), json.dumps(st))
        self.assertEqual(self.call(), (200, st))

    def test_api_without_the_approve_folder_is_503(self):
        shutil.rmtree(self.approve_dir)
        self.assertEqual(self.call({"branch": "t/a", "sha": self.head})[0], 503)


class Ship(unittest.TestCase):
    """ship.sh with a fake gh first in PATH: the merge call is logged, the next query fails and ends the run."""
    GH = """#!/usr/bin/env bash
echo "$*" >>"$LOG"
case "$*" in
  *"--json state"*) echo OPEN ;;
  *"--json title"*) echo "A title" ;;
  "pr merge"*) exit 0 ;;
  *) exit 1 ;;
esac
"""

    def run_ship(self, *args):
        with tempfile.TemporaryDirectory() as tmp:
            write(os.path.join(tmp, "gh"), self.GH, 0o755)
            log = os.path.join(tmp, "gh.log")
            write(log, "")
            env = dict(os.environ, PATH=tmp + os.pathsep + os.environ["PATH"], LOG=log)
            res = subprocess.run(["bash", SHIP, *args], env=env, capture_output=True, text=True, timeout=30)
            with open(log) as f:
                return res, [line for line in f.read().splitlines() if line.startswith("pr merge")]

    def test_sha_goes_to_match_head_commit(self):
        sha = "a" * 40
        res, merges = self.run_ship("5", sha)
        self.assertEqual(merges, ["pr merge 5 -R Tim-Conrad/Tim-Conrad.github.io --merge --delete-branch --match-head-commit " + sha],
                         res.stderr)

    def test_without_sha_no_flag(self):
        res, merges = self.run_ship("5")
        self.assertEqual(merges, ["pr merge 5 -R Tim-Conrad/Tim-Conrad.github.io --merge --delete-branch"], res.stderr)

    def test_a_bad_sha_merges_nothing(self):
        res, merges = self.run_ship("5", "--admin")
        self.assertNotEqual(res.returncode, 0)
        self.assertEqual(merges, [])


if __name__ == "__main__":
    unittest.main()
