#!/usr/bin/env python3
"""Fail if the packs cover less of the SRD than they did before.

Every other check compares the import against itself or against the mirror it
was scraped from, so a whole format going unread is invisible: the creature
scrape only ever parsed table-shaped stat blocks, and the fifty-four creatures
the SRD prints as paragraphs — every animal, the alien probe, the zap — were
missing for months without a single check going red.

data/rules.json is an independent list of what the books contain, taken from
the SRD's own pages rather than from the tables this pipeline parses. This
walks the headings inside them and counts how many have a document in a pack,
against the figures recorded in data/coverage.json.

A count that drops is a regression and fails. A count that rises is progress
and has to be recorded, which is the point: the file is the audit, kept
current by the build rather than by memory.

    python3 scripts/check_coverage.py
    python3 scripts/check_coverage.py --update    # after importing more
"""
import argparse
import collections
import glob
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE = os.path.join(ROOT, "data", "coverage.json")


def imported_names() -> set[str]:
    """Every name in every pack, embedded documents included.

    Never the rules pack: its pages are the SRD's own sections, so counting
    them would have every section matching itself. The first version of this
    check did, reported 1,114 of 1,148 sections covered, and went on reporting
    it after a creature was deleted from the compendium.
    """
    names = set()
    for path in glob.glob(os.path.join(ROOT, "src", "packs", "*", "*.json")):
        if os.path.basename(os.path.dirname(path)) == "rules":
            continue
        with open(path, encoding="utf-8") as handle:
            document = json.load(handle)
        if document.get("_key", "").startswith("!folders!"):
            continue
        if document.get("name"):
            names.add(document["name"].lower())
        # A section can be covered by documents that name it as their category
        # rather than by one document per section: the SRD heads a page
        # "Potions" and prints twelve of them inside it.
        category = (document.get("system") or {}).get("category")
        if isinstance(category, str) and category:
            names.add(category.lower())
        for child in (document.get("items") or []) + (document.get("pages") or []):
            if child.get("name"):
                names.add(child["name"].lower())
    return names


HEADING = re.compile(r"<h([1-6])[^>]*>(.*?)</h\1>", re.S | re.I)

# A heading that names the shape of the page rather than a piece of content.
STRUCTURAL = re.compile(r"^(?:table:|sidebar:|new |the following)", re.I)

# A heading used on this many pages of one document is a sub-head every entry
# in it carries - "Prerequisite" under each of ninety-five feats, "Special
# Qualities" under each creature - not a thing to be imported.
#
# Counted per document rather than across the whole SRD, because the whole SRD
# is not a fixed quantity: splitting the equipment chapters into a page each
# pushed names that were nowhere near the limit over it, and the coverage of
# skills and feats fell without either being touched.
BOILERPLATE = 8


def headings(markup: str) -> list[str]:
    """Every heading on a page, as text."""
    out = []
    for match in HEADING.finditer(markup):
        text = re.sub(r"\s+", " ", html.unescape(
            re.sub(r"<[^>]+>", "", match.group(2)))).strip()
        if len(text) > 2 and not STRUCTURAL.match(text):
            out.append(text)
    return out


def sections(rules: list[dict]) -> dict[str, list[str]]:
    """What each SRD document contains, by its own headings.

    The mirror publishes a chapter per page - "Weapons", "Creatures A-Z" - so
    the page names are far too coarse to measure coverage with: eight pages
    would stand for four hundred creatures. The headings inside them are the
    entries, which is what the packs are supposed to hold one of each.

    Headings that turn up all over the book are dropped. Every class page has
    a "Talents" heading and every creature a "Special Qualities" one, and
    counting those as content to import would put a floor under the figure
    that never moves.
    """
    found = {}
    for entry in rules:
        pages_with = collections.Counter()
        names = []
        for page in entry["pages"]:
            # The page's own name counts too, and counts once. Where a page
            # is a single entry - the Menace Manual's creatures are a page
            # each - the name and the heading are the same thing, and reading
            # only the headings while skipping the ones that match the page
            # name counted the acid rainer zero times.
            on_page = list(dict.fromkeys(headings(page["html"]) + [page["name"]]))
            names += on_page
            pages_with.update({name.lower() for name in on_page})
        found[entry["id"]] = [name for name in names
                              if pages_with[name.lower()] <= BOILERPLATE]

    return found


def section_name(name: str) -> str:
    """A section heading as the name an entry would carry.

    The SRD heads a feat "Divine Heritage [Initial]" and a creature "Anaconda,
    Giant (Huge)"; the bracketed category and the parenthesised variant are not
    part of the name a pack stores.
    """
    return re.sub(r"\s*[\[(].*", "", name).strip().lower()


def coverage() -> dict[str, dict]:
    """How much of each SRD document has documents behind it."""
    names = imported_names()
    with open(os.path.join(ROOT, "data", "rules.json"), encoding="utf-8") as handle:
        rules = json.load(handle)

    contents = sections(rules)
    out = {}
    for entry in rules:
        headings_here = contents[entry["id"]]
        matched = sum(1 for name in headings_here if section_name(name) in names)
        out[entry["id"]] = {
            "book": entry["book"],
            "title": entry["title"],
            "sections": len(headings_here),
            "matched": matched,
        }
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--update", action="store_true",
                        help="record the current coverage as the new floor")
    args = parser.parse_args()

    current = coverage()

    if args.update or not os.path.exists(BASELINE):
        with open(BASELINE, "w", encoding="utf-8") as handle:
            json.dump({
                "_comment": "How much of each SRD document the packs cover, by "
                            "scripts/check_coverage.py. A document with nothing "
                            "matched is either rules text the system implements "
                            "in code, or content not imported yet; the review in "
                            "the README says which. Regenerate with --update "
                            "after importing more, never to make a failure go "
                            "away.",
                "documents": current,
            }, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        total = sum(d["matched"] for d in current.values())
        print(f"data/coverage.json written: {len(current)} documents, {total} sections covered")
        return 0

    with open(BASELINE, encoding="utf-8") as handle:
        recorded = json.load(handle)["documents"]

    problems = 0
    for document_id, was in recorded.items():
        now = current.get(document_id)
        if not now:
            print(f"FAIL  {was['title']} is no longer in data/rules.json")
            problems += 1
            continue
        if now["matched"] < was["matched"]:
            print(f"FAIL  {was['title']}: {was['matched']} of {was['sections']} "
                  f"sections had documents, now {now['matched']}")
            problems += 1

    gained = [(current[i]["title"], current[i]["matched"] - recorded[i]["matched"])
              for i in current if i in recorded
              and current[i]["matched"] > recorded[i]["matched"]]
    for title, more in gained:
        print(f"NOTE  {title}: {more} more sections covered — run --update to record it")

    covered = sum(d["matched"] for d in current.values())
    sections = sum(d["sections"] for d in current.values())
    print(f"\n{len(current)} SRD documents, {covered} of {sections} sections have "
          f"documents behind them, {problems} regressions")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
