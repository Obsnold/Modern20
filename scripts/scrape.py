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
    # The FX chapter keeps its advanced classes - the ones that cast - on an
    # index of their own, so they are not reachable from advancedclasses.html.
    for index_page, tier in (("basicclasses.html", "basic"),
                             ("advancedclasses.html", "advanced"),
                             ("fxadvanced.html", "advanced")):
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


def score_range(text: str) -> tuple[int, int] | None:
    """"12-13" becomes (12, 13); the SRD's last row is open-ended."""
    numbers = [int(n) for n in re.findall(r"\d+", text or "")]
    if not numbers:
        return None
    return (numbers[0], numbers[1] if len(numbers) > 1 else numbers[0])


def cells_to_ints(cells: list[str]) -> list[int]:
    """A row of table cells as numbers; the SRD writes "none" as a dash."""
    return [srd.to_int(c.strip(), 0) or 0 for c in cells]


def find_table(tables: list[dict], *needles: str) -> dict | None:
    """The first table whose header mentions all of these words."""
    for table in tables:
        header = " ".join(table["header"]).lower()
        if all(needle.lower() in header for needle in needles):
            return table
    return None


def parse_casting(page_html: str, lines: list[str]) -> dict:
    """A class's daily casting resource, read from the tables on its page.

    Four of the FX advanced classes have one. A Mage and an Acolyte prepare a
    number of spells of each level per day, with bonus spells from an ability
    score; a Battle Mind and a Telepath spend power points from a daily pool.
    A class with neither gets an empty block, which is most of them.
    """
    tables = srd.annotated_tables(page_html)
    text = " ".join(lines)
    empty = {
        "kind": "", "tradition": "", "ability": "",
        "perDay": [], "bonusByScore": [],
        "pointsPerDay": [], "bonusPointsByScore": [], "powersKnown": [],
    }

    per_day = find_table(tables, "spells per day")
    powers = find_table(tables, "powers discovered")

    if per_day:
        # "the Mage receives bonus spells based on his Intelligence score"
        ability = re.search(
            r"bonus spells based on (?:his|her|their) (\w+) score", text, re.I)
        tradition = "divine" if re.search(r"cast divine spells", text, re.I) else "arcane"
        bonus = find_table(tables, "bonus spells")
        return {
            **empty,
            "kind": "spells",
            "tradition": tradition,
            "ability": ABILITY_WORDS.get((ability.group(1) if ability else "").lower(), ""),
            # The first row of both tables is the spell-level header, which
            # `annotated_tables` cannot tell from data: the real header cell
            # spans it.
            "perDay": [cells_to_ints(row[1:]) for row in per_day["rows"]
                       if ORDINAL.match(row[0].strip())],
            "bonusByScore": [
                {"min": low, "max": high, "bonus": cells_to_ints(row[1:])}
                for row in (bonus["rows"] if bonus else [])
                if (score := score_range(row[0])) and (low := score[0]) and (high := score[1])
            ],
        }

    if powers:
        # "This number is improved by bonus points determined by the
        # Telepath's Charisma score". A Battle Mind has no such table.
        ability = re.search(
            r"bonus points determined by the \w+(?: \w+)?[’\']s (\w+) score", text, re.I)
        bonus = find_table(tables, "bonus power points")
        rows = [row for row in powers["rows"] if ORDINAL.match(row[0].strip())]
        return {
            **empty,
            "kind": "powers",
            "ability": ABILITY_WORDS.get((ability.group(1) if ability else "").lower(), ""),
            # Column order is level, points per day, then powers known by power
            # level. The header cell for the powers spans them, so position is
            # the only guide.
            "pointsPerDay": [srd.to_int(row[1], 0) or 0 for row in rows],
            "powersKnown": [cells_to_ints(row[2:]) for row in rows],
            "bonusPointsByScore": [
                {"min": score[0], "max": score[1], "points": srd.to_int(row[1], 0) or 0}
                for row in (bonus["rows"] if bonus else [])
                if (score := score_range(row[0]))
            ],
        }

    return empty


ABILITY_TOKENS = {"str", "dex", "con", "int", "wis", "cha", "none"}


def parse_specialty_entry(entry: str, skill_names: list[tuple[str, str]]) -> list[dict]:
    """Parse one class-skill entry into its subjects.

    Entries are written "Name (subjects) (Ability)", e.g.
    "Craft (structural) (Int)" or
    "Knowledge (current events, popular culture, streetwise, tactics) (Int)".
    A subject list yields one grant per subject, since each subject is its own
    skill; an entry with no subject grants the skill itself.
    """
    entry = entry.strip().rstrip(".")
    entry = re.sub(r"^(and|or)\s+", "", entry, flags=re.I)
    if not entry:
        return []

    brackets = re.findall(r"\(([^)]*)\)", entry)
    head = re.sub(r"\s*\([^)]*\)", "", entry).strip()

    skill = next((sid for name, sid in skill_names if head.lower() == name.lower()), None)
    if not skill:
        skill = next((sid for name, sid in skill_names if head.lower().startswith(name.lower())), None)
    if not skill:
        return []

    # The trailing bracket is the key ability, not a subject.
    subjects = [b for b in brackets if b.strip().lower() not in ABILITY_TOKENS]
    if not subjects:
        return [{"skill": skill, "specialty": ""}]

    out = []
    for name in split_outside_parens(subjects[0]):
        name = re.sub(r"^(and|or)\s+", "", name, flags=re.I).strip()
        if name and name.lower() not in ABILITY_TOKENS:
            out.append({"skill": skill, "specialty": name.title()})
    return out or [{"skill": skill, "specialty": ""}]


