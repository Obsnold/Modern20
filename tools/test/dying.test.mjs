import { test } from "node:test";
import assert from "node:assert/strict";
import { hpConditions, belowZeroSave, restHealing } from "../../module/rules/damage.mjs";

const on = (c) => Object.entries(c).filter(([, v]) => v).map(([k]) => k).sort();

test("the conditions hit points set, through dying, stable and awake", () => {
  assert.deepEqual(on(hpConditions(5)), []);
  assert.deepEqual(on(hpConditions(0)), ["disabled"]);
  assert.deepEqual(on(hpConditions(-3)), ["dying", "unconscious"]);
  assert.deepEqual(on(hpConditions(-3, { stable: true })), ["stable", "unconscious"]);
  assert.deepEqual(on(hpConditions(-3, { stable: true, awake: true })), ["disabled", "stable"]);
  assert.deepEqual(on(hpConditions(-10)), ["dead"]);
  assert.deepEqual(on(hpConditions(0, { destroyedAtZero: true })), ["dead"]);
});

test("each save below 0: dying, waking, recovering", () => {
  assert.deepEqual(belowZeroSave("dying", -4, true).stable, true);
  assert.deepEqual([belowZeroSave("dying", -4, false).value, belowZeroSave("dying", -4, false).stable], [-5, false]);
  assert.match(belowZeroSave("dying", -9, false).text, /dies/);
  assert.equal(belowZeroSave("waking", -4, true).awake, true);
  assert.equal(belowZeroSave("recovery", -4, true).recovering, true);
  assert.equal(belowZeroSave("recovery", -4, false).value, -5);
});

test("a character below 0 heals naturally only once recovering", () => {
  assert.equal(restHealing(3, -4), null);
  assert.equal(restHealing(3, -4, { recovering: true }), 3);
});
