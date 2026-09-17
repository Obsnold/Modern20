#!/usr/bin/env python3
"""Fail if a compendium document carries text that is not the SRD's.

Every word of prose in these packs is supposed to be Open Game Content taken
from the d20 Modern SRD, and the pack files are the only place some of it
exists — there is no importer left to re-run and no scrape behind every field.
So the packs are the record, and nothing else was checking what is in them.

Three things were, and none of them would have been found by reading:

  - the source website's page footer, scraped into the last item on eleven
    pages: "Questions? Comments? Boredome? Spot a typoe or a broken link?"
    Two of them carried the author's e-mail address, shipped in a compendium.
  - a paragraph of the D&D 3.5 ring of the ram on the d20 Modern one, on an
    item declaring d20 Modern as its source and linking to the page that does
    not contain it.
  - one item's sentence on another item, reworded: the cloudkill grenade's
    "The price listed is for a box of six grenades" appeared on the
    fragmentation grenade as "The purchase DC given below is...".

This checks the shapes of those, not the whole corpus. A sentence-by-sentence
comparison against data/rules.json was tried first and is not viable: the
creature stat blocks are assembled from table cells and FX descriptions join
bulleted lists, so 720 of 724 flagged sentences were the splitter's fault
rather than the data's. What is checkable without false accusations is that no
document carries an e-mail address, a link to anywhere but the SRD, or the
boilerplate of the site it was scraped from.
"""
from __future__ import annotations

import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKS = os.path.join(ROOT, "src", "packs")

EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")
# The SRD is served from one host, and the Open Game License names two more.
ALLOWED_HOSTS = ("spellbooksoftware.com", "opengamingfoundation.org", "wizards.com")
URL = re.compile(r"https?://([\w.-]+)")

# Boilerplate from the page a document was scraped from, not from the book.
SCRAPER_JUNK = (
    "questions? comments?",
    "boredome",
    "spot a typoe",
    "broken link",
    "back to top",
    "click here",
)

# Fields that hold prose rather than a localisation key or a formula.
PROSE = ("description", "benefit", "normal", "special", "biography", "note")


def prose(system: dict):
    if not isinstance(system, dict):
        return
    for key in PROSE:
        value = system.get(key)
        if isinstance(value, str) and value:
            yield key, value
    for trait in system.get("traits") or []:
        if isinstance(trait, dict) and isinstance(trait.get("description"), str):
            yield f"traits[{trait.get('name')}]", trait["description"]
    for name, activity in (system.get("activities") or {}).items():
        if isinstance(activity, dict) and isinstance(activity.get("note"), str):
            yield f"activities[{name}].note", activity["note"]


def main() -> int:
    problems = []
    documents = 0
    fields = 0

    for pack in sorted(os.listdir(PACKS)):
        directory = os.path.join(PACKS, pack)
        if not os.path.isdir(directory):
            continue
        for name in sorted(os.listdir(directory)):
            if not name.endswith(".json"):
                continue
            path = os.path.join(directory, name)
            with open(path, encoding="utf-8") as handle:
                document = json.load(handle)
            if str(document.get("_key", "")).startswith("!folders!"):
                continue

            entries = [document] + list(document.get("items") or [])
            for entry in entries:
                documents += 1
                where = f"{pack}/{entry.get('name')}"
                for field, text in prose(entry.get("system") or {}):
                    fields += 1
                    plain = re.sub(r"<[^>]+>", " ", text)

                    found = EMAIL.search(plain)
                    if found:
                        problems.append(
                            f'{where} .{field} carries an e-mail address, '
                            f'"{found.group(0)}"'
                        )

                    for host in URL.findall(plain):
                        if not any(host.endswith(good) for good in ALLOWED_HOSTS):
                            problems.append(
                                f'{where} .{field} links to "{host}", which is '
                                "not the SRD or the licence"
                            )

                    lowered = plain.lower()
                    for junk in SCRAPER_JUNK:
                        if junk in lowered:
                            problems.append(
                                f'{where} .{field} carries "{junk}" from the '
                                "page it was scraped from, not from the book"
                            )

    for problem in problems:
        print(f"FAIL  {problem}")
    print(f"\n{documents} documents and {fields} prose fields checked for text "
          f"that is not the book's, {len(problems)} problems")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
