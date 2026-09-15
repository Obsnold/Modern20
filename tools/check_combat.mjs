/**
 * Check the action economy and the combat tables.
 *
 * module/combat-data.mjs is generated from the scrape, so the first thing
 * worth checking is that it still matches — a hand edit to either side shows
 * up here rather than as a wrong number at the table. The rest is the
 * arithmetic: what a turn buys, and the attack sequence a base attack bonus
 * grants.
 *
 *     node tools/check_combat.mjs
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

const {
  COMBAT_ACTIONS, ATTACK_MODIFIERS, DEFENSE_MODIFIERS, COVER, CONCEALMENT,
  EXTRA_ATTACKS, TWO_WEAPON
} = await import(join(ROOT, "module", "combat-data.mjs"));
const { ACTION_COST, canAfford, attackSequence, castingTimeAction, STANCES } =
  await import(join(ROOT, "module", "apps", "actions.mjs"));

let problems = 0;
const fail = (message) => { problems++; console.log(`FAIL  ${message}`); };
const read = (name) => JSON.parse(readFileSync(join(ROOT, "data", name), "utf8"));

/* -- the generated module must match the scrape ------------------------- */

const actions = read("combat_actions.json");
const tables = read("combat_tables.json");

if (Object.keys(COMBAT_ACTIONS).length !== actions.length) {
  fail(`combat-data.mjs has ${Object.keys(COMBAT_ACTIONS).length} actions, `
    + `data/combat_actions.json has ${actions.length} — one of the two has drifted`);
}
for (const action of actions) {
  const generated = COMBAT_ACTIONS[action.id];
  if (!generated) { fail(`combat-data.mjs is missing "${action.id}"`); continue; }
  if (JSON.stringify(generated) !== JSON.stringify(action)) {
    fail(`"${action.id}" differs between the scrape and combat-data.mjs`);
  }
}

const generatedTables = {
  attackModifiers: ATTACK_MODIFIERS, defenseModifiers: DEFENSE_MODIFIERS,
  cover: COVER, concealment: CONCEALMENT, extraAttacks: EXTRA_ATTACKS,
  twoWeapon: TWO_WEAPON
};
for (const [name, generated] of Object.entries(generatedTables)) {
  if (JSON.stringify(generated) !== JSON.stringify(tables[name])) {
    fail(`table "${name}" differs between the scrape and combat-data.mjs`);
  }
}
console.log(`${actions.length} actions and ${Object.keys(generatedTables).length} tables `
  + `compared with the scrape`);

/* -- the SRD's own numbers ---------------------------------------------- */

// Spot-checks against the printed tables, so a parsing change that silently
// drops or shifts a row is caught rather than shipped.
const expected = [
  ["attackModifiers", "attackerFlankingDefender", { melee: 2, ranged: 0 }],
  ["attackModifiers", "attackerOnHigherGround", { melee: 1, ranged: 0 }],
  ["attackModifiers", "attackerProne", { melee: -4, ranged: -2 }],
  ["defenseModifiers", "defenderProne", { melee: -4, ranged: 4 }],
  ["defenseModifiers", "defenderSittingOrKneeling", { melee: -2, ranged: 2 }],
  ["defenseModifiers", "defenderStunnedOrCowering", { melee: -2, ranged: -2, losesDex: true }],
  ["defenseModifiers", "defenderFlatFooted", { melee: 0, ranged: 0, losesDex: true }]
];
for (const [table, id, fields] of expected) {
  const row = generatedTables[table].find((entry) => entry.id === id);
  if (!row) { fail(`${table} has no row "${id}"`); continue; }
  for (const [key, value] of Object.entries(fields)) {
    if (row[key] !== value) fail(`${table}.${id}.${key}: expected ${value}, got ${row[key]}`);
  }
}

// "One-half (fighting from around a corner...) +4 / +2".
const cover = COVER.find((entry) => entry.id === "oneHalf");
if (cover?.defense !== 4 || cover?.reflex !== 2) {
  fail(`half cover: expected +4 Defense and +2 Reflex, got ${cover?.defense}/${cover?.reflex}`);
}
if (CONCEALMENT.find((entry) => entry.id === "oneHalf")?.missChance !== 20) {
  fail("half concealment should be a 20% miss chance");
}
console.log(`${expected.length + 2} printed values spot-checked`);

