# Word Validation System Summary

This document summarizes the current Solmaalai Tamil word validation system: dictionary sources, FST lineage, patching, build flow, runtime validation, and known local-checkout caveats.

## Runtime Validation Flow

Word validation is a two-tier system:

1. The client checks `public/tamil_dictionary.txt` with binary search.
2. If a formed word is missing locally, the client asks the server:
   - Multiplayer: WebSocket `validateWords`
   - Single-player: `POST /api/validate-words`
3. The server validates the word with long-lived `flookup` processes over the core FST models.
4. A word is accepted by server fallback only if an FST recognizes it.

The server default is strict about FST availability:

- `STRICT_SERVER_VALIDATION=true`

With the default settings, a dictionary miss is sent to the server and accepted if any core FST recognizes it. If server-side FST validation is unavailable, `STRICT_SERVER_VALIDATION=true` makes the server reject dictionary misses instead of accepting them permissively.

Client implementation:

- `src/utils/dictionary.js`
- `src/components/ActionMenu.js`
- `src/utils/tamilOrthography.js`

Server implementation:

- `server/index.js`

## Dictionary Sources

The generated dictionary is built by `static-word-list/build_dictionary.py`.

Inputs:

- Tamil Lexicon headwords from University of Madras / UChicago DSAL
  - Expected file: `static-word-list/tamillexicon_headwords.txt`
  - Docs describe roughly 107K unique headwords.
  - Cleaning removes hyphens, rejects non-Tamil characters, and deduplicates.

- Official Tamil Wiktionary namespace-0 title dump
  - URL: `https://dumps.wikimedia.org/tawiktionary/latest/tawiktionary-latest-all-titles-in-ns0.gz`
  - Cached under `static-word-list/cache/` when present.
  - Keeps lexical-looking Tamil-only headwords and drops one-letter, digit-like, and symbol/mark-starting entries.

- Tamil Wiktionary POS cache from the full pages dump
  - Built by `static-word-list/extract_tawiktionary_pos.py`.
  - Source URL: `https://dumps.wikimedia.org/tawiktionary/latest/tawiktionary-latest-pages-articles.xml.bz2`
  - Output cache: `static-word-list/cache/tawiktionary_pos_headwords.jsonl`
  - Supplies POS hints for FST class filtering and heuristic classification.

- Vuizur Tamil-English Wiktionary TSV
  - URL: `https://raw.githubusercontent.com/Vuizur/Wiktionary-Dictionaries/master/Tamil-English%20Wiktionary%20dictionary.tsv`
  - Used as a supplemental Wiktionary source and POS-hint source.
  - Current ingestion is lemma-first: it keeps the Tamil token before the first `|`, not every pipe-delimited inflected form.

- FST-generated surface forms
  - Built by `static-word-list/generate_fst_forms.py`.
  - Classifies headwords with the core FSTs, then generates noun, verb, and adjective forms.

- Optional heuristic forms
  - `generate_fst_forms.py` predicts classes for unclassified lemmas using suffix statistics, POS hints, and manual overrides.
  - In full mode, controlled heuristic inflections are included in generated forms.

The file `static-word-list/wiktionary_exclusions.txt` removes manually rejected noise or unsuitable lemmas from the Lexicon/Wiktionary source pools before generation/build.

Final dictionary output:

- `public/tamil_dictionary.txt`
- One word per line
- Deduplicated
- Filtered to at most 15 Tamil letters
- Sorted with Python `sorted()` Unicode codepoint order
- Current rebuilt artifact in this checkout: 1,003,838 entries, about 45.3 MB.

The client binary search must use JavaScript `<` and `>` comparisons, not `localeCompare()`, because locale-aware Tamil ordering does not match Python codepoint sorting.

## FST Lineage and Models

The FST family is ThamizhiMorph, built with `foma` and queried with `flookup`.

Source of truth:

- Primary source: `vendor/thamizhi-morph/` git submodule
- Pinned upstream commit in the latest manifest: `a296417ac603fd44eda35645369f1257d96bed89`
- Fallback source zips: `fst/upstream-zips/`
- Fallback prebuilt pronoun model: `fst/upstream-models/pronoun.fst`

Build script:

- `fst/build/build_fsts.py`

Build outputs:

- Canonical generated artifacts: `build/fst-models/`
- Dictionary tooling copy: `static-word-list/fst-models/`
- Runtime server copy: `server/fst-models/`

Runtime FST models:

