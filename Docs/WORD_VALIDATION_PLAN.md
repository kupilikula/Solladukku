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
5. Store compact headword lookup as `public/tamil_dictionary.txt`, load with binary search on client, and rely on server FST fallback for generated inflections

**Implemented in:**
- `static-word-list/build_dictionary.py` — builds combined word list
- `public/tamil_dictionary.txt` — compact headword lookup dictionary served to browser
- `static-word-list/full_tamil_dictionary.txt` — comprehensive generated surface dictionary for tests/audits
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
- `0047-add-noun-translative-and-singular-additive.patch`: adds noun singular additive `-உம்` coverage and translative/adverbial `-ஆக` coverage for class patterns that can be generated without malformed surfaces. Covered audit examples include `எண்ணிக்கையும்`, `மரமும்`, `காரணமாக`, and `இயக்குநராக`.
- `0048-add-noun-oblique-translative-coverage.patch`: adds rule-backed translatives for final short-`ு` noun classes using the existing C6/C7/C8 class markers (`காடு -> காடாக`, `குறைபாடு -> குறைபாடாக`, `ஆறு -> ஆறாக`) and adds a C10 alternate-stem continuation for `பொன் -> பொன்னும்` / `பொன்னாக` without changing the global `மாணவன்` rewrite behavior.

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

### `0049-add-corpus-backed-modern-verb-coverage.patch`

Files: `fst/patches/0049-add-corpus-backed-modern-verb-coverage.patch`, `fst/patches/0050-add-c4-modern-human-plural-verb-coverage.patch`

Adds focused runtime verb patches for high-signal verb gaps from the tokenizer corpus audit. The patch set adds source-backed roots such as `செயல்படு` and `உயிரிழ`, modern human-plural surface variants for C4 past and passive `படு` forms, and small reusable continuations for `செயல்பட்டு` and finite-perfect forms for forms such as `ஏற்பட்டுள்ளது`, `வந்துள்ளது`, and `தெரிவித்துள்ளார்`. These remain FST-generated analyses with explicit tags, not supplemental tokenizer-only surfaces.
### `0051`-`0053` corpus-backed noun and verb gap patches

Files: `fst/patches/0051-add-corpus-backed-common-noun-gaps.patch`, `fst/patches/0052-add-c4-modern-nonfinite-verb-forms.patch`, `fst/patches/0053-add-c2-koll-modern-infinitive.patch`

Adds a small follow-up tranche from the post-`0050` tokenizer audit. The noun patch classifies common dictionary-backed lemmas such as `வசனம்`, `உள்ளாட்சி`, `ஊராட்சி`, `கிராமப்புறம்`, `பிரதானம்`, `இறைத்தூதர்`, and `ஒருங்கிணைப்பாளர்`, plus a narrow `நபி -> நபிமார்கள்` honorific plural continuation. The verb patches add modern non-finite/participial alternants for `தெரிய`, `நடிக்க`, `கொள்ள`, and `சொன்ன` using explicit FST continuations rather than tokenizer-only supplemental forms.

### `0054`-`0057` corpus-backed noun and function gap patches

Files: `fst/patches/0054-add-corpus-backed-noun-gap-tranche.patch`, `fst/patches/0055-add-focused-adverb-form.patch`, `fst/patches/0056-add-indefinite-quantifier-particle.patch`, `fst/patches/0057-add-remaining-corpus-noun-roots.patch`

Adds another focused tranche from the tokenizer corpus audit. The noun patches classify dictionary-backed common/place roots into existing noun classes, including `பரங்கிப்பேட்டை`, `சுல்தான்`, `ராமநாதபுரம்`, `உப்பள`, `திருப்புல்லாணி`, `இங்கிலாந்து`, `நகர்`, `சின்னம்`, `கெடிமேடு`, `எடை`, `தாக்குதல்`, `நிறுவனர்`, `தாக்கல்`, `வழங்கல்`, and `ஜல்லிக்கட்டு`. The function patches add explicit FST tags for focused adverb `அதனால்தான்` and indefinite additive quantifier `ஏதேனும்`, preserving semantic tags instead of treating them as unknown surfaces.

### `0058`-`0059` tokenizer-triaged common noun patches

Files: `fst/patches/0058-add-triaged-common-noun-coverage.patch`, `fst/patches/0059-add-c15-irkku-dative-variant.patch`

Adds a curated common-noun tranche from the tokenizer coverage triage workflow, intentionally excluding pronoun/quantifier/adverb forms and name/title-policy rows from the generic noun import. Representative FST-backed forms include `உள்ளடக்கங்களை`, `ஓலை`, `பத்திரிகைகளும்`, `புழக்கத்தில்`, `ஆசிரமத்தில்`, `நீர்ப்பறவைகளில்`, `நடைமுறைக்கு`, `நெறிமுறைகளை`, `வழித்தடங்களும்`, and `விமர்சனங்களும்`. The follow-up rule patch adds the productive C15 formal dative `...த்திற்கு` variant, covering forms such as `சந்தேகத்திற்கு` and `மட்டத்திற்கு` through the noun class rather than surface-specific entries.

### `0060-add-modern-verbal-nominal-forms.patch`

File: `fst/patches/0060-add-modern-verbal-nominal-forms.patch`

Adds a narrow modern verbal-noun continuation for reviewed tokenizer audit verb gaps whose bases are already recognized by the runtime FST. Covered examples include `செயல்படுவது`, `தட்டுவது`, `மாற்றுவது`, `வாங்குவது`, and additive `வழிபடுவதும்`. These forms are generated from base stems through an explicit `verbalnoun` tag rather than tokenizer-side supplemental surfaces. Rows whose bases still lack root/class coverage, such as `தெரிந்துகொள்வது` and `எளிதாக்குவதும்`, remain deferred to the root/class coverage queue.

### `0061-add-modern-present-finite-coverage.patch`

File: `fst/patches/0061-add-modern-present-finite-coverage.patch`

Adds focused modern present-finite coverage for reviewed tokenizer audit verb gaps. The patch adds short honorific present forms for C3/C8 roots, covering `செல்கிறார்` and `என்கிறார்`; adds a C5 human-plural `...கின்றனர்` continuation, covering `கூறுகின்றனர்`; and classifies source-backed `முற்படுதல்` as C5 productive stem `முற்படு`, covering `முற்படுகின்றனர்`. Deferred forms such as `தெரிந்துகொள்வது` and `எளிதாக்குவதும்` remain root/class acquisition gaps rather than verbal-noun continuation gaps.

### `0062-add-modern-passive-perfect-neuter-coverage.patch`

File: `fst/patches/0062-add-modern-passive-perfect-neuter-coverage.patch`

Adds a narrow passive-perfect neuter continuation for reviewed tokenizer audit verb gaps whose bases are already recognized by the runtime FST. Covered examples include `உயர்த்தப்பட்டுள்ளது`, `தெரிவிக்கப்பட்டுள்ளது`, `தொகுக்கப்பட்டுள்ளது`, and `பாதிக்கப்பட்டுள்ளது`, all generated with explicit `passive+perfect` verb tags. Root/class gaps such as `இசையமைத்துள்ளார்` and `அறிவிக்கப்பட்டுள்ளது` remain deferred until their lemmas can be classified systematically.

### `0063`-`0064` reviewed C11 verb roots and modern hooks

Files: `fst/patches/0063-add-reviewed-c11-verb-root-coverage.patch`, `fst/patches/0064-add-reviewed-modern-perfect-hooks.patch`

Adds a systematic C11 verb-root tranche for 49 Tamil Lexicon `*-வி-த்தல்` lemmas that were not recognized by the runtime FST, plus the reviewed corpus-backed compound root `இசையமை`. Representative generated analyses include `அறிவிக்கின்றன`, `அறிவித்தோம்`, `அறிவித்தது`, `விடுவித்தது`, and `தெளிவிக்க`. The modern-hook patch adds focused perfect/passive-perfect entries for audited forms `இசையமைத்துள்ளார்` and `அறிவிக்கப்பட்டுள்ளது`. Passive verbal-nominal negative forms such as `அறிவிக்கப்படுவதில்லை` remain deferred to the broader passive-rule lane.
### `0065`-`0070` class-level modern verb and function coverage

