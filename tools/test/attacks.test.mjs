import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { readAttacks, attackRoll, damageRoll, attackRows } from "../../module/rules/attacks.mjs";
import { cardButtons } from "../../module/rules/rolls.mjs";

const brief = (line) => readAttacks(line).map((c) => c.map((a) => [a.name, a.count, a.bonuses.join("/"), a.kind, a.damage]));

test("an attack line's choices, and the attacks made together in each", () => {
  // The Retriever's full attack: four claws and a bite together, or its eye ray.
  assert.deepEqual(brief("+15 melee (2d4+10, 4 claws), +10 melee (1d6+5, bite) or +8 ranged touch (special, eye ray)"), [
    [["Claw", 4, "15", "melee", "2d4+10"], ["Bite", 1, "10", "melee", "1d6+5"]],
    [["Eye ray", 1, "8", "ranged", null]],
  ]);
  assert.deepEqual(brief("+2 melee (1d4, bite) and –3 melee (1d3, gore) and –3 melee (1, slam)"),
    [[["Bite", 1, "2", "melee", "1d4"], ["Gore", 1, "-3", "melee", "1d3"], ["Slam", 1, "-3", "melee", "1"]]]);
  assert.deepEqual(brief("+3 ranged (2d8, OICW assault rifle); or +3 ranged (2d8, laser pistol)").length, 2);
  assert.deepEqual(brief("+7 ranged touch (poison spittle)"), [[["Poison spittle", 1, "7", "ranged", null]]]);
  assert.deepEqual(brief("+0 ranged"), [[["Ranged", 1, "0", "ranged", null]]]);
});

test("iterative attacks, criticals, extra dice and nonlethal damage", () => {
  const [[axe]] = readAttacks("+21/+16/+11 melee (1d12+11/x3 plus 1d6 fire, +2 fiery blast greataxe)");
  assert.deepEqual(axe.bonuses, [21, 16, 11]);
  assert.deepEqual(axe.critical, { threat: 20, multiplier: 3 });
  assert.equal(attackRoll(axe, 1).formula, "1d20 + 16");
  // On a critical the weapon's dice and bonus are multiplied; the fire is not.
  assert.equal(damageRoll(axe, 3).formula, "(1d12+11) + (1d12+11) + (1d12+11) + 1d6[fire]");
  const [[sword]] = readAttacks("+21 melee (2d6+9/19–20, +3 greatsword)");
  assert.deepEqual(sword.critical, { threat: 19, multiplier: 2 });
  const [[fist]] = readAttacks("+0 melee (1d3–1 nonlethal, unarmed strike)");
  assert.equal(fist.damage, "1d3-1");
  assert.equal(damageRoll(fist).nonlethal, true);
  const [[bite]] = readAttacks("+13 melee (1d8+6 plus poison, bite)");
  assert.equal(bite.note, "poison");
});

test("nearly every printed attack line reads as attacks", () => {
  let lines = 0, read = 0;
  for (const c of PACKS.creatures().documents.filter((d) => d.system)) {
    for (const line of [c.system.attack, c.system.fullAttack]) {
      if (!line || line === "—") continue;
      lines++;
      // Attacks with a bonus, and a swarm's, which has none (automatic damage).
      const pieces = line.replace(/\([^)]*\)/g, "").split(/[,;]|\bor\b|\band\b/).filter((p) => /[+–-]\d|^\s*swarm\s*$/i.test(p)).length;
      if (readAttacks(line).flat().length === pieces) read++;
    }
  }
  assert.ok(read / lines > 0.99, `${read} of ${lines}`);
});

test("a missed attack offers no damage", () => {
  assert.deepEqual(cardButtons({ hit: { hit: false } }), []);
  assert.deepEqual(cardButtons({ hit: { hit: true } }).map((b) => b.kind), ["damage"]);
});

test("a swarm's attack is automatic damage: no attack roll, no critical", () => {
  const [[a]] = readAttacks("swarm (1d6 plus poison, swarm)");
  assert.equal(a.kind, "swarm");
  assert.deepEqual(a.bonuses, []);
  assert.equal(a.critical, null);
  assert.equal(damageRoll(a).formula, "1d6");
  assert.equal(a.note, "poison");
  assert.equal(attackRows("attack", [[a]])[0][0].kind, "automatic, no attack roll");
});
