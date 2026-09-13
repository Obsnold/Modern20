#!/usr/bin/env python3
"""Generate the figures the in-world self-test checks against.

    python3 tools/gen_selftest.py            # write module/selftest-data.mjs
    python3 tools/gen_selftest.py --check    # fail if it is out of date

Everything in here is read out of `src/packs` and `data/`, never written by
hand. A test whose expected values are typed in by the person writing it
proves that they can add up; one whose expected values come from the book the
system was built from proves that the system still says what the book says.

What it collects:

  - how many documents each compendium holds, so an empty or half-packed one
    is visible from inside the world. The Random Tables compendium was empty on
    the live host for as long as it existed, because the deploy never packed
    it, and nothing that reads this repository could see that.
  - one class, with the row its progression table gives at third level: the
    numbers a character sheet has to derive from it.
  - creatures across the size range, with the Defense and the token size the
    SRD prints for each. 183 of them showed a Defense the book does not print
    until recently, and the only reason anybody found out was reading a sheet.
  - one weapon's printed damage, and the rules page every pack points into.
  - the cover the setup screen shows and the background the example scene
    draws on, which are named in the manifest and in a Scene rather than on a
    document, and so are the two images nothing else here would fetch
  - every image path the packs use, so a world can say whether the artwork is
    actually being served — which took three rounds of changing artwork nobody
    could see to discover was worth asking.
"""
from __future__ import annotations

import argparse
import collections
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srd  # noqa: E402

PACKS = os.path.join(srd.ROOT, "src", "packs")
OUT = os.path.join(srd.ROOT, "module", "selftest-data.mjs")

# The class the sheet arithmetic is checked against, and the level to check it
# at: third is the first level where the Strong hero's saves and Defense have
# all moved off zero, so a row of zeroes cannot pass by accident.
CLASS_SLUG = "strong-hero"
CLASS_LEVEL = 3

# One creature per size that has one, largest first: the size modifier bug was
# worth eight points on a Colossal creature and nothing at all on a Medium one,
# so a test that only looked at Medium would have seen nothing.
CREATURE_SIZES = ("colossal", "gargantuan", "huge", "large",
                  "medium", "small", "tiny", "diminutive", "fine")

WEAPON_SLUG = "colt-python-1-357-revolver"

DOCUMENT_CLASS = {"!items!": "Item", "!actors!": "Actor",
                  "!journal!": "JournalEntry", "!tables!": "RollTable"}


def documents(pack: str) -> list[dict]:
    out = []
    for path in sorted(glob.glob(os.path.join(PACKS, pack, "*.json"))):
        with open(path, encoding="utf-8") as handle:
            document = json.load(handle)
        if not document.get("_key", "").startswith("!folders!"):
            out.append(document)
    return out


def uuid_of(pack: str, document: dict) -> str:
    key = document.get("_key", "")
    kind = DOCUMENT_CLASS.get(f"!{key.split('!')[1]}!" if "!" in key else "")
    return f"Compendium.modern20.{pack}.{kind}.{document['_id']}"


def find(pack: str, slug: str) -> dict:
    path = os.path.join(PACKS, pack, f"{slug}.json")
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def counts() -> dict[str, int]:
    """How many documents each pack holds, folders excluded."""
    with open(os.path.join(srd.ROOT, "system.json"), encoding="utf-8") as handle:
        declared = [pack["name"] for pack in json.load(handle)["packs"]]
    return {pack: len(documents(pack)) for pack in declared}


def class_row() -> dict:
    """The class item, and what a sheet must derive from it at CLASS_LEVEL."""
    document = find("classes", CLASS_SLUG)
    row = next(entry for entry in document["system"]["progression"]
               if entry["level"] == CLASS_LEVEL)
    return {
        "uuid": uuid_of("classes", document),
        "name": document["name"],
        "levels": CLASS_LEVEL,
        "keyAbility": document["system"]["keyAbility"],
        "row": {key: row[key] for key in
                ("baseAttack", "fort", "ref", "will", "defense", "reputation")},
    }


def creatures() -> list[dict]:
    """One creature per size, with the figures the stat block prints."""
    with open(os.path.join(srd.DATA, "creatures.json"), encoding="utf-8") as handle:
        printed = {entry["name"]: entry for entry in json.load(handle)}

    by_size: dict[str, dict] = {}
    for document in documents("creatures"):
        book = printed.get(document["name"])
        if not book or book.get("defenseTotal") is None:
            continue
        size = document["system"]["attributes"]["size"]
        if size in by_size:
            continue
        token = document.get("prototypeToken") or {}
        by_size[size] = {
            "uuid": uuid_of("creatures", document),
            "name": document["name"],
            "size": size,
            # What the book prints, which is what the sheet has to show.
            "defense": book["defenseTotal"],
            "squares": token.get("width"),
            "art": (token.get("texture") or {}).get("src"),
        }
    return [by_size[size] for size in CREATURE_SIZES if size in by_size]


