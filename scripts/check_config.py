#!/usr/bin/env python3
"""Diff the rules data hard-coded in module/config.mjs against the scraped SRD.

config.mjs has to be plain JS the browser can load, so SRD-derived values are
transcribed into it by hand. This proves the transcription still matches
data/skills.json. Run it after every scrape.
"""
from __future__ import annotations

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srd  # noqa: E402

ROOT = srd.ROOT

SKILL_LINE = re.compile(
    r"^\s*(\w+):\s*\{\s*label:\s*\"[^\"]+\",\s*"
    r"ability:\s*(?:\"(\w+)\"|null),\s*"
    r"trainedOnly:\s*(true|false),\s*"
    r"armorCheck:\s*(true|false)"
    r"(?:,\s*specialties:\s*(true|false))?",
    re.M,
)


SIZE_LINE = re.compile(r"(\w+):\s*\{[^}]*?\bmod:\s*(-?\d+)", re.S)


def config_sizes() -> dict[str, int]:
    """The size modifier column as config.mjs states it."""
    source = open(os.path.join(ROOT, "module", "config.mjs"), encoding="utf-8").read()
    block = source[source.index("MODERN20.sizes = {"):]
    block = block[:block.index("\n};")]
    return {key: int(mod) for key, mod in SIZE_LINE.findall(block)}


def config_skills() -> dict[str, dict]:
    source = open(os.path.join(ROOT, "module", "config.mjs"), encoding="utf-8").read()
    block = source[source.index("MODERN20.skills = {"):]
    block = block[:block.index("\n};")]

    out = {}
    for match in SKILL_LINE.finditer(block):
        key, ability, trained, armor, specialties = match.groups()
        out[key] = {
            "ability": ability,
            "trainedOnly": trained == "true",
            "armorCheck": armor == "true",
            "specialties": specialties == "true",
        }
    return out


def srd_skills() -> dict[str, dict]:
    path = os.path.join(ROOT, "data", "skills.json")
    if not os.path.exists(path):
        print("data/skills.json is missing; run scripts/scrape.py first.", file=sys.stderr)
        sys.exit(2)

    return {
        entry["id"]: {
            "ability": entry["ability"],
            "trainedOnly": entry["trainedOnly"],
            "armorCheck": entry["armorCheck"],
            "specialties": entry["specialties"],
        }
        for entry in json.load(open(path, encoding="utf-8"))
    }


def main() -> int:
    config = config_skills()
    book = srd_skills()

    problems = 0

    # The size modifier column, which the sheet adds to Defense and to attack
    # rolls and the scraper subtracts to store the offset that reproduces the
    # printed total. The one time it was written out twice the copies
    # disagreed, and 183 creatures showed a Defense the book does not print —
    # so the scripts share srd.SIZE_MODIFIER and this holds config.mjs to it.
    sizes = config_sizes()
    for size in sorted(set(srd.SIZE_MODIFIER) | set(sizes)):
        want = srd.SIZE_MODIFIER.get(size)
        got = sizes.get(size)
        if want != got:
            print(f"DIFFERS  sizes.{size}.mod: config={got!r} scripts={want!r}")
            problems += 1

    for key in sorted(set(book) - set(config)):
        print(f"MISSING  config.mjs has no skill '{key}'")
        problems += 1
    for key in sorted(set(config) - set(book)):
        print(f"EXTRA    config.mjs defines '{key}', which the SRD does not")
        problems += 1

    for key in sorted(set(config) & set(book)):
        for field in ("ability", "trainedOnly", "armorCheck", "specialties"):
            want, got = book[key][field], config[key][field]
            if want != got:
                print(f"DIFFERS  {key}.{field}: config={got!r} srd={want!r}")
                problems += 1

    print(f"\n{len(config)} skills and {len(sizes)} sizes in config.mjs, "
          f"{len(book)} skills in the SRD, {problems} discrepancies")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
