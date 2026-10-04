import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCreatureTypes, buildTemplates, abilityChanges } from "../build/creature-rules.mjs";
import { buildCreatures } from "../build/creatures.mjs";

const types = buildCreatureTypes(), templates = buildTemplates();
const type = Object.fromEntries(types.documents.filter((d) => d.type === "creatureType").map((d) => [d.name, d]));
const template = Object.fromEntries(templates.documents.filter((d) => d.type === "template").map((d) => [d.name, d]));

test("creature types and templates build with every check passing", () => {
  assert.deepEqual(types.problems, []);
  assert.deepEqual(templates.problems, []);
  assert.equal(Object.keys(type).length, 15);
  assert.equal(Object.keys(template).length, 17);
});

test("a creature type's Hit Die, attack progression and good saves", () => {
  const u = type.Undead.system;
  assert.equal(u.hitDie, 12);
  assert.deepEqual(u.baseAttack, { value: "1/2 of total Hit Dice", rate: 0.5 });
  assert.deepEqual(u.goodSaves.saves, ["will"]);
  assert.equal(type.Dragon.system.baseAttack.rate, 1);
  assert.deepEqual(type.Dragon.system.goodSaves.saves, ["fort", "ref", "will"]);
  assert.equal(type.Aberration.system.baseAttack.rate, 0.75);
  assert.deepEqual(type.Undead.system.sizes.find((s) => s.size === "medium"), {
    size: "medium", str: "12–13", dex: "10–11", con: "—", minimumHitDice: "1d12", extraHitPoints: "", slam: "1d6", bite: "1d6", claw: "1d4", gore: "1d3",
  });
});

test("a template's type, ability changes, lost scores and CR", () => {
  const z = template.Zombie.system;
  assert.equal(z.type, "undead");
  assert.deepEqual(z.abilities.changes, { str: 2, dex: -2 });
  assert.deepEqual(z.abilities.lost, ["con", "int"]);
  assert.equal(z.challengeRating.adjustment, null);   // by size, kept as text
  const v = template.Vampire.system;
  assert.equal(v.kind, "acquired");
  assert.equal(v.challengeRating.adjustment, 2);
  assert.deepEqual(v.abilities.changes, { str: 6, dex: 4, int: 2, wis: 2, cha: 4 });
  assert.equal(template["Half-Fiend"].system.type, "outsider");
  assert.equal(template.Replacement.system.challengeRating.adjustment, -1);
  assert.deepEqual(abilityChanges("Apply the following modifiers: –2 Str, +2 Con."), { str: -2, con: 2 });
  assert.deepEqual(abilityChanges("A skeleton gains Dexterity +2."), { dex: 2 });
});

test("creatures link to their type, and examples to their template", () => {
  const actors = buildCreatures().documents.filter((d) => d._key.startsWith("!actors!"));
  const by = Object.fromEntries(actors.map((a) => [a.name, a.system]));
  assert.equal(by.Wolf.type.uuid, `Compendium.modern20.creature-types.Item.${type.Animal._id}`);
  assert.equal(by["Human Zombie"].template, `Compendium.modern20.templates.Item.${template.Zombie._id}`);
  assert.equal(by.Wolf.template, "");
  assert.equal(by["Gargoyle Tough Hero 3"].type.uuid, `Compendium.modern20.creature-types.Item.${type["Magical Beast"]._id}`);
  // Only the werewolf's partial block, which prints no type, has none.
  assert.deepEqual(actors.filter((a) => !a.system.type.uuid).map((a) => a.name), ["Werewolf in Hybrid or Wolf Form (Human Strong Hero 5)"]);
});
