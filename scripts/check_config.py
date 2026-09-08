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

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

SKILL_LINE = re.compile(
    r"^\s*(\w+):\s*\{\s*label:\s*\"[^\"]+\",\s*"
    r"ability:\s*(?:\"(\w+)\"|null),\s*"
    r"trainedOnly:\s*(true|false),\s*"
    r"armorCheck:\s*(true|false)"
    r"(?:,\s*specialties:\s*(true|false))?",
    re.M,
)


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
    srd = srd_skills()

    problems = 0

    for key in sorted(set(srd) - set(config)):
        print(f"MISSING  config.mjs has no skill '{key}'")
        problems += 1
    for key in sorted(set(config) - set(srd)):
        print(f"EXTRA    config.mjs defines '{key}', which the SRD does not")
        problems += 1

    for key in sorted(set(config) & set(srd)):
        for field in ("ability", "trainedOnly", "armorCheck", "specialties"):
            want, got = srd[key][field], config[key][field]
            if want != got:
                print(f"DIFFERS  {key}.{field}: config={got!r} srd={want!r}")
                problems += 1

    print(f"\n{len(config)} skills in config.mjs, {len(srd)} in the SRD, {problems} discrepancies")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
