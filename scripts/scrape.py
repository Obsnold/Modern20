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


def entry_starts(lines: list[str], labels: set[str], lookahead: int = 3) -> list[int]:
    """Indices of lines that name an entry: a plain line shortly followed by a label."""
    starts = []
    for i, line in enumerate(lines):
        if is_value(line) or is_label(line, labels) or len(line) > 70:
            continue
        window = lines[i + 1: i + 1 + lookahead]
        if any(is_label(w, labels) for w in window):
            starts.append(i)
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
    pages = srd.crawl(refresh=args.refresh)
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
    write("purchase_tables.json", scrape_purchase_tables(pages))
    write("tables.json", tables)

    levels = sum(len(c["progression"]) for c in classes)
    print(f"\n{len(skills)} skills, {len(classes)} classes ({levels} levels), "
          f"{len(feats)} feats, {len(occupations)} occupations, {len(talents)} talents, "
          f"{sum(len(v) for v in tables.values())} tables")
    return 0


if __name__ == "__main__":
    sys.exit(main())
