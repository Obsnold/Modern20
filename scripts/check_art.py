#!/usr/bin/env python3
"""Fail if a document points at a picture that is not there.

    python3 scripts/check_art.py
    python3 scripts/check_art.py --update   # record the current spread

A broken image is the quietest failure in a compendium: Foundry draws a
placeholder frame, logs nothing, and the row still has its name — so 1,669
documents can lose their art and the only symptom is that the browser looks
worse than it did. Which is exactly what would happen if an icon were renamed,
if `assets/icons` were half-committed, or if the map named a file nobody
fetched.

So this resolves every `img` in every pack against the filesystem:

  - a vendored icon (`systems/modern20/assets/icons/...`) has to be a file in
    this repository, and it has to be an SVG that parses far enough to have a
    viewBox
  - a core icon (`icons/...`) is Foundry's own and cannot be verified from
    here, so it is counted and reported rather than trusted — unless
    FOUNDRY_PATH names an install, in which case it is checked properly
  - every icon `scripts/art.py` names has to be fetched, and every fetched
    icon has to be named by the map: an orphan is 4 KB of somebody else's
    artwork carried for nothing, and the licence asks that it be credited
  - every author whose work is vendored has to appear in
    assets/icons/CREDITS.md, because CC BY is a licence with a condition and a
    missing name is the one way to break it

It also holds the spread, recorded per pack in data/coverage.json: how many
documents carry art and how many distinct icons they point at. The second
figure is the one that matters. Every document had an icon before any of this;
eleven icons across 4,864 documents is what made the compendium unreadable, so
a regression here is a map that has stopped telling things apart.
"""
from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import art  # noqa: E402
import srd  # noqa: E402

PACKS = os.path.join(srd.ROOT, "src", "packs")
ASSETS = os.path.join(srd.ROOT, "assets", "icons")
CREDITS = os.path.join(ASSETS, "CREDITS.md")
BASELINE = os.path.join(srd.ROOT, "data", "coverage.json")

VIEWBOX = re.compile(r"<svg\b[^>]*\bviewBox=", re.I)

# Where Foundry keeps its own icons, if this machine has one.
FOUNDRY = os.environ.get("FOUNDRY_PATH")


def documents():
    """Every document in every pack, with its embedded ones."""
    for path in sorted(glob.glob(os.path.join(PACKS, "*", "*.json"))):
        pack = os.path.basename(os.path.dirname(path))
        with open(path, encoding="utf-8") as handle:
            document = json.load(handle)
        if document.get("_key", "").startswith("!folders!"):
            continue
        label = f"{pack}/{os.path.basename(path)[:-5]}"
        yield pack, label, document
        for child in (document.get("items") or []):
            yield pack, f"{label}: {child.get('name')}", child


def core_icon(path: str) -> str:
    """Whether a Foundry icon exists, where that can be known at all."""
    if not FOUNDRY:
        return ""
    for base in (os.path.join(FOUNDRY, "resources", "app", "public"),
                 os.path.join(FOUNDRY, "public"), FOUNDRY):
        if os.path.isdir(base):
            return "" if os.path.exists(os.path.join(base, path)) else "is not in FOUNDRY_PATH"
    return ""


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--update", action="store_true",
                        help="record the current spread as the new floor")
    arguments = parser.parse_args()

    problems: list[str] = []
    spread: dict[str, dict] = {}
    used: set[str] = set()
    core = 0
    checked = 0

    for pack, label, document in documents():
        image = document.get("img")
        counts = spread.setdefault(pack, {"documents": 0, "pictured": 0, "icons": set()})
        counts["documents"] += 1
        if not image:
            continue
        counts["pictured"] += 1
        counts["icons"].add(image)
        checked += 1

        if image.startswith(art.PREFIX):
            relative = image[len(art.PREFIX):]
            local = os.path.join(ASSETS, relative)
            used.add(relative)
            if not os.path.exists(local):
                problems.append(f"{label}: {image} is not in assets/icons")
                continue
            with open(local, encoding="utf-8") as handle:
                if not VIEWBOX.search(handle.read(400)):
                    problems.append(f"{label}: {relative} is not an svg with a viewBox")
        elif image.startswith("icons/"):
            core += 1
            trouble = core_icon(image)
            if trouble:
                problems.append(f"{label}: {image} {trouble}")
        else:
            problems.append(f"{label}: {image} is neither a vendored icon nor a core one")

    # The map and the directory have to agree in both directions.
    named = set()
    for icon in art.icons():
        named.add(icon + ".svg" if "/" in icon else icon)
    vendored = {os.path.relpath(path, ASSETS)
                for path in glob.glob(os.path.join(ASSETS, "*", "*.svg"))}

    for icon in sorted(named):
        if "/" in icon and icon not in vendored:
            problems.append(f"scripts/art.py names {icon}, which is not fetched")
    unqualified = {icon for icon in named if "/" not in icon}
    for slug in sorted(unqualified):
        if not any(os.path.basename(path) == slug + ".svg" for path in vendored):
            problems.append(f"scripts/art.py names {slug}, which is not fetched")

    for path in sorted(vendored):
        slug = os.path.basename(path)[:-4]
        if path not in named and slug not in unqualified:
            problems.append(f"assets/icons/{path} is fetched and nothing names it")

    # CC BY asks for the author's name, and the author is the directory.
    if not os.path.exists(CREDITS):
        problems.append("assets/icons/CREDITS.md is missing")
    else:
        with open(CREDITS, encoding="utf-8") as handle:
            credits = handle.read()
        for author in sorted({path.split(os.sep)[0] for path in vendored}):
            if author not in credits:
                problems.append(f"assets/icons/CREDITS.md does not credit {author}")

    for counts in spread.values():
        counts["icons"] = len(counts["icons"])

    for pack, counts in sorted(spread.items()):
        print(f"  {pack:14s} {counts['pictured']:5d} pictured, "
              f"{counts['icons']:3d} distinct icon(s)")
    print(f"\n{checked} images checked, {len(vendored)} vendored icons, "
          f"{core} core icon(s) referenced"
          + ("" if FOUNDRY else " (not verifiable: FOUNDRY_PATH is unset)"))

    for problem in problems:
        print(f"FAIL  {problem}")

    with open(BASELINE, encoding="utf-8") as handle:
        baseline = json.load(handle)

    if arguments.update:
        baseline["art"] = spread
        with open(BASELINE, "w", encoding="utf-8") as handle:
            json.dump(baseline, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        total = sum(counts["icons"] for counts in spread.values())
        print(f"data/coverage.json written: {total} icon(s) across the packs")
        return 1 if problems else 0

    recorded = baseline.get("art") or {}
    for pack, was in sorted(recorded.items()):
        now = spread.get(pack)
        if not now:
            problems.append(f"{pack}: had art recorded and no longer exists")
            continue
        if now["pictured"] < was["pictured"]:
            problems.append(f"{pack}: {was['pictured']} documents had art, "
                            f"now {now['pictured']}")
        if now["icons"] < was["icons"]:
            problems.append(f"{pack}: its art told {was['icons']} kinds apart, "
                            f"now {now['icons']}")

    if problems:
        print(f"\n{len(problems)} problem(s)")
        return 1
    print(f"{sum(c['pictured'] for c in spread.values())} documents pictured by "
          f"{sum(c['icons'] for c in spread.values())} icons, 0 problems")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
