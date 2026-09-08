#!/usr/bin/env python3
"""Read the d20 Modern SRD into normalized JSON under data/.

    python3 scripts/scrape.py            # parse from .cache/, fetching what is missing
    python3 scripts/scrape.py --refresh  # re-fetch every page first

Output is committed. A schema change means re-running scripts/build_packs.py,
not re-scraping, so the site is hit once and then left alone.
"""
from __future__ import annotations

import argparse
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srd  # noqa: E402

ABILITY_KEYS = {
    "Str": "str", "Dex": "dex", "Con": "con",
    "Int": "int", "Wis": "wis", "Cha": "cha", "None": None,
}

# Skill entries in the SRD are headings, not table rows. The traits follow the
# key ability inside the parentheses, separated by a semicolon or a dash:
#   Balance (Dex; Armor Penalty)
#   Sleight of Hand (Dex - Trained Only; Armor Penalty)
SKILL_HEADING = re.compile(
    r"^([A-Z][A-Za-z/ ]{2,30}?)\s*\(\s*(Str|Dex|Con|Int|Wis|Cha|None)\s*"
    r"((?:\s*[;\-–—,]\s*(?:Trained Only|Armor Penalty))*)\s*\)\s*(.*)$"
)

# Skills taken per subject, e.g. Knowledge (streetwise).
SPECIALTY_SKILLS = {
    "Craft", "Knowledge", "Perform", "Profession",
    "Read/Write Language", "Speak Language",
}


def camel(name: str) -> str:
    parts = re.split(r"[^A-Za-z0-9]+", name)
    parts = [p for p in parts if p]
    return parts[0].lower() + "".join(p.capitalize() for p in parts[1:])


def text_lines(page_html: str) -> list[str]:
    """Flatten a page to visible text lines, one per element boundary."""
    text = html.unescape(re.sub(r"<[^>]+>", "\n", page_html))
    text = re.sub(r"[ \t\xa0]+", " ", text)
    return [line.strip() for line in text.split("\n") if line.strip()]


def scrape_skills() -> list[dict]:
    lines = text_lines(srd.fetch(srd.PAGES["skills"]))
    skills: dict[str, dict] = {}

    for line in lines:
        match = SKILL_HEADING.match(line)
        if not match:
            continue
        name, ability, in_parens, tail = match.groups()
        if name in skills:
            continue
        traits = f"{in_parens} {tail}"
        skills[name] = {
            "id": camel(name),
            "name": name,
            "ability": ABILITY_KEYS[ability],
            "trainedOnly": "Trained Only" in traits,
            "armorCheck": "Armor Penalty" in traits,
            "specialties": name in SPECIALTY_SKILLS,
            "srdUrl": srd.page_url(srd.PAGES["skills"]),
        }

    return [skills[k] for k in sorted(skills)]


ORDINAL = re.compile(r"^(\d+)(?:st|nd|rd|th)$", re.I)

# Progression column header -> the field it feeds on the class item.
PROGRESSION_COLUMNS = {
    "base attack bonus": "baseAttack",
    "fort save": "fort",
    "ref save": "ref",
    "will save": "will",
    "defense bonus": "defense",
    "reputation bonus": "reputation",
}
FEATURE_COLUMNS = ("class features", "special")


def labelled_value(lines: list[str], label: str) -> str:
    """Read a "Label: value" entry, which the SRD splits across tags.

    The label is its own line and the value follows on the next, usually
    beginning with the colon: ["Hit Die", ": 1d8"].
    """
    for index, line in enumerate(lines):
        if line.rstrip(":").strip().lower() != label.lower():
            continue
        tail = lines[index + 1] if index + 1 < len(lines) else ""
        return tail.lstrip(":").strip()
    return ""


def class_pages() -> dict[str, str]:
    """Class page -> tier, discovered from the two index pages."""
    pages = {}
    for index_page, tier in (("basicclasses.html", "basic"), ("advancedclasses.html", "advanced")):
        try:
            html_text = srd.fetch(index_page)
        except Exception:
            continue
        for name in srd.links(html_text):
            if name in srd.CHROME or name in set(srd.PAGES.values()):
                continue
            if name.startswith("appendix"):
                continue
            pages[name] = tier
    return pages


