#!/usr/bin/env python3
"""
Analyze frequency of Tamil consonants (Mey) and vowels (Uyir) in the Tamil dictionary.

For each word, decomposes Uyirmey (combined) characters into their constituent
Mey (consonant) and Uyir (vowel) components, then counts frequencies.
"""

import os
from collections import Counter

# --- Tamil Unicode definitions ---

# Standalone vowels (Uyir): U+0B85 to U+0B94
UYIR_LETTERS = {
    '\u0B85': 'அ',
    '\u0B86': 'ஆ',
    '\u0B87': 'இ',
    '\u0B88': 'ஈ',
    '\u0B89': 'உ',
    '\u0B8A': 'ஊ',
    '\u0B8E': 'எ',
    '\u0B8F': 'ஏ',
    '\u0B90': 'ஐ',
    '\u0B92': 'ஒ',
    '\u0B93': 'ஓ',
    '\u0B94': 'ஔ',
}

# Vowel diacritic to standalone vowel mapping
DIACRITIC_TO_VOWEL = {
    '\u0BBE': 'ஆ',  # ா
    '\u0BBF': 'இ',  # ி
    '\u0BC0': 'ஈ',  # ீ
    '\u0BC1': 'உ',  # ு
    '\u0BC2': 'ஊ',  # ூ
    '\u0BC6': 'எ',  # ெ
    '\u0BC7': 'ஏ',  # ே
    '\u0BC8': 'ஐ',  # ை
    '\u0BCA': 'ஒ',  # ொ
    '\u0BCB': 'ஓ',  # ோ
    '\u0BCC': 'ஔ',  # ௌ
}

# Virama
VIRAMA = '\u0BCD'  # ்

# Consonant bases (U+0B95 to U+0BB9, not all codepoints are used)
CONSONANT_BASES = set()
# Standard Tamil consonants
for cp in [0x0B95, 0x0B99, 0x0B9A, 0x0B9E, 0x0B9F, 0x0BA3, 0x0BA4,
           0x0BA8, 0x0BA9, 0x0BAA, 0x0BAE, 0x0BAF, 0x0BB0, 0x0BB1,
           0x0BB2, 0x0BB3, 0x0BB4, 0x0BB5, 0x0BB7, 0x0BB8, 0x0BB9]:
    CONSONANT_BASES.add(chr(cp))
# Grantha consonant
CONSONANT_BASES.add('\u0B9C')  # ஜ

# Consonant display names (base + virama form)
CONSONANT_NAMES = {}
for c in CONSONANT_BASES:
    CONSONANT_NAMES[c] = c + VIRAMA  # e.g., க -> க்


def decompose_word(word):
    """
    Decompose a Tamil word into its Mey (consonant) and Uyir (vowel) components.

    Returns two lists: (mey_list, uyir_list)
    Each element is the character to count.
    """
    mey_counts = []
    uyir_counts = []

    i = 0
    n = len(word)

    while i < n:
        ch = word[i]

        # Case 1: Standalone vowel
        if ch in UYIR_LETTERS:
            uyir_counts.append(ch)
            i += 1

        # Case 2: Consonant base
        elif ch in CONSONANT_BASES:
            # Look ahead
            if i + 1 < n:
                next_ch = word[i + 1]
                if next_ch == VIRAMA:
                    # Pure consonant (Mey)
                    mey_counts.append(ch)
                    i += 2
                elif next_ch in DIACRITIC_TO_VOWEL:
                    # Uyirmey: consonant + vowel diacritic
                    mey_counts.append(ch)
                    uyir_counts.append(DIACRITIC_TO_VOWEL[next_ch])
                    i += 2
                else:
                    # Consonant followed by something else (next consonant, etc.)
                    # This means inherent 'அ'
                    mey_counts.append(ch)
                    uyir_counts.append('அ')
                    i += 1
            else:
                # End of word: inherent 'அ'
                mey_counts.append(ch)
                uyir_counts.append('அ')
                i += 1

        else:
            # Skip non-Tamil characters (e.g., ஃ Aytham, numbers, etc.)
            i += 1

    return mey_counts, uyir_counts


