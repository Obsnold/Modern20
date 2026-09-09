/**
 * Check the creature types against the SRD.
 *
 * module/creature-types.mjs is generated from the scrape, so the first job is
 * that the two still match. The rest is the arithmetic a type decides: which
 * base attack column it uses, which saves are good, and what those come to at
 * a given number of Hit Dice.
 *
 *     node scripts/check_creatures.mjs
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { installStubs } from "./lib/foundry-stubs.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const { hooks } = installStubs();

const log = console.log;
console.log = () => {};
await import(join(ROOT, "module", "modern20.mjs"));
for (const [event, fn] of hooks) if (event === "init") fn();
console.log = log;

const { CREATURE_TYPES, CREATURE_PROGRESSION } =
  await import(join(ROOT, "module", "creature-types.mjs"));
const { derivedFromType, progressionAt, hitDiceCount, sizeGuidance, creatureType } =
  await import(join(ROOT, "module", "apps", "creature-types.mjs"));

let problems = 0;
const fail = (message) => { problems++; console.log(`FAIL  ${message}`); };

/* -- the generated module must match the scrape ------------------------- */

const scraped = JSON.parse(
  readFileSync(join(ROOT, "data", "creature_types.json"), "utf8")
);

if (Object.keys(CREATURE_TYPES).length !== scraped.types.length) {
  fail(`creature-types.mjs has ${Object.keys(CREATURE_TYPES).length} types, `
    + `the scrape has ${scraped.types.length} — run gen_creature_types.py`);
}
for (const type of scraped.types) {
  if (JSON.stringify(CREATURE_TYPES[type.id]) !== JSON.stringify(type)) {
    fail(`"${type.id}" differs between the scrape and creature-types.mjs`);
  }
}
if (JSON.stringify(CREATURE_PROGRESSION) !== JSON.stringify(scraped.progression)) {
  fail("the progression table differs between the scrape and creature-types.mjs");
}
console.log(`${scraped.types.length} types and ${scraped.progression.length} `
  + "progression rows compared with the scrape");

/* -- what each type is, from the SRD's own entries ---------------------- */

// Hit die, attack column and good saves, transcribed from the page so a
// parsing change that shifts a column is caught rather than shipped.
const expected = [
  ["aberration", "d8", "A", ["will"]],
  ["animal", "d8", "A", ["fort", "ref"]],
  ["construct", "d10", "A", []],
  ["dragon", "d12", "B", ["fort", "ref", "will"]],
  ["fey", "d6", "C", ["will"]],
  ["magicalBeast", "d10", "B", ["fort", "ref"]],
  ["monstrousHumanoid", "d8", "B", ["ref", "will"]],
  ["ooze", "d10", "A", []],
  ["outsider", "d8", "B", ["fort", "ref", "will"]],
  ["undead", "d12", "C", ["will"]],
  ["vermin", "d8", "A", ["fort"]]
];

for (const [id, hitDie, column, saves] of expected) {
  const type = CREATURE_TYPES[id];
  if (!type) { fail(`no creature type "${id}"`); continue; }
  if (type.hitDie !== hitDie) fail(`${id}: expected hit die ${hitDie}, got ${type.hitDie}`);
  if (type.baseAttack !== column) {
    fail(`${id}: expected base attack column ${column}, got ${type.baseAttack}`);
  }
  if (JSON.stringify(type.goodSaves) !== JSON.stringify(saves)) {
    fail(`${id}: expected good saves ${JSON.stringify(saves)}, `
      + `got ${JSON.stringify(type.goodSaves)}`);
  }
}
console.log(`${expected.length} type entries checked against the SRD`);

/* -- the progression table ---------------------------------------------- */

