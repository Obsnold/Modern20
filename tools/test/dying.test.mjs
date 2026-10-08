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

test("current hit points follow the maximum while at full, and start there; hurt, they move as far as it does", async () => {
  const { followMaximum } = await import("../../module/rules/damage.mjs");
  assert.equal(followMaximum(0, 0, 12), 12);      // a new character
  assert.equal(followMaximum(12, 12, 18), 18);    // at full, and a level gained
  assert.equal(followMaximum(0, 0, 12, { hurt: true }), null);   // damaged to 0 before its maximum was first seen: left at 0
  assert.equal(followMaximum(18, 18, 16), 16);    // at full, and Constitution lost
  assert.equal(followMaximum(7, 12, 18), 13);     // hurt, and a level gained: its hit points too
  assert.equal(followMaximum(15, 18, 12), 9);     // hurt, and Constitution lost: never above the new maximum
  assert.equal(followMaximum(11, 12, 10), 9);
  assert.equal(followMaximum(-3, 12, 14), -1);    // dying: more Constitution, more hit points
  assert.equal(followMaximum(20, 18, 16), 16);    // above the maximum (typed in): brought down to it
  assert.equal(followMaximum(12, 12, 12), null);  // nothing changed
});
