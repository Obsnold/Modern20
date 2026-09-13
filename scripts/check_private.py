#!/usr/bin/env python3
"""Fail if this repository names somebody's own machine.

    python3 scripts/check_private.py

Everything here was written on one laptop and deployed to one server on a home
network, and for a while it said so: `user@host` was the default host
in two scripts, and paths to one particular Node install and one particular
copy of the Foundry CLI were written out as though they were facts about the
world. None of it is a secret — a private address is meaningless outside the
network it is on — but all of it is *wrong for everybody else*, and a default
that silently points at a machine the reader does not have is worse than no
default at all.

So the deploy reads where it is going from the environment, and this holds the
repository to that: no addresses, no user@host, no home directories, no paths
into one person's toolchain.

What it does not check, because both are deliberate: the copyright line in
LICENSE.md, and the name and address on the commits. Those are authorship.

Only the files a reader would read are scanned — the code, the scripts, the
docs and the manifest. `data/` and `src/packs/` are the SRD's own text and
`assets/` is artwork; an IP address in a rules page would be the SRD's, and a
run of four numbers in an SVG path is a curve.
"""
from __future__ import annotations

import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import srd  # noqa: E402

# Content rather than code: the SRD's own text, and drawings.
SKIP_DIRS = ("data/", "src/packs/", "assets/", "packs/")

# This file has to name the things it is looking for, and a check that failed
# itself would be a check nobody could write.
SKIP_FILES = ("scripts/check_private.py",)

PATTERNS = [
    # A private network address. A public one would be worse, and this catches
    # both: the Foundry host was the one that was actually here.
    (re.compile(r"\b(?:\d{1,3}\.){3}\d{1,3}\b"),
     "an IP address, which is a machine on somebody's network"),
    # user@host, as a default or an example. "user@host" itself is the
    # placeholder this repository uses, so it is allowed by name.
    (re.compile(r"\b(?!user@host\b)[a-z_][\w.-]*@"
                r"(?:\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}|[a-z0-9-]+\.[a-z]{2,}|host\b)"),
     "a user@host, which names an account on a particular machine"),
    # Somebody's home directory, including the one this was written in.
    (re.compile(r"/(?:home|Users)/[a-z][\w.-]*"),
     "a home directory, which exists on one machine"),
    # A toolchain nobody else installed in the same place. $HOME/fvtt-cli was
    # where the Foundry CLI happened to live here.
    (re.compile(r"\$HOME/[\w.-]+/node_modules"),
     "a path into one particular install of the Foundry CLI"),
    (re.compile(r"/opt/node/\S*"),
     "a path into one particular Node install"),
]

# An address that is documentation rather than a machine: the licence's own
# version number, the SRD's host, and the loopback anybody can use.
ALLOWED = re.compile(r"1\.0a|127\.0\.0\.1|0\.0\.0\.0|localhost"
                     r"|spellbooksoftware\.com|foundryvtt\.com|game-icons\.net"
                     r"|github\.com|claude\.ai|anthropic\.com|wizards\.com"
                     r"|creativecommons\.org|opengamefoundation\.org")


def tracked() -> list[str]:
    """Every file git knows about, minus the content and the artwork."""
    listing = subprocess.run(["git", "ls-files"], cwd=srd.ROOT,
                             capture_output=True, text=True, check=True)
    return [path for path in listing.stdout.split("\n")
            if path and not path.startswith(SKIP_DIRS)
            and path not in SKIP_FILES]


def main() -> int:
    problems = []
    scanned = 0
    for path in tracked():
        full = os.path.join(srd.ROOT, path)
        if not os.path.isfile(full):
            continue
        try:
            with open(full, encoding="utf-8") as handle:
                lines = handle.read().split("\n")
        except UnicodeDecodeError:
            continue  # a binary file names nothing
        scanned += 1

        for number, line in enumerate(lines, 1):
            for pattern, why in PATTERNS:
                for found in pattern.finditer(line):
                    if ALLOWED.search(found.group(0)):
                        continue
                    problems.append(f"{path}:{number}: {found.group(0)!r} is {why}")

    print(f"{scanned} files scanned for anything naming a particular machine")
    for problem in problems:
        print(f"FAIL  {problem}")
    if problems:
        print("\nThe deploy reads its host and paths from MODERN20_HOST, "
              "MODERN20_DEST, MODERN20_NODE_BIN and MODERN20_FVTT. Put the "
              "value there rather than in a file this repository tracks.")
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())