// Column A is three-quarters of Hit Dice, B the full amount, C a half.
const progressionCases = [
  [1, { goodSave: 2, poorSave: 0, attackA: "+0", attackB: "+1", attackC: "+0" }],
  [6, { goodSave: 5, poorSave: 2, attackA: "+4", attackB: "+6/+1", attackC: "+2" }],
  [20, { goodSave: 12, poorSave: 6, attackA: "+15/+10/+5",
    attackB: "+20/+15/+10/+5", attackC: "+10/+5" }]
];
for (const [hitDice, want] of progressionCases) {
  const row = progressionAt(hitDice);
  for (const [key, value] of Object.entries(want)) {
    if (row?.[key] !== value) {
      fail(`${hitDice} HD: expected ${key} ${value}, got ${row?.[key]}`);
    }
  }
}
// Past the printed table the last row holds rather than inventing attacks.
if (progressionAt(30)?.hitDice !== 20) fail("above 20 HD should hold at the last row");
console.log(`${progressionCases.length + 1} progression cases checked`);

/* -- building a creature ------------------------------------------------ */

const buildCases = [
  // A 6 HD aberration: column A at 6 HD is +4, good Will, poor Fortitude and
  // Reflex, and the hit die is d8.
  { type: "aberration", hitDice: "6d8", baseAttack: 4,
    saves: { fort: 2, ref: 2, will: 5 }, normalised: "6d8" },
  // A 10 HD dragon uses column B and has every save good.
  { type: "dragon", hitDice: "10d12", baseAttack: 10,
    saves: { fort: 7, ref: 7, will: 7 }, normalised: "10d12" },
  // Undead use column C and only Will is good.
  { type: "undead", hitDice: "4d12", baseAttack: 1,
    saves: { fort: 1, ref: 1, will: 4 }, normalised: "4d12" },
  // The hit die comes from the type, so a wrong one in the field is corrected.
  { type: "vermin", hitDice: "3d6", baseAttack: 2,
    saves: { fort: 3, ref: 1, will: 1 }, normalised: "3d8" }
];

for (const testCase of buildCases) {
  const got = derivedFromType(testCase.type, testCase.hitDice);
  if (!got) { fail(`could not build a ${testCase.type}`); continue; }
  if (got.baseAttack !== testCase.baseAttack) {
    fail(`${testCase.type} ${testCase.hitDice}: expected base attack `
      + `${testCase.baseAttack}, got ${got.baseAttack}`);
  }
  for (const [save, value] of Object.entries(testCase.saves)) {
    if (got.saves[save] !== value) {
      fail(`${testCase.type} ${testCase.hitDice}: expected ${save} ${value}, `
        + `got ${got.saves[save]}`);
    }
  }
  if (got.hitDice !== testCase.normalised) {
    fail(`${testCase.type} ${testCase.hitDice}: expected "${testCase.normalised}", `
      + `got "${got.hitDice}"`);
  }
}

// Free text from the import and from sheets edited before the types were a
// list still resolves, so nothing is stranded on a type nobody can pick.
const freeText = {
  "Undead": "undead",
  "magical beast": "magicalBeast",
  "Monstrous Humanoid": "monstrousHumanoid",
  "elemental (air)": "elemental",
  // "Monstrous humanoid" must not be read as a humanoid.
  "monstrous humanoid": "monstrousHumanoid"
};
for (const [text, id] of Object.entries(freeText)) {
  const got = creatureType(text);
  if (got?.id !== id) fail(`"${text}" resolved to "${got?.id}", expected "${id}"`);
}
if (derivedFromType("wyrm", "5d8")) fail("an unknown type should build nothing");
if (hitDiceCount("d8") !== 1) fail("a bare hit die is one Hit Die");
console.log(`${buildCases.length + Object.keys(freeText).length + 2} build cases checked`);

/* -- the per-size tables ------------------------------------------------ */

