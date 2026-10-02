import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSpells, buildPowers, buildIncantations, readFx, kindOf } from "../build/fx.mjs";

const spells = buildSpells();
const powers = buildPowers();
const items = (r) => r.documents.filter((d) => !d._key.startsWith("!folders!"));

test("spells and powers build with every layout check passing", () => {
  assert.deepEqual(spells.problems, []);
  assert.deepEqual(powers.problems, []);
});

test("index pages are not read as spells or powers", () => {
  assert.equal(kindOf("Arcana/Spells/ArcaneSpells.md"), null);
  assert.equal(kindOf("Modern/FX/Spells/spells.md"), null);
  assert.equal(kindOf("Modern/FX/Spells/Aid.md"), "spell");
  assert.equal(kindOf("Arcana/Psionics/Knock.md"), "power");
});

test("no two spells or two powers share a name", () => {
  for (const r of [spells, powers]) {
    const names = items(r).map((d) => d.name);
    assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), []);
  }
  const names = new Set(items(spells).map((d) => d.name));
  assert.ok(names.has("Shatter (Modern)") && names.has("Shatter (Arcana)"));
});

test("a spell's stat block is read into fields", () => {
  const { entry, problems } = readFx("Arcana/Spells/GaseousForm.md");
  assert.deepEqual(problems, []);
  const s = entry.system;
  assert.equal(s.school, "Transmutation");
  assert.deepEqual(s.levels, [{ class: "Arcane", level: 3 }]);
  assert.equal(s.components.value, "S, M");
  assert.equal(s.components.verbal, false);
  assert.equal(s.components.material, true);
  assert.equal(s.components.text.material, "A bit of gauze or pinch of ash.");
  assert.deepEqual(s.target, { label: "Target", value: "Willing corporeal creature touched" });
  assert.equal(s.spellResistance, "No");
});

test("a power's stat block is read into fields", () => {
  const { entry, problems } = readFx("Modern/FX/Psionics/FireStorm.md");
  assert.deepEqual(problems, []);
  const s = entry.system;
  assert.equal(s.keyAbility, "int");
  assert.deepEqual(s.descriptors, ["Fire"]);
  assert.deepEqual(s.levels, [{ class: "Battle Mind", level: 4 }]);
  assert.deepEqual(s.display.types, ["visual"]);
  assert.deepEqual(s.target, { label: "Area", value: "30-ft.-radius spread" });
  assert.equal(s.powerPointCost.value, 7);
});

test("multi-class levels and costs with notes", () => {
  const { entry } = readFx("Arcana/Psionics/CallWeaponry.md");
  assert.deepEqual(entry.system.levels, [{ class: "Telepath", level: 1 }, { class: "Psionic Agent", level: 1 }]);
  assert.deepEqual(entry.system.powerPointCost, { value: 1, text: "1 (see text)" });
});

test("incantations build with every layout check passing", () => {
  const r = buildIncantations();
  assert.deepEqual(r.problems, []);
  assert.equal(kindOf("Arcana/Incantations/incantations.md"), null);
});

test("an incantation's skill checks, components and failure are read", () => {
  const { entry, problems } = readFx("Arcana/Incantations/Teleport.md");
  assert.deepEqual(problems, []);
  const s = entry.system;
  assert.deepEqual(s.skillCheck.checks, [
    { skill: "Knowledge (arcane lore)", dc: 31, successes: 5 },
    { skill: "Navigate", dc: 31, successes: 1 },
  ]);
  assert.equal(s.components.secondaryCasters, true);
  assert.equal(s.components.backlash, true);
  assert.equal(s.components.text.backlash, "All casters take 2d6 points of damage.");
  assert.match(s.failure.text, /^Mirrorcast\./);
  assert.match(s.options, /global positioning system/);
  assert.equal(s.levels, undefined);
});
