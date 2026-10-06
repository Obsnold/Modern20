import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { deriveCharacter } from "../../module/rules/character.mjs";
import { hitDiceCount, goodSave, poorSave, baseAttack, classLevels, creatureParts } from "../../module/rules/creature.mjs";
import { applyEffects } from "../../module/rules/effects.mjs";

const docs = (p) => PACKS[p]().documents.filter((d) => d.system);
const types = Object.fromEntries(docs("creature-types").map((d) => [`Compendium.modern20.creature-types.Item.${d._id}`, d]));
const typeNamed = Object.fromEntries(docs("creature-types").map((d) => [d.name, d]));
const classes = Object.fromEntries(docs("classes").map((d) => [d.name, d]));
const featDocs = Object.fromEntries(docs("feats").map((d) => [d.name, d]));
const templates = Object.fromEntries(docs("templates").map((d) => [d.name, d]));
const creatures = docs("creatures");
const named = Object.fromEntries(creatures.map((d) => [d.name, d]));
const byUuid = Object.fromEntries(creatures.map((d) => [`Compendium.modern20.creatures.Actor.${d._id}`, d]));

/** A creature built from its printed scores, its type at its Hit Dice, its class levels and its feats' effects. */
function build(printed, { hd = hitDiceCount(printed.system.hitDice), type = types[printed.system.type.uuid], levels = {}, extra = [] } = {}) {
  const s = printed.system;
  const system = applyEffects({ system: { size: s.size, abilities: Object.fromEntries(Object.entries(s.abilities).map(([a, v]) => [a, { value: v }])) } },
    s.feats.flatMap((f) => featDocs[f.name]?.effects ?? [])).system;
  return deriveCharacter(system, [
    { type: "creatureType", name: type.name, system: { ...type.system, count: hd } },
    ...Object.entries(levels).map(([n, l]) => ({ type: "class", name: n, system: { ...classes[n].system, level: l } })),
    ...extra,
  ]);
}

test("the table's progressions: good and poor saves, and the three attack columns", () => {
  assert.deepEqual([1, 2, 3, 10, 20].map(goodSave), [2, 3, 3, 7, 12]);
  assert.deepEqual([1, 2, 3, 10, 20].map(poorSave), [0, 0, 1, 3, 6]);
  assert.deepEqual([1, 4, 8, 20].map((h) => baseAttack(h, 0.75)), [0, 3, 6, 15]);
  assert.deepEqual([0.5, 1, 6].map((h) => baseAttack(h, 1)), [1, 1, 6]);   // "1 or less": +1
  assert.deepEqual([1, 5, 12].map((h) => baseAttack(h, 0.5)), [0, 2, 6]);
  assert.deepEqual([hitDiceCount("2d8+4"), hitDiceCount("1/2 d8"), hitDiceCount("—")], [2, 0.5, null]);
});

test("a wolf rebuilt from Animal ×2 is the wolf the book prints", () => {
  const d = build(named.Wolf);
  assert.equal(d.level, 2);
  assert.equal(d.baseAttackBonus, 1);
  assert.deepEqual(d.saves, { fort: 5, ref: 5, will: 1 });
  assert.equal(d.hitPoints.max, 13);   // 2d8: an average of 9, and Con +2 a die
  assert.equal(d.creatureType, "Animal");
});

test("a construct's extra hit points by size, and a fraction of a Hit Die", () => {
  const golem = named["Chemical Golem"];
  assert.equal(build(golem).hitPoints.max, golem.system.hp.max);   // 9d10, Large: +20
  assert.equal(build(named.Octopus).hitPoints.max, 2);               // 1/2 d8
});

test("most plain creatures rebuild to their printed attack bonus and hit points", () => {
  let n = 0, bab = 0, hp = 0;
  for (const c of creatures.filter((d) => !d.system.example.classed && !d.system.template && d.system.type.uuid)) {
    if (hitDiceCount(c.system.hitDice) === null || /plus/.test(c.system.hitDice)) continue;
    const d = build(c);
    n++;
    if (d.baseAttackBonus === c.system.baseAttackBonus.bonus) bab++;
    if (d.hitPoints.max === c.system.hp.max) hp++;
  }
  // What the engine reproduces today; the rest are feats it does not apply yet and the book's own slips.
  assert.equal(n, 253);
  assert.ok(bab >= 239, `${bab} of ${n} attack bonuses`);
  assert.ok(hp >= 235, `${hp} of ${n} hit point totals`);
});

