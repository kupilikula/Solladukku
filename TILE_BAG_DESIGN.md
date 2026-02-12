# Tile Bag Design: Frequency-Optimized Tamil Scrabble Distribution

## Motivation

The original tile bag was designed with rough estimates of Tamil letter frequency. After building a comprehensive 2.85 million word Tamil dictionary (combining Tamil Lexicon headwords, Wiktionary entries, ThamizhiMorph verb inflections, and FST-generated noun/adjective/adverb forms), we can now analyze actual letter frequency data and align the tile distribution accordingly.

The goals of this redesign are:

1. **Better playability** — Players should draw tiles they can actually use. The old bag gave equal weight to letters with vastly different frequencies, leading to hands full of rare letters.
2. **Fair scoring** — Point values should reward playing rare letters. Common letters that appear in every word shouldn't score the same as rare ones that require skill to use.
3. **Reasonable game length** — The old bag had 890 tiles, leading to games that could last 80+ turns per player. The new bag targets 18-22 turns per player.

## Frequency Analysis

### Two Data Sources

We analyzed letter frequencies from two complementary sources:

1. **Full inflected dictionary** (2.85M words) — All valid playable words including verb conjugations and noun case inflections. Represents what letters actually appear when words are played on the board.
2. **Tamil Lexicon headwords** (107K base forms) — Root/stem vocabulary without inflectional morphology. Represents the base vocabulary players draw from when thinking of words.

### Why Both Sources Matter

The inflected dictionary is heavily biased by Tamil grammatical suffixes. For example:
- **-கள்** (plural suffix) inflates க் and ள் frequency
- **-கிற/-கின்ற** (present tense) inflates க், இ
- **-ற்று/-ற்றான்** (past tense) inflates ற்
- **-இல்/-இன்** (case markers) inflates இ, ல், ன்

Meanwhile, letters common in word roots get diluted:
- **ம்** is extremely common in root words (10.14% of headwords) but diluted to 4.83% by suffix-heavy inflected forms
- **ச்** appears in common roots like செய் (do), சொல் (say) — 7.07% in headwords vs 3.23% in full dict
- **ல்** is 6.55% in headwords vs 3.53% in full dict

### Decomposition Rules

Every word was decomposed into its constituent Mey (consonant) and Uyir (vowel) components:
- Standalone vowel (e.g., அ, ஆ) → count as Uyir
- Consonant + virama (e.g., க் = க + ்) → count as Mey
- Consonant + vowel diacritic (e.g., கா = க + ா) → count both the Mey (க்) and the Uyir (ஆ)
- Bare consonant (no virama, no diacritic) → count the Mey and the inherent vowel அ

### Consonant (Mey) Frequencies — Full Dictionary vs Headwords

| Rank | Letter | Full Dict % | Headword % | Blended % | Notes |
|------|--------|------------|-----------|-----------|-------|
| 1 | க் | 18.75% | 12.89% | **15.82%** | Inflated by -கள், -கிற suffixes |
| 2 | த் | 9.77% | 12.93% | **11.35%** | More common in roots than expected |
| 3 | ப் | 11.00% | 8.72% | **9.86%** | |
| 4 | ம் | 4.83% | 10.14% | **7.49%** | Massively underestimated by full dict |
| 5 | ர் | 7.13% | 7.76% | **7.45%** | Stable across both |
| 6 | ட் | 7.73% | 6.86% | **7.30%** | |
| 7 | வ் | 6.72% | 5.70% | **6.21%** | |
| 8 | ச் | 3.23% | 7.07% | **5.15%** | Massively underestimated by full dict |
| 9 | ல் | 3.53% | 6.55% | **5.04%** | Massively underestimated by full dict |
| 10 | ன் | 5.76% | 4.25% | **5.01%** | |
| 11 | ற் | 6.55% | 2.70% | **4.63%** | Inflated by past tense suffixes |
| 12 | ள் | 6.73% | 2.14% | **4.44%** | Inflated by -கள் plural suffix |
| 13 | ய் | 2.43% | 3.31% | **2.87%** | |
| 14 | ந் | 2.69% | 2.76% | **2.73%** | Stable |
| 15 | ண் | 1.16% | 2.59% | **1.88%** | More common in roots |
| 16 | ழ் | 0.77% | 1.09% | **0.93%** | Slightly more common in roots |
| 17 | ங் | 0.71% | 1.01% | **0.86%** | |
| 18 | ஞ் | 0.28% | 0.56% | **0.42%** | 2× more common in roots |
| 19 | ஷ் | 0.10% | 0.33% | **0.22%** | Sanskrit headwords |
| 20 | ஸ் | 0.08% | 0.35% | **0.22%** | Sanskrit headwords |
| 21 | ஜ் | 0.03% | 0.21% | **0.12%** | |
| 22 | ஹ் | 0.01% | 0.06% | **0.04%** | |

