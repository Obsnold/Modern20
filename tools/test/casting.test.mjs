import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { casters, levelFor, casterFor, castingOf, slotFor, payFor, tableRow } from "../../module/rules/casting.mjs";

const classes = Object.fromEntries(PACKS.classes().documents.filter((d) => d.system).map((d) => [d.name, d]));
const spells = Object.fromEntries(PACKS.spells().documents.filter((d) => d.system).map((d) => [d.name, { ...d, type: "spell" }]));
const powers = Object.fromEntries(PACKS.powers().documents.filter((d) => d.system).map((d) => [d.name, { ...d, type: "power" }]));
const cls = (name, level) => ({ name, system: { ...classes[name].system, level } });
const scores = (s = {}) => ({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, ...s });

test("every caster's tables are read from its class page", () => {
  const kinds = Object.fromEntries(Object.values(classes).filter((c) => c.system.casting.kind).map((c) => [c.name, c.system.casting.kind]));
  assert.deepEqual(kinds, {
    "Archmage": "arcane", "Ecclesiarch": "divine", "Holy/Unholy Knight": "divine", "Mystic": "divine", "Psionic Agent": "psionic",
    "Techno Mage": "arcane", "Acolyte": "divine", "Battle Mind": "psionic", "Mage": "arcane", "Telepath": "psionic",
  });
  assert.deepEqual(tableRow(classes.Mage.system.casting.perDay, 10), [4, 4, 4, 3, 3, 2]);
  assert.deepEqual(classes["Psionic Agent"].system.casting.powerPoints, [2, 3, 4, 5, 8, 11, 16, 21, 26, 33]);
});

test("a Mage 3 with Int 16: spells a day with bonus spells, and the DC", () => {
  const [mage] = casters([cls("Mage", 3)], scores({ int: 16 }), 3);
  assert.deepEqual(mage.perDay, { 0: 4, 1: 3, 2: 2 });
  assert.equal(mage.casterLevel, 3);
  assert.equal(mage.prepared, true);
  const c = castingOf(spells["Magic Missile"] ?? Object.values(spells).find((s) => s.system.levels.some((l) => l.class === "Mage" && l.level === 1)), mage, 1, scores({ int: 16 }));
  assert.equal(c.dc, 14);
  assert.equal(c.meets, true);
});

test("a Mystic casts what it knows, by Charisma's bonus spells, and has no cure spells", () => {
  const [mystic] = casters([cls("Mystic", 1)], scores({ cha: 12, wis: 14 }), 1);
  assert.equal(mystic.spontaneous, true);
  assert.deepEqual(mystic.perDay, { 0: 3, 1: 3 });
  assert.deepEqual(mystic.known, { 0: 4, 1: 2 });
  assert.equal(mystic.ability, "wis");
  assert.equal(levelFor(spells["Cure Light Wounds"], mystic), null);
  const [acolyte] = casters([cls("Acolyte", 1)], scores(), 1);
  assert.equal(levelFor(spells["Cure Light Wounds"], acolyte), 1);
});

test("Archmage: Increased Spells/Day and Total Spellcasting", () => {
  const list = casters([cls("Mage", 5), cls("Archmage", 2)], scores(), 7);
  assert.equal(list.length, 1);
  assert.deepEqual(list[0].perDay, { 0: 6, 1: 4, 2: 3, 3: 1 });   // 4, 3, 2, 1 half again, rounded down
  assert.equal(list[0].casterLevel, 7);
  const [doubled] = casters([cls("Mage", 5), cls("Archmage", 4)], scores(), 9);
  assert.deepEqual(doubled.perDay, { 0: 8, 1: 6, 2: 4, 3: 2 });
});

test("a Telepath 4 with Cha 14: power points, free 0-level powers, and what a power costs", () => {
  const [t] = casters([cls("Telepath", 4)], scores({ cha: 14 }), 4);
  assert.equal(t.powerPoints, 10);   // 7, and 3 for Cha 14–15
  assert.equal(t.freeManifestations, 7);
  const power = Object.values(powers).find((p) => p.system.levels.some((l) => l.class === "Telepath" && l.level === 2));
  assert.equal(casterFor(power, [t]).level, 2);
  assert.equal(castingOf(power, t, 2, scores({ cha: 14 })).cost, 3);
  assert.deepEqual(payFor(0, 0, { points: 5, freeUsed: 7, freeManifestations: 7 }), { points: 1, free: false });
  assert.deepEqual(payFor(0, 0, { points: 5, freeUsed: 0, freeManifestations: 7 }), { points: 0, free: true });
  assert.equal(payFor(5, 3, { points: 4, freeUsed: 0, freeManifestations: 7 }), null);
});

test("a spontaneous caster spends a slot of the spell's level, or a higher one when those are gone", () => {
  const caster = { perDay: { 0: 3, 1: 2, 2: 1 } };
  assert.equal(slotFor(caster, 1, {}), 1);
  assert.equal(slotFor(caster, 1, { 1: 2 }), 2);
  assert.equal(slotFor(caster, 1, { 1: 2, 2: 1 }), null);
});

test("a Holy/Unholy Knight gets no bonus spells for a high score", () => {
  const [k] = casters([cls("Holy/Unholy Knight", 2)], scores({ wis: 18 }), 2);
  assert.deepEqual(k.perDay, { 0: 3, 1: 2 });
});
