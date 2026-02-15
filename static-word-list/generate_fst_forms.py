#!/usr/bin/env python3
"""
Generate Tamil word forms using locally built ThamizhiMorph FST models.

Strategy:
1. Feed Tamil Lexicon headwords through forward flookup on each FST to find
   which headwords are recognized (e.g., as nouns, adjectives, etc.)
2. For recognized lemmas, generate all inflected surface forms via inverse
   flookup with morphological tags (case, number, etc.)

Output: static-word-list/fst_generated_forms.txt (one word per line, sorted, deduplicated)
Canonical built FST models stored in: build/fst-models/

Requires: foma toolkit and prebuilt local models (`npm run fst:build`)
"""

import re
import subprocess
import sys
import unicodedata
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
FST_MODELS_DIR = PROJECT_ROOT / "build" / "fst-models"
OUTPUT_FILE = SCRIPT_DIR / "fst_generated_forms.txt"
LEXICON_FILE = SCRIPT_DIR / "tamillexicon_headwords.txt"

ALL_FSTS = [
    "noun.fst",
    "adj.fst",
    "adv.fst",
    "part.fst",
    "pronoun.fst",
]

# Morphological tags for inverse generation per FST type.
# noun.fst uses: lemma+noun+{case} and lemma+noun+pl+{case}
NOUN_TAGS = [
    "+noun+nom", "+noun+acc", "+noun+dat", "+noun+loc",
    "+noun+abl", "+noun+gen", "+noun+inst", "+noun+soc",
    "+noun+pl+nom", "+noun+pl+acc", "+noun+pl+dat", "+noun+pl+loc",
    "+noun+pl+abl", "+noun+pl+gen", "+noun+pl+inst", "+noun+pl+soc",
]

# adj/adv/pronoun/part tags (simpler — typically just forward recognition)
# For these, we just do forward lookup to validate headwords

# Tamil Unicode range: 0B80-0BFF
TAMIL_CHAR_RE = re.compile(r'^[\u0B80-\u0BFF]+$')
MAX_TAMIL_LETTERS = 15
# Process headwords in chunks to avoid massive stdin
CHUNK_SIZE = 5000


def is_pure_tamil(word: str) -> bool:
    return bool(TAMIL_CHAR_RE.match(word))


def tamil_letter_count(word: str) -> int:
    count = 0
    for ch in word:
        if unicodedata.category(ch) not in ('Mc', 'Mn'):
            count += 1
    return count


def is_valid_form(word: str) -> bool:
    return (is_pure_tamil(word) and
            2 <= tamil_letter_count(word) <= MAX_TAMIL_LETTERS)


def check_foma_installed() -> bool:
    try:
        subprocess.run(['flookup', '-h'], capture_output=True, timeout=5)
        return True
    except FileNotFoundError:
        return False
    except (subprocess.TimeoutExpired, Exception):
        return True


def load_headwords() -> list:
    """Load Tamil Lexicon headwords."""
    words = []
    if not LEXICON_FILE.exists():
        print(f"  WARNING: {LEXICON_FILE} not found")
        return words
    with open(LEXICON_FILE, 'r', encoding='utf-8-sig') as f:
        for line in f:
            entry = line.strip().replace('-', '')
            if entry and is_pure_tamil(entry):
                words.append(entry)
    return words


def run_flookup(fst_path: Path, input_lines: list, inverse: bool = False,
                timeout: int = 180) -> list:
    """
    Run flookup and return raw output lines.
    """
    cmd = ['flookup']
    if inverse:
        cmd.append('-i')
    cmd.append(str(fst_path))

    input_text = '\n'.join(input_lines) + '\n'
    try:
        result = subprocess.run(
            cmd, input=input_text, capture_output=True, text=True, timeout=timeout
        )
        return result.stdout.splitlines()
    except subprocess.TimeoutExpired:
        print(f"    flookup timed out ({timeout}s)")
        return []
    except Exception as e:
        print(f"    flookup error: {e}")
        return []


def forward_lookup_recognized(fst_path: Path, headwords: list) -> list:
    """
    Feed headwords through forward flookup. Return list of (lemma, analysis)
    pairs for recognized words (output != "+?").
    """
    recognized = []
    total = len(headwords)
    for i in range(0, total, CHUNK_SIZE):
        chunk = headwords[i:i + CHUNK_SIZE]
        lines = run_flookup(fst_path, chunk, inverse=False)
        for line in lines:
            parts = line.split('\t')
            if len(parts) >= 2 and parts[1].strip() != '+?':
                recognized.append((parts[0].strip(), parts[1].strip()))
        if (i + CHUNK_SIZE) % 20000 == 0 or i + CHUNK_SIZE >= total:
            print(f"    Processed {min(i + CHUNK_SIZE, total)}/{total}, "
                  f"recognized so far: {len(recognized)}")
    return recognized


def inverse_generate_forms(fst_path: Path, lemmas: list, tags: list) -> set:
    """
    Generate inflected forms by doing inverse flookup with lemma+tag strings.
    """
    forms = set()
    # Build all analysis strings: lemma+tag for each lemma and tag
    analysis_strings = []
    for lemma in lemmas:
        for tag in tags:
            analysis_strings.append(lemma + tag)

    total = len(analysis_strings)
    print(f"    Generating forms: {len(lemmas)} lemmas x {len(tags)} tags = {total} queries")

    for i in range(0, total, CHUNK_SIZE):
        chunk = analysis_strings[i:i + CHUNK_SIZE]
        lines = run_flookup(fst_path, chunk, inverse=True)
        for line in lines:
            parts = line.split('\t')
            if len(parts) >= 2:
                surface = parts[1].strip()
                if surface and surface != '+?' and is_valid_form(surface):
                    forms.add(surface)
        if (i + CHUNK_SIZE) % 50000 == 0 or i + CHUNK_SIZE >= total:
            print(f"    Processed {min(i + CHUNK_SIZE, total)}/{total}, "
                  f"forms so far: {len(forms)}")

    return forms


