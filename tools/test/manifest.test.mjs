import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PACKS } from "../build/packs.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const manifest = JSON.parse(readFileSync(`${ROOT}system.json`, "utf8"));
const lang = JSON.parse(readFileSync(`${ROOT}lang/en.json`, "utf8"));

test("system.json declares exactly the packs the build writes", () => {
  assert.deepEqual(manifest.packs.map((p) => p.name).sort(), Object.keys(PACKS).sort());
  for (const p of manifest.packs) assert.equal(p.path, `packs/${p.name}`);
  // Every pack sits in exactly one pack folder, at any depth.
  const packsIn = (folders) => folders.flatMap((f) => [...(f.packs ?? []), ...packsIn(f.folders ?? [])]);
  assert.deepEqual(packsIn(manifest.packFolders).sort(), Object.keys(PACKS).sort());
});

test("every document the build writes has a type system.json declares, and a label", () => {
  const declared = Object.keys(manifest.documentTypes.Item);
  for (const [pack, build] of Object.entries(PACKS)) {
    const declaredType = manifest.packs.find((p) => p.name === pack).type;
    for (const doc of build().documents) {
      if (doc._key.startsWith("!folders!")) continue;
      if (declaredType === "Item") assert.ok(declared.includes(doc.type), `${pack}: ${doc.name} is a "${doc.type}"`);
      else assert.ok(doc._key.startsWith("!journal!"), `${pack}: ${doc.name}`);
    }
  }
  for (const type of declared) assert.ok(lang.TYPES.Item[type], `no label for ${type}`);
});

test("files the manifest names exist", () => {
  for (const f of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map((l) => l.path), "templates/item-sheet.hbs"]) {
    assert.ok(existsSync(`${ROOT}${f}`), f);
  }
});
