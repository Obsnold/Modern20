import { test } from "node:test";
import assert from "node:assert/strict";
import { buildClasses } from "../build/classes.mjs";
import { buildEquipment } from "../build/equipment.mjs";
import { deriveCharacter } from "../../module/rules/character.mjs";
import * as R from "../../module/rules/rolls.mjs";
import { applyEffects } from "../../module/rules/effects.mjs";
import { buildFeats } from "../build/feats.mjs";

const classes = Object.fromEntries(buildClasses().documents.filter((d) => d.type === "class").map((d) => [d.name, d]));
const gear = Object.fromEntries(buildEquipment().documents.filter((d) => d.system).map((d) => [d.name, d]));

// A Strong Hero 3 with Str 16, Dex 13, and Iron Will (its effect applied, as Foundry would).
const ironWill = buildFeats().documents.find((x) => x.name === "Iron Will");
const d = deriveCharacter(
  applyEffects({ system: { abilities: { str: { value: 16 }, dex: { value: 13 }, con: { value: 12 }, wis: { value: 10 } }, skills: { climb: { ranks: 6, misc: 0 }, decipherScript: { ranks: 0, misc: 0 } } } }, ironWill.effects).system,
  [{ type: "class", name: "Strong Hero", system: { ...classes["Strong Hero"].system, level: 3 } }],
);

test("formulas show each modifier as rolled, and leave out zeros", () => {
  assert.equal(R.d20("x", [{ label: "a", value: 3 }, { label: "b", value: 0 }, { label: "c", value: -2 }]).formula, "1d20 + 3 - 2");
  assert.equal(R.abilityCheck(d, "str").formula, "1d20 + 3");
});

test("a save: base, ability and feats", () => {
  const will = R.savingThrow(d, "will");
  assert.deepEqual(will.terms, [{ label: "Base", value: 1 }, { label: "Feats", value: 2 }]);   // Strong Hero 3 Will +1, Wis +0, Iron Will
  assert.equal(will.formula, "1d20 + 1 + 2");
});

test("a skill: ranks and ability; a trained-only skill without ranks cannot be rolled", () => {
  const climb = R.skillCheck(d, d.skills.find((s) => s.key === "climb"));
  assert.equal(climb.formula, "1d20 + 6 + 3");
  assert.ok(R.skillCheck(d, d.skills.find((s) => s.key === "decipherScript")).unusable);
});

test("criticals as printed", () => {
  assert.deepEqual(R.critical("20"), { threat: 20, multiplier: 2 });
  assert.deepEqual(R.critical("19–20"), { threat: 19, multiplier: 2 });
  assert.deepEqual(R.critical("20/x3"), { threat: 20, multiplier: 3 });
  assert.deepEqual(R.critical("x3/x4¹"), { threat: 20, multiplier: 3 });
  assert.equal(R.critical("—"), null);
});

test("a melee attack and its damage add Str; without the proficiency feat it is −4", () => {
  const knife = gear.Knife;
  const a = R.attack(d, knife, ["Simple Weapons Proficiency"]);
  assert.equal(a.formula, `1d20 + ${d.baseAttackBonus} + 3`);
  assert.deepEqual(R.damage(d, knife).formula, `${knife.system.damage.formula} + 3`);
  const untrained = R.attack(d, knife, []);
  assert.equal(untrained.terms.at(-1).value, -4);
});

test("a firearm's attack uses Dex and its damage no Str", () => {
  const glock = gear["Glock 17 (9mm autoloader)"];
  const a = R.attack(d, glock, ["Personal Firearms Proficiency"]);
  assert.equal(a.formula, `1d20 + ${d.baseAttackBonus} + 1`);
  assert.equal(R.damage(d, glock).formula, "2d6");
  assert.deepEqual(a.critical, { threat: 20, multiplier: 2 });
});

test("every weapon in the pack can be turned into an attack, and damage where it is dice", () => {
  for (const w of Object.values(gear).filter((g) => g.type === "weapon")) {
    const a = R.attack(d, w, []);
    assert.match(a.formula, /^1d20( [+-] \d+)*$/, w.name);
    const dmg = R.damage(d, w);
    if (dmg) assert.match(dmg.formula, /^\d+d\d+( [+-] \d+)?$/, w.name);
  }
});

test("an action point's die by character level", () => {
  assert.equal(R.actionPointDie(1).formula, "1d6");
  assert.equal(R.actionPointDie(7).formula, "1d6");
  assert.equal(R.actionPointDie(8).formula, "2d6kh");
  assert.equal(R.actionPointDie(14).formula, "2d6kh");
  assert.equal(R.actionPointDie(15).formula, "3d6kh");
});

test("a situational modifier and an action point join the roll and its breakdown", () => {
  const climb = R.skillCheck(d, d.skills.find((s) => s.key === "climb"));
  const r = R.withAdditions(climb, { modifier: -2, actionPoint: R.actionPointDie(3) });
  assert.equal(r.formula, "1d20 + 6 + 3 - 2 + 1d6");
  assert.deepEqual(r.terms.slice(-2), [{ label: "Situational", value: -2 }, { label: "Action point (1d6)", value: "1d6" }]);
  assert.equal(R.withAdditions(climb, {}).formula, climb.formula);
});

test("critical damage rolls the damage that many times", () => {
  const dmg = R.damage(d, gear.Knife);
  const crit = R.criticalDamage(dmg, 3);
  assert.equal(crit.formula, `(${dmg.formula}) + (${dmg.formula}) + (${dmg.formula})`);
  assert.match(crit.title, /critical \(×3\)$/);
});

test("effect bonuses reach attacks, damage and skills", () => {
  const knife = gear.Knife;
  const buffed = { ...d, attackBonus: { melee: 1, ranged: 0 }, damageBonus: { melee: 2, ranged: 0 } };
  assert.equal(R.attack(buffed, knife, ["Simple Weapons Proficiency"]).formula, `1d20 + ${d.baseAttackBonus} + 3 + 1`);
  assert.equal(R.damage(buffed, knife).formula, `${knife.system.damage.formula} + 3 + 2`);
});
