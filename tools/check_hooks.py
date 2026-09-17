#!/usr/bin/env python3
"""Fail if a hook that writes decides for itself which client writes.

Foundry fires document and combat hooks on every connected client. A handler
that changes something therefore has to pick one client, and the two obvious
answers are both wrong:

    game.user.isGM              — true on every connected GM
    actor.isOwner               — true for the owner and for every GM

Either lets two clients do the same work. The occupation Wealth bonus was
added twice to a player-owned character whenever a GM was also connected, and
a dragged species would have created its traits twice and rolled its racial
Hit Dice twice. Nothing catches that in a one-player world, a compendium
check, or the in-world self-test: it needs two clients at once, which is
exactly the condition nobody tests under.

Foundry nominates one client — game.users.activeGM is the same user
everywhere — and module/modern20.mjs wraps that as actsOnHooks(). So the rule
here is narrow and mechanical: a hook handler that writes must reach its
decision through that helper, and must not reach for isGM or isOwner itself.
"""
from __future__ import annotations

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCAN = [
    os.path.join(ROOT, "module", "modern20.mjs"),
    os.path.join(ROOT, "module", "macros.mjs"),
]

HOOK = re.compile(r'Hooks\.on\(\s*"(\w+)"')

# A handler with a document in hand, rather than one that only draws.
#
# Deliberately not a list of the calls that write. The first version of this
# looked for .update( and createEmbeddedDocuments( and found three of the six
# handlers, missing every one that delegates — completeSpecies,
# applyOccupationWealth — which are the ones the bug was actually in. What a
# handler does with an actor is not knowable from here; that it has one is.
HOLDS_DOCUMENT = re.compile(r"\bactor\b|\bcombatant\b")
NAIVE = re.compile(r"game\.user\.isGM|\bactor\?\.isOwner\b|testUserPermission\(")
NOMINATED = re.compile(r"\bactsOnHooks\(")

# Hooks that only draw or bind, where every client is meant to run.
RENDER_ONLY = re.compile(r"^render|^hotbarDrop$|^getSceneControlButtons$")


def handlers(source: str):
    """Each Hooks.on handler, as (hook name, line number, body)."""
    for match in HOOK.finditer(source):
        name = match.group(1)
        start = source.index("{", match.end())
        depth, at = 0, start
        while at < len(source):
            if source[at] == "{":
                depth += 1
            elif source[at] == "}":
                depth -= 1
                if depth == 0:
                    break
            at += 1
        yield name, source[:match.start()].count("\n") + 1, source[start:at + 1]


def main() -> int:
    problems = []
    writing = 0

    for path in SCAN:
        if not os.path.isfile(path):
            continue
        source = open(path, encoding="utf-8").read()
        where = os.path.relpath(path, ROOT)

        for name, line, body in handlers(source):
            # Strip comments: the explanation of the bug names isGM itself.
            code = re.sub(r"//[^\n]*|/\*.*?\*/", "", body, flags=re.S)
            if not HOLDS_DOCUMENT.search(code) or RENDER_ONLY.match(name):
                continue
            writing += 1

            if not NOMINATED.search(code):
                problems.append(
                    f"{where}:{line} the {name} hook has an actor and never "
                    "asks actsOnHooks() which client should act on it"
                )
            naive = NAIVE.search(code)
            if naive:
                problems.append(
                    f"{where}:{line} the {name} hook decides with "
                    f"{naive.group(0)!r}, which is true on more than one client"
                )

    for problem in problems:
        print(f"FAIL  {problem}")
    print(f"\n{writing} hook handlers hold a document, "
          f"{len(problems)} deciding wrongly which client acts")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
