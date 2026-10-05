import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";
import { speciesLanguages, languageRanks } from "../../module/rules/languages.mjs";
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

test("languages bought with ranks are held to the ranks", () => {
  const langs = [
    { name: "English", speak: true, readWrite: true, source: "native" },
    { name: "French", speak: true, readWrite: true, source: "ranks" },
    { name: "Latin", speak: false, readWrite: true, source: "ranks" },
  ];
  const r = languageRanks(langs, { speakRanks: 1, readWriteRanks: 1 });
  assert.deepEqual([r.speak.have, r.speak.over, r.readWrite.have, r.readWrite.over], [1, false, 2, true]);
});

test("starting Wealth: 2d4, the occupation, Windfall, and Profession ranks", () => {
  assert.equal(startingWealth().formula, "2d4");
  assert.equal(startingWealth({ occupation: 2, windfall: true, professionRanks: 2 }).formula, "2d4 + 2 + 3 + 1");
  assert.equal(startingWealth({ professionRanks: 5 }).formula, "2d4");
});
