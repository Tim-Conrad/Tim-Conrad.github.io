# Design

How t7d.dev looks and sounds, and why. Read this before you change a page, a style or a sentence.

## The idea

The site is one drawing sheet from a small office: black ink on white paper, a thin frame, a label on each part. It borrows a few conventions of technical drawings, and no more than that. The content must stay easy to read first.

Two rules follow from this:

1. **Black and white.** The only colour on the site is in the pictures and videos, so they are what the eye finds first. The one exception is a narration while it plays (see Narration below).
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
- Narration colours: `--red` (a problem), `--green` (my own idea), `--blue` (prior work and sources), `--yellow` (a term to remember), with darker values in the dark theme, for parts of a diagram. Words get a solid block in `--blk-red`, `--blk-green`, `--blk-blue` or `--blk-yellow` with `--on-blk` text: deep enough for white text (at least 4.5:1) in both themes. They show only after the reader presses Listen. Use about three marked terms per section.
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
- **The front page stays short.** It says what exists and links to it: overview, the games, the latest thoughts, the research summary with a button to the write-up, the PGP key, contact. Details such as the attack steps and the disclosure timeline belong in the write-up, not here.
- **Title block.** The box next to the name lists site, contents, contact and the PGP fingerprint. It holds facts only. Update "Contents" when a write-up or a game is added.
- **Grid.** The faint 48 px grid appears only behind the name on the front page. It is the one decorative element. Do not put it behind text blocks.
- **Square corners.** Nothing has rounded corners or a shadow, except the phone frame, the step numbers and the dots of the timeline.
- **Spacing.** Lay out with grid or flex and `gap`. Side padding is `--pad`.

## Components

| Component | Class | Notes |
| --- | --- | --- |
| Button | `.btn`, `.btn--ghost` | Filled ink for the main action, outlined for the second. At most one filled button per group. |
| Label | `.label` | Small upper-case mono text above a heading or a value. |
| Facts | `.facts`, `.tb` | Label and value pairs. |
| Code block | `.code` | Dark in both themes, with a bar for the file name and a copy button. |
| Item box | `.proj` in `.projects` | The items of Games, Thoughts and Research on the front page all use it, so the sections look the same. One framed box per item, and the whole box is the link. In this order: a mono label, the name as a heading, a picture (a gameplay loop, a screenshot, or for a thought an inline SVG cover), one or two plain sentences, the link text ("Details and live demo", "Read the thought", "Read the write-up"). |
| Video | `.player` | A silent loop with a poster. It plays while it is on screen. The only controls are one icon button (two bars to pause, a triangle to play) and a 2 px progress line. The button fades out while the video plays and comes back on hover, on keyboard focus and when paused; on touch screens it stays faintly visible. Controls on a video use `--video-bg` and `--video-fg`, black and white in both themes, so they read on any footage. No sound, no native browser controls. |
| Live demo | `.phone`, `[data-demo]` | Loads the game from its own host only after a tap. The note below says so. |
| Timeline | `.changes`, `.tl` | On a game page: one entry per merged pull request that changed play, newest first, on a vertical ink line with a dot per entry (the newest dot filled). Each entry: a mono label with date and PR, the title as `h3`, one sentence on what the clip shows, a short list of the other changes, and the silent clip (the video component) beside the text. One line at the end names the PRs that are not shown. |
| Post list | `.posts` | On `/thoughts/`: date as a label and the status, the title underlined, one sentence. Newest first. |
| Thought | `.tmeta`, `.status` | A page in `/thoughts/<slug>/`: an idea Tim works through and comes back to. Under the title: Status (`Draft`, `Settled` or `Changed my mind`), Started, Last revised. At the end, in this order: Open questions (if any), Starting points (the links the thought began with), Sources, Revisions (`.dates`: date and what changed), Feedback (what people answered when it was shared, and what it changed; "Not shared yet" until then). |
| Animated diagram | `figure.anim` | Inline SVG that moves: lines draw (`.draw`), bars grow (`.grow`, `.grow-l`), parts appear (`.pop`, delays `.d1`-`.d8`) and numbers count up (`[data-count]`) once the figure comes on screen; a token can run along a path (`<animateMotion>`) while it is on screen, with a Pause button. `data-switch="A|B"` adds two buttons that switch the figure between two states (`.w-a`/`.w-b` show, `.hi-a`/`.hi-b` stay strong, `.off-b` fades). `[data-pick]` parts are buttons that show their item of `.pick__list` in a `.pick__panel`. A wide drawing (`.dg-w`) can have a narrow one for phones (`.dg-n`, below 600 px) instead of scrolling. This works in every figure; a narrated thought needs it, because the whole drawing must be in view while the voice explains it. Without the script, the end state and the whole list show. |
| Diagram | `.dg` in a `figure` | Inline SVG drawn only with the classes in `site.css` (`.bx`, `.bx-s`, `.bx-i`, `.ln`, `.t-h`, `.t-s`, ...), which use the colour tokens, so a diagram follows the theme. Give it `<title>` and `<desc>`. In a `.fig-wide` figure it scrolls inside its box on a phone instead of shrinking the text. No colours, no `style` attributes. |
| Diagram with steps | `figure[data-steps]`, `.steps__list` | A diagram whose parts carry `data-step="n"`, with one list item per step. The list sits in a box joined to the bottom of the diagram (`.steps__panel`, surface colour). `site.js` puts the step number, the text of the step and Back, Next and Play into that box and shows one step at a time: earlier steps faint, later ones nearly hidden. Without the script the box holds the whole numbered list. Use it where a process has an order; keep a still diagram where it has none. |
| Narration | `article[data-narration]`, `.say`, `.mk`, `assets/narration.js` | A thought read aloud. `narration.json` next to the page holds the chapters, the figure cues and, once it exists, the audio with its timings; without audio the timing is simulated. Listen sits under the title; the player is a thin strip at the bottom. A grey tint marks the phrase that the voice reads, words darken as they are spoken, and the other blocks dim by text colour (never opacity). `.mk` terms get a colour block that stays. `.say` holds text that only the voice says: folded until the voice reaches it, then open, with the label "Spoken". Under a figure, only the paragraph that the voice reads shows, and the caption waits. The skill `narrating-a-thought` has the rules. |
| Encrypted site login | `.sealed` | The login page of a site below `/sealed/`, written by sealed (theme `t7d`). Label "Encrypted", the title as `h1`, one hint, username, password, one filled button "Open", a mono status line. Inputs are framed in ink with square corners. |

