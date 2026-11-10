# t7d.dev

The personal site of Tim Conrad: security research, a CVE write-up, a PGP key, and product pages for two browser games.

It is plain HTML, CSS and a little JavaScript. There is no build step and no dependency. Fonts are self-hosted, and a Content-Security-Policy on every page blocks third-party requests. The only exception is the live game demo on a product page, which loads from its own host after the visitor presses play.

## What is on the site

| Page | Path | Content |
| --- | --- | --- |
| Front page | `/` | Overview, the two games, the latest thoughts, the CVE summary, the PGP key, contact |
| Thoughts | `/thoughts/` | Ideas I work through and come back to; each in `/thoughts/<slug>/` with a status, sources, revisions and feedback |
| Thought | `/thoughts/humans-md/` | A humans.md for working with models (animated diagrams, the file `HUMANS.md` to download) |
| Thought | `/thoughts/encrypted-patches/` | Encrypted patches, unlocked on patch day (inline SVG diagrams) |
| Write-up | `/research/cve-2022-46166/` | CVE-2022-46166: template injection in Spring Boot Admin |
| Kleinbahn | `/projects/kleinbahn/` | Reel, live demo from `tiny-train.beacon.host`, features, stills |
| Wortzauber | `/projects/wortzauber/` | Reel, live demo from `wortzauber.beacon.host`, features, stills |
| llms.txt | `/llms.txt` | A summary of the site for language models (llmstxt.org format), made at deploy time |
| RSS feed | `/thoughts/feed.xml` | The thoughts, newest first, made at deploy time. `/blog/feed.xml` is the same feed for readers of the old address |
| Old blog URLs | `/blog/`, `/blog/encrypted-patches/` | Redirect to `/thoughts/` |
| PGP key | `/key.asc` | Public key, fingerprint `A886 6CB1 6B07 9685 5615 74B2 A91D ABBE C996 7390` |
| Old write-up URL | `/CVE/CVE-2022-46166/` | Redirects to the new write-up address |
| Encrypted sites | `/sealed/<site>/` | Private games and files, encrypted with [sealed](https://github.com/Tim-Conrad/sealed). A login page, then the browser decrypts the site. Not linked, not in the sitemap, kept out of search engines by `robots.txt` |

## Layout of the repository

| Path | What it is |
| --- | --- |
| `index.html`, `404.html` | Front page and not-found page |
| `research/`, `projects/`, `thoughts/` | One folder with an `index.html` per page |
| `blog/`, `CVE/` | Redirects from old addresses |
| `assets/site.css` | All styles and the colour tokens of both themes |
| `assets/theme.js` | Applies the saved theme before the first paint |
| `assets/site.js` | Theme toggle, copy buttons, the table of contents, the tap-to-play demo, diagrams with steps and animated diagrams |
| `assets/fonts/` | Site fonts (SIL Open Font License, see `OFL.txt`) |
| `assets/img/` | Pictures and the recording of the write-up |
| `assets/projects/` | Reels, posters, stills, phone pictures and gameplay loops of the two games |
| `assets/og.png` | Social preview image |
| `CNAME`, `.nojekyll`, `robots.txt`, `sitemap.xml` | Hosting and crawler files |
| `scripts/deploy.sh` | Publishes the site files to `gh-pages` |
| `scripts/ship.sh` | Merges a PR, waits for the deploy and checks t7d.dev |
| `scripts/preview-artifact.py` | Builds a page as a Claude artifact bundle, for a review before it is published |
| `scripts/reels/` | Scripts that film the two games and cut the reels |
| `scripts/review/`, `docker-compose.dev.yml` | The review site: live reload and a note tab. Never published |
| `.github/workflows/deploy.yml` | Runs the deploy on every push to `master` |
| `DESIGN.md` | How the site looks and sounds: colours, type, layout, components and the wording rules |
| `CLAUDE.md` | Instructions for Claude Code in this repository |
| `.claude/skills/updating-product-reels/` | Working guide for Claude Code: how to take the reels and pictures again |
| `.claude/skills/adding-a-thought/` | Working guide for Claude Code: how to turn a link into a new thought, and how to revise one |
| `.claude/skills/updating-game-timeline/` | Working guide for Claude Code: how to film the timeline clips of a game page |
| `.claude/skills/handling-review-notes/` | Working guide for Claude Code: how to handle Tim's notes from the review site |
| `.claude/rules/pages.md` | Rules for a new page; Claude Code loads them only when it works on an HTML page, the sitemap or the deploy script |
| `.claude/settings.json` | A hook that prints the number of open review notes at the start of a session |
| `scripts/check.py` | Checks the CSP rules and the sitemap of every page; CI runs it |

## Preview locally

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. All paths are absolute, so serve from the repository root.

For live reload and the note tab, run `python3 scripts/review/devserver.py` instead (port 8000).

## Review site

The review site serves this clone with live reload and a tab »Note« at the right edge. A note keeps the page, the width, the theme and the part that you pointed at. It is a JSON file in `.review/notes/`, and git ignores that folder. The site files on `gh-pages` do not change: `scripts/deploy.sh` never publishes `scripts/`.

To run it in a container behind a login proxy:

1. Make the notes folder: `mkdir -p .review/notes`.
2. Write the host name into `.env`: `REVIEW_HOST=<host>`.
3. Start the stack: `docker-compose -p t7d-review -f docker-compose.dev.yml up -d`.

`scripts/review/show.py <id>` opens the page of a note and frames its part in a picture. A handled note goes to `.review/notes/done/` with an `"answer"` field, which the tab shows under »My notes«. Tests: `python3 -m unittest scripts/review/test_devserver.py`.

## Deploy

GitHub Pages serves the `gh-pages` branch at <https://t7d.dev>. `master` is the source, and nobody edits `gh-pages` by hand.

1. Merge a change into `master`.
2. The workflow `.github/workflows/deploy.yml` runs `scripts/deploy.sh`.
3. The script copies the site files of that commit to `gh-pages`, writes `llms.txt` and the feeds from the pages with `scripts/gen-feeds.py`, and pushes. `scripts/`, `.claude/`, `.github/` and this README stay on `master`.

To ship a pull request in one step, run `scripts/ship.sh [<pr>]`. It merges the PR, puts this clone on `master`, waits for the deploy and the Pages build, and checks that t7d.dev serves each site file of the PR. It runs no checks: look at the pages first.

The folder `sealed/` on `gh-pages` does not come from `master`. The admin app of sealed in the lab builds each encrypted site and pushes it to `gh-pages` as `sealed/<site>/`: a login page, a keyring and ciphertext, never the plain files. `scripts/deploy.sh` keeps that folder as it is, and sealed changes nothing outside it. Users, passwords and access are managed in the sealed admin app, not here. The setup is in "Publish below t7d.dev" in the README of sealed.

To deploy by hand, run `scripts/deploy.sh` on `master`. To look at `llms.txt` and the feed locally, run `python3 scripts/gen-feeds.py` (git ignores the two files). A new top-level file or folder that belongs to the site must be added to the `SITE` list in that script, or it is not published.

## Common changes

### Add a write-up

1. Copy `research/cve-2022-46166/index.html` to a new folder under `research/` and edit the content.
2. Link it from the Research section of `index.html`.
3. Add the URL to `sitemap.xml`.

### Update a product page after a game changed

The live demo updates by itself when the game is published to beacon.host. The reel, the poster, the stills and the phone picture are files in `assets/projects/` and must be taken again:

```sh
node scripts/reels/kleinbahn-shots.mjs ../tiny-train        # frames of the Kleinbahn shots
node scripts/reels/wortzauber-takes.mjs ../wortzauber --rec  # recordings of the Wortzauber takes
node scripts/reels/overlays.mjs ../wortzauber                # titles and captions
python3 scripts/reels/build.py kb
python3 scripts/reels/build.py wz ../wortzauber
python3 scripts/reels/build.py publish                       # writes assets/projects/
```

This needs Node with Playwright, ffmpeg, and both game repositories cloned next to this one. The skill in `.claude/skills/updating-product-reels/SKILL.md` has the details, the checks and the pitfalls.

### Add a live demo from a new host

Each product page allows exactly one frame host. Add the new host to `frame-src` in the `Content-Security-Policy` line of that page, or the phone frame stays empty.

### Design and wording

See `DESIGN.md`.
