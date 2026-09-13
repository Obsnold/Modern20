#!/usr/bin/env python3
"""Build the six ready-made characters, one per basic class.

    python3 scripts/gen_pregens.py            # write src/packs/pregens
    python3 scripts/gen_pregens.py --check    # fail if they are out of date

A system with 1,669 documents and no characters in it asks every new GM to
build one before they can see whether any of it works. These are the six the
SRD itself is organised around — a Strong hero, a Fast hero, and so on — at
first level, ready to drag onto a sheet.

What is *authored* is in `data/pregens.json`: the choices a player makes, with
a line saying why each character is put together the way it is. What is built
here is everything the rules then decide, and the point of generating rather
than writing them out is that the rules are applied rather than transcribed:

  - hit points: "A 1st-level character gets the maximum hit points rather than
    rolling (although the Constitution modifier is still applied)."
  - skill points: "(N + Int modifier) x4" at 1st level, where N is the class's
    own figure, with a class skill costing one point a rank and a cross-class
    skill two — and a maximum of four ranks, which is level + 3.
  - Wealth: "roll 2d4 and add the wealth bonus for the character's starting
    occupation". A pregenerated character cannot roll, so it takes 5, the
    average, and says so on the sheet.
  - class skills: the class's list and the occupation's choices, marked on the
    sheet so the ranks that were bought are visibly the ones a player could buy.

Every item is a real document copied out of the packs, so a pregen's gun is the
same gun the compendium ships, with the same rules page, the same artwork and
the same activities. Nothing here invents an item.

The arithmetic is checked as it is applied: a character who overspends skill
points, buys a cross-class rank they cannot afford, or exceeds the rank
maximum fails the build rather than reaching a table.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import art  # noqa: E402
import build_packs  # noqa: E402
import srd  # noqa: E402

PACKS = os.path.join(srd.ROOT, "src", "packs")
OUT = os.path.join(PACKS, "pregens")
SOURCE = os.path.join(srd.DATA, "pregens.json")

# "A 1st-level character gets the maximum hit points rather than rolling."
HIT_DIE_MAX = {"1d6": 6, "1d8": 8, "1d10": 10, "1d12": 12}

# "To determine a character's starting Wealth bonus, roll 2d4 and add the
# wealth bonus for the character's starting occupation." A printed character
# cannot roll; 5 is the average of 2d4.
STARTING_WEALTH_ROLL = 5

# What a 1st-level hero has before anything is spent.
STARTING_ACTION_POINTS = 5


def document(pack: str, slug: str) -> dict:
    path = os.path.join(PACKS, pack, f"{slug}.json")
    if not os.path.exists(path):
        raise SystemExit(f"no such document: {pack}/{slug}")
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def ability_mod(score: int) -> int:
    return (score - 10) // 2


def class_skill_keys(cls: dict, occupation: dict, chosen: list[str]) -> set[str]:
    """Every skill that is a class skill for this character.

    The class's own list, plus the skills the occupation grants — which the
    SRD makes the player choose from a list, so the choice is the character's
    and is stated in data/pregens.json.
    """
    keys = set()
    for entry in cls["system"]["classSkills"]:
        keys.add(entry["skill"] + (f":{entry['specialty']}" if entry["specialty"] else ""))
    granted = {option["skill"] + (f":{option['specialties'][0]}"
                                  if option.get("specialties") else "")
               for option in occupation["system"].get("skillOptions") or []}
    for key in chosen:
        if key in granted:
            keys.add(key)
    return keys


def skills_for(character: dict, cls: dict, occupation: dict) -> tuple[dict, list[str]]:
    """The skills block, and any way the character breaks the rules."""
    problems = []
    intelligence = ability_mod(character["abilities"]["int"])
    budget = (cls["system"]["skillPointsPerLevel"] + intelligence) * 4
    # "The maximum rank in a class skill is the character's level + 3."
    maximum = 1 + 3

    class_keys = class_skill_keys(cls, occupation, list(character["skills"]))

    spent = 0
    skills: dict[str, dict] = {}
    for key, ranks in character["skills"].items():
        name, _, specialty = key.partition(":")
        is_class = key in class_keys or name in class_keys
        spent += ranks * (1 if is_class else 2)
        if ranks > (maximum if is_class else maximum / 2):
            problems.append(f"{key}: {ranks} ranks is over the maximum for a "
                            f"1st-level character")

        entry = skills.setdefault(name, {"ranks": 0, "misc": 0,
                                         "classSkill": False, "specialties": []})
        if specialty:
            entry["specialties"].append({"name": specialty, "ranks": ranks,
                                         "misc": 0, "classSkill": is_class})
            entry["classSkill"] = entry["classSkill"] or is_class
        else:
            entry["ranks"] = ranks
            entry["classSkill"] = is_class

    if spent > budget:
        problems.append(f"spends {spent} skill points and has {budget}")
    elif spent < budget:
        problems.append(f"leaves {budget - spent} of {budget} skill points unspent")

    return skills, problems


def embedded(pack: str, slug: str, owner: str, order: int) -> dict:
    """A pack document as an item on a character.

    Copied whole: the same rules page, artwork, activities and effects the
    compendium ships, with an id derived from the character and the slug so a
    rebuild updates the item in place rather than adding a second one.
    """
    source = document(pack, slug)
    item = {key: value for key, value in source.items()
            if key not in ("_key", "_slug", "folder", "sort", "ownership", "_stats")}
    item["_id"] = build_packs.document_id("pregens", f"{owner}-{pack}-{slug}")
    item["sort"] = (order + 1) * 1000
    return item


def build_character(character: dict) -> tuple[dict, list[str]]:
    cls = document("classes", character["class"])
    occupation = document("occupations", character["occupation"])

    abilities = character["abilities"]
    skills, problems = skills_for(character, cls, occupation)

    hit_die = cls["system"]["hitDie"]
    if hit_die not in HIT_DIE_MAX:
        problems.append(f"{cls['name']} has a hit die this cannot read: {hit_die}")
    # Maximum at 1st level, and "even if the result is 0 or lower, the
    # character always gains at least 1 hit point".
    hp = max(1, HIT_DIE_MAX.get(hit_die, 6) + ability_mod(abilities["con"]))

    wealth = STARTING_WEALTH_ROLL + (occupation["system"].get("wealthBonus") or 0)
    # "plus 1 if the character has ranks in Profession"
    if character["skills"].get("profession"):
        wealth += 1

    items = []
    order = 0
    for pack, slugs in (("classes", [character["class"]]),
                        ("occupations", [character["occupation"]]),
                        ("talents", [character["talent"]]),
                        ("feats", character["feats"]),
                        ("weapons", character["weapons"]),
                        ("armor", character["armor"]),
                        ("gear", character["gear"])):
        for slug in slugs:
            item = embedded(pack, slug, character["id"], order)
            if pack == "classes":
                item["system"]["levels"] = 1
            items.append(item)
            order += 1

    slug = f"pregen-{character['id']}"
    doc_id = build_packs.document_id("pregens", slug)
    actor = {
        "_id": doc_id,
        "name": character["name"],
        "type": "hero",
        # Filled in below, once the occupation this is pictured by exists on
        # the actor: resolving it from a name alone gives every character the
        # same figure while their tokens differ, which is worse than either.
        "img": "",
        "system": {
            "abilities": {key: {"value": value, "tempMod": 0, "damage": 0}
                          for key, value in abilities.items()},
            "hp": {"value": hp, "max": hp, "temp": 0, "formula": hit_die},
            # Defense, saves and base attack are the class item's to give, and
            # are left where the model puts them.
            "defense": {"classBonus": 0, "equipment": 0, "naturalArmor": 0, "misc": 0},
            "saves": {key: {"base": 0, "misc": 0} for key in ("fort", "ref", "will")},
            "attributes": {"baseAttack": 0, "size": "medium", "speed": 30,
                           "initiative": {"misc": 0}},
            "skills": skills,
            "allegiances": character["allegiances"],
            "details": {**character["details"], "xp": 0},
            "wealth": {"bonus": wealth},
            "reputation": {"base": 0, "misc": 0},
            "actionPoints": {"value": STARTING_ACTION_POINTS},
            "biography": f"<p>{character['note']}</p>",
            "source": "d20 Modern SRD",
        },
        "items": items,
        "prototypeToken": build_packs.prototype_token(space=5.0),
        "_key": f"!actors!{doc_id}",
        "_slug": slug,
    }
    actor["img"] = art.icon_for("pregens", actor) or ""
    if not actor["img"]:
        problems.append("has no artwork; scripts/art.py has no rule for it")
    build_packs.apply_art(actor, "pregens")
    build_packs.key_embedded("actors", doc_id, actor)
    return actor, [f"{character['name']}: {problem}" for problem in problems]


def build() -> tuple[list[dict], list[str]]:
    with open(SOURCE, encoding="utf-8") as handle:
        authored = json.load(handle)
    documents = []
    problems = []
    for character in authored:
        actor, found = build_character(character)
        documents.append(actor)
        problems += found
    return documents, problems


def merge(current: dict, built: dict) -> dict:
    """The built document, over whatever the file already holds.

    A pregen's file is written here and then added to by `link_rules.py`, which
    stamps the rules page each item cites. Rewriting the file whole would drop
    that on every run, and comparing it whole would report the file as out of
    date the moment the reconciler touched it. So the generator owns the keys
    it writes and leaves the rest alone — the same rule the reconciler follows
    in the other direction.
    """
    out = dict(current)
    for key, value in built.items():
        if isinstance(value, dict) and isinstance(current.get(key), dict):
            out[key] = merge(current[key], value)
        elif isinstance(value, list) and isinstance(current.get(key), list) \
                and len(value) == len(current[key]):
            out[key] = [merge(was, now) if isinstance(now, dict) and isinstance(was, dict)
                        else now
                        for was, now in zip(current[key], value)]
        else:
            out[key] = value
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="fail if the pack is out of date")
    arguments = parser.parse_args()

    documents, problems = build()
    for problem in problems:
        print(f"FAIL  {problem}")
    if problems:
        return 1

    os.makedirs(OUT, exist_ok=True)
    written = 0
    for actor in documents:
        path = os.path.join(OUT, f"{actor['_slug']}.json")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as handle:
                stored = json.load(handle)
        else:
            stored = {}
        merged = merge(stored, actor)
        if stored == merged:
            continue
        if arguments.check:
            print(f"FAIL  src/packs/pregens/{actor['_slug']}.json no longer matches "
                  "data/pregens.json — run python3 scripts/gen_pregens.py")
            return 1
        with open(path, "w", encoding="utf-8") as handle:
            json.dump(merged, handle, indent=2, ensure_ascii=False)
            handle.write("\n")
        written += 1

    if arguments.check:
        print(f"{len(documents)} pregenerated characters match data/pregens.json")
        return 0

    print(f"{len(documents)} characters, {written} written to src/packs/pregens")
    for actor in documents:
        system = actor["system"]
        print(f"  {actor['name']:24s} {len(actor['items']):2d} items, "
              f"{system['hp']['max']:2d} hp, Wealth +{system['wealth']['bonus']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
