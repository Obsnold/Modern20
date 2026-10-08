import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { wornSlot, wornOverLimit, itemSaveDC, spellLevelFor, useCharges, printedDC } from "../../module/rules/fx-items.mjs";
import { deriveCharacter } from "../../module/rules/character.mjs";
import { purchaseDC } from "../../module/rules/quality.mjs";

const fx = Object.fromEntries(PACKS["fx-items"]().documents.filter((d) => d.system).map((d) => [d.name, d]));
const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 10 }]));
let n = 0;
/** An FX item as a character owns it: equipped (or not), with its effects. */
const own = (name, system = {}) => ({ id: `item${n++}`, type: fx[name].type, name, system: { ...structuredClone(fx[name].system), equipped: true, ...system }, effects: fx[name].effects.map((e) => ({ ...e, changes: e.system.changes })) });
const derive = (...items) => deriveCharacter({ abilities }, items);

test("the kind of FX item worn each is, from its category and name", () => {
  assert.equal(wornSlot("equipment", "Ring", "Ring of Jumping"), "ring");
  assert.equal(wornSlot("equipment", "Tattoo", "Bullseye Tattoo"), "tattoo");
  assert.equal(wornSlot("armor", "Armor", "Illusory Concealable Vest"), "armor");
  assert.equal(wornSlot("armor", "Armor", "Riot Shield of Fear", "shield"), "");
  assert.equal(wornSlot("equipment", "Wondrous Item", "Running Shoes of Striding and Springing"), "feet");
  assert.equal(wornSlot("equipment", "Wondrous Item", "Eagle Eye Sunglasses"), "eyes");
  assert.equal(wornSlot("equipment", "Artifact", "Houdini’s Watch Fob"), "neck");
  assert.equal(wornSlot("equipment", "Wondrous Item", "Watch of Speed"), "wrists");
  // A name's "of ..." is not what it is: a Pen of Invisible Ink is not worn.
  assert.equal(wornSlot("equipment", "Wondrous Item", "Pen of Invisible Ink"), "");
  assert.equal(fx["Translator’s Earpiece"].system.fx.slot, "");
});

test("only so many of a kind work at once: a third ring, in the Gear tab's order; carried or unequipped ones do not count", () => {
  const rings = [own("Ring of Jumping"), own("Decoder Ring"), own("Ring of Lockpicking")];
  // By name, at the same place: the Ring of Lockpicking is third; dragged to the top, the Ring of Jumping is.
  assert.deepEqual(wornOverLimit(rings).map((w) => [w.slot, w.limit, w.over]), [["ring", 2, [rings[2].id]]]);
  rings[2].sort = -1;
  assert.deepEqual(wornOverLimit(rings)[0].over, [rings[0].id]);
  delete rings[2].sort;
  assert.deepEqual(wornOverLimit([...rings.slice(0, 2), { ...rings[2], system: { ...rings[2].system, equipped: false } }]), []);
  assert.deepEqual(wornOverLimit([own("Haz-Mat Gloves"), own("Driving Ace Gloves", { stored: true })]), []);
  // Tattoos are worn by being on the body, never equipped: a seventh is past the six.
  const tattoos = Array.from({ length: 7 }, (_, i) => ({ ...own("Bullseye Tattoo", { equipped: false }), name: `Tattoo ${i + 1}` }));
  assert.deepEqual(wornOverLimit(tattoos).map((w) => [w.slot, w.over]), [["tattoo", [tattoos[6].id]]]);
  assert.deepEqual(wornOverLimit(tattoos.slice(0, 6)), []);
});

test("an FX item's effects work while it is in use: equipped, not kept elsewhere, and within the limit of its kind", () => {
  const plain = derive();
  assert.equal(derive(own("Houdini’s Watch Fob")).saves.ref, plain.saves.ref + 3);
  assert.equal(derive(own("Houdini’s Watch Fob", { equipped: false })).saves.ref, plain.saves.ref);
  assert.equal(derive(own("Houdini’s Watch Fob", { stored: true })).saves.ref, plain.saves.ref);
  const jump = (d) => d.skills.find((r) => r.key === "jump").total;
  assert.equal(jump(derive(own("Ring of Jumping"))), jump(plain) + 30);
  // Two other rings before it on the Gear tab: the Ring of Jumping, the third, does not work.
  assert.equal(jump(derive({ ...own("Decoder Ring"), sort: 1 }, { ...own("Ring of Lockpicking"), sort: 2 }, { ...own("Ring of Jumping"), sort: 3 })), jump(plain));
  assert.deepEqual(derive(own("Haz-Mat Gloves")).defenses.resist, { acid: 10, cold: 10, fire: 10 });
});

test("a Windbreaker of Resistance's +1 to +3, on its saves and in its price; the Tattoo of Natural Armor switched on, not to touch", () => {
  const plain = derive();
  assert.equal(derive(own("Windbreaker of Resistance")).saves.will, plain.saves.will + 1);
  assert.equal(derive(own("Windbreaker of Resistance", { fx: { ...fx["Windbreaker of Resistance"].system.fx, bonus: 3 } })).saves.will, plain.saves.will + 3);
  assert.equal(purchaseDC(fx["Windbreaker of Resistance"]).dc, 22);
  assert.equal(purchaseDC({ ...fx["Windbreaker of Resistance"], system: { ...fx["Windbreaker of Resistance"].system, fx: { ...fx["Windbreaker of Resistance"].system.fx, bonus: 2 } } }).dc, 25);
  const tattoo = own("Tattoo of Natural Armor");
  assert.equal(derive(tattoo).defense.value, plain.defense.value);
  tattoo.effects = tattoo.effects.map((e) => ({ ...e, disabled: false }));
  const on = derive(tattoo);
  assert.deepEqual([on.defense.value, on.defense.touch], [plain.defense.value + 4, plain.defense.touch]);
});

test("a use: a potion or scroll used up, a wand's charge, a staff's charges for the use; and its saving throw", () => {
  const wand = fx["Wand of Web"].system, staff = fx["Staff of Fire"].system;
  assert.deepEqual(useCharges(wand, 0), { ok: true, reason: "", charges: 49, used: 1, consumed: false });
  assert.deepEqual(useCharges(fx["Scroll of Fireball"].system, 0), { ok: true, reason: "", charges: 0, used: 1, consumed: true });
  assert.equal(useCharges(staff, 2).charges, 48);                       // Wall of fire: 2 charges
  assert.equal(useCharges({ ...staff, charges: { value: 1, max: 50 } }, 2).ok, false);
  assert.equal(useCharges({ ...wand, charges: { value: 0, max: 50 } }, 0).reason, "no charges left");
  assert.equal(useCharges(fx["Staff of Illumination"].system, 0).used, 0); // Light: no charge
  // 10 + 1.5 × level: Web (Mage 2) 13; fireball 3rd 14; a staff's printed DC first.
  assert.deepEqual([itemSaveDC(2), itemSaveDC(3), itemSaveDC(0)], [13, 14, 10]);
  assert.equal(spellLevelFor([{ class: "Mage", level: 3 }, { class: "Acolyte", level: 4 }], "9th (divine)"), 4);
  assert.equal(spellLevelFor([{ class: "Mage", level: 3 }, { class: "Acolyte", level: 4 }], "5th"), 3);
  assert.equal(printedDC(staff.spells[1].note), 15);
  assert.equal(printedDC(""), null);
});
