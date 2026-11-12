---
name: narrating-a-thought
description: Use when Tim wants a thought on t7d.dev read aloud, narrated, turned into audio or a podcast, given read-along highlighting, or explained by a voice. Also use when the narration script, the voice, the ElevenLabs audio or the narration player of a thought must change, or when a narrated page feels restless, hides its diagram on a phone, or loses the listener.
---

# Narrating a thought

A narrated thought works two ways from one recording: Tim reads and listens at the same time, or he listens on the go with the screen off. The voice tells more than the page: it explains every figure and bridges the sections. The page follows the voice calmly and never hides the figure that the voice explains.

The design below was tested with Tim in a prototype on 12 Nov 2026. Do not reopen these decisions unless Tim asks. The research behind them is in `attention-research.md`. The reference implementation is `reference-player.html` in this folder.

## Audio costs credits: generate only when Tim says so

- Generate ElevenLabs audio only when Tim says that the text of the thought is final and must be narrated. Approval of a cost estimate is not that instruction.
- Do not make voice samples. The voice is chosen (see the table).
- For all other work (script drafts, player changes, demos), reuse the audio that exists. For humans-md, Tim keeps a demo in `drafts/narration/humans-md/` (gitignored, local only).
- Do not read, print or commit the key. It is in `~/.config/wortzauber/elevenlabs.key`. Send it only as the `xi-api-key` header.
- Before a generation, tell Tim the character count. After it, tell him what it used.

## Decided design

| Part | Decision |
| --- | --- |
| Voice | Jonathan Livingston, ElevenLabs library, `PIGsltMj3gFMR34aFDI3`, rate 1.0. Model `eleven_multilingual_v2`, settings stability 0.5, similarity 0.75, style 0.1, speaker boost on. Eric (`cjVigY5qzO86Huf0OWal`) is the second choice. |
| Call | `POST /v1/text-to-speech/{voice}/with-timestamps?output_format=mp3_44100_96`, one call for the whole script. Keep `characters`, `character_start_times_seconds` and `character_end_times_seconds` as `narration.json`. |
| Script | One paragraph of the script per block on the page, separated by a blank line. Page text is read word for word. Say file names in spoken form ("Claude dot M D"). |
| Spoken parts | Text that only the voice says: an intro (title, author, length, "figures are described"), a bridge where the argument jumps between sections, a figure walk-through, a takeaway after a figure, an outro that names the next part. No bridge between paragraphs of one section. |
| Where spoken parts show | In the text, at their place, folded. Each opens in place when the voice reaches it and stays open. A small mono label "Spoken" and muted text mark it. A setting opens all of them. Never a caption box or pop-up over the text. |
| Marker | A phrase marker: a grey tint (`--ink` at 16%) over a phrase of up to 7 words, cut at punctuation or at a pause over 0.5 s. It moves about every 2 s and can cover two lines. Inside it, words go from 50% to full opacity as they are spoken. No per-word block. |
| Colours | Red: problem. Green: Tim's own idea. Blue: prior work and sources. Yellow: a term to remember. A marked term (`.mk`) gets a solid block when the voice says it, and the block stays. Text blocks use deep colours with white text in both themes: `#c62f22`, `#16803e`, `#2554d0`, `#9a6700`. Diagrams use the theme colours. |
| Other paragraphs | Dim them by text colour, never by `opacity`. Opacity also fades the colour blocks until their text disappears. |
| Code words | In read-along text, mono font only, no grey chip. In the dark theme the chip reads as a black block. |
| Figure on a phone | Show one drawing at a time (`.dg-w`, or `.dg-n` below 600 px). Under the figure, show only the spoken paragraph that the voice reads now. Scroll so that the whole figure and that paragraph fit above the player. Scroll again when a spoken part above it finishes opening. |
| Diagram cues | Parts of the figure react to phrases in the script: an axis gets thicker while it is described, a point takes its colour when it is named, a ring pulses on the point that the voice describes now. Derive all cue states from the playback position, so seeking backwards undoes them. |
| Player | A thin strip at the bottom: play, back 15 s, forward 15 s, chapter name and time (tap opens chapters), speed 1, 1.15, 1.3, 0.9. Ticks on the progress line mark chapters. No 2x. |
| Behaviour | Tap a paragraph to play from there. A reader who scrolls away is not pulled back. "Back to the voice" appears. Remember the position and offer "Resume". Media Session for lock screen and headphone controls. Load the mp3 as a blob, so seeking works on any host. |
| Offline | Tim wants a PWA: install the site and keep a thought's audio offline. A service worker and a manifest change the rule "only theme.js and site.js" in CLAUDE.md. Ask Tim before you add them, and update CLAUDE.md and DESIGN.md with them. A podcast RSS feed or an mp3 download link is not decided: ask Tim first, because both are public. |

## Writing the script

1. Copy the page text of each block word for word.
2. Add the spoken parts. Write for the ear: short sentences of varied length, one idea each. A bridge names the gap and asks the next question ("So that is the gap... did someone already write the other file?").
3. Walk through a figure in this order: what kind of drawing it is, its axes or structure, each part in a fixed order with its colour, then the takeaway. Describe the point, not every pixel. For a `data-steps` figure, one script paragraph per step.
4. Add no jokes or anecdotes that do not carry the argument.
5. Show the script to Tim as text before any audio exists.

## Check before you report

- At 412 px in light and dark: one drawing per figure, the whole figure plus its current paragraph visible above the player, no sideways scroll, no console errors.
- Every `.mk` block: full opacity and text contrast of at least 4.5:1 while another paragraph plays. Measure it with a script, do not judge it by eye.
- Jump to each chapter. Cues, spoken parts and the marker must match the voice.
- Show the result as a Claude artifact. You cannot judge the sound yourself. Say so.

## Mistakes that happened

| Mistake | Fix |
| --- | --- |
| A solid block on every word: about 3 moves per second and a black/white flash per word felt restless. | The phrase marker. |
| A caption box for audio-only text broke the reading. | Folded spoken parts in the text. |
| `.fig svg{display:block}` beat `.dg-n{display:none}`, so both drawings showed. | `.fig svg.dg-n{display:none}`. |
| The whole figure description under the figure pushed the drawing off the phone screen. | Only the current paragraph under the figure. |
| A python `http.server` cannot seek in an mp3 (no range requests). | Load the audio as a blob. |
