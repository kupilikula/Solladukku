#!/usr/bin/env python3
"""Build a bounded auxiliary-composition FST from atomic verb paradigms."""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path("/Users/anandmurugan/Work/Solladukku")
DEFAULT_FST_DIR = ROOT / "tamil_morph_tokenizer/data/fst-models"
DEFAULT_OUTPUT = ROOT / "outputs/productive_auxiliary_fst_prototype"

VERB_SOURCE_FILES = {
    "verb-c3.fst": "ThamizhiVerbs-C3.lexc",
    "verb-c4.fst": "ThamizhiVerbs-C4.lexc",
    "verb-c11.fst": "ThamizhiVerbs-C11.lexc",
    "verb-c12.fst": "ThamizhiVerbs-C12.lexc",
    "verb-c62.fst": "ThamizhiVerbs-C62.lexc",
    "verb-c-rest.fst": "ThamizhiVerbs-otherthan-3-4-62-11-12.lexc",
}
VERB_BASE_CONTINUATIONS = {
    "C1Vinf": "ClassOne", "C2Vinf": "ClassTwo",
    "C3Vinf": "ClassThree", "C4Vinf": "ClassFour",
    "C5Vinf": "ClassFive", "C61Vinf": "ClassSixOne",
    "C6Vinf": "ClassSixTwo", "C62Vinf": "ClassSixTwo",
    "C63Vinf": "ClassSixThree", "C7Vinf": "ClassSeven",
    "C8Vinf": "ClassEight", "C9Vinf": "ClassNine",
    "C10Vinf": "ClassTen", "C11Vinf": "ClassEleven",
    "C12Vinf": "ClassTwelve", "C13Vinf": "Class13",
    "C14Vinf": "Class14", "C15Vinf": "Class15",
    "C16Vinf": "Class16", "C17Vinf": "Class17",
    "C17MarkedVinf": "Class17", "C18Vinf": "Class18", "PoModernVinf": "ClassPoModern",
    "VaaModernVinf": "ClassVaaModern", "KelModernVinf": "ClassKelModern",
    "NilBaseVinf": "ClassNilModern",
}
VERB_BASE_OWNER_EXCEPTIONS = {
    "C11Vinf": {"Root"},
    "C12Vinf": {"Root"},
    "C61Vinf": {"ClassFive"},
    "C17Vinf": {"C17MarkedVinf"},
}


@dataclass(frozen=True)
class LexcEntry:
    section: str
    lexical: str
    continuation: str

    @property
    def lemma(self) -> str:
        return self.lexical.split(":", 1)[0].replace("%=", "=").strip()


def parse_lexc(path: Path) -> tuple[LexcEntry, ...]:
    section = ""
    entries: list[LexcEntry] = []
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        stripped = raw.strip()
        if stripped.startswith("LEXICON "):
            section = stripped.split(None, 1)[1].strip()
            continue
        body = raw.split("!", 1)[0].strip()
        if not section or not body.endswith(";"):
            continue
        parts = body[:-1].strip().rsplit(None, 1)
        if len(parts) == 2:
            entries.append(LexcEntry(section, parts[0], parts[1]))
    return tuple(entries)


def is_base_verb_entry(entry: LexcEntry) -> bool:
    owner = VERB_BASE_CONTINUATIONS.get(entry.continuation)
    if owner is None:
        return False
    return entry.section in {
        owner, *VERB_BASE_OWNER_EXCEPTIONS.get(entry.continuation, set())
    }


def extract_section_tags(path: Path, section_name: str) -> list[str]:
    section = ""
    tags: set[str] = set()
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        stripped = raw.strip()
        if stripped.startswith("LEXICON "):
            section = stripped.split(None, 1)[1].strip()
            continue
        body = raw.split("!", 1)[0].strip()
        if section == section_name and body.startswith("+"):
            tags.add(body.split(":", 1)[0].replace("%=", "=").strip().rstrip("#"))
    return sorted(tags)


def extract_all_section_tags(path: Path) -> dict[str, set[str]]:
    """Index every analysis-bearing continuation in one source pass."""
    section = ""
    result: dict[str, set[str]] = defaultdict(set)
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        stripped = raw.strip()
        if stripped.startswith("LEXICON "):
            section = stripped.split(None, 1)[1].strip()
            continue
        body = raw.split("!", 1)[0].strip()
        if section and body.startswith("+"):
            result[section].add(
                body.split(":", 1)[0].replace("%=", "=").strip().rstrip("#")
            )
    return result


def run_flookup(
    model: Path, words: list[str], inverse: bool = False, chunk_size: int = 8000,
) -> dict[str, list[str]]:
    result: dict[str, list[str]] = defaultdict(list)
    command = ["flookup"] + (["-i"] if inverse else []) + [str(model)]
    for start in range(0, len(words), chunk_size):
        chunk = words[start : start + chunk_size]
        proc = subprocess.run(
            command, input="\n".join(chunk) + "\n", text=True,
            capture_output=True, check=False,
        )
        if proc.returncode:
            raise RuntimeError(f"flookup failed for {model.name}: {proc.stderr.strip()}")
        for line in proc.stdout.splitlines():
            if "\t" not in line:
                continue
            left, right = line.split("\t", 1)
            if right.strip() != "+?":
                result[left.strip()].append(right.strip())
    return result


@dataclass(frozen=True)
class Connector:
    lemma: str
    surface: str
    form: str
    model: str

    @property
    def is_passive(self) -> bool:
        return "passive" in self.form


AUXILIARIES = {
    "இரு": ("verb-c12.fst", "verb-c12", "ThamizhiVerbs-C12.lexc", "C12Vinf", "aspect"),
    "விடு": (
        "verb-c-rest.fst",
        "verb-c-rest",
        "ThamizhiVerbs-otherthan-3-4-62-11-12.lexc",
        "C61Vinf",
        "aspect",
    ),
    "கொள்": (
        "verb-c-rest.fst",
        "verb-c-rest",
        "ThamizhiVerbs-otherthan-3-4-62-11-12.lexc",
        "C1Vinf",
        "aspect",
    ),
}

MAATTU_FORMS = (
    ("மாட்டேன்", "+1sg%=ஏன்"),
    ("மாட்டோம்", "+1pl%=ஓம்"),
    ("மாட்டாய்", "+2sg%=ஆய்"),
    ("மாட்டீர்", "+2sgh%=ஈர்"),
    ("மாட்டீர்கள்", "+2pl%=ஈர்கள்"),
    ("மாட்டான்", "+3sgm%=ஆன்"),
    ("மாட்டாள்", "+3sgf%=ஆள்"),
    ("மாட்டார்", "+3sghe%=ஆர்"),
    ("மாட்டார்", "+3ple%=ஆர்"),
    ("மாட்டார்கள்", "+3ple%=ஆர்கள்"),
    ("மாட்டாது", "+3sgn%=அது"),
)

MAATTU_COLLOQUIAL_FORMS = (
    ("மாட்டீங்க", "+2pl%=ஈர்கள்", "மாட்டீங்களா"),
    ("மாட்டாங்க", "+3ple%=ஆர்கள்", "மாட்டாங்களா"),
    ("மாட்டேங்குது", "+3sgn%=அது", "மாட்டேங்குதா"),
)

KOL_IRREGULAR_SURFACES = (
    "கொண்டேன்", "கொண்டோம்", "கொண்டாய்", "கொண்டீர்", "கொண்டீர்கள்",
    "கொண்டான்", "கொண்டாள்", "கொண்டார்", "கொண்டார்கள்", "கொண்டது",
    "கொண்டன", "கொண்டனர்", "கொண்ட", "கொண்டவர்", "கொண்டவர்கள்",
)
VIDU_COLLOQUIAL_SURFACES = ("விட்டா",)

IRU_COLLOQUIAL_SURFACES = (
    "இருக்கேன்", "இருக்கோம்", "இருக்கீங்க", "இருக்கான்", "இருக்காள்",
    "இருக்காங்க", "இருக்கு", "இருக்கார்", "இருக்காரு", "இருப்பீங்க",
    "இருப்பாங்க",
    "இருந்தினர்", "இருந்தீங்க", "இருக்கின்", "இருக்கினும்",
    "இருக்கற",
)

NOUN_ROOT_CONTINUATION = re.compile(
    r"(?:C(?:6TTU|[1-9]|1[0-6])(?:SgRoot|plRoot)"
    r"|C10(?:Regular|Geminating)SgRoot"
    r"|C14(?:Alternating|Retained|Dual)Root"
    r"|C16DirectSgRoot)"
)
LEXICAL_PREDICATES = (
    ("வைரல்", "adj", "வைரலாக"),
)
LOCATIVE_EXISTENTIALS = (
    ("அங்கு", "அங்க"),
    ("இங்கு", "இங்க"),
    ("எங்கு", "எங்க"),
)
ATTAINMENT_NOUN_STEMS = (
    ("காயம்", "காயம"),
    ("ஆத்திரம்", "ஆத்திரம"),
    ("சேதம்", "சேதம"),
    ("மரணம்", "மரணம"),
    ("வெற்றி", "வெற்றிய"),
    ("தோல்வி", "தோல்விய"),
    ("வளர்ச்சி", "வளர்ச்சிய"),
    ("புகழ்", "புகழ"),
    ("நிறைவு", "நிறைவ"),
    ("பாதிப்பு", "பாதிப்ப"),
    ("முன்னேற்றம்", "முன்னேற்றம"),
    ("முடிவு", "முடிவ"),
    ("குணம்", "குணம"),
    ("அதிர்ச்சி", "அதிர்ச்சிய"),
    ("படுகாயம்", "படுகாயம"),
    ("கோபம்", "கோபம"),
)
LIGHT_PREDICATE_STEMS = {
    "அடை": ATTAINMENT_NOUN_STEMS,
    "இறங்கு": (("களம்", "களம"),),
}
KOL_COMPOUND_STEMS = (
    ("தொடர்பு", "noun", "தொடர்பு"),
    ("கருத்து", "noun+dat", "கருத்திற்"),
    ("கை", "noun", "கைக்"),
    ("வெளி", "adv", "வெளிக்"),
    ("ஒப்பு", "noun", "ஒப்புக்"),
)


def noun_case_lemma(analysis: str, case: str) -> str | None:
    for suffix in (f"+noun+{case}", f"+noun+infInc+{case}"):
        if analysis.endswith(suffix):
            return analysis.removesuffix(suffix)
    return None


def atomic_roots(source_root: Path) -> dict[str, list[str]]:
    work = source_root / "fst/build/.work"
    result: dict[str, list[str]] = {}
    for model, filename in VERB_SOURCE_FILES.items():
        parsed = parse_lexc(work / model.removesuffix(".fst") / filename)
        result[model] = sorted(
            {
                entry.lemma
                for entry in parsed
                if entry.lemma != "0"
                and is_base_verb_entry(entry)
            }
        )
    return result


def nominal_predicates(
    source_root: Path, fst_dir: Path,
) -> tuple[tuple[str, str, str], ...]:
    noun_path = source_root / "fst/build/.work/noun/Nouns.lexc"
    lemmas = sorted({
        entry.lemma
        for entry in parse_lexc(noun_path)
        if "+" not in entry.lemma
        and NOUN_ROOT_CONTINUATION.fullmatch(entry.continuation)
    })
    queries = [f"{lemma}+noun+trans" for lemma in lemmas]
    generated = run_flookup(fst_dir / "noun.fst", queries, inverse=True)
    rows = {
        (analysis.removesuffix("+noun+trans"), "noun", surface)
        for analysis, surfaces in generated.items()
        if analysis.endswith("+noun+trans")
        for surface in surfaces
        if surface.endswith("ாக")
    }
    rows.update(LEXICAL_PREDICATES)
    return tuple(sorted(rows))


