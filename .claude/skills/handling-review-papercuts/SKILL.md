---
name: handling-review-papercuts
description: Use when Tim mentions papercuts or feedback on the review site, when the session start says there are open papercuts, or when you change scripts/review/ or docker-compose.dev.yml.
---

# Handling review papercuts

Tim writes papercuts on the review site with the papercuts widget. The review site is this clone, served by `scripts/review/devserver.py` in the container `t7d-review` (`docker-compose.dev.yml`, host name in `.env` as `REVIEW_HOST`). A second container, `t7d-review-papercuts`, is the relay. It writes the local store `.papercuts/papercuts.db` in this clone. Each papercut keeps the page, the branch, the commit and a picture.

`.github/papercuts.json` sets `"store": "local"`, so `papercuts add`, `list`, `show`, `comment` and `done` use the local store in every worktree. A worktree uses the `.papercuts/` folder of the main clone. No export is needed. Never run these commands with `PAPERCUTS_STORE=github`: that files a GitHub issue on a public repo.

1. The SessionStart hook (`.claude/settings.json`) prints the number of open papercuts. Tell Tim how many are open, and run `papercuts list`.
2. Run `papercuts show <n>` to read one papercut: the text, the page, the branch, the commit and the picture.
3. Do the work in a worktree for the branch of the papercut, in `~/code/worktrees/t7d/<branch with / as ->`. Follow the rules of this file: a branch, `DESIGN.md`, the look at three widths.
4. A fix is one commit on that branch. One commit is one round on the review site. Tim sees the round in the version picker.
5. Run `papercuts comment <n> "<what changed>"` if Tim needs an explanation.
6. Run `papercuts done <n> --fix "<what changed>"` after the commit.

## Approve

Do not run `python3 scripts/review/approve.py <branch>` unless Tim tells you to, in this conversation or in a papercut. The command merges the branch and publishes it to t7d.dev.

- If Tim tells you to approve, run `python3 scripts/review/approve.py <branch>` in your worktree. It writes the request to the main clone.
- The command prints each step of the host. It stops with exit 0 when the round is published.
- A finished text is not an approval. Tell Tim that the round is ready, and let him press Approve.

- Keep the store and its pictures out of git. `.papercuts/`, `.review/` and `.env` are ignored.
- A change to `devserver.py` needs `docker restart t7d-review`. A change to `review.js` or `review.css` needs only a page load.
- The server adds only `connect-src 'self'` to the CSP of a page, and the origin of the relay when `PAPERCUTS_URL` is set. Keep it that way, so that the review site keeps the rules of the real site.
- Tests: `python3 -m unittest discover -s scripts/review -p 'test_*.py'` and `node --test 'scripts/review/test_*.mjs'`.
