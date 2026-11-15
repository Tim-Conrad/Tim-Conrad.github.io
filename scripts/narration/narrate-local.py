# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["qwen-tts==0.1.1", "torch", "torchaudio"]
# [tool.uv]
# index-strategy = "unsafe-best-match"
# [[tool.uv.index]]
# name = "pytorch-cpu"
# url = "https://download.pytorch.org/whl/cpu"
# explicit = true
# [tool.uv.sources]
# torch = { index = "pytorch-cpu" }
# torchaudio = { index = "pytorch-cpu" }
# ///
"""A free local test narration of a thought with Qwen3-TTS on the CPU, so the player, the marker and the cues can be
judged with a real voice before any ElevenLabs credits are spent. ElevenLabs stays the voice of the published page.

  nix develop ./scripts/narration -c uv run scripts/narration/narrate-local.py thoughts/encrypted-patches

Writes drafts/narration/<slug>/narration.json and narration.mp3 (git ignores drafts/). The page's own narration.json
stays as it is. Listen: serve the site and open /thoughts/<slug>/?narration=/drafts/narration/<slug>/narration.json,
or build the artifact preview with scripts/preview-artifact.py <page> --narration drafts/narration/<slug>.

Each block of the script is spoken on its own and cached by its text in ~/.cache/t7d-narration, so after an edit only
the changed blocks are made again. Qwen3-ForcedAligner (scripts/narration/align.py) gives the word timings.
"""
import argparse, hashlib, json, os, re, subprocess, sys, time

import numpy as np
import soundfile as sf

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
HERE = os.path.dirname(os.path.abspath(__file__))
MODELS = {"0.6B": "Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice", "1.7B": "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice"}
LEAD, GAP = 0.3, 0.45  # silence before the first block and between blocks, in seconds (data-pause adds to GAP)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("page", help="the folder of the thought, e.g. thoughts/encrypted-patches")
    ap.add_argument("--model", choices=MODELS, default="0.6B", help="0.6B (default, about 2.3 s per second of audio) or 1.7B")
    ap.add_argument("--speaker", default="Ryan", help="a voice of the model: Ryan (default) or Aiden for English")
    ap.add_argument("--instruct", default="", help="a style instruction, only for --model 1.7B, e.g. 'Calm, unhurried.'")
    ap.add_argument("--first", type=int, default=0, help="only the first N blocks, for a quick test")
    ap.add_argument("--cache", default=os.environ.get("NARRATION_CACHE", os.path.expanduser("~/.cache/t7d-narration")))
    a = ap.parse_args()
    if a.instruct and a.model != "1.7B":
        ap.error("--instruct needs --model 1.7B")

    page = a.page.strip("/")
    slug = os.path.basename(page)
    base = json.load(open(os.path.join(ROOT, page, "narration.json")))
    script = json.loads(subprocess.run(["node", os.path.join(HERE, "script.mjs"), page], check=True, stdout=subprocess.PIPE,
                                       text=True, cwd=ROOT).stdout)
    segs = script["segs"][: a.first] if a.first else script["segs"]
    print(f"{len(segs)} blocks, {sum(len(s['text']) for s in segs)} characters", file=sys.stderr)

    voice_dir = os.path.join(a.cache, f"{a.model}-{a.speaker}" + (f"-{sha(a.instruct)[:8]}" if a.instruct else ""))
    os.makedirs(voice_dir, exist_ok=True)
    for s in segs:
        s["wav"] = os.path.join(voice_dir, sha(s["text"]) + ".wav")
        s["words"] = s["wav"][:-4] + ".words.json"

    # 1. speech for each block that is not in the cache
    todo = [s for s in segs if not os.path.exists(s["wav"])]
    if todo:
        import torch
        from qwen_tts import Qwen3TTSModel
        torch.set_num_threads(os.cpu_count() or 4)
        model = Qwen3TTSModel.from_pretrained(MODELS[a.model], device_map="cpu", dtype=torch.bfloat16)
        done_chars, total, t0 = 0, sum(len(s["text"]) for s in todo), time.time()
        for i, s in enumerate(todo, 1):
            kw = {"instruct": a.instruct} if a.instruct else {}
            wavs, sr = model.generate_custom_voice(text=s["text"], language="English", speaker=a.speaker, **kw)
            w = trim(np.asarray(wavs[0], dtype=np.float32), sr)
            sf.write(s["wav"] + ".tmp.wav", w, sr)
            os.replace(s["wav"] + ".tmp.wav", s["wav"])
            done_chars += len(s["text"])
            el = time.time() - t0
            print(f"speech {i}/{len(todo)}: {len(w) / sr:.1f} s audio, {el / 60:.1f} min so far, "
                  f"about {el / done_chars * (total - done_chars) / 60:.0f} min left", file=sys.stderr, flush=True)
        del model

    # 2. word timings for each block that has none
    jobs = [{"wav": s["wav"], "text": s["text"], "out": s["words"]} for s in segs if not os.path.exists(s["words"])]
    if jobs:
        jobs_file = os.path.join(voice_dir, "jobs.json")
        json.dump(jobs, open(jobs_file, "w"))
        subprocess.run(["uv", "run", "-q", os.path.join(HERE, "align.py"), jobs_file], check=True)

    # 3. one audio file and the timing of every character of the script
    sr = sf.info(segs[0]["wav"]).samplerate
    parts, start, end, t = [np.zeros(int(LEAD * sr), np.float32)], [], [], LEAD
    for k, s in enumerate(segs):
        audio, _ = sf.read(s["wav"], dtype="float32")
        dur = len(audio) / sr
        st, en = char_times(s["text"], json.load(open(s["words"])), dur)
        start += [t + x for x in st]
        end += [t + x for x in en]
        parts.append(audio)
        t += dur
        if k < len(segs) - 1:
            gap = GAP + s["pause"]
            start += [t, t + gap / 2]  # the two newlines between blocks
            end += [t + gap / 2, t + gap]
            parts.append(np.zeros(int(round(gap * sr)), np.float32))
            t += gap
    parts.append(np.zeros(int(0.5 * sr), np.float32))
    T = "\n\n".join(s["text"] for s in segs)
    assert len(start) == len(T), (len(start), len(T))
    audio_min = t / 60
    if a.first:  # the blocks after --first: about 160 words a minute after the audio ends, as narration.js simulates
        rest = script["T"][len(T):]
        for _ in rest:
            start.append(t)
            t += 0.062
            end.append(t)
    # the aligner's words can overlap a little: time never runs back
    for arr in (start, end):
        for i in range(1, len(arr)):
            arr[i] = max(arr[i], arr[i - 1])
    end = [max(e, s_) for s_, e in zip(start, end)]
    assert len(start) == len(script["T"]), (len(start), len(script["T"]))

    out = os.path.join(ROOT, "drafts", "narration", slug)
    os.makedirs(out, exist_ok=True)
    sf.write(os.path.join(out, "narration.mp3"), np.concatenate(parts), sr, format="MP3")
    base.update({
        "voice": f"Qwen3-TTS {a.model} {a.speaker} (local test, not the final voice)",
        "audio": f"/drafts/narration/{slug}/narration.mp3",
        "timing": {"start": [round(x, 3) for x in start], "end": [round(x, 3) for x in end]},
    })
    json.dump(base, open(os.path.join(out, "narration.json"), "w"))
    if a.first:
        print(f"note: audio for the first {a.first} blocks only; after them the marker runs on without sound", file=sys.stderr)
    print(f"{audio_min:.1f} min of audio in drafts/narration/{slug}/")
    print(f"listen: /{page}/?narration=/drafts/narration/{slug}/narration.json")


