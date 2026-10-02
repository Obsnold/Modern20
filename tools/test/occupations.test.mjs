import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOccupations, isOccupation } from "../build/occupations.mjs";
import { buildFeats } from "../build/feats.mjs";

const { documents, problems } = buildOccupations();
const byName = Object.fromEntries(documents.filter((d) => d.type === "occupation").map((d) => [d.name, d]));
const featName = Object.fromEntries(buildFeats().documents.map((d) => [`Compendium.modern20.feats.Item.${d._id}`, d.name]));

test("occupations build with every layout check passing", () => {
  assert.deepEqual(problems, []);
  assert.equal(isOccupation("Modern/Occupations/occupations.md"), false);
  assert.equal(isOccupation("Modern/Occupations/Academic.md"), true);
});

test("stats, skills and languages are read", () => {
  const s = byName.Academic.system;
  assert.equal(s.prerequisite, "Age 23+");
  assert.equal(s.minimumAge, 23);
  assert.equal(s.reputationBonus, 0);
  assert.equal(s.wealthBonus, 3);
  assert.equal(s.skills.choose, 3);
  assert.deepEqual(s.skills.options[1], { name: "Craft", specialty: "writing", ability: "int" });
  assert.match(s.skills.languages, /Read\/Write Language/);
  assert.deepEqual(s.feats, { choose: 0, options: [] });
});

test("bonus feats link to the feats pack, preferring the occupation's own book", () => {
  const psychic = byName.Psychic.system.feats;
  assert.equal(psychic.choose, 1);
  assert.deepEqual(psychic.options.map((o) => featName[o.uuid]), ["Iron Will", "Wild Talent (Arcana)"]);
  const astro = byName["Astronaut Trainee"].system.feats.options[0];
  assert.equal(astro.name, "Aircraft Operation");
  assert.equal(astro.specialty, "spacecraft");
  assert.equal(featName[astro.uuid], "Aircraft Operation");
});

test("a feat list with no Select line grants every feat", () => {
  assert.deepEqual(byName.Outcast.system.feats.choose, 1);
  assert.equal(featName[byName.Outcast.system.feats.options[0].uuid], "Toughness");
});

test("extra sections stay in the description", () => {
  assert.match(byName.Heir.system.description, /<h2>Pre-Selected Feat<\/h2>/);
  assert.match(byName.Heir.system.description, /<h2>Wealth Bonus<\/h2>/);
  assert.doesNotMatch(byName.Heir.system.description, /<h2>Skills<\/h2>/);
});
