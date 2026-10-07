import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { featPrerequisites } from "../../module/rules/prerequisites.mjs";
import { deriveCharacter } from "../../module/rules/character.mjs";
import { slug } from "../../module/rules/identify.mjs";

const feats = PACKS.feats().documents.filter((d) => d.system);
const known = new Set(feats.map((f) => slug(f.name)));
const classes = Object.fromEntries(PACKS.classes().documents.filter((d) => d.type === "class").map((d) => [d.name, d]));
const abilities = (o) => Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((a) => [a, { value: o[a] ?? 10 }]));
const check = (text, d, owned = []) => featPrerequisites(text, { d, feats: owned, known });

test("ability scores, base attack bonus, a base save, character level and feats", () => {
  const d = deriveCharacter({ abilities: abilities({ dex: 14, str: 12 }) }, [{ type: "class", name: "Fast Hero", system: { ...classes["Fast Hero"].system, level: 4 } }]);
  assert.deepEqual(check("Dexterity 13, Dodge.", d, ["Dodge"]), { met: true, missing: [], check: [] });
  assert.deepEqual(check("Dexterity 13, Dodge.", d).missing, ["Dodge"]);
  assert.deepEqual(check("Strength 13, Power Attack.", d, ["Power Attack"]).missing, ["Strength 13"]);
  assert.equal(check("Base attack bonus +2 or better.", d).met, true);   // Fast Hero 4: +2
  assert.equal(check("Base attack bonus +6.", d).met, false);
  assert.equal(check("Base Fortitude save bonus +5.", d).met, false);
  assert.equal(check("Character level 8th+.", d).met, false);
  assert.equal(check("Armor Proficiency (light).", d, ["Armor Proficiency (light)"]).met, true);
});

test("skill ranks, one of two skills, a specialty, and what is the table's to check", () => {
  const d = deriveCharacter({ abilities: abilities({}), skills: { drive: { ranks: 6 } }, specialtySkills: [{ skill: "craft", specialty: "electrical", ranks: 8 }] }, [{ type: "class", name: "Smart Hero", system: { ...classes["Smart Hero"].system, level: 5 } }]);
  assert.equal(check("Drive 4 ranks.", d).met, true);
  assert.equal(check("Dexterity 13, Drive 6 ranks or Pilot 6 ranks, Vehicle Expert.", d, ["Vehicle Expert"]).missing.join(), "Dexterity 13");
  assert.equal(check("Craft (electrical) 8 ranks.", d).met, true);
  assert.equal(check("Craft (mechanical) 8 ranks.", d).met, false);
  const table = check("Proficient with weapon, base attack bonus +1.", d);
  assert.deepEqual([table.met, table.check], [null, ["Proficient with weapon"]]);
});

test("nearly every feat's prerequisites are read, the rest left for the table", () => {
  const d = deriveCharacter({ abilities: abilities({}) }, []);
  const left = feats.filter((f) => f.system.prerequisites).flatMap((f) => check(f.system.prerequisites, d).check);
  // Turning undead, a mecha's hands, natural weapons, an allegiance, flying, proficiency with the weapon, Spell Mastery.
  assert.ok(left.length <= 13, left.join("; "));
});