// "Medium-size" is the medium size, which is the one join that can silently
// fail and leave every creature without guidance.
const medium = sizeGuidance("aberration", "medium");
if (!medium) fail("a medium aberration should have a size row");
else if (medium.str !== "10-11" || medium.bite !== "2d4") {
  fail(`medium aberration: expected Str 10-11 and a 2d4 bite, `
    + `got ${medium.str} and ${medium.bite}`);
}
// Giants are printed only from Large up, so a small one has no row and that
// is the SRD's answer rather than a parsing failure.
if (sizeGuidance("giant", "tiny")) fail("the SRD prints no tiny giant");
if (!sizeGuidance("giant", "large")) fail("a large giant should have a size row");
console.log("4 size guidance cases checked");

/* -- every imported creature must know what it is ----------------------- */

// A stat block that prints its size and type in an unexpected place used to
// import as a creature with neither — and four of them took the size line for
// their name, so the compendium held a creature called "Huge animal".
const creatures = JSON.parse(readFileSync(join(ROOT, "data", "creatures.json"), "utf8"));

const untyped = creatures.filter((entry) => !entry.creatureType);
if (untyped.length) {
  fail(`${untyped.length} creatures have no type: `
    + untyped.slice(0, 5).map((e) => e.name).join(", "));
}
const unresolved = creatures.filter(
  (entry) => entry.creatureType && !creatureType(entry.creatureType)
);
if (unresolved.length) {
  fail(`${unresolved.length} creatures have a type that resolves to nothing: `
    + unresolved.slice(0, 5).map((e) => `${e.name} (${e.creatureType})`).join(", "));
}
// A name that is a size followed by a creature type is the size line read as
// a name. "Medium Dog" and "Huge Crocodile" are real names the SRD prints;
// "Huge vermin" is not, because vermin is a type.
const typeNames = Object.values(CREATURE_TYPES).map((type) => type.name.toLowerCase());
const misnamed = creatures.filter((entry) => {
  const match = entry.name.toLowerCase().match(
    /^(?:fine|diminutive|tiny|small|medium-size|medium|large|huge|gargantuan|colossal)\s+(.+)$/
  );
  return match && typeNames.includes(match[1]);
});
if (misnamed.length) {
  fail(`${misnamed.length} creatures are named after their size line: `
    + misnamed.map((e) => e.name).join(", "));
}

// The four blocks that print the size and type nowhere: recovered from the
// Defense line's own size modifier and from the creature's special abilities.
const recovered = {
  "Chemical Golem": { size: "large", creatureType: "construct" },
  "Advanced Chemical Golem": { size: "huge", creatureType: "construct" },
  "Dread Tree": { size: "huge", creatureType: "plant" },
  "Advanced Dread Tree": { size: "gargantuan", creatureType: "plant" }
};
for (const [name, want] of Object.entries(recovered)) {
  const entry = creatures.find((e) => e.name === name);
  if (!entry) { fail(`no creature "${name}"`); continue; }
  for (const [key, value] of Object.entries(want)) {
    if (entry[key] !== value) {
      fail(`${name}: expected ${key} "${value}", got "${entry[key]}"`);
    }
  }
}
console.log(`${creatures.length} imported creatures checked for size and type`);

/* -- a creature's attacks must roll the number the SRD prints ------------ */

// The system derives an attack from base attack, an ability modifier and size;
// the SRD prints the total. The weapon stores the difference, so the check is
// that adding it all back up gives the printed number again — for every attack
// of every creature, since one wrong sign would be invisible on a sheet.
const ATTACK_SIZE_MODIFIER = {
  fine: 8, diminutive: 4, tiny: 2, small: 1, medium: 0,
  large: -1, huge: -2, gargantuan: -4, colossal: -8
};

