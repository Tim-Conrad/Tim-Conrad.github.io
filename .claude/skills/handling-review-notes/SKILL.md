---
name: handling-review-notes
description: Use when Tim mentions notes or feedback on the review site (the tab »Note«), when the session start says there are open review notes, or when you change tools/review/ or docker-compose.dev.yml.
---

# Handling review notes

Tim writes notes on the review site: the tab »Note« at the right edge. The review site is this clone, served by `tools/review/devserver.py` in the container `t7d-review` (`docker-compose.dev.yml`, host name in `.env` as `REVIEW_HOST`). It shows the checked-out branch at once and loads the page again when a file changes. A note is a JSON file in `.review/notes/`.

1. The SessionStart hook (`.claude/settings.json`) prints the number of open notes in `.review/notes/`. Tell Tim how many are open, and list them with `ls .review/notes/*.json`.
2. Read the note: `note`, `path`, `viewport`, `theme`, `scroll`, `target` (`selector`, `text`, `rect`), `selection`, `branch`, `commit`.
3. Run `uv run --no-project --with playwright python3 tools/review/show.py <id>` (more ids in one call). Look at `.review/notes/<id>.png`. The red frame is the part that Tim pointed at.
4. Do the work with the rules of this file: a branch, `DESIGN.md`, the look at three widths.
5. After the fix, run `show.py <id> --suffix after` and compare the two pictures.
6. Add an `"answer"` field to the note: what changed, and the commit. Move the note to `.review/notes/done/`. Tim sees the answer under »My notes« in the tab.

- Keep notes and their pictures out of git. `.review/` and `.env` are ignored.
- A change to `devserver.py` needs `docker restart t7d-review`. A change to `review.js` or `review.css` needs only a page load.
- The server adds only `connect-src 'self'` to the CSP of a page. Keep it that way, so that the review site keeps the rules of the real site.
- Tests: `python3 -m unittest tools/review/test_devserver.py`.
