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

# Packs built straight from scraped tables rather than a named dataset. Only
# these need the slug-keyed override pass; the rest go through load_dataset.
TABLE_PACKS = {"weapons", "armor", "gear"}

# Packs of actors rather than items, which decides the LevelDB key prefix and
# what kind of folder can hold them.
ACTOR_PACKS = {"creatures", "vehicles", "objects"}

# The SRD lists ammunition as a name and a purchase DC only, so its rows are
# two cells wide and were being dropped by the three-cell minimum. Routed by
# its own header rather than by page, since it shares weapons.html.
AMMUNITION_HEADER = "ammunit"

# "Bags and Boxes" are containers rather than general gear.
CONTAINER_CATEGORY = "bags and boxes"

# The pages whose purchase tables become items, and the book each belongs to.
#
# Routing is by the table's own columns rather than by the page, because one
# d20 Future page sells ranged weapons, melee weapons, ammunition, grenades,
# armor and gear in six tables. Core pages come first so that where an
# expansion reprints an item under the same name, the d20 Modern entry is the
# one that survives.
#
# Everything lands in the same weapons, armor and gear packs, the way d20
# Future's vehicles already share the vehicles pack. What tells them apart is
# the source and, for d20 Future, the progress level.
SOURCE_BOOKS = {
    "weapons.html": "d20 Modern SRD",
    "armor.html": "d20 Modern SRD",
    "general.html": "d20 Modern SRD",
    "lifestyle.html": "d20 Modern SRD",
    "futurepl5.html": "d20 Future",
    "futurepl6.html": "d20 Future",
    "futurepl7.html": "d20 Future",
    "futurepl8.html": "d20 Future",
    "urbanweapons.html": "Urban Arcana",
    "urbanarmor.html": "Urban Arcana",
    "urbangeneral.html": "Urban Arcana",
}

# Where each kind of table lands. A page is not enough to decide this.
PACK_FOR = {
    "weapon": "weapons", "armor": "armor",
    "gear": "gear", "ammunition": "gear", "container": "gear",
}


def table_kind(header: list[str]) -> str:
    """What a purchase table sells, read off its own columns.

    The SRD is consistent about these even where it is consistent about
    nothing else: an armor table has an equipment bonus, a weapon table has
    damage and a critical, an ammunition table says so in its first cell, and
    what is left with a purchase DC is gear.
    """
    columns = column_map(header)
    # "Ammunition Type | Purchase DC Modifier": a table of adjustments to
    # something else's price, not a table of things to buy.
    if "purchase dc" not in columns:
        return ""
    if any(AMMUNITION_HEADER in c.lower() for c in header[:1]) or "ammunition" in columns:
        return "ammunition"
    if "equipment bonus" in columns:
        return "armor"
    if "damage" in columns and "critical" in columns:
        return "weapon"
    if "purchase dc" in columns:
        return "gear"
    return ""


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


# Equipment tables mark footnotes with a trailing number on the name -
# "Chain 1", "Compound bow (Archaic) 2". Creature and talent names genuinely
# end in numbers (class levels, talent tiers), so this is applied only to the
# packs built from those tables.
FOOTNOTE_MARKER = re.compile(r"\s+\d{1,2}$")


def strip_footnote(name: str) -> str:
    return FOOTNOTE_MARKER.sub("", name).strip()


def is_section_row(row: list[str]) -> bool:
    """Category banners span the table as a single populated cell."""
    filled = [c for c in row if c.strip()]
    return len(filled) <= 1


def column_map(header: list[str]) -> dict[str, int]:
    """Map normalized column names to indices, tolerating the SRD's typos."""
    aliases = {
        "magezine": "magazine",
        "ammunitino type (quantity)": "ammunition",
        "ammunition type (quantity)": "ammunition",
        "ammunition type": "ammunition",
        "nonprof. bonus": "nonproficient bonus",
        "speed (30 ft.)": "speed",
        "speed (30 ft./20 ft.)": "speed",
        # d20 Future words the same two columns differently.
        "blast radius": "burst radius",
        "reflex save": "reflex dc",
        "weapon name": "weapon",
        "weapon damage": "damage",
    }
    out = {}
    for index, name in enumerate(header):
        key = re.sub(r"\s+", " ", name.strip().lower())
        # A footnote marker rides in the header itself: "Weapon 1", "Purchase
        # DC 1". Left in place, "purchase dc 1" is a column nothing reads and
        # every item in the table is free.
        key = re.sub(r"\s+\d+$", "", key)
        key = aliases.get(key, key)
        out.setdefault(key, index)
    return out


def cell(row: list[str], columns: dict[str, int], *names: str, default: str = "") -> str:
    for name in names:
        index = columns.get(name)
        if index is not None and index < len(row):
            return row[index].strip()
    return default


ACTIVITY_DEFAULTS = json.load(
    open(os.path.join(srd.ROOT, "data", "activity_defaults.json"), encoding="utf-8")
)


def strip_notes(value):
    """Drop the _cites keys, which document the JSON rather than the item."""
    if isinstance(value, dict):
        return {k: strip_notes(v) for k, v in value.items() if not k.startswith("_")}
    if isinstance(value, list):
        return [strip_notes(v) for v in value]
    return value


def parse_feet(text: str) -> int:
    """"20 ft." becomes 20; "See text" becomes 0."""
    match = re.search(r"\d+", text or "")
    return int(match.group()) if match else 0


def weapon_activities(system: dict) -> dict:
    """The activities a weapon ships with, keyed by id.

    Written into the compendium so a pack weapon and a hand-made one are the
    same shape; module/activity-defaults.mjs is generated from the same JSON.
    """
    defaults = strip_notes(ACTIVITY_DEFAULTS.get("weapon", {}))

    # An explosive is thrown and detonates; it has no shot to fire.
    explosive = bool(system.get("reflexDC"))
    entries = list(defaults.get("explosive" if explosive else "always", []))
    # "Only weapons with the automatic rate of fire can be set on autofire."
    if not explosive and re.search(r"\bA\b", system.get("rateOfFire") or ""):
        entries.extend(defaults.get("automatic", []))

    out = {}
    for entry in entries:
        entry = json.loads(json.dumps(entry))
        key = entry.pop("id")
        if explosive:
            entry.setdefault("save", {})["dc"] = system.get("reflexDC") or 0
            entry["area"] = {"shape": "radius", "size": parse_feet(system.get("burstRadius"))}
        out[key] = entry
    return out


