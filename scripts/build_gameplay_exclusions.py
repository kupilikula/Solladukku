#!/usr/bin/env python3
"""Build the Scrabble proper-name exclusion list from reviewed entity snapshots."""

from __future__ import annotations

import argparse
import json
import unicodedata
from pathlib import Path

VOWEL_V_ENDINGS = tuple("ாுூொோௌ") + ("ஆ", "உ", "ஊ", "ஒ", "ஓ", "ஔ")
VOWEL_Y_ENDINGS = tuple("ிீெேை") + ("இ", "ஈ", "எ", "ஏ", "ஐ")


def infer_declension(surface: str) -> str:
    final = surface.rsplit(" ", 1)[-1]
    if final.endswith("ம்"):
        return "m_final"
    if final.endswith(VOWEL_V_ENDINGS):
        return "vowel_v"
    if final.endswith(VOWEL_Y_ENDINGS):
        return "vowel_y"
    if final.endswith("்"):
        return "consonant"
    return "indeclinable"


def inflect(surface: str, declension: str) -> set[str]:
    resolved = infer_declension(surface) if declension == "auto" else declension
    prefix, separator, final = surface.rpartition(" ")
    if not separator:
        final = surface
    if resolved == "indeclinable":
        forms = [final]
    elif resolved == "vowel_v":
        forms = [final, final + "வை", final + "வுக்கு", final + "வின்", final + "வால்", final + "வில்", final + "விலிருந்து", final + "வுடன்"]
    elif resolved == "vowel_y":
        forms = [final, final + "யை", final + "க்கு", final + "யின்", final + "யால்", final + "யில்", final + "யிலிருந்து", final + "யுடன்"]
    elif resolved == "m_final":
        stem = final.removesuffix("ம்")
        forms = [final, stem + "த்தை", stem + "த்துக்கு", stem + "த்தின்", stem + "த்தால்", stem + "த்தில்", stem + "த்திலிருந்து", stem + "த்துடன்"]
    elif resolved == "u_drop":
        stem = final.removesuffix("ு")
        forms = [final, stem + "ை", stem + "ுக்கு", stem + "ின்", stem + "ால்", stem + "ில்", stem + "ிலிருந்து", stem + "ுடன்"]
    elif resolved in {"du_geminate", "ru_geminate"}:
        ending, strengthened = ("டு", "ட்ட") if resolved == "du_geminate" else ("று", "ற்ற")
        stem = final.removesuffix(ending) + strengthened
        forms = [final, stem + "ை", stem + "ுக்கு", stem + "ின்", stem + "ால்", stem + "ில்", stem + "ிலிருந்து", stem + "ுடன்"]
    elif resolved in {"t_geminate", "k_geminate"}:
        ending, strengthened = ("த்", "த்த") if resolved == "t_geminate" else ("க்", "க்க")
        stem = final.removesuffix(ending) + strengthened
        forms = [final, stem + "ை", stem + "ுக்கு", stem + "ின்", stem + "ால்", stem + "ில்", stem + "ிலிருந்து", stem + "ுடன்"]
    elif resolved == "consonant":
        stem = final.removesuffix("்")
        forms = [final, stem + "ை", stem + "ுக்கு", stem + "ின்", stem + "ால்", stem + "ில்", stem + "ிலிருந்து", stem + "ுடன்"]
    else:
        raise ValueError(f"Unsupported declension {resolved!r} for {surface!r}")
    if prefix:
        forms = [f"{prefix} {form}" for form in forms]
    return {unicodedata.normalize("NFC", form) for form in forms}


def reviewed_surfaces(paths: list[Path]) -> tuple[set[str], int]:
    surfaces: set[str] = set()
    reviewed = 0
    for path in paths:
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                if not line.strip() or line.lstrip().startswith("#"):
                    continue
                row = json.loads(line)
                if row.get("review_status") != "reviewed":
                    continue
                reviewed += 1
                blocked = {unicodedata.normalize("NFC", item) for item in row.get("blocked_surfaces", [])}
                name_forms = [{"surface": row["lemma"], "declension": row.get("declension", "auto")}, *row.get("aliases", [])]
                for form in name_forms:
                    for surface in inflect(form["surface"], form.get("declension", "auto")):
                        if " " not in surface and surface not in blocked:
                            surfaces.add(surface)
    return surfaces, reviewed


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sources", nargs="+", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    surfaces, reviewed = reviewed_surfaces(args.sources)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(
        "# Generated from reviewed entity snapshots; do not edit by hand.\n"
        + "\n".join(sorted(surfaces))
        + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {len(surfaces):,} single-word forms from {reviewed:,} reviewed entities to {args.output}")


if __name__ == "__main__":
    main()
