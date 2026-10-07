import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { speciesLanguages, rankedLanguages, migrateLanguages } from "../../module/rules/languages.mjs";
import { deriveCharacter } from "../../module/rules/character.mjs";
import { startingWealth } from "../../module/rules/wealth.mjs";

const species = (name) => PACKS.species().documents.find((d) => d.name === name);

test("a species' languages, merged by language, with any-one choices left to name", () => {
  assert.deepEqual(speciesLanguages(species("Elf").system.languages.free), [
    { name: "Common (or local language)", speak: true, readWrite: true, source: "species" },
    { name: "Elven", speak: true, readWrite: true, source: "species" },
  ]);
  const aasimar = speciesLanguages(species("Aasimar").system.languages.free);
  assert.deepEqual(aasimar.map((l) => [l.name, l.speak, l.readWrite]), [["Celestial", true, true], ["", true, true]]);
  assert.deepEqual(speciesLanguages(species("Half-Ogre").system.languages.free).map((l) => [l.speak, l.readWrite]), [[true, false]]);
});

test("a language bought with ranks is a rank in it, a specialty of its skill: a whole rank, and named", () => {
  const rows = [
    { skill: "speakLanguage", specialty: "French", ranks: 1 },
    { skill: "readWriteLanguage", specialty: "French", ranks: 1 },
    { skill: "readWriteLanguage", specialty: "Latin", ranks: 0.5 },   // half a rank (cross-class, 1 point): not yet
    { skill: "speakLanguage", specialty: "", ranks: 1 },
    { skill: "craft", specialty: "writing", ranks: 4 },
  ];
  assert.deepEqual(rankedLanguages(rows), { speak: ["French"], readWrite: ["French"] });
  // Each costs skill points as any skill's rank does, and is never rolled.
  const d = deriveCharacter({ specialtySkills: rows.slice(0, 3) }, []);
  assert.equal(d.advancement.skillPoints.have, 1 * 2 + 1 * 2 + 0.5 * 2);
  assert.deepEqual(d.skills.filter((r) => r.key === "speakLanguage").map((r) => [r.specialty, r.ranks]), [["French", 1]]);
});

test("a character saved before: its languages bought with ranks become ranks in them, once", () => {
  const before = {
    skills: { speakLanguage: { ranks: 2, misc: 0, classSkill: true, points: 2 }, readWriteLanguage: { ranks: 1, misc: 0, classSkill: false, points: null }, bluff: { ranks: 3 } },
    specialtySkills: [{ skill: "craft", specialty: "writing", ranks: 2, misc: 0, classSkill: false, points: null }],
    languages: [
      { name: "English", speak: true, readWrite: true, source: "native" },
      { name: "French", speak: true, readWrite: true, source: "ranks" },
      { name: "Russian", speak: true, readWrite: false, source: "ranks" },
    ],
  };
  const after = migrateLanguages(before);
  assert.deepEqual(after.languages.map((l) => l.name), ["English"]);
  assert.deepEqual(after.specialtySkills.map((s) => `${s.skill} ${s.specialty} ${s.ranks}${s.classSkill ? " class" : ""}`), [
    "craft writing 2", "speakLanguage French 1 class", "readWriteLanguage French 1", "speakLanguage Russian 1 class",
  ]);
  assert.deepEqual(Object.keys(after.skills), ["bluff"]);
  // Already migrated, or partial (an update of one field): left as it is.
  assert.equal(migrateLanguages(after), after);
  const partial = { hp: { value: 3 } };
  assert.equal(migrateLanguages(partial), partial);
});

test("starting Wealth: 2d4, the occupation, Windfall, and Profession ranks", () => {
  assert.equal(startingWealth().formula, "2d4");
  assert.equal(startingWealth({ occupation: 2, windfall: true, professionRanks: 2 }).formula, "2d4 + 2 + 3 + 1");
  assert.equal(startingWealth({ professionRanks: 5 }).formula, "2d4");
});
