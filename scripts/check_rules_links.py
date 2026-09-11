#!/usr/bin/env python3
"""Fail if a reference the rules text carries points at nothing.

Every document in every pack carries the page its rules are on, and the sheets
carry a link per topic and per skill. All of those are UUIDs written into JSON
and into a generated module, which is the quietest kind of reference there is:
a UUID that resolves to nothing opens no page, logs nothing, and looks exactly
like one that works until somebody clicks it.

So this resolves all of them against src/packs/rules, which is what compiles
into the compendium:

  - every `system.rulesPage` in every pack, embedded documents included
  - every topic and skill in module/rules-links.mjs
  - that every topic is referenced by a template or a module, since a topic
    nothing links to is a page chosen for no reason
  - every document a rules page lists in its footer, which has to exist, be
    named what the footer calls it, and point back at that page
  - every `@Check[...]` written anywhere in this system - the rules pages and
    the prose the documents carry, a spell's description and a creature
    ability's text alike - which has to name a skill, an ability or a save the
    system actually has, and a subject that skill has

It also holds the coverage, recorded per pack in data/coverage.json: how many
documents carry a link, and how many distinct pages those links reach. The
second figure is the one that measures precision. A matcher that stops
recognising fifty weapons still gives all fifty a link - the chapter they were
printed in - and every link still resolves; what drops is the number of pages
they point at.

    python3 scripts/check_rules_links.py
    python3 scripts/check_rules_links.py --update   # record new coverage
"""
from __future__ import annotations

import argparse
import glob
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_packs  # noqa: E402
import srd  # noqa: E402

ROOT = srd.ROOT
PACKS = os.path.join(ROOT, "src", "packs")
BASELINE = os.path.join(ROOT, "data", "coverage.json")

UUID = re.compile(
    r"^Compendium\.modern20\.rules\.JournalEntry\.(\w{16})\.JournalEntryPage\.(\w{16})$")
LINK = re.compile(r'"(Compendium\.modern20\.rules\.[^"]+)"')

# The same UUID as prose rather than as a JSON value, which is how a random
# table cites the page it was printed on.
CITED = re.compile(r"Compendium\.modern20\.rules\.JournalEntry\.\w{16}"
                   r"\.JournalEntryPage\.\w{16}")
TOPIC_BLOCK = re.compile(r"RULES_TOPICS = \{(.*?)\n\};", re.S)
TOPIC = re.compile(r'"([\w]+)":\s*"([^"]+)"')

# What a rules page says it is the rules for: the footer scripts/link_rules.py
# writes, and each document it lists.
FOOTER = re.compile(r'<section class="m20-in-world">(.*?)</section>', re.S)
LISTED = re.compile(
    r"@UUID\[Compendium\.modern20\.(\w+)\.(?:Item|Actor)\.(\w{16})\]\{([^}]*)\}")

# A roll the rules ask for: "@Check[skill:climb|dc:15]{DC 15 Climb check}".
ROLL = re.compile(r"@Check\[([^\]]*)\](\{([^}]*)\})?")

# The three ability and save keys are the system's own; the skills come from
# the scrape, which check_config.py already holds config.mjs to.
ABILITIES = {"str", "dex", "con", "int", "wis", "cha"}
SAVES = {"fort", "ref", "will"}


def pages() -> dict[str, set[str]]:
    """The page ids of the rules pack, by the entry that holds them."""
    found = {}
    for path in glob.glob(os.path.join(PACKS, "rules", "*.json")):
        with open(path, encoding="utf-8") as handle:
            document = json.load(handle)
        if not document.get("pages"):
            continue
        found[document["_id"]] = {page["_id"] for page in document["pages"]}
    return found


def resolves(uuid: str, rules: dict[str, set[str]]) -> str:
    """Why a UUID does not resolve, or "" if it does."""
    match = UUID.match(uuid or "")
    if not match:
        return "is not a rules page UUID"
    entry, page = match.groups()
    if entry not in rules:
        return f"names entry {entry}, which is not in the rules pack"
    if page not in rules[entry]:
        return f"names page {page}, which that entry does not have"
    return ""


def documents():
    """Every document that carries a rules link, with its embedded ones.

    Not the rules themselves, and not the random tables: a roll table has no
    system data, and the page it came from is cited in its description rather
    than stamped in a field.
    """
    for path in sorted(glob.glob(os.path.join(PACKS, "*", "*.json"))):
        pack = os.path.basename(os.path.dirname(path))
        if pack in ("rules", "tables"):
            continue
        with open(path, encoding="utf-8") as handle:
            document = json.load(handle)
        if document.get("_key", "").startswith("!folders!"):
            continue
        label = f"{pack}/{os.path.basename(path)[:-5]}"
        yield pack, label, document, False
        for child in (document.get("items") or []):
            yield pack, f"{label}: {child.get('name')}", child, True


