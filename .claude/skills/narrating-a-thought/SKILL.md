---
name: narrating-a-thought
description: Use when Tim wants a thought on t7d.dev read aloud, narrated, turned into audio or a podcast, given read-along highlighting, or explained by a voice. Also use when the narration script, the voice, the ElevenLabs audio, narration.json or assets/narration.js must change, or when a narrated page feels restless, hides its diagram on a phone, or loses the listener.
---

# Narrating a thought

A narrated thought works two ways from one recording: Tim reads and listens at the same time, or he listens on the go with the screen off. The voice tells more than the page: it explains every figure and bridges the sections. The page follows the voice calmly and never hides the figure that the voice explains.

The design was tested with Tim on 12 Nov 2026, first in a prototype, then on `thoughts/encrypted-patches/`, the reference page. Do not reopen these decisions unless Tim asks. The research behind them is in `attention-research.md`.

## Audio costs credits: generate only when Tim says so

- Generate ElevenLabs audio only when Tim says that the text of the thought is final and must be narrated. Approval of a cost estimate is not that instruction.
- Do not make voice samples. The voice is chosen (see the table).
- Until then, the page runs on simulated timing (about 160 words a minute). Tim reads along and judges the text, the spoken parts and the figures without audio.
- Do not read, print or commit the key. It is in `~/.config/wortzauber/elevenlabs.key`. Send it only as the `xi-api-key` header.
- Before a generation, tell Tim the character count. After it, tell him what it used.

## How it is built

| Part | Where |
| --- | --- |
| Player, marker, cues, scrolling | `assets/narration.js` (no inline script, the CSP stays strict). The page loads it with `<script src="/assets/narration.js" defer>` and needs `connect-src 'self'` in its CSP for the JSON. |
| Styles and the colour tokens | "Narration" in `assets/site.css`. DESIGN.md has the rules. |
| Opt-in | `<article class="prose" data-narration="/thoughts/<slug>/narration.json">` |
| The script | The page itself: every `h2`, `p` and `li` of the article up to `#sources`, in order, without source marks, plus the `.say` blocks. Figures, captions and code blocks are not read. |
| Spoken parts | `<div class="say" id="say-..."><p><span class="say-k">Spoken</span>...</p></div>` in the page. `data-pause="2.5"` adds silence after it. |
| Colour blocks | `<span class="mk" data-c="red|green|blue|yellow">term</span>` in the text. It turns on when the voice reaches its first word. Nothing else is needed. |
| `narration.json` | `title`, `voice`, `audio` (mp3 path or null), `timing` (`{start: [...], end: [...]}` per character of the script, or null for simulated), `chapters` (`[id, title]`, id of an `h2` or a `.say`), `spoken` (id to spoken form, where TTS must hear other words than the page shows), `cues`. |
| Figure cues | `{"in": "say-fig1", "p": "phrase in the script", "until": "phrase", "sel": ".cue-find", "cls": "hot"}`. `sel` is looked up inside the figure of `in`. `hot` makes that part stand out while the rest of the figure steps back. Without `cls`, the part gets `on`, and `[data-c].on` fills with its colour. Without `until`, the cue stays on. |
| Step figures | The list items of `figure[data-steps]` are part of the script. The voice sets the step (`narration:step` event in `site.js`). |
| Switch and pick figures | Not driven by the voice yet (`data-switch`, `data-pick`). Use `hot` cues on their parts, and describe both states of a switch in order. To let the voice flip a switch, add an event to `site.js` like `narration:step`, and ask Tim first. |

## Decided design

| Part | Decision |
| --- | --- |
| Voice | Jonathan Livingston, ElevenLabs library, `PIGsltMj3gFMR34aFDI3`, rate 1.0. Model `eleven_multilingual_v2`, stability 0.5, similarity 0.75, style 0.1, speaker boost on. Eric (`cjVigY5qzO86Huf0OWal`) is the second choice. |
| Generation | `POST /v1/text-to-speech/{voice}/with-timestamps?output_format=mp3_44100_96`. The model takes at most 10,000 characters per request, so make one request per chapter with `previous_text` and `next_text`. Join the mp3 files and offset the character timings into one `timing` for the whole script. |
| Spoken parts | An intro (title, author, length, the 2 or 3 key terms, "figures are described"). A bridge only where the argument jumps between sections, never where a section opens with its own bridge sentence. A walk-through per figure. A short summary after a dense list of numbers. One pause question at the end of a long section (at most two per thought). An outro that sums up in two or three sentences. |
| Figure walk-through | What kind of drawing, its structure, each part in a fixed order, then the takeaway. Describe it so that it fits both the wide and the narrow drawing: "three parts", "the top row", not "on the left". Split a long walk-through into paragraphs of at most about 60 words. For a step figure, a short intro, then the step items carry it. |
| Marker | A grey tint (`--ink` at 16%) over a phrase of up to 7 words, cut at punctuation or at a pause over 0.5 s. It moves about every 2 s. Words go from 50% to full opacity as they are spoken. No per-word block. |
| Colours | Red: problem. Green: Tim's own idea. Blue: prior work and sources. Yellow: a term to remember. About three per section. |
| Other blocks | Dim by text colour, never by `opacity`. Opacity faded the colour blocks until their text disappeared. |
| Figures on a phone | Every wide figure needs a narrow drawing (`.dg-n`, 360 wide, same `data-step` and cue classes). Under a figure, only the paragraph that the voice reads shows, and the caption waits. The page scrolls the whole figure into the space between the site header and the player. |
| Player | Strip at the bottom: play, back (to the start of the sentence, or the one before), forward 15 s, chapter and time (tap: chapters, "Show all spoken parts"), speed 1, 1.15, 1.3, 0.9. No 2x. After a pause of more than 30 s, play starts at the beginning of the sentence. |
| Offline, podcast | A PWA (service worker, manifest) changes the rule "only theme.js and site.js" in CLAUDE.md. A podcast feed or an mp3 download is public. Ask Tim before any of these. |

## Writing the text for a narrated thought

Use the skill `adding-a-thought` for the text. Then:

1. Mark about three terms per section with `.mk`.
2. Add the spoken parts as `.say` blocks at their places.
3. Write the chapters and the figure cues into `narration.json`.
4. Draw a narrow version of every wide figure.

## Check before you report

- `python3 scripts/check.py` passes. `node --check assets/narration.js` passes.
- Serve the site. At 412 x 780 in light and dark, click into every figure paragraph and every step: the figure must sit between the header and the player. Measure it with a script.
- No sideways scroll at 1440, 390 and 320 px. No console errors.
- No label of a narrow drawing leaves its box or the frame. Check it with `getBBox()`.
- Show it as an artifact with `scripts/preview-artifact.py`. Say that the timing is simulated, or that you cannot judge the sound.

## Mistakes that happened

| Mistake | Fix |
| --- | --- |
| A solid block on every word: about 3 moves per second and a black/white flash per word felt restless. | The phrase marker. |
| A caption box for audio-only text broke the reading. | Folded spoken parts in the text. |
| The whole figure description under the figure pushed the drawing off the phone screen. | One paragraph under the figure, caption hidden, narrow drawing. |
| A walk-through said "on the left" while the phone showed a stacked drawing. | Layout-neutral words. |
| The sticky site header covered the top of the framed figure. | Subtract the header height when scrolling. |
| A wide drawing scrolled sideways inside its box, so half of it was out of view. | A narrow drawing. |
| A python `http.server` cannot seek in an mp3 (no range requests). | Load the audio as a blob. |
