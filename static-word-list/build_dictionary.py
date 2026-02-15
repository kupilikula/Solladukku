#!/usr/bin/env python3
"""
Build a combined Tamil dictionary for Solmaalai word validation.

Sources:
1. Tamil Lexicon headwords (local file)
2. ThamizhiMorph pre-generated verb forms (GitHub)
3. Vuizur Wiktionary Tamil-English TSV (GitHub)

Output: public/tamil_dictionary.txt (one word per line, sorted, deduplicated)
"""

import os
import re
import sys
import urllib.request
import unicodedata
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
OUTPUT_FILE = PROJECT_ROOT / "public" / "tamil_dictionary.txt"
LEXICON_FILE = SCRIPT_DIR / "tamillexicon_headwords.txt"
FST_FORMS_FILE = SCRIPT_DIR / "fst_generated_forms.txt"

# ThamizhiMorph Generated-Verbs file names
THAMIZHI_VERB_FILES = [
    "words-C1", "words-C2", "words-C3", "words-C4", "words-C5",
    "words-C6", "words-C7", "words-C8", "words-C9", "words-C10",
    "words-C11", "words-C12", "words-C13", "words-C14", "words-C15",
    "words-C16", "words-C17", "words-C18",
    "words-C61", "words-C62", "words-C63",
    "words-CIru", "words-CPadu", "words-CPeru", "words-CVidu",
]
THAMIZHI_BASE_URL = "https://raw.githubusercontent.com/sarves/thamizhi-morph/master/Generated-Verbs/"

VUIZUR_TSV_URL = "https://raw.githubusercontent.com/Vuizur/Wiktionary-Dictionaries/master/Tamil-English%20Wiktionary%20dictionary.tsv"

# Tamil Unicode range: 0B80-0BFF
TAMIL_CHAR_RE = re.compile(r'^[\u0B80-\u0BFF]+$')


def is_pure_tamil(word: str) -> bool:
    """Check if a word contains only Tamil Unicode characters."""
    return bool(TAMIL_CHAR_RE.match(word))


def tamil_letter_count(word: str) -> int:
    """
    Count the number of Tamil 'letters' (visual units / tiles) in a word.
    A Tamil letter is a base character optionally followed by combining marks.
    """
    count = 0
    for ch in word:
        cat = unicodedata.category(ch)
        # Base characters start a new letter; combining marks (Mc, Mn) attach to previous
        if cat not in ('Mc', 'Mn'):
            count += 1
    return count


def clean_lexicon_headwords() -> set:
    """Clean and deduplicate Tamil Lexicon headwords."""
    words = set()
    if not LEXICON_FILE.exists():
        print(f"  WARNING: {LEXICON_FILE} not found, skipping.")
        return words

    with open(LEXICON_FILE, 'r', encoding='utf-8-sig') as f:
        for line in f:
            entry = line.strip()
            if not entry:
                continue
            # Remove hyphens (e.g., "அஃகு-தல்" → "அஃகுதல்")
            entry = entry.replace('-', '')
            # Skip entries with spaces, brackets, commas, or other non-Tamil chars
            if not is_pure_tamil(entry):
                continue
            words.add(entry)

    print(f"  Tamil Lexicon: {len(words)} unique words after cleaning")
    return words


def download_thamizhi_verbs() -> set:
    """Download ThamizhiMorph pre-generated verb forms."""
    words = set()
    cache_dir = SCRIPT_DIR / "cache"
    cache_dir.mkdir(exist_ok=True)

    for fname in THAMIZHI_VERB_FILES:
        cache_file = cache_dir / fname
        if cache_file.exists():
            print(f"  Using cached {fname}")
            with open(cache_file, 'r', encoding='utf-8') as f:
                content = f.read()
        else:
            url = THAMIZHI_BASE_URL + fname
            print(f"  Downloading {fname}...")
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=30) as resp:
                    content = resp.read().decode('utf-8')
                # Cache locally
                with open(cache_file, 'w', encoding='utf-8') as f:
                    f.write(content)
            except Exception as e:
                print(f"  ERROR downloading {fname}: {e}")
                continue

        for line in content.splitlines():
            word = line.strip()
            if word and is_pure_tamil(word):
                words.add(word)

    print(f"  ThamizhiMorph verbs: {len(words)} unique forms")
    return words


