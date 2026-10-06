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