def topics() -> dict[str, str]:
    """The generated topic links, read as text.

    Parsed rather than imported: the module is ES, the checks that read it are
    Python, and the file is generated in a shape this can rely on.
    """
    path = os.path.join(ROOT, "module", "rules-links.mjs")
    with open(path, encoding="utf-8") as handle:
        source = handle.read()
    block = TOPIC_BLOCK.search(source)
    return dict(TOPIC.findall(block.group(1))) if block else {}


def referenced() -> set[str]:
    """Every topic a template or a module actually links to."""
    used = set()
    for pattern in ("templates/**/*.hbs", "module/**/*.mjs"):
        for path in glob.glob(os.path.join(ROOT, pattern), recursive=True):
            if path.endswith("rules-links.mjs"):
                continue
            with open(path, encoding="utf-8") as handle:
                source = handle.read()
            used |= set(re.findall(r'topic="(\w+)"', source))
            used |= set(re.findall(r'rules:\s*"(\w+)"', source))
    return used


def footers(rules_files: list[str], packs: dict[str, tuple[str, str]]) -> tuple[int, list[str]]:
    """Check what each page says it is the rules for.

    A footer is generated, so its failure mode is staleness rather than a typo:
    a document renamed on its own sheet, or deleted, leaves a page offering
    something that is not there any more.
    """
    listed = 0
    problems = []
    for path in rules_files:
        with open(path, encoding="utf-8") as handle:
            entry = json.load(handle)
        for page in entry.get("pages") or []:
            block = FOOTER.search(page["text"]["content"])
            if not block:
                continue
            uuid = (f"Compendium.modern20.rules.JournalEntry.{entry['_id']}"
                    f".JournalEntryPage.{page['_id']}")
            for pack, document_id, label in LISTED.findall(block.group(1)):
                listed += 1
                found = packs.get(document_id)
                where = f'{entry["name"]}: "{page["name"]}"'
                if not found:
                    problems.append(f"{where} lists {pack}/{document_id}, "
                                    "which is not in any pack")
                    continue
                name, points_at = found
                if html.escape(name) != label:
                    problems.append(f'{where} lists {document_id} as "{label}", '
                                    f'which is called "{name}"')
                if points_at != uuid:
                    problems.append(f'{where} lists "{name}", whose rules page '
                                    "is a different one")
    return listed, problems


def written_rolls(rules_files: list[str]):
    """Every piece of text a roll can be written in, and where it is.

    Two places, because the rules say what to roll in both: the SRD's own pages
    and the prose the documents built from them carry — a spell's description,
    a feat's benefit, a creature ability's rules text.
    """
    for path in rules_files:
        with open(path, encoding="utf-8") as handle:
            entry = json.load(handle)
        for page in entry.get("pages") or []:
            yield f'{entry["name"]}: "{page["name"]}"', page["text"]["content"]

    for pack, label, document, _embedded in documents():
        system = document.get("system") or {}
        for field in build_packs.PROSE_FIELDS:
            text = system.get(field)
            if isinstance(text, str) and text.strip():
                yield f"{label} ({field})", text


