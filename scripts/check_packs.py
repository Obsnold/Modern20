#!/usr/bin/env python3
"""Fail if a compendium's own shape is wrong.

Pack source is plain JSON that the Foundry CLI copies into LevelDB without
looking at it, so the mistakes here are silent ones: a document whose `folder`
names a folder that is not in the pack lands in the compendium root, a folder
typed for the wrong document class holds nothing, and a `_key` with the wrong
prefix produces a compendium that opens empty.

An actor's prototype token is checked here for the same reason. Nothing rejects
a token that is one square when the creature is Gargantuan; it just arrives on
the map that size, and the GM resizes it by hand every time.

    python3 scripts/check_packs.py
"""
import collections
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import art  # noqa: E402
import srd  # noqa: E402

ROOT = srd.ROOT
PACKS = os.path.join(ROOT, "src", "packs")

# Which document class each pack holds, and the key prefix that goes with it.
COLLECTIONS = {
    "creatures": ("Actor", "!actors!"),
    "vehicles": ("Actor", "!actors!"),
    "objects": ("Actor", "!actors!"),
    "pregens": ("Actor", "!actors!"),
    "rules": ("JournalEntry", "!journal!"),
    "guide": ("JournalEntry", "!journal!"),
    "tables": ("RollTable", "!tables!"),
    "scenes": ("Scene", "!scenes!"),
}
DEFAULT = ("Item", "!items!")

ID = re.compile(r"^[A-Za-z0-9]{16}$")

# What a creature of each size fills, in grid squares: the SRD's own Space
# column divided by the five feet a square is, with half a square as the floor
# for everything Tiny and smaller.
TOKEN_SQUARES = {
    "fine": 0.5, "diminutive": 0.5, "tiny": 0.5, "small": 1, "medium": 1,
    "large": 2, "huge": 3, "gargantuan": 4, "colossal": 6,
}

# Foundry's TOKEN_DISPOSITIONS, the two a pack actor is built with.
DISPOSITIONS = {-1, 0}

# The embedded collections the Foundry CLI stores as entries of their own: an
# actor's items, a journal entry's pages and an item's active effects are
# documents in the compiled pack, keyed from their parent, not fields of it.
# What each collection carries inside it. Tuples, because a scene carries walls
# and lights at once — and because this table having no entry for scenes at all
# is why the example scene's walls went out unkeyed and the pack would not
# compile on the host.
EMBEDDED = {"actors": ("items",), "journal": ("pages",), "items": ("effects",),
            "tables": ("results",), "scenes": ("walls", "lights")}