def weapon() -> dict:
    document = find("weapons", WEAPON_SLUG)
    system = document["system"]
    return {
        "uuid": uuid_of("weapons", document),
        "name": document["name"],
        "damage": system.get("damage"),
        "critical": system.get("critical"),
        "rulesPage": system.get("rulesPage"),
    }


def pregens() -> list[dict]:
    """The ready-made characters, with what their sheets must come to.

    The first thing anybody opens, and the one place a rules mistake reaches a
    table without anybody having built anything: hit points, Wealth and the
    class level are all derived by gen_pregens.py from the SRD, so a sheet
    showing something else means the model and the generator disagree.
    """
    out = []
    for document in documents("pregens"):
        system = document["system"]
        classes = [item for item in document["items"] if item["type"] == "class"]
        first = classes[0] if classes else {"name": "", "system": {"levels": 0}}
        level = sum(item["system"]["levels"] for item in classes)

        # The row the class table gives at that level, which is the whole of
        # what a class item contributes to a sheet. Taken from the class
        # document rather than asserted as "more than nothing": the Smart and
        # Charismatic heroes are printed with a base attack and a Defense bonus
        # of zero at 1st level, so "more than nothing" failed two characters
        # that were perfectly correct.
        row = next((entry for entry in first["system"].get("progression") or []
                    if entry["level"] == level), None)
        # A class skill the character actually bought, so the class's skill
        # list reaching the sheet is checked even where its numbers are zero.
        bought = next((key for key, skill in system["skills"].items()
                       if skill["ranks"] > 0), "")

        out.append({
            "uuid": uuid_of("pregens", document),
            "name": document["name"],
            "hp": system["hp"]["max"],
            "wealth": system["wealth"]["bonus"],
            "items": len(document["items"]),
            "className": first["name"],
            "level": level,
            "row": {key: row[key] for key in
                    ("baseAttack", "fort", "ref", "will", "defense", "reputation")}
            if row else None,
            "classSkill": bought,
        })
    return out


def images() -> list[str]:
    """Every distinct image path the packs name, tokens included."""
    found: set[str] = set()
    for path in glob.glob(os.path.join(PACKS, "*", "*.json")):
        with open(path, encoding="utf-8") as handle:
            document = json.load(handle)
        if document.get("_key", "").startswith("!folders!"):
            continue
        stack = [document]
        while stack:
            entry = stack.pop()
            if entry.get("img"):
                found.add(entry["img"])
            token = (entry.get("prototypeToken") or {}).get("texture") or {}
            if token.get("src"):
                found.add(token["src"])
            # A scene's background is the largest image this system serves and
            # the one whose absence is a black canvas rather than a blank frame.
            background = (entry.get("background") or {}).get("src")
            if background:
                found.add(background)
            stack.extend(entry.get("items") or [])
    with open(os.path.join(srd.ROOT, "system.json"), encoding="utf-8") as handle:
        for entry in json.load(handle).get("media") or []:
            for field in ("url", "thumbnail"):
                if entry.get(field, "").startswith("systems/modern20/"):
                    found.add(entry[field])
    return sorted(found)


def rules_pages() -> list[dict]:
    """One rules link per pack, so every pack's citations are exercised."""
    out = []
    for pack in sorted(os.listdir(PACKS)):
        if pack in ("rules", "tables"):
            continue
        for document in documents(pack):
            page = (document.get("system") or {}).get("rulesPage")
            if page:
                out.append({"pack": pack, "name": document["name"], "uuid": page})
                break
    return out


def render() -> str:
    data = {
        "packs": counts(),
        "class": class_row(),
        "creatures": creatures(),
        "weapon": weapon(),
        "pregens": pregens(),
        "rulesPages": rules_pages(),
        "images": images(),
    }
    body = json.dumps(data, indent=2, ensure_ascii=False)
    return f'''/**
 * What the in-world self-test expects to find, generated from src/packs.
 *
 * Do not edit: `python3 tools/gen_selftest.py` writes this file, and
 * `check_selftest.py` fails if it has drifted from the packs. Every figure
 * here is the book's, by way of the import — a test that checks the system
 * against numbers somebody typed proves only that they can add up.
 */

export const EXPECTED = {body};
'''


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="fail if the generated file is out of date")
    arguments = parser.parse_args()

    rendered = render()
    if arguments.check:
        current = open(OUT, encoding="utf-8").read() if os.path.exists(OUT) else ""
        if current != rendered:
            print("FAIL  module/selftest-data.mjs is out of date — "
                  "run python3 tools/gen_selftest.py")
            return 1
        print("module/selftest-data.mjs matches src/packs")
        return 0

    with open(OUT, "w", encoding="utf-8") as handle:
        handle.write(rendered)

    data = json.loads(rendered[rendered.index("{"):rendered.rindex("}") + 1])
    print(f"module/selftest-data.mjs written: {len(data['packs'])} pack counts, "
          f"{len(data['creatures'])} creatures, {len(data['pregens'])} characters, "
          f"{len(data['rulesPages'])} rules links, {len(data['images'])} images")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