- `noun.fst`
- `adj.fst`
- `adv.fst`
- `part.fst`
- `pronoun.fst`
- `verb-c3.fst`
- `verb-c4.fst`
- `verb-c11.fst`
- `verb-c12.fst`
- `verb-c62.fst`
- `verb-c-rest.fst`

The server starts one long-lived `flookup -b` child process per available core model, sends lookup input through stdin, and treats a result as recognized when any output analysis is not `+?`. The `-b` flag is required for unbuffered output in bidirectional piping, and the parser groups all analysis lines until `flookup`'s blank result separator because one input can produce multiple analyses.

## FST Form Generation

`static-word-list/generate_fst_forms.py` does the offline morphological expansion.

Main steps:

1. Build a unified lemma pool from Tamil Lexicon, official Tamil Wiktionary, Tamil Wiktionary POS cache, and Vuizur TSV.
2. Apply `wiktionary_exclusions.txt`.
3. Merge POS hints from:
   - Tamil Lexicon hyphen-marked verb forms ending in `தல்` / `த்தல்`
   - Tamil Wiktionary pages POS cache
   - Vuizur `<i>...</i>` POS markers
4. Classify lemmas by forward lookup against each core FST.
5. Filter class assignments using POS hints when available.
6. Generate forms by inverse `flookup`.
7. Write classification, heuristic, and unresolved reports.

Noun generation uses these tags:

- `+noun+nom`
- `+noun+acc`
- `+noun+dat`
- `+noun+loc`
- `+noun+abl`
- `+noun+gen`
- `+noun+inst`
- `+noun+soc`
- plural equivalents for the same cases

Adjective generation uses a deliberately small tag set:

- `+adj`
- `+adj+comp`
- `+adj+super`

Verb generation extracts class-specific templates from local verb `.lexc` sources. Conservative mode skips complex, causative, euphonic, and some noisy branches. Full mode uses all extracted templates and enables heuristic inflection generation.

## Heuristic Classification

For headwords not directly recognized by an FST, `generate_fst_forms.py` builds a suffix model from successfully classified lemmas and predicts likely FST classes.

Controls and safeguards:

- POS hints constrain the allowed classes.
- Lemmas ending in `தல்` get a verb-shape prior.
- During heuristic inflection synthesis, verb-shaped `தல்` / `த்தல்` lemmas are normalized to plausible productive stems and tried across all verb FST classes. Generated candidates are then forward-validated by the same FST, so a source lemma such as `படித்தல்` can generate accepted forms like `படித்தான்`, `படிக்கிறேன்`, and `படிப்பேன்` through the correct productive root/class even if the suffix classifier initially chose a different verb class.
- Internal generation stems may be one Tamil letter (`வா`, `போ`), even though final playable dictionary forms still require at least two Tamil letters. Explicit stem overrides handle common irregular dictionary lemmas such as `கேட்டல் -> கேள்` and `வருதல் -> வா`; causative-style `த்தல்` lemmas also try a `...த்து` candidate such as `நடத்தல் -> நடத்து`.
- Explicit lemma-level overrides handle known ambiguous endings.
- Heuristic inflection synthesis is forward-validated through the predicted class FST before accepted forms are written.

Known overrides include:

- `புழு` -> `noun.fst`
- `குரு` -> `noun.fst`
- `போண்டி` -> `adj.fst`
- `புழுத்தல்` -> `verb-c-rest.fst`
- `வத்தல்` -> `noun.fst`
- `பித்தல்` -> `noun.fst`

Current checked-out generated reports show:

- `static-word-list/fst_classified_headwords.json`: 8,689 directly FST-classified headwords
- `static-word-list/fst_heuristic_classified_headwords.json`: 94,272 heuristic predictions
- `static-word-list/fst_heuristic_forms.txt`: 803,501 forms
- `static-word-list/fst_unclassified_vuizur_summary.json`: 6 unresolved Tamil Wiktionary dump-only lemmas in the current report, tracked by the review fixtures

## Applied FST Patches

The noun and verb FST sources are patched locally. The patch list is recorded in `fst/build/manifest.json`.

### `0001-fix-c11-acc.patch`

File: `fst/patches/0001-fix-c11-acc.patch`

Fixes Class 11 noun accusative from `^னை` to `^ை`.

Purpose:

- Reject bad forms like `மாணவன்னை` and `திருமகன்னை`.
- Preserve valid forms like `மாணவனை` and `திருமகனை`.
- Preserve unrelated valid C10 behavior such as `பொன் -> பொன்னை`.

