#!/usr/bin/env python3
"""Generate module/object-data.mjs from data/objects.json.

What it takes to break something: the Defense an object of each size has, the
hardness and hit points each substance gives it, and the hardness, hit points
and break DC the SRD prints for the objects it names. Generated rather than
transcribed so the numbers stay the SRD's; check_objects.mjs diffs the two.

    python3 scripts/gen_objects.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
source = json.load(open(os.path.join(ROOT, "data", "objects.json"), encoding="utf-8"))

by_size = {entry["size"]: entry for entry in source["sizes"]}
substances = {entry["id"]: entry for entry in source["substances"]}
defaults = {entry["size"]: entry for entry in source["objects"] if entry["size"]}

module = f'''/**
 * Objects, generated from data/objects.json by scripts/gen_objects.py.
 *
 * "Each object has hardness—a number that represents how well it resists
 * damage. Whenever an object takes damage, subtract its hardness from the
 * damage." That is damage reduction by another name, and the vehicles have
 * carried a hardness since they were imported with nothing subtracting it.
 */

/**
 * The Defense of an immobile object of each size.
 *
 * The printed figure is 10 + the size modifier - 5, since an object has no
 * Dexterity to add: a Medium-size object is Defense 5, a Colossal one -3.
 * "An object being held, carried, or worn has a Defense equal to the above
 * figure + 5 + the opponent's Dexterity modifier + the opponent's class bonus."
 */
export const OBJECT_DEFENSE = {json.dumps(by_size, indent=2, ensure_ascii=False)};

/** Hardness and hit points per inch of thickness, by what a thing is made of. */
export const SUBSTANCES = {json.dumps(substances, indent=2, ensure_ascii=False)};

/**
 * "Figures for manufactured objects are minimum values. The GM may adjust
 * these upward to account for objects with more strength and durability."
 *
 * What an object of a given size has when the SRD does not name it.
 */
export const OBJECT_DEFAULTS = {json.dumps(defaults, indent=2, ensure_ascii=False)};

/**
 * How much of an attack an object actually takes.
 *
 * "Acid and sonic/concussive attacks deal normal damage to most objects.
 * Electricity and fire attacks deal half damage to most objects; divide the
 * damage by 2 before applying the hardness. Cold attacks deal one-quarter
 * damage to most objects."
 */
export const OBJECT_DAMAGE_SHARE = {{
  fire: 0.5,
  electricity: 0.5,
  cold: 0.25
}};
'''

path = os.path.join(ROOT, "module", "object-data.mjs")
open(path, "w", encoding="utf-8").write(module)
print(f"module/object-data.mjs written ({len(by_size)} sizes, "
      f"{len(substances)} substances, {len(defaults)} size defaults)")
