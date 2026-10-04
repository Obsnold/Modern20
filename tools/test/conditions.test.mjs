import { test } from "node:test";
import assert from "node:assert/strict";
import { listPages, readPage } from "../srd/reader.mjs";
import { CONDITIONS, statusEffects } from "../../module/rules/conditions.mjs";
import { applyEffects } from "../../module/rules/effects.mjs";
import { deriveCharacter } from "../../module/rules/character.mjs";
import { ACTOR_MODELS } from "../../module/data/models.mjs";
import { initial, obj } from "../../module/data/schema.mjs";

test("every condition page has a condition, and every condition a page", () => {
  const titles = listPages().filter((p) => /^Modern\/Conditions\/[A-Z]/.test(p)).map((p) => readPage(p).title).sort();
  assert.deepEqual(Object.values(CONDITIONS).map((c) => c.name).sort(), titles);
});

test("every condition's changes add to a bonus the character has", () => {
  const bonuses = initial(obj(ACTOR_MODELS.character)).bonuses;
  for (const e of statusEffects()) for (const c of e.changes) {
    const path = c.key.replace(/^system\.bonuses\./, "").split(".");
    assert.equal(typeof path.reduce((o, k) => o?.[k], bonuses), "number", `${e.name}: ${c.key}`);
  }
});

test("shaken, fatigued and stunned change the numbers they print", () => {
  const system = { ...initial(obj(ACTOR_MODELS.character)), abilities: { str: { value: 14 }, dex: { value: 14 }, con: { value: 10 }, int: { value: 10 }, wis: { value: 10 }, cha: { value: 10 } } };
  const effect = (id) => statusEffects().find((e) => e.id === id);
  const plain = deriveCharacter(system, []);
  const shaken = deriveCharacter(applyEffects({ system }, [effect("shaken")]).system, []);
  assert.equal(shaken.saves.will, plain.saves.will - 2);
  assert.deepEqual(shaken.attackBonus, { melee: -2, ranged: -2 });
  assert.equal(shaken.skills.find((s) => s.key === "climb").total, plain.skills.find((s) => s.key === "climb").total - 2);
  const fatigued = deriveCharacter(applyEffects({ system }, [effect("fatigued")]).system, []);
  assert.deepEqual([fatigued.scores.str, fatigued.scores.dex], [12, 12]);
  const stunned = deriveCharacter(applyEffects({ system }, [effect("stunned")]).system, []);
  assert.equal(stunned.defense.value, plain.defense.value - 2 - 2);   // –2, and the +2 Dex bonus is lost
});
