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
| Compendia: classes, occupations, talents, feats, spells, weapons, armor, gear | Built from the SRD — 568 items |
| Compendium: creatures | 138 actors, built from the SRD |
| Compendia: psionic powers, vehicles | **Not yet** — see below |
| Vehicles, FX/psionics | Data models only, no sheets |

Prerequisites and skill rank caps are surfaced as **warnings, never enforced**.
GMs override them constantly and a hard block just makes the sheet unusable.

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
3. **Combat.** Conditions as ActiveEffects, attack/damage automation.
4. **Ordinary, creature and vehicle sheets.** They currently share the hero sheet,
   which is wrong for all three.
5. **FX and d20 Future** as optional content.

Occupations store their skill and bonus-feat choices as SRD prose rather than
structured options, because the SRD states them as a sentence offering a
choice. Turning those into pickable lists is the next refinement.

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
