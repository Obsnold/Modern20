#!/usr/bin/env python3
"""Regenerate module/condition-list.mjs and the language entries for conditions.

Condition names and rules text come from the SRD, so they are generated rather
than typed. The mechanical changes each condition applies are hand-authored in
module/conditions.mjs, because mapping prose to an ActiveEffect is a judgement
call — each entry there cites the phrase it encodes.

    python3 tools/scrape.py && python3 tools/gen_conditions.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

conditions = json.load(open(os.path.join(ROOT, "data", "conditions.json"), encoding="utf-8"))
entries = ",\n".join(f'  {{ id: "{c["id"]}" }}' for c in conditions)

module = f'''/**
 * The SRD's condition list, generated from data/conditions.json by
 * tools/gen_conditions.py. Names and descriptions live in lang/en.json under
 * MODERN20.Condition, so they can be translated; the mechanical changes are in
 * module/conditions.mjs.
 */
export const CONDITIONS = [
{entries}
];
'''
open(os.path.join(ROOT, "module", "condition-list.mjs"), "w").write(module)

path = os.path.join(ROOT, "lang", "en.json")
lang = json.load(open(path, encoding="utf-8"))
lang["MODERN20"]["Condition"] = {
    c["id"]: {"name": c["name"], "description": c["description"]} for c in conditions
}
with open(path, "w", encoding="utf-8") as handle:
    json.dump(lang, handle, indent=2, ensure_ascii=False, sort_keys=True)
    handle.write("\n")

print(f"{len(conditions)} conditions written to module/condition-list.mjs and lang/en.json")
