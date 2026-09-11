#!/usr/bin/env python3
"""Give every document in src/packs the page and the book it came from.

src/packs is the source of truth: the importer adds documents it does not have
and leaves the rest alone, because a difference there is as likely to be a hand
correction as a parser improvement. So a new field cannot arrive by re-running
the import — it would report 1,391 documents as differing and write none of
them.

This writes two fields and nothing else, both of them facts about where the
document came from. `system.rulesPage` is added beside `srdUrl` — where the
rules for it are, in the compendium rather than on the web. And
`system.source` is corrected where it names the wrong book: everything built
from a scraped dataset claimed to be core, so the Menace Manual's creatures,
Urban Arcana's spells and powers and d20 Future's vehicles all said "d20
Modern SRD". A document whose source already names the right book is left
exactly as it is, whatever it calls it.

A document with no folder is filed in the one the import would have put it in,
which is the same problem again: the feats pack held one book and needed no
folders, so when Urban Arcana's arrived the ninety-five already there stayed at
the root while an empty "d20 Modern" folder appeared beside them. A document
that is already in a folder is never moved — a GM filing things their own way
in Foundry is not a mistake to correct.

It then writes the other direction into the rules pages themselves: a footer on
each page listing the documents that point at it, so the gargoyle's page offers
the gargoyle and the Handguns page offers the twenty-three handguns. Reading
the rules and reaching for the thing they describe is most of what a GM does
with a rules reference. The footer is a generated block, replaced whole on
every run and confined to the end of the page, so the SRD's own text is never
edited.

    python3 scripts/link_rules.py             # stamp what is missing or stale
    python3 scripts/link_rules.py --dry-run   # say what would change
    python3 scripts/link_rules.py --report    # list the documents with no page

Re-running is safe and changes nothing: the page a document belongs to is
derived from the SRD, not chosen, and the ids in a UUID are hashes of the pack
and the slug. Re-running is also what puts the footers back after
`build_packs.py --overwrite rules`, which rebuilds the pages from the SRD and
knows nothing about what points at them.
"""
from __future__ import annotations

import argparse
import collections
import glob
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_packs  # noqa: E402
import rules_pages  # noqa: E402
import srd  # noqa: E402

PACKS = os.path.join(srd.ROOT, "src", "packs")

# The footer, and the pattern that finds the one written last time. Marked with
# a class of its own so it can be replaced without touching a word of the SRD
# around it, and recognised even if a hand edit moves it.
FOOTER = re.compile(r'\s*<section class="m20-in-world">.*?</section>', re.S)
FOOTER_LABEL = "In this world"

# Which document class a pack holds, by the key its documents are stored under.
DOCUMENT_CLASS = {"!items!": "Item", "!actors!": "Actor"}


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

    # The book the page it cites belongs to. Only a document naming the wrong
    # one is corrected: "d20 Modern SRD" and "d20 Modern" are the same book
    # spelled two ways, and a hand-written "Urban Arcana p.42" is a note rather
    # than a mistake.
    url = system.get("srdUrl") or ""
    book = build_packs.book_of(url)
    if book and book not in (system.get("source") or ""):
        system["source"] = build_packs.source_for(url)
        counts["book"] += 1
        changed = True

    folder = (built or {}).get("folder")
    if folder and not document.get("folder"):
        document["folder"] = folder
        counts["filed"] += 1
        changed = True

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


def footer(documents: list[tuple[str, str]]) -> str:
    """The block listing what a page's rules are the rules for.

    `@UUID` rather than an anchor, because that is what Foundry enriches when
    the page is read, and it is what the SRD's own cross-references were
    rewritten to: one kind of link in the compendium, not two.
    """
    # The label is HTML, and four of the weapons are named with an ampersand.
    links = " &middot; ".join(f"@UUID[{uuid}]{{{html.escape(name)}}}"
                              for uuid, name in documents)
    return (f'\n<section class="m20-in-world">'
            f'<hr><p><em>{FOOTER_LABEL}:</em> {links}</p></section>')


def document_uuid(pack: str, document: dict) -> str:
    """The UUID of a compendium document, by the key it is stored under.

    An embedded document's key names its parent's collection - `!actors.items!`
    - and gets no UUID here, which is how the footer is kept to documents a
    reader can open on their own.
    """
    collection = document.get("_key", "").split("!")[1:2]
    kind = DOCUMENT_CLASS.get(f"!{collection[0]}!" if collection else "")
    return f"Compendium.modern20.{pack}.{kind}.{document['_id']}" if kind else ""


def write_footers(pointing: dict[str, list[tuple[str, str]]], *, dry_run: bool) -> int:
    """Put the footer on every rules page something points at, and only there.

    Every page is visited, not only the ones with documents: a page that had a
    footer and no longer earns one has to lose it, which is the case a pass
    that only wrote would leave behind.
    """
    changed = 0
    for path in sorted(glob.glob(os.path.join(PACKS, "rules", "*.json"))):
        with open(path, encoding="utf-8") as handle:
            entry = json.load(handle)
        if not entry.get("pages"):
            continue

        touched = False
        for page in entry["pages"]:
            uuid = (f"Compendium.modern20.rules.JournalEntry.{entry['_id']}"
                    f".JournalEntryPage.{page['_id']}")
            content = FOOTER.sub("", page["text"]["content"])
            here = pointing.get(uuid) or []
            if here:
                content += footer(here)
            if content != page["text"]["content"]:
                page["text"]["content"] = content
                touched = True
        if not touched:
            continue

        changed += 1
        if not dry_run:
            with open(path, "w", encoding="utf-8") as handle:
                json.dump(entry, handle, indent=2, ensure_ascii=False)
                handle.write("\n")
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
    # Which documents point at each page, for the footer written afterwards.
    # Top-level documents only: a creature's own abilities are on the
    # creature's page, and listing them under it would be the page offering
    # its own contents back.
    pointing: dict[str, list[tuple[str, str]]] = collections.defaultdict(list)

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
        uuid = (document.get("system") or {}).get("rulesPage")
        if not uuid:
            unlinked.append(f"{pack}/{slug}")
        elif document_uuid(pack, document):
            pointing[uuid].append((document_uuid(pack, document), document["name"]))
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
    if counts["book"]:
        print(f"{counts['book']} document(s) were filed under the wrong book")
    if counts["filed"]:
        print(f"{counts['filed']} document(s) were in no folder and now are")
    if arguments.report and unlinked:
        print("\nNo rules page at all:")
        for name in unlinked:
            print(f"  {name}")
    for documents in pointing.values():
        documents.sort(key=lambda entry: entry[1])
    entries = write_footers(pointing, dry_run=arguments.dry_run)

    verb = "would change" if arguments.dry_run else "changed"
    print(f"\n{written} document(s) {verb}, {len(unlinked)} with no page")
    print(f"{len(pointing)} rules pages list what they are the rules for, "
          f"in {entries} entries {verb}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
