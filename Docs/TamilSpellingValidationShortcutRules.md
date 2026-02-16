# Tamil Spelling Validation Shortcut Rules

This document describes the client-side Tamil spelling shortcut rules used to avoid unnecessary server `validate-words` calls, while preserving dictionary/FST exceptions.

## Scope and Intent

- These shortcuts are implemented in `src/utils/tamilOrthography.js`.
- They run only on the **server-fallback path** (after a local dictionary miss).
- They are intentionally conservative:
  - reject only high-confidence invalid starts,
  - keep dictionary-known exceptions valid,
  - avoid broad linguistic rules that would break existing accepted words.

## Where the Rules Are Applied

1. Human player validation fallback:
   - `src/utils/dictionary.js`
   - `validateWordsWithServer(...)` (WebSocket fallback)
   - `validateWordsWithHttpServer(...)` (HTTP fallback)
2. AI fallback queueing:
   - `src/ai/aiEngine.js`
   - `getWordValidCached(...)` avoids queueing shortcut-invalid words into `pendingServerWords`.

## Active Rules (Safe Mode)

For a candidate word that already failed local dictionary lookup:

1. Reject empty/non-string input.
2. Reject if first codepoint is a Tamil combining mark:
   - `\u0BCD` (pulli / virama),
   - `\u0BBE \u0BBF \u0BC0 \u0BC1 \u0BC2 \u0BC6 \u0BC7 \u0BC8 \u0BCA \u0BCB \u0BCC \u0BD7`.
3. Reject if first base letter is one of:
   - `ங`, `ன`, `ற`, `ழ`, `ள`.

## Why These Are Safe

Corpus check (current local data as of February 16, 2026):

- `public/tamil_dictionary.txt`: `1,841,588` words
- extracted FST lexicon lemmas from `fst/reports/artifacts/build/**/*.lexc`: `131,100`

Initial-letter counts in current corpus:

| Initial | Dictionary count | FST-lemma count | Shortcut status |
|---|---:|---:|---|
| `ங` | 4 | 0 | blocked in fallback |
| `ன` | 14 | 0 | blocked in fallback |
| `ற` | 15 | 0 | blocked in fallback |
| `ழ` | 13 | 0 | blocked in fallback |
| `ள` | 13 | 0 | blocked in fallback |
| `ட` | 230 | 0 | **not blocked** |
| `ண` | 13 | 2 | **not blocked** |
| `ல` | 2,643 | 126 | **not blocked** |
| `ர` | 3,001 | 135 | **not blocked** |

This is why safe mode blocks only the first five letters above and does not block `ட`, `ண`, `ல`, `ர`.

## Exception Handling Philosophy

The following “traditional” rules were intentionally **not** enabled globally because current game data contains exceptions:

1. "No Tamil words start with pure consonant"
   - Current dictionary has `575` such starts (examples include `க்`, `க்ஷ...` forms).
   - So we do **not** reject all pure-consonant starts.
2. "No Tamil words start with `ர`, `ல`, `ட`, `ண` vowel forms"
   - Current corpus contains many such entries.
   - So these initials are kept valid for fallback validation.

## Behavioral Guarantees

1. If a word exists in local dictionary, it is accepted before shortcut checks.
2. Shortcut checks apply only after local dictionary miss.
3. Rejected shortcut words are cached client-side as invalid, preventing repeated network calls.
4. AI and human flows share the same shortcut behavior for fallback validation.

## Examples

Rejected early (no server call):

- `றாஅ`, `றார`, `றாவ`, `ழே...`, `ளொ...`, or any word beginning with a listed combining mark.

Allowed to continue to server fallback (if dictionary miss):

- words beginning with `ர`, `ல`, `ட`, `ண`,
- words beginning with pure consonant clusters that are represented in corpus exceptions.

## Future Tightening Strategy

If stricter rules are desired later:

1. Re-audit dictionary + FST lemma corpora.
2. Quantify breakage candidates by rule.
3. Introduce a feature flag and telemetry before enforcing stricter rejection sets.
4. Keep this document and `AGENTS.md` in sync with any rule change.
