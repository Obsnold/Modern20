import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEquipment } from "../build/equipment.mjs";
import { buildFeats } from "../build/feats.mjs";

const { documents, problems, skipped } = buildEquipment();
const items = documents.filter((d) => d.type !== "Item" && !d._key.startsWith("!folders!"));
const find = (name, srd) => items.find((d) => d.name === name && (!srd || d.flags.modern20.srd === srd));
const featName = Object.fromEntries(buildFeats().documents.map((d) => [`Compendium.modern20.feats.Item.${d._id}`, d.name]));

test("equipment builds with every check passing", () => {
  assert.deepEqual(problems, []);
  assert.deepEqual(skipped, ["Arcana/Equipment/GeneralEquipment.md (duplicate of Modern/Equipment/General/Clothing.md)"]);
  const names = items.map((d) => d.name);
  assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), []);
});

test("every item has a type, a category folder and a source page", () => {
  for (const d of items) {
    assert.ok(["weapon", "armor", "equipment", "ammunition"].includes(d.type), d.name);
    assert.ok(d.folder && d.system.category, d.name);
    assert.match(d.system.source.page, /^Compendium\.modern20\.rules\.JournalEntry\./);
  }
});

test("a firearm row is read, with its proficiency from the caption", () => {
  const s = find("Beretta 92F (9mm autoloader)").system;
  assert.equal(s.category, "Ranged Weapons: Handguns");
  assert.deepEqual(s.damage, { value: "2d6", formula: "2d6" });
  assert.deepEqual(s.rangeIncrement, { value: "40 ft.", ft: 40 });
  assert.equal(s.magazine, "15 box");
  assert.deepEqual(s.restriction, { value: "Lic (+1)", level: "lic", modifier: 1 });
  assert.equal(s.purchaseDC.dc, 16);
  assert.equal(featName[s.proficiency.uuid], "Personal Firearms Proficiency");
  assert.equal(s.melee, false);
  assert.match(s.description, /standard service pistol/);
});

test("a proficiency in parentheses comes off the name", () => {
  const javelin = find("Javelin").system;
  assert.equal(featName[javelin.proficiency.uuid], "Simple Weapons Proficiency");
  assert.equal(find("Flamethrower").system.proficiency.value, "");
});

test("footnotes are attached, including ones under the last table of a split group", () => {
  assert.deepEqual(find("Colt Python (.357 revolver)").system.notes, ["This mastercraft weapon grants a +1 bonus on attack rolls."]);
  assert.deepEqual(find("Quarterstaff", "Arcana/Equipment/MeleeWeapons.md").system.notes,
    ["See the description of this weapon for special rules.", "Double weapon."]);
});

test("armor and shields", () => {
  const vest = find("Concealable vest").system;
  assert.equal(vest.weightClass, "medium");
  assert.equal(vest.equipmentBonus, 4);
  assert.equal(vest.maxDex, 4);
  assert.equal(vest.armorPenalty, -3);
  const riot = find("Shield, riot").system;
  assert.equal(riot.weightClass, "shield");
  assert.equal(riot.equipmentBonus, 3);
  assert.equal(riot.arcaneSpellFailure, "30%");
});

test("variants share their parent's description; ammunition keeps its quantity", () => {
  assert.equal(find("Coat").flags.modern20.section, "Outerwear");
  assert.equal(find("Mace, light").flags.modern20.section, null);
  assert.equal(find("Flail, light").flags.modern20.section, "Flail, Light and Heavy");
  const nine = find("9mm");
  assert.equal(nine.type, "ammunition");
  assert.equal(nine.system.quantity, 50);
});