### `0002-fix-noun-class-duplicates.patch`

File: `fst/patches/0002-fix-noun-class-duplicates.patch`

Removes roots duplicated across noun classes, including examples such as `பொன்`, `மான்`, `மீன்`, and `வான்`.

Purpose:

- Prevent class leakage where a root is analyzed or generated by the wrong paradigm.
- Avoid invalid alternate inflections caused by duplicated roots.

### `0003-fix-noun-malformed-locatives.patch`

File: `fst/patches/0003-fix-noun-malformed-locatives.patch`

Fixes malformed Class 6 locative behavior.

Key changes:

- Changes a malformed locative path from `^டிடம்` to `^இடம்`.
- Moves many `-ட்டு` words into a new `C6TTUSg` subclass.
- Rejects malformed forms like `அகச்சிட்ட்டில்`.
- Preserves expected forms like `காட்டில்` and `மடுவிடம்`.

### `0004-fix-noun-plural-accusative.patch`

File: `fst/patches/0004-fix-noun-plural-accusative.patch`

Adds common bare plural accusative alternates for singular noun classes while preserving the existing `...களினை` / related variants.

Examples:

- `மரம்+noun+pl+acc` now generates and recognizes `மரங்களை`.
- `மாணவன்+noun+pl+acc` now generates and recognizes `மாணவர்களை`.
- `புலி+noun+pl+acc` now generates and recognizes `புலிகளை`.
- `கல்+noun+pl+acc` now generates and recognizes `கற்களை`.

The patch targets the bare `+noun+pl+acc` rules across noun classes C1-C16, plus the C15 plural accusative focus form. Related plural-accusative postposition/particle forms already used common `...களை...` shapes before this patch.

### `0005-add-common-noun-case-variants.patch`

File: `fst/patches/0005-add-common-noun-case-variants.patch`

Adds common noun-case alternates that were missing from the patched upstream noun model while preserving existing longer/formal variants.

Examples:

- `மரம்+noun+pl+inst` now generates and recognizes `மரங்களால்`, while `மரங்களினால்` remains valid.
- `புலி+noun+pl+inst` now generates and recognizes `புலிகளால்`.
- `மாணவன்+noun+pl+inst` now generates and recognizes `மாணவர்களால்`.
- `புலி+noun+dat` now generates and recognizes `புலிக்கு`, while `புலியுக்கு` remains valid.
- `தீ+noun+dat` now generates and recognizes `தீக்கு`, while `தீயுக்கு` remains valid.
- `மாணவன்+noun+soc` now generates and recognizes `மாணவனுடன்`.
- `கல்+noun+soc` now generates and recognizes `கல்லுடன்`.
- `பொருள்+noun+soc` now analyzes as `+noun+soc`; this fixes a C14 typo that previously emitted `+noun+so` for the `உடன்` variant.

The patch targets bare plural instrumental rules across noun classes, `இ/ஈ` stem dative alternates in C2/C3, missing `உடன்` sociative rules for the `ன்/ல்/ள்` classes, and the malformed C14 sociative tag.

### `0006-add-common-verb-coverage.patch`

File: `fst/patches/0006-add-common-verb-coverage.patch`

Adds common verb coverage missing from the shipped verb FSTs.

Examples:

- Adds `கொடு` to the C11 verb source, so `கொடுத்தேன்`, `கொடுக்கிறேன்`, `கொடுப்பேன்`, and `கொடுக்கும்` are recognized.
- Adds `சாப்பிடு` to the C6 verb source, so `சாப்பிட்டேன்`, `சாப்பிடுகிறேன்`, `சாப்பிடுவேன்`, and imperative/root `சாப்பிடு` are recognized.
- Adds root-specific modern allomorph coverage for `போ`, including `போனேன்`, `போனாள்`, `போனார்கள்`, `போகும்`, `போகவில்லை`, and `போய்`.
- Adds root-specific modern allomorph coverage for `வா`, including person/number variants such as `வருகிறேன்`, `வருகிறாய்`, `வருகிறாள்`, `வருகிறார்கள்`, `வருவேன்`, `வருவாய்`, `வருவாள்`, `வருவார்கள்`, and `வரும்`.
- Adds root-specific modern allomorph coverage for `கேள்`, including person/number variants such as `கேட்கிறேன்`, `கேட்கிறாய்`, `கேட்கிறாள்`, `கேட்கிறார்கள்`, `கேட்பேன்`, `கேட்பாய்`, `கேட்பாள்`, `கேட்பார்கள்`, plus `கேட்கும்`, `கேட்கவில்லை`, `கேட்க`, and `கேட்டு`.

