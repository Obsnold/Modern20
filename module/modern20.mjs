/**
 * Modern20: a Foundry VTT system for the d20 Modern SRD.
 *
 * Compendium packs built from the markdown SRD, data models for every item and
 * actor type (module/data), characters whose numbers are worked out from what
 * they own (module/rules), and rolls (module/roll.mjs).
 */
import { Modern20ItemSheet } from "./item-sheet.mjs";
import { Modern20ActorSheet } from "./actor-sheet.mjs";
import { Modern20CharacterSheet } from "./character-sheet.mjs";
import { registerModels } from "./data/foundry.mjs";
import { Modern20Actor } from "./actor.mjs";
import { registerRollSettings, bindAttackButtons } from "./roll.mjs";
import { statusEffects } from "./rules/conditions.mjs";

export const SYSTEM_ID = "modern20";

Hooks.once("init", () => {
  registerModels();
  registerRollSettings();
  // The SRD's conditions replace Foundry's default status effects, keeping Foundry's Invisible, which hides
  // a token. Blinded is the status Foundry's vision treats as blind.
  const invisible = CONFIG.statusEffects.find((e) => e.id === "invisible");
  CONFIG.statusEffects = [...statusEffects(), ...(invisible ? [invisible] : [])];
  CONFIG.specialStatusEffects.BLIND = "blinded";
  // Hit points are the bar a token can show, for both kinds of actor (a character's maximum is worked out).
  CONFIG.Actor.trackableAttributes = { character: { bar: ["hp"], value: [] }, creature: { bar: ["hp"], value: [] } };
  CONFIG.Actor.documentClass = Modern20Actor;
  // Initiative: 1d20 + Dex and feats for a character, the printed bonus for a creature. A tie goes to the
  // higher bonus: @initTie is the bonus / 100, shown in the tracker's two decimal places.
  CONFIG.Combat.initiative = { formula: "1d20 + @init + @initTie", decimals: 2 };
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
