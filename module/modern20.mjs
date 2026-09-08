import { MODERN20 } from "./config.mjs";

import { Modern20Hero } from "./data/actor-hero.mjs";
import { Modern20Ordinary } from "./data/actor-ordinary.mjs";
import { Modern20Creature } from "./data/actor-creature.mjs";
import { Modern20Vehicle } from "./data/actor-vehicle.mjs";
import {
  Modern20Class, Modern20Occupation, Modern20Talent, Modern20Feat,
  Modern20Weapon, Modern20Armor, Modern20Gear, Modern20VehicleMod,
  Modern20Spell, Modern20PsiPower
} from "./data/items.mjs";

import { Modern20Actor } from "./documents/actor.mjs";
import { Modern20Item } from "./documents/item.mjs";
import { Modern20HeroSheet } from "./sheets/actor-sheet.mjs";
import { Modern20ItemSheet } from "./sheets/item-sheet.mjs";
import { rollWealthCheck, lossFormulaForGap } from "./dice/wealth.mjs";

const SYSTEM_ID = "modern20";

Hooks.once("init", () => {
  console.log(`${SYSTEM_ID} | Initializing the Modern20 game system`);

  CONFIG.MODERN20 = MODERN20;

  CONFIG.Actor.documentClass = Modern20Actor;
  CONFIG.Item.documentClass = Modern20Item;

  CONFIG.Actor.dataModels = {
    hero: Modern20Hero,
    ordinary: Modern20Ordinary,
    creature: Modern20Creature,
    vehicle: Modern20Vehicle
  };

  CONFIG.Item.dataModels = {
    class: Modern20Class,
    occupation: Modern20Occupation,
    talent: Modern20Talent,
    feat: Modern20Feat,
    weapon: Modern20Weapon,
    armor: Modern20Armor,
    gear: Modern20Gear,
    vehicleMod: Modern20VehicleMod,
    spell: Modern20Spell,
    psiPower: Modern20PsiPower
  };

  // Initiative is a straight Dexterity-based check in d20 Modern.
  CONFIG.Combat.initiative = { formula: "1d20 + @attributes.initiative.value", decimals: 0 };

  registerSheets();
  registerHandlebarsHelpers();

  // Exposed so macros and companion modules can reach the system without
  // reaching into module internals.
  game.modern20 = {
    Modern20Actor,
    Modern20Item,
    rollWealthCheck,
    lossFormulaForGap,
    config: MODERN20
  };
});

Hooks.once("ready", () => {
  console.log(`${SYSTEM_ID} | Ready`);
});

function registerSheets() {
  const { DocumentSheetConfig } = foundry.applications.apps;
  const { Actor: ActorDoc, Item: ItemDoc } = foundry.documents;

  DocumentSheetConfig.unregisterSheet(ActorDoc, "core", foundry.applications.sheets.ActorSheetV2);
  DocumentSheetConfig.registerSheet(ActorDoc, SYSTEM_ID, Modern20HeroSheet, {
    types: ["hero", "ordinary", "creature"],
    makeDefault: true,
    label: "MODERN20.SheetLabel.Hero"
  });

  DocumentSheetConfig.unregisterSheet(ItemDoc, "core", foundry.applications.sheets.ItemSheetV2);
  DocumentSheetConfig.registerSheet(ItemDoc, SYSTEM_ID, Modern20ItemSheet, {
    makeDefault: true,
    label: "MODERN20.SheetLabel.Item"
  });
}

function registerHandlebarsHelpers() {
  // Modifiers read as "+3" / "-1" everywhere on the sheet.
  Handlebars.registerHelper("modern20Signed", (value) => {
    const n = Number(value) || 0;
    return n >= 0 ? `+${n}` : `${n}`;
  });

  Handlebars.registerHelper("modern20Concat", (...args) => args.slice(0, -1).join(""));
}