def casting_time_action(casting_time: str) -> str:
    """A casting time as an action type.

    Mirrors castingTimeAction in module/apps/actions.mjs. Anything longer than
    a round is not a combat action at all, and is recorded as such rather than
    rounded down to something it is not.
    """
    text = re.sub(r"[^a-z ]", "", (casting_time or "").lower())
    if "full" in text:
        return "fullRound"
    if "free" in text:
        return "free"
    if "attack action" in text or "standard" in text:
        return "attack"
    if "move action" in text:
        return "move"
    return "none"


def casting_activity(item_type: str, system: dict) -> dict:
    """The single activity a spell or psionic power ships with.

    Mirrors castingActivity in module/apps/activities.mjs: same inputs, same
    output, so a spell dragged out of the compendium and one typed in by hand
    behave identically.
    """
    key = "cast" if item_type == "spell" else "manifest"
    name = "MODERN20.Cast.Cast" if item_type == "spell" else "MODERN20.Cast.Manifest"
    rolled = system["saveAbility"] and system["saveEffect"] != "harmless"
    area = {"area": system["areaShape"]} if system["areaShape"]["size"] else {}
    # "Casting Time: Attack action" is what the spell list itself says.
    action_type = casting_time_action(system["castingTime"])

    damage = {}
    if system["damage"]:
        damage = {"damage": {
            "formula": system["damage"],
            "type": system["damageType"],
            "scaling": system["scaling"],
            # Nothing adds Strength to a fireball.
            "addAbility": False,
        }}

    if rolled:
        effect = system["saveEffect"]
        return {key: {
            "type": "save",
            "name": name,
            "actionType": action_type,
            **area,
            **damage,
            "save": {
                "ability": system["saveAbility"],
                "calculation": "caster",
                "onSuccess": effect if effect in ("half", "negate") else "none",
            },
        }}

    if system["damage"]:
        return {key: {"type": "damage", "name": name, "actionType": action_type, **area, **damage}}
    return {key: {"type": "utility", "name": name, "actionType": action_type, **area}}


def casting_fields(entry: dict) -> dict:
    """The parsed damage and saving throw a spell or power carries."""
    damage = entry.get("damage") or {}
    save = entry.get("save") or {}
    return {
        "damage": damage.get("formula", ""),
        "damageType": damage.get("type", ""),
        "scaling": damage.get("scaling") or {"per": 0, "max": 0},
        "saveAbility": save.get("save", ""),
        "saveEffect": save.get("onSuccess", ""),
        "areaShape": entry.get("areaShape") or {"shape": "", "size": 0},
    }


def build_weapon(row, columns, category, url):
    ranged = bool(cell(row, columns, "rate of fire")) or cell(row, columns, "range increment") not in ("", "-")
    weapon = {
        "category": future_weapon_category(row, columns)
        if progress_level(category, url) else weapon_category(category),
        # Footnote markers leak into the damage cell: "10d6 2", "Varies 2".
        "damage": strip_footnote(cell(row, columns, "damage", default="1d4")),
        "damageType": cell(row, columns, "damage type").lower(),
        "critical": cell(row, columns, "critical", default="20"),
        "rangeIncrement": int(re.search(r"\d+", cell(row, columns, "range increment") or "0").group()) if re.search(r"\d+", cell(row, columns, "range increment") or "") else 0,
        "rateOfFire": cell(row, columns, "rate of fire"),
        "caliber": weapon_caliber(row[0]),
        "magazine": cell(row, columns, "magazine"),
        "size": weapon_size(cell(row, columns, "size")),
        "ranged": ranged,
        # Set by override for the sap; the SRD's melee table has no column.
        "nonlethal": False,
        "weight": parse_weight(cell(row, columns, "weight")),
        "purchaseDC": int(re.search(r"\d+", cell(row, columns, "purchase dc") or "0").group()) if re.search(r"\d+", cell(row, columns, "purchase dc") or "") else 0,
        "restriction": parse_restriction(cell(row, columns, "restriction")),
        # Explosives carry a burst radius and a fixed Reflex save instead of
        # a rate of fire.
        "burstRadius": cell(row, columns, "burst radius"),
        "reflexDC": to_int(cell(row, columns, "reflex dc")) or None,
        "source": category,
        "srdUrl": url,
    }
    weapon["activities"] = weapon_activities(weapon)
    return weapon


# "Progress Level 6: Fusion Age" heads every d20 Future equipment table.
PROGRESS_LEVEL = re.compile(r"progress level\s*(\d+)", re.I)


def progress_level(category: str, page: str = "") -> int:
    """The progress level an equipment table belongs to, or none.

    A PL8 disintegrator sitting unlabelled beside a Colt is the thing that
    makes a mixed compendium unusable, so the level is kept. The vehicle and
    starship tables print it as a banner over each group; the four equipment
    pages are a progress level each and say so in the page name instead.
    """
    match = PROGRESS_LEVEL.search(category or "") or re.search(r"futurepl(\d)", page or "")
    return int(match.group(1)) if match else 0


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


# The size column is abbreviated differently in each book: "Med", "Med." and
# "Medium" all appear, and one row is a footnote marker.
WEAPON_SIZES = {
    "fine": "fine", "dim": "diminutive", "diminutive": "diminutive",
    "tiny": "tiny", "small": "small", "sm": "small",
    "med": "medium", "medium": "medium", "medium-size": "medium",
    "large": "large", "lg": "large", "huge": "huge",
    "gargantuan": "gargantuan", "colossal": "colossal",
}


def weapon_size(printed: str) -> str:
    """A weapon's printed size as one of the SRD's nine size words."""
    key = (printed or "").strip().rstrip(".").lower()
    return WEAPON_SIZES.get(key, "medium")


