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

Static dictionary outputs:

- `public/tamil_dictionary.txt`: compact browser lookup dictionary. It contains lexical headwords only, one word per line, deduplicated, filtered to at most 15 Tamil letters, and sorted with Python `sorted()` Unicode codepoint order. Generated inflections missing from this local payload are validated by server-side FST fallback.
- `static-word-list/full_tamil_dictionary.txt`: full generated surface inventory from lexical sources plus FST-generated forms. Regression tests and offline audits use this file when they need comprehensive generated-form coverage.
- `static-word-list/lemma_dictionary.txt`: source headword/lemma inventory used by tokenizer/root-lemma tooling. It excludes generated inflections.

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

- `static-word-list/fst_classified_headwords.json`: 100,282 directly FST-classified headwords
- `static-word-list/fst_heuristic_classified_headwords.json`: 28,176 heuristic predictions
- `static-word-list/fst_heuristic_forms.txt`: 1,783,009 forms
- `static-word-list/fst_generation_audit.json`: exact per-model generation statistics
- `static-word-list/fst_unclassified_vuizur_summary.json`: 3 unresolved summary buckets in the current report, tracked by the review fixtures

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

### `0021-add-reviewed-peen-noun.patch`

File: `fst/patches/0021-add-reviewed-peen-noun.patch`

Adds `பேன்` as a reviewed non-human `ன்`-final noun meaning lice. It is intentionally assigned to `C4SgRoot`, matching nouns such as `மான்` and `தேன்`, because the generic `C11` human/masculine `ன்` pattern would generate inappropriate plural forms such as `...ர்கள்`. Bare `பேன்` is not analyzed as a verb form.

### `0022-add-peethu-verb-coverage.patch`

File: `fst/patches/0022-add-peethu-verb-coverage.patch`

Covers lexical `பேத்தல்` by adding productive stem `பேத்து` to the C5 verb class, the same paradigm used for `நடத்தல்`. This generates regular C5 forms such as `பேத்தினேன்`, `பேத்துகிறேன்`, `பேத்துவேன்`, and `பேத்தியது` without adding supplemental surface-form exceptions. Like the existing `நடத்தல்` flow, the citation form is used by dictionary generation while the runtime FST class stores the productive stem.

### `0023-add-source-backed-c5-primary-verb-stems.patch`

File: `fst/patches/0023-add-source-backed-c5-primary-verb-stems.patch`

Adds 4,388 C5 primary stems derived from a fresh `verb_c_rest_candidate` gap triage. The tranche uses lexical `தல்` / `த்தல்` lemmas backed by both Tamil Lexicon and Tamil Wiktionary titles, converts them to primary productive stems, excludes stems already recognized by the runtime FST, and keeps only high-confidence C5 predictions. Representative additions include `திறக்கு`, `உள்ளடக்கு`, `குணமாக்கு`, and `பொறுக்கு`.

### `0024-add-source-backed-c5-primary-verb-stems-2.patch`

File: `fst/patches/0024-add-source-backed-c5-primary-verb-stems-2.patch`

Adds 262 C5 primary stems from the post-`0023` tier-1 source-backed verb gap list. The tranche keeps the same policy as `0023`: lexical `தல்` / `த்தல்` lemmas backed by both Tamil Lexicon and Tamil Wiktionary titles, converted to primary productive stems and filtered to high-confidence C5 predictions. Representative additions include `கணக்கிடு`, `உயிர்த்தெழு`, `அறிவுறு`, and `கையைப்பிடித்திழு`.

### `0012-add-source-backed-name-tranche.patch`

File: `fst/patches/0012-add-source-backed-name-tranche.patch`

Adds 76 multi-source source-backed name/name+noun candidates. Candidates require a noun-model prediction, a `name` POS hint, at least two lexical sources, and high model confidence. The tranche uses explicit ending-based noun-class rules rather than the generic suffix-confidence model so that examples such as `கேரளம்` use the neuter `-ம்` paradigm and `தமிழ்நாடு` uses the `-டு` paradigm.

Representative examples include `சீனா`, `கோவா`, `சீதை`, `தமிழ்நாடு`, `ஜப்பான்`, `கேரளம்`, `பிள்ளையார்`, and `சேலம்`. Vuizur-only names and unsupported foreign-final consonant stems such as `பாரிஸ்` are intentionally deferred.

### `0026-add-common-function-particles.patch`

File: `fst/patches/0026-add-common-function-particles.patch`

Adds common dictionary-backed function words to the particle FST: `என` as a complementizer, `மட்டும்` as a postposition/particle, and `இல்லை` as a copular/negative function word. These were already present in the static dictionary from lexical sources but previously lacked runtime FST analyses.

### `0027-add-common-adverb-een.patch`

File: `fst/patches/0027-add-common-adverb-een.patch`

Adds `ஏன்` as an adverb in the adverb FST.

### `0028-add-deictic-adverb-forms.patch`

File: `fst/patches/0028-add-deictic-adverb-forms.patch`

Adds semantically tagged deictic adverb coverage for common proximal, distal, and interrogative time/situation forms such as `இப்பொழுது`, `அப்பொழுது`, `எப்பொழுது`, `இப்போது`, `எப்போது`, `இம்மாசம்`, and `இந்நிலையில்`. These analyses expose tags such as `dem`, `prox`, `dist`, `inter`, `time`, and `situation`. The patch also removes redundant plain `+adv` entries for the standard time forms so runtime analysis keeps the richer deictic reading without duplicate generic analyses.

### `0029-add-deictic-adjective-forms.patch`

File: `fst/patches/0029-add-deictic-adjective-forms.patch`

Adds semantically tagged deictic adjective coverage for type/kind modifiers such as `இவ்வகை`, `அவ்வகை`, and `எவ்வகை`, exposing `dem`, proximity/interrogative, `type`, and `adj` tags.

### `0030-add-corpus-backed-common-nouns.patch`

File: `fst/patches/0030-add-corpus-backed-common-nouns.patch`

Adds a small corpus-backed noun coverage tranche for high-frequency tokenizer audit fallbacks that were already present in the static dictionary or source lexicons but lacked runtime noun FST analyses. Examples include `தேர்தல்`, `பாலம்`, `சுற்றுலா`, `நடவடிக்கை`, `கொள்முதல்`, `உற்பத்தி`, `அலுவலர்`, `உடற்பயிற்சி`, `நல்லறம்`, `ஜனாதிபதி`, `பட்டதாரி`, `மன்னார்`, `பேப்பர்`, and `அழுத்தம்`.

### `0031-add-corpus-backed-common-adverbs.patch`

File: `fst/patches/0031-add-corpus-backed-common-adverbs.patch`

Adds common corpus-backed adverbial/function forms `சுமார்` and `அதனால்` to the adverb FST so they no longer fall back as unknown Tamil surfaces.

### `0032-add-pronoun-quantifier-function-coverage.patch`

File: `fst/patches/0032-add-pronoun-quantifier-function-coverage.patch`

Adds a small semantically tagged function-word layer to the compiled particle FST for high-frequency tokenizer audit fallbacks that are pronouns, quantifiers, deictic degree/distributive forms, or modal/existential functions. Examples include `தங்கள்`, `ஒருவர்`, `அனைவரும்`, `எல்லா`, `என்ன`, `எத்தனை`, `அதே`, `அந்தந்த`, `இவ்வளவு`, `அவ்வளவு`, `வேண்டாம்`, and `உண்டா`. This patch intentionally does not modify the copied prebuilt `pronoun.fst`; it keeps the coverage in the source-built particle/function component with explicit tags such as `pron`, `quant`, `all`, `inter`, `poss`, `degree`, `modal`, `neg`, `exist`, and `ques`.

### `0033-add-selective-loan-nouns.patch`

File: `fst/patches/0033-add-selective-loan-nouns.patch`

Adds selective corpus-backed loanword noun coverage. `வைரஸ்` uses the existing foreign-final `ஸ்` nominal template, so case forms such as `வைரஸில்` are generated by the noun FST and preserve the normal locative/ablative ambiguity. `கலெக்டர்` and `குக்கர்` are added to the existing `ர்`-final noun paradigm, generating forms such as `கலெக்டரை` without tokenizer-side surface exceptions.

### `0034-add-selective-abbreviation-particles.patch`

File: `fst/patches/0034-add-selective-abbreviation-particles.patch`

Adds a deliberately small abbreviation-letter layer to the particle FST for common single-letter words seen in Tamil news/business text: `பி`, `ஜி`, `டி`, and `எஸ்`. These are tagged as `+abbrev+letter`. This does not open a broad one-letter-word class; additions remain explicit and reviewable.

### `0035-add-corpus-backed-adjectival-stems.patch`

File: `fst/patches/0035-add-corpus-backed-adjectival-stems.patch`

Adds corpus-backed adjectival and attributive stems that were common tokenizer audit fallbacks but lacked adjective FST analyses, including `தமிழக`, `ஐக்கிய`, `மாவட்ட`, `தேசிய`, `பிரபல`, `பிரபலமான`, and `சரியான`.

### `0036-add-corpus-backed-adverbial-stems.patch`

File: `fst/patches/0036-add-corpus-backed-adverbial-stems.patch`

Adds corpus-backed adverbial stems `கடுமையாக`, `குறைவாக`, and `வலுவின்றி` to the adverb FST.

### `0037-add-complementizer-case-forms.patch`

File: `fst/patches/0037-add-complementizer-case-forms.patch`

Extends the source-built particle/complementizer FST with common complementizer case/sandhi surfaces: `என்பதை+comp+acc` and `எனக்+comp+sandhik`. These keep complementizer analyses in the FST layer instead of falling back to tokenizer heuristics.

### `0038-add-modern-verb-derived-forms.patch`

File: `fst/patches/0038-add-modern-verb-derived-forms.patch`

Extends productive verb rules in `verb-c-rest.fst`: C5 now generates the common past adjectival `-ிய` pattern for forms such as `பேசிய`, C5 includes short root `ஆ` and a singular honorific future line for `ஆவார்`, `VaaModern` generates relative participial `வருகின்ற`, and C8 generates the short honorific past `என்றார்` from root `என்`.

### `0039-add-c11-loan-verb-stems.patch`

File: `fst/patches/0039-add-c11-loan-verb-stems.patch`

Adds the C11 verb stem `விமர்சி`, allowing the existing C11 rules to generate forms such as `விமர்சித்து` and related inflections. This is a root/class coverage fix, not a supplemental surface-form exception.

### `0040-add-calendar-place-loan-nouns.patch`

File: `fst/patches/0040-add-calendar-place-loan-nouns.patch`

Adds reviewed calendar, country/city, and common loan noun coverage in the noun FST. Examples include `டீ`, `ஜூஸ்`, `கேக்`, `பிஸ்கட்`, `சாக்லேட்`, `பீட்சா`, `மார்ச்`, `ஆகஸ்ட்`, `பிரிட்டன்`, `ஜெர்மனி`, `பாகிஸ்தான்`, `நேபாளம்`, `பெங்களூரு`, `ஹைதராபாத்`, `கொல்கத்தா`, `டிக்கெட்`, `போலீஸ்`, `டாக்டர்`, `ரயில்`, `பஸ்`, `பைக்`, `மொபைல்`, `கம்ப்யூட்டர்`, `வீடியோ`, and `போன்`.

The patch uses ordinary noun classes where they fit and adds small reusable foreign-final templates for written-final `க்`, `ச்`, and `ட்` loans. It keeps the earlier policy for single-letter forms: `டி` remains an abbreviation/letter token in the particle FST, while the tea word is represented by the standard long-vowel spelling `டீ` as a noun.

