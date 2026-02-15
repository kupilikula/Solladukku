#!/usr/bin/env python3
"""Fast deterministic FST and dictionary regressions."""

from __future__ import annotations

import json
import argparse
import subprocess
import sys
import tempfile
import re
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = ROOT / "fst" / "tests" / "fixtures" / "noun_morph_regressions.json"
NOUN_FST = ROOT / "build" / "fst-models" / "noun.fst"
DICT_FILE = ROOT / "public" / "tamil_dictionary.txt"
VENDOR_NOUN_ZIP = ROOT / "vendor" / "thamizhi-morph" / "foma" / "ThamizhiMorph-Nouns.zip"
PATCH_DIR = ROOT / "fst" / "patches"


def run_flookup(inputs: list[str], inverse: bool = False) -> dict[str, list[str]]:
    cmd = ["flookup"]
    if inverse:
        cmd.append("-i")
    cmd.append(str(NOUN_FST))

    proc = subprocess.run(
        cmd,
        input="\n".join(inputs) + "\n",
        text=True,
        capture_output=True,
        check=True,
    )

    outputs: dict[str, list[str]] = {k: [] for k in inputs}
    for line in proc.stdout.splitlines():
        if "\t" not in line:
            continue
        left, right = line.split("\t", 1)
        if left in outputs:
            outputs[left].append(right.strip())
    return outputs


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    sys.exit(1)


def ensure_file(path: Path, label: str) -> None:
    if not path.exists() or path.stat().st_size == 0:
        fail(f"Missing {label}: {path}")


def ensure_no_noun_class_duplicates() -> None:
    ensure_file(VENDOR_NOUN_ZIP, "noun source zip")
    class_names = {f"C{i}Sg" for i in range(1, 17)}
    class_names.add("C5pl")

    with tempfile.TemporaryDirectory() as td:
        work = Path(td)
        with ZipFile(VENDOR_NOUN_ZIP, "r") as zf:
            zf.extractall(work)

        patches = sorted(PATCH_DIR.glob("000*.patch"))
        for patch in patches:
            subprocess.run(["git", "apply", "--check", str(patch)], cwd=work, check=True, capture_output=True, text=True)
            subprocess.run(["git", "apply", str(patch)], cwd=work, check=True, capture_output=True, text=True)

        noun_lexc = work / "Nouns.lexc"
        ensure_file(noun_lexc, "patched Nouns.lexc")
        lines = noun_lexc.read_text(encoding="utf-8", errors="replace").splitlines()

        current = None
        lemma_to_classes: dict[str, set[str]] = defaultdict(set)
        for line in lines:
            s = line.strip()
            m = re.match(r"LEXICON\s+(\S+)", s)
            if m:
                current = m.group(1)
                continue
            if current not in class_names:
                continue
            if not s or s.startswith("!") or s.startswith("#") or ";" not in s:
                continue
            pre = s.split(";", 1)[0].strip()
            if not pre:
                continue
            lemma = pre.split()[0]
            if lemma.startswith("+") or lemma == "#":
                continue
            lemma_to_classes[lemma].add(current)

        duplicates = sorted((lemma, sorted(classes)) for lemma, classes in lemma_to_classes.items() if len(classes) > 1)
        if duplicates:
            preview = ", ".join([f"{lemma}:{'/'.join(classes)}" for lemma, classes in duplicates[:20]])
            fail(f"Noun class duplicates detected after patches: {preview}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Run FST morphology and optional dictionary regressions")
    parser.add_argument(
        "--check-dictionary",
        action="store_true",
        help="Require dictionary include/exclude assertions against public/tamil_dictionary.txt",
    )
    args = parser.parse_args()

    ensure_file(FIXTURE_PATH, "fixture")
    ensure_file(NOUN_FST, "noun.fst")
    ensure_no_noun_class_duplicates()

    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

    inverse_pairs = fixture["inverse_must_include"]
    inverse_queries = [item["analysis"] for item in inverse_pairs]
    inv_results = run_flookup(inverse_queries, inverse=True)

    for item in inverse_pairs:
        seen = set(inv_results.get(item["analysis"], []))
        if item["surface"] not in seen:
            fail(f"Inverse miss: {item['analysis']} did not produce {item['surface']} (got {sorted(seen)[:5]})")

    forward_good = fixture["analysis_must_recognize"]
    fwd_good_results = run_flookup(forward_good, inverse=False)
    for word in forward_good:
        analyses = fwd_good_results.get(word, [])
        if not analyses or all(a == "+?" for a in analyses):
            fail(f"Forward analysis miss: {word} returned +?")

    forward_bad = fixture["analysis_should_reject"]
    fwd_bad_results = run_flookup(forward_bad, inverse=False)
    rejected_bad = []
    leaked_bad = []
    for word in forward_bad:
        analyses = fwd_bad_results.get(word, [])
        if analyses and any(a != "+?" for a in analyses):
            leaked_bad.append(word)
        else:
            rejected_bad.append(word)

    if leaked_bad:
        fail(f"Forward analysis unexpectedly accepted forbidden forms: {leaked_bad}")

    if leaked_bad and args.check_dictionary:
        ensure_file(DICT_FILE, "dictionary")
        dictionary_words = set(DICT_FILE.read_text(encoding="utf-8").splitlines())
        leaked_in_dict = [w for w in leaked_bad if w in dictionary_words]
        if leaked_in_dict:
            fail(f"Leaked bad forms accepted by FST and present in dictionary: {leaked_in_dict}")

    if args.check_dictionary:
        ensure_file(DICT_FILE, "dictionary")
        dictionary_words = set(DICT_FILE.read_text(encoding="utf-8").splitlines())
        for word in fixture["dictionary_must_include"]:
            if word not in dictionary_words:
                fail(f"Dictionary missing expected word: {word}")
        for word in fixture["dictionary_must_exclude"]:
            if word in dictionary_words:
                fail(f"Dictionary contains forbidden word: {word}")

    print("PASS: FST regressions")
    print(f"PASS: inverse checks={len(inverse_pairs)} forward-good={len(forward_good)}")
    print(f"PASS: rejected-bad={len(rejected_bad)} leaked-bad={len(leaked_bad)}")
    if args.check_dictionary:
        print("PASS: dictionary include/exclude checks")


if __name__ == "__main__":
    main()