def future_weapon_category(row, columns) -> str:
    """A d20 Future weapon's category, which its table banner does not give.

    Those tables are headed by progress level rather than by proficiency, but
    each one carries the SRD's own footnote saying which feat it needs: "All
    weapons listed in this table require the Personal Firearms Proficiency
    feat" over the ranged tables, "the Simple Weapons Proficiency feat" over
    the melee ones. Personal Firearms covers both handguns and longarms, and
    the SRD's own core tables split those by size - handguns are Medium or
    smaller, longarms Large - so that is the split used here.

    Nothing mechanical hangs on this: the category is a label on the item
    sheet. It is worth getting close rather than filing every laser rifle
    under simple weapons, which is what the fallback would do.
    """
    if cell(row, columns, "burst radius"):
        return "explosive"
    if not cell(row, columns, "rate of fire"):
        return "simple"
    size = cell(row, columns, "size").lower()
    return "longarm" if size.startswith(("large", "huge", "gargantuan", "colossal")) else "handgun"


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


QUANTITY_IN_NAME = re.compile(r"\((\d+)\)\s*$")

# The calibre an ammunition entry names, once its box count and descriptive
# suffix are removed: ".45 caliber (50)" is ".45", "12-gauge buckshot" is
# "12-gauge". Collected during the build so weapons can be matched to it.
AMMUNITION_CALIBERS: list[str] = []


def ammunition_caliber(name: str) -> str:
    core = QUANTITY_IN_NAME.sub("", name)
    return core.replace(" caliber", "").replace(" buckshot", "").strip()


def weapon_caliber(name: str) -> str:
    """The calibre a weapon's own name states, longest match first.

    Most weapons name it - "Beretta 92F (9mm autoloader)" - so it is derived
    rather than authored. The handful that abbreviate it, or name no
    ammunition at all, are corrected in data/overrides/weapons.json.
    """
    lowered = name.lower()
    for caliber in sorted(AMMUNITION_CALIBERS, key=len, reverse=True):
        if caliber.lower() in lowered:
            return caliber
    return ""
CAPACITY_IN_NAME = re.compile(r"([\d.]+)\s*lb", re.I)


def build_ammunition(row, columns, category, url):
    """A box of rounds: a name, a count in brackets, and a purchase DC."""
    name = row[0].strip()
    match = QUANTITY_IN_NAME.search(name)
    AMMUNITION_CALIBERS.append(ammunition_caliber(name))
    return {
        "category": "Ammunition",
        "caliber": ammunition_caliber(name),
        "weight": 0.0,
        "quantity": int(match.group(1)) if match else 1,
        "purchaseDC": to_int(cell(row, columns, "purchase dc")),
        "restriction": parse_restriction(cell(row, columns, "restriction")),
        "source": category or "Ammunition",
        "srdUrl": url,
    }


def build_container(row, columns, category, url):
    """A bag or case. Capacity is stated in the name where the SRD gives one."""
    name = row[0].strip()
    match = CAPACITY_IN_NAME.search(name)
    return {
        "category": category or "Bags and Boxes",
        "capacity": float(match.group(1)) if match else 0,
        "weight": parse_weight(cell(row, columns, "weight")),
        "purchaseDC": to_int(cell(row, columns, "purchase dc")),
        "restriction": parse_restriction(cell(row, columns, "restriction")),
        "source": category,
        "srdUrl": url,
    }


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


BUILDERS = {
    "weapon": build_weapon, "armor": build_armor, "gear": build_gear,
    "ammunition": build_ammunition, "container": build_container,
}

# Item types these builders produce, where it differs from the builder name.
ITEM_TYPE = {"ammunition": "gear", "container": "container"}


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
                "casting": entry["casting"],
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
        key_embedded(collection, doc_id, document)
        documents.append(document)
    return documents


# The embedded collections the Foundry CLI stores as entries of their own, by
# the collection its parent lives in. An actor's items and a journal entry's
# pages are documents in the compiled pack, not fields of their parent.
EMBEDDED = {"actors": "items", "journal": "pages"}


def key_embedded(collection: str, doc_id: str, document: dict) -> None:
    """Give every embedded document its own id and compendium key.

    The CLI stores them keyed "!actors.items!<actor id>.<item id>" and refuses
    a document with no key: "Key cannot be null or undefined". Ours had none,
    so neither the creatures nor the rules would compile at all.

    The ids have to be unique within the parent, since the key is built from
    them, and seven creatures print the same feat or attack twice - a gargoyle
    with Weapon Finesse three times, a troglodyte that bites at two different
    bonuses. A repeat is re-derived from its own position rather than dropped:
    the SRD prints it twice because the creature has it twice.
    """
    embedded = EMBEDDED.get(collection)
    if not embedded:
        return

    used = set()
    for position, child in enumerate(document.get(embedded) or []):
        child_id = child["_id"]
        attempt = 0
        while child_id in used:
            attempt += 1
            child_id = document_id("embedded", f"{doc_id}-{position}-{attempt}-{child['name']}")
        child["_id"] = child_id
        used.add(child_id)
        child["_key"] = f"!{collection}.{embedded}!{doc_id}.{child_id}"


# A creature's own weapons: the words the SRD's per-type tables use for a
# natural attack. Anything else it is printed as wielding — a lead pipe, a Colt
# Python — is a manufactured weapon it picked up.
NATURAL_ATTACKS = {
    "slam", "bite", "claw", "gore", "tentacle", "tail slap", "touch",
    "incorporeal touch", "sting", "hoof", "talon", "wing", "tail", "pincer",
}

# The size modifier a creature takes on its attack rolls.
ATTACK_SIZE_MODIFIER = {
    "fine": 8, "diminutive": 4, "tiny": 2, "small": 1, "medium": 0,
    "large": -1, "huge": -2, "gargantuan": -4, "colossal": -8,
}


