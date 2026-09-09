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

console.log(problems ? `\n${problems} problems` : "\nall creature checks passed");
process.exit(problems ? 1 : 0);
