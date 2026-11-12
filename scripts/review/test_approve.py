"""Tests of the approve flow: approve.py, approve-host.sh, the approve API of devserver.py and ship.sh <pr> <sha>.
Run: python3 -m unittest scripts/review/test_approve.py

Each test makes a bare repo as origin, a main clone on master and the worktree of t/a with two rounds.
Fake gh and ship scripts log their arguments. Nothing goes to the network.
"""
import json
import os
import shutil
import signal
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

# gh: logs each call, one per line, as JSON. "pr list" finds no PR (FAKE_PR_MERGED and FAKE_PR_LIST set the answer
# for the merged and the open lookup), "pr create" prints the URL of the new PR.
FAKE_GH = """#!/usr/bin/env bash
python3 -c 'import json, sys; print(json.dumps(sys.argv[1:]))' "$@" >>"$LOG_DIR/gh.log"
case "$1 $2" in
  "pr list") if [[ "$*" == *MERGED* ]]; then echo "${FAKE_PR_MERGED:-}"; else echo "${FAKE_PR_LIST:-}"; fi ;;
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
        return approve.write_request(self.main, self.approve_dir, "t/a", sha or self.head, "agent",
                                     status_dir=self.status_dir)

    def host(self, timeout=60):
        return subprocess.run(["bash", HOST], env=self.env, capture_output=True, text=True, timeout=timeout)

    def new_round(self, check_py):
        """Round three changes only scripts/check.py of the worktree. It becomes the head."""
        write(os.path.join(self.wt, "scripts", "check.py"), check_py)
        git(self.wt, "commit", "-qam", "Round three")
        self.head = git(self.main, "rev-parse", "t/a")

    def gh_calls(self, verb):
        return [json.loads(line) for line in self.log("gh.log") if json.loads(line)[:2] == ["pr", verb]]

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
        req = self.request()
        res = self.host()
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        self.assertEqual(self.log("ship.log"), ["7 " + self.head])
        self.assertEqual(self.remote_branch(), self.head)
        st = self.status()
        self.assertEqual((st["state"], st["pr"], st["branch"], st["sha"]), ("done", PR_URL, "t/a", self.head))
        self.assertEqual(st["request"], req["time"])
        lists = self.gh_calls("list")
        self.assertTrue(lists)
        for args in lists + self.gh_calls("create"):
            self.assertEqual(args[args.index("--base") + 1], "master", args)
        create = [json.loads(line) for line in self.log("gh.log") if '"create"' in line]
        self.assertEqual(len(create), 1)
        args = create[0]
        self.assertEqual(args[args.index("--title") + 1], "Round one")
        body = args[args.index("--body") + 1]
        self.assertIn("1. %s Round one" % round1[:7], body)
        self.assertIn("2. %s Round two" % self.head[:7], body)
        self.assertEqual(body.rstrip("\n").splitlines()[-1],
                         "\U0001F916 Generated with [Claude Code](https://claude.com/claude-code)")
        self.assertNotIn("claude.ai/code/session", body)

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
        self.new_round("raise SystemExit('check: bad CSP')\n")
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

    def test_commit_during_check_stops_before_push(self):
        self.new_round("import subprocess\nsubprocess.run(['git', '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', "
                       "'-q', '--allow-empty', '-m', 'during the check'], check=True)\n")
        self.request()
        self.assertNotEqual(self.host().returncode, 0)
        st = self.status()
        self.assertEqual(st["state"], "failed")
        self.assertIn("head", st["step"])
        self.assertEqual(self.remote_branch(), "")
        self.assertEqual(self.log("ship.log"), [])

    def test_edit_during_check_stops_before_push(self):
        self.new_round("open('index.html', 'a').write('edit during the check')\n")
        self.request()
        self.assertNotEqual(self.host().returncode, 0)
        st = self.status()
        self.assertEqual(st["state"], "failed")
        self.assertIn("clean", st["step"])
        self.assertEqual(self.remote_branch(), "")

    def test_merged_pr_skips_push_and_create(self):
        """A run after a failure that came after the merge: no new push and no new PR, ship.sh does the rest."""
        self.env["FAKE_PR_MERGED"] = PR_URL
        self.request()
        res = self.host()
        self.assertEqual(res.returncode, 0, res.stdout + res.stderr)
        self.assertEqual(self.remote_branch(), "")
        self.assertEqual(self.gh_calls("create"), [])
        self.assertEqual(self.log("ship.log"), ["7 " + self.head])
        self.assertEqual(self.status()["state"], "done")

    def test_term_marks_the_run_failed(self):
        """systemd stops the unit with SIGTERM to its cgroup: the status says killed, not running."""
        started = os.path.join(self.logs, "check-started")
        self.new_round("import time\nopen(%r, 'w').close()\ntime.sleep(30)\n" % started)
        self.request()
        proc = subprocess.Popen(["bash", HOST], env=self.env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                start_new_session=True)
        for _ in range(200):
            if os.path.exists(started):
                break
            threading.Event().wait(0.05)
        self.assertTrue(os.path.exists(started))
        os.killpg(proc.pid, signal.SIGTERM)
        proc.wait(timeout=15)
        st = self.status()
        self.assertEqual((st["state"], st["step"], st["line"]), ("failed", "run scripts/check.py", "killed"))
        self.assertEqual(self.remote_branch(), "")

    def odd_request(self, make):
        path = os.path.join(self.approve_dir, "request.json")
        make(path)
        res = self.host(timeout=20)
        self.assertNotEqual(res.returncode, 0)
        st = self.status()
        self.assertEqual((st["state"], st["step"]), ("failed", "read the request"))
        self.assertFalse(os.path.lexists(path))
        self.assertEqual(sorted(os.listdir(self.status_dir)), [".lock", "status.json"])
        self.assertEqual(self.log("gh.log"), [])

    def test_folder_request_fails_and_is_removed(self):
        def make(path):
            os.mkdir(path)
            write(os.path.join(path, "x"), "{}")
        self.odd_request(make)

    def test_symlink_request_fails_and_is_removed(self):
        self.odd_request(lambda path: os.symlink("/dev/urandom", path))

    def test_fifo_request_fails_and_is_removed(self):
        self.odd_request(os.mkfifo)

    def test_big_request_is_read_only_in_part(self):
        self.odd_request(lambda path: write(path, '{"branch": "t/a", "sha": "%s", "pad": "%s"}' % (self.head, "x" * 5000)))

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

    def test_cli_in_a_worktree_writes_to_the_main_clone(self):
        """An agent runs approve.py of its own worktree with no --root: the request goes to the main clone."""
        here = os.path.join(self.wt, "scripts", "review")
        os.makedirs(here)
        for name in ("approve.py", "gitread.py"):
            shutil.copy(os.path.join(HERE, name), here)
        cli = subprocess.run([sys.executable, os.path.join(here, "approve.py"), "t/a", "--timeout", "0.2", "--poll", "0.05"],
                             cwd=self.wt, capture_output=True, text=True)
        self.assertIn("no host took the request", cli.stderr)
        with open(os.path.join(self.approve_dir, "request.json")) as f:
            self.assertEqual(json.load(f)["sha"], self.head)

    def test_request_is_refused_while_a_run_is_going(self):
        st = {"state": "running", "step": "push t/a", "line": "", "pr": None, "branch": "t/b", "sha": "b" * 40,
              "request": "2026-11-12T00:00:00Z", "time": approve.now()}
        write(os.path.join(self.status_dir, "status.json"), json.dumps(st))
        with self.assertRaises(approve.Refused) as e:
            self.request()
        self.assertEqual(e.exception.code, 409)
        self.assertEqual(os.listdir(self.approve_dir), [])
        st["time"] = "2026-11-12T00:00:00Z"   # stale: a run that stopped without a word blocks nothing
        write(os.path.join(self.status_dir, "status.json"), json.dumps(st))
        self.request()

    def test_cli_ignores_the_status_of_another_request(self):
        proc = subprocess.Popen([sys.executable, os.path.join(HERE, "approve.py"), "t/a", "--root", self.main,
                                 "--poll", "0.05", "--timeout", "30"], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                text=True)
        path = os.path.join(self.approve_dir, "request.json")
        for _ in range(200):
            if os.path.exists(path):
                break
            threading.Event().wait(0.05)
        with open(path) as f:
            req = json.load(f)
        os.remove(path)
        st = {"state": "done", "step": "published t/a", "line": "", "pr": PR_URL, "branch": "t/a", "sha": self.head,
              "request": "2026-01-01T00:00:00Z", "time": approve.now()}
        write(os.path.join(self.status_dir, "status.json"), json.dumps(st))
        threading.Event().wait(0.5)
        self.assertIsNone(proc.poll(), "approve.py took the status of another request")
        st.update(state="failed", step="push t/a", line="rejected", pr=None, request=req["time"])
        write(os.path.join(self.status_dir, "status.json"), json.dumps(st))
        out, err = proc.communicate(timeout=10)
        self.assertEqual(proc.returncode, 1)
        self.assertIn("rejected", err)

    def test_old_round_and_master_are_refused(self):
        with self.assertRaises(approve.Refused) as e:
            self.request(self.head_of_round_one())
        self.assertEqual(e.exception.code, 409)
        with self.assertRaises(approve.Refused):
            approve.write_request(self.main, self.approve_dir, "master", git(self.main, "rev-parse", "master"), "agent",
                                  status_dir=self.status_dir)
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

    def test_api_refuses_while_a_run_is_going(self):
        st = {"state": "running", "step": "push t/b", "line": "", "pr": None, "branch": "t/b", "sha": "b" * 40,
              "request": approve.now(), "time": approve.now()}
        write(os.path.join(self.status_dir, "status.json"), json.dumps(st))
        self.assertEqual(self.call({"branch": "t/a", "sha": self.head})[0], 409)
        self.assertFalse(os.path.exists(os.path.join(self.approve_dir, "request.json")))

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