### `0041-complete-modern-verb-paradigms.patch`

File: `fst/patches/0041-complete-modern-verb-paradigms.patch`

Completes high-impact modern verb coverage surfaced by the tokenizer corpus audit. The patch extends the existing `VaaModern` irregular class for forms such as `வந்தார்`, `வந்தனர்`, `வருகிறார்`, `வருகின்றன`, and `வருவார்`; routes the short past `-ஆர்` / `-னர்` forms through a separate `வா:வ` surface stem to avoid malformed `வருந்தார்`-style outputs; adds existential `உள்ளனர்`; and adds reviewed C5 stems `பணியாற்று` and `பயன்படுத்து`, allowing productive analyses such as `பணியாற்றினார்` and `பயன்படுத்தினார்`.

### `0042-add-comparative-kkum-particle.patch`

File: `fst/patches/0042-add-comparative-kkum-particle.patch`

Adds a semantically explicit particle analysis for standalone `க்கும்` as `க்கும்+pp-particle+comparative+add`. This handles comparative/additive uses such as `15 க்கும் குறைவாக` without treating the form as a noun case suffix or falling back to unknown Tamil surface tokenization.

### `0043-add-audit-backed-passive-verb-stems.patch`

File: `fst/patches/0043-add-audit-backed-passive-verb-stems.patch`

Adds `பயன்படுத்தப்படு` to the existing `CPadu61Vinf` passive verb class. The runtime FST now analyzes forms such as `பயன்படுத்தப்படுகிறது`, `பயன்படுத்தப்பட்டது`, and `பயன்படுத்தப்பட்டு` as complex passive verb forms. This is a narrow stem/class coverage fix; broader compound `படு` forms such as `செயல்பட்டு` remain for a separate class-design pass.

### `0044-add-audit-backed-common-noun-coverage.patch`

File: `fst/patches/0044-add-audit-backed-common-noun-coverage.patch`

Adds a small reviewed `AuditBackedCommonNounSg` lexicon for high-frequency tokenizer/HF-audit noun fallbacks whose class is straightforward: `ஓட்டம்` (`C15SgRoot`), `விற்பனை` (`C2SgRoot`), `குறைபாடு` (`C7SgRoot`), and `இயக்குநர்` (`C16SgRoot`). This covers forms such as `ஓட்டங்களால்` through existing noun inflection rules. Forms requiring broader rules, such as noun-wide `-ஆக` (`இயக்குநராக`), are not handled in this patch.

### `0045-add-audit-backed-adjective-forms.patch`

File: `fst/patches/0045-add-audit-backed-adjective-forms.patch`

Adds reviewed attributive adjective forms from the tokenizer audit: `தேசியக்`, `நீர்வாழ்`, and `துடுப்பாட்ட`. These are represented as adjective entries rather than tokenizer-side fallbacks, preserving FST-backed POS information for common news/textbook-style modifiers.

### `0046-add-c4-u-final-future-forms.patch`

File: `fst/patches/0046-add-c4-u-final-future-forms.patch`

Adds a narrow C4 helper lexicon for `உ`-final future/adjectival `-உம்` forms where the base C4 past/present paradigm already works but the surface future form was missing. The patch currently covers `விழும்` and `எழும்`, while preserving existing C4 analyses such as `விழுந்தது`, `எழுந்தது`, `சேர்ந்தார்`, and `அடைந்தோர்`.

### `0047-add-noun-translative-and-singular-additive.patch`

File: `fst/patches/0047-add-noun-translative-and-singular-additive.patch`

Adds the noun tag `+trans` for translative/adverbial `-ஆக` forms and extends singular nominative additive `+add` coverage beyond the earlier plural-only `0025` patch. Covered audit examples include `மரமும்`, `எண்ணிக்கையும்`, `புலியும்`, `மாணவனும்`, `மரமாக`, `காரணமாக`, `இயக்குநராக`, and `எண்ணிக்கையாக`.

This patch intentionally handled only class patterns that could be generated without malformed surfaces. Final short-`ு` translatives and C10 `ன்`-doubling forms are covered by the follow-up `0048` patch.

### `0025-add-noun-additive-um.patch`

File: `fst/patches/0025-add-noun-additive-um.patch`

Adds productive plural nominative additive/enclitic `உம்` coverage across noun inflection classes. The patch uses explicit plural-additive surfaces such as `களும்`, `ர்களும்`, `ற்களும்`, `ட்களும்`, and `ங்களும்` rather than chaining `கள் + உம்`, which would produce malformed intermediate surfaces such as `பெண்கள்உம்`. Examples include `பெண்களும்`, `ஆண்களும்`, `மரங்களும்`, and `மாணவர்களும்`. Static generation includes `+noun+pl+nom+add` so these forms enter `fst_generated_forms.txt` and the generated dictionary.

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

`public/tamil_dictionary.txt` is now a compact client dictionary. Older large generated versions had Git LFS attributes and may appear as a small pointer file in LFS-enabled or LFS-light checkouts. In the current local rebuild, the artifact is the compact client dictionary rather than the older large generated surface dictionary. An unresolved pointer contains an LFS object hash and size, not a direct download URL:

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

### `0048-add-noun-oblique-translative-coverage.patch`

File: `fst/patches/0048-add-noun-oblique-translative-coverage.patch`

Extends translative/adverbial `+trans` coverage for noun classes whose written stems need existing class-specific morphophonemic handling rather than plain suffix concatenation. C6/C7 nouns use the final short-`ு` replacement marker to generate forms such as `காடு -> காடாக` and `குறைபாடு -> குறைபாடாக`; C8 uses the established `று -> ற` continuation for `ஆறு -> ஆறாக`.

The patch also adds a narrow C10 alternate-stem continuation for additive/translative forms such as `பொன் -> பொன்னும்` and `பொன் -> பொன்னாக`. This avoids the malformed double-pulli surface produced by literal suffixing and avoids broad changes to the existing `மாணவன்`-class rewrite rules.

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

Adds FST-backed analyses for reviewed tokenizer audit fallbacks such as `செயல்படுவது`, `தட்டுவது`, `மாற்றுவது`, `வாங்குவது`, and additive `வழிபடுவதும்`, exposed through the explicit `verbalnoun` FST tag. Rows whose bases still lack root/class coverage, such as `தெரிந்துகொள்வது` and `எளிதாக்குவதும்`, remain deferred.

### `0061-add-modern-present-finite-coverage.patch`

File: `fst/patches/0061-add-modern-present-finite-coverage.patch`

Adds FST-backed analyses for reviewed audit fallbacks `கூறுகின்றனர்`, `முற்படுகின்றனர்`, `என்கிறார்`, and `செல்கிறார்`. The patch uses class continuations for C3/C8 short honorific present forms, adds C5 `...கின்றனர்`, and classifies source-backed `முற்படு` as a C5 verb root. Deferred forms such as `தெரிந்துகொள்வது` and `எளிதாக்குவதும்` remain root/class acquisition gaps.

### `0062-add-modern-passive-perfect-neuter-coverage.patch`

File: `fst/patches/0062-add-modern-passive-perfect-neuter-coverage.patch`

Adds FST-backed passive-perfect neuter analyses for reviewed audit fallbacks `உயர்த்தப்பட்டுள்ளது`, `தெரிவிக்கப்பட்டுள்ளது`, `தொகுக்கப்பட்டுள்ளது`, and `பாதிக்கப்பட்டுள்ளது`. The new continuation emits explicit `passive+perfect` tags, so tokenizer output can preserve both `<VOICE_PASSIVE>` and `<ASPECT_PERFECT>`. Root/class gaps such as `இசையமைத்துள்ளார்` and `அறிவிக்கப்பட்டுள்ளது` remain deferred.

### `0063`-`0064` reviewed C11 verb roots and modern hooks

Files: `fst/patches/0063-add-reviewed-c11-verb-root-coverage.patch`, `fst/patches/0064-add-reviewed-modern-perfect-hooks.patch`

Adds a systematic C11 verb-root tranche for 49 Tamil Lexicon `*-வி-த்தல்` lemmas that were not recognized by the runtime FST, plus the reviewed corpus-backed compound root `இசையமை`. Representative generated analyses include `அறிவிக்கின்றன`, `அறிவித்தோம்`, `அறிவித்தது`, `விடுவித்தது`, and `தெளிவிக்க`. The modern-hook patch adds focused perfect/passive-perfect entries for audited forms `இசையமைத்துள்ளார்` and `அறிவிக்கப்பட்டுள்ளது`. Passive verbal-nominal negative forms such as `அறிவிக்கப்படுவதில்லை` remain deferred to the broader passive-rule lane.
### `0065`-`0070` class-level modern verb and function coverage

Files: `fst/patches/0065-add-class-level-modern-perfect-and-verbal-nouns.patch`, `fst/patches/0066-add-passive-verbal-noun-negative-rule.patch`, `fst/patches/0067-add-complementizer-and-quantifier-family-coverage.patch`, `fst/patches/0068-add-focused-causal-adverb-family.patch`, `fst/patches/0069-add-reviewed-modern-bare-infinitives.patch`, `fst/patches/0070-add-c11-passive-family-coverage.patch`

Adds broader class/rule coverage for modern Tamil verb forms that were previously represented by narrow hooks. C11 roots now generate modern perfects and verbal nouns such as `அமைத்துள்ளார்`, `சமைத்துள்ளது`, `அமைப்பது`, and `சமைப்பதும்`; C3/C5 roots generate verbal nouns such as `செல்வது`, `கூறுவது`, and `எழுதுவது`; passive stems generate verbal-noun negative forms such as `அறிவிக்கப்படுவதில்லை`, `வழங்கப்படுவதில்லை`, and `பயன்படுத்தப்படுவதில்லை`; and generated C11 passive-family coverage handles passive perfects such as `அனுமதிக்கப்பட்டுள்ளது` and `அழைக்கப்பட்டுள்ளது`. The tranche also adds reviewed bare-infinitive alternants `புரிய`, `அறிய`, and `விரிய`.

Function coverage is extended for complementizer case/additive/sandhi forms (`என்பதற்கு`, `என்பதில்`, `என்பதால்`, `என்பதன்`, `என்பதும்`, `எனச்`, `எனத்`), indefinite `ஏதாவது`, and focused causal deictic adverbs (`இதனால்தான்`, `அதனால்தான்`, `எதனால்தான்`) with explicit deictic/focus tags.
### `0072-add-nati-c4-root.patch`

File: `fst/patches/0072-add-nati-c4-root.patch`

Fixes the one concrete lemma-dictionary audit row in `explicit_lexc_but_not_runtime_analyzed`: `நடி`. Earlier patches added the derived modern infinitive hook `நடி:நடிக்க ModernBareInf`, so `நடிக்க` analyzed but bare root `நடி` still returned `+?`. This patch adds the real C4 root assignment `நடி C4Vinf;`, so both `நடி` and `நடிக்க` are runtime-analyzable.


### `0073-add-systematic-noun-root-candidates.patch`

File: `fst/patches/0073-add-systematic-noun-root-candidates.patch`

Adds a source-backed noun-root tranche from the lemma-dictionary audit. This generalizes the noun proposal tooling for recurring consonant-final classes and adds C14 retained-`ள்` roots such as `கடவுள்`, `இயற்கைப்பொருள்`, `மருமகள்`, `கருதுகோள்`, and `வேலையாள்`, plus C4 `ழ்` roots such as `சீழ்`, `பாழ்`, `மிதழ்`, and `பனிக்கூழ்`. Foreign/loan pulli-final nouns are intentionally deferred to a separate policy pass.