def rolls(rules_files: list[str]) -> tuple[int, list[str]]:
    """Check every roll the text of this system offers.

    The failure mode is the same as a dead link and quieter still: a check
    naming a skill the system does not have renders as its own words again, so
    the sentence reads correctly and the die is simply gone.
    """
    with open(os.path.join(ROOT, "data", "skills.json"), encoding="utf-8") as handle:
        skills = {skill["id"]: skill["name"] for skill in json.load(handle)}
    with open(os.path.join(ROOT, "data", "skill_specialties.json"), encoding="utf-8") as handle:
        specialties = json.load(handle)

    found = 0
    problems = []
    for where, text in written_rolls(rules_files):
        for match in ROLL.finditer(text):
            found += 1
            terms = {}
            for term in match.group(1).split("|"):
                key, _, value = term.partition(":")
                terms[key.strip()] = value.strip()

            if match.group(2) is not None and not match.group(3).strip():
                problems.append(f"{where} has a roll with an empty label")
            if terms.get("dc") and not terms["dc"].isdigit():
                problems.append(f'{where}: DC "{terms["dc"]}" is not a number')

            if "skill" in terms:
                if terms["skill"] not in skills:
                    problems.append(f'{where} rolls a skill called "{terms["skill"]}"')
                    continue
                options = (specialties.get(terms["skill"]) or {}).get("options") or []
                subject = terms.get("specialty")
                # An open list - Profession, the two languages - takes any
                # subject, which is what "open" means.
                if subject and options and subject not in options:
                    problems.append(f'{where} rolls {skills[terms["skill"]]} '
                                    f'({subject}), which the SRD does not list')
            elif terms.get("ability") not in ABILITIES and terms.get("save") not in SAVES:
                problems.append(f"{where} rolls {match.group(1)!r}, "
                                "which is not a skill, an ability or a save")
    return found, problems


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--update", action="store_true",
                        help="record the current link coverage as the new floor")
    arguments = parser.parse_args()

    rules = pages()
    if not rules:
        print("FAIL  no rules pack in src/packs/rules")
        return 1

    problems = 0
    checked = 0
    # Every document by id, for checking what the pages say they are about.
    by_id: dict[str, tuple[str, str]] = {}
    # Per pack: how many documents have a link, and how many pages those links
    # reach between them.
    coverage: dict[str, dict[str, int]] = {}
    reached: dict[str, set[str]] = {}

    for pack, label, document, embedded in documents():
        counts = coverage.setdefault(pack, {"documents": 0, "linked": 0, "pages": 0})
        reached.setdefault(pack, set())
        if not embedded:
            counts["documents"] += 1
        uuid = (document.get("system") or {}).get("rulesPage")
        if not uuid:
            continue
        checked += 1
        problem = resolves(uuid, rules)
        if problem:
            problems += 1
            print(f"FAIL  {label}: rulesPage {problem}")
            continue
        if embedded:
            continue
        counts["linked"] += 1
        reached[pack].add(uuid)
        by_id[document["_id"]] = (document["name"], uuid)
    for pack, counts in coverage.items():
        counts["pages"] = len(reached[pack])

    print(f"{checked} document links checked against src/packs/rules")

    rules_files = sorted(glob.glob(os.path.join(PACKS, "rules", "*.json")))
    listed, stale = footers(rules_files, by_id)
    for problem in stale:
        problems += 1
        print(f"FAIL  {problem}")
    print(f"{listed} documents listed by the pages they are the rules for")

    # A random table says which page of the rules printed it, which is a link
    # like any other and dies as quietly.
    cited = 0
    for path in sorted(glob.glob(os.path.join(PACKS, "tables", "*.json"))):
        with open(path, encoding="utf-8") as handle:
            table = json.load(handle)
        for uuid in CITED.findall(table.get("description") or ""):
            cited += 1
            problem = resolves(uuid, rules)
            if problem:
                problems += 1
                print(f"FAIL  the \"{table['name']}\" table cites a page that {problem}")
    if cited:
        print(f"{cited} random tables cite the page they are printed on")

    asked, unrollable = rolls(rules_files)
    for problem in unrollable:
        problems += 1
        print(f"FAIL  {problem}")
    print(f"{asked} rolls the rules and the packs' own text ask for checked")

    declared = topics()
    for topic, uuid in declared.items():
        problem = resolves(uuid, rules)
        if problem:
            problems += 1
            print(f"FAIL  topic {topic}: {problem}")
    unused = set(declared) - referenced()
    for topic in sorted(unused):
        problems += 1
        print(f"FAIL  topic {topic} is generated and nothing links to it")

    path = os.path.join(ROOT, "module", "rules-links.mjs")
    # Every link in the generated module, topics included, which is how the
    # skills are counted: they are the rest of them.
    with open(path, encoding="utf-8") as handle:
        links = LINK.findall(handle.read())
    for uuid in links:
        problem = resolves(uuid, rules)
        if problem:
            problems += 1
            print(f"FAIL  module/rules-links.mjs: {uuid} {problem}")
    print(f"{len(declared)} topics and {len(links) - len(declared)} skill links checked")

    with open(BASELINE, encoding="utf-8") as handle:
        baseline = json.load(handle)

    if arguments.update:
        baseline["links"] = coverage
        with open(BASELINE, "w", encoding="utf-8") as handle:
            json.dump(baseline, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        total = sum(pack["pages"] for pack in coverage.values())
        print(f"\ndata/coverage.json written: {total} rules pages linked to")
        return 0

    recorded = baseline.get("links") or {}
    for pack, was in recorded.items():
        now = coverage.get(pack)
        if not now:
            problems += 1
            print(f"FAIL  the {pack} pack is gone")
            continue
        if now["linked"] < was["linked"]:
            problems += 1
            print(f"FAIL  {pack}: {was['linked']} documents linked to the rules, "
                  f"now {now['linked']}")
        if now["pages"] < was["pages"]:
            problems += 1
            print(f"FAIL  {pack}: its links reached {was['pages']} pages, "
                  f"now {now['pages']}")
        elif now["pages"] > was["pages"]:
            print(f"NOTE  {pack}: {now['pages'] - was['pages']} more pages reached "
                  "— run --update to record it")

    linked = sum(pack["linked"] for pack in coverage.values())
    reach = sum(pack["pages"] for pack in coverage.values())
    total = sum(pack["documents"] for pack in coverage.values())
    print(f"\n{linked} of {total} documents link to the rules, reaching {reach} "
          f"pages, {problems} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
