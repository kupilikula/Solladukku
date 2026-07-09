#!/usr/bin/env python3
"""Build Solmaalai FST binaries from vendored ThamizhiMorph sources."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
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
PINNED_UPSTREAM_ZIPS = ROOT / "fst" / "upstream-zips"
PINNED_UPSTREAM_MODELS = ROOT / "fst" / "upstream-models"
PINNED_FALLBACK_UPSTREAM_COMMIT = "a296417ac603fd44eda35645369f1257d96bed89"

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
            "0004-fix-noun-plural-accusative.patch",
            "0005-add-common-noun-case-variants.patch",
            "0007-expand-source-backed-noun-coverage.patch",
            "0010-add-source-backed-noun-tranche.patch",
            "0012-add-source-backed-name-tranche.patch",
            "0013-add-foreign-final-name-template.patch",
            "0015-add-source-backed-noun-tranche-2.patch",
            "0016-remove-noun-pronoun-rewrites.patch",
            "0017-add-source-backed-noun-tranche-3.patch",
            "0021-add-reviewed-peen-noun.patch",
            "0025-add-noun-additive-um.patch",
            "0030-add-corpus-backed-common-nouns.patch",
            "0033-add-selective-loan-nouns.patch",
            "0040-add-calendar-place-loan-nouns.patch",
            "0044-add-audit-backed-common-noun-coverage.patch",
            "0047-add-noun-translative-and-singular-additive.patch",
            "0048-add-noun-oblique-translative-coverage.patch",
            "0051-add-corpus-backed-common-noun-gaps.patch",
            "0054-add-corpus-backed-noun-gap-tranche.patch",
            "0057-add-remaining-corpus-noun-roots.patch",
            "0058-add-triaged-common-noun-coverage.patch",
            "0059-add-c15-irkku-dative-variant.patch",
        ],
    },
    {
        "name": "adj",
        "zip": "ThamizhiMorph-Adjectives.zip",
        "entry": "__generated_adj_build.foma",
        "output": "adj.fst",
        "patches": [
            "0029-add-deictic-adjective-forms.patch",
            "0035-add-corpus-backed-adjectival-stems.patch",
            "0045-add-audit-backed-adjective-forms.patch",
        ],
    },
    {
        "name": "adv",
        "zip": "ThamizhiMorph-Adverbs.zip",
        "entry": "tamil-adverbs.foma",
        "output": "adv.fst",
        "patches": [
            "0020-add-lexicon-adverb-illaakkaattil.patch",
            "0027-add-common-adverb-een.patch",
            "0028-add-deictic-adverb-forms.patch",
            "0031-add-corpus-backed-common-adverbs.patch",
            "0036-add-corpus-backed-adverbial-stems.patch",
            "0055-add-focused-adverb-form.patch",
        ],
    },
    {
        "name": "part",
        "zip": "ThamizhiMorph-Particles.zip",
        "entry": "tamil-part.foma",
        "output": "part.fst",
        "patches": [
            "0026-add-common-function-particles.patch",
            "0032-add-pronoun-quantifier-function-coverage.patch",
            "0034-add-selective-abbreviation-particles.patch",
            "0037-add-complementizer-case-forms.patch",
            "0042-add-comparative-kkum-particle.patch",
            "0056-add-indefinite-quantifier-particle.patch",
        ],
    },
    {
        "name": "verb-c3",
        "zip": "ThamizhiMorph-Verbs.zip",
        "entry": "ThamizhiFST-C3.foma",
        "output": "verb-c3.fst",
        "patches": [
            "0006-add-common-verb-coverage.patch",
            "0008-expand-source-backed-verb-coverage.patch",
            "0009-add-irregular-existential-verb.patch",
            "0011-add-source-backed-c5-verb-tranche.patch",
            "0014-add-source-backed-c5-verb-tranche-2.patch",
            "0022-add-peethu-verb-coverage.patch",
            "0018-add-short-honorific-verb-forms.patch",
            "0019-add-participial-person-nominals.patch",
            "0023-add-source-backed-c5-primary-verb-stems.patch",
            "0024-add-source-backed-c5-primary-verb-stems-2.patch",
            "0061-add-modern-present-finite-coverage.patch",
        ],
    },
    {
        "name": "verb-c4",
        "zip": "ThamizhiMorph-Verbs.zip",
        "entry": "ThamizhiFST-C4.foma",
        "output": "verb-c4.fst",
        "patches": [
            "0006-add-common-verb-coverage.patch",
            "0008-expand-source-backed-verb-coverage.patch",
            "0009-add-irregular-existential-verb.patch",
            "0011-add-source-backed-c5-verb-tranche.patch",
            "0014-add-source-backed-c5-verb-tranche-2.patch",
            "0022-add-peethu-verb-coverage.patch",
            "0018-add-short-honorific-verb-forms.patch",
            "0019-add-participial-person-nominals.patch",
            "0023-add-source-backed-c5-primary-verb-stems.patch",
            "0024-add-source-backed-c5-primary-verb-stems-2.patch",
            "0046-add-c4-u-final-future-forms.patch",
            "0050-add-c4-modern-human-plural-verb-coverage.patch",
            "0052-add-c4-modern-nonfinite-verb-forms.patch",
        ],
    },
    {
        "name": "verb-c11",
        "zip": "ThamizhiMorph-Verbs.zip",
        "entry": "ThamizhiFST-C11.foma",
        "output": "verb-c11.fst",
        "patches": [
            "0006-add-common-verb-coverage.patch",
            "0008-expand-source-backed-verb-coverage.patch",
            "0009-add-irregular-existential-verb.patch",
            "0011-add-source-backed-c5-verb-tranche.patch",
            "0014-add-source-backed-c5-verb-tranche-2.patch",
            "0022-add-peethu-verb-coverage.patch",
            "0018-add-short-honorific-verb-forms.patch",
            "0019-add-participial-person-nominals.patch",
            "0023-add-source-backed-c5-primary-verb-stems.patch",
            "0024-add-source-backed-c5-primary-verb-stems-2.patch",
            "0039-add-c11-loan-verb-stems.patch",
        ],
    },
    {
        "name": "verb-c12",
        "zip": "ThamizhiMorph-Verbs.zip",
        "entry": "ThamizhiFST-C12.foma",
        "output": "verb-c12.fst",
        "patches": [
            "0006-add-common-verb-coverage.patch",
            "0008-expand-source-backed-verb-coverage.patch",
            "0009-add-irregular-existential-verb.patch",
            "0011-add-source-backed-c5-verb-tranche.patch",
            "0014-add-source-backed-c5-verb-tranche-2.patch",
            "0022-add-peethu-verb-coverage.patch",
            "0018-add-short-honorific-verb-forms.patch",
            "0019-add-participial-person-nominals.patch",
            "0023-add-source-backed-c5-primary-verb-stems.patch",
            "0024-add-source-backed-c5-primary-verb-stems-2.patch",
        ],
    },
    {
        "name": "verb-c62",
        "zip": "ThamizhiMorph-Verbs.zip",
        "entry": "ThamizhiFST-C62.foma",
        "output": "verb-c62.fst",
        "patches": [
            "0006-add-common-verb-coverage.patch",
            "0008-expand-source-backed-verb-coverage.patch",
            "0009-add-irregular-existential-verb.patch",
            "0011-add-source-backed-c5-verb-tranche.patch",
            "0014-add-source-backed-c5-verb-tranche-2.patch",
            "0022-add-peethu-verb-coverage.patch",
            "0018-add-short-honorific-verb-forms.patch",
            "0019-add-participial-person-nominals.patch",
            "0023-add-source-backed-c5-primary-verb-stems.patch",
            "0024-add-source-backed-c5-primary-verb-stems-2.patch",
        ],
    },
    {
        "name": "verb-c-rest",
        "zip": "ThamizhiMorph-Verbs.zip",
        "entry": "ThamizhiFST-otherthan-3-4-62-11-12.foma",
        "output": "verb-c-rest.fst",
        "patches": [
            "0006-add-common-verb-coverage.patch",
            "0008-expand-source-backed-verb-coverage.patch",
            "0009-add-irregular-existential-verb.patch",
            "0011-add-source-backed-c5-verb-tranche.patch",
            "0014-add-source-backed-c5-verb-tranche-2.patch",
            "0022-add-peethu-verb-coverage.patch",
            "0018-add-short-honorific-verb-forms.patch",
            "0019-add-participial-person-nominals.patch",
            "0023-add-source-backed-c5-primary-verb-stems.patch",
            "0024-add-source-backed-c5-primary-verb-stems-2.patch",
            "0038-add-modern-verb-derived-forms.patch",
            "0041-complete-modern-verb-paradigms.patch",
            "0043-add-audit-backed-passive-verb-stems.patch",
            "0049-add-corpus-backed-modern-verb-coverage.patch",
            "0053-add-c2-koll-modern-infinitive.patch",
            "0060-add-modern-verbal-nominal-forms.patch",
            "0061-add-modern-present-finite-coverage.patch",
            "0062-add-modern-passive-perfect-neuter-coverage.patch",
        ],
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


def resolve_vendor_commit() -> str:
    """
    Resolve vendored upstream commit for manifest metadata.

    In local/dev this is read from submodule git metadata.
    In Docker builds the copied vendor directory may not be a git worktree, so
    fall back to parsing the pinned commit from vendor README, then to a stable
    placeholder string.
    """
    try:
        top_level = run(["git", "-C", str(VENDOR), "rev-parse", "--show-toplevel"]).strip()
        if Path(top_level).resolve() != VENDOR.resolve():
            raise RuntimeError("vendor directory is not an independent git worktree")
        return run(["git", "-C", str(VENDOR), "rev-parse", "HEAD"]).strip()
    except Exception:
        readme_path = VENDOR / "README.md"
        if readme_path.exists():
            text = readme_path.read_text(encoding="utf-8", errors="replace")
            match = re.search(r"([0-9a-f]{40})", text)
            if match:
                return match.group(1)
        return PINNED_FALLBACK_UPSTREAM_COMMIT


def resolve_zip_path(zip_name: str) -> Path:
    vendored = VENDOR / "foma" / zip_name
    if vendored.exists():
        return vendored
    pinned = PINNED_UPSTREAM_ZIPS / zip_name
    if pinned.exists():
        return pinned
    raise FileNotFoundError(
        f"Missing upstream source zip: {vendored} (also not found at {pinned})"
    )


def resolve_prebuilt_model(source_rel_path: str) -> Path:
    vendored = VENDOR / source_rel_path
    if vendored.exists():
        return vendored
    pinned = PINNED_UPSTREAM_MODELS / Path(source_rel_path).name
    if pinned.exists():
        return pinned
    raise FileNotFoundError(
        f"Missing prebuilt model: {vendored} (also not found at {pinned})"
    )


def ensure_tools() -> None:
    for tool in ("foma", "flookup", "git"):
        if shutil.which(tool) is None:
            raise RuntimeError(f"Required tool not found on PATH: {tool}")


def extract_zip(zip_name: str, out_dir: Path) -> None:
    zip_path = resolve_zip_path(zip_name)
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

    submodule_commit = resolve_vendor_commit()

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
            src = resolve_prebuilt_model(component["source"])
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
