# CLAUDE.md

t7d.dev: the personal site of Tim Conrad. Plain HTML, CSS and a little JavaScript, with no build step and no dependencies.

## Read first

- `DESIGN.md` - how the site looks and sounds. Read it before you change a page, a style or any wording.
- `README.md` - what is on the site, the repository layout, the deploy and the common changes.

## Project map

- `index.html`, `404.html` - front page and not-found page.
- `research/`, `projects/`, `CVE/` - one folder with an `index.html` per page. `CVE/` only redirects an old address.
- `assets/site.css` - all styles and the colour tokens.
- `assets/theme.js`, `assets/site.js` - the only scripts.
- `assets/projects/` - reels, posters and stills of the two games.
- `tools/deploy.sh`, `.github/workflows/deploy.yml` - the deploy to `gh-pages`.
- `tools/reels/` - the scripts that film the games and cut the reels.

## Rules for every task

- Follow `DESIGN.md`. The two rules that matter most: the site is black and white with colour only in pictures and videos, and the wording is plain with no slogans or overstatement.
- Claim only what is true. Do not invent facts about Tim, the research or the games.
- Do not rewrite the text of the write-up under `research/`. It is Tim's own.
- Keep the Content-Security-Policy of each page strict: no inline scripts or styles, no `style=""` attributes, and no request to another site on page load.
- `master` is the source. Never edit `gh-pages` by hand: the workflow publishes it after every push to `master`.

<important if="you change a page, a style, a component or any wording">
Read `DESIGN.md` first. After the change, serve the site and look at it at 1440, 390 and 320 px wide, in the light and the dark theme. The page must not scroll sideways, and the browser console must show no errors.
</important>

<important if="you need to preview or check the site">
Run `python3 -m http.server 8000` in the repository root and open `http://localhost:8000`. All paths are absolute, so serve from the root.
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

<important if="you deploy, or the live site does not show a change">
See "Deploy" in `README.md`. GitHub Pages serves the `gh-pages` branch at https://t7d.dev.
</important>
