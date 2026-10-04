import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClasses } from "../build/classes.mjs";
import { buildCreatures } from "../build/creatures.mjs";
import { deriveCharacter } from "../../module/rules/character.mjs";
import { applyEffects, FEAT_EFFECTS } from "../../module/rules/effects.mjs";
import { buildFeats } from "../build/feats.mjs";

const featDocs = Object.fromEntries(buildFeats().documents.filter((d) => d.type === "feat").map((d) => [d.name, d]));
/** A character's system data with its feats' effects applied, as Foundry applies them. */
const withFeats = (system, featNames) => applyEffects({ system }, featNames.flatMap((n) => featDocs[n]?.effects ?? [])).system;

const classes = Object.fromEntries(buildClasses().documents.filter((d) => d.type === "class").map((d) => [d.name, d]));
const printed = Object.fromEntries(buildCreatures().documents.filter((d) => d.system).map((d) => [d.name, d.system]));

/** A character with these class levels and feats, and the printed block's ability scores. */
function build(name, levels) {
  const c = printed[name];
  const items = [
    ...Object.entries(levels).map(([n, l]) => ({ type: "class", name: n, system: { ...classes[n].system, level: l } })),
    ...c.feats.map((f) => ({ type: "feat", name: f.name, system: {} })),
  ];
  const abilities = Object.fromEntries(Object.entries(c.abilities).map(([a, v]) => [a, { value: v }]));
  return { d: deriveCharacter(withFeats({ abilities }, c.feats.map((f) => f.name)), items), c };
}

test("Dr. Astrid Kolgrim, Smart Hero 4/Field Scientist 7", () => {
  const { d, c } = build("Dr. Astrid Kolgrim", { "Smart Hero": 4, "Field Scientist": 7 });
  assert.equal(d.level, 11);
  assert.equal(d.baseAttackBonus, c.baseAttackBonus.bonus);
  assert.equal(d.grapple, c.grapple);
  assert.equal(d.initiative, c.initiative);
  assert.deepEqual([d.saves.fort, d.saves.will], [c.saves.fort, c.saves.will]);
  assert.equal(d.saves.ref, c.saves.ref - 1);   // the book prints +8: class +5, Dex +0, Lightning Reflexes +2 make +7
  assert.equal(d.defense.class, 3);              // "+3 class"
  assert.equal(d.reputation, c.reputation);     // class +4 (her occupation is not an item here)
});

test("Anastasia Markova, Fast Hero 4/Dedicated Hero 5/Charismatic Hero 9", () => {
  const { d, c } = build("Anastasia Markova", { "Fast Hero": 4, "Dedicated Hero": 5, "Charismatic Hero": 9 });
  assert.equal(d.level, 18);
  assert.equal(d.baseAttackBonus, c.baseAttackBonus.bonus);
  assert.equal(d.grapple, c.grapple);
  assert.equal(d.initiative, c.initiative);      // Dex +3, Improved Initiative +4
  assert.deepEqual([d.saves.fort, d.saves.ref], [c.saves.fort, c.saves.ref]);
  assert.equal(d.saves.will, c.saves.will - 2);  // the book prints +15: class +9, Wis +4, Iron Will +2 make +15 - 2
  assert.equal(d.defense.class, 11);             // "+11 class"
  assert.equal(d.reputation, c.reputation);      // class +7, Renown +3
});

test("Black Feather's attack bonus and grapple (the book's saves do not add up)", () => {
  // Tough 2/Fast 3/Charismatic 3/Wildlord 6: the class rows sum to Fort +10, Ref +6, Will +7 before
  // abilities and feats; the book prints Fort +7, Ref +10, Will +7.
  const { d, c } = build("Black Feather", { "Tough Hero": 2, "Fast Hero": 3, "Charismatic Hero": 3, Wildlord: 6 });
  assert.equal(d.level, 14);
  assert.equal(d.baseAttackBonus, c.baseAttackBonus.bonus);
  assert.equal(d.grapple, c.grapple);
  assert.equal(d.initiative, c.initiative);
});

