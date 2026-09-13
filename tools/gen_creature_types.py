#!/usr/bin/env python3
"""Generate module/creature-types.mjs from data/creature_types.json.

The fifteen creature types and the progression table they share. Generated
rather than transcribed so the numbers stay the SRD's; check_creatures.mjs
diffs the two.

    python3 tools/gen_creature_types.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
source = json.load(open(os.path.join(ROOT, "data", "creature_types.json"), encoding="utf-8"))
by_id = {entry["id"]: entry for entry in source["types"]}

module = f'''/**
 * The creature types, generated from data/creature_types.json by
 * tools/gen_creature_types.py.
 *
 * A type decides a creature's hit die, which of three base attack columns it
 * uses, which saves are good, and how many skill points and feats it gets —
 * everything needed to build one rather than copy one. Each carries the
 * per-size table the SRD prints with it: ability score ranges and natural
 * attack damage for a creature of that type and size.
 */

/** Keyed by id, so a lookup is a property access rather than a scan. */
export const CREATURE_TYPES = {json.dumps(by_id, indent=2, ensure_ascii=False)};

/**
 * "Table: Creature Saves and Base Attack Bonuses", by Hit Dice.
 *
 * Attack columns: A is three-quarters of Hit Dice, B is the full amount, C is
 * half. Which one a type uses is on the type.
 */
export const CREATURE_PROGRESSION = {json.dumps(source["progression"], indent=2, ensure_ascii=False)};
'''

open(os.path.join(ROOT, "module", "creature-types.mjs"), "w", encoding="utf-8").write(module)
print(f"module/creature-types.mjs written ({len(by_id)} types)")
