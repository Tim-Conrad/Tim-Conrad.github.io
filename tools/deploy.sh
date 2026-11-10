#!/usr/bin/env bash
# Publishes the site files of the current commit to the gh-pages branch, which GitHub Pages serves at t7d.dev.
# Only the site goes there: tools/, .claude/, .github/ and the README stay on master.
# The workflow .github/workflows/deploy.yml runs this on every push to master. To run it by hand: tools/deploy.sh
#
# The folder sealed/ on gh-pages is not from master: the admin app of sealed (Tim-Conrad/sealed) pushes the
# encrypted sites there, one folder per site (sealed/<site>/). This script keeps that folder as it is.
set -euo pipefail

SITE=(index.html 404.html CNAME .nojekyll key.asc robots.txt sitemap.xml assets blog research projects CVE)

root=$(git rev-parse --show-toplevel)
src=$(git -C "$root" rev-parse HEAD)
tree=$(mktemp -d)

git -C "$root" fetch -q origin gh-pages
git -C "$root" worktree add -q --detach "$tree" origin/gh-pages
cd "$tree"
git rm -rq --ignore-unmatch .
if git cat-file -e HEAD:sealed 2>/dev/null; then
  git checkout -q HEAD -- sealed
fi
git -C "$root" archive "$src" "${SITE[@]}" | tar -x
# llms.txt and the RSS feed of the blog are made from the published pages, never by hand
python3 "$root/tools/gen-feeds.py" "$tree"
git add -A

if git diff --cached --quiet; then
  echo "gh-pages already has the site of ${src:0:7}"
else
  git -c user.name="${GIT_AUTHOR_NAME:-$(git -C "$root" log -1 --format=%an)}" \
      -c user.email="${GIT_AUTHOR_EMAIL:-$(git -C "$root" log -1 --format=%ae)}" \
      commit -q -m "Deploy ${src:0:7}"
  git push -q origin HEAD:gh-pages
  echo "deployed ${src:0:7} to gh-pages"
fi

cd "$root"
git worktree remove --force "$tree"
