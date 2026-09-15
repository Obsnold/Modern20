# Modern20

The **d20 Modern System Reference Document** as a game system for
[Foundry Virtual Tabletop](https://foundryvtt.com): character sheets that derive
what the book derives, the whole SRD as a searchable rules reference, and 1,677
compendium documents linked to the pages they came from.

Foundry v13, verified against v14.

## Installing

Paste this into Foundry's **Install System** dialog:

```
https://github.com/Obsnold/modern20/releases/latest/download/system.json
```

## What is in it

| | |
|---|---|
| **Characters** | All six basic classes and 46 advanced and prestige classes, 33 starting occupations, 52 talents, 137 feats — with a stepped creator and a level-up flow that apply the SRD's own arithmetic |
| **Rules** | Abilities, saves, Defense (normal, touch and flat-footed), initiative, grapple, all 41 skills with their specialties, action points, Reputation, massive damage, and the Wealth economy instead of currency |
| **Equipment** | 180 weapons, 40 suits of armor, 289 pieces of gear and 147 FX items across d20 Modern, Urban Arcana and d20 Future, with purchase DCs, restriction ratings and progress levels |
| **Creatures** | 300 creatures from all three bestiaries, 85 vehicles and 14 objects you can shoot — each arriving with the token its stat block implies: size in squares, vision from its senses line, hit points on a bar |
| **FX** | 174 spells and 87 psionic powers, with save DCs and casting handled by the sheet |
| **Reference** | The SRD's own text: 53 journal entries, 1,690 pages, linked in both directions — every document says which page its rules are on, and every page lists what it is the rules for |
| **Ready to play** | Six pregenerated first-level characters, a five-page guide inside the game, and an example scene with its walls already drawn |

**The rules roll themselves.** The SRD says what to roll constantly — *"a DC 15
Climb check"*, *"a Fortitude save (DC 14)"* — and 3,103 of those sentences, on
the rules pages and in the items' and creatures' own text, are the roll: click
the words and it rolls for your character, and where the SRD printed a DC the
card says whether the roll beat it. Typing `@Check[skill:climb|dc:15]` into
your own notes does the same thing.

**A compendium browser** over all eighteen packs, filtered the way the SRD
prices things: by book, by restriction rating, by progress level, and by what a
given Wealth bonus can actually afford.

**A self-test.** Settings → System Settings → **System self-test** checks the
system inside your own world: that every compendium holds what it should, that
a sheet derives the numbers the book prints, that each creature shows the
Defense the SRD gives it, that the rules links resolve, that the artwork is
being served. It builds a character, checks it, and deletes it again.

## Repository layout

```
module/          The system: data models, sheets, rolls, applications
templates/       Handlebars templates
css/  lang/      Styling and localization
assets/          Icons and token art (game-icons.net, CC BY 3.0)
src/packs/       Compendium source, one JSON per document
data/            The scraped SRD the packs were built from
tools/           Consistency checks
packs/           Compiled LevelDB packs; built on release, gitignored
```

## Releasing

Tag it. `.github/workflows/release.yml` compiles the eighteen compendia from
`src/packs`, writes the URLs from the repository it is running in, zips what the
manifest names, and attaches `system.json` and the zip to the release.

```bash
git tag "release-$(python3 -c 'import json; print(json.load(open("system.json"))["version"])')"
git push origin --tags
```

The tag has to match the version in `system.json` or the release is refused: a
release whose manifest and tag disagree installs and then never offers an
update.

A server installs from the same two URLs — read the manifest, compare its
`version` with what is installed, unpack the zip it names. That is also what
Foundry's own **Update System** button does.

## Checks

```bash
npm install
npm test          # lint, then every check
```

Eleven checks read this repository and seven build the system's data models
against Foundry stubs. Each exists because something it now catches had already
shipped:

| | |
|---|---|
| `check_models.mjs` | every data model builds, twice — a `DataField` reused between two schemas renders the world as a black page |
| `check_templates.mjs` | `{{formField fields.X}}` names a real schema field; a typo is a silently blank row on a sheet |
| `check_packs.py` | keys, ids, folders, prototype tokens and table ranges — a missing `_key` stops the Foundry CLI dead, and a creature's sheet has to show the Defense the book prints |
| `check_rules_links.py` | a link into the rules is a UUID in a JSON file: one that resolves to nothing opens no page and logs nothing |
| `check_art.py` | a broken image draws an empty frame and logs nothing, so 4,937 documents can lose their artwork in silence |
| `check_release.py` | a release missing `assets/` installs perfectly and draws no artwork |
| `check_private.py` | nothing here should name the machine it was written on |
| `check_creatures.mjs` | every creature's arithmetic against the SRD: 1,577 skill totals and 507 attacks |
| `check_lang.py`, `check_config.py`, `check_globals.py`, `check_shadowing.py`, `check_app_props.py`, `check_coverage.py` | missing localization strings, config that has drifted from the SRD, globals Foundry removed, a name defined twice, a read-only assignment, and SRD coverage that has regressed |

## License

Code is MIT — see [LICENSE.md](LICENSE.md).

Rules text and compendium content are **Open Game Content** under the Open Game
License v1.0a. [OPEN_GAME_LICENSE.md](OPEN_GAME_LICENSE.md) carries the licence
and the Section 15 chain. No Product Identity is included. Not affiliated with,
endorsed by, or sponsored by Wizards of the Coast.

Icons are from [game-icons.net](https://game-icons.net) under CC BY 3.0,
recoloured to this system's palette; every artist is credited in
[assets/icons/CREDITS.md](assets/icons/CREDITS.md).
