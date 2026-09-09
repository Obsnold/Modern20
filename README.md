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
| Compendia: classes, occupations, talents, feats, spells, psionic powers, weapons, armor, gear | 653 items, built from the SRD |
| Compendia: creatures, vehicles | 202 actors, built from the SRD |
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

## The SRD pipeline

The SRD is static HTML, so content is scraped rather than retyped. Everything
here is standard-library Python 3 — there is no install step.

```bash
python3 scripts/scrape.py            # crawl the SRD into data/
python3 scripts/scrape.py --refresh  # re-fetch every page first
python3 scripts/build_packs.py       # data/ -> src/packs/
```

`scrape.py` crawls all 98 SRD pages from the index — a hand-maintained page list
goes stale, since section pages link to the sub-pages holding the actual tables.
Pages are cached in `.cache/` and the site is hit once. Output lands in `data/`
and is committed, so a schema change means re-running `build_packs.py`, not
re-scraping.

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
python3 scripts/check_globals.py     # no globals Foundry v14 removed
python3 scripts/check_lang.py        # every referenced i18n key exists
python3 scripts/check_config.py      # config.mjs still matches the scraped SRD
node    scripts/check_models.mjs     # system imports, every schema builds
node    scripts/check_templates.mjs  # {{formField fields.X}} names a real field
```

`.forgejo/workflows/ci.yml` runs all five on every push, plus JSON validation
and `node --check` on every module. It uses the `docker` runner label, which
maps to `node:20-bookworm` — that image already ships git, curl, python3 and
node, so there is no install step.

Every one of these was written after a real failure, which is the only reason
to trust any of them:

| Check | The bug that caused it |
|---|---|
| `check_config.py` | 5 of 41 skills had the wrong trained-only flag, transcribed from a summary instead of the SRD |
| `check_lang.py` | `MODERN20.Skill` as a string shadowed the `MODERN20.Skill.*` namespace, silently swallowing 50 skill names |
| `check_globals.py` | `class Modern20Actor extends Actor` — v14 removed that global, so the world loaded as a black page |
| `check_models.mjs` | a DataField shared between two schemas; an earlier permissive version of this harness passed the broken code |
| `check_templates.mjs` | `{{formField fields.typo}}` renders as nothing with no console error — a blank row, not a crash |

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
4. **The rest of d20 Future and Urban Arcana** — progress levels, cybernetics,
   mecha, robots, xenoforms.

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