def creature_weapons(entry: dict) -> list[dict]:
    """The creature's printed attacks, as weapons it can actually roll.

    The SRD prints the attack total; the system derives one from base attack,
    an ability modifier and size. So the weapon stores the difference, exactly
    as Defense and the saves already do, and the sheet shows the printed
    number. For the same reason the damage is stored as printed and the
    activity is told not to add Strength again — "2d4+8" already includes it.
    """
    abilities = entry["abilities"]
    size_modifier = ATTACK_SIZE_MODIFIER.get(entry["size"], 0)

    def ability_modifier(score):
        return (score - 10) // 2

    items = []
    seen = set()
    for attack in entry["attacks"]:
        name = attack["name"].strip()
        if not name or not attack["damage"]:
            continue
        # The SRD prints two alternative full-attack routines for a few
        # creatures, and the same weapon appears in both.
        key = (name.lower(), attack["damage"], attack["bonus"])
        if key in seen:
            continue
        seen.add(key)

        natural = name.lower() in NATURAL_ATTACKS
        ability = abilities["dex"] if attack["ranged"] else abilities["str"]
        derived = entry["baseAttack"] + ability_modifier(ability) + size_modifier

        label = name[:1].upper() + name[1:]
        if attack["count"] > 1:
            label = f"{label} (x{attack['count']})"
        # A few creatures bite at two different bonuses, once in each of two
        # printed full-attack routines. Two weapons both called "Bite" tell a
        # GM nothing, so the later one carries the bonus that distinguishes it.
        if any(item["name"].split(" (")[0] == label.split(" (")[0] for item in items):
            label = f"{label} ({attack['bonus']:+d})"

        described = [f"<p>{entry['fullAttack'] or entry['attack']}</p>"]
        if attack["extra"]:
            described.append(f"<p><strong>Plus:</strong> {attack['extra']}</p>")
        if attack["alternateName"]:
            described.append(f"<p><strong>Also called:</strong> {attack['alternateName']}</p>")

        slug = srd.slugify(f"{entry['id']}-{name}")
        items.append({
            "_id": document_id("creature-weapons", slug),
            "name": label,
            "type": "weapon",
            "img": "icons/svg/sword.svg",
            "system": {
                "description": "".join(described),
                "source": "d20 Modern SRD",
                "srdUrl": entry["srdUrl"],
                "category": "unarmed" if natural else "simple",
                "damage": attack["damage"],
                "damageType": attack["damageType"] or ("bludgeoning" if natural else ""),
                "critical": attack["critical"],
                "ranged": attack["ranged"],
                # The offset that reproduces the printed total.
                "attackBonus": attack["bonus"] - derived,
                "size": entry["size"],
                # A creature's own weapons are always to hand.
                "equipped": True,
                "quantity": 1,
                "weight": 0,
                "purchaseDC": 0,
                "activities": creature_weapon_activities(attack),
            },
        })
    return items


def creature_weapon_activities(attack: dict) -> dict:
    """The attack activity a creature's weapon ships with.

    The same shape as any other weapon's, except that the printed damage
    already includes the creature's Strength, so the activity must not add it
    a second time.
    """
    activities = strip_notes(ACTIVITY_DEFAULTS.get("weapon", {})).get("always", [])
    out = {}
    for entry in json.loads(json.dumps(activities)):
        key = entry.pop("id")
        entry.setdefault("damage", {})["addAbility"] = False
        # A claw has no magazine to spend.
        entry.pop("consume", None)
        out[key] = entry
    return out


SKILLS = {entry["id"]: entry
          for entry in json.load(open(os.path.join(srd.DATA, "skills.json"), encoding="utf-8"))}


def creature_skills(entry: dict) -> dict:
    """The creature's printed skill totals, as the sheet's own skill entries.

    The SRD prints a total and the model derives one from ranks plus the key
    ability, so — as everywhere else here — what is stored is the difference.
    A creature has no ranks, so the whole of the printed number less its
    ability modifier goes into misc, and the sheet shows what the SRD prints.
    """
    abilities = entry["abilities"]

    def ability_modifier(skill_id):
        ability = SKILLS.get(skill_id, {}).get("ability")
        return (abilities[ability] - 10) // 2 if ability else 0

    skills = {}
    for printed in entry["skillEntries"]:
        skill = skills.setdefault(printed["skill"], {"specialties": []})
        config = SKILLS.get(printed["skill"], {})

        # A printed bonus in a trained-only skill says the creature is trained,
        # and the model will not let an untrained character roll one. So it
        # gets the single rank that says so, and the rest goes to misc — the
        # printed total is unchanged either way.
        ranks = 1 if config.get("trainedOnly") else 0
        misc = printed["bonus"] - ability_modifier(printed["skill"]) - ranks
        # A language is not rolled at all: it is one rank per language known,
        # and there is no total for a modifier to be part of.
        if config.get("ability") is None:
            misc = 0

        stored = {"ranks": ranks, "misc": misc, "classSkill": False}
        if printed["specialty"]:
            # Knowledge (arcane lore) and every language are taken per subject.
            skill["specialties"].append({"name": printed["specialty"], **stored})
        else:
            skill.update(stored)

    return skills


def creature_feats(entry: dict, feats_by_name: dict) -> list[dict]:
    """The creature's printed feats, as items.

    A name the SRD's feat list does not define — Multiattack and Flyby Attack
    are creature feats from another game's monster rules — still becomes an
    item, because the stat block prints it and a GM needs to see it; its
    description says the SRD does not define it rather than inventing one.
    """
    items = []
    for name in entry["featNames"]:
        source = feats_by_name.get(name.lower()) or feats_by_name.get(
            name.lower().replace(" weapon ", " weapons ")
        )
        slug = srd.slugify(f"{entry['id']}-{name}")
        items.append({
            "_id": document_id("creature-feats", slug),
            "name": source["name"] if source else name,
            "type": "feat",
            "img": "icons/svg/upgrade.svg",
            "system": {
                "description": "" if source else UNDEFINED_FEAT,
                "source": "d20 Modern SRD",
                "srdUrl": source["srdUrl"] if source else entry["srdUrl"],
                "featType": "general",
                "prerequisites": source.get("prerequisites", []) if source else [],
                "benefit": source.get("benefit", "") if source else "",
                "normal": source.get("normal", "") if source else "",
                "special": source.get("special", "") if source else "",
                "repeatable": False,
            },
        })
    return items


UNDEFINED_FEAT = (
    "<p>Printed in this creature's stat block, but not defined in the SRD's "
    "feat list.</p>"
)


UNDEFINED_ABILITY = (
    "<p>Printed in this creature's stat block, but described neither in the "
    "creature's own species traits nor in the SRD's Special Abilities list.</p>"
)


def paragraphs(text: str) -> str:
    """Scraped prose as HTML, one paragraph per blank-line-separated block."""
    return "".join(f"<p>{part}</p>" for part in (text or "").split("\n\n") if part.strip())