Files: `fst/patches/0065-add-class-level-modern-perfect-and-verbal-nouns.patch`, `fst/patches/0066-add-passive-verbal-noun-negative-rule.patch`, `fst/patches/0067-add-complementizer-and-quantifier-family-coverage.patch`, `fst/patches/0068-add-focused-causal-adverb-family.patch`, `fst/patches/0069-add-reviewed-modern-bare-infinitives.patch`, `fst/patches/0070-add-c11-passive-family-coverage.patch`

Converts several previously narrow tokenizer-audit fixes into broader FST rule/class coverage. The verb rules add C11 modern perfect and verbal-noun continuations, C3/C5 verbal-noun continuations, passive verbal-noun negative continuations for `CPadu61Vinf`, reviewed C4 bare-infinitive alternants, and generated C11 passive stems/perfect hooks. Representative covered forms include `அமைத்துள்ளார்`, `சமைத்துள்ளது`, `அமைப்பது`, `கூறுவது`, `செல்வது`, `எழுதுவது`, `அறிவிக்கப்படுவதில்லை`, `வழங்கப்படுவதில்லை`, `அனுமதிக்கப்பட்டுள்ளது`, `அழைக்கப்பட்டுள்ளது`, `புரிய`, `அறிய`, and `விரிய`.

The function-word patches keep closed-class items semantically explicit: complementizer case/additive/sandhi forms such as `என்பதற்கு`, `என்பதில்`, `என்பதால்`, `என்பதன்`, `என்பதும்`, `எனச்`, and `எனத்`; indefinite quantifier `ஏதாவது`; and deictic focused causal adverbs `இதனால்தான்`, `அதனால்தான்`, and `எதனால்தான்`. The older plain `அதனால்தான்+foc+adv` reading is intentionally replaced by the richer `+dem+dist+foc+adv` analysis.
### `0072-add-nati-c4-root.patch`

File: `fst/patches/0072-add-nati-c4-root.patch`

Fixes the one concrete lemma-dictionary audit row in `explicit_lexc_but_not_runtime_analyzed`: `நடி`. Earlier patches added the derived modern infinitive hook `நடி:நடிக்க ModernBareInf`, so `நடிக்க` analyzed but bare root `நடி` still returned `+?`. This patch adds the real C4 root assignment `நடி C4Vinf;`, so both `நடி` and `நடிக்க` are runtime-analyzable.


### `0073-add-systematic-noun-root-candidates.patch`

File: `fst/patches/0073-add-systematic-noun-root-candidates.patch`

Stages a systematic noun-root tranche from the lemma-dictionary/FST coverage audit. The patch adds source-backed roots for recurring consonant-final noun classes rather than one-off surfaces: C14 retained-`ள்` nouns such as `அக்காள்`, `கடவுள்`, `இயற்கைப்பொருள்`, `மருமகள்`, `கருதுகோள்`, `பிறன்பொருளாள்`, and `வேலையாள்`; and C4 `ழ்` nouns such as `சீழ்`, `பாழ்`, `மிதழ்`, and `பனிக்கூழ்`. Loan/foreign pulli-final nouns such as `ஜிஹாத்`, `தலாக்`, `ரோஜ்`, and `ஹாஜ்` remain held for a separate loanword policy pass.


### `0074-add-systematic-c2-kkai-noun-roots.patch`

File: `fst/patches/0074-add-systematic-c2-kkai-noun-roots.patch`

Adds a stricter multi-source C2 noun-root tranche from the unlabeled-predicted-noun audit bucket. The selection requires Tamil Lexicon plus Tamil Wiktionary support, high noun-model confidence, and high class-model confidence for the productive `...க்கை` family. Representative roots include `அறிக்கை`, `அவநம்பிக்கை`, `உடன்படிக்கை`, `காணிக்கை`, `கேளிக்கை`, `நல்வாழ்க்கை`, and `சொற்சேர்க்கை`. This is a systematic class expansion, not a tokenizer-only supplemental surface list.


### `0075`-`0076` systematic compound-head noun tranches

Files: `fst/patches/0075-add-systematic-c2-compound-head-nouns.patch`, `fst/patches/0076-add-systematic-c15-compound-head-nouns.patch`

Adds multi-source unlabeled noun candidates from the lemma-dictionary/FST audit only when the final head is a productive noun family. `0075` covers C2 `ஐ`-final compound heads such as `நிலை`, `மாலை`, `படை`, `சாலை`, `பலகை`, `கங்கை`, `வேலை`, `மலை`, `தலை`, `கடை`, `ரேகை`, `சிலை`, `தீட்சை`, and `பத்திரிகை`. `0076` covers C15 `ம்`-final compound heads such as `காலம்`, `தானம்`, `காரம்`, `சாரம்`, `துவம்`, `வாதம்`, `முகம்`, `மரம்`, `லோகம்`, `யோகம்`, `ஞானம்`, and `கணிதம்`. This intentionally avoids importing the entire unlabeled `ஐ`/`ம்` bucket and keeps potentially inflected-looking surfaces for later review.


### `0077`-`0078` follow-up high-confidence noun tranches

Files: `fst/patches/0077-add-high-confidence-c15-m-final-nouns.patch`, `fst/patches/0078-add-systematic-c2-head-family-nouns-2.patch`

Adds two more multi-source noun tranches from the refreshed source/FST audit. `0077` adds a small high-confidence C15 `ம்`-final set after excluding Vuizur-only rows. `0078` adds another C2 head-family set for productive heads such as `சீலை`, `முல்லை`, `தொகை`, `கட்டை`, `பட்டை`, `கொட்டை`, `கீரை`, `கரை`, `துறை`, `பறை`, `பச்சை`, `திணை`, `தொடை`, `குடை`, and `தேவதை`. These patches continue the policy of adding recurrent noun classes while avoiding broad imports of all unlabeled `ஐ`/`ம்` finals.


### `0079-add-systematic-c2-head-family-nouns-3.patch`

File: `fst/patches/0079-add-systematic-c2-head-family-nouns-3.patch`

Adds another multi-source C2 head-family tranche from the refreshed high-confidence noun bucket. Productive heads include `சேலை`, `சூலை`, `சோலை`, `லிகை`, `ரிகை`, `திரை`, `வித்தை`, `கோவை`, `வினை`, `முறை`, `பூசை`, `வேளை`, `கணை`, `துணை`, `பிழை`, and `வேதனை`. This continues the explicit-head-family policy rather than importing every remaining `ஐ`-final candidate.


### `0080-add-systematic-c15-nominal-head-nouns.patch`

File: `fst/patches/0080-add-systematic-c15-nominal-head-nouns.patch`

Adds a large but systematic C15 nominal-head noun tranche: 5,430 multi-source roots ending in productive `ம்` families such as `...க்கம்`, `...ட்டம்`, `...த்தம்`, `...ந்தம்`, `...ங்கம்`, `...ப்பம்`, `...ச்சம்`, `...ற்றம்`, `...ம்பம்`, `...ண்டம்`, and related `...னம்` / `...ணம்` / `...ியம்` heads. This continues the policy of importing recurring noun classes rather than individual tokenizer-demo gaps.


### `0081-add-systematic-c11-tier1-verb-roots.patch`

File: `fst/patches/0081-add-systematic-c11-tier1-verb-roots.patch`

Starts the verb coverage pass with a conservative tier-1 C11 tranche: Tamil Lexicon + Tamil Wiktionary `...தல்` / `...த்தல்` citation lemmas whose derived productive stems are high-confidence C11 `...ி` roots. The patch adds 904 new roots after duplicate removal and defers light-verb compounds and manual-review rows.


