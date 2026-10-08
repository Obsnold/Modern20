import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { deriveCharacter } from "../../module/rules/character.mjs";
import { restAbilities, abilityConditions, restHealing } from "../../module/rules/damage.mjs";
import { treatmentTerms, surgeryFatigue, surgeryDice, revivable, TASKS } from "../../module/rules/treat.mjs";
import { reputationCheck, REPUTATION_DC } from "../../module/rules/rolls.mjs";
import { statusEffects } from "../../module/rules/conditions.mjs";
import { kindOfActorField, fieldLabel } from "../../module/rules/log.mjs";

const scores = (over = {}) => Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 10, damage: 0, drain: 0, ...(over[a] ?? {}) }]));
const classes = Object.fromEntries(PACKS.classes().documents.filter((d) => d.system).map((d) => [d.name, d]));
const tough = (level) => ({ type: "class", name: "Tough Hero", system: { ...classes["Tough Hero"].system, level, hitPoints: Array(level).fill(6) } });

test("ability damage and drain come off the score, and all that follows it; never below 0", () => {
  const plain = deriveCharacter({ abilities: scores({ con: { value: 14 } }) }, [tough(3)]);
  const hurt = deriveCharacter({ abilities: scores({ con: { value: 14, damage: 2, drain: 2 } }) }, [tough(3)]);
  assert.deepEqual([hurt.scores.con, hurt.modifiers.con, hurt.abilityLoss.con], [10, 0, 4]);
  assert.equal(hurt.hitPoints.max, plain.hitPoints.max - 6);     // Con +2 to +0: 2 a level, 3 levels
  assert.equal(hurt.saves.fort, plain.saves.fort - 2);
  assert.equal(deriveCharacter({ abilities: scores({ str: { damage: 15 } }) }, []).scores.str, 0);
  assert.equal(deriveCharacter({ abilities: scores({ con: { damage: 10 } }) }, []).deadByConstitution, true);
  assert.equal(plain.deadByConstitution, false);
});

test("rest heals ability damage, a point a night, 2 with bed rest, 3 with long-term care; drain stays", () => {
  const a = scores({ str: { damage: 3 }, con: { damage: 1, drain: 2 } });
  assert.deepEqual(restAbilities(a, 1), { damage: { str: 2, con: 0 }, healed: { str: 1, con: 1 } });
  assert.deepEqual(restAbilities(a, 3).damage, { str: 0, con: 0 });
  assert.deepEqual(abilityConditions(a, 8), { abilityDamaged: true, abilityDrained: true, dead: false });
  assert.deepEqual(abilityConditions(scores(), 0), { abilityDamaged: false, abilityDrained: false, dead: true });
  assert.deepEqual([restHealing(4, 10), restHealing(4, 10, { bedRest: true }), restHealing(4, 10, { bedRest: true, care: true })], [4, 8, 12]);
  // Damage is the session's (the log prunes it); drain, permanent, is the build's.
  assert.deepEqual([kindOfActorField("system.abilities.str.damage"), kindOfActorField("system.abilities.str.drain")], ["play", "build"]);
  assert.equal(fieldLabel("system.abilities.con.drain"), "Constitution drain");
});

test("Treat Injury: its uses' DCs, −4 without the kit or (surgery) the feat, −5 on oneself, which it allows", () => {
  assert.deepEqual([TASKS.restore.dc, TASKS.surgery.dc, TASKS.stabilize.dc], [15, 20, 15]);
  assert.deepEqual(treatmentTerms("restore"), []);
  assert.deepEqual(treatmentTerms("surgery", { kit: false }).map((t) => t.value), [-4, -4]);
  assert.deepEqual(treatmentTerms("surgery", { surgeryFeat: true }), []);
  assert.deepEqual(treatmentTerms("restore", { self: true }).map((t) => t.value), [-5]);
  assert.equal(treatmentTerms("stabilize", { self: true }), null);
  // Surgery: 1d6 a level; fatigue 24 hours less 2 a point over 20, at least 6.
  assert.equal(surgeryDice(5), "5d6");
  assert.deepEqual([surgeryFatigue(20), surgeryFatigue(23), surgeryFatigue(40)], [24, 18, 6]);
  assert.deepEqual([revivable(-3, false), revivable(-3, true), revivable(0, false)], [false, true, true]);
});

test("a Reputation check: 1d20 + Reputation + their Int + the situation, DC 25; recognized, ±4 on five skills", () => {
  const spec = reputationCheck({ reputation: 4 }, { int: 1, ticked: { famous: true, circle: true } });
  assert.equal(spec.formula, "1d20 + 4 + 1 + 10 + 5");
  assert.equal(REPUTATION_DC, 25);
  const famous = statusEffects().find((e) => e.id === "famous");
  assert.deepEqual(famous.system.changes.map((c) => [c.key, c.value]), ["bluff", "diplomacy", "gatherInformation", "intimidate", "perform"].map((k) => [`system.bonuses.skills.${k}`, 4]));
  assert.ok(statusEffects().find((e) => e.id === "infamous").system.changes.every((c) => c.value === -4));
});

test("spell resistance: the highest given, a drow's 11 + level and armor's among them; none stacks", () => {
  const species = PACKS.species().documents.find((d) => d.name === "Drow (Dark Elf)") ?? PACKS.species().documents.find((d) => /drow/i.test(d.name));
  const drow = { type: "species", name: species.name, system: species.system, effects: species.effects.map((e) => ({ ...e, changes: e.system.changes })) };
  const d = deriveCharacter({ abilities: scores() }, [drow, tough(3)]);
  assert.equal(d.spellResistance, 14);
  const vest = { id: "v", type: "armor", name: "Vest", system: { equipped: true, equipmentBonus: 2, abilities: [{ id: "spellResistance19", choice: "" }] } };
  assert.equal(deriveCharacter({ abilities: scores() }, [drow, tough(3), vest]).spellResistance, 19);
  assert.equal(deriveCharacter({ abilities: scores() }, []).spellResistance, 0);
});