def creature_abilities(entry: dict, glossary: dict) -> list[dict]:
    """The creature's special qualities and species traits, as items.

    The SRD prints each ability twice: once in the SQ line of the stat block -
    "Cold subtype, constrict, darkvision 60 ft., improved grab" - and once as
    prose under SPECIES TRAITS. The import kept the line as one string and
    dropped the prose, so a GM running a yeti had four ability names and no
    rules for any of them.

    Each printed quality takes its rules from the creature's own traits where
    they are given, since those say what this creature does with the ability,
    and from the SRD's Special Abilities list otherwise. A trait the SQ line
    does not name - a skill bonus, an automatic language - is an item too:
    the SRD prints it, so the sheet shows it.
    """
    traits = {srd.slugify(trait["key"]): trait
              for trait in entry.get("speciesTraits", [])}
    items = []
    used = set()

    for quality in entry.get("specialQualityEntries", []):
        slug = described(quality["key"], traits, glossary)
        trait = traits.get(slug)
        defined = glossary.get(slug)
        used.add(slug)
        source = trait or defined
        # "darkvision 60 ft." is Darkvision with this creature's range: the
        # name the SRD gives the ability, and the detail the block prints. The
        # detail is only added where the name does not already carry it, since
        # a traits section that describes "Damage Reduction 15/+1" has put the
        # rating in the name itself.
        printed = quality["printed"]
        extra = printed[len(quality["key"]):].strip() \
            if printed.lower().startswith(quality["key"]) else ""
        name = source["name"] if source else title_case(printed)
        if source and extra and not name.lower().endswith(extra.lower()):
            name = f"{name} {extra}"
        items.append(ability_item(entry, name, quality["sense"], trait, defined, printed))

    for slug, trait in traits.items():
        if slug not in used:
            items.append(ability_item(entry, trait["name"], False, trait, glossary.get(slug)))
    return items


# "must succeed at a Fortitude save (DC 10 + 1/2 the bodak's Hit Dice + its
# Charisma modifier) or die instantly" — the sentence that makes an ability
# something to roll rather than something to read.
SAVE_NAMES = {"fortitude": "fort", "reflex": "ref", "will": "will"}
PRINTED_DC = re.compile(r"\bDC\s*(\d+)", re.I)
# The SRD's own formula, which most creature abilities state instead of a
# number: "DC 10 + 1/2 the creature's HD + its Charisma modifier".
DC_FORMULA = re.compile(
    r"DC\s*10\s*\+\s*(?:1/2|½|one-half)[^+]*?(?:hit dice|hd)[^+]*?\+\s*(?:its\s+)?(\w+)", re.I)
FORMULA_ABILITIES = {
    "charisma": "cha", "constitution": "con", "intelligence": "int",
    "wisdom": "wis", "strength": "str", "dexterity": "dex",
}
SAVE_DAMAGE = re.compile(r"(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+points of\s+([a-z/]+)\s+damage", re.I)
# What using it costs, where the SRD says. Longest first: "full-round action"
# must be matched before "action".
ABILITY_ACTIONS = [
    ("full-round action", "fullRound"), ("full round action", "fullRound"),
    ("free action", "free"), ("move action", "move"),
    ("attack action", "attack"), ("standard action", "attack"),
]


def ability_activity(entry: dict, printed: str, trait: dict | None) -> dict:
    """The saving throw an ability calls for, as an activity the GM can roll.

    An ability was an item with rules text and no way to use it, which is the
    difference between a compendium and a table aid. Where the SRD states a DC
    and names a save, the ability posts a card the targets roll against - the
    same card an explosive already posts.

    The DC is the one the stat block prints. Where it prints none, the SRD's
    formula in the ability's own text is worked out from this creature's Hit
    Dice and ability scores. Printed wins: eleven of the advanced and
    class-levelled blocks print a DC their own formula no longer produces, and
    the number in the stat block is what the SRD says to use.
    """
    description = (trait or {}).get("description", "")
    if not description:
        return {}

    named = re.search(r"\b(Fortitude|Reflex|Will)\b", description)
    if not named:
        return {}
    ability = SAVE_NAMES[named.group(1).lower()]

    match = PRINTED_DC.search(printed)
    dc = int(match.group(1)) if match else formula_dc(entry, description)
    if not dc:
        return {}

    # Damage is only taken from the sentence that names the save. The SRD
    # writes a creature's abilities as prose, and a paragraph that mentions
    # both a save and a die roll is not saying the save is against that roll.
    sentence = next((s for s in re.split(r"(?<=[.!?])\s+", description)
                     if named.group(1) in s), description)
    damage = SAVE_DAMAGE.search(sentence)
    action = next((action for phrase, action in ABILITY_ACTIONS
                   if phrase in description.lower()), "varies")

    activity = {
        "type": "save",
        "name": trait["name"],
        "actionType": action,
        "save": {
            "ability": ability,
            # The stat block's own number, not one derived from the caster.
            "calculation": "flat",
            "dc": dc,
            "onSuccess": "half" if re.search(r"half damage|for half", sentence, re.I) else "negate",
        },
    }
    if damage:
        activity["damage"] = {
            "formula": re.sub(r"\s+", "", damage.group(1)),
            "type": damage.group(2).split("/")[0].lower(),
            # The printed dice are the whole of it; nothing adds Strength to a
            # breath weapon.
            "addAbility": False,
        }
    return {"save": activity}


def formula_dc(entry: dict, description: str) -> int:
    """The DC the SRD's formula gives for this creature, or nothing.

    "DC 10 + 1/2 the dread tree's Hit Dice + its Charisma modifier" is a
    calculation this creature's own stat block can complete.
    """
    match = DC_FORMULA.search(description)
    ability = FORMULA_ABILITIES.get((match.group(1) if match else "").lower())
    if not ability:
        return 0
    hit_dice = int(re.match(r"\s*(\d+)", entry["hitDice"]).group(1)) \
        if re.match(r"\s*(\d+)", entry["hitDice"]) else 1
    return 10 + hit_dice // 2 + (entry["abilities"][ability] - 10) // 2

