#!/usr/bin/env python3
"""Generate module/combat-data.mjs from the scraped combat tables.

The action economy is one SRD table — "Table: Actions in Combat" — plus the
modifier tables that go with it. Generating the module from the scrape keeps
the numbers in one place: scripts/check_combat.mjs diffs the two, so a hand
edit to either shows up as a failing check.

    python3 scripts/gen_combat_data.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")

actions = json.load(open(os.path.join(DATA, "combat_actions.json"), encoding="utf-8"))
tables = json.load(open(os.path.join(DATA, "combat_tables.json"), encoding="utf-8"))

# Keyed by id so a lookup is a property access rather than a scan.
by_id = {entry["id"]: entry for entry in actions}

module = f'''/**
 * The combat tables, generated from data/combat_actions.json and
 * data/combat_tables.json by scripts/gen_combat_data.py.
 *
 * "Table: Actions in Combat" is the whole action economy: every action the
 * SRD names, what it costs, and whether it provokes an attack of opportunity.
 * The modifier tables are the numbers a circumstance adds to an attack or to
 * Defense. Both are transcribed rather than interpreted — a "maybe" in the
 * provokes column stays a "maybe", because the SRD means it.
 */

/** Every action the SRD names, keyed by id. */
export const COMBAT_ACTIONS = {json.dumps(by_id, indent=2, ensure_ascii=False)};

/**
 * "Attacker flanking defender +2", "Defender prone -4 melee / +4 ranged".
 *
 * Offered as choices rather than detected: working out flanking or cover from
 * token positions means guessing at what the GM can see, and every system that
 * tries it ends up arguing with the table.
 */
export const ATTACK_MODIFIERS = {json.dumps(tables["attackModifiers"], indent=2, ensure_ascii=False)};

export const DEFENSE_MODIFIERS = {json.dumps(tables["defenseModifiers"], indent=2, ensure_ascii=False)};

export const COVER = {json.dumps(tables["cover"], indent=2, ensure_ascii=False)};

export const CONCEALMENT = {json.dumps(tables["concealment"], indent=2, ensure_ascii=False)};

/**
 * "A resulting value of +6 or higher provides the hero with multiple attacks."
 * Each row lists the extra attacks, not the first one.
 */
export const EXTRA_ATTACKS = {json.dumps(tables["extraAttacks"], indent=2, ensure_ascii=False)};

/** The penalties for fighting with two weapons, by circumstance. */
export const TWO_WEAPON = {json.dumps(tables["twoWeapon"], indent=2, ensure_ascii=False)};
'''

open(os.path.join(ROOT, "module", "combat-data.mjs"), "w", encoding="utf-8").write(module)
print(f"module/combat-data.mjs written ({len(actions)} actions)")
