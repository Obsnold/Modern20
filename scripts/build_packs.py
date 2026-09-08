#!/usr/bin/env python3
"""Turn scraped SRD tables into Foundry compendium source documents.

    python3 scripts/scrape.py        # writes data/*.json
    python3 scripts/build_packs.py   # writes src/packs/<pack>/<slug>.json

The JSON written here is pack *source*. Foundry itself reads LevelDB, so
compile it with the Foundry CLI (Node) before shipping:

    npm install -g @foundryvtt/foundryvtt-cli
    fvtt package pack -n weapons --in src/packs/weapons --out packs

Re-running is safe: document ids are derived from the pack and slug, so a
rebuild updates documents in place instead of duplicating them.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srd  # noqa: E402

OUT = os.path.join(srd.ROOT, "src", "packs")

RESTRICTIONS = {
    "": "none", "-": "none", "—": "none",
    "lic": "lic", "res": "res", "mil": "mil", "ill": "ill",
}

# Which scraped table feeds which pack, keyed by source page.
SOURCES = {
    "weapons.html": ("weapons", "weapon"),
    "armor.html": ("armor", "armor"),
    "general.html": ("gear", "gear"),
    "lifestyle.html": ("gear", "gear"),
}


def document_id(pack: str, slug: str) -> str:
    """A stable 16-character Foundry id, so rebuilds update rather than duplicate."""
    digest = hashlib.sha1(f"{pack}/{slug}".encode()).hexdigest()
    alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    value = int(digest, 16)
    out = []
    for _ in range(16):
        value, index = divmod(value, len(alphabet))
        out.append(alphabet[index])
    return "".join(out)


def parse_restriction(cell: str) -> str:
    """'Lic (+1)' -> 'lic'; '-' -> 'none'."""
    token = re.split(r"[\s(]", (cell or "").strip().lower())[0]
    return RESTRICTIONS.get(token, "none")


def parse_weight(cell: str) -> float:
    """'3 lb.' -> 3.0; '1/2 lb.' -> 0.5; '-' -> 0."""
    text = (cell or "").strip()
    fraction = re.match(r"(\d+)\s*/\s*(\d+)", text)
    if fraction:
        return round(int(fraction.group(1)) / int(fraction.group(2)), 3)
    match = re.search(r"\d+(?:\.\d+)?", text)
    return float(match.group()) if match else 0.0


def is_section_row(row: list[str]) -> bool:
    """Category banners span the table as a single populated cell."""
    filled = [c for c in row if c.strip()]
    return len(filled) <= 1


def column_map(header: list[str]) -> dict[str, int]:
    """Map normalized column names to indices, tolerating the SRD's typos."""
    aliases = {
        "magezine": "magazine",
        "ammunitino type (quantity)": "ammunition",
        "nonprof. bonus": "nonproficient bonus",
        "speed (30 ft.)": "speed",
    }
    out = {}
    for index, name in enumerate(header):
        key = re.sub(r"\s+", " ", name.strip().lower())
        key = aliases.get(key, key)
        out.setdefault(key, index)
    return out


def cell(row: list[str], columns: dict[str, int], *names: str, default: str = "") -> str:
    for name in names:
        index = columns.get(name)
        if index is not None and index < len(row):
            return row[index].strip()
    return default


def build_weapon(row, columns, category, url):
    ranged = bool(cell(row, columns, "rate of fire")) or cell(row, columns, "range increment") not in ("", "-")
    return {
        "category": weapon_category(category),
        "damage": cell(row, columns, "damage", default="1d4"),
        "damageType": cell(row, columns, "damage type").lower(),
        "critical": cell(row, columns, "critical", default="20"),
        "rangeIncrement": int(re.search(r"\d+", cell(row, columns, "range increment") or "0").group()) if re.search(r"\d+", cell(row, columns, "range increment") or "") else 0,
        "rateOfFire": cell(row, columns, "rate of fire"),
        "magazine": cell(row, columns, "magazine"),
        "size": cell(row, columns, "size").lower() or "medium",
        "ranged": ranged,
        "weight": parse_weight(cell(row, columns, "weight")),
        "purchaseDC": int(re.search(r"\d+", cell(row, columns, "purchase dc") or "0").group()) if re.search(r"\d+", cell(row, columns, "purchase dc") or "") else 0,
        "restriction": parse_restriction(cell(row, columns, "restriction")),
        "source": category,
        "srdUrl": url,
    }