def described(key: str, traits: dict, glossary: dict) -> str:
    """The slug under which a printed quality's rules are filed.

    The SQ line and the traits section do not always agree on number: a stat
    block prints "webs" and the traits describe "Web". Singular and plural are
    tried before the ability is called undescribed.
    """
    slug = srd.slugify(key)
    singular = slug[:-1] if slug.endswith("s") else slug
    for candidate in (slug, singular, f"{slug}s"):
        if candidate in traits or candidate in glossary:
            return candidate
    return slug


def ability_item(entry: dict, name: str, sense: bool, trait: dict | None,
                 defined: dict | None, printed: str = "") -> dict:
    """One special ability item, described by the SRD or declared undescribed."""
    description = paragraphs((trait or {}).get("description", "")) \
        or paragraphs((defined or {}).get("description", ""))
    return {
        "_id": document_id("creature-abilities", srd.slugify(f"{entry['id']}-{name}")),
        "name": name,
        "type": "specialAbility",
        "img": "icons/svg/aura.svg",
        "system": {
            "description": description or UNDEFINED_ABILITY,
            "source": "d20 Modern SRD",
            # The creature's own traits are on its page; a shared definition
            # is on the Special Abilities page.
            "srdUrl": entry["srdUrl"] if trait or not defined else defined["srdUrl"],
            "abilityType": (trait or {}).get("kind") or (defined or {}).get("kind", ""),
            "sense": sense,
            # Where the SRD states a DC, the ability is something to roll
            # rather than only something to read.
            "activities": ability_activity(entry, printed, trait),
        },
    }


# Words the SRD leaves lowercase inside a name, and the units a printed range
# is measured in - "darkvision 60 ft.", which three blocks print without the
# full stop, so the abbreviation cannot be recognised by its punctuation.
MINOR_WORDS = {"a", "and", "of", "or", "the", "to", "in", "with"}
UNITS = {"ft", "feet", "in", "sq"}


def title_case(text: str) -> str:
    """A printed quality as a name, keeping what is already capitalised.

    "improved grab" becomes Improved Grab. A word the SRD already capitalised,
    a number, and an abbreviation - the "ft." of "darkvision 60 ft." - are left
    exactly as printed, and a preposition stays lowercase.
    """
    def cased(word, index):
        if any(c.isupper() or c.isdigit() or c == "." for c in word):
            return word
        if word in UNITS or (index and word in MINOR_WORDS):
            return word
        # "Low-Light Vision": the SRD capitalises both halves of a hyphenated
        # name, so this is not one word to capitalise but two.
        return "-".join(part.capitalize() for part in word.split("-"))

    return " ".join(cased(word, index) for index, word in enumerate(text.split()))


def build_creatures() -> list[dict]:
    """Creature actors. Derived values are stored as the offset that
    reproduces the printed total, so the sheet shows what the SRD prints."""
    feats_by_name = {f["name"].lower(): f for f in load_dataset("feats")}
    glossary = {srd.slugify(a["key"]): a for a in load_dataset("special_abilities")}
    # Built once per creature: the senses line is made of the same abilities,
    # under the names the SRD gives them rather than the stat block's spelling.
    abilities: dict[str, list[dict]] = {}

    def system(e):
        abilities[e["id"]] = creature_abilities(e, glossary)
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
                # "damage reduction 15/silver": the bypass was scraped from
                # the start and dropped here, so silvered rounds were stopped
                # by the werewolf they are sold for.
                "damageReduction": {
                    "value": e["damageReduction"]["value"],
                    "bypass": e["damageReduction"]["bypass"],
                },
                # Typed resistances, immunities and vulnerabilities, which
                # applyDamage now consults. Anything the SRD states without a
                # damage type - "immunities", "resistant to blows" - stays as
                # the ability text it already is.
                "resistances": e["damageTraits"]["resistances"],
                "immunities": e["damageTraits"]["immunities"],
                "vulnerabilities": e["damageTraits"]["vulnerabilities"],
                "massiveDamageThreshold": e["massiveDamageThreshold"],
                "reach": srd.to_int(e["reach"], 5) or 5,
                "space": 5,
            },
            "details": {
                "creatureType": e["creatureType"],
                "subtype": e.get("subtype", ""),
                "challengeRating": e["challengeRating"],
                "hitDice": e["hitDice"],
                "advancement": e["advancement"],
                "organization": "",
                "treasure": e["possessions"],
            },
            "skills": creature_skills(e),
            "allegiances": [{"name": a, "strength": "none"} for a in e["allegiances"]],
            # The senses line held the whole SQ line, so a creature's senses
            # read "Cold subtype, constrict, darkvision 60 ft., improved grab".
            "senses": ", ".join(item["name"] for item in abilities[e["id"]]
                                if item["system"]["sense"]),
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
                       system, document_class="Actor",
                       extra=lambda e: {
                           "items": creature_weapons(e) + creature_feats(e, feats_by_name)
                                    + abilities[e["id"]]
                       })


def spell_system(e: dict) -> dict:
    casting = casting_fields(e)
    lists = e["lists"]
    system = {
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
        "lists": lists,
        # A spell on only one list is cast from that one; a spell on both
        # defaults to arcane and the sheet can switch it.
        "tradition": "divine" if lists["arcane"] is None and lists["divine"] is not None else "arcane",
        **casting,
    }
    system["activities"] = casting_activity("spell", system)
    return system


def build_spells() -> list[dict]:
    return simple_pack("spells", "spell", "spells", "icons/svg/book.svg", spell_system)


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
        "skillChoiceCount": e.get("skillChoices", {}).get("count", 0),
        "skillOptions": e.get("skillChoices", {}).get("options", []),
        # Filled in when the player picks, on adding the occupation.
        "skillsChosen": [],
        "bonusFeatOptions": e.get("bonusFeatOptions", []),
        "bonusFeatChosen": "",
        "wealthBonus": e.get("wealthBonus", 0),
        "reputationBonus": e.get("reputationBonus", 0),
        "prerequisites": e.get("prerequisites", []),
    })


def psionic_system(e: dict) -> dict:
    system = {
        "level": e["level"],
        "display": e["display"],
        "powerPoints": e["powerPoints"],
        "castingTime": e["castingTime"],
        "range": e["range"],
        "target": e["target"],
        "duration": e["duration"],
        "savingThrow": e["savingThrow"],
        "keyAbility": e["keyAbility"] or "cha",
        **casting_fields(e),
    }
    system["activities"] = casting_activity("psiPower", system)
    return system