### `0082`-`0083` systematic C5 light-verb compounds

Files: `fst/patches/0082-add-systematic-c5-light-verb-compounds.patch`, `fst/patches/0083-add-systematic-c5-light-verb-compounds-c-rest.patch`

Adds 352 multi-source C5 light-verb compound roots from reviewed `...போடுதல்`, `...விடுதல்`, `...பண்ணுதல்`, `...ப்பண்ணுதல்`, and `...ப்படுத்தல்` citation lemmas. This is intentionally limited to Tamil Lexicon + Tamil Wiktionary rows; Tamil-Lexicon-only light-verb rows remain a later review tranche.


### `0084-add-c8-short-honorific-forms.patch`

File: `fst/patches/0084-add-c8-short-honorific-forms.patch`

Completes the already-classified C8 `என்` paradigm by adding missing short `3sghe=ஆர்` continuations for `என்கிறார்`, `என்கின்றார்`, and `என்பார்`. This is a class-rule fix, not a surface-word addition.


### `0085`-`0088` tier-2 and Lexicon light-verb roots

Files: `fst/patches/0085-add-systematic-c11-tier2-verb-roots.patch`, `fst/patches/0086-add-source-backed-c5-verb-roots-lexicon-light.patch`, `fst/patches/0087-add-source-backed-c5-verb-roots-lexicon-light-c-rest.patch`, `fst/patches/0088-add-systematic-c12-tier2-verb-roots.patch`

Batches the next verb coverage step before rebuilding: 18 C11 tier-2 multi-source roots, 21 C12 tier-2 multi-source roots, and 227 C5 roots from the remaining Tamil-Lexicon light-verb compound lane plus `பிசாசாடு`. The C5 patches deliberately use separate shared and `verb-c-rest` diffs so the roots are placed inside `LEXICON ClassFive`.


### `0089`-`0093` remaining verbs and high-confidence C15 noun families

Files: `fst/patches/0089-add-source-backed-c11-remaining-verb-roots.patch`, `fst/patches/0090-add-source-backed-c12-remaining-verb-roots.patch`, `fst/patches/0091-add-source-backed-c5-remaining-verb-roots.patch`, `fst/patches/0092-add-source-backed-c5-remaining-verb-roots-c-rest.patch`, `fst/patches/0093-add-systematic-c15-high-confidence-m-final-nouns.patch`

Batches the next high-yield coverage step: 1,340 C5 roots, 448 C11 roots, 129 C12 roots, and 2,665 C15 noun roots. Verb selection keeps source-backed POS=`verb` citation lemmas while preferring C11/C12 and cleaner C5 stems when multiple stems are possible. Noun selection stays class-based by requiring Tamil Lexicon + Tamil Wiktionary support, high-confidence noun prediction, final `ம்`, and reviewed productive suffix families rather than a blanket final-letter import.


### `0094`-`0096` dual-source noun-family tranche

Files: `fst/patches/0094-add-systematic-c15-dual-source-productive-nouns.patch`, `fst/patches/0095-add-systematic-c2-dual-source-productive-nouns.patch`, `fst/patches/0096-add-systematic-c9-dual-source-retroflex-n-nouns.patch`

Adds a batched noun-family tranche from the `heuristic_classified_not_runtime_analyzed` audit bucket. Selection requires Tamil Lexicon + Tamil Wiktionary support, no explicit source POS hint, noun classifier confidence >= 0.95, and classifier support >= 100. This is not a broad final-letter import: `0094` adds 1,516 C15 roots from reviewed productive suffix families such as `கரம்`, `தகம்`, `வியம்`, `லயம்`, and `ரோகம்`; `0095` adds 412 C2 roots from families such as `தன்மை`, `பார்வை`, `சனை`, `ரணை`, `கட்டளை`, and `பரம்பரை`; and `0096` adds 312 C9 retroflex-`ண்` roots. After rebuild, noun-recognized lemmas rose to 22,611, direct FST-generated forms rose to 2,155,938, heuristic forms remained 1,734,401, and the full generated dictionary rose to 2,258,711. Runtime checks include `அஃகரம்`, `அஃகரத்தை`, `அக்கதை`, `அக்கதையை`, `அகக்கண்`, and `அகக்கண்ணை`.


### `0097`-`0099` follow-up dual-source noun-family tranche

Files: `fst/patches/0097-add-systematic-c15-dual-source-noun-families-2.patch`, `fst/patches/0098-add-systematic-c2-dual-source-noun-families-2.patch`, `fst/patches/0099-add-systematic-c4-dual-source-head-nouns.patch`

Continues the high-confidence dual-source noun-family policy after the `0094`-`0096` audit refresh. Selection again requires Tamil Lexicon + Tamil Wiktionary support, no explicit source POS hint, noun classifier confidence >= 0.95, and classifier support >= 100. `0097` adds 1,016 C15 roots from families such as `சமயம்`, `புரம்`, `தேசம்`, `வேதம்`, `நாதம்`, and `தைலம்`; `0098` adds 911 C2 roots from families such as `ட்டை`, `ண்டை`, `ந்தை`, `பாவை`, `கோட்டை`, `குழந்தை`, and `குத்தகை`; and `0099` adds 1,447 C4 roots from explicit heads such as `கல்`, `கோல்`, `நூல்`, `புல்`, `கடல்`, `குடல்`, `குரல்`, `வாசல்`, and `தொழில்`. After rebuild, noun-recognized lemmas rose to 26,002, direct FST-generated forms rose to 2,226,088, heuristic forms remained 1,734,401, and the full generated dictionary rose to 2,325,470. Runtime checks include `அகச்சமயம்`, `அகச்சமயத்தை`, `அக்கினிவெள்ளை`, `அக்கினிவெள்ளையை`, `அங்கநூல்`, `அங்கநூலை`, `அகவாயில்`, and `அகவாயிலை`.


### `0100`-`0103` additional dual-source noun-family tranche

Files: `fst/patches/0100-add-systematic-c15-dual-source-noun-families-3.patch`, `fst/patches/0101-add-systematic-c2-dual-source-noun-families-3.patch`, `fst/patches/0102-add-systematic-c11-dual-source-human-head-nouns.patch`, `fst/patches/0103-add-systematic-c14-dual-source-retained-l-head-nouns.patch`

Continues the dual-source high-confidence noun-family lane. `0100` adds 805 C15 roots and `0101` adds 850 C2 roots from sampled productive suffix families. `0102` adds 925 C11 roots, restricted to explicit human/person heads such as `காரன்`, `மகன்`, `நாயகன்`, `புத்திரன்`, `செல்வன்`, `சேவகன்`, `முனிவன்`, and `வைத்தியன்`; `0103` adds 369 C14 roots for retained-`ள்` noun heads such as `பொருள்`, `கடவுள்`, `மகள்`, `நாள்`, `கோள்`, `செய்யுள்`, `மஞ்சள்`, and `பெருமாள்`. After rebuild, noun-recognized lemmas rose to 28,954, direct FST-generated forms rose to 2,289,423, heuristic forms remained 1,734,401, and the full generated dictionary rose to 2,385,853. Runtime checks include `அஃபோதம்`, `அஃபோதத்தை`, `அகத்தடிமை`, `அகத்தடிமையை`, `அகசியகாரன்`, `அகசியகாரனை`, `அகக்கடவுள்`, and `அகக்கடவுளை`.


### `0104`-`0108` dual-source high-confidence noun mega-batch

Files: `fst/patches/0104-add-megabatch-c15-dual-source-nouns.patch`, `fst/patches/0105-add-megabatch-c2-dual-source-nouns.patch`, `fst/patches/0106-add-megabatch-c4-dual-source-nouns.patch`, `fst/patches/0107-add-megabatch-c11-dual-source-nouns.patch`, `fst/patches/0108-add-megabatch-c14-dual-source-nouns.patch`

