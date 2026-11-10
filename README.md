# t7d.dev

The personal site of Tim Conrad: security research, a CVE write-up, a PGP key, and product pages for two browser games.

It is plain HTML, CSS and a little JavaScript. There is no build step and no dependency. Fonts are self-hosted, and a Content-Security-Policy on every page blocks third-party requests. The only exception is the live game demo on a product page, which loads from its own host after the visitor presses play.

## What is on the site

| Page | Path | Content |
| --- | --- | --- |
| Front page | `/` | Overview, the two games, the latest blog posts, the CVE summary, the PGP key, contact |
| Blog | `/blog/` | List of posts; each post in `/blog/<slug>/` |
| Post | `/blog/encrypted-patches/` | Encrypted patches, unlocked on patch day (three inline SVG diagrams) |
| Write-up | `/research/cve-2022-46166/` | CVE-2022-46166: template injection in Spring Boot Admin |
| Kleinbahn | `/projects/kleinbahn/` | Reel, live demo from `tiny-train.beacon.host`, features, stills |
| Wortzauber | `/projects/wortzauber/` | Reel, live demo from `wortzauber.beacon.host`, features, stills |
| PGP key | `/key.asc` | Public key, fingerprint `A886 6CB1 6B07 9685 5615 74B2 A91D ABBE C996 7390` |
| Old write-up URL | `/CVE/CVE-2022-46166/` | Redirects to the new write-up address |
| Encrypted sites | `/sealed/<site>/` | Private games and files, encrypted with [sealed](https://github.com/Tim-Conrad/sealed). A login page, then the browser decrypts the site. Not linked, not in the sitemap, kept out of search engines by `robots.txt` |

## Layout of the repository

| Path | What it is |
| --- | --- |
| `index.html`, `404.html` | Front page and not-found page |
| `research/`, `projects/`, `blog/`, `CVE/` | One folder with an `index.html` per page |
| `assets/site.css` | All styles and the colour tokens of both themes |
| `assets/theme.js` | Applies the saved theme before the first paint |
| `assets/site.js` | Theme toggle, copy buttons, the table of contents, the tap-to-play demo |
| `assets/fonts/` | Site fonts (SIL Open Font License, see `OFL.txt`) |
| `assets/img/` | Pictures and the recording of the write-up |
| `assets/projects/` | Reels, posters, stills, phone pictures and gameplay loops of the two games |
| `assets/og.png` | Social preview image |
| `CNAME`, `.nojekyll`, `robots.txt`, `sitemap.xml` | Hosting and crawler files |
| `tools/deploy.sh` | Publishes the site files to `gh-pages` |
| `tools/reels/` | Scripts that film the two games and cut the reels |
| `.github/workflows/deploy.yml` | Runs the deploy on every push to `master` |
| `DESIGN.md` | How the site looks and sounds: colours, type, layout, components and the wording rules |
| `CLAUDE.md` | Instructions for Claude Code in this repository |
| `.claude/skills/updating-product-reels/` | Working guide for Claude Code: how to take the reels and pictures again |

## Preview locally

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. All paths are absolute, so serve from the repository root.

## Deploy

GitHub Pages serves the `gh-pages` branch at <https://t7d.dev>. `master` is the source, and nobody edits `gh-pages` by hand.

1. Merge a change into `master`.
2. The workflow `.github/workflows/deploy.yml` runs `tools/deploy.sh`.
3. The script copies the site files of that commit to `gh-pages` and pushes. `tools/`, `.claude/`, `.github/` and this README stay on `master`.

The folder `sealed/` on `gh-pages` does not come from `master`. The admin app of sealed in the lab builds each encrypted site and pushes it to `gh-pages` as `sealed/<site>/`: a login page, a keyring and ciphertext, never the plain files. `tools/deploy.sh` keeps that folder as it is, and sealed changes nothing outside it. Users, passwords and access are managed in the sealed admin app, not here. The setup is in "Publish below t7d.dev" in the README of sealed.

To deploy by hand, run `tools/deploy.sh` on `master`. A new top-level file or folder that belongs to the site must be added to the `SITE` list in that script, or it is not published.

## Common changes

### Add a write-up

1. Copy `research/cve-2022-46166/index.html` to a new folder under `research/` and edit the content.
2. Link it from the Research section of `index.html`.
3. Add the URL to `sitemap.xml`.

### Update a product page after a game changed

The live demo updates by itself when the game is published to beacon.host. The reel, the poster, the stills and the phone picture are files in `assets/projects/` and must be taken again:

```sh
node tools/reels/kleinbahn-shots.mjs ../tiny-train        # frames of the Kleinbahn shots
node tools/reels/wortzauber-takes.mjs ../wortzauber --rec  # recordings of the Wortzauber takes
node tools/reels/overlays.mjs ../wortzauber                # titles and captions
python3 tools/reels/build.py kb
python3 tools/reels/build.py wz ../wortzauber
python3 tools/reels/build.py publish                       # writes assets/projects/
```

This needs Node with Playwright, ffmpeg, and both game repositories cloned next to this one. The skill in `.claude/skills/updating-product-reels/SKILL.md` has the details, the checks and the pitfalls.

### Add a live demo from a new host

Each product page allows exactly one frame host. Add the new host to `frame-src` in the `Content-Security-Policy` line of that page, or the phone frame stays empty.

### Design and wording

The site is black ink on white paper (white on black in the dark theme), with a thin frame and a small label per section. The only colour is in the pictures and videos. Every colour is a token at the top of `assets/site.css`.

The wording is plain. Say what a thing is and what it does. No slogans, no superlatives, and nothing the site does not hold.