def process_noun_fst(headwords: list) -> set:
    """Process noun.fst: find recognized nouns, generate all inflections."""
    fst_path = FST_MODELS_DIR / "noun.fst"
    if not fst_path.exists():
        return set()

    print(f"\n  === noun.fst ===")

    # Step 1: Find recognized nouns
    print(f"  Forward lookup ({len(headwords)} headwords)...")
    recognized = forward_lookup_recognized(fst_path, headwords)
    lemmas = list(set(r[0] for r in recognized))
    print(f"  Recognized {len(lemmas)} unique noun lemmas")

    # Step 2: Generate all inflected forms
    print(f"  Inverse generation...")
    forms = inverse_generate_forms(fst_path, lemmas, NOUN_TAGS)
    # Also add the lemmas themselves
    for lemma in lemmas:
        if is_valid_form(lemma):
            forms.add(lemma)
    print(f"  Total noun forms: {len(forms)}")
    return forms


def process_simple_fst(fst_name: str, headwords: list) -> set:
    """
    Process adj/adv/part/pronoun FSTs. These don't have as many inflection
    tags — we do forward lookup to validate headwords, and also try inverse
    lookup to catch any generated forms.
    """
    fst_path = FST_MODELS_DIR / fst_name
    if not fst_path.exists():
        return set()

    print(f"\n  === {fst_name} ===")
    forms = set()

    # Forward: find recognized headwords
    print(f"  Forward lookup ({len(headwords)} headwords)...")
    recognized = forward_lookup_recognized(fst_path, headwords)

    for lemma, analysis in recognized:
        if is_valid_form(lemma):
            forms.add(lemma)

    print(f"  Recognized {len(forms)} forms")

    # For adjectives, try some common suffixes via inverse
    if 'adj' in fst_name:
        lemmas = list(set(r[0] for r in recognized))
        if lemmas:
            adj_tags = ["+adj", "+adj+comp", "+adj+super"]
            print(f"  Trying inverse with {len(adj_tags)} tags...")
            inv_forms = inverse_generate_forms(fst_path, lemmas, adj_tags)
            forms |= inv_forms

    return forms


def main():
    print("=== FST Surface Form Generator ===\n")

    if not check_foma_installed():
        print("ERROR: foma toolkit not installed.")
        print("Install with: brew install foma")
        sys.exit(1)
    print("foma toolkit found.\n")

    # Step 1: Validate local FST models (built by fst/build/build_fsts.py)
    print("Step 1: Checking local FST models...")
    missing = [name for name in ALL_FSTS if not (FST_MODELS_DIR / name).exists()]
    if missing:
        print("ERROR: Missing local FST models:")
        for name in missing:
            print(f"  - {name}")
        print("Run from repo root: npm run fst:build")
        sys.exit(1)
    print(f"  Found {len(ALL_FSTS)} local models in {FST_MODELS_DIR}")

    # Step 2: Load headwords
    print("\nStep 2: Loading headwords...")
    headwords = load_headwords()
    print(f"  Loaded {len(headwords)} headwords")

    # Step 3: Generate forms from each FST
    print("\nStep 3: Generating inflected forms...")
    all_forms = set()

    # 3a: Noun FSTs (biggest payoff — noun inflections are the main gap)
    noun_forms = process_noun_fst(headwords)
    all_forms |= noun_forms
    print(f"  Running total: {len(all_forms)} forms")

    # 3b: Other FSTs
    for fst_name in ["adj.fst", "adv.fst", "part.fst", "pronoun.fst"]:
        forms = process_simple_fst(fst_name, headwords)
        new = forms - all_forms
        print(f"  {fst_name}: {len(forms)} forms, {len(new)} new")
        all_forms |= forms

    # Step 4: Final filtering
    print(f"\nStep 4: Final filtering...")
    print(f"  Total raw forms: {len(all_forms)}")
    all_forms = {w for w in all_forms if is_valid_form(w)}
    print(f"  After filtering (2-15 Tamil letters): {len(all_forms)}")

    # Size mitigation
    if len(all_forms) > 5_000_000:
        print(f"  WARNING: {len(all_forms)} forms exceed 5M limit, trimming...")
        headword_set = set(headwords)
        all_forms = {w for w in all_forms
                     if w in headword_set or any(w.startswith(hw[:4]) for hw in headword_set)}
        print(f"  After trimming: {len(all_forms)}")

    # Step 5: Write output
    print(f"\nStep 5: Writing to {OUTPUT_FILE}...")
    sorted_forms = sorted(all_forms)
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        for word in sorted_forms:
            f.write(word + '\n')

    file_size = OUTPUT_FILE.stat().st_size
    size_mb = file_size / (1024 * 1024)
    print(f"\nDone! {len(sorted_forms)} forms, {size_mb:.1f} MB")
    print(f"Output: {OUTPUT_FILE}")


if __name__ == '__main__':
    main()
