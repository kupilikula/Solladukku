#!/usr/bin/env python3
"""Build Solmaalai FST binaries from vendored ThamizhiMorph sources."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
VENDOR = ROOT / "vendor" / "thamizhi-morph"
PATCH_DIR = ROOT / "fst" / "patches"
WORK_ROOT = ROOT / "fst" / "build" / ".work"
MANIFEST_PATH = ROOT / "fst" / "build" / "manifest.json"
CANONICAL_MODELS = ROOT / "build" / "fst-models"
WORDLIST_MODELS = ROOT / "static-word-list" / "fst-models"
SERVER_MODELS = ROOT / "server" / "fst-models"

COMPONENTS = [
    {
        "name": "noun",
        "zip": "ThamizhiMorph-Nouns.zip",
        "entry": "tamil-noun.foma",
        "output": "noun.fst",
        "patches": [
            "0001-fix-c11-acc.patch",
            "0002-fix-noun-class-duplicates.patch",
            "0003-fix-noun-malformed-locatives.patch",
        ],
    },
    {
        "name": "adj",
        "zip": "ThamizhiMorph-Adjectives.zip",
        "entry": "__generated_adj_build.foma",
        "output": "adj.fst",
    },
    {
        "name": "adv",
        "zip": "ThamizhiMorph-Adverbs.zip",
        "entry": "tamil-adverbs.foma",
        "output": "adv.fst",
    },
    {
        "name": "part",
        "zip": "ThamizhiMorph-Particles.zip",
        "entry": "tamil-part.foma",
        "output": "part.fst",
    },
    {
        "name": "verb-c3",
        "zip": "ThamizhiMorph-Verbs.zip",
        "entry": "ThamizhiFST-C3.foma",
        "output": "verb-c3.fst",
    },
    {
        "name": "verb-c4",
        "zip": "ThamizhiMorph-Verbs.zip",
        "entry": "ThamizhiFST-C4.foma",
        "output": "verb-c4.fst",
    },
    {
        "name": "verb-c11",
        "zip": "ThamizhiMorph-Verbs.zip",
        "entry": "ThamizhiFST-C11.foma",
        "output": "verb-c11.fst",
    },
    {
        "name": "verb-c12",
        "zip": "ThamizhiMorph-Verbs.zip",
        "entry": "ThamizhiFST-C12.foma",
        "output": "verb-c12.fst",
    },
    {
        "name": "verb-c62",
        "zip": "ThamizhiMorph-Verbs.zip",
        "entry": "ThamizhiFST-C62.foma",
        "output": "verb-c62.fst",
    },
    {
        "name": "verb-c-rest",
        "zip": "ThamizhiMorph-Verbs.zip",
        "entry": "ThamizhiFST-otherthan-3-4-62-11-12.foma",
        "output": "verb-c-rest.fst",
    },
    {
        "name": "pronoun",
        "mode": "copy-prebuilt",
        "source": "FST-Models/pronoun.fst",
        "output": "pronoun.fst",
    },
]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def run(cmd: list[str], cwd: Path | None = None, stdin: str | None = None) -> str:
    completed = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        input=stdin,
        text=True,
        capture_output=True,
        check=True,
    )
    return completed.stdout


def ensure_tools() -> None:
    for tool in ("foma", "flookup", "git"):
        if shutil.which(tool) is None:
            raise RuntimeError(f"Required tool not found on PATH: {tool}")


def extract_zip(zip_name: str, out_dir: Path) -> None:
    zip_path = VENDOR / "foma" / zip_name
    if not zip_path.exists():
        raise FileNotFoundError(f"Missing upstream source zip: {zip_path}")
    with ZipFile(zip_path, "r") as zf:
        zf.extractall(out_dir)


def apply_patches(work_dir: Path, patch_names: list[str]) -> list[dict]:
    records = []
    for patch_name in patch_names:
        patch_path = PATCH_DIR / patch_name
        if not patch_path.exists():
            raise FileNotFoundError(f"Patch file not found: {patch_path}")
        run(["git", "apply", "--check", str(patch_path)], cwd=work_dir)
        run(["git", "apply", str(patch_path)], cwd=work_dir)
        records.append({
            "file": str((Path("fst") / "patches" / patch_name).as_posix()),
            "sha256": sha256_file(patch_path),
        })
    return records


def generate_adj_entry(work_dir: Path) -> None:
    lexc_file = work_dir / "tamil-adjectives.lexc"
    if not lexc_file.exists():
        raise FileNotFoundError(f"Expected source file missing: {lexc_file}")
    entry = work_dir / "__generated_adj_build.foma"
    entry.write_text(
        "read lexc tamil-adjectives.lexc\n"
        "define Lexicon;\n"
        "regex Lexicon;\n",
        encoding="utf-8",
    )


def compile_foma(work_dir: Path, entry_file: str, output_name: str) -> Path:
    entry_path = work_dir / entry_file
    if not entry_path.exists():
        raise FileNotFoundError(f"Missing entry script: {entry_path}")
    commands = f"source {entry_file}\nsave stack {output_name}\nquit\n"
    run(["foma"], cwd=work_dir, stdin=commands)
    out_path = work_dir / output_name
    if not out_path.exists() or out_path.stat().st_size == 0:
        raise RuntimeError(f"foma did not produce output: {out_path}")
    return out_path


def copy_outputs(built_paths: dict[str, Path]) -> list[dict]:
    CANONICAL_MODELS.mkdir(parents=True, exist_ok=True)
    WORDLIST_MODELS.mkdir(parents=True, exist_ok=True)
    SERVER_MODELS.mkdir(parents=True, exist_ok=True)

    outputs = []
    for output_name, src_path in built_paths.items():
        dst_canonical = CANONICAL_MODELS / output_name
        dst_wordlists = WORDLIST_MODELS / output_name
        dst_server = SERVER_MODELS / output_name
        shutil.copy2(src_path, dst_canonical)
        shutil.copy2(src_path, dst_wordlists)
        shutil.copy2(src_path, dst_server)
        outputs.append({
            "file": output_name,
            "sha256": sha256_file(src_path),
            "size_bytes": src_path.stat().st_size,
            "copied_to": [
                "build/fst-models",
                "static-word-list/fst-models",
                "server/fst-models",
            ],
        })
    outputs.sort(key=lambda x: x["file"])
    return outputs


def build_all(clean: bool) -> dict:
    ensure_tools()

    if not VENDOR.exists():
        raise FileNotFoundError("Submodule missing: vendor/thamizhi-morph")

    if clean and WORK_ROOT.exists():
        shutil.rmtree(WORK_ROOT)
    WORK_ROOT.mkdir(parents=True, exist_ok=True)

    submodule_commit = run(["git", "-C", str(VENDOR), "rev-parse", "HEAD"]).strip()

    built_paths: dict[str, Path] = {}
    patch_records: list[dict] = []
    components_manifest: list[dict] = []

    for component in COMPONENTS:
        name = component["name"]
        comp_dir = WORK_ROOT / name
        if comp_dir.exists():
            shutil.rmtree(comp_dir)
        comp_dir.mkdir(parents=True, exist_ok=True)

        mode = component.get("mode", "compile")
        if mode == "copy-prebuilt":
            src = VENDOR / component["source"]
            if not src.exists():
                raise FileNotFoundError(f"Missing prebuilt source: {src}")
            out = comp_dir / component["output"]
            shutil.copy2(src, out)
            built_paths[component["output"]] = out
            components_manifest.append({
                "name": name,
                "mode": mode,
                "source": component["source"],
                "output": component["output"],
            })
            continue

        extract_zip(component["zip"], comp_dir)

        if name == "adj" and component["entry"].startswith("__generated"):
            generate_adj_entry(comp_dir)

        comp_patches = component.get("patches", [])
        if comp_patches:
            patch_records.extend(apply_patches(comp_dir, comp_patches))

        out_path = compile_foma(comp_dir, component["entry"], component["output"])
        built_paths[component["output"]] = out_path

        components_manifest.append({
            "name": name,
            "mode": mode,
            "zip": component["zip"],
            "entry": component["entry"],
            "output": component["output"],
            "patches": component.get("patches", []),
        })

    outputs_manifest = copy_outputs(built_paths)

    patch_records = sorted(patch_records, key=lambda x: x["file"])

    manifest = {
        "built_at_utc": datetime.now(timezone.utc).isoformat(),
        "submodule": {
            "path": "vendor/thamizhi-morph",
            "commit": submodule_commit,
        },
        "components": components_manifest,
        "patches": patch_records,
        "outputs": outputs_manifest,
    }

    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Solmaalai FST models from vendored sources")
    parser.add_argument("--no-clean", action="store_true", help="Do not clear fst/build/.work before build")
    args = parser.parse_args()

    manifest = build_all(clean=not args.no_clean)
    print("FST build completed")
    print(f"Submodule commit: {manifest['submodule']['commit']}")
    print(f"Models built: {len(manifest['outputs'])}")
    print(f"Manifest: {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