def parse_class_skills(text: str, skill_names: list[tuple[str, str]]) -> list[dict]:
    """Class skills with their subjects, from the SRD's sentence."""
    if not text:
        return []
    listing = re.sub(r"^.*?\bare:\s*", "", text, count=1, flags=re.I | re.S)

    grants, seen = [], set()
    for entry in split_outside_parens(listing):
        for grant in parse_specialty_entry(entry, skill_names):
            key = (grant["skill"], grant["specialty"])
            if key in seen:
                continue
            seen.add(key)
            grants.append(grant)
    return grants


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
        class_skills = parse_class_skills(class_skills_text, skill_names)

        out.append({
            "id": camel(name),
            "name": name,
            "tier": tier,
            "hitDie": labelled_value(lines, "Hit Die") or "1d8",
            "skillPointsPerLevel": srd.to_int(labelled_value(lines, "Skill Points at Each Additional Level"), 3),
            "classSkills": class_skills,
            "requirements": labelled_value(lines, "Requirements"),
            "actionPoints": labelled_value(lines, "Action Points"),
            "progression": parse_progression(table),
            "casting": parse_casting(page_html, lines),
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


def trailing_prose(lines: list[str], start: int, end: int, labels: set[str]) -> str:
    """The description printed after an entry's label block, as HTML.

    An SRD entry is a name, a header line, a run of label/value pairs, then the
    rules text. This returns that text: everything after the last label the
    caller recognises. Sub-headings inside the prose ("Skeletons", "Material
    Component") are written the same way as labels but are not in the label
    set, so they arrive as a line followed by one starting with ":" and are
    rendered bold rather than dropped.
    """
    last = None
    for i in range(start, min(end, len(lines) - 1)):
        if is_label(lines[i], labels) and is_value(lines[i + 1]):
            last = i + 1
    if last is None:
        return ""

    paragraphs = []
    i = last + 1
    while i < min(end, len(lines)):
        line = lines[i]
        # A sub-heading and its text are two lines; join them.
        if i + 1 < len(lines) and is_value(lines[i + 1]) and not is_value(line):
            paragraphs.append(f"<p><strong>{esc(line)}</strong>: {esc(value_of(lines[i + 1]))}</p>")
            i += 2
            continue
        paragraphs.append(f"<p>{esc(line)}</p>")
        i += 1
    return "".join(paragraphs)


def esc(text: str) -> str:
    """Escape for embedding in the HTML description field."""
    return html.escape(text, quote=False)


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
        # A page banner - "SPELLS - AID TO INSECT PLAGUE" - sits within the
        # lookahead of the first entry's labels and, being the earlier
        # candidate, would win and swallow that entry. Entry names are printed
        # in title case; only the banners are shouted.
        if line.isupper():
            continue
        # A line directly followed by a value is a label, even when it is
        # misspelled - the SRD prints "Areat" for bless - and treating one as
        # an entry name truncates the real entry's description.
        if i + 1 < len(lines) and is_value(lines[i + 1]):
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


def scrape_occupations(skills: list[dict]) -> list[dict]:
    """Starting occupations: skill choices, a bonus feat and a Wealth bump."""
    skill_names = sorted(((s["name"], s["id"]) for s in skills), key=lambda p: -len(p[0]))
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
            "skillChoices": parse_skill_choices(fields.get("skills", ""), skill_names),
            "bonusFeat": fields.get("bonus feat", ""),
            "bonusFeatOptions": parse_feat_choices(fields.get("bonus feat", "")),
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


def sized_name(cell: str, sibling: str) -> str:
    """A name for a column that printed its size and type instead of a name.

    "Huge vermin" beside "Large Monstrous Spider" is the huge one of those, so
    it takes the sibling's name with its size swapped for this column's.
    """
    words = (cell or "").split()
    size = words[0] if words else ""
    if not sibling:
        return cell
    base = sibling.split(" ", 1)[1] if sibling.split()[0].lower() in SIZE_WORDS else sibling
    return f"{size} {base}".strip()


# The words a size-and-type line is made of. A stat block's first row reads
# "Medium-size undead"; some print it in the name row instead, and a few print
# it nowhere at all.
SIZE_WORDS = {
    "fine", "diminutive", "tiny", "small", "medium-size", "medium",
    "large", "huge", "gargantuan", "colossal",
}


def looks_like_size_type(cell: str) -> bool:
    """Whether a cell is a size-and-type line rather than a name.

    Both halves have to be there. A size word alone is not enough: "Huge
    Crocodile Zombie" and "Tiny Viper" are names the SRD prints, and reading
    them as size lines renamed them after their neighbours.
    """
    text = re.sub(r"\([^)]*\)", " ", (cell or "").lower())
    words = text.split()
    if not words or words[0] not in SIZE_WORDS:
        return False
    rest = " ".join(words[1:]).strip()
    return any(rest == name or rest.startswith(name + " ") for name in CREATURE_TYPE_NAMES)


def heading_before(page_html: str, needle: str) -> str:
    """The creature name heading printed above a stat block.

    A few blocks put the size and type in the name row, leaving the name only
    in the heading above the table — so "Huge animal" was being imported as a
    creature called "Huge animal".
    """
    position = page_html.find(needle)
    if position < 0:
        return ""
    for line in reversed(text_lines(page_html[:position])):
        # Headings are short noun phrases; the prose above them ends in a full
        # stop and the label/value lines start with a colon.
        if line and len(line) < 46 and not is_value(line) and not line.endswith("."):
            return line.title() if line.isupper() else line
    return ""


# "Construct: A chemical golem has the traits and immunities common to
# constructs." Where a stat block omits its size-and-type line, the creature's
# own text still says what it is.
TRAITS_COMMON = re.compile(r"traits and immunities common to (\w+)", re.I)


def type_from_traits(page_html: str, name: str) -> str:
    """The creature type stated in a block's own special abilities."""
    position = page_html.find(name)
    if position < 0:
        return ""
    section = text_lines(page_html[position:position + 9000])
    match = TRAITS_COMMON.search(" ".join(section))
    return singular(match.group(1).lower()) if match else ""


def size_from_defense(defense_text: str) -> str:
    """The size a Defense line's own size modifier implies.

    "20, touch 8, flat-footed 19 (-1 size, -1 Dex, +10 natural)" is a Large
    creature. Arithmetic from the printed line rather than a guess, which is
    what makes it usable where the size is not printed anywhere else.
    """
    match = re.search(r"([-+]?\d+)\s+size", defense_text or "")
    if not match:
        return ""
    return SIZE_BY_MODIFIER.get(int(match.group(1)), "")


SIZE_BY_MODIFIER = {
    8: "fine", 4: "diminutive", 2: "tiny", 1: "small", 0: "medium",
    -1: "large", -2: "huge", -4: "gargantuan", -8: "colossal",
}


def split_outside_brackets(text: str) -> list[str]:
    """Split a printed list on commas and semicolons, but not inside brackets.

    "Educated (Knowledge [physical sciences], Knowledge [technology])" is one
    feat, and "Knowledge (technology) +11; Repair +13" is two skills — the SRD
    uses both separators and nests brackets inside entries.
    """
    parts, depth, current = [], 0, []
    for character in text:
        if character in "([":
            depth += 1
        elif character in ")]":
            depth = max(0, depth - 1)
        if character in ",;" and depth == 0:
            parts.append("".join(current))
            current = []
            continue
        current.append(character)
    parts.append("".join(current))
    return [p.strip() for p in parts if p.strip()]


# "Hide +3 (+18 in snowy conditions)", "Climb +2*", "Spot +13.", "Speak Giant",
# "Knowledge (arcane lore) +5". Every shape the printed Skills line takes.
SKILL_ENTRY = re.compile(r"""
    ^(?P<name>.+?)
    (?:\s*\((?P<subject>[^)]*)\))?
    \s*(?P<bonus>[+-]\s*\d+)?
    \s*(?P<marks>\*+)?
    (?:\s*\((?P<note>[^)]*)\))?
    \.?\s*$
""", re.X)

# The two skills taken per language rather than per rank of bonus.
LANGUAGE_SKILLS = {"read/write": "readWriteLanguage", "speak": "speakLanguage"}


def parse_creature_skills(text: str, skill_names: list[tuple[str, str]]) -> list[dict]:
    """A creature's printed Skills line, as skills the sheet can roll.

    The SRD prints a total, so the caller stores the difference from what the
    model derives — the same way the attacks and Defense already work. A
    language is not a bonus at all: "Speak Giant" says the creature speaks
    Giant, and the skill is taken per language.
    """
    out = []
    for part in split_outside_brackets(text or ""):
        # A footnote sentence trails the last entry — "Spot +3**. **Skill bonus
        # conferred by puppeteer" — and explains the marks rather than naming a
        # skill. The marks themselves are not part of the skill's name either.
        part = re.sub(r"\*+\s*\.?\s*\*+.*$|\.\s*\*.*$", "", part.strip())
        part = part.strip().rstrip("*. ")
        # A couple of blocks label the line: "Adjusted skills: Climb +10".
        part = re.sub(r"^[A-Za-z ]{0,20}skills:\s*", "", part, flags=re.I)
        if not part or part.lower().startswith("none"):
            continue

        match = SKILL_ENTRY.match(part)
        if not match:
            continue
        name = match.group("name").strip().rstrip("*")

        # "Speak Giant" and "Read/Write Language (any one)" name a language.
        flattened = re.sub(r"[_\s]*/[_\s]*", "/", name.lower())
        language = next(
            (skill for prefix, skill in LANGUAGE_SKILLS.items()
             if flattened.startswith(prefix)),
            None,
        )
        if language:
            subject = match.group("subject") or name.split(None, 1)[-1]
            if subject.lower().startswith("language"):
                subject = match.group("subject") or ""
            out.append({"skill": language, "specialty": subject.strip() or "any",
                        "bonus": 0, "note": ""})
            continue

        skill = next((sid for label, sid in skill_names if name.lower() == label.lower()), None)
        if not skill:
            continue

        bonus = match.group("bonus")
        out.append({
            "skill": skill,
            "specialty": (match.group("subject") or "").strip(),
            "bonus": int(re.sub(r"\s+", "", bonus)) if bonus else 0,
            # "(+18 in snowy conditions)" is a situational bonus the GM applies.
            "note": (match.group("note") or "").strip(),
        })
    return out


def parse_creature_feats(text: str) -> list[str]:
    """A creature's printed Feats line. "Weapon Finesse (bite)" is Weapon Finesse."""
    feats = []
    for part in split_outside_brackets(text or ""):
        name = re.sub(r"\s*[(\[][^)\]]*[)\]]?", "", part).strip().rstrip(".")
        if name and not name.lower().startswith("none"):
            feats.append(name)
    return feats


# "damage reduction 15/silver" — the number stops damage, the word after the
# slash is what gets through it.
DAMAGE_REDUCTION = re.compile(r"damage reduction\s+(\d+)\s*/?\s*([^,;]*)", re.I)


def parse_damage_reduction(text: str) -> dict:
    """The damage reduction a creature's special qualities state."""
    match = DAMAGE_REDUCTION.search(text or "")
    if not match:
        return {"value": 0, "bypass": ""}
    return {"value": int(match.group(1)), "bypass": match.group(2).strip()}


# The senses a stat block names. Held apart from the rest of the special
# qualities because the creature model has a field for them, and the import put
# the whole SQ line in it — so every creature's senses read "Cold subtype,
# constrict, darkvision 60 ft., improved grab".
SENSES = (
    "darkvision", "low-light vision", "blindsight", "blindsense", "scent",
    "keen scent", "keen sight", "tremorsense", "all-around vision",
)

# The labels a template's traits table uses for the stat-block line it changes.
# They sit inside a TEMPLATE TRAITS section in the same run-in shape an ability
# does, so without this a skeleton would gain an ability called "Ability Scores".
STAT_BLOCK_LABELS = {
    "cr", "challenge rating", "combined challenge rating", "hd", "hit dice",
    "mas", "massive damage threshold", "init", "initiative", "spd", "speed",
    "defense", "bab", "bab/grap", "grapple", "grapple bonus", "atk", "attack",
    "attacks", "full atk", "full attack", "dmg", "damage", "fs/reach", "reach",
    "face/reach", "sq", "special qualities", "al", "allegiances", "allegiance",
    "sv", "saves", "saving throws", "ap", "rep", "ap/rep", "action points",
    "reputation", "ability scores", "abilities", "skills", "adjusted skills",
    "feats", "talents", "possessions", "advancement", "type", "size",
    "hp", "hit points", "special attacks", "organization", "treasure",
}


def quality_key(text: str) -> str:
    """The name a printed special quality and its description share.

    "Darkvision 60 ft.", "Darkvision (Ex)" and the glossary's "Darkvision" are
    one ability written three ways: the stat block prints the range, the
    creature's own text prints the category, and the glossary prints neither.
    Matching them is what lets a printed quality find its rules.
    """
    text = re.sub(r"\([^)]*\)", " ", (text or "").lower())
    # One heading is letter-spaced in the source and another runs the word
    # together, so "l o w - l i g h t vision" and "lowlight vision" are the
    # same sense as "low-light vision".
    text = re.sub(r"\bl\s?o\s?w\s?[\s-]\s?l\s?i\s?g\s?h\s?t\b", "low-light", text)
    text = re.sub(r"\blowlight\b", "low-light", text)
    text = re.sub(r"\s+", " ", text).strip(" .,;:")
    # A trailing range, rating or amount belongs to this creature rather than
    # to the ability: "darkvision 60 ft.", "damage reduction 15/+1".
    text = re.sub(r"\s+\d[\d/+.'’a-z-]*(\s+(?:ft|feet|foot)\.?)?$", "", text)
    return text.strip(" .,;:")


def parse_special_qualities(text: str) -> list[dict]:
    """The printed SQ line, as the abilities it names.

    "Cold subtype, constrict, darkvision 60 ft., improved grab" is four
    abilities that a GM has to look up one at a time. The line was stored as
    one string and read by nothing.
    """
    entries = []
    seen = set()
    for part in split_outside_brackets(text or ""):
        printed = part.strip().strip(",; ")
        # One block prints its special attacks and qualities in the same cell,
        # keeping the SRD's own labels: "improved grab, grind (4d4+9); SQ
        # construct, damage reduction 10/+1". The label is not part of the name.
        printed = re.sub(r"^(?:SQ|SA)\b[:.]?\s*", "", printed, flags=re.I)
        # A full stop that ends the line goes; the one in "60 ft." stays.
        if re.search(r"[A-Za-z]{4,}\.$", printed):
            printed = printed[:-1]
        if not printed or printed.lower() in ("none", "n/a", "-"):
            continue
        key = quality_key(printed)
        if not key or key in seen:
            continue
        seen.add(key)
        entries.append({
            "printed": printed,
            "key": key,
            "sense": any(key == sense or key.startswith(sense + " ") for sense in SENSES),
        })
    return entries


# The damage types a creature's defences are recorded against: the same list
# as MODERN20.energyDamageTypes and MODERN20.physicalDamageTypes, because a
# type the damage code cannot match on would be stored and never applied.
# "immune to fire" is a rule; "immune to nannite infection" is a sentence for
# the GM, and stays in the ability text.
#
# Named apart from the spell descriptions' own DAMAGE_TYPES, which is a wider
# vocabulary and was silently shadowing this one — the check that every stored
# type is one the config knows is what caught it.
CREATURE_DAMAGE_TYPES = {
    "acid", "cold", "electricity", "fire", "sonic", "concussion", "poison",
    "ballistic", "bludgeoning", "piercing", "slashing",
}

# "sonic/concussion vulnerability" — one type written two ways, since the
# weapon tables say concussion and the spells say sonic.
DAMAGE_TYPE_ALIASES = {"concussion": "sonic"}


def damage_types_in(text: str) -> list[str]:
    """The damage types a printed phrase names, in order.

    "acid and fire resistance 20" is two resistances; "immune to fire damage"
    is one; "immune to nannite infection" is none, which is the answer that
    keeps invented rules out of the model.
    """
    words = re.split(r"[/,]|\band\b|\bor\b", (text or "").lower())
    found = []
    for word in words:
        word = word.strip(" .;:")
        word = re.sub(r"^(?:damage from |all )?", "", word)
        word = re.sub(r"\s+(?:damage|attacks?|weapons?|effects?)$", "", word).strip()
        if word in CREATURE_DAMAGE_TYPES:
            resolved = DAMAGE_TYPE_ALIASES.get(word, word)
            if resolved not in found:
                found.append(resolved)
    return found


# "acid and fire resistance 20", "cold resistance 10".
PRINTED_RESISTANCE = re.compile(r"^(?P<types>[a-z/ ]+?)\s+resistance\s+(?P<value>\d+)$", re.I)
# "electricity immunity", "immune to piercing weapons".
PRINTED_IMMUNITY = re.compile(r"^(?:(?P<before>[a-z/ ]+?)\s+immunity|immune to\s+(?P<after>.+))$", re.I)
PRINTED_VULNERABILITY = re.compile(r"^(?P<types>[a-z/ ]+?)\s+vulnerability$", re.I)

# The same three, as the SRD words them in a creature's own traits: "A yeti is
# immune to cold damage. It takes 50% more damage from fire attacks."
DESCRIBED_IMMUNITY = re.compile(r"\bimmune to ([a-z/ ]+?)\s*(?:damage|attacks|\.|,|;|$)", re.I)
DESCRIBED_VULNERABILITY = re.compile(
    r"takes?\s+(?:50%|half again as much|double)\s+(?:more\s+)?damage from ([a-z/ ]+?)"
    r"\s*(?:attacks|damage|\.|,|;|$)", re.I)
DESCRIBED_RESISTANCE = re.compile(
    r"ignores? the first (\d+) points of ([a-z/ ]+?) damage", re.I)


def parse_damage_traits(qualities: list[dict]) -> dict:
    """What a printed SQ line says a creature ignores.

    "cold resistance 10", "electricity immunity" and "fire vulnerability" are
    arithmetic the damage code can do; the stat block prints them beside
    "immunities" and "resistant to blows", which are not, and those stay as
    the ability text they already are.
    """
    traits = {"resistances": [], "immunities": [], "vulnerabilities": []}
    for quality in qualities:
        printed = quality["printed"]

        match = PRINTED_RESISTANCE.match(printed)
        if match:
            for damage_type in damage_types_in(match.group("types")):
                traits["resistances"].append(
                    {"type": damage_type, "value": int(match.group("value"))})
            continue

        match = PRINTED_IMMUNITY.match(printed)
        if match:
            named = match.group("before") or match.group("after") or ""
            traits["immunities"].extend(damage_types_in(named))
            continue

        match = PRINTED_VULNERABILITY.match(printed)
        if match:
            traits["vulnerabilities"].extend(damage_types_in(match.group("types")))
    return dedupe_damage_traits(traits)


def describe_damage_traits(traits: dict, described: list[dict]) -> dict:
    """The same three as the creature's own traits state them in prose.

    The subtypes are where this earns its keep: "Cold Subtype (Ex): A yeti is
    immune to cold damage. It takes 50% more damage from fire attacks" is the
    whole rule, and the SQ line only says "Cold subtype".
    """
    for trait in described:
        text = trait["description"]
        for match in DESCRIBED_IMMUNITY.finditer(text):
            traits["immunities"].extend(damage_types_in(match.group(1)))
        for match in DESCRIBED_VULNERABILITY.finditer(text):
            traits["vulnerabilities"].extend(damage_types_in(match.group(1)))
        for match in DESCRIBED_RESISTANCE.finditer(text):
            for damage_type in damage_types_in(match.group(2)):
                traits["resistances"].append(
                    {"type": damage_type, "value": int(match.group(1))})
    return dedupe_damage_traits(traits)


def dedupe_damage_traits(traits: dict) -> dict:
    """One entry per damage type, the printed line winning over the prose."""
    seen = set()
    resistances = []
    for entry in traits["resistances"]:
        if entry["type"] not in seen:
            seen.add(entry["type"])
            resistances.append(entry)
    return {
        "resistances": resistances,
        # A type immune to something does not also resist it.
        "immunities": list(dict.fromkeys(traits["immunities"])),
        "vulnerabilities": list(dict.fromkeys(traits["vulnerabilities"])),
    }


# "SPECIES TRAITS" heads the prose that describes what a stat block's SQ line
# names. "TEMPLATE TRAITS" is the same for a template — a werewolf, a skeleton —
# and is printed above the blocks it applies to rather than below them.
TRAIT_HEADING = re.compile(r"^(species|template) traits$", re.I)

# "Improved Grab (Ex):" — a run-in heading, with or without the category the
# SRD puts in brackets. Bounded in length and free of sentence punctuation, so
# a line of prose that happens to end in a colon is not read as an ability.
TRAIT_LABEL = re.compile(r"^(?P<name>[A-Z][^:.!?]{0,58}?)\s*(?:\((?P<kind>Ex|Su|Sp|Ps)\))?\s*:?$")

ABILITY_KINDS = {"ex": "extraordinary", "su": "supernatural",
                 "sp": "spellLike", "ps": "psiLike"}


def is_section_end(line: str) -> bool:
    """A line that ends a traits section: the next heading printed after it.

    A section runs to the next stat block, which on one page is a long way
    down - past a whole "New Equipment" section, whose text was being read as
    the last trait's description. The end is recognised the way the creature
    headings already are: a short line that is not a sentence.
    """
    line = line.strip()
    return bool(line) and len(line) < 46 and not line.endswith((".", ":", ";", ",", "-"))


def is_rating(line: str) -> bool:
    """Whether a value under "CR:" is a rating rather than a sentence.

    A stat block prints "3" or "1/4"; a template's traits table prints "Same as
    the character +2" under the same label. One infester block prints its Hit
    Dice there — an SRD slip — so this asks whether the value reads like a
    rating rather than requiring a bare number.
    """
    line = line.strip()
    return bool(line) and len(line) <= 40 and not re.search(r"[A-Za-z]{4,}", line)


def parse_trait_entries(lines: list[str], *, fold_untagged: bool = False,
                        skip_stat_block: bool = False) -> list[dict]:
    """One traits section, as the abilities it describes.

    The SRD writes a run-in heading two ways: "Improved Grab (Ex):" with the
    text following it, and "Improved Grab (Ex)" with the text starting at the
    colon on the next line. Both shapes appear on the same page.

    `fold_untagged` is for the Special Abilities glossary, where a heading with
    no (Ex)/(Su)/(Sp) category — "Permanent Ability Drain" under Ability Score
    Reduction — is a part of the entry above it rather than an entry of its own.
    In a creature's own traits section an untagged heading is a real ability:
    "Skill Bonus", "Automatic Language", "Construct".

    `skip_stat_block` is for a template's traits, which are a table of the
    stat-block lines the template changes - "HD:", "Ability Scores:" - written
    in the same run-in shape. A species section uses those words for real
    traits, and "Speed: Hunting spiders are speedier than their web-spinning
    counterparts" is an ability rather than a stat-block row.
    """
    entries = []
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        match = TRAIT_LABEL.match(line)
        starts_value = index + 1 < len(lines) and lines[index + 1].strip().startswith(":")
        if not match or not (line.endswith(":") or starts_value):
            index += 1
            continue

        name = match.group("name").strip().rstrip(":").strip()
        if not name or (skip_stat_block and name.lower() in STAT_BLOCK_LABELS):
            index += 1
            continue

        body = []
        index += 1
        while index < len(lines):
            following = lines[index].strip()
            next_match = TRAIT_LABEL.match(following)
            if next_match and (following.endswith(":") or (
                    index + 1 < len(lines) and lines[index + 1].strip().startswith(":"))):
                break
            # A label always has a value, so only a line past the first can end
            # the section. Where the traits resume past an interruption they
            # are picked up again; where they do not, the section is over.
            if body and is_section_end(following):
                resumed = resumes_below(lines, index)
                if resumed is None:
                    index = len(lines)
                    break
                index = resumed
                continue
            body.append(following.lstrip(":").strip())
            index += 1

        kind = ABILITY_KINDS.get((match.group("kind") or "").lower(), "")
        description = "\n\n".join(p for p in body if p)
        if fold_untagged and not kind and entries:
            # A sub-heading of the entry above: kept as a run-in so the
            # definition stays whole rather than being split in two.
            entries[-1]["description"] += f"\n\n{name}: {description}".rstrip()
            continue
        # The key is what joins a described trait to the SQ line that names it
        # and to the glossary's definition of the same ability.
        entries.append({"name": name, "key": quality_key(name),
                        "kind": kind, "description": description})
    return entries


def is_run_in(lines: list[str], index: int) -> bool:
    """Whether a line is a run-in heading: "Improved Grab (Ex):" or its label."""
    line = lines[index].strip()
    return bool(TRAIT_LABEL.match(line)) and (
        line.endswith(":")
        or (index + 1 < len(lines) and lines[index + 1].strip().startswith(":")))


def resumes_below(lines: list[str], index: int) -> int | None:
    """Where a traits section continues past an interruption, or nothing.

    A section can be interrupted by a table - the monstrous spiders' poison
    DCs, the harpy's spell-like abilities by character level - whose cells are
    short lines rather than sentences, and the traits carry on below it. A
    paragraph of prose under a heading is not an interruption: "New Equipment"
    and the two pages of gear under it belong to something other than the
    dimensional horror's traits, and the section ends there.
    """
    for ahead in range(index, len(lines)):
        if is_run_in(lines, ahead):
            return ahead
        if len(lines[ahead].strip()) >= 46:
            return None
    return None


def creature_runs(lines: list[str]) -> list[tuple[str, int, int]]:
    """A creature page as an ordered run of stat blocks and traits sections."""
    marks = []
    for index, line in enumerate(lines):
        heading = TRAIT_HEADING.match(line.strip())
        if heading:
            marks.append((index, heading.group(1).lower()))
        elif line.strip() == "CR:" and index + 1 < len(lines) and is_rating(lines[index + 1]):
            marks.append((index, "block"))
    return [(kind, start, marks[n + 1][0] if n + 1 < len(marks) else len(lines))
            for n, (start, kind) in enumerate(marks)]


# Words in a creature's name that do not identify it: a size, a variant, or the
# character class levels a stat block adds on top.
UNDISTINCTIVE = SIZE_WORDS | {
    "advanced", "hero", "ordinary", "form", "adult", "grub", "hatchling",
    "giant", "human", "template",
}


def names_creature(section: str, name: str) -> bool:
    """Whether a traits section's own prose names this creature.

    "An animated object has the traits and immunities common to constructs."
    The SRD describes a creature by name in its traits, which is what makes it
    safe to give one stat block the section printed after a later one — the
    seven monstrous spiders are one entry with one set of traits.
    """
    words = [w for w in re.findall(r"[a-z]{4,}", name.lower()) if w not in UNDISTINCTIVE]
    return any(word in section.lower() for word in words)


def attach_special_abilities(page_html: str, creatures: list[dict]) -> None:
    """Give each creature the traits section printed with its stat block.

    A species traits section follows its stat block and a template's traits
    precede it, so adjacency decides the ordinary case. Where a creature's own
    block has neither — the SRD prints the seven monstrous spiders, and the
    animated objects, as several blocks sharing one set of traits — the nearest
    section across intervening blocks is used, but only if its prose names the
    creature. That check is what keeps a chemical golem from inheriting the
    acid rainer's traits, which is what position alone gives you.
    """
    lines = text_lines(page_html)
    runs = creature_runs(lines)
    body = {n: lines[start + 1:end] for n, (kind, start, end) in enumerate(runs)
            if kind != "block"}

    adjacent = {}
    for n, (kind, _, _) in enumerate(runs):
        if kind == "species" and n and runs[n - 1][0] == "block":
            adjacent.setdefault(n - 1, n)
        elif kind == "template" and n + 1 < len(runs) and runs[n + 1][0] == "block":
            adjacent.setdefault(n + 1, n)

    for creature in creatures:
        creature["speciesTraits"] = []
        block = block_of(creature, lines, runs)
        if block is None:
            continue
        section = adjacent.get(block)
        if section is None:
            section = shared_section(block, runs, adjacent, body, creature["name"])
        if section is None:
            continue
        creature["speciesTraits"] = parse_trait_entries(
            body[section], skip_stat_block=runs[section][0] == "template")
        # The subtypes state their immunity and vulnerability in prose only.
        creature["damageTraits"] = describe_damage_traits(
            creature["damageTraits"], creature["speciesTraits"])


def block_of(creature: dict, lines: list[str], runs: list[tuple[str, int, int]]) -> int | None:
    """Which stat block on the page a scraped creature came out of.

    Matched on the creature's own printed lines rather than on the order the
    tables were parsed in, since a page nests tables inside its layout. "None"
    is not an anchor: every third block prints it for skills or feats.
    """
    anchors = [text for text in (creature["skills"], creature["specialQualities"],
                                 creature["fullAttack"], creature["attack"])
               if text and len(text) > 12]
    for n, (kind, start, end) in enumerate(runs):
        if kind != "block":
            continue
        printed = {line.rstrip(".") for line in lines[start:end]}
        if any(anchor.rstrip(".") in printed for anchor in anchors):
            return n
    return None


def shared_section(block: int, runs, adjacent: dict, body: dict, name: str) -> int | None:
    """The traits section a block shares with another block of the same creature."""
    for step in (1, -1):
        other = block + step
        while 0 <= other < len(runs) and runs[other][0] == "block":
            section = adjacent.get(other)
            if section is not None:
                return section if names_creature(" ".join(body[section]), name) else None
            other += step
    return None


def scrape_special_abilities() -> list[dict]:
    """The SRD's Special Abilities glossary: what a printed quality means.

    A stat block prints "improved grab" and leaves the rules to this page. The
    creature's own traits describe what is specific to it; this is the shared
    definition for everything it does not say.
    """
    page = "specialabilities.html"
    lines = text_lines(srd.fetch(page))
    start = next((i for i, line in enumerate(lines)
                  if line.strip().upper() == "SPECIAL ABILITIES"), 0)
    entries = parse_trait_entries(lines[start + 1:], fold_untagged=True)
    return [{
        "id": camel(entry["name"]),
        "name": entry["name"],
        "key": entry["key"],
        "kind": entry["kind"],
        "description": entry["description"],
        "srdUrl": srd.page_url(page),
    } for entry in entries]

# "+23/+18/+13 melee (2d8+13 plus 1d6 acid, slam)" — a bonus or a sequence of
# them, the mode, and a bracket holding damage and the weapon's name. A few
# lines carry two weapons in one bracket, joined by "or".
ATTACK_LINE = re.compile(r"""
    (?P<bonuses>[+-]\d+(?:/[+-]\d+)*)\s+
    (?P<mode>melee|ranged)
    (?P<touch>\s+touch)?
    (?:\s*\((?P<body>[^)]*)\))?
""", re.X | re.I)


def parse_attack_part(part: str) -> dict | None:
    """One weapon out of an attack bracket: "2d8+13 plus 1d6 acid, slam"."""
    if "," in part:
        damage_text, name = part.rsplit(",", 1)
    else:
        # A few omit the comma: "1d6+3 bite".
        match = re.match(r"\s*(\d+d\d+(?:[+-]\d+)?(?:/[^\s]*)?)\s+(.+)", part)
        if not match:
            return None
        damage_text, name = match.group(1), match.group(2)

    match = re.match(
        r"\s*(\d+d\d+(?:[+-]\d+)?|\d+)\s*(?:/[^\d]*(\d+(?:-\d+)?))?\s*(.*)",
        damage_text.strip(),
    )
    if not match:
        return None
    damage, critical, rest = match.group(1), match.group(2), match.group(3).strip()

    # "plus 1d6 acid" is a rider; a bare word is the damage's own energy type.
    extra, damage_type = "", ""
    if rest:
        rider = re.match(r"(?:plus|and)\s+(.*)", rest, re.I)
        if rider:
            extra = rider.group(1).strip()
        else:
            damage_type = rest.split()[0].lower()

    # "2 claws" is two attacks with one weapon.
    count = 1
    name = name.strip()
    counted = re.match(r"(\d+)\s+(.*)", name)
    if counted:
        count = int(counted.group(1))
        name = counted.group(2).rstrip("s")

    return {
        "damage": damage, "critical": critical or "20", "damageType": damage_type,
        "extra": extra, "name": name, "count": count,
    }


def parse_attacks(text: str) -> list[dict]:
    """A creature's printed attack line, as the weapons it names.

    A bonus with no bracket — "or +9 ranged" — names no weapon and is skipped:
    the SRD is giving the creature's ranged attack bonus for whatever it picks
    up, not an attack it has.
    """
    attacks = []
    for match in ATTACK_LINE.finditer(text or ""):
        bonuses = [int(b) for b in match.group("bonuses").split("/")]
        parts = [p.strip() for p in re.split(r"\bor\b", match.group("body") or "") if p.strip()]

        for part in parts:
            parsed = parse_attack_part(part)
            if not parsed:
                # "bite or tail slap" is one attack under two names.
                if attacks and part and not re.search(r"\d", part):
                    attacks[-1]["alternateName"] = part
                continue
            attacks.append({
                "bonus": bonuses[0],
                "sequence": bonuses,
                "ranged": match.group("mode").lower() == "ranged",
                "touch": bool(match.group("touch")),
                "alternateName": "",
                **parsed,
            })
    return attacks


# The size modifier a creature of each size takes on its attack rolls, which is
# the inverse of the table size_from_defense reads.
ATTACK_SIZE_MODIFIER = {size: modifier for modifier, size in SIZE_BY_MODIFIER.items()}


def looks_like_allegiance(text: str) -> bool:
    """Whether a printed AL line names a side rather than something else.

    Every allegiance in the SRD's 144 stat blocks is a word or two - "Evil",
    "None or owner", "Chaos" - and none of them carries a number. That is what
    makes the troll's "Rend 2d6+9, regeneration 5 (cannot regenerate acid or
    fire damage), scent, darkvision 90 ft." recognisable as the wrong line.
    """
    if re.search(r"\d", text or ""):
        return False
    return all(len(part.split()) <= 3 for part in text.split(","))


def repair_shifted_rows(rows: dict[str, str]) -> dict[str, str]:
    """The one stat block whose rows read from the wrong column.

    creatures3.html gives the troll's SQ row one cell where the block has two,
    so the special qualities are printed under AL and the face-and-reach line
    is repeated under SQ. Both trolls lost regeneration, scent and darkvision
    90 ft., and took "Rend 2d6+9" as an allegiance.

    Recognised by what the values are rather than by the creature's name: a
    special quality is not a face-and-reach measurement, and an allegiance is
    not a damage expression.
    """
    reach = rows.get("fs/reach", "")
    allegiance = rows.get("al", "")
    if rows.get("sq", "") and rows["sq"] == reach:
        rows["sq"] = ""
    if allegiance and not looks_like_allegiance(allegiance) and not rows.get("sq"):
        rows["sq"], rows["al"] = allegiance, ""
    return rows


def parse_creature_column(rows: dict[str, str], name: str, size_type: str, url: str,
                          skill_names: list[tuple[str, str]] | None = None) -> dict:
    """One column of a stat block into the fields the creature model stores.

    Printed Defense, saves and initiative are totals. The data model derives
    those from ability scores plus components, so the difference is put into
    the misc slots - the sheet then shows the number the SRD prints.
    """
    skill_names = skill_names or []
    rows = repair_shifted_rows(rows)
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
        # Stored as the type's own id, with anything parenthesised — "elemental
        # (air)" — kept as the subtype, so the sheet can offer the fifteen
        # types as a list and still say which elemental this is.
        "creatureType": creature_type_id(creature_type),
        "subtype": creature_subtype(creature_type),
        "challengeRating": rows.get("cr", ""),
        "hitDice": hit_dice.split(";")[0].strip(),
        "hp": hp,
        "massiveDamageThreshold": massive,
        "abilities": abilities,
        "baseAttack": bab,
        # The printed attack line, as the weapons it names.
        "attacks": parse_attacks(rows.get("full atk", "") or rows.get("atk", "")),
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
        # The SQ line as the abilities it names, so each one can find its
        # rules and the senses can be told apart from the rest.
        "specialQualityEntries": parse_special_qualities(rows.get("sq", "")),
        "allegiances": [a.strip() for a in rows.get("al", "").split(",") if a.strip()],
        "skills": rows.get("skills", ""),
        # The printed lines, structured: skills the sheet can roll, feats it
        # can be granted, and the damage reduction applyDamage subtracts.
        "skillEntries": parse_creature_skills(rows.get("skills", ""), skill_names),
        "featNames": parse_creature_feats(rows.get("feats", "")),
        "damageReduction": parse_damage_reduction(rows.get("sq", "")),
        # What the printed line says this creature ignores, as arithmetic the
        # damage code can do rather than as text nothing reads.
        "damageTraits": parse_damage_traits(parse_special_qualities(rows.get("sq", ""))),
        "feats": rows.get("feats", ""),
        "talents": rows.get("talents", ""),
        "possessions": rows.get("possessions", ""),
        "advancement": rows.get("advancement", ""),
        "srdUrl": url,
    }


def scrape_creatures(pages: list[str], skills: list[dict] | None = None) -> list[dict]:
    """Creature stat blocks, which the SRD lays out as label/value tables.

    Each table carries a base creature and an advanced variant side by side,
    so one table yields one creature per populated column.
    """
    # Longest first, so "Move Silently" is matched before "Move".
    skill_names = sorted(((s["name"], s["id"]) for s in (skills or [])),
                         key=lambda pair: -len(pair[0]))
    creatures = {}
    for page in pages:
        try:
            page_html = srd.fetch(page)
        except Exception:
            continue
        on_page = []

        for table in srd.annotated_tables(page_html):
            labels = [r[0].rstrip(":").strip().lower() for r in table["rows"] if r]
            if "cr" not in labels or "ability scores" not in labels:
                continue

            names = table["header"]
            first = table["rows"][0] if table["rows"] else []

            # A stat block normally opens with an unlabelled size-and-type row.
            if first and not first[0].strip() and any(looks_like_size_type(c) for c in first):
                size_types = first
            elif any(looks_like_size_type(c) for c in names[1:]):
                # Some blocks put the size and type where the names belong, and
                # print the name only as the heading above the table.
                size_types = names
                heading = heading_before(page_html, next(c for c in names if c.strip()))
                names = [""] + [
                    f"{heading} ({cell.split()[0]})" if heading and cell.strip() else cell
                    for cell in names[1:]
                ]
            else:
                # A handful print it nowhere; the creature's own text still says.
                size_types = []

            # A column whose name cell holds a size and type has no name of its
            # own: the SRD prints "Large Monstrous Spider" and then, for the
            # bigger one, just "Huge vermin". Named from its sibling and its
            # own size, which is what the printed pair means.
            sibling = next((c.strip() for c in names[1:]
                            if c.strip() and not looks_like_size_type(c)), "")
            names = [names[0]] + [
                sized_name(cell, sibling) if looks_like_size_type(cell) else cell
                for cell in names[1:]
            ]

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

                size_type = size_types[column] if column < len(size_types) else ""
                if not size_type:
                    # Recovered from the block itself: the Defense line states
                    # the size modifier, and the special abilities name the type.
                    size_type = " ".join(filter(None, [
                        size_from_defense(rows.get("defense", "")),
                        type_from_traits(page_html, name),
                    ])) or "Medium-size"

                entry = parse_creature_column(rows, name, size_type, srd.page_url(page),
                                              skill_names)
                # Later pages repeat a few creatures; first definition wins.
                if creatures.setdefault(entry["id"], entry) is entry:
                    on_page.append(entry)

        # The prose under SPECIES TRAITS describes what the SQ line names, and
        # is printed once per stat block rather than once per column.
        attach_special_abilities(page_html, on_page)

    return [creatures[k] for k in sorted(creatures)]


# "20-ft.-radius spread", "20-ft. burst", "Cylinder (10-ft. radius, 40 ft.
# high)". Every area the SRD states as a radius can be drawn; the rest are
# described in prose ("Quarter-circle emanating from you") and are left to the
# GM, since a wrong shape on the canvas is worse than none.
AREA_PATTERN = re.compile(
    r"(\d+)\s*-?\s*ft\.?\s*-?\s*(?:radius|burst|spread)"
    r"|radius[ ,]+(?:of )?(?:up to )?(\d+)\s*ft",
    re.I,
)


def parse_area(text: str) -> dict:
    """A spell's area as a shape the canvas can draw, or nothing."""
    match = AREA_PATTERN.search(text or "")
    if not match:
        return {"shape": "", "size": 0}
    return {"shape": "radius", "size": int(match.group(1) or match.group(2))}


# "1d6 points of fire damage per caster level (maximum 10d6)". The SRD writes
# every spell's damage this way, so the expression, the energy type and the
# scaling can be read out of the prose rather than transcribed by hand.
DAMAGE_PATTERN = re.compile(
    r"(?P<dice>\d+d\d+(?:\s*[+-]\s*\d+)?)\s*points?\s+of\s+"
    r"(?P<kind>[a-z/ ]*?)\s*damage"
    r"(?:\s+per\s+(?P<per>two\s+|)caster\s+levels?)?"
    r"(?:\s*\(maximum\s+(?P<max>\d+)d\d+)?",
    re.I,
)

# Energy types the SRD names in a damage line. Anything else - "temporary
# ability damage" - is not hit point damage and is left alone.
DAMAGE_TYPES = {
    "acid", "cold", "electricity", "fire", "sonic", "poison", "force",
    "bludgeoning", "piercing", "slashing", "negative energy",
}


def parse_damage(name: str, description: str) -> dict | None:
    """The damage a spell or power deals, read from its description.

    Returns None where the description states none, or states something that
    is not hit point damage: a cure spell restores hit points and ability
    damage is a different track entirely. Both would otherwise be picked up by
    the same sentence pattern.
    """
    text = html.unescape(re.sub(r"<[^>]+>", " ", description))
    match = DAMAGE_PATTERN.search(text)
    if not match:
        return None

    kind = (match.group("kind") or "").strip().lower()
    if "abilit" in kind:
        return None
    # A cure spell is written as damage it removes: "channels positive energy
    # that cures 1d8 points of damage".
    sentence = text[max(0, text.rfind(".", 0, match.start()) + 1): match.end()]
    if re.search(r"\bcure|\bheal|positive energy", sentence, re.I) or name.lower().startswith(("cure ", "mass cure")):
        return None

    per = 0
    if match.group("per") is not None:
        per = 2 if match.group("per").strip() else 1

    return {
        "formula": re.sub(r"\s+", "", match.group("dice")),
        "type": kind if kind in DAMAGE_TYPES else "",
        # Dice added per this many caster levels, and the most the expression
        # reaches. Both zero for damage that does not scale.
        "scaling": {"per": per, "max": int(match.group("max") or 0)},
    }


# The classes that cast from each list. "Arcane 2" and "Divine 2" appear in the
# Urban Arcana spells, which name the tradition rather than a class.
SPELL_LIST_CLASSES = {
    "arcane": ("Mage", "Arcane", "Techno Mage"),
    "divine": ("Acolyte", "Divine", "Mystic"),
}


def spell_lists(level_text: str) -> dict:
    """Split "Acolyte 3, Mage 4" into the level on each list."""
    found = {"arcane": None, "divine": None}
    for caster, level in re.findall(r"([A-Z][A-Za-z ]*?)\s+(\d+)", level_text):
        caster = caster.strip()
        for tradition, names in SPELL_LIST_CLASSES.items():
            if caster in names and found[tradition] is None:
                found[tradition] = int(level)
    return found


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
                # Which list the spell is on and at what level. A spell on both
                # lists is a different level for each - animate dead is Acolyte
                # 3 and Mage 4 - and the save DC counts the level of the list it
                # was cast from, so both are kept.
                "save": parse_saving_throw(fields.get("saving throw", "")),
                "damage": parse_damage(name, trailing_prose(lines, start, end, SPELL_LABELS)),
                "areaShape": parse_area(fields.get("area", "") or fields.get("effect", "")),
                "lists": spell_lists(level_text),
                "description": trailing_prose(lines, start, end, SPELL_LABELS),
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


# The abbreviations ABILITY_KEYS holds, plus the full names the FX chapter
# prints for a power's key ability.
ABILITY_WORDS = {
    **{abbrev.lower(): key for abbrev, key in ABILITY_KEYS.items() if key},
    "strength": "str", "dexterity": "dex", "constitution": "con",
    "intelligence": "int", "wisdom": "wis", "charisma": "cha",
}


def ability_key(text: str) -> str:
    """The ability a power keys off, as an ability key.

    The key ability is printed as its own line under the power's name, usually
    as a bare ability - "Charisma" - but charm creature prints its discipline
    and abbreviates: "Telepathy (Cha)".
    """
    for word in re.findall(r"[A-Za-z]+", text):
        key = ABILITY_WORDS.get(word.lower())
        if key:
            return key
    return ""


# "Will negates", "Reflex half", "Fortitude partial (see text)". The save and
# what a successful one does are the two parts that matter mechanically.
SAVE_NAMES = {"fortitude": "fort", "reflex": "ref", "will": "will"}


def parse_saving_throw(text: str) -> dict:
    """Which save a spell or power allows, and what succeeding at it does."""
    lowered = (text or "").lower()
    save = next((key for name, key in SAVE_NAMES.items() if name in lowered), "")
    if not save:
        return {"save": "", "onSuccess": ""}
    # "(harmless)" marks a spell whose save exists only so an unwilling ally
    # can refuse it; it is not an attack and needs no DC prompt.
    if "harmless" in lowered:
        return {"save": save, "onSuccess": "harmless"}
    if "half" in lowered:
        return {"save": save, "onSuccess": "half"}
    if "partial" in lowered:
        return {"save": save, "onSuccess": "partial"}
    if "negates" in lowered or "disbelief" in lowered:
        return {"save": save, "onSuccess": "negate"}
    return {"save": save, "onSuccess": "none"}


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
                "keyAbility": ability_key(key_ability),
                "keyAbilityText": key_ability.split("[")[0].strip(),
                "level": int(level_match.group(1)) if level_match else 0,
                "levelText": fields.get("level", ""),
                "display": fields.get("display", ""),
                "powerPoints": srd.to_int(fields.get("power point cost", ""), 1),
                "castingTime": fields.get("manifestation time", ""),
                "range": fields.get("range", ""),
                "target": fields.get("target", "") or fields.get("targets", "") or fields.get("effect", ""),
                "duration": fields.get("duration", ""),
                "savingThrow": fields.get("saving throw", ""),
                "save": parse_saving_throw(fields.get("saving throw", "")),
                "damage": parse_damage(name, trailing_prose(lines, start, end, PSIONIC_LABELS)),
                "areaShape": parse_area(fields.get("area", "") or fields.get("effect", "")),
                "description": trailing_prose(lines, start, end, PSIONIC_LABELS),
                "srdUrl": srd.page_url(page),
            })

    return [powers[k] for k in sorted(powers)]


