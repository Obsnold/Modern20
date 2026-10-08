import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { KINDS, MAKERS, minCasterLevel, spellLevel, castingKind, canHold, buyDC, making, itemOf, magicMastercraft } from "../../module/rules/creation.mjs";
import { useCharges } from "../../module/rules/fx-items.mjs";
import { purchaseDC } from "../../module/rules/quality.mjs";

const spells = Object.fromEntries(PACKS.spells().documents.filter((d) => d.system).map((d) => [d.name, d]));
const fx = Object.fromEntries(PACKS["fx-items"]().documents.filter((d) => d.system).map((d) => [d.name, d]));

test("bought: the SRD's purchase DC formulas, as its own sample items are priced", () => {
  // Wand of Web: 24 + caster level 3 + spell level 2 = 29 by the formula (the book prints 28 for it).
  assert.equal(buyDC("wand", 2, 3), 29);
  // Scroll of Fireball: 15 + 5 + 3 = 23, as printed; Potion of Cure Light Wounds: 17 + 1 + 1 = 19, as printed.
  assert.equal(buyDC("scroll", 3, 5), fx["Scroll of Fireball"].system.purchaseDC.dc);
  assert.equal(buyDC("potion", 1, 1), fx["Potion of Cure Light Wounds"].system.purchaseDC.dc);
});

test("what each holds, and the lowest caster level that casts it", () => {
  assert.deepEqual([minCasterLevel(0), minCasterLevel(1), minCasterLevel(2), minCasterLevel(3), minCasterLevel(5)], [1, 1, 3, 5, 9]);
  assert.equal(spellLevel(spells.Fireball.system.levels), 3);
  assert.equal(castingKind(spells.Fireball.system.levels), "arcane");
  assert.equal(canHold("potion", 3).ok, true);
  assert.match(canHold("potion", 4).reason, /3rd level or lower/);
  assert.match(canHold("wand", 5).reason, /4th level or lower/);
  assert.equal(canHold("scroll", 9).ok, true);
});

test("made: the raw materials' DC by the feature, the Craft check, and the XP", () => {
  const scribe = MAKERS.scroll.find((m) => m.feature === "scribe-scroll"), improved = MAKERS.scroll.find((m) => m.feature === "craft-artifice");
  // A scroll of fireball at caster level 5, by a Mage: materials 13 + 3 + 5 = 21; Craft (writing) DC 18; 3 × 5 × 21 XP.
  assert.deepEqual(making("scroll", scribe, 3, 5), { materials: 21, craft: "writing", craftDC: 18, xp: 315 });
  assert.equal(making("scroll", improved, 3, 5).materials, 18);
  assert.deepEqual(making("wand", MAKERS.wand[0], 2, 3), { materials: 23, craft: "mechanical", craftDC: 15, xp: 138 });
  assert.equal(making("potion", MAKERS.potion[0], 1, 1).craft, "chemical");
  // The Artificer's magic mastercraft: +2 on armor of components DC 12, by a 3rd-level Artificer.
  assert.deepEqual(magicMastercraft("armor", 12, 2, 3), { materials: 22, mechanicalDC: 22, chemicalDC: 24, xp: 240 });
  assert.equal(magicMastercraft("weapon", 12, 1, 1).mechanicalDC, 26);
});

test("the item: a wand of web with 50 charges and its spell, a caster level, its price; and used as the book's are", () => {
  const web = { ...spells.Web, uuid: `Compendium.modern20.spells.Item.${spells.Web._id}` };
  const wand = itemOf("wand", web, 3);
  assert.equal(wand.name, "Wand of Web");
  assert.deepEqual([wand.type, wand.system.kind, wand.system.charges.value, wand.system.spells[0].name, wand.system.spells[0].uuid], ["consumable", "wand", 50, "Web", web.uuid]);
  assert.deepEqual([wand.system.fx.casterLevel.value, wand.system.fx.casterLevel.level], ["3rd (arcane)", 3]);
  assert.equal(purchaseDC(wand).dc, 29);
  assert.equal(useCharges(wand.system, 0).charges, 49);
  assert.equal(itemOf("potion", { ...spells["Cure Light Wounds"], uuid: "" }, 1).system.charges.max, KINDS.potion.charges);
  // A split duplicate's name loses its book: "Shatter (Modern)" makes a Scroll of Shatter.
  assert.equal(itemOf("scroll", { ...spells["Shatter (Modern)"], uuid: "" }, 3).name, "Scroll of Shatter");
});

test("a tattoo of a spell: 15 + caster level + spell level, one use; made with Improved Scribe Tattoo and Craft (visual art)", () => {
  assert.equal(buyDC("tattoo", 2, 3), 20);
  const maker = MAKERS.tattoo[0];
  assert.deepEqual([maker.feature, maker.materials], ["craft-artifice", 10]);
  assert.deepEqual(making("tattoo", maker, 2, 3), { materials: 15, craft: "visual art", craftDC: 15, xp: 90 });
  const t = itemOf("tattoo", { ...spells["Spider Climb"], uuid: "" }, 3);
  assert.deepEqual([t.name, t.system.kind, t.system.charges.max], ["Tattoo of Spider Climb", "tattoo", 1]);
  assert.equal(useCharges(t.system, 0).consumed, true);
});