def nominal_existential_predicates(
    source_root: Path, fst_dir: Path,
) -> tuple[tuple[str, str, str], ...]:
    noun_path = source_root / "fst/build/.work/noun/Nouns.lexc"
    lemmas = sorted({
        entry.lemma
        for entry in parse_lexc(noun_path)
        if "+" not in entry.lemma
        and NOUN_ROOT_CONTINUATION.fullmatch(entry.continuation)
    })
    queries = [f"{lemma}+noun+nom" for lemma in lemmas]
    generated = run_flookup(fst_dir / "noun.fst", queries, inverse=True)
    return tuple(sorted({
        (analysis.removesuffix("+noun+nom"), "noun", surface)
        for analysis, surfaces in generated.items()
        if analysis.endswith("+noun+nom")
        for surface in surfaces
        if surface and " " not in surface
    }))


def nominal_locative_predicates(
    source_root: Path, fst_dir: Path,
) -> tuple[tuple[str, str], ...]:
    noun_path = source_root / "fst/build/.work/noun/Nouns.lexc"
    lemmas = sorted({
        entry.lemma
        for entry in parse_lexc(noun_path)
        if "+" not in entry.lemma
        and NOUN_ROOT_CONTINUATION.fullmatch(entry.continuation)
    })
    queries = [
        query
        for lemma in lemmas
        for query in (f"{lemma}+noun+loc", f"{lemma}+noun+infInc+loc")
    ]
    generated = run_flookup(fst_dir / "noun.fst", queries, inverse=True)
    return tuple(sorted({
        (lemma, surface)
        for analysis, surfaces in generated.items()
        if (lemma := noun_case_lemma(analysis, "loc")) is not None
        for surface in surfaces
        if surface.endswith("ல்") and " " not in surface
    }))


def nominal_dative_predicates(
    source_root: Path, fst_dir: Path,
) -> tuple[tuple[str, str], ...]:
    noun_path = source_root / "fst/build/.work/noun/Nouns.lexc"
    lemmas = sorted({
        entry.lemma
        for entry in parse_lexc(noun_path)
        if "+" not in entry.lemma
        and NOUN_ROOT_CONTINUATION.fullmatch(entry.continuation)
    })
    queries = [
        query
        for lemma in lemmas
        for query in (f"{lemma}+noun+dat", f"{lemma}+noun+infInc+dat")
    ]
    generated = run_flookup(fst_dir / "noun.fst", queries, inverse=True)
    return tuple(sorted({
        (lemma, surface)
        for analysis, surfaces in generated.items()
        if (lemma := noun_case_lemma(analysis, "dat")) is not None
        for surface in surfaces
        if surface.endswith("ு") and " " not in surface
    }))


def nominal_genitive_predicates(
    source_root: Path, fst_dir: Path,
) -> tuple[tuple[str, str], ...]:
    """Return validated -இன் noun genitives for joined temporal postpositions."""
    noun_path = source_root / "fst/build/.work/noun/Nouns.lexc"
    lemmas = sorted({
        entry.lemma
        for entry in parse_lexc(noun_path)
        if "+" not in entry.lemma
        and NOUN_ROOT_CONTINUATION.fullmatch(entry.continuation)
    })
    queries = [
        query
        for lemma in lemmas
        for query in (f"{lemma}+noun+gen", f"{lemma}+noun+infInc+gen")
    ]
    generated = run_flookup(fst_dir / "noun.fst", queries, inverse=True)
    return tuple(sorted({
        (lemma, surface)
        for analysis, surfaces in generated.items()
        if (lemma := noun_case_lemma(analysis, "gen")) is not None
        for surface in surfaces
        if surface.endswith("ின்") and " " not in surface
    }))


def joined_nominal_predicate(stem: str, predicate: str) -> str | None:
    """Join a noun with இல்லை/உண்டு/உள்ள using productive Tamil sandhi."""
    consonant_forms = {
        "இல்லை": "ில்லை", "இல்லாத": "ில்லாத",
        "உண்டு": "ுண்டு", "உள்ள": "ுள்ள",
        "அல்ல": "ல்ல",
    }
    if stem.endswith("ு"):
        return stem[:-1] + consonant_forms[predicate]
    glide_forms = {
        "இல்லை": "யில்லை", "இல்லாத": "யில்லாத",
        "உண்டு": "யுண்டு", "உள்ள": "யுள்ள",
        "அல்ல": "யல்ல",
    }
    if stem.endswith(("ி", "ீ", "ை")):
        return stem + glide_forms[predicate]
    if stem.endswith("ய்"):
        return stem[:-1] + glide_forms[predicate][1:]
    if stem.endswith("்"):
        return stem[:-1] + consonant_forms[predicate]
    if predicate == "அல்ல" and stem.endswith(("ா", "ே", "ோ", "ௌ")):
        return stem + "வல்ல"
    return None


def become_pairs(
    source_root: Path, fst_dir: Path,
) -> tuple[tuple[str, str, str], ...]:
    path = (
        source_root / "fst/build/.work/verb-c-rest/"
        "ThamizhiVerbs-otherthan-3-4-62-11-12.lexc"
    )
    tags = extract_section_tags(path, "C13Vinf")
    allowed = [
        tag for tag in tags
        if (tag.startswith("+verb+fin+") or tag.startswith("+verb+nonfin+"))
        and not any(marker in tag for marker in ("+caus", "+passive", "+imp", "+opt"))
    ]
    generated = run_flookup(
        fst_dir / "verb-c-rest.fst", ["ஆகு" + tag for tag in allowed], inverse=True
    )
    rows: set[tuple[str, str, str]] = set()
    for analysis, surfaces in generated.items():
        tags = analysis.removeprefix("ஆகு")
        upper = grammatical_tail(tags).replace(
            "+complex", "+complex+become", 1
        )
        for surface in surfaces:
            if surface.startswith("ஆக"):
                rows.add((upper, "aak", surface[len("ஆக") :]))
            elif surface.startswith(("ஆன", "ஆவ", "ஆய")):
                rows.add((upper, "aa", "ா" + surface[1:]))
    return tuple(sorted(rows))


def light_predicate_pairs(
    source_root: Path, fst_dir: Path,
) -> tuple[tuple[str, str, str], ...]:
    configurations = (
        ("அடை", "verb-c4", "ThamizhiVerbs-C4.lexc", "C4Vinf"),
        (
            "இறங்கு", "verb-c-rest",
            "ThamizhiVerbs-otherthan-3-4-62-11-12.lexc", "C5Vinf",
        ),
    )
    rows: set[tuple[str, str, str]] = set()
    for lemma, directory, filename, section in configurations:
        path = source_root / "fst/build/.work" / directory / filename
        tags = extract_section_tags(path, section)
        allowed = [
            tag for tag in tags
            if (tag.startswith("+verb+fin+") or tag.startswith("+verb+nonfin+"))
            and not any(marker in tag for marker in ("+caus", "+passive", "+colloq"))
        ]
        model = directory + ".fst"
        generated = run_flookup(
            fst_dir / model, [lemma + tag for tag in allowed], inverse=True
        )
        rows.update({
            (lemma, analysis.removeprefix(lemma), surface)
            for analysis, surfaces in generated.items()
            for surface in surfaces
            if surface.startswith(lemma[0])
        })
    return tuple(sorted(rows))


def additive_translative_surface(nominative: str) -> str | None:
    if nominative.endswith(("ு", "்")):
        return nominative[:-1] + "ுமாக"
    if nominative.endswith(("ி", "ீ", "ை")):
        return nominative + "யுமாக"
    if nominative.endswith(("ா", "ே", "ோ", "ௌ")):
        return nominative + "வுமாக"
    return None


def additive_copular_surface(nominative: str) -> str | None:
    translative = additive_translative_surface(nominative)
    return translative.removesuffix("ாக") + "ான" if translative else None


def direct_root_connectors(source_root: Path) -> set[Connector]:
    rows: set[Connector] = set()
    # Some genuinely irregular verbs are expressed as complete Root relations
    # instead of entries routed through a class continuation.  They therefore
    # have no atomic root for the inverse queries above.  Preserve their
    # explicitly licensed nonfinite connectors (for example ஏல் -> ஏற்று)
    # so productive auxiliary composition is complete for both source styles.
    work = source_root / "fst/build/.work"
    for model, filename in VERB_SOURCE_FILES.items():
        path = work / model.removesuffix(".fst") / filename
        section = ""
        for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
            stripped = raw.strip()
            if stripped.startswith("LEXICON "):
                section = stripped.split(None, 1)[1].strip()
                continue
            body = raw.split("!", 1)[0].strip()
            if section != "Root" or not body.endswith("#;") or ":" not in body:
                continue
            relation = body[:-2].strip()
            analysis, surface = relation.split(":", 1)
            normalized = analysis.replace("%=", "=")
            match = re.match(r"^(.+?)\+verb\+nonfin\+sim(.+)$", normalized)
            if not match or not surface or " " in surface:
                continue
            lemma, tags = match.groups()
            form: str | None = None
            if "+vpart=உ" in tags or "+vpart=இ" in tags:
                form = "vpart_k" if "+sandhik=க்" in tags else "vpart"
            elif "+past=" in tags and "+adjpart=அ" in tags:
                form = "past_adjpart"
            elif "+neg=ஆத்" in tags and "+adjpart=அ" in tags:
                form = "neg_adjpart"
            elif "+neg=ஆது+vpart=∅" in tags:
                form = "vpart_neg"
            elif "+inf=அ" in tags or "+inf=க்க" in tags or "+inf=க" in tags:
                form = "inf"
            if form:
                rows.add(Connector(lemma, surface, form, model))
                # Class continuations license the optional sandhi-k connector
                # used before auxiliaries such as கொள். Mirror that productive
                # route for direct irregular u-participles as well.
                if form == "vpart" and surface.endswith("ு"):
                    rows.add(Connector(lemma, surface + "க்", "vpart_k", model))
    return rows


def complex_connector_form(tags: str) -> str | None:
    """Classify licensed nonfinite connectors from specialized complex roots."""
    if "+verb+nonfin+complex" not in tags:
        return None
    passive = "+passive" in tags
    if tags.endswith(("+vpart=உ", "+vpart=இ")):
        base = "vpart_passive" if passive else "vpart"
        return base
    if tags.endswith(("+vpart=உ+sandhik=க்", "+vpart=இ+sandhik=க்")):
        return "vpart_passive_k" if passive else "vpart_k"
    if tags.endswith(("+inf=அ", "+inf=க்க", "+inf=க")):
        return "inf_passive" if passive else "inf"
    return None


def complex_root_connectors(
    source_root: Path, fst_dir: Path,
) -> set[Connector]:
    """Extract connectors from every continuation-owned complex verb root."""
    rows: set[Connector] = set()
    work = source_root / "fst/build/.work"
    for model, filename in VERB_SOURCE_FILES.items():
        path = work / model.removesuffix(".fst") / filename
        entries = parse_lexc(path)
        direct_tags = extract_all_section_tags(path)
        edges: dict[str, set[str]] = defaultdict(set)
        for entry in entries:
            if entry.lemma == "0":
                edges[entry.section].add(entry.continuation)

        resolved_cache: dict[str, tuple[str, ...]] = {}

        def resolved_tags(continuation: str) -> tuple[str, ...]:
            if continuation in resolved_cache:
                return resolved_cache[continuation]
            tags: set[str] = set()
            seen: set[str] = set()
            pending = [continuation]
            while pending:
                current = pending.pop()
                if current in seen:
                    continue
                seen.add(current)
                tags.update(direct_tags.get(current, ()))
                pending.extend(edges.get(current, ()))
            result = tuple(sorted(tags))
            resolved_cache[continuation] = result
            return result

        queries: dict[str, tuple[str, str]] = {}
        for entry in entries:
            if entry.lemma == "0" or "+" in entry.lemma:
                continue
            for tags in resolved_tags(entry.continuation):
                form = complex_connector_form(tags)
                if form is not None:
                    queries[entry.lemma + tags] = (entry.lemma, form)
        generated = (
            run_flookup(fst_dir / model, list(queries), inverse=True)
            if queries else {}
        )
        for analysis, surfaces in generated.items():
            lemma, form = queries[analysis]
            for surface in surfaces:
                rows.add(Connector(lemma, surface, form, model))
    return rows