def weapon_category(section: str) -> str:
    """Map an SRD table banner such as 'Handguns (requires ...)' to a category key."""
    text = (section or "").lower()
    for needles, key in (
        # "Hanguns" is the SRD's own typo in the weapon table banner.
        (("handgun", "hangun"), "handgun"),
        (("longarm", "long arm"), "longarm"),
        (("heavy weapon", "heavy machine"), "heavy"),
        (("exotic",), "exotic"),
        (("explosive", "grenade"), "explosive"),
        (("archaic",), "archaic"),
        (("simple",), "simple"),
        (("unarmed", "melee"), "unarmed"),
    ):
        if any(needle in text for needle in needles):
            return key
    return "simple"


def build_armor(row, columns, category, url):
    max_dex = cell(row, columns, "maximum dex bonus")
    max_dex_value = int(re.search(r"[-+]?\d+", max_dex).group()) if re.search(r"[-+]?\d+", max_dex) else None
    return {
        "armorType": armor_type(category),
        "equipmentBonus": to_int(cell(row, columns, "equipment bonus")),
        "maxDex": max_dex_value,
        "armorPenalty": to_int(cell(row, columns, "armor penalty")),
        "speedPenalty": cell(row, columns, "speed"),
        "proficiency": armor_type(category),
        "weight": parse_weight(cell(row, columns, "weight")),
        "purchaseDC": to_int(cell(row, columns, "purchase dc")),
        "restriction": parse_restriction(cell(row, columns, "restriction")),
        "source": category,
        "srdUrl": url,
    }


def armor_type(section: str) -> str:
    text = (section or "").lower()
    for needle in ("light", "medium", "heavy", "shield"):
        if needle in text:
            return needle
    return "light"


def build_gear(row, columns, category, url):
    return {
        "category": category or "general",
        "weight": parse_weight(cell(row, columns, "weight")),
        "purchaseDC": to_int(cell(row, columns, "purchase dc")),
        "restriction": parse_restriction(cell(row, columns, "restriction")),
        "source": category,
        "srdUrl": url,
    }


def to_int(text: str, default: int = 0) -> int:
    match = re.search(r"[-+]?\d+", text or "")
    return int(match.group()) if match else default


BUILDERS = {"weapon": build_weapon, "armor": build_armor, "gear": build_gear}


# Basic classes are keyed to an ability score; advanced classes are not.
BASIC_CLASS_ABILITY = {
    "strongHero": "str", "fastHero": "dex", "toughHero": "con",
    "smartHero": "int", "dedicatedHero": "wis", "charismaticHero": "cha",
}


def build_classes() -> list[dict]:
    """Class items, with the per-level progression the actor sums at runtime."""
    path = os.path.join(srd.DATA, "classes.json")
    if not os.path.exists(path):
        return []

    documents = []
    for entry in json.load(open(path, encoding="utf-8")):
        slug = srd.slugify(entry["name"])
        doc_id = document_id("classes", slug)
        documents.append({
            "_id": doc_id,
            "name": entry["name"],
            "type": "class",
            "img": "icons/svg/upgrade.svg",
            "system": {
                "description": "",
                "tier": entry["tier"],
                # A class item on a sheet starts at one level; the sheet's own
                # level field is what the player raises.
                "levels": 1,
                "keyAbility": BASIC_CLASS_ABILITY.get(entry["id"], ""),
                "hitDie": entry["hitDie"],
                "skillPointsPerLevel": entry["skillPointsPerLevel"],
                "classSkills": entry["classSkills"],
                "prerequisites": [entry["requirements"]] if entry.get("requirements") else [],
                "progression": entry["progression"],
                "source": "d20 Modern SRD",
                "srdUrl": entry["srdUrl"],
            },
            "_key": f"!items!{doc_id}",
        })
    return documents


