import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSpecies, isSpecies } from "../build/species.mjs";
import { buildFeats } from "../build/feats.mjs";

const { documents, problems } = buildSpecies();
const byName = Object.fromEntries(documents.filter((d) => d.type === "species").map((d) => [d.name, d.system]));
const featName = Object.fromEntries(buildFeats().documents.map((d) => [`Compendium.modern20.feats.Item.${d._id}`, d.name]));
const feats = (s) => s.bonusFeats.options.map((o) => featName[o.uuid]);

test("species build with every layout check passing", () => {
  assert.deepEqual(problems, []);
  assert.equal(Object.keys(byName).length, 18);
  assert.equal(isSpecies("Arcana/Shadowkind/Languages.md"), false);
  assert.equal(isSpecies("Arcana/Shadowkind/shadowkind.md"), false);
});

test("size, abilities, speed and languages are read", () => {
  const d = byName.Dwarf;
  assert.equal(d.size, "medium");
  assert.deepEqual(d.abilities, { str: 0, dex: 0, con: 2, int: 0, wis: 0, cha: -2 });
  assert.equal(d.speed, 20);
  assert.equal(d.levelAdjustment, 0);
  assert.deepEqual(d.languages.free, ["Read/Write Common (or local language)", "Read/Write Dwarven", "Speak Common (or local language)", "Speak Dwarven"]);
  assert.deepEqual(d.languages.other, ["Giant", "Gnome", "Goblin", "Orc", "Terran"]);
  assert.deepEqual(d.specialQualities.map((q) => q.name), ["Special Combat Bonuses", "Stability", "Darkvision", "Saving Throw Bonuses", "Skill Bonuses"]);
  assert.match(d.specialQualities.find((q) => q.name === "Skill Bonuses").description, /Craft \(mechanical\)/);   // the paragraph after the label
});

test("monstrous species have hit dice, natural armor and a level adjustment", () => {
  const o = byName.Ogre;
  assert.equal(o.size, "large");
  assert.equal(o.abilities.str, 10);
  assert.deepEqual(o.hitDice, { count: 4, die: 8 });
  assert.equal(o.naturalArmor, 5);
  assert.equal(o.levelAdjustment, 3);
  assert.equal(byName["Half-Dragon"].abilities.str, 8);   // "+8 Strength (+4 Strength if ... wings)"
});

test("bonus feats: granted, either/or, and chosen from a list", () => {
  assert.deepEqual(byName.Orc.bonusFeats.choose, 3);
  assert.deepEqual(feats(byName.Orc), ["Archaic Weapons Proficiency", "Armor Proficiency (light)", "Armor Proficiency (medium)"]);
  assert.equal(byName.Tiefling.bonusFeats.choose, 1);
  assert.deepEqual(feats(byName.Tiefling), ["Archaic Weapons Proficiency", "Simple Weapons Proficiency"]);
  const human = byName["Shadowkind Human"];
  assert.equal(human.bonusFeats.choose, 1);
  assert.ok(feats(human).includes("Exotic Firearms Proficiency") && feats(human).includes("Exotic Melee Weapon Proficiency"));
  assert.deepEqual(byName["Half-Dragon"].bonusFeats, { choose: 0, options: [] });
});
