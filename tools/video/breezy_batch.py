# Promo video only (tools/video/make-video.mjs): runs BreezyVoice for every narration line
# with a single model load. BreezyVoice's own batch_inference.py goes through Hugging Face
# `datasets`, which tries to pickle the model and fails on Windows.
#
# Run from the BreezyVoice folder with its Python:
#   python <this file> <jobs.json>
# jobs.json: { "prompt_audio": "…wav", "prompt_text": "…", "lines": [{ "text": "…", "out": "…wav" }] }
import json
import os
import sys

sys.path.insert(0, os.getcwd())  # BreezyVoice's modules

from g2pw import G2PWConverter  # noqa: E402
from single_inference import CustomCosyVoice, single_inference  # noqa: E402


def main():
    with open(sys.argv[1], encoding="utf-8") as f:
        jobs = json.load(f)
    model = CustomCosyVoice(jobs.get("model", "MediaTek-Research/BreezyVoice-300M"))
    bopomofo = G2PWConverter()
    lines = jobs["lines"]
    for i, line in enumerate(lines, 1):
        if os.path.exists(line["out"]):
            continue  # done by an earlier, interrupted run
        print(f"[{i}/{len(lines)}] {line['text']}", flush=True)
        single_inference(jobs["prompt_audio"], line["text"], line["out"] + ".part.wav", model, bopomofo, jobs["prompt_text"])
        os.replace(line["out"] + ".part.wav", line["out"])


if __name__ == "__main__":
    main()