### `0074-add-systematic-c2-kkai-noun-roots.patch`

File: `fst/patches/0074-add-systematic-c2-kkai-noun-roots.patch`

Adds 227 multi-source C2 `...க்கை` noun roots from the unlabeled-predicted-noun audit bucket. Representative covered roots include `அறிக்கை`, `அவநம்பிக்கை`, `உடன்படிக்கை`, `காணிக்கை`, `கேளிக்கை`, `நல்வாழ்க்கை`, and `சொற்சேர்க்கை`; their case/additive forms are generated by the existing C2 noun rules.


### `0075`-`0076` systematic compound-head noun tranches

Files: `fst/patches/0075-add-systematic-c2-compound-head-nouns.patch`, `fst/patches/0076-add-systematic-c15-compound-head-nouns.patch`

Adds source-backed compound-head noun coverage from the unlabeled noun audit bucket. `0075` adds 1,052 C2 `ஐ`-final roots ending in productive heads such as `நிலை`, `மாலை`, `படை`, `சாலை`, `பலகை`, `கங்கை`, `வேலை`, `மலை`, `தலை`, `கடை`, `ரேகை`, `சிலை`, `தீட்சை`, and `பத்திரிகை`. `0076` adds 1,692 C15 `ம்`-final roots ending in heads such as `காலம்`, `தானம்`, `காரம்`, `சாரம்`, `துவம்`, `வாதம்`, `முகம்`, `மரம்`, `லோகம்`, `யோகம்`, `ஞானம்`, and `கணிதம்`.


### `0077`-`0078` follow-up high-confidence noun tranches

Files: `fst/patches/0077-add-high-confidence-c15-m-final-nouns.patch`, `fst/patches/0078-add-systematic-c2-head-family-nouns-2.patch`

Adds 89 multi-source high-confidence C15 `ம்`-final noun roots and 901 multi-source C2 head-family noun roots. Representative C2 heads include `சீலை`, `முல்லை`, `தொகை`, `கட்டை`, `பட்டை`, `கொட்டை`, `கீரை`, `கரை`, `துறை`, `பறை`, `பச்சை`, `திணை`, `தொடை`, `குடை`, and `தேவதை`; generated forms are produced by the existing C2/C15 noun rules.


### `0079-add-systematic-c2-head-family-nouns-3.patch`

File: `fst/patches/0079-add-systematic-c2-head-family-nouns-3.patch`

Adds 963 multi-source C2 noun roots from another productive head-family pass. Representative heads include `சேலை`, `சூலை`, `சோலை`, `லிகை`, `ரிகை`, `திரை`, `வித்தை`, `கோவை`, `வினை`, `முறை`, `பூசை`, `வேளை`, `கணை`, `துணை`, `பிழை`, and `வேதனை`; generated forms use the existing C2 noun rules.


### `0080-add-systematic-c15-nominal-head-nouns.patch`

File: `fst/patches/0080-add-systematic-c15-nominal-head-nouns.patch`

Adds 5,430 multi-source C15 noun roots from productive `ம்` nominal-head families in the unlabeled predicted-noun audit bucket. The selection is still class-based rather than a broad final-letter import: endings include `...க்கம்`, `...ட்டம்`, `...த்தம்`, `...ந்தம்`, `...ங்கம்`, `...ப்பம்`, `...ச்சம்`, `...ற்றம்`, `...ம்பம்`, `...ண்டம்`, and related `...னம்` / `...ணம்` / `...ியம்` heads. After rebuild, noun-recognized lemmas rose from 12,258 to 17,701 and direct FST-generated forms rose from 1,611,502 to 1,687,213. The compact browser dictionary remains headword-only at 128,990 entries.


### `0081-add-systematic-c11-tier1-verb-roots.patch`

File: `fst/patches/0081-add-systematic-c11-tier1-verb-roots.patch`

Adds 904 new C11 roots from the clean tier-1 lane of the `verb_c_rest_candidate` audit bucket. The proposal starts with Tamil Lexicon + Tamil Wiktionary citation lemmas ending in `...தல்` / `...த்தல்`, derives productive `...ி` stems, skips roots already present in the C11 lexicon, and leaves light-verb compounds/manual rows for later review. Examples include `அழைப்பித்தல் -> அழைப்பி`, `குறிப்பித்தல் -> குறிப்பி`, `அனுசந்தித்தல் -> அனுசந்தி`, and `விண்ணப்பித்தல் -> விண்ணப்பி`. After rebuild, C11 recognized lemmas rose from 763 to 911 and direct FST-generated forms rose to 1,797,449; the compact browser dictionary remains headword-only at 128,990 entries.


### `0082`-`0083` systematic C5 light-verb compounds

Files: `fst/patches/0082-add-systematic-c5-light-verb-compounds.patch`, `fst/patches/0083-add-systematic-c5-light-verb-compounds-c-rest.patch`

Adds the conservative multi-source subset of the light-verb compound lane: 352 C5 roots from Tamil Lexicon + Tamil Wiktionary citation lemmas ending in `...போடுதல்`, `...விடுதல்`, `...பண்ணுதல்`, `...ப்பண்ணுதல்`, and `...ப்படுத்தல்`. Examples include `அடிப்போடுதல் -> அடிப்போடு`, `கைவிடுதல் -> கைவிடு`, `அர்த்தம்பண்ணுதல் -> அர்த்தம்பண்ணு`, and `கட்டுப்படுத்தல் -> கட்டுப்படுத்து`. `0083` is a `verb-c-rest` companion patch because `0053` inserts `ModernBareInf` immediately before `ClassFive` in that component. Tamil-Lexicon-only light-verb rows remain deferred. After rebuild, `verb-c-rest` recognized lemmas rose from 2,054 to 2,067 and direct FST-generated forms rose to 1,827,142; the compact browser dictionary remains headword-only at 128,990 entries.


### `0084-add-c8-short-honorific-forms.patch`

File: `fst/patches/0084-add-c8-short-honorific-forms.patch`

Completes the C8 short-honorific table for the already-classified root `என்`. The class already generated long honorific/plural forms such as `என்கிறார்கள்` and other finite forms such as `என்கிறாள்` and `என்கிறது`; this patch adds the missing short `3sghe=ஆர்` present/future continuations, covering `என்கிறார்`, `என்கின்றார்`, and `என்பார்`. After rebuild, `verb-c-rest` generated forms rose by 9, direct FST-generated forms rose to 1,827,151, and the full generated dictionary rose to 1,935,018.


### `0085`-`0088` tier-2 and Lexicon light-verb roots

Files: `fst/patches/0085-add-systematic-c11-tier2-verb-roots.patch`, `fst/patches/0086-add-source-backed-c5-verb-roots-lexicon-light.patch`, `fst/patches/0087-add-source-backed-c5-verb-roots-lexicon-light-c-rest.patch`, `fst/patches/0088-add-systematic-c12-tier2-verb-roots.patch`

Adds the next batched verb tranche without importing another broad noun set. `0085` adds 18 tier-2 C11 roots from multi-source simple citation lemmas, such as `வாய்மொழிதல் -> வாய்மொழி` and `காதுகிழித்தல் -> காதுகிழி`. `0088` adds 21 tier-2 C12 roots, mostly `...மாதல் -> ...மா` stems such as `குணமாதல் -> குணமா`. `0086`/`0087` add 227 C5 roots: the remaining Tamil-Lexicon light-verb compound lane plus the multi-source C5 root `பிசாசாடுதல் -> பிசாசாடு`. The C5 patches are split so the `verb-c-rest` companion uses the local context around `LEXICON ClassFive`; entries are inserted inside `ClassFive`, not the preceding continuation lexicon. After rebuild, direct FST-generated forms rose to 1,851,556, heuristic forms rose to 1,505,784, and the full generated dictionary rose to 1,959,409.


### `0089`-`0093` remaining verbs and high-confidence C15 noun families

Files: `fst/patches/0089-add-source-backed-c11-remaining-verb-roots.patch`, `fst/patches/0090-add-source-backed-c12-remaining-verb-roots.patch`, `fst/patches/0091-add-source-backed-c5-remaining-verb-roots.patch`, `fst/patches/0092-add-source-backed-c5-remaining-verb-roots-c-rest.patch`, `fst/patches/0093-add-systematic-c15-high-confidence-m-final-nouns.patch`

Adds a larger combined tranche to reduce rebuild cycles. The verb patches start from remaining source-backed POS=`verb` citation lemmas, prefer C11/C12 over competing C5 stems for the same citation lemma, and prefer cleaner base-like C5 stems over duplicate participial-looking C5 stems. Final verb additions are 1,340 C5 roots, 448 C11 roots, and 129 C12 roots. The noun patch adds 2,665 C15 roots from Tamil Lexicon + Tamil Wiktionary `unlabeled_high_confidence_noun` rows ending in reviewed productive `ம்` suffix families such as `திரம்`, `பதம்`, `ரகம்`, `பலம்`, `சுரம்`, `கோலம்`, `புறம்`, and `நாயகம்`. After rebuild, noun-recognized lemmas rose to 20,368, `verb-c11` recognized lemmas rose to 967, `verb-c12` to 93, `verb-c-rest` to 2,191, direct FST-generated forms rose to 2,117,691, heuristic forms rose to 1,734,401, and the full generated dictionary rose to 2,222,707.


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

Adds the traditional dictionary citation `...தல்` verbal noun to the existing
C5 continuation. This class rule analyzes 4,997 current source lemmas through
already classified productive stems instead of adding duplicate roots or
surface-only exceptions. Runtime checks include `அச்சுறுத்துதல்`,
`அடைபடுதல்`, `அசைபோடுதல்`, `அடக்குப்பண்ணுதல்`, and `அசல்விடுதல்`, all with
`verbalnoun=தல்`. Controlled secondary-stem expansion is retained for runtime
citation analyses so direct recognition does not remove established passive or
light-verb coverage. C11/C12 citation allomorphs remain deferred for a narrower
split.

### `0125-add-c11-citation-verbal-nouns.patch`

Adds the canonical strong C11 `...த்தல்` citation verbal noun to `C11Vinf`,
covering 2,313 audited source lemmas through existing productive roots. Runtime
checks include `அகலித்தல்`, `அகங்கரித்தல்`, `உடுத்தல்`, `கிழித்தல்`, and
`உடாய்த்தல்`; plain C11 `...தல்` readings remain deferred. The generator now
explicitly keeps runtime `verbalnoun=தல்` lemmas in controlled secondary-stem
expansion, with `அங்கீகரிக்கப்படு` retained by the full-mode regression. After
rebuild, direct/controlled forms are 3,521,055, heuristic/secondary forms are
1,738,313, and the full generated dictionary is 3,552,166.

### `0126`-`0129` citation continuation batch

Files: `fst/patches/0126-add-c5-elided-citation-verbal-nouns.patch`,
`fst/patches/0127-add-c4-citation-verbal-nouns.patch`, and
`fst/patches/0129-add-c62-citation-verbal-nouns.patch`

Adds canonical C5 elided `...த்தல்`, plain C4 `...தல்`, and C62 `...உதல்`
continuations, covering 1,833 audited citation gaps through existing roots.
Runtime checks include `அஞ்சனம்பார்த்தல்`, `அடைவைத்தல்`, `அஞர்தல்`,
`கிழிதல்`, `இகுதல்`, and `தொகுதல்`. A proposed C3 rule was rejected because
the existing C3 rewrite produced `அகன்றல்`, not source citation `அகல்தல்`.

### `0130`-`0131` phonological and minor-class citation batch