/* -- what a turn buys --------------------------------------------------- */

// "A character can take one attack action and one move action each round, or
// a full-round action in place of both."
const budgetCases = [
  { spent: {}, action: "attack", affordable: true },
  { spent: {}, action: "fullRound", affordable: true },
  { spent: { attack: 1 }, action: "attack", affordable: false },
  { spent: { attack: 1 }, action: "move", affordable: true },
  // A full-round action costs both, so having moved rules it out.
  { spent: { move: 1 }, action: "fullRound", affordable: false },
  { spent: { attack: 1, move: 1 }, action: "free", affordable: true },
  { spent: { attack: 1, move: 1 }, action: "none", affordable: true }
];
for (const { spent, action, affordable } of budgetCases) {
  if (canAfford(spent, action) !== affordable) {
    fail(`${action} with ${JSON.stringify(spent)} spent: expected `
      + `${affordable ? "affordable" : "unaffordable"}`);
  }
}
// A free action must never draw on a pool.
for (const action of ["free", "varies", "none"]) {
  if (Object.keys(ACTION_COST[action]).length) fail(`${action} should cost nothing`);
}
console.log(`${budgetCases.length} turn budget cases checked`);

/* -- the attack sequence ------------------------------------------------ */

// "Table: Base attack bonus and extra attacks": +6 reads +6/+1, +11 reads
// +11/+6/+1, and below +6 there is only the one attack.
const sequenceCases = [
  [0, [0]], [5, [5]], [6, [6, 1]], [10, [10, 5]],
  [11, [11, 6, 1]], [16, [16, 11, 6, 1]], [20, [20, 15, 10, 5]],
  // Past the printed table the last row holds rather than extrapolating.
  [25, [25, 15, 10, 5]]
];
for (const [bab, want] of sequenceCases) {
  const got = attackSequence(bab);
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fail(`attack sequence at +${bab}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
  }
}
console.log(`${sequenceCases.length} attack sequence cases checked`);

/* -- casting times ------------------------------------------------------ */

const castingCases = [
  ["Attack action", "attack"],
  ["Full-round action", "fullRound"],
  ["Fullround action", "fullRound"],
  ["1 minute", "none"],
  ["See text", "none"],
  ["8 hours", "none"]
];
for (const [text, want] of castingCases) {
  const got = castingTimeAction(text);
  if (got !== want) fail(`casting time "${text}": expected "${want}", got "${got}"`);
}
console.log(`${castingCases.length} casting time cases checked`);

/* -- stances ------------------------------------------------------------ */

// The numbers the SRD gives each stance, and the fact that a charge has none.
if (STANCES.totalDefense.changes[0]?.value !== "4") {
  fail("total defense should be a +4 dodge bonus to Defense");
}
const defensively = STANCES.fightDefensively.changes.map((c) => c.value).join("/");
if (defensively !== "2/-4") {
  fail(`fighting defensively should be +2 Defense and -4 attack, got ${defensively}`);
}
if (STANCES.charge.changes.length) {
  fail("d20 Modern gives a charge no attack bonus; it should change nothing");
}
console.log("3 stance definitions checked");

/* -- which side a circumstance lands on --------------------------------- */

// "Any situational modifier created by the attacker's position or tactics
// applies to the attack roll, while any situational modifier created by the
// defender's position, state, or tactics applies to the defender's Defense."
const { resolveModifiers } = await import(join(ROOT, "module", "apps", "attack-dialog.mjs"));

const modifierCases = [
  // Flanking is the attacker's tactics, so it lifts the roll, and only in melee.
  { choices: { attack: ["attackerFlankingDefender"] }, ranged: false, attack: 2, defense: 0 },
  { choices: { attack: ["attackerFlankingDefender"] }, ranged: true, attack: 0, defense: 0 },
  // Prone is worth different things to each side of the same attack.
  { choices: { attack: ["attackerProne"] }, ranged: false, attack: -4, defense: 0 },
  { choices: { attack: ["attackerProne"] }, ranged: true, attack: -2, defense: 0 },
  // A prone defender is easier to reach in melee and harder to shoot.
  { choices: { defense: ["defenderProne"] }, ranged: false, attack: 0, defense: -4 },
  { choices: { defense: ["defenderProne"] }, ranged: true, attack: 0, defense: 4 },
  // Cover is a Defense bonus, and stacks with the defender's own circumstances.
  { choices: { cover: "oneHalf" }, ranged: true, attack: 0, defense: 4 },
  { choices: { defense: ["defenderProne"], cover: "oneHalf" }, ranged: true,
    attack: 0, defense: 8 },
  // Both sides at once: higher ground lifts the roll, cover lifts Defense.
  { choices: { attack: ["attackerOnHigherGround"], cover: "oneQuarter" }, ranged: false,
    attack: 1, defense: 2 },
  // Concealment is never a modifier — it is a miss chance rolled after a hit.
  { choices: { concealment: "oneHalf" }, ranged: true, attack: 0, defense: 0, missChance: 20 },
  { choices: {}, ranged: false, attack: 0, defense: 0, missChance: 0 }
];

for (const testCase of modifierCases) {
  const got = resolveModifiers(testCase.choices, testCase.ranged);
  for (const key of ["attack", "defense", "missChance"]) {
    if (testCase[key] === undefined) continue;
    if (got[key] !== testCase[key]) {
      fail(`${JSON.stringify(testCase.choices)} ${testCase.ranged ? "ranged" : "melee"}: `
        + `expected ${key} ${testCase[key]}, got ${got[key]}`);
    }
  }
}

// "The defender loses any Dexterity bonus to Defense" travels with the row.
if (!resolveModifiers({ defense: ["defenderFlatFooted"] }).losesDex) {
  fail("a flat-footed defender should lose their Dexterity bonus");
}
if (resolveModifiers({ defense: ["defenderProne"] }).losesDex) {
  fail("a prone defender keeps their Dexterity bonus");
}
console.log(`${modifierCases.length + 2} circumstance cases checked`);

/* -- death states -------------------------------------------------------- */

// "Disabled: the character has 0 hit points." "Dying: ... with -1 to -9 wound
// points." "Dead: a character dies when his or her hit points drop to -10 or
// lower, or when his or her Constitution drops to 0."
const { Modern20Actor } = await import(join(ROOT, "module", "documents", "actor.mjs"));

const deathCases = [
  { hp: 12, con: 12, state: "" },
  { hp: 1, con: 12, state: "" },
  { hp: 0, con: 12, state: "disabled" },
  { hp: -1, con: 12, state: "dying" },
  { hp: -9, con: 12, state: "dying" },
  { hp: -10, con: 12, state: "dead" },
  { hp: -25, con: 12, state: "dead" },
  // Constitution reaching zero kills whatever the hit points say.
  { hp: 30, con: 0, state: "dead" },
  // "A creature with no Constitution has no body or no metabolism" — the set
  // that ignores massive damage never had a score to lose.
  { hp: 30, con: 0, type: "Undead", state: "" },
  { hp: 30, con: 0, type: "Construct", state: "" },
  { hp: -3, con: 0, type: "Undead", state: "dying" }
];

for (const testCase of deathCases) {
  const actor = Object.create(Modern20Actor.prototype);
  Object.defineProperty(actor, "system", {
    value: {
      hp: { value: testCase.hp, max: 30 },
      abilities: { con: { total: testCase.con } },
      details: { creatureType: testCase.type ?? "Humanoid" }
    }
  });
  const got = actor.deathState;
  if (got !== testCase.state) {
    fail(`${testCase.hp} hp, Con ${testCase.con}, ${testCase.type ?? "Humanoid"}: `
      + `expected "${testCase.state}", got "${got}"`);
  }
}
console.log(`${deathCases.length} death state cases checked`);

console.log(problems ? `\n${problems} problems` : "\nall combat checks passed");
process.exit(problems ? 1 : 0);