Adds the largest build-amortized noun tranche so far: 11,426 Tamil Lexicon + Tamil Wiktionary, no-POS-hint, high-confidence noun roots. The batch is split by noun class: 3,636 C15 roots, 2,061 C2 roots, 1,271 C4 roots, 4,100 C11 roots, and 358 C14 roots. The proposal intentionally holds back 2,575 risky rows, including short roots, case-like surfaces, finite/particle-like surfaces, plural-looking C14 rows, unclassified pulli-final rows, and `...எனல்` / `...கெனல்` expression rows. After rebuild, noun-recognized lemmas rose to 40,407, direct FST-generated forms rose to 2,527,080, heuristic forms remained 1,734,401, and the full generated dictionary rose to 2,612,059. Runtime checks include `அகடிதகடனாசாமர்த்தியம்`, `அகச்சுவை`, `அகக்காழ்`, `அகடன்`, and `அகத்தடியாள்` plus accusative forms.

This batch introduces valid ambiguity for `எத்தனை`: the FSTs now preserve both `எத்தன்+noun+acc` and `எத்தனை+quant+inter`. Tokenizer ranking handles this outside the FST by preserving both analyses while preferring the common quantifier/interrogative reading as `best_analysis`.

### `0109`-`0112` next dual-source noun mega-batch

Files: `fst/patches/0109-add-high-confidence-c16-r-final-nouns.patch`, `fst/patches/0110-add-next-c2-dual-source-noun-batch.patch`, `fst/patches/0111-add-next-c7-dual-source-noun-batch.patch`, `fst/patches/0112-add-high-confidence-c11-n-final-nouns.patch`

Adds 12,500 more source-backed noun roots from the same build-amortized audit lane. `0109` adds 2,333 C16 `ர்`-final roots, `0110` adds 4,761 C2 roots, `0111` adds 4,808 C7 roots, and `0112` adds 598 C11 `ன்`-final roots. Candidate selection remains class/family based: productive noun endings, high source support where available, no short/case-like rows, no C2 `...மாய்` adverb-like rows, and no C7 `...ன்று` / `...ருந்து` / `...மிருந்து` rows. After rebuild, noun-recognized lemmas rose to 52,957, direct FST-generated forms rose to 2,842,280, heuristic forms remained 1,734,401, and the full generated dictionary rose to 2,914,714. Runtime checks include `அகதிக்ஷேத்திரத்தார்`, `அஃகடி`, `அகக்கூத்து`, and `அஃகான்` plus accusative forms.

### `0113`-`0115` larger source-backed noun batch

Files: `fst/patches/0113-add-next-dual-source-c2-nouns.patch`, `fst/patches/0114-add-next-dual-source-c7-nouns.patch`, `fst/patches/0115-add-source-backed-c15-m-final-nouns.patch`

Adds 20,499 roots in one build cycle. `0113` adds 5,852 remaining dual-source C2 roots while holding short two-letter rows for review. `0114` adds 549 C7 roots only from reviewed productive `உ`-final noun suffix families, holding broad `உ`-final, finite-looking, postposition-looking, and closed-class rows. `0115` adds 14,098 high-confidence C15 `ம்`-final roots from the remaining source-backed noun audit bucket while excluding likely finite/additive `...உம்` and modal/reporting rows. After rebuild, noun-recognized lemmas rose to 73,518, direct FST-generated forms rose to 3,196,084, heuristic forms remained 1,734,401, and the full generated dictionary rose to 3,247,965. Runtime checks include `அகங்கிருதி`, `அகங்கிருதியை`, `அசத்துரு`, `அகக்கமலம்`, and `அகக்கமலத்தை`.

### `0116`-`0119` productive single-source noun-family batch

Files: `fst/patches/0116-add-single-source-c2-productive-nouns.patch`, `fst/patches/0117-add-single-source-c7-productive-nouns.patch`, `fst/patches/0118-add-c11-person-head-nouns.patch`, `fst/patches/0119-add-c16-person-profession-nouns.patch`

Adds 11,489 roots while keeping high-risk classes narrow. `0116` adds 4,878 C2 productive-family roots, `0117` adds 3,929 C7 productive-family roots, `0118` adds 2,177 C11 person/head nouns, and `0119` adds 505 C16 person/profession nouns. The selection holds case-like C2 rows, adverb-like `...ஆய்` rows, finite/postposition-like C7 rows, and finite/honorific-looking C11/C16 rows. After rebuild, noun-recognized lemmas rose to 85,029, direct FST-generated forms rose to 3,471,007, heuristic forms remained 1,734,401, and the full generated dictionary rose to 3,511,379. Runtime checks include `அகக்குறி`, `அகக்குறியை`, `அகக்கடுப்பு`, `அகக்கடுப்பை`, `அகசியக்காரன்`, `அகசியக்காரனை`, `அகக்கோளாளர்`, and `அகக்கோளாளரை`.

### `0120`-`0123` conservative remaining noun-family batch

Files: `fst/patches/0120-add-conservative-c4-noun-families.patch`, `fst/patches/0121-add-conservative-c14-retained-l-nouns.patch`, `fst/patches/0122-add-conservative-c9-retroflex-n-nouns.patch`, `fst/patches/0123-add-conservative-c1-aa-and-puu-nouns.patch`

Adds 1,903 roots from the noisier remaining noun lane. `0120` adds 1,033 C4 `ல்/ழ்` noun-family roots, `0121` adds 218 C14 retained-`ள்` roots, `0122` adds 134 C9 retroflex-`ண்` roots, and `0123` adds 518 C1 `ஆ/ஊ` roots from clear families such as `பூ`, `வெண்பா`, `சம்பா`, `சுறா`, and `விழா`. The selection holds expression-like `...எனல்`, case-like `...இல்`, verbal-looking `...ஆகல்/உகல்`, plural-looking `...கள்`, and name/title/interjection-like `ஆ` rows. After rebuild, noun-recognized lemmas rose to 86,938, direct FST-generated forms rose to 3,515,132, heuristic forms remained 1,734,401, and the full generated dictionary rose to 3,553,595. Runtime checks include `அகக்கால்`, `அகக்காலை`, `அகப்புறப்பொருள்`, `அகப்புறப்பொருளை`, `அக்கரப்புண்`, `அக்கரப்புண்ணை`, `அக்கினிப்பூ`, and `அக்கினிப்பூவை`.

### `0124-add-c5-citation-verbal-nouns.patch`

Adds a productive C5 citation-verbal-noun continuation for source dictionary
lemmas ending in `...தல்`. The rule covers 4,997 current citation gaps through
their existing C5 stems, including light-verb compounds ending in `போடு`,
`விடு`, and `பண்ணு`. Runtime citation analyses retain controlled
secondary-stem expansion so direct recognition does not remove established
passive and light-verb coverage. C11/C12 allomorph rows remain separate review
lanes.

### `0125-add-c11-citation-verbal-nouns.patch`

Adds the canonical strong C11 `root + த்தல்` citation continuation, covering
2,313 audited source lemmas without duplicate roots or surface exceptions.
Representative forms are `அகலித்தல்`, `அகங்கரித்தல்`, `உடுத்தல்`,
`கிழித்தல்`, and `உடாய்த்தல்`. Plain C11 `...தல்` rows and mixed C12 patterns
remain separate review lanes. The generator preserves secondary-stem expansion
for runtime citation analyses; current outputs contain 3,521,055
direct/controlled forms, 1,738,313 heuristic/secondary forms, and 3,552,166
full dictionary entries.

### `0126`-`0129` citation continuation batch

Files: `fst/patches/0126-add-c5-elided-citation-verbal-nouns.patch`,
`fst/patches/0127-add-c4-citation-verbal-nouns.patch`, and
`fst/patches/0129-add-c62-citation-verbal-nouns.patch`

Adds productive C5 elided, C4 plain, and C62 citation continuations for 1,833
audited gaps. C3 remains deferred because its current rewrite changes the
reviewed source citation surface.