Files: `fst/patches/0130-add-c12-phonological-citation-verbal-nouns.patch` and
`fst/patches/0131-add-minor-rest-class-citation-verbal-nouns.patch`

Adds a phonology-aware C12 continuation that preserves vowel-final `...தல்`
and doubles citation `த்` after consonant-final roots, plus canonical C1/C6
citation rules. The batch covers 137 audited gaps; runtime checks include
`இன்னாதாதல்`, `ஊட்டுமறத்தல்`, `கண்டந்திறத்தல்`, `செய்தல்`, `அழுதல்`,
`கடுதல்`, and `சாப்பிடுதல்`. C15/C18 proposals were rejected because their
existing class rewrites produce canonical `செத்தல்`/`வெந்தல்`. Current outputs
contain 3,525,719 generated forms, 1,742,650 heuristic/secondary forms, and
3,554,627 full dictionary entries.

### `0132` residual multi-source explicit nouns

File: `fst/patches/0132-add-residual-multisource-explicit-nouns.patch`

Adds 12 remaining multi-source roots with explicit noun readings through
established productive classes: three C1 `...பூ` compounds, two C2 roots, one
C4 root, one C7 root, and five C15 roots. Representative runtime checks are
`ஆறுமணிப்பூவை`, `நகைச்சுவையை`, `மறுகாலை`, `மூதை`, and `அச்சத்தை`. Current
outputs contain 3,525,956 generated forms, 1,742,650 heuristic/secondary forms,
and 3,554,850 full dictionary entries.

### Post-`0132` conservative stopping review

The refreshed source audit has 28,592 runtime lemma gaps. No further broad
automatic batch currently meets the coverage policy's high-confidence bar:

- The remaining `verb_c_rest_candidate` lane has 1,311 rows. About 790 have no
  recognized productive stem, 281 are plain `...தல்` readings attached to
  strong C11 roots where a global rule would overgenerate forms such as
  `படிதல்`, and the rest mix class assignments or noncanonical source variants.
- The 1,295 `unlabeled_high_confidence_noun` rows are all short `ஐ`/`ஆ`/`ஊ`
  final forms. Their score is driven by word shape, while samples mix names,
  interjections, archaic forms, lexicalized expressions, and multiple noun
  classes.
- Of 1,857 `unlabeled_predicted_verb` rows, 1,803 score below 0.85 and only
  three score at least 0.95; those three are low-support nominal/adjectival
  shapes without source verb POS evidence.
- `noun_root_candidate` is down to 105. Re-running the strict multi-source
  proposal with exact or hybrid noun POS produces zero patch-ready roots: four
  classifiable rows are explicitly held and six foreign-final loans still need
  manual class policy. The remaining 75 Vuizur-only rows do not meet the source
  threshold.

Further expansion therefore requires manual lexical policy, explicit source
POS evidence, or narrow root-specific review. The rejected C3/C15/C18 citation
prototypes remain documented as evidence against treating source citation
spellings as automatic class rules.

### `0133`-`0140` integrity and negative action-nominal batch

Files: `fst/patches/0133-fix-noun-encoding-and-sociative-rules.patch` through
`fst/patches/0140-normalize-particle-lexicon.patch`

The whole-system tokenizer/FST review found 3,400 applied non-NFC lexical
entries, 72 noun roots with literal ASCII `10` in place of the `ா` sign, and
a stray space that disabled the C4 and lexical-plural C5 `-ஓடு` sociative
continuation. The batch normalizes all compiled primary lexical sources,
repairs the unambiguous corrupt roots, and restores forms such as
`மறுகாலோடு`, `பலரோடு`, and `அகரப்பாவை`.

The verb patches add productive class-specific negative action nominals tagged
`+neg=ஆ+verbalnoun=மை`. Runtime checks include `செய்யாமை`, `செல்லாமை`,
`அடையாமை`, `படிக்காமை`, `குணமாக்காமை`, and `நகாமை`. These are verbal
nouns/action nominals, not ordinary finite verbs. Forty-five ambiguous
ASCII-damaged noun spellings were initially held rather than guessed.

The full build and dictionary build pass all regressions. Current artifacts
contain 2,078,162 direct runtime-union surfaces before heuristic expansion,
1,783,009 heuristic/secondary forms, 3,575,533 final generated forms, and
3,604,316 full dictionary entries. `fst_generation_audit.json` persists exact
per-model counts for future comparisons.

The external tokenizer review additionally reports 596,943 representative
paradigm probes with zero failures, 39 source-POS/runtime mismatches, 241
cross-model identical analysis overlaps, 191 repeated noun rows, and 27,394
repeated productive verb-subclass rows. These are review queues, not grounds
for deleting valid ambiguity.

### `0141`-`0143` lexical-integrity cleanup

Files: `fst/patches/0141-remove-corrupt-noun-lexemes.patch` through
`fst/patches/0143-remove-malformed-double-hyphen-noun.patch`

Exhaustive enumeration of every FST upper-side analysis found 50 emitted roots
containing ambiguous ASCII, legacy-byte, BOM, or Unicode format corruption.
Because their intended characters were not authoritative, `0141` removes 47
corrupt noun roots and `0142` removes three corrupt adjective entries rather
than guessing replacements. Patch `0143` removes the isolated malformed C7
root `கவின்மலர்கவின்--அழகு`.

The tokenizer preserves the remaining 154 valid single-hyphen expressions,
such as `நேருக்கு-நேர்` and `அக்கடா-என்று`, as single morphology spans. It
does not mechanically invent unhyphenated variants; those require independent
lexical or corpus evidence. Game-oriented playable dictionaries may exclude
hyphenated expressions while the shared morphology FST retains them.

The full FST and dictionary builds pass all regressions after the cleanup.
Tokenizer vocabulary enumeration reports 223,464 emitted lexical strings. The
frozen tokenizer vocabulary excludes all 78,570 FST-only productive composites
and contains 144,894 lexical tokens and 145,572 total tokens. The original
NFC/ASCII/control validator found zero corrupt emitted strings and the splitter
found zero unreachable strings across 41,400,562 upper
analyses. These emitted
strings are not all atomic linguistic lemmas: 78,619 belong to productive verb
compound subclasses. The tokenizer semantically decomposes all 78,570 FST-only
compounds using typed verbal-participle and infinitive links.
Productive passive `படு` is normalized to `<VOICE_PASSIVE>`; unique chains
recover the composite lemma directly and bounded variant tokens handle
collisions.
An exhaustive 3,784-entry raw-tag codebook replaces byte-expanded tag suffixes;
the maximum canonical key has 32 patterns, represented by 31 bounded non-default
variant tokens. Cleanup patches `0144`-`0155` remove 975 invalid first-order
and 580 transitively invalid productive expansions. The final audit has zero
unresolved FST-only connector or adjectival-participle compounds; 13
source-attested atomic readings remain lexical by policy.

A later tokenizer-side Tamil combining-mark grammar audit found an additional
inherited corruption class that NFC checks cannot detect: 874 emitted strings
contain a vowel sign immediately followed by pulli, including 91 atomic
vocabulary lemmas and 30 canonical compound bases. Examples include `உயா்`,
`சோ்த்து`, and `நிப்பாட்டு்`. The current artifacts are therefore not ready
for publication until these source families are corrected and rebuilt.

### `0156` missing C2 noun-homograph readings

File: `fst/patches/0156-add-missing-c2-noun-homograph-readings.patch`

The source-POS audit found 80 independently attested C2 nouns whose bare
surfaces were already recognized only as verbs or function words. The patch
adds noun paradigms for examples such as `கதை`, `அடை`, `உடை`, `குடை`,
`ஆடவை`, and `கிறி` without deleting any existing analysis. Forward checks
confirm nominative and accusative forms, and existing imperative readings
remain available. Runtime source-POS mismatches fall from 246 to 166.

The checksum-pinned tokenizer signature audit enumerates 41,400,562 upper
analyses and proves an exact inverse/forward round trip for all 3,784 raw-tag
patterns, with zero missing representatives and zero failures.

### `0157`-`0159` U-final noun realization and cardinal translatives

Patch `0157` corrects inherited noun-rule defects: C6TTU no longer generates
forms such as `மொட்ட்டை`, C6/C6TTU locative and ablative stems use the
strengthened oblique, and C8 retains `ற்` so `ஆறு+noun+acc` realizes as
`ஆற்றை`. Twenty-one already-geminated `-ன்று`/`-ற்று` roots move from C8 to
regular C7. Patch `0158` adds 49 reviewed multi-source noun homographs across
C1, C6, C6TTU, and C7 while preserving existing verb readings. Patch `0159`
adds cardinal translatives such as `ஆறாக`; the river-noun translative is
`ஆற்றாக`. The post-build paradigm audit passes all 596,674 probes.

### `0160`-`0161` residual noun-homograph readings

Patch `0160` adds 26 source-backed C2 nouns whose spelling collides with a
derived verb surface or adjective, including `அம்மி`, `இஞ்சி`, `ஊசி`,
`கத்தி`, `நெற்றி`, and `விசிறி`. Patch `0161` adds 31 reviewed nouns across
C4, C6TTU, C7, C8, and C15, including `நிழல்`, `பட்டு`, `ஆண்டு`, `சாறு`,
`திருட்டு`, `கொஞ்சம்`, and `வட்டம்`. Existing verb, adjective, and adverb
analyses remain available. Runtime source-POS mismatches fall from 117 to 60,
and all 596,943 paradigm probes pass.

The batch adds an explicit topology regression for C6TTU root placement:
roots belong in the top-level C6TTU list before `LEXICON C6SgRoot`, not in the
later continuation section named `LEXICON C6TTUSgRoot`.

### `0162`-`0172` final POS tranche and `நெய்` class correction

Patch `0162` adds 16 conservative noun homographs across established classes.
Patches `0163`-`0165` add C4 verb readings `இணர்`, `சுடர்`, and `நெய்`, the
weak C4 `நெய்த-` past realization, and explicit C5 citation stems `இலங்கு`
and `மென்னு`. Patch `0166` removes the incorrect strong C11 reading of
`நெய்`.

The class correction exposed compounds built from obsolete `நெய்க்க-` and
`நெய்த்த-` connectors. Patches `0167`-`0170` remove 19 first-order entries;
patches `0171`-`0172` remove the remaining eight passive/transitive
`நெய்க்கப்பட-` compounds. Per-model rejection fixtures now cover all 33
invalid simple and compound surfaces while positive fixtures retain
`நெய்தான்`, `நெய்கிறான்`, `நெய்வான்`, `நெய்தல்`, and `நெய்து`.

The final build contains 2,078,162 direct runtime-union surfaces, 1,783,009
heuristic/secondary forms, 3,575,533 generated forms, and 3,604,316 full
dictionary entries. Runtime recognizes 100,520 of 129,020 lemma-dictionary
entries. All 596,943 paradigm probes pass. The FST upper language contains
41,400,562 analyses and 223,464 emitted lexical strings; the tokenizer keeps
144,894 lexical tokens and 145,572 total tokens after decomposing all 78,570
FST-only productive compounds. Unresolved productive connectors are zero.

### Static word-list resource policy

The source build now maintains two distinct static dictionary artifacts:

