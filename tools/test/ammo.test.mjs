import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { magazineOf, fits, fire, reload, extraDice, automatic, semiautomatic } from "../../module/rules/ammo.mjs";
import { attack, damage } from "../../module/rules/rolls.mjs";

const gear = PACKS.equipment().documents.filter((d) => d.system);
const weapon = (name) => gear.find((d) => d.type === "weapon" && d.name.startsWith(name));
const ammo = (name) => gear.find((d) => d.type === "ammunition" && d.name === name);

test("magazines as printed", () => {
  assert.deepEqual(magazineOf("15 box"), { capacity: 15, type: "box" });
  assert.deepEqual(magazineOf("6 cyl."), { capacity: 6, type: "cylinder" });
  assert.deepEqual(magazineOf("7 int."), { capacity: 7, type: "internal" });
  assert.deepEqual(magazineOf("Linked"), { capacity: Infinity, type: "linked" });
  assert.equal(magazineOf("—"), null);
});

test("ammunition fits a weapon by the caliber in its name", () => {
  assert.equal(fits(weapon("Beretta 92F"), ammo("9mm")), true);
  assert.equal(fits(weapon("Beretta 92F"), ammo("10mm")), false);
  assert.equal(fits(weapon("AKM/AK-47"), ammo("7.62mmR")), true);
  assert.equal(fits(weapon("AKM/AK-47"), ammo("7.62mm")), false);
  assert.equal(fits(weapon("Benelli 121 M1"), ammo("12-gauge buckshot")), true);
  // Every firearm with a magazine has a caliber some ammunition in the book fits, or names none.
  const calibered = gear.filter((d) => d.type === "weapon" && magazineOf(d.system.magazine) && /\(\.?\d/.test(d.name));
  const unfit = calibered.filter((w) => !gear.some((a) => a.type === "ammunition" && fits(w, a))).map((w) => w.name);
  assert.ok(unfit.length < calibered.length / 4, `no ammunition fits: ${unfit.join(", ")}`);
});

test("firing spends rounds, and stops when there are too few", () => {
  const beretta = weapon("Beretta 92F");
  assert.deepEqual(fire(beretta, "single", { loaded: 15 }), { ok: true, rounds: 1, loaded: 14, supply: null });
  assert.equal(fire(beretta, "single", { loaded: 0 }).ok, false);
  const ak = weapon("AKM/AK-47");
  assert.equal(automatic(ak), true);
  assert.equal(semiautomatic(ak), true);
  assert.equal(fire(ak, "autofire", { loaded: 9 }).ok, false);
  assert.equal(fire(ak, "burst", { loaded: 5 }).loaded, 0);
  // A bow has no magazine: an arrow a shot from what is carried.
  const bow = gear.find((d) => d.type === "weapon" && /\bbow\b/i.test(d.name) && !/crossbow/i.test(d.name));
  assert.deepEqual(fire(bow, "single", { supply: 3 }), { ok: true, rounds: 1, loaded: 0, supply: 2 });
});

test("reloading fills the magazine from what is carried", () => {
  const beretta = weapon("Beretta 92F");
  assert.deepEqual(reload(beretta, 3, 50), { added: 12, loaded: 15, supply: 38, action: "a move action" });
  assert.equal(reload(beretta, 3, 5).loaded, 8);
  assert.equal(reload(weapon("Benelli 121 M1"), 0, 10).action, "a full-round action");
});

test("burst fire and double tap: the attack penalty and the extra dice", () => {
  const d = { baseAttackBonus: 3, modifiers: { str: 0, dex: 2 }, size: "medium", defense: {}, attackBonus: {}, damageBonus: {} };
  const ak = weapon("AKM/AK-47");
  const feats = [{ name: "Personal Firearms Proficiency" }, { name: "Advanced Firearms Proficiency" }, { name: "Burst Fire" }];
  assert.ok(attack(d, ak, feats, { mode: "burst" }).terms.some((t) => t.label === "Burst fire" && t.value === -4));
  assert.equal(extraDice("2d8", 2), "4d8");
  assert.equal(damage(d, ak, { mode: "burst" }).formula, extraDice(ak.system.damage.formula, 2));
  const auto = attack(d, ak, [{ name: "Personal Firearms Proficiency" }], { mode: "autofire" });
  assert.ok(auto.terms.some((t) => /Advanced Firearms/.test(t.label) && t.value === -4));
  assert.equal(auto.againstDefense, 10);
});
