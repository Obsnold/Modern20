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
    documents = []
    for entry in load_dataset("classes"):
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


OVERRIDES = os.path.join(srd.ROOT, "data", "overrides")


def load_overrides(name: str) -> dict:
    """Hand corrections merged over scraped data, keyed by entry id.

    The SRD has genuine errors in it - Alertness prints its benefit under a
    "Prerequisite" label - and no parser should be contorted to accommodate
    them. Corrections live here with a stated reason instead.
    """
    path = os.path.join(OVERRIDES, f"{name}.json")
    if not os.path.exists(path):
        return {}
    data = json.load(open(path, encoding="utf-8"))
    return {k: v for k, v in data.items() if not k.startswith("_")}


def apply_override(entry: dict, override: dict) -> dict:
    """Merge one correction, dropping the bookkeeping key."""
    merged = dict(entry)
    for key, value in override.items():
        if key != "why":
            merged[key] = value
    return merged


def load_dataset(name: str) -> list[dict]:
    """Read data/<name>.json and apply data/overrides/<name>.json."""
    path = os.path.join(srd.DATA, f"{name}.json")
    if not os.path.exists(path):
        return []
    entries = json.load(open(path, encoding="utf-8"))
    overrides = load_overrides(name)

    applied = 0
    out = []
    for entry in entries:
        override = overrides.get(entry.get("id"))
        if override:
            entry = apply_override(entry, override)
            applied += 1
        out.append(entry)

    unused = set(overrides) - {e.get("id") for e in entries}
    for key in sorted(unused):
        print(f"  ! override {name}.{key} matches no entry", file=sys.stderr)
    if applied:
        print(f"  {applied} override(s) applied to {name}")
    return out


def simple_pack(dataset, subtype, pack, img, mapper, document_class="Item", extra=None):
    """Build one pack from a scraped dataset.

    `document_class` selects the LevelDB key prefix: Foundry stores actors
    under !actors! and items under !items!, and a pack compiled with the wrong
    prefix imports as an empty compendium.
    """
    collection = "actors" if document_class == "Actor" else "items"
    documents = []
    for entry in load_dataset(dataset):
        slug = srd.slugify(entry.get("id") or entry["name"])
        doc_id = document_id(pack, slug)
        document = {
            "_id": doc_id,
            "name": entry["name"],
            "type": subtype,
            "img": img,
            "system": {
                "description": entry.get("description", ""),
                "source": "d20 Modern SRD",
                "srdUrl": entry.get("srdUrl", ""),
                **mapper(entry),
            },
            "_key": f"!{collection}!{doc_id}",
            "_slug": slug,
        }
        if extra:
            document.update(extra(entry))
        documents.append(document)
    return documents


def build_creatures() -> list[dict]:
    """Creature actors. Derived values are stored as the offset that
    reproduces the printed total, so the sheet shows what the SRD prints."""
    def system(e):
        return {
            "abilities": {k: {"value": v, "tempMod": 0, "damage": 0}
                          for k, v in e["abilities"].items()},
            "hp": {"value": e["hp"], "max": e["hp"], "temp": 0, "formula": e["hitDice"]},
            "defense": {"classBonus": 0, "naturalArmor": e["naturalArmor"],
                        "misc": e["defenseMisc"]},
            "saves": {k: {"base": v, "misc": 0} for k, v in e["saves"].items()},
            "attributes": {
                "baseAttack": e["baseAttack"],
                "size": e["size"],
                "speed": e["speed"],
                "initiative": {"misc": e["initiativeMisc"]},
                "damageReduction": 0,
                "massiveDamageThreshold": e["massiveDamageThreshold"],
                "reach": srd.to_int(e["reach"], 5) or 5,
                "space": 5,
            },
            "details": {
                "creatureType": e["creatureType"],
                "subtype": "",
                "challengeRating": e["challengeRating"],
                "hitDice": e["hitDice"],
                "advancement": e["advancement"],
                "organization": "",
                "treasure": e["possessions"],
            },
            "allegiances": [{"name": a, "strength": "none"} for a in e["allegiances"]],
            "senses": e["specialQualities"],
            "specialQualities": e["specialQualities"],
            # The SRD prints skills and feats as prose with situational notes;
            # kept verbatim rather than guessed into structured fields.
            "biography": "<p><strong>Attack:</strong> {atk}</p><p><strong>Full Attack:</strong> {full}</p>"
                         "<p><strong>Skills:</strong> {skills}</p><p><strong>Feats:</strong> {feats}</p>"
                         "<p><strong>Talents:</strong> {talents}</p>".format(
                             atk=e["attack"], full=e["fullAttack"], skills=e["skills"],
                             feats=e["feats"], talents=e["talents"]),
        }

    return simple_pack("creatures", "creature", "creatures", "icons/svg/mystery-man.svg",
                       system, document_class="Actor")