- `public/tamil_dictionary.txt` is now a compact browser/client lookup dictionary. It is intentionally headword-oriented to keep the React download small; server-side FST validation handles generated inflections that miss locally. It still excludes sandhi-linker-only surfaces such as `எனக்`, `எனச்`, `எனத்`, `ஊராட்சித்`, and `ஊராட்சிக்குச்`.
- `static-word-list/full_tamil_dictionary.txt` is the comprehensive generated surface dictionary for regression tests, offline audits, and tokenizer provenance. It combines lexical sources plus FST-generated inflections while excluding sandhi-linker-only prose variants.
- `static-word-list/lemma_dictionary.txt` is a source headword/lemma inventory for tokenizer/root-lexicon use. It combines Tamil Lexicon, Tamil Wiktionary dump, and Vuizur headwords after the usual lexical filters and exclusions, but excludes generated inflected forms. Examples such as `மரம்`, `படி`, `என`, and `ஊராட்சி` are included; inflected/sandhi surfaces such as `மரங்களிலிருந்து`, `படித்தான்`, `எனக்`, and `ஊராட்சித்` are excluded.

The FSTs themselves should remain comprehensive for runtime analysis and LLM generation. Sandhi tags such as `+sandhik`, `+sandhic`, and `+sandhit` are retained in FST analyses so generation-aware tokenizers can emit bounded `<SANDHI_*>` tokens, but those forms are filtered out of generated static word-list/dictionary artifacts.
## Invalid ambiguity cleanup: ஆற்றை and இது

Patch `0173-reclassify-aar-as-direct-oblique-noun.patch` moves `ஆர்` from
C16, whose optional `ற்ற` oblique is valid for nouns such as `சுவர்`, to C4's
direct case paradigm. This preserves `ஆர்`, `ஆரை`, `ஆரால்`, `ஆருக்கு`, and
`ஆரின்`, while removing the invalid `ஆர்+noun+acc -> ஆற்றை` relation. The
finite prebuilt pronoun cleanup also removes only
`இது+pron+dem+prox+pl+2sgn+nom -> இது`; singular `இது` and plural `இவை`
remain. Model-specific exact negative-analysis regressions enforce both
constraints.
## Patch 0174: modern present human plural

The pinned full Mozhi corpus audit identified a class-wide missing
`-கின்றனர்/-க்கின்றனர்` continuation. Six component-specific patches add the
simple-present `3ple=னர்` path across all verb classes, preserve the distinct
singular-epicene `3sge=அர்` `-கின்றர்` path, and correct existing plural
surfaces mislabeled as singular. Exact regressions cover C3, C4, C11, C12,
C6.2 and c-rest. Generated forms rose to 3,576,209 and the full dictionary to
3,604,991.
## Patch 0175: licensed passive-stem continuation completion

Patch `0175` adds shared negative, perfect adjectival-participle, perfect
short-human-plural, present short-human-plural and past short-human-plural
continuations only to the 3,109 already licensed `ClassPadu61` passive stems.
It also retags `-ப்பட்டனர்` from singular `3sge` to plural `3ple`. The pinned
Mozhi rerun recovered 77 surface types and 191 occurrences without deriving
new passive stems. Generated forms are 3,581,627 and the full dictionary is
3,610,409.
## Patch 0176: exhaustive `-னர்` agreement cleanup

Six component-specific patches retag every valid verb continuation realized in
`-னர்` from singular `3sge=அர்` to plural `3ple=னர்`. They also remove
malformed `-கிறனர்/-க்கிறனர்` rule shapes. Representative regressions protect
`வந்தனர்`, `உள்ளனர்`, `படிக்கின்றனர்`, and `அனுப்பப்பட்டனர்`, while
rejecting `படிக்கிறனர்`. Generated forms are 3,576,461 and the full dictionary
is 3,605,243 after invalid-form removal.

### Patches 0177-0178: closed classes and reviewed news nouns

Patch `0177` completes high-frequency interrogative/deictic quantifier and
pronoun families as closed-class analyses. Patch `0178` adds 20 manually
reviewed news noun roots to existing C2, C7, and C15 paradigms. Dry compilation
held `கிராம்` and `முகாம்` because ordinary C15 generates malformed
`கிராத்தில்`/`முகாத்தில்`; a retained-final-`ம்` subclass is required.

The two patches recover 110 saved full-corpus unknown types and 1,037
occurrences, including 98 types and 869 occurrences in news. Generated forms
are now 3,576,928, the full dictionary has 3,605,680 entries, and tokenizer
vocabulary validation reports zero blocking lemma issues.

### Patch 0179: retained-final-`ம்` nouns

Patch `0179` assigns `கிராம்`, `முகாம்`, and `கிலோகிராம்` to the existing C4
consonant-retaining paradigm and removes the old C15 assignment for
`கிலோகிராம்`. Correct forms include `கிராமை`, `முகாம்கள்`, `முகாமில்`, and
`கிலோகிராம்கள்`; malformed C15 outputs such as `கிராத்தை`, `முகாங்கள்`, and
`கிலோகிராங்கள்` are rejected. `இஸ்லாம் -> இஸ்லாத்தில்` remains C15 as a
lexical contrast. Generated forms are 3,576,985 and the full dictionary has
3,605,735 entries.

### Patch 0180: legacy retained-final-`ம்` cleanup

Patch `0180` moves `அட்டகிராம்`, `அஷ்டகிராம்`, and `சீக்கிராம்` from C15 to
the consonant-retaining C4 paradigm after individual Tamil Lexicon/Wiktionary
review. Correct retained forms replace malformed C15 outputs such as
`அஷ்டகிராங்கள்` and `சீக்கிராத்தை`; the separate C15 contrast
`இஸ்லாம் -> இஸ்லாத்தில்` remains intact. Generated forms are 3,577,015, the
full dictionary has 3,605,765 entries, and exhaustive FST analyses decrease by
72 to 41,147,326 without changing the 145,574-token vocabulary.

### Patch 0181: long-vowel retained-final-`ம்` nouns

Patch `0181` moves eight evidence-backed loans, names, and places to C4 and
preserves dual C4/C15 paradigms for corpus-variable `இஸ்லாம்` and `இசுலாம்`.
Generated forms are 3,577,130 and the full dictionary has 3,605,881 entries.

### Patches 0182-0183: productive noun `எல்லாம்`

Patch `0182` adds singular and plural `+all` continuations across every noun
class and removes two phrase-like atomic roots. Patch `0183` extends the common
pulli rewrite to dependent `ெ`, producing `மரமெல்லாம்`, `காலெல்லாம்`,
`கண்ணெல்லாம்`, `பொருளெல்லாம்`, and `மாணவனெல்லாம்` without surface-specific
entries. Runtime coverage gains 253,112 analyses; static generated forms remain
3,577,130 by policy. The vocabulary is 145,572 after redundant atomic removal.

### Patch 0184: retained-`ம்` name, title, and classical noun

Patch `0184` moves personal name `அக்கீம்`, noun/adjective homograph `தீம்`,
and lexicalized book title `வாக்குண்டாம்` from C15 to C4. Correct retained
forms replace malformed `அக்கீத்தை`, `தீத்தை`, and `வாக்குண்டாத்தில்`.
Generated forms are 3,577,159, the full dictionary has 3,605,910 entries, and
exhaustive analyses are 41,400,562.

### Patch 0185: modern present adjectival participles

Patch family `0185` adds 35 missing short `-கிற/-க்கிற` present
adjectival-participle continuations across all six verb components. Each rule
is paired with an existing `-கின்ற/-க்கின்ற` continuation in the same LexC
block, so the patch completes an established realization contrast without
adding lexical roots. It covers simple and complex paradigms, including
`என்கிற`, `வருகிற`, `இருக்கிற`, `படிக்கிற`, and passive
`செய்யப்படுகிற`.

Generated forms are 3,591,823, the full dictionary has 3,620,574 entries, and
the exhaustive FST language contains 41,493,528 analyses. All source
regressions and 3,801 reversible signature patterns pass. The tokenizer
vocabulary remains 145,572 tokens.

### Patch 0186: regular modern verbal nouns

Patch family `0186` adds positive `-வது` and additive `-வதும்` continuations
to the already licensed C1, C2, C4, C6.1/C6.3, and C6.2 simple paradigms.
Examples include `அழுவது`, `கொள்வது`, `அணிவதும்`, `இடுவது`, `பெறுவது`,
and `நகுவது`. Ten class rules are added with no new lexical roots.

Generated forms are 3,592,538, the full dictionary has 3,621,287 entries,
and the exhaustive FST language contains 41,494,422 analyses. All 3,805
signature patterns round-trip exactly; tokenizer vocabulary remains 145,572.

### Patch 0187: C12 and reviewed auxiliary verbal nouns

Patch `0187` adds regular C12 `-வது/-வதும்` forms such as `வெளியாவது` and
`குணமாவது`, plus typed verbal-noun continuations for aspectual `விடு`,
attitudinal `போ/போடு`, nonattitudinal `இடு`, and passive `படு`. Eleven rules
are added with no new roots.

Generated forms are 3,596,810, the full dictionary has 3,625,558 entries, and
the exhaustive language contains 41,527,535 analyses. All 3,814 signature
patterns round-trip; vocabulary remains 145,572 tokens.

### Patches 0188-0189: Class 13 and passive honorific completion

Patch `0188` replaces lossy Class 13 roots with lexical:surface mappings,
retaining lemmas `ஆகு` and `உண்டாகு`, and adds five modern `-ஆகு` roots plus
missing long-present and verbal-noun continuations. Patch `0189` adds short
honorific `-ப்படுகிறார்` only to the declared `+complex+passive` class.
Ordinary simple verbs ending in `படு` are not treated as passive evidence.

Generated forms are 3,597,958; the full dictionary has 3,626,711 entries; the
runtime upper language has 41,531,090 analyses. All source regressions pass,
including 194 verb forward checks and 33 rejected verb forms.

### Patches 0190-0192: perfect auxiliaries and orthographic cleanup

Patches `0190`-`0191` add typed passive/C11 perfect participles, including
explicit `aux=இரு` for `-ப்பட்டிருந்த/-த்திருந்த`. Patch family `0192`
repairs malformed Tamil combining sequences in five runtime LexC components,
deduplicating corrected rows and rejecting the corrupt spellings in regression
fixtures.

Generated forms are 3,607,936 and the full dictionary has 3,636,674 entries.
All full-mode checks pass: 108 inverse checks, 212 accepted verb regressions,
42 rejected verb regressions, and zero leaked malformed Tamil sequences.

### Patches 0193-0195: deduplication, rule repair, and exceptions

Patch family `0193` removes 30,334 exact same-section/same-continuation LexC
duplicates. Pre/post minimized relation counts are identical for noun, C4,
C11, C12, and rest. Patch `0194` gives active C3/C12 rules unique names; C3 is
language-equivalent, while C12 now realizes the formerly shadowed
`-இருக்கும்/-இருக்காதே` family correctly. Patch `0195` adds exceptional
`பிற+quant+det`, `உள்+exist`, and `இல்+noun+nom` readings without licensing a
false productive paradigm for `இல்`.

Generated forms are 3,607,932 and the full dictionary has 3,636,670 entries.
All source regressions pass: 96 inverse, 108 noun-forward, 214 verb-forward,
211 miscellaneous, 44 rejected verb, and 40 other rejected checks. The full
system passes 597,006 paradigm probes with zero failures.

The 250 cross-model identical-analysis surfaces have also been closed as a
reviewed set. Their 260 raw groups are exclusively verb-class syncretism: 231
bare imperatives and 29 other convergent finite/nonfinite cells. Distinct class
ownership must remain because the nonshared paradigm cells differ. Validation
now blocks any new cross-model overlap involving a non-verb model or an
unreviewed tag shape.

### Patch 0196: strict ending-family noun coverage

