#!/usr/bin/env python3
"""
Generate Tamil word forms using local core ThamizhiMorph FST models.

Pipeline:
1. Build a unified lemma pool (Tamil Lexicon + Tamil Wiktionary headwords)
2. Classify lemmas by forward lookup against each core FST
3. Generate inflected forms from classified lemmas via inverse lookup

Output:
- static-word-list/fst_generated_forms.txt
- static-word-list/fst_classified_headwords.json
"""

import json
import os
import re
import gzip
import subprocess
import sys
import unicodedata
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

SCRIPT_DIR = Path(__file__).parent
PROJECT_ROOT = SCRIPT_DIR.parent
OUTPUT_FILE = SCRIPT_DIR / "fst_generated_forms.txt"
CLASSIFIED_OUTPUT_FILE = SCRIPT_DIR / "fst_classified_headwords.json"
HEURISTIC_CLASSIFIED_OUTPUT_FILE = SCRIPT_DIR / "fst_heuristic_classified_headwords.json"
HEURISTIC_FORMS_OUTPUT_FILE = SCRIPT_DIR / "fst_heuristic_forms.txt"
HEURISTIC_AUDIT_OUTPUT_FILE = SCRIPT_DIR / "fst_heuristic_audit.json"
UNCLASSIFIED_VUIZUR_OUTPUT_FILE = SCRIPT_DIR / "fst_unclassified_vuizur_headwords.json"
UNCLASSIFIED_VUIZUR_SUMMARY_FILE = SCRIPT_DIR / "fst_unclassified_vuizur_summary.json"
LEXICON_FILE = SCRIPT_DIR / "tamillexicon_headwords.txt"
VUIZUR_CACHE_FILE = SCRIPT_DIR / "cache" / "vuizur_tamil.tsv"
TAWIKTIONARY_TITLES_CACHE_FILE = SCRIPT_DIR / "cache" / "tawiktionary-latest-all-titles-in-ns0.gz"
TAWIKTIONARY_POS_JSONL_CACHE_FILE = SCRIPT_DIR / "cache" / "tawiktionary_pos_headwords.jsonl"
WIKTIONARY_EXCLUSIONS_FILE = SCRIPT_DIR / "wiktionary_exclusions.txt"
TAWIKTIONARY_TITLES_URL = (
    "https://dumps.wikimedia.org/tawiktionary/latest/"
    "tawiktionary-latest-all-titles-in-ns0.gz"
)

MAX_TAMIL_LETTERS = 15
CHUNK_SIZE = 5000
TAMIL_CHAR_RE = re.compile(r'^[\u0B80-\u0BFF]+$')
TAMIL_DIGIT_RE = re.compile(r'[\u0BE6-\u0BEF\u0BF0-\u0BF9]')

FST_MODEL_CANDIDATE_DIRS = [
    PROJECT_ROOT / "build" / "fst-models",
    PROJECT_ROOT / "server" / "fst-models",
    SCRIPT_DIR / "fst-models",
]

FST_ORDER = [
    "noun.fst",
    "adj.fst",
    "adv.fst",
    "part.fst",
    "pronoun.fst",
    "verb-c3.fst",
    "verb-c4.fst",
    "verb-c11.fst",
    "verb-c12.fst",
    "verb-c62.fst",
    "verb-c-rest.fst",
]

VERB_LEXC_CANDIDATES = {
    "verb-c3.fst": [
        PROJECT_ROOT / "fst" / "build" / ".work" / "verb-c3" / "ThamizhiVerbs-C3.lexc",
        PROJECT_ROOT / "fst" / "reports" / "artifacts" / "sources" / "verb-c3" / "ThamizhiVerbs-C3.lexc",
    ],
    "verb-c4.fst": [
        PROJECT_ROOT / "fst" / "build" / ".work" / "verb-c4" / "ThamizhiVerbs-C4.lexc",
        PROJECT_ROOT / "fst" / "reports" / "artifacts" / "sources" / "verb-c4" / "ThamizhiVerbs-C4.lexc",
    ],
    "verb-c11.fst": [
        PROJECT_ROOT / "fst" / "build" / ".work" / "verb-c11" / "ThamizhiVerbs-C11.lexc",
        PROJECT_ROOT / "fst" / "reports" / "artifacts" / "sources" / "verb-c11" / "ThamizhiVerbs-C11.lexc",
    ],
    "verb-c12.fst": [
        PROJECT_ROOT / "fst" / "build" / ".work" / "verb-c12" / "ThamizhiVerbs-C12.lexc",
        PROJECT_ROOT / "fst" / "reports" / "artifacts" / "sources" / "verb-c12" / "ThamizhiVerbs-C12.lexc",
    ],
    "verb-c62.fst": [
        PROJECT_ROOT / "fst" / "build" / ".work" / "verb-c62" / "ThamizhiVerbs-C62.lexc",
        PROJECT_ROOT / "fst" / "reports" / "artifacts" / "sources" / "verb-c62" / "ThamizhiVerbs-C62.lexc",
    ],
    "verb-c-rest.fst": [
        PROJECT_ROOT / "fst" / "build" / ".work" / "verb-c-rest" / "ThamizhiVerbs-otherthan-3-4-62-11-12.lexc",
        PROJECT_ROOT / "fst" / "reports" / "artifacts" / "sources" / "verb-c-rest" / "ThamizhiVerbs-otherthan-3-4-62-11-12.lexc",
    ],
}