def parse_progression(table: dict) -> list[dict]:
    """Turn a class progression table into one row per class level."""
    header = [c.strip().lower() for c in table["header"]]
    index_of = {name: i for i, name in enumerate(header)}

    rows = []
    for raw in table["rows"]:
        if not raw:
            continue
        level_match = ORDINAL.match(raw[0].strip())
        if not level_match:
            continue

        row = {"level": int(level_match.group(1)), "features": []}
        for column, field in PROGRESSION_COLUMNS.items():
            position = index_of.get(column)
            row[field] = srd.to_int(raw[position]) if position is not None and position < len(raw) else 0

        for column in FEATURE_COLUMNS:
            position = index_of.get(column)
            if position is not None and position < len(raw) and raw[position].strip():
                row["features"] = [f.strip() for f in raw[position].split(",") if f.strip()]
                break

        rows.append(row)
    return rows


def scrape_classes(skills: list[dict]) -> list[dict]:
    """Basic and advanced classes, with their per-level progression."""
    # Longest first so "Read/Write Language" is matched before "Language".
    skill_names = sorted(((s["name"], s["id"]) for s in skills), key=lambda p: -len(p[0]))

    out = []
    for page, tier in sorted(class_pages().items()):
        try:
            page_html = srd.fetch(page)
        except Exception as error:
            print(f"  ! {page}: {type(error).__name__}: {error}", file=sys.stderr)
            continue

        lines = text_lines(page_html)

        # The progression table is the one with a Class Level column.
        table = next(
            (t for t in srd.annotated_tables(page_html)
             if any("class level" in c.lower() for c in t["header"])),
            None,
        )
        if not table:
            print(f"  ! {page}: no progression table found", file=sys.stderr)
            continue

        caption = next((l for l in lines if l.lower().startswith("table: the ")), "")
        name = caption[len("Table: The "):].strip() if caption else page.replace(".html", "").title()

        class_skills_text = labelled_value(lines, "Class Skills")
        class_skills = [sid for sname, sid in skill_names if sname.lower() in class_skills_text.lower()]

        out.append({
            "id": camel(name),
            "name": name,
            "tier": tier,
            "hitDie": labelled_value(lines, "Hit Die") or "1d8",
            "skillPointsPerLevel": srd.to_int(labelled_value(lines, "Skill Points at Each Additional Level"), 3),
            "classSkills": sorted(set(class_skills)),
            "requirements": labelled_value(lines, "Requirements"),
            "actionPoints": labelled_value(lines, "Action Points"),
            "progression": parse_progression(table),
            "srdUrl": srd.page_url(page),
        })

    return out


# SRD entries are written as a name line, then alternating label and value
# lines, because the source splits each label into its own tag:
#     Acrobatic / Benefit / ": The character gets a +2 bonus..."
FEAT_LABELS = {"prerequisite", "prerequisites", "benefit", "normal", "special"}
OCCUPATION_LABELS = {
    "prerequisite", "prerequisites", "skills", "bonus feat",
    "wealth bonus increase", "reputation bonus increase",
}
PREREQ_LABELS = {"prerequisite", "prerequisites"}


def is_label(line: str, labels: set[str]) -> bool:
    return line.rstrip(":").strip().lower() in labels


def is_value(line: str) -> bool:
    return line.startswith(":")


def value_of(line: str) -> str:
    return line.lstrip(":").strip()


def collect_labels(lines: list[str], start: int, end: int, labels: set[str]) -> dict[str, str]:
    """Read every label/value pair in a slice, keyed by lowercased label."""
    found = {}
    for i in range(start, min(end, len(lines) - 1)):
        if is_label(lines[i], labels) and is_value(lines[i + 1]):
            found[lines[i].rstrip(":").strip().lower()] = value_of(lines[i + 1])
    return found


