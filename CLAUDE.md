# CLAUDE.md

t7d.dev: the personal site of Tim Conrad. Plain HTML, CSS and a little JavaScript, with no build step and no dependencies.

## Project map

- `DESIGN.md` - how the site looks and sounds. Read it before you change a page, a style or any wording.
- `README.md` - deploy details and common changes. Read it when you deploy or add a kind of page.
- `index.html`, `404.html` - front page and not-found page.
- `research/`, `projects/`, `thoughts/`, `CVE/` - one folder with an `index.html` per page. `thoughts/<slug>/` is one thought, `thoughts/` the list. `blog/` and `CVE/` only redirect old addresses (the thoughts were a blog until November 2026).
- `assets/site.css` - all styles and the colour tokens.
- `assets/theme.js`, `assets/site.js` - the only scripts.
- `assets/projects/` - reels, posters and stills of the two games.
- `tools/deploy.sh`, `.github/workflows/deploy.yml` - the deploy to `gh-pages`.
- `/sealed/<site>/` (only on `gh-pages`) - encrypted sites that the sealed admin app (`Tim-Conrad/sealed`) pushes. Their login page uses `assets/site.css` (`.sealed`).
- `tools/reels/` - the scripts that film the games and cut the reels, and `timeline.mjs` with its stages file, which films the timeline clips.
- `assets/projects/timeline/` - the timeline clips and posters of the game pages.

## Rules for every task

- Follow `DESIGN.md`. The two rules that matter most: the site is black and white with colour only in pictures and videos, and the wording is plain with no slogans or overstatement.
- Claim only what is true. Do not invent facts about Tim, the research or the games.
- Do not rewrite the text of the write-up under `research/`. It is Tim's own.
- A new or revised thought: use the skill `adding-a-thought`. `llms.txt` and the feeds are made at deploy time (`tools/gen-feeds.py`); do not commit them.
- Keep the Content-Security-Policy of each page strict: no inline scripts or styles, no `style=""` attributes, and no request to another site on page load. `python3 tools/check.py` checks this and the sitemap; CI runs it.
- `master` is the source. Never edit `gh-pages` by hand: the workflow publishes it after every push to `master`, and the sealed admin app publishes `sealed/` on it. `tools/deploy.sh` must keep `sealed/`.
- Classes and scripts that the sealed login page uses (`.sealed`, `.label`, `.btn`, `.nav`, `#theme-toggle`, `/assets/site.js`) are used by another repository too. Keep them, or change `client/themes/t7d/login.html` in sealed with them.

<important if="you change a page, a style, a component or any wording">
Read `DESIGN.md` first. After the change, serve the site and look at it at 1440, 390 and 320 px wide, in the light and the dark theme. The page must not scroll sideways, and the browser console must show no errors.
</important>

<important if="you need to preview or check the site">
Run `python3 -m http.server 8000` in the repository root and open `http://localhost:8000`. All paths are absolute, so serve from the root.

For Tim's review, show a changed page as a Claude artifact, not a local server: `python3 tools/preview-artifact.py <page folder> <out dir>` builds the bundle; publish `<out dir>/index.html` with the Artifact tool and pass the other printed files in `files`. Republish the same `file_path` after each change, so the link stays. The review site (skill `handling-review-notes`) is where Tim leaves notes on his own; use the artifact when you ask him to review a change.
</important>

<important if="Tim mentions notes or feedback on the review site, or you change tools/review/ or docker-compose.dev.yml">
Use the skill `handling-review-notes`. A hook prints the number of open notes at the start of a session.
</important>

<important if="you add a page, or a top-level file or folder that belongs to the site">
- Copy the `<head>` of an existing page, with its Content-Security-Policy line.
- Add the URL to `sitemap.xml`.
- Add a new top-level file or folder to the `SITE` list in `tools/deploy.sh`, or it is not published.
- Update "Contents" in the title block of `index.html` and the sheet numbers of its sections.
</important>

<important if="Kleinbahn or Wortzauber changed, or a reel, a poster, a still or a caption must change">
Use the skill `updating-product-reels`. It needs the two game repositories (`Tim-Conrad/tiny-train` and `Tim-Conrad/wortzauber`) cloned next to this one.
</important>

<important if="a game got new merged pull requests, or its timeline ("How it changed") must grow or a timeline clip must be filmed again">
Use the skill `updating-game-timeline`. It films one clip per PR at that PR's merge commit and needs the game repository cloned next to this one, with its full history.
</important>

<important if="you deploy, or the live site does not show a change">
See "Deploy" in `README.md`. GitHub Pages serves the `gh-pages` branch at https://t7d.dev.
When Tim asks to ship a PR, run `tools/ship.sh <pr>` after the checks of the change. Merging publishes to t7d.dev, so do not run it unasked. If it stops, read its last line, fix the cause, and run it again: a merged PR skips the merge.
</important>
