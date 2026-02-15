#!/usr/bin/env python3
"""Audit harness for FST over/under-generation analysis."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
REPORT_DIR = ROOT / "fst" / "reports"


def read_lines(path: Path | None) -> list[str]:
    if path is None or not path.exists():
        return []
    return [line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def run_flookup(fst_path: Path, inputs: list[str], inverse: bool) -> dict[str, list[str]]:
    cmd = ["flookup"]
    if inverse:
        cmd.append("-i")
    cmd.append(str(fst_path))

    proc = subprocess.run(
        cmd,
        input="\n".join(inputs) + "\n",
        text=True,
        capture_output=True,
        check=True,
    )

    mapping: dict[str, list[str]] = {item: [] for item in inputs}
    for line in proc.stdout.splitlines():
        if "\t" not in line:
            continue
        left, right = line.split("\t", 1)
        if left in mapping:
            mapping[left].append(right.strip())
    return mapping


def suffix_bucket(word: str, n: int = 3) -> str:
    return word[-n:] if len(word) >= n else word


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze FST generation against dictionaries/corpora")
    parser.add_argument("--config", required=True, type=Path)
    parser.add_argument("--lemmas", required=True, type=Path)
    parser.add_argument("--dictionary", type=Path, default=ROOT / "public" / "tamil_dictionary.txt")
    parser.add_argument("--corpus", type=Path)
    parser.add_argument("--known-good", type=Path, default=ROOT / "fst" / "tests" / "fixtures" / "known_good.txt")
    parser.add_argument("--known-bad", type=Path, default=ROOT / "fst" / "tests" / "fixtures" / "known_bad.txt")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()

    config_path = args.config.resolve()
    config = json.loads(config_path.read_text(encoding="utf-8"))
    fst_path = ROOT / config["fst"]
    mode = config.get("mode", "inverse")
    inverse = mode == "inverse"

    lemmas = read_lines(args.lemmas)
    tags = config.get("tags", [])
    suspicious_regexes = [re.compile(p) for p in config.get("suspicious_patterns", [])]

    if inverse:
        queries = [lemma + tag for lemma in lemmas for tag in tags]
    else:
        queries = lemmas

    lookup = run_flookup(fst_path, queries, inverse=inverse)

    generated = []
    per_query_counts = {}
    for query, results in lookup.items():
        valid = [r for r in results if r and r != "+?"]
        per_query_counts[query] = len(valid)
        generated.extend(valid)

    generated_set = set(generated)
    dictionary_words = set(read_lines(args.dictionary)) if args.dictionary and args.dictionary.exists() else set()
    corpus_words = set(read_lines(args.corpus)) if args.corpus and args.corpus.exists() else set()
    known_good = set(read_lines(args.known_good))
    known_bad = set(read_lines(args.known_bad))

    suspicious_hits = sorted({w for w in generated_set if any(rx.search(w) for rx in suspicious_regexes)})
    suffix_counts = Counter(suffix_bucket(w) for w in generated_set)

    not_in_dict = sorted(generated_set - dictionary_words) if dictionary_words else []
    not_in_corpus = sorted(generated_set - corpus_words) if corpus_words else []

    report = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "config": str(config_path.relative_to(ROOT)),
        "fst": config["fst"],
        "mode": mode,
        "lemma_count": len(lemmas),
        "query_count": len(queries),
        "generated_total": len(generated),
        "generated_unique": len(generated_set),
        "suffix_counts_top50": suffix_counts.most_common(50),
        "suspicious_hits": suspicious_hits,
        "suspicious_count": len(suspicious_hits),
        "not_in_dictionary_count": len(not_in_dict),
        "not_in_dictionary_rate": (len(not_in_dict) / len(generated_set)) if generated_set and dictionary_words else None,
        "not_in_corpus_count": len(not_in_corpus),
        "not_in_corpus_rate": (len(not_in_corpus) / len(generated_set)) if generated_set and corpus_words else None,
        "known_good_missing": sorted(known_good - generated_set),
        "known_bad_present": sorted(known_bad & generated_set),
        "per_query_counts": per_query_counts,
    }

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    report_path = args.report
    if report_path is None:
        stem = args.config.stem
        report_path = REPORT_DIR / f"{stem}-report.json"

    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote report: {report_path}")


if __name__ == "__main__":
    main()
