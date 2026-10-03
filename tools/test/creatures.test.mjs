import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCreatures, splitList } from "../build/creatures.mjs";
import { buildFeats } from "../build/feats.mjs";

const { documents, problems } = buildCreatures();
const actors = documents.filter((d) => d._key.startsWith("!actors!"));
const byName = Object.fromEntries(actors.map((d) => [d.name, d]));
const featName = Object.fromEntries(buildFeats().documents.map((d) => [`Compendium.modern20.feats.Item.${d._id}`, d.name]));

test("creatures build with every check passing, one actor per stat block", () => {
  assert.deepEqual(problems, []);
  assert.equal(actors.length, 304);
  assert.ok(actors.every((d) => d.type === "creature" && d.folder));
  assert.equal(byName["Create Crawling Claw"], undefined);   // a spell's stat block on a creature page
});

test("a stat block is read into numbers and text", () => {
  const s = byName.Wolf.system;
  assert.deepEqual(s.cr, { value: "1", number: 1 });
  assert.equal(s.size, "medium");
  assert.equal(s.hitDice, "2d8+4");
  assert.equal(s.hp, 13);
  assert.deepEqual(s.defense, { value: 14, touch: 12, flatFooted: 12, breakdown: "+2 Dex, +2 natural", flameShield: "" });
  assert.deepEqual(s.saves, { fort: 5, ref: 5, will: 1 });
  assert.deepEqual(s.abilities, { str: 13, dex: 15, con: 15, int: 2, wis: 12, cha: 6 });
  assert.deepEqual(s.skills.at(-1), { name: "Survival", specialty: "", bonus: 1, note: "+5 when tracking by scent" });
  assert.match(s.description, /Scent \(Ex\)/);   // the page's species traits
});

test("feats and talents link to their packs; nonabilities are null", () => {
  const troll = byName["Troll Tough Hero 7"].system;
  assert.ok(troll.talents.length >= 4 && troll.talents.every((t) => t.uuid));
  const linked = actors.flatMap((a) => a.system.feats).filter((f) => f.uuid);
  assert.ok(linked.length > 700 && linked.every((f) => featName[f.uuid]));
  const zombie = byName["Human Zombie"].system;
  assert.equal(zombie.abilities.int, null);
});

test("lists split on commas outside parentheses", () => {
  assert.deepEqual(splitList("Hide +3, Survival +1 (+5 when tracking, by scent), Spot +4."), ["Hide +3", "Survival +1 (+5 when tracking, by scent)", "Spot +4"]);
});

test("pages with several creatures get a folder of their own", () => {
  const folders = documents.filter((d) => d._key.startsWith("!folders!"));
  const vivilor = actors.find((a) => a.name === "1st-level Vivilor");
  const f = folders.find((x) => x._id === vivilor.folder);
  assert.ok(f.folder, "nested under its book");
});
