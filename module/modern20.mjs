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
import { registerModels } from "./data/foundry.mjs";
import { Modern20Actor } from "./actor.mjs";
import { registerRollSettings, bindAttackButtons } from "./roll.mjs";
import { statusEffects } from "./rules/conditions.mjs";
import { registerLogSettings, registerLogHooks } from "./log.mjs";
import { registerDyingHooks } from "./damage.mjs";


Hooks.once("init", () => {
  versionTemplates([Modern20ItemSheet, Modern20CreatureSheet, Modern20CharacterSheet]);
  registerModels();
  registerRollSettings();
  registerLogSettings();
  registerLogHooks();
  registerDyingHooks();
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
  console.log(`${SYSTEM_ID} | Initialized`);
});

// An attack's chat card: Damage, and on a threat Confirm critical and Critical damage.
Hooks.on("renderChatMessageHTML", (message, html) => bindAttackButtons(message, html));

/**
 * Put the system's version on the address of every template its sheets load
 * ("templates/character/main.hbs?v=0.4.1"). Foundry fetches templates as plain files, and a
 * browser can keep serving an old copy after an update; a new address each version means it
 * never does. The file server ignores the query, and templates are not named in system.json, so
 * nothing checks the address. Run at init, once the version is known.
 */
function versionTemplates(sheets) {
  const v = encodeURIComponent(game.system.version);
  for (const sheet of sheets) {
    for (const part of Object.values(sheet.PARTS ?? {})) {
      if (part.template?.startsWith(`systems/${SYSTEM_ID}/`) && !part.template.includes("?")) part.template = `${part.template}?v=${v}`;
    }
  }
}