def extract_connectors(source_root: Path, fst_dir: Path) -> tuple[Connector, ...]:
    rows = direct_root_connectors(source_root)
    rows.update(complex_root_connectors(source_root, fst_dir))
    roots = atomic_roots(source_root)
    for model, lemmas in roots.items():
        model_path = fst_dir / model
        queries: dict[str, tuple[str, str]] = {}
        for lemma in lemmas:
            for form, grammatical_form, prefix, values, sandhi in (
                ("vpart", "vpart", "+verb+nonfin+sim", ("உ", "இ"), ""),
                ("vpart_k", "vpart", "+verb+nonfin+sim", ("உ", "இ"), "+sandhik=க்"),
                ("vpart_neg", "vpart", "+verb+nonfin+sim+neg=ஆது", ("∅",), ""),
                ("inf", "inf", "+verb+nonfin+sim", ("அ", "க்க", "க"), ""),
            ):
                for value in values:
                    analysis = f"{lemma}{prefix}+{grammatical_form}={value}{sandhi}"
                    queries[analysis] = (lemma, form)
            for value in ("உ", "இ"):
                analysis = f"{lemma}+verb+nonfin+sim+vpart={value}+colloq"
                queries[analysis] = (lemma, "vpart_colloq")
            for value in ("த்", "ட்", "ற்", "இன்", "இ"):
                analysis = f"{lemma}+verb+nonfin+sim+past={value}+adjpart=அ"
                queries[analysis] = (lemma, "past_adjpart")
            analysis = f"{lemma}+verb+nonfin+sim+neg=ஆத்+adjpart=அ"
            queries[analysis] = (lemma, "neg_adjpart")
        generated = run_flookup(model_path, list(queries), inverse=True)
        for analysis, surfaces in generated.items():
            lemma, form = queries[analysis]
            for surface in surfaces:
                rows.add(Connector(lemma, surface, form, model))

    # Passive continuations are centralized in verb-c-rest even when the
    # lexical root belongs to C4/C11/etc. Querying only the owning model loses
    # productive chains such as அறிவிக்கப்பட்டிருந்தது.
    passive_model = "verb-c-rest.fst"
    passive_queries: dict[str, tuple[str, str]] = {}
    for lemma in sorted({lemma for lemmas in roots.values() for lemma in lemmas}):
        for form, grammatical_form, sandhi in (
            ("vpart_passive", "vpart", ""),
            ("vpart_passive_k", "vpart", "+sandhik=க்"),
            ("inf_passive", "inf", ""),
        ):
            analysis = (
                f"{lemma}+verb+nonfin+complex+passive+{grammatical_form}="
                f"{'உ' if grammatical_form == 'vpart' else 'அ'}{sandhi}"
            )
            passive_queries[analysis] = (lemma, form)
    generated = run_flookup(fst_dir / passive_model, list(passive_queries), inverse=True)
    for analysis, surfaces in generated.items():
        lemma, form = passive_queries[analysis]
        for surface in surfaces:
            rows.add(Connector(lemma, surface, form, passive_model))
    return tuple(sorted(rows, key=lambda row: (row.form, row.lemma, row.surface, row.model)))


def simple_auxiliary_pairs(
    source_root: Path, fst_dir: Path, lemma: str
) -> tuple[tuple[str, str], ...]:
    model, directory, filename, section, _ = AUXILIARIES[lemma]
    tags = extract_section_tags(source_root / "fst/build/.work" / directory / filename, section)
    allowed = [
        tag
        for tag in tags
        if (tag.startswith("+verb+fin+") or tag.startswith("+verb+nonfin+"))
        and "+caus" not in tag
        and "+passive" not in tag
        and "+colloq" not in tag
    ]
    generated = run_flookup(fst_dir / model, [lemma + tag for tag in allowed], inverse=True)
    pairs = {
        (analysis.removeprefix(lemma), surface)
        for analysis, surfaces in generated.items()
        for surface in surfaces
    }
    if lemma == "கொள்":
        analyzed = run_flookup(fst_dir / model, list(KOL_IRREGULAR_SURFACES))
        pairs.update(
            (analysis.removeprefix(lemma), surface)
            for surface, analyses in analyzed.items()
            for analysis in analyses
            if analysis.startswith(lemma + "+verb+")
            and "+sim" in analysis
            and "+caus" not in analysis
        )
    if lemma == "விடு":
        analyzed = run_flookup(fst_dir / model, list(VIDU_COLLOQUIAL_SURFACES))
        pairs.update(
            (analysis.removeprefix(lemma), surface)
            for surface, analyses in analyzed.items()
            for analysis in analyses
            if analysis.startswith(lemma + "+verb+")
            and "+con=ஆல்" in analysis
            and "+colloq" in analysis
        )
    if lemma == "இரு":
        analyzed = run_flookup(fst_dir / model, list(IRU_COLLOQUIAL_SURFACES))
        pairs.update(
            (analysis.removeprefix(lemma), surface)
            for surface, analyses in analyzed.items()
            for analysis in analyses
            if analysis.startswith(lemma + "+verb+")
        )
    return tuple(sorted(pairs))


def prefixed_vaa_pairs(
    source_root: Path, fst_dir: Path,
) -> tuple[tuple[str, str], ...]:
    """Extract the complete simple வா paradigm for productive preverbs."""
    path = (
        source_root / "fst/build/.work/verb-c-rest/"
        "ThamizhiVerbs-otherthan-3-4-62-11-12.lexc"
    )
    sections = (
        "VaaModernVinf", "VaaModernPastShortRVinf", "VaaSpokenPastNeuter",
        "VaaSpokenPresent", "ModernPerfectFin", "C17VaruVN",
    )
    tags = sorted({
        tag for section in sections for tag in extract_section_tags(path, section)
    })
    tags.extend((
        "+verb+fin+sim+imp=∅+2sg=∅",
        "+verb+nonfin+sim+vpart=உ",
        "+verb+nonfin+sim+vpart=உ+sandhik=க்",
        "+verb+nonfin+sim+vpart=உ+sandhic=ச்",
        "+verb+nonfin+sim+vpart=உ+sandhip=ப்",
        "+verb+nonfin+sim+vpart=உ+sandhit=த்",
        "+verb+nonfin+sim+inf=அ",
    ))
    allowed = [
        tag for tag in tags
        if (tag.startswith("+verb+fin+") or tag.startswith("+verb+nonfin+"))
        and not any(marker in tag for marker in ("+caus", "+passive"))
    ]
    generated = run_flookup(
        fst_dir / "verb-c-rest.fst", ["வா" + tag for tag in allowed], inverse=True
    )
    return tuple(sorted({
        (analysis.removeprefix("வா"), surface)
        for analysis, surfaces in generated.items()
        for surface in surfaces
        if analysis.startswith("வா+verb+")
    }))


def grammatical_tail(tags: str) -> str:
    match = re.match(
        r"^\+verb\+(fin|nonfin)\+(?:sim|complex)(?:\+(?:strong|weak|middle))?",
        tags,
    )
    if not match:
        raise ValueError(tags)
    return f"+verb+{match.group(1)}+complex" + tags[match.end() :]


def composed_upper(
    tags: str,
    auxiliary_tags: str,
    passive: bool,
    connector_tags: str = "",
) -> str:
    connector_tags = ("+passive" if passive else "") + connector_tags
    upper = grammatical_tail(tags).replace(
        "+complex", "+complex" + connector_tags + auxiliary_tags, 1
    )
    return upper.removeprefix("+verb") if (passive or connector_tags) else upper


def iru_suffix(surface: str, connector_type: str) -> str:
    if not surface.startswith("இ"):
        raise ValueError(f"Unexpected இரு realization: {surface}")
    if connector_type == "u":
        return "ி" + surface[1:]
    if connector_type == "i":
        return "யி" + surface[1:]
    if connector_type == "y":
        return "ி" + surface[1:]
    raise ValueError(connector_type)


def colloquial_vidu_future_suffix(surface: str, connector_kind: str, variant: str) -> str:
    """Realize future விடு as productive spoken இடு/இரு allomorphs."""
    if not surface.startswith("விடு"):
        raise ValueError(f"Unexpected விடு future realization: {surface}")
    if connector_kind not in {"u", "i", "y"}:
        raise ValueError(connector_kind)
    if variant not in {"idu", "iru"}:
        raise ValueError(variant)
    onset = "டு" if variant == "idu" else "ரு"
    if connector_kind in {"u", "y"}:
        onset = "ி" + onset
    return onset + surface.removeprefix("விடு")


def colloquial_vidu_imperative(surface: str, connector_kind: str) -> str:
    """Contract participle + விடு to the spoken second-person imperative."""
    if connector_kind in {"u", "i"}:
        return surface + "டு"
    if connector_kind == "y":
        return surface[:-1] + "ிடு"
    raise ValueError(connector_kind)


def connector_type(surface: str) -> tuple[str, str]:
    if surface.endswith("ு"):
        return "u", surface[:-1]
    if surface.endswith("ி"):
        return "i", surface
    if surface.endswith("ய்"):
        return "y", surface[:-1]
    raise ValueError(f"Unsupported verbal-participle ending: {surface}")


def lexc_upper(value: str) -> str:
    return value.replace("=", "%=")


def question_surface(surface: str, *, colloquial: bool = False) -> str:
    """Attach interrogative -aa with the host's licensed realization."""
    if colloquial and surface.endswith("ாய்"):
        return surface.removesuffix("ாய்") + "ியா"
    if colloquial and surface.endswith("ங்க"):
        return surface + "ளா"
    if surface.endswith(("்", "ு")):
        return surface[:-1] + "ா"
    return surface + "ஆ"


def vowel_clitic_surface(
    surface: str, realization: str, *, colloquial: bool = False
) -> str:
    if colloquial and surface.endswith("ங்க"):
        return surface + "ள" + realization
    if surface.endswith(("்", "ு")):
        return surface[:-1] + realization
    return surface + realization


def en_complement_surface(surface: str, ending: str) -> str:
    """Attach என/எனில் with the regular pulli-to-e sandhi after final m."""
    if surface.endswith("ம்"):
        return surface[:-1] + "ெ" + ending[1:]
    return surface + ending


def privative_surface(surface: str) -> str | None:
    """Join nominal hosts to privative இன்றி with regular Tamil glide sandhi."""
    if surface.endswith("ு"):
        return surface[:-1] + "ின்றி"
    if surface.endswith(("ி", "ீ", "ை", "ே")):
        return surface + "யின்றி"
    if surface.endswith(("ா", "ூ", "ோ", "ௌ")):
        return surface + "வின்றி"
    if surface.endswith("்"):
        return surface[:-1] + "ின்றி"
    return None


def affiliation_member_stem(surface: str) -> str | None:
    """Derive the human-plural member stem for licensed institutional heads."""
    if surface.endswith(("கட்சி", "துறை", "அணி")):
        return surface + "யினர"
    if surface.endswith("குழு"):
        return surface[:-1] + "ுவினர"
    if surface.endswith(("தரப்பு", "பிரிவு", "அமைப்பு")):
        return surface[:-1] + "ினர"
    if surface.endswith(("வாரியம்", "சங்கம்", "மன்றம்")):
        return surface.removesuffix("ம்") + "த்தினர"
    return None