# The sections of "Table: Actions in Combat". The section heading is written
# as a row of the same table, so the parser tracks which one it is inside.
ACTION_SECTIONS = {
    "attack actions": "attack",
    "move actions": "move",
    "full-round actions": "fullRound",
    "free actions": "free",
    "action type varies": "varies",
    "no action": "none",
}

# The SRD marks footnotes by appending a number to a cell: "Draw a weapon 3",
# "Maybe 2", "-2 2", and once "Trip an opponent4 4". Matching a bare trailing
# number would eat the cell itself, since "-2" is a whole modifier — so a
# marker has to be separated by whitespace, or glued to a letter.
FOOTNOTE_SPACED = re.compile(r"\s+\d+\s*$")
FOOTNOTE_GLUED = re.compile(r"(?<=[a-zA-Z])\d+$")

# Every modifier in the combat tables is written with an explicit sign, which
# is what separates one from a stray footnote marker in its own cell.
SIGNED = re.compile(r"^[+-]\d+$")


def strip_footnote(text: str) -> str:
    text = FOOTNOTE_SPACED.sub("", (text or "").strip()).strip()
    return FOOTNOTE_GLUED.sub("", text).strip()


def footnote_markers(text: str) -> set[int]:
    """The footnote numbers a cell carries."""
    match = FOOTNOTE_SPACED.search((text or "").strip())
    return {int(match.group().strip())} if match else set()


