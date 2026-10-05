import { test } from "node:test";
import assert from "node:assert/strict";
import { applyHit, hpState, failedMassive } from "../../module/rules/damage.mjs";

const hero = (value, temp = 0) => ({ hp: { value, temp, max: 20 }, threshold: 14, type: "" });

test("hit points and the condition they leave", () => {
  assert.deepEqual([1, 0, -1, -9, -10, -15].map((v) => hpState(v)), [null, "disabled", "dying", "dying", "dead", "dead"]);
  assert.equal(hpState(0, { destroyedAtZero: true }), "dead");
  assert.equal(applyHit({ ...hero(5), type: "undead", threshold: null }, 5).state, "dead");
});

test("temporary hit points go first", () => {
  const r = applyHit(hero(10, 4), 6);
  assert.deepEqual(r.hp, { value: 8, temp: 0 });
});

test("massive damage: over the threshold and still standing calls for a save", () => {
  assert.deepEqual(applyHit(hero(20), 15).save, { dc: 15, kind: "massive" });
  assert.equal(applyHit(hero(20), 14).save, null);   // exceeds: equal is not enough
  assert.equal(applyHit(hero(10), 15).save, null);   // already down
  assert.equal(applyHit({ ...hero(40), type: "Construct" }, 30).save, null);
  assert.equal(failedMassive(5), -1);
  assert.equal(failedMassive(-3), -3);
});

test("nonlethal damage leaves hit points alone, and at the threshold calls for a save", () => {
  const r = applyHit(hero(10), 14, { nonlethal: true });
  assert.deepEqual(r.hp, { value: 10, temp: 0 });
  assert.deepEqual(r.save, { dc: 15, kind: "nonlethal" });
  assert.equal(applyHit(hero(10), 13, { nonlethal: true }).save, null);
});

test("healing stops at full, and brings a disabled or dying character back", () => {
  assert.equal(applyHit(hero(15), 10, { healing: true }).hp.value, 20);
  const r = applyHit(hero(-4), 6, { healing: true });
  assert.deepEqual([r.hp.value, r.state], [2, null]);
});
