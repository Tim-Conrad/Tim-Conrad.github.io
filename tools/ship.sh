#!/usr/bin/env bash
# Ship a pull request in one step: merge it, wait for the deploy, and check that t7d.dev serves the new files.
#   tools/ship.sh [<pr>]      the PR number. Without it: the PR of the current branch.
# 1. gh pr merge --merge --delete-branch. A PR that is already merged is not merged again, so a second run
#    after a failed step does the other steps only.
# 2. This clone goes to master (fast-forward only), so the review site shows master. It stops on changes to tracked files.
# 3. The workflow "Deploy to gh-pages" of the merge commit must pass. It writes the commit "Deploy <sha>" on gh-pages,
#    unless the PR changed no site file (tools/, docs): then the script ends here.
# 4. The GitHub Pages build of the newest gh-pages commit must pass (a later deploy contains this one).
# 5. Each site file of the PR must be on t7d.dev as it is on gh-pages now (a query string skips the CDN cache).
set -euo pipefail
cd "$(dirname "$(readlink -f "$0")")/.."
REPO=Tim-Conrad/Tim-Conrad.github.io
SITE_URL=https://t7d.dev

# wait_run <workflow> <sha>: the run of that workflow for that commit, watched to its end
wait_run() {
  local id="" i
  for i in $(seq 1 30); do
    id=$(gh run list -R "$REPO" --workflow "$1" --commit "$2" --limit 1 --json databaseId --jq '.[0].databaseId // empty')
    [ -n "$id" ] && break
    sleep 4
  done
  [ -n "$id" ] || { echo "ship: no run of \"$1\" for ${2:0:7} after 2 min" >&2; return 1; }
  gh run watch -R "$REPO" "$id" --exit-status >/dev/null || { echo "ship: \"$1\" failed: gh run view -R $REPO $id --log-failed" >&2; return 1; }
  echo "   \"$1\" passed (run $id)"
}

pr=${1:-}
if [ -z "$pr" ]; then
  pr=$(gh pr view --json number --jq .number 2>/dev/null) || { echo "ship: no PR for this branch. Give the PR number." >&2; exit 1; }
fi
state=$(gh pr view "$pr" -R "$REPO" --json state --jq .state)
echo "== PR #$pr ($state): $(gh pr view "$pr" -R "$REPO" --json title --jq .title)"
case $state in
  OPEN)   gh pr merge "$pr" -R "$REPO" --merge --delete-branch ;;
  MERGED) echo "== already merged" ;;
  *)      echo "ship: PR #$pr is $state. Nothing was done." >&2; exit 1 ;;
esac
sha=$(gh pr view "$pr" -R "$REPO" --json mergeCommit --jq .mergeCommit.oid)

echo "== this clone to master"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "ship: this clone has changes to tracked files. The PR is merged, but the clone stays on $(git branch --show-current)." >&2
  exit 1
fi
git fetch -q origin
[ "$(git branch --show-current)" = master ] || git checkout -q master
git merge -q --ff-only origin/master
echo "   $(git log --oneline -1)"

echo "== deploy of ${sha:0:7}"
wait_run deploy.yml "$sha"
git fetch -q origin gh-pages
if [ -z "$(git log origin/gh-pages -n 1 --format=%h --grep="^Deploy ${sha:0:7}\$")" ]; then   # no pipe: grep -q and pipefail fail on SIGPIPE
  echo "   the PR changed no site file: t7d.dev stays as it is"
  exit 0
fi
wait_run pages-build-deployment "$(git rev-parse origin/gh-pages)"

echo "== $SITE_URL serves the new files"
read -r -a site <<<"$(sed -n 's/^SITE=(\(.*\))$/\1/p' tools/deploy.sh)"
mapfile -t files < <(git diff --name-only --diff-filter=AM "$sha^1" "$sha" -- "${site[@]}")
bad=0
for f in "${files[@]}"; do
  want=$(git show "origin/gh-pages:$f" 2>/dev/null | sha256sum | cut -c1-64) got=""
  for _ in 1 2 3 4 5 6; do
    got=$(curl -sfL "$SITE_URL/$f?ship=${sha:0:7}" | sha256sum | cut -c1-64) || true
    [ "$got" = "$want" ] && break
    sleep 10
  done
  if [ "$got" = "$want" ]; then echo "   ok  /$f"; else echo "   OLD /$f" >&2; bad=1; fi
done
[ "$bad" = 0 ] || { echo "ship: t7d.dev does not serve all new files yet" >&2; exit 1; }
echo "   ${#files[@]} files live on $SITE_URL"
