# Modern20

A [Foundry Virtual Tabletop](https://foundryvtt.com) game system implementing the
[d20 Modern System Reference Document](https://spellbooksoftware.com/d20mrsd/srdhome.html):
basic and advanced classes, talent trees, occupations, Defense, Reputation,
action points, massive damage, and the Wealth economy.

**Status: early scaffold.** The data models, documents, sheets and SRD pipeline
are in place and the equipment compendia build from the SRD. It has not yet been
loaded in a live Foundry world — expect to debug the first launch.

Requires Foundry **v13 or later** (verified against v14).

---

## Why a system and not a module

d20 Modern is not a dnd5e reskin. Wealth replaces currency entirely, Defense is a
class-granted bonus rather than an armor value, and talents and action points
have no 5e equivalent. Layering that on another system's data model means
fighting it forever, so this is a standalone game system.

## What is implemented

| Area | State |
|---|---|
| Abilities, saves, Defense (normal/touch/flat-footed), initiative, grapple | Derived and working |
| All 41 SRD skills, with trained-only and armor-check-penalty handling | Working, verified against the SRD |
| Specialty skills — Knowledge (streetwise), Craft (chemical), … | Working |
| Wealth checks, purchase DCs, restriction ratings, black market surcharge | Working |
| Action points, massive damage threshold and Fortitude save | Working |
| Class progression folding into attack, saves, Defense and Reputation | Working, for all 52 classes in three books |
| Compendia: classes, occupations, talents, feats, spells, psionic powers, weapons, armor, gear | 1,044 items, built from the SRD |
| d20 Future and Urban Arcana equipment | 237 of those items, tagged by book and progress level |
| Ammunition and containers | 24 ammunition types; 10 bags and cases that hold items |
| Compendia: creatures, vehicles, objects | 399 actors, built from the SRD — every creature in all three books |
| Rules reference | 53 journal entries, 1,685 pages — the SRD's own text, in four books, cross-linked |
| Everything links to it | All 1,590 compendium documents carry the page their rules are on, and 854 pages list the documents they are the rules for; the sheets link 19 topics and every skill |
| The rules roll themselves | 3,103 sentences — 2,054 across 693 rules pages and 1,049 in the items' and creatures' own text — "a DC 15 Climb check" is the roll, clicked where it is printed |
| Feats that apply themselves | 22 of the 189 feats and talents state a bonus plainly enough to carry an Active Effect; the rest stay text |
| Compendium browser | All 1,590 documents in one window, filtered by book, compendium, restriction rating, progress level and what a Wealth bonus can afford |
| Random tables | 26 RollTables — mutations, cybernetic side effects, where a grenade lands, what a celestial is immune to |
| Items on the hotbar | Dragging one there makes a macro that uses it, by name, on whoever is selected |
| FX items | 147 magic and psionic items, priced and described |
| Objects | Hardness, hit points, break DCs and Defense by size — a door is an actor you can shoot |
| Cover art and an example scene | Drawn from the system's own palette; the scene's 32 walls are generated from the same description as its picture |
| Ready-made characters | Six, one per basic class, built at first level by the SRD's own arithmetic — and checked by it |
| A guide inside the game | Five journal pages about the system rather than the game, linked into the rules compendium |
| Artwork | 163 icons over 4,864 documents, chosen by what each thing is: a handgun is a handgun, an SUV an SUV, a Fortitude save an aura |
| Tokens | All 399 actors: size in squares, vision from the senses line, disposition, HP bar — and artwork, the same drawing cut as a disc for the canvas |
| Creature special abilities, senses, skills, feats and damage reduction | 1,969 ability items, 1,743 with the SRD's own rules text, 93 rollable |
| Prototype tokens | All 399 actors: the size the stat block fills, the senses it sees with, hit points on the bar |
| Sheets for all four actor types | Hero, ordinary, creature and vehicle |

Prerequisites and skill rank caps are surfaced as **warnings, never enforced**.
GMs override them constantly and a hard block just makes the sheet unusable.
The same applies to class levels: taking a class past the end of its SRD
progression table warns and holds the bonuses at the last defined level.

**Levelling up:** the Character tab has `-` / `+` controls on each class. `+`
opens a level-up screen showing what the level grants, every choice it needs,
the hit point roll, and a before-and-after of attack, Defense, saves and
Reputation — applied together on confirm, so closing the window changes
nothing. `-` just decrements, being a correction rather than a decision.

The screen offers whatever that level grants — a talent from the class's own trees, a bonus feat, or a named
class feature. Numbers are applied before the prompt, so dismissing it still
leaves a correctly levelled character. Multiclassing is just a second class
item; character level is the sum.

Across the 500 progression rows the SRD defines, that is 30 talent picks, 159
bonus feats and 432 named features. Only two of the named features match a feat
that exists in the compendium, so the rest are recorded as class-feature
talents — they are described in the class's own page prose, not as reusable
feats.

A level also rolls hit points, refreshes action points, and applies the two
character-level milestones the SRD states independently of class level: a feat
every third level and +1 to an ability score every fourth. Hit points are the
maximum die roll only for a character's very first level — *"when picking up a
new class, a hero doesn't receive maximum hit points but should roll the new
Hit Die"* — and a level never yields fewer than one.

The Skills tab shows the point budget: a class grants its per-level points plus
the Intelligence modifier each level, never fewer than one, with the starting
class's first level worth four times that. Overspending is flagged, not blocked.
`skillPointBudget` in `module/data/actor-hero.mjs` is a pure function so the
arithmetic can be tested directly.

## Layout

```
system.json              Manifest: compatibility, document types, packs
module/
  modern20.mjs           Entry point; registers everything on init
  config.mjs             Rules constants transcribed from the SRD
  data/                  DataModel schemas for every Actor and Item type
  documents/             Actor and Item classes: rolls, purchases, damage
  sheets/                ApplicationV2 sheets
  dice/wealth.mjs        The Wealth economy
  rules.mjs              Links into the rules compendium; rules-links.mjs is generated
  enrichers.mjs          The rolls the rules text asks for, as rolls
  effects.mjs            What an item applies, in the sheet's own words
  apps/browser.mjs       One window over every compendium, filtered the SRD's way
  macros.mjs             An item dragged to the hotbar, as a macro that uses it
  migrate.mjs            What a world already playing needs when the system changes
templates/               Handlebars templates (actor, item, chat)
css/modern20.css         Styling, scoped under .modern20
lang/en.json             Localization
tools/                   The pipeline: import, build, generate, check, release
data/                    Scraped SRD output; committed
src/packs/               Compendium source documents; committed
packs/                   Compiled LevelDB packs; generated, gitignored
```

Nothing under `tools/`, `data/` or `src/packs/` is ever served to Foundry — the
release zip and the private deploy both carry only `module`, `templates`, `css`,
`lang`, `assets`, the compiled `packs` and `system.json`. The pipeline is in the
repository because the release runs it, which is how the systems this is modelled
on are laid out: dnd5e keeps its build tooling in `utils/` and commits
`packs/_source/` while gitignoring the compiled packs, and pf2e keeps its in
`build/`. A system's repository is its source, not its zip.

## Releasing it

A Foundry system is distributed as **two files on a release**: the `system.json`
a user pastes into *Install System*, and a zip of everything the manifest
names. Foundry reads the manifest, fetches the zip, and unpacks it into
`Data/systems/modern20`. There is no registry to publish to and no packaging
format beyond the zip — listing it in Foundry's own package browser is a
separate, optional submission on foundryvtt.com, which asks for those same two
URLs.

So: **tag it.**

```bash
git tag "release-$(python3 -c 'import json; print(json.load(open("system.json"))["version"])')"
git push origin --tags
```

`.github/workflows/release.yml` then runs every check, compiles the eighteen
compendia from `src/packs` with the Foundry CLI, zips what the manifest names,
and publishes the release with `system.json` and
`modern20-release-<version>.zip` attached. Users install from:

```
https://github.com/<owner>/<repo>/releases/latest/download/system.json
```

Shaped after [dnd5e's own release workflow](https://github.com/foundryvtt/dnd5e/blob/master/.github/workflows/release.yml),
which is the one every other system copies, and it keeps the two ideas that stop
a broken release going out: **the tag has to match the version** in
`system.json`, or the release is refused — a release whose manifest disagrees
with its tag installs and then never offers an update — and **the zip's contents
are worked out from the manifest** rather than listed, so a directory added to
the system cannot be left out of its own release. `check_deploy.py` holds it to
the same rule it holds the private deploy to: every directory the system reads
at runtime has to reach it, and a release missing `assets/` installs perfectly
and draws no artwork.

Where this differs from dnd5e: the URLs are **written at release time** from the
repository the workflow runs in, rather than committed and then verified. This
repository never names an owner it might not have, and a fork's release points
at the fork rather than at somebody else's downloads.

`tools/deploy.sh` is a different thing and not how anybody else gets this: it
scp's the working tree to one Foundry host and restarts it, which is the inner
loop while developing. Its host and paths come from `MODERN20_HOST` and friends.
Foundry's own recommendation for that loop, if the server is the same machine
you write on, is simpler still — symlink the repository into
`Data/systems/modern20` and reload the world.

## Creating and levelling

`tools/deploy.sh` builds, verifies and installs in one step:

```bash
export MODERN20_HOST=user@host         # once, in your own shell
tools/deploy.sh                      # code, templates, styles, assets
tools/deploy.sh --packs              # also recompile and install the compendia
tools/deploy.sh user@other --packs   # or name a host for this run
```

Where it deploys to comes from the environment, never from a file here:

| | |
|---|---|
| `MODERN20_HOST` | `user@host` of the Foundry server — required, and the deploy says so if it is unset |
| `MODERN20_DEST` | where the system is installed there; defaults to `/var/lib/foundryvtt/Data/systems/modern20`, which is where a packaged Foundry on Linux keeps its data |
| `MODERN20_NODE_BIN` | a directory to put on `PATH` on that host, if node is not already on it |
| `MODERN20_FVTT` | the Foundry CLI there; defaults to `fvtt`, which is what installing it globally gives you |

`check_private.py` holds the repository to that: no addresses, no `user@host`,
no home directories, no paths into one person's toolchain. It also fails a
script nothing runs and nothing imports — `resize_tokens.py` was one, a one-off
that set the token scale by walking every JSON file in the repository, which is
now a line in `art.py`; left behind, it is something the next reader has to
work out the status of. All of that was
written out here for a while — one laptop's default host in two scripts — and
none of it was a secret, but a default that silently points at a machine the
reader does not have is worse than no default at all.

Every check runs before anything is copied, and a failure stops the deploy.
Checks are deliberately not piped into `tail`: a pipe reports the exit status of
the last command in it, which once let a failing check deploy anyway.

**Character creation** is a stepped flow — abilities, occupation, class, review —
reached from the Character tab of a hero with no class yet. It follows the shape
the mature Foundry systems settled on, where each pick narrows the next, and it
writes nothing until Create is pressed. Applying a choice reuses the same code
paths as levelling and as dropping an occupation onto a sheet rather than
duplicating them, so first-level hit points are the maximum and the class's own
level 1 grant is offered exactly as it would be at any other level.

The SRD does not state how to generate ability scores, so the creator offers the
conventional options — standard array, 4d6 drop lowest, or entry by hand —
rather than presenting one as official.

## Attacks

An attack resolves against the target's Defense when a token is targeted, and
says so on its own chat card. The rules it encodes, quoted where they decide
something:

- *"If the result equals or beats the target's Defense, it's a hit."*
- *"A natural 1 is always a miss. A natural 20 is always a hit. A natural 20 is
  also always a threat — a possible critical hit."*
- *"If the threat is confirmed, a weapon deals double damage on a critical hit
  (roll damage twice, as if hitting the target two times)."* A threat therefore
  rolls a confirmation against the same Defense, and a confirmed critical rolls
  the whole damage expression **twice** rather than multiplying it by two —
  which is a different number as soon as a Strength modifier or a flat bonus is
  involved.
- *"Each full range increment causes a cumulative -2 penalty on the attack
  roll."* Distance comes from the grid when both tokens are placed, and the
  penalty is simply omitted when it cannot be measured.
- **Melee is measured too**, against reach rather than increments: five feet
  for anything Medium-sized, or the weapon's own where it has one. The SRD's
  two reach weapons are recorded in `data/overrides/weapons.json`, since the
  melee table has no reach column — a Spear strikes at 10 ft but *"can't use
  it against an adjacent foe"*, and a Chain reaches 10 ft and is the stated
  exception that can.
- *"A thrown weapon has a maximum range of five range increments. Ranged
  weapons that fire projectiles can shoot up to ten increments."* A rate of
  fire is what separates the two in the data — a firearm or a bow has one, a
  thrown hatchet or grenade does not — so a Desert Eagle reaches 400 ft and a
  hatchet 50 ft. Beyond that the card says so and calls it a miss rather than
  refusing the roll.
- Melee attack bonus is base attack + Strength + size; ranged is base attack +
  Dexterity + range penalty + size.

### Activities

An item is not a single action, so every item type carries an `activities`
array: one entry per thing it can do. An automatic firearm offers **Shot**,
**Auto** and **Burst**; a grenade would carry an area and a save; a magic item
carries whatever it does. Adding a new kind of item means authoring an
activity, not adding a branch to the attack code.

Every item stores its own activities — there is no runtime fallback, so what
the sheet shows is what is stored, and a compendium weapon is as editable as
any other. Three paths write them, all from the same
`data/activity_defaults.json`:

- `tools/build_packs.py` writes them into compendium items at build time
- `Modern20Item._preCreate` seeds an item created by hand
- `Modern20Weapon.migrateData` backfills one made before activities existed

`tools/gen_activity_defaults.py` generates `module/activity-defaults.mjs`
from that same JSON, so the build and the runtime cannot drift. Unavailable
activities are shown disabled with the reason.

Activities are typed sub-documents, stored as a `TypedObjectField` of
`TypedSchemaField` — Foundry's own machinery for *"a union of schema-constrained
objects discriminable via a type property"*, keyed by id. Each type declares its
own schema and its own class, so an attack validates attack fields and a saving
throw validates a DC, and one item can hold several of different types.

Four types ship — attack, save, damage, utility — registered on
`CONFIG.MODERN20.activityTypes` at init, so a module can add its own before any
item is prepared. The item sheet has an **Activities** tab to add, edit and
delete them, which is what makes a magic item or a one-off gadget authorable
in play rather than in JSON.

A `TypedSchemaField` will not let an entry change type after creation, so the
editor creates and deletes rather than converting.

- **Autofire**: *"targets a 10-foot-by-10-foot area and makes an attack roll;
  the targeted area has an effective Defense of 10"*, affecting everyone in it,
  at -4 without Advanced Firearms Proficiency. The area Defense is an
  activity's `attack.defenseOverride`, not a special case in the resolver.
- **Explosives** place their burst radius on the canvas as a **Region**. In v14
  the MeasuredTemplate document was merged into Region — `Scene#templates` is
  deprecated until v16, and `MeasuredTemplateDocument.createDocuments` is a shim
  that creates a Region with `flags.core.MeasuredTemplate` and converts back —
  so this creates Regions directly rather than using a path with a removal
  date. Radii convert to pixels the way core does, `grid.size / grid.distance`,
  and follow the `gridTemplates` setting for whether the shape snaps.

  Auto-targeting whoever stands inside is deliberately not done: that is module
  territory in every system, and doing it would override targets the player has
  chosen.

  They carry a burst radius and a fixed Reflex DC instead of a rate of
  fire, so they get a **Detonate** activity in place of a shot: *"An explosive
  ... affects all creatures and objects within its burst radius"*, with *"a
  Reflex save against the DC given in this column for half damage."* The card
  states the radius and DC, rolls the damage, and rolls saves for whoever is
  targeted.
- **Burst fire**: needs the feat and five rounds loaded, *"a -4 penalty on the
  attack roll, but deal +2 dice of damage"* — two more of the weapon's own die,
  so 2d6 becomes 4d6.

This is the problem dnd5e solved with per-item activities. It is kept lighter
here because d20 Modern decides the modes from the weapon's rate of fire rather
than needing them authored per item.

### What is deliberately not automated

Attacks of opportunity, cover, concealment and flanking. No core system
automates these — in the Foundry ecosystem that is module territory
(Midi-QOL, PF2e Flank Helper) and GM adjudication. The situational modifier on
an attack covers them.

## Accessories and reloading

Item-modifies-item has no settled convention: PF2e has [attaching items to
items](https://github.com/foundryvtt/pf2e/issues/21370) as an open request,
dnd5e leaves it to modules, and Starfinder 2e calls them installed upgrades.
So accessories use the same shape as containers — an `attachedTo` id — which is
one mechanism rather than two.

Only two of the SRD's fourteen accessories carry numbers, and both are applied:

- **Laser sight**: *"+1 equipment bonus on all attack rolls made against
  targets no farther than 30 feet away."* Checkable because attacks already
  measure distance; with no measurable distance it is not applied. The daylight
  caveat stays a note.
- **Scope**: *"increases the range increment for a ranged weapon by one-half"*,
  which lengthens both the penalty steps and the weapon's reach.

The other twelve attach and modify nothing. A suppressor changes Listen DCs, an
illuminator frees a hand, a holster conceals — none of which this system
models, and inventing numbers for them would be worse than the text.

**Reloading** refills the magazine and reports what it costs: *"Reloading a
firearm with an already filled box magazine or speed loader is a move action.
Refilling a box magazine or a speed loader, or reloading a revolver without a
speed loader or any weapon with an internal magazine, is a full-round action."*
The Quick Reload feat improves each by one step, and a fitted speed loader is
what moves a revolver into the quicker case — which is the one accessory whose
rules the system can act on directly.

The cost is reported rather than spent: there is no action economy to deduct
from, so it is something the table needs told, not enforced.

Reloading draws on carried ammunition of the same calibre. Most weapons state
theirs in their own name — *"Beretta 92F (9mm autoloader)"* — so 35 of the 42
weapons with a magazine derive it, and the rest are corrected in
`data/overrides/weapons.json`: abbreviations the ammunition table does not use
(`.38S`, `12-ga`), one SRD misspelling (`12-gague`), and seven weapons the SRD
names no ammunition for at all, which reload without consuming anything.

Partial reloads are allowed — a box with eight rounds left fills eight of a
fifteen-round magazine — because refusing would be stricter than the SRD, which
simply assumes you have rounds.

**Exotic ammunition** is a variant of a calibre rather than a product of its
own, because the SRD prices the twelve types as a purchase DC modifier on an
ordinary purchase. So an ammunition item carries a `special` type, and a weapon
remembers which box is loaded, so what is in the magazine decides what applies
when it is fired. Where several types are carried for one calibre the weapon
row offers a choice, ordinary rounds first, so loading an exotic type is
deliberate.

Two of the twelve have effects this system can express, and both are
conditional on something the resolver already knows: armour-piercing gives
*"a +2 bonus"* only *"when fired at an opponent wearing any type of armor"*,
and tracer gives *"+1 ... when fired on autofire only"*. Beanbag's nonlethal
damage and silver's damage reduction bypass are recorded but not applied, since
neither a nonlethal track nor a creature vulnerability exists yet.

## Containers and ammunition

Bags and cases are their own item type rather than general gear, since a
container holds things and has a capacity. The Gear tab lists each container
with what is packed in it and how full it is. Contents still count towards
encumbrance — the SRD has no container that reduces weight — so this is about
knowing where things are, not carrying more.

Ammunition had never been imported. The SRD lists it as a name and a purchase
DC only, so its rows are two cells wide and were being dropped by a
three-cell minimum meant to skip malformed rows. All eighteen types are now in
the gear pack with their box quantity read from the name.

## Nonlethal damage

Tracked as its own pool beside hit points. A sap *"deals nonlethal damage
instead of lethal damage"*, an unarmed strike deals it by default, beanbag
rounds make an otherwise lethal weapon nonlethal, and constructs and their kind
are *"not subject to ... nonlethal damage"* and ignore it entirely. An
activity can override the item, so one weapon can do both.

Damage rolls carry which kind they are, so the apply buttons put it in the
right pool without being told twice. Healing clears nonlethal damage first,
being the lighter wound.

**What the SRD does not say** is how nonlethal damage accumulates or what
happens when it reaches your hit points — it defines no *staggered* condition
and states no threshold. So reaching that point reports and leaves the call to
the GM, rather than applying a condition the rules never describe.

## Conditions

The SRD's 24 conditions are registered as Foundry status effects, so they
appear in the token HUD and apply real ActiveEffect changes. Names and rules
text are generated from the scrape into `lang/en.json`; the changes each one
applies are hand-authored in `module/conditions.mjs`, because mapping prose to
an effect is a judgement call. Every entry cites the phrase it encodes.

Twelve of the 24 have mechanical effects the data model can express — blinded
sets an effective Dexterity of 3 and a -4 on Strength- and Dexterity-based
skills, shaken applies -2 to attacks, saves and every skill, exhausted halves
speed. The rest carry their text and nothing else: "can take no actions", a 50%
miss chance, and a Defense penalty that applies only against melee are left to
the GM rather than approximated, since a wrong number on a sheet is worse than
a rule someone is reading anyway.

Two schema fields exist for them: `defense.loseDex`, for the conditions that
say a character loses their Dexterity bonus to Defense, and
`attributes.attackMisc`, which attack rolls add.

Note that v14 replaced the numeric `CONST.ACTIVE_EFFECT_MODES` with string
change types — `custom`, `multiply`, `add`, `subtract`, `downgrade`, `upgrade`,
`override` — and `check_globals.py` now flags the old constant along with other
deprecated APIs.

## Creatures

The 300 stat blocks in the SRD's Creatures, Animals, Menace Manual and Urban
Arcana pages import as actors. The SRD prints them two ways and both are read: as a table with a
label column and one column per creature, and as a run of paragraphs under the
creature's name — `<p class="monster"><b>CR:</b> 1/4</p>` — which is how every
animal is printed, and eighty-odd of the Menace Manual's creatures. The
paragraph blocks are folded back into the table's own shape, so one column
parser reads both. Reading only the tables had left 54 creatures out
altogether: the ape, the bear, the horse, the tiger, the wolf, the alien
probe, the zap, the neothelid. Everything the SRD prints as a total — attack bonuses, Defense, saves,
initiative, skill totals — is stored as the offset that reproduces it, because
the data model derives the same number from ability scores and Hit Dice. A
creature that rolls Hide at the wrong bonus looks perfectly normal on a sheet,
so `check_creatures.mjs` adds the 1,577 skill totals and 507 attacks back up and
asserts each one comes to the printed figure.

That is only true while *everything* the sheet adds back is taken off when the
offset is stored, and for Defense one column was not: the size modifier. The
scraper subtracted 10, the natural armor and the Dexterity modifier, and the
sheet then added the size modifier on top of an offset that already contained
it — so **183 of the 300 creatures showed a Defense the book does not print**,
by as much as eight points on a Colossal dragon. Neither half of the sum was
wrong on its own, which is why nothing caught it: the scrape reproduced the
page, the model implemented the rule, and no check compared what the sheet
would show with what the SRD prints. One now does, in `check_packs.py`, and
the size column lives once in `srd.SIZE_MODIFIER` with `check_config.py`
holding `config.mjs` to it — it had been written out twice, which is how the
two copies came to disagree.

**Urban Arcana's creatures were missing for one hop.** The crawl that finds
the SRD's pages reaches the book's creature index and its A-Z list, and stops
one link short of `urbanmonst1.html` to `urbanmonst4.html`, which is where the
stat blocks actually are. Every one of its sixty-five creatures was absent from
the compendium for that, with every check green: nothing measures a page the
pipeline has never been shown. They are named in `DEEP_PAGES` now, the way the
psionic powers already were, and the parser needed no changes at all — the
blocks are the same label/value tables it already reads, and 102 of them
imported, the creatures and the advanced versions the book prints beside them.

Two of those needed correcting by hand, in `data/overrides/creatures.json`
where a correction has to state its reason. The mirror's own markup drops the
H from "alfling Fast Hero 1/Charismatic Hero 1", and Urban Arcana prints no
size-and-type line for the lizard at all — the row every other stat block heads
with one is blank, and the book's index gives nothing either, so animal is
recorded as what the entry itself describes.

**Every actor drops onto the canvas as the size the book gives it.** A
prototype token is derived, not authored — there is no judgement in it, only
arithmetic — and every actor in the compendium had none, so a Gargantuan wyrm
arrived as a one-square token with no vision. The size comes from the SRD's own
Space column: a square is five feet, so Large is two squares, Huge three,
Gargantuan four and Colossal six, with half a square as the floor for Tiny and
smaller, which occupy less than that between them. 124 creatures are bigger
than one square and 31 smaller. Darkvision becomes the token's own vision at
the range printed — 152 creatures have it — and blindsight, blindsense and
tremorsense become detection modes, 36 of them. Low-light vision and scent stay
what they were: an ability item with the SRD's text on it, because Foundry has
no mode for either. Hit points go on the bar, and a creature is hostile where a
vehicle or an object is neutral.

Deriving that turned up a line being read twice. **FS/Reach is one line and two
numbers** — "15 ft. by 15 ft./10 ft." is a space of fifteen feet and a reach of
ten — and the import took the first number out of the whole line, so every
creature's reach was its space: the wyrm threatened twenty feet because that is
what it occupies, and every Tiny creature reached two and a half feet where the
SRD prints none at all. 259 values across the bestiary were wrong, and `space`
had to stop being an integer to hold the two and a half feet a Tiny creature
fills.

The token is sized from the size category rather than that printed space,
because seven creatures print prose in the space column rather than a
footprint: the udoroot is Huge and fills "5 ft. by 5 ft. per stalk", the
anaconda "5 ft. by 5 ft. (coiled)".

**Special abilities.** A stat block prints its abilities twice: once as the SQ
line — *"Cold subtype, constrict, darkvision 60 ft., improved grab"* — and once
as prose under SPECIES TRAITS that says what each one does. The import kept the
line as a single string, which nothing could read, and dropped the prose
entirely. Both are now parsed, and become 1,972 items, 1,743 of them carrying
rules text.

Each printed quality takes its rules from the creature's own traits where they
are given, since those say what *this* creature does with the ability, and from
the SRD's own Special Abilities glossary otherwise — 23 shared definitions for
darkvision, improved grab, swallow whole and the rest. The two are joined on a
normalised name, so `darkvision 60 ft.`, `Darkvision (Ex)` and the glossary's
`Darkvision` are recognised as one ability, and the printed range stays in the
item's name. An ability neither source describes says so rather than being
given an invented benefit — the same rule the imported feats follow.

Which prose belongs to which stat block is decided by adjacency: species traits
follow their block, and a template's traits are printed above the blocks they
apply to. Where a block has neither — the SRD prints the seven monstrous
spiders, and the animated objects, as several blocks sharing one set of traits —
the nearest section across intervening blocks is used, but only if its prose
names the creature. That check is what stops a chemical golem inheriting the
acid rainer's traits, which is what position alone gives you.

**Senses** are now a field of their own rather than a copy of the whole SQ line,
which is what put "Cold subtype, constrict, darkvision 60 ft., improved grab"
in every yeti's senses. Names come from the ability items, so the SRD's two
mangled headings — one letter-spaced as `l o w - l i g h t vision`, one run
together as `lowlight vision` — both read as Low-Light Vision.

One stat block is repaired on the way in. The troll's SQ row has one cell where
its block has two, so creatures3.html prints the special qualities under AL and
repeats the face-and-reach line under SQ: both trolls lost regeneration, scent
and darkvision 90 ft., and took "Rend 2d6+9" as an allegiance. It is recognised
by what the values are rather than by the creature's name — a special quality
is not a face-and-reach measurement, and no allegiance in the 144 blocks
contains a number.

**What a creature ignores** is arithmetic now rather than text. Damage
reduction was already subtracted, but only its number: `damage reduction
15/silver` was stored as 15 and the bypass thrown away, so the silvered rounds
the SRD sells for werewolves were stopped by the werewolf. The bypass is stored
with it and checked against what the damage counts as — silvered ammunition,
or a damage type for the machine with `10/ballistic`. `15/+1` wants a magic
weapon, which this system does not model, so it is never bypassed and the chat
card says the reduction applied: a wrong number is worse than an unautomated
one. Damage reduction is also no longer subtracted from energy damage, which
is what the SRD says — *"the creature takes normal damage from energy attacks
(even nonmagical ones), spells, spell-like abilities, and supernatural
abilities"*.

Alongside it, 42 creatures now carry typed resistances, immunities and
vulnerabilities — 74 entries — which `Actor#applyDamage` applies in the SRD's
order: immunity removes the damage, a vulnerability adds half again, energy
resistance is subtracted, then damage reduction. Every step says what it did
on the chat card, because damage that arrives smaller than the roll with no
explanation is the thing people distrust about automation. Only a phrase
naming a damage type the system knows is stored: `immune to fire` is a rule,
`immune to nannite infection` stays in the ability's text. The subtypes are
where the prose earns its keep — the SQ line says only "Cold subtype", and the
trait under it says the creature is immune to cold and takes 50% more from
fire.

The creature sheet has an **Abilities tab** to show all this, which is also
where its feats finally appear: the feat list lives on the hero sheet's
Character tab, and a creature sheet does not have one, so the 341 feats
imported with the creatures had nowhere to be seen.

**64 of them can be rolled.** Where the SRD states a DC and names a save, the
ability carries a save activity and posts the same card an explosive does: the
targets roll, and the card says whether each one beat it. The DC is the number
the stat block prints. Where it prints none, the SRD's own formula in the
ability's text — *"DC 10 + 1/2 the dread tree's Hit Dice + its Charisma
modifier"* — is worked out from that creature's Hit Dice and ability scores,
which covers five more. Printed always wins: eleven of the advanced and
class-levelled blocks print a DC their own formula no longer produces, and the
stat block is what the SRD tells you to use.

Damage is attached only when the SRD states it in the same sentence as the
save. A paragraph that mentions both a save and a die roll is not saying the
save is against that roll — the charred one deals 2d10 to anything touching it
*and* allows a Fortitude save for the weapon that touched it. That rule costs
16 of the 30 abilities whose text mentions damage somewhere, and is the reason
the other 14 are right.

**Advancing one** is the other half of the creature type work. A stat block's
Advancement entry says which Hit Dice and sizes a creature reaches — *"9–16 HD
(Huge); 17–24 HD (Gargantuan)"* — and the sheet now has both halves of what
that means. Apply type turns Hit Dice into base attack and saves; Advance a
size steps the creature up one category and applies the SRD's own adjustments
to its physical abilities and natural armor, one step at a time because the
table is one step at a time: *"repeat the adjustment if the creature moves up
more than one size category"*. Defense, attack rolls and grapple all derive
from the size, so changing it is enough for those.

The skill points and feats the extra Hit Dice are worth are reported rather
than applied, in the SRD's own words — *"+2 per extra HD"*, *"8 + Int modifier
per extra HD"*. Two of the fifteen types depend on the creature's Intelligence
and five gain nothing at all, so a number invented for the rest would be wrong
more often than it was right.

What is *not* automated: everything else is text on an item. Nothing tracks a
grapple started by improved grab, or a regeneration that has to be checked
each round. The SRD writes those as instructions to a GM, and the useful thing
was to put them where the creature is rather than to guess at a mechanism for
420 different abilities.

## The rules reference

The SRD is published as a website — [spellbooksoftware.com/d20mrsd][mirror] —
and that is where both halves of this system come from: the numbers, which the
pipeline parses out of its tables, and the prose those tables are printed
inside. It builds into a `rules` journal compendium of 53 entries and 1,685
pages, one entry per section of the SRD and one page per page of it, in a
folder per book, so the rules are searchable in the world, readable by players
without the GM setting permissions, and linkable with `@UUID` from anything
that needs to cite them.

[mirror]: https://spellbooksoftware.com/d20mrsd/srdhome.html

```bash
python3 tools/import_rules.py             # from .cache/, fetching what is missing
python3 tools/import_rules.py --refresh   # re-fetch every page first
python3 tools/build_packs.py
```

**The structure is the SRD's own.** Every page carries the whole site as a
navigation menu, and the menu draws its levels with column spans: a cell
spanning four columns is a book, three a section, two a page inside it, one a
page inside that. A page's menu expands that page's branch and no other, so
reading all of them assembles the tree, names included — and the names have to
come from there, because the headings inside the pages do not carry them.
Every page under d20 Future is headed "d20 FUTURE".

**Each entry opens with the Open Game Content notice**, the sentence Wizards
heads every SRD document with, linked to the Legal Information entry that
carries the licence itself. The mirror states it once, on that one page,
because a website is one document — a compendium is fifty, and any one of them
can be exported on its own.

Headings inside a table cell become emphasis. A heading in a cell is never a
section: sometimes it is a column header, and here it is more often a letter
dividing an alphabetical index — `<h3>I</h3>` above the invisible stalker —
laid out in columns. Ninety-one of them would otherwise have been read as
sections of the book.

Three things the mirror ships that a compendium should not. Its maintainer
signs off at the foot of a hundred and forty-eight pages with his e-mail
address, which is his page furniture and not the SRD's text. Its headings are
underlined by a table with a background image, and its pages end with an empty
one for spacing; neither means anything without the site's stylesheet. And a
one-pixel `dash.gif` stands in for a dash in table cells, which in a Foundry
journal is a broken-image icon 185 times over.

**One entry, one page.** The SRD is a website, so it sells its catalogues
twenty to a page: ninety-five feats on one page, fifty-nine spells on another,
four pages of Menace Manual creatures. Those are pages nobody scrolls and
nothing can link into. Eighty-one of them are split at the heading each entry is
named at, which turns 238 pages into 1,685 — a page per creature, spell,
psionic power, incantation, seed, feat, skill, occupation, Shadowkind species,
organization, mutation, magic item, and every equipment category and item the
four books sell — including the parts d20 Future builds its starships, mecha
and robots out of, which it prices individually and which nothing could link
to while they sat twenty to a page.

`SPLIT_AT` at the top of the importer names every page it applies to and the
heading level to split it at, because this is a judgement rather than a rule:
a catalogue of named things is split, a chapter of prose is not. The combat
chapters, creature types and space travel are left whole.

The equipment needed two levels, and which ones depends on the book. d20
Modern and Urban Arcana name the *category* — "Handguns", "Civilian Cars" —
and print the goods in a table under it, so a page is a category. d20 Future
names every item it sells, so a page is an item: the Autodyn Hoverbike has one
to itself. Where a page carries both, both levels are split at, or every
category heading is swallowed by the item printed above it — which is what was
quietly happening to the mecha systems, the artifacts and the mutations.

Splitting on the visible headings alone was not enough, and the two books that
break it break it differently. A third of the Menace Manual's creatures are
headed by nothing but an anchor and print their name in the stat block instead
— the grimlock is `<h4><a name="creat6"></a></h4>`, and it ended up filed
inside the ghoul. Urban Arcana heads the elf, the gear golem and the urban
wendigo with `<h4><a name=""></a></h4>`, an anchor with no name at all. So an
unnamed heading is resolved first against the book's own A–Z index and then
against the stat block underneath it.

The index also says which unnamed headings are entries and which are
continuations, because the Menace Manual sets a creature's name in capitals
and a variant's in mixed case: ANIMATED OBJECT, then "Tiny to Medium", "Large
to Huge". Variants stay on their creature's page, which is where a link to
them lands. Where the SRD prints the same name twice in one entry — darkvision
is both a spell and a psionic power, and both are in FX Basics — each page is
named for the section it sits under, and failing that for the part of the book
it comes from: d20 Future sells a Compact weapon gadget and a Compact
equipment gadget on one page.

A split page's preamble is dropped when it is only the banner and the
quick-find links the site puts above every chapter, which a compendium's own
contents list replaces. Measured on what is left after the headings and links
come out, rather than on length, because Urban Arcana opens its wondrous items
by saying what one is and that paragraph is shorter than the banners.

### What the website does not have

Four of d20 Modern's chapters are not on the mirror at all. Not broken links
or truncated pages — the text is not there: nothing on the site says what an
action point does, what happens at negative hit points, how Reputation is
checked, or how a skill check works. Every one of them is in the RTF releases,
so `tools/import_missing.py` takes those four documents from there and
`data/rules-extra.json` holds them, folded into `data/rules.json` on every
import rather than written in once and lost at the next one.

They were found by taking every sentence of all 63 RTF documents and looking
for it in the imported text. Four scored zero. Nothing else scored below a
third, which is a wording difference rather than an absence — these documents
and the website are different editings of the same text.

The site's own broken links are a separate thing and mostly harmless: eleven
URLs it links to are 404, and all but the two appendices are old names for
pages it still has — `spellsaz.html` is `fxspellsaz.html`, `gear.html` is
`general.html`. Two hundred and seventy-three links point at anchors that were
never written, which is why a reference into a page that has since been split
becomes plain text rather than a link to the wrong entry.

Two of the Menace Manual's creatures, the rod and the rogue tulpa, are in its
index and its page titles and nowhere in its text. Those are not in the RTFs
either — the Menace Manual SRD never included them.

**The cross-references are made to work.** The SRD points at itself constantly
— "see Weapons", "as described under Attacks of Opportunity" — and on the web
those are links to file names, which mean nothing inside Foundry. The build
knows which page each file became, so all 1,323 of them are rewritten as
`@UUID` links into the compendium. A link within a page becomes its own text,
since a journal sheet has nowhere to jump to, and the two appendices the menu
offers that the server does not actually have go the same way rather than
becoming dead links.

### Everything points at it

A page per entry is only worth the split if something points at the pages.
Every document in every pack now carries one — `system.rulesPage`, the page of
the rules compendium its own rules are printed on — and so do the parts of the
system that are not documents at all.

```bash
python3 tools/link_rules.py         # stamp the documents, and the pages they point at
python3 tools/gen_rules_links.py    # regenerate module/rules-links.mjs
python3 tools/check_rules_links.py  # every link resolves to a page that exists
```

All 1,590 documents are linked, between them reaching 854 of the 1,685 pages,
plus 3,251 embedded ones — a creature's own attacks, abilities and feats. How
each was found is worth stating, because it is the measure of how precise a
link is: 717 by their own name, 140 as a variant of another entry, 602 by the
category the SRD sold them under, 52 by the class whose talent tree they are
in, and 24 that reached only the chapter they were printed in.

**The match is made in widening scopes** — the pages of the SRD page the
document was scraped from, then the pages of that chapter, then the whole SRD.
A magic item cites `fxitems.html` and its page is under `urbanfxweapon.html`,
the same chapter in a different file, so the middle scope is what finds it.
Embedded documents stop at the second: a creature's attack is named in the
creature's own words — "Claw (x2)", "Slam" — and reaching across the whole SRD
for one of those put an ape's claws on a PL 5 robot accessory.

**The equipment is linked while the table is still being read**, because a
heading like "Handguns" is a page of the rules and is known only there. By the
time a handgun is an item in a pack, all it carries is the proficiency it
needs, which is not what the SRD filed it under. So the importer stamps those
as it builds them, and `link_rules.py` takes the importer's answer for every
document it recognises rather than working it out again from the file.

That script exists because `src/packs` is the source of truth: the import adds
documents the packs do not have and leaves the rest alone, so a *new field*
cannot arrive that way — it would report every document as differing and write
none of them. `link_rules.py` writes that one field and nothing else, and is
safe to re-run, since the page is derived rather than chosen and the ids in a
UUID are hashes of the pack and the slug.

**A creature the book prints as a variant lands on the entry it varies.** The
compendium holds "Advanced Chemical Golem", "Huge Crocodile Zombie", "Etoile
Techie 5" and "Anaconda, Giant (Gargantuan)", none of which the SRD gives a
page — the advanced version is on the acid rainer's page and the statted-up one
on the creature's. Those are matched by taking the name apart in the shapes the
book actually uses: the size off the front, the class and level off the back,
the parenthesis off the end. It is safe to be that aggressive because a variant
is only ever looked for among the pages of the one SRD page the stat block was
printed on.

**Each page says what it is the rules for.** The link goes both ways: a footer
on the gargoyle's page offers the gargoyle, the Handguns page offers its
twenty-three handguns, and the feats chapter offers each feat as the item to
drag onto a sheet — 854 pages, listing 1,590 documents between them. Reading a
rule and reaching for the thing it describes is most of what a rules reference
is for. The footer is a generated block confined to the end of the page, so the
SRD's own text is never edited, and it is replaced whole on every run;
`check_rules_links.py` holds it to the packs, since a document renamed on its
own sheet would otherwise leave a page offering something that is not there.

**The rules roll themselves.** The SRD says what to roll constantly, and on a
page that is a sentence. 3,103 of those sentences are rewritten at import into
`@Check[skill:climb|dc:15]{DC 15 Climb check}`, which `module/enrichers.mjs`
renders as the SRD's own words with a die in front of them: clicking rolls for
the character assigned to the user, or the token they have selected, and where
the SRD printed a DC the card says whether the roll beat it — *"If the result
equals or exceeds the DC, the character succeeds."* 1,961 are skill checks, 977
saves and 165 ability checks; 552 carry a DC.

Two thirds of those are on the rules pages — 2,054 across 693 of them — and the
rest are in the text the compendium's own documents carry: 1,049 rolls in 724
descriptions, benefits and creature abilities, which is where the rules are
actually read at the table. "The victim must succeed on a Fortitude save or
take the initial damage" is printed on the spider, not in a chapter about
poison; "a +2 bonus on all Escape Artist checks" is printed on the feat. The
same rewrite over the same phrases, so a save and the page that defines it say
it the same way.

Which is why everything that displays this system's prose enriches it:
`enrichProse` in `module/enrichers.mjs` takes the four fields the SRD prints
rules text in — description, benefit, normal, special — and the item sheet, the
attack, cast and save cards and the plain item card all go through it. Text put
on screen unenriched would show the markup itself, so this is one call rather
than one per field: forgetting a field is invisible, because the text still
renders and only the roll is missing.

The phrases come from the scraped skill list rather than a list written here,
so a skill the SRD names and this system has cannot go quietly unlinked, and a
specialty is matched before its skill — "Knowledge (arcane lore) check" before
"Knowledge check" — because the longer phrase is the more specific roll. Only
prose is rewritten: a tag's attributes are markup, and so is the label of a
link, whether it is an `@UUID` — a page named "Skill Checks" is linked from
thirty places — or an anchor out to the web, since a roll inside a link is a
link inside a link.

Not rewritten: the Wealth check, which the SRD names 64 times. It is a roll
this system has, but the only thing that makes one is a purchase, and a
purchase spends Wealth — which is not what a reader clicking a phrase in a
rulebook is asking for.

Registered as an enricher rather than baked into the pages, so it applies to
every piece of enriched content in the world: a GM who types
`@Check[save:ref|dc:20]` into their own notes gets the same button, and a
check that names a skill this system does not have renders as its own words
again rather than as a button that cannot roll.

**What the sheets link** is in `module/rules-links.mjs`, generated: 19 topics
and a page for each of the 41 skills, including the seven Craft subjects the
SRD describes one at a time. The skills table links a row to its own skill, the
panel headings link to the chapter behind them — Ability Scores, Combat,
Actions in Combat — and the header boxes link to the chapters they *are*:
Wealth, Action Points, Reputation, massive damage. A record card links to the
rule it is an application of, so "the character is dying" arrives next to what
dying means. Which page a topic means is a judgement and is written down in the
generator; the UUIDs are derived, and a page title that stops existing fails
the generator rather than producing a link into nothing.

The links are rendered by the system rather than by Foundry's `@UUID`
enricher, which is asynchronous — a skills table would need forty-one of them
per render. What that costs is one delegated click handler, installed at ready
in `module/rules.mjs`, which also means a link on a chat card still works long
after the sheet that posted it has closed.

### Why not the RTF releases

They were used first, and the whole of that import was a fight with them.
Wizards released the SRD as 63 Word files, and the styling is inconsistent
inside a single document, let alone across four books: the same kind of
heading is an `h1` in one, an `h5` in the next and a bold paragraph in the one
after. Where a page ended had to be guessed at by trying each heading level
and keeping whichever produced the most pages with the fewest duplicate names,
and the Menace Manual still needed capitalised paragraphs promoted to headings
to stop the alien probe living inside the acid rainer's page.

Every one of those guesses is gone. The mirror is the same text, already
divided into pages, each with a name and a place in a tree. It also carries
what the RTF import never reached — Shadowkind, incantations, prestige
classes, starships, mecha, robots, cybernetics, mutations, organizations —
because those were never a parsing problem, they were pages nothing had read.

## Feats that apply themselves

Twenty-two of the 189 feats and talents carry an Active Effect built from their
own benefit text, so the +2 arrives on the sheet rather than in the player's
memory: Acrobatic adds two to Jump and Tumble, Great Fortitude two to Fortitude
saves, Improved Initiative four to initiative.

**The other 167 state nothing a sheet can apply**, and the rule for telling
which is which is written in the parser rather than in a list of feat names. An
effect is written only where a sentence states a number, a target this system
has a field for, and no condition on either:

- A sentence that opens with a circumstance is about that circumstance.
  "When making an unarmed attack, the character receives a +1 competence bonus
  on attack rolls" is not a bonus on attack rolls, and Brawl gets nothing.
- A target the sentence narrows keeps its condition: "Bluff checks made to
  feint in melee combat", "hourly Swim checks to avoid becoming fatigued",
  "Defense against melee attacks". The bonus is real and the sheet cannot know
  when it applies, so Improved Feint, Endurance and Defensive Martial Arts stay
  as they were.
- Skills taken per subject are left out, open subject lists as much as closed
  ones. Knowledge, Craft, Perform, Profession and the two languages are a row
  per subject on the sheet, and a bonus on the skill itself reaches none of
  those rows — which is why Windfall's "+1 bonus on all Profession checks" is
  still a sentence, and why Medical Expert applies its Treat Injury half and
  not its Craft (pharmaceutical) half.

Every change is additive, typed `add` rather than the numeric mode Foundry
removes at v16, and transfers to the character while the item is on the sheet.
And every one of them is **shown**: the item sheet says "Applies: Jump +2,
Tumble +2", because an effect nobody can see is worse than one nobody has.

An item's effects are embedded documents in a compiled pack, keyed
`!items.effects!<item id>.<effect id>` the way an actor's items are, which
`check_packs.py` now holds them to. They also had to be taught to
`capture_edits.py`: Foundry fills an effect out with a duration, a tint, a
description and a dozen other defaults the build does not set, so an effect
compared as one value differs on every round trip, and all 22 feats would come
home reporting an edit nobody made. Compared document by document, an effect a
GM switches off comes home switched off — which `check_capture.py` now drags
through the round trip to prove.

## Migrating a world that is already playing

`DataModel.migrateData` handles a field that moved or changed shape: it runs on
every document as it loads, in the world and in the compendia, and needs no
pass of its own. What it cannot do is fill in something that was never there. A
creature imported into a world last month has the token Foundry gave it — one
square, no vision — because the compendium it came from had no token to copy,
and nothing about loading that actor will ever change it.

So `migrate.mjs` is for derived data that arrived after the world did, and it
changes only what is still the default it was given: a Gargantuan wyrm on a 1x1
token is a default nobody chose, and a Medium creature on a 2x2 token is
somebody's decision. It gives an actor the token its size implies, gives it the
space the SRD prints where the old flat five is still stored, and does the same
for the tokens already standing on a map — fixing the actor does not move
those. Then it stamps the system version into a hidden world setting, and only
then: a migration that fails says so and records nothing, because a world that
believes it has been migrated will never try again.

**0.2.0 added two passes**, which is what the version number is for: an actor
imported before the compendium had any token artwork carries Foundry's own
`CONST.DEFAULT_TOKEN`, and a creature imported before the Defense offset was
right carries a number that shows a Defense the book does not print. Both are
derived data that arrived after the world did, and both change only what is
still the default or still exactly the stale arithmetic.

The corrected Defense is not computed in the migration. It is read from the
compendium the creature came from, matched by name, and applied only where the
actor's own figure is exactly the compendium's plus the size modifier — so the
migration cannot invent a number, and a creature that is already right or that
somebody has adjusted is left alone. The one case it cannot tell apart is a GM
who adjusted a Large creature by exactly minus one, which is the stale value
written by hand; a point of Defense on a deliberate tweak is the cheaper of the
two mistakes, and the code says so.

**0.3.0 adds none.** Everything in it is new content — six characters, a guide,
an example scene, a cover — new tooling, or a fix to a data model that a stored
document never carried. Bumping the version still re-runs the 0.2.0 passes,
which is safe: each one changes only what is still the default it was given, or
still exactly the stale arithmetic, so a second run finds nothing to do.

## Items on the hotbar

Dragging an item to the hotbar makes a macro that uses it, which every mature
system does and Foundry itself does not: its own answer to a dropped item is to
do nothing.

The macro looks the item up **by name on whoever is selected** rather than
holding the id of the one that was dragged, which is what makes one bar work
for a table — the same "Colt Python" button fires for whichever character is
carrying a Colt Python, including one dragged out of the compendium browser
onto a sheet ten minutes later. It also survives the item being sold and
rebought, which on a Wealth economy happens constantly. One macro per item
however many times it is dragged, since a second copy of the same script is a
hotbar full of duplicates.

## Random tables

The SRD says "roll d% and consult the table" two dozen times, and a table
printed in a journal page is a table somebody reads and then rolls by hand. 26
of them are RollTables now: mutations and their drawbacks, cybernetic side
effects and the failed Fortitude save, where a thrown grenade lands, mecha and
starship critical hits, meteoroid encounters, what a celestial or a fiend is
immune to, what a trench coat of useful items produces, how a confused
character behaves. Each carries an `@UUID` link to the page of the rules it was
printed on, which `check_rules_links.py` resolves along with all the others.

They are read out of the rules pages rather than out of the scraped table dump,
because the caption that names a table sits on the page beside it and the dump
keeps only the grid. Three things the reading has to get right, and each is a
rule rather than a special case:

- **A table printed in two columns is one table.** "Sources of Weakness" is d%
  1-50 beside d% 51-100 under one heading, and the fiend and celestial tables
  are three different tables side by side — immunity, resistance and damage
  reduction, rolled at once. What tells them apart is the heading over the
  outcome: the same heading twice is one table, 74 results long.
- **A percentile die reads its zero as a hundred.** The last row of a d% table
  is printed "97-00", and read as 97 to 0 it is a range no roll can land in.
- **The header can be wrong and the rows cannot.** The third scatter table has
  twelve rows under a heading that says d8, and the sentence above it says
  *"For ranges of up to five range increments (31 to 50 feet), roll 1d12."*
  Where the rows outrun the heading, the die is the smallest real one that
  covers them.

`check_packs.py` holds every table to its own formula: a result outside the die
is a row nobody can roll, a result that overlaps another is one nobody can get
to, and both were in the first build — the d8-with-twelve-rows and two tables
whose last row said "00".

Two names are corrected, cited where they are corrected: the SRD prints "Table:
Celectial Immunities" and heads a column "Bhavior". A compendium lists its
tables by name, and a typo there is a search nobody can make.

## The compendium browser

Foundry's own compendium browser is one pack at a time with a name search,
which is enough for a bestiary and not for an equipment list. What a d20 Modern
table asks is "what can this character afford", "what is legal to carry" and
"what exists at this progress level" — three questions about fields every
purchasable document already stores and nothing could sort on: 741 documents
carry a purchase DC and a restriction rating, 656 a progress level, and all
1,590 name their book.

So one window over all thirteen packs, filtered by name, compendium, book,
restriction rating, progress level, and the number that matters most —
*"If the character's Wealth bonus is equal to or greater than the purchase DC,
the character can purchase the object automatically."* Type a Wealth bonus and
what is left is what that character can simply buy. Rows drag onto a sheet or
the canvas, and clicking one opens it.

It searches the **index**, never the documents. A pack's index is a few fields
per entry and is already in memory; `getDocuments` on thirteen packs is 1,590
documents built to read a purchase DC off each. The filter lists are built from
what the index actually holds rather than from a list written here, so a world
that adds a pack of its own shows up in them. Three hundred rows are drawn at
most, with the count of what matched, because a table nobody scrolls is cost
without value.

It opens from a button added to core's own compendium sidebar — inside a `try`,
because a change to core's markup should cost a button rather than the sidebar
— and from `game.modern20.browser()`, which is what a macro or a module would
reach for.

## Artwork

Every document in every pack used to point at one of eleven icons Foundry
ships. Nothing was broken and everything was unreadable: 180 firearms, 40 suits
of body armour and 289 pieces of gear were all a picture of a bag, 85 vehicles
were a cave, and 300 creatures and 3,248 creature abilities were the same two
grey glyphs. For a browser you scroll, telling one row from the next is most of
the job.

There are now **163 icons across 4,864 documents**, from
[game-icons.net](https://game-icons.net) under CC BY 3.0, vendored into
`assets/icons` and credited per author in
[assets/icons/CREDITS.md](assets/icons/CREDITS.md) — which
`tools/fetch_art.py` generates from what it actually fetched, since an
attribution written by hand is one that goes stale.

**Which icon a thing gets** is a judgement, and it is written down in
`tools/art.py` next to the reason, in the same way the rules-page choices are
written down in `gen_rules_links.py`. What is *derived* is which group a
document belongs to: a field the scrape read, or a word in the name the SRD
printed. Groups resolve in order — the name, then the field, then the pack's
default — so the specific beats the general.

| Pack | What decides | Icons |
|---|---|---|
| weapons | the printed name over `category`: a Mossberg is a shotgun before it is a longarm | 32 |
| gear | the SRD's 15 equipment categories, and the name inside them | 23 |
| creatures | `details.creatureType` — the SRD's own fifteen | 15 |
| creature abilities | what the ability does: claw, bite, breath, gaze, poison, damage reduction | 33 |
| vehicles | the parenthetical the SRD prints — "(sports coupe)", "(helicopter)", "(SUV)" | 12 |
| spells | the eight schools, matched on the leading word so "Conjuration (Healing)" is Conjuration | 9 |
| talents, classes | the class that grants it, which for a basic class is its key ability | 6, 7 |
| fx, psionics, armor, objects, occupations, feats | category, display, armor type, name | 11, 5, 7, 8, 9, 4 |

**Only a placeholder is replaced.** The eleven icons the build used to hand out
are listed in `art.py` and are the only images anything here overwrites; an
`img` that is anything else was chosen by somebody, and a choice is not a
placeholder. That is what lets the map be re-run over a pack directory that
people have been editing, which is the same rule the rest of the reconciler
follows.

**Foundry's own `icons/` are the obvious first choice and are not used**, for
one reason: they cannot be checked. There is no Foundry install these scripts
can read, so a core path is a string nobody can verify, and a wrong one renders
as an empty frame on documents nobody looks at twice. A vendored file either is
in the repository or is not, and `check_art.py` says which — it resolves all
4,864 images against the filesystem, holds the map and the directory to each
other in both directions, and fails if an author vendored here is missing from
the credits, because CC BY is a licence with a condition. The subject matter
argues the same way: core has no pistol, no police car and no kevlar vest, and
this game is mostly pistols, police cars and kevlar vests. A core path is still
allowed and still counted; set `FOUNDRY_PATH` and the check verifies those too.

Each icon is rewritten on the way in, which is not decoration: game-icons
publishes a white glyph on nothing, and a white glyph on Foundry's own light
item rows is a white square. Each gets this system's paper ground and ink
glyph, so it reads on any sheet in any theme and 163 files from the internet
look like one set. The fetch is pinned to an upstream commit, so it is
reproducible and moving to newer artwork is an edit rather than something that
happens quietly on somebody else's machine.

**Tokens are the same drawing, cut as a disc.** An actor that states no token
artwork gets Foundry's own `CONST.DEFAULT_TOKEN`, which is the grey
mystery-man — so all 399 actors dropped onto a map as the same silhouette
however well their sheets were illustrated, and a token is the one image in
this system that most people look at most of the time. The 43 icons an actor
can be pictured by are cut a second time into `assets/tokens`, as a circle
rather than a square: a tile is right in a list, and on a battlemap a token
reads as a figure standing on a patch of ground.

**What is scaled is the ink, not the box.** The first two cuts scaled each
glyph by a fraction of the 512-unit box it was drawn in — 72%, then 86% — and
both looked too small on a map, for a reason that is only visible once
measured: the ink spans **71% to 116%** of that box across this set, so one
number produced 43 different sizes, between 61% and 100% of a grid square. A
circle inscribed in a square covers 79% of it, which took another bite out of
anything fitted inside the circle.

So `fetch_art.py` measures what each path actually draws — every point it
names, control points included, which reads a little wide and so errs towards
small rather than clipped — and scales that to **94% of the square**, centred.
All 43 discs now draw their figure at the same size, and the disc is the ground
the figure stands on rather than a frame it has to fit inside: ink past the rim
is the normal case. `check_art.py` measures the ink after the transform and
fails a disc drawn at the wrong size, because that mistake looked like nothing
at all from here and took two goes to find.

The discs are re-cut from the tiles rather than fetched again
(`fetch_art.py --recut`), since the glyph survives in `assets/icons` exactly as
it arrived.

Three places need it, and this is where the other systems differ from each
other. **dnd5e** ships real illustrations in a `tokens/` directory of its own
and overrides `Actor.getDefaultArtwork` so a new actor gets art for its type.
**pf2e** ships type defaults in the system and leaves its bestiary token art to
a separate module, because a webp per creature is megabytes and a system is
downloaded by everyone. Both of those are answers to the same question, and the
answer here is closer to dnd5e's only because the art is 1–2 KB of SVG: 204 KB
for the set, which is cheap enough to ship with the system.

**How the artwork is drawn** is derived too, and stored on every token:
`art.TOKEN_TEXTURE` — twice the token, anchored a quarter down, so a figure
stands on its square rather than being contained by it. A drawing that exactly
fills its square still reads small on a map, where a token is glanced at from
whatever zoom the scene is at. It is one number for every size, which is the
simple choice and not the only one: a Colossal creature's six-square token
draws twelve squares of art. `check_packs.py` fails a token missing it, because
the reconciler takes the whole prototype token from the import and had already
stripped it from all 399 documents once, silently.

So: the compendium's 399 actors carry the artwork chosen from what each one
*is*; `Modern20Actor.getDefaultArtwork` gives an actor a GM creates the drawing
its *type* implies, which is as much as can be known about an actor that does
not exist yet; and `migrate.mjs` fills in the token of an actor imported into a
world before any of this existed — only where the token is still Foundry's
default, because artwork somebody chose is a decision. `check_packs.py` fails
an actor with no token art, and `check_art.py` resolves all 399 token paths,
holds the discs to the map in both directions, and checks the ten paths the
modules themselves name — those are exactly the kind of unverifiable string
this set exists to avoid.

Still placeholder: the cover art in `system.json` (`media`), which wants one
illustration rather than 163 icons.

## FX items

Magic and psionic items are the one body of SRD content priced in prose rather
than in a table, which is why the purchase-table pipeline never saw them: a
potion of Charisma is a paragraph, and its purchase DC is in the sentence after
it. They come out of the rules text instead — 147 of them, from potions, rings,
scrolls, staffs, tattoos, wands and wondrous items through to Urban Arcana's
artifacts and its magic vehicle accessories.

The stat line is what the parser looks for, because it is the one thing both
books print the same way: *"Type: Weapon (magic); Caster Level: 10th; Purchase
DC: 25 (+1), 30 (+2), 35 (+3); Weight: 3 lb."* Everything around it differs.
d20 Modern runs a dozen items down one page with each name bolded in front of
its description, so an item is the run of paragraphs ending at its stat line
and the first of them names it — read forwards, because what sits between the
name and the stat line is more description, and the staff of fire bolds each of
its three charges exactly as it bolds its name. Urban Arcana gives each item a
page, which since the rules were split means the page's own heading is the
name, in the SRD's own casing: the page is titled "Universal Id" because the
importer title-cased a banner, and the heading says "Universal ID".

Four things the site does that the RTF releases it was first written against
did not. It marks a paragraph after a page break `<p class="close">`, and
reading only bare `<p>` tags dropped eight items and the description of every
Urban Arcana one. It prints the three wands' stat line with a semicolon where
every other item has a colon — "Type; Wand (magic)" — which is also the field
separator, so the label lost its value. The Arcanobots action figure lists
"Arcanobot:" among the things it does, so a page that is one item is named from
its heading and its prose is not searched at all. And the Horn of Blasting is
printed with no purchase DC at all, which is kept as the absence it is.

The category comes from the Type line rather than from the page, which is what
makes it right for the eight items whose section heading the split swallowed.
The five documents this replaced were fragments of items the old parser
misnamed — "Retributive Strike" is part of the staff of sorcerous might,
"Stone of Thunder" one of the six stones in a six-demon bag, "Waning" a phase
of the crescent of the moon — and every one of those items is now in the pack
under its own name.

They build as **gear**, not as weapons and armor. A magic weapon in the SRD is
not a weapon entry: it is "a +1 to +3 machete that deals fire damage", priced
against the mundane one it enhances. Gear keeps what the SRD states — a name, a
description, a caster level, a purchase DC — instead of inventing the damage
and critical a weapon item would demand. The printed DC is the cheapest
version, and the sentence it came from is kept on the item, since the rest of
it is the rule.

## Objects

The SRD gives an object a stat block of its own — a Defense by size, a hardness
subtracted from every hit, hit points by substance or by size, and a break DC
for forcing it rather than destroying it — and there was nowhere to put one.
`object` is now an actor type, and the fourteen objects the SRD names outright
build into a compendium: locks in five qualities, three kinds of door, a
cinderblock wall, chain, handcuffs, metal bars.

The point of making them actors is that hardness then has a reader.
`Actor#applyDamage` subtracts it the way it subtracts a creature's damage
reduction, and applies the SRD's energy rule on the way in — *"electricity and
fire attacks deal half damage to most objects; divide the damage by 2 before
applying the hardness. Cold attacks deal one-quarter damage"* — with acid and
sonic dealing full. Objects are immune to nonlethal damage, which the same
method already understood for constructs and undead.

**Vehicles have had a `hardness` field since they were imported and nothing
read it.** A car with hardness 5 took full damage from every hit. It is the
same defect the creatures' damage reduction had, and the same fix: a vehicle
is an object, so it takes the object path.

Defense is derived rather than stored: the printed figure is 10 + the size
modifier − 5, since an immobile object has no Dexterity bonus to lose. That
reproduces all nine printed values exactly, which `check_objects.mjs` asserts —
so a GM can set any size and get the right number rather than only the sizes
the SRD tabulated. An object the SRD does not name gets the manufactured-object
defaults for its size, and a substance and a thickness give hit points at the
SRD's own rate: *"10/inch of thickness"* for wood.

The same check verifies the grapple modifiers `config.mjs` transcribes by hand.
They are printed on this page, and they are the one size table whose numbers
differ from every other — a Colossal creature is −8 to attack and +16 to
grapple.

## Editing in Foundry, and keeping the edit

Foundry is the editor. Content is corrected on the sheet, where the fields are
labelled and the numbers are the ones the game uses, and then brought back into
`src/packs` — the same round trip dnd5e and pf2e run, under the same names.

```bash
# unlock the pack in Foundry (right-click it, Toggle Edit Lock), fix the sheet
npm run extract:dry                 # what the live packs hold that src/packs does not
npm run extract                     # bring it home
git diff src/packs                  # read it, fill in each "why", commit
npm run deploy:packs                # recompile and install
```

`npm run extract` (`tools/capture_edits.py`) unpacks the live compendia with
the Foundry CLI and compares them with the pack source. It handles four things,
and each one is a way an afternoon in Foundry actually ends:

- **An edited document.** The changed fields are written into
  `src/packs/<pack>/<slug>.json` and recorded in
  `data/overrides/packs/<pack>.json` with a `why`, so
  `check_creatures.mjs` reports a deliberate divergence as a decision rather
  than a regression.
- **A document made in Foundry.** Written into the pack source as its own file,
  keyed for the compiler, with the bookkeeping Foundry owns — who touched it
  last, who may see it — dropped. Documents are matched by id first, so
  renaming a creature on its sheet — or dragging it into another folder — is
  an edit rather than a second creature.
- **A folder made in Foundry.** A compendium folder is a document in the pack
  like any other, and without it every creature filed into it lands in the
  compendium root. New folders come home too, and a new document left outside
  the folders is named, because `check_packs.py` fails on it.
- **A document deleted in Foundry.** Reported, never acted on. A pack that
  failed to unpack, or a host pulled before it was deployed, would otherwise
  read as every document in it having been deleted.

Packing rewrites the compendia from `src/packs`, so an uncaptured edit is gone
the moment `deploy.sh --packs` runs. Now that this is where content is edited,
that is the easiest way to lose the afternoon, so `--packs` checks the host
first and refuses; `--overwrite-live` says the live packs really are the ones
to throw away.

Two kinds of noise had to be ignored to make any of this work, and both were
found by running it. Foundry fills in every default a document does not carry —
empty effects, an entire light configuration, the token fields the build leaves
alone — so only fields the build actually sets are compared. Which cuts the
other way as the build sets more: now that a prototype token is derived and
stored, a token resized in Foundry is an edit, and `check_capture.py` drags one
home to prove it. And the editor rewrites `<br />`
as `<br>` and reflows whitespace on any page it opens, so HTML is compared
normalised. Without the second one, opening a page to read it counts as editing
it.

There are two override layers, and the distinction matters. `data/overrides/`
holds corrections to the *scraped data*, keyed by entry id — the right place
for a number the SRD prints wrongly, because the fix then reaches every
document built from that entry, including ones imported later.
`data/overrides/packs/` holds the record of which *built documents*
deliberately differ from the book, keyed by the pack file's stem, which is
where a captured edit is accounted for.

## Field labels

Every document subtype declares `LOCALIZATION_PREFIXES`, and Foundry reads each
field's label from `lang/en.json` at `<prefix>.FIELDS.<path>.label`. A field with
no entry renders as an unlabelled input — which is exactly how the item sheets
first shipped.

The blocks are generated from the real schemas rather than written by hand, so a
field added later cannot be forgotten:

```bash
node tools/gen_field_labels.mjs > /tmp/fields.json   # then merge into lang/en.json
```

Labels are humanised from the field name, with an acronym list (DC, HP, BAB, SRD)
and an override map for names that read badly on their own — `str` becomes
Strength, not Str.

## Where the content lives

**`src/packs/` is the source of truth.** It is what compiles into the
compendia, what Foundry shows, and where a correction ends up — the same
arrangement dnd5e and pf2e use, where the pack JSON is the content and Foundry
is a comfortable editor for it.

What is unusual here is how documents get there in the first place. They are
not written by hand: the SRD is scraped, parsed and imported. So the import is
additive, and never argues with the pack.

```bash
python3 tools/scrape.py             # crawl the SRD into data/
python3 tools/build_packs.py        # import what the packs do not have yet
python3 tools/build_packs.py --overwrite weapons   # take the import for one pack
python3 tools/link_rules.py         # link the documents and the rules pages to each other
tools/capture_edits.py              # bring edits made in Foundry home
```

`build_packs.py` writes documents the SRD produces and the packs do not have,
leaves every existing document alone, and *reports* where the two differ rather
than resolving it — a difference is as likely to be a hand correction as a
parser improvement, and it cannot tell which. Taking the imported version is a
decision, made with `--overwrite` and named per pack, and it is the one path
that can lose an edit.

`scrape.py` crawls the 221 SRD pages reachable from the index — a hand-maintained page list
goes stale, since section pages link to the sub-pages holding the actual tables.
Pages are cached in `.cache/` and the site is hit once. Output lands in `data/`
and is committed, so a parser change means re-running `build_packs.py`, not
re-scraping.

**Classes and occupations come from every book's own index.** Each book that
adds either publishes a list of them, and all the lists are the same shape, so
each is read the same way: 28 more classes — Urban Arcana's twelve advanced and
four prestige, d20 Future's twelve — and 14 more occupations, six and eight.
The tier comes from which index linked the page, prestige last so a page both
lists is a prestige class.

Reading them meant meeting the same rule written three ways, which is what the
expansions cost. The Hit Die is a die on d20 Modern's pages and a sentence on
everything else — "Mystics gain 1d6 hit points per level" — and four of d20
Modern's own classes are written the second way, so the Acolyte, the Occultist,
the Telepath and the Shadow Slayer had all been taking the fallback d8. The
colon sits on either side of the tag break: d20 Modern splits
`["Prerequisite", ": Age 20+."]` and d20 Future `["Prerequisite:", "Age 21+"]`,
and reading only the first shape found nothing at all on d20 Future's pages —
every one of its occupations was skipped for having no prerequisite, and the
Wealth Bonus Increase of the one above became an occupation called "+2". The
skill list is on the line after the sentence that introduces it, and which line
that is cannot be told by looking for a bracket, since "the Arcane Arranger's
class skills (and the key ability for each skill) are:" has one — so each line
after the label is parsed and the first that yields a skill is the list.

Ten of the twenty-nine expansion class pages carry no "Table: The Mystic"
caption either, so the name comes from the banner over the page —
"ADVANCED CLASSES - EXPLORER" — and only then from the file name, which reads
like what it is: "Urbanmystic".

One class is corrected by hand. The mirror prints the Street Warrior's class
skills as an empty italic tag, and the list is in the RTF release the SRD also
shipped as, so `data/overrides/classes.json` carries it with that citation.

**A comma inside a number is not a list separator.** The SQ line is split on
commas, and the three great dragons see "darkvision 1,200 ft." — which arrived
as an ability called "Darkvision 1" and a second one called "200 ft.", and as a
token that saw one foot in the dark. Splitting now skips a comma with a digit
on each side.

**Feats come from both alphabetical listings**, core first, so that where the
two books print the same feat the core entry is kept and the reprint reported —
which is Wild Talent and Vehicle Specialization, and is the rule the equipment
tables already follow. Urban Arcana tags a feat with the category it files it
under, in capitals after the name — "Empower Spell [METAMAGIC]" — and that is
the book's own taxonomy rather than part of the name, so it comes off into
`system.category`: ten metamagic, eight metapsionic, three initial.

**A parser that suddenly finds nothing has drifted, and writing that over a
dataset loses it silently.** `scrape_fx_items` was keyed on the entry ids the
RTF import used, and the rules have come from the website since; re-running the
scrape wrote an empty `data/fx_items.json` over the 134 magic items, with no
error and no check going red — they survived only because `src/packs` is the
source of truth and the import is additive. The scrape keeps what is there and
says so now, and the parser is rewritten.

`data/` is no longer the content, then: it is the SRD as parsed, which is what
new imports are built from and what the checks hold the packs against. Which
matters, because that is what keeps 507 attack bonuses and 1,577 skill totals
verified against the printed figures even though the documents are now editable
by hand.

### When a pack document disagrees with the book

Deliberately, sometimes. `data/overrides/packs/<pack>.json` records which
documents differ from the SRD import and why — written by `capture_edits.py`,
and read by `check_creatures.mjs` so a decision is not reported as a
regression. Everything not listed there is still held to the printed figures.

There is a second, older override layer: `data/overrides/<dataset>.json`
corrects the *scraped data* by entry id, before anything is built from it. That
is the right place for something the SRD gets wrong — Alertness printing its
benefit under a "Prerequisite" label — because the fix then reaches every
document made from that entry, including ones imported later.

### Equipment, and which book it came from

The equipment packs are built from the SRD's own purchase tables, and a table
is routed by its own columns rather than by the page it sits on: an armor table
has an equipment bonus, a weapon table has damage and a critical, an ammunition
table says so in its first cell, and what is left with a purchase DC is gear.
That is what makes the d20 Future pages tractable, since one of them sells
ranged weapons, melee weapons, ammunition, grenades, armor and gear in six
tables under one heading.

d20 Future and Urban Arcana items share the weapons, armor and gear packs with
d20 Modern's own, the way d20 Future's vehicles have always shared the vehicles
pack, and each pack is grouped into a folder per book so a d20 Modern game does
not have to read past the laser rifles to find a Colt. Eight packs hold more
than one book — the equipment three, the creatures, the feats, the spells, the
powers and the vehicles — and a pack holding one book is left ungrouped, since
a single folder wrapping everything is a click rather than a grouping.

**Which book a document says it came from is derived, not typed.** It used to
be typed, once, in the one place every dataset-built pack shares, and it said
"d20 Modern SRD" whatever page the document had been read off. The Menace
Manual's hundred and twenty creatures, Urban Arcana's spells and powers and
d20 Future's vehicles — 1,186 documents counting the creatures' own attacks and
abilities — all claimed to be core, and nothing noticed because the *folders*
come from the page and were right. It comes from the page now too, and
`link_rules.py` corrects a document that names the wrong book while leaving one
that already names the right book alone, whatever it calls it: "d20 Modern SRD"
and "d20 Modern" are the same book spelled two ways, and someone's
"Urban Arcana p.42" is a note rather than a mistake.

The same script files a document that has no folder, which is the same problem
in a different field: the feats pack held one book and needed no folders, so
when Urban Arcana's forty-two arrived the ninety-five already there stayed at
the root while an empty "d20 Modern" folder appeared beside them. A document
already in a folder is never moved — a GM filing things their own way in
Foundry is not a mistake to correct.

Splitting the expansions into separate modules was considered and rejected for
now: it does nothing for the licence, since a module distributing d20 Future
content needs that book's Section 15 exactly as the system does, and it breaks
every `@UUID` link into those packs the moment a module is not installed.
Folders give the separation that was actually wanted. Each item records the book it is from, and d20 Future's also record the
**progress level** the SRD sells them at — PL5 for the Information Age up to
PL8 for the Gravity Age — because a disintegrator sitting unlabelled beside a
Colt is what makes a mixed compendium unusable. Where an expansion reprints an
item the core already has, d20 Modern's entry is the one kept, and the build
says which names that happened to.

A d20 Future weapon's category is the one thing its table does not print: those
tables are headed by progress level rather than by proficiency. Each carries
the SRD's own footnote instead — *"All weapons listed in this table require the
Personal Firearms Proficiency feat"* — so a weapon with a rate of fire is a
firearm, split into handgun and longarm by the size the core tables split them
on, one with a blast radius is an explosive, and the rest are simple weapons.
Nothing mechanical hangs on it; it is a label on the item sheet.

### Compiling compendia

Foundry reads LevelDB, and the packing tool is Node-only. `build_packs.py`
prints the exact commands and the `system.json` `packs` block to paste in:

```bash
npm install -g @foundryvtt/foundryvtt-cli
fvtt package pack -n weapons --in src/packs/weapons --out packs
fvtt package pack -n armor   --in src/packs/armor   --out packs
fvtt package pack -n gear    --in src/packs/gear    --out packs
```

`packs/` is gitignored; `src/packs/` is the committed source of truth. Document
ids are derived from the pack and slug, so rebuilds update documents in place
rather than duplicating them.

## Six characters, and a page that says what this is

**`Ready-Made Characters`** holds one hero per basic class, at first level,
ready to drag in and play: Sergeant Dana Kessler (Strong / Military), Teo Vance
(Fast / Criminal), Marisol Okonkwo (Tough / Emergency Services), Dr. Ilse
Brandt (Smart / Technician), Ruth Ayers (Dedicated / Doctor) and Nate Okoye
(Charismatic / Investigative).

What is *chosen* is in `data/pregens.json` — the class, the occupation, the
talent, three feats, which skills, what they carry, and a line saying why the
character is put together that way. What the rules then *decide* is applied by
`gen_pregens.py` rather than transcribed:

| | the SRD's rule | what it comes to |
|---|---|---|
| hit points | maximum at 1st level, plus the Constitution modifier | 5 to 12 across the six |
| skill points | `(class figure + Int modifier) x 4`, one point a rank for a class skill and two for a cross-class one, four ranks maximum | 12 for the Strong hero, 44 for the Smart hero |
| Wealth | "roll 2d4 and add the wealth bonus for the character's starting occupation" | 5, the average, since a printed character cannot roll — and the sheet says so |
| class skills | the class's own list, plus the ones the occupation grants | marked on the sheet, so the ranks bought are visibly ones a player could buy |

A character who overspends a skill point, exceeds the rank maximum, or leaves
points unspent **fails the build**. Every item on them is a real document
copied out of the packs — the same gun, the same rules page, the same artwork,
the same activities — so nothing here invents an item, and
`gen_pregens.py --check` runs in CI.

**`How to Play This`** is one journal entry of five pages, about the system
rather than the game: start here, rolling things, finding things, for the GM,
and the licence. Its fourteen links into the rules compendium are resolved
through the same index the sheets use, so a page that stops existing fails the
build rather than becoming a link into nothing.

Neither pack is touched by `link_rules.py`. They are generated from documents
that already carry their links, and the reconciler re-deriving a page for each
item from the character it sits on replaced eleven correct citations with the
same wrong one — a character is not printed anywhere, so the matcher fell back
to the parent.

## The self-test, which runs inside Foundry

The first thing it found was that **45 of the 52 classes could not be added to
a character**. A `StringField` given `choices` is set `blank: false` by Foundry,
whether or not the choices include a blank one, and a class states its
spellcasting as `kind: ""` unless it casts. So every class document loaded —
construction does not validate — and the moment one was dropped onto a sheet,
validation refused it with *"may not be a blank string"* and no class arrived.
Character creation, for every class that is not a spellcaster.

Nothing here could see it. The stub harness let a blank initial through where
Foundry would not, so all seven Node checks built the schema happily; the packs
were correct; the compendium opened. It took an actor, an item and a real
`createEmbeddedDocuments` — which is what this is for. The stub now applies
Foundry's own rule, so the next field written that way fails in CI.


Every check in this repository reads files. None of them has ever seen a
document load, a sheet derive a number, or a browser fetch an image — and every
bug that reached the table was of that kind:

| what broke | what all the checks said |
|---|---|
| 183 creatures showed a Defense the book does not print | the scrape matched the page, the model implemented the rule |
| Random Tables was an empty compendium for as long as it existed | 26 tables, read out of `src/packs` on every run |
| the artwork was never being served, while it was adjusted three times | 5,271 images, every path resolved on disk |

Each was found by a person looking at Foundry, which is the slowest instrument
available. So `game.modern20.selftest()` — also a button in the system settings
— runs in the world and asks what only a world can answer:

  - **the compendia**: every pack is registered and holds the number of
    documents that was built, and every creature in the one pack with embedded
    documents, effects and tokens actually constructs. A document whose data
    model throws still has an index entry, so a broken compendium looks normal
    until somebody opens one.
  - **the character sheet**: a Strong Hero item out of the compendium, at third
    level, on abilities of 15/14/13/12/10/8 — and then the numbers the book
    prints from it: base attack 3, the three saves, Defense, flat-footed
    Defense, initiative, massive damage, grapple, and an untrained class skill.
  - **the creatures**: one per size from Colossal down to Fine, each asked for
    the Defense the SRD prints, the token size its Space column gives, and the
    artwork it should be standing on. The Defense bug was worth eight points at
    Colossal and nothing at Medium, which is why the fixture spans the range.
  - **the rules links**: a citation from every pack, all 19 sheet topics and all
    48 skill links, resolved through `fromUuid`.
  - **the rolls in the text**: that `@Check[skill:climb|dc:15]` enriches into
    something clickable, and that a check naming a skill this system does not
    have resolves to nothing rather than to a button that cannot roll.
  - **the artwork**: all 185 image paths fetched from the server, through
    `getRoute`, so a host with a route prefix is asked the same question a
    browser would ask.
  - **the ready-made characters**: all six load, carry their items, are the
    class and level they claim, and show the hit points and Wealth the SRD's
    own arithmetic gives them — plus a base attack or Defense bonus, since a
    character whose class silently failed to apply reads as a perfectly
    ordinary level-1 sheet.
  - **the chat cards**: an item posts one, and it carries what it should.

It cleans up after itself. The character is made the way a player makes one —
an actor, and a class item dropped onto it — and deleted in a `finally`, as are
the chat messages it posts. Two earlier versions avoided touching the world at
all, with `new Actor({ items: [...] })` and then `create(..., { temporary:
true })`, and both produced an actor with no items on it: Foundry does not
build embedded collections for a document that was never saved. The symptom was
every class-derived number coming back as though the character had no class,
which reads like eight separate failures of the class system. Hence the two
rows that check the fixture before anything is concluded from it — a test that
cannot say whether its own setup worked will blame the system every time.

The figures it compares against are generated from the packs by
`gen_selftest.py`, never typed: a test whose expected values are written by
hand proves that its author can add up, and one whose expected values come from
the book proves the system still says what the book says. `check_selftest.py`
holds the generated half to `src/packs`, resolves every UUID in it, and fails a
fixture that would pass in any world at all — a class row of zeroes, a creature
with no printed Defense, a compendium expected to be empty.

What it cannot check is itself: the assertions are JavaScript and run in a
browser. That is the honest limit of everything else here, which is why this
exists — and the first thing it did was fail. Registering its own button used
`game.settings.registerMenu`, which the stub harness did not have, so the init
hook threw and eighteen checks failed at once: no sheets registered, no status
effects, not one of the eleven settings. One missing line in a stub, reported
as the system being comprehensively broken. `check_models.mjs` now holds a
settings menu to its own contract — a name, label and hint that are strings in
the language file, a class to open, and restricted to the GM — since each of
those fails in a different quiet way: a missing string renders as the key, and
a `type` that is not a class throws when somebody clicks it.

## The cover, and somewhere to play

Both are **drawn** rather than found, by `gen_cover.py` and `gen_scene.py`,
using nothing but rectangles, text and a little noise. A picture downloaded
from somewhere is a licence to keep track of and a provenance to be sure of,
and this system has a visual identity already: ink on paper, one accent, a
five-foot grid.

**The cover** (`assets/media/cover.webp`, 1920×1080) is what the setup screen
shows, with a thumbnail for the package list. Its figures are counted from the
packs rather than typed — a cover claiming 1,677 documents is a claim, and one
that goes stale is worse than none. Adding the scenes pack made it stale
immediately, and `gen_cover.py --check` said so.

**The scene** is a warehouse: 30×20 squares at five feet a square, 3000×2000
pixels. A floor with expansion joints, an office with a window onto the floor,
two roller doors, a loading bay, four pillars and eight stacks of crates.

The reason to draw a map rather than download one is the part that comes free:
**the walls are generated from the same description as the picture.** One list
of where the building's walls, doors and windows are, rendered twice — once as
paint and once as 32 wall segments — so a door is a door in both, and the map
cannot drift from what a token can walk through. The window blocks movement and
not sight, because that is what a window does. Token vision is off and the
scene is lit: an example scene is for trying the rules on, not for running a
stealth mission behind a fog nobody asked for.

Its 32 walls and 4 lights are keyed `!scenes.walls!<scene>.<wall>`, which the
first attempt omitted — the Foundry CLI refuses a document with no key and the
pack would not compile at all. `check_packs.py` had been checking exactly that
for actors' items, journals' pages, items' effects and tables' results since
the first time it happened, and said nothing here because its table of what a
collection carries had no entry for scenes. It does now, and a collection may
carry two kinds at once, which is what a scene is.

`check_art.py` resolves the scene's background and the manifest's own media
against the repository — those are the two images nothing else names, and a
wrong path in either is a black canvas or a grey rectangle that traces back to
no file. The self-test fetches them from the server along with the other 191.

## The compendium sidebar

Seventeen compendia in one flat list is a scrollbar, so `system.json` groups
them with `packFolders`, sorted the way a table reaches for them rather than
alphabetically — which would put Armor above the characters and the Rules in
the middle of the equipment.

| folder | holds |
|---|---|
| Play | How to Play This, Ready-Made Characters |
| Characters | Classes, Occupations, Talents, Feats |
| Equipment | Weapons, Armor, Equipment, Vehicles |
| FX | Spells, Psionic Powers, FX Items |
| The World | Creatures, Objects, Random Tables |
| The Rules | Rules |

`check_deploy.py` holds every declared pack to exactly one folder, because a
pack added later and left out of the grouping does not fail anything: it just
sits alone at the root below the folders, which reads as an oversight because
it is one. It also checks each folder states a name, a real sorting mode and a
hex colour, since a typo in any of those is a manifest a world has to load.

## Checks

```bash
npm install     # eslint, ruff and typescript; the system itself needs none
npm test        # lint, then every check below
```

The system ships as plain ES modules and has no build step. `package.json`
exists only so the tooling is one command rather than nine, and so a machine
without Node says so instead of silently skipping half the suite.

```bash
npm run lint                         # eslint over module/ and tools/, ruff over tools/
npm run typecheck                    # tsc --noEmit, using the JSDoc already in the code
python3 tools/check_private.py     # nothing here names the machine it was written on
python3 tools/check_globals.py     # no globals Foundry v14 removed
python3 tools/check_lang.py        # every referenced i18n key exists
python3 tools/check_config.py      # config.mjs still matches the scraped SRD
python3 tools/check_shadowing.py   # no module-level name defined twice
python3 tools/check_packs.py       # folders, keys, ids, tokens and table ranges
python3 tools/check_coverage.py    # the packs still cover as much of the SRD
python3 tools/check_rules_links.py # every link into the rules resolves, every roll anything asks for rolls
python3 tools/check_capture.py     # an editing session in Foundry survives the trip home
python3 tools/check_art.py         # every icon a document points at is a file that is here
python3 tools/check_deploy.py      # the deploy sends every directory the system reads
python3 tools/gen_cover.py --check # the cover still states what the packs hold
python3 tools/gen_scene.py --check # the example scene and its walls are current
python3 tools/check_selftest.py    # the in-world self-test checks the packs' own figures
node    tools/check_models.mjs     # system imports, every schema builds
node    tools/check_templates.mjs  # {{formField fields.X}} names a real field
node    tools/check_creatures.mjs  # every creature's arithmetic against the SRD
```

`.forgejo/workflows/ci.yml` runs all of them on every push, plus JSON
validation and `node --check` on every module. It uses the `docker` runner
label, which maps to `node:20-bookworm`; ruff arrives through npm rather than
pip, since its package ships the binary and that is one fewer toolchain to
keep working.

The linters are deliberately correctness-only — no style rules, no formatter.
The scraper is written to be read as prose about the SRD, and reflowing it
would cost more than it returns. `no-unused-vars` is a warning rather than an
error for the same reason: it is worth seeing and not worth failing a build
over.

`tsc --checkJs` is **advisory in CI until its first clean pass**, then it
should be made blocking. The code was not written against a type checker, so
a red build on the day it lands would say nothing that reading its output does
not. Foundry's own globals are declared as `any` in `types/foundry.d.ts`:
what is checked is the code in this repository, not Foundry's type surface.

Every one of these was written after a real failure, which is the only reason
to trust any of them:

| Check | The bug that caused it |
|---|---|
| `check_config.py` | 5 of 41 skills had the wrong trained-only flag, transcribed from a summary instead of the SRD |
| `check_lang.py` | `MODERN20.Skill` as a string shadowed the `MODERN20.Skill.*` namespace, silently swallowing 50 skill names |
| `check_globals.py` | `class Modern20Actor extends Actor` — v14 removed that global, so the world loaded as a black page |
| `check_models.mjs` | a DataField shared between two schemas; an earlier permissive version of this harness passed the broken code |
| `check_templates.mjs` | `{{formField fields.typo}}` renders as nothing with no console error — a blank row, not a crash |
| `check_shadowing.py` / `no-redeclare` | two parsers in one week were named over an existing definition — `ability_key` over the psionics one, `DAMAGE_TYPES` over the spells one — and the later definition silently won |
| `check_packs.py` | an actor's items are separate entries in a compiled pack, and a missing `_key` stops the Foundry CLI dead — during a deploy, which is the only place it runs |
| `check_packs.py` (tokens) | nothing rejects a token that is one square when the creature is Gargantuan; it just arrives that size, and the GM resizes it by hand every time |
| `check_packs.py` (tables) | the first build of the random tables had a d8 with twelve rows and two tables whose last row read "00" as zero — a roll with no result looks like an empty draw and nothing else |
| `check_packs.py` (creatures) | every derived number on a creature is stored as the offset that reproduces the printed total, which holds only while everything the sheet adds back is subtracted — the size modifier was not, and 183 of 300 creatures showed a Defense the SRD does not print, eight points out on a Colossal dragon, with each half of the sum correct on its own |
| `check_selftest.py` | the one test that runs inside Foundry is the one thing here that cannot be run from here, which makes its expected figures the place a mistake is invisible from both directions: wrong numbers in a test nobody here executes, checked against a world nobody there inspects |
| `check_private.py` | everything here was written on one laptop and deployed to one server, and for a while it said so — a default host, a home directory, a path into one particular Node install. None of it secret, all of it wrong for everybody else. It also fails a script nothing runs and nothing imports, which is the same problem in a different form |
| `check_deploy.py` | the only check that reads the step deciding what reaches Foundry rather than what is in the repository: `assets/` was never uploaded, so every image 404'd into a page nobody was reading, and the packs to compile were written out by hand — when the tables pack was added nobody added it, and Random Tables was an empty compendium on the live host for as long as it existed while every check read all 26 of them from `src/packs` and said so |
| `check_art.py` | a broken image is the quietest failure a compendium has: Foundry draws an empty frame, logs nothing, and the row still has its name — so an icon renamed or half-committed would cost 4,864 documents their art and look like nothing at all |
| `check_rules_links.py` | a rules link is a UUID in a JSON file: one that resolves to nothing opens no page, logs nothing, and looks exactly like one that works — and a roll naming a skill the system does not have renders as its own words, so the sentence still reads and the die is simply gone |
| `check_coverage.py` | the creature scrape read only table-shaped stat blocks, and the 54 creatures the SRD prints as paragraphs — every animal, the alien probe, the zap — were missing with every check green |
| `check_packs.py` (folders) | Urban Arcana's feats arrived, the pack grew its first folders, and the ninety-five feats already there stayed at the compendium root beside an empty "d20 Modern" folder |
| `check_capture.py` | renaming a creature on its sheet filed a second copy of it beside the first, and a folder made in Foundry was left behind so everything in it landed in the compendium root — both found by reading 1,400 documents of output against a live host |

Two of these bugs took a black screen to find. The Node checks enforce
Foundry's *real* invariants rather than merely resolving names, because a
permissive stub is worse than no stub: it produces confident green output for
code that cannot load.

### What CI still cannot catch

Nothing here renders a sheet. Anything in the render path — CSS specificity
against core, ApplicationV2 part and tab wiring, actual layout — is only
testable by opening the sheet in a browser. Three shipped bugs lived there.

`config.mjs` has to be plain JS the browser can load, so SRD values are
transcribed into it by hand. `check_config.py` is what proves the transcription
is still honest.

And nothing here can see a page the pipeline has never been shown. Every check
compares the import against the SRD *as crawled*, so a content page one link
past the crawl is invisible to all of them: Urban Arcana's sixty-five creatures
were missing for months with the suite green, and were found by reading the
rules journal's own page list against the crawl's. Twenty-four pages are still
outside it, and `data/rules.json` — which is built from the site's own
navigation rather than from the crawl — is the list to diff against.

## What is left

Roughly in the order worth doing it:

1. **Load it in Foundry and fix what breaks.** Nothing here has run in a live world.
2. **Psionic powers and vehicles.** Messy; budget for a `data/overrides/` layer that
   merges hand corrections over scraped output.
3. **XP thresholds**, so the sheet knows when a character may level rather than
   leaving it to the player to decide and click.
4. **The rest of d20 Future and Urban Arcana.** The equipment is in: every
   weapon, suit of armor, piece of gear and vehicle those books price is built
   from its own table, and so are their classes and occupations, and Urban
   Arcana's creatures, spells, powers, FX items and feats. The *text* of everything else arrived with the rules
   journal, so it is readable and linkable in the world today; what is left is
   documents to drag onto a sheet. Measured by the rules pages nothing points
   at, in the order the work gets harder:

   | Missing | Entries | Why it is not in yet |
   |---|---|---|
   | d20 Future and Menace Manual feats | 29 + 5 | those two listings are laid out differently enough that the feat parser reads prerequisite lines as names |
   | Shadowkind species | 21 | species-trait bundles; no importer |
   | Incantations and their seeds | 46 | spell-shaped; no importer, and `urbanseed.html` is past the crawl |
   | Mutations | 73 | feat-shaped, with an MP cost and a d% table |
   | Cybernetics | 33 | gear-shaped, with a purchase DC |
   | Robots, mecha and starships | ~290 pages | component catalogues and example units; fifteen of their pages are past the crawl too |

   Organizations stay journal-only: nineteen pages of who-knows-whom, with
   nothing to roll.

Class skills are granted by the character's class and occupation items rather
than ticked by hand — removing a class removes what it granted. A hand-ticked
box still counts, so the stored value acts as an override for anything granted
outside those items.

An occupation's Reputation bonus is derived, since it is a permanent trait. Its
Wealth bonus is applied once when the occupation is added: Wealth erodes as the
character buys things, so re-deriving it every preparation pass would silently
refund purchases.

An occupation's choices are parsed from the SRD's own sentence — *"Choose three
of the following skills as permanent class skills"* — into a count and a list
of options. Those picks are made inline: on the Occupation step of the creator,
or on the occupation item's own sheet afterwards. Choosing the bonus feat there
grants it. The Wealth increase is applied when the occupation is added.

No part of character creation or levelling uses a dialog. Every choice is made
on a screen that shows the surrounding context, and nothing is written until
the screen is confirmed.

**Skills taken per subject** — Knowledge, Craft, Perform, Profession and the two
language skills — are handled as the SRD describes them: each subject is a
separate skill with its own ranks. The subject lists are scraped rather than
transcribed, using the SRD's own stated counts ("the fourteen Knowledge
categories") to separate the list from the section headings that follow it in
the same shape: 14 Knowledge, 8 Perform, 7 Craft. Profession and the languages
are open, so their subject is typed rather than chosen.

The two language skills are marked `perRank`, because the SRD says they do not
work like a standard skill: *"Each additional language costs 1 rank"* and *"a
character never makes Speak Language checks"*. Each rank buys one language, and
no rank cap applies.

**Skill points are spent in those screens too** — the creator's Skills step for
a starting character's (points + Int) x 4, and the level-up screen for each
level's allocation. Both use the same costing: one point per rank in a class
skill, two cross-class, capped at level + 3 or half that cross-class.

**Provenance is recorded.** Each class skill knows which class or occupation
made it one, shown on hover rather than as a bare checkmark. Items granted
during creation or levelling carry a `flags.modern20.source` stamp naming what
granted them and at what character level, shown as a dashed tag on the sheet,
so a granted talent is distinguishable from one dragged on by hand. And the
hero carries an append-only `system.advancement` log — one entry per level with
the hit points rolled, what was gained and which skill ranks were bought —
displayed newest-first on the Character tab.

**Equipping** is a per-row toggle on the Gear tab, the shape the mature systems
settled on — d20 Modern has no slots or attunement to model. Equipped armor
feeds the equipment bonus, the maximum Dex bonus and the armor check penalty;
attacking with a stowed weapon warns rather than blocks.

**Encumbrance** is derived from everything carried, against the SRD's
Strength table. Note that d20 Modern's encumbrance costs *speed* rather than
the d20 3.5 Dexterity cap and check penalty — *"An encumbered character's speed
is reduced to the value given below"* — and above the heavy figure a character
cannot move or act at all.

**Sheets are read-only for players — but every action is not.** The rule is not
"GM only": a player may do anything their character does as an action, and may
not directly edit what those actions produce. Equipping, spending an action
point, buying, rolling, levelling and taking damage are all theirs. Typing a
new hit point total is not.

So health changes through actions. A damage roll offers Apply, Half and Heal
controls on its chat card, applied to targeted tokens or selected ones, and the
hit point box carries -5 / -1 / +1 / +5 steps. Both route through
`Actor#applyDamage`, so damage reduction and the massive damage Fortitude save
happen wherever the damage came from — which is exactly why editing the number
directly is the wrong path. Building happens in the creator and the
level-up screen, which apply the rules; editing the same values directly on the
sheet bypasses them. Players keep everything that reads or rolls, plus the
level-up control. The GM edits freely, and a lock icon in the header says which
mode the viewer is in. All nineteen parse cleanly; the awkward cases were Academic, which
hides two more skills in a trailing clause, and the occupations that write
"either A or B" with no comma to split on.

## Known rough edges

- `general.html` mixes categories, products and indented variants in one table.
  The parser reads that hierarchy from the markup (bold / italic / `class="indent"`),
  but the SRD is inconsistent enough that some gear names will need hand fixing.
- Armor speed penalties are stored as raw SRD strings, not parsed.
- `data/overrides/<dataset>.json` corrects genuine SRD errors, keyed by entry id
  and requiring a stated `why`. One entry so far: Alertness prints its benefit
  text under a `Prerequisite` label.

## License

Code is MIT. SRD content is Open Game Content under the OGL v1.0a.
See [LICENSE.md](LICENSE.md) and [OPEN_GAME_LICENSE.md](OPEN_GAME_LICENSE.md).

Not affiliated with, endorsed by, or sponsored by Wizards of the Coast. No
Product Identity, trademarks, or the "d20 System" mark are used here.