### `0130`-`0131` phonological and minor-class citation batch

Files: `fst/patches/0130-add-c12-phonological-citation-verbal-nouns.patch` and
`fst/patches/0131-add-minor-rest-class-citation-verbal-nouns.patch`

Adds phonology-aware C12 and canonical C1/C6 citation rules for 137 additional
gaps. C15/C18 remain deferred because their class rewrites yield different
canonical citation forms. Current outputs contain 3,525,719 generated forms,
1,742,650 heuristic/secondary forms, and 3,554,627 full dictionary entries.

### `0132` residual multi-source explicit nouns

File: `fst/patches/0132-add-residual-multisource-explicit-nouns.patch`

Adds 12 roots with multi-source noun evidence through existing C1/C2/C4/C7/C15
paradigms. The batch deliberately holds participial compounds, known noise,
foreign-final loans without a reviewed class, names, and noun/verb homographs.
Current outputs contain 3,525,956 generated forms, 1,742,650
heuristic/secondary forms, and 3,554,850 full dictionary entries.

### Post-`0132` coverage decision

The refreshed audit leaves 28,592 runtime lemma gaps, but no remaining broad
automatic lane satisfies the conservative import policy. The 1,311 citation
rows mix missing productive stems, unsafe plain-C11 `...தல்` variants, and
noncanonical class spellings. The 1,295 apparent high-confidence noun rows are
short vowel-final forms whose classifier score does not resolve names,
interjections, expressions, or noun class. The 1,857 unlabeled verb predictions
lack source verb POS evidence; 1,803 score below 0.85, and the only three at or
above 0.95 are low-support nominal/adjectival shapes.

The explicit `noun_root_candidate` bucket is now 105. The established strict
proposal produces zero patch-ready roots with either exact noun POS or hybrid
noun readings enabled; the only source-qualified remnants are four held rows
and six foreign-final manual-class cases.

Do not turn these residual buckets into blanket root or citation-rule patches.
Resume coverage expansion only with manual lexical policy, explicit source POS
evidence, or a narrow root/class review that demonstrates canonical generation
without overgeneration.

### `0133`-`0143` completed integrity batches and next audit lanes

The completed integrity batch normalizes all compiled primary lexical sources,
repairs 72 unambiguous `10 -> ா` noun corruptions, restores the C4/C5
`-ஓடு` sociative rule, and adds productive negative `-ஆமை` action nominals
to every compiled verb class. Representative regressions include
`மறுகாலோடு`, `பலரோடு`, `அகரப்பாவை`, `செய்யாமை`, `செல்லாமை`,
`அடையாமை`, `படிக்காமை`, `குணமாக்காமை`, and `நகாமை`.

Current outputs are 3,575,533 generated forms, 1,783,009
heuristic/secondary forms, and 3,604,316 full dictionary entries. The direct
runtime union before heuristic expansion is 2,078,162. Per-model generation
counts are persisted in `static-word-list/fst_generation_audit.json`.

Patches `0141` and `0142` conservatively remove 50 emitted noun/adjective
roots containing unprovable ASCII, legacy-byte, BOM, or format corruption.
Patch `0143` removes one malformed double-hyphen C7 noun root. The tokenizer
now preserves all 154 valid single-hyphen FST expressions as one Tamil span;
unhyphenated aliases require independent source evidence. Exhaustive
the original vocabulary validation reports zero ASCII/control/NFC and
splitter-reachability findings. A stricter Tamil combining-mark audit now
blocks publication on 874 emitted strings, including 91 atomic lemmas and 30
canonical compound bases. Correct these source families and rebuild before
freezing a public release.

The external tokenizer audit further distinguishes source lemmas from FST
lexical strings. Of 78,619 productive compound strings, all 78,570 FST-only
entries now emit canonical bases with typed verbal-participle and
infinitive links. Productive passive `படு` is normalized to
`<VOICE_PASSIVE>`, and bounded variant tokens distinguish colliding typed
chains.

This gate is now complete: the frozen tokenizer vocabulary excludes all 78,570
reviewed FST-only composites and contains 144,896 lexical tokens and 145,574
total tokens. A checksum-pinned 3,782-entry codebook reconstructs exact raw tag
suffixes with at most one bounded non-default variant token. Cleanup patches
`0144`-`0155` remove 975 invalid first-order and 580 transitively invalid
productive expansions. The final compound audit has zero unresolved FST-only
connector or adjectival-participle entries.

The next work should follow these review lanes rather than another broad
classifier import:

1. Continue triaging the 39 remaining source-POS/runtime mismatches. Patch
   `0156` already adds 80 reviewed C2 noun homographs while preserving their
   verb readings. Patches `0157`-`0158` correct C6TTU/C8 realization and add
   49 reviewed C1/C6/C6TTU/C7 noun homographs. Eight reviewed U-final rows
   remained deferred for source evidence. Patch `0161` subsequently adds the
   three source-backed C8 readings; five single-source U-final rows remain held.
   Patches `0160`-`0161` also resolve 54 other direct lexical noun collisions.
   Patches `0162`-`0165` complete the conservative automated lane; it now
   produces zero additional noun candidate.
2. Clean 191 repeated noun assignments, 27,394 repeated productive verb
   subclass rows, five repeated `LEXICON` declarations, and six duplicated
   rule names while proving compiled-language equivalence.
3. Review the remaining 575 `-த்தல்`, 2,448 `-தல்`, and 365 `-மை` gaps by
   root and class. A negative `-ஆமை` surface with a missing base verb is a
   root-coverage problem, not a reason to import it as an ordinary noun.
4. Build a gold ambiguity suite for modern corpus contexts and measure
   analysis recall, invalid-analysis rate, and best-analysis ranking separately.
6. Add phrase-level nominal + `செய்` semantics later; do not force standalone
   action nominals such as `தாக்கல்` and `வழங்கல்` to ordinary `POS_VERB`.

### `0162`-`0172` completion status

The final evidence-backed mismatch batch adds 16 regular noun homographs,
three C4 verb readings, and two explicit C5 citation stems. It also corrects
`நெய்` from the invalid strong C11 paradigm to weak C4 `நெய்த-`. Cleanup
patches remove all 27 stale strong-class compounds, including eight
second-order passive forms, and the regression suite rejects all 33 invalid
simple/compound surfaces.

The post-build tokenizer audit has 39 source-POS/runtime mismatches, zero
conservative noun candidates, zero paradigm failures, and zero unresolved
productive connectors. Further coverage work must use manual lexical/source
evidence or a new narrow systematic rule; the remaining prediction buckets do
not justify another broad import.

### Static dictionary split for Scrabble and tokenizer use

`public/tamil_dictionary.txt` is the compact browser lookup dictionary and should stay headword-oriented so the React payload remains small. Generated inflections are validated through the server FST fallback. `static-word-list/full_tamil_dictionary.txt` is the comprehensive generated surface dictionary for regression tests, audits, and tokenizer provenance. Sandhi-linker surfaces are excluded from both static dictionaries because they are orthographic prose variants, not independent playable words. `static-word-list/lemma_dictionary.txt` is maintained separately as a source headword/lemma inventory for tokenizer use and excludes generated inflections.
## Completed invalid ambiguity cleanup

The shared FST build now rejects the invalid `ஆர்+noun+acc -> ஆற்றை` and
plural `இது` analyses while retaining the corresponding valid readings.
Future regression additions for ambiguous surfaces must assert both required
and forbidden exact analyses, rather than testing surface recognition alone.
## Full-corpus systematic coverage loop

