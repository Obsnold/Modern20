import { test } from "node:test";
import assert from "node:assert/strict";
import { listPages, readPage } from "../srd/reader.mjs";
import { CONDITIONS, statusEffects, creatureConditions } from "../../module/rules/conditions.mjs";
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
  for (const e of statusEffects()) for (const c of e.system.changes) {
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

test("a creature's conditions, as changes to its printed totals", () => {
  const wolf = { str: 13, dex: 15, con: 15, int: 2, wis: 12, cha: 6 };
  const of = (id) => creatureConditions(CONDITIONS[id].changes ?? [], wolf, (name) => ({ Hide: "dex", Listen: "wis" })[name] ?? null);
  // Shaken: −2 on attacks, saves and skills; nothing on Defense.
  const shaken = of("shaken");
  assert.deepEqual([shaken.attack("melee"), shaken.save("will"), shaken.skill("Listen"), shaken.defense()], [-2, -2, -2, 0]);
  // Fatigued: −2 Str and Dex, so Str 13 → 11 and Dex 15 → 13: −1 on melee attacks and damage, Reflex, Defense and Dex skills.
  const fatigued = of("fatigued");
  assert.deepEqual([fatigued.attack("melee"), fatigued.damage("melee"), fatigued.save("ref"), fatigued.save("fort"), fatigued.defense(), fatigued.skill("Hide"), fatigued.initiative()], [-1, -1, -1, 0, -1, -1, -1]);
  // Flat-footed: its +2 Dexterity bonus to Defense gone.
  assert.equal(of("flatFooted").defense(), -2);
  // A creature with a Dexterity penalty keeps it when flat-footed.
  assert.equal(creatureConditions(CONDITIONS.flatFooted.changes, { dex: 8 }).defense(), 0);
  // A nonability (an ooze's Int) changes nothing.
  assert.equal(creatureConditions(CONDITIONS.fatigued.changes, { str: null, dex: 10 }).attack("melee"), 0);
});