Patch `0196` adds ten reviewed nouns to invariant established paradigms: three
`-வியல்` C4 roots, `கருப்பு` in C7, and six `-ியம்` C15 roots. Seven adjacent
gaps are explicitly excluded as malformed source spellings or adjective/numeral
policy cases. Generated forms are 3,608,108 and the full dictionary has
3,636,836 entries. Source regressions pass with 120 noun-forward and 47
rejected noun checks; the full paradigm audit passes 597,046 probes.

### Patch 0197: residual explicit noun decisions

Patch `0197` reviews all 94 residual explicit noun candidates. Forty-one roots
are added across seven established classes and pass 123 targeted paradigm
probes; 53 are held for lexical, POS, name, fragment, or loan-class reasons.
Generated forms are 3,608,914 and the full dictionary has 3,637,601 entries.
The full system passes 597,210 paradigm probes with zero failures.

### Patch 0198: C11/C4 citation correction

Patch `0198` reviews 263 C11 stems contradicted by plain `-தல்` citations.
It reclassifies 223 to C4 and preserves C4+C11 ambiguity for 40 stems with both
plain and strong citations independently sourced. Generated forms are
3,616,489 and the full dictionary has 3,644,911 entries. All source regressions
and 597,261 full-system paradigm probes pass.

### Patch 0199: C5/C11 strong-citation correction

Patch `0199` adds C11 for 143 strong `-த்தல்` roots, moving 142 from C5 while
preserving valid weak/strong `பொறு` ambiguity. Generated forms are
3,616,210 and the full dictionary has 3,644,492 entries. All source regressions
and 597,261 full-system paradigm probes pass.

### Patch family 0200: analyzed-stem citation closure

Patch family `0200` closes all 95 residual citations whose candidate stem was
already runtime-analyzed. Seventy-seven receive established subclass citation
continuations or bounded lexical readings; 18 surface-to-lemma collisions are
documented holds. Four C3 literal `-ல்தல்` citations are finite pairs unioned
at the final grammar expression because the legacy global `ல்த -> ன்ற` rule
would otherwise rewrite their surfaces. Ordinary C3 morphology remains intact.

Generated forms are 3,620,212 and the full dictionary contains 3,648,412
entries. The compiled language has 41,594,407 upper analyses. All source
regressions and 597,263 full-system paradigm probes pass. The residual citation
queue is 794: 18 reviewed collisions, 564 multisource opaque/missing roots, 200
single-source opaque/missing roots, and 12 noncanonical citations.

### Patch 0201: dual-source known-head compound inheritance

The residual-citation structure audit identifies joined compounds separately
from missing simple roots. Patch `0201` adds 195 dual-source compound stems only
when a multi-grapheme right-hand head has an exact matching runtime citation and
unique established class ownership. Of these, 176 inherit C4 and 19 inherit
C1, C5, or C6. Another 104 known-head compounds remain held because evidence
is single-source, the detected head is too short, or class ownership is not
unique.

Generated forms are 3,646,346 and the full dictionary has 3,674,347 entries.
The compiled language contains 41,623,836 upper analyses, and all 597,458
paradigm probes and source regressions pass. The citation queue is now 595.

### Patch 0202: participial `போ` compounds

Patch `0202` adds 40 joined `போ` stems whose prefix is independently analyzed
as a verbal participle. They use the established `ClassPo5` semantic subclass;
nominal/case motion prefixes and unresolved prefixes remain held. Generated
forms are 3,646,507 and the full dictionary has 3,674,467 entries. The compiled
language contains 41,629,596 upper analyses, and all 597,498 paradigm probes
and source regressions pass. The residual citation queue is 557.

### Patch 0203: joined `செய்` light-verb compounds

Patch `0203` adds 108 joined `செய்` stems whose modifier has an independent
runtime lexical analysis. The stems inherit C1 realization; tokenizer release
data separately preserves modifier lemma, light-verb boundary, and `செய்`.
Generated forms are 3,660,411 and the full dictionary contains 3,688,259
surfaces. The compiled language has 41,645,904 upper analyses, and all 597,606
paradigm probes and source regressions pass. The residual citation queue is 451.

### Patch 0204: source-backed noun-modifier `செய்` compounds

Patch `0204` reviews all 35 joined `செய்` citations whose modifier is present
in the source lemma union but not runtime-analyzed. Fourteen dual-source
modifiers with independent noun-class evidence enter C1; the other 21 remain
documented holds. Examples include `உரஞ்செய்தல்`, `உரஞ்செய்தான்`, and
`சேமஞ்செய்கிறான்`.

Generated forms are 3,662,217, heuristic secondary forms are 1,866,783, and
the full dictionary contains 3,690,050 surfaces. The compiled language has
41,648,018 upper analyses; all 597,620 paradigm probes and source regressions
pass. The residual citation queue is 437.

### Patches 0205-0206: irregular `நில்` and reviewed `போ` connectors

Patch `0205` introduces a dedicated irregular `நில்` class with separate
`நின்-`, `நிற்-`, and `நில்-` surface allomorph branches. It covers the
finite, nonfinite, negative, and verbal-noun paradigm without forcing the root
through regular C10. Source regressions recognize `நின்றான்`, `நின்று`,
`நிற்கிறான்`, `நிற்பான்`, `நிற்றல்`, and `நில்லாமை`, while rejecting
`நில்கிறான்`, `நிற்றான்`, and `நின்றுகிறான்`.

Patch `0206` adds `கேட்டுப்போ` and `வரப்போ` through ClassPo5 after runtime
evidence distinguishes a participial connector from an infinitival connector.
Generated forms are 3,662,291, heuristic secondary forms remain 1,866,783,
and the full dictionary contains 3,690,117 surfaces. The compiled language has
41,648,394 upper analyses; all 597,623 paradigm probes and source regressions
pass. The residual citation queue is 434.

### Patches 0207-0208: derived action-nominal paradigms and `நின்றுபோ`

Patch `0207` adds 404 parallel derived readings over 401 action-nominal
surfaces. Each mapping inherits the nominal's proven C2, C4, or C7 inflection
subclass, so case-inflected forms retain the base verb, verbal-noun derivation,
polarity, number, case, clitic, and postposition tags. Ordinary noun readings
remain available for genuine lexical ambiguity. The irregular C12 `ஆல்` row
is held because its existing noun paradigm emits suspect `ஆல்லை` and requires
a separate realization correction.

Patch `0208` adds `நின்றுபோ` through ClassPo5 after `நின்று` became available
from the reviewed irregular `நில்` paradigm. Generated forms are 3,662,292,
heuristic forms remain 1,866,783, and the full dictionary contains 3,690,117
surfaces. Runtime recognizes 101,477 of 129,020 source lemmas. The compiled
language contains 41,733,936 upper analyses; all 4,618 exact signature patterns
round-trip and all 597,624 paradigm probes pass. The residual citation queue is
433.

### Patch 0209: long-vowel `ஆல்` noun reclassification

Patch `0209` resolves the one action-nominal hold and corrects its underlying
noun class. C12 is the short-final-`ல்` doubling/`ற்` alternation class
(`கல் -> கல்லை/கற்கள்`), but long-vowel `ஆல்` had been assigned there and
generated malformed `ஆல்லை/ஆற்கள்`. It now follows retained-`ல்` C4 like
`கால்` and `நூல்`, producing `ஆலை`, `ஆல்கள்`, `ஆலால்`, `ஆலுக்கு`, and
`ஆலில்`. The patch also adds the parallel
`ஆ+verb+nonfin+sim+verbalnoun=தல்` case paradigm while retaining the ordinary
noun reading.

Generated forms are 3,662,290, heuristic forms remain 1,866,783, and the full
dictionary contains 3,690,115 surfaces. Runtime recognizes 101,477 of 129,020
lemmas. The compiled language contains 41,734,147 upper analyses; all 4,618
exact signature patterns round-trip and all 597,624 paradigm probes pass.
Source regressions include 102 inverse noun checks, 125 accepted noun forms,
and 49 rejected malformed forms with zero leakage.

## Final structural and citation review (`0210`-`0216`)

The final pre-evaluation batch removes the remaining duplicate LexC section
ownership. Noun entry consolidation is relation-equivalent; the C6.1/C6.3
split removes exactly 1,118 cross-class realizations; and the redundant C12
`இரு` block removes 441,504 mislabeled `complex+mood` analyses while retaining
the matching `complex+aspect` relation in every case.

Fourteen independently attested regular roots and the bare Class13 `ஆகு`
surface are added. All 433 pre-batch residual citation rows now have terminal
decisions; missing `-தல்` citations without paradigm evidence remain explicit
holds rather than speculative productive verbs.

The completed build contains 3,663,255 generated forms, including 1,867,586
controlled heuristic forms, and 3,691,059 full-dictionary surfaces. Runtime
recognizes 101,498 of 129,020 source lemmas. All 597,638 paradigm probes and
all 4,474 exact signature round trips pass. The live citation queue is 418,
with every row explicitly held pending stronger paradigm evidence.

### Patches 0217-0220: copular adjectival-participle coverage

The post-freeze corpus audit identified a coherent `-ஆன` family that should
not be stored as opaque adjective strings. Patch `0217` adds 483 reviewed
nominal predicates and preserves the noun lemma plus nominative, copula, and
adjectival-participle structure. Patch `0218` extends all 44 plain noun dative
continuations, including plural and oblique variants. Patch `0219` adds the
same construction for 42 established cardinal lemmas while excluding
attributive `ஒரு`. Patch `0220` adds six closed deictic/manner adverb bases.

The rebuilt artifacts contain 3,663,300 generated forms, 1,867,586 controlled
heuristic forms, and 3,691,059 full-dictionary entries. The compiled runtime
language contains 41,626,184 upper analyses. Source regressions pass with 102
inverse checks, 125 accepted forward checks, 287 verb checks, 226 miscellaneous
morphology checks, and zero rejected-form leakage.

Proper-name/entity resources remain outside the Scrabble-valid common-word
language. The tokenizer's optional gazetteer and future proper-name FST must
not be imported into Solladukku playable-word validation.

### Patches 0221-0225: final systematic morphology batch

Patch `0221` replaces the global C14 final-`ள் -> ட்கள்` plural with explicit
alternating, retained, dual, and singular-only continuations. Of 2,603 C14
roots, 44 license the alternating plural, 283 license both realizations, 514
retain `ள்`, 1,761 remain singular-only pending lexical evidence, and
`ஒலிநூல்` moves to final-`ல்` C4. Correct pairs such as
`பொருட்கள்/பொருள்கள்` and `நாட்கள்/நாள்கள்` remain; malformed forms such as
`மேற்கோட்கள்`, `கடவுட்கள்`, and `மகட்கள்` are rejected.

Patch `0222` repairs malformed upstream ordinals and adds reviewed modern
`-ஆம்` forms for 1-20. Patch `0223` adds 17 source-backed attributive stems.
Patch `0224` adds 18 corpus-backed passive stems only after verifying an
independent active-prefix infinitive analysis. Patch `0225` adds bounded
demonstrative, interrogative, quantifier, and temporal paradigms.

The release generates 3,660,913 forms, including 1,867,817 controlled
heuristic forms, and builds a 3,688,646-entry full dictionary. Runtime
recognizes 101,569 of 129,020 source lemmas. All 592,531 paradigm probes pass;
strict-family outliers, unresolved POS decisions, non-NFC entries, ASCII
lexemes, duplicate noun assignments, and duplicate verb entries are all zero.
Source regressions pass with 102 inverse checks, 125 noun checks, 297 verb
checks, 246 exact morphology checks, and no forbidden-form leakage.

Proper-name/entity resources remain tokenizer-only and are not part of
Scrabble word validity.

