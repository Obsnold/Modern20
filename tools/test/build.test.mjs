import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFeats, readFeat } from "../build/feats.mjs";
import { buildJournal, journalIds } from "../build/journal.mjs";

const journal = buildJournal();
const feats = buildFeats();
const items = feats.documents.filter((d) => d.type === "feat");

test("the journal builds with every link resolved", () => {
  assert.deepEqual(journal.problems, []);
});

test("journal and feat IDs are unique", () => {
  for (const docs of [journal.documents, feats.documents]) {
    const ids = docs.map((d) => d._id);
    assert.equal(new Set(ids).size, ids.length);
  }
});

test("feats build with every layout check passing", () => {
  assert.deepEqual(feats.problems, []);
});

test("no two feats share a name", () => {
  const names = items.map((d) => d.name);
  assert.deepEqual(names.filter((n, i) => names.indexOf(n) !== i), []);
});

test("feats printed in two books keep both copies, named by book", () => {
  const names = new Set(items.map((d) => d.name));
  for (const n of ["Jack of All Trades (Arcana)", "Jack of All Trades (Future)", "Wild Talent (Arcana)", "Wild Talent (Modern)"]) {
    assert.ok(names.has(n), n);
  }
  assert.ok(!names.has("Wild Talent"));
});

test("every feat has a benefit and links to its own journal page", () => {
  const pages = new Set(journal.documents.filter((d) => d.pages).map((d) => `${d._id}.${d.pages[0]._id}`));
  for (const d of items) {
    assert.ok(d.system.benefit, d.name);
    const { entry, page } = journalIds(d.flags.modern20.srd);
    assert.ok(pages.has(`${entry}.${page}`), d.name);
    assert.ok(d.system.source.page.endsWith(`JournalEntry.${entry}.JournalEntryPage.${page}`), d.name);
  }
});

test("a feat page is read into its sections", () => {
  const { feat, problems } = readFeat("Modern/Feats/Cleave.md");
  assert.deepEqual(problems, []);
  assert.equal(feat.name, "Cleave");
  assert.equal(feat.featType, "general");
  assert.equal(feat.prerequisites, "Strength 13, Power Attack.");
  assert.match(feat.benefit, /^<p>/);
});
