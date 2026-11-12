---
name: handling-review-papercuts
description: Use when Tim mentions papercuts or feedback on the review site, when the session start says there are open papercuts, or when you change scripts/review/ or docker-compose.dev.yml.
---

# Handling review papercuts

Tim writes papercuts on the review site with the papercuts widget. The review site is this clone, served by `scripts/review/devserver.py` in the container `t7d-review` (`docker-compose.dev.yml`, host name in `.env` as `REVIEW_HOST`). A second container, `t7d-review-papercuts`, is the relay. It writes the local store `.papercuts/papercuts.db` in this clone. Each papercut keeps the page, the branch, the commit and a picture.

Set the store once per shell, in any worktree. `$REVIEW_MAIN` is the folder of this clone.

```sh
export PAPERCUTS_STORE=local PAPERCUTS_DB=$REVIEW_MAIN/.papercuts/papercuts.db
```

1. The SessionStart hook (`.claude/settings.json`) prints the number of open papercuts. Tell Tim how many are open, and run `papercuts list`.
2. Run `papercuts show <n>` to read one papercut: the text, the page, the branch, the commit and the picture.
3. Do the work in a worktree for the branch of the papercut, in `~/code/worktrees/t7d/<branch with / as ->`. Follow the rules of this file: a branch, `DESIGN.md`, the look at three widths.
4. A fix is one commit on that branch. One commit is one round on the review site. Tim sees the round in the version picker.
5. Run `papercuts comment <n> "<what changed>"` if Tim needs an explanation.
6. Run `papercuts done <n> --fix "<what changed>"` after the commit.

- Keep the store and its pictures out of git. `.papercuts/`, `.review/` and `.env` are ignored.
- A change to `devserver.py` needs `docker restart t7d-review`. A change to `review.js` or `review.css` needs only a page load.
- The server adds only `connect-src 'self'` to the CSP of a page, and the origin of the relay when `PAPERCUTS_URL` is set. Keep it that way, so that the review site keeps the rules of the real site.
- Tests: `python3 -m unittest discover -s scripts/review -p 'test_*.py'` and `node --test 'scripts/review/test_*.mjs'`.
