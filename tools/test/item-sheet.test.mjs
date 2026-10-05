import { test } from "node:test";
import assert from "node:assert/strict";
import { PACKS } from "../build/packs.mjs";

// Just enough of Foundry for the sheet module to load outside it.
class Base {}
globalThis.foundry = {
  utils: { escapeHTML: (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`) },
  applications: { api: { HandlebarsApplicationMixin: (c) => c }, sheets: { ItemSheetV2: Base }, ux: { TextEditor: {} } },
};
const { rows, levelTable, requirementsList, sizeTable } = await import("../../module/sheets/document-sheet.mjs");

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

test("a class's level table and requirements render", () => {
  const soldier = byName("Soldier").system;
  const t = levelTable(soldier.levels);
  assert.equal((t.match(/<tr>/g) ?? []).length, 11);   // header + 10 levels
  assert.match(t, /<td>Weapon Focus<\/td>/);
  assert.match(requirementsList(soldier.requirements), /@UUID\[Compendium\.modern20\.feats\.Item\.\w+\]\{Personal Firearms Proficiency\}/);
});

test("a creature's table shows its stats, skills with bonuses, and linked feats", () => {
  const wolf = table("Wolf");
  assert.equal(wolf["Abilities: Dex"], "15");
  assert.equal(wolf["Special Qualities"], "scent, trip, low-light vision");
  assert.equal(wolf.Skills, "Hide +3, Listen +6, Move Silently +4, Spot +4, Survival +1 (+5 when tracking by scent)");
  assert.match(table("Troll Tough Hero 7").Talents, /@UUID\[Compendium\.modern20\.talents\.Item\.\w+\]\{Acid Resistance \[Acid resistance 7\]\}/);
});

test("a creature type's size table and a template's fields render", () => {
  const undead = byName("Undead").system;
  assert.equal(table("Undead").Traits, undefined);   // shown as prose with their text
  assert.match(sizeTable(undead.sizes), /<th>Minimum Hit Dice<\/th>/);
  const zombie = table("Zombie");
  assert.equal(zombie.Type, "undead");
  assert.equal(zombie["Abilities: Changes: Str"], "2");
});
