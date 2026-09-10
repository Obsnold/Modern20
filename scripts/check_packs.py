#!/usr/bin/env python3
"""Fail if a compendium's own shape is wrong.

Pack source is plain JSON that the Foundry CLI copies into LevelDB without
looking at it, so the mistakes here are silent ones: a document whose `folder`
names a folder that is not in the pack lands in the compendium root, a folder
typed for the wrong document class holds nothing, and a `_key` with the wrong
prefix produces a compendium that opens empty.

    python3 scripts/check_packs.py
"""
import collections
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PACKS = os.path.join(ROOT, "src", "packs")

# Which document class each pack holds, and the key prefix that goes with it.
COLLECTIONS = {
    "creatures": ("Actor", "!actors!"),
    "vehicles": ("Actor", "!actors!"),
    "objects": ("Actor", "!actors!"),
    "rules": ("JournalEntry", "!journal!"),
}
DEFAULT = ("Item", "!items!")

ID = re.compile(r"^[A-Za-z0-9]{16}$")


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

        used = {entry.get("folder") for entry in contents}
        for folder in folders:
            if folder["_id"] not in used:
                fail(f"{pack}: the \"{folder['name']}\" folder is empty")

    print(f"\n{len(packs)} packs, {documents} documents, {folders_seen} folders checked")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