def signed_int(text: str) -> int | None:
    """A modifier cell as a number, or None where the cell holds no modifier."""
    value = strip_footnote(text)
    return int(value) if SIGNED.match(value) else None


CREATURE_TYPE_LABELS = {
    "hit die", "base attack bonus", "good saving throws", "skill points", "feats",
}

# "Base Attack Bonus (A): Use this column for aberrations, animals..." The page
# names which column each type uses in a footnote rather than in the entry.
BAB_COLUMN = re.compile(r"Base Attack Bonus \(([ABC])\)\s*$")


# The fifteen type names, longest first so "monstrous humanoid" is matched
# before "humanoid".
CREATURE_TYPE_NAMES = [
    "monstrous humanoid", "magical beast", "aberration", "animal", "construct",
    "dragon", "elemental", "fey", "giant", "humanoid", "ooze", "outsider",
    "plant", "undead", "vermin",
]


def creature_type_id(text: str) -> str:
    """"elemental (air)" and "Monstrous Humanoid" both name a type."""
    lowered = (text or "").lower()
    for name in CREATURE_TYPE_NAMES:
        if name in lowered:
            return camel(name)
    return ""


def creature_subtype(text: str) -> str:
    """The parenthetical a stat block adds: "elemental (air)"."""
    match = re.search(r"\(([^)]*)\)", text or "")
    return match.group(1).strip() if match else ""


