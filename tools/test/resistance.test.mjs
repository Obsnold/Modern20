import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { readDefenses, characterDefenses, damageParts, reduceDamage, damageKinds } from "../../module/rules/resistance.mjs";
import { deriveCharacter } from "../../module/rules/character.mjs";

const creatures = Object.fromEntries(PACKS.creatures().documents.filter((d) => d.system).map((d) => [d.name, d]));

test("a creature's defenses as its stat block prints them", () => {
  assert.deepEqual(readDefenses(creatures.Bodak.system.specialQualities), { dr: [{ amount: 15, overcome: "silver" }], resist: { acid: 20, fire: 20 }, immune: ["electricity"], spellResistance: 0 });
  // Spell resistance as the stat blocks print it: "SR 22", "spell resistance 10".
  assert.equal(readDefenses(["SR 22", "darkvision 60 ft."]).spellResistance, 22);
  assert.equal(readDefenses(["spell resistance 10"]).spellResistance, 10);
  assert.deepEqual(readDefenses(["immune to ballistic damage and poison"]).immune, ["ballistic"]);
  assert.deepEqual(readDefenses(["piercing immunity"]).immune, ["piercing"]);
  assert.deepEqual(readDefenses(["damage reduction 5/–"]).dr, [{ amount: 5, overcome: "—" }]);
  assert.deepEqual(damageKinds("Bludgeoning/Concussion"), ["bludgeoning", "sonic"]);
});

test("a roll split by the labels on its dice", () => {
  // (1d8+9) + 1d6[fire], rolled 14 and 4.
  const terms = [{ flavor: "", total: 14 }, { operator: "+" }, { flavor: "fire", total: 4 }];
  assert.deepEqual(damageParts(terms, 18, ""), [{ type: "", amount: 14 }, { type: "fire", amount: 4 }]);
  assert.deepEqual(damageParts([{ flavor: "", total: 9 }], 9, "Ballistic"), [{ type: "Ballistic", amount: 9 }]);
});

test("damage reduction against weapons, resistance against energy, immunity to all of a kind", () => {
  const bodak = readDefenses(creatures.Bodak.system.specialQualities);
  // A slam with fire: DR 15 takes the physical part, fire resistance 20 the fire part.
  assert.deepEqual(reduceDamage([{ type: "", amount: 14 }, { type: "fire", amount: 4 }], bodak), {
    total: 0, stopped: [{ by: "damage reduction 15/silver", amount: 14 }, { by: "fire resistance 20", amount: 4 }],
  });
  // A silver weapon overcomes it: the card's Ignore DR.
  assert.equal(reduceDamage([{ type: "Slashing", amount: 20 }], bodak, { ignoreDR: true }).total, 20);
  // DR that names the weapon's kind does not stop it.
  assert.equal(reduceDamage([{ type: "Piercing", amount: 8 }], readDefenses(["damage reduction 5/piercing"])).total, 8);
  assert.equal(reduceDamage([{ type: "Slashing", amount: 8 }], readDefenses(["damage reduction 5/piercing"])).total, 3);
  assert.equal(reduceDamage([{ type: "Electricity", amount: 30 }], bodak).total, 0);
  assert.equal(reduceDamage([{ type: "Ballistic", amount: 12 }], readDefenses(["immune to ballistic damage and poison"])).total, 0);
});

test("a Tough hero's damage reduction and energy resistance, from talents", () => {
  const talents = Object.fromEntries(PACKS.talents().documents.filter((d) => d.system).map((d) => [d.name, d]));
  const classes = Object.fromEntries(PACKS.classes().documents.filter((d) => d.system).map((d) => [d.name, d]));
  const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: a === "con" ? 16 : 10 }]));
  const own = (n) => ({ type: "talent", name: n, system: talents[n].system, effects: talents[n].effects });
  const d = deriveCharacter({ abilities }, [{ type: "class", name: "Tough Hero", system: { ...classes["Tough Hero"].system, level: 6 } }, own("Damage Reduction 1/—"), own("Damage Reduction 2/—"), own("Fire Resistance")]);
  assert.deepEqual(d.defenses, { dr: [{ amount: 2, overcome: "—" }], resist: { fire: 3 }, immune: [] });
  assert.deepEqual(characterDefenses({}), { dr: [], resist: {}, immune: [] });
});

test("a weapon type's resistance: the first 5 of each bludgeoning hit ignored, then any damage reduction", () => {
  const malleable = readDefenses(["bludgeoning resistance 5", "increased reach"]);
  assert.deepEqual(malleable.resist, { bludgeoning: 5 });
  assert.deepEqual(reduceDamage([{ type: "Bludgeoning", amount: 8 }], malleable), { total: 3, stopped: [{ by: "bludgeoning resistance 5", amount: 5 }] });
  assert.equal(reduceDamage([{ type: "Piercing", amount: 8 }], malleable).total, 8);
  const both = { dr: [{ amount: 2, overcome: "—" }], resist: { bludgeoning: 5 }, immune: [] };
  assert.equal(reduceDamage([{ type: "Bludgeoning", amount: 10 }], both).total, 3);
});
