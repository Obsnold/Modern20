#!/usr/bin/env python3
"""Fail if any localization key used in code or templates is missing from lang/en.json.

Foundry silently renders a missing key as the key itself, so drift here is
invisible until someone opens the sheet. Run this in CI.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEY = re.compile(r"MODERN20\.[A-Za-z0-9_.]+")
SKIP_DIRS = {".git", ".cache", "node_modules", "packs", ".venv"}

# Keys assembled at runtime from an id the regex cannot see: item-type labels,
# the tab labels ApplicationV2 builds from each sheet's TABS labelPrefix, and
# the settings names and hints, which Foundry looks up from the setting key.
# Settings get a stricter check of their own in tools/check_models.mjs, which
# can read the real key list rather than guessing at a prefix.
DYNAMIC_PREFIXES = ("MODERN20.ItemType.", "MODERN20.Tab.", "MODERN20.Creator.Tab.",
                    "MODERN20.Condition.", "MODERN20.Activity.Type.",
                    "MODERN20.Activity.OnSuccess.", "MODERN20.Action.",
                    "MODERN20.Settings.",
                    # Natural attack names, keyed by the column of the SRD's
                    # own per-size table: slam, bite, claw, gore.
                    "MODERN20.Creature.")


def flatten(node, prefix=""):
    flat = {}
    for key, value in node.items():
        path = f"{prefix}{key}"
        if isinstance(value, dict):
            flat.update(flatten(value, f"{path}."))
        else:
            flat[path] = value
    return flat


def referenced_keys():
    found = set()
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if not name.endswith((".hbs", ".mjs")):
                continue
            text = open(os.path.join(dirpath, name), encoding="utf-8").read()
            for match in KEY.findall(text):
                # Only treat a dotted path as an i18n key when the segment after
                # MODERN20 is capitalized; lowercase paths are JS config lookups.
                tail = match.split(".", 1)[1]
                if tail[:1].isupper():
                    found.add(match.rstrip("."))
    return found


def main():
    strings = flatten(json.load(open(os.path.join(ROOT, "lang", "en.json"), encoding="utf-8")))
    used = referenced_keys()

    # A bare dynamic prefix is the literal in the concat helper, not a real key.
    used = {k for k in used if not any(k == p.rstrip(".") for p in DYNAMIC_PREFIXES)}

    # A scalar key that is also a namespace prefix silently swallows every key
    # beneath it when the JSON is nested. That is how 50 skill names once vanished.
    collisions = sorted(
        k for k in strings
        if any(other.startswith(k + ".") for other in strings)
    )
    for key in collisions:
        print(f"COLLIDES {key} is both a string and a namespace")

    # A LOCALIZATION_PREFIXES entry names a namespace, not a string: Foundry
    # reads <prefix>.FIELDS.<path>.label beneath it. Treat such a key as
    # satisfied when anything exists under it.
    namespaces = {k.rsplit(".", 1)[0] for k in strings}
    for key in list(strings):
        parts = key.split(".")
        for depth in range(1, len(parts)):
            namespaces.add(".".join(parts[:depth]))

    missing = sorted(k for k in used if k not in strings and k not in namespaces)
    # FIELDS blocks are read by Foundry's own data model localization, keyed
    # off each model's LOCALIZATION_PREFIXES, so they never appear in a
    # template or a localize() call.
    unused = sorted(
        k for k in strings
        if k.startswith("MODERN20.") and k not in used
        and not k.startswith(DYNAMIC_PREFIXES)
        and not k.endswith(".abbr")
        and ".FIELDS." not in k
    )

    for key in missing:
        print(f"MISSING  {key}")
    for key in unused:
        print(f"unused   {key}")

    print(f"\n{len(strings)} strings defined, {len(used)} referenced, "
          f"{len(missing)} missing, {len(unused)} unused")
    return 1 if (missing or collisions) else 0


if __name__ == "__main__":
    sys.exit(main())
