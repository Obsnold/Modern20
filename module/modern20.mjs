/**
 * Modern20: a Foundry VTT system for the d20 Modern SRD.
 *
 * Compendium packs built from the markdown SRD, data models for every item and
 * actor type (module/data), characters whose numbers are worked out from what
 * they own (module/rules), and rolls (module/roll.mjs).
 */
import { SYSTEM_ID } from "./config.mjs";
import { Modern20ItemSheet } from "./sheets/document-sheet.mjs";
import { Modern20CreatureSheet } from "./sheets/creature-sheet.mjs";
import { Modern20CharacterSheet } from "./sheets/character-sheet.mjs";
import { Modern20VehicleSheet } from "./sheets/vehicle-sheet.mjs";
import { registerModels } from "./data/foundry.mjs";
import { Modern20Actor } from "./actor.mjs";
import { Modern20ActiveEffect } from "./effect.mjs";
import { registerRollSettings, bindAttackButtons } from "./roll.mjs";
import { statusEffects } from "./rules/conditions.mjs";
import { registerLogSettings, registerLogHooks } from "./log.mjs";
import { registerDyingHooks, registerTurnHooks, registerHitPointConditionHooks } from "./damage.mjs";
import { registerSyncSettings, syncWorldItems } from "./sync.mjs";
import { registerHitPointHooks } from "./hitpoints.mjs";
import { registerFeatureHooks } from "./features.mjs";
import { registerPresenceHooks } from "./presence.mjs";
import { SYSTEM_TYPE } from "./rules/effects.mjs";


Hooks.once("init", () => {
  // The system's own change type (rules/effects.mjs): Foundry calls this in place of applying the change, and
  // it does nothing; the character's numbers apply it, formulas and all.
  CONFIG.ActiveEffect.changeTypes[SYSTEM_TYPE] = { label: "Modern20 (worked out by the system)", defaultPriority: 0, handler: () => {} };
  registerModels();
  registerRollSettings();
  registerLogSettings();
  registerSyncSettings();
  registerLogHooks();
  registerDyingHooks();
  registerTurnHooks();
  registerHitPointConditionHooks();
  registerHitPointHooks();
  registerFeatureHooks();
  registerPresenceHooks();
  // The SRD's conditions replace Foundry's default status effects, keeping Foundry's Invisible, which hides
  // a token. Blinded is the status Foundry's vision treats as blind.
  const invisible = CONFIG.statusEffects.find((e) => e.id === "invisible");
  CONFIG.statusEffects = [...statusEffects(), ...(invisible ? [invisible] : [])];
  CONFIG.specialStatusEffects.BLIND = "blinded";
  // Hit points are the bar a token can show, for both kinds of actor (a character's maximum is worked out).
  CONFIG.Actor.trackableAttributes = { character: { bar: ["hp"], value: [] }, creature: { bar: ["hp"], value: [] }, vehicle: { bar: ["hp"], value: [] } };
  CONFIG.Actor.documentClass = Modern20Actor;
  CONFIG.ActiveEffect.documentClass = Modern20ActiveEffect;
  // Initiative: 1d20 + Dex and feats for a character, the printed bonus for a creature. A tie goes to the
  // higher bonus: @initTie is the bonus / 100, shown in the tracker's two decimal places.
  CONFIG.Combat.initiative = { formula: "1d20 + @init + @initTie", decimals: 2 };
  const { DocumentSheetConfig } = foundry.applications.apps;
  DocumentSheetConfig.registerSheet(foundry.documents.Item, SYSTEM_ID, Modern20ItemSheet, {
    makeDefault: true,
    label: "MODERN20.SheetLabel.Item",
  });
  DocumentSheetConfig.registerSheet(foundry.documents.Actor, SYSTEM_ID, Modern20CreatureSheet, {
    types: ["creature"],
    makeDefault: true,
    label: "MODERN20.SheetLabel.Actor",
  });
  DocumentSheetConfig.registerSheet(foundry.documents.Actor, SYSTEM_ID, Modern20CharacterSheet, {
    types: ["character"],
    makeDefault: true,
    label: "MODERN20.SheetLabel.Character",
  });
  DocumentSheetConfig.registerSheet(foundry.documents.Actor, SYSTEM_ID, Modern20VehicleSheet, {
    types: ["vehicle"],
    makeDefault: true,
    label: "MODERN20.SheetLabel.Vehicle",
  });
  console.log(`${SYSTEM_ID} | Initialized`);
});

// An attack's chat card: Damage, and on a threat Confirm critical and Critical damage.
Hooks.on("renderChatMessageHTML", (message, html) => bindAttackButtons(message, html));

// The world's items refreshed from the compendiums after a system update (module/sync.mjs).
Hooks.once("ready", () => syncWorldItems());