def build_spells() -> list[dict]:
    return simple_pack("spells", "spell", "spells", "icons/svg/book.svg", lambda e: {
        "level": e["level"],
        "school": e["school"],
        "subschool": e["subschool"],
        "components": e["components"],
        "castingTime": e["castingTime"],
        "range": e["range"],
        "area": e["area"],
        "target": e["target"],
        "duration": e["duration"],
        "savingThrow": e["savingThrow"],
        "spellResistance": e["spellResistance"],
        "prepared": 0,
    })


def build_feats() -> list[dict]:
    return simple_pack("feats", "feat", "feats", "icons/svg/upgrade.svg", lambda e: {
        "featType": "general",
        "prerequisites": e.get("prerequisites", []),
        "benefit": e.get("benefit", ""),
        "normal": e.get("normal", ""),
        "special": e.get("special", ""),
        "repeatable": "can be taken multiple times" in (e.get("special") or "").lower(),
    })


def build_talents() -> list[dict]:
    return simple_pack("talents", "talent", "talents", "icons/svg/statue.svg", lambda e: {
        "tree": e.get("tree", ""),
        "sourceClass": e.get("sourceClass", ""),
        "prerequisites": e.get("prerequisites", []),
    })


def build_occupations() -> list[dict]:
    return simple_pack("occupations", "occupation", "occupations", "icons/svg/village.svg", lambda e: {
        # The SRD states skills and bonus feats as a sentence offering a
        # choice, so they are kept as prose for the player to pick from
        # rather than guessed at here.
        "skillOptions": [],
        "skillsChosen": [],
        "bonusFeatOptions": [],
        "bonusFeatChosen": e.get("bonusFeat", ""),
        "wealthBonus": e.get("wealthBonus", 0),
        "reputationBonus": e.get("reputationBonus", 0),
        "prerequisites": e.get("prerequisites", []),
    })


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
                "_slug": slug,
            })

    for name, builder in (
        ("classes", build_classes),
        ("feats", build_feats),
        ("talents", build_talents),
        ("occupations", build_occupations),
        ("spells", build_spells),
        ("creatures", build_creatures),
    ):
        documents = builder()
        if documents:
            packs[name] = documents

    return packs


def write(packs: dict[str, list[dict]]) -> None:
    for pack, documents in packs.items():
        directory = os.path.join(OUT, pack)
        os.makedirs(directory, exist_ok=True)

        # Filenames come from the entry slug, not the display name: two classes
        # can have a talent of the same name, and naming by name silently
        # overwrote five of them.
        seen = {}
        for document in documents:
            slug = document.pop("_slug", None) or srd.slugify(document["name"])
            if slug in seen:
                raise SystemExit(
                    f"{pack}: slug collision on {slug!r} between "
                    f"{seen[slug]!r} and {document['name']!r} - documents would be lost"
                )
            seen[slug] = document["name"]

            with open(os.path.join(directory, f"{slug}.json"), "w", encoding="utf-8") as handle:
                json.dump(document, handle, indent=2, ensure_ascii=False)
                handle.write("\n")

        on_disk = len([f for f in os.listdir(directory) if f.endswith(".json")])
        if on_disk != len(documents):
            raise SystemExit(
                f"{pack}: built {len(documents)} documents but {on_disk} files exist"
            )
        print(f"  src/packs/{pack:12} {len(documents):4} documents")


def manifest_block(packs: dict[str, list[dict]]) -> str:
    """The system.json `packs` array for the packs that now exist."""
    labels = {
        "weapons": "Weapons", "armor": "Armor", "gear": "Equipment",
        "classes": "Classes", "feats": "Feats", "talents": "Talents",
        "occupations": "Occupations", "spells": "Spells", "creatures": "Creatures",
    }
    entries = [
        {
            "name": pack,
            "label": labels.get(pack, pack.title()),
            "path": f"packs/{pack}",
            "type": "Actor" if pack == "creatures" else "Item",
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
