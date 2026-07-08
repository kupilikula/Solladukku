# FST Upstream Management

This directory contains Solmaalai's deterministic ThamizhiMorph patch/build/test tooling.
It does not store the app's runtime model copies.

Canonical architecture reference: `Docs/FST_ARCHITECTURE.md`

## Layout

- `fst/patches/`: upstream source patches (applied in order)
- `fst/build/`: build scripts and generated `manifest.json`
- `fst/tests/`: regression tests + analysis harness
- `fst/reports/`: generated audit outputs (gitignored)

Related directories:

- `vendor/thamizhi-morph/`: upstream source snapshot (submodule)
- `fst/upstream-zips/`: pinned local fallback copies of required upstream source zips
- `fst/upstream-models/`: pinned local fallback prebuilt assets (currently `pronoun.fst`)
- `build/fst-models/`: canonical generated FST artifacts
- `static-word-list/fst-models/`: synced copy for dictionary generation
- `server/fst-models/`: synced copy for runtime validation

## Prerequisites

- `vendor/thamizhi-morph` submodule checked out at the pinned commit
- `foma` + `flookup` on `PATH`
- Python 3

## Build

Run from repo root:

```bash
npm run fst:build
```

This will:

1. Extract upstream `foma/*.zip` source bundles into `fst/build/.work/`
   - Source priority: `vendor/thamizhi-morph/foma/*.zip` then `fst/upstream-zips/*.zip`
2. Apply local patches from `fst/patches/`
3. Compile FST binaries with `foma`
4. Write canonical artifacts to:
   - `build/fst-models/`
5. Sync artifacts to:
   - `static-word-list/fst-models/`
   - `server/fst-models/`
6. Write `fst/build/manifest.json` with upstream commit, patches, and SHA256 checksums

Note: upstream `foma/*.zip` currently does not include a standalone pronoun compile script, so `pronoun.fst` is copied from `vendor/thamizhi-morph/FST-Models/` (or `fst/upstream-models/pronoun.fst` fallback) and recorded in the manifest as `copy-prebuilt`.

## Tests

Run fast deterministic regressions:

```bash
npm run fst:test
```

Covers:

