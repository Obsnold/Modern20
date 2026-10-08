import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { printedMastercraft, weaponQuality, armorQuality, purchaseDC, qualityText } from "../../module/rules/quality.mjs";
import { attack, damage } from "../../module/rules/rolls.mjs";
import { deriveCharacter } from "../../module/rules/character.mjs";

const equipment = PACKS.equipment().documents.filter((d) => d.system);
const item = (name) => structuredClone(equipment.find((d) => d.name === name));
const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 10 }]));
const term = (spec, label) => spec.terms.find((t) => t.label === label)?.value;

test("the weapons the book makes mastercraft are +1, built so; the MP5K, which it says is not, is not", () => {
  const mastercraft = equipment.filter((d) => d.system.mastercraft).map((d) => d.name).sort();
  assert.deepEqual(mastercraft, ["Colt Python (.357 revolver)", "Glock 17 (9mm autoloader)", "Glock 20 (10mm autoloader)", "HK MP5 (9mm submachine gun)", "HK PSG1 (7.62mm sniper rifle)"]);
  assert.equal(printedMastercraft(item("HK MP5K (9mm submachine gun)").system), 0);
});

test("a weapon's mastercraft bonus is on attack (or damage, made so), its enhancement on both, and they do not stack", () => {
  assert.deepEqual(weaponQuality({ mastercraft: 1 }), { attack: [{ label: "Mastercraft", value: 1 }], damage: [] });
  assert.deepEqual(weaponQuality({ mastercraft: 2, mastercraftOn: "damage" }), { attack: [], damage: [{ label: "Mastercraft", value: 2 }] });
  assert.deepEqual(weaponQuality({ enhancement: 2 }), { attack: [{ label: "Enhancement", value: 2 }], damage: [{ label: "Enhancement", value: 2 }] });
  // A +1 Glock 17: its mastercraft +1 and the enhancement +1 are one +1 on attack, and +1 damage.
  assert.deepEqual(weaponQuality({ mastercraft: 1, enhancement: 1 }), { attack: [{ label: "Enhancement", value: 1 }], damage: [{ label: "Enhancement", value: 1 }] });
  assert.deepEqual(weaponQuality({ mastercraft: 3, enhancement: 1 }).attack, [{ label: "Mastercraft", value: 3 }]);
  assert.deepEqual(weaponQuality({}), { attack: [], damage: [] });
});

test("on the rolls: the Glock 17's +1 to attack, a +2 machete's +2 on attack and damage, multiplied on a critical", () => {
  const d = deriveCharacter({ abilities }, []);
  const glock = item("Glock 17 (9mm autoloader)");
  assert.equal(term(attack(d, glock, [{ name: "Personal Firearms Proficiency" }]), "Mastercraft"), 1);
  assert.equal(term(damage(d, glock), "Mastercraft"), undefined);
  const machete = item("Machete");
  machete.system.enhancement = 2;
  assert.equal(term(attack(d, machete, []), "Enhancement"), 2);
  const dmg = damage(d, machete);
  assert.equal(term(dmg, "Enhancement"), 2);
  assert.match(dmg.formula, /\+ 2$/);
});

test("armor: mastercraft adds to its equipment bonus, an enhancement bonus to Defense besides, and its armor penalty is 1 less", () => {
  const vest = item("Light-duty vest");
  const plain = deriveCharacter({ abilities }, [{ ...vest, system: { ...vest.system, equipped: true } }]);
  const magic = deriveCharacter({ abilities }, [{ ...vest, system: { ...vest.system, equipped: true, mastercraft: 1, enhancement: 2 } }]);
  assert.equal(magic.defense.value, plain.defense.value + 3);
  // Touch Defense takes no armor: neither bonus.
  assert.equal(magic.defense.touch, plain.defense.touch);
  assert.equal(magic.defense.armorPenalty, Math.min(0, plain.defense.armorPenalty + 1));
  assert.ok(magic.parts.defense.some((p) => p.label === "Light-duty vest (enhancement)" && p.value === 2));
  assert.deepEqual(armorQuality({ armorPenalty: -4, enhancement: 1 }), { equipment: 0, enhancement: 1, penalty: -3 });
  assert.equal(armorQuality({ armorPenalty: 0, enhancement: 1 }).penalty, 0);
});

test("the purchase DC with a quality: custom mastercraft +3 a point, but not the book's own; enhancement by the tables, up to +3", () => {
  const glock = item("Glock 17 (9mm autoloader)"), base = glock.system.purchaseDC.dc;
  assert.deepEqual(purchaseDC(glock), { dc: base, unpriced: false });
  assert.equal(purchaseDC({ ...glock, system: { ...glock.system, mastercraft: 2 } }).dc, base + 3);
  // Enhanced, it is mastercraft anyway: the enhancement's +15 alone.
  assert.equal(purchaseDC({ ...glock, system: { ...glock.system, mastercraft: 2, enhancement: 2 } }).dc, base + 15);
  const vest = item("Light-duty vest"), vestDC = vest.system.purchaseDC.dc;
  assert.equal(purchaseDC({ ...vest, system: { ...vest.system, enhancement: 1, mastercraft: 1 } }).dc, vestDC + 8 + 3);
  assert.deepEqual(purchaseDC({ ...vest, system: { ...vest.system, enhancement: 5 } }), { dc: vestDC + 18, unpriced: true });
  assert.equal(qualityText({ type: "weapon", system: { enhancement: 1, mastercraft: 2, mastercraftOn: "damage" } }), "+1, mastercraft +2 (damage)");
});
