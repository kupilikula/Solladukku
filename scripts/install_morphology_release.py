#!/usr/bin/env python3
"""Verify and install a tamil-morphology release archive into consumers."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import tarfile
import tempfile
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def release_root(extracted: Path) -> Path:
    manifests = list(extracted.glob("*/manifest.json"))
    if len(manifests) != 1:
        raise RuntimeError(f"Expected one release manifest, found {len(manifests)}")
    return manifests[0].parent


def validate_member(member: tarfile.TarInfo) -> None:
    path = Path(member.name)
    if path.is_absolute() or ".." in path.parts or member.issym() or member.islnk():
        raise RuntimeError(f"Unsafe archive member: {member.name}")


def expected_runtime_files(manifest: dict[str, object]) -> list[dict[str, object]]:
    runtime = manifest.get("runtime")
    if not isinstance(runtime, dict):
        raise RuntimeError("Manifest has no runtime object")
    rows = [*runtime.get("artifacts", []), *runtime.get("sidecars", [])]
    if not rows or not all(isinstance(row, dict) for row in rows):
        raise RuntimeError("Manifest has no runtime artifacts")
    return rows


def install(archive: Path, destinations: list[Path], lock_file: Path | None) -> None:
    with tempfile.TemporaryDirectory(prefix="tamil-morphology-release-") as temp_name:
        temp = Path(temp_name)
        with tarfile.open(archive, "r:gz") as bundle:
            members = bundle.getmembers()
            for member in members:
                validate_member(member)
            bundle.extractall(temp, members=members)

        root = release_root(temp)
        manifest_path = root / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        rows = expected_runtime_files(manifest)

        sources: list[tuple[Path, str]] = []
        for row in rows:
            filename = row.get("file")
            expected = row.get("sha256")
            if not isinstance(filename, str) or not isinstance(expected, str):
                raise RuntimeError(f"Malformed runtime artifact row: {row!r}")
            source = root / "runtime" / filename
            if not source.is_file():
                raise RuntimeError(f"Missing runtime artifact: {filename}")
            actual = sha256(source)
            if actual != expected:
                raise RuntimeError(
                    f"Digest mismatch for {filename}: expected {expected}, got {actual}"
                )
            sources.append((source, filename))

        for destination in destinations:
            destination.mkdir(parents=True, exist_ok=True)
            expected_names = {filename for _, filename in sources}
            for existing in destination.iterdir():
                if existing.is_file() and existing.name not in expected_names:
                    if existing.suffix in {".fst", ".json"}:
                        existing.unlink()
            for source, filename in sources:
                temporary = destination / f".{filename}.tmp"
                shutil.copy2(source, temporary)
                temporary.replace(destination / filename)

        if lock_file is not None:
            lock_file.parent.mkdir(parents=True, exist_ok=True)
            temporary = lock_file.with_suffix(lock_file.suffix + ".tmp")
            temporary.write_text(
                json.dumps(manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
            temporary.replace(lock_file)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path)
    parser.add_argument(
        "--runtime-dir",
        action="append",
        required=True,
        type=Path,
        help="Destination for verified runtime files; may be repeated.",
    )
    parser.add_argument("--lock-file", type=Path)
    args = parser.parse_args()
    install(args.archive.resolve(), args.runtime_dir, args.lock_file)


if __name__ == "__main__":
    main()
