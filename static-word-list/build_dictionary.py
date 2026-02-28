#!/usr/bin/env python3
"""
Build a combined Tamil dictionary for Solmaalai word validation.

Sources:
1. Tamil Lexicon headwords (local file)
2. Vuizur Wiktionary Tamil-English TSV (GitHub/cache)
3. Local FST-generated forms from `generate_fst_forms.py` (includes verb classes)

Output: public/tamil_dictionary.txt (one word per line, sorted, deduplicated)
"""

import re
import os
import gzip
import urllib.request
import unicodedata
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
OUTPUT_FILE = PROJECT_ROOT / "public" / "tamil_dictionary.txt"
LEXICON_FILE = SCRIPT_DIR / "tamillexicon_headwords.txt"
FST_FORMS_FILE = SCRIPT_DIR / "fst_generated_forms.txt"
HEURISTIC_FORMS_FILE = SCRIPT_DIR / "fst_heuristic_forms.txt"
WIKTIONARY_EXCLUSIONS_FILE = SCRIPT_DIR / "wiktionary_exclusions.txt"

VUIZUR_TSV_URL = "https://raw.githubusercontent.com/Vuizur/Wiktionary-Dictionaries/master/Tamil-English%20Wiktionary%20dictionary.tsv"
TAWIKTIONARY_TITLES_URL = (
    "https://dumps.wikimedia.org/tawiktionary/latest/"
    "tawiktionary-latest-all-titles-in-ns0.gz"
)

# Tamil Unicode range: 0B80-0BFF
TAMIL_CHAR_RE = re.compile(r'^[\u0B80-\u0BFF]+$')


def is_pure_tamil(word: str) -> bool:
    """Check if a word contains only Tamil Unicode characters."""
    return bool(TAMIL_CHAR_RE.match(word))


def is_lexical_headword(word: str) -> bool:
    """Conservative filter for playable lexical headwords."""
    if not is_pure_tamil(word):
        return False
    if tamil_letter_count(word) < 2:
        return False
    # Exclude entries with Tamil digits.
    if re.search(r'[\u0BE6-\u0BEF\u0BF0-\u0BF9]', word):
        return False
    first_cat = unicodedata.category(word[0])
    if first_cat in ('Mc', 'Mn', 'So'):
        return False
    return True


