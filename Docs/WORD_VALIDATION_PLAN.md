# Word Validation Plan for Solmaalai

## Problem

Solmaalai currently validates only tile placement geometry (same row/col, no gaps, connectivity). There is no dictionary validation — any string of tiles is accepted as a "word."

Tamil is agglutinative: a single verb root can produce 2,000+ inflected forms, and nouns inflect across 9 grammatical cases with number markers. A static headword dictionary will miss the vast majority of playable word forms.

**Example:** ஓடுதல் (to run) → ஓடுவேன், ஓடாதே, ஓடுகிறேன், ஓடினேன், ஓடி, ஓடிய, ...
**Example:** வீடு (house) → வீட்டில், வீட்டை, வீட்டுக்கு, வீடுகள், ...

## Available Data Sources

### 1. Tamil Lexicon Headwords (already have)
- **File:** `static-word-list/tamillexicon_headwords.txt`
- **Size:** 107,448 unique headwords (117,803 lines with duplicates)
- **Coverage:** Comprehensive classical Tamil headwords from University of Madras Tamil Lexicon
- **Limitations:** Headwords only — no inflected forms. Contains ~12K verb entries with hyphens (e.g., "அஃகு-தல்"), ~877 entries with spaces, some entries with brackets/commas
- **Cleaning needed:** Remove hyphens, filter entries with spaces/special chars, deduplicate

### 2. Wiktionary Data (kaikki.org JSONL)
- **URL:** https://kaikki.org/dictionary/Tamil/
- **Size:** ~75MB JSONL, ~10,582 headwords with full declension/conjugation paradigms
- **Coverage:** Modern words, inflected forms with grammatical tags
- **Limitations:** Only ~10K headwords (much smaller than the Lexicon), but includes inflected forms

### 3. Vuizur Wiktionary TSV
- **URL:** https://github.com/Vuizur/Wiktionary-Dictionaries
- **Size:** ~3.3MB TSV, 5,617 entries, ~76K unique Tamil word forms
- **Format:** Tab-separated, pipe-delimited forms in column 1
- **Limitations:** Subset of kaikki.org data in simpler format

## Morphological Tools Research