def entry_starts(lines: list[str], labels: set[str], lookahead: int = 3,
                 min_gap: int = 3) -> list[int]:
    """Indices of lines that name an entry: a plain line shortly followed by a label.

    Consecutive hits are collapsed to the first. A spell is written as a name,
    then its school, then the labels - and both the name and the school sit
    within the lookahead of a label, so without this the school line wins and
    every spell ends up called "Enchantment [Mind-Affecting]". Real entries are
    always separated by at least a label and its value.
    """
    candidates = []
    for i, line in enumerate(lines):
        if is_value(line) or is_label(line, labels) or len(line) > 70:
            continue
        # SRD entry headings are noun phrases: they never end in sentence
        # punctuation, which is what distinguishes a heading from a trailing
        # line of the previous entry's description.
        if line.endswith((".", ",", ";", ":", "?", "!")):
            continue
        window = lines[i + 1: i + 1 + lookahead]
        if any(is_label(w, labels) for w in window):
            candidates.append(i)

    starts = []
    for index in candidates:
        if starts and index - starts[-1] < min_gap:
            continue
        starts.append(index)
    return starts


def scrape_feats() -> list[dict]:
    """Feats from the alphabetical listing, which carries the descriptions."""
    lines = text_lines(srd.fetch("featorder.html"))
    starts = entry_starts(lines, FEAT_LABELS, lookahead=4)

    feats = {}
    for position, start in enumerate(starts):
        end = starts[position + 1] if position + 1 < len(starts) else len(lines)
        name = lines[start]
        fields = collect_labels(lines, start + 1, end, FEAT_LABELS)
        if not (fields.keys() & FEAT_LABELS):
            continue

        prereq = fields.get("prerequisites") or fields.get("prerequisite") or ""
        feats[name] = {
            "id": camel(name),
            "name": name,
            "prerequisites": [p.strip() for p in prereq.split(",") if p.strip()],
            "benefit": fields.get("benefit", ""),
            "normal": fields.get("normal", ""),
            "special": fields.get("special", ""),
            "srdUrl": srd.page_url("featorder.html"),
        }

    return [feats[k] for k in sorted(feats)]


def scrape_occupations() -> list[dict]:
    """Starting occupations: skill choices, a bonus feat and a Wealth bump."""
    lines = text_lines(srd.fetch(srd.PAGES["occupations"]))
    starts = entry_starts(lines, OCCUPATION_LABELS, lookahead=3)

    occupations = {}
    for position, start in enumerate(starts):
        end = starts[position + 1] if position + 1 < len(starts) else len(lines)
        name = lines[start]
        fields = collect_labels(lines, start + 1, end, OCCUPATION_LABELS)
        # Every occupation states a prerequisite, even if only an age.
        if not (fields.keys() & PREREQ_LABELS):
            continue

        prereq = fields.get("prerequisites") or fields.get("prerequisite") or ""
        occupations[name] = {
            "id": camel(name),
            "name": name,
            # The line after the name is the flavour paragraph.
            "description": lines[start + 1] if start + 1 < len(lines) and not is_label(lines[start + 1], OCCUPATION_LABELS) else "",
            "prerequisites": [p.strip() for p in prereq.split(",") if p.strip()],
            "skills": fields.get("skills", ""),
            "bonusFeat": fields.get("bonus feat", ""),
            "wealthBonus": srd.to_int(fields.get("wealth bonus increase", "")),
            "reputationBonus": srd.to_int(fields.get("reputation bonus increase", "")),
            "srdUrl": srd.page_url(srd.PAGES["occupations"]),
        }

    return [occupations[k] for k in sorted(occupations)]


