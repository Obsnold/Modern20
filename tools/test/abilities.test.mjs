import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { attack, damage, criticalDamage } from "../../module/rules/rolls.mjs";
import { deriveCharacter } from "../../module/rules/character.mjs";
import { abilityAsks, armorAbilities, keenThreat, blastDice, abilitiesDC } from "../../module/rules/abilities.mjs";
import { purchaseDC, qualityText } from "../../module/rules/quality.mjs";
import { label } from "../../module/sheets/edit-form.mjs";

const fx = Object.fromEntries(PACKS["fx-items"]().documents.filter((d) => d.system).map((d) => [d.name, d]));
const gear = Object.fromEntries(PACKS.equipment().documents.filter((d) => d.system).map((d) => [d.name, d]));
const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 10 }]));
const d = deriveCharacter({ abilities }, []);
const term = (spec, l) => spec.terms.find((t) => t.label === l)?.value;
const withAbilities = (item, list) => ({ ...item, system: { ...item.system, abilities: list.map((a) => (Array.isArray(a) ? { id: a[0], choice: a[1] } : { id: a, choice: "" })) } });

test("Flaming: +1d6 fire on every hit, typed for resistance, and rolled once on a critical", () => {
  const spec = damage(d, fx["Flaming Machete"]);
  assert.equal(term(spec, "Flaming (fire)"), "1d6");
  assert.match(spec.formula, /\+ 1d6\[fire\]$/);
  assert.equal(term(spec, "Enhancement"), 1);
  const crit = criticalDamage(spec, 2);
  assert.equal((crit.formula.match(/1d6\[fire\]/g) ?? []).length, 1);
  assert.equal((crit.formula.match(/\(1d6 \+ 1\)/g) ?? []).length, 2);
});

test("Holy and Bane against their foes, as the attack ticks it: +2d6, and bane's +2 on the attack and damage", () => {
  const crossbow = fx["Holy Crossbow"];
  assert.deepEqual(abilityAsks(crossbow.system).map((a) => a.name), ["against_holy"]);
  assert.equal(term(damage(d, crossbow), "Holy"), undefined);
  assert.equal(term(damage(d, crossbow, { ticked: { against_holy: true } }), "Holy"), "2d6");
  const scythe = fx["Crescent of the Moon"];
  assert.match(abilityAsks(scythe.system)[0].label, /^The target is lycanthropes \(Bane: \+2d6, \+2 attack and damage\)/);
  assert.equal(term(attack(d, scythe, [], { against_bane: true }), "Bane (lycanthropes)"), 2);
  assert.equal(term(attack(d, scythe, []), "Bane (lycanthropes)"), undefined);
  const hit = damage(d, scythe, { ticked: { against_bane: true } });
  assert.deepEqual([term(hit, "Bane (lycanthropes)"), term(hit, "Enhancement")], [2, 3]);
  assert.match(hit.formula, /\+ 2d6$/);
});

test("Keen doubles the threat range; the Chain Saw of the Psycho is ×3; Distance doubles the range increment", () => {
  assert.deepEqual([keenThreat(20), keenThreat(19), keenThreat(18)], [19, 17, 15]);
  assert.equal(attack(d, fx["Keen Chain Saw"], []).critical.threat, 19);
  assert.equal(attack(d, fx["Chain Saw of the Psycho"], []).critical.multiplier, 3);
  const grenade = fx["Fragmentation Grenade of Distance"], plain = gear["Fragmentation grenade"];
  const at = 2 * plain.system.rangeIncrement.ft + 1;
  assert.equal(term(attack(d, plain, [], { distance: at }), `Range (2 increments of ${plain.system.rangeIncrement.ft} ft.)`), -4);
  assert.equal(attack(d, grenade, [], { distance: at }).terms.find((t) => t.label.startsWith("Range"))?.value, -2);
});

test("Energy Blast's dice on a critical alone, more at a higher multiplier; Merciful's nonlethal; the Charged Nunchaku's 1d4", () => {
  const blade = withAbilities(gear.Machete, [["energyBlast", "fire"]]);
  const hit = damage(d, blade);
  assert.doesNotMatch(hit.formula, /d10/);
  assert.match(criticalDamage(hit, 2).formula, /\+ 1d10\[fire\]$/);
  assert.match(criticalDamage(hit, 3).formula, /\+ 2d10\[fire\]$/);
  assert.equal(blastDice(4, "cold"), "3d10[cold]");
  assert.equal(damage(d, withAbilities(gear.Machete, ["merciful"])).nonlethal, true);
  assert.match(damage(d, fx["Charged Nunchaku"]).formula, /\+ 1d4$/);
  // The rest are the table's: said on the card.
  assert.ok(attack(d, fx["Wounding Handgun"], []).hints?.some((h) => /bleeds/.test(h)));
});

test("armor's abilities: energy resistance, damage reduction and skills while worn; the rest as notes", () => {
  const vest = withAbilities({ ...gear["Light-duty vest"], system: { ...gear["Light-duty vest"].system, equipped: true, enhancement: 1 } }, ["fireResistance", "shadow", "damageReduction5", "heavyFortification"]);
  const on = deriveCharacter({ abilities }, [vest]);
  assert.equal(on.defenses.resist.fire, 10);
  assert.ok(on.defenses.dr.some((x) => x.amount === 5 && x.overcome === "+1"));
  assert.equal(on.skills.find((r) => r.key === "hide").effects, 5);
  assert.ok(on.skills.find((r) => r.key === "hide").effectParts.some((p) => p.label === "Light-duty vest"));
  const off = deriveCharacter({ abilities }, [{ ...vest, system: { ...vest.system, equipped: false } }]);
  assert.equal(off.defenses.resist.fire ?? 0, 0);
  assert.deepEqual(armorAbilities(vest.system).notes, ["Heavy Fortification: critical hits and sneak attacks on you are rolled as normal damage"]);
});

test("their price: each ability's modifier on an ordinary weapon's, not on an FX item's own; named on its row", () => {
  const blade = withAbilities({ ...gear.Machete, system: { ...gear.Machete.system, enhancement: 1 } }, ["flaming", ["bane", "undead"]]);
  assert.equal(abilitiesDC("weapon", blade.system), 3);
  assert.equal(purchaseDC(blade).dc, gear.Machete.system.purchaseDC.dc + 10 + 3);
  assert.equal(purchaseDC(fx["Flaming Machete"]).dc, 25);
  assert.equal(qualityText(blade), "+1, flaming, bane (undead)");
  assert.equal(label("damageReduction5"), "Damage Reduction 5");
});
