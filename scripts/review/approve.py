#!/usr/bin/env python3
"""Approve the newest round of a branch: the host publishes it to t7d.dev (scripts/review/approve-host.sh).

    python3 scripts/review/approve.py <branch> [<sha>] [--root <main clone>]

- Writes .review/approve/request.json in the main clone. The sha must be the head of the branch (default: the head).
- Then prints each step that the host writes to .review/approve-status/status.json.
- Exit 0 when the host is done, 1 when it fails, when a request is waiting already, or after --timeout seconds.
The review server (devserver.py) uses write_request and read_status of this module for the Approve button.
"""
import argparse
import datetime
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gitread  # noqa: E402

BASE = "master"
SHA = re.compile(r"^[0-9a-f]{40}$")
REQUEST = "request.json"
STATUS = "status.json"
STALE = 1800   # seconds: a "running" status older than this is a host run that stopped without a word


class Refused(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code, self.message = code, message


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def write_request(main, approve_dir, branch, sha, by):
    """Write the request for the newest round of branch and return it. Raises Refused (400, 409 or 503)."""
    if not isinstance(branch, str) or not gitread.valid_branch(branch) or branch == BASE:
        raise Refused(400, "not a branch that can ship: %r" % (branch,))
    if not isinstance(sha, str) or not SHA.match(sha):
        raise Refused(400, "not a full sha: %r" % (sha,))
    rounds = gitread.rounds(main, branch, BASE)
    if not rounds or gitread.branch_head(main, branch) != sha or rounds[-1]["sha"] != sha:
        raise Refused(409, "%s is not the newest round of %s" % (sha[:7], branch))
    req = {"branch": branch, "sha": sha, "round": len(rounds), "by": by, "time": now()}
    path = os.path.join(approve_dir, REQUEST)
    tmp = os.path.join(approve_dir, ".request.%d.tmp" % os.getpid())
    try:
        with open(tmp, "w") as f:
            json.dump(req, f)
        os.link(tmp, path)   # atomic, and unlike os.replace it never overwrites a waiting request
    except FileExistsError:
        raise Refused(409, "a request is waiting already")
    except FileNotFoundError:
        raise Refused(503, "approve is not set up: %s is missing" % approve_dir)
    finally:
        try:
            os.unlink(tmp)
        except FileNotFoundError:
            pass
    return req


def read_status(status_dir):
    """The status of the host, or {"state": "idle"}. A stale "running" status reads as failed."""
    try:
        with open(os.path.join(status_dir, STATUS)) as f:
            st = json.load(f)
    except (OSError, ValueError):
        return {"state": "idle"}
    if not isinstance(st, dict) or st.get("state") not in ("running", "done", "failed"):
        return {"state": "idle"}
    if st["state"] == "running":
        try:
            age = time.time() - datetime.datetime.strptime(st.get("time", ""), "%Y-%m-%dT%H:%M:%SZ").replace(
                tzinfo=datetime.timezone.utc).timestamp()
        except ValueError:
            age = STALE + 1
        if age > STALE:
            st = dict(st, state="failed", line="the host wrote nothing for %d minutes" % (STALE // 60))
    return st


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("branch")
    ap.add_argument("sha", nargs="?", help="the head of the branch (default)")
    ap.add_argument("--root", default=os.path.normpath(os.path.join(here, "..", "..")), help="the main clone")
    ap.add_argument("--timeout", type=float, default=3600, help="seconds to wait for the host (default 3600)")
    ap.add_argument("--poll", type=float, default=2, help=argparse.SUPPRESS)
    a = ap.parse_args()
    approve_dir = os.path.join(a.root, ".review", "approve")
    status_dir = os.path.join(a.root, ".review", "approve-status")
    sha = a.sha or gitread.branch_head(a.root, a.branch)
    if not sha:
        print("approve: no branch %s in %s" % (a.branch, a.root), file=sys.stderr)
        return 1
    try:
        req = write_request(a.root, approve_dir, a.branch, sha, "agent")
    except Refused as e:
        print("approve: " + e.message, file=sys.stderr)
        return 1
    print("== approve %s round %d (%s)" % (req["branch"], req["round"], req["sha"][:7]), flush=True)
    start = time.time()
    end, warned = start + a.timeout, False
    while os.path.exists(os.path.join(approve_dir, REQUEST)):   # the host removes it when it starts
        if time.time() > end:
            print("approve: no host took the request. It stays in %s." % approve_dir, file=sys.stderr)
            return 1
        if not warned and time.time() > start + 30:
            print("   waiting for the host (systemctl --user status t7d-review-approve.path)", flush=True)
            warned = True
        time.sleep(a.poll)
    last = None
    while True:
        st = read_status(status_dir)
        seen = (st.get("state"), st.get("step"))
        if seen != last and st.get("state") != "idle":
            print("   %s: %s" % (st["state"], st.get("step", "")), flush=True)
            last = seen
        if st.get("state") == "done":
            print("== done: %s" % (st.get("pr") or ""), flush=True)
            return 0
        if st.get("state") == "failed":
            print("approve: failed at \"%s\": %s" % (st.get("step", ""), st.get("line", "")), file=sys.stderr)
            return 1
        if time.time() > end:
            print("approve: the host did not finish in %d s" % a.timeout, file=sys.stderr)
            return 1
        time.sleep(a.poll)


if __name__ == "__main__":
    sys.exit(main())
