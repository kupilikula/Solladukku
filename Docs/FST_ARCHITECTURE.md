# FST Architecture and Workflow

This is the canonical reference for the Tamil morphology release used by
Solmaalai.

## Runtime source of truth

`server/fst-models/` is the only checked-in runtime copy used by the game. Its
**12 FST models** and auxiliary inventory come from the public
[`Indic-AI-Experiments/tamil-morphology`](https://github.com/Indic-AI-Experiments/tamil-morphology)
release. `morphology.lock.json` records the release version, source commit,
artifact inventory and SHA-256 checksums.

Run:

```bash
npm run fst:verify-release
npm run fst:test
```

The first command fails if a model is missing, added unexpectedly or differs
from the lock file. The Docker build runs the same check before deployment.
`verb-auxiliary.fst` is loaded alongside the other eleven models.

The older `vendor/`, `fst/upstream-*`, build script and patch directories remain
as historical development lineage. They are not the deployed source of truth.
`npm run fst:build:lineage` can reconstruct that older lineage for archaeology;
it must not be used to replace the locked runtime release.

## Updating morphology

The scheduled `update-morphology` workflow reads the latest public morphology
repository, verifies every file against its manifest, installs the runtime into
`server/fst-models/`, runs the canonical morphology regressions and opens a pull
request. A manual update follows the same sequence with
`scripts/install_morphology_release.py`.

## Dictionary and gameplay policy

The morphology system describes valid Tamil analyses; the board game applies a
narrower word policy:

- Sandhi-only spellings are not independent playable words.
- abbreviations, explicit entity/proper-name analyses and malformed inputs are
  rejected;
- reviewed proper names and their conservative case forms are removed from the
  browser dictionary and rejected by the server;
- if a reviewed name spelling is also a well-established common word, it can be
  retained in `server/gameplay-common-word-exceptions.txt`;
- a word with both a forbidden analysis and a genuine lexical analysis remains
  playable.

`scripts/build_gameplay_exclusions.py` deterministically builds the proper-name
list from the pinned reviewed entity snapshots under
`static-word-list/entity-sources/`, including a small game-specific file of
manually reviewed high-frequency names. The policy is enforced in
`server/word-validation-policy.js` and its tests.

The compact `public/tamil_dictionary.txt` is a fast client-side headword cache.
Server FST validation is authoritative for misses. Full offline dictionary
generation may use ignored working copies under `build/fst-models/` and
`static-word-list/fst-models/`, but production never reads them.

The solo AI additionally consumes the checked-in, content-addressed
`public/tamil_ai_prefixes.bloom` prefix/terminal index. It is rebuilt from the
generated surface inventory and release regression fixtures with `npm run
ai-prefixes:build`; its manifest pins the morphology lock and all input/output
hashes. Bloom membership only controls search traversal and candidate batching:
the deployed server FST policy remains the final authority. Consumer FST
regressions resolve `server/fst-models/` first so ignored historical copies
cannot shadow the deployed runtime.