def load_wiktionary_exclusions() -> set:
    words = set()
    if not WIKTIONARY_EXCLUSIONS_FILE.exists():
        return words
    with open(WIKTIONARY_EXCLUSIONS_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            w = line.strip()
            if w and is_pure_tamil(w):
                words.add(w)
    return words


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


def load_tamil_wiktionary_dump_headwords() -> set:
    """Load Tamil Wiktionary headwords from official Wikimedia ns0 titles dump."""
    words = set()
    cache_dir = SCRIPT_DIR / "cache"
    cache_dir.mkdir(exist_ok=True)
    cache_file = cache_dir / "tawiktionary-latest-all-titles-in-ns0.gz"
    force_refresh = str(os.environ.get("FORCE_REFRESH_TAWIKTIONARY_DUMP", "")).lower() == "true"

    if cache_file.exists() and not force_refresh:
        print("  Using cached Tamil Wiktionary dump titles")
    else:
        print("  Downloading Tamil Wiktionary dump titles...")
        try:
            req = urllib.request.Request(TAWIKTIONARY_TITLES_URL, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = resp.read()
            with open(cache_file, 'wb') as f:
                f.write(data)
        except Exception as e:
            print(f"  ERROR downloading Tamil Wiktionary dump titles: {e}")
            return words

    try:
        with gzip.open(cache_file, 'rt', encoding='utf-8', errors='replace') as f:
            for line in f:
                word = line.strip()
                if word and is_lexical_headword(word):
                    words.add(word)
    except Exception as e:
        print(f"  ERROR reading cached Tamil Wiktionary dump titles: {e}")
        return set()

    print(f"  Tamil Wiktionary dump: {len(words)} unique Tamil headwords")
    return words


def download_vuizur_tsv() -> set:
    """Load Vuizur Wiktionary TSV headwords (supplement/fallback)."""
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
            if word and is_lexical_headword(word):
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


def load_heuristic_forms() -> set:
    """Load optional heuristic-classified lemma forms."""
    words = set()
    if not HEURISTIC_FORMS_FILE.exists():
        print(f"  Heuristic forms file not found: {HEURISTIC_FORMS_FILE} (skipping)")
        return words
    with open(HEURISTIC_FORMS_FILE, 'r', encoding='utf-8') as f:
        for line in f:
            word = line.strip()
            if word and is_pure_tamil(word):
                words.add(word)
    print(f"  Heuristic forms: {len(words)} unique words loaded")
    return words


def main():
    print("Building Solmaalai Tamil dictionary...\n")

    excluded_wiktionary = load_wiktionary_exclusions()
    if excluded_wiktionary:
        print(f"Loaded Wiktionary exclusion list: {len(excluded_wiktionary)}")

    # Step 1: Tamil Lexicon headwords
    print("Step 1: Cleaning Tamil Lexicon headwords...")
    all_words = clean_lexicon_headwords()
    if excluded_wiktionary:
        all_words -= excluded_wiktionary

    # Step 2: Tamil Wiktionary dump headwords (official Wikimedia source)
    print("\nStep 2: Loading Tamil Wiktionary dump headwords...")
    wiki_dump_words = load_tamil_wiktionary_dump_headwords()
    if excluded_wiktionary:
        wiki_dump_words -= excluded_wiktionary
    new_from_wiki_dump = wiki_dump_words - all_words
    print(f"  New words from Tamil Wiktionary dump: {len(new_from_wiki_dump)}")
    all_words |= wiki_dump_words

    # Step 3: Vuizur TSV as supplemental/fallback source (includes many POS-tagged entries)
    print("\nStep 3: Loading Vuizur Wiktionary headwords (supplemental)...")
    vuizur_words = download_vuizur_tsv()
    if excluded_wiktionary:
        vuizur_words -= excluded_wiktionary
    new_from_vuizur = vuizur_words - all_words
    print(f"  Additional new words from Vuizur: {len(new_from_vuizur)}")
    all_words |= vuizur_words

    # Step 4: FST-generated forms (noun/adj/adv/part/pronoun + verb classes)
    print("\nStep 4: Loading FST-generated surface forms...")
    fst_words = load_fst_forms()
    new_from_fst = fst_words - all_words
    print(f"  New words from FST models: {len(new_from_fst)}")
    all_words |= fst_words

    include_heuristic_lemmas = str(os.environ.get("INCLUDE_HEURISTIC_LEMMAS", "")).lower() == "true"
    include_heuristic_inflections = str(os.environ.get("INCLUDE_HEURISTIC_INFLECTIONS", "")).lower() == "true"
    if include_heuristic_lemmas or include_heuristic_inflections:
        print("\nStep 5: Loading heuristic-classified lemma forms...")
        heuristic_words = load_heuristic_forms()
        new_from_heuristic = heuristic_words - all_words
        print(f"  New words from heuristic forms: {len(new_from_heuristic)}")
        all_words |= heuristic_words
        filter_step = 6
        write_step = 7
    else:
        filter_step = 5
        write_step = 6

    # Filter by length (max 15 Tamil letters for the 15x15 board)
    print(f"\nStep {filter_step}: Filtering to ≤15 Tamil letters...")
    before = len(all_words)
    all_words = {w for w in all_words if tamil_letter_count(w) <= 15}
    print(f"  Filtered: {before} → {len(all_words)} words")

    # Sort and write output
    print(f"\nStep {write_step}: Writing output to {OUTPUT_FILE}...")
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
