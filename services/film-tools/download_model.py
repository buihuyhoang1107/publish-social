"""Download the exact LTX benchmark checkpoint once; keep weights out of source."""

import argparse
import json
import os
from pathlib import Path
import sys


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--episode", type=Path, required=True)
    parser.add_argument("--dependency-dir", type=Path)
    args = parser.parse_args()
    if args.dependency_dir:
        sys.path.insert(0, str(args.dependency_dir.resolve()))
    root = Path(__file__).resolve().parents[2]
    os.environ.setdefault("HF_HOME", str(root / "tools" / "film-models"))
    os.environ.setdefault("HF_HUB_DOWNLOAD_TIMEOUT", "120")
    os.environ.setdefault("HF_HUB_DISABLE_SYMLINKS_WARNING", "1")
    from huggingface_hub import model_info, snapshot_download

    episode = json.loads(args.episode.read_text(encoding="utf-8-sig"))
    model = episode["benchmark"]["model"]
    revision = episode["benchmark"].get("revision") or model_info(model).sha
    print(json.dumps({"model": model, "revision": revision, "status": "downloading"}), flush=True)
    target = snapshot_download(
        repo_id=model, revision=revision, max_workers=2,
        allow_patterns=["model_index.json", "scheduler/*", "tokenizer/*", "text_encoder/*", "transformer/*", "vae/*", "*.license.txt"],
    )
    manifest = {"model": model, "revision": revision, "snapshot": target, "status": "downloaded"}
    (args.episode.parent / "model-download.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest), flush=True)


if __name__ == "__main__":
    main()