The root-specific allomorph lexicons are additive; they do not remove older/generated forms that the upstream FST already accepted.

### `0007-expand-source-backed-noun-coverage.patch`

File: `fst/patches/0007-expand-source-backed-noun-coverage.patch`

Adds source-backed noun lemmas that were present in Tamil Lexicon, Tamil Wiktionary-derived data, or related source lists but were not classified into a runtime noun FST class.

Examples:

- `இந்தியா` is added to the `ஆ`-ending noun class, so forms such as `இந்தியா`, `இந்தியாவில்`, and `இந்தியாவை` are recognized.
- `செயற்கை`, `தொகை`, and `நிலுவை` are added to the `ஐ`-ending noun class.
- `நுண்ணறிவு` is added to the same `உ`-ending noun class as `அறிவு`, so forms such as `நுண்ணறிவு` and `நுண்ணறிவில்` are recognized.

This patch is source-backed lexical coverage, not a tokenizer-side supplemental analysis.

### `0008-expand-source-backed-verb-coverage.patch`

File: `fst/patches/0008-expand-source-backed-verb-coverage.patch`

Adds source-backed verb coverage and a modern C5 past neuter surface variant.

Examples:

- Adds `உருவாக்கு` to the C5 verb source, so `உருவாக்கு` and `உருவாக்குகிறது` are recognized.
- Adds the C5 `...ியது` past neuter variant, so `ஓடியது` analyzes as `ஓடு+verb+fin+sim+strong+past=இன்+3sgn=அது`.

### `0009-add-irregular-existential-verb.patch`

File: `fst/patches/0009-add-irregular-existential-verb.patch`

Adds a small irregular existential `உள்` lexicon for modern existential forms that are not produced by the regular verb classes.

Examples:

- `உள்ளது` analyzes as `உள்+verb+fin+sim+strong+pres=∅+3sgn=அது`.
- `உள்ளன` analyzes as `உள்+verb+fin+sim+strong+pres=∅+3pln=அன`.
- `உள்ளார்` analyzes as `உள்+verb+fin+sim+strong+pres=∅+3sghe=ஆர்`.
- `உள்ளார்கள்` analyzes as `உள்+verb+fin+sim+strong+pres=∅+3ple=ஆர்கள்`.
- `உண்டு` now preserves two analyses:
  - existential `உள்+verb+fin+sim+strong+pres=∅+3sgn=அது`
  - eating-verb participial `உண்+verb+nonfin+sim+vpart=உ`

The existential analysis is additive; it does not replace the older `உண்` analysis for `உண்டு`.

### `0010-add-source-backed-noun-tranche.patch`

File: `fst/patches/0010-add-source-backed-noun-tranche.patch`

Adds 1,522 high-confidence source-backed noun candidates from Tamil Lexicon, Tamil Wiktionary titles, and Vuizur-derived data. Candidates were selected from the source/FST gap audit using explicit noun/name POS hints, high model confidence, source support, and a noun-class suffix model trained from the patched noun lexicon.

Class distribution:

- `C2SgRoot`: 951 entries
- `C7SgRoot`: 424 entries
- `C1SgRoot`: 91 entries
- `C11SgRoot`: 56 entries

Representative examples include `அஃறிணை`, `அகராதி`, `அமைதி`, `அரிசி`, `அரண்மனை`, `அதிகாரி`, `அக்கா`, and `அகப்பா`.

### `0015-add-source-backed-noun-tranche-2.patch`

File: `fst/patches/0015-add-source-backed-noun-tranche-2.patch`

Adds 173 high-confidence Vuizur-backed noun candidates after the second C5 verb build. Candidates require a noun-containing POS hint, Vuizur source support, high noun-model confidence, and a noun-class suffix prediction from the patched noun lexicon. The tranche excludes `name` and `noun|verb` POS rows. `நம்பிக்கை` / `திருநம்பி` were excluded from this root-addition patch because duplicate root entries did not fix them; the underlying noun-FST rewrite issue is fixed separately in `0016-remove-noun-pronoun-rewrites.patch`.

Class distribution:

- `C11SgRoot`: 110 entries
- `C7SgRoot`: 60 entries
- `C2SgRoot`: 3 entries

Representative examples include `இறுதி`, `கிணறு`, `கடன்`, `பயன்`, `இடையூறு`, and `பெரியோன்`.

### `0016-remove-noun-pronoun-rewrites.patch`

