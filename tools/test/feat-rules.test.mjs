import { test } from "node:test";
import assert from "node:assert/strict";
import { FEAT_RULES } from "../../module/rules/feats.mjs";
import { slug, identify } from "../../module/rules/identify.mjs";
import { PACKS } from "../build/packs.mjs";
import { SKILLS, skillKey } from "../../module/data/skills.mjs";

const items = Object.entries(PACKS).filter(([p]) => p !== "rules" && p !== "creatures").flatMap(([, b]) => b().documents).filter((d) => d.system && d._key.startsWith("!items!"));
const featsAndTalents = items.filter((d) => ["feat", "talent", "feature"].includes(d.type));

test("identifiers are slugs of the printed name, without a split duplicate's book", () => {
  assert.equal(slug("Armor Proficiency (light)"), "armor-proficiency-light");
  assert.equal(slug("Wild Talent (Arcana)"), "wild-talent");
  assert.equal(slug("Captain’s Log"), "captains-log");
  assert.equal(identify({ name: "Iron Will", system: {} }), "iron-will");
  assert.equal(identify({ name: "Renamed", system: { identifier: "iron-will" } }), "iron-will");
});

test("every item in the packs carries its identifier, and both copies of a split feat share one", () => {
  assert.deepEqual(items.filter((d) => !d.system.identifier).map((d) => d.name), []);
  const wild = featsAndTalents.filter((d) => /^Wild Talent/.test(d.name));
  assert.equal(wild.length, 2);
  assert.ok(wild.every((d) => d.system.identifier === "wild-talent"));
});

test("every feat, talent or class feature the registry gives rules is one the packs have", () => {
  const ids = new Set(featsAndTalents.map((d) => d.system.identifier));
  for (const id of Object.keys(FEAT_RULES)) assert.ok(ids.has(id), id);
});

test("the registry's class skills are skills", () => {
  for (const [id, r] of Object.entries(FEAT_RULES)) for (const s of r.classSkills ?? []) {
    assert.ok(SKILLS[skillKey(s.replace(/ \(.*\)$/, ""))], `${id}: ${s}`);
  }
});
