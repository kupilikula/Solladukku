#!/usr/bin/env python3
"""
Extract Tamil Wiktionary lemma -> POS hints from full pages dump.

Input (cached/downloaded):
  cache/tawiktionary-latest-pages-articles.xml.bz2

Outputs:
  cache/tawiktionary_pos_headwords.jsonl
  cache/tawiktionary_pos_summary.json
"""

from __future__ import annotations

import argparse
import bz2
import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set

SCRIPT_DIR = Path(__file__).parent
CACHE_DIR = SCRIPT_DIR / "cache"
DUMP_PATH = CACHE_DIR / "tawiktionary-latest-pages-articles.xml.bz2"
OUTPUT_JSONL = CACHE_DIR / "tawiktionary_pos_headwords.jsonl"
SUMMARY_JSON = CACHE_DIR / "tawiktionary_pos_summary.json"

DUMP_URL = (
    "https://dumps.wikimedia.org/tawiktionary/latest/"
    "tawiktionary-latest-pages-articles.xml.bz2"
)

TAMIL_CHAR_RE = re.compile(r"^[\u0B80-\u0BFF]+$")
TAMIL_DIGIT_RE = re.compile(r"[\u0BE6-\u0BEF\u0BF0-\u0BF9]")

POS_PATTERNS: Dict[str, List[re.Pattern[str]]] = {
    "noun": [
        re.compile(r"பெயர்ச்சொல்"),
        re.compile(r"பெயர்ச்சொல்-பகுப்பு"),
        re.compile(r"\{\{\s*noun\s*\}\}", re.IGNORECASE),
    ],
    "verb": [
        re.compile(r"வினைச்சொல்"),
        re.compile(r"வினைச்சொல்-பகுப்பு"),
        re.compile(r"\{\{\s*verb\s*\}\}", re.IGNORECASE),
    ],
    "adjective": [
        re.compile(r"பெயரடை"),
        re.compile(r"உரிச்சொல்"),
        re.compile(r"பெயரடை-பகுப்பு"),
        re.compile(r"உரிச்சொல்-பகுப்பு"),
        re.compile(r"\{\{\s*adjective\s*\}\}", re.IGNORECASE),
        re.compile(r"\{\{\s*adj\s*\}\}", re.IGNORECASE),
    ],
    "adverb": [
        re.compile(r"வினையுரிச்சொல்"),
        re.compile(r"வினையுரிச்சொல்-பகுப்பு"),
        re.compile(r"\{\{\s*adverb\s*\}\}", re.IGNORECASE),
        re.compile(r"\{\{\s*adv\s*\}\}", re.IGNORECASE),
    ],
    "pronoun": [
        re.compile(r"பிரதிப்பெயர்"),
        re.compile(r"பதிலிப்பெயர்"),
        re.compile(r"\{\{\s*pronoun\s*\}\}", re.IGNORECASE),
    ],
    "particle": [
        re.compile(r"இடைச்சொல்"),
        re.compile(r"\{\{\s*particle\s*\}\}", re.IGNORECASE),
    ],
}

LANG_SECTION_MARKERS = [
    re.compile(r"==\s*\{\{\s*-?ta-?\s*\}\}\s*==", re.IGNORECASE),
    re.compile(r"==\s*\{\{\s*மொழி\s*\|\s*ta\s*\}\}\s*==", re.IGNORECASE),
    re.compile(r"==\s*தமிழ்\s*=="),
]


def is_lexical_headword(word: str) -> bool:
    if not word or not TAMIL_CHAR_RE.match(word):
        return False
    if TAMIL_DIGIT_RE.search(word):
        return False
    return True