let weapons = 0;
for (const creature of creatures) {
  const document = readCreatureDocument(creature.id);
  if (!document) continue;

  // Matched one for one and consumed: a creature that bites at two different
  // bonuses must produce both, not the same one twice.
  const unmatched = [...creature.attacks];

  for (const item of (document.items ?? []).filter((i) => i.type === "weapon")) {
    weapons++;
    const base = item.name.split(" (")[0].toLowerCase();
    const index = unmatched.findIndex((attack) => attack.name.toLowerCase() === base);
    if (index < 0) { fail(`${creature.name}: no printed attack for "${item.name}"`); continue; }
    const [printed] = unmatched.splice(index, 1);

    const score = printed.ranged ? creature.abilities.dex : creature.abilities.str;
    const total = creature.baseAttack
      + Math.floor((score - 10) / 2)
      + (ATTACK_SIZE_MODIFIER[creature.size] ?? 0)
      + item.system.attackBonus;

    if (total !== printed.bonus) {
      fail(`${creature.name} ${item.name}: rolls at ${total >= 0 ? "+" : ""}${total}, `
        + `the SRD prints ${printed.bonus >= 0 ? "+" : ""}${printed.bonus}`);
    }
    // The printed damage already includes Strength, so the activity must not
    // add it a second time.
    for (const activity of Object.values(item.system.activities ?? {})) {
      if (activity.damage?.addAbility !== false) {
        fail(`${creature.name} ${item.name}: would add Strength to damage that includes it`);
      }
    }
  }
}
console.log(`${weapons} creature attacks checked against their printed totals`);

/** One built creature document. The pack names its files from the entry id. */
function readCreatureDocument(id) {
  const file = join(ROOT, "src", "packs", "creatures", `${slugify(id)}.json`);
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch { fail(`no built document for "${id}"`); return null; }
}

/** The same slug the pack build names files with. */
function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unnamed";
}

/* -- skills, feats and damage reduction --------------------------------- */

// The same offset arithmetic as the attacks: the SRD prints a total, the model
// derives one, and the difference is stored. A creature that rolls Hide at the
// wrong number looks perfectly normal on the sheet.
const { MODERN20 } = await import(join(ROOT, "module", "config.mjs"));

let skillTotals = 0;
let featItems = 0;
for (const creature of creatures) {
  const document = readCreatureDocument(creature.id);
  if (!document) continue;
  const stored = document.system.skills ?? {};

  for (const printed of creature.skillEntries) {
    const config = MODERN20.skills[printed.skill];
    if (!config) { fail(`${creature.name}: unknown skill "${printed.skill}"`); continue; }
    // A language is known rather than rolled, so there is no total to check.
    if (!config.ability) continue;

    const entry = printed.specialty
      ? (stored[printed.skill]?.specialties ?? []).find((s) => s.name === printed.specialty)
      : stored[printed.skill];
    if (!entry) {
      fail(`${creature.name}: nothing stored for ${printed.skill}`
        + `${printed.specialty ? ` (${printed.specialty})` : ""}`);
      continue;
    }

    skillTotals++;
    const score = creature.abilities[config.ability];
    const total = entry.ranks + entry.misc + Math.floor((score - 10) / 2);
    if (total !== printed.bonus) {
      fail(`${creature.name} ${printed.skill}: rolls at ${total >= 0 ? "+" : ""}${total}, `
        + `the SRD prints ${printed.bonus >= 0 ? "+" : ""}${printed.bonus}`);
    }
    // A trained-only skill with no ranks cannot be rolled at all.
    if (config.trainedOnly && entry.ranks < 1) {
      fail(`${creature.name} ${printed.skill}: trained-only with no ranks, so unrollable`);
    }
  }

  // Every printed feat becomes an item, defined by the SRD or not.
  const feats = (document.items ?? []).filter((item) => item.type === "feat");
  featItems += feats.length;
  if (feats.length !== creature.featNames.length) {
    fail(`${creature.name}: ${creature.featNames.length} feats printed, `
      + `${feats.length} items built`);
  }

  // "damage reduction 15/silver" was printed and never read, and then the
  // number was read and the bypass thrown away.
  const reduction = document.system.attributes.damageReduction;
  if (reduction.value !== creature.damageReduction.value) {
    fail(`${creature.name}: damage reduction ${reduction.value}, `
      + `the SRD prints ${creature.damageReduction.value}`);
  }
  if (reduction.bypass !== creature.damageReduction.bypass) {
    fail(`${creature.name}: damage reduction bypassed by "${reduction.bypass}", `
      + `the SRD prints "${creature.damageReduction.bypass}"`);
  }
}
console.log(`${skillTotals} skill totals and ${featItems} feats checked against the SRD`);