The development coverage loop now pins the latest compatible
`mozhi-ai/tamil-corpus` Parquet snapshot, audits all 8,682 documents, clusters
unknowns by productive morphology, validates the full root/class surface, and
reruns the identical snapshot after batched changes. Patch family `0174`
completed the first confirmed class-wide defect: modern present human-plural
`-கின்றனர்/-க்கின்றனர்` continuations. Remaining passive, noun-inflection,
adjective/adverb, closed-class and classical lanes require the same
family-level review; corpus suffix resemblance alone is not sufficient for a
lexical or FST addition.
Patch `0175` completes missing paradigms for already licensed passive stems.
Unlicensed corpus-derived `...ப்படு` candidates remain deferred until their
base verb, transitivity and lexical evidence are reviewed; they must not be
bulk-generated from suffix shape alone.
Patch family `0176` closes the remaining `-னர்` agreement-tag mismatch and
removes malformed short-present `-கிறனர்` outputs across all verb components.
Future agreement audits should compare realized endings with person/number
tags across the complete upper language, not only selected corpus examples.

Patch family `0185` completes modern short present adjectival participles.
Every continuation block that licensed `-கின்ற/-க்கின்ற` now also licenses
the corresponding `-கிற/-க்கிற` form, unless that short rule already existed
in the same block. The change adds 35 class rules without adding roots and
recovers 55 saved news unknown types (201 occurrences).

Patch family `0186` adds regular positive `-வது/-வதும்` verbal nouns to C1,
C2, C4, C6.1/C6.3, and C6.2. It adds ten class rules without adding roots and
recovers 29 saved news types (84 occurrences). C12, minor strong classes, and
auxiliary subclasses remain separate allomorph-review lanes.

Patch `0187` adds C12 `-வது/-வதும்` inchoative verbal nouns and reviewed typed
verbal nouns for `விடு`, `போ`, `போடு`, `இடு`, and passive `படு` continuations.
Eleven rules are added without new roots; saved-news recovery is 15 types and
17 occurrences beyond `0186`.

Patches `0188`-`0189` close the modern Class 13 `-ஆகு` structural defect and
the typed-passive short honorific present gap. Future passive audits must
require explicit `+verb+complex+passive` tags; a surface or simple lexical verb
ending in `படு` is insufficient. Overt `இரு` perfect/pluperfect and reported
chains remain a semantic-architecture task, not a spelling-driven rule batch.

Patches `0190`-`0191` now cover the reviewed overt-`இரு` passive and C11
perfect families with explicit auxiliary tags. Patch family `0192` removes the
remaining invalid Tamil combining sequences from runtime noun and verb LexC
sources. The release audit is now orthographically clean; future FST changes
must preserve the zero-malformed-emission invariant and the corrected/rejected
regression pairs.

Patch family `0193` removes exact redundant LexC rows while proving compiled
relation equivalence. Patch `0194` repairs duplicate active rule ownership and
the shadowed C12 `-இருக்க-` realization. Patch `0195` closes the three reviewed
exceptional-reading decisions without adding broad paradigms. Remaining work
must focus on evidence-backed category consistency, the 250 cross-model
identical-analysis ownership cases, and source-layout consolidation. The five
repeated `LEXICON` declarations contain distinct blocks and must not be removed
without a before/after compiled-language proof.

The 250 cross-model identical-analysis cases are now fully reviewed and need
no deletion patch. They are verb conjugation-class syncretism, primarily the
zero-suffix second-person imperative; runtime provenance merging is the correct
nonredundant representation. Future builds must run the tokenizer-side overlap
audit and treat any non-verb or unknown overlap shape as release-blocking.

Patch `0196` establishes the closure policy for narrow invariant ending
families: add only source-explicit nouns to the already proven class, record
malformed and closed-class lookalikes as exclusions, and test both sides. Ten
roots were added and seven exclusions pinned. Continue with similarly bounded
families; do not turn broad final-letter prediction buckets into bulk patches.

Patch `0197` closes the 94-row explicit noun-candidate queue with 41 additions
and 53 documented holds. The held stop-final loans must wait for a reviewed
geminating oblique class; assigning them to nonalternating C4 would generate
incorrect case forms. The next high-impact morphology lane is the 1,284
residual verb citation candidates, reviewed by productive stem and class.

Patch `0198` corrects the earlier manual-review C11 promotion using citation
allomorph evidence. The remaining verb citation queue is 1,020 rows, including
238 with an analyzed stem. Complete that continuation/class lane, close the
782 opaque-root decisions, rerun the corpus battle test, and perform a final
release freeze before tokenizer comparison or translation experiments.

Patch `0199` closes the strong-`த்தல்` half of the residual analyzed-stem
classification defect. Only 95 citation rows still have an analyzed stem.
Review those individually by subclass, then close the 776 opaque/noncanonical
rows before the corpus rerun and final release freeze.

Patch family `0200` completes the analyzed-stem lane: 77 citation readings are
added and all 18 remaining collisions are explicit holds. The live citation
queue is now 794, of which 776 are opaque or noncanonical root decisions.
Review that bounded set using source agreement, attested inflection evidence,
and class diagnostics; do not infer bulk verb ownership from the citation
suffix alone. Then rerun the corpus battle test and freeze the FST release.

Patch `0201` removes 199 citations from the live queue through 195 conservative
known-head compound assignments. The remaining 595 rows are structurally
partitioned into 171 joined `செய்` constructions, 165 joined `போ`
constructions, 104 other known-head compounds, 129 opaque/simple unknown heads,
18 reviewed collisions, and eight noncanonical citations. Design a
component-preserving analysis for `செய்` and `போ` before adding those lanes;
do not collapse light-verb or auxiliary semantics into ordinary atomic verbs.

Patch `0202` closes 40 runtime-verified participial `போ` constructions through
the existing `ClassPo5` subclass. The remaining `போ` queue has 119 rows:
nominal/case motion constructions, two infinitival connectors, and unresolved
prefixes. Continue those by structural lane; do not assign auxiliary semantics
to nominal destinations or paths. The joined `செய்` lane still requires the
reviewed light-verb decomposition described in the tokenizer documentation.

Patch `0203` resolves 108 joined `செய்` citations with runtime-analyzed
modifiers and a component-preserving light-verb decomposition. Sixty-two remain:
35 have source-only modifier lemmas and 27 have unresolved modifiers. Review the
source-only set for lexical quality before expansion; do not admit unresolved
surface fragments as vocabulary components. Continue the 119 remaining `போ`
rows by nominal-motion, infinitival, and unresolved-prefix lanes.

Patch `0204` completes that 35-row source-only review: 14 dual-source noun
modifiers are accepted and 21 rows are explicit holds. The joined-`செய்` lane
is now 46 rows, comprising those 21 held source-only modifiers and 25
unresolved modifiers. Do not reopen the held rows without stronger lexical or
inflectional evidence. Continue with the structurally bounded `போ` and other
known-head lanes, then close the 129 opaque/simple and 12 noncanonical rows by
documented decision before the final corpus rerun and release freeze.

Patches `0205`-`0206` close the missing common `நில்` paradigm and the two
reviewed direct `போ` connectors. The new base paradigm exposes
`நின்றுபோதல்` as the sole remaining direct bare-`போ` citation with verified
participial evidence; it is suitable for the next ClassPo5 batch. Keep the 53
nominal/case-motion rows out of the auxiliary class, and retain the 52
unresolved prefixes until their internal morphology is independently proven.
The residual queue is now 434.

Patches `0207`-`0209` close the general case-bearing action-nominal signal gap
for 401 reviewed surfaces and add the final verified participial `போ`
candidate, `நின்றுபோ`. Do not delete competing noun readings in lexicalized
cases; the new derived analyses preserve the verb lemma and derivation through
the established noun surface paradigm. Patch `0209` resolves the former `ஆல்`
hold by moving the long-vowel retained-`ல்` noun from C12 to C4, replacing
`ஆல்லை/ஆற்கள்` with `ஆலை/ஆல்கள்`, and activating its parallel derived
paradigm. The residual citation queue
is now 433: 124 other known-head compounds, 46 joined `செய்` holds/gaps, 105
direct `போ` nominal or unresolved structures, 129 opaque/simple rows, 18
reviewed collisions, and 11 noncanonical citations. Close those lanes by
explicit add/hold decisions and rerun the pinned corpus before release freeze;
do not treat historical or phrase-like dictionary citations as mandatory
productive roots.

