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

- `static-word-list/fst_classified_headwords.json`: 6,498 directly FST-classified headwords
- `static-word-list/fst_heuristic_classified_headwords.json`: 92,018 heuristic predictions
- `static-word-list/fst_heuristic_forms.txt`: 588,556 forms
- `static-word-list/fst_unclassified_vuizur_summary.json`: zero unclassified Vuizur lemmas in the current report

## Applied FST Patches

Only the noun FST is patched. The patch list is recorded in `fst/build/manifest.json`.

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

Regression coverage is in `fst/tests/fixtures/noun_morph_regressions.json`.

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

In this checkout, `public/tamil_dictionary.txt` is a Git LFS pointer, not the real dictionary contents. The pointer contains an LFS object hash and size, not a direct download URL:

```text
version https://git-lfs.github.com/spec/v1
oid sha256:7dbb5cd701374dfe338be072d4fd5f2bfba8e55a7171fc796203ebe79c638b04
size 42689952
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