### ThamizhiMorph (Best option for generation)
- **Repo:** https://github.com/sarves/thamizhi-morph (also https://github.com/nlpcuom/ThamizhiMorph)
- **Paper:** https://link.springer.com/article/10.1007/s10590-021-09261-5
- **License:** Apache-2.0
- **How:** Finite-State Transducer (FST) built with [Foma](https://fomafst.github.io/). Runs both directions — analysis (surface → lemma+tags) and generation (lemma+tags → surface).
- **Coverage:**
  - 80,000 noun lemmas across 38 paradigm classes, ~220 forms each → **~10M noun forms**
  - 18 verb classes, ~140-260 forms per verb → **~15M verb forms**
  - Also handles adjectives, adverbs, conjunctions, postpositions, numbers
- **Pre-generated data:** 1M+ generated verb forms already available at `Generated-Verbs/` in the repo
- **Web demo:** http://nlp-tools.uom.lk/thamizhi-morph/
- **Dependencies:** Requires `foma` (C library) installed. Python integration via `stanza`.

```bash
# Analysis example:
echo "வீட்டில்" | flookup tamil-nouns.fst
# → வீடு+noun+loc

# Generation example:
echo "ஓடு+verb+past+1sg" | flookup -i tamil-verbs.fst
# → ஓடினேன்
```

### Open-Tamil
- **Repo:** https://github.com/Ezhil-Language-Foundation/open-tamil
- **Relevance:** Primarily a text processing toolkit, not a morphological generator
- **Useful parts:**
  - `solthiruthi/morphology.py` — suffix stripping classes (case, plural, tense, negation)
  - `solthiruthi/data/tamilvu_dictionary_words.txt` — dictionary headwords
  - Trie-based spell checker
- **Limitations:** Stemmer (reverse direction from what we need), described as "nascent and not production-ready"

### Apertium Tamil
- **Repo:** https://github.com/apertium/apertium-tam-eng
- **How:** `lttoolbox` finite-state toolkit, XML dictionary format
- **Limitations:** Less comprehensive than ThamizhiMorph, designed for MT not exhaustive generation

### Hunspell Tamil (ta_IN)
- **How:** `.dic` (stems) + `.aff` (affix rules) files, supports twofold affix stripping
- **JS option:** [nspell](https://github.com/wooorm/nspell) for client-side Hunspell
- **Limitations:** Tamil Hunspell dictionaries tend to be less comprehensive

## Recommended Strategy: Pre-generated Word Set

### Why pre-generation?
For a Scrabble game, we need O(1) lookup speed. Runtime morphological analysis adds latency and complexity. Pre-generating all valid forms and storing them as a Set gives instant validation.

### Size considerations
- Full generation (25M+ forms) at ~30 bytes/word = ~750MB → too large for client-side
- **Curated approach:** Generate forms for common roots (5K-10K lemmas) → 1-3M forms → 30-90MB raw
- **Compression options:**
  - Bloom filter: ~10 bits per entry, 5M words ≈ 6MB (probabilistic, ~1% false positives, zero false negatives)
  - Sorted array with binary search: exact, but larger
  - Gzipped text file: browser can decompress natively via `Accept-Encoding`

### Phased approach

#### Phase 1: Static dictionary (quick win) ✅ COMPLETE
Build a combined word list from existing sources:
1. Clean Tamil Lexicon headwords (remove hyphens, filter, deduplicate) → 106K words
2. Download and extract Wiktionary headwords → 5.5K words
3. Download ThamizhiMorph pre-generated verb forms → 1.69M forms
4. Merge, deduplicate, filter to ≤15 Tamil letters
5. Store as `public/tamil_dictionary.txt`, load with binary search on client

**Implemented in:**
- `static-word-list/build_dictionary.py` — builds combined word list
- `public/tamil_dictionary.txt` — dictionary served to browser
- `src/utils/dictionary.js` — loads dictionary, binary search lookup, server validation cache
- `src/components/ActionMenu.js` — validation in `submitWord()`, invalid word toasts
- `src/App.js` — triggers dictionary load on startup

#### Phase 2: Morphological expansion ✅ COMPLETE
Used ThamizhiMorph FST models to generate noun inflections for all Tamil Lexicon headwords:
1. `static-word-list/generate_fst_forms.py` reads canonical models from `build/fst-models/` (built from vendored upstream)
2. Feeds 116K headwords through `flookup noun.fst` → identifies 3.5K recognized noun lemmas
3. Generates all case/number inflections via `flookup -i` with 16 morphological tags
4. Also processes adj, adv, part, pronoun FSTs
5. Total: large generated surface-form expansion (count depends on current FST build and sources)
6. `build_dictionary.py` merges them as Step 4 → final dictionary size is build-dependent

Key finding: `noun.fst` uses tags like `+noun+acc`, `+noun+pl+nom`.

#### Phase 3: Server-side FST validation ✅ COMPLETE
Server-side fallback for words not in the static dictionary, using Node.js (no Python needed):
1. `server/download-fsts.js` is a compatibility wrapper that runs vendored FST build (`fst/build/build_fsts.py`)
2. `server/index.js` now loads 11 core long-lived `flookup` child processes by default
3. Client sends `validateWords` request via WebSocket with `requestId`
4. Server validates against all FSTs in parallel, unicasts result back
5. Client caches results in session-level Map — same word never re-queried
6. Strict fallback supported: `STRICT_SERVER_VALIDATION=true` rejects unknown words when server-side validation is unavailable

**Request-response pattern** (new for this codebase): `sendRequest()` in WebSocketContext returns a Promise, matched by `requestId`. All other messages remain fire-and-forget broadcasts.
**UX note:** dictionary preload now starts at app startup, and Play is disabled until dictionary load completes.

#### Phase 4: Bloom filter optimization (deferred)
Not needed — the current generated dictionary loads fine as a sorted array with binary search.
The 134MB raw file compresses well via gzip (dev server handles this automatically).

#### Phase 5: Vendored upstream + patch/regression framework ✅ COMPLETE
To prevent upstream drift and silent morphology regressions, FSTs are now managed via a pinned submodule and deterministic local build:
1. Upstream is vendored as `vendor/thamizhi-morph` (git submodule pinned to a commit)
2. Local patches are applied from `fst/patches/` during build
3. `fst/build/build_fsts.py` extracts source zips, applies patches, compiles via `foma`, writes canonical outputs to `build/fst-models/`, and syncs outputs to:
   - `static-word-list/fst-models/`
   - `server/fst-models/`
4. Build metadata is recorded in `fst/build/manifest.json` (submodule commit, patch hashes, output checksums)
5. Regression tests in `fst/tests/run_fst_regressions.py` gate key morphology and dictionary cases

Initial patch:
- `0001-fix-c11-acc.patch`: Class 11 noun accusative changed from `+noun+acc:^னை` to `+noun+acc:^ை` in `LEXICON C11Inflections`
- This fixes overgeneration like `மாணவன்னை` / `திருமகன்னை` while preserving C10 behavior such as `பொன் -> பொன்னை`

## Current Code Integration Details

### Word extraction from tiles
Already exists in `src/components/TurnHistory.js:15`:
```javascript
const getWordString = (formedWord) => {
    return formedWord.map(t => t.tile.letter).join('');
};
```

### Validation insertion point
In `src/components/ActionMenu.js`, `submitWord()` at line 266:
```javascript
function submitWord() {
    if (!isMyTurn) return;

    const result = validateWordBoardAndComputeNewWords(unplayedTilesWithPositions, playedTilesWithPositions);
    if (result.valid) {
        // >>> INSERT DICTIONARY VALIDATION HERE <<<
        // Extract word strings from formedWords
        // Check each against dictionary
        // If any invalid, show feedback and return

        dispatch(deactivateAllUnplayedTilesOnBoard());
        dispatch(playWord());
        // ... rest of submission
    }
}
```

### Game mechanic
**Block submission** — player cannot submit if any formed word is not in the dictionary. Show which words are invalid so they can fix placement.

## Key Resources

| Resource | URL |
|----------|-----|
| ThamizhiMorph (main) | https://github.com/sarves/thamizhi-morph |
| ThamizhiMorph (NLP@UoM) | https://github.com/nlpcuom/ThamizhiMorph |
| ThamizhiMorph web demo | http://nlp-tools.uom.lk/thamizhi-morph/ |
| ThamizhiMorph paper | https://link.springer.com/article/10.1007/s10590-021-09261-5 |
| ThamizhiLIP (Python wrapper) | https://sarves.github.io/thamizhilip/ |
| Foma FST toolkit | https://fomafst.github.io/ |
| Open-Tamil | https://github.com/Ezhil-Language-Foundation/open-tamil |
| Open-Tamil morphology.py | https://github.com/Ezhil-Language-Foundation/open-tamil/blob/main/solthiruthi/morphology.py |
| Kaikki.org Tamil JSONL | https://kaikki.org/dictionary/Tamil/ |
| Vuizur Wiktionary TSV | https://github.com/Vuizur/Wiktionary-Dictionaries |
| Tamil Lexicon (DSAL) | https://dsal.uchicago.edu/dictionaries/tamil-lex/ |
