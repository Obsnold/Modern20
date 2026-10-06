import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { unarmedRules, unarmedWeapon, unarmedTerms, canHold } from "../../module/rules/unarmed.mjs";
import { rulesFor } from "../../module/rules/feats.mjs";
import { attack, damage, critical } from "../../module/rules/rolls.mjs";
import { deriveCharacter, armoredSpeed } from "../../module/rules/character.mjs";

const rules = (...ids) => ids.map(rulesFor);
const d = { baseAttackBonus: 2, modifiers: { str: 3, dex: 1 }, size: "medium", defense: {}, attackBonus: {}, damageBonus: {} };
const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 10 }]));

test("an unarmed strike: 1d3 nonlethal, lethal at −4", () => {
  const u = unarmedRules([]);
  const w = unarmedWeapon(u);
  assert.equal(damage(d, w).formula, "1d3 + 3");
  assert.equal(w.system.damageType, "nonlethal");
  assert.deepEqual(unarmedTerms(u, { lethal: true }).map((t) => t.value), [0, -4]);
  assert.equal(attack(d, w, []).formula, "1d20 + 2 + 3");
});

test("the unarmed feats: Brawl's die and bonus, Combat Martial Arts' lethal 1d4 and its criticals", () => {
  assert.deepEqual([unarmedRules(rules("brawl")).nonlethalDie, unarmedRules(rules("brawl")).attack], ["1d6", 1]);
  assert.deepEqual([unarmedRules(rules("brawl", "improved-brawl")).nonlethalDie, unarmedRules(rules("brawl", "improved-brawl")).attack], ["1d8", 2]);
  const cma = unarmedRules(rules("combat-martial-arts", "improved-combat-martial-arts", "advanced-combat-martial-arts"));
  assert.equal(cma.lethalAllowed, true);
  assert.deepEqual(unarmedTerms(cma, { lethal: true }).map((t) => t.value), [0, 0]);
  const w = unarmedWeapon(cma, { lethal: true });
  assert.equal(w.system.damageType, "");
  assert.deepEqual(critical(w.system.critical), { threat: 19, multiplier: 3 });
  // Brawl and Combat Martial Arts together: Brawl's bigger die for nonlethal, the 1d4 for lethal.
  const both = unarmedRules(rules("brawl", "combat-martial-arts"));
  assert.deepEqual([both.nonlethalDie, both.lethalDie], ["1d6", "1d4"]);
  assert.equal(unarmedRules(rules("streetfighting")).streetfighting, "1d4");
});

test("a hold on a target no more than two sizes larger", () => {
  assert.equal(canHold("medium", "large"), true);
  assert.equal(canHold("medium", "huge"), false);
});

test("speed: the species', talents', and armor's", () => {
  assert.equal(deriveCharacter({ abilities }, []).speed.value, 30);
  const talent = (n) => { const t = PACKS.talents().documents.find((x) => x.name === n); return { type: "talent", name: n, system: t.system, effects: t.effects }; };
  const fast = deriveCharacter({ abilities }, [talent("Increased Speed"), talent("Improved Increased Speed")]);
  assert.equal(fast.speed.base, 40);
  const armor = PACKS.equipment().documents.find((x) => x.name === "Breastplate");
  const slowed = deriveCharacter({ abilities }, [{ type: "armor", name: armor.name, system: { ...armor.system, equipped: true } }]);
  assert.deepEqual([slowed.speed.base, slowed.speed.value, slowed.speed.armored], [30, 20, true]);
  assert.equal(armoredSpeed(20, armor), 15);
  assert.equal(armoredSpeed(40, armor), 30);
  assert.equal(deriveCharacter({ abilities, baseSpeed: 50 }, []).speed.value, 50);
});