def scrape_creature_types() -> dict:
    """The fifteen creature types, and the progression table they share.

    Each type sets a hit die, which of three base attack columns it uses, its
    good saves, and how many skill points and feats it gets — everything you
    need to build one rather than copy one. The per-size table that follows
    each entry gives ability ranges and natural attack damage for that size.
    """
    page = srd.fetch("creaturetypes.html")
    lines = text_lines(page)
    tables = srd.annotated_tables(page)

    progression_table = find_table(tables, "good save bonus", "base attack bonus")
    progression = []
    for row in (progression_table["rows"] if progression_table else []):
        # "1 or less" is the first row's label.
        hit_dice = srd.to_int(row[0], 0) or 0
        if not hit_dice or len(row) < 6:
            continue
        progression.append({
            "hitDice": hit_dice,
            "goodSave": srd.to_int(row[1], 0) or 0,
            "poorSave": srd.to_int(row[2], 0) or 0,
            # Kept as printed: "+11/+6/+1" is three attacks, not a number.
            "attackA": row[3].strip(),
            "attackB": row[4].strip(),
            "attackC": row[5].strip(),
        })

    # Which column each type uses, from the three footnotes under the table.
    columns = {}
    for i, line in enumerate(lines):
        match = BAB_COLUMN.match(line.strip())
        if match and i + 1 < len(lines) and is_value(lines[i + 1]):
            # ": Use this column for aberrations, animals, constructs, ..."
            listed = value_of(lines[i + 1]).split("for", 1)[-1]
            for name in re.split(r",|\band\b", listed):
                name = re.sub(r"[^a-z ]", "", name.lower()).strip()
                if name:
                    columns[singular(name)] = match.group(1)

    # Each type's own size table follows its entry, in page order.
    size_tables = [t for t in tables
                   if t["header"][:1] == ["Size"] and "Minimum HD" in t["header"]]

    # Anchored on "Hit Die" and walked back to the heading, rather than on the
    # generic entry finder: every size table on this page is full of short
    # cells like "1" and "-" that sit within its lookahead of the next type's
    # labels, and each one was being read as a creature type.
    starts = []
    for i, line in enumerate(lines):
        if line.strip() != "Hit Die":
            continue
        for back in range(1, 4):
            candidate = lines[i - back].strip()
            if not candidate or is_value(candidate) or len(candidate) > 30:
                continue
            starts.append(i - back)
            break

    types = []
    for position, start in enumerate(starts):
        end = starts[position + 1] if position + 1 < len(starts) else len(lines)
        name = lines[start]
        fields = collect_labels(lines, start + 1, end, CREATURE_TYPE_LABELS)
        if "hit die" not in fields:
            continue

        key = singular(name.lower())
        types.append({
            "id": camel(name),
            "name": name,
            # A description sits between the heading and the labels, except
            # where the SRD prints none.
            "description": (lines[start + 1]
                            if start + 1 < len(lines) and lines[start + 1].strip() != "Hit Die"
                            else ""),
            "hitDie": fields["hit die"].strip(),
            # A, B or C — which column of the shared progression table.
            "baseAttack": columns.get(key, "A"),
            "baseAttackText": fields.get("base attack bonus", ""),
            "goodSaves": [SAVE_NAMES[word.lower()]
                          for word in re.findall(r"[A-Za-z]+", fields.get("good saving throws", ""))
                          if word.lower() in SAVE_NAMES],
            "skillPoints": fields.get("skill points", ""),
            "feats": fields.get("feats", ""),
            "traits": creature_traits(lines, start, end, CREATURE_TYPE_LABELS),
            "sizes": size_rows(size_tables[len(types)] if len(types) < len(size_tables) else None),
            "srdUrl": srd.page_url("creaturetypes.html"),
        })

    return {"progression": progression, "types": types}