def affiliation_member_rows(lemma: str, stem: str) -> tuple[str, ...]:
    forms = (
        ("nom", "்"), ("nom+add%=உம்", "ும்"), ("acc%=ஐ", "ை"),
        ("dat%=க்கு", "ுக்கு"), ("inst%=ஆல்", "ால்"), ("gen%=இன்", "ின்"),
        ("loc%=இடம்", "ிடம்"), ("soc%=உடன்", "ுடன்"),
    )
    return tuple(
        f"{lemma}+noun+human+pl+{tags}:{stem}{suffix} #;"
        for tags, suffix in forms
    )


def human_participial_rows(upper: str, stem: str) -> tuple[str, ...]:
    forms = (
        ("PartNoun%=அவன்+human+3sgm+nom", "வன்"),
        ("PartNoun%=அவன்+human+3sgm+nom+foc%=தான்", "வன்தான்"),
        ("PartNoun%=அவன்+human+3sgm+acc%=ஐ", "வனை"),
        ("PartNoun%=அவன்+human+3sgm+dat%=க்கு", "வனுக்கு"),
        ("PartNoun%=அவன்+human+3sgm+dat%=க்கு+purpose+cop+adjpart%=ன", "வனுக்கான"),
        ("PartNoun%=அவன்+human+3sgm+gen%=இன்", "வனின்"),
        ("PartNoun%=அவன்+human+3sgm+gen%=உடைய", "வனுடைய"),
        ("PartNoun%=அவன்+human+3sgm+inst%=ஆல்", "வனால்"),
        ("PartNoun%=அவள்+human+3sgf+nom", "வள்"),
        ("PartNoun%=அவள்+human+3sgf+acc%=ஐ", "வளை"),
        ("PartNoun%=அவள்+human+3sgf+dat%=க்கு", "வளுக்கு"),
        ("PartNoun%=அவள்+human+3sgf+dat%=க்கு+purpose+cop+adjpart%=ன", "வளுக்கான"),
        ("PartNoun%=அவள்+human+3sgf+gen%=இன்", "வளின்"),
        ("PartNoun%=அவள்+human+3sgf+gen%=உடைய", "வளுடைய"),
        ("PartNoun%=அவள்+human+3sgf+inst%=ஆல்", "வளால்"),
        ("PartNoun%=அவர்+human+3sghe+nom", "வர்"),
        ("PartNoun%=அவர்+human+3sghe+nom+foc%=தான்", "வர்தான்"),
        ("PartNoun%=அவர்+human+3sghe+acc%=ஐ", "வரை"),
        ("PartNoun%=அவர்+human+3sghe+dat%=க்கு", "வருக்கு"),
        ("PartNoun%=அவர்+human+3sghe+dat%=க்கு+purpose+cop+adjpart%=ன", "வருக்கான"),
        ("PartNoun%=அவர்+human+3sghe+dat%=க்கு+sandhic%=ச்", "வருக்குச்"),
        ("PartNoun%=அவர்+human+3sghe+dat%=க்கு+register%=literary", "ார்க்கு"),
        ("PartNoun%=அவர்+human+3sghe+gen%=உடைய", "வருடைய"),
        ("PartNoun%=அவர்+human+3sghe+loc%=இடம்", "வரிடம்"),
        ("PartNoun%=அவர்+human+3sghe+cmpr%=போல்", "வர்போல்"),
        ("PartNoun%=அவர்+human+3sghe+cmpr%=போல்", "வர்போல"),
        ("PartNoun%=அவர்+human+3sghe+trans%=ஆக", "வராக"),
        ("PartNoun%=அவர்+human+3sghe+trans%=ஆக+add%=உம்", "வராகவும்"),
        ("PartNoun%=அவர்+human+pl+nom", "வர்கள்"),
        ("PartNoun%=அவர்+human+pl+nom+foc%=தான்", "வர்கள்தான்"),
        ("PartNoun%=அவர்+human+pl+acc%=ஐ", "வர்களை"),
        ("PartNoun%=அவர்+human+pl+acc%=ஐ+sandhik%=க்", "வர்களைக்"),
        ("PartNoun%=அவர்+human+pl+acc%=ஐ+sandhic%=ச்", "வர்களைச்"),
        ("PartNoun%=அவர்+human+pl+acc%=ஐ+sandhit%=த்", "வர்களைத்"),
        ("PartNoun%=அவர்+human+pl+acc%=ஐ+sandhip%=ப்", "வர்களைப்"),
        ("PartNoun%=அவர்+human+pl+dat%=க்கு", "வர்களுக்கு"),
        ("PartNoun%=அவர்+human+pl+dat%=க்கு+purpose+cop+adjpart%=ன", "வர்களுக்கான"),
        ("PartNoun%=அவர்+human+pl+gen%=உடைய", "வர்களுடைய"),
        ("PartNoun%=அவர்+human+pl+inst%=ஆல்", "வர்களால்"),
        ("PartNoun%=அவர்+human+pl+loc%=இல்", "வர்களில்"),
        ("PartNoun%=அவர்+human+pl+purpose%=க்காக", "வர்களுக்காக"),
        ("PartNoun%=அவர்+human+pl+cmpr%=போல்", "வர்கள்போல்"),
        ("PartNoun%=அவர்+human+pl+cmpr%=போல்", "வர்கள்போல"),
        ("PartNoun%=அவர்+human+pl+trans%=ஆக", "வர்களாக"),
        ("PartNoun%=அவர்+human+pl+trans%=ஆக+add%=உம்", "வர்களாகவும்"),
        ("PartNoun%=ஓர்", "ோர்"),
        ("PartNoun%=ஓர்+human+pl+nom+add%=உம்", "ோரும்"),
        ("PartNoun%=ஓர்+human+pl+nom+foc%=ஏ", "ோரே"),
        ("PartNoun%=ஓர்+human+pl+acc%=ஐ", "ோரை"),
        ("PartNoun%=ஓர்+human+pl+dat%=க்கு", "ோருக்கு"),
        ("PartNoun%=ஓர்+human+pl+dat%=க்கு+purpose+cop+adjpart%=ன", "ோருக்கான"),
        ("PartNoun%=ஓர்+human+pl+inst%=ஆல்", "ோரால்"),
        ("PartNoun%=ஓர்+human+pl+gen%=இன்", "ோரின்"),
        ("PartNoun%=ஓர்+human+pl+gen%=உடைய", "ோருடைய"),
        ("PartNoun%=ஓர்+human+pl+loc%=இடம்", "ோரிடம்"),
        ("PartNoun%=ஓர்+human+pl+soc%=உடன்", "ோருடன்"),
    )
    return tuple(f"{upper}+{tags}:{stem}{suffix} #;" for tags, suffix in forms)


def neuter_participial_rows(upper: str, stem: str) -> tuple[str, ...]:
    forms = (
        ("PartNoun%=அது+nom", "து"),
        ("PartNoun%=அது+nom+foc%=தான்", "துதான்"),
        ("PartNoun%=அது+nom+negpart%=இல்லை", "துமில்லை"),
        ("PartNoun%=அது+nom+add%=உம்", "துவும்"),
        ("PartNoun%=அது+acc%=ஐ", "தை"),
        ("PartNoun%=அது+acc%=ஐ+foc%=ஏ", "தையே"),
        ("PartNoun%=அது+acc%=ஐ+add%=உம்", "தையும்"),
        ("PartNoun%=அது+acc%=ஐ+cmpr%=விட", "தைவிட"),
        ("PartNoun%=அது+inst%=ஆல்", "தால்"),
        ("PartNoun%=அது+inst%=ஆல்", "தனால்"),
        ("PartNoun%=அது+dat%=க்கு", "தற்கு"),
        ("PartNoun%=அது+gen%=இன்", "தின்"),
        ("PartNoun%=அது+gen%=இன்+inst%=ஆல்", "தினால்"),
        ("PartNoun%=அது+loc%=இல்", "தில்"),
        ("PartNoun%=அது+loc%=இல்+foc%=ஏ", "திலே"),
        ("PartNoun%=அது+inst%=ஆல்+foc%=தான்", "தால்தான்"),
        ("PartNoun%=அது+soc%=ஓடு", "தோடு"),
        ("PartNoun%=அது+trans%=ஆக", "தாக"),
        ("PartNoun%=அது+trans%=ஆக+foc%=ஏ", "தாகவே"),
        ("PartNoun%=அது+trans%=ஆக+add%=உம்", "தாகவும்"),
        ("PartNoun%=அது+trans%=ஆக+sandhik%=க்", "தாகக்"),
        ("PartNoun%=அது+trans%=ஆக+sandhic%=ச்", "தாகச்"),
        ("PartNoun%=அது+trans%=ஆக+sandhit%=த்", "தாகத்"),
        ("PartNoun%=அது+trans%=ஆக+sandhip%=ப்", "தாகப்"),
        ("PartNoun%=அது+cmpr%=போல்", "துபோல்"),
        ("PartNoun%=அது+cmpr%=போல்", "துபோல"),
        ("PartNoun%=அவை+neut+pl+nom", "வை"),
        ("PartNoun%=அவை+neut+pl+acc%=ஐ", "வற்றை"),
        ("PartNoun%=அவை+neut+pl+acc%=ஐ+sandhik%=க்", "வற்றைக்"),
        ("PartNoun%=அவை+neut+pl+dat%=க்கு", "வற்றுக்கு"),
        ("PartNoun%=அவை+neut+pl+gen%=இன்", "வற்றின்"),
        ("PartNoun%=அவை+neut+pl+inst%=ஆல்", "வற்றால்"),
        ("PartNoun%=அவை+neut+pl+loc%=இல்", "வற்றில்"),
    )
    return tuple(f"{upper}+{tags}:{stem}{suffix} #;" for tags, suffix in forms)


def future_participial_stem(surface: str) -> str | None:
    for ending, replacement in (
        ("ிருக்கும்", "ிருப்ப"),
        ("கொள்ளும்", "கொள்ப"),
        ("விடும்", "விடுப"),
    ):
        if surface.endswith(ending):
            return surface[: -len(ending)] + replacement
    return None


