import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { talentPrerequisites, bonusFeatSlots } from "../../module/rules/talents.mjs";

const talents = PACKS.talents().documents.filter((d) => d.system);
const talent = (n) => talents.find((t) => t.name === n);
const owned = (...names) => names.map((n) => ({ name: n, tree: talent(n).system.tree }));
const classes = Object.fromEntries(PACKS.classes().documents.filter((d) => d.system).map((d) => [d.name, d]));

test("talent prerequisites: talents named, a choice of either, a talent from a tree, and one to check by hand", () => {
  assert.deepEqual(talentPrerequisites(talent("Evasion"), []), { met: true, missing: [] });
  assert.deepEqual(talentPrerequisites(talent("Uncanny Dodge 2"), owned("Evasion")), { met: false, missing: ["Uncanny Dodge 1"] });
  assert.equal(talentPrerequisites(talent("Uncanny Dodge 2"), owned("Evasion", "Uncanny Dodge 1")).met, true);
  assert.deepEqual(talentPrerequisites(talent("Cool Under Pressure"), owned("Skill Emphasis")).missing, ["Faith or Aware"]);
  assert.equal(talentPrerequisites(talent("Cool Under Pressure"), owned("Skill Emphasis", "Faith")).met, true);
  assert.equal(talentPrerequisites(talent("Plan"), []).met, false);
  assert.equal(talentPrerequisites(talent("Plan"), owned("Savant")).met, true);
  assert.equal(talentPrerequisites(talent("Damage Reduction 2/—"), owned("Damage Reduction 1/—")).met, false);
  assert.equal(talentPrerequisites(talent("Damage Reduction 2/—"), owned("Damage Reduction 1/—", "Fire Resistance")).met, true);
  assert.equal(talentPrerequisites(talent("Linguist"), []).met, null);
});

test("every talent's prerequisites can be read: named talents, trees, or flagged for the table", () => {
  const unread = talents.filter((t) => t.system.prerequisites.value && !t.system.prerequisites.talents.length && !/Talent Tree/.test(t.system.prerequisites.value));
  assert.deepEqual(unread.map((t) => t.name), ["Linguist"]);
});

test("a class's bonus feats come one for each Bonus Feat in its levels taken", () => {
  assert.equal(bonusFeatSlots({ system: { ...classes["Fast Hero"].system, level: 1 } }), 0);
  assert.equal(bonusFeatSlots({ system: { ...classes["Fast Hero"].system, level: 4 } }), 2);
  assert.equal(bonusFeatSlots({ system: { ...classes.Telepath.system, level: 6 } }), 2);
});