def singular(name: str) -> str:
    """"Aberrations" and "Oozes" both name the aberration and ooze types."""
    name = name.strip().lower()
    if name.endswith("ies"):
        return name[:-3] + "y"
    return name[:-1] if name.endswith("s") else name


def creature_traits(lines, start, end, labels) -> list[dict]:
    """The extra traits a type grants, after its label block.

    Written the same way as the labelled fields but with names the label set
    does not know — "Darkvision (Ex)", "Immunities", "Repairable" — so they are
    read by shape rather than by name.
    """
    traits = []
    for i in range(start, min(end, len(lines) - 1)):
        line = lines[i]
        if is_label(line, labels) or is_value(line) or line.startswith("Table:"):
            continue
        if is_value(lines[i + 1]) and len(line) < 60:
            traits.append({"name": line.strip(), "text": value_of(lines[i + 1])})
    return traits


def size_rows(table) -> list[dict]:
    """A type's per-size table: ability ranges and natural attack damage."""
    if not table:
        return []
    header = [c.strip().lower() for c in table["header"]]
    rows = []
    for raw in table["rows"]:
        if not raw or raw[0].strip() not in SIZE_NAMES:
            continue
        cell = {name: (raw[i].strip() if i < len(raw) else "")
                for i, name in enumerate(header)}
        rows.append({
            "size": cell.get("size", ""),
            "str": cell.get("str", ""),
            "dex": cell.get("dex", ""),
            "con": cell.get("con", ""),
            "minimumHD": cell.get("minimum hd", ""),
            "extraHitPoints": srd.to_int(cell.get("extra hit points", ""), 0) or 0,
            "slam": cell.get("slam", ""),
            "bite": cell.get("bite", ""),
            "claw": cell.get("claw", ""),
            "gore": cell.get("gore", ""),
        })
    return rows


SIZE_NAMES = {
    "Fine", "Diminutive", "Tiny", "Small", "Medium-size",
    "Large", "Huge", "Gargantuan", "Colossal",
}


def scrape_combat_actions() -> list[dict]:
    """"Table: Actions in Combat": what each action costs and what it provokes.

    The whole action economy is this one table. Every row names an action, the
    section it sits in gives its cost, and the second column says whether it
    provokes an attack of opportunity — "This column indicates whether the
    action itself, not moving, provokes an attack of opportunity."
    """
    table = next(
        (t for t in srd.annotated_tables(srd.fetch("combatactions.html"))
         if "attack of opportunity" in " ".join(t["header"]).lower()),
        None,
    )
    if not table:
        print("  ! combatactions.html: no actions table found", file=sys.stderr)
        return []

    actions = []
    # The header names the first section; later ones arrive as rows.
    section = ACTION_SECTIONS.get(table["header"][0].strip().lower(), "attack")

    for row in table["rows"]:
        name = strip_footnote(row[0] if row else "")
        if not name:
            continue
        # A footnote paragraph is one long cell with no second column.
        if len(row) < 2:
            continue
        heading = ACTION_SECTIONS.get(name.lower())
        if heading:
            section = heading
            continue

        provokes = strip_footnote(row[1]).lower()
        actions.append({
            "id": camel(name),
            "name": name,
            "action": section,
            # "Yes", "No", "Maybe", "Usually", "Varies" — kept as the SRD
            # writes it, because three of the five are a judgement call.
            "provokes": provokes or "no",
            "srdUrl": srd.page_url("combatactions.html"),
        })
    return actions