### Patches 0226-0229: corpus-attested verb correction batch

Patch `0226` moves 54 corpus-attested `-ிடு` roots plus `கேள்விப்படு` from C5
to C6.1 and moves `நடி` from C4 to C11. The corrected models accept
`வெளியிட்டான்`, `கணக்கிட்டேன்`, `கேள்விப்பட்டான்`, and `நடித்தான்`, while
rejecting the former weak outputs `வெளியிடினான்`, `கேள்விப்படினான்`, and
`நடிந்தான்`. `கண்டறி` receives its verified C4 paradigm and bare infinitive.

Patch `0227` adds 46 corpus-supported common roots across C11, C4, C1, C2,
C5, C6.1, and C6.3. Patch `0228` completes suppletive `தா -> தரு` nonpast
forms and modern `தா/வா` verbal nouns. Patch `0229` adds 24 verified passive
stems and a generated passive-perfect hook for each stem.

The release generates 3,663,731 forms, including 1,868,346 controlled
heuristic forms, and builds a 3,691,441-entry full dictionary. Runtime
recognizes 101,591 of 129,020 tokenizer source lemmas. Source regressions pass
with 102 inverse checks, 125 noun checks, 325 accepted verb checks, 59 rejected
verb checks, 246 exact morphology checks, and no forbidden-form leakage. The
compiled language contains 41,482,537 upper analyses, and every one of the
4,493 exact signature patterns has a successful inverse/forward witness.

### Patches 0230-0236: productive continuation release

This batch adds seven bounded relation families rather than more broad lexical
imports: noun and pronoun case continuations, reported complements, verb
nonfinite sandhi, modifier sandhi, closed-class continuations, and full case
paradigms for clausal verbal nouns. Representative accepted forms include
`மரத்தைக்`, `நானும்`, `எனப்`, `அனைத்துப்`, `நன்றாகப்`, `உள்ளதாக`,
`வழங்குவதில்`, and `செய்ததால்`. Their analyses retain the underlying lemma
and every productive case, clitic, sandhi, tense, and derivational tag.

The release generates 5,329,823 forms, including 3,501,718 controlled
heuristic forms, and builds a 5,357,525-entry full dictionary. Runtime
recognizes 101,599 of the 129,032-lemma combined tokenizer source union. Source
validation passes 102 inverse checks, 125 accepted noun forms, 325 accepted
and 59 rejected verb forms, 269 exact morphology checks, 49 rejected
morphology forms with zero leakage, and every dictionary-generation gate. The
compiled language contains 88,663,520 upper analyses; all 9,030 exact
signature patterns have successful inverse/forward witnesses.

Proper-name/entity gazetteers remain tokenizer-only and are not Scrabble-valid
lexical coverage. The remaining source and corpus gaps must be admitted only
after a family-level rule or subclass boundary is demonstrated; surface suffix
shape or a desire to reduce the unknown counter is not sufficient evidence.

### Patches 0237-0242: productive-relation consistency

This batch fixes C3 short-root future gemination, adds reviewed pronoun focus
relations and `எனவும்`, synchronizes passive-perfect agreement/hooks, and
canonicalizes ordinary passive upper lemmas to proven active lemmas. Of 3,010
licensed passive bases, 2,993 use independently analyzed active infinitives and
17 remain explicit historical/lexicalized holds. Patch `0242` removes 76
orphan perfect hooks and 2,812 invalid paths.

The static generator now emits licensed passive templates from canonical active
lemmas. The release contains 5,736,805 generated forms, including 3,901,005
controlled heuristic forms, and a 5,764,505-entry full dictionary. All source
regressions pass, including 279 exact morphology checks and the full-mode
dictionary gate.

The productive-relation audit reports 6,007 passes, zero defects, and 17 review
keys. Ordinary and perfect passive inventories both contain exactly 3,010
bases. All 592,549 general paradigm probes pass; no unresolved POS mismatch or
strict-family outlier remains. The compiled language contains 88,722,912 upper
analyses and all 9,434 reversible signature patterns have witnesses.

### Patches 0243-0249: lexical-head inheritance and irregular `போ`

This batch corrects 920 known-head entries that had been grouped under C5
instead of inheriting the class of their final lexical verb. Heads ending in
`படு/போடு/விடு/யிடு` now use C6.1, `கொடு` uses C11, `பெறு` uses C6.3, and
`கொண்டிரு` uses C12. It removes 888 incorrect C5 readings, relocates 30
existing C6.1 entries, corrects two external C11 assignments, and synchronizes
96 dependent infinitive/participial compound relations. Seventeen reviewed
passive holds now expose explicit canonical active lemmas.

Standalone `படு` and `விடு` deliberately retain both C6.1 and C11 readings:
`படுகிறான்/பட்டான்` contrast with `படுக்கிறான்/படுத்தான்`, and
`விடுகிறான்/விட்டான்` contrast with `விடுக்கிறான்/விடுத்தான்`. These are
required lexical ambiguities, not duplicate errors. Patch `0249` completes the
suppletive `போ` paradigm with 149 rules, accepting `போனேன்`, `போகிறேன்`,
`போவேன்`, `போவது`, `போகாமல்`, `போனால்`, and `போய்` while rejecting
`போினேன்` and `போி`.

The full release contains 5,724,099 generated forms, including 3,888,775
controlled heuristic forms, and 5,751,832 dictionary surfaces. Source and
full-mode dictionary regressions pass. The productive-relation audit is
6,043/6,043, all 592,528 paradigm probes pass, and all 9,434 signature
patterns have round-trip witnesses across 88,696,176 compiled analyses.

The structural inventory now compares complete upper/lower lexical mappings.
The former 131-row duplicate report was a false positive caused by collapsing
distinct passive lower allomorphs onto one upper lemma; exact duplicate rows
are zero. All 281 identical cross-model analysis groups are reviewed
verb-class syncretism across 271 surfaces, with zero blocking groups.

### Patches 0250-0257: agreement completeness and derived nominals

This batch repairs the C13 `ஆகு` paradigm, irregular finite-neuter readings,
and missing agreement cells across the regular and irregular verb classes.
Short honorific `-ஆர்` forms now carry `3sghe=ஆர்`, not the incompatible
plural realization tag. A 34-cell diagnostic exercises 397,329 class-member
rows and reports zero missing cells; all 592,474 broader paradigm probes pass.

Derived C4 action nominals now have an explicit empty-surface nominative
continuation. Thirteen verb-only citation surfaces therefore no longer need an
ordinary C4 noun root; `மதித்தல்` retains its derived verbal-noun and case
analyses, while lexicalized `நெய்தல்` keeps its independently valid noun
reading. The resulting live overlap audit has zero explicit verb-only
redundant noun roots.

The compound stems `நாகரீகம்விடு` and `நூதனம்விடு` retain both justified
classes: C6.1 licenses `...விடுதல்/விட்ட-`, while restored C11 licenses the
source-attested `...விடுத்தல்/விடுத்த-`. This is required paradigm ambiguity,
not duplicate coverage.

The exhaustive build emits 5,740,248 generated/secondary forms, including
3,904,489 controlled heuristic forms, and builds 5,767,973 dictionary
surfaces. Runtime recognizes 101,577 of 129,020 lemma-dictionary entries. All
source and full-mode dictionary regressions pass, including 320 exact
morphology checks and zero forbidden-form leakage.

All 6,043 productive-relation checks pass. The compiled language contains
88,715,067 analyses. Its tokenizer-side exact reversible inventory has 4,128
semantic keys and 9,441 raw-tag patterns, all
with successful inverse/forward witnesses. Cross-model review contains 280
expected syncretism groups across 270 surfaces and zero blockers.

### Patch 0258: canonical C13 nonfinite restoration

The pinned corpus regression comparison showed that removing the invalid C5
`ஆ` root had displaced valid `ஆகு` nonfinite variants. Patch `0258` restores
`ஆதல்`, class-wide `-ஆகின்ற` present adjectival forms, and standalone literary
`ஆலாம்`, all with canonical lemma `ஆகு`. Negative regressions retain rejection
of `ஆப்`, bare `ஆக்`, whitespace-fragment `உண்டாக்`, and invalid compound
`உருவாலாம்`.

The full build produces 5,740,253 generated/secondary forms, including
3,904,492 controlled heuristic forms, and 5,767,976 dictionary surfaces.
Runtime recognizes 101,579 of 129,020 dictionary lemmas. Source regressions
pass with 353 accepted and 72 rejected verb checks and zero forbidden-form
leakage.

All 592,474 paradigm probes, 397,329 class-matrix rows, and 6,043 productive
relation checks pass. The compiled language contains 88,715,082 analyses and
all 9,441 exact signature patterns round-trip. On the pinned Mozhi corpus,
325,753 of 529,306 Tamil spans analyze; unknown fallback is 202,095
occurrences and 116,848 unique surfaces.

### Patches 0259-0265: contradicted assignments and bounded coverage

Patches `0259`-`0261` remove 28 citation-contradicted C-rest, C11, and C4
assignments after a complete 316-lemma multi-class review. The unresolved
syncretic root `வல` remains held rather than being forced into one class.

Patch `0262` adds an evidence-bounded compound-modifier continuation for 385
existing C15 nouns, preserving canonical lemmas in relations such as
`உலகம்+noun+compoundmodifier -> உலக`. Patch `0263` completes 50 reviewed
pronoun relations for `-உடைய`, formal neuter accusatives, and dative
adjectivals. Patch `0264` adds locative-copular adjectivals across 42 noun
continuations. Patch `0265` adds a small reviewed modern noun/loan inventory
and canonical human plurals for `போலீஸ்/பொலிஸ்`.

The source FST and exhaustive dictionary builds pass. Source regressions pass
102 inverse, 125 noun, 353 accepted verb, 72 rejected verb, 332 miscellaneous,
and 49 forbidden-form checks with zero leakage. The exhaustive inventory has
5,734,745 generated/secondary surfaces, including a 3,898,755-form controlled
heuristic subset, and the full dictionary has 5,762,434 surfaces. Runtime
recognizes 101,613 of 129,020 source lemmas.

All 9,481 tokenizer-side exact signature patterns have inverse/forward
witnesses. On the unchanged pinned Mozhi corpus, analyzed spans rise from
325,753 to 334,225 of 529,306; unknown fallback falls from 202,095 to 193,646
occurrences and from 116,848 to 116,322 unique surfaces.

### Patches 0266-0271: productive perfect, nominal, noun, and closed-class coverage

This batched release adds modern present-perfect and short-past plural rules
across all six verb models, class-aware noun vocatives and plural
translatives, a clean pronoun-focus relation, complete reviewed human
quantifier paradigms, the C11 `-க்காத` negative adjectival allomorph, and
productive human/neuter participial nominals. Present-perfect upper analyses
now use `perfect+pres=∅`; the lexical participle does not make the construction
past tense.

Pronoun focus is rebuilt in one finite-relation transform. It removes 300
malformed legacy sandhi-focus surfaces and keeps proximal/medial demonstratives
third person. Human quantifier outputs now use canonical lemmas and explicit
human/case tags. Participial nominals cover human number/case and neuter
case/focus/sandhi paradigms while preserving valid complementizer ambiguity.

The source build and exhaustive dictionary build pass all regressions: 102
inverse, 125 noun, 353 accepted verb, 72 rejected verb, 332 miscellaneous,
and 49 forbidden-form checks with zero leakage. Direct runtime generation is
3,341,533 surfaces. Controlled heuristic synthesis contributes 6,371,705
forms/lemmas to an 8,435,656-form union; this is a secondary static validation
tier, not equivalent to runtime analysis. The full dictionary contains
8,463,307 surfaces and the lemma dictionary remains 129,020 entries.

