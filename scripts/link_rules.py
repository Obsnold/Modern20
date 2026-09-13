#!/usr/bin/env python3
"""Reconcile the fields src/packs cannot receive from a re-import.

src/packs is the source of truth: the importer adds documents it does not have
and leaves the rest alone, because a difference there is as likely to be a hand
correction as a parser improvement. So a new field cannot arrive by re-running
the import — it would report 1,391 documents as differing and write none of
them.

This writes the handful of fields the import derives and nothing else. Three of
them say where a document came from: `system.rulesPage` is added beside
`srdUrl` — where the
rules for it are, in the compendium rather than on the web. And
`system.source` is corrected where it names the wrong book: everything built
from a scraped dataset claimed to be core, so the Menace Manual's creatures,
Urban Arcana's spells and powers and d20 Future's vehicles all said "d20
Modern SRD". A document whose source already names the right book is left
exactly as it is, whatever it calls it.

The fourth is the effect a feat or talent states in its own benefit text —
"+2 bonus on all Listen checks and Spot checks" — which the sheet can apply
instead of the player remembering it. Only onto an item that has none: an
effect somebody has edited or disabled is theirs.

The fifth is the prototype token, which is derived rather than authored: the
size the stat block says the creature fills, the senses it says the creature
sees with, and a disposition from what kind of actor it is. Every actor in the
compendium had none, so a Gargantuan wyrm arrived on the canvas as a one-square
token with no vision. That one is taken from the import whole, along with the
space and reach it is computed from — unless the document is recorded in
`data/overrides/packs/` as deliberately differing from the import, which is
where a hand correction says so.

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
import art  # noqa: E402
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
         counts: collections.Counter, rollable: list, *,
         corrected: bool = False, embedded: bool = False) -> bool:
    """Reconcile one document, and its embedded ones, with the import.

    `corrected` marks a document recorded in data/overrides/packs as
    deliberately differing from the SRD import. Its links and its book are
    still kept current — those are facts about where it came from, not
    decisions — but nothing the correction might be about is touched.
    """
    changed = False

    # The icon this kind of document gets. Only over one of the eleven
    # placeholders the build used to hand out: an image a GM has chosen, or one
    # a later map already wrote, is not a placeholder. Applied even to a
    # corrected document, since a picture is not what a correction is about.
    icon = art.icon_for(pack, document, embedded=embedded)
    if icon and document.get("img") in art.PLACEHOLDERS:
        document["img"] = icon
        counts["pictured"] += 1
        changed = True

    # Everything below is about where a document's rules are, which a roll
    # table keeps in its description rather than in system data.
    system = document.get("system")
    if system is None:
        return changed

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

    # Token artwork, which an actor already on disk has none of: Foundry's own
    # default is the grey mystery-man, so this is a placeholder by another
    # name. Only where the token states none — a token somebody has given art
    # is theirs.
    token = document.get("prototypeToken")
    if isinstance(token, dict):
        texture = token.get("texture") or {}
        disc = art.token_for(pack, document)
        if disc and not texture.get("src"):
            token["texture"] = texture = {"src": disc}
            counts["tokened"] += 1
            changed = True
        # How the artwork is drawn, which is derived rather than chosen per
        # creature: a token missing it draws its figure at a size that reads
        # small on a map.
        if texture.get("src") and any(texture.get(key) != value
                                      for key, value in art.TOKEN_TEXTURE.items()):
            texture.update(art.TOKEN_TEXTURE)
            counts["scaled"] += 1
            changed = True

    # What the document's own text tells the reader to roll. Written over the
    # text on disk rather than taken from the import, so a corrected
    # description keeps its correction and gains the rolls it names; the
    # rewrite only wraps the SRD's own words, and a roll already written is
    # left alone, so this converges and re-running changes nothing.
    written = build_packs.link_field_checks(document, rollable)
    if written:
        counts["rolls"] += written
        changed = True

    # The effect a feat's own sentence states, which no import can add to a
    # document that is already on disk. Only where the document has none: an
    # effect a GM has edited, disabled or added to is theirs.
    effects = (built or {}).get("effects")
    if effects and not document.get("effects"):
        document["effects"] = effects
        counts["applied"] += 1
        changed = True

    token = (built or {}).get("prototypeToken")
    if token and not corrected and document.get("prototypeToken") != token:
        document["prototypeToken"] = token
        counts["token"] += 1
        changed = True

    # The two numbers the token size is computed from, which were one number
    # read twice: every creature's reach was its space.
    printed = ((built or {}).get("system") or {}).get("attributes") or {}
    mine = system.get("attributes")
    if mine and not corrected:
        for field in ("space", "reach"):
            if field in printed and mine.get(field) != printed[field]:
                mine[field] = printed[field]
                counts["measured"] += 1
                changed = True

    # The offset that reproduces the printed Defense, which had the size
    # modifier left in it: the sheet added that column too, so every creature
    # that is not Medium showed a Defense the book does not print — eight
    # points out on a Colossal dragon. Derived arithmetic, not a decision, so
    # it is taken from the import the way space and reach are.
    # A vehicle's Defense is one printed number rather than parts, so this is
    # only about the actors that derive theirs.
    shown = ((built or {}).get("system") or {}).get("defense")
    ours = system.get("defense")
    if (isinstance(shown, dict) and isinstance(ours, dict) and not corrected
            and "misc" in shown and ours.get("misc") != shown["misc"]):
        ours["misc"] = shown["misc"]
        counts["defended"] += 1
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
        if link(child, children.get(child["name"]), pack, index, counts, rollable,
                corrected=corrected, embedded=True):
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
    rollable = build_packs.check_patterns()
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
        changed = link(document, built.get((pack, slug)), pack, index, counts,
                       rollable, corrected=slug in build_packs.hand_edited(pack))
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
    if counts["applied"]:
        print(f"{counts['applied']} item(s) took the effect their own text states")
    if counts["token"]:
        print(f"{counts['token']} actor(s) took the token the import derives")
    if counts["scaled"]:
        print(f"{counts['scaled']} token(s) now draw their artwork at the scale "
              "a map is read at")
    if counts["tokened"]:
        print(f"{counts['tokened']} actor(s) now stand on the canvas as themselves")
    if counts["defended"]:
        print(f"{counts['defended']} creature(s) now show the Defense the SRD prints")
    if counts["measured"]:
        print(f"{counts['measured']} space and reach value(s) corrected")
    if counts["pictured"]:
        print(f"{counts['pictured']} document(s) took the icon their kind implies")
    if counts["rolls"]:
        print(f"{counts['rolls']} field(s) of prose now say what they roll")
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
