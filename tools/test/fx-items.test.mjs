import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { purchaseDC as readDC, casterLevel, staffUse } from "../build/fx-items.mjs";
import { purchaseDC } from "../../module/rules/quality.mjs";

const built = PACKS["fx-items"]();
const items = built.documents.filter((d) => d.system);
const find = (name) => items.find((d) => d.name === name);
const equipment = PACKS.equipment().documents.filter((d) => d.system);

test("the FX items build with every check passing: each a weapon, armor, charged item or equipment", () => {
  assert.deepEqual(built.problems, []);
  const by = {};
  for (const d of items) by[d.type] = (by[d.type] ?? 0) + 1;
  assert.deepEqual(by, { weapon: 12, armor: 5, consumable: 30, equipment: 100 });
  const names = items.map((d) => d.name);
  assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), []);
});

test("only sections with an FX stat table are items: not a page's rules, the special abilities, or the Arcanobot's statistics", () => {
  for (const name of ["Flaming", "Keen", "Fortification", "Arcanobot", "Limit on FX Items Worn", "Artifact Purchase DCs", "Staffs"]) assert.equal(find(name), undefined, name);
  // The Arcanobot's statistics are its action figure's text.
  assert.match(find("ARCANOBOTS Action Figure").system.description, /Arcanobot/);
});

test("an FX weapon is the weapon it is made from, with its own price, weight and text, and its enhancement bonus", () => {
  const machete = find("Flaming Machete"), base = equipment.find((d) => d.name === "Machete");
  for (const k of ["damage", "critical", "damageType", "melee", "proficiency", "size"]) assert.deepEqual(machete.system[k], base.system[k], k);
  assert.equal(machete.system.enhancement, 1);
  assert.deepEqual(machete.system.purchaseDC.byBonus, [25, 30, 35]);
  assert.match(machete.system.description, /fire damage/);
  assert.deepEqual([machete.system.fx.category, machete.system.fx.power, machete.system.fx.casterLevel.level], ["Weapon", "magic", 10]);
  // One of the buyer's handgun: the book's text, no statistics of its own.
  assert.equal(find("Wounding Handgun").system.damage.value, "See text");
  // "the same protection as a +1 leather jacket"
  const shirt = find("Bulletproof Shirt"), jacket = equipment.find((d) => d.name === "Leather jacket");
  assert.deepEqual([shirt.system.equipmentBonus, shirt.system.enhancement, shirt.system.weight.lb], [jacket.system.equipmentBonus, 1, 1]);
});

test("its price follows its bonus where the book prints one for each, and is the book's otherwise", () => {
  const machete = find("Flaming Machete");
  assert.deepEqual(purchaseDC(machete), { dc: 25, unpriced: false });
  assert.deepEqual(purchaseDC({ ...machete, system: { ...machete.system, enhancement: 3 } }), { dc: 35, unpriced: false });
  assert.deepEqual(purchaseDC({ ...machete, system: { ...machete.system, enhancement: 5 } }), { dc: 35, unpriced: true });
  assert.equal(purchaseDC(find("Bulletproof Shirt")).dc, 22);
  assert.equal(purchaseDC(find("Ring of Jumping")).dc, 26);
  assert.deepEqual(readDC("16 + pistol’s purchase DC (+1), 21 + pistol’s purchase DC (+2)"), { value: "16 + pistol’s purchase DC (+1), 21 + pistol’s purchase DC (+2)", dc: null, byBonus: [] });
  assert.equal(readDC("28 (per set)").dc, 28);
  assert.deepEqual([casterLevel("9th (arcane)"), casterLevel("4th (+1), 7th (+2), 10th (+3)"), casterLevel("12th¹"), casterLevel("—")], [9, 4, 12, null]);
});

test("charged items: one use for a potion or scroll, 50 charges for a wand or staff, and the spells they hold, linked", () => {
  const web = find("Wand of Web");
  assert.deepEqual([web.system.kind, web.system.charges.value, web.system.charges.max, web.system.spells.map((s) => s.name)], ["wand", 50, 50, ["Web"]]);
  assert.deepEqual(find("Scroll of Fireball").system.charges, { value: 1, max: 1 });
  assert.deepEqual(find("Vaporex (Potion of Gaseous Form)").system.spells.map((s) => s.name), ["Gaseous Form"]);
  assert.deepEqual(find("Potion of Charisma").system.spells, []);
  assert.deepEqual(find("Staff of Fire").system.spells.map((s) => [s.name, s.charges]), [["Burning Hands", 1], ["Fireball", 1], ["Wall of Fire", 2]]);
  assert.deepEqual(find("Staff of the Urban Jungle").system.spells.find((s) => s.name === "Arcane Graffiti").charges, 0);
  // A psionic staff holds powers.
  assert.ok(find("Staff of the Mind’s Eye").system.spells.every((s) => s.uuid.startsWith("Compendium.modern20.powers.")));
  assert.equal(find("Doppler Staff").system.spells[0].uuid.split(".")[2], "incantations");
  // Every link is to a document that is there.
  const ids = new Set(["spells", "powers", "incantations"].flatMap((p) => PACKS[p]().documents.map((d) => `Compendium.modern20.${p}.Item.${d._id}`)));
  for (const d of items.filter((x) => x.type === "consumable")) for (const s of d.system.spells) assert.ok(ids.has(s.uuid), `${d.name}: ${s.name}`);
  assert.deepEqual(staffUse("Searing light (4d8 points of damage, or 9d6 points of damage to undead; Reflex save DC 15); uses 1 charge."), { name: "Searing light", note: "4d8 points of damage, or 9d6 points of damage to undead; Reflex save DC 15", charges: 1 });
});

test("the rest are equipment, with their category, kind and caster level; an incantation-made one marked", () => {
  const ring = find("Cat’s Eye Ring");
  assert.equal(ring.type, "equipment");
  assert.deepEqual([ring.system.fx.category, ring.system.fx.casterLevel.level, ring.system.fx.incantation], ["Ring", 12, true]);
  assert.doesNotMatch(ring.system.description, /sidebar/);
  assert.equal(find("Zephyr Tires").system.fx.power, "vehicular");
  assert.equal(find("Caesar’s Shield").system.fx.category, "Artifact");
});
