#!/usr/bin/env python3
"""Verify deployed FST runtime files against morphology.lock.json."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lock-file", type=Path, default=Path("morphology.lock.json"))
    parser.add_argument("--runtime-dir", action="append", required=True, type=Path)
    args = parser.parse_args()
    manifest = json.loads(args.lock_file.read_text(encoding="utf-8"))
    runtime = manifest["runtime"]
    rows = [*runtime["artifacts"], *runtime.get("sidecars", [])]
    expected = {row["file"]: row["sha256"] for row in rows}
    for directory in args.runtime_dir:
        actual_names = {
            path.name for path in directory.iterdir()
            if path.is_file() and path.suffix in {".fst", ".json"}
        }
        if actual_names != set(expected):
            missing = sorted(set(expected) - actual_names)
            extra = sorted(actual_names - set(expected))
            raise SystemExit(f"{directory}: runtime inventory drift; missing={missing}, extra={extra}")
        for filename, expected_hash in expected.items():
            actual_hash = sha256(directory / filename)
            if actual_hash != expected_hash:
                raise SystemExit(
                    f"{directory / filename}: expected {expected_hash}, got {actual_hash}"
                )
        print(f"Verified {len(expected)} locked runtime files in {directory}")


if __name__ == "__main__":
    main()