test("classed creatures: Hit Dice and class levels add up; one of 1 Hit Die advances by class alone", () => {
  const gargoyle = build(named.Gargoyle, { levels: { "Tough Hero": 3 } });
  assert.equal(gargoyle.level, 7);
  assert.equal(gargoyle.baseAttackBonus, named["Gargoyle Tough Hero 3"].system.baseAttackBonus.bonus);
  const drow = build(named.Drow, { levels: { "Fast Hero": 2 } });
  assert.equal(drow.replacedHitDice, true);
  assert.equal(drow.level, 2);
  assert.equal(drow.baseAttackBonus, named["Drow Fast Hero 2"].system.baseAttackBonus.bonus);
});

test("most classed examples rebuild to their printed attack bonus from their base, type and class levels", () => {
  const levelsIn = (name) => classLevels(name, Object.keys(classes));
  let n = 0, ok = 0;
  const off = [];
  for (const c of creatures.filter((d) => d.system.example.classed && d.system.example.base.uuid)) {
    const base = byUuid[c.system.example.base.uuid];
    const d = build(c, { hd: hitDiceCount(base.system.hitDice), type: types[base.system.type.uuid], levels: levelsIn(c.name) });
    n++;
    if (d.baseAttackBonus === c.system.baseAttackBonus.bonus) ok++; else off.push(c.name);
  }
  assert.equal(n, 33);
  assert.equal(ok, n - 4);
  // The four the book prints otherwise: the Skunk Ape keeps the 1 Hit Die its class levels should replace, and
  // three are one off.
  assert.deepEqual(off.sort(), ["Jumping Jack Fast Hero 9", "Minotaur Strong Hero 3", "Skunk Ape Dedicated Hero 3/Acolyte 2", "Tooth Fairy Fast Hero 3/Smart Hero 1"]);
});

test("a template changes abilities, takes away the scores it says, and the creature's type", () => {
  const zombie = { type: "template", name: "Zombie", system: templates.Zombie.system };
  const d = deriveCharacter({ abilities: { str: { value: 10 }, dex: { value: 10 }, con: { value: 12 }, int: { value: 10 }, wis: { value: 10 }, cha: { value: 10 } } },
    [{ type: "creatureType", name: "Humanoid", system: { ...typeNamed.Humanoid.system, count: 2 } }, zombie]);
  assert.deepEqual([d.scores.str, d.scores.dex, d.scores.con, d.scores.int], [12, 8, null, null]);
  assert.equal(d.creatureType, "undead");
});

test("a character built from a printed creature: its parts, and the numbers they give", () => {
  const parts = creatureParts(named["Gargoyle Tough Hero 3"], { base: named.Gargoyle, classNames: Object.keys(classes) });
  assert.deepEqual(parts.classes, { "Tough Hero": 3 });
  assert.deepEqual(parts.type, { uuid: named.Gargoyle.system.type.uuid, count: hitDiceCount(named.Gargoyle.system.hitDice) });
  assert.equal(parts.system.naturalArmor, 4);
  assert.ok(parts.items.some((i) => i.choice === "bite"));
  const type = types[parts.type.uuid];
  const d = deriveCharacter(parts.system, [
    { type: "creatureType", name: type.name, system: { ...type.system, count: parts.type.count } },
    ...Object.entries(parts.classes).map(([n, l]) => ({ type: "class", name: n, system: { ...classes[n].system, level: l } })),
  ]);
  assert.equal(d.baseAttackBonus, named["Gargoyle Tough Hero 3"].system.baseAttackBonus.bonus);
  assert.equal(d.size, "medium");
  assert.deepEqual(classLevels("Tooth Fairy Fast Hero 3/Smart Hero 1", Object.keys(classes)), { "Fast Hero": 3, "Smart Hero": 1 });
});

test("a character built from a creature owes no action points or Wealth checks for levels it already has", () => {
  const parts = creatureParts(named["Gargoyle Tough Hero 3"], { base: named.Gargoyle, classNames: Object.keys(classes) });
  assert.equal(parts.system.actionPoints.granted, 3);
  assert.equal(parts.system.wealth.regainedLevel, hitDiceCount(named.Gargoyle.system.hitDice) + 3);
  const drow = creatureParts(named["Drow Fast Hero 2"], { base: named.Drow, classNames: Object.keys(classes) });
  assert.equal(drow.system.wealth.regainedLevel, 2);   // its 1 Hit Die replaced by its class levels
});
