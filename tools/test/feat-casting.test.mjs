import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { featCasting, eligible, featCaster, ARCANA_TALENTS } from "../../module/rules/feat-casting.mjs";

const feats = Object.fromEntries(PACKS.feats().documents.filter((d) => d.system).map((d) => [d.name, d]));
const powers = PACKS.powers().documents.filter((d) => d.system);
const spells = PACKS.spells().documents.filter((d) => d.system);

test("Wild Talent: any 0-level power in d20 Modern's, one of nine in Urban Arcana's", () => {
  const modern = featCasting(feats["Wild Talent (Modern)"], "wild-talent");
  const arcana = featCasting(feats["Wild Talent (Arcana)"], "wild-talent");
  assert.equal(modern.count, 1);
  const zero = powers.filter((p) => eligible(modern, p)).map((p) => p.name);
  assert.ok(zero.includes("Daze") && zero.includes("Valor"));
  assert.ok(!zero.includes("Brain Lock"));
  assert.deepEqual(powers.filter((p) => eligible(arcana, p)).map((p) => p.name).sort(), [...ARCANA_TALENTS].sort());
});

test("Magical Heritage: three 0-level arcane spells", () => {
  const rule = featCasting(feats["Magical Heritage"], "magical-heritage");
  assert.equal(rule.count, 3);
  const ok = spells.filter((s) => eligible(rule, s)).map((s) => s.name);
  assert.ok(ok.length >= 10);
  assert.ok(!ok.includes("Magic Missile"));
  assert.equal(featCasting(feats.Alertness, "alertness"), null);
});

test("as casters: Wild Talent 3 a day at manifester level 1 or higher; Magical Heritage once a day per arcane caster level", () => {
  const wild = featCasting(feats["Wild Talent (Modern)"], "wild-talent");
  assert.deepEqual([featCaster(wild, "Wild Talent", []).uses, featCaster(wild, "Wild Talent", []).casterLevel], [3, 1]);
  assert.equal(featCaster(wild, "Wild Talent", [{ kind: "psionic", casterLevel: 4 }]).casterLevel, 4);
  const heritage = featCasting(feats["Magical Heritage"], "magical-heritage");
  assert.equal(featCaster(heritage, "Magical Heritage", []).uses, 1);
  const mage = featCaster(heritage, "Magical Heritage", [{ kind: "arcane", casterLevel: 3 }, { kind: "divine", casterLevel: 5 }]);
  assert.deepEqual([mage.uses, mage.casterLevel, mage.ability], [3, 3, "int"]);
});