The `0210`-`0216` release batch closes this gate. It consolidates/splits all
five duplicate LexC declarations with relation-level proofs, corrects C6 and
C12 ownership errors, adds only fourteen full-paradigm-attested regular roots
plus bare `ஆகு`, and records one terminal decision for every one of the 433
pre-batch citations. Future coverage work must be evidence-triggered from gold
or corpus failures; broad citation-ending imports are no longer an open lane.

Release gate result: zero high/medium unresolved structural issues, zero
unresolved POS mismatches, zero strict-family outliers, and zero paradigm
failures. The remaining 418 citation rows and broad suffix-family gaps are
documented evidence queues, not automatic import work.

Patches `0217`-`0220` complete the reviewed nominal/cardinal/deictic `-ஆன`
lane. Future work must keep the same semantic boundary: dative or plural bases
retain their internal case and number tags, cardinals remain cardinals, and
deictic manner bases remain adverbs. Do not flatten these constructions to
new ordinary noun roots or opaque adjective lemmas.

The remaining 97 corpus-triaged derivational adjective/adverb surfaces are
heterogeneous verbal, clausal, lexicalized, or `-ஆக` structures. Review them
by construction rather than suffix alone. Entity gazetteers, contextual NER,
and multiword company/person/place recognition are tokenizer resources and
must remain excluded from Scrabble dictionary validity.

Patches `0221`-`0225` complete the next systematic release gate. C14 plural
generation is now lexical-subclass controlled instead of globally inferred
from final `ள்`; ordinal errors are repaired; and adjective, passive, and
closed-class additions are bounded by source or runtime evidence. The build
has zero paradigm failures, zero strict-family outliers, and zero unresolved
POS decisions.

Do not resume broad imports from the remaining 27,451 runtime-unrecognized
source lemmas. The dominant ending buckets are heterogeneous historical,
inflected, entity, fragment, and lexical-noise strata. Future shared-FST work
must begin from a reviewed gold failure or a generalized class/rule defect and
must include positive and negative regression forms. Tokenizer-only entity,
contextual NER, evaluation, and translation-model work remains outside the
Scrabble validity language.

Patches `0226`-`0229` complete the corpus-attested verb correction gate. The
batch fixes the generalized C5/C6.1 `-ிடு` past error, reclassifies `நடி`, adds
only roots with diagnostic paradigm evidence, completes the suppletive
`தா/வா` lane, and derives passive-perfect hooks for every newly admitted
passive stem. Positive and displaced-paradigm negative regressions are now
mandatory for this kind of reclassification.

Do not reopen the remaining 27,441 combined-source runtime gaps as a broad
coverage import. Subsequent shared-FST changes require a gold or corpus
failure, a demonstrated family-level rule/class defect, and a bounded positive
and negative regression set. Tokenizer evaluation may continue independently,
but entity gazetteers and contextual named-entity handling remain excluded
from Scrabble validity.

Patches `0230`-`0236` complete the productive-continuation gate. They close
systematic case/clitic/focus/sandhi relations for nouns, pronouns, nonfinite
verbs, modifiers, closed classes, reported complements, and clausal verbal
nouns. The source build and dictionary build pass all validation gates, and
all 9,030 reversible signature patterns have witnesses across 88,663,520 upper
analyses.

Do not treat the remaining 27,433 combined-source runtime gaps or the
tokenizer's 117,386 unique corpus unknowns as an undifferentiated import list.
The residual contains classical language, fragments, OCR/spelling variants,
abbreviations, entities, lexical roots needing subclass evidence, and genuine
productive gaps. Each future shared-FST change must start with a reviewed
failure, expand to its full related family, establish negative boundaries,
and include positive and rejected regression forms. Tokenizer-only entity and
contextual handling must remain outside the Scrabble-valid language.

Patches `0237`-`0242` complete the productive-relation consistency gate.
Future FST batches must compare sibling relation inventories and canonical
lemmas, include contrastive rejected forms, and record every evidence hold.
Positive surface recognition alone is no longer sufficient. The current audit
has 6,007 passing checks, zero defects, 17 reviewed passive exceptions, and
matching 3,010-base ordinary/perfect passive inventories.

The source build, exhaustive dictionary build, 592,549 paradigm probes, and
all 9,434 reversible signature witnesses pass. Remaining source gaps and
tokenizer corpus unknowns continue as evidence queues; they must not be added
to the Scrabble language solely to improve aggregate coverage.

Patches `0243`-`0249` complete the known-head inheritance gate and the modern
suppletive `போ` paradigm. Future classification audits must compare inherited
head paradigms and all productive relation sections, preserve demonstrated
cross-class ambiguity such as C6.1+C11 `படு/விடு`, and include rejected forms
from the displaced class.

The structural review is closed: exact duplicate lexical mappings are zero,
and all current identical cross-model analyses are allowlisted verb-class
syncretism with zero blockers. Future overlaps outside the reviewed morphology
shapes are release-blocking. Do not treat one identical upper-analysis cell as
proof that two complete lexical paradigms are interchangeable. Remaining
runtime source gaps stay evidence queues rather than bulk Scrabble imports.

## Post-0257 release policy

Patches `0250`-`0257` close the current formal class-matrix defects. Future
rule work must run the 34-cell class diagnostic and the broader paradigm audit;
any missing required cell, incorrect person/number tag, or newly unreviewed
cross-model overlap blocks release. Current results are 397,329/397,329 class
cells and 592,474/592,474 paradigm probes passing.

Derived action nominals must own nominative and oblique continuations directly.
Do not restore an ordinary noun root merely to make a bare `-தல்` surface
analyze. Retain atomic noun ambiguity only with lexical evidence, as for
`நெய்தல்`. Conversely, preserve genuinely distinct class paradigms such as the
C6.1/C11 compound `...விடு` readings; surface-level deduplication must not
erase a valid strong or weak family.

The remaining 27,455 combined-source runtime gaps and 416 closed residual verb
citations are evidence queues. No further shared-FST coverage batch should be
driven by aggregate unknown counts alone. New work requires a concrete corpus
or lexical failure, family-wide evidence, negative boundaries, and regression
coverage before another consolidated build.

## Post-0258 corpus-regression policy

Patch `0258` demonstrates the required release procedure for deleting an
invalid root: compare the complete pinned surface inventory before and after,
separate valid displaced allomorphs from noise/fragments, and restore only the
valid forms under the canonical lemma. Future root removals must include this
bidirectional corpus-delta check in addition to class and relation audits.

The current formal gates are clean: 397,329 class-matrix rows, 592,474
paradigm probes, 6,043 productive relations, and 9,441 reversible patterns all
pass. The remaining 27,453 combined-source gaps, 414 residual citations, and
116,848 unique pinned-corpus unknowns remain evidence queues rather than bulk
coverage targets.

## Post-0265 frequency-weighted release policy

Patches `0259`-`0265` complete the current consolidated correctness and
frequency-weighted batch. The formal source build, exhaustive dictionary
build, positive regressions, rejected-form regressions, and tokenizer-side
9,481-pattern reversible audit all pass. Current packaged inventories contain
5,734,745 generated/secondary surfaces, a 3,898,755-form controlled heuristic
subset, 5,762,434 dictionary surfaces, and 129,020 source lemmas.

Future compound-modifier coverage must retain the full C15 lemma and use the
explicit morphological relation; truncated modifier surfaces must not be
added as unrelated roots. Pronoun and noun-adjectival additions must extend
complete reviewed continuations rather than isolated corpus spellings.

The pinned corpus now has 193,646 unknown occurrences and 116,322 unique
unknown surfaces. The residual remains a mixture of classical language,
entities, loans, abbreviations, fragments, noise, and lexical candidates.
Aggregate unknown counts are not a license for bulk FST imports. New shared
FST work requires source or paradigm evidence, family-wide review, canonical
lemmas, and both positive and contrastive negative regressions.