NOUN_TAGS = [
    "+noun+nom", "+noun+acc", "+noun+dat", "+noun+loc",
    "+noun+abl", "+noun+gen", "+noun+inst", "+noun+soc",
    "+noun+pl+nom", "+noun+pl+acc", "+noun+pl+dat", "+noun+pl+loc",
    "+noun+pl+abl", "+noun+pl+gen", "+noun+pl+inst", "+noun+pl+soc",
]
CONTROLLED_HEURISTIC_NOUN_TAGS = [
    "+noun+nom",
    "+noun+acc",
    "+noun+dat",
    "+noun+loc",
    "+noun+gen",
    "+noun+pl+nom",
    "+noun+pl+acc",
]

# Kept intentionally small to avoid overgeneration from ambiguous non-verb models.
ADJ_TAGS = ["+adj", "+adj+comp", "+adj+super"]
CLASS_PRIORITY = {
    "noun.fst": 100,
    "verb-c11.fst": 95,
    "verb-c4.fst": 94,
    "verb-c-rest.fst": 93,
    "verb-c12.fst": 92,
    "verb-c3.fst": 91,
    "verb-c62.fst": 90,
    "adj.fst": 80,
    "adv.fst": 70,
    "part.fst": 60,
    "pronoun.fst": 50,
}
POS_TO_ALLOWED_CLASSES = {
    "noun": {"noun.fst"},
    "name": {"noun.fst"},
    "verb": {
        "verb-c3.fst",
        "verb-c4.fst",
        "verb-c11.fst",
        "verb-c12.fst",
        "verb-c62.fst",
        "verb-c-rest.fst",
    },
    "adjective": {"adj.fst"},
    "adverb": {"adv.fst"},
    "particle": {"part.fst"},
    "pronoun": {"pronoun.fst"},
}
VERB_CLASSES = POS_TO_ALLOWED_CLASSES["verb"]
POS_DEFAULT_CLASS = {
    "noun": "noun.fst",
    "name": "noun.fst",
    "verb": "verb-c-rest.fst",
    "adjective": "adj.fst",
    "adverb": "adv.fst",
    "particle": "part.fst",
    "pronoun": "pronoun.fst",
}
LEMMA_CLASS_OVERRIDES = {
    # Manual exceptions/anchors for known ambiguity cases.
    "புழு": "noun.fst",
    "குரு": "noun.fst",
    "போண்டி": "adj.fst",
    "புழுத்தல்": "verb-c-rest.fst",
    "வத்தல்": "noun.fst",
    "பித்தல்": "noun.fst",
}


def is_pure_tamil(word: str) -> bool:
    return bool(TAMIL_CHAR_RE.match(word))


def tamil_letter_count(word: str) -> int:
    count = 0
    for ch in word:
        if unicodedata.category(ch) not in ("Mc", "Mn"):
            count += 1
    return count


def is_valid_form(word: str) -> bool:
    return is_pure_tamil(word) and 2 <= tamil_letter_count(word) <= MAX_TAMIL_LETTERS


def is_lexical_headword(word: str) -> bool:
    """
    Conservative lexical filter for headword ingestion.
    Excludes very short, digit-like, or symbol-like entries that are commonly
    present in Wiktionary dumps but not useful as playable lexemes.
    """
    if not is_pure_tamil(word):
        return False
    if tamil_letter_count(word) < 2:
        return False
    if TAMIL_DIGIT_RE.search(word):
        return False
    # Avoid standalone pulli / vowel signs / symbols as first char.
    first_cat = unicodedata.category(word[0])
    if first_cat in {"Mn", "Mc", "So"}:
        return False
    return True