def scrape_talents() -> list[dict]:
    """Talents, grouped by tree, from each basic class page.

    A tree heading ends in "Talent Tree"; each talent underneath is a name line
    followed directly by its ": description".
    """
    talents = []
    for page, tier in sorted(class_pages().items()):
        if tier != "basic":
            continue
        try:
            lines = text_lines(srd.fetch(page))
        except Exception:
            continue

        caption = next((l for l in lines if l.lower().startswith("table: the ")), "")
        class_name = caption[len("Table: The "):].strip() if caption else page.replace(".html", "")

        tree = ""
        for i, line in enumerate(lines):
            if line.lower().endswith("talent tree"):
                tree = line
                continue
            if not tree or i + 1 >= len(lines):
                continue
            if is_value(line) or is_label(line, PREREQ_LABELS) or len(line) > 70:
                continue
            if not is_value(lines[i + 1]):
                continue
            # Each basic class ends its talent trees with a "Bonus Feat list"
            # heading, which is a section title rather than a talent.
            if re.match(r"bonus feat", line, re.I):
                continue

            prereq = ""
            if i + 3 < len(lines) and is_label(lines[i + 2], PREREQ_LABELS) and is_value(lines[i + 3]):
                prereq = value_of(lines[i + 3])

            talents.append({
                "id": camel(f"{class_name} {line}"),
                "name": line,
                "tree": tree,
                "sourceClass": class_name,
                "description": value_of(lines[i + 1]),
                "prerequisites": [p.strip() for p in prereq.split(",") if p.strip()],
                "srdUrl": srd.page_url(page),
            })

    return talents


SIZES = ("fine", "diminutive", "tiny", "small", "medium", "large",
         "huge", "gargantuan", "colossal")

SPELL_SCHOOLS = {
    "Abjuration", "Conjuration", "Divination", "Enchantment",
    "Evocation", "Illusion", "Necromancy", "Transmutation", "Universal",
}

SPELL_LABELS = {
    "level", "components", "casting time", "range", "area", "effect",
    "target", "targets", "duration", "saving throw", "spell resistance",
}


def parse_size_and_type(text: str) -> tuple[str, str]:
    """'Medium-size humanoid' -> ('medium', 'humanoid')."""
    lowered = text.lower()
    size = next((s for s in SIZES if lowered.startswith(s)), "medium")
    remainder = re.sub(r"^" + size + r"(-size)?\s*", "", lowered).strip()
    return size, remainder


def ability_mod(score: int) -> int:
    return (score - 10) // 2


def parse_creature_column(rows: dict[str, str], name: str, size_type: str, url: str) -> dict:
    """One column of a stat block into the fields the creature model stores.

    Printed Defense, saves and initiative are totals. The data model derives
    those from ability scores plus components, so the difference is put into
    the misc slots - the sheet then shows the number the SRD prints.
    """
    abilities = {}
    for key in ("str", "dex", "con", "int", "wis", "cha"):
        match = re.search(key + r":\s*(\d+)", rows.get("ability scores", ""), re.I)
        abilities[key] = int(match.group(1)) if match else 10

    size, creature_type = parse_size_and_type(size_type)

    hit_dice = rows.get("hd", "")
    hp_match = re.search(r"hp\s+(\d+)", hit_dice)
    hp = int(hp_match.group(1)) if hp_match else 0

    defense_text = rows.get("defense", "")
    defense_total = srd.to_int(defense_text)
    natural = 0
    natural_match = re.search(r"([-+]?\d+)\s+natural", defense_text)
    if natural_match:
        natural = int(natural_match.group(1))

    saves = {}
    for label, key in (("Fort", "fort"), ("Ref", "ref"), ("Will", "will")):
        match = re.search(label + r":?\s*([-+]?\d+)", rows.get("sv", ""))
        saves[key] = int(match.group(1)) if match else 0

    bab = srd.to_int(rows.get("bab/grap", "").split("/")[0])
    initiative = srd.to_int(rows.get("init", ""))
    speed = srd.to_int(rows.get("spd", ""), 30)

    mass = rows.get("mas", "")
    massive = int(mass) if mass.strip().isdigit() else None

    return {
        "id": camel(name),
        "name": name,
        "size": size,
        "creatureType": creature_type,
        "challengeRating": rows.get("cr", ""),
        "hitDice": hit_dice.split(";")[0].strip(),
        "hp": hp,
        "massiveDamageThreshold": massive,
        "abilities": abilities,
        "baseAttack": bab,
        "speed": speed,
        # Everything the model derives is stored as the offset that reproduces
        # the printed total, so nothing is silently wrong on the sheet.
        "initiativeMisc": initiative - ability_mod(abilities["dex"]),
        "naturalArmor": natural,
        "defenseMisc": defense_total - 10 - natural - ability_mod(abilities["dex"]),
        "defenseTotal": defense_total,
        "saves": {k: v - ability_mod(abilities[a]) for (k, a), v in
                  zip((("fort", "con"), ("ref", "dex"), ("will", "wis")), saves.values())},
        "attack": rows.get("atk", ""),
        "fullAttack": rows.get("full atk", ""),
        "reach": rows.get("fs/reach", ""),
        "specialQualities": rows.get("sq", ""),
        "allegiances": [a.strip() for a in rows.get("al", "").split(",") if a.strip()],
        "skills": rows.get("skills", ""),
        "feats": rows.get("feats", ""),
        "talents": rows.get("talents", ""),
        "possessions": rows.get("possessions", ""),
        "advancement": rows.get("advancement", ""),
        "srdUrl": url,
    }