Tokenizer-side measurement recognizes 101,651 of 129,032 combined-source
lemmas. The exact reversible inventory contains 103,540,432 upper analyses,
5,515 semantic keys, and 12,893 raw-tag patterns. On the pinned Mozhi corpus,
342,094 of 529,306 Tamil spans analyze; unknown fallback is 185,781
occurrences and 113,715 unique surfaces.

All 12,893 exact patterns have inverse/forward witnesses with zero failures.
All 6,043 productive-relation rows have zero defects, and the expanded
408,035-row, 34-cell class diagnostic reports no missing cells.

An exhaustive audit rejected removal of the 3,034 passive-perfect hook rows.
Across all 37 continuation forms, no complete hook paradigm is independently
preserved by the remaining six-model union. The compiled relation already
collapses coincident paths, so deleting the hooks would reduce language
coverage without removing runtime output duplication.

### Patch 0272: eliminate duplicate part/pronoun ownership

The cross-model audit found eight exact `அது` pronoun relations duplicated in
the `part` and `pronoun` models. Patch `0272` removes them from the particle
lexicon after proving that the pronoun model retains the identical upper/lower
relations. The accepted surface union is unchanged. The refreshed audit has
274 expected verb-class syncretism groups and zero blocking non-verb overlaps.

### Patches 0273-0290: final reviewed repair release

This consolidated batch completes reviewed C12 `இரு` auxiliary/citation
behavior, noun translative-copular futures, bounded common-noun and
closed-class coverage, adjective predicates, colloquial adverbs, irregular
`சொல்` past forms, cardinal relations, and the distinct C5 causative
`இருத்து`. Standalone `இரு` is owned by C12 rather than duplicated in C11.

The same batch removes proven overgeneration: 68 malformed passive connector
entries, the unsupported C12 `வல` assignment, and 20 auxiliary compounds
orphaned by those class corrections. Rejected-form fixtures cover malformed
families such as `இரக்கக்க-`, `சாட்டுக்க-`, `வேங்குக்க-`, and `துய்ப்பட-`, plus
invalid outputs including `வவக்கும்` and `வலத்த்தல்`.

The final FST and exhaustive dictionary builds pass. Regressions cover 102
inverse, 125 general forward, 363 accepted verb, 104 rejected verb, 367
miscellaneous, and 49 forbidden-form checks with zero leakage. The generated
union has 8,434,525 surfaces, including 3,341,683 direct runtime surfaces and
6,370,191 controlled heuristic forms; the full dictionary has 8,462,140
surfaces.

Tokenizer-side structural validation enumerates 103,764,271 upper analyses
with 12,917 exact tag patterns and zero inverse/forward failures. All 592,471
paradigm probes, 408,000 class-diagnostic rows, and 6,035 productive-relation
checks pass. All 286 multi-class roots have distinctive retained evidence.
Cross-model review has 269 expected verb-class syncretism groups over 260
surfaces and zero blockers.

### Patches 0291-0318: connector closure and final rewrite repairs

Patches `0291`-`0294` remove 280 unsupported productive connector entries.
The remaining batch completes reviewed dative, C10/C16, ability, question,
closed-class, and auxiliary relations. C10 final-`ன்` nouns are split so
`நலன் -> நலனை` and `பொன் -> பொன்னை` retain distinct allomorphy. Class17
`வா` rewrites are marker-scoped, preserving `வருகிறது` and `படித்துவா`
without rewriting unrelated C13 forms such as `உருவாகிறது`. Patch `0318`
adds the missing present-perfect hook for `எனப்படு`; the productive-relation
audit now passes all 6,037 rows.

The static generator recognizes `VerbQuestion` continuations as terminal
finite templates. The exhaustive build contains 3,340,946 direct runtime-union
surfaces, 8,427,509 generated/secondary surfaces, 6,362,518 controlled
heuristic forms, and 8,455,031 full-dictionary surfaces. Source regressions
pass 102 inverse, 138 noun, 372 accepted verb, 107 rejected verb, 367
miscellaneous, and 60 forbidden-form checks with zero leakage.

Tokenizer-side validation enumerates 115,905,215 compiled analyses, 6,209
semantic keys, and 15,197 exact reversible patterns. All 573,133 paradigm
probes pass, strict ending-family outliers are zero, all 37 source-POS
collisions have closed decisions, and the productive-compound audit has zero
unresolved connectors.

The pinned Mozhi development corpus confirms the released runtime behavior:
345,355 of 521,264 Tamil spans analyze, including 343,476 direct-FST
occurrences. Unknown fallback falls to 174,535 occurrences and 111,619 unique
surfaces. This corpus is a development battle test, not an untouched model
evaluation set.

### Patches 0319-0325: high-yield class completion

This consolidated release reclassifies 798 long-vowel-final `-டு` nouns from
C7 to geminating C6 and adds the corresponding compound-modifier behavior. It
also completes reviewed C7 possessives, bare verb negatives, class-scoped
modal allomorphs, passive/honorific continuations, focused verbal
participles, safe `தக்க` worthy forms, temporal verbal nouns, and bounded
closed-class, noun, loan, and adverb coverage.

Blanket worthy rules for C4 and C62 were rejected before release because
whole-class compilation exposed malformed weak/strong allomorphs. The final
patch set includes contrastive rejected forms such as `கொளலாம்`,
`தெரிக்கலாம்`, and `அறிக்கலாம்` alongside valid `கொள்ளலாம்`, `தெரியலாம்`,
and `அறியலாம்`.

The single FST and dictionary builds pass all gates. Source regressions cover
102 inverse, 138 general forward, 373 accepted verb, 107 rejected verb, 397
miscellaneous, and 60 forbidden-form checks with zero leakage. The static
release contains 3,372,384 direct runtime surfaces, 8,529,398 generated and
secondary surfaces, 6,453,760 controlled heuristic surfaces, and 8,556,745
full-dictionary surfaces.

Tokenizer-side structural validation recognizes 101,955 of 129,020 dictionary
lemmas and enumerates 116,148,525 compiled analyses, 6,286 semantic keys, and
15,305 exact reversible patterns. All 573,229 paradigm probes pass; strict
ending-family outliers, lexical encoding defects, and unresolved source-POS
decisions are zero.

### Patches 0332-0336: final common-unknown corrective release

The shared release adds the reviewed adjective, noun, closed-class, temporal
connector, and verb-realization corrections in patches `0332`-`0336`. It
removes the false C15 `-த்தில்` sociative reading, repairs retained-`வ்` and
geminating noun subclasses, scopes C2 conditional nasal realization away from
C9, repairs C7 `உண்`, and corrects C10 final-`ல்` and honorific-past behavior.

The exhaustive dictionary build passes. Artifacts contain 3,516,888 direct
runtime surfaces, 9,165,858 direct/secondary union surfaces, 7,067,178
controlled-secondary surfaces, and 9,193,118 full-dictionary surfaces. The
lemma dictionary remains 129,020 entries and runtime recognizes 102,043.

Formal gates are 573,678/573,678 paradigm probes, 6,037/6,037 productive
relations, 21,235/21,235 exact tokenizer signature round trips, zero strict
class outliers, zero unresolved POS decisions, zero lexical encoding defects,
and zero unresolved productive connectors. The tokenizer records 120,688,719
upper analyses and a 140,176-token compact vocabulary.

The pinned Mozhi development corpus analyzes 363,301 of 519,840 Tamil spans.
Unknown fallback is 155,248 occurrences across 107,435 unique surfaces. The
ending-family review finds zero class-wide defects and zero bulk-safe imports;
the residual is an evidence queue, not a dictionary target.

### Patches 0337-0350: final systematic morphology release

This release completes the staged required-realization, composition,
colloquial, and predicate-question work. Patch `0349` adds class-owned spoken
conditionals, negative converbs, honorific imperatives, agreement forms,
present contractions, and translatives. Finite adverb/particle translatives
are generated as bounded relation extensions; compiled models use a binary
union path rather than enumerating and recompiling their entire relation.

Patch `0350` adds the question continuation for every reviewed nominal
copular participle and a short-`u` standalone adjective subclass covering
`அரிதா`, `இனிதா`, and `நன்றா`. The release preserves legitimate
question/translative ambiguity. The colloquial audit excludes `போடுடா` from
conditional gold data because it is `போடு + டா`, not `போடுடால் -> போடுடா`.

The generated `verb-auxiliary.fst` has 140,697,847 upper analyses from 44,190
connectors, 126,729 predicate lemmas, and 1,098 `ஆகு` templates. Its exact
symbolic inventory is shipped beside the FST. Perfect `இரு` chains carry
explicit perfect aspect, and outer-expansion guards reject malformed doubled
modal or question material.

The full source and dictionary builds pass 102 inverse, 138 general forward,
373 accepted verb, 107 rejected verb, 397 miscellaneous, and 60 forbidden-
form checks with zero leakage. Static artifacts contain 3,773,878 direct
runtime-union surfaces, 8,049,056 controlled heuristic surfaces, 10,206,966
generated/secondary surfaces, and 10,234,014 full dictionary surfaces.

Tokenizer-side validation enumerates 274,966,601 upper analyses, 21,356
semantic signature keys, and 35,125 exact raw-tag patterns. The fixed
vocabulary contains 140,226 tokens and 139,477 lemmas. Required morphology
passes 145/145, validated colloquial coverage passes 545/545 types, and the
complete tokenizer suite passes 1,019 tests with one optional skip.

The pinned Mozhi development audit analyzes 372,337 of 519,840 Tamil spans,
including 368,035 direct-FST occurrences. Unknown fallback is 146,377
occurrences across 102,601 unique surfaces. These residuals remain a mixed
evidence queue and must not be converted into automatic lexical imports.

### Patch 0351: recurring unknown coverage and reversible pair unions

The post-release batch adds 40 reviewed common noun/loan readings, productive
accusative focus/all continuations, 25 closed-class colloquial relations, and
productive colloquial `-ணும்` modal realization over every licensed active
and passive infinitive. Source regressions retain all earlier positive and
negative checks, required morphology passes 149/149, and the generated/static
inventories contain 3,774,096 direct generator surfaces, 8,049,056 controlled
heuristic forms, 10,207,184 generated/secondary surfaces, and 10,234,220 full
dictionary surfaces.

The tokenizer's exhaustive witness audit found 64 earlier direct-union TSV
pairs that analyzed forward but did not inverse-generate. The union compiler
now segments both sides with the base FST sigma and introduces only missing
individual characters, avoiding both upper-side symbol mismatch and lower-
surface prefix shadowing. `run_fst_regressions.py` now inverse-checks all 140
direct-union extension rows on every build.

The compact auxiliary symbolic inventory contributes 141,012,198 weighted
upper analyses; complete Foma relation-path enumeration sees 247,879,655
auxiliary paths because identical upper analyses can have multiple lower
routes. The compact signature inventory has 21,470 semantic keys and 35,262
exact patterns. All 35,262 patterns have exact inverse/forward witnesses over
382,919,216 enumerated paths with zero failures. The fixed vocabulary has
140,263 tokens and 139,514 lemmas.

The final Mozhi development run handles 372,996 of 519,840 Tamil spans,
including 368,694 direct-FST and 4,302 entity-only occurrences. Unknown
fallback is 145,719 occurrences across 102,305 unique surfaces. Both Sangraha
samples, CodeMix, and TamilTech also improve, confirming generalized coverage.
The synchronized tokenizer suite passes 1,029 tests with one optional skip.
