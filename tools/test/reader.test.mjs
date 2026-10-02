import { test } from "node:test";
import assert from "node:assert/strict";
import { listPages, readPage, toHtml } from "../srd/reader.mjs";

test("lists every page and nothing that is not one", () => {
  const pages = listPages();
  assert.ok(pages.length > 1300, `only ${pages.length} pages`);
  assert.ok(pages.includes("Modern/Feats/Brawl.md"));
  assert.ok(pages.includes("license.md"));
  assert.ok(!pages.includes("README.md"));
});

test("a feat: H1 then one section per heading", () => {
  const page = readPage("Modern/Feats/Brawl.md");
  assert.equal(page.title, "Brawl");
  assert.equal(page.book, "Modern");
  const feat = page.root.child("Brawl");
  assert.deepEqual(feat.children.map((c) => c.title), ["Benefit", "Normal"]);
  assert.match(feat.child("Benefit").blocks[0].text, /^When making an unarmed attack/);
});

test("a creature stat block: key/value rows with their lines", () => {
  const page = readPage("Modern/Creatures/Wolf.md");
  const wolf = page.root.child("Wolf").child("Wolf");
  assert.equal(wolf.stats.CR.value, "1");
  assert.equal(wolf.stats.HD.value, "2d8+4");
  assert.equal(wolf.stats.Size.value, "Medium");
  assert.ok(wolf.stats.HD.line > wolf.line);
  assert.match(wolf.labels.Skills.value, /^Hide \+3/);
});

test("an item table keeps its caption", () => {
  const page = readPage("Modern/Equipment/Weapons/Handguns.md");
  const table = page.root.child("Handguns").blocks.find((b) => b.kind === "table");
  assert.match(table.caption, /^Table: Ranged Weapons: Handguns/);
  assert.equal(table.header[0], "Weapon");
  assert.ok(table.rows.some((r) => r.cells[0].startsWith("Colt Python")));
});

test("renders HTML from the same parse", () => {
  const page = readPage("Modern/Feats/Brawl.md");
  const html = toHtml(page.root.child("Brawl").child("Benefit").blocks.map((b) => b.node));
  assert.match(html, /^<p>When making an unarmed attack/);
});
