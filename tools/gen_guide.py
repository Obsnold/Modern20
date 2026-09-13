#!/usr/bin/env python3
"""Build the journal a new world opens with.

    python3 tools/gen_guide.py            # write src/packs/guide
    python3 tools/gen_guide.py --check    # fail if it is out of date

The compendium holds 1,685 pages of the SRD and says nothing about *this*: what
the sheet rolls when you click it, that the gun in the browser knows its own
rules page, that dragging a weapon to the hotbar makes a macro, that there are
six characters ready to play. A system that has to be explained in a README to
somebody who is already inside Foundry has the explanation in the wrong place.

So this is one entry of five pages, written here and generated rather than
authored as JSON, for the same reason everything else is: the links have to be
real. Every reference to a rules page is resolved through the same index the
sheets use, so a page that stops existing fails this build rather than becoming
a link into nothing — and `@UUID` links into the compendium are how a reader
gets from "Wealth" to the chapter about Wealth in one click.
"""
from __future__ import annotations

import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_packs  # noqa: E402
import rules_pages  # noqa: E402
import srd  # noqa: E402

OUT = os.path.join(srd.ROOT, "src", "packs", "guide")

# The rules pages this guide sends a reader to, by the same source-and-title
# addressing gen_rules_links.py uses. A title that stops existing fails here.
LINKS = {
    "abilities": ("abilityscores.html", "Ability Scores"),
    "classes": ("basicclasses.html", "Basic Classes"),
    "occupations": ("occupations.html", "Occupations"),
    "skills": ("msrdskillsoverview.rtf", "Skill Basics"),
    "feats": ("feats.html", "Feats"),
    "combat": ("combat.html", "Combat"),
    "actions": ("combatactions.html", "Actions in Combat"),
    "wealth": ("wealth.html", "Wealth"),
    "actionPoints": ("msrdactionpoints.rtf", "Action Points"),
    "reputation": ("msrdreputation.rtf", "Reputation"),
    "injuryAndDeath": ("msrddeathdyinghealing.rtf", "Injury and Death"),
    "massiveDamage": ("msrddeathdyinghealing.rtf", "Massive Damage"),
    "fx": ("fxbasics.html", "FX Basics"),
    "equipment": ("equipment.html", "On-Hand Objects"),
    "legal": ("legal.html", "Legal Information"),
}


