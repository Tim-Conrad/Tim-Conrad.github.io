# HUMANS.md

How I work with language models. The agent has its CLAUDE.md. This file is for me.

Version 0.2, 10 Nov 2026. The thinking behind it: https://t7d.dev/thoughts/humans-md/

## With every model

1. Agree first. For anything bigger than a small fix, let the model ask me questions until the plan is clear. Keep the words we agreed on.
2. Say what I want done. "Change it", not "can you suggest". Give the reason for a rule instead of capital letters.
3. Give context as to a new colleague: the goal, the limits, where to look.
4. Read what I merge. Tests show that it works. Reading shows that I understand it.
5. When something breaks, look first myself, or ask for the explanation with the fix.
6. Do some small work without a model, regularly, so I can still do it.
7. Measure instead of feel, without extra work: once a month and after each model switch, read the report from the session transcripts and git. Look at the sessions that went worst.

## When a new model ships

1. Read the model card and the vendor's prompting guide. Look for what the model does more, what it does less, and what to remove.
2. Do one real task without my CLAUDE.md files. Compare.
3. Remove what the new model no longer needs: capitals, old workarounds, extra checks.
   Let a review skill and `/doctor prompt-audit` in Claude Code find these, then decide myself.
4. Write one entry in the log.
5. Two weeks later, read the entry again. Was it right?

## Log

| Date | Model | What the guide says changed | What I change | Two weeks later |
| --- | --- | --- | --- | --- |
| 10 Nov 2026 | Claude Opus 5.5 | Newer Claude models follow instructions literally, check their own work, and react strongly to words like CRITICAL | To try: remove capitals and "verify each step" lines from my CLAUDE.md files | |
| 10 Nov 2026 | Claude Opus 5.5, Fable 5.2 | Claude Code docs: CLAUDE.md under 200 lines, no file layout, no emphasis, hooks for hard rules, the check command first | t7d.dev CLAUDE.md from 76 to 33 lines: notes into a skill and a hook, a page check in CI, page rules on demand | |