def build_psionics() -> list[dict]:
    return simple_pack("psionics", "psiPower", "psionics", "icons/svg/daze.svg", psionic_system)


# The four books, in the order a compendium lists them.
BOOKS = ["d20 Modern", "Urban Arcana", "d20 Future", "Menace Manual"]

# Which book an SRD page belongs to, by the prefix its file name carries.
BOOK_PREFIXES = (
    ("menace", "Menace Manual"),
    ("urban", "Urban Arcana"),
    ("arcana", "Urban Arcana"),
    ("future", "d20 Future"),
)


def book_of(url: str) -> str:
    """The book a document came from, from the page it was scraped off.

    Everything the pipeline reads is one of four books, and the mirror names
    its pages for them: menacecreat3.html is the Menace Manual, futurepl6.html
    is d20 Future. Anything else is d20 Modern's own.
    """
    page = (url or "").rsplit("/", 1)[-1]
    if not page:
        return ""
    for prefix, book in BOOK_PREFIXES:
        if page.startswith(prefix):
            return book
    return "d20 Modern"


def add_book_folders(pack: str, documents: list[dict], collection: str,
                     book_for) -> list[dict]:
    """Group a pack into a folder per book, where it holds more than one.

    A d20 Modern game should not have to read past the laser rifles to find a
    Colt. The expansions share these packs - splitting them into modules would
    break every @UUID link into them the moment one was not installed - so what
    separates them is a folder, which is a document in the pack like any other.

    A pack that holds one book is left alone: a single folder wrapping
    everything is a click, not a grouping.
    """
    kinds = {"actors": "Actor", "items": "Item", "journal": "JournalEntry"}
    present = {book_for(document) for document in documents}
    present.discard("")
    if len(present) < 2:
        return documents

    folders, ids = [], {}
    for index, book in enumerate(BOOKS):
        if book not in present:
            continue
        slug = f"folder-{srd.slugify(book)}"
        folder_id = document_id(pack, slug)
        ids[book] = folder_id
        folders.append({
            "_id": folder_id,
            "name": book,
            "type": kinds[collection],
            "sorting": "a",
            "folder": None,
            "color": None,
            "sort": index * 100000,
            "flags": {},
            "_key": f"!folders!{folder_id}",
            "_slug": slug,
        })

    for document in documents:
        document["folder"] = ids.get(book_for(document))
    return folders + documents


def build_rules() -> list[dict]:
    """The SRD's own text, as a journal compendium.

    One entry per document, one page per section, in a folder per book. The
    numbers come from the web mirror's tables; this is the prose those tables
    are printed inside, taken from the RTF releases Wizards published — each of
    which opens by declaring itself Open Game Content.

    Folders are documents in a pack like anything else, keyed !folders! rather
    than !journal!, which is how a compendium ships with its own structure.
    """
    documents = []
    entries = json.load(open(os.path.join(srd.DATA, "rules.json"), encoding="utf-8"))
    # Three titles appear in two books each - Psionics, Advanced Classes and
    # Vehicles - and two identical rows in a search result help nobody, so
    # those say which book they are from. The rest keep the SRD's own name.
    shared = {title for title in (entry["title"] for entry in entries)
              if [e["title"] for e in entries].count(title) > 1}

    for index, entry in enumerate(entries):
        name = (f"{entry['title']} ({entry['book']})"
                if entry["title"] in shared else entry["title"])
        slug = srd.slugify(entry["id"])
        doc_id = document_id("rules", slug)
        pages = []
        for position, page in enumerate(entry["pages"]):
            page_id = document_id("rules", f"{slug}-{position}")
            pages.append({
                "_id": page_id,
                "name": page["name"] or name,
                "type": "text",
                # Shown at the top of the page, as the SRD prints it.
                "title": {"show": True, "level": 1},
                "text": {"format": 1, "content": page["html"]},
                "sort": (position + 1) * 100000,
                "flags": {},
            })

        documents.append({
            "_id": doc_id,
            "name": name,
            "pages": pages,
            "sort": (index + 1) * 1000,
            "flags": {"modern20": {"book": entry["book"], "source": entry["source"]}},
            "_key": f"!journal!{doc_id}",
            "_slug": slug,
        })
        key_embedded("journal", doc_id, documents[-1])

    # The rules know their own book; everything else is told by its page.
    return add_book_folders("rules", documents, "journal",
                            lambda document: document["flags"]["modern20"]["book"])


def build_objects() -> list[dict]:
    """The objects the SRD names, as actors a GM can drop on the canvas.

    A door with 10 hit points and hardness 5 is a stat block like any other,
    and having it as an actor is what puts the hardness where applyDamage can
    subtract it. The by-size rows of the same table are not objects but the
    defaults for one, and live in module/object-data.mjs instead.
    """
    source = json.load(open(os.path.join(srd.DATA, "objects.json"), encoding="utf-8"))
    named = [entry for entry in source["objects"] if not entry["size"]]

    documents = []
    for entry in named:
        slug = srd.slugify(entry["name"])
        doc_id = document_id("objects", slug)
        documents.append({
            "_id": doc_id,
            "name": entry["name"],
            "type": "object",
            "img": "icons/svg/door-closed.svg",
            "system": {
                "size": "medium",
                "substance": "",
                "thickness": 0,
                "hardness": entry["hardness"],
                "hp": {"value": entry["hitPoints"], "max": entry["hitPoints"]},
                "breakDC": entry["breakDC"],
                "defenseMisc": 0,
                "description": "",
                "source": "d20 Modern SRD",
                "srdUrl": entry["srdUrl"],
            },
            "_key": f"!actors!{doc_id}",
            "_slug": slug,
        })
    return documents