def outer_auxiliary_rows(tags: str, surface: str) -> tuple[str, ...]:
    """Generate licensed clausal/nominal material outside an auxiliary chain."""
    rows: set[str] = set()
    upper = lexc_upper(tags)
    tag_names = {
        tag.split("=", 1)[0]
        for tag in tags.split("+")
        if tag
    }
    # Atomic FSTs already expose focused, questioned, case-marked, and other
    # externally suffixed templates. Those templates are outputs, not fresh
    # hosts for another outer layer. Expanding them again licenses malformed
    # strings such as `இருக்கவும்க்கூடும்` and doubled question clitics.
    outer_relations = {
        "PartNoun", "abl", "acc", "add", "cmpr", "comp", "dat", "foc",
        "gen", "inst", "loc", "nom", "psp_padi", "purpose", "ques",
        "report", "sandhi-c", "sandhi-k", "sandhi-p", "sandhi-t",
        "sandhic", "sandhik", "sandhip", "sandhit", "soc", "trans",
        "verbalnoun", "vpart_maaru", "vpart_pin", "vpart_potu", "vpart_tum",
    }
    # A lexical/FST-provided -māṟu host may still take its regular additive.
    # The final short-u sign is replaced by -um: இருக்குமாறு -> இருக்குமாறும்.
    if "vpart_maaru" in tag_names and not tag_names & {"add", "foc"}:
        if surface.endswith("ு"):
            rows.add(f"{upper}+add%=உம்:{surface[:-1]}ும் #;")
        return tuple(sorted(rows))
    if tag_names & outer_relations:
        return ()
    if "+fin" in tags:
        colloquial = "+colloq" in tags
        for tag, realization in (
            ("ques%=ஆ", "ா"),
            ("ques%=ஓ", "ோ"),
            ("foc%=ஏ", "ே"),
            ("report%=ஆம்", "ாம்"),
        ):
            rows.add(
                f"{upper}+{tag}:"
                f"{vowel_clitic_surface(surface, realization, colloquial=colloquial)} #;"
            )
        if "+3pln=அன" in tags and surface.endswith("ன"):
            rows.add(f"{upper}+ques%=ஆ:{surface}வா #;")
            rows.add(f"{upper}+ques%=ஓ:{surface}வோ #;")
        if surface.endswith(("்", "ு")):
            rows.add(f"{upper}+ques%=அல்லவா:{surface[:-1]}ல்லவா #;")
        if "+2sg=ஆய்" in tags and surface.endswith("ாய்"):
            rows.add(f"{upper}+opt%=ஆக:{surface[:-1]}ாக #;")
        if "+1pl=ஓம்" in tags and surface.endswith("ோம்"):
            rows.add(f"{upper}+opt%=ஆக:{surface.removesuffix('ம்')}மாக #;")
        if colloquial:
            # Spoken finite clauses productively take -nu/-nnu while retaining
            # the tense and agreement of their finite predicate.
            rows.add(f"{upper}+comp%=என்று:{surface}னு #;")
            rows.add(f"{upper}+comp%=என்று:{surface}ன்னு #;")
        else:
            rows.add(
                f"{upper}+comp%=என்று+cond%=இன்:"
                f"{en_complement_surface(surface, 'எனில்')} #;"
            )
        # Finite neuter -து supplies the regular reported-complement base.
        if "+3sgn=அது" in tags and surface.endswith("து"):
            nominal = tags.replace("+fin", "+nonfin", 1).replace(
                "+3sgn=அது", "+verbalnoun=அது", 1
            )
            stem = surface[:-1]
            rows.update((
                f"{lexc_upper(nominal)}+comp%=என்று:{stem}ென்று #;",
                f"{lexc_upper(nominal)}+comp%=என்று+foc%=ஏ:{stem}ென்றே #;",
                f"{lexc_upper(nominal)}+trans%=ஆக:{stem}ாக #;",
                f"{lexc_upper(nominal)}+trans%=ஆக+foc%=ஏ:{stem}ாகவே #;",
                f"{lexc_upper(nominal)}+trans%=ஆக+add%=உம்:{stem}ாகவும் #;",
                f"{lexc_upper(nominal)}+trans%=ஆக+sandhik%=க்:{stem}ாகக் #;",
                f"{lexc_upper(nominal)}+trans%=ஆக+sandhic%=ச்:{stem}ாகச் #;",
                f"{lexc_upper(nominal)}+trans%=ஆக+sandhit%=த்:{stem}ாகத் #;",
                f"{lexc_upper(nominal)}+trans%=ஆக+sandhip%=ப்:{stem}ாகப் #;",
            ))
    if "+adjpart=" in tags:
        rows.update((
            f"{upper}+verbalnoun%=மை:{surface}மை #;",
            f"{upper}+verbalnoun%=மை+add%=உம்:{surface}மையும் #;",
            f"{upper}+verbalnoun%=மை+acc%=ஐ:{surface}மையை #;",
            f"{upper}+verbalnoun%=மை+acc%=ஐ+add%=உம்:{surface}மையையும் #;",
            f"{upper}+verbalnoun%=மை+inst%=ஆல்:{surface}மையால் #;",
            f"{upper}+verbalnoun%=மை+dat%=க்கு:{surface}மைக்கு #;",
            f"{upper}+verbalnoun%=மை+gen%=இன்:{surface}மையின் #;",
            f"{upper}+verbalnoun%=மை+gen%=இன்+inst%=ஆல்:{surface}மையினால் #;",
            f"{upper}+verbalnoun%=மை+loc%=இல்:{surface}மையில் #;",
        ))
        rows.update(human_participial_rows(upper, surface))
        rows.update(neuter_participial_rows(upper, surface))
    if "+inf=" in tags:
        rows.add(f"{upper}+foc%=ஏ:{surface}வே #;")
        rows.add(f"{upper}+foc%=ஏ+negpart%=இல்லை:{surface}வேயில்லை #;")
    if "+futANDadjpart=" in tags:
        rows.update((
            f"{upper}+comp%=என்று:{en_complement_surface(surface, 'என')} #;",
            f"{upper}+cond%=பட்சத்தில்:{surface}பட்சத்தில் #;",
            f"{upper}+cond%=பட்சத்தில்+foc%=ஏ:{surface}பட்சத்திலே #;",
        ))
        if surface.endswith("ம்"):
            future_stem = surface[:-1]
            rows.update((
                f"{upper}+cond%=ஆனால்:{future_stem}ானால் #;",
                f"{upper}+cond%=ஆயின்:{future_stem}ாயின் #;",
                f"{upper}+cond%=இடத்து:{future_stem}ிடத்து #;",
                f"{upper}+cond%=இடம்:{future_stem}ிடம் #;",
                f"{upper}+cond%=இடம்+loc%=இல்:{future_stem}ிடத்தில் #;",
            ))
        if participial_stem := future_participial_stem(surface):
            rows.update(human_participial_rows(upper, participial_stem))
            rows.update(neuter_participial_rows(upper, participial_stem))
    if "+adjpart=" in tags or "+futANDadjpart=" in tags:
        manner_surface = surface[:-1] + "ாறு" if surface.endswith("ம்") else surface + "மாறு"
        manner_additive = surface[:-1] + "ாறும்" if surface.endswith("ம்") else surface + "மாறும்"
        rows.update((
            f"{upper}+psp_padi%=படி:{surface}படி #;",
            f"{upper}+psp_padi%=படி+inst%=ஆல்:{surface}படியால் #;",
            f"{upper}+psp_padi%=படி+inst%=ஆல்+add%=உம்:{surface}படியாலும் #;",
            f"{upper}+psp_padi%=படி+add%=உம்:{surface}படியும் #;",
            f"{upper}+psp_padi%=படி+foc%=ஏ:{surface}படியே #;",
            f"{upper}+vpart_potu%=போது:{surface}போது #;",
            f"{upper}+vpart_potu%=போது+add%=உம்:{surface}போதும் #;",
            f"{upper}+vpart_potu%=போது+foc%=ஏ:{surface}போதே #;",
            f"{upper}+vpart_potu%=போது+foc%=தான்:{surface}போதுதான் #;",
            f"{upper}+vpart_potu%=போது+loc%=இல்+add%=உம்:{surface}போதிலும் #;",
            f"{upper}+vpart_potu%=பொழுது:{surface}பொழுது #;",
            f"{upper}+vpart_potu%=காலை:{surface}காலை #;",
            f"{upper}+vpart_potu%=வேளை:{surface}வேளை #;",
            f"{upper}+vpart_maaru%=மாறு:{manner_surface} #;",
            f"{upper}+vpart_maaru%=மாறு+add%=உம்:{manner_additive} #;",
        ))
    if "+vpart=" in tags:
        rows.add(f"{upper}+foc%=தான்:{surface}தான் #;")
    if "+con=" in tags and surface.endswith("்"):
        rows.update((
            f"{upper}+ques%=ஓ:{vowel_clitic_surface(surface, 'ோ')} #;",
            f"{upper}+foc%=ஏ:{vowel_clitic_surface(surface, 'ே')} #;",
            f"{upper}+add%=உம்:{vowel_clitic_surface(surface, 'ும்')} #;",
            f"{upper}+foc%=தான்:{surface}தான் #;",
            f"{upper}+add%=உம்+foc%=கூட:{vowel_clitic_surface(surface, 'ும்')}கூட #;",
            f"{upper}+add%=ஆவது:{vowel_clitic_surface(surface, 'ாவது')} #;",
        ))
    if "+nonfin" in tags and "+inf=" in tags:
        finite = tags.replace("+nonfin", "+fin", 1)
        finite = re.sub(r"\+inf=[^+]+", "", finite, count=1)
        rows.update((
            f"{lexc_upper(finite)}+modal+auxinf%=வேண்டு+fut%=உம்+3sgn%=∅:"
            f"{surface}வேண்டும் #;",
            f"{lexc_upper(finite)}+modal+auxinf%=வேண்டு+fut%=உம்+3sgn%=∅+ques%=ஆ:"
            f"{surface}வேண்டுமா #;",
            f"{lexc_upper(finite)}+modal+auxinf%=வேண்டு+neg%=ஆ+3sgn%=∅:"
            f"{surface}வேண்டாம் #;",
            f"{lexc_upper(finite)}+modal+auxinf%=வேண்டு+neg%=ஆ+3sgn%=∅+ques%=ஆ:"
            f"{surface}வேண்டாமா #;",
            f"{lexc_upper(finite)}+modal+auxinf%=வேண்டு+fut%=உம்+3sgn%=∅+colloq:"
            f"{surface}ணும் #;",
            f"{lexc_upper(finite)}+modal+auxinf%=வேண்டு+fut%=உம்+3sgn%=∅+colloq+comp%=என்று:"
            f"{surface}ணும்னு #;",
            f"{lexc_upper(finite)}+modal+auxinf%=கூடு+fut%=உம்+3sgn%=∅:"
            f"{surface}க்கூடும் #;",
            f"{lexc_upper(finite)}+modal+auxinf%=கூடு+fut%=உம்+3sgn%=∅+comp%=என்று:"
            f"{surface}க்கூடுமென #;",
            f"{lexc_upper(finite)}+modal+auxinf%=கூடு+neg%=ஆது+3sgn%=∅:"
            f"{surface}க்கூடாது #;",
            f"{lexc_upper(finite)}+modal+auxinf%=கூடு+neg%=ஆது+3sgn%=∅+ques%=ஆ:"
            f"{surface}க்கூடாதா #;",
            f"{lexc_upper(finite)}+modal+auxinf%=முடி+neg%=ஆது+3sgn%=∅:"
            f"{surface}முடியாது #;",
            f"{lexc_upper(finite)}+modal+auxinf%=முடி+pres%=கிற்+3sgn%=அது:"
            f"{surface}முடியும் #;",
            f"{lexc_upper(tags)}+modal+auxinf%=முடி+neg%=ஆத்+adjpart%=அ:"
            f"{surface}முடியாத #;",
            f"{lexc_upper(tags)}+modal+auxinf%=கூடு+adjpart%=இய:"
            f"{surface}க்கூடிய #;",
            f"{lexc_upper(tags)}+modal+auxinf%=கூடு+adjpart%=இய+PartNoun%=அது+trans%=ஆக:"
            f"{surface}க்கூடியதாக #;",
            f"{lexc_upper(tags)}+modal+auxinf%=வேண்டு+adjpart%=இய:"
            f"{surface}வேண்டிய #;",
            f"{lexc_upper(tags)}+moodpart%=அட்டும்:{surface}ட்டும் #;",
            f"{lexc_upper(finite)}+moodpart%=ஆம்+3sgn%=∅:{surface}லாம் #;",
            f"{lexc_upper(finite)}+moodpart%=ஆம்+3sgn%=∅+foc%=ஏ:"
            f"{surface}லாமே #;",
        ))
    return tuple(sorted(rows))