### Vowel (Uyir) Frequencies — Full Dictionary vs Headwords

| Rank | Letter | Full Dict % | Headword % | Blended % | Notes |
|------|--------|------------|-----------|-----------|-------|
| 1 | அ | 34.00% | 39.10% | **36.55%** | Even more dominant in roots |
| 2 | இ | 25.49% | 16.99% | **21.24%** | Inflated by -இல்/-இன் case markers |
| 3 | உ | 18.86% | 15.34% | **17.10%** | |
| 4 | ஆ | 7.87% | 11.20% | **9.54%** | More common in roots |
| 5 | ஐ | 2.69% | 5.90% | **4.30%** | Common in accusative case and roots |
| 6 | எ | 3.30% | 2.38% | **2.84%** | |
| 7 | ஓ | 1.91% | 1.99% | **1.95%** | Stable |
| 8 | ஈ | 2.05% | 1.54% | **1.80%** | |
| 9 | ஏ | 1.64% | 1.89% | **1.77%** | |
| 10 | ஒ | 1.41% | 1.81% | **1.61%** | |
| 11 | ஊ | 0.73% | 1.76% | **1.25%** | More common in roots than inflections suggest |
| 12 | ஔ | 0.03% | 0.09% | **0.06%** | Rare in both |

### Summary Statistics

| Metric | Full Dictionary | Headwords |
|--------|----------------|-----------|
| Words analyzed | 2,848,175 | 107,447 |
| Total Mey occurrences | 25,717,934 | 638,850 |
| Total Uyir occurrences | 18,507,341 | 472,831 |
| Consonant:Vowel ratio | 1.39:1 | 1.35:1 |

## Problems with the Old Distribution

### Old Tile Counts (890 total)

```
Consonants (530 total):
க் 40, ச் 40, ட் 30, த் 40, ப் 40, ற் 30, ங் 10, ஞ் 10, ண் 20,
ந் 20, ம் 40, ன் 30, ய் 20, ர் 30, ல் 30, வ் 30, ழ் 30, ள் 30,
ஜ் 3, ஷ் 2, ஸ் 2, ஹ் 3

Vowels (350 total):
அ 50, ஆ 30, இ 30, ஈ 20, உ 40, ஊ 30, எ 30, ஏ 30, ஐ 20,
ஒ 30, ஓ 30, ஔ 10

Bonus: ? 10
```

### Specific Mismatches

| Problem | Details |
|---------|---------|
| **ச் massively over-represented** | Had 40 tiles (same as க்!) despite being only 5.15% blended frequency vs க்'s 15.82%. |
| **ழ் massively over-represented** | Had 30 tiles at 0.93% frequency — same count as ர் at 7.45%. |
| **இ under-represented** | Had only 30 tiles at 21.24% frequency — same count as ஊ at 1.25%. |
| **ஊ, ஏ, ஒ, ஓ over-represented** | Each had 30 tiles despite all being <2% frequency. |
| **Points didn't match rarity** | ங் (0.86% freq) scored only 2 points. ல் (5.04%) scored just 1 point — same as க் (15.82%). |
| **Game too long** | 890 tiles / ~5 tiles per turn / 2 players = ~89 turns per player. |

## New Distribution Design

### Design Principles

