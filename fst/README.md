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
2. Apply local patches from `fst/patches/`
3. Compile FST binaries with `foma`
4. Write canonical artifacts to:
   - `build/fst-models/`
5. Sync artifacts to:
   - `static-word-list/fst-models/`
   - `server/fst-models/`
6. Write `fst/build/manifest.json` with upstream commit, patches, and SHA256 checksums

Note: upstream `foma/*.zip` currently does not include a standalone pronoun compile script, so `pronoun.fst` is copied from `vendor/thamizhi-morph/FST-Models/` and recorded in the manifest as `copy-prebuilt`.

## Tests

Run fast deterministic regressions:

```bash
npm run fst:test
```

Covers:

- C11 noun accusative regression (`திருமகன்`, `மாணவன்`)
- C10 control case (`பொன் -> பொன்னை`)
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
