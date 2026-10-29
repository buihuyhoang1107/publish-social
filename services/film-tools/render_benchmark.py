"""Local image-to-video benchmark. No Telegram, paid API or social publishing."""

import argparse
import gc
import hashlib
import json
import os
from pathlib import Path
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--episode", type=Path, required=True)
    parser.add_argument("--offline", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    os.environ.setdefault("HF_HOME", str(root / "tools" / "film-models"))
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
    episode = json.loads(args.episode.read_text(encoding="utf-8-sig"))
    config = episode["benchmark"]
    if config["width"] % 32 or config["height"] % 32:
        parser.error("Benchmark width/height must be divisible by 32.")
    if config["num_frames"] % 8 != 1 or config["num_frames"] < 9:
        parser.error("Benchmark frame count must be 8n+1, at least 9.")
    source = args.episode.parent / episode["keyframe"]
    if not source.is_file():
        parser.error("Missing keyframe: " + str(source))

    import torch
    from diffusers import LTXImageToVideoPipeline
    from diffusers.utils import export_to_video
    from huggingface_hub import model_info
    from PIL import Image
    from safetensors.torch import load_file, save_file

    if not torch.cuda.is_available():
        parser.error("CUDA unavailable. Install the CUDA 12.4 torch build in the film venv.")
    torch.set_num_threads(min(12, os.cpu_count() or 1))
    started = time.monotonic()
    output = args.episode.parent
    report_file = output / "benchmark.json"
    report = {
        "status": "loading",
        "model": config["model"],
        "gpu": torch.cuda.get_device_name(0),
        "torch": torch.__version__,
        "width": config["width"],
        "height": config["height"],
        "frames": config["num_frames"],
        "fps": config["fps"],
        "steps": config["steps"],
        "seed": config["seed"],
        "has_speech": False,
        "has_lip_sync": False,
    }

    def progress(status):
        report["status"] = status
        report["elapsed_seconds"] = round(time.monotonic() - started, 2)
        report_file.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"status": status, "seconds": report["elapsed_seconds"]}), flush=True)

    try:
        revision = config.get("revision")
        if revision is None and not args.offline:
            revision = model_info(config["model"]).sha
        report["revision"] = revision
        options = dict(torch_dtype=torch.bfloat16, local_files_only=args.offline, revision=revision)
        cache_key = hashlib.sha256(json.dumps({
            "model": config["model"], "revision": revision,
            "prompt": config["prompt"], "negative": config["negative_prompt"],
            "tokens": 256,
        }, sort_keys=True).encode()).hexdigest()
        cache = root / "tools" / "film-models" / "prompt-cache" / (cache_key + ".safetensors")
        keys = ["prompt_embeds", "prompt_attention_mask", "negative_prompt_embeds", "negative_prompt_attention_mask"]
        if cache.exists():
            progress("loading_cached_prompt")
            embeddings = load_file(str(cache))
            pipeline = LTXImageToVideoPipeline.from_pretrained(config["model"], text_encoder=None, **options)
        else:
            progress("loading_model_and_text_encoder")
            pipeline = LTXImageToVideoPipeline.from_pretrained(config["model"], **options)
            # XXL text encoder alone is larger than 8 GB; keep it on CPU.
            progress("encoding_prompt_on_cpu")
            with torch.inference_mode():
                encoded = pipeline.encode_prompt(
                    config["prompt"], negative_prompt=config["negative_prompt"],
                    device=torch.device("cpu"), dtype=torch.bfloat16, max_sequence_length=256,
                )
            embeddings = {key: value.contiguous().cpu() for key, value in zip(keys, encoded)}
            cache.parent.mkdir(parents=True, exist_ok=True)
            save_file(embeddings, str(cache))
            pipeline.register_modules(text_encoder=None)
            gc.collect()
        pipeline.vae.enable_tiling()
        pipeline.enable_model_cpu_offload()
        torch.cuda.reset_peak_memory_stats()
        image = Image.open(source).convert("RGB")
        progress("generating_motion")
        generation_start = time.monotonic()
        with torch.inference_mode():
            frames = pipeline(
                image=image, **embeddings,
                width=config["width"], height=config["height"],
                num_frames=config["num_frames"], frame_rate=config["fps"],
                num_inference_steps=config["steps"], guidance_scale=3.0,
                decode_timestep=0.05, decode_noise_scale=0.025,
                max_sequence_length=256,
                generator=torch.Generator(device="cpu").manual_seed(config["seed"]),
            ).frames[0]
        torch.cuda.synchronize()
        report["generation_seconds"] = round(time.monotonic() - generation_start, 2)
        report["peak_allocated_vram_mib"] = round(torch.cuda.max_memory_allocated() / 1024**2)
        target = output / "scene-01-motion-test.mp4"
        export_to_video(frames, str(target), fps=config["fps"], macro_block_size=1)
        frames[0].save(output / "motion-first.png")
        frames[len(frames) // 2].save(output / "motion-middle.png")
        frames[-1].save(output / "motion-last.png")
        report["output"] = target.name
        report["output_bytes"] = target.stat().st_size
        report["actual_frames"] = len(frames)
        report["duration_seconds"] = round(len(frames) / config["fps"], 3)
        progress("rendered_requires_visual_review")
    except Exception as error:
        report["error"] = str(error)
        progress("failed")
        raise


if __name__ == "__main__":
    main()
