# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["qwen-asr==0.0.6", "torch", "torchaudio"]
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
"""Word timings for spoken audio with Qwen3-ForcedAligner (CPU). Called by narrate-local.py; its own environment,
because qwen-asr and qwen-tts pin different versions of transformers.

  uv run scripts/narration/align.py jobs.json

jobs.json: [{"wav": "<path>", "text": "<what the audio says>", "out": "<path of the result>"}]. Each out file gets
[{"text": "<word>", "start": <s>, "end": <s>}] in the order of the audio.
"""
import json, os, sys, time

import torch
from qwen_asr import Qwen3ForcedAligner

jobs = json.load(open(sys.argv[1]))
torch.set_num_threads(os.cpu_count() or 4)
model = Qwen3ForcedAligner.from_pretrained("Qwen/Qwen3-ForcedAligner-0.6B", dtype=torch.bfloat16, device_map="cpu")
for i, job in enumerate(jobs, 1):
    t = time.time()
    res = model.align(audio=job["wav"], text=job["text"], language="English")
    words = [{"text": w.text, "start": round(float(w.start_time), 3), "end": round(float(w.end_time), 3)} for w in res[0]]
    tmp = job["out"] + ".tmp"
    with open(tmp, "w") as f:
        json.dump(words, f)
    os.replace(tmp, job["out"])
    print(f"align {i}/{len(jobs)}: {len(words)} words in {time.time() - t:.1f} s", file=sys.stderr, flush=True)