def scrape_creatures(pages: list[str]) -> list[dict]:
    """Creature stat blocks, which the SRD lays out as label/value tables.

    Each table carries a base creature and an advanced variant side by side,
    so one table yields one creature per populated column.
    """
    creatures = {}
    for page in pages:
        try:
            page_html = srd.fetch(page)
        except Exception:
            continue

        for table in srd.annotated_tables(page_html):
            labels = [r[0].rstrip(":").strip().lower() for r in table["rows"] if r]
            if "cr" not in labels or "ability scores" not in labels:
                continue

            names = table["header"]
            size_types = table["rows"][0] if table["rows"] else []

            for column in range(1, len(names)):
                name = names[column].strip()
                if not name:
                    continue

                rows = {}
                for raw in table["rows"]:
                    if not raw or not raw[0].strip():
                        continue
                    key = raw[0].rstrip(":").strip().lower()
                    rows[key] = raw[column].strip() if column < len(raw) else ""

                size_type = size_types[column] if column < len(size_types) else "Medium-size"
                entry = parse_creature_column(rows, name, size_type, srd.page_url(page))
                # Later pages repeat a few creatures; first definition wins.
                creatures.setdefault(entry["id"], entry)

    return [creatures[k] for k in sorted(creatures)]


def scrape_spells(pages: list[str]) -> list[dict]:
    """Spells: a name, a school line, then label/value pairs."""
    spells = {}
    for page in pages:
        try:
            lines = text_lines(srd.fetch(page))
        except Exception:
            continue

        starts = entry_starts(lines, SPELL_LABELS, lookahead=3)
        for position, start in enumerate(starts):
            end = starts[position + 1] if position + 1 < len(starts) else len(lines)
            name = lines[start]
            fields = collect_labels(lines, start + 1, end, SPELL_LABELS)
            if "level" not in fields:
                continue
            # A bare school word means the real name was not captured; skip
            # rather than create a spell called "Abjuration".
            if name.split("[")[0].split("(")[0].strip() in SPELL_SCHOOLS:
                continue

            # The line directly after the name is the school, e.g.
            # "Enchantment [Mind-Affecting]".
            school_line = lines[start + 1] if start + 1 < len(lines) else ""
            if is_label(school_line, SPELL_LABELS) or is_value(school_line):
                school_line = ""

            level_text = fields.get("level", "")
            level_match = re.search(r"(\d+)", level_text)

            spells.setdefault(name, {
                "id": camel(name),
                "name": name,
                "school": school_line.split("[")[0].strip(),
                "subschool": (re.search(r"\[([^\]]+)\]", school_line).group(1)
                              if "[" in school_line else ""),
                "level": int(level_match.group(1)) if level_match else 0,
                "levelText": level_text,
                "components": [c.strip() for c in fields.get("components", "").split(",") if c.strip()],
                "castingTime": fields.get("casting time", ""),
                "range": fields.get("range", ""),
                "area": fields.get("area", "") or fields.get("effect", ""),
                "target": fields.get("target", "") or fields.get("targets", ""),
                "duration": fields.get("duration", ""),
                "savingThrow": fields.get("saving throw", ""),
                "spellResistance": fields.get("spell resistance", ""),
                "srdUrl": srd.page_url(page),
            })

    return [spells[k] for k in sorted(spells)]