test("Defense, size and armor", () => {
  const items = [
    { type: "class", name: "Strong Hero", system: { ...classes["Strong Hero"].system, level: 1 } },
    { type: "species", name: "Halfling", system: { size: "small", abilities: { dex: 2, str: -2 }, naturalArmor: 0 } },
    { type: "armor", name: "Vest", system: { equipped: true, equipmentBonus: 4, maxDex: 2, armorPenalty: -3 } },
  ];
  const d = deriveCharacter({ abilities: { str: { value: 12 }, dex: { value: 16 }, con: { value: 10 } } }, items);
  assert.equal(d.scores.dex, 18);                 // the species adds its +2
  assert.equal(d.size, "small");
  // 10 + class 1 + Dex 2 (the vest's limit, not +4) + size 1 + armor 4
  assert.deepEqual([d.defense.value, d.defense.touch, d.defense.flatFooted], [18, 14, 16]);
  assert.equal(d.grapple, 1 + 0 - 4);             // BAB +1, Str 10 (12 - 2), small -4
});

test("hit points: the first level's maximum, then rolls or the average", () => {
  const sh = classes["Strong Hero"].system;
  const two = (rolls) => deriveCharacter(withFeats({ abilities: { con: { value: 14 } } }, ["Toughness"]), [{ type: "class", name: "Strong Hero", system: { ...sh, level: 2, hitPoints: rolls } }]);
  assert.deepEqual(two([8, 3]).hitPoints, { max: 8 + 2 + 3 + 2 + 3, estimated: false });
  assert.deepEqual(two([]).hitPoints, { max: 8 + 2 + 5 + 2 + 3, estimated: true });   // d8: 8, then 5
});

test("every fixed-bonus feat in the pack carries its effect, transferred to its owner", () => {
  for (const [name, changes] of Object.entries(FEAT_EFFECTS)) {
    const e = featDocs[name]?.effects;
    assert.equal(e?.length, 1, name);
    assert.equal(e[0].transfer, true);
    assert.deepEqual(e[0].changes.map((c) => [c.key, Number(c.value), c.mode]), changes.map(([k, v]) => [k, v, 2]));
    assert.ok(e[0]._key.startsWith(`!items.effects!${featDocs[name]._id}.`));
  }
  assert.deepEqual(featDocs.Alertness.effects, []);
});

test("skills: class skills by class and occupation, specialties, totals and the rank cap", () => {
  const strong = { type: "class", name: "Strong Hero", system: { ...classes["Strong Hero"].system, level: 2 } };
  const d = deriveCharacter({
    abilities: { str: { value: 14 }, int: { value: 12 }, dex: { value: 10 } },
    skills: { climb: { ranks: 5, misc: 1 }, hide: { ranks: 2.5, misc: 0 } },
    specialtySkills: [{ skill: "knowledge", specialty: "tactics", ranks: 3, misc: 0 }, { skill: "knowledge", specialty: "history", ranks: 1, misc: 0 }],
    occupationSkills: ["Knowledge (history)"],
  }, [strong, { type: "armor", name: "Vest", system: { equipped: true, equipmentBonus: 2, armorPenalty: -2, maxDex: null } }]);
  const row = (key, specialty = "") => d.skills.find((s) => s.key === key && s.specialty === specialty);
  assert.deepEqual([row("climb").classSkill, row("climb").total, row("climb").maxRanks], [true, 5 + 2 + 1 - 2, 5]);   // ranks, Str, misc, armor
  assert.deepEqual([row("hide").classSkill, row("hide").maxRanks, row("hide").overMax], [false, 2.5, false]);
  assert.equal(row("knowledge", "tactics").classSkill, true);       // the Strong hero lists Knowledge (tactics)
  assert.equal(row("knowledge", "history").classSkill, true);       // from the occupation
  assert.equal(row("decipherScript").usable, false);                // trained only, no ranks
  assert.equal(row("climb").usable, true);
  assert.equal(d.skills.filter((s) => s.key === "craft").length, 0); // no Craft specialty taken yet
});
