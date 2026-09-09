#!/usr/bin/env python3
"""Fail if a module-level name in scripts/ is defined twice.

Both of the parsing bugs found while importing creature abilities were this:
a second definition of a name that already existed further down the same file,
silently winning. `quality_key` was written as `ability_key`, which the psionic
power parser already had; `CREATURE_DAMAGE_TYPES` was written as
`DAMAGE_TYPES`, which the spell descriptions already had. Neither raises, and
both produce output that looks plausible — the second one was only caught
because a data check happened to assert that every stored damage type was one
the damage code knows.

ESLint's no-redeclare covers the same mistake in the .mjs; ruff's default rules
flag a redefined function but not a reassigned constant, which is exactly the
half that bit here. So the scripts get this.

    python3 scripts/check_shadowing.py
"""
import ast
import collections
import glob
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def bindings(tree: ast.Module) -> dict[str, list[int]]:
    """Every module-level name, with the lines that bind it.

    Only the top level: a name reused inside two different functions is two
    locals, which is fine, and a name bound in both halves of a try/except is
    a fallback rather than a mistake.
    """
    found = collections.defaultdict(list)
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            found[node.name].append(node.lineno)
        elif isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    found[target.id].append(node.lineno)
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            found[node.target.id].append(node.lineno)
    return found


def main() -> int:
    problems = 0
    files = sorted(glob.glob(os.path.join(ROOT, "scripts", "*.py")))

    for path in files:
        with open(path, encoding="utf-8") as handle:
            tree = ast.parse(handle.read(), path)

        for name, lines in bindings(tree).items():
            if len(lines) < 2:
                continue
            relative = os.path.relpath(path, ROOT)
            print(f"FAIL  {relative}:{lines[-1]} '{name}' is already defined "
                  f"at line {lines[0]}; the second definition wins")
            problems += 1

    print(f"\n{len(files)} scripts checked, {problems} shadowed definitions")
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
