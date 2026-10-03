import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClasses, buildTalents } from "../build/classes.mjs";
import { buildFeats } from "../build/feats.mjs";

const classes = buildClasses(), talents = buildTalents();
const cls = Object.fromEntries(classes.documents.filter((d) => d.type === "class").map((d) => [d.name, d.system]));
const tal = talents.documents.filter((d) => d.type === "talent");
const talentName = Object.fromEntries(tal.map((d) => [`Compendium.modern20.talents.Item.${d._id}`, d.name]));
const featName = Object.fromEntries(buildFeats().documents.map((d) => [`Compendium.modern20.feats.Item.${d._id}`, d.name]));

test("classes and talents build with every check passing", () => {
  assert.deepEqual(classes.problems, []);
  assert.equal(Object.keys(cls).length, 54);
  assert.equal(tal.length, 53);
  const types = Object.values(cls).reduce((a, c) => ((a[c.classType] = (a[c.classType] ?? 0) + 1), a), {});
  assert.deepEqual(types, { basic: 6, advanced: 44, prestige: 4 });
});

test("every class has ten levels, a hit die and its features at the levels the table gives", () => {
  for (const [name, c] of Object.entries(cls)) {
    assert.equal(c.levels.length, c.maxLevel, name);
    assert.ok(c.hitDie >= 6 && c.hitDie <= 12, name);
    assert.ok(c.classSkills.length > 5, name);
    for (const l of c.levels) for (const f of l.features) assert.ok(c.features.some((x) => x.name === f.feature && x.levels.includes(l.level)), `${name} ${l.level}: ${f.name}`);
  }
});

test("a basic class: ability, starting feats, skill points and talent trees", () => {
  const s = cls["Strong Hero"];
  assert.equal(s.ability, "str");
  assert.equal(s.hitDie, 8);
  assert.equal(s.actionPoints.base, 5);
  assert.deepEqual(s.skillPoints, { perLevel: 3, value: "3 + Int modifier.", firstLevel: "(3 + Int modifier)x4." });
  assert.deepEqual(s.startingFeats.map((f) => featName[f.uuid]), ["Simple Weapons Proficiency"]);
  assert.deepEqual(s.talentTrees.map((t) => t.name), ["Extreme Effort", "Ignore Hardness", "Melee Smash"]);
  assert.deepEqual(s.levels[5], {
    level: 6, baseAttackBonus: { value: "+6/+1", bonus: 6 }, saves: { fort: 3, ref: 2, will: 2 }, defense: 3, reputation: 1,
    features: [{ name: "Bonus feat", feature: "Bonus Feats", detail: "" }],
  });
  assert.deepEqual(s.features.find((f) => f.name === "Talents").levels, [1, 3, 5, 7, 9]);
});

test("an advanced class: requirements and bonus feats link to the feats pack", () => {
  const s = cls.Soldier;
  assert.equal(s.classType, "advanced");
  assert.equal(s.requiredBaseAttackBonus, 3);
  assert.deepEqual(s.requirements.find((r) => r.label === "Feats").feats.map((f) => featName[f.uuid]), ["Personal Firearms Proficiency"]);
  assert.ok(s.bonusFeats.length > 10 && s.bonusFeats.every((f) => featName[f.uuid]));
  assert.deepEqual(cls.Swindler.requirements.find((r) => r.label === "Charismatic Hero Talents").talents.map((t) => talentName[t.uuid]), ["Charm", "Coordinate", "Fast-Talk"]);
  assert.equal(cls.Archmage.classType, "prestige");
});

test("feature entries with commas and details find their sections", () => {
  const dog = cls.Dogfighter.levels[3].features[0];
  assert.deepEqual(dog, { name: "Shake, rattle, and roll (1/day)", feature: "Shake, Rattle, and Roll", detail: "(1/day)" });
  assert.equal(cls.Investigator.levels[1].features[0].feature, "Contact");
  assert.equal(cls.Mystic.levels[1].features[0].feature, "Turn or Rebuke Undead");
  assert.deepEqual(cls.Shadowjack.features.find((f) => f.name === "Shadowjack Abilities").levels, [4, 5, 7, 8]);
  // A feat the SRD never prints is kept by name, unlinked.
  assert.deepEqual(cls["Shadow Hunter"].bonusFeats.find((f) => f.name === "Armor Proficiency (archaic)"), { name: "Armor Proficiency (archaic)", specialty: "", uuid: "" });
});

test("talents link their class's prerequisite talents", () => {
  const t = tal.find((d) => d.name === "Advanced Extreme Effort");
  assert.equal(t.system.className, "Strong Hero");
  assert.equal(t.system.tree, "Extreme Effort");
  assert.deepEqual(t.system.prerequisites.talents.map((r) => talentName[r.uuid]), ["Extreme Effort", "Improved Extreme Effort"]);
  assert.doesNotMatch(t.system.description, /Prerequisites/);
});
