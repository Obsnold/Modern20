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
  for (const [pack, build] of Object.entries(PACKS)) {
    const packType = manifest.packs.find((p) => p.name === pack).type;
    for (const doc of build().documents) {
      if (doc._key.startsWith("!folders!")) continue;
      if (packType === "JournalEntry") assert.ok(doc._key.startsWith("!journal!"), `${pack}: ${doc.name}`);
      else {
        assert.ok(doc._key.startsWith(packType === "Actor" ? "!actors!" : "!items!"), `${pack}: ${doc.name}`);
        assert.ok(doc.type in manifest.documentTypes[packType], `${pack}: ${doc.name} is a "${doc.type}"`);
      }
    }
  }
  for (const [documentName, types] of Object.entries(manifest.documentTypes)) {
    for (const type of Object.keys(types)) assert.ok(lang.TYPES[documentName]?.[type], `no label for ${documentName} ${type}`);
  }
});

test("files the manifest names exist", () => {
  for (const f of [...manifest.esmodules, ...manifest.styles, ...manifest.languages.map((l) => l.path), "templates/document-sheet.hbs"]) {
    assert.ok(existsSync(`${ROOT}${f}`), f);
  }
});
