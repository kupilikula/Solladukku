#!/usr/bin/env python3
"""
Analyze the gap between current generated dictionary and legacy external words-C* forms.
"""

from __future__ import annotations

import json
import random
import re
import subprocess
import unicodedata
from pathlib import Path
from typing import Dict, Iterable, List, Set, Tuple

SCRIPT_DIR = Path(__file__).parent
ROOT = SCRIPT_DIR.parent
CACHE_DIR = SCRIPT_DIR / "cache"
REPORT_JSON = SCRIPT_DIR / "gap_vs_legacy_report.json"
REPORT_MD = SCRIPT_DIR / "gap_vs_legacy_report.md"
LEGACY_GLOB = "words-C*"
SAMPLE_SIZE = 15000

TAMIL_RE = re.compile(r"^[\u0B80-\u0BFF]+$")

FSTS = [
    "noun.fst",
    "adj.fst",
    "adv.fst",
    "part.fst",
    "pronoun.fst",
    "verb-c3.fst",
    "verb-c4.fst",
    "verb-c11.fst",
    "verb-c12.fst",
    "verb-c62.fst",
    "verb-c-rest.fst",
]


def is_tamil(word: str) -> bool:
    return bool(TAMIL_RE.match(word))


def tamil_letter_count(word: str) -> int:
    count = 0
    for ch in word:
        if unicodedata.category(ch) not in ("Mc", "Mn"):
            count += 1
    return count


def load_set(path: Path) -> Set[str]:
    return {line.strip() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()}


def load_legacy_words() -> Set[str]:
    words: Set[str] = set()
    for path in CACHE_DIR.glob(LEGACY_GLOB):
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            w = line.strip()
            if w and is_tamil(w) and tamil_letter_count(w) <= 15:
                words.add(w)
    return words


def run_flookup(fst_path: Path, words: List[str]) -> Dict[str, str]:
    payload = "\n".join(words) + "\n"
    result = subprocess.run(["flookup", str(fst_path)], input=payload, text=True, capture_output=True, check=False)
    out: Dict[str, str] = {}
    for line in result.stdout.splitlines():
        if "\t" not in line:
            continue
        left, right = line.split("\t", 1)
        right = right.strip()
        if right != "+?" and left not in out:
            out[left] = right
    return out


def main() -> int:
    dictionary = load_set(ROOT / "public" / "tamil_dictionary.txt")
    fst_forms = load_set(SCRIPT_DIR / "fst_generated_forms.txt")
    exclusions = load_set(SCRIPT_DIR / "wiktionary_exclusions.txt") if (SCRIPT_DIR / "wiktionary_exclusions.txt").exists() else set()
    legacy = load_legacy_words() - exclusions
    missing = sorted(legacy - dictionary)

    sample = missing if len(missing) <= SAMPLE_SIZE else random.Random(17).sample(missing, SAMPLE_SIZE)
    fsts_dir = ROOT / "server" / "fst-models"

    analyses: Dict[str, str] = {}
    for fst_name in FSTS:
        partial = run_flookup(fsts_dir / fst_name, sample)
        for k, v in partial.items():
            analyses.setdefault(k, v)

    recognized = set(analyses.keys())
    recognized_rate = (len(recognized) / len(sample)) if sample else 0.0

    stem_missing: Set[str] = set()
    for word in recognized:
        stem = analyses[word].split("+", 1)[0]
        if stem not in dictionary:
            stem_missing.add(stem)

    report = {
        "current_dictionary_count": len(dictionary),
        "current_fst_forms_count": len(fst_forms),
        "legacy_words_count": len(legacy),
        "legacy_missing_from_current_count": len(missing),
        "sample_size": len(sample),
        "sample_recognized_by_any_fst_count": len(recognized),
        "sample_recognized_by_any_fst_rate": round(recognized_rate, 4),
        "sample_recognized_stems_not_in_current_dictionary_count": len(stem_missing),
        "sample_recognized_stems_not_in_current_dictionary_preview": sorted(list(stem_missing))[:120],
    }
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")

    md = [
        "# Legacy Gap Analysis",
        "",
        f"- Current dictionary: **{report['current_dictionary_count']}**",
        f"- Current generated FST forms: **{report['current_fst_forms_count']}**",
        f"- Legacy words-C* total (Tamil, <=15): **{report['legacy_words_count']}**",
        f"- Legacy minus current dictionary: **{report['legacy_missing_from_current_count']}**",
        "",
        "## Sample Recognition",
        f"- Sample size: **{report['sample_size']}**",
        f"- Recognized by any current FST: **{report['sample_recognized_by_any_fst_count']}** ({report['sample_recognized_by_any_fst_rate']:.2%})",
        "",
        "## Stem Coverage Signal",
        f"- Recognized sample stems missing in current dictionary: **{report['sample_recognized_stems_not_in_current_dictionary_count']}**",
        "- Interpretation: high value here indicates lemma/stem coverage gaps more than pure inflection-template gaps.",
        "",
        "## Preview Stems",
    ]
    md.extend([f"- `{stem}`" for stem in report["sample_recognized_stems_not_in_current_dictionary_preview"][:80]])
    REPORT_MD.write_text("\n".join(md) + "\n", encoding="utf-8")

    print(f"Wrote {REPORT_JSON}")
    print(f"Wrote {REPORT_MD}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