File: `fst/patches/0016-remove-noun-pronoun-rewrites.patch`

Removes pronoun-specific sandhi rewrite rules from the noun FST. The noun build previously composed rules such as `"நம்" -> 0` into `tamil-noun.foma`; those rules introduced pronoun multicharacter symbols into the noun analyzer and made ordinary noun roots containing those strings unreachable even when the roots were present in `Nouns.lexc`.

Pronouns remain covered by the separate copied `pronoun.fst`. The noun FST now recognizes affected noun roots such as `நம்பிக்கை`, `திருநம்பி`, `அகநம்பி`, and `நம்பி`; `நம்பி` is intentionally ambiguous in downstream tokenization because it is both a noun and a non-finite form of `நம்பு`.

### `0017-add-source-backed-noun-tranche-3.patch`

File: `fst/patches/0017-add-source-backed-noun-tranche-3.patch`

Adds 1,301 reviewed source-backed noun roots from the third noun tranche. This tranche uses the source/FST gap audit and explicit noun-class suffix rules, while moving forms already handled by verb/adverb patches out of noun-root review. Reviewed lexical noun decisions include:

- `கற்றொழிலோர்`: stone-masons/architects, added to `C16SgRoot`.
- `பிறந்தவம்`: birth/nativity, added to `C15SgRoot`.
- `பிறந்தவழிக்கூறல்`: a kind of metonymy, added to `C4SgRoot`.
- `பறக்கும்தட்டு`: UFO, sourced from Tamil Wiktionary title data and Vuizur TSV, added to `C7SgRoot`.

### `0018-add-short-honorific-verb-forms.patch`

File: `fst/patches/0018-add-short-honorific-verb-forms.patch`

Adds short `ஆர்` honorific finite forms where the source classes already generated longer `ஆர்கள்` forms. This covers forms such as `கற்றார்` and `சேர்ந்தார்` through existing verb roots/classes instead of adding them as bare noun roots.

### `0019-add-participial-person-nominals.patch`

File: `fst/patches/0019-add-participial-person-nominals.patch`

Adds productive past adjectival participle + `ஓர்` person nominal generation for relevant verb classes. This covers forms such as `அடைந்தோர்` through existing verb roots/classes and exposes the existing `PartNoun` morphology tag.

### `0020-add-lexicon-adverb-illaakkaattil.patch`

File: `fst/patches/0020-add-lexicon-adverb-illaakkaattil.patch`

Adds `இல்லாக்காட்டில்` as a lexical adverb meaning “if not; otherwise” (`இல்லாமை +`, glossed as `இல்லாவிட்டால்` in the lexicon), rather than adding it as a noun root.

### `0012-add-source-backed-name-tranche.patch`

File: `fst/patches/0012-add-source-backed-name-tranche.patch`

Adds 76 multi-source source-backed name/name+noun candidates. Candidates require a noun-model prediction, a `name` POS hint, at least two lexical sources, and high model confidence. The tranche uses explicit ending-based noun-class rules rather than the generic suffix-confidence model so that examples such as `கேரளம்` use the neuter `-ம்` paradigm and `தமிழ்நாடு` uses the `-டு` paradigm.

Representative examples include `சீனா`, `கோவா`, `சீதை`, `தமிழ்நாடு`, `ஜப்பான்`, `கேரளம்`, `பிள்ளையார்`, and `சேலம்`. Vuizur-only names and unsupported foreign-final consonant stems such as `பாரிஸ்` are intentionally deferred.

### `0013-add-foreign-final-name-template.patch`

File: `fst/patches/0013-add-foreign-final-name-template.patch`

Adds a dedicated template for borrowed consonant-final names instead of forcing them into existing native noun classes. The first reviewed seed covers 14 `ஸ்`, `க்`, and `த்` final names, including `பாரிஸ்`, `கிறிஸ்துமஸ்`, `பிரான்ஸ்`, `பிலிப்பைன்ஸ்`, `மெட்ராஸ்`, `லாவோஸ்`, `லடாக்`, `மத்ரித்`, and `பக்ரித்`.

The template keeps written nominatives such as `பாரிஸ்` and generates Tamilized oblique forms such as `பாரிஸை`, `பாரிஸில்`, `லடாகை`, `லடாகில்`, `மத்ரித்தை`, and `மத்ரித்தில்`. `த்` finals use a separate oblique surface stem, so forms such as `மத்ரித்துக்கு`, `மத்ரித்துடன்`, and `மத்ரித்துடைய` are generated without malformed double-pulli surfaces.