def download_dump(force: bool) -> bool:
    CACHE_DIR.mkdir(exist_ok=True)
    if DUMP_PATH.exists() and not force:
        print(f"Using cached dump: {DUMP_PATH}")
        return True
    print(f"Downloading dump: {DUMP_URL}")
    try:
        req = urllib.request.Request(DUMP_URL, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = resp.read()
        with open(DUMP_PATH, "wb") as f:
            f.write(data)
        return True
    except Exception as exc:
        print(f"ERROR: download failed: {exc}")
        return False


def extract_tamil_section(text: str) -> str:
    if not text:
        return ""
    lines = text.splitlines()
    start = -1
    for i, line in enumerate(lines):
        if any(p.search(line) for p in LANG_SECTION_MARKERS):
            start = i + 1
            break
    if start < 0:
        return ""
    end = len(lines)
    for i in range(start, len(lines)):
        line = lines[i]
        if line.startswith("==") and line.endswith("==") and not any(p.search(line) for p in LANG_SECTION_MARKERS):
            end = i
            break
    return "\n".join(lines[start:end])


def detect_pos(text: str) -> Set[str]:
    found: Set[str] = set()
    if not text:
        return found
    lines = text.splitlines()
    signal_lines: List[str] = []
    for raw in lines:
        line = raw.strip()
        if not line:
            continue
        # POS is typically declared in heading/template lines.
        if line.startswith("="):
            signal_lines.append(line)
            continue
        if "{{" in line:
            if "பகுப்பு" in line or re.search(r"\{\{\s*(noun|verb|adjective|adj|adverb|adv|pronoun|particle)", line, re.IGNORECASE):
                signal_lines.append(line)
                continue
    signal_text = "\n".join(signal_lines) if signal_lines else text
    for pos, patterns in POS_PATTERNS.items():
        if any(p.search(signal_text) for p in patterns):
            found.add(pos)
    return found


def _first_child_text(parent: ET.Element, local_name: str) -> str:
    for child in list(parent):
        if child.tag.rsplit("}", 1)[-1] == local_name and child.text:
            return child.text.strip()
    return ""


def _find_text_recursive(parent: ET.Element, local_name: str) -> str:
    for el in parent.iter():
        if el.tag.rsplit("}", 1)[-1] == local_name and el.text:
            return el.text
    return ""


def parse_dump(limit: Optional[int] = None) -> Iterable[Dict[str, object]]:
    pages_seen = 0
    with bz2.open(DUMP_PATH, "rb") as fh:
        context = ET.iterparse(fh, events=("end",))
        for _event, elem in context:
            if elem.tag.rsplit("}", 1)[-1] != "page":
                continue
            title = _first_child_text(elem, "title")
            namespace = _first_child_text(elem, "ns")
            text = _find_text_recursive(elem, "text")

            if namespace == "0" and is_lexical_headword(title):
                tamil_section = extract_tamil_section(text)
                if not tamil_section:
                    # Some Tamil entries are old-format and do not delimit language section.
                    tamil_section = text
                pos_tags = sorted(detect_pos(tamil_section))
                if pos_tags:
                    yield {
                        "lemma": title,
                        "pos_tags": pos_tags,
                        "source": "tawiktionary-pages-articles",
                    }
            pages_seen += 1
            if limit is not None and pages_seen >= limit:
                elem.clear()
                break
            elem.clear()


def main() -> int:
    parser = argparse.ArgumentParser(description="Extract POS hints from Tamil Wiktionary pages dump")
    parser.add_argument("--force-download", action="store_true", help="Redownload dump even if cache exists")
    parser.add_argument("--limit", type=int, default=None, help="Parse only first N pages (debug)")
    args = parser.parse_args()

    if not download_dump(force=args.force_download):
        return 1

    records: List[Dict[str, object]] = []
    pos_counter = Counter()
    for row in parse_dump(limit=args.limit):
        records.append(row)
        for pos in row["pos_tags"]:
            pos_counter[pos] += 1

    records.sort(key=lambda r: r["lemma"])
    CACHE_DIR.mkdir(exist_ok=True)
    with open(OUTPUT_JSONL, "w", encoding="utf-8") as f:
        for row in records:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    summary = {
        "records": len(records),
        "pos_counts": dict(sorted(pos_counter.items())),
        "dump_path": str(DUMP_PATH),
        "output_jsonl": str(OUTPUT_JSONL),
    }
    with open(SUMMARY_JSON, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2, sort_keys=True)

    print(f"Wrote POS headwords: {len(records)} -> {OUTPUT_JSONL}")
    print(f"Wrote summary: {SUMMARY_JSON}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