def build_lexc(
    connectors: tuple[Connector, ...],
    iru_pairs: tuple[tuple[str, str], ...],
    vidu_pairs: tuple[tuple[str, str], ...],
    kol_pairs: tuple[tuple[str, str], ...],
    predicates: tuple[tuple[str, str, str], ...] = (),
    become_templates: tuple[tuple[str, str, str], ...] = (),
    existential_predicates: tuple[tuple[str, str, str], ...] = (),
    light_predicate_templates: tuple[tuple[str, str, str], ...] = (),
    locative_predicates: tuple[tuple[str, str], ...] = (),
    dative_predicates: tuple[tuple[str, str], ...] = (),
    genitive_predicates: tuple[tuple[str, str], ...] = (),
    prefixed_vaa_templates: tuple[tuple[str, str], ...] = (),
) -> tuple[str, dict[str, int]]:
    vparts = sorted(
        {(row.lemma, row.surface, row.is_passive) for row in connectors if row.form in {"vpart", "vpart_passive"}}
    )
    vparts_k = sorted(
        {(row.lemma, row.surface, row.is_passive) for row in connectors if row.form in {"vpart_k", "vpart_passive_k"}}
    )
    colloquial_vparts = sorted(
        {(row.lemma, row.surface) for row in connectors if row.form == "vpart_colloq"}
    )
    infinitives = sorted(
        {(row.lemma, row.surface, row.is_passive) for row in connectors if row.form in {"inf", "inf_passive"}}
    )
    negative_vparts = sorted(
        {(row.lemma, row.surface) for row in connectors if row.form == "vpart_neg"}
    )
    past_adjparts = sorted(
        {(row.lemma, row.surface) for row in connectors if row.form == "past_adjpart"}
    )
    negative_adjparts = sorted(
        {(row.lemma, row.surface) for row in connectors if row.form == "neg_adjpart"}
    )
    root_rows: set[str] = set()
    for tags, surface in prefixed_vaa_templates:
        root_rows.add(
            f"முன்+adv+lexlemma%=வா{lexc_upper(grammatical_tail(tags))}:"
            f"முன்{surface} #;"
        )
    ending_counts = {"u": 0, "i": 0, "y": 0}
    for lemma, surface, passive in vparts:
        kind, iru_base = connector_type(surface)
        ending_counts[kind] += 1
        voice = "Passive" if passive else ""
        head = lemma + ("+verb" if passive else "")
        passive_tag = "+passive" if passive else ""
        root_rows.add(
            f"{lemma}+verb+fin+complex{passive_tag}+aspect+aux%=விடு"
            f"+imp%=∅+2sg%=∅+colloq:{colloquial_vidu_imperative(surface, kind)} #;"
        )
        root_rows.add(f"{head}:{iru_base} AuxIru{voice}{kind.upper()};")
        root_rows.add(f"{head}:{surface} AuxVidu{voice};")
        ending_group = "I" if kind == "i" else "UY"
        root_rows.add(f"{head}:{iru_base} AuxViduColloqIdu{voice}{ending_group};")
        root_rows.add(f"{head}:{iru_base} AuxViduColloqIru{voice}{ending_group};")
        root_rows.add(f"{head}:{surface} AuxKol{voice};")
        root_rows.add(f"{head}:{surface} AuxKondiru{voice};")
        root_rows.add(f"{head}:{surface} AuxViduIru{voice};")
        root_rows.add(f"{head}:{surface} AuxVaaIru{voice};")
        root_rows.add(f"{head}:{surface} AuxKondiruIru{voice};")
        root_rows.add(f"{head}:{iru_base} AuxIruVidu{voice}{kind.upper()};")
        root_rows.add(f"{head}:{iru_base} AuxIruMaattu{voice}{kind.upper()};")
        root_rows.add(f"{head}:{iru_base} AuxIruIru{voice}{kind.upper()};")
        root_rows.add(f"{head}:{surface} DirectVpartFocus{voice}{kind.upper()};")
    for lemma, surface in colloquial_vparts:
        kind, _ = connector_type(surface)
        root_rows.add(
            f"{lemma}+verb+fin+complex+aspect+aux%=விடு+imp%=∅+2sg%=∅+colloq:"
            f"{colloquial_vidu_imperative(surface, kind)} #;"
        )
    for lemma, surface, passive in vparts_k:
        voice = "Passive" if passive else ""
        head = lemma + ("+verb" if passive else "")
        root_rows.add(f"{head}:{surface} AuxKol{voice};")
        root_rows.add(f"{head}:{surface} AuxKondiru{voice};")
    for lemma, surface, passive in infinitives:
        voice = "Passive" if passive else ""
        head = lemma + ("+verb" if passive else "")
        root_rows.add(f"{head}:{surface} AuxMaattu{voice};")
        root_rows.add(f"{head}:{surface} ColloqVendum{voice};")
        root_rows.add(f"{head}:{surface} AuxInfModal{voice};")
        root_rows.add(f"{head}:{surface} DirectInfNegative{voice};")
        root_rows.add(f"{head}:{surface} DirectProspective{voice};")
        root_rows.add(f"{head}:{surface} DirectInfProspectiveIru{voice};")
    for lemma, surface in negative_vparts:
        kind, iru_base = connector_type(surface)
        root_rows.add(f"{lemma}+verb:{iru_base} AuxIruNeg{kind.upper()};")
    for lemma, surface in past_adjparts:
        root_rows.add(f"{lemma}:{surface} DirectPastImmediate;")
    for lemma, surface in negative_adjparts:
        root_rows.add(f"{lemma}:{surface} DirectNegativeManner;")

    # The negative modal is also a complete predicate. It has no lexical
    # infinitive connector, so it must not emit LINK_INFINITIVE or an aux lemma.
    for surface, agreement in MAATTU_FORMS:
        root_rows.add(f"மாட்டு+verb+fin+sim+modal+neg{agreement}:{surface} #;")
        root_rows.add(
            f"மாட்டு+verb+fin+sim+modal+neg{agreement}+ques%=ஆ:"
            f"{question_surface(surface)} #;"
        )
        root_rows.add(
            f"மாட்டு+verb+fin+sim+modal+neg{agreement}+ques%=ஓ:"
            f"{vowel_clitic_surface(surface, 'ோ')} #;"
        )
    for surface, agreement, question in MAATTU_COLLOQUIAL_FORMS:
        root_rows.add(
            f"மாட்டு+verb+fin+sim+modal+neg{agreement}+colloq:{surface} #;"
        )
        root_rows.add(
            f"மாட்டு+verb+fin+sim+modal+neg{agreement}+colloq+ques%=ஆ:"
            f"{question} #;"
        )
    root_rows.add(
        "விடு+verb+fin+complex+aspect+aux%=விடு+imp%=∅+2sg%=∅+colloq:"
        "விட்டுடு #;"
    )

    continuations: dict[str, list[str]] = {
        "AuxIruU": [],
        "AuxIruI": [],
        "AuxIruY": [],
        "AuxIruNegU": [],
        "AuxIruNegI": [],
        "AuxIruNegY": [],
        "AuxVidu": [],
        "AuxViduColloqIduI": [],
        "AuxViduColloqIduUY": [],
        "AuxViduColloqIruI": [],
        "AuxViduColloqIruUY": [],
        "AuxKol": [],
        "AuxKondiru": [],
        "AuxViduIru": [],
        "AuxVaaIru": [],
        "AuxKondiruIru": [],
        "AuxIruViduU": [],
        "AuxIruViduI": [],
        "AuxIruViduY": [],
        "AuxIruMaattuU": [],
        "AuxIruMaattuI": [],
        "AuxIruMaattuY": [],
        "AuxIruIruU": [],
        "AuxIruIruI": [],
        "AuxIruIruY": [],
        "AuxMaattu": [],
        "AuxInfModal": [],
        "AuxInfModalPassive": [],
        "DirectInfNegative": [
            "+verb+nonfin+sim+neg%=ஆ+vpart%=மல்:ாமல் #;",
            "+verb+nonfin+sim+neg%=ஆத்+adjpart%=அ:ாத #;",
            "+verb+nonfin+sim+neg%=ஆது+vpart%=∅:ாது #;",
            "+verb+nonfin+sim+neg%=ஆ+verbalnoun%=மை:ாமை #;",
        ],
        "DirectInfNegativePassive": [
            "+nonfin+complex+passive+neg%=ஆ+vpart%=மல்:ாமல் #;",
            "+nonfin+complex+passive+neg%=ஆத்+adjpart%=அ:ாத #;",
            "+nonfin+complex+passive+neg%=ஆது+vpart%=∅:ாது #;",
            "+nonfin+complex+passive+neg%=ஆ+verbalnoun%=மை:ாமை #;",
        ],
        "DirectPastImmediate": [
            "+verb+nonfin+sim+past%=∅+adjpart%=அ+vpart_tum%=வுடன்:வுடன் #;",
            "+verb+nonfin+sim+past%=∅+adjpart%=அ+vpart_maaru%=வாறு:வாறு #;",
        ],
        "DirectNegativeManner": [
            "+verb+nonfin+sim+neg%=ஆத்+adjpart%=அ+lexlemma%=விதம்+noun+trans%=ஆக:விதமாக #;",
        ],
        "DirectProspective": [
            "+verb+fin+complex+prospective+auxinf%=உள்+pres%=∅+3sgn%=அது:வுள்ளது #;",
            "+verb+fin+complex+prospective+auxinf%=உள்+pres%=∅+3pln%=அன:வுள்ளன #;",
            "+verb+fin+complex+prospective+auxinf%=உள்+pres%=∅+3sghe%=ஆர்:வுள்ளார் #;",
            "+verb+fin+complex+prospective+auxinf%=உள்+pres%=∅+3ple%=னர்:வுள்ளனர் #;",
            "+verb+fin+complex+prospective+auxinf%=உள்+pres%=∅+3ple%=ஆர்கள்:வுள்ளார்கள் #;",
            "+verb+nonfin+complex+prospective+auxinf%=உள்+pres%=∅+adjpart%=அ:வுள்ள #;",
        ],
        "DirectProspectivePassive": [
            "+fin+complex+passive+prospective+auxinf%=உள்+pres%=∅+3sgn%=அது:வுள்ளது #;",
            "+fin+complex+passive+prospective+auxinf%=உள்+pres%=∅+3pln%=அன:வுள்ளன #;",
            "+fin+complex+passive+prospective+auxinf%=உள்+pres%=∅+3sghe%=ஆர்:வுள்ளார் #;",
            "+fin+complex+passive+prospective+auxinf%=உள்+pres%=∅+3ple%=னர்:வுள்ளனர் #;",
            "+fin+complex+passive+prospective+auxinf%=உள்+pres%=∅+3ple%=ஆர்கள்:வுள்ளார்கள் #;",
            "+nonfin+complex+passive+prospective+auxinf%=உள்+pres%=∅+adjpart%=அ:வுள்ள #;",
        ],
        "DirectInfProspectiveIru": [],
        "DirectInfProspectiveIruPassive": [],
        "ColloqVendum": [],
        "NominalBecomeAak": [],
        "NominalBecomeAa": [],
        "LocativeExistential": [],
    }
    continuations.update({
        "AuxIruPassiveU": [],
        "AuxIruPassiveI": [],
        "AuxIruPassiveY": [],
    })
    for voice in ("", "Passive"):
        for kind in ("U", "I", "Y"):
            name = f"DirectVpartFocus{voice}{kind}"
            value = "இ" if kind == "I" else "உ"
            if voice:
                continuations[name] = [
                    f"+nonfin+complex+passive+vpart%={value}+foc%=தான்:தான் #;"
                ]
            else:
                continuations[name] = [
                    f"+verb+nonfin+sim+vpart%={value}+foc%=தான்:தான் #;"
                ]
    for name in (
        "AuxVidu", "AuxKol", "AuxKondiru", "AuxMaattu", "AuxViduIru",
        "AuxVaaIru", "AuxKondiruIru",
    ):
        continuations[name + "Passive"] = []
    for name in ("AuxIruVidu", "AuxIruMaattu", "AuxIruIru"):
        for kind in ("U", "I", "Y"):
            continuations[f"{name}Passive{kind}"] = []
    for variant in ("Idu", "Iru"):
        for ending_group in ("I", "UY"):
            continuations[f"AuxViduColloq{variant}Passive{ending_group}"] = []
    continuations["ColloqVendumPassive"] = []
    for tags, surface in iru_pairs:
        for kind in ("u", "i", "y"):
            for passive in (False, True):
                voice = "Passive" if passive else ""
                upper = composed_upper(tags, "+aspect+perfect+aux=இரு", passive)
                realized = iru_suffix(surface, kind)
                continuation = continuations[f"AuxIru{voice}{kind.upper()}"]
                continuation.append(f"{lexc_upper(upper)}:{realized} #;")
                continuation.extend(outer_auxiliary_rows(upper, realized))
        for kind in ("u", "i", "y"):
            upper = composed_upper(
                tags,
                "+aspect+perfect+aux=இரு",
                False,
                connector_tags="+neg=ஆது",
            )
            realized = iru_suffix(surface, kind)
            continuation = continuations[f"AuxIruNeg{kind.upper()}"]
            continuation.append(f"{lexc_upper(upper)}:{realized} #;")
            continuation.extend(outer_auxiliary_rows(upper, realized))
            double_upper = composed_upper(
                tags, "+aspect+perfect+aux=இரு+aspect+perfect+aux=இரு", False
            )
            double_surface = iru_suffix("இருந்து", kind)[:-1] + realized
            double = continuations[f"AuxIruIru{kind.upper()}"]
            double.append(f"{lexc_upper(double_upper)}:{double_surface} #;")
            double.extend(outer_auxiliary_rows(double_upper, double_surface))
            passive_double_upper = composed_upper(
                tags, "+aspect+perfect+aux=இரு+aspect+perfect+aux=இரு", True
            )
            passive_double = continuations[f"AuxIruIruPassive{kind.upper()}"]
            passive_double.append(
                f"{lexc_upper(passive_double_upper)}:{double_surface} #;"
            )
            passive_double.extend(
                outer_auxiliary_rows(passive_double_upper, double_surface)
            )
        for passive in (False, True):
            voice = "Passive" if passive else ""
            chain_upper = composed_upper(
                tags, "+aspect+perfect+aux=கொள்+aux=இரு", passive
            )
            realized = "கொண்ட" + iru_suffix(surface, "u")
            continuation = continuations[f"AuxKondiru{voice}"]
            continuation.append(f"{lexc_upper(chain_upper)}:{realized} #;")
            continuation.extend(outer_auxiliary_rows(chain_upper, realized))
            for name, auxiliary_tags, prefix in (
                ("AuxViduIru", "+aspect+aux=விடு+aspect+perfect+aux=இரு", "விட்ட"),
                ("AuxVaaIru", "+aux=வா+aspect+perfect+aux=இரு", "வந்த"),
                ("AuxKondiruIru", "+aspect+aux=கொள்+aux=இரு+aspect+perfect+aux=இரு", "கொண்டிருந்த"),
            ):
                nested_upper = composed_upper(tags, auxiliary_tags, passive)
                nested_surface = prefix + iru_suffix(surface, "u")
                nested = continuations[name + voice]
                nested.append(f"{lexc_upper(nested_upper)}:{nested_surface} #;")
                nested.extend(outer_auxiliary_rows(nested_upper, nested_surface))
    for tags, surface in vidu_pairs:
        for passive in (False, True):
            voice = "Passive" if passive else ""
            upper = composed_upper(tags, "+aspect+aux=விடு", passive)
            continuation = continuations[f"AuxVidu{voice}"]
            continuation.append(f"{lexc_upper(upper)}:{surface} #;")
            continuation.extend(outer_auxiliary_rows(upper, surface))
            if "+fin" in tags and "+fut=" in tags and surface.startswith("விடு"):
                colloquial_upper = upper + "+colloq"
                for kind, ending_group in (("i", "I"), ("u", "UY")):
                    for variant, label in (("idu", "Idu"), ("iru", "Iru")):
                        realized = colloquial_vidu_future_suffix(surface, kind, variant)
                        name = f"AuxViduColloq{label}{voice}{ending_group}"
                        continuations[name].append(
                            f"{lexc_upper(colloquial_upper)}:{realized} #;"
                        )
                        continuations[name].extend(
                            outer_auxiliary_rows(colloquial_upper, realized)
                        )
            for kind in ("u", "i", "y"):
                chain_upper = composed_upper(
                    tags, "+aspect+perfect+aux=இரு+aspect+aux=விடு", passive
                )
                chain_surface = iru_suffix("இருந்து", kind) + surface
                chain = continuations[f"AuxIruVidu{voice}{kind.upper()}"]
                chain.append(f"{lexc_upper(chain_upper)}:{chain_surface} #;")
                chain.extend(outer_auxiliary_rows(chain_upper, chain_surface))
    for tags, surface in kol_pairs:
        for passive in (False, True):
            voice = "Passive" if passive else ""
            upper = composed_upper(tags, "+aspect+aux=கொள்", passive)
            continuation = continuations[f"AuxKol{voice}"]
            continuation.append(f"{lexc_upper(upper)}:{surface} #;")
            continuation.extend(outer_auxiliary_rows(upper, surface))
        for lemma, pos, prefix in KOL_COMPOUND_STEMS:
            upper = grammatical_tail(tags)
            root_rows.add(
                f"{lemma}+{pos}+lexlemma%=கொள்{lexc_upper(upper)}:"
                f"{prefix}{surface} #;"
            )
    base = "+verb+fin+complex+mood+neg+auxinf%=மாட்டு"
    for surface, agreement in MAATTU_FORMS:
        continuations["AuxMaattu"].append(f"{base}{agreement}:{surface} #;")
        continuations["AuxMaattu"].append(
            f"{base}{agreement}+ques%=ஆ:{question_surface(surface)} #;"
        )
        continuations["AuxMaattu"].append(
            f"{base}{agreement}+ques%=ஓ:{vowel_clitic_surface(surface, 'ோ')} #;"
        )
    for surface, agreement, question in MAATTU_COLLOQUIAL_FORMS:
        continuations["AuxMaattu"].append(
            f"{base}{agreement}+colloq:{surface} #;"
        )
        continuations["AuxMaattu"].append(
            f"{base}{agreement}+colloq+ques%=ஆ:{question} #;"
        )
    for kind in ("u", "i", "y"):
        for passive in (False, True):
            voice = "Passive" if passive else ""
            base = (
                ("+fin+complex+passive" if passive else "+verb+fin+complex")
                + "+aspect+perfect+aux%=இரு+mood+neg+auxinf%=மாட்டு"
            )
            prefix = iru_suffix("இருக்க", kind)
            target = continuations[f"AuxIruMaattu{voice}{kind.upper()}"]
            for surface, agreement in MAATTU_FORMS:
                realized = prefix + surface
                target.append(f"{base}{agreement}:{realized} #;")
                target.extend(outer_auxiliary_rows(base.replace("%=", "=") + agreement.replace("%=", "="), realized))
    continuations["AuxMaattu"].extend(
        (
            "+verb+nonfin+complex+mood+neg+auxinf%=மாட்டு+adjpart%=அ:மாட்டாத #;",
            "+verb+nonfin+complex+mood+neg+auxinf%=மாட்டு+vpart%=மல்:மாட்டாமல் #;",
            "+verb+nonfin+complex+mood+neg+auxinf%=மாட்டு+verbalnoun%=மை:மாட்டாமை #;",
        )
    )
    continuations["AuxMaattuPassive"].extend(
        row.replace("+verb+fin+complex", "+fin+complex+passive", 1)
        .replace("+verb+nonfin+complex", "+nonfin+complex+passive", 1)
        for row in continuations["AuxMaattu"]
    )
    direct_modal_rows = (
        "+verb+fin+complex+modal+auxinf%=வேண்டு+fut%=உம்+3sgn%=∅:வேண்டும் #;",
        "+verb+fin+complex+modal+auxinf%=வேண்டு+fut%=உம்+3sgn%=∅+ques%=ஆ:வேண்டுமா #;",
        "+verb+fin+complex+modal+auxinf%=வேண்டு+neg%=ஆ+3sgn%=∅:வேண்டாம் #;",
        "+verb+fin+complex+modal+auxinf%=வேண்டு+neg%=ஆ+3sgn%=∅+ques%=ஆ:வேண்டாமா #;",
        "+verb+fin+complex+modal+auxinf%=கூடு+fut%=உம்+3sgn%=∅:க்கூடும் #;",
        "+verb+fin+complex+modal+auxinf%=கூடு+neg%=ஆது+3sgn%=∅:க்கூடாது #;",
        "+verb+nonfin+complex+inf%=அ+modal+auxinf%=கூடு+adjpart%=இய:க்கூடிய #;",
        "+verb+nonfin+complex+inf%=அ+modal+auxinf%=வேண்டு+adjpart%=இய:வேண்டிய #;",
        "+verb+fin+complex+modal+auxinf%=முடி+pres%=கிற்+3sgn%=அது:முடியும் #;",
        "+verb+fin+complex+modal+auxinf%=முடி+neg%=ஆது+3sgn%=∅:முடியாது #;",
        "+verb+fin+complex+moodpart%=ஆம்+3sgn%=∅:லாம் #;",
        "+verb+fin+complex+moodpart%=ஆம்+3sgn%=∅+foc%=ஏ:லாமே #;",
    )
    root_rows.add(
        "வேண்டு+verb+nonfin+sim+modal+adjpart%=இய+PartNoun%=அது"
        "+exist+neg:வேண்டியதில்லை #;"
    )
    continuations["AuxInfModal"].extend(direct_modal_rows)
    continuations["AuxInfModalPassive"].extend(
        row.replace("+verb+", "+", 1).replace("+complex", "+complex+passive", 1)
        for row in direct_modal_rows
    )
    continuations["ColloqVendum"].append(
        "+verb+fin+complex+modal+auxinf%=வேண்டு+fut%=உம்+3sgn%=∅+colloq:ணும் #;"
    )
    continuations["ColloqVendumPassive"].append(
        "+fin+complex+passive+modal+auxinf%=வேண்டு+fut%=உம்+3sgn%=∅+colloq:ணும் #;"
    )
    for tags, surface in iru_pairs:
        active = grammatical_tail(tags).replace(
            "+complex", "+complex+prospective+auxinf=இரு", 1
        )
        continuations["DirectInfProspectiveIru"].append(
            f"{lexc_upper(active)}:வி{surface[1:]} #;"
        )
        passive = active.replace("+verb+", "+", 1).replace(
            "+complex", "+complex+passive", 1
        )
        continuations["DirectInfProspectiveIruPassive"].append(
            f"{lexc_upper(passive)}:வி{surface[1:]} #;"
        )

    for lemma, pos, translative in predicates:
        root_rows.add(f"{lemma}+{pos}:{translative} NominalBecomeAak;")
        root_rows.add(
            f"{lemma}+{pos}:{translative[:-len('ாக')]} NominalBecomeAa;"
        )
        root_rows.add(
            f"{lemma}+{pos}+trans%=ஆக+cop+adjpart%=ன:"
            f"{translative.removesuffix('ாக')}ான #;"
        )
        copular = translative.removesuffix("ாக") + "ான"
        root_rows.add(
            f"{lemma}+{pos}+trans%=ஆக+cop+adjpart%=ன+PartNoun%=அது:"
            f"{copular}து #;"
        )
    existential_rows = 0
    for lemma, pos, nominative in existential_predicates:
        if pos == "noun" and (surface := additive_translative_surface(nominative)):
            root_rows.add(f"{lemma}+noun+nom+add%=உம்+trans%=ஆக:{surface} #;")
        if pos == "noun" and (surface := additive_copular_surface(nominative)):
            root_rows.add(
                f"{lemma}+noun+nom+add%=உம்+cop+adjpart%=ஆன:{surface} #;"
            )
        for tags, predicate in (
            ("+exist+neg", "இல்லை"),
            ("+exist+neg+adjpart%=அ", "இல்லாத"),
            ("+exist+pos", "உண்டு"),
            ("+exist+pos+adjpart%=அ", "உள்ள"),
            ("+cop+neg", "அல்ல"),
        ):
            surface = joined_nominal_predicate(nominative, predicate)
            if surface is not None:
                root_rows.add(f"{lemma}+{pos}{tags}:{surface} #;")
                existential_rows += 1
                if tags == "+exist+pos+adjpart%=அ":
                    root_rows.add(
                        f"{lemma}+{pos}+exist+pos+adjpart%=அ+PartNoun%=அது"
                        f"+trans%=ஆக:{surface}தாக #;"
                    )
                    existential_rows += 1
                elif tags == "+exist+neg+adjpart%=அ":
                    root_rows.add(
                        f"{lemma}+{pos}+exist+neg+adjpart%=அ+PartNoun%=அது:"
                        f"{surface}து #;"
                    )
                    existential_rows += 1
        if pos == "noun" and (surface := privative_surface(nominative)) is not None:
            root_rows.add(f"{lemma}+noun+privative%=இன்றி:{surface} #;")
            existential_rows += 1
        if pos == "noun" and (stem := affiliation_member_stem(nominative)) is not None:
            root_rows.update(affiliation_member_rows(lemma, stem))
            existential_rows += 8
    locative_existential_rows = 0
    for lemma, locative in locative_predicates:
        joined = locative[:-1] + "ுள்ள"
        rows = (
            f"{lemma}+noun+loc+exist+pos+adjpart%=அ:{joined} #;",
            f"{lemma}+noun+loc+exist+pos+adjpart%=அ+PartNoun%=அது:{joined}து #;",
            f"{lemma}+noun+loc+exist+pos+adjpart%=அ+PartNoun%=அது+add%=உம்:{joined}தும் #;",
            f"{lemma}+noun+loc+exist+pos+adjpart%=அ+PartNoun%=அது+trans%=ஆக:{joined}தாக #;",
        )
        root_rows.update(rows)
        locative_existential_rows += len(rows)
    dative_postposition_rows = 0
    for lemma, dative in dative_predicates:
        root_rows.add(
            f"{lemma}+noun+dat+lexlemma%=ஏற்ப+pp-particle:"
            f"{dative[:-1]}ேற்ப #;"
        )
        root_rows.add(
            f"{lemma}+noun+dat+lexlemma%=உட்படு+verb+nonfin+sim+past%=ட்"
            f"+adjpart%=அ:{dative[:-1]}ுட்பட்ட #;"
        )
        dative_postposition_rows += 2
    genitive_temporal_rows = 0
    for lemma, genitive in genitive_predicates:
        root_rows.add(
            f"{lemma}+noun+gen+lexlemma%=போது+pp-particle+time:"
            f"{genitive}போது #;"
        )
        genitive_temporal_rows += 1
    predicative_particle_rows = 0
    for tags, surface in iru_pairs:
        if not surface.startswith("இ"):
            continue
        upper = grammatical_tail(tags).removeprefix("+verb")
        root_rows.add(
            f"போல்+pp-particle+lexlemma%=இரு{lexc_upper(upper)}:"
            f"போலிற்று{surface[1:]} #;"
            if surface == "இற்று"
            else f"போல்+pp-particle+lexlemma%=இரு{lexc_upper(upper)}:"
                 f"போலிரு{surface[3:]} #;"
            if surface.startswith("இரு")
            else f"போல்+pp-particle+lexlemma%=இரு{lexc_upper(upper)}:"
                 f"போல{surface} #;"
        )
        predicative_particle_rows += 1
    for auxiliary, tags, surface in light_predicate_templates:
        for lemma, stem in LIGHT_PREDICATE_STEMS[auxiliary]:
            upper = grammatical_tail(tags).removeprefix("+verb").replace(
                "+complex", f"+complex+lightaux={auxiliary}", 1
            )
            suffix = surface[1:] if auxiliary == "அடை" else "ி" + surface[1:]
            root_rows.add(
                f"{lemma}+noun{lexc_upper(upper)}:{stem}{suffix} #;"
            )
    for upper, realization, suffix in become_templates:
        continuations[
            "NominalBecomeAak" if realization == "aak" else "NominalBecomeAa"
        ].append(f"{lexc_upper(upper)}:{suffix} #;")
    for lemma, lower in LOCATIVE_EXISTENTIALS:
        root_rows.add(f"{lemma}+adv:{lower} LocativeExistential;")
    for tags, surface in iru_pairs:
        upper = grammatical_tail(tags).replace(
            "+complex", "+complex+exist", 1
        )
        realized = iru_suffix(surface, "u")
        continuations["LocativeExistential"].append(
            f"{lexc_upper(upper)}:{realized} #;"
        )
        continuations["LocativeExistential"].extend(
            outer_auxiliary_rows(upper, realized)
        )

    symbols = sorted(
        {
            match.group(0)
            for rows in (*continuations.values(), root_rows)
            for row in rows
            for match in re.finditer(r"\+[A-Za-z0-9_-]+", row)
        }
    )
    sections = ["Multichar_Symbols", " ".join(symbols), "", "LEXICON Root"]
    sections.extend(sorted(root_rows))
    sections.append("")
    for name, rows in continuations.items():
        sections.append(f"LEXICON {name}")
        sections.extend(sorted(set(rows)))
        sections.append("")
    stats = {
        "connectors": len(connectors),
        "unique_vpart_connectors": len(vparts),
        "unique_sandhi_k_vpart_connectors": len(vparts_k),
        "unique_infinitive_connectors": len(infinitives),
        "unique_past_adjectival_connectors": len(past_adjparts),
        "unique_negative_adjectival_connectors": len(negative_adjparts),
        "root_rows": len(root_rows),
        "iru_templates": len(iru_pairs),
        "vidu_templates": len(vidu_pairs),
        "kol_templates": len(kol_pairs),
        "predicate_lemmas": len(predicates),
        "nominal_existential_lemmas": len(existential_predicates),
        "nominal_existential_rows": existential_rows,
        "locative_existential_rows": locative_existential_rows,
        "dative_postposition_rows": dative_postposition_rows,
        "genitive_temporal_rows": genitive_temporal_rows,
        "predicative_particle_rows": predicative_particle_rows,
        "become_templates": len(become_templates),
        "light_predicate_templates": len(light_predicate_templates),
        "attainment_nouns": len(ATTAINMENT_NOUN_STEMS),
        "light_predicate_families": len(LIGHT_PREDICATE_STEMS),
        "kol_compound_stems": len(KOL_COMPOUND_STEMS),
        "prefixed_vaa_templates": len(prefixed_vaa_templates),
        "locative_existential_lemmas": len(LOCATIVE_EXISTENTIALS),
        **{f"vpart_{key}_ending": value for key, value in ending_counts.items()},
    }
    return "\n".join(sections) + "\n", stats