## Post-0271 release policy

Patches `0266`-`0271` complete the current productive modern morphology batch.
Future perfect rules must distinguish the present perfect from past tense and
must retain finite/verbal-noun ambiguity where the surface supports both.
Future participial-nominal work must extend complete human or neuter
continuations, not add isolated surface words. Closed-class additions must use
canonical lemmas and explicit case/human/deictic semantics.

The formal source and exhaustive dictionary gates pass. Current artifacts
contain 3,341,533 direct runtime surfaces, 8,435,656 total
direct/controlled-heuristic surfaces, 8,463,307 dictionary surfaces, and
129,020 source lemmas. The heuristic inventory remains a separate
lower-confidence validation tier and must not be described as directly FST
recognized coverage.

The release validation gates are 12,893/12,893 reversible signatures,
6,043 productive-relation rows with zero defects, and 408,035 class-diagnostic
rows with no missing cells.

The pinned corpus has 185,781 unknown occurrences and 113,715 unique unknown
surfaces. The top residual queue is heterogeneous; source-backed nouns,
fragments, abbreviations, loans/entities, and spelling noise require separate
evidence policies. Another broad unknown-surface import is prohibited. A new
shared-FST batch requires a demonstrable productive family, whole-family
coverage and exception review, contrastive negative probes, and one batched
build.

## Post-0272 ownership policy

Identical closed-class relations must have one owning model. Patch `0272`
removes eight exact `அது` relations from the particle model while retaining
them in the pronoun model. Future non-verb cross-model identical analyses are
release-blocking until ownership is resolved. Current blocking overlaps: zero.

## Post-0290 release policy

Patches `0273`-`0290` close the current reviewed FST repair queue. The source
and exhaustive dictionary builds pass, including positive, rejected-form,
dictionary, heuristic, and Wiktionary checks. The current inventory contains
3,341,683 direct runtime surfaces, 8,434,525 total generated/secondary
surfaces, 6,370,191 controlled heuristic forms, and 8,462,140 dictionary
surfaces.

Future class changes must preserve the final gates: 592,471 complete paradigm
probes, 408,000 class-diagnostic rows, 6,035 productive-relation checks, and
12,917 exact tokenizer-side round-trip patterns. A new cross-model identical
analysis outside the 269 reviewed verb-syncretism groups is release-blocking.

Do not restore removed malformed passive connectors, the unsupported C12
`வல` reading, or their orphaned compounds to improve a static coverage count.
New roots and rules require independent lexical or paradigm evidence,
canonical lemmas, whole-family positives, and contrastive negatives. The
remaining source gaps and citation holds are review queues, not automatic
patch queues.

## Post-0318 release policy

Patches `0291`-`0318` close the unsupported connector queue and repair C10
final-`ன்` allomorphy, C16 ownership, question-clitic continuations, ability
`முடி`, and marker-scoped Class17 `வா` behavior. Future irregular rewrites
must be lexically scoped; global substring rewrites that can affect another
class are release-blocking.

The exhaustive source and dictionary builds pass. Current artifacts contain
3,340,946 direct runtime-union surfaces, 8,427,509 generated/secondary
surfaces, 6,362,518 controlled heuristic forms, and 8,455,031 dictionary
surfaces. The formal gates are 573,133 passing paradigm probes, zero strict
class outliers, zero unresolved source-POS decisions, and zero unresolved
productive connectors. Removed connector strings may not be restored from
ending shape or corpus frequency alone.

## Post-0325 release policy

Patches `0319`-`0325` complete the reviewed high-yield queue in one FST build
and one exhaustive dictionary build. Future changes must preserve 573,229
passing paradigm probes, 15,305 exact reversible tag patterns, zero strict
class outliers, and zero unresolved source-POS decisions.

Long-vowel-final `-டு` nouns with the released C6 behavior must not be moved
back to nongeminating C7. Weak-`இ` modal behavior and `கொள் -> கொள்ள-`
allomorphy must remain lexically scoped. A class-wide continuation is blocked
when contrastive compilation produces malformed forms even if it recovers
frequent corpus strings.

The residual 27,077 combined-source runtime gaps and broad historical ending
families remain evidence queues, not automatic root imports. New work requires
a canonical analysis, independent lexical or paradigm evidence, complete
family positives, and contrastive negatives.

## Post-0336 release policy

Patches `0332`-`0336` are the frozen corrective release. Future changes must
preserve 573,678 passing paradigm probes, 6,037 productive-relation checks,
21,235 exact reversible signature round trips, zero strict class outliers,
zero unresolved POS decisions, and zero unresolved productive connectors.

Do not restore the removed C15 `-த்தில்` sociative relation, broaden the C2
nasal rewrite into C9, restore the extra C10 honorific `ற்`, or confuse valid
optative `உண்க` with invalid future/adjectival `உண்கும்`.

The 107,435 residual unique Mozhi surfaces are not a zero-target queue.
Fragments, classical joins, entities, loans, transcription, and invalid
Unicode/spelling require separate policies. Literary `-இன்/-இனும்`
conditionals and participial `என்பன` remain grammar-review tasks and may not
be added as isolated static or tokenizer-only forms.

## Post-0350 release policy

Patches `0337`-`0350` are the final pre-extraction morphology release. Future
changes must preserve the 12-model manifest, 145/145 required morphology
matrix, 545/545 validated colloquial inventory, source positive and negative
regressions, exact signature round trips, and the fixed-vocabulary release
gates.

Colloquial changes must be attached to an owning class or a reproducibly
generated finite relation. Do not infer conditional `-ஆ` from familiar-
address `-ுடா`, and do not delete valid question/translative ambiguity.
Nominal-copular questions belong to the shared adjective FST; auxiliary-chain
semantics belong to generated `verb-auxiliary.fst`, not tokenizer-only rules.

The current exhaustive artifacts contain 10,206,966 generated/secondary
surfaces and 10,234,014 full dictionary surfaces. The direct runtime-union
subset is 3,773,878; the 8,049,056 heuristic surfaces are a controlled static
validation tier and must not be described as direct runtime recognition.

Foma output binaries may change checksums across equivalent recompilations.
After the final dictionary build, consumers must resynchronize the exact FST
binaries and regenerate checksum-pinned signature and vocabulary assets.

The remaining 26,699 combined-source runtime lemma gaps, 413 residual verb
citations, and 102,601 unique Mozhi unknown surfaces are review queues, not
coverage targets. New FST work requires a canonical analysis, independent
lexical or paradigm evidence, a generalized family, contrastive rejected
forms, and a versioned release. The next planned work is extracting the shared
FST source/build/test system into its own repository for consumption by both
Solladukku and the tokenizer.

## Post-0351 release policy

Patch `0351` is the evidence-qualified recurring-unknown release. Preserve the
149/149 required morphology matrix, all source positive and negative checks,
and the new inverse gate for every direct-union finite relation. New TSV pairs
must be compiled with the base FST symbol segmentation; whole analysis or
surface multichar symbols are forbidden because they can break inverse lookup
or shadow longer existing surfaces.

Released static counts are 3,774,096 direct-generator surfaces, 8,049,056
controlled heuristic forms, 10,207,184 generated/secondary surfaces, and
10,234,220 full dictionary surfaces. Runtime directly recognizes 102,345 of
129,020 dictionary lemmas. The tokenizer codebook contains 35,262 exact
patterns, all with successful inverse/forward witnesses, and the fixed
vocabulary contains 140,263 tokens.

The 102,305 remaining unique Mozhi unknown surfaces are still a heterogeneous
review queue, not a target for indiscriminate lexical import. Continue only
with independently evidenced productive families or reviewed lexical items.
Names, spelling variants, fragments, transcription, and classical joins must
remain under their documented policies. After this release, prioritize the
shared morphology repository extraction and translation evaluation setup.
