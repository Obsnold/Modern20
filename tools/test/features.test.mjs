import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { featuresDue, featureChanges } from "../../module/rules/features.mjs";
import { damage } from "../../module/rules/rolls.mjs";

const classes = Object.fromEntries(PACKS.classes().documents.filter((d) => d.system).map((d) => [d.name, d]));
const features = PACKS.features().documents.filter((d) => d.system);
const cls = (name, level, id = name) => ({ id, name, system: { ...classes[name].system, level } });

test("every class feature but bonus feats and talents is an item, linked from its class", () => {
  for (const c of Object.values(classes)) for (const f of c.system.features) {
    if (["Bonus Feats", "Talents"].includes(f.name)) assert.equal(f.uuid, "", `${c.name}: ${f.name}`);
    else assert.ok(features.some((x) => f.uuid.endsWith(x._id) && x.name === f.name && x.system.className === c.name), `${c.name}: ${f.name}`);
  }
});

test("features come as the class reaches their levels, with how many of those levels it has", () => {
  const due = (level) => featuresDue([cls("Soldier", level)]).map((f) => `${f.name} ${f.rank}`);
  assert.deepEqual(due(1), ["Weapon Focus 1"]);
  assert.deepEqual(due(2), ["Weapon Focus 1", "Weapon Specialization 1"]);
  assert.ok(!due(7).includes("Greater Weapon Specialization 1"));
  assert.ok(due(8).includes("Greater Weapon Specialization 1"));
  const thrasher = featuresDue([cls("Thrasher", 8)]).find((f) => f.name === "Ability Surge");
  assert.equal(thrasher.rank, 3);   // at 2nd, 5th and 8th
});

test("bringing a character's features into line: added, taken away, re-ranked, and others left alone", () => {
  const due = featuresDue([cls("Soldier", 2, "s1")]);
  const owned = [
    { id: "a", classId: "s1", name: "Weapon Focus", rank: 1 },
    { id: "b", classId: "s1", name: "Tactical Aid", rank: 1 },   // above its level now
    { id: "c", classId: "gone", name: "Evasion", rank: 1 },       // its class removed
  ];
  const c = featureChanges(due, owned);
  assert.deepEqual(c.add.map((f) => f.name), ["Weapon Specialization"]);
  assert.deepEqual(c.remove, ["b", "c"]);
  assert.deepEqual(c.ranks, []);
  assert.deepEqual(featureChanges(featuresDue([cls("Thrasher", 5, "t")]), [{ id: "x", classId: "t", name: "Ability Surge", rank: 1 }]).ranks, [{ id: "x", rank: 2 }]);
});

test("Weapon Specialization: +2 damage with the weapon chosen, +4 with the Greater form", () => {
  const club = PACKS.equipment().documents.find((d) => d.name === "Club");
  const d = { modifiers: { str: 1 }, damageBonus: {} };
  const spec = (choice) => ({ name: "Weapon Specialization", identifier: "weapon-specialization", choice });
  const greater = { name: "Greater Weapon Specialization", identifier: "greater-weapon-specialization", choice: "club" };
  assert.equal(damage(d, club, { feats: [spec("club")] }).formula, "1d6 + 1 + 2");
  assert.equal(damage(d, club, { feats: [spec("knife")] }).formula, "1d6 + 1");
  assert.equal(damage(d, club, { feats: [spec("club"), greater] }).formula, "1d6 + 1 + 4");
});

test("Ability Surge is built switched off, for the player to switch on while surging", () => {
  const surge = features.find((f) => f.name === "Ability Surge");
  const toggle = surge.effects.find((e) => e.disabled);
  assert.ok(toggle, "a switched-off effect");
  assert.deepEqual(toggle.system.changes.map((c) => [c.key, c.value]).slice(0, 2), [["system.bonuses.abilities.str", 4], ["system.bonuses.abilities.dex", 4]]);
});

test("class feature mechanics: rank in formulas, damage reduction a magic weapon overcomes, Greater Weapon Focus", async () => {
  const { deriveCharacter } = await import("../../module/rules/character.mjs");
  const { reduceDamage } = await import("../../module/rules/resistance.mjs");
  const { attack } = await import("../../module/rules/rolls.mjs");
  const abilities = Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: 10 }]));
  const own = (name, rank = 1, system = {}) => { const f = features.find((x) => x.name === name); return { type: "feature", name, system: { ...f.system, rank, ...system }, effects: f.effects }; };
  // Medical Specialist: +1, +2 at 5th, +3 at 8th.
  for (const rank of [1, 2, 3]) {
    const d = deriveCharacter({ abilities }, [own("Medical Specialist", rank)]);
    assert.equal(d.skills.find((r) => r.key === "treatInjury").total, rank);
  }
  assert.equal(deriveCharacter({ abilities }, [own("Improved Reaction")]).initiative, 2);
  // The Thrasher's 5/+1: stops a club, not a magic weapon (the card's Ignore DR).
  const thrasher = deriveCharacter({ abilities }, [own("Damage Reduction")]).defenses;
  assert.deepEqual(thrasher.dr, [{ amount: 5, overcome: "+1" }]);
  assert.equal(reduceDamage([{ type: "Bludgeoning", amount: 8 }], thrasher).total, 3);
  // A Gunslinger's Greater Weapon Focus: +1 more with the firearm chosen.
  const beretta = PACKS.equipment().documents.find((d) => d.name === "Beretta 92F (9mm autoloader)");
  const d = { baseAttackBonus: 2, modifiers: { str: 0, dex: 0 }, size: "medium", defense: {}, attackBonus: {} };
  const focus = attack(d, beretta, [{ name: "Personal Firearms Proficiency" }, { name: "Weapon Focus", choice: "Beretta 92F" }, { name: "Greater Weapon Focus", choice: "Beretta 92F" }]);
  assert.ok(focus.terms.some((t) => t.label === "Weapon Focus" && t.value === 2));
});
