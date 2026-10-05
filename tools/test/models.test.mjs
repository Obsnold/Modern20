import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PACKS, modelFor } from "../build/packs.mjs";
import { ITEM_MODELS, ACTOR_MODELS, abilityModifier } from "../../module/data/models.mjs";
import { validate, conform, initial, obj, str, int, list } from "../../module/data/schema.mjs";

const manifest = JSON.parse(readFileSync(fileURLToPath(new URL("../../system.json", import.meta.url)), "utf8"));

test("every type system.json declares has a model, and every model a declared type", () => {
  assert.deepEqual(Object.keys(ITEM_MODELS).sort(), Object.keys(manifest.documentTypes.Item).sort());
  assert.deepEqual(Object.keys(ACTOR_MODELS).sort(), Object.keys(manifest.documentTypes.Actor).sort());
});

test("every document the build writes matches its model exactly", () => {
  const problems = [];
  let checked = 0;
  for (const [pack, build] of Object.entries(PACKS)) {
    for (const doc of build().documents) {
      const model = modelFor(doc);
      if (model === null) continue;
      if (model === undefined) { problems.push(`${pack}: "${doc.name}" is a "${doc.type}", which has no model`); continue; }
      checked++;
      for (const p of validate(model, doc.system)) problems.push(`${pack}: "${doc.name}" ${p}`);
    }
  }
  assert.deepEqual(problems.slice(0, 20), []);
  assert.ok(checked > 1400, `${checked} documents checked`);
});

test("the checker reports what Foundry would drop or reject", () => {
  const m = obj({ name: str(), size: str({ choices: ["small", "medium"] }), hp: int({ nullable: true }), tags: list(str()) });
  assert.deepEqual(validate(m, { name: "x", size: "medium", hp: null, tags: [] }), []);
  assert.deepEqual(validate(m, { name: "x", size: "huge", hp: 1.5, tags: [1], extra: true }), [
    'system: "extra" is not a field (Foundry would drop it)',
    'system.size: "huge" is not one of small, medium',
    "system.hp: expected a whole number, got 1.5",
    "system.tags[0]: expected a string, got 1",
  ]);
  assert.deepEqual(conform(m, { name: "x" }), { name: "x", size: "", hp: null, tags: [] });
  assert.deepEqual(initial(obj(ITEM_MODELS.feat)).source, { book: "", page: "" });
});

test("ability modifiers", () => {
  assert.deepEqual([3, 9, 10, 11, 18, 21].map(abilityModifier), [-4, -1, 0, 0, 4, 5]);
  assert.equal(abilityModifier(null), null);
});

test("no description links to a markdown page (only the rules journal turns those into Foundry links)", () => {
  const offenders = [];
  for (const [pack, build] of Object.entries(PACKS)) {
    if (pack === "rules") continue;
    for (const doc of build().documents) {
      if (doc.system && /href="[^"]*\.md(#[^"]*)?"/.test(JSON.stringify(doc.system))) offenders.push(`${pack}: ${doc.name}`);
    }
  }
  assert.deepEqual(offenders, []);
});