def build_upper_inventory(lexc: str) -> dict[str, object]:
    """Represent the generated upper language without expanding LexC products."""
    sections: dict[str, list[str]] = defaultdict(list)
    current: str | None = None
    for raw_line in lexc.splitlines():
        line = raw_line.strip()
        if line.startswith("LEXICON "):
            current = line.split(None, 1)[1]
            continue
        if current and line and not line.startswith("!"):
            sections[current].append(line)

    continuation_tags: dict[str, set[str]] = {}
    for name, lines in sections.items():
        if name == "Root":
            continue
        tags: set[str] = set()
        for line in lines:
            if not line.endswith(" #;") or ":" not in line:
                raise ValueError(f"unsupported generated continuation row: {line}")
            tags.add(line.split(":", 1)[0].replace("%", ""))
        continuation_tags[name] = tags

    lemma_routes: dict[str, set[tuple[str, str]]] = defaultdict(set)
    for line in sections.get("Root", ()):
        if ":" not in line or not line.endswith(";"):
            raise ValueError(f"unsupported generated root row: {line}")
        upper, lower_and_target = line.split(":", 1)
        upper = upper.replace("%", "")
        lemma, separator, root_tags = upper.partition("+")
        root_suffix = f"+{root_tags}" if separator else ""
        target = lower_and_target.rsplit(None, 1)[-1][:-1]
        if target == "#":
            lemma_routes[lemma].add((root_suffix, ""))
        elif target in continuation_tags:
            lemma_routes[lemma].add((root_suffix, target))
        else:
            raise ValueError(f"unknown generated continuation {target!r}")

    route_groups: Counter[frozenset[tuple[str, str]]] = Counter(
        frozenset(routes) for routes in lemma_routes.values()
    )
    frequencies: Counter[str] = Counter()
    for routes, lemma_count in route_groups.items():
        raw_tags: set[str] = set()
        for root_suffix, continuation in routes:
            suffixes = continuation_tags[continuation] if continuation else {""}
            raw_tags.update(
                (root_suffix + suffix).lstrip("+") for suffix in suffixes
            )
        for tags in raw_tags:
            frequencies[tags] += lemma_count

    return {
        "schema_version": "0.1.0",
        "lemmas": sorted(lemma_routes),
        "raw_tag_frequencies": [
            [tags, count] for tags, count in sorted(frequencies.items())
        ],
        "upper_analysis_count": sum(frequencies.values()),
        "route_groups": len(route_groups),
    }


