#!/usr/bin/env python3
"""Fast deterministic FST and dictionary regressions."""

from __future__ import annotations

import json
import argparse
import importlib.util
import subprocess
import sys
import tempfile
import re
from collections import defaultdict
from pathlib import Path
from zipfile import ZipFile

ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = ROOT / "fst" / "tests" / "fixtures" / "noun_morph_regressions.json"
VERB_FIXTURE_PATH = ROOT / "fst" / "tests" / "fixtures" / "verb_morph_regressions.json"
HEURISTIC_FIXTURE_PATH = ROOT / "fst" / "tests" / "fixtures" / "heuristic_class_regressions.json"
WIKTIONARY_REVIEW_FIXTURE_PATH = ROOT / "fst" / "tests" / "fixtures" / "wiktionary_resolution_regressions.json"
WIKTIONARY_UNKNOWN_REVIEW_PATH = ROOT / "fst" / "tests" / "fixtures" / "wiktionary_unknown_review_candidates.json"
FULL_MODE_FIXTURE_PATH = ROOT / "fst" / "tests" / "fixtures" / "full_mode_regressions.json"
MISC_FIXTURE_PATH = ROOT / "fst" / "tests" / "fixtures" / "misc_morph_regressions.json"
NOUN_FST_CANDIDATES = [
    ROOT / "build" / "fst-models" / "noun.fst",
    ROOT / "server" / "fst-models" / "noun.fst",
    ROOT / "static-word-list" / "fst-models" / "noun.fst",
]
FST_MODEL_DIR_CANDIDATES = [
    ROOT / "build" / "fst-models",
    ROOT / "server" / "fst-models",
    ROOT / "static-word-list" / "fst-models",
]
DICT_FILE = ROOT / "public" / "tamil_dictionary.txt"
LEMMA_DICT_FILE = ROOT / "static-word-list" / "lemma_dictionary.txt"
CLASSIFIED_HEADWORDS_FILE = ROOT / "static-word-list" / "fst_classified_headwords.json"
HEURISTIC_CLASSIFIED_FILE = ROOT / "static-word-list" / "fst_heuristic_classified_headwords.json"
UNCLASSIFIED_WIKTIONARY_FILE = ROOT / "static-word-list" / "fst_unclassified_vuizur_headwords.json"
NOUN_SOURCE_ZIP_CANDIDATES = [
    ROOT / "vendor" / "thamizhi-morph" / "foma" / "ThamizhiMorph-Nouns.zip",
    ROOT / "fst" / "upstream-zips" / "ThamizhiMorph-Nouns.zip",
]
PATCH_DIR = ROOT / "fst" / "patches"
GENERATE_FST_FORMS_PATH = ROOT / "static-word-list" / "generate_fst_forms.py"


def run_flookup(inputs: list[str], inverse: bool = False) -> dict[str, list[str]]:
    noun_fst = resolve_noun_fst()
    return run_flookup_with_model(noun_fst, inputs, inverse=inverse)


def run_flookup_with_model(model_path: Path, inputs: list[str], inverse: bool = False) -> dict[str, list[str]]:
    cmd = ["flookup"]
    if inverse:
        cmd.append("-i")
    cmd.append(str(model_path))

    proc = subprocess.run(
        cmd,
        input="\n".join(inputs) + "\n",
        text=True,
        capture_output=True,
        check=True,
    )

    outputs: dict[str, list[str]] = {k: [] for k in inputs}
    for line in proc.stdout.splitlines():
        if "\t" not in line:
            continue
        left, right = line.split("\t", 1)
        if left in outputs:
            outputs[left].append(right.strip())
    return outputs


def fail(message: str) -> None:
    print(f"FAIL: {message}")
    sys.exit(1)


def ensure_file(path: Path, label: str) -> None:
    if not path.exists() or path.stat().st_size == 0:
        fail(f"Missing {label}: {path}")


def resolve_noun_fst() -> Path:
    for candidate in NOUN_FST_CANDIDATES:
        if candidate.exists() and candidate.stat().st_size > 0:
            return candidate
    fail(
        "Missing noun.fst in expected locations: "
        + ", ".join(str(p) for p in NOUN_FST_CANDIDATES)
    )


