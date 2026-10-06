import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { deriveCharacter } from "../../module/rules/character.mjs";
import { actionPointsDue, featsAllowed, abilityIncreases, maxRanks, classGrants } from "../../module/rules/advancement.mjs";
import { wealthLoss, purchase, sale, regained, financialCondition } from "../../module/rules/wealth.mjs";
import { restHealing } from "../../module/rules/damage.mjs";

const classes = Object.fromEntries(PACKS.classes().documents.filter((d) => d.system).map((d) => [d.name, d]));
const cls = (name, level) => ({ type: "class", name, system: { ...classes[name].system, level } });
const abilities = (int = 10) => Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: a === "int" ? int : 10 }]));

test("action points: 5 + half the level, at each level not yet given", () => {
  assert.deepEqual(actionPointsDue(3, 0), { levels: [1, 2, 3], points: 5 + 6 + 6 });
  assert.deepEqual(actionPointsDue(4, 3), { levels: [4], points: 7 });
  assert.deepEqual(actionPointsDue(4, 4), { levels: [], points: 0 });
});

test("feats, ability increases and maximum ranks by character level", () => {
  assert.deepEqual([1, 2, 3, 6, 20].map(featsAllowed), [2, 2, 3, 4, 8]);
  assert.deepEqual([3, 4, 8, 20].map(abilityIncreases), [0, 1, 2, 5]);
  assert.deepEqual([maxRanks(1, true), maxRanks(1, false), maxRanks(4, false)], [4, 2, 3.5]);
});

test("a Fast hero 3 with Int 12: skill points, feats, talents and action points", () => {
  const d = deriveCharacter({ abilities: abilities(12), skills: { hide: { ranks: 7, classSkill: false } }, actionPoints: { value: 0, granted: 0 } }, [cls("Fast Hero", 3)]);
  const a = d.advancement;
  // (5 + 1) × 4 at 1st level, and 6 at 2nd and 3rd.
  assert.equal(a.skillPoints.allowed, 36);
  // Hide is a Fast hero class skill: 7 ranks cost 7 points, one over the 3 + 3 a 3rd-level character may have.
  assert.equal(a.skillPoints.have, 7);
  // Two feats and one at 3rd, the bonus feat at 2nd, and Simple Weapons Proficiency to start.
  assert.deepEqual(a.featParts, { general: 3, bonus: 1, starting: 1, occupation: 0, species: 0 });
  assert.equal(a.feats.allowed, 5);
  assert.equal(a.talents.allowed, 2);
  assert.equal(a.actionPoints.points, 17);
  assert.deepEqual(a.overRanks.map((r) => [r.key, r.max]), [["hide", 6]]);
});

test("a d20 Future class gives a nonhuman a point fewer; a low Intelligence still gives 1", () => {
  assert.equal(classGrants([cls("Explorer", 1)], { intMod: 0 }).skillPoints, 28);
  assert.equal(classGrants([cls("Explorer", 1)], { intMod: 0, nonhuman: true }).skillPoints, 24);
  assert.equal(classGrants([cls("Strong Hero", 2)], { intMod: -4 }).skillPoints, 5);
});

test("an ability increase raises the score it went to", () => {
  const d = deriveCharacter({ abilities: abilities(), abilityIncreases: ["str", "", "str"] }, [cls("Strong Hero", 8)]);
  assert.equal(d.scores.str, 12);
  assert.equal(d.advancement.abilityIncreases.allowed, 2);
});

test("Wealth: what a purchase costs, a sale brings, and a level gives back", () => {
  assert.equal(wealthLoss(10, 12), "");
  assert.equal(wealthLoss(12, 10), "1");
  assert.equal(wealthLoss(15, 10), "2");        // 5 over, and DC 15 or higher
  assert.equal(wealthLoss(16, 20), "1");        // within means, but DC 15 or higher
  assert.equal(wealthLoss(22, 10), "1d6 + 1");
  assert.equal(wealthLoss(30, 10), "2d6 + 1");
  assert.deepEqual(purchase(0, 10), { automatic: false, impossible: true });
  assert.deepEqual(purchase(12, 12), { automatic: true, impossible: false });
  assert.deepEqual(sale(18, 10), { value: 15, gain: "2" });
  assert.deepEqual(sale(12, 10, { blackMarket: true }), { value: 6, gain: "" });
  assert.deepEqual([regained(17, 12), regained(11, 12)], [2, 0]);
  assert.equal(financialCondition(7), "Middle class");
});

test("natural healing: a level's worth a night, twice that for bed rest, none below 0", () => {
  assert.deepEqual([restHealing(5, 10), restHealing(5, 10, { bedRest: true }), restHealing(5, -2)], [5, 10, null]);
});