def main():
    dict_path = os.path.join(os.path.dirname(__file__), '..', 'public', 'tamil_dictionary.txt')
    dict_path = os.path.abspath(dict_path)

    print(f"Reading dictionary from: {dict_path}")

    mey_counter = Counter()
    uyir_counter = Counter()
    total_words = 0

    with open(dict_path, 'r', encoding='utf-8') as f:
        for line in f:
            word = line.strip()
            if not word:
                continue
            total_words += 1
            mey_list, uyir_list = decompose_word(word)
            for m in mey_list:
                mey_counter[m] += 1
            for u in uyir_list:
                uyir_counter[u] += 1

    total_mey = sum(mey_counter.values())
    total_uyir = sum(uyir_counter.values())
    total_all = total_mey + total_uyir

    print(f"\nTotal words analyzed: {total_words:,}")
    print(f"Total Mey (consonant) occurrences: {total_mey:,}")
    print(f"Total Uyir (vowel) occurrences: {total_uyir:,}")
    print(f"Total letters (Mey + Uyir): {total_all:,}")
    print(f"Consonant-to-Vowel ratio: {total_mey / total_uyir:.3f}")

    # --- Mey frequency table ---
    print("\n" + "=" * 75)
    print("MEY (CONSONANT) FREQUENCIES")
    print("=" * 75)
    print(f"{'Consonant':<12} {'Count':>12} {'% of Mey':>10} {'% of All':>10}")
    print("-" * 75)

    for consonant, count in mey_counter.most_common():
        display = consonant + VIRAMA  # Show as pure consonant form
        pct_mey = 100.0 * count / total_mey
        pct_all = 100.0 * count / total_all
        print(f"{display:<12} {count:>12,} {pct_mey:>9.2f}% {pct_all:>9.2f}%")

    print(f"{'TOTAL':<12} {total_mey:>12,} {100.0:>9.2f}% {100.0 * total_mey / total_all:>9.2f}%")

    # --- Uyir frequency table ---
    print("\n" + "=" * 75)
    print("UYIR (VOWEL) FREQUENCIES")
    print("=" * 75)
    print(f"{'Vowel':<12} {'Count':>12} {'% of Uyir':>10} {'% of All':>10}")
    print("-" * 75)

    for vowel, count in uyir_counter.most_common():
        pct_uyir = 100.0 * count / total_uyir
        pct_all = 100.0 * count / total_all
        print(f"{vowel:<12} {count:>12,} {pct_uyir:>9.2f}% {pct_all:>9.2f}%")

    print(f"{'TOTAL':<12} {total_uyir:>12,} {100.0:>9.2f}% {100.0 * total_uyir / total_all:>9.2f}%")

    # --- Combined view sorted by overall frequency ---
    print("\n" + "=" * 75)
    print("ALL LETTERS BY OVERALL FREQUENCY")
    print("=" * 75)
    print(f"{'Letter':<12} {'Type':<8} {'Count':>12} {'% of Type':>10} {'% of All':>10}")
    print("-" * 75)

    combined = []
    for consonant, count in mey_counter.items():
        display = consonant + VIRAMA
        pct_type = 100.0 * count / total_mey
        combined.append((display, 'Mey', count, pct_type))

    for vowel, count in uyir_counter.items():
        pct_type = 100.0 * count / total_uyir
        combined.append((vowel, 'Uyir', count, pct_type))

    combined.sort(key=lambda x: -x[2])

    for display, typ, count, pct_type in combined:
        pct_all = 100.0 * count / total_all
        print(f"{display:<12} {typ:<8} {count:>12,} {pct_type:>9.2f}% {pct_all:>9.2f}%")


if __name__ == '__main__':
    main()
