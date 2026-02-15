# FST Architecture and Workflow

This is the canonical reference for Solmaalai FST source-of-truth, patching, build outputs, and deployment behavior.

## Directory Roles

- `vendor/thamizhi-morph/`
  - Vendored upstream source (git submodule pinned to a commit).
  - Contains upstream `foma/*.zip` bundles and upstream prebuilt `FST-Models/*`.

- `fst/`
  - Local tooling only (patches, deterministic build scripts, regressions, reports).
  - Does **not** store runtime model copies for application usage.

- `build/fst-models/`
  - Canonical generated FST output directory produced by `npm run fst:build`.

- `static-word-list/fst-models/`
  - Synced copy used by dictionary tooling compatibility paths.

- `server/fst-models/`
  - Generated build outputs used by runtime server validation (`server/index.js`, `flookup`).

## Why Two Generated Output Directories?

Canonical output is generated once, then synced to consumer directories:

- `build/fst-models`: canonical generated artifacts.
- `static-word-list/fst-models`: dictionary generation compatibility copy.
- `server/fst-models`: online gameplay validation pipeline.

Keeping both avoids fragile cross-directory assumptions and keeps each consumer self-contained.

## Build Source of Truth

`npm run fst:build` runs `fst/build/build_fsts.py`, which:

1. Extracts upstream source zips from `vendor/thamizhi-morph/foma/*.zip`.
2. Applies local patches from `fst/patches/` in order.
3. Compiles FST binaries with `foma`.
4. Writes canonical outputs to:
   - `build/fst-models/`
5. Syncs copies to:
   - `static-word-list/fst-models/`
   - `server/fst-models/`
6. Writes build metadata to `fst/build/manifest.json`.

## Patch Workflow

1. Add/update patch file under `fst/patches/`.
2. Rebuild models:
   - `npm run fst:build`
3. Run regressions:
   - `npm run fst:test`
4. If dictionary behavior changed, regenerate dictionary assets:
   - `python3 static-word-list/generate_fst_forms.py`
   - `python3 static-word-list/build_dictionary.py`
   - `python3 fst/tests/run_fst_regressions.py --check-dictionary`

Convenience command:

- `npm run dict:build` (full rebuild + dictionary + regressions)

## Runtime Setup

- Server helper (`cd server && npm run setup`) is a compatibility wrapper that invokes the same root build script and patches.
- Runtime validation reads `server/fst-models/*.fst`.

## Production Behavior

`Dockerfile` builds patched FSTs in-image via `npm run fst:build` after copying `vendor/` and `fst/`.

This ensures production runtime validation uses the same patched model lineage as local development.

## Naming Clarification

- `fst/` means "FST tooling" (not model storage).
- `vendor/thamizhi-morph` means "upstream source snapshot".
- `build/fst-models` means "canonical generated artifacts".
- `static-word-list/fst-models` and `server/fst-models` mean "synced consumer copies".

## Current Reorganization State

Generation now uses a single canonical output (`build/fst-models`) and syncs to consumer directories. This keeps build lineage explicit while preserving existing consumer paths.
