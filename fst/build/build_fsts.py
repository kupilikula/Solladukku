#!/usr/bin/env python3
"""Build Solmaalai FST binaries from vendored ThamizhiMorph sources."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
VENDOR = ROOT / "vendor" / "thamizhi-morph"
PATCH_DIR = ROOT / "fst" / "patches"
WORK_ROOT = ROOT / "fst" / "build" / ".work"
MANIFEST_PATH = ROOT / "fst" / "build" / "manifest.json"
CANONICAL_MODELS = ROOT / "build" / "fst-models"
RUNTIME_MODELS = ROOT / "runtime"
WORDLIST_MODELS = ROOT / "static-word-list" / "fst-models"
SERVER_MODELS = ROOT / "server" / "fst-models"
PINNED_UPSTREAM_ZIPS = ROOT / "fst" / "upstream-zips"
PINNED_UPSTREAM_MODELS = ROOT / "fst" / "upstream-models"
PINNED_FALLBACK_UPSTREAM_COMMIT = "a296417ac603fd44eda35645369f1257d96bed89"

COMPONENTS = [
    {
        "name": "noun",
        "zip": "ThamizhiMorph-Nouns.zip",
        "entry": "tamil-noun.foma",
        "output": "noun.fst",
        "patches": [
            "0001-fix-c11-acc.patch",
            "0002-fix-noun-class-duplicates.patch",
            "0003-fix-noun-malformed-locatives.patch",
            "0004-fix-noun-plural-accusative.patch",
            "0005-add-common-noun-case-variants.patch",
            "0007-expand-source-backed-noun-coverage.patch",
            "0010-add-source-backed-noun-tranche.patch",
            "0012-add-source-backed-name-tranche.patch",
            "0013-add-foreign-final-name-template.patch",
            "0015-add-source-backed-noun-tranche-2.patch",
            "0016-remove-noun-pronoun-rewrites.patch",
            "0017-add-source-backed-noun-tranche-3.patch",
            "0021-add-reviewed-peen-noun.patch",
            "0025-add-noun-additive-um.patch",
            "0030-add-corpus-backed-common-nouns.patch",
            "0033-add-selective-loan-nouns.patch",
            "0040-add-calendar-place-loan-nouns.patch",
            "0044-add-audit-backed-common-noun-coverage.patch",
            "0047-add-noun-translative-and-singular-additive.patch",
            "0048-add-noun-oblique-translative-coverage.patch",
            "0051-add-corpus-backed-common-noun-gaps.patch",
            "0054-add-corpus-backed-noun-gap-tranche.patch",
            "0057-add-remaining-corpus-noun-roots.patch",
            "0058-add-triaged-common-noun-coverage.patch",
            "0059-add-c15-irkku-dative-variant.patch",
            "0073-add-systematic-noun-root-candidates.patch",
            "0074-add-systematic-c2-kkai-noun-roots.patch",
            "0075-add-systematic-c2-compound-head-nouns.patch",
            "0076-add-systematic-c15-compound-head-nouns.patch",
            "0077-add-high-confidence-c15-m-final-nouns.patch",
            "0078-add-systematic-c2-head-family-nouns-2.patch",
            "0079-add-systematic-c2-head-family-nouns-3.patch",
            "0080-add-systematic-c15-nominal-head-nouns.patch",
            "0093-add-systematic-c15-high-confidence-m-final-nouns.patch",
            "0094-add-systematic-c15-dual-source-productive-nouns.patch",
            "0095-add-systematic-c2-dual-source-productive-nouns.patch",
            "0096-add-systematic-c9-dual-source-retroflex-n-nouns.patch",
            "0097-add-systematic-c15-dual-source-noun-families-2.patch",
            "0098-add-systematic-c2-dual-source-noun-families-2.patch",
            "0099-add-systematic-c4-dual-source-head-nouns.patch",
            "0100-add-systematic-c15-dual-source-noun-families-3.patch",
            "0101-add-systematic-c2-dual-source-noun-families-3.patch",
            "0102-add-systematic-c11-dual-source-human-head-nouns.patch",
            "0103-add-systematic-c14-dual-source-retained-l-head-nouns.patch",
            "0104-add-megabatch-c15-dual-source-nouns.patch",
            "0105-add-megabatch-c2-dual-source-nouns.patch",
            "0106-add-megabatch-c4-dual-source-nouns.patch",
            "0107-add-megabatch-c11-dual-source-nouns.patch",
            "0108-add-megabatch-c14-dual-source-nouns.patch",
            "0109-add-high-confidence-c16-r-final-nouns.patch",
            "0110-add-next-c2-dual-source-noun-batch.patch",
            "0111-add-next-c7-dual-source-noun-batch.patch",
            "0112-add-high-confidence-c11-n-final-nouns.patch",
            "0113-add-next-dual-source-c2-nouns.patch",
            "0114-add-next-dual-source-c7-nouns.patch",
            "0115-add-source-backed-c15-m-final-nouns.patch",
            "0116-add-single-source-c2-productive-nouns.patch",
            "0117-add-single-source-c7-productive-nouns.patch",
            "0118-add-c11-person-head-nouns.patch",
            "0119-add-c16-person-profession-nouns.patch",
            "0120-add-conservative-c4-noun-families.patch",
            "0121-add-conservative-c14-retained-l-nouns.patch",
            "0122-add-conservative-c9-retroflex-n-nouns.patch",
            "0123-add-conservative-c1-aa-and-puu-nouns.patch",
            "0132-add-residual-multisource-explicit-nouns.patch",
            "0133-fix-noun-encoding-and-sociative-rules.patch",
            "0141-remove-corrupt-noun-lexemes.patch",
            "0143-remove-malformed-double-hyphen-noun.patch",
            "0156-add-missing-c2-noun-homograph-readings.patch",
            "0157-fix-c6ttu-c8-noun-realization.patch",
            "0158-add-reviewed-u-final-noun-homographs.patch",
            "0160-add-inflected-spelling-c2-noun-homographs.patch",
            "0161-add-reviewed-residual-noun-homographs.patch",
            "0162-add-final-regular-noun-homographs.patch",
            "0173-reclassify-aar-as-direct-oblique-noun.patch",
            "0178-add-reviewed-mozhi-news-nouns.patch",
            "0179-reclassify-retained-m-nouns.patch",
            "0180-reclassify-legacy-retained-m-nouns.patch",
            "0181-correct-long-vowel-retained-m-nouns.patch",
            "0182-add-productive-noun-ellaam.patch",
            "0183-add-dependent-e-noun-rewrite.patch",
            "0184-reclassify-retained-m-title-classical-nouns.patch",
            "0192-repair-invalid-combining-sequences-noun.patch",
            "0193-deduplicate-noun-entries.patch",
            "0196-add-reviewed-strict-family-nouns.patch",
            "0197-add-reviewed-remaining-noun-candidates.patch",
            "0207-add-derived-action-nominal-paradigms.patch",
            "0209-reclassify-long-vowel-aal-noun.patch",
            "0210-consolidate-noun-entry-sections.patch",
            "0218-add-dative-copular-participles.patch",
            "0221-split-c14-plural-subclasses.patch",
            "0230-add-productive-noun-case-continuations.patch",
            "0256-remove-redundant-action-nominal-nouns.patch",
            "0262-add-attested-c15-compound-modifiers.patch",
            "0264-add-noun-locative-adjectivals.patch",
            "0265-add-reviewed-modern-nouns-and-loans.patch",
            "0267-complete-noun-vocative-and-plural-translative.patch",
            "0274-add-productive-translative-copular-future.patch",
            "0275-add-final-reviewed-common-nouns.patch",
            "0295-add-formal-dative-allomorphs.patch",
            "0296-fix-y-final-dative-sandhi.patch",
            "0297-reclassify-corpus-proven-n-final-plurals.patch",
            "0308-add-reviewed-action-nominals-and-common-nouns.patch",
            "0309-split-c16-direct-and-cuvar-obliques.patch",
            "0310-complete-c10-n-final-rewrite.patch",
            "0314-complete-c16-direct-subclass-move.patch",
            "0315-split-c10-n-final-allomorphs.patch",
            "0324-add-reviewed-common-residual-nouns.patch",
            "0326-add-core-nouns-and-action-nominal.patch",
            "0333-repair-common-noun-subclasses.patch",
            "0337-complete-noun-realization-and-common-readings.patch",
            "0343-complete-c15-modifier-continuations.patch",
            "0347-final-common-noun-families.patch",
            "0349-systematic-colloquial-noun.patch",
            "0351-complete-common-nouns-and-accusative-clitics.patch",
            "0363-add-colloquial-noun-locatives.patch",
            "0368-complete-noun-vocative-parity.patch",
            "0376-complete-colloquial-noun-locatives.patch",
            "0386-add-kaathiruppu-c7-noun.patch",
            "0393-add-common-modern-noun-roots.patch",
            "0394-complete-foreign-noun-plurals.patch",
            "0399-add-modern-loan-noun-subclass.patch",
            "0403-add-everyday-modern-loan-nouns.patch",
            "0405-add-final-common-nouns.patch",
            "0407-complete-formal-dative-postpositions.patch",
            "0410-add-final-native-nouns.patch",
            "0411-complete-c10-singular-translatives.patch",
            "0413-add-common-homograph-nouns.patch",
            "0416-complete-genitive-instrumental-nouns.patch",
            "0429-add-final-common-noun-readings.patch",
            "0432-add-frequency-reviewed-common-nouns.patch",
            "0433-add-final-frequency-common-nouns.patch",
            "0434-reclassify-u-final-common-nouns.patch",
            "0435-add-final-occupational-common-nouns.patch",
            "0436-complete-infinc-possessive-genitive.patch",
            "0437-fix-u-final-ellaam-realization.patch",
            "0438-add-translation-training-coverage.patch",
        ],
    },
    {
        "name": "adj",
        "zip": "ThamizhiMorph-Adjectives.zip",
        "entry": "__generated_adj_build.foma",
        "output": "adj.fst",
        "patches": [
            "0029-add-deictic-adjective-forms.patch",
            "0035-add-corpus-backed-adjectival-stems.patch",
            "0045-add-audit-backed-adjective-forms.patch",
            "0142-remove-corrupt-adjective-lexemes.patch",
            "0217-add-nominal-copular-participles.patch",
            "0220-add-deictic-adverb-copular-participles.patch",
            "0223-add-modern-attributive-adjectives.patch",
            "0234-add-productive-adj-sandhi.patch",
            "0277-add-reviewed-adjectival-predicates.patch",
            "0307-add-ottrai-adjective-family.patch",
            "0327-add-productive-adjective-families.patch",
            "0332-remove-redundant-adjective-tags.patch",
            "0350-complete-predicate-questions.patch",
            "0402-add-common-modern-adjectives.patch",
            "0404-add-modern-loan-adjectives.patch",
            "0424-add-adjective-neuter-nominals.patch",
        ],
    },
    {
        "name": "adv",
        "zip": "ThamizhiMorph-Adverbs.zip",
        "entry": "tamil-adverbs.foma",
        "output": "adv.fst",
        "patches": [
            "0020-add-lexicon-adverb-illaakkaattil.patch",
            "0027-add-common-adverb-een.patch",
            "0028-add-deictic-adverb-forms.patch",
            "0031-add-corpus-backed-common-adverbs.patch",
            "0036-add-corpus-backed-adverbial-stems.patch",
            "0055-add-focused-adverb-form.patch",
            "0068-add-focused-causal-adverb-family.patch",
            "0234-add-productive-adv-sandhi.patch",
            "0278-add-reviewed-colloquial-adverb.patch",
            "0325-add-reviewed-compositional-adverbs.patch",
            "0328-add-colloquial-time-adverb.patch",
            "0353-classify-romba-intensifier.patch",
            "0397-complete-short-u-adverb-clitics.patch",
        ],
        "add_pairs": [
            "0349-systematic-colloquial-adv.fst.tsv",
            "0398-add-closed-class-parity-adv.tsv",
            "0400-add-final-closed-class-relations-adv.tsv",
        ],
    },
    {
        "name": "part",
        "zip": "ThamizhiMorph-Particles.zip",
        "entry": "tamil-part.foma",
        "output": "part.fst",
        "patches": [
            "0026-add-common-function-particles.patch",
            "0032-add-pronoun-quantifier-function-coverage.patch",
            "0034-add-selective-abbreviation-particles.patch",
            "0037-add-complementizer-case-forms.patch",
            "0042-add-comparative-kkum-particle.patch",
            "0056-add-indefinite-quantifier-particle.patch",
            "0067-add-complementizer-and-quantifier-family-coverage.patch",
            "0071-canonicalize-sandhi-complementizers.patch",
            "0140-normalize-particle-lexicon.patch",
            "0159-add-cardinal-translative-forms.patch",
            "0177-complete-interrogative-quantifier-families.patch",
            "0195-add-reviewed-closed-class-readings.patch",
            "0219-add-cardinal-copular-participles.patch",
            "0222-correct-and-expand-ordinal-families.patch",
            "0225-add-reviewed-closed-class-paradigms.patch",
            "0235-add-productive-closed-class-continuations.patch",
            "0240-add-complementizer-additive.patch",
            "0269-complete-human-quantifier-paradigms.patch",
            "0272-remove-redundant-part-pronoun-relations.patch",
            "0276-add-reviewed-abbreviations-and-closed-class.patch",
            "0281-complete-nonhuman-cardinal-relations.patch",
            "0306-add-reviewed-classical-and-colloquial-function-words.patch",
            "0323-add-reviewed-compositional-function-relations.patch",
            "0329-add-core-closed-class-relations.patch",
            "0334-add-reviewed-common-function-forms.patch",
            "0339-complete-colloquial-pronoun-postpositions.patch",
            "0344-complete-participial-and-function-families.patch",
            "0348-final-common-function-readings.patch",
            "0420-complete-human-possessive-parity.patch",
        ],
        "add_pairs": [
            "0349-systematic-colloquial-part.fst.tsv",
            "0351-reviewed-colloquial-closed-class.fst.tsv",
            "0354-reviewed-colloquial-vocative.fst.tsv",
            "0361-add-distributive-paradigms.tsv",
            "0369-complete-closed-class-clitic-matrix.tsv",
            "0382-complete-closed-class-colloquial-locatives.tsv",
            "0398-add-closed-class-parity-part.tsv",
            "0400-add-final-closed-class-relations-part.tsv",
            "0409-add-joined-discourse-relations.tsv",
            "0437-add-classical-first-relations.tsv",
        ],
    },
    {
        "name": "verb-c3",
        "zip": "ThamizhiMorph-Verbs.zip",
        "entry": "ThamizhiFST-C3.foma",
        "output": "verb-c3.fst",
        "patches": [
            "0006-add-common-verb-coverage.patch",
            "0008-expand-source-backed-verb-coverage.patch",
            "0009-add-irregular-existential-verb.patch",
            "0011-add-source-backed-c5-verb-tranche.patch",
            "0014-add-source-backed-c5-verb-tranche-2.patch",
            "0022-add-peethu-verb-coverage.patch",
            "0018-add-short-honorific-verb-forms.patch",
            "0019-add-participial-person-nominals.patch",
            "0023-add-source-backed-c5-primary-verb-stems.patch",
            "0024-add-source-backed-c5-primary-verb-stems-2.patch",
            "0082-add-systematic-c5-light-verb-compounds.patch",
            "0086-add-source-backed-c5-verb-roots-lexicon-light.patch",
            "0091-add-source-backed-c5-remaining-verb-roots.patch",
            "0061-add-modern-present-finite-coverage.patch",
            "0065-add-class-level-modern-perfect-and-verbal-nouns.patch",
            "0134-normalize-c3-and-add-negative-action-nominals.patch",
            "0144-remove-invalid-productive-expansions-c3.patch",
            "0150-remove-transitive-invalid-expansions-c3.patch",
            "0174-add-present-human-plural-continuations-verb-c3.patch",
            "0176-correct-nar-agreement-verb-c3.patch",
            "0185-add-modern-present-adjectival-participles-verb-c3.patch",
            "0194-disambiguate-c3-rule-names.patch",
            "0200-add-citation-rule-verb-c3.patch",
            "0232-add-reported-complements-verb-c3.patch",
            "0233-add-nonfinite-sandhi-verb-c3.patch",
            "0236-add-verbal-noun-cases-verb-c3.patch",
            "0237-fix-c3-short-future-gemination.patch",
            "0253-complete-c3-agreement-matrix.patch",
            "0266-complete-modern-perfect-and-past-plural-verb-c3.patch",
            "0271-complete-participial-nominals-verb-c3.patch",
            "0280-repair-irregular-sol-past.patch",
            "0311-add-verb-question-clitic-verb-c3.patch",
            "0321-add-productive-worthy-focus-verb-c3.patch",
            "0330-add-purpose-reporting-verb-c3.patch",
            "0335-add-temporal-and-common-roots-verb-c3.patch",
            "0338-complete-c3-temporal-and-participial-oor.patch",
            "0340-add-c3-literary-conditional-rewrite.patch",
            "0342-final-systemic-verb-c3.patch",
            "0346-final-common-verb-c3.patch",
            "0349-systematic-colloquial-verb-c3.patch",
            "0355-add-gendered-participial-nouns-verb-c3.patch",
            "0357-fix-colloquial-ng-questions-verb-c3.patch",
            "0358-complete-finite-second-person-questions-verb-c3.patch",
            "0362-add-colloquial-finite-negative-verb-c3.patch",
            "0364-add-infinitive-focus-verb-c3.patch",
            "0366-add-colloquial-participial-nominals-verb-c3.patch",
            "0367-complete-finite-conditional-clitics-verb-c3.patch",
            "0370-add-spoken-predicate-repairs-verb-c3.patch",
            "0371-repair-finite-clitic-realization-verb-c3.patch",
            "0381-add-non-nominal-colloquial-locatives-verb-c3.patch",
            "0387-complete-future-oor-participials-verb-c3.patch",
            "0415-formal-verbal-noun-accusatives-verb-c3.patch",
            "0418-complete-verbal-noun-extensions-verb-c3.patch",
            "0419-add-participial-possessives-verb-c3.patch",
            "0425-colloquial-imperative-parity-verb-c3.patch",
        ],
        "add_pairs": [
            "0349-systematic-colloquial-verb-c3.fst.tsv",
            "0380-complete-atomic-colloquial-questions-verb-c3.fst.tsv",
            "0400-add-final-irregular-relations-verb-c3.tsv",
        ],
    },
    {
        "name": "verb-c4",
        "zip": "ThamizhiMorph-Verbs.zip",
        "entry": "ThamizhiFST-C4.foma",
        "output": "verb-c4.fst",
        "patches": [
            "0006-add-common-verb-coverage.patch",
            "0008-expand-source-backed-verb-coverage.patch",
            "0009-add-irregular-existential-verb.patch",
            "0011-add-source-backed-c5-verb-tranche.patch",
            "0014-add-source-backed-c5-verb-tranche-2.patch",
            "0022-add-peethu-verb-coverage.patch",
            "0018-add-short-honorific-verb-forms.patch",
            "0019-add-participial-person-nominals.patch",
            "0023-add-source-backed-c5-primary-verb-stems.patch",
            "0024-add-source-backed-c5-primary-verb-stems-2.patch",
            "0082-add-systematic-c5-light-verb-compounds.patch",
            "0086-add-source-backed-c5-verb-roots-lexicon-light.patch",
            "0091-add-source-backed-c5-remaining-verb-roots.patch",
            "0046-add-c4-u-final-future-forms.patch",
            "0050-add-c4-modern-human-plural-verb-coverage.patch",
            "0052-add-c4-modern-nonfinite-verb-forms.patch",
            "0069-add-reviewed-modern-bare-infinitives.patch",
            "0072-add-nati-c4-root.patch",
            "0127-add-c4-citation-verbal-nouns.patch",
            "0135-normalize-c4-and-add-negative-action-nominals.patch",
            "0145-remove-invalid-productive-expansions-c4.patch",
            "0151-remove-transitive-invalid-expansions-c4.patch",
            "0163-add-missing-c4-verb-homographs.patch",
            "0164-reclassify-ney-as-c4-verb.patch",
            "0167-remove-invalid-ney-c4-compounds.patch",
            "0174-add-present-human-plural-continuations-verb-c4.patch",
            "0176-correct-nar-agreement-verb-c4.patch",
            "0185-add-modern-present-adjectival-participles-verb-c4.patch",
            "0186-add-regular-modern-verbal-nominals-verb-c4.patch",
            "0192-repair-invalid-combining-sequences-verb-c4.patch",
            "0193-deduplicate-verb-c4-entries.patch",
            "0198-add-weak-readings-for-plain-tal-citations-c4.patch",
            "0200-add-final-citation-readings-verb-c4.patch",
            "0201-add-dual-source-known-head-compounds-c4.patch",
            "0213-add-final-reviewed-c4-roots.patch",
            "0226-reclassify-nadi-and-add-kandari-c4.patch",
            "0232-add-reported-complements-verb-c4.patch",
            "0233-add-nonfinite-sandhi-verb-c4.patch",
            "0236-add-verbal-noun-cases-verb-c4.patch",
            "0245-synchronize-padu-vpart-compounds-c4.patch",
            "0261-remove-citation-contradicted-c4-assignments.patch",
            "0266-complete-modern-perfect-and-past-plural-verb-c4.patch",
            "0271-complete-participial-nominals-verb-c4.patch",
            "0287-remove-orphaned-compounds-c4.patch",
            "0291-remove-unresolved-productive-compounds-c4.patch",
            "0302-add-c4-ability-mudi-subclass.patch",
            "0304-fix-c4-mudi-infinitive.patch",
            "0311-add-verb-question-clitic-verb-c4.patch",
            "0322-add-focus-and-repair-i-final-modal-verb-c4.patch",
            "0330-add-purpose-reporting-verb-c4.patch",
            "0335-add-temporal-and-common-roots-verb-c4.patch",
            "0338-complete-c4-auxiliary-participial-oor.patch",
            "0341-repair-c4-manner-and-u-final-future.patch",
            "0342-final-systemic-verb-c4.patch",
            "0345-repair-c4-weak-infinitives.patch",
            "0346-final-common-verb-c4.patch",
            "0349-systematic-colloquial-verb-c4.patch",
            "0355-add-gendered-participial-nouns-verb-c4.patch",
            "0357-fix-colloquial-ng-questions-verb-c4.patch",
            "0358-complete-finite-second-person-questions-verb-c4.patch",
            "0362-add-colloquial-finite-negative-verb-c4.patch",
            "0364-add-infinitive-focus-verb-c4.patch",
            "0366-add-colloquial-participial-nominals-verb-c4.patch",
            "0367-complete-finite-conditional-clitics-verb-c4.patch",
            "0370-add-spoken-predicate-repairs-verb-c4.patch",
            "0371-repair-finite-clitic-realization-verb-c4.patch",
            "0379-add-infinitive-focus-verb-c4.patch",
            "0381-add-non-nominal-colloquial-locatives-verb-c4.patch",
            "0387-complete-future-oor-participials-verb-c4.patch",
            "0414-final-verb-class-corrections-verb-c4.patch",
            "0415-formal-verbal-noun-accusatives-verb-c4.patch",
            "0417-add-final-common-verb-roots-verb-c4.patch",
            "0418-complete-verbal-noun-extensions-verb-c4.patch",
            "0419-add-participial-possessives-verb-c4.patch",
            "0421-add-residual-c4-compound-roots.patch",
            "0425-colloquial-imperative-parity-verb-c4.patch",
            "0430-fix-c4-aay-infinitives.patch",
        ],
    },
    {
        "name": "verb-c11",
        "zip": "ThamizhiMorph-Verbs.zip",
        "entry": "ThamizhiFST-C11.foma",
        "output": "verb-c11.fst",
        "patches": [
            "0006-add-common-verb-coverage.patch",
            "0008-expand-source-backed-verb-coverage.patch",
            "0009-add-irregular-existential-verb.patch",
            "0011-add-source-backed-c5-verb-tranche.patch",
            "0014-add-source-backed-c5-verb-tranche-2.patch",
            "0022-add-peethu-verb-coverage.patch",
            "0018-add-short-honorific-verb-forms.patch",
            "0019-add-participial-person-nominals.patch",
            "0023-add-source-backed-c5-primary-verb-stems.patch",
            "0024-add-source-backed-c5-primary-verb-stems-2.patch",
            "0082-add-systematic-c5-light-verb-compounds.patch",
            "0086-add-source-backed-c5-verb-roots-lexicon-light.patch",
            "0091-add-source-backed-c5-remaining-verb-roots.patch",
            "0063-add-reviewed-c11-verb-root-coverage.patch",
            "0081-add-systematic-c11-tier1-verb-roots.patch",
            "0085-add-systematic-c11-tier2-verb-roots.patch",
            "0089-add-source-backed-c11-remaining-verb-roots.patch",
            "0039-add-c11-loan-verb-stems.patch",
            "0065-add-class-level-modern-perfect-and-verbal-nouns.patch",
            "0125-add-c11-citation-verbal-nouns.patch",
            "0136-normalize-c11-and-add-negative-action-nominals.patch",
            "0146-remove-invalid-productive-expansions-c11.patch",
            "0152-remove-transitive-invalid-expansions-c11.patch",
            "0166-remove-incorrect-c11-ney-reading.patch",
            "0168-remove-invalid-ney-c11-compounds.patch",
            "0171-remove-invalid-ney-passive-c11-compounds.patch",
            "0174-add-present-human-plural-continuations-verb-c11.patch",
            "0176-correct-nar-agreement-verb-c11.patch",
            "0185-add-modern-present-adjectival-participles-verb-c11.patch",
            "0191-add-c11-perfect-participles.patch",
            "0192-repair-invalid-combining-sequences-verb-c11.patch",
            "0193-deduplicate-verb-c11-entries.patch",
            "0198-remove-unsupported-strong-readings-c11.patch",
            "0199-add-strong-readings-for-thal-citations-c11.patch",
            "0200-add-citation-rules-verb-c11.patch",
            "0215-add-final-reviewed-c11-root.patch",
            "0227-add-corpus-attested-common-verb-roots-c11.patch",
            "0232-add-reported-complements-verb-c11.patch",
            "0233-add-nonfinite-sandhi-verb-c11.patch",
            "0236-add-verbal-noun-cases-verb-c11.patch",
            "0246-synchronize-padu-vpart-compounds-c11.patch",
            "0254-complete-c11-agreement-matrix.patch",
            "0257-restore-compound-strong-readings.patch",
            "0260-remove-citation-contradicted-c11-assignments.patch",
            "0266-complete-modern-perfect-and-past-plural-verb-c11.patch",
            "0270-fix-c11-negative-adjectival.patch",
            "0271-complete-participial-nominals-verb-c11.patch",
            "0282-remove-duplicate-iru-c11-root.patch",
            "0284-remove-invalid-passive-connectors-c11.patch",
            "0288-remove-orphaned-compounds-c11.patch",
            "0292-remove-unresolved-productive-compounds-c11.patch",
            "0300-move-ability-mudi-out-of-c11.patch",
            "0311-add-verb-question-clitic-verb-c11.patch",
            "0312-fix-c11-simple-neuter-future.patch",
            "0321-add-productive-worthy-focus-verb-c11.patch",
            "0330-add-purpose-reporting-verb-c11.patch",
            "0335-add-temporal-and-common-roots-verb-c11.patch",
            "0338-complete-c11-auxiliary-participial-oor.patch",
            "0342-final-systemic-verb-c11.patch",
            "0346-final-common-verb-c11.patch",
            "0349-systematic-colloquial-verb-c11.patch",
            "0352-fix-c11-negative-imperatives.patch",
            "0355-add-gendered-participial-nouns-verb-c11.patch",
            "0356-add-c11-i-final-colloquial-past.patch",
            "0357-fix-colloquial-ng-questions-verb-c11.patch",
            "0358-complete-finite-second-person-questions-verb-c11.patch",
            "0360-add-vai-colloquial-past-subclass.patch",
            "0362-add-colloquial-finite-negative-verb-c11.patch",
            "0364-add-infinitive-focus-verb-c11.patch",
            "0365-add-spoken-present-subclasses-verb-c11.patch",
            "0366-add-colloquial-participial-nominals-verb-c11.patch",
            "0367-complete-finite-conditional-clitics-verb-c11.patch",
            "0370-add-spoken-predicate-repairs-verb-c11.patch",
            "0371-repair-finite-clitic-realization-verb-c11.patch",
            "0372-complete-finite-second-person-questions-verb-c11.patch",
            "0381-add-non-nominal-colloquial-locatives-verb-c11.patch",
            "0387-complete-future-oor-participials-verb-c11.patch",
            "0414-final-verb-class-corrections-verb-c11.patch",
            "0415-formal-verbal-noun-accusatives-verb-c11.patch",
            "0417-add-final-common-verb-roots-verb-c11.patch",
            "0418-complete-verbal-noun-extensions-verb-c11.patch",
            "0419-add-participial-possessives-verb-c11.patch",
            "0425-colloquial-imperative-parity-verb-c11.patch",
            "0426-colloquial-imperative-parity-verb-c11.patch",
            "0427-add-i-final-colloquial-imperatives.patch",
        ],
    },
    {
        "name": "verb-c12",
        "zip": "ThamizhiMorph-Verbs.zip",
        "entry": "ThamizhiFST-C12.foma",
        "output": "verb-c12.fst",
        "patches": [
            "0006-add-common-verb-coverage.patch",
            "0008-expand-source-backed-verb-coverage.patch",
            "0009-add-irregular-existential-verb.patch",
            "0011-add-source-backed-c5-verb-tranche.patch",
            "0014-add-source-backed-c5-verb-tranche-2.patch",
            "0022-add-peethu-verb-coverage.patch",
            "0018-add-short-honorific-verb-forms.patch",
            "0019-add-participial-person-nominals.patch",
            "0023-add-source-backed-c5-primary-verb-stems.patch",
            "0024-add-source-backed-c5-primary-verb-stems-2.patch",
            "0082-add-systematic-c5-light-verb-compounds.patch",
            "0088-add-systematic-c12-tier2-verb-roots.patch",
            "0090-add-source-backed-c12-remaining-verb-roots.patch",
            "0086-add-source-backed-c5-verb-roots-lexicon-light.patch",
            "0091-add-source-backed-c5-remaining-verb-roots.patch",
            "0130-add-c12-phonological-citation-verbal-nouns.patch",
            "0137-normalize-c12-and-add-negative-action-nominals.patch",
            "0147-remove-invalid-productive-expansions-c12.patch",
            "0153-remove-transitive-invalid-expansions-c12.patch",
            "0169-remove-invalid-ney-c12-compounds.patch",
            "0174-add-present-human-plural-continuations-verb-c12.patch",
            "0176-correct-nar-agreement-verb-c12.patch",
            "0185-add-modern-present-adjectival-participles-verb-c12.patch",
            "0187-add-c12-modern-verbal-nominals.patch",
            "0192-repair-invalid-combining-sequences-verb-c12.patch",
            "0193-deduplicate-verb-c12-entries.patch",
            "0194-disambiguate-c12-rule-names.patch",
            "0200-add-citation-rule-verb-c12.patch",
            "0212-remove-redundant-c12-iru-mood-paradigm.patch",
            "0216-add-final-reviewed-c12-root.patch",
            "0232-add-reported-complements-verb-c12.patch",
            "0233-add-nonfinite-sandhi-verb-c12.patch",
            "0236-add-verbal-noun-cases-verb-c12.patch",
            "0247-synchronize-padu-vpart-compounds-c12.patch",
            "0251-deduplicate-c12-thonnaa.patch",
            "0266-complete-modern-perfect-and-past-plural-verb-c12.patch",
            "0271-complete-participial-nominals-verb-c12.patch",
            "0273-fix-iru-auxiliary-present.patch",
            "0279-restore-standalone-iru-c12.patch",
            "0282-add-iru-citation-c12.patch",
            "0286-remove-unsupported-vala-c12.patch",
            "0289-remove-orphaned-compounds-c12.patch",
            "0293-remove-unresolved-productive-compounds-c12.patch",
            "0298-add-corpus-attested-iru-chains.patch",
            "0311-add-verb-question-clitic-verb-c12.patch",
            "0320-complete-c12-modal-worthy-focus.patch",
            "0330-add-purpose-reporting-verb-c12.patch",
            "0335-add-temporal-and-common-roots-verb-c12.patch",
            "0338-complete-c12-auxiliary-participial-oor.patch",
            "0342-final-systemic-verb-c12.patch",
            "0346-final-common-verb-c12.patch",
            "0349-systematic-colloquial-verb-c12.patch",
            "0355-add-gendered-participial-nouns-verb-c12.patch",
            "0357-fix-colloquial-ng-questions-verb-c12.patch",
            "0358-complete-finite-second-person-questions-verb-c12.patch",
            "0362-add-colloquial-finite-negative-verb-c12.patch",
            "0364-add-infinitive-focus-verb-c12.patch",
            "0365-add-spoken-present-subclasses-verb-c12.patch",
            "0366-add-colloquial-participial-nominals-verb-c12.patch",
            "0367-complete-finite-conditional-clitics-verb-c12.patch",
            "0370-add-spoken-predicate-repairs-verb-c12.patch",
            "0371-repair-finite-clitic-realization-verb-c12.patch",
            "0372-complete-finite-second-person-questions-verb-c12.patch",
            "0375-add-colloquial-finite-negative-verb-c12.patch",
            "0374-add-infinitive-focus-verb-c12.patch",
            "0377-add-colloquial-participial-nominals-verb-c12.patch",
            "0378-complete-finite-conditional-clitics-verb-c12.patch",
            "0381-add-non-nominal-colloquial-locatives-verb-c12.patch",
            "0387-complete-future-oor-participials-verb-c12.patch",
            "0390-correct-c12-short-honorific-agreement.patch",
            "0391-complete-c12-hortative-parity.patch",
            "0415-formal-verbal-noun-accusatives-verb-c12.patch",
            "0418-complete-verbal-noun-extensions-verb-c12.patch",
            "0419-add-participial-possessives-verb-c12.patch",
            "0425-colloquial-imperative-parity-verb-c12.patch",
            "0426-colloquial-imperative-parity-verb-c12.patch",
        ],
        "add_pairs": [
            "0349-systematic-colloquial-verb-c12.fst.tsv",
            "0380-complete-atomic-colloquial-questions-verb-c12.fst.tsv",
            "0385-complete-iru-colloquial-finite-relations.tsv",
            "0392-complete-iru-conditional-agreement.tsv",
            "0428-add-iru-colloquial-relative.tsv",
        ],
    },
    {
        "name": "verb-c62",
        "zip": "ThamizhiMorph-Verbs.zip",
        "entry": "ThamizhiFST-C62.foma",
        "output": "verb-c62.fst",
        "patches": [
            "0006-add-common-verb-coverage.patch",
            "0008-expand-source-backed-verb-coverage.patch",
            "0009-add-irregular-existential-verb.patch",
            "0011-add-source-backed-c5-verb-tranche.patch",
            "0014-add-source-backed-c5-verb-tranche-2.patch",
            "0022-add-peethu-verb-coverage.patch",
            "0018-add-short-honorific-verb-forms.patch",
            "0019-add-participial-person-nominals.patch",
            "0023-add-source-backed-c5-primary-verb-stems.patch",
            "0024-add-source-backed-c5-primary-verb-stems-2.patch",
            "0082-add-systematic-c5-light-verb-compounds.patch",
            "0086-add-source-backed-c5-verb-roots-lexicon-light.patch",
            "0091-add-source-backed-c5-remaining-verb-roots.patch",
            "0129-add-c62-citation-verbal-nouns.patch",
            "0138-normalize-c62-and-add-negative-action-nominals.patch",
            "0148-remove-invalid-productive-expansions-c62.patch",
            "0154-remove-transitive-invalid-expansions-c62.patch",
            "0174-add-present-human-plural-continuations-verb-c62.patch",
            "0176-correct-nar-agreement-verb-c62.patch",
            "0185-add-modern-present-adjectival-participles-verb-c62.patch",
            "0186-add-regular-modern-verbal-nominals-verb-c62.patch",
            "0232-add-reported-complements-verb-c62.patch",
            "0233-add-nonfinite-sandhi-verb-c62.patch",
            "0236-add-verbal-noun-cases-verb-c62.patch",
            "0266-complete-modern-perfect-and-past-plural-verb-c62.patch",
            "0271-complete-participial-nominals-verb-c62.patch",
            "0311-add-verb-question-clitic-verb-c62.patch",
            "0322-add-productive-focus-verb-c62.patch",
            "0330-add-purpose-reporting-verb-c62.patch",
            "0335-add-temporal-and-common-roots-verb-c62.patch",
            "0338-complete-c62-participial-oor.patch",
            "0342-final-systemic-verb-c62.patch",
            "0346-final-common-verb-c62.patch",
            "0349-systematic-colloquial-verb-c62.patch",
            "0355-add-gendered-participial-nouns-verb-c62.patch",
            "0357-fix-colloquial-ng-questions-verb-c62.patch",
            "0358-complete-finite-second-person-questions-verb-c62.patch",
            "0362-add-colloquial-finite-negative-verb-c62.patch",
            "0364-add-infinitive-focus-verb-c62.patch",
            "0366-add-colloquial-participial-nominals-verb-c62.patch",
            "0367-complete-finite-conditional-clitics-verb-c62.patch",
            "0370-add-spoken-predicate-repairs-verb-c62.patch",
            "0371-repair-finite-clitic-realization-verb-c62.patch",
            "0381-add-non-nominal-colloquial-locatives-verb-c62.patch",
            "0387-complete-future-oor-participials-verb-c62.patch",
            "0415-formal-verbal-noun-accusatives-verb-c62.patch",
            "0418-complete-verbal-noun-extensions-verb-c62.patch",
            "0419-add-participial-possessives-verb-c62.patch",
            "0425-colloquial-imperative-parity-verb-c62.patch",
        ],
    },
    {
        "name": "verb-c-rest",
        "zip": "ThamizhiMorph-Verbs.zip",
        "entry": "ThamizhiFST-otherthan-3-4-62-11-12.foma",
        "output": "verb-c-rest.fst",
        "patches": [
            "0006-add-common-verb-coverage.patch",
            "0008-expand-source-backed-verb-coverage.patch",
            "0009-add-irregular-existential-verb.patch",
            "0011-add-source-backed-c5-verb-tranche.patch",
            "0014-add-source-backed-c5-verb-tranche-2.patch",
            "0022-add-peethu-verb-coverage.patch",
            "0018-add-short-honorific-verb-forms.patch",
            "0019-add-participial-person-nominals.patch",
            "0023-add-source-backed-c5-primary-verb-stems.patch",
            "0024-add-source-backed-c5-primary-verb-stems-2.patch",
            "0038-add-modern-verb-derived-forms.patch",
            "0041-complete-modern-verb-paradigms.patch",
            "0043-add-audit-backed-passive-verb-stems.patch",
            "0049-add-corpus-backed-modern-verb-coverage.patch",
            "0053-add-c2-koll-modern-infinitive.patch",
            "0083-add-systematic-c5-light-verb-compounds-c-rest.patch",
            "0087-add-source-backed-c5-verb-roots-lexicon-light-c-rest.patch",
            "0092-add-source-backed-c5-remaining-verb-roots-c-rest.patch",
            "0060-add-modern-verbal-nominal-forms.patch",
            "0061-add-modern-present-finite-coverage.patch",
            "0084-add-c8-short-honorific-forms.patch",
            "0062-add-modern-passive-perfect-neuter-coverage.patch",
            "0064-add-reviewed-modern-perfect-hooks.patch",
            "0065-add-class-level-modern-perfect-and-verbal-nouns.patch",
            "0124-add-c5-citation-verbal-nouns.patch",
            "0126-add-c5-elided-citation-verbal-nouns.patch",
            "0131-add-minor-rest-class-citation-verbal-nouns.patch",
            "0066-add-passive-verbal-noun-negative-rule.patch",
            "0070-add-c11-passive-family-coverage.patch",
            "0139-normalize-c-rest-and-add-negative-action-nominals.patch",
            "0149-remove-invalid-productive-expansions-c-rest.patch",
            "0155-remove-transitive-invalid-expansions-c-rest.patch",
            "0165-add-explicit-c5-citation-stems.patch",
            "0170-remove-invalid-ney-c-rest-compounds.patch",
            "0172-remove-invalid-ney-passive-c-rest-compounds.patch",
            "0174-add-present-human-plural-continuations-verb-c-rest.patch",
            "0175-complete-existing-passive-stem-continuations-c-rest.patch",
            "0176-correct-nar-agreement-verb-c-rest.patch",
            "0185-add-modern-present-adjectival-participles-verb-c-rest.patch",
            "0186-add-regular-modern-verbal-nominals-verb-c-rest.patch",
            "0187-add-reviewed-auxiliary-verbal-nominals.patch",
            "0188-correct-and-expand-modern-class13-aaku.patch",
            "0189-add-passive-short-present-honorific.patch",
            "0190-add-passive-past-perfect-participle.patch",
            "0192-repair-invalid-combining-sequences-verb-c-rest.patch",
            "0193-deduplicate-verb-c-rest-entries.patch",
            "0199-remove-unsupported-weak-readings-c5.patch",
            "0200-add-citation-rules-verb-c-rest.patch",
            "0201-add-dual-source-known-head-compounds-c-rest.patch",
            "0202-add-participial-po-compounds.patch",
            "0203-add-runtime-modifier-sey-compounds.patch",
            "0204-add-source-noun-modifier-sey-compounds.patch",
            "0205-add-irregular-nil-paradigm.patch",
            "0206-add-reviewed-po-connectors.patch",
            "0208-add-nil-participial-po-compound.patch",
            "0211-split-c61-c63-continuations.patch",
            "0214-add-final-reviewed-c2-compounds.patch",
            "0224-add-reviewed-passive-stems.patch",
            "0226-reclassify-corpus-attested-idu.patch",
            "0227-add-corpus-attested-common-verb-roots-c-rest.patch",
            "0228-complete-suppletive-thaa-vaa-nonpast.patch",
            "0229-add-verified-common-passive-stems.patch",
            "0232-add-reported-complements-verb-c-rest.patch",
            "0233-add-nonfinite-sandhi-verb-c-rest.patch",
            "0236-add-verbal-noun-cases-verb-c-rest.patch",
            "0239-canonicalize-passive-perfect-hooks.patch",
            "0241-canonicalize-passive-paradigm-lemmas.patch",
            "0242-remove-orphan-passive-perfect-hooks.patch",
            "0243-close-passive-canonical-lemma-holds.patch",
            "0244-reclassify-padu-head-verbs.patch",
            "0248-synchronize-padu-vpart-compounds-c-rest.patch",
            "0249-complete-po-modern-paradigm.patch",
            "0250-repair-class13-and-invalid-c5-roots.patch",
            "0252-add-irregular-future-neuter.patch",
            "0255-complete-irregular-agreement-matrix.patch",
            "0258-restore-c13-nonfinite-variants.patch",
            "0259-remove-citation-contradicted-c-rest-assignments.patch",
            "0266-complete-modern-perfect-and-past-plural-verb-c-rest.patch",
            "0271-complete-participial-nominals-verb-c-rest.patch",
            "0283-add-causative-iruttu-c5.patch",
            "0285-remove-invalid-passive-connectors-c-rest.patch",
            "0290-remove-orphaned-compounds-c-rest.patch",
            "0294-remove-unresolved-productive-compounds-c-rest.patch",
            "0299-add-nadanthuperu-progressive-vaa-chain.patch",
            "0301-add-en-infinitive-and-passive.patch",
            "0303-fix-vaa-nonpast-stems.patch",
            "0305-complete-vaa-auxiliary-continuation.patch",
            "0311-add-verb-question-clitic-verb-c-rest.patch",
            "0313-fix-vaa-neuter-future-before-question.patch",
            "0316-scope-vaa-rewrites-to-class17.patch",
            "0317-clean-class17-scope-marker.patch",
            "0318-complete-en-passive-perfect-hook.patch",
            "0319-complete-passive-worthy-focus-verb-c-rest.patch",
            "0330-add-purpose-reporting-and-core-roots-c-rest.patch",
            "0335-add-temporal-and-common-roots-verb-c-rest.patch",
            "0336-repair-verb-c7-realization.patch",
            "0338-repair-c2-c8-neuter-future-rewrites.patch",
            "0338-complete-c-rest-productive-continuations.patch",
            "0342-final-systemic-verb-c-rest.patch",
            "0346-final-common-verb-c-rest.patch",
            "0349-systematic-colloquial-verb-c-rest.patch",
            "0355-add-gendered-participial-nouns-verb-c-rest.patch",
            "0356-complete-c5-colloquial-present.patch",
            "0356-add-sey-colloquial-past.patch",
            "0357-fix-colloquial-ng-questions-verb-c-rest.patch",
            "0358-complete-finite-second-person-questions-verb-c-rest.patch",
            "0362-add-colloquial-finite-negative-verb-c-rest.patch",
            "0364-add-infinitive-focus-verb-c-rest.patch",
            "0365-add-spoken-present-subclasses-verb-c-rest.patch",
            "0366-add-colloquial-participial-nominals-verb-c-rest.patch",
            "0367-complete-finite-conditional-clitics-verb-c-rest.patch",
            "0370-add-spoken-predicate-repairs-verb-c-rest.patch",
            "0371-repair-finite-clitic-realization-verb-c-rest.patch",
            "0372-complete-finite-second-person-questions-verb-c-rest.patch",
            "0375-add-colloquial-finite-negative-verb-c-rest.patch",
            "0374-add-infinitive-focus-verb-c-rest.patch",
            "0377-add-colloquial-participial-nominals-verb-c-rest.patch",
            "0378-complete-finite-conditional-clitics-verb-c-rest.patch",
            "0379-add-infinitive-focus-verb-c-rest.patch",
            "0381-add-non-nominal-colloquial-locatives-verb-c-rest.patch",
            "0387-complete-future-oor-participials-verb-c-rest.patch",
            "0389-remove-poru-c5-misclassification.patch",
            "0395-complete-ul-existential-agreement.patch",
            "0401-complete-c13-negative-vpart.patch",
            "0408-add-meet-transitive-subclass.patch",
            "0412-complete-prefixed-eel-paradigms.patch",
            "0414-final-verb-class-corrections-verb-c-rest.patch",
            "0415-formal-verbal-noun-accusatives-verb-c-rest.patch",
            "0417-add-final-common-verb-roots-verb-c-rest.patch",
            "0418-complete-verbal-noun-extensions-verb-c-rest.patch",
            "0419-add-participial-possessives-verb-c-rest.patch",
            "0422-remove-dead-prefixed-vaa-root.patch",
            "0423-add-thisai-thiruppu-c5-root.patch",
            "0425-colloquial-imperative-parity-verb-c-rest.patch",
            "0426-colloquial-imperative-parity-verb-c-rest.patch",
        ],
        "add_pairs": [
            "0349-systematic-colloquial-verb-c-rest.fst.tsv",
            "0380-complete-atomic-colloquial-questions-verb-c-rest.fst.tsv",
            "0383-add-paar-colloquial-past-relations.tsv",
            "0388-complete-c17-future-oor-participials.tsv",
            "0396-add-reviewed-irregular-and-closed-relations.tsv",
            "0398-add-closed-class-parity-verb-c-rest.tsv",
        ],
    },
    {
        "name": "pronoun",
        "mode": "copy-prebuilt",
        "source": "FST-Models/pronoun.fst",
        "output": "pronoun.fst",
        "reject_pairs": [
            ("இது+pron+dem+prox+pl+2sgn+nom", "இது"),
            ("அது+pron+dem+dist+pl+3sgn+nom", "அது"),
        ],
        "reject_pair_files": ["0373-canonicalize-pronoun-oblique-lemmas.reject.tsv"],
        "add_pairs": [
            "0231-pronoun-case-continuations.tsv",
            "0268-clean-pronoun-focus-continuations.tsv",
            "0263-add-productive-pronoun-relations.tsv",
            "0331-add-colloquial-first-plural-possessive.tsv",
            "0359-add-pronoun-predicate-questions.tsv",
            "0361-add-interrogative-utaiya.tsv",
            "0363-add-colloquial-pronoun-locatives.tsv",
            "0373-complete-pronoun-case-matrix.tsv",
            "0384-complete-pronoun-in-genitive-syncretism.tsv",
            "0398-add-closed-class-parity-pronoun.tsv",
            "0406-add-final-pronoun-relations.tsv",
            "0438-add-pronoun-translative-copular.tsv",
        ],
        "canonicalize_deictic_person": True,
    },
]


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def run(cmd: list[str], cwd: Path | None = None, stdin: str | None = None) -> str:
    completed = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        input=stdin,
        text=True,
        capture_output=True,
        check=True,
    )
    return completed.stdout


def resolve_vendor_commit() -> str:
    """
    Resolve vendored upstream commit for manifest metadata.

    In local/dev this is read from submodule git metadata.
    In Docker builds the copied vendor directory may not be a git worktree, so
    fall back to parsing the pinned commit from vendor README, then to a stable
    placeholder string.
    """
    try:
        top_level = run(["git", "-C", str(VENDOR), "rev-parse", "--show-toplevel"]).strip()
        if Path(top_level).resolve() != VENDOR.resolve():
            raise RuntimeError("vendor directory is not an independent git worktree")
        return run(["git", "-C", str(VENDOR), "rev-parse", "HEAD"]).strip()
    except Exception:
        readme_path = VENDOR / "README.md"
        if readme_path.exists():
            text = readme_path.read_text(encoding="utf-8", errors="replace")
            match = re.search(r"([0-9a-f]{40})", text)
            if match:
                return match.group(1)
        return PINNED_FALLBACK_UPSTREAM_COMMIT


def resolve_zip_path(zip_name: str) -> Path:
    vendored = VENDOR / "foma" / zip_name
    if vendored.exists():
        return vendored
    pinned = PINNED_UPSTREAM_ZIPS / zip_name
    if pinned.exists():
        return pinned
    raise FileNotFoundError(
        f"Missing upstream source zip: {vendored} (also not found at {pinned})"
    )


def resolve_prebuilt_model(source_rel_path: str) -> Path:
    vendored = VENDOR / source_rel_path
    if vendored.exists():
        return vendored
    pinned = PINNED_UPSTREAM_MODELS / Path(source_rel_path).name
    if pinned.exists():
        return pinned
    raise FileNotFoundError(
        f"Missing prebuilt model: {vendored} (also not found at {pinned})"
    )


def ensure_tools() -> None:
    for tool in ("foma", "flookup", "git"):
        if shutil.which(tool) is None:
            raise RuntimeError(f"Required tool not found on PATH: {tool}")


def extract_zip(zip_name: str, out_dir: Path) -> None:
    zip_path = resolve_zip_path(zip_name)
    with ZipFile(zip_path, "r") as zf:
        zf.extractall(out_dir)


def apply_patches(work_dir: Path, patch_names: list[str]) -> list[dict]:
    records = []
    for patch_name in patch_names:
        patch_path = PATCH_DIR / patch_name
        if not patch_path.exists():
            raise FileNotFoundError(f"Patch file not found: {patch_path}")
        run(["git", "apply", "--check", str(patch_path)], cwd=work_dir)
        run(["git", "apply", str(patch_path)], cwd=work_dir)
        records.append({
            "file": str((Path("fst") / "patches" / patch_name).as_posix()),
            "sha256": sha256_file(patch_path),
        })
    return records


def generate_adj_entry(work_dir: Path) -> None:
    lexc_file = work_dir / "tamil-adjectives.lexc"
    if not lexc_file.exists():
        raise FileNotFoundError(f"Expected source file missing: {lexc_file}")
    entry = work_dir / "__generated_adj_build.foma"
    entry.write_text(
        "read lexc tamil-adjectives.lexc\n"
        "define Lexicon;\n"
        "regex Lexicon;\n",
        encoding="utf-8",
    )


def compile_foma(work_dir: Path, entry_file: str, output_name: str) -> Path:
    entry_path = work_dir / entry_file
    if not entry_path.exists():
        raise FileNotFoundError(f"Missing entry script: {entry_path}")
    commands = f"source {entry_file}\nsave stack {output_name}\nquit\n"
    run(["foma"], cwd=work_dir, stdin=commands)
    out_path = work_dir / output_name
    if not out_path.exists() or out_path.stat().st_size == 0:
        raise RuntimeError(f"foma did not produce output: {out_path}")
    return out_path


def remove_finite_relation_pairs(model_path: Path, rejected_pairs: list[tuple[str, str]]) -> None:
    """Recompile a finite prebuilt relation after removing exact upper/lower pairs."""
    pairs_path = model_path.with_suffix(".pairs.txt")
    script_path = model_path.with_suffix(".filter.foma")
    filtered_path = model_path.with_suffix(".filtered.fst")
    run(
        ["foma"],
        cwd=model_path.parent,
        stdin=f"load stack {model_path}\nprint pairs > {pairs_path}\nquit\n",
    )
    rejected = set(rejected_pairs)
    kept: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for line in pairs_path.read_text(encoding="utf-8").splitlines():
        upper, lower = line.split("\t", 1)
        pair = (upper, lower)
        if pair in rejected:
            seen.add(pair)
        else:
            kept.append(pair)
    missing = rejected - seen
    if missing:
        raise RuntimeError(f"Prebuilt cleanup pairs not found in {model_path.name}: {sorted(missing)}")

    def quoted(value: str) -> str:
        return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'

    relation = " |\n".join(
        f"[{quoted(upper)} .x. {quoted(lower)}]" for upper, lower in kept
    )
    script_path.write_text(
        f"regex {relation};\nsave stack {filtered_path}\nquit\n",
        encoding="utf-8",
    )
    run(["foma", "-q", "-f", str(script_path)], cwd=model_path.parent)
    filtered_path.replace(model_path)
    pairs_path.unlink()
    script_path.unlink()


def add_finite_relation_pairs(model_path: Path, additions_path: Path) -> int:
    """Recompile a finite relation after adding explicit upper/lower pairs."""
    pairs_path = model_path.with_suffix(".pairs.txt")
    script_path = model_path.with_suffix(".extend.foma")
    extended_path = model_path.with_suffix(".extended.fst")
    run(
        ["foma"],
        cwd=model_path.parent,
        stdin=f"load stack {model_path}\nprint pairs > {pairs_path}\nquit\n",
    )
    pairs: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for line in pairs_path.read_text(encoding="utf-8").splitlines():
        pair = tuple(line.split("\t", 1))
        if len(pair) != 2:
            raise RuntimeError(f"Malformed finite relation pair: {line!r}")
        typed_pair = (pair[0], pair[1])
        if typed_pair not in seen:
            seen.add(typed_pair)
            pairs.append(typed_pair)

    added = 0
    for line in additions_path.read_text(encoding="utf-8").splitlines():
        pair = tuple(line.split("\t", 1))
        if len(pair) != 2:
            raise RuntimeError(f"Malformed extension pair in {additions_path.name}: {line!r}")
        typed_pair = (pair[0], pair[1])
        if typed_pair not in seen:
            seen.add(typed_pair)
            pairs.append(typed_pair)
            added += 1

    def quoted(value: str) -> str:
        return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'

    relation = " |\n".join(
        f"[{quoted(upper)} .x. {quoted(lower)}]" for upper, lower in pairs
    )
    script_path.write_text(
        f"regex {relation};\nsave stack {extended_path}\nquit\n",
        encoding="utf-8",
    )
    run(["foma", "-q", "-f", str(script_path)], cwd=model_path.parent)
    extended_path.replace(model_path)
    pairs_path.unlink()
    script_path.unlink()
    return added


def canonicalize_deictic_person(model_path: Path) -> int:
    """Correct upstream deictic-distance/person confusion in finite pronoun pairs."""
    person_by_lemma = {
        "இவன்": "3sgm", "இவள்": "3sgf", "இவர்": "3sgh", "இவர்கள்": "3pl",
        "இது": "3sgn", "இவை": "3pln",
        "உவன்": "3sgm", "உவள்": "3sgf", "உவர்": "3sgh", "உவர்கள்": "3pl",
        "உது": "3sgn", "உவை": "3pln", "அது": "3sgn",
    }
    replaceable = {"2sgm", "2sgf", "2sgh", "2sgn", "2pl"}
    pairs_path = model_path.with_suffix(".pairs.txt")
    script_path = model_path.with_suffix(".canonicalize.foma")
    corrected_path = model_path.with_suffix(".canonicalized.fst")
    run(
        ["foma"],
        cwd=model_path.parent,
        stdin=f"load stack {model_path}\nprint pairs > {pairs_path}\nquit\n",
    )
    corrected = 0
    pairs: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for line in pairs_path.read_text(encoding="utf-8").splitlines():
        upper, lower = line.split("\t", 1)
        parts = upper.split("+")
        person = person_by_lemma.get(parts[0])
        if person and "dem" in parts and (({"prox", "med"} & set(parts)) or parts[0] == "அது"):
            if parts[0] in {"இது", "உது", "அது"} and "pl" in parts:
                person = "3pln"
            updated = [person if part in replaceable else part for part in parts]
            new_upper = "+".join(updated)
            corrected += int(new_upper != upper)
            upper = new_upper
        pair = (upper, lower)
        if pair not in seen:
            seen.add(pair)
            pairs.append(pair)

    def quoted(value: str) -> str:
        return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'

    relation = " |\n".join(
        f"[{quoted(upper)} .x. {quoted(lower)}]" for upper, lower in pairs
    )
    script_path.write_text(
        f"regex {relation};\nsave stack {corrected_path}\nquit\n", encoding="utf-8"
    )
    run(["foma", "-q", "-f", str(script_path)], cwd=model_path.parent)
    corrected_path.replace(model_path)
    pairs_path.unlink()
    script_path.unlink()
    return corrected


def transform_finite_relation(
    model_path: Path,
    rejected_pairs: list[tuple[str, str]],
    addition_paths: list[Path],
    canonicalize_person: bool,
) -> tuple[list[int], int]:
    """Apply finite-pair cleanup, extensions and tag correction in one recompile."""
    pairs_path = model_path.with_suffix(".pairs.txt")
    script_path = model_path.with_suffix(".transform.foma")
    transformed_path = model_path.with_suffix(".transformed.fst")
    run(
        ["foma"],
        cwd=model_path.parent,
        stdin=f"load stack {model_path}\nprint pairs > {pairs_path}\nquit\n",
    )
    rejected = set(rejected_pairs)
    pairs: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for line in pairs_path.read_text(encoding="utf-8").splitlines():
        pair = tuple(line.split("\t", 1))
        if pair in rejected:
            continue
        typed_pair = (pair[0], pair[1])
        if typed_pair not in seen:
            seen.add(typed_pair)
            pairs.append(typed_pair)
    extension_counts: list[int] = []
    for additions_path in addition_paths:
        added = 0
        for line in additions_path.read_text(encoding="utf-8").splitlines():
            upper, lower = line.split("\t", 1)
            pair = (upper, lower)
            if pair not in seen:
                seen.add(pair)
                pairs.append(pair)
                added += 1
        extension_counts.append(added)

    canonicalized = 0
    if canonicalize_person:
        corrected_pairs: list[tuple[str, str]] = []
        corrected_seen: set[tuple[str, str]] = set()
        person_by_lemma = {
            "இவன்": "3sgm", "இவள்": "3sgf", "இவர்": "3sgh", "இவர்கள்": "3pl",
            "இது": "3sgn", "இவை": "3pln",
            "உவன்": "3sgm", "உவள்": "3sgf", "உவர்": "3sgh", "உவர்கள்": "3pl",
            "உது": "3sgn", "உவை": "3pln", "அது": "3sgn",
        }
        replaceable = {"2sgm", "2sgf", "2sgh", "2sgn", "2pl", "3sgn"}
        oblique_lemma_map = {
            "என்": "நான்", "எங்கள்": "நாங்கள்", "நம்": "நாம்",
            "உன்": "நீ", "உங்கள்": "நீங்கள்", "உம்": "நீர்", "தன்": "தான்",
        }
        case_tags = {"acc", "dat", "gen", "inst", "loc", "soc", "abl"}
        for upper, lower in pairs:
            parts = upper.split("+")
            person = person_by_lemma.get(parts[0])
            eligible = person and "dem" in parts and (({"prox", "med"} & set(parts)) or parts[0] == "அது")
            if eligible:
                if parts[0] in {"இது", "உது", "அது"} and "pl" in parts:
                    person = "3pln"
                new_upper = "+".join(person if part in replaceable else part for part in parts)
                canonicalized += int(new_upper != upper)
                upper = new_upper
                parts = upper.split("+")
            if parts[0] in oblique_lemma_map and case_tags & set(parts):
                updated = [oblique_lemma_map[parts[0]]]
                updated.extend(part for part in parts[1:] if part not in {"pssd", "med"})
                new_upper = "+".join(updated)
                canonicalized += int(new_upper != upper)
                upper = new_upper
            pair = (upper, lower)
            if pair not in corrected_seen:
                corrected_seen.add(pair)
                corrected_pairs.append(pair)
        pairs = corrected_pairs

    # Canonicalization can map an alternate upstream tag sequence onto a
    # rejected cleanup target, so enforce the cleanup set again at the end.
    pairs = [pair for pair in pairs if pair not in rejected]
    residual_rejected = rejected & set(pairs)
    if residual_rejected:
        raise RuntimeError(
            f"Prebuilt cleanup pairs remain in {model_path.name}: "
            f"{sorted(residual_rejected)}"
        )

    def quoted(value: str) -> str:
        return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'

    relation = " |\n".join(
        f"[{quoted(upper)} .x. {quoted(lower)}]" for upper, lower in pairs
    )
    script_path.write_text(
        f"regex {relation};\nsave stack {transformed_path}\nquit\n", encoding="utf-8"
    )
    run(["foma", "-q", "-f", str(script_path)], cwd=model_path.parent)
    transformed_path.replace(model_path)
    pairs_path.unlink()
    script_path.unlink()
    return extension_counts, canonicalized


def union_finite_relation_extensions(
    model_path: Path,
    addition_paths: list[Path],
) -> list[int]:
    """Union small reviewed relations without enumerating the compiled base FST."""
    pairs: list[tuple[str, str]] = []
    seen: set[tuple[str, str]] = set()
    extension_counts: list[int] = []
    for additions_path in addition_paths:
        added = 0
        for line_number, line in enumerate(
            additions_path.read_text(encoding="utf-8").splitlines(), start=1
        ):
            values = line.split("\t", 1)
            if len(values) != 2:
                raise ValueError(
                    f"Malformed relation row in {additions_path}:{line_number}: {line!r}"
                )
            pair = (values[0], values[1])
            if pair not in seen:
                seen.add(pair)
                pairs.append(pair)
                added += 1
        extension_counts.append(added)

    if not pairs:
        return extension_counts

    sigma_proc = subprocess.run(
        ["foma", "-q"],
        cwd=model_path.parent,
        input=f"load stack {model_path}\nprint sigma\nquit\n",
        text=True,
        capture_output=True,
        check=True,
    )
    sigma_text = sigma_proc.stdout + "\n" + sigma_proc.stderr
    sigma_line = next(
        (line for line in sigma_text.splitlines() if line.startswith("Sigma:")),
        None,
    )
    if sigma_line is None:
        raise RuntimeError(f"Could not read Foma sigma for {model_path.name}")
    symbols = set(sigma_line.removeprefix("Sigma:").strip().split()) - {"?", "@"}
    symbols.update(character for pair in pairs for value in pair for character in value)
    ordered_symbols = sorted(symbols, key=lambda symbol: (-len(symbol), symbol))

    def tokenize(value: str) -> list[str]:
        # Flookup tokenizes against the compiled alphabet. Reusing that exact
        # segmentation avoids both character/multichar mismatches and new
        # whole-string symbols that can shadow longer existing surfaces.
        best: list[list[str] | None] = [None] * (len(value) + 1)
        best[len(value)] = []
        for start in range(len(value) - 1, -1, -1):
            for symbol in ordered_symbols:
                if value.startswith(symbol, start) and best[start + len(symbol)] is not None:
                    best[start] = [symbol, *best[start + len(symbol)]]
                    break
        if best[0] is None:
            raise ValueError(
                f"Extension string cannot be segmented with {model_path.name} sigma: {value!r}"
            )
        return best[0]

    def quoted_symbol(symbol: str) -> str:
        return '"' + symbol.replace("\\", "\\\\").replace('"', '\\"') + '"'

    def symbol_sequence(value: str) -> str:
        return "[" + " ".join(quoted_symbol(symbol) for symbol in tokenize(value)) + "]"

    relation = " |\n".join(
        f"[{symbol_sequence(upper)} .x. {symbol_sequence(lower)}]"
        for upper, lower in pairs
    )
    transformed_path = model_path.with_suffix(".extended.fst")
    script_path = model_path.with_suffix(".extend.foma")
    script_path.write_text(
        f"load stack {model_path}\n"
        "define Base\n"
        f"regex Base | [{relation}];\n"
        f"save stack {transformed_path}\n"
        "quit\n",
        encoding="utf-8",
    )
    run(["foma", "-q", "-f", str(script_path)], cwd=model_path.parent)
    transformed_path.replace(model_path)
    script_path.unlink()
    return extension_counts


def copy_outputs(built_paths: dict[str, Path]) -> list[dict]:
    CANONICAL_MODELS.mkdir(parents=True, exist_ok=True)
    RUNTIME_MODELS.mkdir(parents=True, exist_ok=True)
    WORDLIST_MODELS.mkdir(parents=True, exist_ok=True)
    SERVER_MODELS.mkdir(parents=True, exist_ok=True)

    outputs = []
    for output_name, src_path in built_paths.items():
        dst_canonical = CANONICAL_MODELS / output_name
        dst_runtime = RUNTIME_MODELS / output_name
        dst_wordlists = WORDLIST_MODELS / output_name
        dst_server = SERVER_MODELS / output_name
        shutil.copy2(src_path, dst_canonical)
        shutil.copy2(src_path, dst_runtime)
        shutil.copy2(src_path, dst_wordlists)
        shutil.copy2(src_path, dst_server)
        outputs.append({
            "file": output_name,
            "sha256": sha256_file(src_path),
            "size_bytes": src_path.stat().st_size,
            "copied_to": [
                "build/fst-models",
                "runtime",
                "static-word-list/fst-models",
                "server/fst-models",
            ],
        })
    outputs.sort(key=lambda x: x["file"])
    return outputs


def build_all(clean: bool) -> dict:
    ensure_tools()

    if not VENDOR.exists() and not PINNED_UPSTREAM_ZIPS.exists():
        raise FileNotFoundError("Missing vendor source and fst/upstream-zips")

    if clean and WORK_ROOT.exists():
        shutil.rmtree(WORK_ROOT)
    WORK_ROOT.mkdir(parents=True, exist_ok=True)

    submodule_commit = resolve_vendor_commit()

    built_paths: dict[str, Path] = {}
    patch_records: list[dict] = []
    components_manifest: list[dict] = []

    for component in COMPONENTS:
        name = component["name"]
        comp_dir = WORK_ROOT / name
        if comp_dir.exists():
            shutil.rmtree(comp_dir)
        comp_dir.mkdir(parents=True, exist_ok=True)

        mode = component.get("mode", "compile")
        if mode == "copy-prebuilt":
            src = resolve_prebuilt_model(component["source"])
            out = comp_dir / component["output"]
            shutil.copy2(src, out)
            rejected_pairs = list(component.get("reject_pairs", []))
            rejection_files = component.get("reject_pair_files", [])
            for rejection_file in rejection_files:
                rejection_path = PATCH_DIR / rejection_file
                for line_number, line in enumerate(
                    rejection_path.read_text(encoding="utf-8").splitlines(), start=1
                ):
                    values = line.split("\t", 1)
                    if len(values) != 2:
                        raise ValueError(
                            f"Malformed rejection row in {rejection_path}:"
                            f"{line_number}: {line!r}"
                        )
                    rejected_pairs.append((values[0], values[1]))
            extensions = component.get("add_pairs", [])
            if isinstance(extensions, str):
                extensions = [extensions]
            addition_paths = [PATCH_DIR / extension for extension in extensions]
            added_counts, canonicalized_pairs = transform_finite_relation(
                out,
                rejected_pairs,
                addition_paths,
                bool(component.get("canonicalize_deictic_person")),
            )
            extension_records = []
            for extension, added_pairs in zip(extensions, added_counts):
                extension_records.append({
                    "file": extension,
                    "sha256": sha256_file(PATCH_DIR / extension),
                    "added_pairs": added_pairs,
                })
            built_paths[component["output"]] = out
            record = {
                "name": name,
                "mode": mode,
                "source": component["source"],
                "output": component["output"],
            }
            if extension_records:
                record["pair_extensions"] = extension_records
            if rejection_files:
                record["pair_rejections"] = [
                    {
                        "file": rejection_file,
                        "sha256": sha256_file(PATCH_DIR / rejection_file),
                    }
                    for rejection_file in rejection_files
                ]
            if canonicalized_pairs:
                record["canonicalized_deictic_person_pairs"] = canonicalized_pairs
            components_manifest.append(record)
            continue

        extract_zip(component["zip"], comp_dir)

        if name == "adj" and component["entry"].startswith("__generated"):
            generate_adj_entry(comp_dir)

        comp_patches = component.get("patches", [])
        if comp_patches:
            patch_records.extend(apply_patches(comp_dir, comp_patches))

        out_path = compile_foma(comp_dir, component["entry"], component["output"])
        extensions = component.get("add_pairs", [])
        if isinstance(extensions, str):
            extensions = [extensions]
        extension_records = []
        if extensions:
            addition_paths = [PATCH_DIR / extension for extension in extensions]
            if component.get("reject_pairs") or component.get("canonicalize_deictic_person"):
                added_counts, canonicalized_pairs = transform_finite_relation(
                    out_path,
                    component.get("reject_pairs", []),
                    addition_paths,
                    bool(component.get("canonicalize_deictic_person")),
                )
            else:
                added_counts = union_finite_relation_extensions(out_path, addition_paths)
                canonicalized_pairs = 0
            for extension, added_pairs in zip(extensions, added_counts):
                extension_records.append({
                    "file": extension,
                    "sha256": sha256_file(PATCH_DIR / extension),
                    "added_pairs": added_pairs,
                })
        else:
            canonicalized_pairs = 0
        built_paths[component["output"]] = out_path

        record = {
            "name": name,
            "mode": mode,
            "zip": component["zip"],
            "entry": component["entry"],
            "output": component["output"],
            "patches": component.get("patches", []),
        }
        if extension_records:
            record["pair_extensions"] = extension_records
        if canonicalized_pairs:
            record["canonicalized_deictic_person_pairs"] = canonicalized_pairs
        components_manifest.append(record)

    composition_inputs = WORK_ROOT / "composition-inputs"
    composition_inputs.mkdir(parents=True, exist_ok=True)
    for output_name, model_path in built_paths.items():
        shutil.copy2(model_path, composition_inputs / output_name)
    composition_output = WORK_ROOT / "verb-auxiliary"
    composition_output.mkdir(parents=True, exist_ok=True)
    composition_builder = ROOT / "fst" / "build" / "build_productive_auxiliary_fst.py"
    run([
        sys.executable,
        str(composition_builder),
        "--source-root", str(ROOT),
        "--fst-dir", str(composition_inputs),
        "--output-dir", str(composition_output),
    ])
    auxiliary_path = composition_output / "verb-auxiliary.fst"
    auxiliary_inventory = composition_output / "verb-auxiliary.inventory.json"
    built_paths[auxiliary_path.name] = auxiliary_path
    components_manifest.append({
        "name": "verb-auxiliary",
        "mode": "generated-composition",
        "builder": str(composition_builder.relative_to(ROOT)),
        "builder_sha256": sha256_file(composition_builder),
        "output": auxiliary_path.name,
        "inventory": auxiliary_inventory.name,
        "summary": json.loads(
            (composition_output / "summary.json").read_text(encoding="utf-8")
        ),
    })

    outputs_manifest = copy_outputs(built_paths)
    inventory_destinations = (
        CANONICAL_MODELS / auxiliary_inventory.name,
        WORDLIST_MODELS / auxiliary_inventory.name,
        SERVER_MODELS / auxiliary_inventory.name,
    )
    for destination in inventory_destinations:
        shutil.copy2(auxiliary_inventory, destination)
    sidecars_manifest = [{
        "file": auxiliary_inventory.name,
        "sha256": sha256_file(auxiliary_inventory),
        "size_bytes": auxiliary_inventory.stat().st_size,
        "copied_to": [
            "build/fst-models",
            "static-word-list/fst-models",
            "server/fst-models",
        ],
    }]

    patch_records = sorted(patch_records, key=lambda x: x["file"])

    manifest = {
        "built_at_utc": datetime.now(timezone.utc).isoformat(),
        "submodule": {
            "path": "vendor/thamizhi-morph",
            "commit": submodule_commit,
        },
        "components": components_manifest,
        "patches": patch_records,
        "outputs": outputs_manifest,
        "sidecars": sidecars_manifest,
    }

    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Build Solmaalai FST models from vendored sources")
    parser.add_argument("--no-clean", action="store_true", help="Do not clear fst/build/.work before build")
    args = parser.parse_args()

    manifest = build_all(clean=not args.no_clean)
    print("FST build completed")
    print(f"Submodule commit: {manifest['submodule']['commit']}")
    print(f"Models built: {len(manifest['outputs'])}")
    print(f"Manifest: {MANIFEST_PATH}")


if __name__ == "__main__":
    main()
