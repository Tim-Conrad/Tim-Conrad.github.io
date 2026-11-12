#!/usr/bin/env bash
# The host side of the Approve button and of approve.py: publish the approved round of a branch to t7d.dev.
# The systemd user unit t7d-review-approve.path (scripts/review/approve-install.sh) starts it when
# .review/approve/request.json exists in the main clone. It runs as the host user, with the GitHub login of that user.
#
# The steps, in this order. Each step goes to .review/approve-status/status.json before it runs:
#  1. Read the request and remove it. A crash then cannot start the path unit again and again.
#     A request that is not valid becomes state "failed".
#  2. The sha of the request must be the head of the branch in the main clone.
#  3. The worktree of the branch must be clean.
#  4. python3 scripts/check.py in that worktree.
#  5. git push origin <sha>:refs/heads/<branch>, with no force. A rejected push stops.
#  6. gh pr create, if no PR has this head (title: the subject of round 1, body: the list of rounds).
#  7. scripts/ship.sh <pr> <sha> in the main clone. It merges only if the head of the PR is still <sha>.
#  8. git worktree remove (no --force) and git branch -d.
# A failed step writes state "failed" with the step and the last line of its output, and removes nothing.
#
# One run at a time: a second run waits for the lock (flock) of the first run, then reads its own request.
# It does not exit and leave the request, because the path unit then starts it again at once, in a loop.
#
# Env: REVIEW_MAIN (the main clone, default: the clone of this script), REVIEW_GH (default: gh),
# REVIEW_SHIP (default: $REVIEW_MAIN/scripts/ship.sh). The tests set them, and a dry run can too.
set -euo pipefail
here=$(cd "$(dirname "$(readlink -f "$0")")" && pwd)
main=${REVIEW_MAIN:-$(cd "$here/../.." && pwd)}
gh=${REVIEW_GH:-gh}
ship=${REVIEW_SHIP:-$main/scripts/ship.sh}
request=$main/.review/approve/request.json
status_dir=$main/.review/approve-status
log=$(mktemp)
trap 'rm -f "$log"' EXIT
branch="" sha="" pr="" wt=""

# status <state> <step> [<line>]: write status.json atomically (a temporary file, then a rename)
status() {
  python3 -c '
import datetime, json, os, sys
d, state, step, line, pr, branch, sha = sys.argv[1:]
st = {"state": state, "step": step, "line": line, "pr": pr or None, "branch": branch, "sha": sha,
      "time": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
tmp = os.path.join(d, ".status.%d.tmp" % os.getpid())
with open(tmp, "w") as f:
    json.dump(st, f)
os.replace(tmp, os.path.join(d, "status.json"))
' "$status_dir" "$1" "$2" "${3:-}" "$pr" "$branch" "$sha"
  echo "== $1: $2${3:+ ($3)}"
}

# step <name> <command...>: write the step, run the command, stop with state "failed" if it fails.
# The command runs in an "if", where set -e does not apply: each function returns on its own errors.
step() {
  local name=$1
  shift
  status running "$name"
  if ! "$@" >"$log" 2>&1; then
    cat "$log"
    status failed "$name" "$(grep -v '^[[:space:]]*$' "$log" | tail -n 1 || true)"
    exit 1
  fi
  cat "$log"
}

read_request() {
  local req out
  req=$(cat "$request") || true
  rm -f "$request"
  out=$(python3 -c '
import json, sys
sys.path.insert(0, sys.argv[1])
import approve, gitread
try:
    r = json.loads(sys.argv[2])
    b, s = r["branch"], r["sha"]
except (ValueError, KeyError, TypeError):
    sys.exit("the request is not JSON with a branch and a sha")
if not isinstance(b, str) or not gitread.valid_branch(b) or b == approve.BASE:
    sys.exit("the request has no valid branch")
if not isinstance(s, str) or not approve.SHA.match(s):
    sys.exit("the request has no full sha")
print(b)
print(s)
' "$here" "$req") || return 1
  { read -r branch; read -r sha; } <<<"$out"
}

check_head() {
  local now
  now=$(git -C "$main" rev-parse --verify -q "refs/heads/$branch^{commit}") || { echo "no branch $branch"; return 1; }
  [ "$now" = "$sha" ] || { echo "$branch is at ${now:0:7} now, not at the approved ${sha:0:7}"; return 1; }
}

check_worktree() {
  wt=$(python3 -c '
import os, sys
sys.path.insert(0, sys.argv[1])
import gitread
main, branch = sys.argv[2], sys.argv[3]
paths = [w["path"] for w in gitread.worktrees(main) if w["branch"] == branch]
if not paths or os.path.realpath(paths[0]) == os.path.realpath(main):
    sys.exit("no worktree of %s apart from the main clone" % branch)
if gitread.dirty(paths[0]):
    sys.exit("the worktree %s has changes that are not committed" % paths[0])
print(paths[0])
' "$here" "$main" "$branch")
}

run_check() { (cd "$wt" && python3 scripts/check.py); }

push() { git -C "$main" push origin "$sha:refs/heads/$branch"; }

# rounds <title|body>: the PR title (subject of round 1) or the PR body (the rounds and the attribution lines)
rounds() {
  python3 -c '
import sys
sys.path.insert(0, sys.argv[1])
import approve, gitread
what, main, branch, sha = sys.argv[2:]
rounds = gitread.rounds(main, branch, approve.BASE)
if what == "title":
    print(rounds[0]["subject"])
    sys.exit()
print("The rounds of %s, approved at round %d (%s) on the review site:\n" % (branch, len(rounds), sha[:7]))
for r in rounds:
    print("%d. %s %s" % (r["n"], r["sha"][:7], r["subject"]))
print("\n\U0001F916 Generated with [Claude Code](https://claude.com/claude-code)\n")
print("https://claude.ai/code/session_01KFxuEteUiyeGMzLJ2VGnGc")
' "$here" "$1" "$main" "$branch" "$sha"
}

# open_pr: the PR whose head is the approved sha (open or merged), else a new one
open_pr() {
  local title body
  pr=$(cd "$main" && "$gh" pr list --head "$branch" --state all --json url,headRefOid,state \
        --jq "map(select(.headRefOid == \"$sha\" and .state != \"CLOSED\"))[0].url // empty") || return 1
  if [ -z "$pr" ]; then
    title=$(rounds title) || return 1
    body=$(rounds body) || return 1
    pr=$(cd "$main" && "$gh" pr create --base master --head "$branch" --title "$title" --body "$body" | tail -n 1) || return 1
  fi
  [[ $pr =~ ^https://github\.com/.+/pull/[0-9]+$ ]] || { echo "no PR address from gh: \"$pr\""; pr=""; return 1; }
  echo "$pr"
}

run_ship() { (cd "$main" && "$ship" "${pr##*/}" "$sha"); }

clean_up() {
  git -C "$main" worktree remove "$wt" || return 1
  if git -C "$main" show-ref --verify -q "refs/heads/$branch"; then
    git -C "$main" branch -d "$branch"
  fi
}

mkdir -p "$status_dir"
exec 9>"$status_dir/.lock"
flock 9
[ -e "$request" ] || exit 0   # the run before this one took the request while this one waited
step "read the request" read_request
step "check that ${sha:0:7} is the head of $branch" check_head
step "check that the worktree of $branch is clean" check_worktree
step "run scripts/check.py" run_check
step "push $branch" push
step "open the PR" open_pr
step "ship $pr" run_ship
step "remove the worktree and the branch" clean_up
status done "published $branch at ${sha:0:7}"
