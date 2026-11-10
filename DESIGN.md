# Design

How t7d.dev looks and sounds, and why. Read this before you change a page, a style or a sentence.

## The idea

The site is one drawing sheet from a small office: black ink on white paper, a thin frame, a label on each part. It borrows a few conventions of technical drawings, and no more than that. The content must stay easy to read first.

Two rules follow from this:

1. **Black and white.** The only colour on the site is in the pictures and videos, so they are what the eye finds first.
2. **Plain words.** The site says what it holds and what a thing does. It does not sell.

## Wording

The tone is honest and down to earth.

- Say what a thing is, then what it does. "An island-railway sandbox in three.js, built for phones."
- No slogans, no superlatives, no promises. Not "a theme colour that ran code", but "Remote code execution in Spring Boot Admin".
- Claim only what is true and on the site. Read a game's `README.md` before you name a feature. Do not invent a biography, numbers or customers.
- First person, short sentences, active voice. "I reported the vulnerability to codecentric by email."
- Headings name their content: "Two games", "PGP key", "Contact".
- A caption or a label names what is shown: "Trains", "Shuttle launch", "Trace each letter".
- Buttons say what happens: "Read the write-up", "Download key.asc", "Play it here".
- The write-up under `research/` is Tim's own text. Restyle it, but do not rewrite it.

## Colour

Every colour is a token at the top of `assets/site.css`. A component never uses a literal colour, with one exception: the phone frame is always black with a white play button, because it stands for a real device.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--bg` | `#ffffff` | `#0e0e0e` | Paper |
| `--ink` | `#111111` | `#f2f2f2` | Text, rules, filled buttons |
| `--muted` | `#5c5c5c` | `#a3a3a3` | Secondary text, labels |
| `--soft` | `#d9d9d9` | `#2c2c2c` | Light dividers, the grid behind the name |
| `--surface` | `#f4f4f2` | `#1a1a1a` | Inline code, notes |
| `--code-bg`, `--code-fg` | `#111111`, `#f2f2f2` | `#1a1a1a`, `#f2f2f2` | Code blocks |

- There is no accent colour. Emphasis is an inverted block: ink background, paper text. Use it once per group (the main button, the CVE tag).
- The dark theme is the same drawing in white on black. It follows the system setting, and the toggle in the nav overrides it. A new token needs a value in all three blocks: `:root`, the `prefers-color-scheme` block and `[data-theme="dark"]`.
- Pictures and videos keep their own colours. Do not tint, filter or desaturate them.

## Type

All fonts are in `assets/fonts/` (SIL Open Font License). Nothing loads from another site.

| Role | Font | Use |
| --- | --- | --- |
| Display | Barlow Condensed 600, 700 | Headings, the name, feature titles |
| Body | Karla (variable) | Running text, buttons, the nav |
| Mono | IBM Plex Mono 400, 500 | Labels, dates, code, the fingerprint |

- Headings are in sentence case. Only the small mono labels are upper case, with letter spacing.
- Running text is 17 px with a line height of 1.55, and at most about 62 characters wide.
- The scale is `--step--1` to `--step-3`. Use these steps and do not add sizes in between.

## Layout

- **The sheet.** `body` is the sheet: at most 82 rem wide, centred, with a 1.5 px frame. Do not add a second frame inside it.
- **Sections.** A full-width rule (`--rule`, 1.5 px) separates the sections. Lighter 1 px rules divide things inside a section.
- **Section label.** Each section of the front page starts with a mono label, "Sheet 2 · Research", then an `h2`, then one short paragraph. The sheet numbers follow the page order, so renumber them when a section is added or moved.
- **The front page stays short.** It says what exists and links to it: overview, the research summary with a button to the write-up, the games, the PGP key, contact. Details such as the attack steps and the disclosure timeline belong in the write-up, not here.
- **Title block.** The box next to the name lists site, contents, contact and the PGP fingerprint. It holds facts only. Update "Contents" when a write-up or a game is added.
- **Grid.** The faint 48 px grid appears only behind the name on the front page. It is the one decorative element. Do not put it behind text blocks.
- **Square corners.** Nothing has rounded corners or a shadow, except the phone frame and the step numbers.
- **Spacing.** Lay out with grid or flex and `gap`. Side padding is `--pad`.

## Components

| Component | Class | Notes |
| --- | --- | --- |
| Button | `.btn`, `.btn--ghost` | Filled ink for the main action, outlined for the second. At most one filled button per group. |
| Label | `.label` | Small upper-case mono text above a heading or a value. |
| Facts | `.facts`, `.tb` | Label and value pairs. |
| Code block | `.code` | Dark in both themes, with a bar for the file name and a copy button. |
| Game box | `.proj` | One framed box per game, and the whole box is the link to the details page. In this order: the name as a heading, a gameplay loop, one or two plain sentences, "Details and live demo". |
| Video | `.player` | A silent loop with a poster. It plays while it is on screen. The only controls are one small Play/Pause button and a thin progress line. No sound, no native browser controls. |
| Live demo | `.phone`, `[data-demo]` | Loads the game from its own host only after a tap. The note below says so. |

## Rules that are easy to break

- **No third-party requests.** Each page has a strict Content-Security-Policy in a `<meta>` tag. Scripts and styles are files in `assets/`: no inline `<script>`, no inline `<style>`, no `style=""` attribute. A new outside host (a demo in a frame) needs its own entry in that page's policy.
- **Links are underlined.** Colour cannot mark a link here.
- **Keyboard focus is visible**: a 3 px ink outline.
- **Phone first.** Check each change at 1440, 390 and 320 px wide, in both themes. The page must not scroll sideways. Wide tables and code scroll inside their own box.
- **Motion.** The interface does not move, apart from smooth scrolling to a section. The exceptions are recordings of real things: the videos, which loop silently and do not start by themselves for a visitor who asked for reduced motion, and the gameplay loop in a game box: a short animated WebP of the real game, loaded lazily. A visitor who asked for reduced motion gets a still instead, through the `<picture>` element.
- **Pictures.** Give every picture `width`, `height` and a plain `alt` text that describes what it shows.

## Where things are

- Styles and tokens: `assets/site.css`
- Scripts: `assets/theme.js` (theme before the first paint), `assets/site.js` (toggle, copy buttons, table of contents, the demo)
- Reels and pictures of the games: `.claude/skills/updating-product-reels/SKILL.md`
- Deploy and repository layout: `README.md`