def sha(s):
    return hashlib.sha1(s.encode()).hexdigest()


def trim(w, sr, floor=0.01):
    """Cut the silence before the first and after the last sound, keeping 50 ms on each side."""
    loud = np.flatnonzero(np.abs(w) > floor)
    if not len(loud):
        return w
    pad = int(0.05 * sr)
    return w[max(0, loud[0] - pad): loud[-1] + pad]


def char_times(text, words, dur):
    """Start and end of every character of text, from the aligner's words. The characters of a word share its span in
    order; spaces and punctuation get the time between words."""
    n = len(text)
    st, en = [None] * n, [None] * n
    low = text.lower()
    alnum = [i for i, c in enumerate(low) if c.isalnum()]
    stream = "".join(low[i] for i in alnum)
    cur = 0
    for w in words:
        key = "".join(c for c in w["text"].lower() if c.isalnum())
        if not key:
            continue
        j = stream.find(key, cur, cur + len(key) + 200)  # the next match, close to where the last word ended
        if j < 0:
            continue
        pos = alnum[j: j + len(key)]
        span = max(w["end"] - w["start"], 0.001)
        lo, hi = pos[0], pos[-1]
        for c in range(lo, hi + 1):
            f = (c - lo) / (hi - lo + 1)
            st[c] = w["start"] + span * f
            en[c] = w["start"] + span * (c - lo + 1) / (hi - lo + 1)
        cur = j + len(key)
    # characters between words: from the end of the word before to the start of the next one
    first = next((x for x in st if x is not None), 0.0)
    prev = first
    for c in range(n):
        if st[c] is None:
            nxt = next((st[d] for d in range(c + 1, n) if st[d] is not None), dur)
            st[c], en[c] = prev, max(prev, nxt)
        prev = en[c]
    return st, en


if __name__ == "__main__":
    main()