### `0011-add-source-backed-c5-verb-tranche.patch`

File: `fst/patches/0011-add-source-backed-c5-verb-tranche.patch`

Adds 26 high-confidence source-backed C5 verb roots. Candidates were selected from the source/FST gap audit by requiring a verb POS hint, Vuizur plus at least one other lexical source, high verb-model confidence, and a `C5Vinf` class prediction from a suffix model trained on the patched verb lexicon.

Representative examples include `உதவு`, `தூங்கு`, `திரும்பு`, `காப்பாற்று`, and `பயன்படு`; inflected forms such as `உதவுகிறது`, `தூங்குகிறது`, `திரும்பியது`, `காப்பாற்றுகிறது`, and `பயன்படுகிறது` now analyze through the runtime FSTs.

### `0014-add-source-backed-c5-verb-tranche-2.patch`

File: `fst/patches/0014-add-source-backed-c5-verb-tranche-2.patch`

Adds 45 post-dictionary-build Vuizur-backed C5 verb roots using the same C5 suffix/class rule as the first verb tranche. The candidate report is preserved as `outputs/source_backed_c5_verb_tranche_2_candidates.csv` in the tokenizer demo project.

Representative examples include `பொறு`, `வெறு`, `உண்டாக்கு`, `பயப்படு`, `மேம்படு`, and `களிகூறு`; inflected forms such as `பொறுகிறது`, `வெறுகிறது`, `உண்டாக்குகிறது`, `பயப்படுகிறது`, `மேம்படுகிறது`, and `களிகூறுகிறது` now analyze through the runtime FSTs.

Regression coverage is in `fst/tests/fixtures/noun_morph_regressions.json` and `fst/tests/fixtures/verb_morph_regressions.json`.

## Build Commands

Build patched FSTs:

```bash
npm run fst:build
```

Run FST regressions:

```bash
npm run fst:test
```

Build full dictionary artifacts:

```bash
npm run dict:build
```

Current `dict:build` sequence:

```bash
npm run fst:build
FULL_FST_GENERATION=true python3 static-word-list/generate_fst_forms.py
python3 static-word-list/build_dictionary.py
python3 fst/tests/run_fst_regressions.py --check-dictionary --full-mode
```

Conservative dictionary build:

```bash
npm run dict:build:conservative
```

## Local Checkout and Docker Caveats

`public/tamil_dictionary.txt` has Git LFS attributes and may appear as a small pointer file in LFS-enabled or LFS-light checkouts. In the current rebuilt checkout and pushed `main` commit, Git LFS is not installed locally and the artifact is the real ~45 MB generated dictionary stored as a normal Git blob. An unresolved pointer contains an LFS object hash and size, not a direct download URL:

```text
version https://git-lfs.github.com/spec/v1
oid sha256:<lfs object hash>
size <dictionary bytes>
```

The Dockerfile detects an unresolved pointer by checking whether the file is smaller than 1000 bytes. If so, it downloads the real dictionary from the project GitHub repo:

```text
https://github.com/kupilikula/Solladukku/raw/main/public/tamil_dictionary.txt
```

Relevant Dockerfile block:

```dockerfile
RUN if [ $(wc -c < public/tamil_dictionary.txt) -lt 1000 ]; then \
      echo "Dictionary is LFS pointer, downloading from GitHub..." && \
      curl -L -o public/tamil_dictionary.txt \
        "https://github.com/kupilikula/Solladukku/raw/main/public/tamil_dictionary.txt"; \
    fi
```

That means production Docker builds depend on the real dictionary being available from the `main` branch of the GitHub repo when Git LFS contents are not resolved by the builder.

Other large source/cache files may also be absent from a shallow or LFS-light local checkout, including:

- `static-word-list/tamillexicon_headwords.txt`
- `static-word-list/fst_generated_forms.txt`
- `static-word-list/cache/`
- `build/fst-models/`
- `static-word-list/fst-models/`

The runtime FST copies under `server/fst-models/` are present in the checked-out repo.

## Key Operational References

- `Docs/FST_ARCHITECTURE.md`: canonical FST source/build/patch/deploy architecture
- `Docs/WORD_VALIDATION_PLAN.md`: validation design history and phased plan
- `fst/README.md`: patch/build/test workflow
- `fst/build/manifest.json`: current FST build metadata, patch hashes, model hashes
- `fst/tests/run_fst_regressions.py`: deterministic morphology and dictionary regression checks
