---
name: updating-product-reels
description: Use when Kleinbahn (tiny-train) or Wortzauber changed and the reel, the poster, the stills or the phone picture on their product page must be taken again, when a caption or a shot of a reel must change, or when a new game needs a product page with a reel.
---

# Updating the product reels and pictures

## Overview
Each game has a product page under `projects/<game>/` with a reel, a poster, four stills and a phone frame that loads the live demo. Everything visual comes from the real game, filmed headless by the scripts in `tools/reels/`. Nothing is drawn or generated.

| Game | Repo | Product page | Live demo in the phone frame |
| --- | --- | --- | --- |
| Kleinbahn | `Tim-Conrad/tiny-train` | `projects/kleinbahn/` | `https://tiny-train.beacon.host/` |
| Wortzauber | `Tim-Conrad/wortzauber` | `projects/wortzauber/` | `https://wortzauber.beacon.host/` |

Both game repos are private. Clone them next to this repo first (in a cloud session: `add_repo`, then clone). The commands below use `../tiny-train` and `../wortzauber`.

## What needs a new capture
- The live demo in the phone frame updates by itself when the game is published to beacon.host. Only its poster picture is from here.
- A visual change of the game (art, UI, a scene in a shot): film that game again, then build and publish.
- Only a caption or a title: change the text in `tools/reels/overlays.mjs`, then run overlays, build and publish. No filming.
- Only the page text: edit `projects/<game>/index.html`. The text must stay true to the game: read its `README.md` before you claim a feature.

## Tools
All of them write to a work folder: `$REELS_WORK`, or `.reels/` in this repo (git ignores it). Use the scratchpad in a cloud session.

| Step | Command | Time |
| --- | --- | --- |
| Kleinbahn preview | `node tools/reels/kleinbahn-shots.mjs ../tiny-train --test` | 1 min |
| Kleinbahn frames | `node tools/reels/kleinbahn-shots.mjs ../tiny-train [--only b-train,c-town]` | 25 to 40 min for all nine shots |
| Wortzauber dry run | `node tools/reels/wortzauber-takes.mjs ../wortzauber` | 3 min |
| Wortzauber recording | `node tools/reels/wortzauber-takes.mjs ../wortzauber --rec [--only meadow]` | 3 min |
| Titles and captions | `node tools/reels/overlays.mjs ../wortzauber` | seconds |
| Cut a reel | `python3 tools/reels/build.py kb` and `python3 tools/reels/build.py wz ../wortzauber` | 1 to 2 min each |
| Put it on the site | `python3 tools/reels/build.py publish` | 1 min |

`publish` writes `assets/projects/<game>-reel.mp4` (web size), `-poster.jpg`, `-1.jpg` to `-4.jpg`, and `wortzauber-phone.jpg`. `kleinbahn-phone.jpg` is a separate step (below).

## Kleinbahn
Before the first run: `npm install` in `../tiny-train`.

- The script opens the game through the game's own test page (`tools/page.mjs`, `openGame({ test: true })`): a virtual clock, and one frame per `__KB.step(1, 1/24)`. Each frame is read from the canvas. So the motion is smooth on a machine without a GPU, and the UI is not in the picture.
- A frame takes 1 to 3 seconds. Run nothing heavy next to it.
- Always look at `--test` first: it renders three frames per shot into `<work>/kb/test/`. Join them into one sheet and read it.
- The shots are the `SHOTS` list. A shot has `setup` (game code, run once), `frames`, and `cam` (an expression of `u` 0..1 and the eased `e`). `cam: null` leaves the camera to the game (the launch follows the shuttle that way). `until` steps the game without drawing until a state is reached. `time: [from, to]` moves the time of day.
- Game facts: `env.time` 0.5 is noon, about 0.93 is night. `env.season` 0 spring, 1 summer, 2 autumn, 3 winter; set `dirty.land=true` after a change. World coordinates come from tiles with `wx(x)`, `wz(z)`. `dist` 6 frames a train, 60 the whole island. The game's skill `kleinbahn-dev` has the rest.
- If a name in a shot no longer exists (`erupt`, `launchNow`, `follow`, `zstate`), the page reports an error and the run ends with `ERR [...]`. Find the new name in `src/game/` and change the shot.
- The phone picture: in `../tiny-train`, run `node tools/kbshot.mjs '[{"x":-3,"z":1,"dist":30,"pitch":0.8,"yaw":0.6,"time":0.45,"out":"phone.png","wait":3000}]' --phone`, then save `.kbtest/phone.png` as `assets/projects/kleinbahn-phone.jpg` (390x780).