def resolve_fst_model(model_name: str) -> Path:
    for model_dir in FST_MODEL_DIR_CANDIDATES:
        candidate = model_dir / model_name
        if candidate.exists() and candidate.stat().st_size > 0:
            return candidate
    fail(
        f"Missing {model_name} in expected locations: "
        + ", ".join(str(p) for p in FST_MODEL_DIR_CANDIDATES)
    )


def resolve_noun_source_zip() -> Path:
    for candidate in NOUN_SOURCE_ZIP_CANDIDATES:
        if candidate.exists() and candidate.stat().st_size > 0:
            return candidate
    fail(
        "Missing noun source zip in expected locations: "
        + ", ".join(str(p) for p in NOUN_SOURCE_ZIP_CANDIDATES)
    )


def load_combined_classification_map() -> dict[str, set[str]]:
    combined: dict[str, set[str]] = {}

    ensure_file(CLASSIFIED_HEADWORDS_FILE, "fst_classified_headwords.json")
    base = json.loads(CLASSIFIED_HEADWORDS_FILE.read_text(encoding="utf-8"))
    if isinstance(base, dict):
        for lemma, classes in base.items():
            if not isinstance(lemma, str):
                continue
            if isinstance(classes, list):
                combined.setdefault(lemma, set()).update(str(c) for c in classes)

    ensure_file(HEURISTIC_CLASSIFIED_FILE, "fst_heuristic_classified_headwords.json")
    heuristic_rows = json.loads(HEURISTIC_CLASSIFIED_FILE.read_text(encoding="utf-8"))
    if isinstance(heuristic_rows, list):
        for row in heuristic_rows:
            if not isinstance(row, dict):
                continue
            lemma = row.get("lemma")
            klass = row.get("predicted_class")
            if isinstance(lemma, str) and isinstance(klass, str):
                combined.setdefault(lemma, set()).add(klass)

    return combined


def ensure_no_noun_class_duplicates() -> None:
    noun_source_zip = resolve_noun_source_zip()
    class_names = {f"C{i}Sg" for i in range(1, 17)}
    class_names.add("C5pl")

    with tempfile.TemporaryDirectory() as td:
        work = Path(td)
        with ZipFile(noun_source_zip, "r") as zf:
            zf.extractall(work)

        patches = [
            patch
            for patch in sorted(PATCH_DIR.glob("000*.patch"))
            if "Nouns.lexc" in patch.read_text(encoding="utf-8", errors="replace")
        ]
        for patch in patches:
            subprocess.run(["git", "apply", "--check", str(patch)], cwd=work, check=True, capture_output=True, text=True)
            subprocess.run(["git", "apply", str(patch)], cwd=work, check=True, capture_output=True, text=True)

        noun_lexc = work / "Nouns.lexc"
        ensure_file(noun_lexc, "patched Nouns.lexc")
        lines = noun_lexc.read_text(encoding="utf-8", errors="replace").splitlines()

        current = None
        lemma_to_classes: dict[str, set[str]] = defaultdict(set)
        for line in lines:
            s = line.strip()
            m = re.match(r"LEXICON\s+(\S+)", s)
            if m:
                current = m.group(1)
                continue
            if current not in class_names:
                continue
            if not s or s.startswith("!") or s.startswith("#") or ";" not in s:
                continue
            pre = s.split(";", 1)[0].strip()
            if not pre:
                continue
            lemma = pre.split()[0]
            if lemma.startswith("+") or lemma == "#":
                continue
            lemma_to_classes[lemma].add(current)

        duplicates = sorted((lemma, sorted(classes)) for lemma, classes in lemma_to_classes.items() if len(classes) > 1)
        if duplicates:
            preview = ", ".join([f"{lemma}:{'/'.join(classes)}" for lemma, classes in duplicates[:20]])
            fail(f"Noun class duplicates detected after patches: {preview}")