def pages(link: dict[str, str]) -> list[tuple[str, str]]:
    """Every page of the guide: a title, and its HTML."""
    return [
        ("Start here", f"""
<p>This world has the whole d20 Modern SRD in it: <strong>1,675 documents</strong>
across sixteen compendia, and <strong>1,685 pages</strong> of the rules themselves.
Everything below is about the parts a rulebook cannot tell you, because they are
about this system rather than about the game.</p>

<h2>If you want to play in five minutes</h2>
<p>Open the <strong>Ready-Made Characters</strong> compendium and drag one into the
world. There are six, one per basic class, built at first level by the book:
maximum hit points, skill points spent to the last one, a starting occupation, a
talent, three feats, and the gear to use them. Each carries a note saying why it
is put together the way it is.</p>

<h2>If you want to make your own</h2>
<p>Create an Actor of type <strong>hero</strong>. The sheet opens on a character
creator that walks the SRD's own order: {link['abilities']}, then
{link['classes']}, then {link['occupations']}, then {link['skills']} and
{link['feats']}. Nothing is written to the sheet until the step is finished, and
every step links to the rules it is applying.</p>

<h2>What is a compendium and what is a rule</h2>
<p>Every document in every compendium knows the page of the SRD it came from, and
says so on its own sheet. The reverse is also true: a rules page lists what it is
the rules for, so the page about handguns offers the twenty-three handguns.</p>
"""),

        ("Rolling things", f"""
<p><strong>Click anything on a sheet that is a number you would roll.</strong> An
ability, a save, a skill, an attack. The card that comes back says what was
rolled, against what, and whether it beat it.</p>

<h2>The rules roll themselves</h2>
<p>The SRD says what to roll constantly — <em>"a DC 15 Climb check"</em>,
<em>"a Fortitude save (DC 14)"</em> — and in this world those sentences are the
roll. 3,103 of them, on the rules pages and in the items' and creatures' own
text, render with a die in front of them; clicking one rolls it for the
character you are playing or the token you have selected. Where the SRD printed a
DC, the card says whether the roll beat it.</p>
<p>This works in your own notes too: type
<code>@Check[skill:climb|dc:15]</code> into any journal page or chat message.</p>

<h2>Action points and what happens when you run out of hit points</h2>
<p>{link['actionPoints']} are spent to improve a roll you have already made, and
the sheet's own box is the place to do it. {link['injuryAndDeath']} explains
what a character at 0 or fewer hit points is doing;
{link['massiveDamage']} is the rule that ends a fight suddenly, and this system
applies it automatically unless a setting says otherwise.</p>

<h2>Combat</h2>
<p>{link['combat']} and {link['actions']} are the chapters; the sheet tracks what
a turn has left in it — an attack action, a move action, a five-foot step — and
says so before you spend it twice.</p>
"""),

        ("Finding things", f"""
<h2>The compendium browser</h2>
<p>The compendium sidebar has a <strong>Browse</strong> button that opens every
pack at once, and it filters the way the SRD prices things:</p>
<ul>
<li>by book — d20 Modern, Urban Arcana, d20 Future, the Menace Manual</li>
<li>by {link['wealth']}: <em>"what can this character actually afford"</em>, which
is the question a purchase DC answers</li>
<li>by restriction rating — licensed, restricted, military, illegal</li>
<li>by progress level, for the d20 Future equipment</li>
</ul>
<p>Anything in it can be dragged straight onto a sheet or the canvas.</p>

<h2>Items on the hotbar</h2>
<p>Drag an item from a sheet to the hotbar and it becomes a macro that uses it.
The macro finds the item <em>by name on whoever is selected</em>, so one bar works
for the whole table, and it survives the item being sold and bought again — which
on a {link['wealth']} economy happens constantly.</p>

<h2>Equipment</h2>
<p>{link['equipment']} opens the equipment chapter. Purchase DCs, the black
market, and what carrying it all does to your speed are applied by the sheet.</p>
"""),

        ("For the GM", f"""
<h2>Creatures and vehicles</h2>
<p>399 actors: every creature in all three books, every vehicle, and the objects
the rules let you shoot. Each arrives with the token its stat block implies — the
size it occupies in squares, the vision its senses line states, its hit points on
a bar — so a Gargantuan wyrm is four squares of wyrm the moment it lands.</p>

<h2>Random tables</h2>
<p>26 of them, rollable: mutations, cybernetic side effects, where a grenade
actually lands, what a celestial is immune to. Each cites the page it was printed
on.</p>

<h2>FX</h2>
<p>{link['fx']} covers spells, psionics and the magic items. 174 spells, 87 powers
and 147 FX items are in the compendia, with save DCs and casting handled by the
sheet.</p>

<h2>When something looks wrong</h2>
<p>Settings → System Settings → <strong>System self-test</strong> checks this
system inside this world, in seven groups: that every compendium holds what it
should and every document in it loads, that a character sheet derives the
numbers the book prints, that each creature shows the Defense the SRD gives it,
that the rules links resolve, that the rolls in the text roll, that the artwork
is being served, and that a chat card renders. It builds a character, checks
it, and deletes it again. Where something is wrong, the failures copy to the
clipboard as text, which is the thing worth sending to somebody.</p>
"""),

        ("Legal", f"""
<p>This system implements the d20 Modern System Reference Document. The rules
text in the compendia is Open Game Content, distributed under the Open Game
License v1.0a: {link['legal']} is the licence itself, with the full Section 15
copyright chain.</p>
<p>No Product Identity is included. This system is not affiliated with, endorsed
by, or sponsored by Wizards of the Coast.</p>
<p>The system's own code is MIT. The icons are from game-icons.net under CC BY
3.0; every artist is credited in <code>assets/icons/CREDITS.md</code>.</p>
"""),
    ]


def build() -> list[dict]:
    index = rules_pages.default()

    link = {}
    missing = []
    for key, (source, title) in LINKS.items():
        page = index.page(source, title)
        if not page:
            missing.append(f'{key} ("{title}" in {source})')
            continue
        link[key] = f"@UUID[{page.uuid}]{{{title}}}"
    if missing:
        raise SystemExit("No such rules page:\n  " + "\n  ".join(missing))

    slug = "welcome"
    doc_id = build_packs.document_id("guide", slug)
    entry = {
        "_id": doc_id,
        "name": "Welcome to Modern20",
        "pages": [],
        "sort": 1000,
        "flags": {"modern20": {"book": "Modern20"}},
        "_key": f"!journal!{doc_id}",
        "_slug": slug,
    }
    for position, (title, html) in enumerate(pages(link)):
        page_id = build_packs.document_id("guide", f"{slug}-{position}")
        entry["pages"].append({
            "_id": page_id,
            "name": title,
            "type": "text",
            "title": {"show": True, "level": 1},
            "text": {"format": 1, "content": html.strip()},
            "sort": (position + 1) * 100000,
            "flags": {},
        })
    build_packs.key_embedded("journal", doc_id, entry)
    return [entry]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="fail if the guide is out of date")
    arguments = parser.parse_args()

    documents = build()
    os.makedirs(OUT, exist_ok=True)
    written = 0
    for entry in documents:
        path = os.path.join(OUT, f"{entry['_slug']}.json")
        text = json.dumps(entry, indent=2, ensure_ascii=False) + "\n"
        current = open(path, encoding="utf-8").read() if os.path.exists(path) else ""
        if current == text:
            continue
        if arguments.check:
            print("FAIL  src/packs/guide is out of date — "
                  "run python3 tools/gen_guide.py")
            return 1
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(text)
        written += 1

    pages_written = sum(len(entry["pages"]) for entry in documents)
    if arguments.check:
        print(f"the guide's {pages_written} pages match the rules they link to")
        return 0
    print(f"{len(documents)} entry, {pages_written} pages, "
          f"{written} file(s) written to src/packs/guide")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