def printed_creatures() -> list[dict]:
    """The creature stat blocks as scraped, which carry the printed totals."""
    path = os.path.join(srd.DATA, "creatures.json")
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    problems = 0

    def fail(message):
        nonlocal problems
        problems += 1
        print(f"FAIL  {message}")

    packs = sorted(os.listdir(PACKS))
    documents = folders_seen = 0

    for pack in packs:
        kind, prefix = COLLECTIONS.get(pack, DEFAULT)
        files = sorted(glob.glob(os.path.join(PACKS, pack, "*.json")))
        if not files:
            continue

        entries = [json.load(open(path, encoding="utf-8")) for path in files]
        folders = [e for e in entries if e.get("_key", "").startswith("!folders!")]
        contents = [e for e in entries if not e.get("_key", "").startswith("!folders!")]
        documents += len(contents)
        folders_seen += len(folders)

        ids = collections.Counter(entry["_id"] for entry in entries)
        for entry_id, count in ids.items():
            if count > 1:
                fail(f"{pack}: {count} documents share the id {entry_id}")
        for entry in entries:
            if not ID.match(entry.get("_id", "")):
                fail(f"{pack}: \"{entry.get('name')}\" has an id Foundry will not "
                     f"accept: {entry.get('_id')!r}")

        for entry in contents:
            if not entry.get("_key", "").startswith(prefix):
                fail(f"{pack}: \"{entry['name']}\" is keyed {entry.get('_key')!r}, "
                     f"but this pack holds {kind}s")

        folder_ids = {folder["_id"] for folder in folders}
        for folder in folders:
            if folder.get("type") != kind:
                fail(f"{pack}: the \"{folder['name']}\" folder holds "
                     f"{folder.get('type')}, not {kind}")

        # A pack either groups everything or groups nothing: a stray document
        # outside the folders is one nobody scrolls far enough to find.
        placed = [e for e in contents if e.get("folder")]
        if folders and len(placed) != len(contents):
            fail(f"{pack}: {len(contents) - len(placed)} of {len(contents)} "
                 "documents are outside the folders")
        for entry in contents:
            if entry.get("folder") and entry["folder"] not in folder_ids:
                fail(f"{pack}: \"{entry['name']}\" points at a folder that is "
                     "not in the pack")
        if not folders:
            for entry in contents:
                if entry.get("folder"):
                    fail(f"{pack}: \"{entry['name']}\" is in a folder the pack does not have")

        # An actor's items are entries of their own in the compiled pack,
        # keyed "!actors.items!<actor id>.<item id>". A missing key stops the
        # Foundry CLI dead - "Key cannot be null or undefined" - and two items
        # sharing an id inside one actor collide on the key that is built from
        # it, which the CLI refuses just as loudly.
        for field in EMBEDDED.get(prefix.strip("!")) or ():
            for entry in contents:
                embedded = entry.get(field) or []
                child_ids = collections.Counter(child.get("_id") for child in embedded)
                for child_id, count in child_ids.items():
                    if count > 1:
                        fail(f"{pack}: \"{entry['name']}\" has {count} {field} "
                             f"with the id {child_id}")
                for child in embedded:
                    want = (f"!{prefix.strip('!')}.{field}!{entry['_id']}."
                            f"{child.get('_id')}")
                    if child.get("_key") != want:
                        # A wall has no name to report, so say which one by
                        # where it is.
                        which = child.get("name") or child.get("c") or child.get("_id")
                        fail(f"{pack}: \"{entry['name']}\" / {field} {which} is keyed "
                             f"{child.get('_key')!r}, expected {want!r}")

        # Every actor drops onto the canvas as its prototype token, and
        # everything about that token is derived: there is no judgement in it
        # to get wrong, only arithmetic to get stale.
        if kind == "Actor":
            for entry in contents:
                token = entry.get("prototypeToken")
                if not token:
                    fail(f"{pack}: \"{entry['name']}\" has no prototype token")
                    continue
                system = entry.get("system") or {}
                size = (system.get("attributes") or {}).get("size") or system.get("size")
                want = TOKEN_SQUARES.get(size, 1)
                if token.get("width") != want or token.get("height") != want:
                    fail(f"{pack}: \"{entry['name']}\" is {size} and its token is "
                         f"{token.get('width')}x{token.get('height')}, not {want}")
                if token.get("disposition") not in DISPOSITIONS:
                    fail(f"{pack}: \"{entry['name']}\" has disposition "
                         f"{token.get('disposition')!r}")
                if (token.get("bar1") or {}).get("attribute") != "hp":
                    fail(f"{pack}: \"{entry['name']}\" does not show hit points on a bar")
                # Foundry's own default for a token with no artwork is the grey
                # mystery-man, so saying nothing here is a decision: every
                # creature drops onto the map as the same silhouette. That the
                # file exists is check_art.py's business.
                texture = token.get("texture") or {}
                if not texture.get("src"):
                    fail(f"{pack}: \"{entry['name']}\" has no token artwork")
                # How the artwork is drawn is derived, not chosen per creature,
                # and it is the difference between a figure that reads on a map
                # and one that looks like the wrong size. A reconcile used to
                # strip it from all 399 documents without a word.
                for key, value in art.TOKEN_TEXTURE.items():
                    if texture.get(key) != value:
                        fail(f"{pack}: \"{entry['name']}\" draws its token with "
                             f"{key}={texture.get(key)!r}, not {value!r}")
                        break
                # Foundry dropped the token's own `scale` at v11 for
                # texture.scaleX/scaleY: one document still carried it, where
                # it did nothing at all.
                if "scale" in token:
                    fail(f"{pack}: \"{entry['name']}\" has a token `scale`, "
                         "which Foundry replaced with texture.scaleX/scaleY")
                # A range of zero is a sense that detects nothing, which is
                # how a misread "darkvision 1,200 ft." looks from here.
                if (token.get("sight") or {}).get("enabled") and token["sight"].get("range", 0) < 5:
                    fail(f"{pack}: \"{entry['name']}\" sees {token['sight'].get('range')!r} feet")
                for mode in token.get("detectionModes") or []:
                    if mode.get("range", 0) < 5:
                        fail(f"{pack}: \"{entry['name']}\" detects with "
                             f"{mode.get('id')} at {mode.get('range')!r} feet")

        # What the sheet will show against what the book prints. Every derived
        # number on a creature is stored as the offset that reproduces the
        # printed total, which is only true while every part the sheet adds
        # back is subtracted here: the size modifier was not, so 183 of 300
        # creatures showed a Defense the SRD does not print — eight points out
        # on a Colossal dragon, and nothing said so, because each half of the
        # sum was right on its own.
        if pack == "creatures":
            printed = {entry["name"]: entry for entry in printed_creatures()}
            for entry in contents:
                book = printed.get(entry["name"])
                if not book or book.get("defenseTotal") is None:
                    continue
                system = entry.get("system") or {}
                defense = system.get("defense") or {}
                size = (system.get("attributes") or {}).get("size")
                dex = ((system.get("abilities") or {}).get("dex") or {}).get("value", 10)
                shown = (10 + defense.get("classBonus", 0) + defense.get("naturalArmor", 0)
                         + defense.get("misc", 0) + srd.SIZE_MODIFIER.get(size, 0)
                         + (dex - 10) // 2)
                if shown != book["defenseTotal"]:
                    fail(f"{pack}: \"{entry['name']}\" is printed at Defense "
                         f"{book['defenseTotal']} and its sheet will show {shown}")

                # The saves are the same shape — an offset plus an ability
                # modifier — but the dataset keeps only the offset, so there is
                # no printed total here to hold them to. check_creatures.mjs
                # does that against the figures transcribed from the page.
                if (system.get("saves") or {}).keys() != {"fort", "ref", "will"}:
                    fail(f"{pack}: \"{entry['name']}\" does not have three saves")

        # A random table is only a table if its rolls cover it. A gap is a
        # roll with no result, which Foundry reports as an empty draw, and an
        # overlap is a result nobody can get to.
        if kind == "RollTable":
            for entry in contents:
                faces = int((entry.get("formula") or "1d0").split("d")[-1] or 0)
                covered = set()
                for result in entry.get("results") or []:
                    low, high = (result.get("range") or [0, 0])[:2]
                    if not 1 <= low <= high <= faces:
                        fail(f"{pack}: \"{entry['name']}\" has a result on {low}-{high}, "
                             f"outside its {entry.get('formula')}")
                        continue
                    rolls = set(range(low, high + 1))
                    if rolls & covered:
                        fail(f"{pack}: \"{entry['name']}\" has two results on "
                             f"{sorted(rolls & covered)[0]}")
                    covered |= rolls
                if not entry.get("results"):
                    fail(f"{pack}: \"{entry['name']}\" has no results")

        used = {entry.get("folder") for entry in contents}
        for folder in folders:
            if folder["_id"] not in used:
                fail(f"{pack}: the \"{folder['name']}\" folder is empty")

    embedded = 0
    for pack in packs:
        for field in EMBEDDED.get(COLLECTIONS.get(pack, DEFAULT)[1].strip("!")) or ():
            for path in glob.glob(os.path.join(PACKS, pack, "*.json")):
                with open(path, encoding="utf-8") as handle:
                    embedded += len(json.load(handle).get(field) or [])
    tokens = sum(1 for pack in packs if COLLECTIONS.get(pack, DEFAULT)[0] == "Actor"
                 for path in glob.glob(os.path.join(PACKS, pack, "*.json"))
                 if json.load(open(path, encoding="utf-8")).get("prototypeToken"))
    print(f"\n{len(packs)} packs, {documents} documents, {embedded} embedded items, "
          f"{folders_seen} folders, {tokens} prototype tokens checked")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
