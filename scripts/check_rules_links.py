#!/usr/bin/env python3
"""Fail if a link into the rules compendium points at nothing.

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
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srd  # noqa: E402

ROOT = srd.ROOT
PACKS = os.path.join(ROOT, "src", "packs")
BASELINE = os.path.join(ROOT, "data", "coverage.json")

UUID = re.compile(
    r"^Compendium\.modern20\.rules\.JournalEntry\.(\w{16})\.JournalEntryPage\.(\w{16})$")
LINK = re.compile(r'"(Compendium\.modern20\.rules\.[^"]+)"')
TOPIC_BLOCK = re.compile(r"RULES_TOPICS = \{(.*?)\n\};", re.S)
TOPIC = re.compile(r'"([\w]+)":\s*"([^"]+)"')


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
    """Every document in every pack but the rules, with its embedded ones."""
    for path in sorted(glob.glob(os.path.join(PACKS, "*", "*.json"))):
        pack = os.path.basename(os.path.dirname(path))
        if pack == "rules":
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
    for pack, counts in coverage.items():
        counts["pages"] = len(reached[pack])

    print(f"{checked} document links checked against src/packs/rules")

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
