/**
 * Check the spell and psionic power rules.
 *
 * Two things are worth checking automatically. First, the activity a casting
 * item ships with is produced twice — by scripts/build_packs.py for the
 * compendium and by module/apps/activities.mjs for an item made by hand — and
 * the whole point of that arrangement is that the two agree. Second, the SRD's
 * arithmetic: the save DC and the way damage grows with caster level.
 *
 *     node scripts/check_casting.mjs
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { installStubs } from "./lib/foundry-stubs.mjs";
import { packDocuments } from "./lib/packs.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const { hooks } = installStubs();

// The system logs on init; keep the output to this script's own findings.
const log = console.log;
console.log = () => {};
await import(join(ROOT, "module", "modern20.mjs"));
for (const [event, fn] of hooks) if (event === "init") fn();
console.log = log;

const { defaultActivities, scalingDice } = await import(
  join(ROOT, "module", "apps", "activities.mjs")
);

let problems = 0;
const fail = (message) => { problems++; console.log(`FAIL  ${message}`); };

/* -- the two generators must agree ------------------------------------- */

let compared = 0;
for (const [pack, type] of [["spells", "spell"], ["psionics", "psiPower"]]) {
  for (const document of packDocuments(ROOT, pack)) {
    const file = document.file;
    const built = document.system.activities ?? {};
    const derived = defaultActivities(type, document.system);
    compared++;

    // The built document is the reference: whatever the module derives from
    // the same fields has to match it key for key.
    const a = JSON.stringify(sorted(built));
    const b = JSON.stringify(sorted(derived));
    if (a !== b) fail(`${pack}/${file}: built ${a} but the module derives ${b}`);
  }
}
console.log(`${compared} casting items compared between the pack build and the module`);

/** Stable key order, so two equal objects compare equal as strings. */
function sorted(value) {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((k) => [k, sorted(value[k])]));
  }
  return value;
}

/* -- caster level scaling ---------------------------------------------- */

// "1d6 points of fire damage per caster level (maximum 10d6)": the printed
// expression is already the first die, so the extra dice are one per level
// after the first, and never more than the cap.
const scalingCases = [
  { per: 1, max: 10, casterLevel: 1, extra: 0 },
  { per: 1, max: 10, casterLevel: 5, extra: 4 },
  { per: 1, max: 10, casterLevel: 10, extra: 9 },
  { per: 1, max: 10, casterLevel: 15, extra: 9 },
  // "1d8 points of damage per two caster levels (maximum 5d8)".
  { per: 2, max: 5, casterLevel: 1, extra: 0 },
  { per: 2, max: 5, casterLevel: 4, extra: 1 },
  { per: 2, max: 5, casterLevel: 7, extra: 2 },
  { per: 2, max: 5, casterLevel: 20, extra: 4 },
  // Damage that does not scale never grows.
  { per: 0, max: 0, casterLevel: 20, extra: 0 }
];

for (const { per, max, casterLevel, extra } of scalingCases) {
  const item = { actor: { system: { spellcasting: { casterLevel } } } };
  const got = scalingDice(item, { scaling: { per, max } });
  if (got !== extra) {
    fail(`scaling per ${per} max ${max} at caster level ${casterLevel}: `
      + `expected ${extra} extra dice, got ${got}`);
  }
}
console.log(`${scalingCases.length} caster level scaling cases checked`);

/* -- save DC ------------------------------------------------------------ */

// "The Difficulty Class for saving throws to resist the effects of a Mage's
// spells is 10 + the spell's level + the Mage's Intelligence modifier", and a
// psionic power reads the same with the power's own key ability.
const { Modern20Item } = await import(join(ROOT, "module", "documents", "item.mjs"));
const dcCases = [
  { type: "spell", system: { tradition: "arcane", lists: { arcane: 3, divine: null } },
    abilities: { int: { mod: 4 }, wis: { mod: 1 } }, dc: 17 },
  // The same spell learned as a divine one is a different level and a
  // different ability, so a different DC.
  { type: "spell", system: { tradition: "divine", lists: { arcane: 4, divine: 3 } },
    abilities: { int: { mod: 4 }, wis: { mod: 1 } }, dc: 14 },
  { type: "psiPower", system: { keyAbility: "cha", level: 2 },
    abilities: { cha: { mod: 3 } }, dc: 15 }
];

