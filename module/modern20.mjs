/**
 * Modern20: a Foundry VTT system for the d20 Modern SRD.
 *
 * This is the first step of the rebuild: enough of a system for Foundry to load
 * the compendium packs built from the markdown SRD and show what is in them.
 * Item and actor types are declared in system.json, and each has a data model
 * (module/data) that Foundry validates its documents against.
 */
import { Modern20ItemSheet } from "./item-sheet.mjs";
import { Modern20ActorSheet } from "./actor-sheet.mjs";
import { Modern20CharacterSheet } from "./character-sheet.mjs";
import { registerModels } from "./data/foundry.mjs";
import { Modern20Actor } from "./actor.mjs";
import { registerRollSettings, bindAttackButtons } from "./roll.mjs";

export const SYSTEM_ID = "modern20";

Hooks.once("init", () => {
  registerModels();
  registerRollSettings();
  CONFIG.Actor.documentClass = Modern20Actor;
  // Initiative: 1d20 + Dex and feats for a character, the printed bonus for a creature; ties by the bonus.
  CONFIG.Combat.initiative = { formula: "1d20 + @init", decimals: 2 };
  const { DocumentSheetConfig } = foundry.applications.apps;
  DocumentSheetConfig.registerSheet(foundry.documents.Item, SYSTEM_ID, Modern20ItemSheet, {
    makeDefault: true,
    label: "MODERN20.SheetLabel.Item",
  });
  DocumentSheetConfig.registerSheet(foundry.documents.Actor, SYSTEM_ID, Modern20ActorSheet, {
    types: ["creature"],
    makeDefault: true,
    label: "MODERN20.SheetLabel.Actor",
  });
  DocumentSheetConfig.registerSheet(foundry.documents.Actor, SYSTEM_ID, Modern20CharacterSheet, {
    types: ["character"],
    makeDefault: true,
    label: "MODERN20.SheetLabel.Character",
  });
  console.log(`${SYSTEM_ID} | Initialized`);
});

// An attack's chat card: Damage, and on a threat Confirm critical and Critical damage.
Hooks.on("renderChatMessageHTML", (message, html) => bindAttackButtons(message, html));
