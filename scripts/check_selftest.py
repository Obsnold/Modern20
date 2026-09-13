#!/usr/bin/env python3
"""Fail if the in-world self-test would check the wrong numbers.

    python3 scripts/check_selftest.py

`module/selftest.mjs` runs inside Foundry and is the only thing here that sees
this system actually running. Nothing in this repository can run it, which
makes its expected figures the one place a mistake would be invisible from
both directions: wrong numbers in a test nobody here executes, checked against
a world nobody there inspects.

So this holds the generated half to the packs:

  - `module/selftest-data.mjs` is what `gen_selftest.py` would write today,
    which means the pack counts, the class table row, the creature Defenses and
    the image paths are the ones in src/packs
  - every UUID it names resolves to a document that exists, by the same
    derivation the packs were built with — a self-test whose fixtures point at
    nothing reports failures that are its own
  - the figures it will assert are not vacuous: a class row of zeroes or a
    creature with no Defense would pass in any world at all

It does not check the assertions themselves. Those are JavaScript, they run in
a browser, and the only honest verification is running them there.
"""
from __future__ import annotations

import glob
import json
import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srd  # noqa: E402

PACKS = os.path.join(srd.ROOT, "src", "packs")
GENERATED = os.path.join(srd.ROOT, "module", "selftest-data.mjs")
SUITE = os.path.join(srd.ROOT, "module", "selftest.mjs")

UUID = re.compile(r"^Compendium\.modern20\.(\w+)\.(\w+)\.(\w{16})"
                  r"(?:\.(\w+)\.(\w{16}))?$")


def stored() -> dict:
    """The generated data, read as JSON out of the module."""
    with open(GENERATED, encoding="utf-8") as handle:
        source = handle.read()
    body = source[source.index("{"):source.rindex("}") + 1]
    return json.loads(body)


def ids(pack: str) -> dict[str, set[str]]:
    """Every document id in a pack, and every page id inside its entries."""
    documents: set[str] = set()
    pages: set[str] = set()
    for path in glob.glob(os.path.join(PACKS, pack, "*.json")):
        with open(path, encoding="utf-8") as handle:
            document = json.load(handle)
        if document.get("_key", "").startswith("!folders!"):
            continue
        documents.add(document["_id"])
        for page in document.get("pages") or []:
            pages.add(page["_id"])
    return {"documents": documents, "pages": pages}


def main() -> int:
    problems: list[str] = []

    # Generated from the packs, and still what the packs would produce.
    result = subprocess.run(
        [sys.executable, os.path.join(srd.ROOT, "scripts", "gen_selftest.py"), "--check"],
        capture_output=True, text=True, check=False)
    if result.returncode != 0:
        # The generator prefixes its own line; this one prefixes every
        # problem, and two FAILs on one line reads like two problems.
        said = result.stdout.strip().removeprefix("FAIL  ")
        problems.append(said or "module/selftest-data.mjs is out of date")

    data = stored()
    with open(SUITE, encoding="utf-8") as handle:
        suite = handle.read()
    known: dict[str, dict[str, set[str]]] = {}

    def resolves(uuid: str, where: str) -> None:
        found = UUID.match(uuid or "")
        if not found:
            problems.append(f"{where}: {uuid!r} is not a compendium UUID")
            return
        pack, _kind, document_id, _page_kind, page_id = found.groups()
        if pack not in known:
            known[pack] = ids(pack)
        if document_id not in known[pack]["documents"]:
            problems.append(f"{where}: {uuid} names a document src/packs/{pack} "
                            "does not have")
        elif page_id and page_id not in known[pack]["pages"]:
            problems.append(f"{where}: {uuid} names a page that entry does not have")

    resolves(data["class"]["uuid"], "the class")
    resolves(data["weapon"]["uuid"], "the weapon")
    resolves(data["weapon"]["rulesPage"], "the weapon's rules page")
    for creature in data["creatures"]:
        resolves(creature["uuid"], f"creature {creature['name']}")
    for cited in data["rulesPages"]:
        resolves(cited["uuid"], f"{cited['pack']} rules link")

    # A test that asserts nothing passes everywhere.
    row = data["class"]["row"]
    if not any(row.values()):
        problems.append("the class row is all zeroes, which any sheet would match")
    for creature in data["creatures"]:
        if not creature.get("defense"):
            problems.append(f"{creature['name']} has no printed Defense to check")
        if not creature.get("squares"):
            problems.append(f"{creature['name']} has no token size to check")
        if not creature.get("art"):
            problems.append(f"{creature['name']} has no token artwork to check")
    if len(data["creatures"]) < 5:
        problems.append(f"only {len(data['creatures'])} creatures are checked; "
                        "the size modifier bug was invisible at Medium")
    if not data["images"]:
        problems.append("no image paths to ask the server for")

    # Every pack the manifest declares is counted, or a missing compendium is
    # a thing the self-test cannot notice either.
    with open(os.path.join(srd.ROOT, "system.json"), encoding="utf-8") as handle:
        declared = {pack["name"] for pack in json.load(handle)["packs"]}
    for pack in sorted(declared - set(data["packs"])):
        problems.append(f'the "{pack}" compendium is declared and not counted')
    for pack, count in sorted(data["packs"].items()):
        if not count:
            problems.append(f'the "{pack}" compendium is expected to be empty')

    # The generated link tables map a name to a UUID string, and the suite has
    # to read them the way the sheets do. Asking each value for a `.uuid` it
    # does not have cost a run: 67 working links were reported as resolving to
    # nothing, which reads like the rules compendium is missing.
    links = os.path.join(srd.ROOT, "module", "rules-links.mjs")
    with open(links, encoding="utf-8") as handle:
        tables = handle.read()
    values = re.findall(r'^\s*"[^"]+":\s*(.+?),?\s*$', tables, re.M)
    for value in values:
        if not value.startswith('"Compendium.'):
            problems.append(f"module/rules-links.mjs maps a name to {value[:40]}, "
                            "which module/selftest.mjs reads as a UUID string")
            break

    for accessor in ("rulesTopic(", "skillRules("):
        if accessor not in suite:
            problems.append(f"module/selftest.mjs does not go through {accessor}); "
                            "checking the generated table instead of the accessor "
                            "passes while the sheets get rubbish")

    # The suite has to use them, or they are decoration.
    for field in ("packs", "class", "creatures", "weapon", "rulesPages", "images"):
        if f"EXPECTED.{field}" not in suite:
            problems.append(f"module/selftest.mjs never reads EXPECTED.{field}")

    print(f"{len(data['packs'])} pack counts, {len(data['creatures'])} creatures, "
          f"{len(data['rulesPages'])} rules links and {len(data['images'])} images "
          "checked against src/packs")
    for problem in problems:
        print(f"FAIL  {problem}")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
