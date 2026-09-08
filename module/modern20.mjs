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
import {
  Modern20OrdinarySheet, Modern20CreatureSheet, Modern20VehicleSheet
} from "./sheets/npc-sheets.mjs";
import { Modern20ItemSheet } from "./sheets/item-sheet.mjs";
import { rollWealthCheck, lossFormulaForGap } from "./dice/wealth.mjs";
import { applyOccupation } from "./apps/occupation.mjs";

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

/**
 * A starting occupation offers a choice of class skills and sometimes a bonus
 * feat, and grants a one-time Wealth increase. Run when it is added, by
 * whoever owns the character, so it does not fire once per connected client.
 */
Hooks.on("createItem", async (item) => {
  if (item.type !== "occupation") return;
  const actor = item.parent;
  if (!actor) return;
  if (!actor.isOwner) return;
  // Only one client should run the prompts and the update.
  if (game.users.activeGM?.id !== game.user.id && !actor.testUserPermission(game.user, "OWNER")) return;

  await applyOccupation(actor, item);
});

Hooks.once("ready", () => {
  console.log(`${SYSTEM_ID} | Ready`);
});

function registerSheets() {
  const { DocumentSheetConfig } = foundry.applications.apps;
  const { Actor: ActorDoc, Item: ItemDoc } = foundry.documents;

  // One sheet per actor type: an ordinary has no action points, a creature has
  // neither Wealth nor action points, and a vehicle has no abilities at all.
  // Sharing the hero sheet rendered inputs bound to fields those schemas do
  // not define.
  const actorSheets = [
    [Modern20HeroSheet, ["hero"], "MODERN20.SheetLabel.Hero"],
    [Modern20OrdinarySheet, ["ordinary"], "MODERN20.SheetLabel.Ordinary"],
    [Modern20CreatureSheet, ["creature"], "MODERN20.SheetLabel.Creature"],
    [Modern20VehicleSheet, ["vehicle"], "MODERN20.SheetLabel.Vehicle"]
  ];

  for (const [sheet, types, label] of actorSheets) {
    DocumentSheetConfig.registerSheet(ActorDoc, SYSTEM_ID, sheet, {
      types, makeDefault: true, label
    });
  }

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

  // Core ships eq/lt/gt but nothing for array membership, which the
  // occupation sheet needs to tick the skills already chosen.
  Handlebars.registerHelper("includes", (list, value) =>
    Array.isArray(list) && list.includes(value));
}