## Rules that are easy to break

- **No third-party requests.** Each page has a strict Content-Security-Policy in a `<meta>` tag. Scripts and styles are files in `assets/`: no inline `<script>`, no inline `<style>`, no `style=""` attribute. A new outside host (a demo in a frame) needs its own entry in that page's policy.
- **Links are underlined.** Colour cannot mark a link here.
- **Keyboard focus is visible**: a 3 px ink outline.
- **Phone first.** Check each change at 1440, 390 and 320 px wide, in both themes. The page must not scroll sideways. Wide tables and code scroll inside their own box.
- **Motion.** The interface does not move, apart from smooth scrolling to a section. The exceptions are recordings of real things: the videos, which loop silently and do not start by themselves for a visitor who asked for reduced motion, and the gameplay loop in a game box: a short animated WebP of the real game, loaded lazily. A visitor who asked for reduced motion gets a still instead, through the `<picture>` element. The other exceptions are diagrams in a thought. A diagram with steps changes only when the reader presses Back, Next or Play. An animated diagram (`figure.anim`) plays its drawing once when it comes on screen, and a running token moves only while the figure is on screen and stops with its Pause button. Animation explains something in the diagram; it is never decoration. A narration moves only while it plays: the phrase marker, the colour blocks and the figure steps follow the voice. A visitor who asked for reduced motion gets the end state at once, and the running token stands still until Play.
- **Pictures.** Give every picture `width`, `height` and a plain `alt` text that describes what it shows.

## Where things are

- Styles and tokens: `assets/site.css`
- Scripts: `assets/theme.js` (theme before the first paint), `assets/site.js` (toggle, copy buttons, table of contents, the demo), `assets/narration.js` (the narration of a thought)
- Reels and pictures of the games: `.claude/skills/updating-product-reels/SKILL.md`
- Deploy and repository layout: `README.md`
