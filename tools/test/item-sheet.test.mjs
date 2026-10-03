import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";

// Just enough of Foundry for the sheet module to load outside it.
class Base {}
globalThis.foundry = {
  utils: { escapeHTML: (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`) },
  applications: { api: { HandlebarsApplicationMixin: (c) => c }, sheets: { ItemSheetV2: Base }, ux: { TextEditor: {} } },
};
const { rows } = await import("../../module/item-sheet.mjs");

const items = Object.entries(PACKS).filter(([p]) => p !== "rules").flatMap(([, b]) => b().documents).filter((d) => d.system);
const byName = (n) => items.find((d) => d.name === n);
const table = (n) => Object.fromEntries(rows(byName(n).system).map((r) => [r.label, r.html]));

test("every item's field table renders without throwing, and never shows an empty or object value", () => {
  for (const d of items) for (const r of rows(d.system)) {
    assert.ok(r.html, `${d.name}: ${r.label}`);
    assert.doesNotMatch(r.html, /\[object Object\]|undefined/, `${d.name}: ${r.label}`);
  }
});

test("printed values, links and nested values show", () => {
  const beretta = table("Beretta 92F (9mm autoloader)");
  assert.equal(beretta["Weight: Value"], "3 lb.");
  assert.match(beretta.Proficiency, /^@UUID\[Compendium\.modern20\.feats\.Item\.\w+\]\{Personal Firearms Proficiency\}$/);
  assert.equal(beretta.Description, undefined);   // shown as prose, not in the table
  const gaseous = table("Gaseous Form");
  assert.equal(gaseous["Components: Text: Material"], "A bit of gauze or pinch of ash.");
  assert.equal(gaseous.Levels, "Arcane 3");
  assert.equal(gaseous["Components: Verbal"], undefined);   // a false flag
  const dwarf = table("Dwarf");
  assert.equal(dwarf["Abilities: Con"], "2");
  assert.equal(dwarf["Abilities: Str"], undefined);         // a zero modifier
  assert.equal(dwarf["Special Qualities"], undefined);      // shown as prose
  assert.match(table("Teleport")["Failure: Text"], /^Mirrorcast\./);
});