test("feats an occupation, species and first class give, and the feat count that includes them", async () => {
  const { featGrants } = await import("../../module/rules/advancement.mjs");
  const occupation = PACKS.occupations().documents.find((d) => d.name === "Criminal");
  const species = PACKS.species().documents.find((d) => d.name === "Dwarf");
  const items = [
    { type: "class", name: "Charismatic Hero", id: "c1", system: { ...classes["Charismatic Hero"].system, level: 3 } },
    { type: "class", name: "Telepath", id: "c2", system: { ...classes.Telepath.system, level: 6 } },
    { type: "occupation", name: occupation.name, id: "o1", system: occupation.system },
    { type: "species", name: species.name, id: "s1", system: species.system },
  ];
  const grants = featGrants(items);
  assert.deepEqual(grants.map((g) => [g.kind, g.choose, g.options.map((o) => o.name)]), [
    ["occupation", 1, ["Brawl", "Personal Firearms Proficiency"]],
    ["species", 1, ["Archaic Weapons Proficiency"]],
    ["starting", 1, ["Simple Weapons Proficiency"]],
  ]);
  const d = deriveCharacter({ abilities: abilities() }, items);
  // 5 by level, 3 class bonus feats, a starting feat, and one each from the occupation and species.
  assert.equal(d.advancement.feats.allowed, 11);
});

test("skill points as ranks are bought: the cost by the class the level is in", async () => {
  const { rankCost, pointsAfter, skillPointsSpent } = await import("../../module/rules/advancement.mjs");
  const items = [
    { type: "class", name: "Charismatic Hero", system: { ...classes["Charismatic Hero"].system, level: 3 } },
    { type: "class", name: "Telepath", system: { ...classes.Telepath.system, level: 6 } },
  ];
  const d = deriveCharacter({ abilities: abilities() }, items);
  const row = (key) => d.skills.find((r) => r.key === key && !r.specialty);
  // Disguise is a Charismatic hero's class skill, not a Telepath's; Autohypnosis a Telepath's alone; Bluff both.
  assert.deepEqual(row("disguise").classFor, ["Charismatic Hero"]);
  assert.deepEqual(row("bluff").classFor, ["Charismatic Hero", "Telepath"]);
  assert.equal(rankCost(row("disguise"), "Charismatic Hero"), 1);
  assert.equal(rankCost(row("disguise"), "Telepath"), 2);
  assert.equal(rankCost(row("autohypnosis"), "Charismatic Hero"), 2);
  assert.equal(rankCost(row("bluff"), "Telepath"), 1);
  // Four ranks of Disguise bought as a Telepath cost 8; two more as a Charismatic hero, 2 more.
  assert.equal(pointsAfter(row("disguise"), 0, 4, "Telepath"), 8);
  assert.equal(pointsAfter({ ...row("disguise"), points: 8 }, 4, 6, "Charismatic Hero"), 10);
  // Selling back a rank returns what it costs now; a skill not yet tracked starts from today's cost.
  assert.equal(pointsAfter({ ...row("disguise"), points: 10 }, 6, 5, "Telepath"), 8);
  assert.equal(pointsAfter(row("disguise"), 3, 4, "Telepath"), 5);
  // The total counts tracked points as they are, the rest at today's cost.
  assert.equal(skillPointsSpent([{ ranks: 4, classSkill: true, points: 8 }, { ranks: 2, classSkill: true, points: null }]), 10);
  // A skill a feat or the occupation makes a class skill costs 1 whatever the class.
  assert.equal(rankCost({ alwaysClass: true, classFor: [] }, "Telepath"), 1);
});

test("the 1st level's class: the one chosen, or else a basic class, for its hit points, ×4 skill points and starting feats", async () => {
  const { inOrder } = await import("../../module/rules/advancement.mjs");
  const fast = { type: "class", name: "Fast Hero", system: { ...classes["Fast Hero"].system, level: 4 } };
  const gun = { type: "class", name: "Gunslinger", system: { ...classes.Gunslinger.system, level: 2 } };
  const tough = { type: "class", name: "Tough Hero", system: { ...classes["Tough Hero"].system, level: 1 } };
  assert.deepEqual(inOrder([gun, fast]).map((c) => c.name), ["Fast Hero", "Gunslinger"]);   // an advanced class cannot be first
  assert.deepEqual(inOrder([fast, tough], "Tough Hero").map((c) => c.name), ["Tough Hero", "Fast Hero"]);
  const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 10 }]));
  // The same classes in either order: the same character, its 1st level a Fast hero's d8 at its maximum.
  const a = deriveCharacter({ abilities }, [gun, fast]), b = deriveCharacter({ abilities }, [fast, gun]);
  assert.equal(a.hitPoints.max, b.hitPoints.max);
  assert.equal(a.startingClass, "Fast Hero");
  // Starting as a Tough hero instead: its d10 at the maximum, and its skill points ×4.
  const t = deriveCharacter({ abilities, startingClass: "Tough Hero" }, [fast, tough]);
  const f = deriveCharacter({ abilities, startingClass: "Fast Hero" }, [fast, tough]);
  assert.equal(t.hitPoints.max - f.hitPoints.max, 10 - 8 - (Math.ceil(11 / 2) - Math.ceil(9 / 2)));
  assert.notEqual(t.advancement.skillPoints.allowed, f.advancement.skillPoints.allowed);
});