## Wortzauber
Before a run: start the dev server in `../wortzauber` with `python3 devserver.py` (port 8931, or set `WZ_PORT`). Do not use `python3 -m http.server`.

- The game runs in real time, so the takes are screen recordings (Playwright `recordVideo`). Record only on an idle machine: a busy CPU drops frames. Never record while Kleinbahn frames render.
- The `meadow` take plays the core loop with a real pointer: tap the wand, tap the letters of "apfel", trace every stroke along `WZ.tracer.debug().pts`, wait for the apple. A soft dot shows the finger. The tracing takes about 25 s; `build.py` runs it faster.
- The other takes use the scene files of the game's own skill `checking-device-layouts` (`scenes/quest.js`, `wall.js`, `castle.js`, ...), then hold for some seconds. A new scene for the reel is a new scene file there plus one line in the takes list.
- Each take writes its cut points to `<work>/wz/rec/marks.json` (seconds from the start of its video). `build.py` cuts by these names, so a take can be filmed again alone with `--only`.
- Run the dry run first and read the stills in `<work>/wz/dry/`. A take that prints `FAILED` saves `s-<take>-fail.png`.
- The game is filmed in German (its default). The captions of the reel are English.
- Rules of the game repo that hold here too: do not generate voice, music or images, and do not read the ElevenLabs key. The reel uses `audio/music/meadow.mp3`, which is already in the repo.

## Build and check
1. `overlays.mjs` renders every title, caption and end card as a transparent 1280x720 PNG, in the fonts of each game (Fredoka and Nunito from `tools/reels/fonts/`, Andika from the Wortzauber repo).
2. `build.py kb` and `build.py wz` cut the reels. The timeline of a reel is the `parts` list in `kb()` and `wz()`: one `seg` or `clip` per cut, with its overlays and their fade times.
3. Look at the result before you publish. Make a contact sheet and read it:
   `ffmpeg -i <work>/kleinbahn-reel.mp4 -vf "fps=16/39,scale=320:180,tile=4x4" -frames:v 1 sheet.jpg` (16 pictures over a 39 s reel).
   Check that each caption sits on its own shot, that no caption covers a speech bubble or a panel, and that the end card is readable.
4. `build.py publish`. The stills come from the sources, not from the reel, so they carry no caption. Which frames they are is at the top of `build.py` (`KB_PICS`, `WZ_PICS`, `WZ_PHONE`). If a shot or a take changed, check that the alt texts in `projects/<game>/index.html` still describe the pictures.
5. Serve the site (`python3 -m http.server 8000` in this repo) and look at `/projects/kleinbahn/`, `/projects/wortzauber/` and `/#projects` at 1440 and 390 px wide. The page must not scroll sideways.
6. Commit the files in `assets/projects/` with the change.

## Common mistakes
- The reel video is in git. Keep it small: `publish` encodes at CRF 26 with a 1.8 Mbit/s cap (Kleinbahn about 8 MB, Wortzauber about 3 MB). Do not commit the full-quality reel from the work folder.
- The product pages have a strict Content-Security-Policy. A new demo host needs its own `frame-src` entry in that page's `<meta http-equiv>` line, or the phone frame stays empty.
- The phone frame loads the demo only after a tap, and the page says so. Do not make it load on page open: the site promises no third-party request before that.
- Whether beacon.host lets the page embed the game was not tested from the cloud container (the host is blocked there). After a deploy, press "Play it here" on the live page once. If the frame stays empty, the "Open it full screen" link is the fallback.
- A changed reel length moves nothing on the page, but a changed first shot changes the poster: look at the card on the front page too.