def ensure_verb_infinitive_generation_expansion() -> None:
    spec = importlib.util.spec_from_file_location(
        "generate_fst_forms_regression",
        GENERATE_FST_FORMS_PATH,
    )
    if spec is None or spec.loader is None:
        fail(f"Unable to load generator module: {GENERATE_FST_FORMS_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    stems = module.derive_verb_generation_stems("படித்தல்", klass="verb-c11.fst")
    if "படி" not in stems:
        fail(f"Verb infinitive normalization missed படித்தல் -> படி (got {sorted(stems)})")

    stems = module.derive_verb_generation_stems("நடத்தல்", klass="verb-c-rest.fst")
    if "நடத்து" not in stems:
        fail(f"Verb infinitive normalization missed நடத்தல் -> நடத்து (got {sorted(stems)})")

    stems = module.derive_verb_generation_stems("பேத்தல்", klass="verb-c-rest.fst")
    if "பேத்து" not in stems:
        fail(f"Verb infinitive normalization missed பேத்தல் -> பேத்து (got {sorted(stems)})")

    generation_by_class = module.expand_heuristic_generation_classes({
        "verb-c-rest.fst": ["படித்தல்"],
    })
    missing = sorted(module.VERB_CLASSES - set(generation_by_class))
    if missing:
        fail(f"Verb infinitive generation did not expand across verb classes: missing {missing}")

    fst_dir = next(
        (candidate for candidate in module.FST_MODEL_CANDIDATE_DIRS if candidate.exists()),
        None,
    )
    if fst_dir is None:
        fail("No FST model directory available for verb infinitive generation regression")

    expected_forms = {
        "படித்தல்": {"படித்தான்", "படிக்கிறேன்", "படிப்பேன்"},
        "கொடுத்தல்": {"கொடுத்தேன்", "கொடுக்கிறேன்", "கொடுப்பேன்"},
        "கேட்டல்": {"கேட்டேன்", "கேட்கிறேன்", "கேட்பேன்"},
        "நடத்தல்": {"நடத்தினேன்", "நடத்துகிறேன்", "நடத்துவேன்"},
        "வருதல்": {"வந்தேன்", "வருகிறேன்", "வருவேன்"},
        "போதல்": {"போனேன்", "போகிறேன்", "போவேன்"},
    }
    for lemma, targets in expected_forms.items():
        generated_forms: set[str] = set()
        generation_by_class = module.expand_heuristic_generation_classes({
            "verb-c-rest.fst": [lemma],
        })
        for klass in sorted(module.VERB_CLASSES):
            lexc_path = module.resolve_verb_lexc(klass)
            if not lexc_path:
                continue
            templates = [
                t for t in module.extract_verb_templates_from_lexc(lexc_path)
                if module.is_controlled_heuristic_verb_template(t)
            ]
            analyses = []
            expanded = module.expand_heuristic_verb_lemmas(
                generation_by_class.get(klass, []),
                klass=klass,
            )
            for _source_lemma, stems in expanded.items():
                for stem in sorted(stems):
                    stem_templates = module.select_verb_templates_for_stem(
                        stem,
                        templates,
                        full_generation=False,
                    )
                    analyses.extend(stem + tag for tag in stem_templates)
            if not analyses:
                continue
            forms = module.inverse_generate_forms(fst_dir / klass, analyses)
            generated_forms |= module.forward_filter_forms(fst_dir / klass, forms)

        missing_targets = sorted(targets - generated_forms)
        if missing_targets:
            fail(
                f"Verb infinitive generation missed {lemma}: "
                f"missing {missing_targets}"
            )


def main() -> None:
    parser = argparse.ArgumentParser(description="Run FST morphology and optional dictionary regressions")
    parser.add_argument(
        "--check-dictionary",
        action="store_true",
        help="Require dictionary include/exclude assertions against public/tamil_dictionary.txt",
    )
    parser.add_argument(
        "--full-mode",
        action="store_true",
        help="Require additional full-generation assertions",
    )
    args = parser.parse_args()

    ensure_file(FIXTURE_PATH, "fixture")
    ensure_file(VERB_FIXTURE_PATH, "verb fixture")
    ensure_file(HEURISTIC_FIXTURE_PATH, "heuristic fixture")
    ensure_file(WIKTIONARY_REVIEW_FIXTURE_PATH, "wiktionary resolution fixture")
    ensure_file(WIKTIONARY_UNKNOWN_REVIEW_PATH, "wiktionary unknown review fixture")
    resolve_noun_fst()
    ensure_no_noun_class_duplicates()
    ensure_verb_infinitive_generation_expansion()

    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))

    inverse_pairs = fixture["inverse_must_include"]
    inverse_queries = [item["analysis"] for item in inverse_pairs]
    inv_results = run_flookup(inverse_queries, inverse=True)

    for item in inverse_pairs:
        seen = set(inv_results.get(item["analysis"], []))
        if item["surface"] not in seen:
            fail(f"Inverse miss: {item['analysis']} did not produce {item['surface']} (got {sorted(seen)[:5]})")

    forward_good = fixture["analysis_must_recognize"]
    fwd_good_results = run_flookup(forward_good, inverse=False)
    for word in forward_good:
        analyses = fwd_good_results.get(word, [])
        if not analyses or all(a == "+?" for a in analyses):
            fail(f"Forward analysis miss: {word} returned +?")

    forward_bad = fixture["analysis_should_reject"]
    fwd_bad_results = run_flookup(forward_bad, inverse=False)
    rejected_bad = []
    leaked_bad = []
    for word in forward_bad:
        analyses = fwd_bad_results.get(word, [])
        if analyses and any(a != "+?" for a in analyses):
            leaked_bad.append(word)
        else:
            rejected_bad.append(word)

    if leaked_bad:
        fail(f"Forward analysis unexpectedly accepted forbidden forms: {leaked_bad}")

    verb_fixture = json.loads(VERB_FIXTURE_PATH.read_text(encoding="utf-8"))
    verb_good_count = 0
    for model_name, model_fixture in verb_fixture["models"].items():
        model_path = resolve_fst_model(model_name)
        words = model_fixture.get("analysis_must_recognize", [])
        results = run_flookup_with_model(model_path, words, inverse=False)
        for word in words:
            analyses = results.get(word, [])
            if not analyses or all(a == "+?" for a in analyses):
                fail(f"Verb forward analysis miss in {model_name}: {word} returned +?")
            verb_good_count += 1

    misc_fixture = json.loads(MISC_FIXTURE_PATH.read_text(encoding="utf-8"))
    misc_good_count = 0
    for model_name, model_fixture in misc_fixture.get("models", {}).items():
        model_path = resolve_fst_model(model_name)
        expected = model_fixture.get("must_analyze", {})
        words = list(expected)
        results = run_flookup_with_model(model_path, words, inverse=False)
        for word, required_analysis in expected.items():
            analyses = set(results.get(word, []))
            if required_analysis not in analyses:
                fail(
                    f"Misc morphology miss in {model_name}: "
                    f"{word} missing {required_analysis} (got {sorted(analyses)})"
                )
            misc_good_count += 1

    if leaked_bad and args.check_dictionary:
        ensure_file(DICT_FILE, "dictionary")
        dictionary_words = set(DICT_FILE.read_text(encoding="utf-8").splitlines())
        leaked_in_dict = [w for w in leaked_bad if w in dictionary_words]
        if leaked_in_dict:
            fail(f"Leaked bad forms accepted by FST and present in dictionary: {leaked_in_dict}")

    if args.check_dictionary:
        ensure_file(DICT_FILE, "dictionary")
        dictionary_words = set(DICT_FILE.read_text(encoding="utf-8").splitlines())
        for word in fixture["dictionary_must_include"]:
            if word not in dictionary_words:
                fail(f"Dictionary missing expected word: {word}")
        for word in fixture["dictionary_must_exclude"]:
            if word in dictionary_words:
                fail(f"Dictionary contains forbidden word: {word}")
        ensure_file(LEMMA_DICT_FILE, "lemma dictionary")
        lemma_words = set(LEMMA_DICT_FILE.read_text(encoding="utf-8").splitlines())
        for word in ["மரம்", "படி", "என", "ஊராட்சி"]:
            if word not in lemma_words:
                fail(f"Lemma dictionary missing expected lemma: {word}")
        for word in ["மரங்களிலிருந்து", "படித்தான்", "எனக்", "ஊராட்சித்"]:
            if word in lemma_words:
                fail(f"Lemma dictionary contains non-lemma/sandhi surface: {word}")

    combined_classes = load_combined_classification_map()
    heuristic_fixture = json.loads(HEURISTIC_FIXTURE_PATH.read_text(encoding="utf-8"))
    for lemma, expected_class in heuristic_fixture["must_include_class"].items():
        seen = combined_classes.get(lemma, set())
        if expected_class not in seen:
            fail(f"Classification regression: {lemma} missing expected class {expected_class} (got {sorted(seen)})")
    for lemma, forbidden_classes in heuristic_fixture["must_exclude_classes"].items():
        seen = combined_classes.get(lemma, set())
        overlaps = sorted(set(forbidden_classes) & seen)
        if overlaps:
            fail(f"Classification regression: {lemma} includes forbidden classes {overlaps}")

    ensure_file(UNCLASSIFIED_WIKTIONARY_FILE, "fst_unclassified_vuizur_headwords.json")
    unclassified_rows = json.loads(UNCLASSIFIED_WIKTIONARY_FILE.read_text(encoding="utf-8"))
    if not isinstance(unclassified_rows, list):
        fail("Unclassified Wiktionary report is not a list")
    unresolved = {row.get("lemma") for row in unclassified_rows if isinstance(row, dict)}
    review_fixture = json.loads(WIKTIONARY_REVIEW_FIXTURE_PATH.read_text(encoding="utf-8"))
    max_unclassified = int(review_fixture.get("max_unclassified_unknown", 10**9))
    if len(unclassified_rows) > max_unclassified:
        fail(
            f"Wiktionary unresolved count regression: {len(unclassified_rows)} > {max_unclassified}"
        )
    for lemma in review_fixture.get("must_resolve", []):
        if lemma in unresolved:
            fail(f"Wiktionary resolution regression: {lemma} is still unresolved")
    for lemma in review_fixture.get("must_remain_unresolved", []):
        if lemma not in unresolved:
            fail(f"Wiktionary resolution regression: {lemma} unexpectedly resolved")

    unknown_review = json.loads(WIKTIONARY_UNKNOWN_REVIEW_PATH.read_text(encoding="utf-8"))
    unknown_candidates = unknown_review.get("candidates", []) if isinstance(unknown_review, dict) else []
    if not isinstance(unknown_candidates, list):
        fail("Wiktionary unknown review candidates is not a list")
    reviewed_lemmas = {
        row.get("lemma")
        for row in unknown_candidates
        if isinstance(row, dict) and isinstance(row.get("lemma"), str)
    }
    if not unresolved.issubset(reviewed_lemmas):
        missing = sorted(unresolved - reviewed_lemmas)[:20]
        extra = sorted(reviewed_lemmas - unresolved)[:20]
        fail(
            "Wiktionary unknown review fixture drift: "
            f"missing={missing} extra={extra}"
        )

    print("PASS: FST regressions")
    print(f"PASS: inverse checks={len(inverse_pairs)} forward-good={len(forward_good)}")
    print(f"PASS: verb forward-good={verb_good_count}")
    print(f"PASS: misc morphology checks={misc_good_count}")
    print(f"PASS: rejected-bad={len(rejected_bad)} leaked-bad={len(leaked_bad)}")
    if args.check_dictionary:
        print("PASS: dictionary include/exclude checks")
    print("PASS: heuristic classification checks")
    print("PASS: Wiktionary resolution checks")
    print("PASS: Wiktionary unknown review coverage checks")

    if args.full_mode:
        ensure_file(FULL_MODE_FIXTURE_PATH, "full mode fixture")
        ensure_file(DICT_FILE, "dictionary")
        dictionary_words = set(DICT_FILE.read_text(encoding="utf-8").splitlines())
        full_fixture = json.loads(FULL_MODE_FIXTURE_PATH.read_text(encoding="utf-8"))
        for word in full_fixture.get("dictionary_must_include", []):
            if word not in dictionary_words:
                fail(f"Full-mode dictionary missing expected word: {word}")
        for word in full_fixture.get("dictionary_must_exclude", []):
            if word in dictionary_words:
                fail(f"Full-mode dictionary contains forbidden word: {word}")
        print("PASS: full-mode dictionary checks")


if __name__ == "__main__":
    main()