PSIONIC_ABILITIES = {
    "Strength", "Dexterity", "Constitution", "Intelligence", "Wisdom", "Charisma",
}

PSIONIC_LABELS = {
    "level", "display", "manifestation time", "range", "area", "effect",
    "target", "targets", "duration", "saving throw", "power resistance",
    "power point cost",
}

# Vehicle tables abbreviate size to a single letter.
VEHICLE_SIZES = {
    "F": "fine", "D": "diminutive", "T": "tiny", "S": "small", "M": "medium",
    "L": "large", "H": "huge", "G": "gargantuan", "C": "colossal",
}


def scrape_psionics(pages: list[str]) -> list[dict]:
    """Psionic powers: like spells, but with a display and a power point cost."""
    powers = {}
    for page in pages:
        try:
            lines = text_lines(srd.fetch(page))
        except Exception:
            continue

        starts = entry_starts(lines, PSIONIC_LABELS, lookahead=3)
        for position, start in enumerate(starts):
            end = starts[position + 1] if position + 1 < len(starts) else len(lines)
            name = lines[start]
            fields = collect_labels(lines, start + 1, end, PSIONIC_LABELS)
            if "level" not in fields or "power point cost" not in fields:
                continue
            # A bare ability name is the key-ability line, not a power name.
            if name.split("[")[0].strip() in PSIONIC_ABILITIES:
                continue

            # The line after the name is the key ability, the psionic
            # equivalent of a spell's school line.
            key_ability = lines[start + 1] if start + 1 < len(lines) else ""
            if is_label(key_ability, PSIONIC_LABELS) or is_value(key_ability):
                key_ability = ""

            level_match = re.search(r"(\d+)", fields.get("level", ""))
            powers.setdefault(name, {
                "id": camel(name),
                "name": name,
                "keyAbility": key_ability.split("[")[0].strip(),
                "level": int(level_match.group(1)) if level_match else 0,
                "levelText": fields.get("level", ""),
                "display": fields.get("display", ""),
                "powerPoints": srd.to_int(fields.get("power point cost", ""), 1),
                "castingTime": fields.get("manifestation time", ""),
                "range": fields.get("range", ""),
                "target": fields.get("target", "") or fields.get("targets", "") or fields.get("effect", ""),
                "duration": fields.get("duration", ""),
                "savingThrow": fields.get("saving throw", ""),
                "srdUrl": srd.page_url(page),
            })

    return [powers[k] for k in sorted(powers)]


def scrape_vehicles() -> list[dict]:
    """Vehicles, which the SRD tabulates with the full stat line."""
    vehicles = {}
    for page in ("vehicles.html", "futurevehicles.html"):
        try:
            page_html = srd.fetch(page)
        except Exception:
            continue

        for table in srd.annotated_tables(page_html):
            header = [c.strip().lower() for c in table["header"]]
            if "crew" not in header or not any("purchase dc" in c for c in header):
                continue
            index_of = {name: i for i, name in enumerate(header)}

            def column(raw, *names, default=""):
                for name in names:
                    position = index_of.get(name)
                    if position is not None and position < len(raw):
                        return raw[position].strip()
                return default

            category = ""
            for raw, kind in zip(table["rows"], table["kinds"]):
                if kind in ("category", "parent"):
                    category = raw[0].strip() or category
                    continue
                if kind in ("blank", "header") or len(raw) < 6:
                    continue

                name = raw[0].strip()
                if not name:
                    continue

                hp = srd.to_int(column(raw, "hit points"))
                size_letter = column(raw, "size").upper()[:1]
                vehicles.setdefault(camel(name), {
                    "id": camel(name),
                    "name": name,
                    "crew": srd.to_int(column(raw, "crew"), 1),
                    "passengers": srd.to_int(column(raw, "pass", "passengers")),
                    "cargo": column(raw, "cargo"),
                    "initiative": srd.to_int(column(raw, "init")),
                    "maneuver": srd.to_int(column(raw, "maneuver")),
                    "topSpeed": column(raw, "top speed"),
                    "defense": srd.to_int(column(raw, "defense"), 10),
                    "hardness": srd.to_int(column(raw, "hardness")),
                    "hp": hp,
                    "size": VEHICLE_SIZES.get(size_letter, "large"),
                    "purchaseDC": srd.to_int(column(raw, "purchase dc", "purchase dc 1")),
                    "restriction": column(raw, "restriction"),
                    "category": category,
                    "srdUrl": srd.page_url(page),
                })

    return [vehicles[k] for k in sorted(vehicles)]