def scrape_combat_tables() -> dict:
    """The numbers combat modifies rolls by: attacks, Defense, cover, extra attacks."""
    def rows_of(page, *needles):
        for table in srd.annotated_tables(srd.fetch(page)):
            header = " ".join(table["header"]).lower()
            if all(n in header for n in needles):
                return table
        return None

    # "The defender loses any Dexterity bonus to Defense" is footnote 2 of the
    # Defense table and footnote 3 of the attack table; the SRD marks the rows
    # it applies to rather than giving it a column.
    LOSES_DEX_FOOTNOTE = {"defense": 2, "attack": 3}

    def modifiers(table, label):
        """A circumstance table: melee and ranged modifiers per circumstance."""
        out = []
        for row in table["rows"] if table else []:
            circumstance = strip_footnote(row[0])
            # A footnote paragraph is a row that starts with its own marker.
            if not circumstance or re.match(r"^\d+\s", row[0].strip()) or len(row) < 2:
                continue
            melee = signed_int(row[1])
            ranged = signed_int(row[2]) if len(row) > 2 else None
            # "--- See Cover ---" is a cross-reference, not a modifier.
            if melee is None and ranged is None:
                continue
            markers = footnote_markers(row[1]) | (footnote_markers(row[2]) if len(row) > 2 else set())
            out.append({
                "id": camel(circumstance),
                "circumstance": circumstance,
                "applies": label,
                "melee": melee or 0,
                "ranged": ranged or 0,
                "losesDex": LOSES_DEX_FOOTNOTE[label] in markers,
            })
        return out

    combat_mods = srd.fetch("combatmods.html")
    tables = srd.annotated_tables(combat_mods)
    defense = next((t for t in tables if t["header"][:1] == ["Circumstance"]
                    and "Defender" in " ".join(r[0] for r in t["rows"][:2])), None)
    attack = next((t for t in tables if t["header"][:1] == ["Circumstance"]
                   and "Attacker" in " ".join(r[0] for r in t["rows"][:2])), None)
    cover = rows_of("combatmods.html", "degree of cover")
    concealment = rows_of("combatmods.html", "concealment")
    extra = rows_of("basicclasses.html", "base attack bonus", "modifiers")
    two_weapon = rows_of("combatactions.html", "primary hand", "off-hand")

    return {
        "defenseModifiers": modifiers(defense, "defense"),
        "attackModifiers": modifiers(attack, "attack"),
        "cover": [
            {
                "id": camel(row[0].split("(")[0]),
                "degree": row[0].split("(")[0].strip(),
                "example": (re.search(r"\(([^)]*)\)", row[0]) or [None, ""])[1],
                "defense": signed_int(row[1]) or 0,
                "reflex": signed_int(row[2]) or 0,
            }
            for row in (cover["rows"] if cover else [])
            if len(row) > 2 and not re.match(r"^\d+\s", row[0])
        ],
        "concealment": [
            {
                "id": camel(row[0].split("(")[0]),
                "degree": row[0].split("(")[0].strip(),
                "missChance": srd.to_int(row[1], 0) or 0,
            }
            for row in (concealment["rows"] if concealment else [])
            if len(row) > 1 and "%" in row[1]
        ],
        # "A resulting value of +6 or higher provides the hero with multiple
        # attacks." The column lists the extra attacks, not the first.
        "extraAttacks": [
            {
                "baseAttack": srd.to_int(row[0], 0) or 0,
                "extra": [srd.to_int(part, 0) or 0 for part in row[1].split("/")],
            }
            for row in (extra["rows"] if extra else [])
            if len(row) > 1 and srd.to_int(row[0], 0)
        ],
        "twoWeapon": [
            {
                "id": camel(row[0]),
                "circumstance": row[0].strip(),
                "primary": srd.to_int(row[1], 0) or 0,
                "offHand": srd.to_int(row[2], 0) or 0,
            }
            for row in (two_weapon["rows"] if two_weapon else [])
            if len(row) > 2
        ],
    }


def scrape_vehicles() -> list[dict]:
    """Vehicles, which the SRD tabulates with the full stat line."""
    vehicles = {}
    # d20 Future's vehicles have shared this dataset from the start; Urban
    # Arcana's were the one book left out.
    for page in ("vehicles.html", "futurevehicles.html", "urbanvehicles.html"):
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


NUMBER_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
    "thirteen": 13, "fourteen": 14, "fifteen": 15, "sixteen": 16,
}

# The boilerplate that sits between the instruction and the actual list.
SKILL_LIST_SPLIT = re.compile(r"using that skill\.\s*", re.I)


def split_outside_parens(text: str) -> list[str]:
    """Split on commas that are not inside parentheses.

    Skill entries carry their specialties in brackets - "Knowledge (arcane
    lore, streetwise)" is one entry containing two commas - so a plain split
    would shred them.
    """
    parts, depth, current = [], 0, []
    for char in text:
        if char == "(":
            depth += 1
        elif char == ")":
            depth = max(0, depth - 1)
        if char == "," and depth == 0:
            parts.append("".join(current))
            current = []
            continue
        current.append(char)
    parts.append("".join(current))
    return [p.strip(" .;") for p in parts if p.strip(" .;")]


def parse_skill_choices(text: str, skill_names: list[tuple[str, str]]) -> dict:
    """Turn "Choose three of the following skills ... A, B, C." into options."""
    if not text:
        return {"count": 0, "options": []}

    match = re.search(r"choose (\w+) of the following", text, re.I)
    count = NUMBER_WORDS.get(match.group(1).lower(), 0) if match else 0

    tail = SKILL_LIST_SPLIT.split(text, maxsplit=1)
    listing = tail[1] if len(tail) > 1 else text

    options = []
    seen = set()
    for entry in split_outside_parens(listing):
        entry = re.sub(r"^(and|or)\s+", "", entry, flags=re.I).strip()
        if not entry:
            continue

        # Longest name first so "Read/Write Language" wins over "Language".
        prefix = next((sid for name, sid in skill_names if entry.lower().startswith(name.lower())), None)
        if prefix:
            matches = [(prefix, entry)]
        else:
            # Some lists end in a clause rather than a name, e.g. Academic's
            # "or add a new Read/Write Language or a new Speak Language".
            # Take every skill named inside it.
            matches = [(sid, name) for name, sid in skill_names if name.lower() in entry.lower()]
            # Drop a match wholly contained in a longer one already taken.
            taken = []
            for sid, label in matches:
                if not any(label.lower() in other.lower() and label != other for _, other in matches):
                    taken.append((sid, label))
            matches = taken

        for sid, label in matches:
            if sid in seen:
                continue
            seen.add(sid)
            bracket = re.search(r"\(([^)]*)\)", label)
            subjects = split_outside_parens(bracket.group(1)) if bracket else []
            options.append({
                "skill": sid,
                "label": label,
                "specialties": [x.strip().title() for x in subjects if x.strip()]
            })

    return {"count": count, "options": options}


def parse_feat_choices(text: str) -> list[str]:
    """Turn "Select one of the following: A, B, or C." into a list of names."""
    if not text:
        return []
    listing = re.sub(r"^.*?(?::|either)\s*", "", text, count=1, flags=re.I | re.S)
    names = []
    for entry in split_outside_parens(listing):
        # "either A or B" carries no comma, so split those too - but only
        # where there is no bracket, since a feat's parenthetical can contain
        # its own "or".
        pieces = re.split(r"\s+or\s+", entry) if "(" not in entry else [entry]
        for piece in pieces:
            piece = re.sub(r"^(and|or)\s+", "", piece, flags=re.I).strip(" .")
            # Anything sentence-length is prose, not a feat name.
            if piece and len(piece.split()) <= 6 and piece not in names:
                names.append(piece)
    return names


# "The fourteen Knowledge categories, and the topics each one encompasses..."
# The SRD states its own count, which is what separates the list from the
# section headings that follow it in the same name/description shape.
CATEGORY_INTRO = re.compile(r"The (\w+) (\w[\w/ ]*?) categories,", re.I)

# Skills whose specialty is chosen freely rather than from a stated list.
OPEN_SPECIALTIES = {"profession", "readWriteLanguage", "speakLanguage"}


def scrape_skill_specialties() -> dict:
    """The category list for each skill that is taken per subject."""
    lines = text_lines(srd.fetch(srd.PAGES["skills"]))
    found = {}

    for index, line in enumerate(lines):
        match = CATEGORY_INTRO.search(line)
        if not match:
            continue
        count = NUMBER_WORDS.get(match.group(1).lower())
        skill = camel(match.group(2).strip())

        categories = []
        cursor = index + 1
        while cursor + 1 < len(lines):
            name, value = lines[cursor], lines[cursor + 1]
            if not is_value(value) or len(name) > 45 or is_value(name):
                break
            categories.append(name)
            cursor += 2

        found[skill] = categories[:count] if count else categories

    # Craft's categories are separate headings rather than a listed set.
    craft = sorted({
        m.group(1) for m in (re.match(r"^Craft \(([a-z ]+)\)$", l) for l in lines) if m
    })
    if craft:
        found["craft"] = [c.title() for c in craft]

    for key in OPEN_SPECIALTIES:
        found.setdefault(key, [])

    return {key: {"options": value, "open": key in OPEN_SPECIALTIES}
            for key, value in sorted(found.items())}


def parse_pounds(text: str) -> tuple[int, int]:
    """Lower and upper bound of a load cell: "up to 6 lb." or "7-13 lb."."""
    numbers = [int(n) for n in re.findall(r"\d+", text or "")]
    if not numbers:
        return (0, 0)
    if len(numbers) == 1:
        return (0, numbers[0])
    return (numbers[0], numbers[-1])