- C11 noun accusative regression (`திருமகன்`, `மாணவன்`)
- C10 control case (`பொன் -> பொன்னை`)
- source-backed noun/verb coverage patches such as `இந்தியா`, `நுண்ணறிவு`, `உருவாக்குகிறது`, and `ஓடியது`
- the 1,522-entry source-backed noun tranche from `0010-add-source-backed-noun-tranche.patch`
- the 26-entry source-backed C5 verb tranche from `0011-add-source-backed-c5-verb-tranche.patch`
- the 76-entry source-backed name cleanup tranche from `0012-add-source-backed-name-tranche.patch`
- the 14-entry foreign-final borrowed-name template from `0013-add-foreign-final-name-template.patch`
- the 45-entry second source-backed C5 verb tranche from `0014-add-source-backed-c5-verb-tranche-2.patch`
- the 173-entry second source-backed noun tranche from `0015-add-source-backed-noun-tranche-2.patch`
- the noun-side pronoun rewrite removal from `0016-remove-noun-pronoun-rewrites.patch`, which keeps roots such as `நம்பிக்கை` and `திருநம்பி` reachable while pronouns remain in `pronoun.fst`
- the 1,301-entry third source-backed noun tranche from `0017-add-source-backed-noun-tranche-3.patch`, after reviewed lexical noun decisions such as `கற்றொழிலோர்`, `பிறந்தவம்`, `பிறந்தவழிக்கூறல்`, and `பறக்கும்தட்டு`
- short honorific verb forms from `0018-add-short-honorific-verb-forms.patch`, including forms such as `கற்றார்` and `சேர்ந்தார்`
- participial-person nominal forms from `0019-add-participial-person-nominals.patch`, including forms such as `அடைந்தோர்`
- the lexical adverb `இல்லாக்காட்டில்` from `0020-add-lexicon-adverb-illaakkaattil.patch`
- reviewed non-human `ன்`-final noun coverage for `பேன்` from `0021-add-reviewed-peen-noun.patch`, using the same `C4SgRoot` paradigm as `மான்` and `தேன்`
- source-backed C5 verb coverage for lexical `பேத்தல்` from `0022-add-peethu-verb-coverage.patch`, using productive stem `பேத்து` in the same paradigm as `நடத்தல்`; generated forms include `பேத்தினேன்`, `பேத்துகிறேன்`, and `பேத்துவேன்`
- source-backed C5 primary-stem verb tranche 3 from `0023-add-source-backed-c5-primary-verb-stems.patch`, covering 4,388 reviewed stems derived from lexical `தல்` / `த்தல்` lemmas backed by Tamil Lexicon and Tamil Wiktionary titles, with representatives such as `திறக்கு`, `உள்ளடக்கு`, `குணமாக்கு`, and `பொறுக்கு`
- source-backed C5 primary-stem verb tranche 4 from `0024-add-source-backed-c5-primary-verb-stems-2.patch`, covering 262 post-`0023` tier-1 stems, with representatives such as `கணக்கிடு`, `உயிர்த்தெழு`, `அறிவுறு`, and `கையைப்பிடித்திழு`
- productive plural nominative additive/enclitic `உம்` noun coverage from `0025-add-noun-additive-um.patch`, including forms such as `பெண்களும்`, `ஆண்களும்`, `மரங்களும்`, and `மாணவர்களும்`
- common function-word FST coverage from `0026-add-common-function-particles.patch` and `0027-add-common-adverb-een.patch`, covering `என`, `மட்டும்`, `இல்லை`, and `ஏன்`
- deictic adverb/adjective FST coverage from `0028-add-deictic-adverb-forms.patch` and `0029-add-deictic-adjective-forms.patch`, covering forms such as `இப்பொழுது`, `எப்பொழுது`, `இந்நிலையில்`, and `இவ்வகை` with explicit deictic tags
- corpus-backed common noun/adverb coverage from `0030-add-corpus-backed-common-nouns.patch` and `0031-add-corpus-backed-common-adverbs.patch`, covering high-frequency tokenizer-audit fallbacks such as `தேர்தல்`, `பாலம்`, `நடவடிக்கை`, `சுமார்`, and `அதனால்`
- pronoun/quantifier/function coverage from `0032-add-pronoun-quantifier-function-coverage.patch`, covering high-frequency tokenizer-audit fallbacks such as `தங்கள்`, `ஒருவர்`, `அனைவரும்`, `எல்லா`, `என்ன`, `எத்தனை`, `வேண்டாம்`, and `உண்டா` with explicit semantic tags
- selective loanword noun and abbreviation coverage from `0033-add-selective-loan-nouns.patch` and `0034-add-selective-abbreviation-particles.patch`, covering common corpus fallbacks such as `கலெக்டர்`, `குக்கர்`, `வைரஸ்`, and abbreviation letters `பி`, `ஜி`, `டி`, `எஸ்`
- corpus-backed adjective/adverb and complementizer coverage from `0035-add-corpus-backed-adjectival-stems.patch`, `0036-add-corpus-backed-adverbial-stems.patch`, and `0037-add-complementizer-case-forms.patch`, covering forms such as `தமிழக`, `ஐக்கிய`, `மாவட்ட`, `தேசிய`, `கடுமையாக`, `வலுவின்றி`, `என்பதை`, and `எனக்`
- productive verb-rule/root coverage from `0038-add-modern-verb-derived-forms.patch` and `0039-add-c11-loan-verb-stems.patch`, covering `பேசிய`, `வருகின்ற`, `என்றார்`, `ஆவார்`, and `விமர்சித்து` through FST classes rather than supplemental surface forms
- calendar/place/common-loan noun coverage from `0040-add-calendar-place-loan-nouns.patch`, covering reviewed forms such as `டீ`, `மார்ச்`, `ஆகஸ்ட்`, `பிரிட்டன்`, `பெங்களூரு`, `ஹைதராபாத்`, `டிக்கெட்`, `பைக்`, and `மொபைல்`
- modern verb paradigm completion from `0041-complete-modern-verb-paradigms.patch`, covering `வா` forms such as `வந்தார்`, `வந்தனர்`, `வருகிறார்`, `வருகின்றன`, and `வருவார்`, existential `உள்ளனர்`, and reviewed C5 stems `பணியாற்று` / `பயன்படுத்து`
- comparative/additive particle coverage from `0042-add-comparative-kkum-particle.patch`, covering standalone `க்கும்` in comparative expressions such as `15 க்கும் குறைவாக`
- audit-backed passive verb-stem coverage from `0043-add-audit-backed-passive-verb-stems.patch`, covering `பயன்படுத்தப்படு` forms such as `பயன்படுத்தப்படுகிறது`
- audit-backed common noun coverage from `0044-add-audit-backed-common-noun-coverage.patch`, covering reviewed tokenizer-audit nouns such as `ஓட்டம்`, `விற்பனை`, `குறைபாடு`, and `இயக்குநர்`
- audit-backed attributive adjective coverage from `0045-add-audit-backed-adjective-forms.patch`, covering `தேசியக்`, `நீர்வாழ்`, and `துடுப்பாட்ட`
- C4 `உ`-final future/adjectival coverage from `0046-add-c4-u-final-future-forms.patch`, covering forms such as `விழும்` and `எழும்` while preserving existing C4 past forms such as `விழுந்தது`
- noun singular additive and translative coverage from `0047-add-noun-translative-and-singular-additive.patch`, covering forms such as `மரமும்`, `எண்ணிக்கையும்`, `மரமாக`, `காரணமாக`, and `இயக்குநராக`
- oblique/final-short-u translative coverage from `0048-add-noun-oblique-translative-coverage.patch`, covering `காடாக`, `குறைபாடாக`, `ஆறாக`, plus C10 alternate-stem additive/translative forms `பொன்னும்` and `பொன்னாக`
- irregular existential `உள்` forms such as `உள்ளது`, `உள்ளன`, `உள்ளனர்`, `உள்ளார்`, `உள்ளார்கள்`, and ambiguous `உண்டு`
- Dictionary gold include/exclude checks run with `python3 fst/tests/run_fst_regressions.py --check-dictionary` (included in `npm run dict:build`)

## Dictionary build flow

```bash
npm run fst:build
python3 static-word-list/generate_fst_forms.py
python3 static-word-list/build_dictionary.py
python3 fst/tests/run_fst_regressions.py --check-dictionary
```

`generate_fst_forms.py` reads local FST binaries from `build/fst-models/`.

One-command local refresh (FST + dictionary + checks):

```bash
npm run dict:build
```

## Production image behavior

`Dockerfile` now compiles patched FSTs during image build by running `npm run fst:build`
after copying `vendor/thamizhi-morph` and `fst/patches`. This ensures production runtime
validation uses the same patched models as local development without relying on stale
prebuilt binaries in `server/fst-models/`.

## Add a new patch

1. Create a unified diff in `fst/patches/` (prefix with ordering index)
2. Re-run `npm run fst:build`
3. Add/adjust regression cases in `fst/tests/fixtures/`
4. Run `npm run fst:test`

## Analysis harness

Run:

```bash
python3 fst/tests/analyze_fst.py \
  --config fst/tests/config/nouns.json \
  --lemmas fst/tests/fixtures/noun_lemmas.txt
```

Outputs JSON report files into `fst/reports/`.