/* -- special qualities and species traits -------------------------------- */

// The SQ line was stored as one string and the SPECIES TRAITS prose was not
// read at all, so "Cold subtype, constrict, darkvision 60 ft., improved grab"
// was four abilities with no rules and a senses field holding all four.
const glossary = new Map(
  JSON.parse(readFileSync(join(ROOT, "data", "special_abilities.json"), "utf8"))
    .map((ability) => [slugify(ability.key), ability])
);

let abilityItems = 0;
let described = 0;
for (const creature of creatures) {
  const document = readCreatureDocument(creature.id);
  if (!document) continue;

  const abilities = (document.items ?? []).filter((item) => item.type === "specialAbility");
  abilityItems += abilities.length;
  const traits = new Map(
    (creature.speciesTraits ?? []).map((trait) => [slugify(trait.key), trait])
  );

  // Every printed quality is an item, and so is every trait the SQ line does
  // not already name. Matched on the slug both sides are filed under, since
  // the item's name carries this creature's own range: "Darkvision 60 ft.".
  const expected = new Set([
    ...creature.specialQualityEntries.map((quality) => slugify(quality.key)),
    ...traits.keys()
  ]);
  if (abilities.length < creature.specialQualityEntries.length) {
    fail(`${creature.name}: ${creature.specialQualityEntries.length} qualities printed, `
      + `${abilities.length} items built`);
  }
  if (!expected.size && abilities.length) {
    fail(`${creature.name}: ${abilities.length} abilities built from nothing printed`);
  }

  for (const item of abilities) {
    if (!item.system.description) fail(`${creature.name}: "${item.name}" has no description`);
    else if (!item.system.description.includes("described neither")) described++;
  }

  // An ability the SRD's own Special Abilities list defines must carry that
  // definition: the join between the printed name and the glossary is the
  // whole point, and a broken one looks like a normal empty description.
  for (const quality of creature.specialQualityEntries) {
    const defined = glossary.get(slugify(quality.key));
    if (!defined) continue;
    const item = abilities.find((entry) => slugify(entry.name).startsWith(slugify(quality.key)));
    if (!item) {
      fail(`${creature.name}: nothing built for "${quality.printed}"`);
    } else if (item.system.description.includes("described neither")) {
      fail(`${creature.name}: "${item.name}" is defined in the SRD's list but was not joined to it`);
    }
  }

  // The senses field held the whole SQ line. It holds the senses now, and
  // nothing that is not one.
  const senses = document.system.senses ? document.system.senses.split(", ") : [];
  const printedSenses = creature.specialQualityEntries.filter((quality) => quality.sense);
  if (senses.length !== printedSenses.length) {
    fail(`${creature.name}: ${printedSenses.length} senses printed, `
      + `${senses.length} in the senses field ("${document.system.senses}")`);
  }
  for (const sense of senses) {
    if (!/darkvision|low-light|blindsight|blindsense|scent|sight|tremorsense|all-around/i
      .test(sense)) {
      fail(`${creature.name}: "${sense}" is not a sense`);
    }
  }
}
console.log(`${abilityItems} special abilities checked, ${described} with rules text`);

/* -- what a creature ignores -------------------------------------------- */

// Damage reduction, energy resistance, immunity and vulnerability all end in
// the same place: a number applyDamage subtracts, or does not. Getting one of
// these wrong is invisible — the damage is simply the wrong size.
const { MODERN20: CONFIG20 } = await import(join(ROOT, "module", "config.mjs"));
const damageTypes = new Set([
  ...CONFIG20.energyDamageTypes, ...CONFIG20.physicalDamageTypes
]);