def scrape_carrying_capacity() -> dict:
    """Load thresholds by Strength, and the speeds encumbrance reduces you to.

    d20 Modern's encumbrance costs speed rather than the 3.5 Dex cap and check
    penalty: "An encumbered character's speed is reduced to the value given
    below". The two speed tables give those values.
    """
    page_html = srd.fetch(srd.PAGES["equipment"])
    tables = srd.annotated_tables(page_html)

    loads = {}
    speeds = []
    for table in tables:
        header = [c.strip().lower() for c in table["header"]]
        if "strength" in header and any("light load" in c for c in header):
            for row in table["rows"]:
                if not row or not row[0].strip().isdigit():
                    continue
                strength = int(row[0])
                cells = [c for c in row[1:] if c.strip()]
                if not cells:
                    continue
                light = parse_pounds(cells[0])[1]
                heavy_low, heavy_max = parse_pounds(cells[-1])
                # The Strength 1 row omits its medium cell, so medium's ceiling
                # is derived from where heavy begins rather than read directly.
                medium = heavy_low - 1 if heavy_low else light
                loads[strength] = {"light": light, "medium": medium, "heavy": heavy_max}
        elif header[:2] == ["previous speed", "current speed"]:
            speeds.append({
                srd.to_int(row[0]): srd.to_int(row[1])
                for row in table["rows"] if len(row) >= 2 and srd.to_int(row[0])
            })

    return {
        "loads": loads,
        # The first speed table is the medium-load reduction, the second heavy.
        "mediumSpeed": speeds[0] if speeds else {},
        "heavySpeed": speeds[1] if len(speeds) > 1 else {},
    }


def scrape_conditions() -> list[dict]:
    """The condition summary: a name, then its rules text."""
    lines = text_lines(srd.fetch(srd.PAGES["conditions"]))
    try:
        start = next(i for i, l in enumerate(lines) if l == "CONDITION SUMMARY")
    except StopIteration:
        return []

    conditions = []
    for index in range(start, len(lines) - 1):
        name, description = lines[index], lines[index + 1]
        if not is_value(description) or is_value(name) or not (2 < len(name) < 32):
            continue
        conditions.append({
            "id": camel(name),
            "name": name,
            "description": value_of(description),
            "srdUrl": srd.page_url(srd.PAGES["conditions"]),
        })
    return conditions


def scrape_special_ammunition() -> list[dict]:
    """Exotic ammunition types, which modify a calibre rather than replace it.

    The SRD prices them as a purchase DC modifier on an ordinary purchase, so
    they are a variant of a calibre and not a product in their own right.
    """
    try:
        page_html = srd.fetch("urbanweapons.html")
    except Exception:
        return []

    for table in srd.annotated_tables(page_html):
        header = [c.strip().lower() for c in table["header"]]
        if header[:1] != ["ammunition type"]:
            continue

        out = []
        for row in table["rows"]:
            name = row[0].strip()
            # The table ends with a footnote about the tranquilizer's pricing.
            if not name or name.startswith("*") or len(row) < 2:
                continue
            out.append({
                "id": camel(name),
                "name": name,
                "purchaseDCModifier": row[1].strip(),
                "restriction": row[2].strip() if len(row) > 2 else "",
                "srdUrl": srd.page_url("urbanweapons.html"),
            })
        return out
    return []


# The size words the object tables use, which are the creature size words with
# "Medium-size" written out.
OBJECT_SIZES = {
    "fine": "fine", "diminutive": "diminutive", "tiny": "tiny", "small": "small",
    "medium-size": "medium", "medium": "medium", "large": "large", "huge": "huge",
    "gargantuan": "gargantuan", "colossal": "colossal",
}


def object_size(text: str) -> str:
    """The size an object table row names, ignoring the example beside it."""
    word = re.sub(r"\(.*", "", text or "").strip().lower()
    return OBJECT_SIZES.get(word, "")


def scrape_objects() -> dict:
    """What it takes to break something: hardness, hit points and Defense.

    Three tables on the same page. Objects have a Defense by size, a hardness
    subtracted from every hit, hit points by substance or by size, and a break
    DC for forcing them open rather than destroying them - and the system has
    been storing hardness on vehicles since they were imported while nothing
    subtracted it.
    """
    page = "combatsa.html"
    page_html = srd.fetch(page)
    url = srd.page_url(page)
    sizes, substances, objects = [], [], []

    for table in srd.annotated_tables(page_html):
        header = [c.strip().lower() for c in table["header"]]
        rows = [(row, kind) for row, kind in zip(table["rows"], table["kinds"])
                if kind not in ("blank", "header")]

        if header[:2] == ["size", "defense"]:
            for row, _ in rows:
                size = object_size(row[0])
                if size:
                    sizes.append({
                        "size": size,
                        "example": (re.search(r"\((.*)\)", row[0]) or [None, ""])[1],
                        "defense": srd.to_int(row[1]),
                    })
        elif header[:3] == ["substance", "hardness", "hit points"]:
            for row, _ in rows:
                if row[0].strip():
                    substances.append({
                        "id": camel(row[0]),
                        "name": row[0].strip(),
                        "hardness": srd.to_int(row[1]),
                        # "10/inch of thickness": the SRD gives a rate, not a total.
                        "hitPointsPerInch": srd.to_int(row[2]),
                    })
        elif header[:4] == ["object", "hardness", "hit points", "break dc"]:
            objects.extend(parse_object_rows(rows, url))

    return {"sizes": sizes, "substances": substances, "objects": objects,
            "srdUrl": url}


def parse_object_rows(rows, url: str) -> list[dict]:
    """The named objects, and the by-size row of manufactured ones.

    The table groups its rows under headings - "Lock", "Manufactured objects" -
    and the SRD's own markup repeats the Gargantuan and Colossal rows of the
    manufactured group three times over, so an entry already seen under the
    same heading is the same entry.
    """
    group = ""
    out, seen = [], set()
    for row, kind in rows:
        label = row[0].strip()
        if not label:
            continue
        # A heading has no numbers beside it.
        if len(row) < 4 or not any(cell.strip() for cell in row[1:4]):
            # "Manufactured objects 1" - the heading carries a footnote marker.
            group = re.sub(r"\s+\d+$", "", label)
            continue
        if label.lower().startswith(("figures for", "1 figures")):
            continue

        size = object_size(label)
        name = f"{group} ({label})" if group and not size else label
        key = (group, label)
        if key in seen:
            continue
        seen.add(key)
        if size:
            # The manufactured-objects group is the by-size table itself, and
            # the named objects printed after it - a steel door, a chain - are
            # entries in their own right rather than more of the group.
            group = ""
        out.append({
            "id": camel(name),
            "name": name,
            "group": group,
            # A row of the manufactured-objects table is a size rather than a
            # thing: those are the defaults for anything not printed by name.
            "size": size,
            "hardness": srd.to_int(row[1]),
            "hitPoints": srd.to_int(row[2]),
            "breakDC": srd.to_int(row[3]),
            "srdUrl": url,
        })
    return out

def scrape_advancement() -> dict:
    """What changes when a creature gains Hit Dice.

    "The GM can improve a creature by increasing its Hit Dice. The Advancement
    entry indicates the increased Hit Dice (and often size) of the creature."
    Two tables: what a step up in size does to the physical abilities and the
    natural armor, and what each creature type gains in skill points and feats
    per extra Hit Die.
    """
    page = "advancement.html"
    page_html = srd.fetch(page)
    url = srd.page_url(page)
    sizes, types = [], []

    for table in srd.annotated_tables(page_html):
        header = [re.sub(r"\s+\d+$", "", c.strip().lower()) for c in table["header"]]

        if header[:2] == ["old size", "new size"]:
            for row in table["rows"]:
                old, new_size = object_size(row[0]), object_size(row[1] if len(row) > 1 else "")
                if not old or not new_size:
                    continue
                sizes.append({
                    "from": old,
                    "to": new_size,
                    "str": srd.to_int(row[2]),
                    "dex": srd.to_int(row[3]),
                    "con": srd.to_int(row[4]),
                    "naturalArmor": srd.to_int(row[5]) if len(row) > 5 else 0,
                })
        elif header[:3] == ["type", "bonus skill points", "bonus feats"]:
            for row in table["rows"]:
                name = row[0].strip()
                if not name or name.lower().startswith("1 "):
                    continue
                types.append({
                    "id": creature_type_id(name),
                    "name": name,
                    # Kept as the SRD's own phrasing: "+2 per extra HD", "6 +
                    # Int modifier per extra HD", and "-" for the types that
                    # gain neither. Reading it as a number would mean
                    # inventing one for the two that depend on Intelligence.
                    "skillPoints": re.sub(r"\s+\d+$", "", row[1].strip()),
                    "feats": row[2].strip() if len(row) > 2 else "",
                })

    return {"sizes": sizes, "types": types, "srdUrl": url}

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
    specialties = scrape_skill_specialties()
    write("skill_specialties.json", specialties)
    write("carrying.json", scrape_carrying_capacity())
    write("special_ammunition.json", scrape_special_ammunition())
    conditions = scrape_conditions()
    write("conditions.json", conditions)
    classes = scrape_classes(skills)
    write("classes.json", classes)
    feats = scrape_feats()
    write("feats.json", feats)
    occupations = scrape_occupations(skills)
    write("occupations.json", occupations)
    talents = scrape_talents()
    write("talents.json", talents)
    creatures = scrape_creatures(pages, skills)
    write("creatures.json", creatures)
    creature_types = scrape_creature_types()
    write("creature_types.json", creature_types)
    special_abilities = scrape_special_abilities()
    write("special_abilities.json", special_abilities)

    combat_actions = scrape_combat_actions()
    write("combat_actions.json", combat_actions)
    combat_tables = scrape_combat_tables()
    write("combat_tables.json", combat_tables)

    spells = scrape_spells([p for p in pages if "spelldesc" in p or "spells" in p])
    write("spells.json", spells)
    psionics = scrape_psionics([p for p in pages if "power" in p or "psidesc" in p])
    write("psionics.json", psionics)
    vehicles = scrape_vehicles()
    write("vehicles.json", vehicles)
    objects = scrape_objects()
    write("objects.json", objects)
    advancement = scrape_advancement()
    write("advancement.json", advancement)
    write("purchase_tables.json", scrape_purchase_tables(pages))
    write("tables.json", tables)

    levels = sum(len(c["progression"]) for c in classes)
    print(f"\n{len(skills)} skills ({sum(len(v['options']) for v in specialties.values())} specialties), {len(classes)} classes ({levels} levels), "
          f"{len(feats)} feats, {len(occupations)} occupations, {len(talents)} talents, "
          f"{len(combat_actions)} combat actions, "
          f"{len(creature_types['types'])} creature types, "
          f"{len(special_abilities)} special abilities, "
          f"{len(creatures)} creatures, {len(spells)} spells, "
          f"{len(psionics)} psionic powers, {len(vehicles)} vehicles, "
          f"{len(conditions)} conditions, "
          f"{len(objects['objects'])} objects, "
          f"{len(advancement['sizes'])} advancement steps, "
          f"{sum(len(v) for v in tables.values())} tables")
    return 0


if __name__ == "__main__":
    sys.exit(main())