def compile_fst(lexc_path: Path, fst_path: Path) -> None:
    commands = (
        f"read lexc {lexc_path.name}\n"
        f"save stack {fst_path.name}\n"
        "quit\n"
    )
    proc = subprocess.run(
        ["foma", "-q"], cwd=lexc_path.parent, input=commands, text=True, capture_output=True
    )
    if proc.returncode or not fst_path.exists():
        raise RuntimeError(proc.stderr or proc.stdout)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-root", type=Path, default=SOURCE)
    parser.add_argument("--fst-dir", type=Path, default=DEFAULT_FST_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    connectors = extract_connectors(args.source_root, args.fst_dir)
    iru = simple_auxiliary_pairs(args.source_root, args.fst_dir, "இரு")
    vidu = simple_auxiliary_pairs(args.source_root, args.fst_dir, "விடு")
    kol = simple_auxiliary_pairs(args.source_root, args.fst_dir, "கொள்")
    prefixed_vaa = prefixed_vaa_pairs(args.source_root, args.fst_dir)
    predicates = nominal_predicates(args.source_root, args.fst_dir)
    existential_predicates = nominal_existential_predicates(args.source_root, args.fst_dir)
    locative_predicates = nominal_locative_predicates(args.source_root, args.fst_dir)
    dative_predicates = nominal_dative_predicates(args.source_root, args.fst_dir)
    genitive_predicates = nominal_genitive_predicates(args.source_root, args.fst_dir)
    become = become_pairs(args.source_root, args.fst_dir)
    light_predicates = light_predicate_pairs(args.source_root, args.fst_dir)
    lexc, stats = build_lexc(
        connectors, iru, vidu, kol, predicates, become, existential_predicates,
        light_predicates,
        locative_predicates=locative_predicates,
        dative_predicates=dative_predicates,
        genitive_predicates=genitive_predicates,
        prefixed_vaa_templates=prefixed_vaa,
    )
    lexc_path = args.output_dir / "verb-auxiliary.lexc"
    fst_path = args.output_dir / "verb-auxiliary.fst"
    inventory_path = args.output_dir / "verb-auxiliary.inventory.json"
    lexc_path.write_text(lexc, encoding="utf-8")
    inventory_path.write_text(
        json.dumps(build_upper_inventory(lexc), ensure_ascii=False, separators=(",", ":"))
        + "\n",
        encoding="utf-8",
    )
    compile_fst(lexc_path, fst_path)
    stats["fst_bytes"] = fst_path.stat().st_size
    stats["inventory_bytes"] = inventory_path.stat().st_size
    stats["inventory_sha256"] = hashlib.sha256(inventory_path.read_bytes()).hexdigest()
    (args.output_dir / "summary.json").write_text(
        json.dumps(stats, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(stats, ensure_ascii=False, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
