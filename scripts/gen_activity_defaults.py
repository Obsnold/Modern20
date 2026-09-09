#!/usr/bin/env python3
"""Generate module/activity-defaults.mjs from data/activity_defaults.json.

The defaults are shared: build_packs.py writes them into compendium items, and
the system uses this generated module to seed a newly created item and to
backfill one made before activities existed. Generating avoids the same rules
being written out twice and drifting.

    python3 scripts/gen_activity_defaults.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
source = json.load(open(os.path.join(ROOT, "data", "activity_defaults.json"), encoding="utf-8"))
defaults = {k: v for k, v in source.items() if not k.startswith("_")}


def strip(value):
    """Drop the citation keys; they document the JSON, not the runtime."""
    if isinstance(value, dict):
        return {k: strip(v) for k, v in value.items() if not k.startswith("_")}
    if isinstance(value, list):
        return [strip(v) for v in value]
    return value


module = f'''/**
 * Default activities by item type, generated from data/activity_defaults.json
 * by scripts/gen_activity_defaults.py.
 *
 * The same data drives the compendium build, so a weapon from a pack and one
 * created by hand end up with identical activities.
 */
export const ACTIVITY_DEFAULTS = {json.dumps(strip(defaults), indent=2)};
'''
open(os.path.join(ROOT, "module", "activity-defaults.mjs"), "w").write(module)
print("module/activity-defaults.mjs written")