def load_wiktionary_exclusions() -> Set[str]:
    words: Set[str] = set()
    if not WIKTIONARY_EXCLUSIONS_FILE.exists():
        return words
    with open(WIKTIONARY_EXCLUSIONS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            w = line.strip()
            if w and is_pure_tamil(w):
                words.add(w)
    return words


def check_flookup_installed() -> bool:
    try:
        result = subprocess.run(["flookup", "-h"], capture_output=True, timeout=5)
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def resolve_fst_models_dir() -> Optional[Path]:
    for candidate in FST_MODEL_CANDIDATE_DIRS:
        if all((candidate / fst_name).exists() for fst_name in FST_ORDER):
            return candidate
    return None


def load_lexicon_headwords() -> Tuple[Set[str], Dict[str, Set[str]]]:
    words: Set[str] = set()
    pos_hints: Dict[str, Set[str]] = {}
    if not LEXICON_FILE.exists():
        print(f"WARNING: {LEXICON_FILE} not found")
        return words, pos_hints
    with open(LEXICON_FILE, "r", encoding="utf-8-sig") as f:
        for line in f:
            raw_entry = line.strip()
            if not raw_entry:
                continue
            entry = raw_entry.replace("-", "")
            if entry and is_pure_tamil(entry):
                words.add(entry)
                # Tamil Lexicon convention: verbs are often marked as root-தல் / root-த்தல்.
                if "-" in raw_entry and (entry.endswith("தல்") or entry.endswith("த்தல்")):
                    pos_hints.setdefault(entry, set()).add("verb")
    return words, pos_hints


def normalize_vuizur_pos(raw_pos: str) -> Optional[str]:
    token = raw_pos.strip().lower()
    if not token:
        return None
    if token in {"noun", "name", "verb", "adjective", "adverb", "particle", "pronoun"}:
        return token
    if token.startswith("noun"):
        return "noun"
    if token.startswith("verb"):
        return "verb"
    if token.startswith("adjective"):
        return "adjective"
    if token.startswith("adverb"):
        return "adverb"
    return None


def allowed_classes_from_pos_hints(pos_hints: Set[str]) -> Optional[Set[str]]:
    allowed: Set[str] = set()
    for pos in pos_hints:
        allowed |= POS_TO_ALLOWED_CLASSES.get(pos, set())
    return allowed or None


def infer_allowed_classes_from_lemma_shape(lemma: str) -> Optional[Set[str]]:
    """
    Lightweight shape-based POS prior for Tamil lexicalized infinitive-like forms.
    Example: words ending in 'தல்' are commonly verb lemmas in dictionary sources.
    """
    if lemma.endswith("தல்") and len(lemma) >= 4:
        return set(VERB_CLASSES)
    return None


def load_vuizur_cached_headwords() -> Tuple[Set[str], Dict[str, Set[str]]]:
    words: Set[str] = set()
    pos_hints: Dict[str, Set[str]] = {}
    if not VUIZUR_CACHE_FILE.exists():
        print(f"INFO: Vuizur cache not found at {VUIZUR_CACHE_FILE}, continuing without it")
        return words, pos_hints

    with open(VUIZUR_CACHE_FILE, "r", encoding="utf-8") as f:
        for line in f:
            text = line.strip()
            if not text:
                continue
            # Format: TamilWord|alt1|...|romanization\tDefinition
            left, _, right = text.partition("\t")
            lemma = left.split("|", 1)[0].strip()
            if lemma and is_lexical_headword(lemma):
                words.add(lemma)
                m = re.search(r"<i>([^<]+)</i>", right)
                if m:
                    normalized = normalize_vuizur_pos(m.group(1))
                    if normalized:
                        pos_hints.setdefault(lemma, set()).add(normalized)
    return words, pos_hints


def load_tamil_wiktionary_dump_headwords() -> Set[str]:
    words: Set[str] = set()
    force_refresh = str(os.environ.get("FORCE_REFRESH_TAWIKTIONARY_DUMP", "")).lower() == "true"
    TAWIKTIONARY_TITLES_CACHE_FILE.parent.mkdir(exist_ok=True)

    if not TAWIKTIONARY_TITLES_CACHE_FILE.exists() or force_refresh:
        print("INFO: Downloading Tamil Wiktionary dump titles...")
        try:
            import urllib.request

            req = urllib.request.Request(TAWIKTIONARY_TITLES_URL, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = resp.read()
            with open(TAWIKTIONARY_TITLES_CACHE_FILE, "wb") as f:
                f.write(data)
        except Exception as exc:
            print(f"INFO: Tamil Wiktionary dump download unavailable ({exc}); continuing without dump")
            return words

    try:
        with gzip.open(TAWIKTIONARY_TITLES_CACHE_FILE, "rt", encoding="utf-8", errors="replace") as f:
            for line in f:
                lemma = line.strip()
                if lemma and is_lexical_headword(lemma):
                    words.add(lemma)
    except Exception as exc:
        print(f"INFO: Could not parse Tamil Wiktionary dump cache ({exc}); continuing without dump")
        return set()
    return words


def load_tamil_wiktionary_pos_cache() -> Tuple[Set[str], Dict[str, Set[str]]]:
    words: Set[str] = set()
    pos_hints: Dict[str, Set[str]] = {}
    if not TAWIKTIONARY_POS_JSONL_CACHE_FILE.exists():
        return words, pos_hints
    try:
        with open(TAWIKTIONARY_POS_JSONL_CACHE_FILE, "r", encoding="utf-8") as f:
            for line in f:
                text = line.strip()
                if not text:
                    continue
                row = json.loads(text)
                lemma = str(row.get("lemma", "")).strip()
                if not lemma or not is_lexical_headword(lemma):
                    continue
                tags = row.get("pos_tags", [])
                normalized_tags: Set[str] = set()
                if isinstance(tags, list):
                    for tag in tags:
                        if not isinstance(tag, str):
                            continue
                        token = normalize_vuizur_pos(tag)
                        if token:
                            normalized_tags.add(token)
                words.add(lemma)
                if normalized_tags:
                    pos_hints.setdefault(lemma, set()).update(normalized_tags)
    except Exception as exc:
        print(f"INFO: Could not read Tamil Wiktionary POS cache ({exc}); continuing without POS cache")
        return set(), {}
    return words, pos_hints


def run_flookup(fst_path: Path, inputs: List[str], inverse: bool = False) -> List[str]:
    cmd = ["flookup"]
    if inverse:
        cmd.append("-i")
    cmd.append(str(fst_path))
    payload = "\n".join(inputs) + "\n"
    try:
        result = subprocess.run(
            cmd,
            input=payload,
            capture_output=True,
            text=True,
            timeout=240,
        )
        return result.stdout.splitlines()
    except subprocess.TimeoutExpired:
        return []


def forward_classify(fst_path: Path, lemmas: List[str]) -> List[Tuple[str, str]]:
    classified: List[Tuple[str, str]] = []
    total = len(lemmas)
    for i in range(0, total, CHUNK_SIZE):
        chunk = lemmas[i:i + CHUNK_SIZE]
        lines = run_flookup(fst_path, chunk, inverse=False)
        for line in lines:
            parts = line.split("\t")
            if len(parts) >= 2 and parts[1].strip() != "+?":
                lemma = parts[0].strip()
                analysis = parts[1].strip()
                if lemma:
                    classified.append((lemma, analysis))
    return classified


def inverse_generate_forms(fst_path: Path, analyses: Iterable[str]) -> Set[str]:
    forms: Set[str] = set()
    items = list(analyses)
    total = len(items)
    for i in range(0, total, CHUNK_SIZE):
        chunk = items[i:i + CHUNK_SIZE]
        lines = run_flookup(fst_path, chunk, inverse=True)
        for line in lines:
            parts = line.split("\t")
            if len(parts) >= 2:
                surface = parts[1].strip()
                if surface != "+?" and is_valid_form(surface):
                    forms.add(surface)
    return forms


def forward_filter_forms(fst_path: Path, forms: Iterable[str]) -> Set[str]:
    """Keep only forms that are forward-recognized by the given class FST."""
    words = sorted(set(forms))
    if not words:
        return set()
    accepted: Set[str] = set()
    total = len(words)
    for i in range(0, total, CHUNK_SIZE):
        chunk = words[i:i + CHUNK_SIZE]
        lines = run_flookup(fst_path, chunk, inverse=False)
        for line in lines:
            parts = line.split("\t")
            if len(parts) >= 2 and parts[1].strip() != "+?":
                accepted.add(parts[0].strip())
    return accepted


def resolve_verb_lexc(fst_name: str) -> Optional[Path]:
    for candidate in VERB_LEXC_CANDIDATES.get(fst_name, []):
        if candidate.exists():
            return candidate
    return None


def extract_verb_templates_from_lexc(lexc_path: Path, conservative: bool = True) -> List[str]:
    templates: Set[str] = set()
    with open(lexc_path, "r", encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line.startswith("+verb") or "#;" not in line:
                continue
            # Keep lexical analysis side only (drop surface rewrite side after ':')
            lexical = line.split(":", 1)[0].strip()
            lexical = lexical.replace("%=", "=")
            # Remove trailing '#' terminator if present in same side
            lexical = lexical.rstrip("#").strip()
            if not lexical.startswith("+verb"):
                continue
            if conservative:
                if is_supported_verb_template(lexical):
                    templates.add(lexical)
            else:
                templates.add(lexical)
    return sorted(templates)


def is_supported_verb_template(template: str) -> bool:
    """
    Keep a conservative, high-confidence subset for dictionary generation.
    We intentionally skip complex/causative/euphonic branches that tend to
    overgenerate noisy forms in bulk generation.
    """
    if "+verb+" not in template:
        return False
    if "+complex+" in template:
        return False
    if "+caus=" in template:
        return False
    if "+euph=" in template:
        return False
    if "+sghe=" in template:
        return False
    return "+fin+sim+" in template or "+nonfin+sim+" in template


def is_controlled_heuristic_verb_template(template: str) -> bool:
    """
    Extra-conservative subset for heuristic inflection synthesis.
    """
    if "+fin+sim+" not in template:
        return False
    if "+complex+" in template or "+caus=" in template or "+euph=" in template:
        return False
    allowed_fragments = [
        "+strong+pres=கிற்+1sg=",
        "+strong+pres=கிற்+2sg=",
        "+strong+pres=கிற்+3sgm=",
        "+strong+pres=கிற்+3sgf=",
        "+strong+pres=கிற்+3sge=",
        "+strong+pres=கின்ற்+1sg=",
        "+weak+fut=வ்+1sg=",
        "+weak+fut=வ்+2sg=",
        "+weak+fut=வ்+3sgm=",
        "+weak+fut=வ்+3sgf=",
        "+weak+fut=வ்+3sge=",
        "+imp=∅+2pl=",
    ]
    return any(frag in template for frag in allowed_fragments)


def write_classification_map(class_map: Dict[str, Set[str]]) -> None:
    serializable = {k: sorted(v) for k, v in sorted(class_map.items())}
    with open(CLASSIFIED_OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(serializable, f, ensure_ascii=False, indent=2, sort_keys=True)


def pick_primary_class(classes: Set[str]) -> Optional[str]:
    if not classes:
        return None
    return sorted(classes, key=lambda c: (-CLASS_PRIORITY.get(c, 0), c))[0]


def build_suffix_model(training: Dict[str, str], max_suffix_len: int = 4) -> Dict[str, Dict[str, int]]:
    model: Dict[str, Dict[str, int]] = {}
    for lemma, klass in training.items():
        if not lemma:
            continue
        for n in range(1, max_suffix_len + 1):
            if len(lemma) < n:
                continue
            suffix = lemma[-n:]
            bucket = model.setdefault(suffix, {})
            bucket[klass] = bucket.get(klass, 0) + 1
    return model


def predict_class_with_suffix_model(
    lemma: str,
    suffix_model: Dict[str, Dict[str, int]],
    allowed_classes: Optional[Set[str]] = None,
    class_counts: Optional[Dict[str, int]] = None,
    max_suffix_len: int = 4,
) -> Optional[Tuple[str, float, int, str]]:
    votes: Dict[str, float] = {}
    support: Dict[str, int] = {}
    chosen_suffix = ""
    for n in range(max_suffix_len, 0, -1):
        if len(lemma) < n:
            continue
        suffix = lemma[-n:]
        if suffix not in suffix_model:
            continue
        class_counts = suffix_model[suffix]
        chosen_suffix = suffix
        for klass, count in class_counts.items():
            if allowed_classes and klass not in allowed_classes:
                continue
            # Longer suffixes get higher influence.
            votes[klass] = votes.get(klass, 0.0) + (count * float(n))
            support[klass] = support.get(klass, 0) + count
    if not votes:
        if allowed_classes and class_counts:
            allowed = [(c, class_counts.get(c, 0)) for c in allowed_classes]
            allowed = [item for item in allowed if item[1] > 0]
            if allowed:
                best_class, best_support = max(allowed, key=lambda kv: kv[1])
                return best_class, 0.66, int(best_support), ""
        return None
    best_class = max(votes.items(), key=lambda kv: kv[1])[0]
    total = sum(votes.values())
    confidence = votes[best_class] / total if total > 0 else 0.0
    return best_class, confidence, support.get(best_class, 0), chosen_suffix


def pick_pos_fallback_class(pos_hints: Set[str], allowed_classes: Optional[Set[str]]) -> Optional[str]:
    # Prioritize POS categories with lower ambiguity for default class fallback.
    pos_order = ["pronoun", "particle", "adverb", "adjective", "noun", "name", "verb"]
    for pos in pos_order:
        if pos not in pos_hints:
            continue
        klass = POS_DEFAULT_CLASS.get(pos)
        if not klass:
            continue
        if allowed_classes is not None and klass not in allowed_classes:
            continue
        return klass
    return None


def derive_verb_generation_stems(lemma: str, klass: Optional[str] = None) -> Set[str]:
    """
    Subclass-aware (coarse) derivation layer for dictionary infinitive lemmas.
    We derive plausible generation stems and rely on class FST forward validation
    to keep only legal stems/forms.
    """
    stems: Set[str] = {lemma}

    # Complex derivations are mostly useful for broad verb classes.
    allow_complex = klass is None or klass in {"verb-c11.fst", "verb-c-rest.fst"}

    if lemma.endswith("த்தல்") and len(lemma) > len("த்தல்"):
        base = lemma[: -len("த்தல்")]
        if is_lexical_headword(base):
            stems.add(base)
            # Common causative/passive/aspectal path for many -த்தல் infinitives.
            stems.add(base + "க்க")
            if allow_complex:
                stems.add(base + "க்கப்படு")
                stems.add(base + "க்கப்பெறு")
                stems.add(base + "த்திரு")
                stems.add(base + "த்துவிடு")
    elif lemma.endswith("தல்") and len(lemma) > len("தல்"):
        base = lemma[: -len("தல்")]
        if is_lexical_headword(base):
            stems.add(base)
            if allow_complex:
                stems.add(base + "ப்படு")
                stems.add(base + "ப்பெறு")
                stems.add(base + "திரு")
                stems.add(base + "விடு")

    # Keep only lexical-looking Tamil strings.
    return {s for s in stems if is_lexical_headword(s)}


def expand_heuristic_verb_lemmas(lemmas: Iterable[str], klass: Optional[str] = None) -> Dict[str, Set[str]]:
    """
    Controlled normalization for verb-like infinitive lemmas.
    Example: 'புழுத்தல்' -> {'புழுத்தல்', 'புழு', 'புழுப்படு', ...} (class-scoped).
    """
    expanded: Dict[str, Set[str]] = {}
    for lemma in lemmas:
        expanded[lemma] = derive_verb_generation_stems(lemma, klass=klass)
    return expanded


def select_verb_templates_for_stem(stem: str, templates: List[str], full_generation: bool) -> List[str]:
    """
    Reduce overgeneration by pairing derived stems with matching template families.
    """
    if not templates:
        return []
    if not full_generation:
        return templates

    if stem.endswith("ப்படு") or stem.endswith("ப்பெறு"):
        filtered = [t for t in templates if "+complex+passive+" in t]
        return filtered or templates
    if stem.endswith("திரு") or stem.endswith("விடு"):
        filtered = [t for t in templates if "+complex+aspect+" in t]
        return filtered or templates
    if stem.endswith("க்க"):
        filtered = [t for t in templates if "+sim+" in t and "+complex+" not in t]
        return filtered or templates
    # Base/simple stems default to simple templates in full mode.
    filtered = [t for t in templates if "+sim+" in t and "+complex+" not in t]
    return filtered or templates


def write_heuristic_outputs(
    heuristic_rows: List[Dict[str, object]],
    heuristic_forms: Set[str],
    heuristic_audit_rows: List[Dict[str, object]],
) -> None:
    with open(HEURISTIC_CLASSIFIED_OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(heuristic_rows, f, ensure_ascii=False, indent=2, sort_keys=True)
    with open(HEURISTIC_FORMS_OUTPUT_FILE, "w", encoding="utf-8") as f:
        for word in sorted(heuristic_forms):
            f.write(word + "\n")
    with open(HEURISTIC_AUDIT_OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(heuristic_audit_rows, f, ensure_ascii=False, indent=2, sort_keys=True)


def write_unclassified_vuizur_reports(
    rows: List[Dict[str, object]],
    pos_counts: Dict[str, int],
) -> None:
    with open(UNCLASSIFIED_VUIZUR_OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(rows, f, ensure_ascii=False, indent=2, sort_keys=True)
    summary = {
        "total_unclassified_vuizur_lemmas": len(rows),
        "pos_counts": {k: pos_counts[k] for k in sorted(pos_counts)},
        "top_200_preview": rows[:200],
    }
    with open(UNCLASSIFIED_VUIZUR_SUMMARY_FILE, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2, sort_keys=True)


def main() -> None:
    print("=== FST Headword Classification + Form Generation ===\n")

    if not check_flookup_installed():
        print("ERROR: flookup not available. Install with: brew install foma")
        sys.exit(1)

    fst_dir = resolve_fst_models_dir()
    if fst_dir is None:
        print("ERROR: Could not find all core FST models in any expected directory:")
        for d in FST_MODEL_CANDIDATE_DIRS:
            print(f"  - {d}")
        print("Run: npm run fst:build")
        sys.exit(1)

    print(f"Using FST models from: {fst_dir}")

    # Step 1: Unified lemma pool
    full_fst_generation = str(os.environ.get("FULL_FST_GENERATION", "")).lower() == "true"
    wiktionary_exclusions = load_wiktionary_exclusions()
    lexicon_words, lexicon_pos_hints = load_lexicon_headwords()
    wiktionary_dump_words = load_tamil_wiktionary_dump_headwords()
    wiktionary_pos_words, wiktionary_pos_hints = load_tamil_wiktionary_pos_cache()
    vuizur_words, vuizur_pos_hints = load_vuizur_cached_headwords()

    if wiktionary_exclusions:
        wiktionary_dump_words -= wiktionary_exclusions
        wiktionary_pos_words -= wiktionary_exclusions
        vuizur_words -= wiktionary_exclusions
        lexicon_words -= wiktionary_exclusions
        for lemma in list(wiktionary_pos_hints.keys()):
            if lemma in wiktionary_exclusions:
                wiktionary_pos_hints.pop(lemma, None)
        for lemma in list(vuizur_pos_hints.keys()):
            if lemma in wiktionary_exclusions:
                vuizur_pos_hints.pop(lemma, None)
        for lemma in list(lexicon_pos_hints.keys()):
            if lemma in wiktionary_exclusions:
                lexicon_pos_hints.pop(lemma, None)

    wiktionary_words = wiktionary_dump_words | wiktionary_pos_words | vuizur_words
    source_pos_hints: Dict[str, Set[str]] = {}
    for src in (lexicon_pos_hints, wiktionary_pos_hints, vuizur_pos_hints):
        for lemma, hints in src.items():
            source_pos_hints.setdefault(lemma, set()).update(hints)
    headwords = sorted((lexicon_words | wiktionary_words) - wiktionary_exclusions)
    print(
        f"Lemma pool: {len(headwords)} words "
        f"(Lexicon {len(lexicon_words)} + Wiktionary {len(wiktionary_words)} "
        f"[dump {len(wiktionary_dump_words)}, pos {len(wiktionary_pos_words)}, Vuizur {len(vuizur_words)}]; "
        f"lexicon-verb-hints {len(lexicon_pos_hints)}; exclusions {len(wiktionary_exclusions)}; "
        f"full_fst_generation={full_fst_generation})"
    )

    # Step 2: Classification + generation
    all_forms: Set[str] = set()
    class_map: Dict[str, Set[str]] = {}

    for fst_name in FST_ORDER:
        fst_path = fst_dir / fst_name
        print(f"\n=== {fst_name} ===")
        recognized = forward_classify(fst_path, headwords)
        filtered_lemmas: Set[str] = set()
        for lemma, _analysis in recognized:
            pos_hints = source_pos_hints.get(lemma, set())
            if pos_hints:
                allowed = allowed_classes_from_pos_hints(pos_hints)
                if allowed is not None and fst_name not in allowed:
                    continue
            filtered_lemmas.add(lemma)
        lemma_set = sorted(filtered_lemmas)
        print(f"Recognized lemmas: {len(lemma_set)}")

        for lemma in lemma_set:
            class_map.setdefault(lemma, set()).add(fst_name)
            if is_valid_form(lemma):
                all_forms.add(lemma)

        generated: Set[str] = set()
        if fst_name == "noun.fst" and lemma_set:
            analyses = [lemma + tag for lemma in lemma_set for tag in NOUN_TAGS]
            generated = inverse_generate_forms(fst_path, analyses)
            print(f"Generated noun forms: {len(generated)}")
        elif fst_name == "adj.fst" and lemma_set:
            analyses = [lemma + tag for lemma in lemma_set for tag in ADJ_TAGS]
            generated = inverse_generate_forms(fst_path, analyses)
            print(f"Generated adjective forms: {len(generated)}")
        elif fst_name.startswith("verb-") and lemma_set:
            lexc_path = resolve_verb_lexc(fst_name)
            if lexc_path is None:
                print("WARNING: Verb lexc source not found; skipping inverse generation for this class")
            else:
                templates = extract_verb_templates_from_lexc(lexc_path, conservative=not full_fst_generation)
                if templates:
                    analyses = [lemma + tag for lemma in lemma_set for tag in templates]
                    generated = inverse_generate_forms(fst_path, analyses)
                    print(f"Generated verb forms: {len(generated)} (templates: {len(templates)})")
                else:
                    print("WARNING: No verb templates extracted from lexc; skipping inverse generation")

        all_forms |= generated
        print(f"Running total forms: {len(all_forms)}")

    # Step 2b: heuristic class prediction for unclassified headwords.
    include_heuristic_lemmas = str(os.environ.get("INCLUDE_HEURISTIC_LEMMAS", "")).lower() == "true"
    include_heuristic_inflections = str(os.environ.get("INCLUDE_HEURISTIC_INFLECTIONS", "")).lower() == "true"
    if full_fst_generation:
        include_heuristic_inflections = True
    training: Dict[str, str] = {}
    for lemma, classes in class_map.items():
        primary = pick_primary_class(classes)
        if primary:
            training[lemma] = primary
    class_counts: Dict[str, int] = {}
    for klass in training.values():
        class_counts[klass] = class_counts.get(klass, 0) + 1
    suffix_model = build_suffix_model(training)
    heuristic_rows: List[Dict[str, object]] = []
    heuristic_forms: Set[str] = set()
    heuristic_audit_rows: List[Dict[str, object]] = []
    predicted_by_class: Dict[str, List[str]] = {}
    unclassified_vuizur_rows: List[Dict[str, object]] = []
    unclassified_vuizur_pos_counts: Dict[str, int] = {}

    for lemma in headwords:
        if lemma in class_map:
            continue
        override_class = LEMMA_CLASS_OVERRIDES.get(lemma)
        if override_class:
            confidence = 1.0
            support = max(class_counts.get(override_class, 0), 1)
            suffix = "override"
            row = {
                "lemma": lemma,
                "predicted_class": override_class,
                "confidence": round(confidence, 4),
                "support": int(support),
                "matched_suffix": suffix,
                "override": True,
            }
            pos_hints = vuizur_pos_hints.get(lemma, set())
            if pos_hints:
                row["pos_hints"] = sorted(pos_hints)
            heuristic_rows.append(row)
            predicted_by_class.setdefault(override_class, []).append(lemma)
            if include_heuristic_lemmas and is_valid_form(lemma):
                heuristic_forms.add(lemma)
            continue

        pos_hints = source_pos_hints.get(lemma, set())
        allowed_classes = allowed_classes_from_pos_hints(pos_hints) if pos_hints else None
        shape_allowed = infer_allowed_classes_from_lemma_shape(lemma)
        if shape_allowed is not None:
            if allowed_classes is None:
                allowed_classes = shape_allowed
            else:
                allowed_classes = allowed_classes & shape_allowed

        predicted = predict_class_with_suffix_model(
            lemma,
            suffix_model,
            allowed_classes=allowed_classes,
            class_counts=class_counts,
        )
        if not predicted:
            pos_fallback_class = pick_pos_fallback_class(pos_hints, allowed_classes)
            if pos_fallback_class:
                support = max(class_counts.get(pos_fallback_class, 0), 1)
                row = {
                    "lemma": lemma,
                    "predicted_class": pos_fallback_class,
                    "confidence": 0.55,
                    "support": int(support),
                    "matched_suffix": "pos_fallback",
                }
                if pos_hints:
                    row["pos_hints"] = sorted(pos_hints)
                heuristic_rows.append(row)
                predicted_by_class.setdefault(pos_fallback_class, []).append(lemma)
                if include_heuristic_lemmas and is_valid_form(lemma):
                    heuristic_forms.add(lemma)
                continue
            if lemma in wiktionary_words:
                pos_hints = sorted(source_pos_hints.get(lemma, set()))
                if not pos_hints:
                    pos_hints = ["unknown"]
                for pos in pos_hints:
                    unclassified_vuizur_pos_counts[pos] = unclassified_vuizur_pos_counts.get(pos, 0) + 1
                unclassified_vuizur_rows.append({
                    "lemma": lemma,
                    "pos_hints": pos_hints,
                    "source": (
                        "dump+pos+vuizur"
                        if lemma in wiktionary_dump_words and lemma in wiktionary_pos_words and lemma in vuizur_words
                        else (
                            "dump+pos"
                            if lemma in wiktionary_dump_words and lemma in wiktionary_pos_words
                            else (
                                "dump+vuizur"
                                if lemma in wiktionary_dump_words and lemma in vuizur_words
                                else (
                                    "pos+vuizur"
                                    if lemma in wiktionary_pos_words and lemma in vuizur_words
                                    else (
                                        "dump"
                                        if lemma in wiktionary_dump_words
                                        else ("pos" if lemma in wiktionary_pos_words else "vuizur")
                                    )
                                )
                            )
                        )
                    ),
                })
            continue
        klass, confidence, support, suffix = predicted
        min_confidence = 0.65
        if shape_allowed is not None and lemma.endswith("தல்") and klass in VERB_CLASSES:
            min_confidence = 0.30
        if confidence < min_confidence or support < 5:
            continue
        row = {
            "lemma": lemma,
            "predicted_class": klass,
            "confidence": round(confidence, 4),
            "support": int(support),
            "matched_suffix": suffix,
        }
        if pos_hints:
            row["pos_hints"] = sorted(pos_hints)
        heuristic_rows.append(row)
        predicted_by_class.setdefault(klass, []).append(lemma)
        if include_heuristic_lemmas and is_valid_form(lemma):
            heuristic_forms.add(lemma)

    if include_heuristic_inflections:
        print("Running controlled heuristic inflection synthesis...")
        for klass, lemmas in sorted(predicted_by_class.items()):
            fst_path = fst_dir / klass
            if not fst_path.exists():
                continue

            analyses: List[str] = []
            template_count = 0

            if klass == "noun.fst":
                noun_tags = NOUN_TAGS if full_fst_generation else CONTROLLED_HEURISTIC_NOUN_TAGS
                analyses = [lemma + tag for lemma in lemmas for tag in noun_tags]
                template_count = len(noun_tags)
            elif klass == "adj.fst":
                analyses = [lemma + tag for lemma in lemmas for tag in ADJ_TAGS]
                template_count = len(ADJ_TAGS)
            elif klass.startswith("verb-"):
                lexc_path = resolve_verb_lexc(klass)
                if lexc_path:
                    if full_fst_generation:
                        templates = extract_verb_templates_from_lexc(lexc_path, conservative=False)
                    else:
                        templates = [
                            t for t in extract_verb_templates_from_lexc(lexc_path)
                            if is_controlled_heuristic_verb_template(t)
                        ]
                    template_count = len(templates)
                    expanded = expand_heuristic_verb_lemmas(lemmas, klass=klass)
                    analyses = []
                    normalized_inputs: Set[str] = set()
                    for _lemma, candidates in expanded.items():
                        for stem in sorted(candidates):
                            normalized_inputs.add(stem)
                            stem_templates = select_verb_templates_for_stem(
                                stem,
                                templates,
                                full_generation=full_fst_generation,
                            )
                            analyses.extend(stem + tag for tag in stem_templates)

            if not analyses:
                heuristic_audit_rows.append({
                    "class": klass,
                    "predicted_lemmas": len(lemmas),
                    "templates_used": template_count,
                    "generated_candidates": 0,
                    "forward_validated": 0,
                    "accepted_added": 0,
                    "notes": "no controlled analyses for this class",
                })
                continue

            generated = inverse_generate_forms(fst_path, analyses)
            validated = forward_filter_forms(fst_path, generated)
            added = {w for w in validated if is_valid_form(w)}
            heuristic_forms |= added

            heuristic_audit_rows.append({
                "class": klass,
                "predicted_lemmas": len(lemmas),
                "templates_used": template_count,
                "normalized_or_predicted_inputs": len({a.split('+', 1)[0] for a in analyses}) if analyses else 0,
                "generated_candidates": len(generated),
                "forward_validated": len(validated),
                "accepted_added": len(added),
                "sample_added": sorted(list(added))[:25],
            })

        print(
            f"Controlled heuristic inflections enabled: +{len(heuristic_forms)} "
            "heuristic forms/lemmas (combined)"
        )

    if include_heuristic_lemmas:
        print(f"Heuristic lemma inclusion enabled: +{len(heuristic_forms)} heuristic entries")
        all_forms |= heuristic_forms
    elif include_heuristic_inflections:
        all_forms |= heuristic_forms
    else:
        print(
            f"Heuristic classification generated {len(heuristic_rows)} predictions "
            "(not added to dictionary; set INCLUDE_HEURISTIC_LEMMAS=true to include lemmas)"
        )

    # Step 3: final filtering + output
    all_forms = {w for w in all_forms if is_valid_form(w)}
    sorted_forms = sorted(all_forms)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        for word in sorted_forms:
            f.write(word + "\n")

    write_classification_map(class_map)
    write_heuristic_outputs(heuristic_rows, heuristic_forms, heuristic_audit_rows)
    unclassified_vuizur_rows = sorted(
        unclassified_vuizur_rows,
        key=lambda r: (",".join(r.get("pos_hints", [])), r.get("lemma", "")),
    )
    write_unclassified_vuizur_reports(unclassified_vuizur_rows, unclassified_vuizur_pos_counts)

    size_mb = OUTPUT_FILE.stat().st_size / (1024 * 1024)
    print("\nDone")
    print(f"Generated forms: {len(sorted_forms)} ({size_mb:.1f} MB)")
    print(f"Forms file: {OUTPUT_FILE}")
    print(f"Classification map: {CLASSIFIED_OUTPUT_FILE}")
    print(f"Heuristic classifications: {HEURISTIC_CLASSIFIED_OUTPUT_FILE}")
    print(f"Heuristic forms: {HEURISTIC_FORMS_OUTPUT_FILE}")
    print(f"Heuristic audit: {HEURISTIC_AUDIT_OUTPUT_FILE}")
    print(f"Unclassified Vuizur lemmas: {UNCLASSIFIED_VUIZUR_OUTPUT_FILE}")
    print(f"Unclassified Vuizur summary: {UNCLASSIFIED_VUIZUR_SUMMARY_FILE}")


if __name__ == "__main__":
    main()
