#!/usr/bin/env python3
"""Give every document in src/packs the rules page it belongs to.

src/packs is the source of truth: the importer adds documents it does not have
and leaves the rest alone, because a difference there is as likely to be a hand
correction as a parser improvement. So a new field cannot arrive by re-running
the import — it would report 1,391 documents as differing and write none of
them.

This writes that one field and nothing else. Each document keeps every value
it has; `system.rulesPage` is added beside `srdUrl`, which is the same fact
about the same document — where the rules for it are, in the compendium rather
than on the web.

    python3 scripts/link_rules.py             # stamp what is missing or stale
    python3 scripts/link_rules.py --dry-run   # say what would change
    python3 scripts/link_rules.py --report    # list the documents with no page

Re-running is safe and changes nothing: the page a document belongs to is
derived from the SRD, not chosen, and the ids in a UUID are hashes of the pack
and the slug.
"""
from __future__ import annotations

import argparse
import collections
import glob
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_packs  # noqa: E402
import rules_pages  # noqa: E402
import srd  # noqa: E402

PACKS = os.path.join(srd.ROOT, "src", "packs")


def imported() -> dict[tuple[str, str], dict]:
    """What the importer builds, by pack and slug.

    Run for one reason: the heading the SRD printed an equipment table under
    is a page of the rules, and it is known only while the table is being read.
    By the time a handgun is an item in a pack, all it carries is the
    proficiency it needs — so the importer's own answer is better than anything
    that can be worked out from the file on disk.
    """
    built = {}
    for pack, documents in build_packs.build().items():
        if pack == "rules":
            continue
        for document in documents:
            slug = document.get("_slug")
            if slug:
                built[(pack, slug)] = document
    return built


def with_page(system: dict, uuid: str) -> dict:
    """`system`, with rulesPage set and ordered next to srdUrl."""
    out = {}
    for key, value in system.items():
        if key == "rulesPage":
            continue
        out[key] = value
        if key == "srdUrl":
            out["rulesPage"] = uuid
    if "rulesPage" not in out:
        out["rulesPage"] = uuid
    return out


def link(document: dict, built: dict | None, pack: str, index: rules_pages.RulesIndex,
         counts: collections.Counter) -> bool:
    """Set the rules page on one document and its embedded ones."""
    changed = False
    system = document.get("system")
    if system is None:
        return False

    uuid = ((built or {}).get("system") or {}).get("rulesPage")
    if uuid:
        # The importer's own answer, which knew the table heading.
        counts["imported"] += 1
    else:
        found = index.match(document, pack)
        if found:
            counts[found[0]] += 1
            uuid = found[1].uuid
        else:
            counts["none"] += 1

    if uuid and system.get("rulesPage") != uuid:
        document["system"] = with_page(system, uuid)
        changed = True

    # Embedded documents are matched by name against the parent's own, since
    # an id is regenerated on every import and a name is not.
    children = {child["name"]: child for child in ((built or {}).get("items") or [])}
    for child in (document.get("items") or []):
        if link(child, children.get(child["name"]), pack, index, counts):
            changed = True
    return changed


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="report what would change without writing")
    parser.add_argument("--report", action="store_true",
                        help="list the documents that got no page of their own")
    arguments = parser.parse_args()

    index = rules_pages.default()
    built = imported()
    counts: collections.Counter = collections.Counter()
    written = 0
    unlinked = []

    for path in sorted(glob.glob(os.path.join(PACKS, "*", "*.json"))):
        pack = os.path.basename(os.path.dirname(path))
        if pack == "rules":
            continue
        with open(path, encoding="utf-8") as handle:
            document = json.load(handle)
        if document.get("_key", "").startswith("!folders!"):
            continue

        slug = os.path.basename(path)[:-5]
        before = json.dumps(document, ensure_ascii=False)
        changed = link(document, built.get((pack, slug)), pack, index, counts)
        if not (document.get("system") or {}).get("rulesPage"):
            unlinked.append(f"{pack}/{slug}")
        if not changed or json.dumps(document, ensure_ascii=False) == before:
            continue
        written += 1
        if not arguments.dry_run:
            with open(path, "w", encoding="utf-8") as handle:
                json.dump(document, handle, indent=2, ensure_ascii=False)
                handle.write("\n")

    order = ["imported"] + rules_pages.ORDER + ["none"]
    print("Matched: " + ", ".join(f"{counts[how]} by {how}"
                                  for how in order if counts[how]))
    if arguments.report and unlinked:
        print("\nNo rules page at all:")
        for name in unlinked:
            print(f"  {name}")
    verb = "would change" if arguments.dry_run else "changed"
    print(f"\n{written} document(s) {verb}, {len(unlinked)} with no page")
    return 0


if __name__ == "__main__":
    sys.exit(main())
