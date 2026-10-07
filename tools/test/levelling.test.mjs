import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { deriveCharacter } from "../../module/rules/character.mjs";
import { levelPlan, skillOffer, buyRanks, unbuyRanks, pointsLeft } from "../../module/rules/levelling.mjs";

const classes = Object.fromEntries(PACKS.classes().documents.filter((d) => d.type === "class").map((d) => [d.name, d]));
const cls = (name, level) => ({ type: "class", name, system: { ...classes[name].system, level } });
const abilities = (int = 10) => Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: a === "int" ? int : 10 }]));

test("a 1st level: maximum hit points, the class's points ×4, two feats, and the class's 1st-level features", () => {
  const d = deriveCharacter({ abilities: abilities(12) }, []);
  const plan = levelPlan({ d, classes: [], system: {}, cls: classes["Fast Hero"] });
  assert.deepEqual([plan.level, plan.classLevel, plan.isNew, plan.first, plan.maxHitPoints], [1, 1, true, true, true]);
  assert.equal(plan.skillPoints, (5 + 1) * 4);
  assert.equal(plan.feats, 2);
  assert.equal(plan.talent, true);       // a Fast hero's 1st level: a talent
  assert.equal(plan.actionPoints, 5);
});

test("later levels: the die rolled, the class's points, a feat every 3rd, an increase every 4th, and an ordinary's none", () => {
  const items = [cls("Fast Hero", 2)];
  const d = deriveCharacter({ abilities: abilities(8) }, items);
  const third = levelPlan({ d, classes: items, system: {}, cls: items[0] });
  assert.deepEqual([third.level, third.classLevel, third.maxHitPoints, third.skillPoints, third.feats, third.increase], [3, 3, false, 5 - 1, 1, false]);
  const d3 = deriveCharacter({ abilities: abilities() }, [cls("Fast Hero", 3)]);
  assert.equal(levelPlan({ d: d3, classes: [cls("Fast Hero", 3)], system: {}, cls: classes["Smart Hero"] }).increase, true);
  // A new class at 4th character level: its 1st level, not the character's.
  const smart = levelPlan({ d: d3, classes: [cls("Fast Hero", 3)], system: {}, cls: classes["Smart Hero"] });
  assert.deepEqual([smart.isNew, smart.classLevel, smart.first, smart.skillPoints], [true, 1, false, 9]);
  const ordinary = levelPlan({ d, classes: items, system: { ordinary: true }, cls: items[0] });
  assert.deepEqual([ordinary.talent, ordinary.bonusFeat, ordinary.actionPoints], [false, false, 0]);
});

test("skill points buy a rank of the class's skills, half of any other, up to the new level's maximum", () => {
  const items = [cls("Fast Hero", 1)];
  const d = deriveCharacter({ abilities: abilities(), skills: { hide: { ranks: 4 }, computerUse: { ranks: 1, points: 2 } } }, items);
  const row = (k) => d.skills.find((r) => r.key === k && !r.specialty);
  const hide = skillOffer(row("hide"), classes["Fast Hero"], 2);
  assert.deepEqual([hide.cost, hide.step, hide.max], [1, 1, 5]);
  const computer = skillOffer(row("computerUse"), classes["Fast Hero"], 2);
  assert.deepEqual([computer.cost, computer.step, computer.max], [2, 0.5, 2.5]);
  // As Smart Hero, Computer Use is a class skill: a point a rank.
  assert.equal(skillOffer(row("computerUse"), classes["Smart Hero"], 2).cost, 1);
  const offers = { "hide|": hide, "computerUse|": computer };
  const bought = buyRanks({ specialtySkills: [] }, [row("hide"), row("computerUse")], offers, { "hide|": 1, "computerUse|": 2 });
  assert.deepEqual(bought.skills, { hide: { ranks: 5, points: 5 }, computerUse: { ranks: 2, points: 4 } });
  assert.deepEqual(bought.record, [{ skill: "hide", specialty: "", ranks: 1, points: 1 }, { skill: "computerUse", specialty: "", ranks: 1, points: 2 }]);
  assert.equal(pointsLeft({ "hide|": 1, "computerUse|": 2 }, 5), 2);
  // Taken back: as they were.
  const after = { skills: { hide: { ranks: 5, points: 5 }, computerUse: { ranks: 2, points: 4 } }, specialtySkills: [] };
  assert.deepEqual(unbuyRanks(after, bought.record).skills, { hide: { ranks: 4, points: 4 }, computerUse: { ranks: 1, points: 2 } });
});

test("a specialty's ranks, a language's among them, are bought and taken back on its row", () => {
  const d = deriveCharacter({ abilities: abilities(), specialtySkills: [{ skill: "speakLanguage", specialty: "French", ranks: 0, misc: 0, classSkill: false, points: null }] }, [cls("Smart Hero", 1)]);
  const row = d.skills.find((r) => r.key === "speakLanguage");
  const offer = skillOffer(row, classes["Smart Hero"], 2);
  const system = { specialtySkills: [{ skill: "speakLanguage", specialty: "French", ranks: 0, misc: 0, classSkill: false, points: null }] };
  const bought = buyRanks(system, [row], { "speakLanguage|French": offer }, { "speakLanguage|French": offer.cost });
  assert.equal(bought.specialtySkills[0].ranks, 1);
  assert.equal(unbuyRanks({ specialtySkills: bought.specialtySkills }, bought.record).specialtySkills[0].ranks, 0);
});
