#!/usr/bin/env python3
"""Regenerate module/rules-links.mjs: the pages the sheets link to.

A compendium document carries its own page in `system.rulesPage`, stamped by
the import. The rest of the system has nowhere to carry one: a skill is a key
in config.mjs, an action point is a box on a sheet, and a condition is a status
effect. Those links live here instead — the page each is described on, by name,
resolved to the UUID it will have in the compendium.

Which page a topic means is a judgement, so the table below is written by hand
and each entry says what reads it. The UUIDs are not: they are derived from the
SRD page and the page title, and a title that stops existing fails this rather
than generating a link into nothing.

    python3 tools/gen_rules_links.py
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rules_pages  # noqa: E402
import srd  # noqa: E402

# Topic -> the SRD page and the title of the page that describes it, with the
# part of the system that links to it. Every one of these is checked against
# what the sheets actually reference by tools/check_rules_links.py, so a
# topic nothing links to is a failure rather than dead weight.
TOPICS = {
    # The hero, ordinary and creature sheets: one link per panel heading.
    "abilities": ("abilityscores.html", "Ability Scores"),
    "saves": ("combat.html", "Combat"),
    "combat": ("combat.html", "Combat"),
    "actions": ("combatactions.html", "Actions in Combat"),
    # The record cards that report what damage did.
    "injuryAndDeath": ("msrddeathdyinghealing.rtf", "Injury and Death"),
    "nonlethalDamage": ("msrddeathdyinghealing.rtf", "Nonlethal Damage"),
    # The header boxes, each of which is a chapter of its own.
    "actionPoints": ("msrdactionpoints.rtf", "Action Points"),
    "reputation": ("msrdreputation.rtf", "Reputation"),
    "wealth": ("wealth.html", "Wealth"),
    "massiveDamage": ("msrddeathdyinghealing.rtf", "Massive Damage"),
    # The skills tab, above the table.
    "skills": ("msrdskillsoverview.rtf", "Skill Basics"),
    # The gear tab: what a purchase DC is, and what carrying it all costs.
    "carryingCapacity": ("equipment.html", "Carrying Capacity"),
    "blackMarket": ("equipment.html", "The Black Market"),
    # The casting tab.
    "fx": ("fxbasics.html", "FX Basics"),
    # The creature sheet, whose abilities tab is a glossary of these.
    "creatureTypes": ("creaturetypes.html", "Creature Types"),
    "specialAbilities": ("specialabilities.html", "Special Abilities"),
    "advancingCreatures": ("advancement.html", "Advancing Creatures"),
    # The object sheet: hardness, hit points and break DCs are printed here.
    "objects": ("combatsa.html", "Special Attacks"),
    # d20 Future prices its equipment by progress level.
    "progressLevels": ("futurepl.html", "Progress Levels"),
}

# Not here: the Condition Summary. Conditions are applied from Foundry's own
# token HUD, which is not a template this system renders, and a link inside a
# tooltip cannot be clicked. The page is in the compendium to be read; nothing
# links to it, so nothing declares it.

# Where the skill entries are. The SRD's skill index is skills.html; the
# descriptions are on skillsorder.html, one page each since the split.
SKILL_PAGES = "skillsorder.html"


def skill_links(index: rules_pages.RulesIndex) -> dict[str, str]:
    """Every skill, and the specialties the SRD describes separately.

    A specialty is keyed `craft:chemical`, because Craft (chemical) has a page
    of its own and Knowledge (streetwise) does not — the SRD describes the
    seven Craft subjects one at a time and lists the fourteen Knowledge ones.
    """
    with open(os.path.join(srd.DATA, "skills.json"), encoding="utf-8") as handle:
        skills = json.load(handle)
    with open(os.path.join(srd.DATA, "skill_specialties.json"), encoding="utf-8") as handle:
        specialties = json.load(handle)

    links = {}
    missing = []
    for skill in skills:
        page = index.page(SKILL_PAGES, skill["name"])
        if not page:
            missing.append(skill["name"])
            continue
        links[skill["id"]] = page.uuid
        for option in (specialties.get(skill["id"]) or {}).get("options") or []:
            found = index.page(SKILL_PAGES, f"{skill['name']} ({option})")
            if found:
                links[f"{skill['id']}:{option.lower()}"] = found.uuid

    if missing:
        raise SystemExit("No rules page for: " + ", ".join(missing))
    return links


def render(topics: dict[str, str], skills: dict[str, str]) -> str:
    def block(entries: dict[str, str]) -> str:
        return ",\n".join(f'  "{key}": "{value}"' for key, value in entries.items())

    return f'''/**
 * Where the rules for a topic are, generated from data/rules.json by
 * tools/gen_rules_links.py.
 *
 * Every compendium document carries its own page in `system.rulesPage`. These
 * are for the things that are not documents: the ability scores a panel of the
 * sheet shows, the Wealth box, the skill each row of the skills table is. The
 * page each one means is chosen in the generator, where the reason is written
 * down; the UUIDs are derived from the SRD.
 *
 * A world without the rules compendium installed simply has no page to open,
 * which module/rules.mjs reports rather than throwing.
 */

/** The page for a topic the sheets name. */
export const RULES_TOPICS = {{
{block(topics)}
}};

/**
 * The page for each skill, and for the specialties the SRD describes one at a
 * time: `craft:chemical` has a page, `knowledge:streetwise` does not.
 */
export const SKILL_RULES = {{
{block(skills)}
}};
'''


def main() -> int:
    index = rules_pages.default()

    topics = {}
    missing = []
    for topic, (source, title) in TOPICS.items():
        page = index.page(source, title)
        if not page:
            missing.append(f'{topic} ("{title}" in {source})')
            continue
        topics[topic] = page.uuid
    if missing:
        print("No such rules page:\n  " + "\n  ".join(missing), file=sys.stderr)
        return 1

    skills = skill_links(index)
    path = os.path.join(srd.ROOT, "module", "rules-links.mjs")
    with open(path, "w", encoding="utf-8") as handle:
        handle.write(render(topics, skills))

    specialties = sum(1 for key in skills if ":" in key)
    print(f"{len(topics)} topics and {len(skills) - specialties} skills "
          f"({specialties} specialties) written to module/rules-links.mjs")
    return 0


if __name__ == "__main__":
    sys.exit(main())
