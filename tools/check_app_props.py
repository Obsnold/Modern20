#!/usr/bin/env python3
"""Fail if an application assigns over one of ApplicationV2's read-only getters.

ApplicationV2 defines twelve accessors with no setter. Assigning to one throws
"setting getter-only property" from the constructor, which surfaces as a button
that silently does nothing — the render never happens and the rejection is
swallowed unless the caller awaits it.
"""
from __future__ import annotations

import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCAN = [os.path.join(ROOT, "module", "apps"), os.path.join(ROOT, "module", "sheets")]

# Verified against the v14 bundle: getters on ApplicationV2 with no setter.
READ_ONLY = {
    "children", "classList", "element", "form", "hasFrame", "id",
    "minimized", "parent", "rendered", "state", "title", "window",
}

ASSIGN = re.compile(r"\bthis\.(\w+)\s*=(?!=)")


def main() -> int:
    problems = []
    files = 0

    for directory in SCAN:
        if not os.path.isdir(directory):
            continue
        for name in sorted(os.listdir(directory)):
            if not name.endswith(".mjs"):
                continue
            files += 1
            path = os.path.join(directory, name)
            for number, line in enumerate(open(path, encoding="utf-8").read().splitlines(), 1):
                if line.lstrip().startswith(("//", "*", "/*")):
                    continue
                for match in ASSIGN.finditer(line):
                    if match.group(1) in READ_ONLY:
                        problems.append(
                            f"{os.path.relpath(path, ROOT)}:{number}: assigns to "
                            f"read-only ApplicationV2 property '{match.group(1)}'\n"
                            f"    {line.strip()}"
                        )

    for problem in problems:
        print(problem)
    print(f"\n{files} applications scanned, {len(problems)} read-only assignments")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