1. **Blended frequency allocation** — Tile counts use the 50/50 average of full-dictionary and headword-only frequencies, balancing morphological patterns with root vocabulary diversity.
2. **Inverse frequency scoring** — Rarer tiles score more points. Organized into tiers with clear frequency boundaries.
3. **60:40 consonant:vowel ratio** — Matches the natural ratio from the language.
4. **Minimum 2 tiles per letter** — Even the rarest letters appear in the game, creating strategic opportunities.
5. **Target ~236 total tiles** — Produces ~18-22 turn games with 14-tile racks and 2 players.

### New Consonant Tiles and Points (140 total)

| Tier | Letter | Blended % | Tiles | Points | Rationale |
|------|--------|-----------|-------|--------|-----------|
| **Very Common (>10%)** | க் | 15.82 | 21 | 1 | Most common consonant |
| | த் | 11.35 | 15 | 1 | Common in root words |
| **Common (7-10%)** | ப் | 9.86 | 14 | 1 | |
| | ம் | 7.49 | 10 | 1 | Very common in roots (underestimated by dict-only) |
| | ர் | 7.45 | 10 | 1 | Stable across both analyses |
| | ட் | 7.30 | 9 | 1 | |
| **Medium (4-7%)** | வ் | 6.21 | 8 | 2 | |
| | ச் | 5.15 | 7 | 2 | Much more common in roots than inflections suggest |
| | ல் | 5.04 | 7 | 2 | Same — root-heavy letter |
| | ன் | 5.01 | 6 | 2 | |
| | ற் | 4.63 | 6 | 2 | Less common in roots than inflections suggest |
| | ள் | 4.44 | 5 | 2 | Same — inflated by -கள் suffix |
| **Low (2-3%)** | ய் | 2.87 | 3 | 3 | |
| | ந் | 2.73 | 3 | 3 | |
| **Scarce (1-2%)** | ண் | 1.88 | 2 | 4 | |
| **Rare (<1%)** | ழ் | 0.93 | 2 | 5 | Distinctly Tamil letter |
| | ங் | 0.86 | 2 | 5 | |
| | ஞ் | 0.42 | 2 | 6 | |
| **Grantha (<0.25%)** | ஷ் | 0.22 | 2 | 8 | Sanskrit-origin, extremely rare |
| | ஸ் | 0.22 | 2 | 8 | |
| | ஜ் | 0.12 | 2 | 8 | |
| | ஹ் | 0.04 | 2 | 8 | Rarest consonant |

### New Vowel Tiles and Points (92 total)

| Tier | Letter | Blended % | Tiles | Points | Rationale |
|------|--------|-----------|-------|--------|-----------|
| **Dominant (>15%)** | அ | 36.55 | 31 | 1 | Most common letter in Tamil |
| | இ | 21.24 | 19 | 1 | Second most common vowel |
| | உ | 17.10 | 15 | 1 | Third most common vowel |
| **Common (5-10%)** | ஆ | 9.54 | 8 | 2 | Common long vowel |
| **Medium (2-5%)** | ஐ | 4.30 | 4 | 2 | More common in roots than dict suggested |
| | எ | 2.84 | 3 | 3 | |
| **Low (1-2%)** | ஓ | 1.95 | 2 | 4 | |
| | ஈ | 1.80 | 2 | 4 | |
| | ஏ | 1.77 | 2 | 4 | |
| | ஒ | 1.61 | 2 | 4 | |
| | ஊ | 1.25 | 2 | 5 | Rare even in roots |
| **Very Rare (<0.1%)** | ஔ | 0.06 | 2 | 8 | Rarest vowel by far |

### Bonus Tiles

| Tile | Tiles | Points |
|------|-------|--------|
| ? | 4 | 0 |

### Grand Total: 236 tiles

| Category | New | Old | Change |
|----------|-----|-----|--------|
| Consonants | 140 | 530 | -73.6% |
| Vowels | 92 | 350 | -73.7% |
| Bonus | 4 | 10 | -60.0% |
| **Total** | **236** | **890** | **-73.5%** |

## Scoring Examples

Since Uyirmey tiles score Mey points + Uyir points automatically, here are representative combined scores:

