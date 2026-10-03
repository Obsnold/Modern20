/**
 * Modern20: a Foundry VTT system for the d20 Modern SRD.
 *
 * This is the first step of the rebuild: enough of a system for Foundry to load
 * the compendium packs built from the markdown SRD and show what is in them.
 * Item and actor types are declared in system.json; there are no data models
 * yet, so each document's `system` data is exactly what the importer wrote.
 */
import { Modern20ItemSheet } from "./item-sheet.mjs";
import { Modern20ActorSheet } from "./actor-sheet.mjs";

export const SYSTEM_ID = "modern20";

Hooks.once("init", () => {
  const { DocumentSheetConfig } = foundry.applications.apps;
  DocumentSheetConfig.registerSheet(foundry.documents.Item, SYSTEM_ID, Modern20ItemSheet, {
    makeDefault: true,
    label: "MODERN20.SheetLabel.Item",
  });
  DocumentSheetConfig.registerSheet(foundry.documents.Actor, SYSTEM_ID, Modern20ActorSheet, {
    makeDefault: true,
    label: "MODERN20.SheetLabel.Actor",
  });
  console.log(`${SYSTEM_ID} | Initialized`);
});
