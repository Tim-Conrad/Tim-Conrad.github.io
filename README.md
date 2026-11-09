# wq.d0-0b.pw

Personal site of Tim Conrad. Plain HTML, CSS and a little JavaScript. No build step, no dependencies, no third-party requests.

## Layout

| Path | What it is |
| --- | --- |
| `index.html` | Front page |
| `research/cve-2022-46166/` | CVE-2022-46166 write-up |
| `CVE/CVE-2022-46166/` | Redirect from the old MkDocs URL |
| `404.html` | Not-found page |
| `key.asc` | PGP public key |
| `projects/kleinbahn/`, `projects/wortzauber/` | Product pages of the two games, with a reel and a tap-to-play live demo |
| `assets/projects/` | Reels, posters and stills of the product pages |
| `tools/reels/` | Scripts that film the games and cut the reels (see `.claude/skills/updating-product-reels/`) |
| `assets/site.css` | All styles and colour tokens |
| `assets/theme.js` | Applies the saved theme and accent before first paint |
| `assets/site.js` | Theme toggle, the `site.theme_color` editor, copy buttons |
| `assets/fonts/` | Self-hosted fonts (SIL Open Font License, see `OFL.txt`) |

## Preview locally

```sh
python3 -m http.server 8000
```

Then open <http://localhost:8000>. Paths are absolute, so serve from the repository root.

## Deploy

GitHub Pages, deploying from the root of the default branch. `.nojekyll` turns off Jekyll processing and `CNAME` sets the custom domain.

## Add a write-up

Copy `research/cve-2022-46166/index.html` to a new folder under `research/`, edit the content, and link it from the Research section of `index.html`. Add the URL to `sitemap.xml`.