| Uyirmey | Components | Mey Pts | Uyir Pts | Total | Context |
|---------|------------|---------|----------|-------|---------|
| க | க் + அ | 1 | 1 | **2** | Most common syllable |
| கா | க் + ஆ | 1 | 2 | **3** | Common |
| கி | க் + இ | 1 | 1 | **2** | Very common |
| பு | ப் + உ | 1 | 1 | **2** | Common |
| தா | த் + ஆ | 1 | 2 | **3** | Common |
| மா | ம் + ஆ | 1 | 2 | **3** | Common |
| ரி | ர் + இ | 1 | 1 | **2** | Common |
| சு | ச் + உ | 2 | 1 | **3** | Medium |
| லா | ல் + ஆ | 2 | 2 | **4** | Medium |
| நீ | ந் + ஈ | 3 | 4 | **7** | Uncommon combo |
| ஞா | ஞ் + ஆ | 6 | 2 | **8** | Rare consonant |
| ஹை | ஹ் + ஐ | 8 | 2 | **10** | Very rare + medium |
| ஜௌ | ஜ் + ஔ | 8 | 8 | **16** | Theoretical maximum |

**Typical word scores (without multipliers):**
- Common 3-syllable word (e.g., "படம்" = ப+ட+ம்): ~2+2+1 = **5 points**
- Medium 4-syllable word with variety: ~2+3+3+2 = **10 points**
- Word with a rare letter: 15-20+ points with multipliers

## Game Length Analysis

| Metric | Old (890 tiles) | New (236 tiles) |
|--------|-----------------|-----------------|
| Initial draw (2 players) | 28 tiles | 28 tiles |
| Tiles remaining after draw | 862 | 208 |
| Avg tiles played per turn | ~5 | ~5 |
| Estimated turns per player | ~86 | ~20 |
| Typical game duration | Very long | 30-45 minutes |

## Comparison with English Scrabble

| Property | English Scrabble | Old Tamil Bag | New Tamil Bag |
|----------|-----------------|---------------|---------------|
| Total tiles | 100 | 890 | 236 |
| Rack size | 7 | 14 | 14 |
| Tiles per word | 3-7 | 5-10 (Mey+Uyir) | 5-10 (Mey+Uyir) |
| Turns per player | ~15-20 | ~80+ | ~18-22 |
| Point range | 1-10 | 1-5 | 1-8 (tiles), 2-16 (Uyirmey) |
| Rarest letter | Z (0.07%, 1 tile, 10pts) | ஹ் (0.01%, 3 tiles, 5pts) | ஹ் (0.01%, 2 tiles, 8pts) |

## Key Corrections from Blended Analysis

### Letters that rose significantly after headword correction
- **ம்** : 7 → 10 tiles (+43%) — was 4.83% in dict, but 10.14% in headwords. Very common in root vocabulary.
- **ச்** : 5 → 7 tiles (+40%) — was 3.23% in dict, but 7.07% in headwords. Common roots like செய், சொல்.
- **ல்** : 5 → 7 tiles (+40%) — was 3.53% in dict, but 6.55% in headwords. Common in root vocabulary.
- **ஐ** : 3 → 4 tiles — was 2.69% in dict, but 5.90% in headwords. Common in accusative case.

### Letters that fell after headword correction
- **ள்** : 9 → 5 tiles (-44%) — was 6.73% in dict, but only 2.14% in headwords. Inflated by -கள் plural.
- **ற்** : 9 → 6 tiles (-33%) — was 6.55% in dict, but only 2.70% in headwords. Inflated by past tense suffixes.
- **க்** : 25 → 21 tiles (-16%) — was 18.75% in dict, but 12.89% in headwords. Inflated by -கள், -கிற suffixes.

### Point value adjustments from blending
- **ச்** : 3 → 2 pts (now medium at 5.15%, not uncommon)
- **ல்** : 3 → 2 pts (now medium at 5.04%)
- **ம்** : 2 → 1 pt (now common at 7.49%)
- **ர்** : 2 → 1 pt (now common at 7.45%)
- **ட்** : 2 → 1 pt (now common at 7.30%)
- **ஐ** : 3 → 2 pts (now medium at 4.30%)
