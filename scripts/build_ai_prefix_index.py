#!/usr/bin/env python3
"""Build the compact browser Bloom filter used for FST-aware AI prefix search."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import unicodedata
from pathlib import Path

MAGIC = b"SMAIPF02"
DEFAULT_BITS = 1 << 27  # 16 MiB
DEFAULT_HASHES = 5
DEFAULT_WORD_BITS = 1 << 26  # 8 MiB
DEFAULT_WORD_HASHES = 5
FNV_OFFSET = 2166136261
FNV_PRIME = 16777619


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def tamil_letter_count(word: str) -> int:
    return sum(unicodedata.category(character) not in {"Mc", "Mn"} for character in word)


def add_hashes(
    bits: bytearray,
    bit_count: int,
    hash_count: int,
    first: int,
    second: int,
) -> None:
    second |= 1
    for index in range(hash_count):
        bit = (first + index * second) % bit_count
        bits[bit >> 3] |= 1 << (bit & 7)


def hash_pair(text: str) -> tuple[int, int]:
    first = FNV_OFFSET
    second = FNV_OFFSET ^ 0x9E3779B9
    for byte in text.encode("utf-8"):
        first = ((first ^ byte) * FNV_PRIME) & 0xFFFFFFFF
        second = ((second ^ byte) * FNV_PRIME) & 0xFFFFFFFF
    return first, second


def tamil_strings(value):
    if isinstance(value, str):
        if value and all("\u0B80" <= character <= "\u0BFF" for character in value):
            yield unicodedata.normalize("NFC", value)
    elif isinstance(value, list):
        for item in value:
            yield from tamil_strings(item)
    elif isinstance(value, dict):
        for key, item in value.items():
            yield from tamil_strings(key)
            yield from tamil_strings(item)


def add_word(
    bits: bytearray,
    bit_count: int,
    hash_count: int,
    word: str,
) -> int:
    if not word or not 2 <= tamil_letter_count(word) <= 15:
        return 0
    first = FNV_OFFSET
    second = FNV_OFFSET ^ 0x9E3779B9
    clusters: list[str] = []
    inserted = 0
    for character in word:
        if clusters and unicodedata.category(character) not in {"Mc", "Mn"}:
            for byte in "".join(clusters).encode("utf-8"):
                first = ((first ^ byte) * FNV_PRIME) & 0xFFFFFFFF
                second = ((second ^ byte) * FNV_PRIME) & 0xFFFFFFFF
            add_hashes(bits, bit_count, hash_count, first, second)
            inserted += 1
            clusters.clear()
        clusters.append(character)
    if clusters:
        for byte in "".join(clusters).encode("utf-8"):
            first = ((first ^ byte) * FNV_PRIME) & 0xFFFFFFFF
            second = ((second ^ byte) * FNV_PRIME) & 0xFFFFFFFF
        add_hashes(bits, bit_count, hash_count, first, second)
        inserted += 1
    return inserted


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "forms",
        nargs="?",
        type=Path,
        default=Path("static-word-list/fst_generated_forms.txt"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("public/tamil_ai_prefixes.bloom"),
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=Path("public/tamil_ai_prefixes.manifest.json"),
    )
    parser.add_argument("--bits", type=int, default=DEFAULT_BITS)
    parser.add_argument("--hashes", type=int, default=DEFAULT_HASHES)
    parser.add_argument("--word-bits", type=int, default=DEFAULT_WORD_BITS)
    parser.add_argument("--word-hashes", type=int, default=DEFAULT_WORD_HASHES)
    parser.add_argument(
        "--fixture-dir",
        type=Path,
        default=Path("fst/tests/fixtures"),
        help="Add Tamil strings from release regression JSON as guaranteed searchable prefixes.",
    )
    args = parser.parse_args()

    if args.bits <= 0 or args.bits % 8 or args.word_bits <= 0 or args.word_bits % 8:
        raise SystemExit("--bits and --word-bits must be positive multiples of 8")
    if not 1 <= args.hashes <= 255 or not 1 <= args.word_hashes <= 255:
        raise SystemExit("--hashes and --word-hashes must be between 1 and 255")
    if not args.forms.exists():
        raise SystemExit(f"Missing generated forms: {args.forms}")

    bits = bytearray(args.bits // 8)
    word_bits = bytearray(args.word_bits // 8)
    accepted_words = 0
    inserted_prefixes = 0
    with args.forms.open(encoding="utf-8") as handle:
        for raw_line in handle:
            word = unicodedata.normalize("NFC", raw_line.strip())
            if not word or not 2 <= tamil_letter_count(word) <= 15:
                continue
            accepted_words += 1
            inserted_prefixes += add_word(bits, args.bits, args.hashes, word)
            first, second = hash_pair(word)
            add_hashes(word_bits, args.word_bits, args.word_hashes, first, second)

    fixture_words: set[str] = set()
    fixture_hashes: dict[str, str] = {}
    if args.fixture_dir.exists():
        for fixture in sorted(args.fixture_dir.glob("*.json")):
            try:
                payload = json.loads(fixture.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                continue
            fixture_hashes[str(fixture)] = sha256(fixture)
            fixture_words.update(tamil_strings(payload))
    for word in fixture_words:
        inserted_prefixes += add_word(bits, args.bits, args.hashes, word)
        first, second = hash_pair(word)
        add_hashes(word_bits, args.word_bits, args.word_hashes, first, second)

    popcounts = tuple(bin(value).count("1") for value in range(256))
    set_bits = sum(popcounts[byte] for byte in bits)
    occupancy = set_bits / args.bits
    estimated_unique = (
        -args.bits / args.hashes * math.log(max(1e-12, 1 - occupancy))
        if occupancy < 1
        else float("inf")
    )
    false_positive_rate = occupancy ** args.hashes
    word_set_bits = sum(popcounts[byte] for byte in word_bits)
    word_occupancy = word_set_bits / args.word_bits
    word_false_positive_rate = word_occupancy ** args.word_hashes

    args.output.parent.mkdir(parents=True, exist_ok=True)
    header = MAGIC + struct.pack(
        "<IB3xIB3x",
        args.bits,
        args.hashes,
        args.word_bits,
        args.word_hashes,
    )
    args.output.write_bytes(header + bits + word_bits)

    report = {
        "format": MAGIC.decode("ascii"),
        "source": str(args.forms),
        "output": str(args.output),
        "artifact_sha256": sha256(args.output),
        "source_sha256": sha256(args.forms),
        "morphology_lock_sha256": sha256(Path("morphology.lock.json")),
        "fixture_sha256": fixture_hashes,
        "accepted_words": accepted_words,
        "inserted_prefixes": inserted_prefixes,
        "fixture_words": len(fixture_words),
        "estimated_unique_prefixes": round(estimated_unique),
        "bit_count": args.bits,
        "hash_count": args.hashes,
        "occupancy": round(occupancy, 6),
        "estimated_false_positive_rate": round(false_positive_rate, 8),
        "word_bit_count": args.word_bits,
        "word_hash_count": args.word_hashes,
        "word_occupancy": round(word_occupancy, 6),
        "estimated_word_false_positive_rate": round(word_false_positive_rate, 8),
        "size_bytes": args.output.stat().st_size,
    }
    args.manifest.write_text(
        json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