def build() -> dict[str, list[dict]]:
    tables = json.load(open(os.path.join(srd.DATA, "purchase_tables.json"), encoding="utf-8"))
    packs: dict[str, list[dict]] = {}
    seen: dict[str, set[str]] = {}

    for table in tables:
        if table["page"] not in SOURCES:
            continue
        pack, item_type = SOURCES[table["page"]]
        columns = column_map(table["header"])
        if "purchase dc" not in columns:
            continue

        category = ""
        parent = ""
        kinds = table.get("kinds") or ["item"] * len(table["rows"])

        for row, kind in zip(table["rows"], kinds):
            if kind == "category":
                category = row[0].strip() or category
                parent = ""
                continue
            if kind == "parent":
                # A product whose indented variants follow, e.g. a travel case
                # sold in three capacities.
                parent = row[0].strip()
                continue
            if kind in ("blank", "header"):
                continue
            if kind == "item":
                parent = ""

            label = row[0].strip()
            if not label or len(row) < 3:
                continue
            # A variant is only meaningful qualified by its product.
            name = f"{parent} ({label})" if kind == "variant" and parent else label

            slug = srd.slugify(name)
            bucket = seen.setdefault(pack, set())
            if slug in bucket:
                continue
            bucket.add(slug)

            packs.setdefault(pack, []).append({
                "_id": document_id(pack, slug),
                "name": name,
                "type": item_type,
                "img": "icons/svg/item-bag.svg",
                "system": {
                    "description": "",
                    "quantity": 1,
                    "equipped": False,
                    **BUILDERS[item_type](row, columns, category, table["srdUrl"]),
                },
                "_key": f"!items!{document_id(pack, slug)}",
            })

    classes = build_classes()
    if classes:
        packs["classes"] = classes

    return packs


def write(packs: dict[str, list[dict]]) -> None:
    for pack, documents in packs.items():
        directory = os.path.join(OUT, pack)
        os.makedirs(directory, exist_ok=True)
        for document in documents:
            path = os.path.join(directory, f"{srd.slugify(document['name'])}.json")
            with open(path, "w", encoding="utf-8") as handle:
                json.dump(document, handle, indent=2, ensure_ascii=False)
                handle.write("\n")
        print(f"  src/packs/{pack:8} {len(documents):4} documents")


def manifest_block(packs: dict[str, list[dict]]) -> str:
    """The system.json `packs` array for the packs that now exist."""
    labels = {"weapons": "Weapons", "armor": "Armor", "gear": "Equipment", "classes": "Classes"}
    entries = [
        {
            "name": pack,
            "label": labels.get(pack, pack.title()),
            "path": f"packs/{pack}",
            "type": "Item",
            "system": "modern20",
            "ownership": {"PLAYER": "OBSERVER", "ASSISTANT": "OWNER"},
        }
        for pack in sorted(packs)
    ]
    return json.dumps(entries, indent=2)


def main() -> int:
    packs = build()
    if not packs:
        print("No packs built. Run scripts/scrape.py first.", file=sys.stderr)
        return 1

    print("Writing pack source...")
    write(packs)

    print("\nCompile these with the Foundry CLI (requires Node):")
    for pack in sorted(packs):
        print(f"  fvtt package pack -n {pack} --in src/packs/{pack} --out packs")

    print("\nThen set system.json \"packs\" to:")
    print(manifest_block(packs))
    return 0


if __name__ == "__main__":
    sys.exit(main())
