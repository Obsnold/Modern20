#!/usr/bin/env python3
"""Generate module/advancement-data.mjs from data/advancement.json.

What changes when a creature gains Hit Dice: what a step up in size does to
its physical abilities and natural armor, and what its type gives it in skill
points and feats per extra Hit Die. Generated rather than transcribed so the
numbers stay the SRD's; check_creatures.mjs diffs the two.

    python3 tools/gen_advancement.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
source = json.load(open(os.path.join(ROOT, "data", "advancement.json"), encoding="utf-8"))

by_size = {entry["from"]: entry for entry in source["sizes"]}
by_type = {entry["id"]: entry for entry in source["types"] if entry["id"]}

module = f'''/**
 * Advancing a creature, generated from data/advancement.json by
 * tools/gen_advancement.py.
 *
 * "The GM can improve a creature by increasing its Hit Dice. The Advancement
 * entry indicates the increased Hit Dice (and often size) of the creature."
 * The Hit Dice themselves drive base attack and saves through
 * CREATURE_PROGRESSION; this is what the size does.
 */

/**
 * "Table: Adjustments to Physical Abilities and Natural Armor", keyed by the
 * size being advanced from.
 *
 * "Repeat the adjustment if the creature moves up more than one size
 * category" — so this is one step, applied once per category climbed.
 */
export const SIZE_ADVANCEMENT = {json.dumps(by_size, indent=2, ensure_ascii=False)};

/**
 * What each type gains per extra Hit Die, in the SRD's own words.
 *
 * Kept as text rather than as numbers: two of the fifteen depend on the
 * creature's Intelligence modifier, and five gain nothing at all. A GM
 * reading "+1 per 4 extra HD" needs no help; a number invented for
 * "8 + Int modifier per extra HD" would be wrong for most creatures.
 */
export const ADVANCEMENT_BY_TYPE = {json.dumps(by_type, indent=2, ensure_ascii=False)};
'''

path = os.path.join(ROOT, "module", "advancement-data.mjs")
open(path, "w", encoding="utf-8").write(module)
print(f"module/advancement-data.mjs written ({len(by_size)} size steps, {len(by_type)} types)")
