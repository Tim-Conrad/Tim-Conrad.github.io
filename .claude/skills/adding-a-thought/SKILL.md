---
name: adding-a-thought
description: Use when Tim gives a link (a web page, a tweet or X post, a paper, a repository, a video) or an idea and wants to think it through as a new thought on t7d.dev, when he wants to revise an existing thought, change its status, or add feedback that people gave on X or LinkedIn. Also for "new thought", "add this to my thoughts", "write a thought about".
---

# Adding a thought

The thoughts in `thoughts/<slug>/` are Tim's archive of ideas he works through and comes back to. Anyone can read them, but they are mostly for him: each keeps where it started, what it rests on, its status and how it changed. The reference page is `thoughts/humans-md/index.html`.

## 1. Gather the starting point

- Read what Tim gave you. For a web page use WebFetch, or the `web-fetch` agent. X often blocks fetches: try the post's URL, then a reader or embed URL (`https://publish.twitter.com/oembed?url=<post>`), and if that fails, ask Tim to paste the text. Never guess what a post says.
- Note the author, the date and one sentence of what it claims. These go into "Starting points".

## 2. Think it through with Tim before you write

Ask 2 to 4 questions per round with AskUserQuestion, and wait for the answers. Tim wants to iterate on the idea, not get a finished report. Good questions:

- What caught his interest: the claim, the method, or a use for his own work?
- His own practice today. The thought must be honest about it ("Mostly I go by feel" is fine, inventing a habit is not).
- Where he disagrees or is unsure.
- The form of the figures: what should move, what should be switchable.

After a research round, share what you found with one or two more questions before you write.

## 3. Research

- Small: a few WebSearch and WebFetch calls yourself.
- Big, or when Tim asks for it: the `deep-research` workflow, with the refined question as args. While it runs, ask Tim the questions from step 2.
- Check every number and quote against a primary source. Mark what you could only see in a search snippet, and leave it out or paraphrase it. Name who coined a term only with a dated source (for example the first commit).

## 4. Write

The voice is DESIGN.md "Wording": first person, short sentences, plain words, no slogans. A thought is not a report:

- Open with the question or the itch, in Tim's words.
- One section per step of the thinking. Headings name their content.
- Figures carry the ideas that are easier to see than to read. Use `figure.anim` (DESIGN.md "Animated diagram"): a drawing that plays once on screen, a two-state switch, parts to tap, a running token. Draw a narrow version (`.dg-n`) for phones. Use only the `.dg` classes, no colours, no `style` attributes.
- End with what Tim takes from it: a rule, a draft, a file, or open questions.

Write for a technical reader who does not know every concept. Tim's feedback on encrypted-patches (12 Nov 2026): the TUF and drand parts were too short and had too many new words, and the games and patents sections felt meaningless.

- Explain each new term where it first appears, in one plain sentence: what it is, then why it matters here. "A bug that is already fixed and public is called an n-day." A name alone (TUF, Uptane, drand, tlock) is not an explanation.
- Give a mechanism the room it needs. If the argument rests on it, explain how it works in a few short paragraphs, with an everyday comparison where one fits. Do not compress it into a list of terms.
- Every section must carry the argument. End a detour or an example with what it teaches for the idea ("So the lesson from games is four rules"). If it teaches nothing, cut it or fold it into the section it serves. Background such as patents gets one short paragraph with the practical consequence.
- Use few numbers in a row. After a dense list, say in one sentence what the numbers show.
- Check every new explanation against a primary source, like any other claim.
- If the thought will be read aloud, use the skill `narrating-a-thought` too. Text that reads well aloud also reads well on the page.

## 5. The page

Copy `thoughts/humans-md/index.html` and keep its structure:

1. `<head>`: title, description, canonical, `og:*`, `article:published_time` (the start date). The feeds and `llms.txt` are made from it at deploy time.
2. `.post-head`: crumb to `/thoughts/`, `h1`, `.sub`, a label with topics, and `.tmeta`: Status, Started, Last revised.
3. `.toc` with every `h2`.
4. The text, then in this order: Open questions (if any), Starting points, Sources (`ol.refs`, `id="s1"`...), Revisions (`ul.dates`), Feedback.

Status is one of `Draft` (still forming), `Settled` (Tim stands by it) and `Changed my mind`. Set it only as Tim says; a new thought is `Draft`.

Then:

- Add it at the top of the list in `thoughts/index.html` (date, status, title, one sentence).
- Add it as the first `.proj` box in the Thoughts section of `index.html`, with an inline SVG cover. Keep two boxes there; the list holds the rest. Update the count in "Contents" in the title block.
- Add the URL to `sitemap.xml`.
- A file to download (like `HUMANS.md`) goes into the thought's folder.

## 6. Check, let Tim review, ship

Follow CLAUDE.md: serve the site (`python3 -m http.server 8000`), look at 1440, 390 and 320 px in both themes, no sideways scroll, no console errors. Click every switch and pick, and look at the narrow drawings. Commit on the session's branch and push.

Tim reviews a thought as a Claude artifact before it is published: run `python3 scripts/preview-artifact.py thoughts/<slug> <scratchpad>/preview-<slug>` and publish its `index.html` with the Artifact tool, with every other printed file in `files`. After a change, build again and publish the same `file_path`, so the link stays the same. Comments on the artifact reach the session: answer them and change the page in the repository, never only in the bundle. `scripts/ship.sh <pr>` merges and checks the live site when Tim asks for it.

## Revising a thought

- Change the text, set "Last revised", and add one line at the top of Revisions: the date and what changed, and why ("Changed the third rule after feedback on LinkedIn").
- Change the status only as Tim says.
- Feedback: quote or summarise what people said, with a link to the post, and what it changed. If it changed nothing, say so.
- Keep the old start date in `article:published_time`.

## Sharing a thought

To draft X and LinkedIn posts for a thought and bring the replies back, use the skill `sharing-a-thought` from `Tim-Conrad/Tim-Conrad-Skills`. It records each post and the feedback in the thought's Feedback section, with the revision rules above.