for (const testCase of dcCases) {
  const item = Object.create(Modern20Item.prototype);
  Object.defineProperty(item, "type", { value: testCase.type });
  Object.defineProperty(item, "system", { value: testCase.system });
  Object.defineProperty(item, "actor", { value: { system: { abilities: testCase.abilities } } });

  const got = item.saveDC({ save: { calculation: "caster" } });
  if (got !== testCase.dc) {
    fail(`${testCase.type} save DC: expected ${testCase.dc}, got ${got}`);
  }

  // A flat DC belongs to the item, not the caster, and must be left alone.
  const flat = item.saveDC({ save: { calculation: "flat", dc: 15 } });
  if (flat !== 15) fail(`flat save DC: expected 15, got ${flat}`);
}
console.log(`${dcCases.length} save DC cases checked`);

/* -- daily casting pools ------------------------------------------------ */

// The four FX advanced classes that grant one, checked against the numbers
// printed on their own pages.
const classes = Object.fromEntries(
  packDocuments(ROOT, "classes").map((document) => [document.name, document.system])
);

const poolCases = [
  // "Mage Level 5: 4 3 2 1 - -", and an Intelligence of 16 adds "- 1 1 1 - -".
  { className: "Mage", levels: 5, score: 16, kind: "spells",
    tradition: "arcane", expected: [4, 4, 3, 2, 0, 0] },
  // The same Mage with an unremarkable Intelligence gets the printed row.
  { className: "Mage", levels: 5, score: 10, kind: "spells",
    tradition: "arcane", expected: [4, 3, 2, 1, 0, 0] },
  // "Acolyte Level 10: 6 5 5 4 4 3", Wisdom 20-21 adds "- 2 1 1 1 1".
  { className: "Acolyte", levels: 10, score: 20, kind: "spells",
    tradition: "divine", expected: [6, 7, 6, 5, 5, 4] },
  // A score above the last printed bracket holds at that bracket.
  { className: "Acolyte", levels: 1, score: 30, kind: "spells",
    tradition: "divine", expected: [3, 4, 2, 1, 1, 1] },
  // "Telepath Level 6: 15 Pts/Day", Charisma 18-19 adds 7.
  { className: "Telepath", levels: 6, score: 18, kind: "powers", expected: 22 },
  // A Battle Mind gets no bonus points from any score.
  { className: "Battle Mind", levels: 10, score: 22, kind: "powers", expected: 33 }
];

for (const testCase of poolCases) {
  const system = classes[testCase.className];
  if (!system) { fail(`no ${testCase.className} in the classes pack`); continue; }

  const row = system.casting.perDay[testCase.levels - 1] ?? [];
  const bracket = (table) => table.find((r) => testCase.score >= r.min && testCase.score <= r.max)
    ?? (testCase.score > (table.at(-1)?.max ?? 0) ? table.at(-1) : null);

  if (testCase.kind === "spells") {
    const bonus = bracket(system.casting.bonusByScore)?.bonus ?? [];
    const got = row.map((count, level) => count + (bonus[level] ?? 0));
    if (JSON.stringify(got) !== JSON.stringify(testCase.expected)) {
      fail(`${testCase.className} level ${testCase.levels} at ${testCase.score}: `
        + `expected ${JSON.stringify(testCase.expected)}, got ${JSON.stringify(got)}`);
    }
  } else {
    const points = system.casting.pointsPerDay[testCase.levels - 1] ?? 0;
    const got = points + (bracket(system.casting.bonusPointsByScore)?.points ?? 0);
    if (got !== testCase.expected) {
      fail(`${testCase.className} level ${testCase.levels} at ${testCase.score}: `
        + `expected ${testCase.expected} power points, got ${got}`);
    }
  }
}
console.log(`${poolCases.length} daily pool cases checked`);

// A class that grants no casting resource must say so rather than half-fill
// the block: the Occultist's table is scrolls gained, not spells per day.
for (const name of ["Occultist", "Shadow Slayer", "Strong Hero", "Soldier"]) {
  const system = classes[name];
  if (!system) { fail(`no ${name} in the classes pack`); continue; }
  if (system.casting.kind) fail(`${name} should grant no casting resource, has "${system.casting.kind}"`);
}

console.log(problems ? `\n${problems} problems` : "\nall casting checks passed");
process.exit(problems ? 1 : 0);