def scrape_purchase_tables(pages: list[str]) -> list[dict]:
    """Every table that carries a purchase DC, from anywhere in the SRD.

    Column layouts differ per table, so rows are kept alongside their header
    and normalized by build_packs.py rather than guessed at here.
    """
    out = []
    for page in pages:
        try:
            page_html = srd.fetch(page)
        except Exception:
            continue
        for table in srd.annotated_tables(page_html):
            header = [c.lower() for c in table["header"]]
            if not any("purchase dc" in c for c in header):
                continue
            out.append({
                "page": page,
                "srdUrl": srd.page_url(page),
                "header": table["header"],
                "rows": table["rows"],
                # How each row functions: category banner, product heading,
                # indented variant, or a plain item. See srd.classify_row.
                "kinds": table["kinds"],
            })
    return out


def scrape_generic_tables(pages: list[str]) -> dict[str, list]:
    """All data tables from every crawled page, keyed by page filename.

    The SRD is mostly prose with tables embedded, so this is the raw material
    the shaped extractors and the pack builder draw on.
    """
    out = {}
    for page in pages:
        try:
            tables = srd.data_tables(srd.fetch(page))
        except Exception as error:  # a missing page must not sink the run
            print(f"  ! {page}: {type(error).__name__}: {error}", file=sys.stderr)
            continue
        if tables:
            out[page] = [{"header": t[0], "rows": t[1:]} for t in tables]
    return out


def write(name: str, payload) -> None:
    os.makedirs(srd.DATA, exist_ok=True)
    path = os.path.join(srd.DATA, name)
    with open(path, "w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print(f"  wrote data/{name}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="re-fetch every page")
    args = parser.parse_args()

    print("Discovering SRD pages...")
    pages = srd.crawl(depth=3, refresh=args.refresh)
    print(f"  {len(pages)} pages reachable from the index")

    print("Parsing tables...")
    tables = scrape_generic_tables(pages)
    print(f"  {sum(len(v) for v in tables.values())} tables across {len(tables)} pages")

    if not tables:
        raise SystemExit(
            "No tables parsed from any page. Every page raised, and the per-page\n"
            "handler swallowed it — re-run without redirecting stderr to see why."
        )

    print("Extracting datasets...")
    skills = scrape_skills()
    write("skills.json", skills)
    classes = scrape_classes(skills)
    write("classes.json", classes)
    feats = scrape_feats()
    write("feats.json", feats)
    occupations = scrape_occupations()
    write("occupations.json", occupations)
    talents = scrape_talents()
    write("talents.json", talents)
    creatures = scrape_creatures(pages)
    write("creatures.json", creatures)
    spells = scrape_spells([p for p in pages if "spelldesc" in p or "spells" in p])
    write("spells.json", spells)
    psionics = scrape_psionics([p for p in pages if "power" in p or "psidesc" in p])
    write("psionics.json", psionics)
    vehicles = scrape_vehicles()
    write("vehicles.json", vehicles)
    write("purchase_tables.json", scrape_purchase_tables(pages))
    write("tables.json", tables)

    levels = sum(len(c["progression"]) for c in classes)
    print(f"\n{len(skills)} skills, {len(classes)} classes ({levels} levels), "
          f"{len(feats)} feats, {len(occupations)} occupations, {len(talents)} talents, "
          f"{len(creatures)} creatures, {len(spells)} spells, "
          f"{len(psionics)} psionic powers, {len(vehicles)} vehicles, "
          f"{sum(len(v) for v in tables.values())} tables")
    return 0


if __name__ == "__main__":
    sys.exit(main())
