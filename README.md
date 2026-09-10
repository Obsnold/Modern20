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
| Class progression folding into attack, saves, Defense and Reputation | Working |
| Compendia: classes, occupations, talents, feats, spells, psionic powers, weapons, armor, gear | 960 items, built from the SRD |
| d20 Future and Urban Arcana equipment | 237 of those items, tagged by book and progress level |
| Ammunition and containers | 24 ammunition types; 10 bags and cases that hold items |
| Compendia: creatures, vehicles, objects | 297 actors, built from the SRD |
| Rules reference | 53 journal entries, 1,685 pages — the SRD's own text, in four books, cross-linked |
| FX items | 134 magic and psionic items, priced and described |
| Objects | Hardness, hit points, break DCs and Defense by size — a door is an actor you can shoot |
| Creature special abilities, senses, skills, feats and damage reduction | 1,230 ability items, 1,174 with the SRD's own rules text, 78 rollable |
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

Across the 180 progression rows the SRD defines, that is 30 talent picks, 66
bonus feats and 87 named features. Only two of the named features match a feat
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
templates/               Handlebars templates (actor, item, chat)
css/modern20.css         Styling, scoped under .modern20
lang/en.json             Localization
scripts/                 SRD pipeline and consistency checks (Python 3, stdlib only)
data/                    Scraped SRD output; committed
src/packs/               Compendium source documents; committed
packs/                   Compiled LevelDB packs; generated, gitignored
```

## Creating and levelling

`scripts/deploy.sh` builds, verifies and installs in one step:

```bash
scripts/deploy.sh                      # code, templates, styles and language
scripts/deploy.sh user@host --packs    # also recompile and install the compendia
```

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

- `scripts/build_packs.py` writes them into compendium items at build time
- `Modern20Item._preCreate` seeds an item created by hand
- `Modern20Weapon.migrateData` backfills one made before activities existed

`scripts/gen_activity_defaults.py` generates `module/activity-defaults.mjs`
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

The 198 stat blocks in the SRD's Creatures, Animals and Menace pages import as
actors. The SRD prints them two ways and both are read: as a table with a
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
so `check_creatures.mjs` adds the 961 skill totals and 311 attacks back up and
asserts each one comes to the printed figure.

**Special abilities.** A stat block prints its abilities twice: once as the SQ
line — *"Cold subtype, constrict, darkvision 60 ft., improved grab"* — and once
as prose under SPECIES TRAITS that says what each one does. The import kept the
line as a single string, which nothing could read, and dropped the prose
entirely. Both are now parsed, and become 1,230 items, 1,174 of them carrying
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
253 different abilities.

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
python3 scripts/import_rules.py             # from .cache/, fetching what is missing
python3 scripts/import_rules.py --refresh   # re-fetch every page first
python3 scripts/build_packs.py
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
so `scripts/import_missing.py` takes those four documents from there and
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

## FX items

Magic and psionic items are the one body of SRD content priced in prose rather
than in a table, which is why the purchase-table pipeline never saw them: a
potion of Charisma is a paragraph, and its purchase DC is in the sentence after
it. They come out of the rules text instead — 134 of them, from potions, rings,
scrolls, staffs, tattoos, wands and wondrous items through to Urban Arcana's
artifacts and its magic vehicle accessories.

Both books print the same stat line and neither prints the same thing around
it: Urban Arcana bolds the item's name on a line of its own, d20 Modern runs
it into the description behind a colon. So the stat line — *"Type: Weapon
(magic); Caster Level: 10th; Purchase DC: 25 (+1), 30 (+2), 35 (+3); Weight: 3
lb."* — is what the parser looks for, and the name is whatever precedes it.

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

`npm run extract` (`scripts/capture_edits.py`) unpacks the live compendia with
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
a prototype token, empty effects, an entire light configuration — so only
fields the build actually sets are compared. And the editor rewrites `<br />`
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
node scripts/gen_field_labels.mjs > /tmp/fields.json   # then merge into lang/en.json
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
python3 scripts/scrape.py             # crawl the SRD into data/
python3 scripts/build_packs.py        # import what the packs do not have yet
python3 scripts/build_packs.py --overwrite weapons   # take the import for one pack
scripts/capture_edits.py              # bring edits made in Foundry home
```

`build_packs.py` writes documents the SRD produces and the packs do not have,
leaves every existing document alone, and *reports* where the two differ rather
than resolving it — a difference is as likely to be a hand correction as a
parser improvement, and it cannot tell which. Taking the imported version is a
decision, made with `--overwrite` and named per pack, and it is the one path
that can lose an edit.

`scrape.py` crawls all 98 SRD pages from the index — a hand-maintained page list
goes stale, since section pages link to the sub-pages holding the actual tables.
Pages are cached in `.cache/` and the site is hit once. Output lands in `data/`
and is committed, so a parser change means re-running `build_packs.py`, not
re-scraping.

`data/` is no longer the content, then: it is the SRD as parsed, which is what
new imports are built from and what the checks hold the packs against. Which
matters, because that is what keeps 311 attack bonuses and 961 skill totals
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
not have to read past the laser rifles to find a Colt. Seven packs hold more
than one book — the equipment three, the creatures, the spells, the powers and
the vehicles — and a pack holding one book is left ungrouped, since a single
folder wrapping everything is a click rather than a grouping.

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

## Checks

```bash
npm install     # eslint, ruff and typescript; the system itself needs none
npm test        # lint, then every check below
```

The system ships as plain ES modules and has no build step. `package.json`
exists only so the tooling is one command rather than nine, and so a machine
without Node says so instead of silently skipping half the suite.

```bash
npm run lint                         # eslint over module/ and scripts/, ruff over scripts/
npm run typecheck                    # tsc --noEmit, using the JSDoc already in the code
python3 scripts/check_globals.py     # no globals Foundry v14 removed
python3 scripts/check_lang.py        # every referenced i18n key exists
python3 scripts/check_config.py      # config.mjs still matches the scraped SRD
python3 scripts/check_shadowing.py   # no module-level name defined twice
python3 scripts/check_packs.py       # folders, keys and ids a compendium needs
python3 scripts/check_coverage.py    # the packs still cover as much of the SRD
python3 scripts/check_capture.py     # an editing session in Foundry survives the trip home
node    scripts/check_models.mjs     # system imports, every schema builds
node    scripts/check_templates.mjs  # {{formField fields.X}} names a real field
node    scripts/check_creatures.mjs  # every creature's arithmetic against the SRD
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
| `check_coverage.py` | the creature scrape read only table-shaped stat blocks, and the 54 creatures the SRD prints as paragraphs — every animal, the alien probe, the zap — were missing with every check green |
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

## What is left

Roughly in the order worth doing it:

1. **Load it in Foundry and fix what breaks.** Nothing here has run in a live world.
2. **Psionic powers and vehicles.** Messy; budget for a `data/overrides/` layer that
   merges hand corrections over scraped output.
3. **XP thresholds**, so the sheet knows when a character may level rather than
   leaving it to the player to decide and click.
4. **The rest of d20 Future and Urban Arcana.** The equipment is in: every
   weapon, suit of armor, piece of gear and vehicle those books price is built
   from its own table. The *text* of everything else arrived with the rules
   journal — Shadowkind, incantations, prestige classes, starship combat,
   mecha, robots, cybernetics, mutations, xenoforms — so it is all readable
   and linkable in the world today. What is left is making it mechanical:
   each of those is a table of modifiers to something the system would first
   have to model.

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