def download_vuizur_tsv() -> set:
    """Download Vuizur Wiktionary TSV and extract Tamil headwords."""
    words = set()
    cache_file = SCRIPT_DIR / "cache" / "vuizur_tamil.tsv"
    cache_file.parent.mkdir(exist_ok=True)

    if cache_file.exists():
        print("  Using cached Vuizur TSV")
        with open(cache_file, 'r', encoding='utf-8') as f:
            content = f.read()
    else:
        print("  Downloading Vuizur Wiktionary TSV...")
        try:
            req = urllib.request.Request(VUIZUR_TSV_URL, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=60) as resp:
                content = resp.read().decode('utf-8')
            with open(cache_file, 'w', encoding='utf-8') as f:
                f.write(content)
        except Exception as e:
            print(f"  ERROR downloading Vuizur TSV: {e}")
            return words

    for line in content.splitlines():
        if not line.strip():
            continue
        # Format: TamilWord|romanization\tDefinition
        # Extract the Tamil word before the first pipe
        parts = line.split('|', 1)
        if parts:
            word = parts[0].strip()
            if word and is_pure_tamil(word):
                words.add(word)

    print(f"  Vuizur Wiktionary: {len(words)} unique Tamil headwords")
    return words


def load_fst_forms() -> set:
    """Load FST-generated surface forms (from generate_fst_forms.py output)."""
    words = set()
    if not FST_FORMS_FILE.exists():
        print(f"  WARNING: {FST_FORMS_FILE} not found.")
        print(f"  Run: python3 generate_fst_forms.py  (requires foma toolkit)")
        return words

    with open(FST_FORMS_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            word = line.strip()
            if word and is_pure_tamil(word):
                words.add(word)

    print(f"  FST forms: {len(words)} unique words loaded")
    return words


def main():
    print("Building Solmaalai Tamil dictionary...\n")

    # Step 1: Tamil Lexicon headwords
    print("Step 1: Cleaning Tamil Lexicon headwords...")
    all_words = clean_lexicon_headwords()

    # Step 2: Vuizur Wiktionary (small, fast download)
    print("\nStep 2: Downloading Vuizur Wiktionary headwords...")
    vuizur_words = download_vuizur_tsv()
    new_from_vuizur = vuizur_words - all_words
    print(f"  New words from Vuizur: {len(new_from_vuizur)}")
    all_words |= vuizur_words

    # Step 3: ThamizhiMorph verb forms (large, many files)
    print("\nStep 3: Downloading ThamizhiMorph pre-generated verb forms...")
    verb_words = download_thamizhi_verbs()
    new_from_verbs = verb_words - all_words
    print(f"  New words from ThamizhiMorph: {len(new_from_verbs)}")
    all_words |= verb_words

    # Step 4: FST-generated forms (noun inflections, adjectives, adverbs, etc.)
    print("\nStep 4: Loading FST-generated surface forms...")
    fst_words = load_fst_forms()
    new_from_fst = fst_words - all_words
    print(f"  New words from FST models: {len(new_from_fst)}")
    all_words |= fst_words

    # Step 5: Filter by length (max 15 Tamil letters for the 15x15 board)
    print(f"\nStep 5: Filtering to ≤15 Tamil letters...")
    before = len(all_words)
    all_words = {w for w in all_words if tamil_letter_count(w) <= 15}
    print(f"  Filtered: {before} → {len(all_words)} words")

    # Step 6: Sort and write output
    print(f"\nStep 6: Writing output to {OUTPUT_FILE}...")
    sorted_words = sorted(all_words)
    OUTPUT_FILE.parent.mkdir(exist_ok=True)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        for word in sorted_words:
            f.write(word + '\n')

    file_size = OUTPUT_FILE.stat().st_size
    size_mb = file_size / (1024 * 1024)
    print(f"\nDone! {len(sorted_words)} words, {size_mb:.1f} MB")
    print(f"Output: {OUTPUT_FILE}")


if __name__ == '__main__':
    main()
