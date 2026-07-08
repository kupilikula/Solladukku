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

Current patch stack also includes source-backed noun/verb coverage and irregular existential verb coverage:
- `0007-expand-source-backed-noun-coverage.patch`: adds source-backed noun lemmas such as `இந்தியா`, `செயற்கை`, `தொகை`, `நிலுவை`, and `நுண்ணறிவு` to appropriate noun classes.
- `0008-expand-source-backed-verb-coverage.patch`: adds `உருவாக்கு` and a modern C5 past-neuter variant used by forms such as `ஓடியது`.
- `0009-add-irregular-existential-verb.patch`: adds irregular existential `உள்` forms such as `உள்ளது`, `உள்ளன`, `உள்ளார்`, `உள்ளார்கள்`, and preserves both existential and eating-verb analyses for ambiguous `உண்டு`.
- `0010-add-source-backed-noun-tranche.patch`: adds 1,522 high-confidence Tamil Lexicon / Tamil Wiktionary / Vuizur noun candidates to noun classes inferred from the patched noun lexicon.
- `0011-add-source-backed-c5-verb-tranche.patch`: adds 26 high-confidence source-backed C5 verb roots such as `உதவு`, `தூங்கு`, `திரும்பு`, `காப்பாற்று`, and `பயன்படு`.
- `0012-add-source-backed-name-tranche.patch`: adds 76 multi-source source-backed name/name+noun candidates using explicit ending-based noun class rules, while deferring Vuizur-only and unsupported foreign-final consonant names.
- `0013-add-foreign-final-name-template.patch`: adds a dedicated borrowed consonant-final name template for 14 reviewed `ஸ்`, `க்`, and `த்` final names such as `பாரிஸ்`, `லடாக்`, and `மத்ரித்`, with a separate `த்` oblique surface stem for forms such as `மத்ரித்துக்கு`.
- `0014-add-source-backed-c5-verb-tranche-2.patch`: adds 45 post-dictionary-build Vuizur-backed C5 verb roots such as `பொறு`, `வெறு`, `உண்டாக்கு`, `பயப்படு`, `மேம்படு`, and `களிகூறு`.
- `0015-add-source-backed-noun-tranche-2.patch`: adds 173 high-confidence Vuizur-backed noun roots such as `இறுதி`, `கிணறு`, `கடன்`, `பயன்`, `இடையூறு`, and `பெரியோன்`, while excluding names, noun/verb homographs, and roots that need template/root-shape fixes.
- `0016-remove-noun-pronoun-rewrites.patch`: removes pronoun sandhi rewrite rules from the noun FST so ordinary noun roots containing strings such as `நம்` remain reachable; pronouns continue to be handled by `pronoun.fst`.
- `0017-add-source-backed-noun-tranche-3.patch`: adds 1,301 reviewed source-backed noun roots. Reviewed lexical decisions include `கற்றொழிலோர்` (stone-masons/architects), `பிறந்தவம்` (birth/nativity), `பிறந்தவழிக்கூறல்` (a kind of metonymy), and `பறக்கும்தட்டு` (UFO).
- `0018-add-short-honorific-verb-forms.patch`: adds short `ஆர்` honorific finite verb forms, including coverage for forms such as `கற்றார்` and `சேர்ந்தார்`.
- `0019-add-participial-person-nominals.patch`: adds productive past adjectival participle + `ஓர்` person nominal forms, including `அடைந்தோர்`.
- `0020-add-lexicon-adverb-illaakkaattil.patch`: adds lexical adverb `இல்லாக்காட்டில்` (“if not; otherwise”), rather than treating it as a noun root.
- `0021-add-reviewed-peen-noun.patch`: adds `பேன்` as a reviewed non-human `ன்`-final noun in `C4SgRoot`, matching `மான்` and `தேன்`, not the human/masculine `C11` pattern.
- `0022-add-peethu-verb-coverage.patch`: covers lexical `பேத்தல்` by adding productive stem `பேத்து` to the C5 verb class, the same paradigm used for `நடத்தல்`, through regular FST generation instead of supplemental surface forms.
- `0023-add-source-backed-c5-primary-verb-stems.patch`: adds a 4,388-entry C5 primary-stem tranche derived from fresh gap triage of lexical `தல்` / `த்தல்` verb lemmas backed by both Tamil Lexicon and Tamil Wiktionary titles.
- `0024-add-source-backed-c5-primary-verb-stems-2.patch`: adds a smaller 262-entry post-`0023` C5 primary-stem tranche from the remaining tier-1 source-backed verb gaps.
- `0025-add-noun-additive-um.patch`: adds productive plural nominative additive/enclitic `உம்` noun forms such as `பெண்களும்`, `ஆண்களும்`, `மரங்களும்`, and `மாணவர்களும்`.
- `0026-add-common-function-particles.patch` and `0027-add-common-adverb-een.patch`: add FST-backed analyses for common function words `என`, `மட்டும்`, `இல்லை`, and `ஏன்`.
- `0028-add-deictic-adverb-forms.patch` and `0029-add-deictic-adjective-forms.patch`: add semantically tagged deictic adverb/adjective analyses for forms such as `இப்பொழுது`, `எப்பொழுது`, `இந்நிலையில்`, and `இவ்வகை`, while avoiding redundant generic `+adv` analyses for the time adverbs.
- `0030-add-corpus-backed-common-nouns.patch` and `0031-add-corpus-backed-common-adverbs.patch`: add a small high-frequency corpus-backed coverage tranche from the tokenizer audit, covering common nouns such as `தேர்தல்`, `பாலம்`, `நடவடிக்கை`, and adverbial forms such as `சுமார்`, `அதனால்`.
- `0032-add-pronoun-quantifier-function-coverage.patch`: adds source-built particle/function FST coverage for pronouns, quantifiers, deictic degree/distributive forms, and modal/existential forms such as `தங்கள்`, `ஒருவர்`, `அனைவரும்`, `எல்லா`, `என்ன`, `எத்தனை`, `வேண்டாம்`, and `உண்டா`.
- `0033-add-selective-loan-nouns.patch` and `0034-add-selective-abbreviation-particles.patch`: add selective loanword/abbreviation coverage for forms such as `கலெக்டர்`, `குக்கர்`, `வைரஸ்`, `பி`, `ஜி`, `டி`, and `எஸ்`, without opening broad one-letter-word acceptance.
- `0035-add-corpus-backed-adjectival-stems.patch`, `0036-add-corpus-backed-adverbial-stems.patch`, and `0037-add-complementizer-case-forms.patch`: add corpus-backed adjective/adverb and complementizer coverage for forms such as `தமிழக`, `ஐக்கிய`, `மாவட்ட`, `தேசிய`, `கடுமையாக`, `வலுவின்றி`, `என்பதை`, and `எனக்`.
- `0038-add-modern-verb-derived-forms.patch` and `0039-add-c11-loan-verb-stems.patch`: extend productive verb FST coverage for `பேசிய`, `வருகின்ற`, `என்றார்`, `ஆவார்`, and `விமர்சித்து`.
- `0040-add-calendar-place-loan-nouns.patch`: adds reviewed calendar/place/common-loan noun coverage such as `டீ`, `மார்ச்`, `ஆகஸ்ட்`, `பிரிட்டன்`, `பெங்களூரு`, `ஹைதராபாத்`, `டிக்கெட்`, `பைக்`, and `மொபைல்`, while keeping `டி` abbreviation-only.
- `0041-complete-modern-verb-paradigms.patch`: completes high-impact modern verb coverage found by the fresh tokenizer audit, including `வந்தார்`, `வந்தனர்`, `வருகிறார்`, `வருகின்றன`, `வருவார்`, `உள்ளனர்`, and productive C5 analyses for `பணியாற்றினார்` and `பயன்படுத்தினார்`.
- `0042-add-comparative-kkum-particle.patch`: adds standalone comparative/additive particle analysis for `க்கும்`, useful in numeric comparisons such as `15 க்கும் குறைவாக`.
- `0043-add-audit-backed-passive-verb-stems.patch`: adds `பயன்படுத்தப்படு` to the existing passive `CPadu61Vinf` class so forms such as `பயன்படுத்தப்படுகிறது` analyze through the runtime FST.
- `0044-add-audit-backed-common-noun-coverage.patch`: adds a small reviewed corpus-audit noun lexicon for high-frequency common nouns such as `ஓட்டம்`, `விற்பனை`, `குறைபாடு`, and `இயக்குநர்`.
- `0045-add-audit-backed-adjective-forms.patch`: adds reviewed attributive adjective forms found in the tokenizer audit, including `தேசியக்`, `நீர்வாழ்`, and `துடுப்பாட்ட`.
- `0046-add-c4-u-final-future-forms.patch`: adds a narrow C4 helper lexicon for `உ`-final future/adjectival forms such as `விழும்` and `எழும்`, without replacing the existing C4 past/present paradigm.
- `0047-add-noun-translative-and-singular-additive.patch`: adds noun singular additive `-உம்` coverage and translative/adverbial `-ஆக` coverage for class patterns that can be generated without malformed surfaces. Covered audit examples include `எண்ணிக்கையும்`, `மரமும்`, `காரணமாக`, and `இயக்குநராக`; `உ`-final translatives such as `காடாக` remain a separate rewrite-rule task.

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
