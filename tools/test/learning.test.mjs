import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { newSpells, triggerAt } from "../../module/rules/learning.mjs";

const classes = Object.fromEntries(PACKS.classes().documents.filter((d) => d.system).map((d) => [d.name, d]));
const cls = (name) => ({ name, system: classes[name].system });
const featuresAt = (name, level) => (classes[name].system.levels[level - 1]?.features ?? []).map((f) => f.name);

test("a Mage's spellbook: every 0-level spell and 3 + Int bonus 1st-level ones at 1st, then two of any level it can cast", () => {
  assert.deepEqual(newSpells(cls("Mage"), 1, { modifier: 2 }), { kind: "spellbook", all: [0], picks: [{ levels: [1], count: 5 }], note: "" });
  // A negative modifier takes none away; those already had count toward them.
  assert.equal(newSpells(cls("Mage"), 1, { modifier: -1, have: { 1: 1 } }).picks[0].count, 2);
  assert.deepEqual(newSpells(cls("Mage"), 3).picks, [{ levels: [1, 2], count: 2 }]);
  assert.deepEqual(newSpells(cls("Techno Mage"), 1).picks, [{ levels: [1], count: 3 }]);
});

test("a known-table caster: as many more of each level as its table gives over those it has", () => {
  // Telepath 1st: three 0-level powers and one 1st-level.
  assert.deepEqual(newSpells(cls("Telepath"), 1).picks, [{ levels: [0], count: 3 }, { levels: [1], count: 1 }]);
  // 4th: 4 0-level, 3 1st, 1 2nd, with 3, 3 and none had.
  assert.deepEqual(newSpells(cls("Telepath"), 4, { have: { 0: 3, 1: 3 } }).picks, [{ levels: [0], count: 1 }, { levels: [2], count: 1 }]);
  assert.deepEqual(newSpells(cls("Mystic"), 1).picks, [{ levels: [0], count: 4 }, { levels: [1], count: 2 }]);
  assert.equal(newSpells(cls("Battle Mind"), 1).kind, "known");
});

test("an Acolyte casts from its whole list, an Archmage adds to another's: nothing to choose", () => {
  assert.equal(newSpells(cls("Acolyte"), 2).kind, "list");
  assert.deepEqual(newSpells(cls("Acolyte"), 2).picks, []);
  assert.equal(newSpells(cls("Archmage"), 1).kind, "");
  assert.equal(newSpells(cls("Strong Hero"), 1).kind, "");
});

test("the Telepath's trigger power comes at 2nd, 5th and 8th", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((l) => triggerAt(featuresAt("Telepath", l))), [2, 5, 8]);
});
