---
name: updating-game-timeline
description: Use when a game (Kleinbahn / tiny-train or Wortzauber) got new merged pull requests and the "How it changed" timeline on its product page must grow, when a timeline clip must be filmed again, or when the timeline of another game must be started. Each entry is one merged PR with one short clip filmed at that PR's git state.
---

# Updating the game timeline

## Overview
The product page of a game has a section "How it changed": one entry per merged pull request that changed play, newest first, on a vertical line with a dot per entry. Each entry has a short silent clip, filmed from the game at the PR's merge commit, one sentence on what the clip shows, and a short list of the other changes in that PR.

| Game | Stages | Clips | Page |
| --- | --- | --- | --- |
| Kleinbahn | `scripts/reels/timeline-kleinbahn.mjs`, filmed by `timeline.mjs` | `assets/projects/timeline/kleinbahn-<id>.mp4` and `.jpg` | `projects/kleinbahn/index.html`, section `#changes` |
| Wortzauber | `scripts/reels/timeline-wortzauber.mjs`, filmed by `timeline-wz.mjs` | `assets/projects/timeline/wortzauber-<id>.mp4` and `.jpg` | `projects/wortzauber/index.html`, section `#changes` |

## Rules
- **One clip per PR, the coolest change.** Pick the change a player sees and enjoys most: something that moves on the island beats a panel, a panel beats a fix. List the rest of the PR in one short line each.
- **Only PRs that change play get an entry.** Test, build, deploy and docs PRs are named in one line at the end of the section ("Not shown: ...").
- **Film the real game at that PR's state.** Never film a later state for an older entry, and never draw or fake a picture. A shared-play clip uses the scripted second player of the timeline script (the same set-up as the game's `tools/netcheck.mjs`); the entry says so.
- **Wording** follows `DESIGN.md`: plain, names what the clip shows, no slogans. Claim only what the commit message, the PR or the code says.

## Token-efficient workflow
Do not read the code of every PR. Work from the git log.

1. Clone the game next to this repo (`add_repo` in a cloud session) and get the full history: `git -C ../tiny-train fetch --unshallow origin main` (or `git fetch origin main`).
2. List the merges since the last entry: `git -C ../tiny-train log origin/main --merges --format='%h %ad %s' --date=short`. The last filmed ref is the last stage in the stages file.
3. Read each new PR's commit messages only: `git -C ../tiny-train log --format='%B' <merge>^1..<merge>^2`. They name every change. Decide: entry or "Not shown", and which change to film.
4. Find the names a shot needs with one `git grep` at that ref (`git -C ../tiny-train grep -n 'function aStartFlight' <ref> -- src/game`), not by reading files.
5. Add one stage per new entry to the stages file (fields: see the comment at its top). Copy the closest existing stage: an event (`setup` + `until` + `cam: null` to follow), a camera move (`cam`), a UI moment (`ui: true` and an `each` that presses a button), shared play (`net: 'host'` or `'guest'`).
6. Test only the new stages, three frames each: `node scripts/reels/timeline.mjs ../tiny-train --test --only pr14`. Join the frames into one sheet and read it (`ffmpeg -i <work>/tl/kb-test/pr14/%04d.jpg -vf tile=3x1 sheet.jpg`).
7. Film them: `node scripts/reels/timeline.mjs ../tiny-train --only pr14` (about 1 to 3 s a frame; a stage of 96 frames takes 2 to 5 min).
8. Cut: `python3 scripts/reels/build.py timeline` writes the clips and posters of every filmed stage into `assets/projects/timeline/` (640x360, about 100 to 400 KB each).
9. Add the entry to `projects/kleinbahn/index.html`: copy the first `<li>` of `.tl` and put the new one above it (newest first). Date, PR number, title, the sentence on the clip, the list of the other changes.
10. Serve the site and check `/projects/kleinbahn/#changes` at 1440, 390 and 320 px, light and dark. Commit the stages file, the clips and the page.

## The timeline script
- `scripts/reels/timeline.mjs` checks out each stage's `ref` as a git worktree in `<work>/tl/wt/`, links `node_modules` from the game repo, opens that version through its own `tools/page.mjs` (virtual clock, seeded random), films the frames and removes the worktree. `<work>` is `$REELS_WORK` or `.reels/`.
- One frame is one `__KB.step(1, 1/24)`. A canvas stage reads the WebGL canvas; a `ui` stage takes a page screenshot, so the controls and toasts show.
- `net: 'host'`: the game hosts and `window.__peer` is a guest (`__peer.world` its island, `__peer.sync` its engine). Change `__peer.world.layers` and the host gets it next frame; `__peer.sync.presence({...})` moves its pin.
- `net: 'guest'`: the game joins `__peer`, a host whose island is the game's own island without trees. `__peer.sync.event(k, id, e, d)` starts a host event (eruption, launch, fire); `__peer.sync.leave()` closes the room.
- A name a stage uses must exist at that ref. If a stage prints `FAILED` or `ERR`, `git grep` the name at the ref.
- Node 22 runs the script. Run nothing heavy next to it, and never next to a Wortzauber recording.

## Wortzauber
- The game runs in real time, so each stage is a screen recording: `node scripts/reels/timeline-wz.mjs ../wortzauber [--dry] [--only pr65]`. `--dry` saves one still per stage into `<work>/tl/wz-dry/`; read them as one sheet before you record. All stages take about 5 minutes.
- Each worktree is served with `python3 -m http.server` on its own port. That is fine here: every stage opens a fresh browser, so nothing is cached. (For normal work on the game, use its `devserver.py`.)
- The cheapest stage uses a layout-check scene of the game at that ref (`scene: 'castle'`): a feature PR often added its own scene, see `.claude/skills/checking-device-layouts/scenes/` in the game and `git log --diff-filter=A` on it. Else a short `setup` with `WZ.jump(...)` (from PR #31 on), `WZ.useWord(...)`, `Wall`, `Castle`, `Together.testLink()`; an `act` films the action itself.
- The clips are silent. A PR that only adds sound goes into the "Not shown" line, and so does a change that opens only deep in a level.
- The game is filmed in German. Do not generate voice, music or images, and do not read the ElevenLabs key.
- Outside the cloud container: Playwright is not global. Link the `node_modules` of `../tiny-train` into this repo and add `/node_modules` to `.git/info/exclude`. If `ffmpeg` is not installed, put a wrapper on `PATH` that runs `ffmpeg` and `ffprobe` from the `linuxserver/ffmpeg` image, with the repo mounted at the same path.

## Common mistakes
- Filming at the PR branch tip instead of the merge commit: use the merge (`%h` of the merge in step 2). The first entry ("Starting point") is the import commit.
- A UI stage whose button has another id at that ref: look up the id in `index.html` at the ref.
- A guest stage that sets the time only on the game: the host's clock wins. Set `__peer.world.env.time` too.
- Committing frames or full-size clips: only `build.py timeline` output goes into `assets/`.
- An old clip that starts late: before 2026-11-10, the marks of `timeline-wz.mjs` counted from the worktree start, not from the video start. A slow `git worktree add` moved every cut later by that time.
