import { test } from "node:test";
import assert from "node:assert/strict";
import { maximumLoad, carrying, carriedWeight } from "../../module/rules/load.mjs";
import { deriveCharacter } from "../../module/rules/character.mjs";

test("Table: Carrying Capacity, its tremendous Strengths, and sizes", () => {
  assert.deepEqual([maximumLoad(10), maximumLoad(14), maximumLoad(29)], [100, 175, 1400]);
  // Past 29: the score of the same ones digit in the 20s, ×4 for each ten.
  assert.deepEqual([maximumLoad(30), maximumLoad(35), maximumLoad(45)], [400 * 4, 800 * 4, 800 * 16]);
  const c = carrying(14, "medium", 0);
  assert.deepEqual([c.light, c.medium, c.heavy], [58, 116, 175]);   // as the table prints them
  assert.equal(carrying(10, "large", 0).heavy, 200);
  assert.equal(carrying(10, "small", 0).heavy, 75);
  assert.equal(carrying(null, "medium", 10), null);
});

test("a load's effects: speed by the tables, the Dexterity cap, the penalty, a heavy load's run", () => {
  const medium = carrying(10, "medium", 50), heavy = carrying(10, "medium", 90), over = carrying(10, "medium", 101);
  assert.deepEqual([medium.level, medium.speed(30), medium.speed(20), medium.maxDex, medium.penalty, medium.run], ["medium", 20, 15, 3, -3, 4]);
  assert.deepEqual([heavy.level, heavy.speed(30), heavy.speed(40), heavy.maxDex, heavy.penalty, heavy.run], ["heavy", 15, 20, 1, -6, 3]);
  assert.equal(over.speed(30), 0);
  assert.equal(carrying(10, "medium", 33).level, "light");
});

test("on a character: what is kept elsewhere is not carried; encumbered, it is slower, its Dex capped, its skills and attacks penalised", () => {
  const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: a === "dex" ? 18 : 10 }]));
  const gear = (lb, stored = false) => ({ type: "equipment", name: `${lb} lb.`, system: { weight: { value: `${lb} lb.`, lb }, stored } });
  assert.equal(carriedWeight([gear(20), gear(30, true)]), 20);
  // Strength 10: light up to 33 lb., medium up to 66.
  const light = deriveCharacter({ abilities }, [gear(20), gear(30, true)]);
  const loaded = deriveCharacter({ abilities }, [gear(20), gear(30)]);
  assert.equal(light.load.level, "light");
  assert.deepEqual([loaded.load.level, loaded.speed.value, loaded.speed.loaded], ["medium", 20, true]);
  // Dex 18 (+4) capped at +3 on Defense; Hide −3 more; an attack's −3 is the roll's.
  assert.equal(light.defense.value - loaded.defense.value, 1);
  const hide = (d) => d.skills.find((r) => r.key === "hide").total;
  assert.equal(hide(light) - hide(loaded), 3);
  assert.deepEqual(loaded.skills.find((r) => r.key === "hide").parts.at(-1), { label: "Load (medium)", value: -3 });
});
