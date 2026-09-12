#!/usr/bin/env python3
"""Fail if the deploy would not send something the system needs.

    python3 scripts/check_deploy.py

Every other check in here reads the repository. This one reads the step that
decides what actually reaches Foundry, which is the only place a file can be
correct, committed, checked — and absent from the running game.

Both of the bugs it exists for were found by a person opening a compendium:

  - `scripts/deploy.sh` copied `module templates lang css` and not `assets`,
    so the artwork the packs point at was never uploaded. Nothing fails; the
    browser asks for 5,271 images one at a time and draws an empty frame for
    each.
  - the packs to compile were written out by hand, and when the tables pack
    was added nobody added it to that list. Random Tables was an empty
    compendium on the live host for as long as it existed. `check_packs.py`
    read all 26 tables from src/packs and said so, cheerfully, the whole time.

So: every directory the system serves files from has to be in the deploy's own
list, and the packs it compiles have to be the packs the manifest declares —
which now means the list is read from the manifest rather than repeated.
"""
from __future__ import annotations

import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srd  # noqa: E402

DEPLOY = os.path.join(srd.ROOT, "scripts", "deploy.sh")
MANIFEST = os.path.join(srd.ROOT, "system.json")

# `SYSTEM_DIRS="module templates lang css assets"`
DIRS = re.compile(r'^SYSTEM_DIRS="([^"]+)"', re.M)

# Any path into the system's own directory, written anywhere in the code or
# the templates: "systems/modern20/assets/icons/lorc/aura.svg".
SERVED = re.compile(r"systems/modern20/([\w-]+)/")


def manifest() -> dict:
    with open(MANIFEST, encoding="utf-8") as handle:
        return json.load(handle)


def needed() -> dict[str, str]:
    """Every top-level directory the running system reads a file from.

    Taken from the manifest's own entry points and from every path the code
    and templates spell out, rather than from a list kept here — the whole
    failure being a list that was kept somewhere and not updated.
    """
    system = manifest()
    wanted: dict[str, str] = {}

    def want(path: str, why: str) -> None:
        head = str(path).strip("/").split("/")[0]
        if head and not head.endswith(".json") and head != "packs":
            wanted.setdefault(head, why)

    for field in ("esmodules", "styles"):
        for path in system.get(field) or []:
            want(path, f'system.json "{field}"')
    for language in system.get("languages") or []:
        want(language.get("path", ""), 'system.json "languages"')
    for media in system.get("media") or []:
        for key in ("url", "thumbnail"):
            if media.get(key, "").startswith(("module", "assets", "css", "templates")):
                want(media[key], 'system.json "media"')

    sources = glob.glob(os.path.join(srd.ROOT, "module", "**", "*.mjs"), recursive=True)
    sources += glob.glob(os.path.join(srd.ROOT, "templates", "**", "*.hbs"), recursive=True)
    for path in sources:
        with open(path, encoding="utf-8") as handle:
            for directory in set(SERVED.findall(handle.read())):
                want(directory, os.path.relpath(path, srd.ROOT))

    # The packs themselves name their artwork, and they are data rather than
    # code, so their paths are read the same way.
    for path in glob.glob(os.path.join(srd.ROOT, "src", "packs", "*", "*.json")):
        with open(path, encoding="utf-8") as handle:
            for directory in set(SERVED.findall(handle.read())):
                want(directory, "src/packs")

    return wanted


def main() -> int:
    with open(DEPLOY, encoding="utf-8") as handle:
        deploy = handle.read()

    problems = []

    found = DIRS.search(deploy)
    if not found:
        print('FAIL  scripts/deploy.sh states no SYSTEM_DIRS="..."')
        return 1
    sending = set(found.group(1).split())

    wanted = needed()
    for directory, why in sorted(wanted.items()):
        if directory not in sending:
            problems.append(f"deploy.sh does not send {directory}/, which "
                            f"{why} reads from")
        elif not os.path.isdir(os.path.join(srd.ROOT, directory)):
            problems.append(f"deploy.sh sends {directory}/, which does not exist")

    for directory in sorted(sending - set(wanted)):
        if not os.path.isdir(os.path.join(srd.ROOT, directory)):
            problems.append(f"deploy.sh sends {directory}/, which does not exist")

    # The packs are compiled one at a time, and the list has to be the
    # manifest's. A written-out list is the bug, so finding one is a failure
    # even if it happens to be complete today.
    declared = [pack["name"] for pack in manifest().get("packs") or []]
    if "PACK_NAMES" not in deploy:
        problems.append("deploy.sh does not read the pack list from system.json")
    for name in declared:
        if re.search(rf"for p in [^\n]*\b{re.escape(name)}\b", deploy):
            problems.append(f"deploy.sh writes out the pack names ({name} among "
                            "them); read them from the manifest instead")
            break

    for pack in declared:
        if not os.path.isdir(os.path.join(srd.ROOT, "src", "packs", pack)):
            problems.append(f'system.json declares the "{pack}" pack and '
                            f"src/packs/{pack} does not exist")

    print(f"deploy sends {len(sending)} directories and compiles "
          f"{len(declared)} packs; {len(wanted)} directories are read from at runtime")
    for problem in problems:
        print(f"FAIL  {problem}")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