let traitEntries = 0;
for (const creature of creatures) {
  const document = readCreatureDocument(creature.id);
  if (!document) continue;
  const attributes = document.system.attributes;
  const printed = creature.damageTraits;

  for (const [key, built] of [
    ["resistances", attributes.resistances],
    ["immunities", attributes.immunities],
    ["vulnerabilities", attributes.vulnerabilities]
  ]) {
    if (built.length !== printed[key].length) {
      fail(`${creature.name}: ${printed[key].length} ${key} parsed, ${built.length} built`);
    }
    traitEntries += built.length;
    // Only a type the damage code can match on is worth storing: an immunity
    // to "nannite infection" would silently never apply.
    for (const entry of built) {
      const type = typeof entry === "string" ? entry : entry.type;
      if (!damageTypes.has(type)) {
        fail(`${creature.name}: "${type}" in ${key} is not a damage type`);
      }
      if (typeof entry !== "string" && !(entry.value > 0)) {
        fail(`${creature.name}: ${type} resistance is ${entry.value}`);
      }
    }
  }

  // A creature immune to a type does not also resist it, which would read as
  // two rules disagreeing on the sheet.
  for (const resistance of attributes.resistances) {
    if (attributes.immunities.includes(resistance.type)) {
      fail(`${creature.name}: both immune to and resistant to ${resistance.type}`);
    }
  }
}
console.log(`${traitEntries} resistances, immunities and vulnerabilities checked`);

/* -- the abilities that can be rolled ------------------------------------ */

// An ability with a printed DC is something to roll. The DC on the activity
// has to be the one the stat block prints: a save card offering the wrong
// number is worse than no card, because nobody checks it against the book.
let saveActivities = 0;
for (const creature of creatures) {
  const document = readCreatureDocument(creature.id);
  if (!document) continue;

  const traits = new Map(
    (creature.speciesTraits ?? []).map((trait) => [slugify(trait.key), trait])
  );

  for (const item of (document.items ?? []).filter((i) => i.type === "specialAbility")) {
    const activities = Object.values(item.system.activities ?? {});
    for (const activity of activities) {
      saveActivities++;
      if (activity.type !== "save") {
        fail(`${creature.name}: "${item.name}" has a ${activity.type} activity`);
        continue;
      }
      if (!["fort", "ref", "will"].includes(activity.save.ability)) {
        fail(`${creature.name}: "${item.name}" saves against "${activity.save.ability}"`);
      }
      if (activity.save.calculation !== "flat") {
        fail(`${creature.name}: "${item.name}" derives its DC instead of using the printed one`);
      }
      if (!(activity.save.dc > 0)) {
        fail(`${creature.name}: "${item.name}" has DC ${activity.save.dc}`);
      }
      // The name carries what the stat block printed: "Death Gaze (DC 15)".
      const printed = item.name.match(/\bDC\s*(\d+)/i);
      if (printed && Number(printed[1]) !== activity.save.dc) {
        fail(`${creature.name}: "${item.name}" rolls against DC ${activity.save.dc}, `
          + `the SRD prints ${printed[1]}`);
      }
    }

    // Every ability that prints a DC and names a save in its own text must
    // have become rollable; one that quietly did not is the failure mode this
    // whole pass exists to prevent.
    const printed = item.name.match(/\bDC\s*(\d+)/i);
    const trait = traits.get(slugify(item.name.replace(/\s*\(.*$/, "")));
    const names = /\b(Fortitude|Reflex|Will)\b/.test(trait?.description ?? "");
    if (printed && names && !activities.length) {
      fail(`${creature.name}: "${item.name}" prints a DC and a save but rolls nothing`);
    }
  }
}
console.log(`${saveActivities} rollable abilities checked against their printed DCs`);

console.log(problems ? `\n${problems} problems` : "\nall creature checks passed");
process.exit(problems ? 1 : 0);