def build_vehicles() -> list[dict]:
    """Vehicle actors. The SRD tabulates the full stat line, so this is a
    direct mapping rather than an inference."""
    return simple_pack("vehicles", "vehicle", "vehicles", "icons/svg/cave.svg", lambda e: {
        "crew": e["crew"],
        "passengers": e["passengers"],
        "cargo": e["cargo"],
        "initiative": e["initiative"],
        "maneuver": e["maneuver"],
        "topSpeed": e["topSpeed"],
        "defense": e["defense"],
        "hardness": e["hardness"],
        "hp": {"value": e["hp"], "max": e["hp"]},
        "size": e["size"],
        "purchaseDC": e["purchaseDC"],
        "restriction": parse_restriction(e["restriction"]),
    }, document_class="Actor")


def build() -> dict[str, list[dict]]:
    tables = json.load(open(os.path.join(srd.DATA, "purchase_tables.json"), encoding="utf-8"))
    # Ammunition first: weapons derive their calibre by matching against it.
    # Then d20 Modern before the expansions, so a reprinted name resolves to
    # the core entry rather than to whichever page was scraped last.
    tables.sort(key=lambda t: (
        0 if any(AMMUNITION_HEADER in c.lower() for c in t["header"][:1]) else 1,
        0 if SOURCE_BOOKS.get(t["page"]) == "d20 Modern SRD" else 1,
    ))
    packs: dict[str, list[dict]] = {}
    seen: dict[str, set[str]] = {}
    reprinted: list[str] = []

    for table in tables:
        book = SOURCE_BOOKS.get(table["page"])
        if not book:
            continue
        item_type = table_kind(table["header"])
        if not item_type:
            continue
        pack = PACK_FOR[item_type]
        columns = column_map(table["header"])
        if "purchase dc" not in columns:
            continue

        ammunition = item_type == "ammunition"

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
                # A product heading the SRD did not mark as one: a name with
                # every other cell empty, and the indented variants beneath it
                # are its options. Without this the variants lose the product
                # they belong to, and the compendium holds gear called
                # "Business", "Stealth" and "Contact".
                if not any(c.strip() for c in row[1:]):
                    parent = row[0].strip()
                    continue
                parent = ""

            label = row[0].strip()
            # Long enough to reach its own purchase DC column, rather than a
            # fixed three cells: the lifestyle tables are two columns wide -
            # a name and a DC - and every housing and service in them was
            # being dropped by a guard written for the equipment tables.
            if not label or len(row) <= columns["purchase dc"]:
                continue
            # A variant is only meaningful qualified by its product.
            name = f"{parent} ({label})" if kind == "variant" and parent else label
            name = strip_footnote(name)

            # Bags and boxes are containers, wherever they appear.
            builder = item_type
            if category.strip().lower() == CONTAINER_CATEGORY:
                builder = "container"

            slug = srd.slugify(name)
            bucket = seen.setdefault(pack, set())
            if slug in bucket:
                # An expansion reprinting a core item, which the sort above
                # already resolved in the core's favour. Reported rather than
                # dropped in silence, since a name clash between two different
                # items would look exactly the same from here.
                reprinted.append(f"{pack}/{slug} ({book})")
                continue
            bucket.add(slug)

            packs.setdefault(pack, []).append({
                "_id": document_id(pack, slug),
                "name": name,
                "type": ITEM_TYPE.get(builder, builder),
                "img": "icons/svg/item-bag.svg",
                "system": {
                    "description": "",
                    "quantity": 1,
                    "equipped": False,
                    **BUILDERS[builder](row, columns, category, table["srdUrl"]),
                    # Which book it is from, and - for d20 Future - which
                    # progress level, since the packs are shared.
                    "source": book,
                    "progressLevel": progress_level(category, table["page"]),
                },
                "_key": f"!items!{document_id(pack, slug)}",
                "_slug": slug,
            })

    if reprinted:
        print(f"  {len(reprinted)} reprinted name(s) kept from d20 Modern: "
              + ", ".join(reprinted[:6]) + ("..." if len(reprinted) > 6 else ""))

    for name, builder in (
        ("classes", build_classes),
        ("feats", build_feats),
        ("talents", build_talents),
        ("occupations", build_occupations),
        ("spells", build_spells),
        ("psionics", build_psionics),
        ("creatures", build_creatures),
        ("vehicles", build_vehicles),
        ("objects", build_objects),
        ("rules", build_rules),
    ):
        documents = builder()
        if documents:
            packs[name] = documents

    # Seven packs hold more than one book: the equipment three, the creatures,
    # the spells, the powers and the vehicles. Each gets a folder per book.
    for pack, documents in packs.items():
        if pack == "rules":
            continue
        collection = "actors" if pack in ACTOR_PACKS else "items"
        packs[pack] = add_book_folders(
            pack, documents, collection,
            lambda document: book_of(document["system"].get("srdUrl", "")))

    return packs


def apply_pack_overrides(packs: dict[str, list[dict]]) -> None:
    """Apply data/overrides/<pack>.json to packs built from the SRD's tables.

    The dataset packs go through load_dataset, but the equipment packs are
    built straight from scraped tables, so they need the same correction layer
    reaching them here - the melee table has no reach column, for instance.
    """
    for pack, documents in packs.items():
        if pack not in TABLE_PACKS:
            continue
        overrides = load_overrides(pack)
        if not overrides:
            continue

        by_slug = {srd.slugify(d["name"]): d for d in documents}
        applied = 0
        for slug, override in overrides.items():
            document = by_slug.get(slug)
            if not document:
                print(f"  ! override {pack}.{slug} matches no item", file=sys.stderr)
                continue
            for key, value in override.items():
                if key != "why":
                    document["system"][key] = value
            applied += 1
        if applied:
            print(f"  {applied} override(s) applied to {pack}")


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

        # An entry the scrape no longer produces - a fragment that turned out
        # not to be a real feat - must go, or it stays in the compendium
        # forever and trips the count check below.
        for stale in os.listdir(directory):
            if stale.endswith(".json") and stale[:-5] not in seen:
                os.remove(os.path.join(directory, stale))
                print(f"  - removed stale {pack}/{stale}")

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
        "psionics": "Psionic Powers", "vehicles": "Vehicles",
    }
    entries = [
        {
            "name": pack,
            "label": labels.get(pack, pack.title()),
            "path": f"packs/{pack}",
            "type": "Actor" if pack in ACTOR_PACKS
            else "JournalEntry" if pack == "rules" else "Item",
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

    apply_pack_overrides(packs)

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
