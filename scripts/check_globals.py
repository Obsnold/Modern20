#!/usr/bin/env python3
"""Fail if the system references a browser global Foundry v14 no longer provides.

v14 removed the bare document and dice globals. Only CONFIG, Hooks, game, ui
and Handlebars survive. Referencing a removed one in a class heritage clause
(`class X extends Actor`) throws at module evaluation, which takes the whole
UI down as a black screen after login with nothing useful in the server log.
"""
from __future__ import annotations

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODULE = os.path.join(ROOT, "module")

# Removed in v14 -> the namespace path that replaces each.
REMOVED = {
    "Actor": "foundry.documents.Actor",
    "Item": "foundry.documents.Item",
    "ChatMessage": "foundry.documents.ChatMessage",
    "Roll": "foundry.dice.Roll",
    "Actors": "foundry.documents.collections.Actors",
    "Items": "foundry.documents.collections.Items",
    "Macro": "foundry.documents.Macro",
    "Scene": "foundry.documents.Scene",
    "JournalEntry": "foundry.documents.JournalEntry",
    "ActiveEffect": "foundry.documents.ActiveEffect",
    "Combat": "foundry.documents.Combat",
    "Folder": "foundry.documents.Folder",
    "Dialog": "foundry.applications.api.DialogV2",
}

STILL_GLOBAL = {"CONFIG", "Hooks", "game", "ui", "Handlebars", "foundry"}

# A name is fine when it is a property access, a key, a string, or locally bound
# by a destructuring line such as `const { Actor } = foundry.documents;`.
DESTRUCTURE = re.compile(r"const\s*\{([^}]*)\}\s*=\s*foundry\.")
COMMENT = re.compile(r"^\s*(//|\*|/\*)")


def bound_names(source: str) -> set[str]:
    names = set()
    for match in DESTRUCTURE.finditer(source):
        for part in match.group(1).split(","):
            part = part.strip()
            if not part:
                continue
            # Handle `Actor: ActorDoc` aliases: the bound name is the alias.
            names.add(part.split(":")[-1].strip())
            names.add(part.split(":")[0].strip())
    return names


def check(path: str) -> list[str]:
    source = open(path, encoding="utf-8").read()
    bound = bound_names(source)
    problems = []

    for number, line in enumerate(source.splitlines(), 1):
        if COMMENT.match(line):
            continue
        # Strip strings so text inside them never trips the scan.
        stripped = re.sub(r'"[^"]*"|\'[^\']*\'|`[^`]*`', '""', line)
        for name, replacement in REMOVED.items():
            if name in bound:
                continue
            # A bare identifier: not preceded by a dot, not a property key.
            if re.search(rf"(?<![.\w]){name}\b(?!\s*:)", stripped):
                problems.append(
                    f"{os.path.relpath(path, ROOT)}:{number}: bare '{name}' "
                    f"is not a global in v14 - use {replacement}\n    {line.strip()}"
                )
    return problems


def main() -> int:
    problems = []
    files = 0
    for dirpath, _, filenames in os.walk(MODULE):
        for name in sorted(filenames):
            if name.endswith(".mjs"):
                files += 1
                problems.extend(check(os.path.join(dirpath, name)))

    for problem in problems:
        print(problem)

    print(f"\n{files} modules scanned, {len(problems)} removed-global references")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
