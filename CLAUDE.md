# CLAUDE.md

t7d.dev: the personal site of Tim Conrad. Plain HTML, CSS and a little JavaScript, with no build step and no dependencies. `DESIGN.md` says how it looks and sounds; `README.md` holds the deploy and the common changes.

## Check your work

- `python3 tools/check.py`: the Content-Security-Policy rules and the sitemap of every page. CI runs it on pull requests and before each deploy.
- After a change to a page, a style or any wording: serve the site (`python3 -m http.server 8000` in the repository root; all paths are absolute) and look at it at 1440, 390 and 320 px wide, in the light and the dark theme. The page must not scroll sideways, and the browser console must show no errors.
- Show what you ran and what you saw, not only "it works".

## Rules for every task

- Read `DESIGN.md` before you change a page, a style or any wording. The two rules that matter most: the site is black and white with colour only in pictures and videos, and the wording is plain with no slogans or overstatement.
- Claim only what is true. Do not invent facts about Tim, the research or the games.
- Do not rewrite the text of the write-up under `research/`. It is Tim's own.
- A new or revised thought: use the skill `adding-a-thought`. `llms.txt` and the feeds are made at deploy time (`tools/gen-feeds.py`); do not commit them.
- Keep the Content-Security-Policy of each page strict: no inline scripts or styles, no `style=""` attributes, and no request to another site on page load. `assets/theme.js` and `assets/site.js` are the only scripts.
- `master` is the source. Never edit `gh-pages` by hand: the workflow publishes it after every push to `master`, and the sealed admin app (`Tim-Conrad/sealed`) publishes encrypted sites to `sealed/` on it, a folder that exists only there. `tools/deploy.sh` must keep `sealed/`.
- Classes and scripts that the sealed login page uses (`.sealed`, `.label`, `.btn`, `.nav`, `#theme-toggle`, `/assets/site.js`) are used by another repository too. Keep them, or change `client/themes/t7d/login.html` in sealed with them.
- `blog/` and `CVE/` only redirect old addresses (the thoughts were a blog until November 2026). Do not add pages there.

<important if="you show Tim a change for review">
Show a changed page as a Claude artifact, not a local server: `python3 tools/preview-artifact.py <page folder> <out dir>` builds the bundle; publish `<out dir>/index.html` with the Artifact tool and pass the other printed files in `files`. Republish the same `file_path` after each change, so the link stays. The review site (skill `handling-review-notes`) is where Tim leaves notes on his own.
</important>

<important if="Tim mentions notes or feedback on the review site, or you change tools/review/ or docker-compose.dev.yml">
Use the skill `handling-review-notes`. A hook prints the number of open notes at the start of a session.
</important>

<important if="you deploy, or the live site does not show a change">
See "Deploy" in `README.md`. GitHub Pages serves the `gh-pages` branch at https://t7d.dev.
When Tim asks to ship a PR, run `tools/ship.sh <pr>` after the checks of the change. Merging publishes to t7d.dev, so do not run it unasked. If it stops, read its last line, fix the cause, and run it again: a merged PR skips the merge.
</important>
